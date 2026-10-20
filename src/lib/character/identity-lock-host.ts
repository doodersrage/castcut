import { isDeadHostErrorMessage } from '../queue/oom-retry';

/** Hard-pin queue to the host that holds the identity file (not preferredComfyHost). */
export function resolveIdentityLockApiUrl(shared: {
  ipAdapterImageFilename?: string;
  ipAdapterComfyUrl?: string;
}): string | undefined {
  if (!shared.ipAdapterImageFilename?.trim()) {
    return undefined;
  }
  return shared.ipAdapterComfyUrl?.trim() || undefined;
}

/** LoadImage / missing input file — the pin is stale even if the host is up. */
export function isIdentityMissingFileError(message: string | undefined | null): boolean {
  const text = message?.trim() ?? '';
  if (!text) {
    return false;
  }
  return /invalid image file|image does not exist|cannot find.{0,40}(?:image|file)|LoadImage.{0,80}(?:not found|failed|missing)|no such file(?: or directory)?|not in the input folder|filename ['"][^'"]+['"] (?:not found|does not exist)/i.test(
    text
  );
}

export function shouldRelocateIdentityLock(message: string | undefined | null): boolean {
  return isDeadHostErrorMessage(message) || isIdentityMissingFileError(message);
}
