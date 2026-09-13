'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { useAuth } from '@/hooks/useAuth';
import type { AppFeatureId } from '@/lib/auth/features';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { loadLastToolRoute, resolveLandingRoute } from '@/lib/last-tool-route';

type LoginMode = 'sign-in' | 'totp' | 'forgot' | 'reset';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();

  const [mode, setMode] = useState<LoginMode>('sign-in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!auth) return;
    const token = searchParams.get('reset')?.trim();
    if (token) {
      scheduleAfterCommit(() => {
        setResetToken(token);
        setMode('reset');
      });
    }
  }, [searchParams, auth]);

  if (!auth) return null;

  const { refresh } = auth;

  async function completeLogin(data: { user?: unknown; allowedFeatures?: unknown }) {
    if (!data.user) {
      throw new Error('Sign in failed.');
    }
    const allowedFeatures: AppFeatureId[] | 'all' =
      data.allowedFeatures === 'all'
        ? 'all'
        : Array.isArray(data.allowedFeatures)
          ? (data.allowedFeatures as AppFeatureId[])
          : [];
    const next = resolveLandingRoute({
      explicitNext: searchParams.get('next'),
      remembered: loadLastToolRoute(),
      allowedFeatures,
    });
    await refresh();
    router.replace(next);
    router.refresh();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (mode === 'forgot') {
        const response = await fetch('/api/email/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: forgotIdentifier.includes('@') ? undefined : forgotIdentifier,
            email: forgotIdentifier.includes('@') ? forgotIdentifier : undefined,
          }),
        });
        const data = (await response.json()) as { error?: string; message?: string };
        if (!response.ok) {
          throw new Error(data.error ?? 'Could not send reset email.');
        }
        setInfo(data.message ?? 'If an account exists, a reset link was sent.');
        return;
      }

      if (mode === 'reset') {
        if (resetPassword.trim().length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        if (resetPassword !== resetPasswordConfirm) {
          throw new Error('Passwords do not match.');
        }
        const response = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken, password: resetPassword }),
        });
        const data = (await response.json()) as { error?: string; username?: string };
        if (!response.ok) {
          throw new Error(data.error ?? 'Reset failed.');
        }
        setInfo(`Password updated for ${data.username ?? 'your account'}. Sign in below.`);
        setMode('sign-in');
        setPassword('');
        setResetPassword('');
        setResetPasswordConfirm('');
        router.replace('/login');
        return;
      }

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(
          mode === 'totp' && pendingToken ? { pendingToken, totpCode } : { username, password }
        ),
      });
      const data = (await response.json()) as {
        error?: string;
        requiresTotp?: boolean;
        pendingToken?: string;
        user?: unknown;
      };
      if (!response.ok) {
        throw new Error(data.error ?? 'Sign in failed.');
      }

      if (data.requiresTotp && data.pendingToken) {
        setPendingToken(data.pendingToken);
        setMode('totp');
        return;
      }

      await completeLogin(data);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  }

  const title =
    mode === 'totp'
      ? 'Authenticator code'
      : mode === 'forgot'
        ? 'Forgot password'
        : mode === 'reset'
          ? 'Reset password'
          : 'Sign in';

  const description =
    mode === 'totp'
      ? 'Enter the 6-digit code from your authenticator app.'
      : mode === 'forgot'
        ? 'Enter your username or email. If SMTP is configured, a reset link is sent when a match exists.'
        : mode === 'reset'
          ? 'Choose a new password for your account.'
          : 'Use your Castcut account to continue.';

  return (
    <form onSubmit={onSubmit} className="ui-auth-card space-y-5">
      <div className="space-y-1.5">
        <p className="type-overline">Account</p>
        <h1 className="type-title text-[var(--text-primary)]">{title}</h1>
        <p className="type-caption text-[var(--text-secondary)]">{description}</p>
      </div>

      {mode === 'sign-in' ? (
        <>
          <label className="block space-y-2">
            <span className="type-caption text-[var(--text-muted)]">Username</span>
            <TextInput
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="block space-y-2">
            <span className="type-caption text-[var(--text-muted)]">Password</span>
            <TextInput
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              setMode('forgot');
              setError(null);
              setInfo(null);
              setForgotIdentifier(username);
            }}
            className="ui-text-link text-xs"
          >
            Forgot password?
          </button>
        </>
      ) : null}

      {mode === 'totp' ? (
        <label className="block space-y-2">
          <span className="type-caption text-[var(--text-muted)]">Authenticator code</span>
          <TextInput
            value={totpCode}
            onChange={event => setTotpCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        </label>
      ) : null}

      {mode === 'forgot' ? (
        <label className="block space-y-2">
          <span className="type-caption text-[var(--text-muted)]">Username or email</span>
          <TextInput
            value={forgotIdentifier}
            onChange={event => setForgotIdentifier(event.target.value)}
            autoComplete="username"
          />
        </label>
      ) : null}

      {mode === 'reset' ? (
        <>
          <label className="block space-y-2">
            <span className="type-caption text-[var(--text-muted)]">New password</span>
            <TextInput
              type="password"
              value={resetPassword}
              onChange={event => setResetPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="block space-y-2">
            <span className="type-caption text-[var(--text-muted)]">Confirm password</span>
            <TextInput
              type="password"
              value={resetPasswordConfirm}
              onChange={event => setResetPasswordConfirm(event.target.value)}
              autoComplete="new-password"
            />
          </label>
        </>
      ) : null}

      {error ? <p className="ui-alert-danger text-sm">{error}</p> : null}
      {info ? <p className="ui-alert-success text-sm">{info}</p> : null}

      <Button type="submit" disabled={loading} className="w-full" variant="primary">
        {loading
          ? 'Working…'
          : mode === 'totp'
            ? 'Verify code'
            : mode === 'forgot'
              ? 'Send reset link'
              : mode === 'reset'
                ? 'Update password'
                : 'Sign in'}
      </Button>

      {mode === 'forgot' || mode === 'reset' ? (
        <button
          type="button"
          onClick={() => {
            setMode('sign-in');
            setError(null);
            setInfo(null);
          }}
          className="ui-text-link w-full text-center text-xs"
        >
          Back to sign in
        </button>
      ) : null}
    </form>
  );
}
