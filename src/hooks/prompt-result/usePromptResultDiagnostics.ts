'use client';

import { useCallback, useState } from 'react';
import type { GenerationDiagnostics } from '@/lib/queue/generation-diagnostics';
import type { PromptResultActionsConfig } from '@/hooks/prompt-result/types';

export function usePromptResultDiagnostics(config: PromptResultActionsConfig) {
  const [preDiagnostics, setPreDiagnostics] = useState<GenerationDiagnostics | null>(null);
  const [diagnostics, setDiagnostics] = useState<GenerationDiagnostics | null>(null);
  const [fixStatus, setFixStatus] = useState<string | null>(null);

  const resetStatuses = useCallback(() => {
    setFixStatus(null);
  }, []);

  const runPreLint = useCallback(async (hints?: string) => {
    const corpus = hints?.trim();
    if (!corpus) {
      setPreDiagnostics(null);
      return null;
    }

    const response = await fetch('/api/lint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hints: corpus }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as GenerationDiagnostics;
    setPreDiagnostics(data);
    return data;
  }, []);

  const lintPrompt = useCallback(
    async (prompt: string, hints?: string) => {
      const response = await fetch('/api/lint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hints: hints ?? config.hints, prompt }),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as GenerationDiagnostics;
      setDiagnostics(data);
      return data;
    },
    [config.hints]
  );

  const applyRuleFix = useCallback(
    async (prompt: string, hints?: string) => {
      const response = await fetch('/api/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hints: hints ?? config.hints, prompt }),
      });

      const data = (await response.json()) as {
        prompt?: string;
        changes?: Array<{ description: string }>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? 'Fix failed.');
      }

      return data;
    },
    [config.hints]
  );

  const maybeAutoFix = useCallback(
    async (prompt: string, hints?: string, lint?: GenerationDiagnostics | null) => {
      if (config.autoFixRules === false) {
        return prompt;
      }

      const hasErrors = lint?.issues.some(issue => issue.severity === 'error');
      if (!hasErrors) {
        return prompt;
      }

      try {
        const data = await applyRuleFix(prompt, hints);
        if (data.prompt && data.prompt !== prompt) {
          setFixStatus(
            data.changes?.length
              ? `Auto-fixed: ${data.changes.map(c => c.description).join('; ')}`
              : 'Auto-fix applied.'
          );
          return data.prompt;
        }
      } catch {
        // keep original prompt
      }

      return prompt;
    },
    [applyRuleFix, config.autoFixRules]
  );

  const finalizePrompt = useCallback(
    async (prompt: string, hints?: string) => {
      const lint = await lintPrompt(prompt, hints);
      return maybeAutoFix(prompt, hints, lint);
    },
    [lintPrompt, maybeAutoFix]
  );

  const fixPrompt = useCallback(
    async (prompt: string, onFixed: (next: string) => void, hints?: string) => {
      if (!prompt) {
        return;
      }

      setFixStatus('Applying rule fixes…');
      try {
        const data = await applyRuleFix(prompt, hints);
        if (data.prompt) {
          onFixed(data.prompt);
          await lintPrompt(data.prompt, hints);
        }
        setFixStatus(
          data.changes?.length
            ? `Fixed: ${data.changes.map(change => change.description).join('; ')}`
            : 'No rule-based fixes needed.'
        );
      } catch (err) {
        setFixStatus(err instanceof Error ? err.message : 'Fix failed.');
      }
    },
    [applyRuleFix, lintPrompt]
  );

  return {
    preDiagnostics,
    diagnostics,
    fixStatus,
    setFixStatus,
    setDiagnostics,
    resetStatuses,
    runPreLint,
    lintPrompt,
    finalizePrompt,
    fixPrompt,
    applyRuleFix,
  };
}
