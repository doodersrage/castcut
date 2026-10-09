'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { APP_HAS_PLAY } from '@/lib/app-profile';
import { resolveGenerateEmptyCta, resolveStudioEmptyCta, type EmptyCta } from '@/lib/empty-cta';

const subscribeNothing = () => () => {};

const STUDIO_FALLBACK: EmptyCta = APP_HAS_PLAY
  ? { label: 'Start a film', href: '/play' }
  : { label: 'Open Generate', href: '/' };
const GENERATE_FALLBACK: EmptyCta = APP_HAS_PLAY
  ? { label: 'Open Film', href: '/play' }
  : { label: 'Open Generate', href: '/' };

/**
 * The empty-state button reads saved progress (Play campaign, pinned tools) from browser storage,
 * which the server does not have. Read during render, a returning user's first client render said
 * "Continue to Day" where the server HTML said "Start a film" — a hydration error (React #418) on
 * Queue and Dashboard. These hooks render the server's answer first and switch after hydration.
 */
function useCta(resolve: (fallback: EmptyCta) => EmptyCta, fallback: EmptyCta): EmptyCta {
  const { label, href } = fallback;
  const json = useSyncExternalStore(
    subscribeNothing,
    () => JSON.stringify(resolve({ label, href })),
    () => JSON.stringify({ label, href })
  );
  return useMemo(() => JSON.parse(json) as EmptyCta, [json]);
}

/** Gallery / Queue / Dashboard empty states: resume the film when there is one in progress. */
export function useStudioEmptyCta(fallback: EmptyCta = STUDIO_FALLBACK): EmptyCta {
  return useCta(resolveStudioEmptyCta, fallback);
}

/** Prompt-tool empty states: a pinned prompt tool, else the fallback. */
export function useGenerateEmptyCta(fallback: EmptyCta = GENERATE_FALLBACK): EmptyCta {
  return useCta(resolveGenerateEmptyCta, fallback);
}
