import { getDetailLimits, type DetailLevel } from './detail-level';
import { analyzePromptDiagnostics } from './diagnostics';
import type { ComfyImageModel } from '../comfy-models/client';

export type ReadinessCheck = {
  id: string;
  label: string;
  passed: boolean;
  weight: number;
  detail?: string;
};

export type PromptReadinessResult = {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  checks: ReadinessCheck[];
  suggestions: string[];
};

function gradeFromScore(score: number): PromptReadinessResult['grade'] {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export function scorePromptReadiness(options: {
  prompt: string;
  hints?: string;
  model: ComfyImageModel;
  detail: DetailLevel;
  negativePrompt?: string;
}): PromptReadinessResult {
  const checks: ReadinessCheck[] = [];
  const suggestions: string[] = [];
  const prompt = options.prompt.trim();
  const hints = options.hints?.trim() ?? '';

  checks.push({
    id: 'non-empty',
    label: 'Prompt is non-empty',
    passed: prompt.length > 0,
    weight: 15,
    detail: prompt.length ? `${prompt.length} chars` : 'Empty prompt',
  });

  const limits = getDetailLimits(options.detail, options.model);
  const withinMax = prompt.length <= limits.maxChars;
  checks.push({
    id: 'max-length',
    label: 'Within model max length',
    passed: withinMax,
    weight: 20,
    detail: `${prompt.length}/${limits.maxChars}`,
  });
  if (!withinMax) {
    suggestions.push(`Compact or shorten to ${limits.maxChars} characters for ${options.model}.`);
  }

  const minChars = limits.minChars ?? 0;
  if (minChars > 0) {
    const meetsMin = prompt.length >= minChars;
    checks.push({
      id: 'min-length',
      label: 'Meets model minimum length',
      passed: meetsMin,
      weight: 15,
      detail: `${prompt.length}/${minChars}`,
    });
    if (!meetsMin) {
      suggestions.push(`Expand to at least ${minChars} characters for Rich/detail targets.`);
    }
  }

  const diagnostics = analyzePromptDiagnostics(hints || prompt, prompt);
  const lintErrors = diagnostics.issues.filter(issue => issue.severity === 'error');
  const lintOk = lintErrors.length === 0;
  checks.push({
    id: 'lint',
    label: 'Passes lint rules',
    passed: lintOk,
    weight: 25,
    detail: lintOk ? 'No errors' : `${lintErrors.length} error(s)`,
  });
  if (!lintOk) {
    suggestions.push(...lintErrors.map(issue => issue.message).slice(0, 3));
  }

  const diagErrors = lintErrors;
  checks.push({
    id: 'diagnostics',
    label: 'Sport/duo diagnostics clean',
    passed: diagErrors.length === 0,
    weight: 15,
    detail: diagErrors.length ? `${diagErrors.length} error(s)` : 'Clean',
  });
  suggestions.push(...diagnostics.suggestions.slice(0, 2));

  if (options.negativePrompt?.trim()) {
    checks.push({
      id: 'negative',
      label: 'Negative prompt provided',
      passed: true,
      weight: 5,
    });
  }

  const earned = checks.filter(check => check.passed).reduce((sum, check) => sum + check.weight, 0);
  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  const score = total > 0 ? Math.round((earned / total) * 100) : 0;

  return {
    score,
    grade: gradeFromScore(score),
    checks,
    suggestions: [...new Set(suggestions)].slice(0, 6),
  };
}
