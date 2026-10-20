/** Progress-style status lines that should stay quiet (e.g. "Upscaling 2/12…"). */
export function isTransientProgressStatus(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (/\d+\s*\/\s*\d+/.test(trimmed)) {
    return true;
  }
  if (/(?:…|\.\.\.)$/.test(trimmed) && !/finished|failed|queued|error/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function toneForStatusText(
  text: string
): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (/fail|error/i.test(text)) {
    return 'danger';
  }
  if (isTransientProgressStatus(text)) {
    return 'neutral';
  }
  if (/skip|warn/i.test(text)) {
    return 'warning';
  }
  if (/finished|queued|downloaded|exported|assigned|prepared/i.test(text)) {
    return 'success';
  }
  return 'info';
}
