'use client';

import { normalizeControlNetMode, type ControlNetMode } from '@/lib/controlnet-prompt';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { ToolSection, CollapsibleSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { FieldLabel } from '@/components/ui/Field';
import { Button, ButtonLink } from '@/components/ui/Button';
import VisionScanButton from '@/components/VisionScanButton';
import {
  CONTROLNET_ACCENT,
  CONTROLNET_MODES,
} from '@/components/controlnet/controlnet-tool-shared';

type Props = {
  refFile: File | null;
  refPreview: string | null;
  scanning: boolean;
  handoffSourceImageUrl: string | null | undefined;
  extraRefFiles: Array<File | null>;
  extraRefPreviews: Array<string | null>;
  handoffControlImageUrls: Array<string | undefined>;
  slotStrengths: number[];
  setSlotStrengths: React.Dispatch<React.SetStateAction<number[]>>;
  slotModes: ControlNetMode[];
  setSlotModes: React.Dispatch<React.SetStateAction<ControlNetMode[]>>;
  onRefChange: (file: File | null) => void;
  scanWithVision: () => void | Promise<void>;
  onExtraRefChange: (index: number, file: File | null) => void;
};

export function ControlNetReferenceSection({
  refPreview,
  scanning,
  handoffSourceImageUrl,
  extraRefFiles,
  extraRefPreviews,
  handoffControlImageUrls,
  slotStrengths,
  setSlotStrengths,
  slotModes,
  setSlotModes,
  onRefChange,
  scanWithVision,
  onExtraRefChange,
}: Props) {
  return (
    <ToolSection title="Reference image (optional)">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept="image/*"
          onChange={event => onRefChange(event.target.files?.[0] ?? null)}
          className="ui-file-input min-w-[14rem] flex-1"
        />
        <ButtonLink href={galleryPickPath('controlnet')} variant="secondary" size="sm">
          Choose from Gallery
        </ButtonLink>
        <VisionScanButton
          disabled={!refPreview && !handoffSourceImageUrl}
          scanning={scanning}
          onClick={() => void scanWithVision()}
        />
      </div>
      <p className="mt-2 type-caption text-[var(--text-muted)]">
        Scan with vision fills Subject structure from the still.
      </p>
      {refPreview ? (
        <div className="mt-3 flex flex-wrap items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={refPreview}
            alt="ControlNet reference"
            className="max-h-48 rounded-lg border border-[var(--border-subtle)] object-contain"
          />
          <Button variant="ghost" onClick={() => onRefChange(null)}>
            Remove image
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          When uploaded, vision extracts structure and merges it with the selected ControlNet mode.
        </p>
      )}
      <CollapsibleSection
        title="Extra control images"
        summary="Optional stack for additional ControlNetApply chains."
        defaultOpen={false}
        persistKey="controlnet-extra-images"
      >
        <p className="type-caption text-[var(--text-muted)]">
          Second–fourth images append additional ControlNetApply chains at queue time.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map(index => {
            const slotIndex = index + 1;
            const hasImage = Boolean(extraRefFiles[index] || handoffControlImageUrls[slotIndex]);
            return (
              <div
                key={index}
                className="space-y-2 rounded-lg border border-[var(--border-subtle)]/70 p-2.5"
              >
                <FieldLabel>Control {slotIndex + 1}</FieldLabel>
                <input
                  type="file"
                  accept="image/*"
                  onChange={event => onExtraRefChange(index, event.target.files?.[0] ?? null)}
                  className="ui-file-input w-full text-xs"
                />
                {extraRefPreviews[index] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={extraRefPreviews[index]!}
                    alt={`Control ${slotIndex + 1}`}
                    className="max-h-28 rounded-lg border border-[var(--border-subtle)] object-contain"
                  />
                ) : null}
                {hasImage ? (
                  <>
                    <select
                      value={slotModes[slotIndex]}
                      onChange={event =>
                        setSlotModes(previous => {
                          const next = [...previous];
                          next[slotIndex] = normalizeControlNetMode(event.target.value);
                          return next;
                        })
                      }
                      className={`ui-input w-full px-2 py-1.5 text-xs ${accentFocusClass(CONTROLNET_ACCENT)}`}
                    >
                      {CONTROLNET_MODES.map(entry => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                    <FieldLabel htmlFor={`controlnet-strength-${slotIndex}`}>
                      Strength ({slotStrengths[slotIndex]!.toFixed(2)})
                    </FieldLabel>
                    <input
                      id={`controlnet-strength-${slotIndex}`}
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={slotStrengths[slotIndex]}
                      onChange={event =>
                        setSlotStrengths(previous => {
                          const next = [...previous];
                          next[slotIndex] = Number(event.target.value);
                          return next;
                        })
                      }
                      className={`w-full accent-[var(--accent)] ${accentFocusClass()}`}
                    />
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </CollapsibleSection>
    </ToolSection>
  );
}
