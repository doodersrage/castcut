'use client';

import { useCallback, useState } from 'react';
import type { ServerEnvGroup } from '@/lib/server-env-summary';
import { buildEnvSnippet } from '@/lib/env-snippet';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';

type ServerEnvPanelProps = {
  groups: ServerEnvGroup[];
  llmOk?: boolean;
  comfyOk?: boolean;
  onRefreshHealth?: () => void;
  onStatus?: (message: string) => void;
};

export default function ServerEnvPanel({
  groups,
  llmOk,
  comfyOk,
  onRefreshHealth,
  onStatus,
}: ServerEnvPanelProps) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const copySnippet = useCallback(async () => {
    const snippet = buildEnvSnippet(groups);
    try {
      await navigator.clipboard.writeText(snippet);
      setCopyStatus('Copied .env snippet to clipboard.');
      onStatus?.('Copied .env snippet to clipboard.');
    } catch {
      setCopyStatus('Could not copy — select and copy manually from the snippet below.');
    }
  }, [groups, onStatus]);

  return (
    <ToolSection
      id="settings-server-env"
      title="Server environment (.env.local)"
      description="Read-only view of values loaded at server start. Change these in .env.local and restart the dev server or container."
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => void copySnippet()}>
          Copy .env snippet
        </Button>
        {onRefreshHealth ? (
          <>
            <Button variant="secondary" size="sm" onClick={onRefreshHealth}>
              Test LLM & ComfyUI
            </Button>
            {llmOk != null || comfyOk != null ? (
              <span className="type-caption self-center">
                LLM: {llmOk ? 'ok' : 'issue'} · ComfyUI: {comfyOk ? 'ok' : 'issue'}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      {copyStatus ? <p className="type-caption">{copyStatus}</p> : null}

      <p className="type-caption">
        Browser settings can override some ComfyUI and LLM behavior per session — look for the{' '}
        <strong className="font-medium text-[var(--text-secondary)]">UI override</strong> notes
        below.
      </p>

      <div className="space-y-4">
        {groups.map(group => (
          <div key={group.id} className="ui-surface-inset space-y-3">
            <h3 className="type-heading">{group.title}</h3>
            <ul className="ui-list">
              {group.fields.map(field => (
                <li
                  key={field.key}
                  className="ui-list-row flex-col !items-start gap-2 !min-h-0 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="type-heading">
                      <code className="text-[var(--accent-text)]">{field.key}</code>
                    </p>
                    <p className="type-caption">{field.label}</p>
                    {field.uiOverride ? (
                      <p className="type-caption text-[var(--tint-success-text)]">
                        UI override: {field.uiOverride}
                      </p>
                    ) : null}
                    {field.hint ? <p className="type-caption">{field.hint}</p> : null}
                  </div>
                  <p
                    className={`type-body max-w-full break-all text-right sm:max-w-[45%] ${
                      field.configured ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {field.value}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="type-caption">
        Create <code className="text-[var(--accent-text)]">.env.local</code> at the project root.
        Set <code className="text-[var(--accent-text)]">PROMPT_API_TOKEN</code> to protect API
        routes for scripts and ComfyUI nodes. Secrets are never shown here — only whether they are
        configured.
      </p>
    </ToolSection>
  );
}
