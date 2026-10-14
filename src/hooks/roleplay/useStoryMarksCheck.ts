'use client';

import { useEffect, useRef, useState } from 'react';
import {
  leadIsMan,
  type UseRoleplayBeatQueueOptions,
} from '@/hooks/roleplay/useRoleplayBeatQueueCore';
import { waitForGalleryPromptIds } from '@/lib/best-of-n-vision-queue';
import {
  buildMarksRepairPrompt,
  checkableMarks,
  marksCheckNote,
  marksCheckVerdict,
  type MarksCheckIssue,
} from '@/lib/cast-marks-check';
import { checkStillMarks } from '@/lib/cast-marks-check-client';
import { resolveCastPlatePrepareModel, snapshotPlate } from '@/lib/cast-plate-prepare';
import { getCharacter } from '@/lib/character-os';
import { galleryEntryPrimaryViewUrl, loadComfyGallery } from '@/lib/comfyui-gallery';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import {
  isRoleplayAdultContent,
  patchRoleplayStoryBeat,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { comfyViewUrlForStill } from '@/lib/still-comfy-url';

/** The first solo scene whose shown still has had its pose check but not its marks check. */
export function nextStoryMarksCheck(
  story: RoleplayStoryBeat[],
  skip: ReadonlySet<string> = new Set()
): RoleplayStoryBeat | null {
  for (const beat of story) {
    const imageUrl = beat.imageUrl?.trim();
    if (
      beat.stillStatus === 'completed' &&
      imageUrl &&
      // After the pose check, which also says how many people are in it — one person only (a
      // partner's glasses or tattoo would be judged as hers).
      beat.poseMatch?.imageUrl === imageUrl &&
      beat.poseMatch.expectedPeople === 1 &&
      (beat.poseMatch.detectedPeople ?? 1) <= 1 &&
      beat.marksCheck?.imageUrl !== imageUrl &&
      !skip.has(imageUrl)
    ) {
      return beat;
    }
  }
  return null;
}

/**
 * Story's marks check (as Day's useDayStillAfterChecks): when the Cast has glasses or a tattoo
 * that should show in a scene, the vision model says what it sees; a miss gets one short Edit
 * 2511 repair pass (one more if the recheck still fails) that replaces the shown picture. One
 * scene at a time, after its pose check; the result is said on the scene card.
 */
export function useStoryMarksCheck(options: UseRoleplayBeatQueueOptions): {
  marksCheckStatus: string | null;
} {
  const { actions, content, shared, storyRef, toolSettings, updateToolSettings } = options;
  const runningRef = useRef(false);
  const skipRef = useRef(new Set<string>());
  const [status, setStatus] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (runningRef.current) return;
    const beat = nextStoryMarksCheck(toolSettings.story ?? [], skipRef.current);
    const shownUrl = beat?.imageUrl?.trim();
    if (!beat || !shownUrl) return;
    const character = getCharacter(shared.activeCharacterId?.trim() || '');
    const marks = character?.marks;
    const expected = checkableMarks(marks, {
      outfit: beat.prompt ?? beat.blurb,
      beat: beat.blurb,
      undressed: isRoleplayAdultContent(content),
    });
    const record = (patch: Partial<RoleplayStoryBeat>) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      updateToolSettings({ story: patchRoleplayStoryBeat(storyRef.current, latest, patch) });
    };
    if (!expected.length) {
      // Nothing that should show here: remember it as checked, say nothing.
      skipRef.current.add(shownUrl);
      return;
    }
    runningRef.current = true;
    void (async () => {
      const title = beat.title || 'this scene';
      try {
        const checkUrl = comfyViewUrlForStill(beat, loadComfyGallery()) ?? shownUrl;
        const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
        const judge = async (url: string): Promise<MarksCheckIssue[] | null> => {
          const result = await checkStillMarks({ imageUrl: url, shared, comfyUrl });
          if ('unavailable' in result) {
            setStatus(`Marks check skipped on ${title} — ${result.unavailable}`);
            return null;
          }
          return marksCheckVerdict(result.reading, expected, marks).issues;
        };
        setStatus(`Checking her marks on ${title}…`);
        let issues = await judge(checkUrl);
        if (!issues) {
          skipRef.current.add(shownUrl);
          return;
        }
        if (issues.length === 0) {
          record({ marksCheck: { imageUrl: shownUrl, note: '' } });
          setStatus(null);
          return;
        }
        let currentUrl = checkUrl;
        let fixed: string | null = null;
        for (let attempt = 1; attempt <= 2 && issues && issues.length; attempt += 1) {
          setStatus(`${title}: ${marksCheckNote(issues)} — repairing (pass ${attempt})…`);
          const before = await snapshotPlate(
            { imageUrl: currentUrl, filename: '' } as never,
            shared.model
          );
          const promptId = await actions.sendComfyUi(
            buildMarksRepairPrompt(issues, marks ?? [], leadIsMan() ? 'he' : 'she'),
            null,
            undefined,
            {
              inputImageFilename: before.filename,
              inputImageUrl: before.imageUrl,
              identityLock: false,
              queueModel: resolveCastPlatePrepareModel(shared.model),
              queueTool: 'fitting',
              turboEditStrength: 'balanced',
              preserveInputAspect: true,
              ...(before.size
                ? { castPlateReference: true, figurePixelSize: { ...before.size } }
                : {}),
              explicitNegative:
                'different person, different face, changed pose, changed clothes, extra people, text, logo, blurry',
              queueHints: '',
              characterId: character?.id,
              sourceImageUrl: before.imageUrl,
            }
          );
          const id = typeof promptId === 'string' ? promptId.trim() : '';
          if (!id) break;
          const [done] = await waitForGalleryPromptIds([id], {
            timeoutMs: 4 * 60_000,
            pollMs: 2_500,
          });
          const url = done ? galleryEntryPrimaryViewUrl(done)?.trim() : '';
          if (!url) break;
          const nextIssues = await judge(url);
          if (!nextIssues) break;
          // Keep the pass only when it is no worse than what it replaces.
          if (nextIssues.length <= issues.length) {
            fixed = url;
            currentUrl = url;
          }
          issues = nextIssues;
        }
        const left = issues?.length ? marksCheckNote(issues) : '';
        // Only swap if the scene still shows the picture we checked (not re-rolled meanwhile).
        const now = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
        if (!fixed || now?.imageUrl?.trim() !== shownUrl) {
          record({
            marksCheck: {
              imageUrl: shownUrl,
              note: `Her marks: ${left || 'not as set'} — the repair didn't take.`,
            },
          });
          setStatus(null);
          return;
        }
        record({
          imageUrl: fixed,
          marksCheck: {
            imageUrl: fixed,
            note: left ? `Her marks repaired; still ${left}.` : 'Her marks repaired.',
            repaired: true,
          },
        });
        setStatus(null);
      } catch (error) {
        skipRef.current.add(shownUrl);
        setStatus(
          `Marks check stopped on ${title}: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        runningRef.current = false;
        setTick(value => value + 1);
      }
    })();
  }, [actions, content, shared, storyRef, tick, toolSettings.story, updateToolSettings]);

  return { marksCheckStatus: status };
}
