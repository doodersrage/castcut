'use client';

import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/Field';
import { DAY_THEMES } from '@/lib/play/remix';

export type DayRemixMenuProps = {
  /** The next episode, written to follow on from this Day (day-thread.ts). */
  onTomorrow?: () => void;
  tomorrowBusy?: boolean;
  onNewOutfit: () => void;
  onTheme: (themeId: string) => void;
  /** Full-width stacked layout for the phone Day tool. */
  stacked?: boolean;
  disabled?: boolean;
  /** Prefix for data-testids so celebrate and standard placements stay distinct. */
  testIdPrefix: string;
};

/**
 * Extra remix options next to "Same look, new Day": keep this Day's plan with a new Outfit, or
 * re-run the same look with a themed Setting + Beat set.
 */
export default function DayRemixMenu({
  onTomorrow,
  tomorrowBusy = false,
  onNewOutfit,
  onTheme,
  stacked = false,
  disabled = false,
  testIdPrefix,
}: DayRemixMenuProps) {
  return (
    <>
      {onTomorrow ? (
        <Button
          size={stacked ? undefined : 'sm'}
          variant="primary"
          className={stacked ? 'w-full justify-center' : undefined}
          disabled={disabled || tomorrowBusy}
          data-testid={`${testIdPrefix}-tomorrow`}
          title="The next short: same Cast and mood, its moments following on from this one's — a new short of its own"
          onClick={onTomorrow}
        >
          {tomorrowBusy ? 'Writing the next short…' : 'Next short →'}
        </Button>
      ) : null}
      <Button
        size={stacked ? undefined : 'sm'}
        variant="secondary"
        className={stacked ? 'w-full justify-center' : undefined}
        disabled={disabled}
        data-testid={`${testIdPrefix}-new-outfit`}
        title="Keep this short's settings and beats, then pick a new outfit on Outfit"
        onClick={onNewOutfit}
      >
        Same short, new outfit
      </Button>
      <SelectInput
        aria-label="Themed day"
        className={stacked ? 'w-full' : 'w-auto'}
        disabled={disabled}
        data-testid={`${testIdPrefix}-theme`}
        value=""
        onChange={event => {
          const themeId = event.target.value;
          if (themeId) {
            onTheme(themeId);
          }
        }}
      >
        <option value="">Themed day…</option>
        {DAY_THEMES.map(theme => (
          <option key={theme.id} value={theme.id}>
            {theme.label} — {theme.hint}
          </option>
        ))}
      </SelectInput>
    </>
  );
}
