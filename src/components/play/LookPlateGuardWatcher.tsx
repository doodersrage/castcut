'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CastPlatePrepareOptions } from '@/lib/cast/plate-prepare';
import {
  CAST_PLATE_TRAIT_EDIT_EVENT,
  type CastPlateTraitEditRequest,
} from '@/lib/cast/plate-trait-edit';
import { CHARACTERS_UPDATED_EVENT } from '@/lib/character/os';

const LookPlateMarksRepair = dynamic(() => import('@/components/play/LookPlateMarksRepair'), {
  ssr: false,
});

const SHAVE_OPTIONS: CastPlatePrepareOptions = {
  stand: false,
  baseLayer: false,
  whiteBackground: false,
  shave: true,
};

/**
 * Watches the active Cast's look plates (look-plate-guard.ts): plates already there when the app
 * opens are left alone; a plate that changes while it is open is measured against the Cast, and
 * one that reads as a different person is said in the tray, pointing at Cast home → Looks. Then
 * the Cast's marks are checked on it, and when glasses or a tattoo are missing they are painted on
 * once (Prepare plate → Her marks; the plate it replaces stays in Earlier plates). Look traits
 * saved on Cast home (hair, makeup…) are edited onto the active plate here too, so the edit
 * finishes wherever the user goes. The guard code loads only when a plate changes.
 */
type RepairJob = {
  id: number;
  characterId: string;
  lookId: string;
  name: string;
  /** Missing marks painted on, a Clean-shaven Cast's first plate shaved, or saved look traits. */
  kind: 'marks' | 'shave' | 'traits';
  options?: CastPlatePrepareOptions;
};

