'use client';

import { useEffect, useState } from 'react';
import {
  scorePromptReadiness,
  type PromptReadinessResult,
  type ReadinessCheck,
} from '@/lib/prompt-readiness';
import {
  DEFAULT_READINESS_MIN_SCORE,
  isReadinessQueueAllowed,
  readinessGateMessage,
} from '@/lib/readiness-gate';
import { planReadinessAutoFix } from '@/lib/readiness-auto-fix';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { DetailLevel } from '@/lib/detail-level';
import { Button } from '@/components/ui/Button';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

function isPromptReadinessResult(value: unknown): value is PromptReadinessResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<PromptReadinessResult>;
  return (
    typeof candidate.score === 'number' &&
    typeof candidate.grade === 'string' &&
    Array.isArray(candidate.checks) &&
    Array.isArray(candidate.suggestions)
  );
}

function localReadiness(props: {
  prompt: string;
  hints?: string;
  model: ComfyImageModel | string;
  detail: DetailLevel | string;
  negativePrompt?: string;
}): PromptReadinessResult {
  return scorePromptReadiness({
    prompt: props.prompt,
    hints: props.hints,
    model: props.model as ComfyImageModel,
    detail: props.detail as DetailLevel,
    negativePrompt: props.negativePrompt,
  });
}

export default function ReadinessBadge(props: {
  prompt: string;
  hints?: string;
  model: ComfyImageModel | string;
  detail: DetailLevel | string;
  negativePrompt?: string;
  minScore?: number;
  onResult?: (result: PromptReadinessResult | null) => void;
  onCompact?: () => void | Promise<void>;
  onFixRules?: () => void | Promise<void>;
  onReformat?: () => void | Promise<void>;
}) {
  const [result, setResult] = useState<PromptReadinessResult | null>(null);
  const [fixing, setFixing] = useState(false);
  const minScore = props.minScore ?? DEFAULT_READINESS_MIN_SCORE;

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (!props.prompt.trim()) {
        setResult(null);
        props.onResult?.(null);
        return;
      }
      void fetch('/api/readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: props.prompt,
          hints: props.hints,
          model: props.model,
          detail: props.detail,
          negativePrompt: props.negativePrompt,
        }),
      })
        .then(async response => {
          const data: unknown = await response.json().catch(() => null);
          if (!response.ok || !isPromptReadinessResult(data)) {
            throw new Error('Invalid readiness response');
          }
          return data;
        })
        .then(data => {
          setResult(data);
          props.onResult?.(data);
        })
        .catch(() => {
          const fallback = localReadiness(props);
          setResult(fallback);
          props.onResult?.(fallback);
        });
    });
  }, [props.prompt, props.hints, props.model, props.detail, props.negativePrompt]);

  async function runAutoFix() {
    if (!result) {
      return;
    }
    setFixing(true);
    try {
      for (const action of planReadinessAutoFix(result)) {
        if (action === 'compact') {
          await props.onCompact?.();
        } else if (action === 'fix-rules') {
          await props.onFixRules?.();
        } else if (action === 'reformat') {
          await props.onReformat?.();
        }
      }
    } finally {
      setFixing(false);
    }
  }

  if (!result) {
    return null;
  }

  const checks: ReadinessCheck[] = Array.isArray(result.checks) ? result.checks : [];
  const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
  const queueAllowed = isReadinessQueueAllowed(result.score, minScore);
  const failedChecks = checks.filter(check => !check.passed);
  const canAutoFix =
    planReadinessAutoFix({ ...result, checks, suggestions }).length > 0 &&
    (props.onCompact || props.onFixRules || props.onReformat);

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/40 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-[var(--text-primary)]">
          Prompt readiness: {result.score}/100 ({result.grade})
        </p>
        {!queueAllowed ? (
          <span className="ui-badge" data-tone="warning">
            Below queue threshold ({minScore})
          </span>
        ) : (
          <span className="ui-badge" data-tone="success">
            Ready to queue
          </span>
        )}
      </div>

      {!queueAllowed ? (
        <p className="mt-2 text-xs text-[var(--tint-warning-text)]">
          {readinessGateMessage(result.score, minScore)}
        </p>
      ) : null}

      <ul className="mt-2 space-y-1 text-[var(--text-muted)]">
        {checks.map(check => (
          <li key={check.id}>
            {check.passed ? '✓' : '✗'} {check.label}
            {check.detail ? ` — ${check.detail}` : ''}
          </li>
        ))}
      </ul>

      {suggestions.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
          {suggestions.map(suggestion => (
            <li key={suggestion}>• {suggestion}</li>
          ))}
        </ul>
      ) : null}

      {canAutoFix ? (
        <Button
          variant="secondary"
          className="mt-3"
          loading={fixing}
          onClick={() => void runAutoFix()}
        >
          Fix readiness issues
        </Button>
      ) : null}

      {failedChecks.length === 0 ? null : (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          {failedChecks.length} check(s) failed
          {canAutoFix ? ' — use Fix readiness issues or queue anyway.' : '.'}
        </p>
      )}
    </div>
  );
}
