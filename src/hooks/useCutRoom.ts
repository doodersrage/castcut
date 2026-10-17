'use client';

/**
 * Cut (/cut): the film's own step. The shots of this Day and of the current Story, read from
 * their saved state, in one shot list; Cut film assembles them the way Day and Story did on
 * their own pages — the pre-cut check, widened stills, narration, "Previously on", the title
 * card — and keeps the film on the Cast.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  DEFAULT_FILM_CUT_OPTIONS,
  type FilmCutOptionsValue,
} from '@/components/FilmCutOptionsControls';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { BROWSER_STORAGE_HEALTH_EVENT } from '@/lib/browser-storage';
import { castVoiceOf } from '@/lib/cast-voice';
import { assembleAndStampFilm, downloadFilmBlob } from '@/lib/character-film-assemble-lazy';
import { getCharacter, type CharacterRecord } from '@/lib/character-os';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  filterComfyGalleryEntries,
  getGalleryCache,
  initGalleryStore,
  loadComfyGallery,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import {
  activeCutSources,
  CUT_SOURCES,
  cutRoomKey,
  cutRoomRecipeSource,
  cutRoomShots,
  cutRoomSourceShots,
  DEFAULT_CUT_TOOL_CACHE,
  splitCutRoomKey,
  type CutSource,
} from '@/lib/cut-room';
import { dayEpisodeSnapshot } from '@/lib/day-episode-snapshot';
import { applyDayNarration } from '@/lib/day-narration';
import { dayThemeOf } from '@/lib/day-themes';
import { dayPartnerNoun } from '@/lib/day-partner';
import {
  dayStillShownImage,
  dayStillsCachePatch,
  normalizeDaySlots,
  normalizeDaySlotStills,
  upsertDaySlotStill,
  type DaySlotId,
  type DaySlotStill,
} from '@/lib/day-planner';
import { mergeDeliveryProblems } from '@/lib/film-delivery-check';
import { checkCutDelivery } from '@/lib/film-delivery-check-client';
import {
  applyCutShotEdits,
  cutShotProblems,
  type CutShotProblem,
  type KeyedShot,
} from '@/lib/film-cut-plan';
import { renderNarrationLine } from '@/lib/film-narration-client';
import { widenStillForFilm } from '@/lib/film-widen-client';
import { isAssembledFilmEntry } from '@/lib/media-kind';
import { completePlayCampaign } from '@/lib/play-campaign';
import { markOnboardingFirstFilmCut, markOnboardingFirstPlayCampaign } from '@/lib/play-onboarding';
import {
  loadPlaySeriesStore,
  nextDayFilmTitleCard,
  previouslyOnShots,
  recordDayFilmEpisode,
} from '@/lib/play-series';
import { DEFAULT_DAY_TOOL_CACHE, DEFAULT_ROLEPLAY_TOOL_CACHE } from '@/lib/play-settings';
import { resolveFilmFailurePlaybook } from '@/lib/queue-failure-playbook';
import type { RoleplayStoryBeat } from '@/lib/roleplay';
import { loadRoleplayLibrary } from '@/lib/roleplay-library';
import {
  STORY_CHECK_THRESHOLDS,
  storyFaceMatchLabel,
  storyPoseMatchLabel,
  storyRealismLabel,
} from '@/lib/roleplay-pose-check';
import { REALISM_MISS_REASON } from '@/lib/still-realism';
import { holdForNarration, storyNarrationLine, storyPreviouslyOnShots } from '@/lib/story-film';
import { resolveStoryFilmCast, storyFilmName } from '@/lib/story-film-cast';
import { filmResolutionForCutOptions, filmShapeOf } from '@/lib/video-resolution';

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
  const { shared } = cut;
  const mounted = cut.mounted && day.mounted && story.mounted;

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

  const bySource = useMemo(
    () => cutRoomSourceShots({ day: { slots, stills: dayStills }, story: beats }),
    [beats, dayStills, slots]
  );
  const sources = useMemo(
    () => activeCutSources(cut.toolSettings.sources, bySource),
    [bySource, cut.toolSettings.sources]
  );
  const shots = useMemo(() => cutRoomShots(bySource, sources), [bySource, sources]);

  const options: FilmCutOptionsValue = useMemo(
    () => ({ ...DEFAULT_FILM_CUT_OPTIONS, ...cut.toolSettings.options }),
    [cut.toolSettings.options]
  );
  const { updateToolSettings: updateCut } = cut;
  // Undo / redo of the edit (options + shot list). Changes within a moment of each other — typing
  // a caption, a slider — are one step.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  const history = useRef<{
    past: FilmCutOptionsValue[];
    future: FilmCutOptionsValue[];
    at: number;
  }>({ past: [], future: [], at: 0 });
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 });
  const noteHistory = () =>
    setHistorySize({ past: history.current.past.length, future: history.current.future.length });
  const setOptions = useCallback(
    (next: FilmCutOptionsValue) => {
      const h = history.current;
      const now = Date.now();
      if (now - h.at > 700) {
        h.past.push(optionsRef.current);
        if (h.past.length > 80) h.past.shift();
      }
      h.at = now;
      h.future = [];
      noteHistory();
      updateCut({ options: next });
    },
    [updateCut]
  );
  const undo = useCallback(() => {
    const h = history.current;
    const previous = h.past.pop();
    if (!previous) return;
    h.future.push(optionsRef.current);
    h.at = 0;
    noteHistory();
    updateCut({ options: previous });
  }, [updateCut]);
  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(optionsRef.current);
    h.at = 0;
    noteHistory();
    updateCut({ options: next });
  }, [updateCut]);
  /** Arriving from Day / Story (`?from=`): that source alone, when it has shots. */
  const pickOnly = useCallback(
    (source: CutSource) => {
      if (bySource[source].length > 0) updateCut({ sources: [source] });
    },
    [bySource, updateCut]
  );
  const toggleSource = useCallback(
    (source: CutSource) => {
      const next = sources.includes(source)
        ? sources.filter(entry => entry !== source)
        : [...sources, source];
      // At least one source: the last one can't be switched off.
      if (next.length > 0) updateCut({ sources: next });
    },
    [sources, updateCut]
  );

  // Whose film: the Day's lead when the Day is in it, else the Story's Cast.
  const dayCast = getCharacter(
    day.toolSettings.stillsCharacterId?.trim() || shared.activeCharacterId?.trim() || ''
  );
  const storyName = storyFilmName(story.toolSettings);

  /** Day narration recorded so far over the Day shots (the preview plays those). */
  const previewShots = useMemo(() => {
    const narrated = applyDayNarration(unprefixed(bySource.day), slots, dayStills).shots;
    const byKey = new Map(narrated.map(shot => [cutRoomKey('day', shot.key), shot]));
    return shots.map(shot => {
      const done = byKey.get(shot.key);
      return done ? { ...done, key: shot.key } : shot;
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
      const edits = options.shotEdits;
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
      const withDay = sources.includes('day');
      const storyCast = sources.includes('story')
        ? resolveStoryFilmCast(story.toolSettings, storyName)
        : undefined;
      const cast: CharacterRecord | undefined = withDay ? dayCast : storyCast;
      const name = cast?.name?.trim() || (withDay ? 'day' : storyName);
      setAssembling(true);
      setError(null);
      setGuideHref(null);
      try {
        // Widescreen stills: Day's "widescreen film" setting or the Widen option.
        const widen =
          filmShapeOf(options) === 'wide' &&
          ((withDay && day.toolSettings.widescreenFilm === true) || options.widen === true);
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
        const narrateAll = options.narrate === true;
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
          cast && options.previouslyOn !== false
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
          crossfadeSec: options.crossfadeSec,
          resolution: filmResolutionForCutOptions(options),
          audioBedUrl: options.audioBedUrl.trim() || undefined,
          musicLevel: options.musicLevel,
          voiceLevel: options.voiceLevel,
          stillMotion: options.stillMotion !== false,
          captions: options.titles === true,
          subtitles: options.subtitles !== false,
          titleCard: options.titles
            ? {
                ...(withDay && cast
                  ? nextDayFilmTitleCard(loadPlaySeriesStore(), cast.id, name)
                  : { title: name, subtitle: 'A Castcut story' }),
                ...(recap.length ? { afterShots: recap.length } : {}),
              }
            : null,
          length: options.length,
          beatSnap: options.beatSnap,
          onProgress: progress => setStatus(progress.label),
        });
        downloadFilmBlob(result.blob, result.filename);
        setLastFilmEntryId(result.entryId);
        // A Day in the film is an episode of the Cast's season (the Cast page and recaps).
        if (withDay && cast && result.persisted) {
          recordDayFilmEpisode({
            characterId: cast.id,
            characterName: cast.name,
            filename: result.filename,
            galleryEntryId: result.entryId,
            theme: dayThemeOf(day.toolSettings.dayMood)?.label,
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
        const notes = result.cutNotes.length ? ` · ${result.cutNotes.join(' · ')}` : '';
        setStatus(
          cast && result.persisted
            ? `Saved ${result.filename} to ${cast.name} (${result.encodePath} encode${notes}) and started the download.`
            : `Downloaded ${result.filename} (${result.encodePath} encode${notes}) — pick a Cast lead on Day or Story to keep films on the Cast.`
        );
        markOnboardingFirstPlayCampaign();
        if (markOnboardingFirstFilmCut()) {
          void import('@/lib/system-tray-celebrate').then(({ celebrateSystemTray }) => {
            celebrateSystemTray('job');
          });
        }
        setCutDone({
          castId: cast?.id,
          withDay,
          withStory: sources.includes('story'),
          persisted: result.persisted,
        });
        void import('@/lib/local-observability').then(({ noteFilmCutSourceMetric }) => {
          for (const source of sources)
            noteFilmCutSourceMetric(source === 'day' ? 'day' : 'roleplay');
        });
        if (cast) {
          for (const source of sources) {
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
      day.toolSettings,
      dayCast,
      options,
      recordDayNarration,
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
    const found = cutShotProblems(picked, shot => {
      const { source, key } = splitCutRoomKey(shot.key);
      if (source === 'day') {
        const still = dayStillsRef.current.find(entry => entry.slotId === key);
        const checks = still?.promptId
          ? gallery.find(entry => entry.promptId === still.promptId)?.playChecks
          : undefined;
        return { flagged: [], ...checks };
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
        ...(pose?.miss ? { poseMiss: true, pose: beat.poseMatch?.score } : {}),
        ...(face?.miss ? { faceMiss: true, face: beat.faceMatch?.similarity } : {}),
      };
    });
    setChecking(true);
    const delivery = await checkCutDelivery(picked, shot => {
      const { source, key } = splitCutRoomKey(shot.key);
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
  }, [beats, cutNow, options.shotEdits, shots, slots]);

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
  const storyCastId = useMemo(
    () => resolveStoryFilmCast(story.toolSettings, storyName, false)?.id,
    [story.toolSettings, storyName]
  );
  const filmCastId = sources.includes('day') ? dayCast?.id : storyCastId;
  const films = useMemo(
    () =>
      filmCastId
        ? filterComfyGalleryEntries(gallery, { characterId: filmCastId })
            .filter(entry => isAssembledFilmEntry(entry))
            .reverse()
        : [],
    [filmCastId, gallery]
  );

  return {
    mounted,
    shared,
    sources,
    toggleSource,
    pickOnly,
    bySource,
    shots,
    previewShots,
    options,
    setOptions,
    undo,
    redo,
    canUndo: historySize.past > 0,
    canRedo: historySize.future > 0,
    missingDayNarration,
    recordDayNarration,
    dayCast,
    dayStills,
    storyName,
    dayMood: day.toolSettings.dayMood,
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
  };
}