export default function LookPlateGuardWatcher() {
  const [repair, setRepairState] = useState<RepairJob | null>(null);
  const repairRef = useRef<RepairJob | null>(null);
  const pendingRef = useRef<RepairJob[]>([]);
  const jobIdRef = useRef(0);
  // One job at a time (each owns a queue hook); later ones wait their turn.
  const setRepair = useCallback((job: Omit<RepairJob, 'id'> | null) => {
    if (job && repairRef.current) {
      pendingRef.current.push({ ...job, id: ++jobIdRef.current });
      return;
    }
    const next = job ? { ...job, id: ++jobIdRef.current } : (pendingRef.current.shift() ?? null);
    repairRef.current = next;
    setRepairState(next);
  }, []);
  // One automatic repaint per look per session: the repainted plate is a plate change too.
  const repaintedRef = useRef(new Set<string>());
  // Looks whose next plate change is a trait edit the user asked for: a new hairstyle moves the
  // face score (high ponytail 0.49–0.55 distance), so it isn't reported as a different person.
  const traitEditRef = useRef(new Set<string>());
  const onRepairDone = useCallback(
    (result: 'painted' | 'skipped' | 'failed', note?: string) => {
      const job = repairRef.current;
      repairRef.current = null;
      setRepair(null);
      if (!job) return;
      if (job.kind === 'traits' && result !== 'painted') {
        traitEditRef.current.delete(`${job.characterId}:${job.lookId}`);
      }
      if (result === 'skipped') return;
      void import('@/lib/app/system-tray-messages').then(({ pushSystemTrayMessage }) =>
        pushSystemTrayMessage({
          text:
            job.kind === 'traits'
              ? result === 'painted'
                ? `${job.name}'s plate was edited to match the new appearance (the plate before is in Earlier plates). Other looks keep their plates.`
                : `${job.name}'s appearance is saved, and editing the plate to match failed${note ? `: ${note}` : ''}. Generate a new plate on Cast home → Looks.`
              : job.kind === 'shave'
                ? result === 'painted'
                  ? `${job.name} is set to clean-shaven — the first plate was shaved (the plate before is in Earlier plates).`
                  : `${job.name} is set to clean-shaven, and shaving the first plate failed${note ? `: ${note}` : ''}. Prepare plate on Cast home can try again.`
                : result === 'painted'
                  ? `${job.name}'s marks were missing on the new plate — painted on (the plate before is in Earlier plates).`
                  : `${job.name}'s marks are missing on the new plate, and painting them on failed${note ? `: ${note}` : ''}.`,
          tone: result === 'painted' ? 'info' : 'warning',
          ttlMs: 20_000,
        })
      );
    },
    [setRepair]
  );
  useEffect(() => {
    const onRequest = (event: Event) => {
      const request = (event as CustomEvent<CastPlateTraitEditRequest>).detail;
      if (!request?.characterId || !request.lookId) return;
      void import('@/lib/character/os').then(({ getCharacter }) => {
        const character = getCharacter(request.characterId);
        if (!character) return;
        traitEditRef.current.add(`${request.characterId}:${request.lookId}`);
        setRepair({
          characterId: request.characterId,
          lookId: request.lookId,
          name: character.name,
          kind: 'traits',
          options: request.options,
        });
      });
    };
    window.addEventListener(CAST_PLATE_TRAIT_EDIT_EVENT, onRequest);
    return () => window.removeEventListener(CAST_PLATE_TRAIT_EDIT_EVENT, onRequest);
  }, [setRepair]);
  useEffect(() => {
    let cancelled = false;
    const seen = new Map<string, string>();
    const queue: Array<() => Promise<void>> = [];
    let running = false;
    const drain = async () => {
      if (running) return;
      running = true;
      while (queue.length && !cancelled) await queue.shift()!();
      running = false;
    };
    const scan = () => {
      void Promise.all([
        import('@/lib/character/os'),
        import('@/lib/settings/cache'),
        import('@/lib/character/likeness-measure-client'),
      ]).then(([cast, settings, likeness]) => {
        if (cancelled) return;
        const castId = settings.loadSettingsCache().shared.activeCharacterId?.trim();
        const character = castId ? cast.getCharacter(castId) : undefined;
        if (!character) return;
        for (const look of cast.looksOf(character)) {
          const plate = likeness.lookPlateFaceUrl(look);
          const key = `${character.id}:${look.id}`;
          if (!plate) {
            // No plate yet: when one lands it is this look's first plate ('').
            if (!seen.has(key)) seen.set(key, '');
            continue;
          }
          const before = seen.get(key);
          seen.set(key, plate);
          if (before === undefined || before === plate) continue;
          if (before === '') {
            // A first plate has nothing to compare with. UltraReal draws stubble on men whatever
            // the words say, so a Clean-shaven Cast's first plate is shaved once (2511 edit; the
            // result becomes the face lock every later plate starts from).
            const traits = character.traits;
            if (
              traits?.facialHair === 'clean-shaven' &&
              traits.sex !== 'woman' &&
              !repaintedRef.current.has(key)
            ) {
              repaintedRef.current.add(key);
              setRepair({
                characterId: character.id,
                lookId: look.id,
                name: character.name,
                kind: 'shave',
              });
            }
            continue;
          }
          const asked = traitEditRef.current.delete(key);
          queue.push(async () => {
            const guard = await import('@/lib/character/look-plate-guard');
            const result = asked
              ? null
              : await guard.checkLookPlate({
                  characterId: character.id,
                  lookId: look.id,
                  previousPlate: before,
                });
            if (cancelled) return;
            if (!result || result.face >= likeness.PLATE_DRIFT_BELOW) {
              // The same person: are her marks on it?
              const repairKey = `${character.id}:${look.id}`;
              if (repaintedRef.current.has(repairKey)) return;
              const marks = await import('@/lib/cast/plate-marks');
              const missing = await marks.lookPlateMissesMarks(character.id, look.id);
              if (missing && !cancelled) {
                repaintedRef.current.add(repairKey);
                setRepair({
                  characterId: character.id,
                  lookId: look.id,
                  name: character.name,
                  kind: 'marks',
                });
              }
              return;
            }
            const { pushSystemTrayMessage } = await import('@/lib/app/system-tray-messages');
            pushSystemTrayMessage({
              text: result.noFace
                ? `The new plate for “${look.name}” shows no face — likely ${character.name} from behind. Every still starts from it — make the plate again, or put back the earlier one on Cast home → Looks.`
                : `The new plate for “${look.name}” doesn't look like ${character.name} (${Math.round(result.face * 100)}% match with ${result.against}). Every still starts from it — put back the earlier plate on Cast home → Looks.`,
              tone: 'warning',
              href: cast.characterLooksHref(character.id),
              actionLabel: 'Open Looks',
              ttlMs: 0,
            });
          });
          void drain();
        }
      });
    };
    scan();
    window.addEventListener(CHARACTERS_UPDATED_EVENT, scan);
    return () => {
      cancelled = true;
      window.removeEventListener(CHARACTERS_UPDATED_EVENT, scan);
    };
  }, [setRepair]);
  return repair ? (
    <LookPlateMarksRepair
      key={repair.id}
      characterId={repair.characterId}
      lookId={repair.lookId}
      options={repair.options ?? (repair.kind === 'shave' ? SHAVE_OPTIONS : undefined)}
      onDone={onRepairDone}
    />
  ) : null;
}
