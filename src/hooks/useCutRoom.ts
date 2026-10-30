'use client';

/**
 * Cut (/cut): the film's own step. The shots of this Day and of the current Story, read from
 * their saved state, in one shot list; Cut film assembles them the way Day and Story did on
 * their own pages — the pre-cut check, widened stills, narration, "Previously on", the title
 * card — and keeps the film on the Cast.
 */

import type { ShotSubtitleCue } from '@/lib/media/kind';
import { planReel, type ReelLength } from '@/lib/video/cut-reel';
import { requeueComfyJobFromEntry } from '@/lib/comfyui/requeue';
import { loadSettingsCache } from '@/lib/settings/cache';
import { startClipExtend, waitForClipExtend } from '@/lib/clip/extend';
import type { CutGeneratedStatus } from '@/lib/video/cut-generate';
import { sharedLlmRequestBody } from '@/lib/llm/request-options';
import { spokenLineHeat } from '@/lib/audio/spoken-line';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  DEFAULT_FILM_CUT_OPTIONS,
  type FilmCutOptionsValue,
} from '@/components/FilmCutOptionsControls';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { BROWSER_STORAGE_HEALTH_EVENT } from '@/lib/storage/browser-storage';
import { castVoiceOf } from '@/lib/cast/voice';
import { assembleAndStampFilm, downloadFilmBlob } from '@/lib/film/character-film-assemble-lazy';
import {
  applyCharacterRecord,
  getCharacter,
  looksOf,
  type CharacterRecord,
} from '@/lib/character/os';
import { crossShotFindings, type RuleShot } from '@/lib/film/continuity-rules';
import { lookPlateDrifted } from '@/lib/character/look-plate-guard';
import {
  slotShotState,
  storyShotState,
  type ShotState,
  type ShotStateResolve,
} from '@/lib/film/shot-state';
import { getCachedClothingLabel, humanizeClothingId } from '@/lib/wardrobe/clothing-catalog-client';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  filterComfyGalleryEntries,
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryThumbUrl,
  galleryEntryPrimaryViewUrl,
  getGalleryCache,
  initGalleryStore,
  loadComfyGallery,
  type ComfyGalleryEntry,
} from '@/lib/gallery/comfyui-gallery';
import { renderTextCard } from '@/lib/video/cut-text-card';
import {
  CUT_BRIDGE_FRAMES,
  CUT_BRIDGE_PROMPT,
  cutBridgeEngine,
  nextIncludedShot,
  cutBridgeJoinEdits,
  placeCutBridge,
  type CutBridgeStatus,
} from '@/lib/video/cut-bridge';
import { H3_REQUIRED_NODE } from '@/lib/engine/h3-renderer';
import {
  CUT_GENERATE_CLIP_FRAMES,
  CUT_GENERATE_NEGATIVE,
  cutGenerateCanvas,
  cutGenerateClipPrompt,
  cutGenerateStillPrompt,
} from '@/lib/video/cut-generate';
import { cutGenerateModel } from '@/lib/queue/tool-model';
import { waitForGalleryPromptIds } from '@/lib/best-of-n/vision-queue';
import { fetchComfyObjectInfoNodeTypesCached } from '@/lib/comfyui/object-info-cache';
import { loadComfyUiSettings } from '@/lib/comfyui/settings';
import { isGalleryClipEntry } from '@/lib/story/roleplay-film';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import {
  readStoredCutHistory,
  restoreCutHistory,
  serializeCutHistory,
  writeStoredCutHistory,
} from '@/lib/film/cut-history';
import {
  activeCutSources,
  toggledCutSources,
  ANIMATIC_SOURCE,
  cutCopyKey,
  cutExtraShots,
  cutEditStamp,
  CUT_VERSIONS_LIMIT,
  deleteCutVersionPatch,
  saveCutVersionsPatch,
  type CutExtra,
  type CutToolCache,
  CUT_SOURCES,
  cutRoomKey,
  cutRoomRecipeSource,
  cutRoomShots,
  cutRoomSourceShots,
  DEFAULT_CUT_TOOL_CACHE,
  splitCutRoomKey,
  cutShotCheckSubjects,
  type CutSource,
} from '@/lib/film/cut-room';
import { dayEpisodeSnapshot } from '@/lib/day/episode-snapshot';
import { applyDayNarration } from '@/lib/day/narration';
import { dayThemeOf } from '@/lib/day/themes';
import { dayMoodFlavor } from '@/lib/day/mood-flavor';
import { dayPartnerNoun } from '@/lib/day/partner';
import {
  dayStillShownImage,
  dayStillsCachePatch,
  normalizeDaySlots,
  normalizeDaySlotStills,
  upsertDaySlotStill,
  type DaySlotId,
  type DaySlotStill,
} from '@/lib/day/planner';
import { mergeDeliveryProblems } from '@/lib/film/delivery-check';
import { checkCutDelivery } from '@/lib/film/delivery-check-client';
import {
  applyCutShotEdits,
  withShotSubtitle,
  orderedCutShots,
  cutShotProblems,
  type CutShotProblem,
  type KeyedShot,
} from '@/lib/film/cut-plan';
import { renderNarrationLine } from '@/lib/film/narration-client';
import { widenStillForFilm } from '@/lib/film/widen-client';
import { isAssembledFilmEntry } from '@/lib/media/kind';
import { completePlayCampaign } from '@/lib/play/campaign';
import { markOnboardingFirstFilmCut, markOnboardingFirstPlayCampaign } from '@/lib/play/onboarding';
import {
  loadPlaySeriesStore,
  nextDayFilmTitleCard,
  previouslyOnShots,
  recordDayFilmEpisode,
} from '@/lib/play/series';
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_ROLEPLAY_TOOL_CACHE,
  DEFAULT_SCENE_TOOL_CACHE,
} from '@/lib/play/settings';
import { keptTakeOf, normalizeSavedScenes, sceneCutShots } from '@/lib/day/scenes';
import { loadSceneScriptStore } from '@/lib/day/scene-script-store-client';
import { SCENE_SCRIPTS_CHANGED_EVENT } from '@/lib/day/scene-script-store';
import type { SavedScript } from '@/lib/day/scene-scripts';
import { coverageSummary, sceneCoverage } from '@/lib/day/script-coverage';
import { storyboard } from '@/lib/day/storyboard';
import { parseScript } from '@/lib/script/parse';
import { animaticShots } from '@/lib/film/animatic';
import {
  findingsForGalleryEntry,
  isFindingDismissed,
  sourceGoneFinding,
  type ContinuityFinding,
} from '@/lib/checks/findings';
import {
  decideFinding,
  findingDecisionMap,
  loadFindingDecisions,
  subscribeFindingDecisions,
  undecideFinding,
  type FindingDecision,
  type FindingDecisionKind,
} from '@/lib/checks/finding-decisions';
import { probeMediaDurationSec } from '@/lib/film/cut-media';
import { packageAsVersion, packageVersions } from '@/lib/film/cut-package';
import {
  applyExportProfile,
  cutHasSound,
  verifyFilmOutput,
  type ExportProfileId,
} from '@/lib/film/export-profiles';
import type { FilmOutputProbe } from '@/lib/video/output-probe';
import {
  CUT_TRACK_LABELS,
  withCutEffect,
  withMutedTracksLeftOut,
  withTrackMuted,
  type CutEffect,
  type CutTrack,
} from '@/lib/video/cut-sound';
import { checkMediaUrls } from '@/lib/film/cut-media-check';
import {
  missingCutMedia,
  relinkCutShot,
  type MediaUrlStatus,
  type RelinkMedia,
} from '@/lib/film/cut-missing';
import { awaitFullGalleryHydration } from '@/lib/gallery/db-store';
import {
  backToEarlierCutTake,
  cutSourceKeyOf,
  declineOfferedCutMedia,
  pinAllCutShots,
  pinEditedCutShots,
  pinnedCutShots,
  takeOfferedCutMedia,
  toggleCutShotPin,
} from '@/lib/film/cut-pins';
import { resolveFilmFailurePlaybook } from '@/lib/queue/failure-playbook';
import type { RoleplayStoryBeat } from '@/lib/story/roleplay';
import { loadRoleplayLibrary } from '@/lib/story/roleplay-library';
import {
  STORY_CHECK_THRESHOLDS,
  storyFaceMatchLabel,
  storyPoseMatchLabel,
  storyRealismLabel,
} from '@/lib/story/roleplay-pose-check';
import { REALISM_MISS_REASON } from '@/lib/still/realism';
import { holdForNarration, storyNarrationLine, storyPreviouslyOnShots } from '@/lib/story/film';
import { resolveStoryFilmCast, storyFilmName } from '@/lib/story/film-cast';
import { filmResolutionForCutOptions, filmShapeOf } from '@/lib/video/resolution';
import { confirmAction } from '@/components/ui/ConfirmDialog';

const EMPTY_GALLERY: ComfyGalleryEntry[] = [];

function subscribeGallery(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onStoreChange);
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onStoreChange);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, onStoreChange);
  };
}

/** Shots of one source with the source's own keys (the Day / Story helpers key by those). */
function unprefixed(shots: KeyedShot[]): KeyedShot[] {
  return shots.map(shot => ({ ...shot, key: splitCutRoomKey(shot.key).key }));
}

