'use client';

import { useMemo, useState } from 'react';
import ActionMenu from '@/components/ui/ActionMenu';
import { Button } from '@/components/ui/Button';
import SideSheet from '@/components/ui/SideSheet';
import { getCharacter, upsertCharacter, type CharacterRecord } from '@/lib/character/os';
import {
  MOOD_BOARD_MAX,
  noteMoodBoardPin,
  normalizeMoodBoard,
  pinToMoodBoard,
  unpinFromMoodBoard,
  type MoodBoardPin,
} from '@/lib/character/mood-board';
import {
  galleryEntryPrimaryThumbUrl,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from '@/lib/gallery/comfyui-gallery';

function saveBoard(
  castId: string,
  board: MoodBoardPin[],
  onUpdated?: (c: CharacterRecord) => void
) {
  const fresh = getCharacter(castId);
  if (!fresh) return;
  const { moodBoard: _old, ...rest } = fresh;
  void _old;
  upsertCharacter(board.length ? { ...rest, moodBoard: board } : rest);
  const saved = getCharacter(castId);
  if (saved) onUpdated?.(saved);
}

/**
 * Cast → Bible → Mood board (character/mood-board.ts): pictures pinned from this Cast's Gallery —
 * the light, the places, the colours their films aim for — with a note each. Reference only; Day,
 * Scene and Story show it in their Mood menu.
 */
export default function CastMoodBoard({
  character,
  onUpdated,
}: {
  character: CharacterRecord;
  onUpdated?: (character: CharacterRecord) => void;
}) {
  const board = normalizeMoodBoard(character.moodBoard);
  const [picking, setPicking] = useState(false);
  const candidates = useMemo(
    () =>
      picking
        ? loadComfyGallery()
            .filter(entry => entry.characterId === character.id && entry.status === 'completed')
            .slice(0, 200)
        : [],
    [character.id, picking]
  );
  return (
    <section className="space-y-2" data-testid="cast-mood-board">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="type-body font-medium">Mood board</p>
          <p className="type-caption text-[var(--text-muted)]">
            Pictures that say how {character.name}&apos;s films should feel — shown beside Day,
            Scene and Story. Reference only; it changes no render.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={board.length >= MOOD_BOARD_MAX}
          data-testid="cast-mood-board-add"
          onClick={() => setPicking(true)}
        >
          Pin from Gallery
        </Button>
      </div>
      {board.length ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {board.map(pin => (
            <li key={pin.id} className="space-y-1" data-testid="cast-mood-board-pin">
              {/* eslint-disable-next-line @next/next/no-img-element -- Gallery media URL */}
              <img
                src={pin.url}
                alt={pin.note || ''}
                className="aspect-square w-full rounded-[var(--radius-sm)] object-cover"
                loading="lazy"
              />
              <input
                type="text"
                maxLength={120}
                defaultValue={pin.note ?? ''}
                key={pin.note ?? ''}
                placeholder="A note…"
                aria-label="Note on this picture"
                className="ui-input h-6 w-full min-w-0 px-1.5 text-xs"
                onBlur={event => {
                  if (event.target.value.trim() !== (pin.note ?? '')) {
                    saveBoard(
                      character.id,
                      noteMoodBoardPin(board, pin.id, event.target.value),
                      onUpdated
                    );
                  }
                }}
              />
              <Button
                size="sm"
                variant="underline"
                aria-label="Unpin this picture"
                onClick={() =>
                  saveBoard(character.id, unpinFromMoodBoard(board, pin.id), onUpdated)
                }
              >
                Unpin
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-caption text-[var(--text-muted)]">Nothing pinned yet.</p>
      )}
      <SideSheet
        open={picking}
        onClose={() => setPicking(false)}
        title="Pin to the mood board"
        description={`${character.name}'s pictures in the Gallery — tap one to pin it.`}
        size="lg"
        testId="cast-mood-board-picker"
      >
        {candidates.length ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {candidates.map(entry => {
              const thumb = galleryEntryPrimaryThumbUrl(entry) ?? galleryEntryPrimaryViewUrl(entry);
              if (!thumb) return null;
              return (
                <li key={entry.id}>
                  <Button
                    variant="quiet"
                    className="!block !p-0"
                    aria-label="Pin this picture"
                    onClick={() => {
                      saveBoard(
                        character.id,
                        pinToMoodBoard(board, { id: entry.id, url: thumb }),
                        onUpdated
                      );
                      setPicking(false);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Gallery media URL */}
                    <img
                      src={thumb}
                      alt=""
                      className="aspect-square w-full rounded-[var(--radius-sm)] object-cover"
                      loading="lazy"
                    />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="type-caption text-[var(--text-muted)]">
            Nothing of {character.name}&apos;s in the Gallery yet.
          </p>
        )}
      </SideSheet>
    </section>
  );
}

/** Day / Scene / Story: the Cast's mood board in a menu, to glance at while planning. */
export function CastMoodBoardMenu({
  character,
  testId,
}: {
  character?: CharacterRecord | null;
  testId: string;
}) {
  const board = normalizeMoodBoard(character?.moodBoard);
  if (!character || !board.length) return null;
  return (
    <ActionMenu label={`Mood · ${board.length}`} testId={testId}>
      <div className="grid w-72 grid-cols-3 gap-1.5 p-1.5">
        {board.map(pin => (
          <figure key={pin.id} className="space-y-0.5" title={pin.note}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Gallery media URL */}
            <img
              src={pin.url}
              alt={pin.note || ''}
              className="aspect-square w-full rounded-[var(--radius-sm)] object-cover"
              loading="lazy"
            />
            {pin.note ? (
              <figcaption className="line-clamp-2 text-3xs text-[var(--text-muted)]">
                {pin.note}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>
    </ActionMenu>
  );
}
