import { getComfyModelDefinition, type ComfyImageModel } from '../comfy-models/client';

export function modelUsesTagAssist(model: ComfyImageModel): boolean {
  const profile = getComfyModelDefinition(model).profile;
  return profile === 'sd15_weighted';
}

export function wrapTagEmphasis(text: string, weight = 1.2): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  return `(${trimmed}:${weight.toFixed(1)})`;
}

export function wrapTagDeemphasis(text: string, weight = 0.8): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  return `[${trimmed}:${weight.toFixed(1)}]`;
}

export function applyTagAssistToSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  transform: 'emphasis' | 'deemphasis' | 'tags'
): { nextValue: string; nextSelectionStart: number; nextSelectionEnd: number } {
  const selected = value.slice(selectionStart, selectionEnd).trim();
  if (!selected) {
    return {
      nextValue: value,
      nextSelectionStart: selectionStart,
      nextSelectionEnd: selectionEnd,
    };
  }

  let replacement = selected;
  if (transform === 'emphasis') {
    replacement = wrapTagEmphasis(selected);
  } else if (transform === 'deemphasis') {
    replacement = wrapTagDeemphasis(selected);
  } else {
    replacement = selected
      .split(/[\s,]+/)
      .filter(Boolean)
      .join(', ');
  }

  const nextValue = value.slice(0, selectionStart) + replacement + value.slice(selectionEnd);
  const nextSelectionStart = selectionStart;
  const nextSelectionEnd = selectionStart + replacement.length;

  return { nextValue, nextSelectionStart, nextSelectionEnd };
}
