/**
 * When a cloud engine has no Image 1, reuse the session identity lock as the img2img reference.
 */
export function resolveCloudIdentityFallback(input: {
  hasInputImage?: boolean;
  inputImageFilename?: string;
  identityFilename?: string;
  identityUrl?: string;
}): { inputImageFilename?: string; imageUrl?: string } | null {
  if (input.hasInputImage === true || input.inputImageFilename?.trim()) {
    return null;
  }
  const inputImageFilename = input.identityFilename?.trim() || undefined;
  const imageUrl = input.identityUrl?.trim() || undefined;
  if (!inputImageFilename && !imageUrl) {
    return null;
  }
  return { inputImageFilename, imageUrl };
}
