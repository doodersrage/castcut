'use client';

import {
  addAvoidedToken,
  clearAvoidedTokens,
  downloadAvoidedTokensExport,
  importAvoidedTokensJson,
  removeAvoidedToken,
} from '@/lib/prompt/avoided-tokens';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { EmptyState } from '@/components/ui/ViewState';
import { FieldLabel, TextArea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export type AvoidedTokensPanelProps = {
  avoidedTokens: string[];
  avoidedTokenDraft: string;
  setAvoidedTokenDraft: (value: string) => void;
  avoidancePreviewPrompt: string;
  setAvoidancePreviewPrompt: (value: string) => void;
  avoidancePreview: {
    filtered: string;
    removedTokens: string[];
    instructionLine: string;
  } | null;
  setAvoidancePreview: (
    value: {
      filtered: string;
      removedTokens: string[];
      instructionLine: string;
    } | null
  ) => void;
  setStatus: (status: string | null) => void;
};

export default function AvoidedTokensPanel({
  avoidedTokens,
  avoidedTokenDraft,
  setAvoidedTokenDraft,
  avoidancePreviewPrompt,
  setAvoidancePreviewPrompt,
  avoidancePreview,
  setAvoidancePreview,
  setStatus,
}: AvoidedTokensPanelProps) {
  return (
    <ToolSection title="Avoided tokens">
      <p className="text-sm text-[var(--text-secondary)]">
        Motifs to steer generators away from. Low gallery ratings append tokens automatically;
        manage the list here.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          id="settings-avoided-token-draft"
          value={avoidedTokenDraft}
          onChange={event => setAvoidedTokenDraft(event.target.value)}
          placeholder="Add token"
          className="ui-input min-w-45 flex-1 px-(--input-padding-x) py-(--input-padding-y) type-body"
        />
        <Button
          variant="secondary"
          disabled={!avoidedTokenDraft.trim()}
          onClick={() => {
            addAvoidedToken(avoidedTokenDraft);
            setAvoidedTokenDraft('');
            setStatus(`Added “${avoidedTokenDraft.trim()}” to avoided tokens.`);
          }}
        >
          Add
        </Button>
        <Button
          variant="secondary"
          disabled={avoidedTokens.length === 0}
          onClick={() => {
            clearAvoidedTokens();
            setStatus('Cleared avoided tokens.');
          }}
        >
          Clear all
        </Button>
        <Button
          variant="secondary"
          disabled={avoidedTokens.length === 0}
          onClick={() => {
            downloadAvoidedTokensExport();
            setStatus('Avoided tokens exported.');
          }}
        >
          Export JSON
        </Button>
        <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Choose a JSON file"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              void file.text().then(raw => {
                const merge = window.confirm(
                  'Merge imported tokens into the list? Cancel replaces the full list.'
                );
                const count = importAvoidedTokensJson(raw, merge ? 'merge' : 'replace');
                setStatus(`Imported ${count} avoided token(s).`);
              });
              event.target.value = '';
            }}
          />
        </label>
      </div>
      {avoidedTokens.length === 0 ? (
        <EmptyState
          compact
          icon="inbox"
          title="No avoided tokens yet"
          description="Add motifs to steer generators away from, or rate low Gallery outputs so tokens append automatically."
          action={{
            label: 'Add a token',
            onClick: () => {
              document.getElementById('settings-avoided-token-draft')?.focus();
            },
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {avoidedTokens.map(token => (
            <button
              key={token}
              type="button"
              onClick={() => {
                removeAvoidedToken(token);
                setStatus(`Removed “${token}”.`);
              }}
              className="rounded-full border border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--tint-danger-border)]/60 hover:text-[var(--tint-danger-text)]"
              title="Click to remove"
            >
              {token} ×
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 space-y-2">
        <FieldLabel htmlFor="avoidance-preview-prompt">Avoidance preview</FieldLabel>
        <TextArea
          id="avoidance-preview-prompt"
          rows={3}
          value={avoidancePreviewPrompt}
          onChange={event => setAvoidancePreviewPrompt(event.target.value)}
          placeholder="Paste a prompt to see which avoided tokens match and the LLM instruction line."
          className={accentFocusClass()}
        />
        <Button
          variant="secondary"
          disabled={!avoidancePreviewPrompt.trim()}
          onClick={() => {
            void fetch('/api/avoidance/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: avoidancePreviewPrompt }),
            })
              .then(response => response.json())
              .then(
                (data: {
                  filtered?: string;
                  removedTokens?: string[];
                  instructionLine?: string;
                }) => {
                  setAvoidancePreview({
                    filtered: data.filtered ?? '',
                    removedTokens: data.removedTokens ?? [],
                    instructionLine: data.instructionLine ?? '',
                  });
                }
              )
              .catch(() => setAvoidancePreview(null));
          }}
        >
          Preview avoidance
        </Button>
        {avoidancePreview ? (
          <div className="ui-surface-inset type-caption">
            {avoidancePreview.removedTokens.length > 0 ? (
              <p className="text-[var(--tint-warning-text)]">
                Matched tokens: {avoidancePreview.removedTokens.join(', ')}
              </p>
            ) : (
              <p>No avoided tokens found in this prompt.</p>
            )}
            {avoidancePreview.instructionLine ? (
              <p className="mt-2 text-[var(--text-muted)]">{avoidancePreview.instructionLine}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToolSection>
  );
}
