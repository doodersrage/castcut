'use client';

import { useCallback, useState } from 'react';
import type { PlaySoftAdvanceTarget } from '@/components/PlaySoftAdvanceBanner';
import { buildPlaySoftAdvance, type PlayCampaignStepId } from '@/lib/play-step-machine';
import type { LookPack } from '@/lib/look-pack';
import { toMobileStudioHref } from '@/lib/mobile-studio';

export type UsePlaySoftAdvanceOptions = {
  /** Map desk hrefs to /m/... when true. */
  mobile?: boolean;
};

/**
 * Shared soft-advance state for Play handoffs (Moodboard → Outfit → Day → Watch).
 */
export function usePlaySoftAdvance(options: UsePlaySoftAdvanceOptions = {}) {
  const [softAdvance, setSoftAdvance] = useState<PlaySoftAdvanceTarget | null>(null);
  const mobile = options.mobile === true;

  const cancelSoftAdvance = useCallback(() => {
    setSoftAdvance(null);
  }, []);

  const softAdvanceTo = useCallback(
    (
      stepId: PlayCampaignStepId | 'watch',
      input: {
        characterId?: string;
        pack?: LookPack | null;
        href?: string;
        label?: string;
        message?: string;
      } = {}
    ) => {
      const spec = buildPlaySoftAdvance(stepId, input);
      const href = input.href?.trim() || spec.href;
      setSoftAdvance({
        href: mobile ? toMobileStudioHref(href) : href,
        label: input.label?.trim() || spec.label,
        message: input.message ?? spec.message,
        nonce: Date.now(),
      });
    },
    [mobile]
  );

  const softAdvanceHref = useCallback(
    (href: string, label: string, message?: string) => {
      const next = href.trim();
      if (!next) {
        return;
      }
      setSoftAdvance({
        href: mobile ? toMobileStudioHref(next) : next,
        label,
        message,
        nonce: Date.now(),
      });
    },
    [mobile]
  );

  return {
    softAdvance,
    setSoftAdvance,
    cancelSoftAdvance,
    softAdvanceTo,
    softAdvanceHref,
  };
}
