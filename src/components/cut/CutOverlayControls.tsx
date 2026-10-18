'use client';

/**
 * Cut overlays (cut-overlay.ts): the film's logo / watermark, and a shot's lower third and
 * picture-in-picture (the shot list's "Overlay…").
 */

import { useRef, useState } from 'react';
import type { FilmCutOptionsValue } from '@/components/FilmCutOptionsControls';
import { Button } from '@/components/ui/Button';
import { OptionRow } from '@/components/cut/CutOptionParts';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import { OVERLAY_CORNERS, type OverlayCorner } from '@/lib/cut-overlay';
import type { CutShotEdit } from '@/lib/film-cut-plan';

const field =
  'rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[var(--text-primary)]';

/** A small picture as a data URL (overlays travel with the cut; kept under ~1.5 MB). */
async function pictureDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick a picture (PNG, JPEG or WebP).');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // PNG keeps a logo's transparency.
  return canvas.toDataURL('image/png');
}

function CornerSelect({
  value,
  onChange,
  disabled,
  label,
  testId,
}: {
  value: OverlayCorner;
  onChange: (corner: OverlayCorner) => void;
  disabled?: boolean;
  label: string;
  testId: string;
}) {
  return (
    <select
      aria-label={label}
      disabled={disabled}
      className={`${field} type-caption`}
      value={value}
      onChange={event => onChange(event.target.value as OverlayCorner)}
      data-testid={testId}
    >
      {OVERLAY_CORNERS.map(corner => (
        <option key={corner.id} value={corner.id}>
          {corner.label}
        </option>
      ))}
    </select>
  );
}

function PictureButton({
  label,
  variant = 'secondary',
  disabled,
  onPicked,
  onError,
  testId,
}: {
  label: string;
  variant?: 'secondary' | 'ghost';
  disabled?: boolean;
  onPicked: (url: string, name: string) => void;
  onError: (message: string) => void;
  testId: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={variant}
        disabled={disabled}
        onClick={() => ref.current?.click()}
        data-testid={testId}
      >
        {label}
      </Button>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        data-testid={`${testId}-file`}
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          void pictureDataUrl(file)
            .then(url => onPicked(url, file.name))
            .catch(err =>
              onError(err instanceof Error ? err.message : 'Could not use that picture.')
            );
        }}
      />
    </>
  );
}

/** The film's logo / watermark. */
export function CutLogoControl({
  value,
  onChange,
  disabled,
  testIdPrefix,
}: {
  value: FilmCutOptionsValue;
  onChange: (next: FilmCutOptionsValue) => void;
  disabled?: boolean;
  testIdPrefix: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const logo = value.logoUrl?.trim();
  return (
    <div className="grid gap-2">
      <OptionRow label="Logo" hint="A logo or watermark over the whole film">
        <span className="min-w-0 flex-1 truncate type-caption text-[var(--text-primary)]">
          {logo ? value.logoName || 'A picture' : 'None'}
        </span>
        <PictureButton
          label={logo ? 'Change' : 'Add'}
          variant="ghost"
          disabled={disabled}
          testId={`${testIdPrefix}-logo`}
          onError={setError}
          onPicked={(url, name) => {
            setError(null);
            onChange({ ...value, logoUrl: url, logoName: name });
          }}
        />
        {logo ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onChange({ ...value, logoUrl: undefined, logoName: undefined })}
          >
            Remove
          </Button>
        ) : null}
      </OptionRow>
      {logo ? (
        <OptionRow label="Corner">
          <CornerSelect
            label="Logo corner"
            value={value.logoCorner ?? 'br'}
            disabled={disabled}
            onChange={corner => onChange({ ...value, logoCorner: corner })}
            testId={`${testIdPrefix}-logo-corner`}
          />
        </OptionRow>
      ) : null}
      {error ? <p className="type-caption text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

/** A shot's lower third and picture-in-picture. */
export function CutShotOverlayEditor({
  edit,
  disabled,
  testId,
  onPatch,
}: {
  edit: CutShotEdit | undefined;
  disabled?: boolean;
  testId: string;
  onPatch: (patch: Partial<CutShotEdit>) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div
      className="mt-1 space-y-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] p-2"
      data-testid={testId}
    >
      <ToolActionRow>
        <input
          type="text"
          maxLength={60}
          disabled={disabled}
          placeholder="Lower third — a name or place"
          aria-label="Lower third"
          className={`${field} type-caption min-w-0 flex-1`}
          value={edit?.lowerThird ?? ''}
          onChange={event => onPatch({ lowerThird: event.target.value || undefined })}
          data-testid={`${testId}-lower`}
        />
        <input
          type="text"
          maxLength={60}
          disabled={disabled}
          placeholder="Smaller line (optional)"
          aria-label="Lower third, second line"
          className={`${field} type-caption min-w-0 flex-1`}
          value={edit?.lowerThirdSub ?? ''}
          onChange={event => onPatch({ lowerThirdSub: event.target.value || undefined })}
          data-testid={`${testId}-lower-sub`}
        />
      </ToolActionRow>
      <ToolActionRow>
        <PictureButton
          label={edit?.pipUrl ? 'Change corner picture' : 'Picture in a corner'}
          disabled={disabled}
          testId={`${testId}-pip`}
          onError={setError}
          onPicked={url => {
            setError(null);
            onPatch({ pipUrl: url, pipCorner: edit?.pipCorner ?? 'tr' });
          }}
        />
        {edit?.pipUrl ? (
          <>
            <CornerSelect
              label="Corner"
              value={edit.pipCorner ?? 'tr'}
              disabled={disabled}
              onChange={corner => onPatch({ pipCorner: corner })}
              testId={`${testId}-pip-corner`}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onPatch({ pipUrl: undefined, pipCorner: undefined })}
            >
              Remove picture
            </Button>
          </>
        ) : null}
      </ToolActionRow>
      {error ? <p className="type-caption text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
