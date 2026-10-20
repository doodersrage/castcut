'use client';

import { inspectPromptWeights } from '@/lib/prompt/weight-inspector';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import TagAssistToolbar from '@/components/TagAssistToolbar';
import { modelUsesTagAssist } from '@/lib/prompt/tag-assist';

export default function PromptWeightInspector(props: {
  prompt: string;
  model: ComfyImageModel | string;
  onChange?: (value: string) => void;
  /** Textarea receiving tag-assist selection edits (default: generated prompt editor). */
  textareaId?: string;
}) {
  const inspection = inspectPromptWeights(props.prompt, props.model);
  const supportsTagAssist = modelUsesTagAssist(props.model);
  const textareaId = props.textareaId ?? 'generated-prompt-editor';

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/40 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-[var(--text-primary)]">Token / weight inspector</p>
        <p
          className={`text-xs ${inspection.overLimit ? 'text-[var(--tint-warning-text)]' : 'text-[var(--text-muted)]'}`}
        >
          ~{inspection.estimatedTokens}/{inspection.tokenLimit} tokens
        </p>
      </div>

      {props.onChange && supportsTagAssist ? (
        <>
          <p className="text-[11px] text-[var(--text-muted)]">
            Select text in the prompt editor, then apply SD-style emphasis or comma tags.
          </p>
          <TagAssistToolbar
            value={props.prompt}
            onChange={props.onChange}
            textareaId={textareaId}
          />
        </>
      ) : null}

      {inspection.weightedTokens.length > 0 ? (
        <ul className="space-y-1 text-xs text-[var(--text-muted)]">
          {inspection.weightedTokens.map(token => (
            <li key={token.raw}>
              {token.raw} → weight {token.weight}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          {inspection.supportsWeights
            ? 'No explicit (tag:1.2) weights detected yet.'
            : 'Selected model uses natural-language prompts; weight syntax is mainly for SD-family tag models.'}
        </p>
      )}

      {inspection.suggestions.length > 0 ? (
        <ul className="space-y-1 text-xs text-[var(--tint-warning-text)]">
          {inspection.suggestions.map(suggestion => (
            <li key={suggestion}>• {suggestion}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
