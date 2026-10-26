'use client';

import Dialog from '@/components/ui/Dialog';
import { getCharacter } from '@/lib/character/os';
import type { SceneTake } from '@/lib/day/scenes';
import { loadComfyGallery } from '@/lib/gallery/comfyui-gallery';
import { galleryEntryProvenance, type ProvenanceRow } from '@/lib/gallery/provenance';

function ProvenanceList({ rows, testId }: { rows: ProvenanceRow[]; testId: string }) {
  const short = rows.filter(row => !row.long);
  const long = rows.filter(row => row.long);
  return (
    <div className="space-y-3" data-testid={testId}>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {short.map(row => (
          <div
            key={row.key}
            className="min-w-0 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/50 px-3 py-2"
            data-testid={`${testId}-${row.key}`}
          >
            <dt className="type-caption text-[var(--text-muted)]">{row.label}</dt>
            <dd className="mt-0.5 break-words text-sm">{row.value}</dd>
          </div>
        ))}
      </dl>
      {long.map(row => (
        <div key={row.key} data-testid={`${testId}-${row.key}`}>
          <h4 className="type-caption text-[var(--text-muted)]">{row.label}</h4>
          <p className="mt-0.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/50 px-3 py-2 text-sm">
            {row.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * "How this was made" for one Scene take (R4): read from its Gallery entry — the picture's and,
 * once it moves, its clip's. A take whose entry this browser no longer has says so.
 */
export function SceneTakeProvenanceDialog({
  take,
  index,
  castId,
  onClose,
}: {
  take: SceneTake | null;
  index: number;
  castId?: string;
  onClose: () => void;
}) {
  const gallery = take ? loadComfyGallery() : [];
  const byPrompt = (id: string | undefined) =>
    id?.trim() ? gallery.find(entry => entry.promptId === id.trim()) : undefined;
  const still = byPrompt(take?.promptId ?? take?.id);
  const clip = byPrompt(take?.clipPromptId);
  const castName = getCharacter(castId)?.name;
  return (
    <Dialog
      open={Boolean(take)}
      onClose={onClose}
      title={`How take ${index + 1} was made`}
      description="From its Gallery entry — the settings and references it was rendered with."
      size="lg"
      testId="scene-take-provenance"
    >
      {still ? (
        <ProvenanceList
          rows={galleryEntryProvenance(still, { castName, madeWith: 'Scene' })}
          testId="scene-take-provenance-still"
        />
      ) : (
        <p
          className="type-caption text-[var(--text-muted)]"
          data-testid="scene-take-provenance-missing"
        >
          This browser no longer has this take’s Gallery entry, so only the picture is known. (A
          server copy, when storage sync is on, may still have it.)
        </p>
      )}
      {take?.clipUrl ? (
        <div className="mt-4 space-y-2">
          <h3 className="type-caption font-medium">Its clip</h3>
          {clip ? (
            <ProvenanceList
              rows={galleryEntryProvenance(clip, { castName, madeWith: 'Scene clip' })}
              testId="scene-take-provenance-clip"
            />
          ) : (
            <p className="type-caption text-[var(--text-muted)]">
              The clip’s Gallery entry isn’t in this browser.
            </p>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
