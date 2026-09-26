'use client';

import {
  applyCutShotEdits,
  cutShotProblems,
  type CutShotProblem,
  type KeyedShot,
} from '@/lib/film-cut-plan';
import { storyFaceMatchLabel, storyPoseMatchLabel } from '@/lib/roleplay-pose-check';
import { DEFAULT_MIN_FACE_MATCH, FACE_MATCH_WARN_BELOW } from '@/lib/face-match';
import { DEFAULT_MIN_POSE_MATCH } from '@/lib/pose-score';
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
} from '@/lib/character-film-assemble';
import { roleplayWatchPlaylist } from '@/lib/character-film';
import {
  applyCharacterRecord,
  characterFromRoleplaySession,
  getCharacter,
  loadCharacters,
  upsertCharacterFromRoleplaySession,
} from '@/lib/character-os';
import {
  markOnboardingFirstFilmCut,
  markOnboardingFirstPlayCampaign,
} from '@/lib/onboarding-hooks';
import { completePlayCampaign } from '@/lib/play-campaign';
import {
  persistRoleplayLibraryFromCache,
  snapshotRoleplaySession,
  upsertRoleplayLibrarySession,
} from '@/lib/roleplay-library';
import {
  loadSettingsCache,
  saveSharedSettings,
  type RoleplayToolCache,
} from '@/lib/settings-cache';
import { resolveFilmFailurePlaybook } from '@/lib/queue-failure-playbook';
import type { RoleplayStoryBeat } from '@/lib/roleplay';
import { filmResolutionForCutOptions } from '@/lib/film-resolution';
import { exportFilmPoster, pickPosterShotUrl } from '@/lib/film-poster';

export function useRoleplayFilmActions(input: {
  toolSettings: RoleplayToolCache;
  storyRef: MutableRefObject<RoleplayStoryBeat[]>;
  bioName?: string;
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
          const pose = storyPoseMatchLabel(beat, DEFAULT_MIN_POSE_MATCH);
          const face = storyFaceMatchLabel(beat, {
            miss: DEFAULT_MIN_FACE_MATCH,
            warn: FACE_MATCH_WARN_BELOW,
          });
          return {
            flagged: beat.stillStatus === 'error' ? ['the still failed'] : [],
            ...(pose?.miss ? { poseMiss: true, pose: beat.poseMatch?.score } : {}),
            ...(face?.miss ? { faceMiss: true, face: beat.faceMatch?.similarity } : {}),
          };
        });
        if (problems.length > 0) {
          setCutProblems(problems);
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
        const result = await assembleAndStampFilm({
          shots,
          characterId: character?.id ?? '',
          characterName: name,
          lookId: character?.activeLookId,
          crossfadeSec: filmCutOptions.crossfadeSec,
          resolution: filmResolutionForCutOptions({ vertical: filmCutOptions.vertical }),
          audioBedUrl: filmCutOptions.audioBedUrl.trim() || undefined,
          stillMotion: filmCutOptions.stillMotion !== false,
          captions: filmCutOptions.titles === true,
          titleCard: filmCutOptions.titles ? { title: name, subtitle: 'A Castcut story' } : null,
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
    const posterUrl = pickPosterShotUrl(roleplayWatchPlaylist(input.storyRef.current));
    if (!posterUrl) {
      setError('Queue and wait for a completed still before saving a poster.');
      return;
    }
    const name = input.toolSettings.characterName?.trim() || input.bioName?.trim() || 'roleplay';
    setPosterBusy(true);
    setError(null);
    setFilmStatus('Rendering poster…');
    try {
      const poster = await exportFilmPoster({
        imageUrl: posterUrl,
        characterName: name,
        characterId: filmCharacterId ?? undefined,
        parentGalleryEntryId: lastFilmEntryRef.current,
        resolution: filmResolutionForCutOptions({ vertical: filmCutOptions.vertical }),
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
    filmCutOptions.titles,
    filmCutOptions.vertical,
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
  return {
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
