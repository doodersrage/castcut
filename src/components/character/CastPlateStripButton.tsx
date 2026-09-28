'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { stripCastPlateClothing } from '@/lib/cast-plate-strip';
import { loadSettingsCache } from '@/lib/settings-cache';

type SendComfyUi = Parameters<typeof stripCastPlateClothing>[0]['sendComfyUi'];

/**
 * "Remove clothing" on the Cast look plate. Loaded lazily — it owns a ComfyUI queue hook the rest
 * of Cast home never needs.
 */
export default function CastPlateStripButton({
  disabled,
  onStrip,
}: {
  disabled: boolean;
  onStrip: (sendComfyUi: SendComfyUi) => void;
}) {
  const [model] = useState(() => loadSettingsCache().shared.model);
  const actions = usePromptResultActions({ tool: 'fitting', model });

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={disabled}
      data-testid="cast-look-plate-strip"
      title="Swap the outfit in this photo for plain underwear, so kits don't inherit it"
      onClick={() => onStrip(actions.sendComfyUi)}
    >
      Remove clothing
    </Button>
  );
}
