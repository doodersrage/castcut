'use client';

import { SwitchButton } from '@/components/ui/Field';

/**
 * Outfit's Front and back switch: each finished try-on is followed by a second render of it seen
 * from behind, shown beside the front on its Compare card.
 */
export default function FittingFrontBackToggle({
  enabled,
  busy = false,
  onChange,
}: {
  enabled: boolean;
  busy?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="space-y-1" data-testid="fitting-front-back">
      <SwitchButton
        checked={enabled}
        disabled={busy}
        data-testid="fitting-front-back-switch"
        title="After each try-on, render the same outfit from behind"
        onChange={onChange}
      >
        Front and back
      </SwitchButton>
      <p className="type-caption text-[var(--text-muted)]">
        {enabled
          ? 'Each try-on is turned around once it lands: the back shows beside the front. Keep uses the front.'
          : 'Off: try-ons are front only.'}
      </p>
    </div>
  );
}
