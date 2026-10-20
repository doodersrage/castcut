import type { PromptReadinessResult } from '../prompt/readiness';

export type ReadinessAutoFixAction = 'compact' | 'fix-rules' | 'reformat';

export function planReadinessAutoFix(result: PromptReadinessResult): ReadinessAutoFixAction[] {
  const actions: ReadinessAutoFixAction[] = [];
  const checks = Array.isArray(result.checks) ? result.checks : [];
  const failedIds = new Set(checks.filter(check => !check.passed).map(check => check.id));

  if (failedIds.has('max-length')) {
    actions.push('compact');
  }
  if (failedIds.has('lint') || failedIds.has('diagnostics')) {
    actions.push('fix-rules');
  }
  if (failedIds.has('min-length') && !actions.includes('fix-rules')) {
    actions.push('reformat');
  }

  return actions;
}
