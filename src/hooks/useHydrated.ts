'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;
const onClient = () => true;
const onServer = () => false;

/**
 * False on the server and during hydration, true afterwards. Gate UI that depends on
 * browser-only state (storage, auth fetched after load) so the hydration render matches the
 * server HTML — React re-renders with `true` right after hydrating.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, onClient, onServer);
}
