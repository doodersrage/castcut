'use client';

import { useEffect, useState, type DragEvent } from 'react';
import { MOODBOARD_TILE_ROLES, type MoodboardTile } from '@/lib/moodboard-scene';

function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter(file => file.type.startsWith('image/'));
}

/**
 * The whole board at a glance: every tile as a thumbnail (role + label), an add slot, and a
 * drop target — drag images in or paste one (Ctrl/⌘+V) and each becomes a tile.
 */
export default function LookTileBoard({
  tiles,
  activeTileId,
  maxTiles,
  busy = false,
  uploadingTileId = null,
  compact = false,
  onSelect,
  onAdd,
  onFiles,
}: {
  tiles: MoodboardTile[];
  activeTileId: string | null;
  maxTiles: number;
  busy?: boolean;
  uploadingTileId?: string | null;
  compact?: boolean;
  onSelect: (tileId: string) => void;
  onAdd: () => void;
  onFiles: (files: File[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const full = tiles.length >= maxTiles;

  // Paste anywhere on the page adds the image — unless the board is full or busy.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = imageFiles(event.clipboardData?.files);
      if (files.length === 0 || busy || full) {
        return;
      }
      event.preventDefault();
      onFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [busy, full, onFiles]);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = imageFiles(event.dataTransfer?.files);
    if (files.length > 0 && !busy) {
      onFiles(files);
    }
  };

  return (
    <div
      data-testid="look-tile-board"
      data-dragging={dragging ? 'true' : 'false'}
      className={`rounded-[var(--radius-md)] border-2 border-dashed p-2 transition-colors ${
        dragging ? 'border-[var(--accent-border)] bg-[var(--accent-muted)]' : 'border-transparent'
      }`}
      onDragOver={event => {
        if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <ul className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {tiles.map((tile, index) => {
          const role = MOODBOARD_TILE_ROLES.find(entry => entry.id === tile.role)?.label ?? 'Other';
          const selected = tile.id === activeTileId;
          const uploading = uploadingTileId === tile.id;
          return (
            <li key={tile.id}>
              <button
                type="button"
                disabled={busy}
                aria-pressed={selected}
                aria-label={`Edit tile ${index + 1}: ${role}${tile.label ? ` — ${tile.label}` : ''}`}
                data-testid={`look-tile-${index}`}
                onClick={() => onSelect(tile.id)}
                className={`block w-full overflow-hidden rounded-[var(--radius-md)] border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                  selected
                    ? 'border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]'
                    : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                }`}
              >
                <span className="flex aspect-[4/3] items-center justify-center bg-[var(--bg-muted)]">
                  {tile.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tile.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="type-caption px-2 text-center text-[var(--text-muted)]">
                      {uploading ? 'Uploading…' : tile.notes?.trim() ? 'Notes only' : 'No image'}
                    </span>
                  )}
                </span>
                <span className="block px-2 py-1.5">
                  <span className="type-overline block text-[var(--accent-text)]">{role}</span>
                  <span className="type-caption block truncate text-[var(--text-secondary)]">
                    {tile.label?.trim() || tile.notes?.trim() || `Tile ${index + 1}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {!full ? (
          <li>
            <button
              type="button"
              disabled={busy}
              data-testid="look-tile-add"
              onClick={onAdd}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] text-[var(--text-muted)] hover:border-[var(--accent-border)] hover:text-[var(--accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              <span className="text-lg leading-none">+</span>
              <span className="type-caption">Add tile</span>
            </button>
          </li>
        ) : null}
      </ul>
      <p className="type-caption mt-2 text-[var(--text-muted)]">
        {full
          ? `Board is full (${maxTiles} tiles) — remove one to add another.`
          : compact
            ? 'Tap Add tile for each reference — its role is suggested when a vision model is set up.'
            : 'Drop images here or paste one (Ctrl/⌘+V) — each becomes a tile (with a suggested role when a vision model is set up).'}
      </p>
    </div>
  );
}
