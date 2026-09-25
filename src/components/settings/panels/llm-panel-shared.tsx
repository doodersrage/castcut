'use client';

import { useState } from 'react';
import { SelectInput } from '@/components/ui/Field';
import { accentFocusClass } from '@/components/ui/ToolPageShell';
import type { DetailLevel } from '@/lib/detail-level';
import {
  groupLlmCatalogEntries,
  type LlmCatalogEntry,
  type SessionLlmProvider,
} from '@/lib/llm-providers';

export const DETAIL_OPTIONS: Array<{ id: DetailLevel; label: string; hint: string }> = [
  { id: 'concise', label: 'Concise', hint: 'Short, dense prompts' },
  { id: 'balanced', label: 'Balanced', hint: 'Default length' },
  { id: 'rich', label: 'Rich', hint: 'Longer layered prose' },
];

export const CUSTOM_MODEL_VALUE = '__custom__';

export const TEMP_PRESETS: Array<{ label: string; value: number; hint: string }> = [
  { label: 'Focused', value: 0.4, hint: 'Tighter, more repeatable' },
  { label: 'Default', value: 0.95, hint: 'Matches typical server default' },
  { label: 'Creative', value: 1.35, hint: 'More variation / surprise' },
];

export type LlmCatalogResponse = {
  ok?: boolean;
  models?: string[];
  entries?: LlmCatalogEntry[];
  error?: string;
  source?: string;
  needsApiKey?: boolean;
};

export type ServerLlmSnapshot = {
  enabled?: boolean;
  ok?: boolean;
  model?: string;
  baseUrl?: string;
  error?: string;
  visionModel?: string;
  allowTemplateFallback?: boolean;
  serverTemperature?: string;
  embedModel?: string;
  inFlight?: number;
  maxInflight?: number;
  busy?: boolean;
  apiKeyConfigured?: boolean;
  visionModelConfigured?: boolean;
  visionModelDetected?: string;
};

export function catalogEntriesFromPayload(payload: LlmCatalogResponse): LlmCatalogEntry[] {
  if (Array.isArray(payload.entries)) {
    return payload.entries;
  }
  if (!Array.isArray(payload.models)) {
    return [];
  }
  return payload.models
    .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    .map(id => ({ id, kind: 'text' as const }));
}

export async function fetchLlmCatalog(
  provider: SessionLlmProvider,
  apiKey?: string
): Promise<LlmCatalogResponse> {
  const key = apiKey?.trim() ?? '';
  const response =
    provider === 'server'
      ? await fetch('/api/llm/models', { cache: 'no-store' })
      : await fetch('/api/llm/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            provider,
            ...(key ? { apiKey: key } : {}),
          }),
        });
  return (await response.json()) as LlmCatalogResponse;
}

export function formatCatalogSource(source: string): string {
  if (source === 'openai') {
    return 'the LLM API';
  }
  if (source === 'ollama') {
    return 'Ollama';
  }
  if (source === 'anthropic') {
    return 'Anthropic';
  }
  if (source === 'openrouter') {
    return 'OpenRouter';
  }
  if (source === 'groq') {
    return 'Groq';
  }
  return source;
}

export function SessionLlmModelSelect({
  label,
  value,
  serverDefault,
  entries,
  loading,
  disabled,
  error,
  emptyLabel,
  onChange,
}: {
  label: string;
  value: string;
  serverDefault?: string;
  entries: LlmCatalogEntry[];
  loading: boolean;
  disabled: boolean;
  error?: string;
  emptyLabel: string;
  onChange: (next: string | undefined) => void;
}) {
  const models = entries.map(entry => entry.id);
  const listed = Boolean(value && models.includes(value));
  const [customOpen, setCustomOpen] = useState(false);
  const grouped = groupLlmCatalogEntries(entries);
  const showDropdown = loading || entries.length > 0;
  const showCustom = !showDropdown || customOpen || Boolean(value && !listed);
  const selectValue = showCustom && showDropdown ? CUSTOM_MODEL_VALUE : listed ? value : '';

  function renderGroup(title: string, items: LlmCatalogEntry[]) {
    if (items.length === 0) {
      return null;
    }
    return (
      <optgroup label={`${title} (${items.length})`}>
        {items.map(entry => (
          <option key={entry.id} value={entry.id}>
            {entry.id}
            {entry.sizeLabel ? ` · ${entry.sizeLabel}` : ''}
            {entry.contextLength ? ` · ${Math.round(entry.contextLength / 1024)}k` : ''}
          </option>
        ))}
      </optgroup>
    );
  }

  return (
    <label className="block space-y-1.5 text-sm">
      <span className="type-caption text-[var(--text-muted)]">{label}</span>
      {showDropdown ? (
        <SelectInput
          value={selectValue}
          disabled={disabled || loading}
          onChange={event => {
            const next = event.target.value;
            if (!next) {
              setCustomOpen(false);
              onChange(undefined);
              return;
            }
            if (next === CUSTOM_MODEL_VALUE) {
              setCustomOpen(true);
              if (listed) {
                onChange(undefined);
              }
              return;
            }
            setCustomOpen(false);
            onChange(next);
          }}
          className={`w-full font-mono text-sm ${accentFocusClass()}`}
        >
          <option value="">{loading ? 'Loading models…' : emptyLabel}</option>
          {renderGroup('Vision', grouped.vision)}
          {renderGroup('Text', grouped.text)}
          {renderGroup('Embeddings', grouped.embed)}
          <option value={CUSTOM_MODEL_VALUE}>Custom…</option>
        </SelectInput>
      ) : null}
      {showCustom ? (
        <input
          type="text"
          value={value}
          disabled={disabled}
          placeholder={
            error
              ? 'Could not list models — type an id'
              : serverDefault
                ? `Server: ${serverDefault}`
                : 'Model id'
          }
          onChange={event => onChange(event.target.value.trim() || undefined)}
          className={`ui-input w-full font-mono text-sm ${accentFocusClass()}`}
        />
      ) : null}
    </label>
  );
}
