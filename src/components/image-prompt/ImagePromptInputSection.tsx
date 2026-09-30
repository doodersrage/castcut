'use client';

import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import TurboEditStrengthControls from '@/components/TurboEditStrengthControls';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { isBooguEditModel, isZImageModel } from '@/lib/model-denoise-defaults';
import { isKleinDistilledModel } from '@/lib/model-sampler-defaults';
import { normalizeTurboEditStrength } from '@/lib/turbo-edit-strength';
import {
  IMAGE_PROMPT_DESCRIPTION_PRESETS,
  type ImagePromptDescriptionPreset,
} from '@/lib/image-prompt-presets';
import type { ImagePromptFocus } from '@/lib/specialized/types';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { ToolSection, accentButtonClass, accentFocusClass } from '@/components/ui/ToolPageShell';
import { FieldDivider, FieldError, FieldLabel, TextArea, ChipButton } from '@/components/ui/Field';
import {
  DESCRIPTION_FOCUS_LABEL,
  DESCRIPTION_PRESET_LABEL,
  EXTRA_HINTS_LABEL,
} from '@/lib/tool-ui-labels';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import type { useImagePromptToolOrchestration } from '@/hooks/useImagePromptToolOrchestration';

const ACCENT = 'fuchsia' as const;

type ImagePromptInputSectionProps = Pick<
  ReturnType<typeof useImagePromptToolOrchestration>,
  | 'mounted'
  | 'shared'
  | 'toolSettings'
  | 'updateShared'
  | 'updateToolSettings'
  | 'refImages'
  | 'setRefImages'
  | 'loading'
  | 'error'
  | 'selectedPreset'
  | 'addRefImage'
  | 'removeRefImage'
  | 'onFileChange'
  | 'generate'
>;

