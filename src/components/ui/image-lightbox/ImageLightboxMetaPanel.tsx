'use client';

import { Button } from '@/components/ui/Button';
import { chromeBtn } from '@/components/ui/image-lightbox/chromeBtn';
import type { ImageLightboxSlideMeta } from '@/components/ui/image-lightbox/types';

export type ImageLightboxMetaPanelProps = {
  compact?: boolean;
  metaOpen: boolean;
  meta?: ImageLightboxSlideMeta | null;
  onNoteChange?: (note: string) => void;
  onCopyPrompt?: () => void;
  onCopyNegative?: () => void;
  note?: string;
  noteDraft: string;
  onNoteDraftChange: (value: string) => void;
  preferFullRes: boolean;
  hasDistinctFullRes: boolean;
  fullResLoading: boolean;
  copyFlash: string | null;
  flashCopy: (label: string) => void;
};

export default function ImageLightboxMetaPanel({
  compact = false,
  metaOpen,
  meta,
  onNoteChange,
  onCopyPrompt,
  onCopyNegative,
  note,
  noteDraft,
  onNoteDraftChange,
  preferFullRes,
  hasDistinctFullRes,
  fullResLoading,
  copyFlash,
  flashCopy,
}: ImageLightboxMetaPanelProps) {
  if (!metaOpen || (!meta && !onNoteChange)) {
    return null;
  }

  const dims =
    meta?.width && meta?.height
      ? `${meta.width}×${meta.height}`
      : meta?.width || meta?.height || undefined;
  const chips = meta
    ? ([
        meta.tool ? `Tool ${meta.tool}` : null,
        meta.model ? `Model ${meta.model}` : null,
        meta.seed != null && meta.seed !== '' ? `Seed ${meta.seed}` : null,
        meta.cfg != null && meta.cfg !== '' ? `CFG ${meta.cfg}` : null,
        meta.steps != null && meta.steps !== '' ? `Steps ${meta.steps}` : null,
        dims ? dims : null,
        meta.derivedKind ? meta.derivedKind : null,
        meta.host ? `Host ${meta.host}` : null,
        meta.usedIn ? `Used in ${meta.usedIn}` : null,
        meta.needsLook ? `Needs a look: ${meta.needsLook}` : null,
        preferFullRes ? 'Viewing full-res' : hasDistinctFullRes ? 'Viewing mid-res' : null,
        fullResLoading ? 'Loading full-res…' : null,
      ].filter(Boolean) as string[])
    : [];

  return (
    <div
      className="ui-lightbox-panel max-h-[40vh] space-y-2 overflow-y-auto p-3"
      data-immersive={compact ? 'true' : undefined}
    >
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map(chip => (
            <span
              key={chip}
              className={`rounded-md px-2 py-0.5 text-[11px] ${
                compact
                  ? 'bg-white/10 text-white/80'
                  : 'bg-[var(--bg-muted)] text-[var(--text-muted)]'
              }`}
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}
      {meta?.prompt ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p
              className={`type-overline ${compact ? 'text-white/45' : 'text-[var(--text-tertiary)]'}`}
            >
              Prompt
            </p>
            {onCopyPrompt ? (
              <Button
                variant={compact ? 'ghost' : 'secondary'}
                className={chromeBtn(compact)}
                onClick={() => {
                  onCopyPrompt();
                  flashCopy('Prompt copied');
                }}
              >
                Copy
              </Button>
            ) : null}
          </div>
          <p
            className={`max-h-28 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed ${
              compact ? 'text-white/85' : 'text-[var(--text-secondary)]'
            }`}
          >
            {meta.prompt}
          </p>
        </div>
      ) : null}
      {meta?.negativePrompt ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p
              className={`type-overline ${compact ? 'text-white/45' : 'text-[var(--text-tertiary)]'}`}
            >
              Negative
            </p>
            {onCopyNegative ? (
              <Button
                variant={compact ? 'ghost' : 'secondary'}
                className={chromeBtn(compact)}
                onClick={() => {
                  onCopyNegative();
                  flashCopy('Negative copied');
                }}
              >
                Copy
              </Button>
            ) : null}
          </div>
          <p
            className={`max-h-20 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed ${
              compact ? 'text-white/70' : 'text-[var(--text-muted)]'
            }`}
          >
            {meta.negativePrompt}
          </p>
        </div>
      ) : null}
      {onNoteChange ? (
        <div className="space-y-1">
          <p
            className={`type-overline ${compact ? 'text-white/45' : 'text-[var(--text-tertiary)]'}`}
          >
            Review note
          </p>
          <textarea
            value={noteDraft}
            onChange={event => onNoteDraftChange(event.target.value)}
            onBlur={() => {
              if ((note ?? '') !== noteDraft.trim()) {
                onNoteChange(noteDraft);
              }
            }}
            rows={3}
            placeholder="Quick note for this output…"
            className={`w-full resize-y rounded-lg border px-2.5 py-2 text-[12px] leading-relaxed outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
              compact
                ? 'border-white/15 bg-black/40 text-white placeholder:text-white/35'
                : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] placeholder:text-[var(--text-muted)]'
            }`}
          />
        </div>
      ) : null}
      {copyFlash ? (
        <p
          className={`type-caption ${compact ? 'text-[var(--tint-success-text)]' : 'text-[var(--tint-success-text)]/90'}`}
        >
          {copyFlash}
        </p>
      ) : null}
    </div>
  );
}
