/**
 * The Node-only half of instrumentation.ts. Imported only inside an
 * `if (process.env.NEXT_RUNTIME === 'nodejs')` block there: Next also compiles instrumentation for
 * the edge runtime, and an early `return` for edge didn't stop webpack following these imports to
 * Node builtins (node:crypto from the generated session secret, 2026-10-14).
 */
export async function registerNode(
  startServerScheduledBatchLoop: () => void,
  postInstrumentationRoute: (path: string, body?: unknown) => Promise<void>
) {
  const {
    assertSecureExposureOrThrow,
    isInsecureAuthExplicitlyAllowed,
    isNetworkExposedDeployment,
  } = await import('@/lib/checks/bind-exposure-check');
  const { isAuthExplicitlyEnabled } = await import('@/lib/auth/config');
  if (isInsecureAuthExplicitlyAllowed()) {
    // Still surface what would have failed so operators notice the escape hatch.
    const { isUsingInsecureSessionSecret, INSECURE_SESSION_SECRET_WARNING } =
      await import('@/lib/user/session-secret-check');
    const { isUsingDefaultAdminCredentials, getDefaultAdminCredentialsWarning } =
      await import('@/lib/user/default-admin-check');
    const { AUTH_OFF_EXPOSED_ERROR } = await import('@/lib/checks/bind-exposure-check');
    if (isUsingInsecureSessionSecret()) {
      console.warn(`[security] PROMPT_ALLOW_INSECURE_AUTH=1 — ${INSECURE_SESSION_SECRET_WARNING}`);
    }
    if (isUsingDefaultAdminCredentials()) {
      console.warn(
        `[security] PROMPT_ALLOW_INSECURE_AUTH=1 — ${getDefaultAdminCredentialsWarning()}`
      );
    }
    if (!isAuthExplicitlyEnabled() && isNetworkExposedDeployment()) {
      console.warn(`[security] PROMPT_ALLOW_INSECURE_AUTH=1 — ${AUTH_OFF_EXPOSED_ERROR}`);
    }
  } else {
    assertSecureExposureOrThrow();
  }

  startServerScheduledBatchLoop();

  // The built-in LLM's hooks (llm-local.ts): LLM calls find it, start it on demand.
  await import('@/lib/llm/local-server');

  if (process.env.SERVER_USER_MAINTENANCE === 'true') {
    const maintenanceIntervalMin = Number(process.env.SERVER_USER_MAINTENANCE_INTERVAL_MIN ?? '15');
    const maintenanceMs = Math.max(5, maintenanceIntervalMin) * 60_000;

    const timer = setInterval(() => {
      void postInstrumentationRoute('/api/maintenance/run').catch(error => {
        console.error('[server-user-maintenance]', error);
      });
    }, maintenanceMs);
    timer.unref?.();
  }
}
