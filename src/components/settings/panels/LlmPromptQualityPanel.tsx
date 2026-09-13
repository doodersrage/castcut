'use client';

import { ChipButton } from '@/components/ui/Field';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { DETAIL_OPTIONS } from '@/components/settings/panels/llm-panel-shared';

export type LlmPromptQualityPanelProps = {
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  autoVisionTags?: boolean;
  onAutoVisionTagsChange?: (value: boolean) => void;
};

export default function LlmPromptQualityPanel({
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  autoVisionTags = true,
  onAutoVisionTagsChange,
}: LlmPromptQualityPanelProps) {
  const detail = sharedSettings.detail ?? 'balanced';

  return (
    <>
      <ToolSection title="Prompt quality">
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">Default prompt detail</p>
          <div className="flex flex-wrap gap-1.5">
            {DETAIL_OPTIONS.map(option => (
              <ChipButton
                key={option.id}
                active={detail === option.id}
                disabled={!sharedMounted}
                onClick={() => updateSharedSettings({ detail: option.id })}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
          <p className="type-caption text-[var(--text-muted)]">
            {DETAIL_OPTIONS.find(entry => entry.id === detail)?.hint}. Also available under ComfyUI
            → Prompt quality.
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={sharedSettings.autoFixRules !== false}
            disabled={!sharedMounted}
            onChange={event => updateSharedSettings({ autoFixRules: event.target.checked })}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentFocusClass()}`}
          />
          <span className="space-y-1">
            <span className="block font-medium text-[var(--text-primary)]">
              Auto-fix lint rule errors after generation
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Applies safe prompt-lint fixes (e.g. sport gear / duo consistency) when diagnostics
              report errors.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={sharedSettings.seedLlmWithIngredients !== false}
            disabled={!sharedMounted}
            onChange={event =>
              updateSharedSettings({
                seedLlmWithIngredients: event.target.checked,
              })
            }
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentFocusClass()}`}
          />
          <span className="space-y-1">
            <span className="block font-medium text-[var(--text-primary)]">
              Seed LLM with location & wardrobe ingredients
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              When on, generators inject rolled location / outfit / environment seeds and few-shot
              examples. Turn off for completionist local models — only your keywords or hints are
              sent.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={sharedSettings.alwaysIncludeClothing !== false}
            disabled={!sharedMounted}
            onChange={event =>
              updateSharedSettings({ alwaysIncludeClothing: event.target.checked })
            }
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentFocusClass()}`}
          />
          <span className="space-y-1">
            <span className="block font-medium text-[var(--text-primary)]">
              Always include clothing / wardrobe in people prompts
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Auto-rolls catalog outfits and appends clothing when hints omit outfit details.
              Independent of ingredient seeding — turn both off for keyword-only prompts.
            </span>
          </span>
        </label>
      </ToolSection>

      <ToolSection title="Vision LLM">
        <p className="text-sm text-[var(--text-muted)]">
          For the local server, set{' '}
          <code className="text-[var(--text-secondary)]">LLM_VISION_MODEL</code> in{' '}
          <code className="text-[var(--text-secondary)]">.env.local</code> (e.g.{' '}
          <code className="text-[var(--text-secondary)]">qwen3-vl:latest</code>). Hosted OpenRouter
          / Groq sessions need a vision model picked above — they do not use the server env id.
          Falls back to <code className="text-[var(--text-secondary)]">LLM_MODEL</code> when the env
          vision id is unset — text-only models will fail Image → Prompt, Refine critique, and
          gallery tagging. Restart the server after changing env.
        </p>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={autoVisionTags !== false}
            disabled={!onAutoVisionTagsChange}
            onChange={event => onAutoVisionTagsChange?.(event.target.checked)}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentFocusClass()}`}
          />
          <span className="space-y-1">
            <span className="block font-medium text-[var(--text-primary)]">
              Auto-tag completed gallery images
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              After ComfyUI jobs finish or you upload stills, run a light vision pass for searchable
              tags. Uploads with only a filename as the prompt also get a caption. Requires a
              vision-capable model.
            </span>
          </span>
        </label>
      </ToolSection>
    </>
  );
}
