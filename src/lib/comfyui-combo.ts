/** Reading ComfyUI combo (dropdown) inputs from object_info. */

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

/**
 * The choices of one combo input in object_info, in any of the shapes ComfyUI has used:
 * classic `[["a", "b"], {…}]`, current `["COMBO", { options: [...] }]`, or a bare
 * `{ options: [...] }`. Unread, the current form left the upscale list empty and the upscale map
 * was cleared as "not installed".
 */
export function readComboOptionList(spec: unknown): string[] {
  if (Array.isArray(spec) && Array.isArray(spec[0])) {
    return readStringList(spec[0]);
  }
  if (Array.isArray(spec) && spec[0] === 'COMBO' && spec[1] && typeof spec[1] === 'object') {
    return readStringList((spec[1] as { options?: unknown }).options);
  }
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    return readStringList((spec as { options?: unknown }).options);
  }
  return [];
}
