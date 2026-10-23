'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { characterHomeHref } from '@/lib/character/os';

/** "Export" for one Cast: a file with its record, picture, Story and Day plan; or a bundle. */
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
          void import('@/lib/cast/transfer-client')
            .then(({ downloadCastFile }) => downloadCastFile(characterId))
            .then(({ pictureMissing }) =>
              setNote(
                pictureMissing
                  ? 'Exported — without some pictures (their files could not be read).'
                  : 'Exported.'
              )
            )
            .catch(err => setNote(err instanceof Error ? err.message : 'Could not export.'))
            .finally(() => setBusy(false));
        }}
      >
        Export Cast file
      </Button>
      <CastBundleExport characterId={characterId} onNote={setNote} />
      {note ? (
        <span className="type-caption self-center text-[var(--text-muted)]" role="status">
          {note}
        </span>
      ) : null}
    </>
  );
}

/**
 * "Export bundle": the Cast with every picture it uses (all looks' plates, earlier plates, dress
 * plates) and its films — its stills when ticked — as one .tar (cast-bundle-client.ts).
 */
function CastBundleExport({
  characterId,
  onNote,
}: {
  characterId: string;
  onNote: (note: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [includeStills, setIncludeStills] = useState(false);
  const [counts, setCounts] = useState<{ films: number; stills: number } | null>(null);
  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        data-testid="cast-bundle-open"
        title="The Cast with all its pictures and films, to move it to another install"
        onClick={() => {
          setOpen(true);
          void import('@/lib/cast/bundle-client').then(({ castBundleCounts }) =>
            setCounts(castBundleCounts(characterId))
          );
        }}
      >
        Export bundle
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2" data-testid="cast-bundle">
      <label className="type-caption flex items-center gap-1.5 text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={includeStills}
          onChange={event => setIncludeStills(event.target.checked)}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
        />
        Include stills{counts ? ` (${counts.stills})` : ''}
      </label>
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        loadingLabel="Preparing"
        data-testid="cast-bundle-download"
        onClick={() => {
          setBusy(true);
          onNote(null);
          void import('@/lib/cast/bundle-client')
            .then(({ downloadCastBundle }) => downloadCastBundle(characterId, { includeStills }))
            .then(({ entries, pictures }) => {
              onNote(
                `Download started: the Cast, ${pictures} pictures and ${entries} Gallery ${entries === 1 ? 'entry' : 'entries'}. Import it on the other install with Import a Cast file.`
              );
              setOpen(false);
            })
            .catch(err => onNote(err instanceof Error ? err.message : 'Could not export.'))
            .finally(() => setBusy(false));
        }}
      >
        Download bundle{counts ? ` · ${counts.films} film${counts.films === 1 ? '' : 's'}` : ''}
      </Button>
    </span>
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
        accept=".json,application/json,.tar,application/x-tar"
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
          if (/\.tar$/i.test(file.name) || file.type === 'application/x-tar') {
            void import('@/lib/cast/bundle-client')
              .then(({ importCastBundle }) =>
                importCastBundle(file, progress =>
                  setNote(
                    progress.phase === 'upload'
                      ? `Uploading the bundle… ${Math.floor((progress.sent / Math.max(1, progress.total)) * 100)}%`
                      : `Unpacking… ${Math.floor((progress.status.bytesDone / Math.max(1, progress.status.bytesTotal)) * 100)}%`
                  )
                )
              )
              .then(result => {
                const missing = result.missing.length
                  ? ` ${result.missing.length} picture${result.missing.length === 1 ? ' did' : 's did'} not come along (${result.missing.slice(0, 3).join(', ')}${result.missing.length > 3 ? '…' : ''}).`
                  : '';
                setNote(
                  `${result.character.name} added to the Cast with ${result.entries} Gallery ${result.entries === 1 ? 'entry' : 'entries'} and ${result.dressPlates} dress plate${result.dressPlates === 1 ? '' : 's'}.${result.renamed ? ' (Renamed: one with that name was already here.)' : ''}${missing}`
                );
                if (!result.missing.length) router.push(characterHomeHref(result.character.id));
              })
              .catch(err => setError(err instanceof Error ? err.message : 'Could not import.'))
              .finally(() => setBusy(false));
            return;
          }
          void import('@/lib/cast/transfer-client')
            .then(({ importCastFile }) => importCastFile(file))
            .then(result => {
              const parts = [
                `${result.character.name} added to the Cast`,
                result.stories ? 'with its story' : '',
                result.dayPlan ? 'and its Day plan' : '',
                result.scenes ? `and ${result.scenes} scene${result.scenes === 1 ? '' : 's'}` : '',
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
        Import a Cast file or bundle
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
