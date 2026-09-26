'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { KeyCheckResult } from '@/lib/engine-key-check';

type Result = KeyCheckResult & { source?: 'settings' | 'server' | null };

/** "Check key" for one hosted engine; `check` is also called right after a paste. */
export function useEngineKeyCheck(engineId: string) {
  const [result, setResult] = useState<Result | null>(null);
  const [checking, setChecking] = useState(false);
  const check = useCallback(
    async (key?: string) => {
      setChecking(true);
      try {
        const response = await fetch('/api/engines/check-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ engine: engineId, key: key ?? '' }),
        });
        const data = (await response.json().catch(() => null)) as
          Result | { error?: string } | null;
        setResult(
          data && 'message' in data
            ? data
            : { ok: null, message: (data as { error?: string } | null)?.error ?? 'Check failed.' }
        );
      } catch {
        setResult({ ok: null, message: "Couldn't run the check." });
      } finally {
        setChecking(false);
      }
    },
    [engineId]
  );
  return { result, checking, check, clear: () => setResult(null) };
}

export default function EngineKeyCheckButton({
  engineId,
  result,
  checking,
  onCheck,
}: {
  engineId: string;
  result: Result | null;
  checking: boolean;
  onCheck: () => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        loading={checking}
        loadingLabel="Checking"
        data-testid={`${engineId}-check-key`}
        onClick={onCheck}
      >
        Check key
      </Button>
      {result ? (
        <span
          className={`type-caption ${
            result.ok === true
              ? 'text-[var(--tint-success-text,var(--text-secondary))]'
              : result.ok === false
                ? 'text-[var(--danger)]'
                : 'text-[var(--text-muted)]'
          }`}
          data-testid={`${engineId}-check-key-result`}
        >
          {result.message}
          {result.source === 'server' ? ' (the server key)' : ''}
        </span>
      ) : null}
    </span>
  );
}
