'use client';

import { ChipButton } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { LlmCatalogEntry, SessionLlmProvider } from '@/lib/llm-providers';
import {
  SessionLlmModelSelect,
  TEMP_PRESETS,
  type ServerLlmSnapshot,
} from '@/components/settings/panels/llm-panel-shared';

export type LlmModelDefaultsPanelProps = {
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  server?: ServerLlmSnapshot | null;
  sessionProvider: SessionLlmProvider;
  catalogForSelect: LlmCatalogEntry[];
  catalogLoading: boolean;
  catalogError?: string;
};

export default function LlmModelDefaultsPanel({
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  server,
  sessionProvider,
  catalogForSelect,
  catalogLoading,
  catalogError,
}: LlmModelDefaultsPanelProps) {
  const tempOverride = sharedSettings.sessionLlmTemperature;
  const fallbackOverride = sharedSettings.sessionAllowTemplateFallback;

  return (
    <ToolSection title="Model defaults" id="settings-llm-models">
      <SessionLlmModelSelect
        label="Session text model override"
        value={sharedSettings.sessionLlmModel ?? ''}
        serverDefault={sessionProvider === 'server' ? server?.model : undefined}
        entries={catalogForSelect}
        loading={catalogLoading}
        disabled={!sharedMounted}
        error={catalogError}
        emptyLabel={
          sessionProvider === 'server'
            ? server?.model
              ? `Server default (${server.model})`
              : 'Server default'
            : 'Select a model'
        }
        onChange={sessionLlmModel => updateSharedSettings({ sessionLlmModel })}
      />

      <SessionLlmModelSelect
        label="Session vision model override"
        value={sharedSettings.sessionLlmVisionModel ?? ''}
        serverDefault={sessionProvider === 'server' ? server?.visionModel : undefined}
        entries={catalogForSelect}
        loading={catalogLoading}
        disabled={!sharedMounted}
        error={catalogError}
        emptyLabel={
          sessionProvider === 'server'
            ? server?.visionModel
              ? `Server default (${server.visionModel})`
              : 'Server default'
            : 'Select a vision model'
        }
        onChange={sessionLlmVisionModel => updateSharedSettings({ sessionLlmVisionModel })}
      />

      <SessionLlmModelSelect
        label="Session embed model override"
        value={sharedSettings.sessionLlmEmbedModel ?? ''}
        serverDefault={sessionProvider === 'server' ? server?.embedModel : undefined}
        entries={catalogForSelect}
        loading={catalogLoading}
        disabled={!sharedMounted}
        error={catalogError}
        emptyLabel={
          sessionProvider === 'server'
            ? server?.embedModel
              ? `Server default (${server.embedModel})`
              : 'Server default'
            : 'Select an embed model (optional)'
        }
        onChange={sessionLlmEmbedModel => updateSharedSettings({ sessionLlmEmbedModel })}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>LLM temperature</span>
          <span className="font-medium text-[var(--text-primary)]">
            {typeof tempOverride === 'number' ? tempOverride.toFixed(2) : 'server default'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TEMP_PRESETS.map(preset => (
            <ChipButton
              key={preset.label}
              active={
                typeof tempOverride === 'number' && Math.abs(tempOverride - preset.value) < 0.001
              }
              disabled={!sharedMounted}
              title={preset.hint}
              onClick={() => updateSharedSettings({ sessionLlmTemperature: preset.value })}
            >
              {preset.label}
            </ChipButton>
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={tempOverride ?? 1}
          onChange={event =>
            updateSharedSettings({
              sessionLlmTemperature: Number(event.target.value),
            })
          }
          disabled={!sharedMounted}
          className="h-2 w-full accent-[var(--accent)]"
        />
        <div className="flex justify-between text-xs text-[var(--text-muted)]">
          <span>0 · focused</span>
          <span>1</span>
          <span>2 · wild</span>
        </div>
        {typeof tempOverride === 'number' ? (
          <button
            type="button"
            disabled={!sharedMounted}
            onClick={() => updateSharedSettings({ sessionLlmTemperature: undefined })}
            className="text-xs text-[var(--accent-text)] hover:underline disabled:opacity-50"
          >
            Reset temperature to server default
          </button>
        ) : null}
      </div>

      <fieldset className="space-y-2">
        <legend className="type-caption text-[var(--text-muted)]">
          Template fallback when LLM fails
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { value: undefined, label: 'Server default' },
              { value: true, label: 'Force allow' },
              { value: false, label: 'Force disable' },
            ] as const
          ).map(option => (
            <ChipButton
              key={String(option.value)}
              active={fallbackOverride === option.value}
              disabled={!sharedMounted}
              onClick={() =>
                updateSharedSettings({
                  sessionAllowTemplateFallback: option.value,
                })
              }
            >
              {option.label}
            </ChipButton>
          ))}
        </div>
        <p className="type-caption text-[var(--text-muted)]">
          Generators may use template output if the LLM errors or times out.
        </p>
      </fieldset>
    </ToolSection>
  );
}
