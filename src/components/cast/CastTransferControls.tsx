'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { characterHomeHref } from '@/lib/character-os';

/** "Export" for one Cast: a file with its record, picture, Story and Day plan. */
export function CastExportButton({ characterId }: { characterId: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        loading={busy}
        loadingLabel="Exporting"
        data-testid="cast-export"
        onClick={() => {
          setBusy(true);
          setNote(null);
          void import('@/lib/cast-transfer-client')
            .then(({ downloadCastFile }) => downloadCastFile(characterId))
            .then(({ pictureMissing }) =>
              setNote(
                pictureMissing
                  ? 'Exported — without the picture (its file could not be read).'
                  : 'Exported.'
              )
            )
            .catch(err => setNote(err instanceof Error ? err.message : 'Could not export.'))
            .finally(() => setBusy(false));
        }}
      >
        Export Cast file
      </Button>
      {note ? (
        <span className="type-caption self-center text-[var(--text-muted)]" role="status">
          {note}
        </span>
      ) : null}
    </>
  );
}

/** "Import a Cast file" for the Cast list. */
export function CastImportButton() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        data-testid="cast-import-input"
        aria-label="Cast file to import"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setBusy(true);
          setNote(null);
          setError(null);
          void import('@/lib/cast-transfer-client')
            .then(({ importCastFile }) => importCastFile(file))
            .then(result => {
              const parts = [
                `${result.character.name} added to the Cast`,
                result.stories ? 'with its story' : '',
                result.dayPlan ? 'and its Day plan' : '',
              ].filter(Boolean);
              setNote(
                `${parts.join(' ')}.${result.renamed ? ' (Renamed: one with that name was already here.)' : ''}${
                  result.pictureError
                    ? ` The picture could not be set up (${result.pictureError}) — add one on its page.`
                    : ''
                }`
              );
              if (!result.pictureError) router.push(characterHomeHref(result.character.id));
            })
            .catch(err => setError(err instanceof Error ? err.message : 'Could not import.'))
            .finally(() => setBusy(false));
        }}
      />
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        loadingLabel="Importing"
        data-testid="cast-import"
        onClick={() => input.current?.click()}
      >
        Import a Cast file
      </Button>
      {note ? (
        <p
          className="type-caption text-[var(--text-muted)]"
          role="status"
          data-testid="cast-import-note"
        >
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="type-caption text-[var(--tint-danger-text)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
