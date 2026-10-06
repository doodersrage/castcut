'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppFeatureId } from '@/lib/auth/features';
import type { AuthSessionResponse, AuthUserPublic } from '@/lib/auth/types';
import { setActiveUserScope } from '@/lib/user-scope';
import { setUserComfyUiUrlOverride } from '@/lib/user-comfy-url';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

type AuthState = {
  loading: boolean;
  authEnabled: boolean;
  user: AuthUserPublic | null;
  allowedFeatures: AppFeatureId[] | 'all';
  impersonating: boolean;
  impersonatorUsername?: string;
};

const INITIAL: AuthState = {
  loading: true,
  authEnabled: false,
  user: null,
  /** Empty until session resolves — avoids flashing Settings/nav before login. */
  allowedFeatures: [],
  impersonating: false,
};

// ─── Fine-grained contexts (stable refs unless their specific field changes) ───

const LoadingContext = createContext(false);
const AuthEnabledContext = createContext(false);
const UserContext = createContext<AuthUserPublic | null>(null);
const AllowedFeaturesContext = createContext<AppFeatureId[] | 'all'>('all');
const ImpersonatingContext = createContext(false);
const ImpersonatorUsernameContext = createContext<string | undefined>(undefined);
const RefreshContext = createContext<() => Promise<void>>(async () => {});
const LogoutContext = createContext<() => Promise<void>>(async () => {});

// ─── Legacy single-context (kept for backwards compatibility) ──────────────

