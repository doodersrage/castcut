/**
 * A prompt finalized as the page's queue finalizes it (usePromptResultDiagnostics.finalizePrompt:
 * /api/lint, then /api/fix when the lint found an error), without the round trip — for the
 * server's run (FINISHING_PLAN Phase 3). Same functions as those routes, same inputs.
 */
import { lintPrompt } from './diagnostics';
import { fixPromptRules } from './fix';

export function finalizePromptRules(
  prompt: string,
  options: { hints?: string; autoFixRules: boolean }
): string {
  const hints = options.hints?.trim() ?? '';
  const trimmed = prompt.trim();
  // The lint route refuses an empty request: the page's lint is null, the prompt kept.
  if (!hints && !trimmed) return prompt;
  if (!options.autoFixRules) return prompt;
  const lint = lintPrompt({ hints, prompt: trimmed });
  if (!lint.issues.some(issue => issue.severity === 'error')) return prompt;
  // The fix route refuses an empty prompt; it trims what it is given.
  if (!trimmed) return prompt;
  try {
    const fixed = fixPromptRules({ hints: options.hints, prompt: trimmed });
    return fixed.prompt && fixed.prompt !== prompt ? fixed.prompt : prompt;
  } catch {
    return prompt;
  }
}
