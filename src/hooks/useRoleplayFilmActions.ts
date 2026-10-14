'use client';

import { mergeDeliveryProblems } from '@/lib/film-delivery-check';
import { checkCutDelivery } from '@/lib/film-delivery-check-client';
import {
  applyCutShotEdits,
  cutPosterPick,
  cutShotProblems,
  type CutShotProblem,
  type KeyedShot,
} from '@/lib/film-cut-plan';
import {
  STORY_CHECK_THRESHOLDS,
  storyFaceMatchLabel,
  storyPoseMatchLabel,
  storyRealismLabel,
} from '@/lib/roleplay-pose-check';
import { REALISM_MISS_REASON } from '@/lib/still-realism';
import {
  DEFAULT_FILM_CUT_OPTIONS,
  type FilmCutOptionsValue,
} from '@/components/FilmCutOptionsControls';
import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import {
  assembleAndStampFilm,
  downloadFilmBlob,
  shareFilmBlob,
  stampAssembledFilm,
} from '@/lib/character-film-assemble-lazy';
import { roleplayWatchPlaylist } from '@/lib/character-film';
import { applyCharacterRecord, getCharacter, loadCharacters } from '@/lib/character-os';
import { characterFromRoleplaySession, upsertCharacterFromRoleplaySession } from '@/lib/play-cast';
import { markOnboardingFirstFilmCut, markOnboardingFirstPlayCampaign } from '@/lib/play-onboarding';
import { completePlayCampaign } from '@/lib/play-campaign';
import {
  loadRoleplayLibrary,
  persistRoleplayLibraryFromCache,
  snapshotRoleplaySession,
  upsertRoleplayLibrarySession,
} from '@/lib/roleplay-library';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import { type RoleplayToolCache } from '@/lib/play-settings';
import { resolveFilmFailurePlaybook } from '@/lib/queue-failure-playbook';
import type { RoleplayStoryBeat } from '@/lib/roleplay';
import { filmResolutionForCutOptions, filmShapeOf } from '@/lib/video-resolution';
import { widenStillForFilm } from '@/lib/film-widen-client';
import { renderNarrationLine } from '@/lib/film-narration-client';
import { holdForNarration, storyNarrationLine, storyPreviouslyOnShots } from '@/lib/story-film';
import { exportFilmPoster, pickPosterShotUrl } from '@/lib/film-poster';

/** The page's queue function, as widened stills need it. */
export type FilmSendComfyUi = Parameters<typeof widenStillForFilm>[0]['sendComfyUi'];

