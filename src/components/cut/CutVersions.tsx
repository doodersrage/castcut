'use client';

/** Versions of the cut: save the edit under a name, open another, delete one. */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { CutVersion } from '@/lib/film/cut-room';

export default function CutVersions({
  versions,
  disabled,
  onSave,
  onOpen,
  onDelete,
}: {
  versions: CutVersion[];
  disabled?: boolean;
  onSave: (name: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="space-y-2" data-testid="cut-versions">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          maxLength={60}
          placeholder={`Version ${versions.length + 1}`}
          aria-label="Name for this version"
          className="min-w-[10rem] flex-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-sm text-[var(--text-primary)]"
          value={name}
          data-testid="cut-version-name"
          onChange={event => setName(event.target.value)}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          data-testid="cut-version-save"
          onClick={() => {
            const label = name.trim() || `Version ${versions.length + 1}`;
            onSave(label);
            setName('');
            setNote(`Saved “${label}”.`);
          }}
        >
          Save this version
        </Button>
      </div>
      {note ? (
        <p className="type-caption text-[var(--text-muted)]" role="status">
          {note}
        </p>
      ) : null}
      {versions.length > 0 ? (
        <ul className="divide-y divide-[var(--border-subtle)] rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
          {versions.map(version => (
            <li
              key={version.id}
              className="flex items-center gap-2 px-2 py-1.5 text-sm"
              data-testid={`cut-version-${version.name}`}
            >
              <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">
                {version.name}
                <span className="ml-2 text-xs text-[var(--text-muted)]">
                  {new Date(version.savedAt).toLocaleString()}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                data-testid={`cut-version-open-${version.name}`}
                onClick={() => {
                  onOpen(version.id);
                  setNote(`Opened “${version.name}” — Undo goes back.`);
                }}
              >
                Open
              </Button>
              <button
                type="button"
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label={`Delete ${version.name}`}
                onClick={() => onDelete(version.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-caption text-[var(--text-muted)]">
          Keep more than one cut of the same shots — a long one, a 30 s one for Reels.
        </p>
      )}
    </div>
  );
}
