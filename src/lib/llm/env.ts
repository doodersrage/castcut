/** Client-safe LLM env helpers (no Node built-ins). */

export function allowTemplateFallback(): boolean {
  return process.env.ALLOW_TEMPLATE_FALLBACK !== 'false';
}

export function isLlmEnabled(): boolean {
  return process.env.LLM_ENABLED !== 'false';
}

export function getLlmTemperature(override?: number): number {
  if (typeof override === 'number' && override >= 0 && override <= 2) {
    return override;
  }

  const configured = Number(process.env.LLM_TEMPERATURE);
  return Number.isFinite(configured) && configured >= 0 && configured <= 2 ? configured : 0.95;
}
