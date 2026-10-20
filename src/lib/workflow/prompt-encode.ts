export function isPromptEncodeNode(classType: string): boolean {
  const classLower = classType.toLowerCase();
  return classLower.includes('cliptextencode') || classLower.includes('textencode');
}

export function resolvePromptEncodeTextField(
  inputs: Record<string, unknown>
): 'text' | 'prompt' | null {
  if ('text' in inputs) {
    return 'text';
  }
  if ('prompt' in inputs) {
    return 'prompt';
  }
  return null;
}

export function classifyPromptEncodeBinding(
  classType: string,
  title: string
): 'positive' | 'negative' | 'unknown' {
  if (!isPromptEncodeNode(classType)) {
    return 'unknown';
  }

  const titleLower = title.toLowerCase();
  if (titleLower.includes('negative') || titleLower.includes(' neg')) {
    return 'negative';
  }
  if (
    titleLower.includes('positive') ||
    titleLower.includes(' pos') ||
    titleLower.includes('prompt')
  ) {
    return 'positive';
  }

  return 'positive';
}

export function setPromptEncodeField(
  inputs: Record<string, unknown>,
  field: 'text' | 'prompt',
  value: string
): void {
  inputs[field] = value;
}
