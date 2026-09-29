'use client';

import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import type { SettingsComfyConnectionPanelProps } from '@/components/settings/panels/settings-comfy-connection-types';

type Props = Pick<
  SettingsComfyConnectionPanelProps,
  | 'settings'
  | 'addCustomToken'
  | 'updateCustomToken'
  | 'removeCustomToken'
  | 'handleComfyUiSectionJump'
>;

export function SettingsComfyConnectionCustomTokensSection({
  settings,
  addCustomToken,
  updateCustomToken,
  removeCustomToken,
  handleComfyUiSectionJump,
}: Props) {
  // Custom tokens apply in server-default mode too (see comfyui-settings runtime), so they stay
  // editable there.

  return (
    <CollapsibleSection
      title="Custom tokens"
      summary="Named {{TOKEN}} placeholders for workflow injection."
      defaultOpen={false}
      persistKey="settings-custom-tokens-lora"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--text-secondary)]">Custom workflow tokens</p>
          <button type="button" onClick={addCustomToken} className="type-caption ui-text-link">
            Add token
          </button>
        </div>
        {(settings.customTokens ?? []).length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            Optional placeholders like <code className="ui-inline-code">{'{{CHECKPOINT}}'}</code> or{' '}
            <code className="ui-inline-code">{'{{LORA}}'}</code>. LoRA files live in the{' '}
            <button
              type="button"
              onClick={() => handleComfyUiSectionJump('lora-library')}
              className="ui-text-link"
            >
              LoRA library
            </button>{' '}
            section.
          </p>
        ) : (
          <ul className="space-y-2">
            {(settings.customTokens ?? []).map((entry, index) => (
              <li
                key={`${entry.token}-${index}`}
                className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
              >
                <input
                  value={entry.token}
                  onChange={event => updateCustomToken(index, { token: event.target.value })}
                  placeholder="{{CHECKPOINT}}"
                  className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
                />
                <input
                  value={entry.value}
                  onChange={event => updateCustomToken(index, { value: event.target.value })}
                  placeholder="flux1-dev.safetensors"
                  className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                />
                <button
                  type="button"
                  onClick={() => removeCustomToken(index)}
                  className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:border-[var(--tint-danger-border)] hover:text-[var(--tint-danger-text)]"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CollapsibleSection>
  );
}
