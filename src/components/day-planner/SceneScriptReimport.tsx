'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { FieldError } from '@/components/ui/Field';
import UploadButton from '@/components/ui/UploadButton';
import { SCRIPT_SOURCE_MAX, type SavedScript } from '@/lib/day/scene-scripts';
import { applyReimport, reconcileScript, type ReimportStatus } from '@/lib/day/script-reimport';
import { parseScript, type ParsedScript } from '@/lib/script/parse';

const STATUS_LABELS: Record<ReimportStatus, string> = {
  same: 'Same',
  changed: 'Changed',
  new: 'New',
  removed: 'Removed',
};

const STATUS_TONES: Record<ReimportStatus, string> = {
  same: 'text-[var(--text-muted)]',
  changed: '',
  new: 'ui-status-success',
  removed: 'ui-status-danger',
};

/**
 * Import a new version of a script (M3 S6): see, scene by scene, what is the same, changed, new
 * or removed — and what happens to each scene's shots — before the text is replaced. A shot that
 * became a Scene is never dropped; a removed scene's planned shots go only when ticked.
 */
export default function SceneScriptReimport({
  script,
  parsed,
  madeSceneIds,
  onApply,
  onClose,
}: {
  script: SavedScript;
  parsed: ParsedScript;
  /** Scenes that still exist (a shot made into one of them is kept whatever happens). */
  madeSceneIds: ReadonlySet<string>;
  onApply: (next: SavedScript) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [drop, setDrop] = useState<ReadonlySet<string>>(new Set());
  const next = useMemo(() => (text.trim() ? parseScript(text) : null), [text]);
  const rows = useMemo(
    () => (next ? reconcileScript(parsed, next, script.shots, madeSceneIds) : []),
    [madeSceneIds, next, parsed, script.shots]
  );
  const tooLong = text.length > SCRIPT_SOURCE_MAX;
  const counts = rows.reduce<Record<ReimportStatus, number>>(
    (sum, row) => ({ ...sum, [row.status]: sum[row.status] + 1 }),
    { same: 0, changed: 0, new: 0, removed: 0 }
  );

  const apply = async () => {
    if (!next || tooLong) return;
    const removedWithShots = rows.filter(row => row.status === 'removed' && row.shots);
    if (removedWithShots.length || counts.changed) {
      const ok = await confirmAction({
        title: `Replace “${script.name}” with this version?`,
        body: [
          `${counts.changed} changed, ${counts.new} new, ${counts.removed} removed.`,
          removedWithShots.length
            ? 'Shots of removed scenes that became Scenes stay, listed as no longer in the script.'
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        confirmLabel: 'Replace script',
      });
      if (!ok) return;
    }
    onApply(
      applyReimport(script, text.replace(/\r\n?/g, '\n'), rows, {
        dropPlanned: drop,
        madeSceneIds,
      })
    );
  };

  return (
    <div
      className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] p-2"
      data-testid="script-reimport"
    >
      <p className="type-caption text-[var(--text-muted)]">
        Paste or upload the new version. Nothing changes until you replace it: scenes are matched by
        their id, else by heading, and their shots go with them.
      </p>
      <textarea
        aria-label="New version of the script"
        className="h-36 w-full rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2 font-mono text-xs"
        value={text}
        data-testid="script-reimport-text"
        onChange={event => setText(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <UploadButton
          label="Upload a file…"
          accept=".fountain,.spmd,.txt,.md,text/plain"
          testId="script-reimport-file"
          onFile={file => void file.text().then(value => setText(value))}
        />
        <Button
          size="sm"
          variant="primary"
          disabled={!next || tooLong}
          data-testid="script-reimport-apply"
          onClick={() => void apply()}
        >
          Replace with this version
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {tooLong ? (
        <FieldError>
          That version is too long to keep ({text.length.toLocaleString()} characters; at most{' '}
          {SCRIPT_SOURCE_MAX.toLocaleString()}).
        </FieldError>
      ) : null}
      {rows.length ? (
        <>
          <p className="type-caption" data-testid="script-reimport-summary">
            {counts.same} same · {counts.changed} changed · {counts.new} new · {counts.removed}{' '}
            removed
          </p>
          <ul className="space-y-1">
            {rows.map(row => {
              const planned = row.shots - row.made;
              const key = row.oldId ?? row.newId ?? row.heading;
              return (
                <li
                  key={`${row.status}-${key}`}
                  className="flex flex-wrap items-center gap-2 text-sm"
                  data-testid={`script-reimport-row-${key}`}
                  data-status={row.status}
                >
                  <span className={`type-caption w-16 font-medium ${STATUS_TONES[row.status]}`}>
                    {STATUS_LABELS[row.status]}
                  </span>
                  <span className="min-w-0 flex-1">
                    {row.heading || key}
                    {row.byHeading ? (
                      <span className="type-caption text-[var(--text-muted)]">
                        {' '}
                        (heading changed — matched by heading)
                      </span>
                    ) : null}
                  </span>
                  {row.shots ? (
                    <span className="type-caption text-[var(--text-muted)]">
                      {row.status === 'removed'
                        ? [
                            row.made
                              ? `${row.made} shot${row.made === 1 ? '' : 's'} made into Scenes stay`
                              : '',
                            planned && !drop.has(row.oldId!)
                              ? `${planned} planned shot${planned === 1 ? '' : 's'} kept`
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : `${row.shots} shot${row.shots === 1 ? '' : 's'} go with it`}
                    </span>
                  ) : null}
                  {row.status === 'removed' && planned > 0 ? (
                    <label className="type-caption flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={drop.has(row.oldId!)}
                        data-testid={`script-reimport-drop-${row.oldId}`}
                        onChange={event => {
                          const nextDrop = new Set(drop);
                          if (event.target.checked) nextDrop.add(row.oldId!);
                          else nextDrop.delete(row.oldId!);
                          setDrop(nextDrop);
                        }}
                      />
                      Drop its {planned} planned shot{planned === 1 ? '' : 's'}
                    </label>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
