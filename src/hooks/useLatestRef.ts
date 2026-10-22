'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * A ref that always holds the latest committed `value`. Read it inside a callback that must stay
 * stable (it drives effects) but must never act on a stale value — e.g. the active Cast id.
 * Read `.current` only from handlers and effects, never during render.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