export function useCutRoom() {
  const cut = useCachedSettings('cut', DEFAULT_CUT_TOOL_CACHE);
  const day = useCachedSettings('day', DEFAULT_DAY_TOOL_CACHE);
  const story = useCachedSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);
  // Scenes (day/scenes.ts): the active Cast's kept takes are Cut's third source.
  const sceneTool = useCachedSettings('scene', DEFAULT_SCENE_TOOL_CACHE);
  const { shared } = cut;
  const mounted = cut.mounted && day.mounted && story.mounted && sceneTool.mounted;

  const actions = usePromptResultActions({
    tool: 'day',
    model: shared.model,
    detail: shared.detail,
    hints: '',
    autoFixRules: shared.autoFixRules !== false,
  });

  const slots = useMemo(() => normalizeDaySlots(day.toolSettings.slots), [day.toolSettings.slots]);
  const dayStills = useMemo(
    () => normalizeDaySlotStills(day.toolSettings.stills),
    [day.toolSettings.stills]
  );
  const beats: RoleplayStoryBeat[] = useMemo(
    () => story.toolSettings.story ?? [],
    [story.toolSettings.story]
  );
  // Day's stills change while the cut records narration / widens: the latest list, not a render's.
  const dayStillsRef = useRef<DaySlotStill[]>(dayStills);
  useEffect(() => {
    dayStillsRef.current = dayStills;
  }, [dayStills]);

  // A link for a Cast (Play's step chip: /cut?character=…) opens that Cast's film, as Day and
  // Scene do: it becomes the active Cast. Cut read only the active one, so the link showed
  // whichever Cast was active.
  const linkedCast = useRef(false);
  const { updateShared } = cut;
  useEffect(() => {
    if (!mounted || linkedCast.current) return;
    linkedCast.current = true;
    const id = new URLSearchParams(window.location.search).get('character')?.trim();
    if (!id || id === shared.activeCharacterId?.trim()) return;
    const record = getCharacter(id);
    if (record) updateShared(applyCharacterRecord(record));
  }, [mounted, shared.activeCharacterId, updateShared]);

  const savedScenes = useMemo(
    () => normalizeSavedScenes(sceneTool.toolSettings.scenes),
    [sceneTool.toolSettings.scenes]
  );
  const sceneCastId = shared.activeCharacterId?.trim() || '';
  const sceneShots = useMemo(
    () => sceneCutShots(savedScenes, sceneCastId),
    [sceneCastId, savedScenes]
  );
  const options: FilmCutOptionsValue = useMemo(
    () => ({ ...DEFAULT_FILM_CUT_OPTIONS, ...cut.toolSettings.options }),
    [cut.toolSettings.options]
  );
  // Text cards (added ones, the animatic's) are drawn in the cut's size.
  const resolution = filmResolutionForCutOptions(options);
  // The animatic (M9 T4): the Cast's scripts with planned shots; the picked one, else the latest.
  const [storedScripts, setStoredScripts] = useState<SavedScript[]>([]);
  useEffect(() => {
    const read = () => setStoredScripts(loadSceneScriptStore().scripts);
    read();
    window.addEventListener(SCENE_SCRIPTS_CHANGED_EVENT, read);
    return () => window.removeEventListener(SCENE_SCRIPTS_CHANGED_EVENT, read);
  }, []);
  const animaticScripts = useMemo(
    () =>
      storedScripts
        .filter(script => script.castId === sceneCastId && script.shots?.length)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [sceneCastId, storedScripts]
  );
  const animaticScript =
    animaticScripts.find(script => script.id === cut.toolSettings.scriptId) ?? animaticScripts[0];
  // How far each script's planned shots have got, said in Cut too (S5 coverage, M3's "not done":
  // it was only in the Script section) — the latest three.
  const scriptCoverage = useMemo(
    () =>
      animaticScripts.slice(0, 3).flatMap(script => {
        const summary = coverageSummary(
          sceneCoverage(script.shots ?? [], savedScenes, cut.toolSettings)
        );
        return summary ? [{ id: script.id, name: script.name, summary }] : [];
      }),
    [animaticScripts, cut.toolSettings, savedScenes]
  );
  const animatic = useMemo(() => {
    if (!animaticScript) return [];
    return animaticShots({
      rows: storyboard({
        scenes: parseScript(animaticScript.source).scenes,
        shots: animaticScript.shots,
        made: savedScenes,
      }),
      keptBySceneId: new Map(sceneShots.map(shot => [shot.key, shot])),
      card: text => renderTextCard({ text: text.text, sub: text.sub, resolution }),
    });
  }, [animaticScript, resolution, savedScenes, sceneShots]);
  const bySource = useMemo(
    () =>
      cutRoomSourceShots({
        day: { slots, stills: dayStills },
        story: beats,
        scenes: sceneShots,
        script: animatic,
      }),
    [animatic, beats, dayStills, sceneShots, slots]
  );
  const sources = useMemo(
    () => activeCutSources(cut.toolSettings.sources, bySource),
    [bySource, cut.toolSettings.sources]
  );
  const extras = useMemo(() => cut.toolSettings.extras ?? [], [cut.toolSettings.extras]);
  const added = useMemo(
    () =>
      cutExtraShots(
        extras,
        [...bySource.day, ...bySource.story, ...bySource.scenes, ...bySource.script],
        extra => renderTextCard({ text: extra.text, sub: extra.sub, resolution })
      ),
    [bySource, extras, resolution]
  );
  // Pinned shots play the media they were cut with (cut-pins.ts); a pinned scene shot whose
  // scene is gone (deleted, or its kept take let go) plays on, marked.
  const pinned = useMemo(() => {
    const picked = cut.toolSettings.sources;
    return pinnedCutShots({
      shots: cutRoomShots(bySource, sources, added),
      edits: options.shotEdits,
      isSourceGone: sourceKey => {
        const { source, key } = splitCutRoomKey(sourceKey);
        if (source !== 'scenes' || (picked && !picked.includes('scenes'))) return false;
        const scene = savedScenes.find(entry => entry.id === key);
        return !scene || (scene.castId === sceneCastId && !keptTakeOf(scene));
      },
    });
  }, [
    added,
    bySource,
    cut.toolSettings.sources,
    options.shotEdits,
    savedScenes,
    sceneCastId,
    sources,
  ]);
  const shots = pinned.shots;
  const pinStates = pinned.states;
  const shotsRef = useRef(shots);
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  const { updateToolSettings: writeCutSettings } = cut;
  // Every write that changes the live edit is stamped with when, and on which edit (M4 F1): an
  // edit another device made meanwhile is then kept as a version instead of being lost.
  const editedAtRef = useRef(cut.toolSettings.editedAt);
  useEffect(() => {
    editedAtRef.current = cut.toolSettings.editedAt;
  }, [cut.toolSettings.editedAt]);
  const cutSettingsRef = useRef(cut.toolSettings);
  useEffect(() => {
    cutSettingsRef.current = cut.toolSettings;
  }, [cut.toolSettings]);
  const updateCut = useCallback(
    (patch: Partial<CutToolCache>) => {
      // Only a real change is an edit: arriving with ?from= rewrites the same sources, and a
      // visit must not look like the newest edit to another device's merge (H2).
      const current = cutSettingsRef.current;
      const changes = (['options', 'extras', 'sources'] as const).filter(
        key =>
          key in patch &&
          JSON.stringify(patch[key] ?? null) !== JSON.stringify(current[key] ?? null)
      );
      if (!changes.length) {
        const { options: _o, extras: _e, sources: _s, ...rest } = patch;
        if (Object.keys(rest).length) writeCutSettings(rest);
        return;
      }
      const stamp = cutEditStamp(editedAtRef.current);
      editedAtRef.current = stamp.editedAt;
      writeCutSettings({ ...patch, ...stamp });
    },
    [writeCutSettings]
  );
  // Undo / redo of the edit (options, shot list and added shots). Changes within a moment of each
  // other — typing a caption, a slider — are one step.
  type Snapshot = { options: FilmCutOptionsValue; extras: CutExtra[] };
  const stateRef = useRef<Snapshot>({ options, extras });
  useEffect(() => {
    stateRef.current = { options, extras };
  }, [extras, options]);
  const history = useRef<{ past: Snapshot[]; future: Snapshot[]; at: number }>({
    past: [],
    future: [],
    at: 0,
  });
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 });
  const noteHistory = () =>
    setHistorySize({ past: history.current.past.length, future: history.current.future.length });
  const commitEdit = useCallback(
    (next: Partial<Snapshot>, step = false, autoPin = true) => {
      // A shot an edit just shaped is pinned to the media it plays now (cut-pins.ts). Opening a
      // version is not an edit: its shots keep the pins (or none) they were saved with.
      if (autoPin && next.options) {
        const shotEdits = pinEditedCutShots(
          stateRef.current.options.shotEdits,
          next.options.shotEdits,
          shotsRef.current
        );
        if (shotEdits !== next.options.shotEdits)
          next = { ...next, options: { ...next.options, shotEdits } };
      }
      const h = history.current;
      const now = Date.now();
      // A discrete action (add, split, open a version…) is always its own step; quick changes
      // to the same controls (typing, a slider) merge.
      if (step || now - h.at > 700) {
        h.past.push(stateRef.current);
        if (h.past.length > 80) h.past.shift();
      }
      h.at = step ? 0 : now;
      h.future = [];
      noteHistory();
      stateRef.current = { ...stateRef.current, ...next };
      updateCut(next);
    },
    [updateCut]
  );
  const setOptions = useCallback(
    (next: FilmCutOptionsValue) => commitEdit({ options: next }),
    [commitEdit]
  );
  const undo = useCallback(() => {
    const h = history.current;
    const previous = h.past.pop();
    if (!previous) return;
    h.future.push(stateRef.current);
    h.at = 0;
    noteHistory();
    stateRef.current = previous;
    updateCut(previous);
  }, [updateCut]);
  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(stateRef.current);
    h.at = 0;
    noteHistory();
    stateRef.current = next;
    updateCut(next);
  }, [updateCut]);
  // Undo survives a reload (M4 F1, cut-history.ts): the steps come back when the edit is still
  // the one they lead to — checked as the stored edit loads, until this visit's first step.
  const historyRestoredRef = useRef(false);
  useEffect(() => {
    if (historyRestoredRef.current) return;
    const h = history.current;
    if (h.past.length || h.future.length) {
      historyRestoredRef.current = true;
      return;
    }
    const restored = restoreCutHistory<Snapshot>(readStoredCutHistory(), { options, extras });
    if (!restored) return;
    historyRestoredRef.current = true;
    h.past = restored.past;
    h.future = restored.future;
    h.at = 0;
    scheduleAfterCommit(() => setHistorySize({ past: h.past.length, future: h.future.length }));
  }, [extras, options]);
  // …and is kept for the tab as it changes.
  useEffect(() => {
    if (!historyRestoredRef.current && !historySize.past && !historySize.future) return;
    const timer = window.setTimeout(() => {
      const h = history.current;
      writeStoredCutHistory(
        h.past.length || h.future.length
          ? serializeCutHistory<Snapshot>({ options, extras }, h)
          : null
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [extras, historySize, options]);

  /** The shot list's order as shown (every shot, left-out ones too). */
  const orderNow = () =>
    orderedCutShots(shots, stateRef.current.options.shotEdits).map(shot => shot.key);
  /** Put a new shot right after `after` in the order. */
  const orderWith = (keys: string[], key: string, after: string | null) => {
    const rest = keys.filter(entry => entry !== key);
    const at = after ? rest.indexOf(after) + 1 : rest.length;
    return [...rest.slice(0, at), key, ...rest.slice(at)];
  };
  const newKey = () => `x:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  /** A still or clip from the Gallery, at the end of the film. */
  const addMedia = useCallback(
    (entry: ComfyGalleryEntry) => {
      const url = galleryEntryPrimaryViewUrl(entry);
      if (!url) return;
      const clip = isGalleryClipEntry({
        ...entry,
        mediaKind: galleryEntryPrimaryMediaKind(entry),
      });
      const label = (entry.userTags?.[0] || entry.tool || 'Gallery').toString();
      commitEdit(
        {
          extras: [
            ...stateRef.current.extras,
            {
              key: newKey(),
              kind: 'media',
              title: `${label} ${clip ? 'clip' : 'still'}`,
              url,
              shotKind: clip ? 'clip' : 'still',
              ...(galleryEntryPrimaryThumbUrl(entry)
                ? { thumbUrl: galleryEntryPrimaryThumbUrl(entry)! }
                : {}),
              entryId: entry.id,
            },
          ],
        },
        true
      );
    },
    [commitEdit]
  );
  /** A text card after `after` (else at the end). */
  const addText = useCallback(
    (after: string | null, text = 'Your words here') => {
      const key = newKey();
      commitEdit(
        {
          extras: [...stateRef.current.extras, { key, kind: 'text', text }],
          options: {
            ...stateRef.current.options,
            shotEdits: {
              ...stateRef.current.options.shotEdits,
              order: orderWith(orderNow(), key, after),
            },
          },
        },
        true
      );
      return key;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitEdit, shots]
  );
  const setText = useCallback(
    (key: string, text: string) =>
      commitEdit({
        extras: stateRef.current.extras.map(extra =>
          extra.key === key && extra.kind === 'text'
            ? { ...extra, text: text.slice(0, 160) }
            : extra
        ),
      }),
    [commitEdit]
  );
  /**
   * Freeze frame: the clip's frame at `atSec` (file seconds) as a still right after it, held
   * 2 s — the moment held before the film moves on.
   */
  const [freezeBusy, setFreezeBusy] = useState(false);
  const freezeFrame = useCallback(
    async (key: string, atSec: number) => {
      const shot = shots.find(entry => entry.key === key);
      if (!shot?.url || shot.kind !== 'clip') return;
      setFreezeBusy(true);
      setError(null);
      try {
        const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
        const response = await fetch('/api/cut/bridge-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: shot.url, atSec: Math.max(0, atSec), comfyUrl }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          filename?: string;
          error?: string;
        };
        if (!response.ok || !data.filename) {
          throw new Error(data.error || 'Could not read that clip for a freeze frame.');
        }
        const url = `/api/comfyui/view?${new URLSearchParams({
          filename: data.filename,
          subfolder: '',
          type: 'input',
        }).toString()}`;
        const freezeKey = newKey();
        const edits = stateRef.current.options.shotEdits;
        commitEdit(
          {
            extras: [
              ...stateRef.current.extras,
              {
                key: freezeKey,
                kind: 'media',
                title: `${shot.title} · freeze`,
                url,
                shotKind: 'still',
              },
            ],
            options: {
              ...stateRef.current.options,
              shotEdits: {
                ...edits,
                order: orderWith(orderNow(), freezeKey, key),
                shots: {
                  ...edits?.shots,
                  // A freeze holds, no slow zoom, and cuts in hard (a held moment, not a fade).
                  [freezeKey]: { holdSec: 2, motion: 'none', transition: 'cut' },
                },
              },
            },
          },
          true
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Freeze frame failed.');
      } finally {
        setFreezeBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitEdit, shots]
  );
  /** The same shot again, right after it (its own hold / trim / caption from here on). */
  const duplicate = useCallback(
    (key: string) => {
      const keys = orderNow();
      const copy = cutCopyKey(key, new Set(keys));
      const original = stateRef.current.extras.find(extra => extra.key === key);
      // A copy of a copy copies the original.
      const of = original?.kind === 'copy' ? original.of : key;
      const edits = stateRef.current.options.shotEdits;
      commitEdit(
        {
          extras: [...stateRef.current.extras, { key: copy, kind: 'copy', of }],
          options: {
            ...stateRef.current.options,
            shotEdits: {
              ...edits,
              order: orderWith(keys, copy, key),
              shots: { ...edits?.shots, [copy]: { ...edits?.shots?.[key] } },
            },
          },
        },
        true
      );
      return copy;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitEdit, shots]
  );
  /** Split a clip at `atSec` (seconds into the file): it ends there, a copy plays from there. */
  const split = useCallback(
    (key: string, atSec: number) => {
      const keys = orderNow();
      const copy = cutCopyKey(key, new Set(keys));
      const original = stateRef.current.extras.find(extra => extra.key === key);
      const of = original?.kind === 'copy' ? original.of : key;
      const edits = stateRef.current.options.shotEdits;
      const own = edits?.shots?.[key] ?? {};
      const at = Math.round(atSec * 10) / 10;
      commitEdit(
        {
          extras: [...stateRef.current.extras, { key: copy, kind: 'copy', of }],
          options: {
            ...stateRef.current.options,
            shotEdits: {
              ...edits,
              order: orderWith(keys, copy, key),
              shots: {
                ...edits?.shots,
                [key]: { ...own, trimEndSec: at },
                [copy]: {
                  ...own,
                  trimStartSec: at,
                  // The second half comes straight in.
                  transition: 'cut',
                },
              },
            },
          },
        },
        true
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitEdit, shots]
  );
  /** Take an added shot (or copy) out of the film for good. */
  const removeAdded = useCallback(
    (key: string) => {
      const edits = stateRef.current.options.shotEdits;
      const { [key]: _gone, ...kept } = edits?.shots ?? {};
      void _gone;
      // A bridge out: the next shot comes in as it did before the bridge.
      const removed = stateRef.current.extras.find(extra => extra.key === key);
      const rest =
        removed?.kind === 'bridge' && removed.status === 'ready'
          ? cutBridgeJoinEdits(kept, removed.to, { ready: false, toWas: removed.toWas })
          : // A longer copy out: the original clip comes back in.
            removed?.kind === 'extended' && removed.status === 'ready'
            ? { ...kept, [removed.of]: { ...kept[removed.of], include: true } }
            : kept;
      commitEdit(
        {
          extras: stateRef.current.extras.filter(
            extra => extra.key !== key && !(extra.kind === 'copy' && extra.of === key)
          ),
          options: {
            ...stateRef.current.options,
            shotEdits: {
              ...edits,
              order: edits?.order?.filter(entry => entry !== key),
              shots: rest,
            },
          },
        },
        true
      );
    },
    [commitEdit]
  );

  // Bridges (cut-bridge.ts): a generated clip from one shot's last frame into the next shot's
  // first. It renders in the background (~2–3 min on H3); the film uses it once it is ready.
  const [bridgeBusy, setBridgeBusy] = useState<string | null>(null);
  const waitingBridges = useRef(new Set<string>());
  /** A bridge's result, written without an undo step (the render is not an edit). */
  const settleBridge = useCallback(
    (key: string, patch: { status: CutBridgeStatus; url?: string }) => {
      const bridgeExtra = stateRef.current.extras.find(
        extra => extra.key === key && extra.kind === 'bridge'
      );
      if (!bridgeExtra || bridgeExtra.kind !== 'bridge') return;
      const nextExtras = stateRef.current.extras.map(extra =>
        extra.key === key ? { ...bridgeExtra, ...patch } : extra
      );
      // Ready: a hard cut out of it into the next shot (its last frame is that shot's first).
      const options =
        patch.status === 'ready'
          ? {
              ...stateRef.current.options,
              shotEdits: {
                ...stateRef.current.options.shotEdits,
                shots: cutBridgeJoinEdits(
                  stateRef.current.options.shotEdits?.shots,
                  bridgeExtra.to,
                  { ready: true }
                ),
              },
            }
          : stateRef.current.options;
      stateRef.current = { ...stateRef.current, extras: nextExtras, options };
      updateCut({ extras: nextExtras, options });
    },
    [updateCut]
  );
  const awaitBridge = useCallback(
    async (key: string, promptId: string) => {
      if (waitingBridges.current.has(key)) return;
      waitingBridges.current.add(key);
      try {
        const [entry] = await waitForGalleryPromptIds([promptId], {
          timeoutMs: 15 * 60_000,
          pollMs: 4_000,
        });
        const url = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
        settleBridge(key, url ? { status: 'ready', url } : { status: 'failed' });
      } finally {
        waitingBridges.current.delete(key);
      }
    },
    [settleBridge]
  );
  // A bridge still rendering when the page was left: pick up its result.
  useEffect(() => {
    if (!cut.mounted) return;
    for (const extra of extras) {
      if (extra.kind === 'bridge' && extra.status === 'rendering' && extra.promptId) {
        void awaitBridge(extra.key, extra.promptId);
      }
    }
  }, [awaitBridge, cut.mounted, extras]);
  /** Bridge from `fromKey` into the next shot in the film: queue the clip, place it between. */
  const bridge = useCallback(
    async (fromKey: string) => {
      const edits = stateRef.current.options.shotEdits;
      const ordered = orderedCutShots(shots, edits).filter(
        shot =>
          !(
            shot.key.startsWith('x:') &&
            stateRef.current.extras.some(extra => extra.key === shot.key && extra.kind === 'bridge')
          )
      );
      const from = ordered.find(shot => shot.key === fromKey);
      const to = nextIncludedShot(
        ordered,
        fromKey,
        shot => edits?.shots?.[shot.key]?.include !== false
      );
      if (!from?.url || !to?.url) {
        setError('A bridge needs a shot after this one in the film.');
        return;
      }
      setError(null);
      setBridgeBusy(fromKey);
      setStatus(`Preparing a bridge from ${from.title} into ${to.title}…`);
      try {
        const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
        const frame = async (url: string, edge: 'first' | 'last') => {
          const response = await fetch('/api/cut/bridge-frame', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, edge, comfyUrl }),
          });
          const data = (await response.json().catch(() => ({}))) as {
            filename?: string;
            error?: string;
          };
          if (!response.ok || !data.filename) {
            throw new Error(data.error || 'Could not read that shot for the bridge.');
          }
          return data.filename;
        };
        const [start, end] = await Promise.all([frame(from.url, 'last'), frame(to.url, 'first')]);
        const nodeTypes = await fetchComfyObjectInfoNodeTypesCached().catch(() => null);
        const engine = cutBridgeEngine(nodeTypes, H3_REQUIRED_NODE);
        const promptId = await actions.sendComfyUi(CUT_BRIDGE_PROMPT, undefined, undefined, {
          queueTool: 'video',
          queueModel: engine,
          inputImageFilename: start,
          derivedKind: 'i2v',
          clipMode: 'i2v',
          qualityProfile: 'final',
          queueParamsBase: {
            videoFrames: CUT_BRIDGE_FRAMES,
            videoFps: 16,
            videoEndImageFilename: end,
          },
        });
        const id = typeof promptId === 'string' ? promptId.trim() : '';
        if (!id) throw new Error('ComfyUI did not take the bridge.');
        // One bridge per join: a new one replaces the old.
        const old = stateRef.current.extras.find(
          extra => extra.kind === 'bridge' && extra.from === from.key && extra.to === to.key
        );
        const key = newKey();
        const placed = placeCutBridge({
          order: orderNow().filter(entry => entry !== old?.key),
          shots: edits?.shots,
          fromKey: from.key,
          toKey: to.key,
          bridgeKey: key,
        });
        commitEdit(
          {
            extras: [
              ...stateRef.current.extras.filter(extra => extra.key !== old?.key),
              {
                key,
                kind: 'bridge',
                from: from.key,
                to: to.key,
                status: 'rendering',
                promptId: id,
                engine,
                ...(edits?.shots?.[to.key]?.transition
                  ? { toWas: edits.shots[to.key]!.transition }
                  : {}),
              },
            ],
            options: {
              ...stateRef.current.options,
              shotEdits: {
                ...edits,
                order: placed.order,
                // Its generated sound would talk over the film: muted (the volume control
                // brings it back).
                shots: { ...placed.shots, [key]: { ...placed.shots[key], volume: 0 } },
              },
            },
          },
          true
        );
        setStatus(
          `Rendering a bridge from ${from.title} into ${to.title} on ${
            engine === 'minimax-h3' ? 'MiniMax-H3' : 'LTX-2.5'
          } — it joins the film when it’s ready (a few minutes).`
        );
        void awaitBridge(key, id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not make the bridge.');
        setStatus(null);
      } finally {
        setBridgeBusy(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actions.sendComfyUi, awaitBridge, commitEdit, shots]
  );
  // Generated shots (cut-generate.ts): a missing shot or B-roll from words — a picture in the
  // cut's shape, animated when a clip was asked for. Renders in the background like a bridge.
  const [generateBusy, setGenerateBusy] = useState(false);
  const waitingGenerated = useRef(new Set<string>());
  /** A generated shot's progress, written without an undo step (the render is not an edit). */
  const patchGenerated = useCallback(
    (key: string, patch: Partial<Extract<CutExtra, { kind: 'generated' }>>) => {
      const nextExtras = stateRef.current.extras.map(extra =>
        extra.key === key && extra.kind === 'generated' ? { ...extra, ...patch } : extra
      );
      stateRef.current = { ...stateRef.current, extras: nextExtras };
      updateCut({ extras: nextExtras });
    },
    [updateCut]
  );
  /** Animate a generated picture (image to video on the bridge engine); the new prompt id. */
  const queueGeneratedClip = useCallback(
    async (prompt: string, stillUrl: string) => {
      const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
      const response = await fetch('/api/cut/bridge-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: stillUrl, edge: 'first', comfyUrl }),
      });
      const data = (await response.json().catch(() => ({}))) as { filename?: string };
      if (!response.ok || !data.filename) return null;
      const nodeTypes = await fetchComfyObjectInfoNodeTypesCached().catch(() => null);
      const engine = cutBridgeEngine(nodeTypes, H3_REQUIRED_NODE);
      const promptId = await actions.sendComfyUi(
        cutGenerateClipPrompt(prompt),
        undefined,
        undefined,
        {
          queueTool: 'video',
          queueModel: engine,
          inputImageFilename: data.filename,
          derivedKind: 'i2v',
          clipMode: 'i2v',
          qualityProfile: 'final',
          queueParamsBase: { videoFrames: CUT_GENERATE_CLIP_FRAMES, videoFps: 16 },
        }
      );
      const id = typeof promptId === 'string' ? promptId.trim() : '';
      return id ? { id, engine } : null;
    },
    [actions]
  );
  const awaitGenerated = useCallback(
    async (key: string, promptId: string) => {
      if (waitingGenerated.current.has(key)) return;
      waitingGenerated.current.add(key);
      try {
        const [entry] = await waitForGalleryPromptIds([promptId], {
          timeoutMs: 15 * 60_000,
          pollMs: 4_000,
        });
        const url = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
        const extra = stateRef.current.extras.find(item => item.key === key);
        if (!extra || extra.kind !== 'generated') return;
        if (!url) {
          patchGenerated(key, { status: 'failed' });
          return;
        }
        if (extra.shotKind === 'clip' && extra.stage !== 'clip') {
          // The picture is in: now its motion.
          const queued = await queueGeneratedClip(extra.prompt, url).catch(() => null);
          if (!queued) {
            patchGenerated(key, { status: 'failed', stillUrl: url });
            return;
          }
          patchGenerated(key, {
            stage: 'clip',
            stillUrl: url,
            promptId: queued.id,
            engine: queued.engine,
          });
          waitingGenerated.current.delete(key);
          void awaitGenerated(key, queued.id);
          return;
        }
        patchGenerated(key, { status: 'ready', url });
      } finally {
        waitingGenerated.current.delete(key);
      }
    },
    [patchGenerated, queueGeneratedClip]
  );
  // A generated shot still rendering when the page was left: pick up its result.
  useEffect(() => {
    if (!cut.mounted) return;
    for (const extra of extras) {
      if (extra.kind === 'generated' && extra.status === 'rendering' && extra.promptId) {
        void awaitGenerated(extra.key, extra.promptId);
      }
    }
  }, [awaitGenerated, cut.mounted, extras]);
  /** Generate a shot from words, placed after `afterKey` (the end of the film when null). */
  const generateShot = useCallback(
    async (input: { prompt: string; shotKind: 'still' | 'clip'; afterKey: string | null }) => {
      const words = input.prompt.trim();
      if (!words) return;
      setError(null);
      setGenerateBusy(true);
      try {
        const canvas = cutGenerateCanvas(filmShapeOf(stateRef.current.options));
        const promptId = await actions.sendComfyUi(cutGenerateStillPrompt(words), null, undefined, {
          queueTool: 'image',
          queueModel: cutGenerateModel(shared.model),
          // From words alone there is no picture to size the latent from: the film's frame.
          queueParamsBase: {
            width: String(canvas.width),
            height: String(canvas.height),
            lockLatentSize: 'true',
          },
          explicitNegative: CUT_GENERATE_NEGATIVE,
          identityLock: false,
          queueHints: '',
          qualityProfile: 'final',
        });
        const id = typeof promptId === 'string' ? promptId.trim() : '';
        if (!id) throw new Error('ComfyUI did not take the shot.');
        const key = newKey();
        const edits = stateRef.current.options.shotEdits;
        commitEdit(
          {
            extras: [
              ...stateRef.current.extras,
              {
                key,
                kind: 'generated',
                prompt: words,
                shotKind: input.shotKind,
                status: 'rendering',
                stage: 'still',
                promptId: id,
              },
            ],
            options: {
              ...stateRef.current.options,
              shotEdits: {
                ...edits,
                order: orderWith(orderNow(), key, input.afterKey),
                // A generated clip's own sound would be noise in the film: muted.
                ...(input.shotKind === 'clip'
                  ? { shots: { ...edits?.shots, [key]: { volume: 0 } } }
                  : {}),
              },
            },
          },
          true
        );
        setStatus(
          input.shotKind === 'clip'
            ? 'Rendering the shot, then its motion — it joins the film when it’s ready (a few minutes).'
            : 'Rendering the shot — it joins the film when it’s ready.'
        );
        void awaitGenerated(key, id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not generate the shot.');
      } finally {
        setGenerateBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actions.sendComfyUi, awaitGenerated, commitEdit, shared.model]
  );
  // Make longer (clip-extend-server.ts): the clip carried on by `bySec`, in the background. The
  // longer copy stands in for the original once it is ready (the original is left out then).
  const [extendBusy, setExtendBusy] = useState<string | null>(null);
  /** The last cut's subtitles (.srt), for a download beside the film. */
  const [lastSubtitles, setLastSubtitles] = useState<{ srt: string; filename: string } | null>(
    null
  );
  const waitingExtends = useRef(new Set<string>());
  const settleExtend = useCallback(
    (key: string, patch: { status: CutGeneratedStatus; url?: string }) => {
      const found = stateRef.current.extras.find(
        extra => extra.key === key && extra.kind === 'extended'
      );
      if (!found || found.kind !== 'extended') return;
      const nextExtras = stateRef.current.extras.map(extra =>
        extra.key === key ? { ...found, ...patch } : extra
      );
      const edits = stateRef.current.options.shotEdits;
      const options =
        patch.status === 'ready'
          ? {
              ...stateRef.current.options,
              shotEdits: {
                ...edits,
                shots: {
                  ...edits?.shots,
                  // The longer copy keeps the original's place and settings; the original sits out.
                  [key]: { ...edits?.shots?.[found.of], include: true, trimEndSec: undefined },
                  [found.of]: { ...edits?.shots?.[found.of], include: false },
                },
              },
            }
          : stateRef.current.options;
      stateRef.current = { ...stateRef.current, extras: nextExtras, options };
      updateCut({ extras: nextExtras, options });
    },
    [updateCut]
  );
  const awaitExtend = useCallback(
    async (key: string, jobId: string) => {
      if (waitingExtends.current.has(key)) return;
      waitingExtends.current.add(key);
      try {
        const job = await waitForClipExtend(jobId, { pollMs: 5_000 });
        settleExtend(key, job.url ? { status: 'ready', url: job.url } : { status: 'failed' });
      } catch {
        settleExtend(key, { status: 'failed' });
      } finally {
        waitingExtends.current.delete(key);
      }
    },
    [settleExtend]
  );
  const awaitTake = useCallback(
    async (key: string, promptId: string) => {
      if (waitingExtends.current.has(key)) return;
      waitingExtends.current.add(key);
      try {
        const [entry] = await waitForGalleryPromptIds([promptId], {
          timeoutMs: 15 * 60_000,
          pollMs: 4_000,
        });
        const url = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
        settleExtend(key, url ? { status: 'ready', url } : { status: 'failed' });
      } finally {
        waitingExtends.current.delete(key);
      }
    },
    [settleExtend]
  );
  // An extension or new take still running when the page was left: pick it up (an extension is
  // lost on a server restart).
  useEffect(() => {
    if (!cut.mounted) return;
    for (const extra of extras) {
      if (extra.kind !== 'extended' || extra.status !== 'rendering') continue;
      if (extra.take && extra.promptId) void awaitTake(extra.key, extra.promptId);
      else if (extra.jobId) void awaitExtend(extra.key, extra.jobId);
    }
  }, [awaitExtend, awaitTake, cut.mounted, extras]);
  /** A new take of a shot: its own render again with a new seed; stands in when ready. */
  const [takeBusy, setTakeBusy] = useState<string | null>(null);
  const newTake = useCallback(
    async (key: string) => {
      const shot = shots.find(entry => entry.key === key);
      // A take of a take re-renders the original's render.
      const promptId = shot?.entryId?.trim();
      if (!shot || !promptId) {
        setError('Only a shot rendered here (Day, Story or Generate) can take a new take.');
        return;
      }
      setError(null);
      setTakeBusy(key);
      try {
        const [entry] = await waitForGalleryPromptIds([promptId], {
          timeoutMs: 6_000,
          pollMs: 1_500,
        });
        if (!entry)
          throw new Error('Could not find how this shot was made (it is not in the Gallery).');
        const queued = await requeueComfyJobFromEntry(entry, { newSeed: true });
        if (!queued.ok || !queued.promptId) {
          throw new Error(
            ('error' in queued && queued.error) || 'ComfyUI did not take the new take.'
          );
        }
        const takeKey = newKey();
        const edits = stateRef.current.options.shotEdits;
        commitEdit(
          {
            extras: [
              ...stateRef.current.extras.filter(
                extra =>
                  !(extra.kind === 'extended' && extra.of === key && extra.status !== 'ready')
              ),
              {
                key: takeKey,
                kind: 'extended',
                of: key,
                bySec: 0,
                take: true,
                status: 'rendering',
                promptId: queued.promptId,
              },
            ],
            options: {
              ...stateRef.current.options,
              shotEdits: { ...edits, order: orderWith(orderNow(), takeKey, key) },
            },
          },
          true
        );
        setStatus(
          `Rendering a new take of ${shot.title} — it takes the shot’s place when it’s ready.`
        );
        void awaitTake(takeKey, queued.promptId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not start a new take.');
      } finally {
        setTakeBusy(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [awaitTake, commitEdit, shots]
  );
  /** Make a clip `bySec` seconds longer (it carries on in the same shot). */
  const extendClip = useCallback(
    async (key: string, bySec: number) => {
      const shot = shots.find(entry => entry.key === key);
      if (!shot?.url || shot.kind !== 'clip') return;
      // A longer copy of a longer copy extends the original's longer copy (its own url).
      setError(null);
      setExtendBusy(key);
      try {
        // A Day clip: its own scene and render (WAN clips replay their graph); others carry on
        // on LTX-2.5 from their last frames.
        const still = dayStillsRef.current.find(entry => entry.clipUrl?.trim() === shot.url);
        const slot = still ? slots.find(entry => entry.id === still.slotId) : undefined;
        const job = await startClipExtend(
          {
            clipUrl: shot.url,
            clipPromptId: still ? (still.clipRenderPromptId ?? still.clipPromptId) : undefined,
            scene: slot?.sceneHints?.trim() || still?.beatKey?.trim() || shot.caption || shot.title,
            setting: slot?.location,
            heat: still ? spokenLineHeat(dayMoodFlavor(day.toolSettings)) : 'clean',
            extendBySec: bySec,
            lead:
              getCharacter(
                day.toolSettings.stillsCharacterId?.trim() || shared.activeCharacterId?.trim() || ''
              )?.traits?.sex === 'man'
                ? 'man'
                : 'woman',
          },
          sharedLlmRequestBody(loadSettingsCache().shared)
        );
        const extKey = newKey();
        const edits = stateRef.current.options.shotEdits;
        commitEdit(
          {
            extras: [
              ...stateRef.current.extras.filter(
                extra =>
                  !(extra.kind === 'extended' && extra.of === key && extra.status !== 'ready')
              ),
              { key: extKey, kind: 'extended', of: key, bySec, status: 'rendering', jobId: job.id },
            ],
            options: {
              ...stateRef.current.options,
              shotEdits: { ...edits, order: orderWith(orderNow(), extKey, key) },
            },
          },
          true
        );
        setStatus(
          `Making ${shot.title} ${bySec} s longer — it takes the clip’s place when it’s ready (a few minutes).`
        );
        void awaitExtend(extKey, job.id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not make the clip longer.');
      } finally {
        setExtendBusy(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [awaitExtend, commitEdit, day.toolSettings, shared.activeCharacterId, shots, slots]
  );
  // Versions: the whole edit (sources, added shots, options) under a name.
  const versions = useMemo(() => cut.toolSettings.versions ?? [], [cut.toolSettings.versions]);
  /** Every shot of the edit pinned to what it plays now (a version saved, the film rendered). */
  const pinEveryShot = useCallback(() => {
    const before = stateRef.current.options;
    const shotEdits = pinAllCutShots(before.shotEdits, shotsRef.current);
    if (shotEdits === before.shotEdits) return before;
    const options = { ...before, shotEdits };
    commitEdit({ options }, true, false);
    return options;
  }, [commitEdit]);
  const saveVersion = useCallback(
    (name: string) => {
      const options = pinEveryShot();
      updateCut(
        saveCutVersionsPatch(cut.toolSettings, [
          {
            id: `v${Date.now().toString(36)}`,
            name: name || `Version ${(cut.toolSettings.versions?.length ?? 0) + 1}`,
            savedAt: Date.now(),
            sources: cut.toolSettings.sources,
            extras: stateRef.current.extras,
            options,
          },
        ])
      );
    },
    [cut.toolSettings, pinEveryShot, updateCut]
  );
  /**
   * Make a reel (cut-reel.ts): the full edit saved as "Full cut", then the edit turned into a
   * vertical 15 / 30 / 60 s reel (faces followed, hard cuts, subtitles, on the beat with music),
   * saved as "Reel · N s". `durations` are the clips' lengths, by key (from the monitor).
   */
  const makeReel = useCallback(
    (seconds: ReelLength, durations: ReadonlyMap<string, number>) => {
      // Both versions it saves keep the media they were made with.
      pinEveryShot();
      const before = stateRef.current;
      const edits = before.options.shotEdits;
      const ordered = orderedCutShots(shots, edits);
      const plan = planReel<NonNullable<NonNullable<typeof edits>['shots']>[string]>({
        targetSec: seconds,
        shots: ordered.map(shot => ({
          key: shot.key,
          kind: shot.kind === 'clip' ? 'clip' : 'still',
          durationSec: durations.get(shot.key) ?? null,
          edit: edits?.shots?.[shot.key],
        })),
      });
      if (plan.keys.length === 0) {
        setError('Every shot is left out — put some back in before making a reel.');
        return;
      }
      const picked = new Set(plan.keys);
      const options: FilmCutOptionsValue = {
        ...before.options,
        shape: 'vertical',
        vertical: true,
        followFaces: true,
        subtitles: true,
        titles: false,
        crossfadeSec: 0,
        length: 'shots',
        beatSnap: Boolean(before.options.audioBedUrl.trim()),
        shotEdits: {
          ...edits,
          order: [...plan.keys, ...ordered.map(shot => shot.key).filter(key => !picked.has(key))],
          shots: { ...edits?.shots, ...plan.edits },
        },
      };
      const stamp = Date.now();
      const full = {
        id: `v${stamp.toString(36)}f`,
        name: 'Full cut',
        savedAt: stamp,
        sources: cut.toolSettings.sources,
        extras: before.extras,
        options: before.options,
      };
      const reel = {
        id: `v${stamp.toString(36)}r`,
        name: `Reel · ${seconds} s`,
        savedAt: stamp + 1,
        sources: cut.toolSettings.sources,
        extras: before.extras,
        options,
      };
      commitEdit({ options }, true, false);
      updateCut(saveCutVersionsPatch(cut.toolSettings, [full, reel]));
      setStatus(
        `Made a ${seconds} s reel from ${plan.keys.length} shots — the full cut is saved as a version.`
      );
    },
    [commitEdit, cut.toolSettings, pinEveryShot, shots, updateCut]
  );
  /** Open a version: it becomes the edit (undo goes back to what was there). */
  const openVersion = useCallback(
    (id: string) => {
      const version = cut.toolSettings.versions?.find(entry => entry.id === id);
      if (!version) return;
      commitEdit(
        {
          options: { ...DEFAULT_FILM_CUT_OPTIONS, ...version.options },
          extras: version.extras ?? [],
        },
        true,
        false
      );
      updateCut({ sources: version.sources });
    },
    [commitEdit, cut.toolSettings.versions, updateCut]
  );
  const deleteVersion = useCallback(
    async (id: string) => {
      const name = cut.toolSettings.versions?.find(entry => entry.id === id)?.name?.trim();
      // A saved version is a whole cut (shots, order, extras) with no undo once it goes.
      if (
        !(await confirmAction({
          title: name ? `Delete the version “${name}”?` : 'Delete this version?',
          body: 'The cut you are editing stays as it is.',
          confirmLabel: 'Delete version',
          tone: 'danger',
        }))
      ) {
        return;
      }
      updateCut(deleteCutVersionPatch(cut.toolSettings, id));
    },
    [cut.toolSettings, updateCut]
  );
  /**
   * A pinned shot's source offers another take: use it here (`everywhere`: on this shot's copies
   * too), or keep the one it has. Saved versions keep theirs.
   */
  const takeOffered = useCallback(
    async (key: string, everywhere = false) => {
      const state = pinStates[key];
      if (state?.state !== 'new-take') return;
      const offered = state.offered;
      // A trim stays when it fits the new clip (M4 F2): its length is read first.
      const trimmed = Object.entries(stateRef.current.options.shotEdits?.shots ?? {}).some(
        ([entry, edit]) =>
          cutSourceKeyOf(entry) === cutSourceKeyOf(key) &&
          (edit?.trimStartSec !== undefined || edit?.trimEndSec !== undefined)
      );
      const offeredDurationSec =
        trimmed && offered.kind === 'clip'
          ? await probeMediaDurationSec(offered.url, 'video')
          : null;
      const now = stateRef.current.options;
      const result = takeOfferedCutMedia(now.shotEdits, key, offered, {
        everywhere,
        offeredDurationSec,
      });
      commitEdit({ options: { ...now, shotEdits: result.edits } }, true, false);
      const outcomes = Object.values(result.trims);
      const trimNote = outcomes.includes('reset')
        ? ' — its trim was reset (it was set for the old clip and doesn’t fit this one)'
        : outcomes.includes('clamped')
          ? ' — its trim was kept, its end moved to the new clip’s end'
          : outcomes.includes('kept')
            ? ' — its trim was kept (it fits the new clip)'
            : '';
      setStatus(
        `${offered.title || 'The shot'} uses the new take${
          result.keys.length > 1 ? ` (${result.keys.length} shots)` : ''
        }${trimNote}. Back to the earlier take puts it back.`
      );
    },
    [commitEdit, pinStates]
  );
  // Missing media (M4 F3): every shot's file checked (a byte each, cut-media-check.ts), and the
  // Gallery read once it has fully loaded, so nothing is called removed before it has.
  const [mediaCheck, setMediaCheck] = useState<{
    status: ReadonlyMap<string, MediaUrlStatus>;
    galleryIds: ReadonlySet<string> | null;
    checking: boolean;
  }>({ status: new Map(), galleryIds: null, checking: false });
  const readMediaCheck = useCallback(async (fresh: boolean) => {
    const urls = shotsRef.current.map(shot => shot.url).filter(Boolean);
    const [status] = await Promise.all([
      checkMediaUrls(urls, { fresh }),
      awaitFullGalleryHydration(),
    ]);
    const galleryIds = new Set(
      loadComfyGallery().flatMap(entry => [entry.id, entry.promptId].filter(Boolean) as string[])
    );
    return { status, galleryIds, checking: false };
  }, []);
  const mediaUrlsKey = useMemo(() => shots.map(shot => shot.url).join('\n'), [shots]);
  useEffect(() => {
    let cancelled = false;
    void readMediaCheck(false).then(next => {
      if (!cancelled) setMediaCheck(next);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaUrlsKey, readMediaCheck]);
  const recheckMedia = useCallback(async () => {
    setMediaCheck(previous => ({ ...previous, checking: true }));
    setMediaCheck(await readMediaCheck(true));
  }, [readMediaCheck]);
  const missingMedia = useMemo(
    () =>
      missingCutMedia({
        shots,
        states: pinStates,
        urlStatus: mediaCheck.status,
        ...(mediaCheck.galleryIds
          ? { galleryHas: (id: string) => mediaCheck.galleryIds!.has(id) }
          : {}),
      }),
    [mediaCheck, pinStates, shots]
  );
  /** Other takes of a shot's source to relink to (a Scene's takes), newest first. */
  const relinkTakesFor = useCallback(
    (key: string): RelinkMedia[] => {
      const { source, key: id } = splitCutRoomKey(cutSourceKeyOf(key));
      if (source !== 'scenes') return [];
      const scene = savedScenes.find(entry => entry.id === id);
      return (scene?.takes ?? [])
        .filter(take => take.imageUrl || take.clipUrl)
        .map(take => ({
          url: (take.clipUrl || take.imageUrl)!,
          kind: take.clipUrl ? ('clip' as const) : ('still' as const),
          entryId: take.promptId,
          thumbUrl: take.imageUrl,
          title: scene?.name,
        }))
        .reverse();
    },
    [savedScenes]
  );
  /** Point a shot at other media (a Gallery render, another take): undoable, and Back works. */
  const relink = useCallback(
    async (key: string, media: RelinkMedia) => {
      const durationSec =
        media.kind === 'clip' ? await probeMediaDurationSec(media.url, 'video') : null;
      const before = stateRef.current;
      const result = relinkCutShot(
        { edits: before.options.shotEdits, extras: before.extras },
        key,
        media,
        { durationSec, current: shotsRef.current.find(shot => shot.key === key) }
      );
      if (!result.changed) return;
      commitEdit(
        { options: { ...before.options, shotEdits: result.edits }, extras: result.extras },
        true,
        false
      );
      setStatus('Relinked — the shot plays the new media. Undo puts the old one back.');
    },
    [commitEdit]
  );
  const relinkFromGallery = useCallback(
    async (key: string, entry: ComfyGalleryEntry) => {
      const url = galleryEntryPrimaryViewUrl(entry);
      if (!url) return;
      const thumbUrl = galleryEntryPrimaryThumbUrl(entry);
      await relink(key, {
        url,
        kind: isGalleryClipEntry({ ...entry, mediaKind: galleryEntryPrimaryMediaKind(entry) })
          ? 'clip'
          : 'still',
        entryId: entry.id,
        ...(thumbUrl ? { thumbUrl } : {}),
      });
    },
    [relink]
  );
  /**
   * A shot's subtitle as set in Cut (M4 F5): text ('' = none) and where in the shot it shows;
   * an empty set goes back to the line or narration.
   */
  const setShotSubtitle = useCallback(
    (
      key: string,
      set: { text?: string; fromSec?: number; toSec?: number; cues?: ShotSubtitleCue[] }
    ) => {
      const now = stateRef.current.options;
      commitEdit({
        options: { ...now, shotEdits: withShotSubtitle(now.shotEdits, key, set) },
      });
    },
    [commitEdit]
  );
  /** An imported .srt's subtitles on their shots, as one step (undoable). */
  const applySrtSubtitles = useCallback(
    (
      matches: ReadonlyArray<{
        key: string;
        text: string;
        fromSec: number;
        toSec: number;
        cues?: ShotSubtitleCue[];
      }>
    ) => {
      const now = stateRef.current.options;
      const shotEdits = matches.reduce(
        (edits, match) =>
          withShotSubtitle(edits, match.key, {
            text: match.text,
            fromSec: match.fromSec,
            toSec: match.toSec,
            // Each of the file's cues kept at its time (M10 T3).
            ...(match.cues?.length ? { cues: match.cues } : {}),
          }),
        now.shotEdits
      );
      commitEdit({ options: { ...now, shotEdits } }, true);
      setStatus(
        `Subtitles from the file are on ${matches.length} shot${matches.length === 1 ? '' : 's'} — Undo takes them back.`
      );
    },
    [commitEdit]
  );
  // Export (M4 F6): the server's encoder and free space for the preflight, the profile, and the
  // finished file read back after each cut.
  const [encodeServer, setEncodeServer] = useState<{
    available: boolean;
    freeBytes: number | null;
  } | null>(null);
  const readEncodeServer = useCallback(async () => {
    try {
      const response = await fetch('/api/film/assemble', { credentials: 'same-origin' });
      if (!response.ok) return null;
      const body = (await response.json()) as { available?: boolean; freeBytes?: number | null };
      return {
        available: body.available === true,
        freeBytes: typeof body.freeBytes === 'number' ? body.freeBytes : null,
      };
    } catch {
      return null;
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    void readEncodeServer().then(info => {
      if (!cancelled) setEncodeServer(info);
    });
    return () => {
      cancelled = true;
    };
  }, [readEncodeServer]);
  const [lastOutput, setLastOutput] = useState<{
    probe?: FilmOutputProbe;
    options: FilmCutOptionsValue;
    wantsSound: boolean;
  } | null>(null);
  const outputChecks = useMemo(
    () =>
      lastOutput
        ? verifyFilmOutput({
            probe: lastOutput.probe,
            options: lastOutput.options,
            wantsSound: lastOutput.wantsSound,
          })
        : null,
    [lastOutput]
  );
  const applyProfile = useCallback(
    (id: ExportProfileId) => {
      commitEdit({ options: applyExportProfile(stateRef.current.options, id) }, true);
    },
    [commitEdit]
  );
  /** Mute a sound track (M4 F4): silent in the monitor, left out of the encode; undoable. */
  const setTrackMuted = useCallback(
    (track: CutTrack, muted: boolean) => {
      const now = stateRef.current.options;
      commitEdit(
        { options: { ...now, sound: withTrackMuted(now.sound, track, muted) } },
        true,
        false
      );
    },
    [commitEdit]
  );
  /**
   * The effects track (M10 T4): add a placed sound, change one (time, level, mute) or remove it
   * (patch null). Adding and removing are their own steps; a slider's changes merge.
   */
  const setEffect = useCallback(
    (id: string, patch: Partial<CutEffect> | null, step = false) => {
      const now = stateRef.current.options;
      commitEdit({ options: { ...now, sound: withCutEffect(now.sound, id, patch) } }, step, false);
    },
    [commitEdit]
  );
  /**
   * Package the cut (M4 F7): every shot pinned to what it plays first (as a version is), then
   * the cut, its versions and — full — its media, in one .zip to import elsewhere.
   */
  const [packaging, setPackaging] = useState(false);
  const packageCut = useCallback(
    async (full: boolean, name: string, castName?: string) => {
      setPackaging(true);
      setError(null);
      try {
        const options = pinEveryShot();
        const { buildCutPackage } = await import('@/lib/film/cut-package-client');
        const built = await buildCutPackage({
          cut: {
            ...(cut.toolSettings.sources ? { sources: cut.toolSettings.sources } : {}),
            extras: stateRef.current.extras,
            options,
            ...(cut.toolSettings.versions?.length ? { versions: cut.toolSettings.versions } : {}),
          },
          name,
          ...(castName ? { castName } : {}),
          full,
        });
        const safe = name.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'cut';
        downloadFilmBlob(built.blob, `${safe}.castcut.zip`);
        setStatus(
          full
            ? `Packaged the cut with ${built.packed} media file${built.packed === 1 ? '' : 's'}${
                built.unreadable.length
                  ? ` — ${built.unreadable.length} couldn’t be read and travel as addresses only`
                  : ''
              }.`
            : `Packaged the cut (light: ${built.media} media address${built.media === 1 ? '' : 'es'}, no files).`
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not package the cut.');
      } finally {
        setPackaging(false);
      }
    },
    [cut.toolSettings.sources, cut.toolSettings.versions, pinEveryShot]
  );
  /** Import a package as versions of this Cut — the live edit, and yours, are left alone. */
  const importPackage = useCallback(
    async (file: File) => {
      setPackaging(true);
      setError(null);
      try {
        const { importCutPackage } = await import('@/lib/film/cut-package-client');
        const imported = await importCutPackage(file);
        if (!imported.ok) {
          setError(imported.error);
          return;
        }
        const { manifest, cut: packaged, kept, reused, stored, inlined, missing } = imported.result;
        const now = Date.now();
        const main = packageAsVersion(manifest, packaged, now);
        // Saving keeps 12 versions: an import never pushes yours out.
        const yours = cut.toolSettings.versions?.length ?? 0;
        const theirs = packageVersions(manifest, packaged.versions, now);
        if (yours >= CUT_VERSIONS_LIMIT) {
          setError(
            `Versions are full (${CUT_VERSIONS_LIMIT}) — delete one to import “${manifest.name}”.`
          );
          return;
        }
        const added = theirs.slice(0, CUT_VERSIONS_LIMIT - yours - 1);
        updateCut(saveCutVersionsPatch(cut.toolSettings, [...added].reverse().concat(main)));
        setStatus(
          [
            `Imported “${manifest.name}” as a version${added.length ? ` (with ${added.length} of its own)` : ''} — open it under Versions.`,
            [
              stored ? `${stored} file${stored === 1 ? '' : 's'} stored here` : '',
              reused ? `${reused} already here` : '',
              inlined ? `${inlined} kept in the cut itself (no file storage on this server)` : '',
              kept ? `${kept} found at ${kept === 1 ? 'its' : 'their'} address` : '',
            ]
              .filter(Boolean)
              .join(', '),
            missing.length
              ? `${missing.length} not found — Missing media lists them when you open it`
              : '',
            theirs.length > added.length
              ? `${theirs.length - added.length} of its versions left out (${CUT_VERSIONS_LIMIT} at most)`
              : '',
          ]
            .filter(Boolean)
            .join(' · ')
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not import the package.');
      } finally {
        setPackaging(false);
      }
    },
    [cut.toolSettings, updateCut]
  );
  /** "Back to the earlier take": the take and trim the shot had before Use it here. */
  const backToEarlierTake = useCallback(
    (key: string) => {
      const now = stateRef.current.options;
      const shotEdits = backToEarlierCutTake(now.shotEdits, key);
      if (shotEdits === now.shotEdits) return;
      commitEdit({ options: { ...now, shotEdits } }, true, false);
      setStatus('Back to the earlier take, with the trim it had.');
    },
    [commitEdit]
  );
  const keepPinned = useCallback(
    (key: string) => {
      const state = pinStates[key];
      if (state?.state !== 'new-take') return;
      const now = stateRef.current.options;
      commitEdit(
        {
          options: {
            ...now,
            shotEdits: declineOfferedCutMedia(now.shotEdits, key, state.offered.url),
          },
        },
        true,
        false
      );
    },
    [commitEdit, pinStates]
  );
  /** Pin a shot to what it plays now, or let it follow its source again. */
  const togglePin = useCallback(
    (key: string) => {
      const shot = shotsRef.current.find(entry => entry.key === key);
      if (!shot) return;
      const now = stateRef.current.options;
      commitEdit(
        { options: { ...now, shotEdits: toggleCutShotPin(now.shotEdits, shot) } },
        true,
        false
      );
    },
    [commitEdit]
  );
  const isAdded = useCallback((key: string) => extras.some(extra => extra.key === key), [extras]);

  /** Arriving from Day / Story (`?from=`): that source alone, when it has shots. */
  const pickOnly = useCallback(
    (source: CutSource) => {
      if (bySource[source].length > 0) updateCut({ sources: [source] });
    },
    [bySource, updateCut]
  );
  // A script's animatic, picked from its storyboard (M9 T4): before its shots have loaded, too.
  const pickAnimatic = useCallback(
    (scriptId?: string) =>
      updateCut({ sources: [ANIMATIC_SOURCE], ...(scriptId ? { scriptId } : {}) }),
    [updateCut]
  );
  const toggleSource = useCallback(
    (source: CutSource) => {
      // At least one source; the animatic alone (cut-room.ts toggledCutSources).
      const next = toggledCutSources(sources, source);
      if (next !== sources) updateCut({ sources: next });
    },
    [sources, updateCut]
  );

  // Whose film: the Day's lead when the Day is in it, else the Story's Cast.
  const dayCast = getCharacter(
    day.toolSettings.stillsCharacterId?.trim() || shared.activeCharacterId?.trim() || ''
  );
  const storyName = storyFilmName(story.toolSettings);
  // Scenes are the active Cast's.
  const sceneCast = getCharacter(sceneCastId);

  /** Day narration recorded so far over the Day shots (the preview plays those). */
  const previewShots = useMemo(() => {
    const narrated = applyDayNarration(unprefixed(bySource.day), slots, dayStills).shots;
    const byKey = new Map(narrated.map(shot => [cutRoomKey('day', shot.key), shot]));
    return shots.map(shot => {
      const done = byKey.get(shot.key);
      if (!done) return shot;
      // The voice-over is the slot's; the media is the shot's own (a pinned shot plays its pin).
      const { thumbUrl: _thumb, entryId: _entry, ...narration } = done;
      return {
        ...narration,
        key: shot.key,
        url: shot.url,
        kind: shot.kind,
        ...(shot.thumbUrl ? { thumbUrl: shot.thumbUrl } : {}),
        ...(shot.entryId ? { entryId: shot.entryId } : {}),
      };
    });
  }, [bySource.day, dayStills, shots, slots]);
  const missingDayNarration = useMemo(
    () =>
      sources.includes('day')
        ? applyDayNarration(unprefixed(bySource.day), slots, dayStills).missing
        : [],
    [bySource.day, dayStills, slots, sources]
  );

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guideHref, setGuideHref] = useState<string | null>(null);
  const [assembling, setAssembling] = useState(false);
  const [checking, setChecking] = useState(false);
  const [problems, setProblems] = useState<CutShotProblem[] | null>(null);
  const [lastFilmEntryId, setLastFilmEntryId] = useState<string | undefined>(undefined);
  /** The last cut, for what comes next (watch it, tomorrow's Day, a Story). */
  const [cutDone, setCutDone] = useState<{
    castId?: string;
    withDay: boolean;
    withStory: boolean;
    persisted: boolean;
  } | null>(null);
  const storyNarrationCache = useRef(new Map<string, string>());
  const wideCache = useRef(new Map<string, string>());

  const { updateToolSettings: updateDay } = day;
  /** Record Day narration lines not yet rendered (kept on the Day's stills, as Day does). */
  const recordDayNarration = useCallback(async () => {
    const lines = applyDayNarration(unprefixed(bySource.day), slots, dayStillsRef.current).missing;
    for (const { slotId, label, line } of lines) {
      setStatus(`Recording the narration for ${label}…`);
      const url = await renderNarrationLine({
        line,
        speaker: dayPartnerNoun(dayCast ?? {}) === 'man' ? 'man' : 'woman',
        voiceSample: castVoiceOf(dayCast?.id)?.sample,
      }).catch(() => undefined);
      if (!url) continue;
      const next = upsertDaySlotStill(dayStillsRef.current, {
        slotId: slotId as DaySlotId,
        narrationUrl: url,
        narrationFor: line,
      });
      dayStillsRef.current = next;
      updateDay(dayStillsCachePatch(next, day.toolSettings.stillsCharacterId));
    }
    setStatus(null);
  }, [bySource.day, dayCast, day.toolSettings.stillsCharacterId, slots, updateDay]);

  const cutNow = useCallback(
    async (excludeKeys: string[] = []) => {
      // Muted tracks (M4 F4) are left out of the encode, and the status says so.
      const { options: cutOptions, left: mutedLeft } = withMutedTracksLeftOut(
        options,
        shots.filter(shot => shot.kind === 'clip').map(shot => shot.key)
      );
      const edits = cutOptions.shotEdits;
      const picked = applyCutShotEdits(
        shots,
        excludeKeys.length > 0
          ? {
              ...edits,
              shots: {
                ...edits?.shots,
                ...Object.fromEntries(
                  excludeKeys.map(key => [key, { ...edits?.shots?.[key], include: false }])
                ),
              },
            }
          : edits
      );
      if (picked.length === 0) {
        setError('Every shot is left out — put one back in the shot list.');
        return;
      }
      // The film keeps the media it is rendered with: a re-cut brings the same shots back.
      const inFilm = new Set(picked.map(shot => shot.key));
      const now = stateRef.current.options;
      const pinnedEdits = pinAllCutShots(
        now.shotEdits,
        shotsRef.current.filter(shot => inFilm.has(shot.key))
      );
      if (pinnedEdits !== now.shotEdits) {
        commitEdit({ options: { ...now, shotEdits: pinnedEdits } }, true, false);
      }
      const withDay = sources.includes('day');
      const withStory = sources.includes('story');
      const storyCast = withStory ? resolveStoryFilmCast(story.toolSettings, storyName) : undefined;
      // Whose film: the Day's lead, else the Story's Cast, else the Cast the scenes are of.
      const cast: CharacterRecord | undefined = withDay
        ? dayCast
        : withStory
          ? storyCast
          : sceneCast;
      const name = cast?.name?.trim() || (withDay ? 'day' : withStory ? storyName : 'scenes');
      setAssembling(true);
      setError(null);
      setGuideHref(null);
      try {
        // Widescreen stills: Day's "widescreen film" setting or the Widen option.
        const widen =
          filmShapeOf(cutOptions) === 'wide' &&
          ((withDay && day.toolSettings.widescreenFilm === true) || cutOptions.widen === true);
        if (widen) {
          for (const [index, shot] of picked.entries()) {
            if (shot.kind !== 'still') continue;
            const { source, key } = splitCutRoomKey(shot.key);
            const dayStill =
              source === 'day' && !key.includes('#')
                ? dayStillsRef.current.find(entry => entry.slotId === key)
                : undefined;
            let wide =
              dayStill?.wideUrl && dayStill.wideFor === shot.url
                ? dayStill.wideUrl
                : wideCache.current.get(shot.url);
            if (!wide) {
              setStatus(`Widening ${shot.title} to 16:9…`);
              wide =
                (await widenStillForFilm({
                  imageUrl: shot.url,
                  sendComfyUi: actions.sendComfyUi,
                  model: shared.model,
                  characterId: cast?.id,
                }).catch(() => null)) ?? undefined;
              if (wide) {
                wideCache.current.set(shot.url, wide);
                if (dayStill) {
                  const next = upsertDaySlotStill(dayStillsRef.current, {
                    slotId: dayStill.slotId,
                    wideUrl: wide,
                    wideFor: shot.url,
                  });
                  dayStillsRef.current = next;
                  updateDay(dayStillsCachePatch(next, day.toolSettings.stillsCharacterId));
                }
              }
            }
            if (wide) picked[index] = { ...shot, url: wide };
          }
        }
        // Narration: Day slots' voice-over (recorded once, kept on the still); Story scenes'
        // written narration, or every scene's first sentence with Narrate on.
        if (withDay) await recordDayNarration();
        const dayNarrated = new Map(
          applyDayNarration(
            unprefixed(picked.filter(shot => splitCutRoomKey(shot.key).source === 'day')),
            slots,
            dayStillsRef.current
          ).shots.map(shot => [cutRoomKey('day', shot.key), shot])
        );
        const beatByKey = new Map(beats.map(beat => [`${beat.id}@${beat.at}`, beat]));
        const narrateAll = cutOptions.narrate === true;
        const storyMan = getCharacter(storyCast?.id ?? '')?.traits?.sex === 'man';
        for (const [index, shot] of picked.entries()) {
          const { source, key } = splitCutRoomKey(shot.key);
          if (source === 'day') {
            const done = dayNarrated.get(shot.key);
            if (done) picked[index] = { ...done, key: shot.key };
            continue;
          }
          const beat = beatByKey.get(key);
          const line = !beat
            ? ''
            : narrateAll
              ? storyNarrationLine(beat)
              : beat.line?.trim()
                ? ''
                : (beat.narration?.trim() ?? '');
          if (!line) continue;
          let url = storyNarrationCache.current.get(line);
          if (!url) {
            setStatus(`Recording the narration for ${shot.title}…`);
            url = await renderNarrationLine({
              line,
              speaker: storyMan ? 'man' : 'woman',
            }).catch(() => undefined);
            if (url) storyNarrationCache.current.set(line, url);
          }
          if (url)
            picked[index] = {
              ...holdForNarration(shot, line),
              narrationUrl: url,
              narrationText: line,
            };
        }
        // "Previously on": the season's last Day episode, else the Cast's last Story.
        const recap =
          cast && cutOptions.previouslyOn !== false
            ? withDay
              ? previouslyOnShots(loadPlaySeriesStore(), cast.id, name)
              : storyPreviouslyOnShots(loadRoleplayLibrary(), {
                  castId: cast.id,
                  currentSessionId: story.toolSettings.activeSessionId,
                  name,
                })
            : [];
        setStatus('Checking shots…');
        const result = await assembleAndStampFilm({
          source: cutRoomRecipeSource(sources),
          shots: recap.length ? [...(recap as KeyedShot[]), ...picked] : picked,
          characterId: cast?.id ?? '',
          characterName: name,
          lookId: cast?.activeLookId ?? shared.activeLookId,
          crossfadeSec: cutOptions.crossfadeSec,
          resolution: filmResolutionForCutOptions(cutOptions),
          audioBedUrl: cutOptions.audioBedUrl.trim() || undefined,
          musicLevel: cutOptions.musicLevel,
          voiceLevel: cutOptions.voiceLevel,
          look: cutOptions.look,
          lookStrength: cutOptions.lookStrength,
          matchShots: cutOptions.matchShots !== false,
          followFaces: cutOptions.followFaces !== false,
          smoothMotion: cutOptions.smoothMotion === true,
          sharpen: cutOptions.sharpen === true,
          logo: cutOptions.logoUrl?.trim()
            ? { url: cutOptions.logoUrl.trim(), corner: cutOptions.logoCorner ?? 'br' }
            : undefined,
          sound: cutOptions.sound ?? undefined,
          stillMotion: cutOptions.stillMotion !== false,
          captions: cutOptions.titles === true,
          subtitles: cutOptions.subtitles !== false,
          titleCard: cutOptions.titles
            ? {
                ...(withDay && cast
                  ? nextDayFilmTitleCard(loadPlaySeriesStore(), cast.id, name)
                  : { title: name, subtitle: 'A Castcut story' }),
                ...(recap.length ? { afterShots: recap.length } : {}),
              }
            : null,
          length: cutOptions.length,
          beatSnap: cutOptions.beatSnap,
          onProgress: progress => setStatus(progress.label),
        });
        downloadFilmBlob(result.blob, result.filename);
        setLastFilmEntryId(result.entryId);
        setLastOutput({
          ...(result.outputProbe ? { probe: result.outputProbe } : {}),
          options: cutOptions,
          wantsSound: cutHasSound(cutOptions, picked),
        });
        void readEncodeServer().then(setEncodeServer);
        setLastSubtitles(
          result.subtitlesSrt
            ? {
                srt: result.subtitlesSrt,
                filename: result.filename.replace(/\.[a-z0-9]+$/i, '') + '.srt',
              }
            : null
        );
        // A Day in the film is an episode of the Cast's season (the Cast page and recaps).
        if (withDay && cast && result.persisted) {
          recordDayFilmEpisode({
            characterId: cast.id,
            characterName: cast.name,
            filename: result.filename,
            galleryEntryId: result.entryId,
            theme: dayThemeOf(dayMoodFlavor(day.toolSettings))?.label,
            posterUrl:
              slots
                .map(slot =>
                  dayStillShownImage(dayStillsRef.current.find(still => still.slotId === slot.id))
                )
                .find(url => url && !url.startsWith('data:')) || undefined,
            places: slots.map(slot => slot.location?.trim() ?? '').filter(Boolean),
            beats: slots.map(slot => slot.sceneHints?.trim() ?? '').filter(Boolean),
            day: dayEpisodeSnapshot({
              ...day.toolSettings,
              slots,
              stills: dayStillsRef.current,
            }),
          });
        }
        const notes = [
          ...result.cutNotes,
          ...(mutedLeft.length
            ? [
                `left out (muted): ${mutedLeft.map(track => CUT_TRACK_LABELS[track].toLowerCase()).join(', ')}`,
              ]
            : []),
        ]
          .map(note => ` · ${note}`)
          .join('');
        // Not kept with a Cast chosen says why, not "pick a Cast" (M6 D16).
        setStatus(
          cast && result.persisted
            ? `Saved ${result.filename} to ${cast.name} (${result.encodePath} encode${notes}) and started the download.`
            : !cast
              ? `Downloaded ${result.filename} (${result.encodePath} encode${notes}) — pick a Cast lead on Day or Story to keep films on the Cast.`
              : result.reason === 'too-large'
                ? `Downloaded ${result.filename} (${result.encodePath} encode${notes}) — too large to keep on ${cast.name}; keep the downloaded file.`
                : `Downloaded ${result.filename} (${result.encodePath} encode${notes}) — it couldn’t be kept on ${cast.name} (server storage); keep the downloaded file.`
        );
        markOnboardingFirstPlayCampaign();
        if (markOnboardingFirstFilmCut()) {
          void import('@/lib/app/system-tray-celebrate').then(({ celebrateSystemTray }) => {
            celebrateSystemTray('job');
          });
        }
        setCutDone({
          castId: cast?.id,
          withDay,
          withStory: sources.includes('story'),
          persisted: result.persisted,
        });
        void import('@/lib/server/local-observability').then(({ noteFilmCutSourceMetric }) => {
          for (const source of sources) {
            // Scenes are optional, outside the film's steps: not a Play source metric.
            if (source !== 'scenes') noteFilmCutSourceMetric(source === 'day' ? 'day' : 'roleplay');
          }
        });
        if (cast) {
          for (const source of sources) {
            if (source === 'scenes') continue;
            completePlayCampaign({
              characterId: cast.id,
              stepId: source === 'day' ? 'day' : 'roleplay',
            });
          }
        }
      } catch (err) {
        const playbook = resolveFilmFailurePlaybook(
          err instanceof Error ? err.message : 'Could not assemble the film.'
        );
        setError(playbook.message);
        setGuideHref(playbook.href ?? null);
        setStatus(null);
      } finally {
        setAssembling(false);
      }
    },
    [
      actions.sendComfyUi,
      beats,
      commitEdit,
      day.toolSettings,
      dayCast,
      options,
      readEncodeServer,
      recordDayNarration,
      sceneCast,
      shared.activeLookId,
      shared.model,
      shots,
      slots,
      sources,
      story.toolSettings,
      storyName,
      updateDay,
    ]
  );

  /** Cut film: the pre-cut check first (flagged / missed stills, then the files themselves). */
  const cutFilm = useCallback(async () => {
    const picked = applyCutShotEdits(shots, options.shotEdits);
    const gallery = loadComfyGallery();
    const beatByKey = new Map(beats.map(beat => [`${beat.id}@${beat.at}`, beat]));
    // Findings you dismissed (C2) don't stop the cut.
    const decided = findingDecisionMap(loadFindingDecisions());
    const checksOf = (promptId: string | undefined) => {
      const checks = promptId
        ? gallery.find(entry => entry.promptId === promptId)?.playChecks
        : undefined;
      return {
        flagged: [],
        ...checks,
        ...(isFindingDismissed(decided, promptId, 'pose-miss') ? { poseMiss: false } : {}),
        ...(isFindingDismissed(decided, promptId, 'face-miss') ? { faceMiss: false } : {}),
      };
    };
    const found = cutShotProblems(picked, shot => {
      const { source, key } = splitCutRoomKey(shot.key);
      // A pinned shot is checked as the take it plays, not its source's current one (R5).
      const pin = options.shotEdits?.shots?.[shot.key]?.pin;
      const pinnedEntry = pin?.entryId
        ? gallery.find(entry => entry.promptId === pin.entryId || entry.id === pin.entryId)
        : undefined;
      if (pinnedEntry && (source === 'day' || source === 'scenes')) {
        return checksOf(pinnedEntry.promptId);
      }
      if (source === 'day') {
        const still = dayStillsRef.current.find(entry => entry.slotId === key);
        return checksOf(still?.promptId);
      }
      if (source === 'scenes') {
        // The kept take's own checks (its gallery entry).
        const take = savedScenes.find(scene => scene.id === key);
        return checksOf(take?.takes.find(entry => entry.id === take.keptTakeId)?.promptId);
      }
      const beat = beatByKey.get(key);
      if (!beat) return null;
      const pose = storyPoseMatchLabel(beat, STORY_CHECK_THRESHOLDS.minPose);
      const face = storyFaceMatchLabel(beat, {
        miss: STORY_CHECK_THRESHOLDS.minFace,
        warn: STORY_CHECK_THRESHOLDS.warnFace,
      });
      return {
        flagged: [
          ...(beat.stillStatus === 'error' ? ['the still failed'] : []),
          ...(storyRealismLabel(beat) ? [REALISM_MISS_REASON] : []),
        ],
        ...(pose?.miss && !isFindingDismissed(decided, beat.promptId, 'pose-miss')
          ? { poseMiss: true, pose: beat.poseMatch?.score }
          : {}),
        ...(face?.miss && !isFindingDismissed(decided, beat.promptId, 'face-miss')
          ? { faceMiss: true, face: beat.faceMatch?.similarity }
          : {}),
      };
    });
    setChecking(true);
    const delivery = await checkCutDelivery(picked, shot => {
      const { source, key } = splitCutRoomKey(shot.key);
      if (source === 'scenes') {
        return Boolean(savedScenes.find(scene => scene.id === key)?.slot.line?.trim());
      }
      return source === 'day'
        ? Boolean(slots.find(slot => slot.id === key)?.line?.trim())
        : Boolean(beatByKey.get(key)?.line?.trim());
    }).finally(() => setChecking(false));
    const all = mergeDeliveryProblems(found, picked, delivery?.reasons);
    if (all.length > 0) {
      setProblems(all);
      return;
    }
    setProblems(null);
    await cutNow();
  }, [beats, cutNow, options.shotEdits, savedScenes, shots, slots]);

  /** The check's answer. Redo sends you to the shots' page (its Retry flagged redoes them). */
  const resolveProblems = useCallback(
    async (action: 'retry' | 'leave-out' | 'cut-anyway' | 'cancel'): Promise<string | null> => {
      const current = problems ?? [];
      setProblems(null);
      if (action === 'leave-out') await cutNow(current.map(problem => problem.key));
      else if (action === 'cut-anyway') await cutNow();
      else if (action === 'retry') {
        const first = current[0] ? splitCutRoomKey(current[0].key).source : sources[0];
        return CUT_SOURCES.find(entry => entry.id === first)?.href ?? '/day';
      }
      return null;
    },
    [cutNow, problems, sources]
  );

  // The Cast's films (newest first) — re-cut, export or share them here.
  const gallery = useSyncExternalStore(subscribeGallery, getGalleryCache, () => EMPTY_GALLERY);
  useEffect(() => {
    void initGalleryStore();
  }, []);

  // Who, look, clothing, place, time, things and line per shot (M2 C3), from each source.
  const shotStates = useMemo(() => {
    const resolve: ShotStateResolve = {
      castName: id => (id?.trim() ? getCharacter(id.trim())?.name : undefined),
      lookName: (id, lookId) => {
        const cast = id?.trim() ? getCharacter(id.trim()) : undefined;
        if (!cast) return undefined;
        const looks = looksOf(cast);
        return (looks.find(look => look.id === (lookId || cast.activeLookId)) ?? looks[0])?.name;
      },
      kitLabel: id => getCachedClothingLabel(id) ?? humanizeClothingId(id),
      activeLookId: id => {
        const cast = id?.trim() ? getCharacter(id.trim()) : undefined;
        return cast ? (cast.activeLookId ?? looksOf(cast)[0]?.id) : undefined;
      },
      props: id => (id?.trim() ? getCharacter(id.trim())?.props : undefined),
    };
    const dayCastId =
      day.toolSettings.stillsCharacterId?.trim() || shared.activeCharacterId?.trim() || undefined;
    const dayOutfit = {
      wardrobeId: shared.lockedWardrobeId,
      customGarmentImageUrl: day.toolSettings.customGarmentImageUrl,
      customGarmentDescription: day.toolSettings.customGarmentDescription,
      footwear: day.toolSettings.footwear,
    };
    const storyCastId = resolveStoryFilmCast(story.toolSettings, storyName, false)?.id;
    const beatByKey = new Map(beats.map(beat => [`${beat.id}@${beat.at}`, beat]));
    const out: Record<string, ShotState> = {};
    for (const shot of previewShots) {
      const { source, key } = splitCutRoomKey(shot.key.replace(/~\d+$/, ''));
      if (source === 'day') {
        const slot = slots.find(entry => entry.id === key);
        if (slot) {
          out[shot.key] = slotShotState(
            {
              slot,
              castId: dayCastId,
              partnerCharacterId: day.toolSettings.partnerCharacterId,
              outfit: dayOutfit,
            },
            resolve
          );
        }
      } else if (source === 'scenes') {
        const scene = savedScenes.find(entry => entry.id === key);
        if (scene) {
          out[shot.key] = slotShotState(
            {
              slot: scene.slot,
              castId: scene.castId,
              partnerCharacterId: scene.partnerCharacterId,
              outfit: { wardrobeId: shared.lockedWardrobeId, ...scene.outfit },
            },
            resolve
          );
        }
      } else if (source === 'story') {
        const beat = beatByKey.get(key);
        if (beat) {
          out[shot.key] = storyShotState(
            beat,
            {
              castId: storyCastId,
              outfit: {
                wardrobeId: story.toolSettings.wardrobeId,
                customGarmentImageUrl: story.toolSettings.customGarmentImageUrl,
                customGarmentDescription: story.toolSettings.customGarmentDescription,
                footwear: story.toolSettings.footwear,
              },
            },
            resolve
          );
        }
      }
    }
    return out;
  }, [
    beats,
    day.toolSettings,
    previewShots,
    savedScenes,
    shared.activeCharacterId,
    shared.lockedWardrobeId,
    slots,
    story.toolSettings,
    storyName,
  ]);

  // Continuity (M2 C2): what the checks found on the film's shots, and your decisions about it.
  const [decisions, setDecisions] = useState<FindingDecision[]>([]);
  useEffect(() => {
    setDecisions(loadFindingDecisions());
    return subscribeFindingDecisions(() => setDecisions(loadFindingDecisions()));
  }, []);
  const continuity = useMemo(() => {
    const decided = findingDecisionMap(decisions);
    const byPrompt = new Map(gallery.map(entry => [entry.promptId, entry]));
    const byId = new Map(gallery.map(entry => [entry.id, entry]));
    // Cross-shot rules (M2 C4), on the included shots in film order.
    const lookNameOf = (castId: string | undefined, lookId: string | undefined) => {
      const cast = castId ? getCharacter(castId) : undefined;
      return cast && lookId ? looksOf(cast).find(look => look.id === lookId)?.name : undefined;
    };
    const ruleShots: RuleShot[] = orderedCutShots(previewShots, options.shotEdits)
      .filter(shot => options.shotEdits?.shots?.[shot.key]?.include !== false)
      .flatMap(shot => {
        const state = shotStates[shot.key];
        if (!state) return [];
        const entryId = shot.entryId?.trim();
        const entry = entryId ? (byPrompt.get(entryId) ?? byId.get(entryId)) : undefined;
        const renderedLookId = entry?.lookId?.trim() || undefined;
        return [
          {
            key: shot.key,
            title: shot.title,
            state,
            ...(renderedLookId
              ? {
                  renderedLookId,
                  renderedLookName: lookNameOf(entry?.characterId ?? state.castId, renderedLookId),
                }
              : {}),
            ...(shot.thumbUrl || shot.kind === 'still'
              ? { pictureUrl: shot.thumbUrl || shot.url }
              : {}),
          },
        ];
      });
    const cross = new Map<string, ContinuityFinding[]>();
    for (const item of crossShotFindings(ruleShots, {
      lookDrifted: (castId, lookId) => {
        const cast = getCharacter(castId);
        const look = cast ? looksOf(cast).find(entry => entry.id === lookId) : undefined;
        return look ? lookPlateDrifted(look) : false;
      },
    })) {
      cross.set(item.shotKey, [...(cross.get(item.shotKey) ?? []), item.finding]);
    }
    const out: Array<{
      finding: ContinuityFinding;
      shotKey: string;
      shotTitle: string;
      decision?: FindingDecision;
    }> = [];
    for (const shot of previewShots) {
      if (options.shotEdits?.shots?.[shot.key]?.include === false) continue;
      const picture = shot.thumbUrl || (shot.kind === 'still' ? shot.url : undefined);
      // A clip's still (Day's slot, Story's beat) carries the face and pose checks.
      const subjects = cutShotCheckSubjects({
        key: shot.key,
        entryId: shot.entryId,
        pinned: Boolean(options.shotEdits?.shots?.[shot.key]?.pin),
        dayStills,
        beats,
      });
      const seen = new Set<string>();
      const findings: ContinuityFinding[] = [];
      for (const subject of subjects) {
        const entry = byPrompt.get(subject) ?? byId.get(subject);
        if (!entry) continue;
        for (const finding of findingsForGalleryEntry(entry, { imageUrl: picture })) {
          if (!seen.has(finding.id)) {
            seen.add(finding.id);
            findings.push(finding);
          }
        }
      }
      if (pinStates[shot.key]?.state === 'source-gone') {
        findings.push(sourceGoneFinding(shot.key, picture));
      }
      if (cross.has(shot.key)) findings.push(...cross.get(shot.key)!);
      for (const finding of findings) {
        out.push({
          finding,
          shotKey: shot.key,
          shotTitle: shot.title,
          ...(decided.get(finding.id) ? { decision: decided.get(finding.id) } : {}),
        });
      }
    }
    return out;
  }, [
    beats,
    dayStills,
    decisions,
    gallery,
    options.shotEdits,
    pinStates,
    previewShots,
    shotStates,
  ]);
  const decide = useCallback((id: string, kind: FindingDecisionKind | null, note?: string) => {
    if (kind) decideFinding(id, kind, note);
    else undecideFinding(id);
  }, []);
  const storyCastId = useMemo(
    () => resolveStoryFilmCast(story.toolSettings, storyName, false)?.id,
    [story.toolSettings, storyName]
  );
  const filmCastId = sources.includes('day')
    ? dayCast?.id
    : sources.includes('story')
      ? storyCastId
      : sceneCast?.id;
  const films = useMemo(
    () =>
      filmCastId
        ? filterComfyGalleryEntries(gallery, { characterId: filmCastId })
            .filter(entry => isAssembledFilmEntry(entry))
            .reverse()
        : [],
    [filmCastId, gallery]
  );
  /** The Cast's finished stills and clips (not films) — what Add from Gallery offers. */
  const castMedia = useMemo(
    () =>
      filmCastId
        ? filterComfyGalleryEntries(gallery, { characterId: filmCastId })
            .filter(
              entry =>
                entry.status === 'completed' &&
                !isAssembledFilmEntry(entry) &&
                Boolean(galleryEntryPrimaryViewUrl(entry))
            )
            .reverse()
            .slice(0, 160)
        : [],
    [filmCastId, gallery]
  );

  return {
    mounted,
    shared,
    sources,
    toggleSource,
    animaticScripts,
    animaticScriptId: animaticScript?.id,
    pickAnimatic,
    setAnimaticScript: (scriptId: string) => updateCut({ scriptId }),
    pickOnly,
    bySource,
    shots,
    previewShots,
    pinStates,
    shotStates,
    continuity,
    decide,
    takeOffered,
    backToEarlierTake,
    scriptCoverage,
    missingMedia,
    mediaChecking: mediaCheck.checking,
    recheckMedia,
    relinkTakesFor,
    relink,
    relinkFromGallery,
    setTrackMuted,
    setEffect,
    packaging,
    packageCut,
    importPackage,
    encodeServer,
    outputChecks,
    applyProfile,
    setShotSubtitle,
    applySrtSubtitles,
    keepPinned,
    togglePin,
    options,
    setOptions,
    extras,
    addMedia,
    addText,
    freezeFrame,
    freezeBusy,
    setText,
    duplicate,
    split,
    removeAdded,
    isAdded,
    bridge,
    bridgeBusy,
    generateShot,
    generateBusy,
    extendClip,
    extendBusy,
    lastSubtitles,
    newTake,
    takeBusy,
    versions,
    saveVersion,
    makeReel,
    openVersion,
    deleteVersion,
    undo,
    redo,
    canUndo: historySize.past > 0,
    canRedo: historySize.future > 0,
    missingDayNarration,
    recordDayNarration,
    dayCast,
    dayStills,
    storyName,
    sceneCast,
    dayMood: dayMoodFlavor(day.toolSettings),
    storyTone: story.toolSettings.tone,
    cutFilm,
    assembling,
    checking,
    problems,
    resolveProblems,
    status,
    error,
    guideHref,
    lastFilmEntryId,
    cutDone,
    films,
    castMedia,
  };
}
