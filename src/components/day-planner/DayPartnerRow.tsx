'use client';

import { Button } from '@/components/ui/Button';
import DayPartnerPicker, { type DayPartnerOption } from '@/components/day-planner/DayPartnerPicker';
import { DAY_NEW_PARTNER_OPTIONS, type DayPartnerNoun } from '@/lib/day-partner';
import {
  isDayAdultMood,
  normalizeDayMood,
  type DayIntimateMix,
  type DayMoodSetting,
} from '@/lib/day-planner';

export type DayPartnerRowProps = {
  busy?: boolean;
  dayMood: DayMoodSetting;
  people: DayIntimateMix;
  /** Cast member who plays the second person on duo stills ('' = an invented stranger). */
  partnerId: string;
  partnerOptions: DayPartnerOption[];
  onPartnerChange: (next: string) => void;
  /** The engine has two-women adult layouts (Rapid AIO). */
  partnerTwoWomen?: boolean;
  /** The Cast lead's gender, from their description. */
  leadNoun?: DayPartnerNoun;
  /** "Same stranger all day": the invented partner's face, and a reset. */
  partnerStandInUrl?: string;
  onNewPartnerStandIn?: () => void;
  /** Keep today's invented partner as a Cast member (returns the new Cast id). */
  onKeepPartnerAsCast?: () => string | null;
  /** The face picture actually sent for the Cast partner on the last two-person still. */
  partnerSentFaceUrl?: string;
};

/**
 * Who plays the second person — shown under the plan bar as soon as People is not Solo, since
 * picking Duo is the moment the question comes up. Picture tiles, not a dropdown.
 */
export default function DayPartnerRow({
  busy = false,
  dayMood,
  people,
  partnerId,
  partnerOptions,
  onPartnerChange,
  partnerTwoWomen = false,
  leadNoun = 'woman',
  partnerStandInUrl,
  onNewPartnerStandIn,
  onKeepPartnerAsCast,
  partnerSentFaceUrl,
}: DayPartnerRowProps) {
  if (people === 'solo') return null;
  const mood = normalizeDayMood(dayMood);
  const partner:
    { id: string; name: string; noun: DayPartnerNoun; invented?: boolean } | undefined =
    partnerOptions.find(option => option.id === partnerId) ??
    (() => {
      const invented = DAY_NEW_PARTNER_OPTIONS.find(option => option.id === partnerId);
      return invented
        ? { id: invented.id, name: invented.label, noun: invented.noun, invented: true }
        : undefined;
    })();
  // Adult duo layouts on this engine: a woman lead with a man everywhere; two women, two men and
  // a man lead on Rapid AIO.
  const adultPartnerOk =
    !partner || partner.noun === 'person'
      ? false
      : (leadNoun !== 'man' && partner.noun === 'man') || partnerTwoWomen;

  return (
    <div className="space-y-1.5">
      <div
        className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-x-2"
        data-testid="day-partner"
      >
        <span className="type-caption w-16 shrink-0 text-[var(--text-muted)] sm:pt-6">Partner</span>
        <DayPartnerPicker
          value={partner ? partner.id : ''}
          options={partnerOptions}
          standInUrl={partnerStandInUrl}
          sentFaceUrl={partner && !partner.invented ? partnerSentFaceUrl : undefined}
          disabled={busy}
          onChange={onPartnerChange}
        />
      </div>
      {partner && !partner.invented && partnerSentFaceUrl ? (
        <div className="flex items-center gap-2" data-testid="day-partner-sent-face">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={partnerSentFaceUrl}
            alt={`${partner.name}'s face as sent`}
            className="h-12 w-12 rounded-full border border-[var(--border-subtle)] object-cover"
          />
          <span className="type-caption text-[var(--text-muted)]">
            The face picture sent for {partner.name} on the last two-person still — what the engine
            was given.
          </span>
        </div>
      ) : null}
      {partner ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-partner-hint">
          {partner.invented
            ? `The same stranger plays the second person on every two-person still — their face is made once, on the first one. `
            : `${partner.name} plays the second person on two-person stills. Their face takes the slot the outfit photo would use, so the outfit is described in words on those stills.`}
          {isDayAdultMood(mood) && !adultPartnerOk
            ? partner.noun === 'person'
              ? ' Adult duo stills invent a partner — add "man" or "woman" to their Cast description to use them.'
              : ' Two women, two men or a man lead in adult poses need Qwen Rapid AIO — on this engine those stills invent the partner.'
            : ''}
        </p>
      ) : !isDayAdultMood(mood) ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-companions-hint">
          Second adults allowed — friend or selfie companion with a different face (not a Cast
          twin).
        </p>
      ) : null}
      {partner?.invented && onNewPartnerStandIn ? (
        <div className="flex items-center gap-2" data-testid="day-partner-stand-in">
          {partnerStandInUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={partnerStandInUrl}
              alt="Today's partner"
              className="h-12 w-12 rounded-full border border-[var(--border-subtle)] object-cover"
            />
          ) : (
            <span className="type-caption text-[var(--text-muted)]">
              No face yet — made on the first two-person still.
            </span>
          )}
          {partnerStandInUrl ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              data-testid="day-partner-new-face"
              title="Use a different stranger from the next two-person still on"
              onClick={onNewPartnerStandIn}
            >
              New face
            </Button>
          ) : null}
          {partnerStandInUrl && onKeepPartnerAsCast ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              data-testid="day-partner-keep-cast"
              title="Make this partner a Cast member: the same face on later Days, and they can lead their own"
              onClick={() => {
                onKeepPartnerAsCast();
              }}
            >
              Keep as Cast
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
