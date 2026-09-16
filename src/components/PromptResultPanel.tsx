'use client';

import { CollapsibleSection, ToolSection } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import { MonoTextArea } from '@/components/ui/Field';
import { rawPromptDiffers } from '@/lib/raw-prompt';

type PromptResultPanelProps = {
  output: string;
  provider: 'llm' | 'template' | 'rules' | null;
  comfyNode?: string;
  limits?: {
    minChars?: number;
    maxChars: number;
  };
  copied: boolean;
  onCopy: () => void;
  extraMeta?: string;
  /** When set, the generated prompt is editable (queues/copy use the edited text). */
  onOutputChange?: (value: string) => void;
  /**
   * Pre-optimize LLM/template draft (before sanitize / format / wardrobe merge).
   * Shown collapsed when it differs from the optimized prompt.
   */
  rawPrompt?: string;
};

export default function PromptResultPanel({
  output,
  provider,
  comfyNode,
  limits,
  copied,
  onCopy,
  extraMeta,
  onOutputChange,
  rawPrompt,
}: PromptResultPanelProps) {
  if (!output && !onOutputChange) {
    return null;
  }

  const showRaw = rawPromptDiffers(rawPrompt, output);
  const editable = typeof onOutputChange === 'function';

  return (
    <ToolSection>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="type-heading">Generated prompt</h2>
          {(provider || editable) && (
            <p className="type-caption mt-1">
              {provider
                ? `via ${provider === 'llm' ? 'LLM' : provider === 'rules' ? 'rules' : 'template'}`
                : null}
              {provider && limits
                ? ` · ${limits.minChars ? `${limits.minChars}–` : ''}${limits.maxChars} char limit`
                : null}
              {` · ${output.length} chars`}
              {editable ? ' · editable' : ''}
              {extraMeta ? ` · ${extraMeta}` : ''}
            </p>
          )}
        </div>
        <Button variant="secondary" onClick={onCopy} disabled={!output.trim()}>
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>

      {editable ? (
        <MonoTextArea
          id="generated-prompt-editor"
          value={output}
          onChange={event => onOutputChange(event.target.value)}
          rows={Math.min(18, Math.max(6, output.split('\n').length + 2))}
          spellCheck={false}
          className="mt-1 !text-[var(--tint-success-text)]"
          aria-label="Generated prompt"
        />
      ) : (
        <pre className="type-code overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-5 !text-[var(--tint-success-text)]">
          {output}
        </pre>
      )}

      {comfyNode && (
        <p className="type-caption">
          Paste into <code className="type-code">{comfyNode}</code>
        </p>
      )}

      {showRaw && rawPrompt ? (
        <CollapsibleSection
          title="Un-optimized prompt"
          summary={`${rawPrompt.length} chars · LLM/template draft before sanitize, format, and wardrobe merge`}
          defaultOpen={false}
          persistKey="result-raw-prompt"
          className="mt-4"
        >
          <pre className="type-code max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/80 p-4 text-[var(--text-secondary)]">
            {rawPrompt}
          </pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="ghost"
              className="!min-h-9 px-3 type-caption"
              onClick={() => void navigator.clipboard.writeText(rawPrompt)}
            >
              Copy raw
            </Button>
            {editable ? (
              <Button
                variant="ghost"
                className="!min-h-9 px-3 type-caption"
                onClick={() => onOutputChange(rawPrompt)}
              >
                Use raw as generated
              </Button>
            ) : null}
          </div>
        </CollapsibleSection>
      ) : null}
    </ToolSection>
  );
}