export default function ImagePromptInputSection({
  mounted,
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  refImages,
  setRefImages,
  loading,
  error,
  selectedPreset,
  addRefImage,
  removeRefImage,
  onFileChange,
  generate,
}: ImagePromptInputSectionProps) {
  return (
    <>
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.imagePrompt} />
      <EditToolRecipeStrip
        toolId="imagePrompt"
        shared={shared}
        onApplied={next => updateShared(next)}
      />
      <HistoryHintSeedPanel
        tool="imagePrompt"
        hintSource={normalizeSceneHintSource(toolSettings.hintSource)}
        historySeedScope={normalizeHistorySeedScope(toolSettings.historySeedScope)}
        hints={toolSettings.extraHints ?? ''}
        randomTheme={toolSettings.randomTheme ?? ''}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={source => updateToolSettings({ hintSource: source })}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={value => updateToolSettings({ extraHints: value })}
        onRandomThemeChange={theme => updateToolSettings({ randomTheme: theme })}
        onHistorySeedApplied={result =>
          updateToolSettings({
            extraHints: result.hints,
            lastHistorySeedEntryId: result.entryId,
            hintSource: 'history',
          })
        }
        accentFocusClassName={accentFocusClass(ACCENT)}
      />
      <ToolSection>
        {isBooguEditModel(shared.model) ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Boogu Edit queues as instruction TI2I (TextEncodeBooguEdit, denoise 1). Keep the prompt
            to a short edit — Turbo rewrites too much from a full scene essay. Vision caption above
            is separate from the ComfyUI stack.
          </p>
        ) : isZImageModel(shared.model) ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Z-Image queues as VAEEncode img2img. Turbo uses a soft denoise so identity holds — pick
            Gentle / Balanced / Strong below. Vision caption above is separate from the ComfyUI
            stack.
          </p>
        ) : isKleinDistilledModel(shared.model) ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Klein Distilled queues as ReferenceLatent instruction edit (denoise 1, 4-step CFG 1).
            Keep the prompt to a short edit and pick Gentle / Balanced / Strong. Vision caption
            above is separate from the ComfyUI stack.
          </p>
        ) : null}
        <TurboEditStrengthControls
          model={shared.model}
          tool="imagePrompt"
          value={normalizeTurboEditStrength(shared.turboEditStrength)}
          onChange={turboEditStrength => updateShared({ turboEditStrength })}
        />
        <FieldLabel>Upload images (up to 4)</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={e => onFileChange(e.target.files?.[0] ?? null)}
            className="ui-file-input block min-w-[14rem] flex-1"
          />
          <ButtonLink href={galleryPickPath('imagePrompt')} variant="secondary" size="sm">
            Choose from Gallery
          </ButtonLink>
        </div>
        {refImages.length > 0 && refImages.length < 4 ? (
          <label className="mt-2 block text-sm text-[var(--text-muted)]">
            Add another reference
            <input
              type="file"
              accept="image/*"
              className="ui-file-input mt-1 w-full"
              onChange={event => {
                const next = event.target.files?.[0];
                if (next) {
                  addRefImage(next);
                }
                event.target.value = '';
              }}
            />
          </label>
        ) : null}
        {refImages.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {refImages.map(entry => (
              <li key={entry.id} className="ui-surface-inset space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    value={entry.role}
                    onChange={event =>
                      setRefImages(previous =>
                        previous.map(item =>
                          item.id === entry.id ? { ...item, role: event.target.value } : item
                        )
                      )
                    }
                    className="ui-input min-w-0 flex-1 px-(--input-padding-x) py-1 type-caption"
                    placeholder="Reference role"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => removeRefImage(entry.id)}
                  >
                    Remove
                  </Button>
                </div>

                <div className="grid grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-1">
                  <span className="type-caption text-[var(--text-muted)]">Strength</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(entry.strength * 100)}
                    onChange={event =>
                      setRefImages(previous =>
                        previous.map(item =>
                          item.id === entry.id
                            ? { ...item, strength: Number(event.target.value) / 100 }
                            : item
                        )
                      )
                    }
                    aria-label={`Strength for ${entry.role}`}
                    className="h-8 w-full min-w-0 cursor-pointer accent-[var(--accent)]"
                  />
                  <span className="text-right text-xs tabular-nums text-[var(--text-secondary)]">
                    {Math.round(entry.strength * 100)}%
                  </span>
                </div>

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={entry.previewUrl}
                  alt={entry.role}
                  className="max-h-48 rounded-lg border border-[var(--border-subtle)] object-contain"
                />
              </li>
            ))}
          </ul>
        ) : null}

        <FieldDivider />

        <FieldLabel hint="Choose how much emphasis the vision model puts on different visible details.">
          {DESCRIPTION_PRESET_LABEL}
        </FieldLabel>
        <div className="flex flex-wrap gap-2">
          {IMAGE_PROMPT_DESCRIPTION_PRESETS.map(preset => (
            <ChipButton
              key={preset.id}
              active={(toolSettings.descriptionPreset ?? 'standard') === preset.id}
              onClick={() =>
                updateToolSettings({
                  descriptionPreset: preset.id as ImagePromptDescriptionPreset,
                })
              }
            >
              {preset.label}
            </ChipButton>
          ))}
        </div>
        <p className="type-caption">{selectedPreset.summary}</p>
        {selectedPreset.suggestedDetail && selectedPreset.suggestedDetail !== shared.detail ? (
          <p className="type-caption text-[var(--accent-text)]">
            Works best with{' '}
            <strong className="font-medium capitalize">{selectedPreset.suggestedDetail}</strong>{' '}
            detail in the sidebar.
          </p>
        ) : null}

        <FieldDivider />

        <FieldLabel>{DESCRIPTION_FOCUS_LABEL}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { label: 'Full image', value: 'full' },
              { label: 'Subject', value: 'subject' },
              { label: 'Background', value: 'background' },
              { label: 'Style', value: 'style' },
            ] as const
          ).map(option => (
            <ChipButton
              key={option.value}
              active={(toolSettings.focus ?? 'full') === option.value}
              onClick={() => updateToolSettings({ focus: option.value as ImagePromptFocus })}
            >
              {option.label}
            </ChipButton>
          ))}
        </div>

        <FieldDivider />

        <FieldLabel>{EXTRA_HINTS_LABEL}</FieldLabel>
        <TextArea
          value={toolSettings.extraHints ?? ''}
          onChange={e => {
            const value = e.target.value;
            updateToolSettings({ extraHints: value });
            rememberDraftFields({
              toolKey: 'image-prompt',
              label: 'Image → Prompt',
              href: '/image-prompt',
              fields: [value],
            });
          }}
          placeholder="e.g. two cyclists side by side, gravel bikes, helmets on"
          rows={2}
          className={accentFocusClass(ACCENT)}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          data-action="primary-generate"
          onClick={() => void generate()}
          disabled={!mounted || refImages.length === 0}
          loading={loading}
          loadingLabel="Analyzing image"
        >
          Generate prompt from image
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>
    </>
  );
}
