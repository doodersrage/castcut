'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { usePlateStance } from '@/hooks/usePlateStance';
import {
  activeLook,
  characterLooksHref,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  looksOf,
  subscribeCharacters,
} from '@/lib/character-os';
import { resolveLookPlate } from '@/lib/fitting-room';
import {
  parseDismissedPlateKeys,
  plateStanceKey,
  plateStanceNudge,
  withDismissedPlateKey,
} from '@/lib/plate-stance';

/** Per-viewer convenience: plates whose stance note this browser dismissed. */
const DISMISSED_KEY = 'plate-stance-nudge-dismissed';
const DISMISSED_EVENT = 'plate-stance-nudge-dismissed-changed';

function readDismissedRaw(): string {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) ?? '';
  } catch {
    return '';
  }
}

function subscribeDismissed(onStoreChange: () => void): () => void {
  window.addEventListener(DISMISSED_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(DISMISSED_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

function dismissPlate(key: string): void {
  try {
    const next = withDismissedPlateKey(parseDismissedPlateKeys(readDismissedRaw()), key);
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota — the note just stays */
  }
  window.dispatchEvent(new Event(DISMISSED_EVENT));
}

/**
 * Day / Outfit: a short note when the look plate (the active look's, or a Day slot's own look)
 * isn't standing — "Seated plate — poses come out better from a standing one. Prepare plate →"
 * — linking to the Cast page's Looks. Reads the stance the Cast page stored; when there is none
 * yet, usePlateStance reads it once (the DWPose run is shared per image). Dismissible per plate.
 */
export default function PlateStanceNudge({
  characterId,
  lookId,
  className = '',
}: {
  characterId: string | null | undefined;
  /** A Day slot's own look; omitted or unknown: the active look. */
  lookId?: string | null;
  className?: string;
}) {
  const characters = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );
  const dismissedRaw = useSyncExternalStore(subscribeDismissed, readDismissedRaw, () => '');
  const id = characterId?.trim() || '';
  const character = id ? characters.find(entry => entry.id === id) : undefined;
  const look = character
    ? ((lookId ? looksOf(character).find(entry => entry.id === lookId) : undefined) ??
      activeLook(character))
    : undefined;
  const plate = resolveLookPlate(look);
  const stance = usePlateStance({ characterId: character?.id, look, plate });
  const key = plateStanceKey(plate);
  const note = plateStanceNudge(stance);
  if (!character || !note || !key || parseDismissedPlateKeys(dismissedRaw).includes(key)) {
    return null;
  }
  return (
    <p
      className={`type-caption flex flex-wrap items-baseline gap-x-2 text-[var(--tint-warning-text)] ${className}`.trim()}
      data-testid="plate-stance-nudge"
      data-reason={stance?.reason}
    >
      <span>{note}</span>
      <Link
        href={characterLooksHref(character.id)}
        className="font-medium underline underline-offset-2 hover:text-[var(--text-primary)]"
        data-testid="plate-stance-nudge-prepare"
      >
        Prepare plate →
      </Link>
      <button
        type="button"
        aria-label="Dismiss the plate note"
        title="Hide this note for this plate"
        className="text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        data-testid="plate-stance-nudge-dismiss"
        onClick={() => dismissPlate(key)}
      >
        ✕
      </button>
    </p>
  );
}