export type AuthContextValue = AuthState & {
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_RETRY_DELAYS_MS = [400, 1200, 3000];
/** A rate-limited request says when to come back (Retry-After); wait that long, up to this. */
const SESSION_RETRY_AFTER_CAP_MS = 10_000;
/**
 * With every quick retry failed, the session is asked for again in the background, so a page
 * that loaded while the server was rate-limiting (several tabs or devices behind one address)
 * gets its navigation without a reload once the limiter's window has passed.
 */
const SESSION_BACKGROUND_RETRY_MS = 15_000;
const SESSION_BACKGROUND_RETRIES = 8;

/** How long to wait before the next try: the server's Retry-After on a 429, else the schedule. */
export function sessionRetryDelayMs(
  attempt: number,
  response: { status: number; retryAfter: string | null } | null
): number | null {
  const scheduled = SESSION_RETRY_DELAYS_MS[attempt];
  if (scheduled == null) return null;
  const after = Number(response?.retryAfter);
  if (response?.status === 429 && Number.isFinite(after) && after > 0) {
    return Math.max(scheduled, Math.min(after * 1000, SESSION_RETRY_AFTER_CAP_MS));
  }
  return scheduled;
}

/**
 * The session request, tried again when it fails. One dropped or rate-limited request at page
 * load used to leave the app with an empty feature list — no tabs, no navigation — until a
 * reload.
 */
async function fetchSessionWithRetry(): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= SESSION_RETRY_DELAYS_MS.length; attempt++) {
    let failed: { status: number; retryAfter: string | null } | null = null;
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      // 429 (rate limit) and 5xx are worth another try; their body is an error, and read as
      // a session it means "no features allowed".
      if (response.ok || (response.status < 500 && response.status !== 429)) {
        return response;
      }
      failed = { status: response.status, retryAfter: response.headers.get('Retry-After') };
      lastError = new Error(`session ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    const delay = sessionRetryDelayMs(attempt, failed);
    if (delay == null) break;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw lastError;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL);
  // Whether a session has ever been read, and the background retry while none has.
  const loaded = useRef(false);
  const backgroundRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundRetries = useRef(0);
  // The timer calls whatever refresh is current (it is declared below).
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const refresh = useCallback(async () => {
    if (backgroundRetry.current) {
      clearTimeout(backgroundRetry.current);
      backgroundRetry.current = null;
    }
    try {
      const response = await fetchSessionWithRetry();
      loaded.current = true;
      const data = (await response.json()) as AuthSessionResponse & {
        defaultAdminUsername?: string;
        impersonating?: boolean;
        impersonatorUsername?: string;
      };
      setState({
        loading: false,
        authEnabled: Boolean(data.authEnabled),
        user: data.user,
        allowedFeatures:
          data.allowedFeatures === 'all'
            ? 'all'
            : Array.isArray(data.allowedFeatures)
              ? data.allowedFeatures
              : [],
        impersonating: Boolean(data.impersonating),
        impersonatorUsername: data.impersonatorUsername,
      });
      if (data.authEnabled && data.user) {
        setActiveUserScope({ id: data.user.id, username: data.user.username });
        setUserComfyUiUrlOverride(data.user.comfyUiUrl);
      } else {
        setActiveUserScope(null);
        setUserComfyUiUrlOverride(null);
      }
    } catch {
      // A session that was already loaded stays as it was: a failed refresh is not a logout.
      setState(previous => (previous.loading ? { ...INITIAL, loading: false } : previous));
      // Never loaded: keep asking, slowly, so the navigation fills in once the server answers.
      if (!loaded.current && backgroundRetries.current < SESSION_BACKGROUND_RETRIES) {
        backgroundRetries.current += 1;
        backgroundRetry.current = setTimeout(() => {
          backgroundRetry.current = null;
          void refreshRef.current();
        }, SESSION_BACKGROUND_RETRY_MS);
      }
    }
  }, []);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void refresh();
    });
    return () => {
      if (backgroundRetry.current) clearTimeout(backgroundRetry.current);
    };
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }, []);

  // Legacy merged value — computed directly from state (isAdmin changes only when user.role changes)
  const isAdmin = Boolean(state.user?.role === 'admin');

  // Always provide the same shape on server and client first paint. Branching on
  // `typeof window` made AuthContext null during SSR and non-null on hydrate,
  // which remounted AppNav auth UI (hydration mismatch).
  //
  // Memoized so this legacy merged context only gets a new reference when auth state (or the
  // stable refresh/logout callbacks) actually changes — the fine-grained contexts above were
  // added specifically to avoid forcing every useAuth() consumer to re-render on every
  // AuthProvider render, but this merged value was creating a fresh object every render anyway.
  const value: AuthContextValue = useMemo(
    () => ({ ...state, refresh, logout, isAdmin }),
    [state, refresh, logout, isAdmin]
  );

  // Fine-grained providers — only fire when their specific field changes
  useEffect(() => {
    // Use refs + dispatch to avoid re-rendering children unless needed
    const el = document.querySelector('[data-auth-provider]');
    if (el) {
      el.setAttribute('auth-loading', String(state.loading));
    }
  }, [state]);

  // Wrap with fine-grained context providers via single subtree
  const childrenWithSubtle: ReactNode = (
    <LoadingContext.Provider value={state.loading}>
      <AuthEnabledContext.Provider value={state.authEnabled}>
        <UserContext.Provider value={state.user}>
          <AllowedFeaturesContext.Provider value={state.allowedFeatures}>
            <ImpersonatingContext.Provider value={state.impersonating}>
              <ImpersonatorUsernameContext.Provider value={state.impersonatorUsername}>
                {children}
              </ImpersonatorUsernameContext.Provider>
            </ImpersonatingContext.Provider>
          </AllowedFeaturesContext.Provider>
        </UserContext.Provider>
      </AuthEnabledContext.Provider>
    </LoadingContext.Provider>
  );

  return (
    <RefreshContext.Provider value={refresh}>
      <LogoutContext.Provider value={logout}>
        <AuthContext.Provider value={value}>{childrenWithSubtle}</AuthContext.Provider>
      </LogoutContext.Provider>
    </RefreshContext.Provider>
  );
}

// ─── Fine-grained hooks (only re-render when the specific field changes) ───

export function useAuthLoading(): boolean {
  return useContext(LoadingContext);
}

export function useAuthEnabled(): boolean {
  return useContext(AuthEnabledContext);
}

export function useAuthUser(): AuthUserPublic | null {
  return useContext(UserContext);
}

export function useAllowedFeatures(): AppFeatureId[] | 'all' {
  return useContext(AllowedFeaturesContext);
}

export function useImpersonating(): boolean {
  return useContext(ImpersonatingContext);
}

export function useImpersonatorUsername(): string | undefined {
  return useContext(ImpersonatorUsernameContext);
}

export function useAuthRefresh(): () => Promise<void> {
  return useContext(RefreshContext);
}

export function useAuthLogout(): () => Promise<void> {
  return useContext(LogoutContext);
}

// ─── Legacy single-context hook (kept for backwards compatibility) ────────

export function useAuth(): AuthContextValue | null {
  const context = useContext(AuthContext);
  // During SSR hydration or HMR boundaries the provider may not yet be wired up.
  if (!context) {
    return null;
  }
  return context;
}

export function canAccessNavFeature(
  allowed: AppFeatureId[] | 'all',
  feature: AppFeatureId | null
): boolean {
  if (!feature) {
    return true;
  }
  if (allowed === 'all') {
    return true;
  }
  if (allowed.includes(feature)) {
    return true;
  }
  // Legacy grants: Story (roleplay) included the Film loop before `play` split out.
  if (feature === 'play' && allowed.includes('roleplay')) {
    return true;
  }
  return false;
}
