'use client';

import { useCallback, useRef } from 'react';
import type { FittingRoomQueueInput } from '@/hooks/fitting-room/useFittingRoomQueueCore';
import { waitForGalleryPromptIds } from '@/lib/best-of-n-vision-queue';
import {
  buildMarksRepairPrompt,
  checkableMarks,
  marksCheckNote,
  marksCheckVerdict,
  type MarksCheckIssue,
} from '@/lib/cast/marks-check';
import { checkStillMarks } from '@/lib/cast/marks-check-client';
import { resolveCastPlatePrepareModel, snapshotPlate } from '@/lib/cast/plate-prepare';
import { galleryEntryPrimaryViewUrl, recordGalleryPlayChecks } from '@/lib/gallery/comfyui-gallery';
import { loadComfyUiSettings } from '@/lib/comfyui/settings';
import { dayPartnerNoun } from '@/lib/day/partner';
import type { FittingCompareTryOn } from '@/lib/fitting/room';

/**
 * Outfit's marks check (as Day's): once a try-on's front is final, the vision model says what it
 * sees; when glasses are gone or a tattoo the outfit should show is missing (or spread), one short
 * Edit 2511 repair pass (two at most) replaces the card's picture — the outfit, its dressed-plate
 * key and its back view stay. Once per picture.
 */
export function useFittingMarksCheck(
  input: FittingRoomQueueInput,
  setCompareTryOns: (update: (current: FittingCompareTryOn[]) => FittingCompareTryOn[]) => void
) {
  const checkedRef = useRef(new Set<string>());

  return useCallback(
    (card: { promptId: string; imageUrl: string; outfit: string }) => {
      const marks = input.character?.marks;
      const expected = checkableMarks(marks, { outfit: card.outfit });
      if (!expected.length || checkedRef.current.has(card.imageUrl)) return;
      checkedRef.current.add(card.imageUrl);
      const man = dayPartnerNoun(input.character ?? {}) === 'man';
      void (async () => {
        try {
          const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
          const judge = async (url: string): Promise<MarksCheckIssue[] | null> => {
            const result = await checkStillMarks({ imageUrl: url, shared: input.shared, comfyUrl });
            return 'unavailable' in result
              ? null
              : marksCheckVerdict(result.reading, expected, marks).issues;
          };
          let issues = await judge(card.imageUrl);
          if (!issues || issues.length === 0) return;
          let currentUrl = card.imageUrl;
          let fixed: { url: string; promptId: string; entryId?: string } | null = null;
          for (let attempt = 1; attempt <= 2 && issues && issues.length; attempt += 1) {
            input.setSaveStatus(
              `Her marks: ${marksCheckNote(issues)} — repairing (pass ${attempt})…`
            );
            const before = await snapshotPlate(
              { imageUrl: currentUrl, filename: '' } as never,
              input.shared.model
            );
            const promptId = await input.actions.sendComfyUi(
              buildMarksRepairPrompt(issues, marks ?? [], man ? 'he' : 'she'),
              null,
              undefined,
              {
                inputImageFilename: before.filename,
                inputImageUrl: before.imageUrl,
                identityLock: false,
                queueModel: resolveCastPlatePrepareModel(input.shared.model),
                queueTool: 'fitting',
                turboEditStrength: 'balanced',
                preserveInputAspect: true,
                ...(before.size
                  ? { castPlateReference: true, figurePixelSize: { ...before.size } }
                  : {}),
                explicitNegative:
                  'different person, different face, changed pose, changed clothes, extra people, text, logo, blurry',
                queueHints: '',
                characterId: input.shared.activeCharacterId,
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
            checkedRef.current.add(url);
            const nextIssues = await judge(url);
            if (!nextIssues) break;
            if (nextIssues.length <= issues.length) {
              fixed = { url, promptId: id, entryId: done?.id };
              currentUrl = url;
            }
            issues = nextIssues;
          }
          if (!fixed) {
            recordGalleryPlayChecks(card.promptId, {
              marksMissing: issues?.length ? marksCheckNote(issues) : 'not as set',
            });
            input.setSaveStatus(
              `Her marks: ${issues?.length ? marksCheckNote(issues) : 'not as set'} — the repair didn't take; the try-on is unchanged.`
            );
            return;
          }
          const repaired = fixed;
          // The card keeps its outfit, dressed-plate key and back view; only the front changes.
          setCompareTryOns(current =>
            current.map(item =>
              item.promptId === card.promptId && item.imageUrl === card.imageUrl
                ? {
                    ...item,
                    imageUrl: repaired.url,
                    ...(repaired.entryId ? { galleryEntryId: repaired.entryId } : {}),
                  }
                : item
            )
          );
          input.setSaveStatus(
            issues?.length
              ? `Her marks repaired; still ${marksCheckNote(issues)}.`
              : 'Her marks repaired on the try-on.'
          );
        } catch (error) {
          console.warn('Outfit marks check skipped:', error);
        }
      })();
    },
    [input, setCompareTryOns]
  );
}
