'use client';

/**
 * A run's bundle and its takes' shadow reports, sent to the server (run-bundle.ts) — best effort:
 * a take never waits for them, and without server storage they go nowhere.
 */
import type { RunBundle, TakeShadowReport } from './run-bundle';

export function postRunBundle(bundle: RunBundle): void {
  void fetch('/api/scene-runs/bundle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bundle }),
  }).catch(() => undefined);
}

export function postTakeShadow(report: TakeShadowReport): void {
  void fetch('/api/scene-runs/shadow', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ report }),
  }).catch(() => undefined);
}