export function useRoleplayFilmActions(input: {
  toolSettings: RoleplayToolCache;
  storyRef: MutableRefObject<RoleplayStoryBeat[]>;
  bioName?: string;
  /** The queue (filled once the page's actions exist) — widened stills need it. */
  sendComfyUiRef?: MutableRefObject<FilmSendComfyUi | null>;
}) {
  const [assemblingFilm, setAssemblingFilm] = useState(false);
  const [filmStatus, setFilmStatus] = useState<string | null>(null);
  const [filmNeedsCast, setFilmNeedsCast] = useState(false);
  const [filmCharacterId, setFilmCharacterId] = useState<string | null>(null);
  const [firstCutCelebrate, setFirstCutCelebrate] = useState(false);
  const [filmCutOptions, setFilmCutOptions] =
    useState<FilmCutOptionsValue>(DEFAULT_FILM_CUT_OPTIONS);
  const assembledFilmRef = useRef<{ filename: string; data: Uint8Array } | null>(null);
  /** Gallery entry of the most recent stamped cut — the poster hangs off it. */
  const lastFilmEntryRef = useRef<string | undefined>(undefined);
  const [posterBusy, setPosterBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filmGuideHref, setFilmGuideHref] = useState<string | null>(null);

  const [cutProblems, setCutProblems] = useState<CutShotProblem[] | null>(null);
  /** Narration and widened stills made this session, by line / by image (not re-rendered). */
  const narrationCacheRef = useRef(new Map<string, string>());
  const wideCacheRef = useRef(new Map<string, string>());
  const [cutChecking, setCutChecking] = useState(false);

  const cutRoleplayFilm = useCallback(
    async (options?: { excludeKeys?: string[]; skipCheck?: boolean }) => {
      const edits = filmCutOptions.shotEdits;
      const excluded = options?.excludeKeys ?? [];
      const shots = applyCutShotEdits(
        roleplayWatchPlaylist(input.storyRef.current) as KeyedShot[],
        excluded.length > 0
          ? {
              ...edits,
              shots: {
                ...edits?.shots,
                ...Object.fromEntries(
                  excluded.map(key => [key, { ...edits?.shots?.[key], include: false }])
                ),
              },
            }
          : edits
      );
      // Pre-cut check: beats whose still failed or missed its pose / face get a look first.
      if (!options?.skipCheck) {
        const byKey = new Map(input.storyRef.current.map(beat => [`${beat.id}@${beat.at}`, beat]));
        const problems = cutShotProblems(shots, shot => {
          const beat = byKey.get(shot.key);
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
        // Delivery check: missing files, black frames, a talking clip with no sound.
        setCutChecking(true);
        const delivery = await checkCutDelivery(shots, shot =>
          Boolean(byKey.get(shot.key)?.line?.trim())
        ).finally(() => setCutChecking(false));
        const all = mergeDeliveryProblems(problems, shots, delivery?.reasons);
        if (all.length > 0) {
          setCutProblems(all);
          return;
        }
      }
      setCutProblems(null);
      if (shots.length === 0) {
        setFilmGuideHref(null);
        setError('Need a completed still or clip before cutting a film.');
        return;
      }
      const name = input.toolSettings.characterName?.trim() || input.bioName?.trim() || 'roleplay';
      const session = snapshotRoleplaySession(input.toolSettings);
      const fromSession = session ? characterFromRoleplaySession(session) : null;
      let character =
        (fromSession ? getCharacter(fromSession.id) : undefined) ||
        loadCharacters().find(entry => {
          const labels = [entry.name, entry.characterName].map(value =>
            value?.trim().toLowerCase()
          );
          return labels.includes(name.toLowerCase());
        });
      if (!character && session) {
        character = upsertCharacterFromRoleplaySession(session);
        upsertRoleplayLibrarySession(session);
      }
      setAssemblingFilm(true);
      setError(null);
      setFilmGuideHref(null);
      setFilmNeedsCast(false);
      setFilmStatus('Checking shots…');
      try {
        const shared = loadSettingsCache().shared;
        const byKey = new Map(input.storyRef.current.map(beat => [`${beat.id}@${beat.at}`, beat]));
        // Widen stills to 16:9 for a widescreen cut (one Edit 2511 pass a still, kept this session).
        const send = input.sendComfyUiRef?.current;
        if (filmCutOptions.widen === true && filmShapeOf(filmCutOptions) === 'wide' && send) {
          for (const [index, shot] of shots.entries()) {
            if (shot.kind !== 'still') continue;
            let wide = wideCacheRef.current.get(shot.url);
            if (!wide) {
              setFilmStatus(`Widening ${shot.title} to 16:9…`);
              wide =
                (await widenStillForFilm({
                  imageUrl: shot.url,
                  sendComfyUi: send,
                  model: shared.model,
                  characterId: character?.id,
                }).catch(() => null)) ?? undefined;
              if (wide) wideCacheRef.current.set(shot.url, wide);
            }
            if (wide) shots[index] = { ...shot, url: wide };
          }
        }
        // Narrate: each scene's first sentence over its shot (the narrated still holds for it).
        if (filmCutOptions.narrate === true) {
          const man = getCharacter(character?.id ?? '')?.traits?.sex === 'man';
          for (const [index, shot] of shots.entries()) {
            const beat = byKey.get(shot.key);
            const line = beat ? storyNarrationLine(beat) : '';
            if (!line) continue;
            let url = narrationCacheRef.current.get(line);
            if (!url) {
              setFilmStatus(`Recording the narration for ${shot.title}…`);
              url = await renderNarrationLine({ line, speaker: man ? 'man' : 'woman' }).catch(
                () => undefined
              );
              if (url) narrationCacheRef.current.set(line, url);
            }
            if (url) shots[index] = { ...holdForNarration(shot, line), narrationUrl: url };
          }
        }
        // "Previously on": three shots of this Cast's last Story open this one.
        const recap =
          character && filmCutOptions.previouslyOn !== false
            ? storyPreviouslyOnShots(loadRoleplayLibrary(), {
                castId: character.id,
                currentSessionId: input.toolSettings.activeSessionId,
                name,
              })
            : [];
        const result = await assembleAndStampFilm({
          source: 'story',
          shots: recap.length ? [...(recap as KeyedShot[]), ...shots] : shots,
          characterId: character?.id ?? '',
          characterName: name,
          lookId: character?.activeLookId,
          crossfadeSec: filmCutOptions.crossfadeSec,
          resolution: filmResolutionForCutOptions(filmCutOptions),
          audioBedUrl: filmCutOptions.audioBedUrl.trim() || undefined,
          musicLevel: filmCutOptions.musicLevel,
          voiceLevel: filmCutOptions.voiceLevel,
          stillMotion: filmCutOptions.stillMotion !== false,
          captions: filmCutOptions.titles === true,
          titleCard: filmCutOptions.titles
            ? {
                title: name,
                subtitle: 'A Castcut story',
                ...(recap.length ? { afterShots: recap.length } : {}),
              }
            : null,
          length: filmCutOptions.length,
          beatSnap: filmCutOptions.beatSnap,
          onProgress: progress => setFilmStatus(progress.label),
        });
        downloadFilmBlob(result.blob, result.filename);
        lastFilmEntryRef.current = result.entryId;
        assembledFilmRef.current = {
          filename: result.filename,
          data: new Uint8Array(await result.blob.arrayBuffer()),
        };
        if (character) {
          setFilmCharacterId(character.id);
        }
        if (character && result.persisted) {
          setFilmNeedsCast(false);
          setFilmStatus(
            `Saved ${result.filename} to ${character.name} (${result.encodePath} encode) and started the download.`
          );
        } else {
          setFilmNeedsCast(true);
          setFilmStatus(
            character
              ? `Downloaded ${result.filename} (${result.encodePath} encode). Save to Cast to stamp a studio copy.`
              : `Downloaded ${result.filename} (${result.encodePath} encode) unstamped. Save to Cast to attach this film to a character.`
          );
        }
        markOnboardingFirstPlayCampaign();
        const firstCut = markOnboardingFirstFilmCut();
        void import('@/lib/local-observability').then(
          ({ noteFilmCutSourceMetric, noteSaveToCastMetric }) => {
            noteFilmCutSourceMetric('roleplay');
            if (character && result.persisted) {
              noteSaveToCastMetric();
            }
          }
        );
        if (character) {
          completePlayCampaign({ characterId: character.id, stepId: 'roleplay' });
        }
        if (firstCut) {
          void import('@/lib/system-tray-celebrate').then(({ celebrateSystemTray }) => {
            celebrateSystemTray('job');
          });
          setFirstCutCelebrate(true);
          setFilmStatus(
            character
              ? `First film cut — watch on Cast, share, or open Same look, new Day.`
              : `First film cut — share or Save to Cast to attach it.`
          );
        }
      } catch (err) {
        const playbook = resolveFilmFailurePlaybook(
          err instanceof Error ? err.message : 'Could not assemble the film.'
        );
        setError(playbook.message);
        setFilmGuideHref(playbook.href ?? null);
        setFilmStatus(null);
      } finally {
        setAssemblingFilm(false);
      }
    },
    [filmCutOptions, input.bioName, input.storyRef, input.toolSettings]
  );

  const saveFilmToCast = useCallback(() => {
    const persisted = persistRoleplayLibraryFromCache(input.toolSettings);
    if (!persisted) {
      setError('Name the character and add a beat before saving to Cast.');
      return;
    }
    const created =
      getCharacter(
        persisted.session.id.startsWith('char-')
          ? persisted.session.id
          : `char-rp-${persisted.session.id}`
      ) ?? upsertCharacterFromRoleplaySession(persisted.session);
    if (!created) {
      setError('Name the character before saving to Cast.');
      return;
    }
    saveSharedSettings({
      ...loadSettingsCache().shared,
      ...applyCharacterRecord(created),
    });
    setFilmCharacterId(created.id);
    void import('@/lib/local-observability').then(({ noteSaveToCastMetric }) => {
      noteSaveToCastMetric();
    });
    const film = assembledFilmRef.current;
    if (!film) {
      setFilmNeedsCast(false);
      setFilmStatus(`Saved ${created.name} to Cast.`);
      return;
    }
    void (async () => {
      const stamped = await stampAssembledFilm({
        blob: new Blob([film.data.slice()]),
        filename: film.filename,
        characterId: created.id,
        characterName: created.name,
        lookId: created.activeLookId,
      });
      setFilmNeedsCast(false);
      setFilmStatus(
        stamped.persisted
          ? `Saved ${created.name} to Cast and stamped ${film.filename}.`
          : `Saved ${created.name} to Cast. Studio storage could not keep the film.`
      );
    })();
  }, [input.toolSettings]);

  const shareLastCut = useCallback(async () => {
    const film = assembledFilmRef.current;
    if (!film) {
      setError('Cut a film first, then share or download.');
      return;
    }
    const bytes = new Uint8Array(film.data);
    const blob = new Blob([bytes], { type: 'video/mp4' });
    try {
      const shared = await shareFilmBlob(blob, film.filename);
      setFilmStatus(shared ? `Shared ${film.filename}.` : `Downloaded ${film.filename}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share the film.');
    }
  }, []);

  /** Save a poster frame from the first completed Story still, matching the cut's aspect. */
  const saveFilmPoster = useCallback(async () => {
    // The shot picked as poster in the shot list (a clip: one of its frames), else a still.
    const playlist = roleplayWatchPlaylist(input.storyRef.current) as KeyedShot[];
    const picked = cutPosterPick(
      applyCutShotEdits(playlist, filmCutOptions.shotEdits),
      filmCutOptions.shotEdits
    );
    const posterUrl =
      picked && 'imageUrl' in picked ? picked.imageUrl : pickPosterShotUrl(playlist);
    if (!posterUrl && !picked) {
      setError('Queue and wait for a completed still before saving a poster.');
      return;
    }
    const name = input.toolSettings.characterName?.trim() || input.bioName?.trim() || 'roleplay';
    setPosterBusy(true);
    setError(null);
    setFilmStatus('Rendering poster…');
    try {
      const poster = await exportFilmPoster({
        ...(picked && 'videoUrl' in picked
          ? { videoFrame: { url: picked.videoUrl, timeSec: picked.timeSec } }
          : { imageUrl: posterUrl ?? undefined }),
        characterName: name,
        characterId: filmCharacterId ?? undefined,
        parentGalleryEntryId: lastFilmEntryRef.current,
        resolution: filmResolutionForCutOptions(filmCutOptions),
        titleCard: filmCutOptions.titles ? { title: name, subtitle: 'A Castcut story' } : null,
      });
      downloadFilmBlob(poster.blob, poster.filename);
      setFilmStatus(
        poster.persisted
          ? `Saved ${poster.filename} (${poster.width}×${poster.height}) to Gallery and started the download.`
          : `Downloaded ${poster.filename} (${poster.width}×${poster.height}). Studio storage could not keep a copy.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the poster.');
      setFilmStatus(null);
    } finally {
      setPosterBusy(false);
    }
  }, [
    filmCharacterId,
    filmCutOptions,
    input.bioName,
    input.storyRef,
    input.toolSettings.characterName,
  ]);

  /** Pre-cut dialog: retry the beats first (the caller's queue), leave them out, or cut anyway. */
  const resolveCutProblems = useCallback(
    async (
      action: 'retry' | 'leave-out' | 'cut-anyway' | 'cancel',
      retryBeat?: (beat: RoleplayStoryBeat) => Promise<unknown>
    ) => {
      const problems = cutProblems ?? [];
      setCutProblems(null);
      if (action === 'retry' && retryBeat) {
        const byKey = new Map(input.storyRef.current.map(beat => [`${beat.id}@${beat.at}`, beat]));
        // Sequential — the queue is single-flight.
        for (const problem of problems) {
          const beat = byKey.get(problem.key);
          if (beat) await retryBeat(beat);
        }
      } else if (action === 'leave-out') {
        await cutRoleplayFilm({
          excludeKeys: problems.map(problem => problem.key),
          skipCheck: true,
        });
      } else if (action === 'cut-anyway') {
        await cutRoleplayFilm({ skipCheck: true });
      }
    },
    [cutProblems, cutRoleplayFilm, input.storyRef]
  );
  // "Previously on" is offered when this Cast has an earlier Story with a still in it.
  const activeCastId = loadSettingsCache().shared.activeCharacterId?.trim() || '';
  const storyPreviouslyAvailable =
    Boolean(activeCastId) &&
    storyPreviouslyOnShots(loadRoleplayLibrary(), {
      castId: activeCastId,
      currentSessionId: input.toolSettings.activeSessionId,
      name: '',
    }).length > 0;

  return {
    storyPreviouslyAvailable,
    assemblingFilm,
    saveFilmPoster,
    posterBusy,
    filmStatus,
    filmNeedsCast,
    filmCharacterId,
    firstCutCelebrate,
    clearFirstCutCelebrate: () => setFirstCutCelebrate(false),
    cutRoleplayFilm,
    cutProblems,
    cutChecking,
    resolveCutProblems,
    saveFilmToCast,
    shareLastCut,
    filmError: error,
    filmGuideHref,
    assembledFilmRef,
    filmCutOptions,
    setFilmCutOptions,
    clearFilmError: () => {
      setError(null);
      setFilmGuideHref(null);
    },
  };
}
