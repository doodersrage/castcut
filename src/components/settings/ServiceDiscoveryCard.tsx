'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { HealthResponse } from '@/components/settings/tabs/settings-tool-shared';
import type { FoundComfyUi, FoundLlm } from '@/lib/service-discovery';
import { sameServiceAddress } from '@/lib/service-address';

type Found = { comfy: FoundComfyUi[]; llm: FoundLlm[]; llmBaseUrl?: string };

/**
 * Shown when ComfyUI or the LLM isn't answering: looks for them at their usual local addresses
 * (once automatically, then on demand). ComfyUI switches in one click; the LLM lives in the
 * server's .env.local, so it gets the line to paste.
 */
export default function ServiceDiscoveryCard({
  health,
  comfyUrl,
  onUseComfyUrl,
}: {
  health: HealthResponse | null;
  comfyUrl?: string;
  onUseComfyUrl: (url: string) => void;
}) {
  const comfyDown = health != null && health.comfyui?.ok !== true;
  const llmDown = health != null && health.llm?.enabled !== false && health.llm?.ok !== true;
  const [found, setFound] = useState<Found | null>(null);
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState(false);
  const autoRan = useRef(false);

  const search = useCallback(async () => {
    setSearching(true);
    try {
      const response = await fetch('/api/discover-services', { credentials: 'same-origin' });
      setFound(response.ok ? ((await response.json()) as Found) : { comfy: [], llm: [] });
    } catch {
      setFound({ comfy: [], llm: [] });
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if ((comfyDown || llmDown) && !autoRan.current) {
      autoRan.current = true;
      void search();
    }
  }, [comfyDown, llmDown, search]);

  // No health reading yet (still loading, or rate-limited): offer the search, don't run it.
  const unknown = health == null;
  if (!unknown && !comfyDown && !llmDown) return null;

  const comfyChoices = (found?.comfy ?? []).filter(item => !sameServiceAddress(item.url, comfyUrl));
  const llmChoices = (found?.llm ?? []).filter(
    item => !sameServiceAddress(item.baseUrl, found?.llmBaseUrl)
  );

  return (
    <div
      className="mb-4 space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-3 text-sm"
      data-testid="service-discovery"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-[var(--text-primary)]">
          {unknown
            ? "Can't reach ComfyUI or the LLM?"
            : comfyDown && llmDown
              ? "ComfyUI and the LLM aren't answering"
              : comfyDown
                ? "ComfyUI isn't answering"
                : "The LLM isn't answering"}
        </p>
        <Button
          size="sm"
          variant="ghost"
          loading={searching}
          loadingLabel="Looking…"
          data-testid="service-discovery-search"
          onClick={() => void search()}
        >
          {found ? 'Look again' : 'Look for them'}
        </Button>
      </div>
      {searching && !found ? (
        <p className="type-caption text-[var(--text-muted)]">
          Looking at the usual local addresses…
        </p>
      ) : null}
      {found && (comfyDown || unknown) ? (
        comfyChoices.length > 0 ? (
          <ul className="space-y-1">
            {comfyChoices.map(item => (
              <li key={item.url} className="flex flex-wrap items-center gap-2">
                <span>
                  Found {item.label} at <code>{item.url}</code>
                  {item.deviceName ? ` · ${item.deviceName}` : ''}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  data-testid="service-discovery-use-comfy"
                  onClick={() => onUseComfyUrl(item.url)}
                >
                  Use it
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid="service-discovery-no-comfy"
          >
            No ComfyUI at 127.0.0.1:8188, :8000 or the Docker host. Start ComfyUI, or enter its
            address below.
          </p>
        )
      ) : null}
      {found && (llmDown || unknown) ? (
        llmChoices.length > 0 ? (
          <ul className="space-y-1">
            {llmChoices.map(item => {
              const line = `LLM_API_BASE_URL=${item.baseUrl}`;
              return (
                <li key={item.baseUrl} className="space-y-1">
                  <span>
                    Found {item.label} at <code>{item.baseUrl}</code> ({item.models}{' '}
                    {item.models === 1 ? 'model' : 'models'}). Put this in <code>.env.local</code>{' '}
                    and restart Castcut:
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-[var(--bg-base)] px-1.5 py-0.5">{line}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void navigator.clipboard?.writeText(line).then(() => setCopied(true));
                      }}
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid="service-discovery-no-llm"
          >
            No Ollama (:11434) or LM Studio (:1234) found locally.
          </p>
        )
      ) : null}
    </div>
  );
}
