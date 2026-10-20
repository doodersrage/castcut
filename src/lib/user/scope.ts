export const USER_SCOPE_CHANGED_EVENT = 'prompt-studio-user-scope-changed';

const SHARED_SCOPE = 'shared';

let activeUserId: string | null = null;
let activeUsername: string | null = null;

export function setActiveUserScope(user: { id: string; username: string } | null): void {
  const nextUserId = user?.id ?? null;
  const nextUsername = user?.username ?? null;
  if (activeUserId === nextUserId && activeUsername === nextUsername) {
    return;
  }

  activeUserId = nextUserId;
  activeUsername = nextUsername;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(USER_SCOPE_CHANGED_EVENT));
  }
}

export function getActiveUserId(): string | null {
  return activeUserId;
}

export function getActiveUsername(): string | null {
  return activeUsername;
}

export function isUserScoped(): boolean {
  return Boolean(activeUserId);
}

export function scopedStorageKey(baseKey: string): string {
  if (!activeUserId) {
    return baseKey;
  }
  return `${baseKey}:user:${activeUserId}`;
}

export function scopeLabel(): string {
  if (activeUsername) {
    return activeUsername;
  }
  return 'shared session';
}

export function sharedScopeId(): string {
  return SHARED_SCOPE;
}
