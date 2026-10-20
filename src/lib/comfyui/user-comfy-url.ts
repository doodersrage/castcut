let userComfyUiUrlOverride: string | null = null;

export function setUserComfyUiUrlOverride(url: string | null | undefined): void {
  userComfyUiUrlOverride = url?.trim() || null;
}

export function getUserComfyUiUrlOverride(): string | null {
  return userComfyUiUrlOverride;
}

export function applyUserComfyUiOverride<T extends { apiUrl?: string }>(runtime: T): T {
  if (!userComfyUiUrlOverride) {
    return runtime;
  }
  return { ...runtime, apiUrl: userComfyUiUrlOverride };
}
