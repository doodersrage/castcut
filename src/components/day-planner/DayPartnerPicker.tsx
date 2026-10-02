'use client';

import PortraitTileStrip from '@/components/ui/PortraitTileStrip';
import { DAY_NEW_PARTNER_OPTIONS, type DayPartnerNoun } from '@/lib/day-partner';

export type DayPartnerOption = {
  id: string;
  name: string;
  noun: DayPartnerNoun;
  /** The Cast's look plate, when they have one. */
  thumb?: string;
};

/**
 * Who plays the second person on two-person stills, picked by face: someone new each still, the
 * same invented woman or man all day, or a Cast member.
 */
export default function DayPartnerPicker({
  value,
  options,
  standInUrl,
  disabled,
  onChange,
}: {
  /** '' = someone new each still, `new:woman` / `new:man`, or a Cast id. */
  value: string;
  options: DayPartnerOption[];
  /** The invented partner's face, once the first two-person still has made it. */
  standInUrl?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <PortraitTileStrip
      label="Partner"
      value={value}
      disabled={disabled}
      onChange={onChange}
      testIdPrefix="day-partner-option"
      className="flex-1"
      tiles={[
        {
          id: '',
          label: 'Someone new',
          title: 'A different stranger on each two-person still',
          glyph: '?',
        },
        ...DAY_NEW_PARTNER_OPTIONS.map(option => ({
          id: option.id,
          label: option.noun === 'woman' ? 'Same woman' : 'Same man',
          title: option.label,
          thumb: value === option.id ? standInUrl : undefined,
          glyph: option.noun === 'woman' ? '♀' : '♂',
        })),
        ...options.map(option => ({
          id: option.id,
          label: option.name,
          title: `${option.name} — from your Cast`,
          thumb: option.thumb,
        })),
      ]}
    />
  );
}
