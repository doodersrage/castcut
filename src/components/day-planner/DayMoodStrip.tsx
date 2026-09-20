'use client';

import { ChipButton } from '@/components/ui/Field';
import {
  DAY_INTIMATE_MIX_OPTIONS,
  DAY_MOOD_OPTIONS,
  isDayAdultMood,
  normalizeDayIntimateMix,
  normalizeDayMood,
  type DayIntimateMix,
  type DayMood,
} from '@/lib/day-planner';

export type DayMoodStripProps = {
  busy?: boolean;
  allowCompanions?: boolean;
  onAllowCompanionsChange?: (next: boolean) => void;
  /** Default on — loosen the plate's grip on stance when the beat needs a different body. */
  posePriority?: boolean;
  onPosePriorityChange?: (next: boolean) => void;
  /** Opt-in vision review + bounded requeue of broken Day stills. */
  autoReviewStills?: boolean;
  onAutoReviewStillsChange?: (next: boolean) => void;
  /** Latest quality-gate line (reviewing / passed / requeueing / paused). */
  qualityStatus?: string | null;
  dayMood?: DayMood;
  onDayMoodChange?: (next: DayMood) => void;
  intimateMix?: DayIntimateMix;
  onIntimateMixChange?: (next: DayIntimateMix) => void;
  /** When false, Intimate / Raunchy chips are hidden (NSFW generator env off). */
  intimateEnabled?: boolean;
  className?: string;
};

/**
 * Day heat + companion chips — kept outside collapsed Setup so they stay visible
 * next to the slot board / Queue day.
 */
export default function DayMoodStrip({
  busy = false,
  allowCompanions = false,
  onAllowCompanionsChange,
  posePriority = true,
  onPosePriorityChange,
  autoReviewStills = false,
  onAutoReviewStillsChange,
  qualityStatus = null,
  dayMood = 'everyday',
  onDayMoodChange,
  intimateMix = 'mixed',
  onIntimateMixChange,
  intimateEnabled = false,
  className = '',
}: DayMoodStripProps) {
  const mood = normalizeDayMood(dayMood);
  const mix = normalizeDayIntimateMix(intimateMix);
  const moodOptions = DAY_MOOD_OPTIONS.filter(
    option => !isDayAdultMood(option.id) || intimateEnabled
  );
  const showAdultMix = isDayAdultMood(mood) && Boolean(onIntimateMixChange);

  if (
    !onAllowCompanionsChange &&
    !onDayMoodChange &&
    !onAutoReviewStillsChange &&
    !onPosePriorityChange
  ) {
    return null;
  }

  return (
    <div className={className.trim() || undefined} data-testid="day-mood-strip">
      <div className="flex flex-wrap gap-2">
        {onAllowCompanionsChange ? (
          <ChipButton
            active={allowCompanions}
            disabled={busy}
            data-testid="day-allow-companions"
            title="Allow a friend or selfie companion (different face from Cast)"
            onClick={() => onAllowCompanionsChange(!allowCompanions)}
          >
            Duo · companions
          </ChipButton>
        ) : null}
        {onPosePriorityChange ? (
          <ChipButton
            active={posePriority}
            disabled={busy}
            data-testid="day-pose-priority"
            title="Let the beat's pose win over the plate's stance (Qwen Edit 2511 copies Image 1 otherwise). Turn off if faces drift."
            onClick={() => onPosePriorityChange(!posePriority)}
          >
            Pose over plate
          </ChipButton>
        ) : null}
        {onAutoReviewStillsChange ? (
          <ChipButton
            active={autoReviewStills}
            disabled={busy}
            data-testid="day-auto-review"
            title="Vision-check each finished still and requeue broken faces, hands, or outfits (needs a vision model)"
            onClick={() => onAutoReviewStillsChange(!autoReviewStills)}
          >
            Auto-review stills
          </ChipButton>
        ) : null}
        {onDayMoodChange
          ? moodOptions.map(option => (
              <ChipButton
                key={option.id}
                active={mood === option.id}
                disabled={busy}
                data-testid={`day-mood-${option.id}`}
                title={option.hint}
                onClick={() => onDayMoodChange(option.id)}
              >
                {option.label}
              </ChipButton>
            ))
          : null}
      </div>
      {showAdultMix ? (
        <div className="mt-2 flex flex-wrap gap-2" data-testid="day-intimate-mix">
          {DAY_INTIMATE_MIX_OPTIONS.map(option => (
            <ChipButton
              key={option.id}
              active={mix === option.id}
              disabled={busy}
              data-testid={`day-intimate-mix-${option.id}`}
              title={option.hint}
              onClick={() => onIntimateMixChange?.(option.id)}
            >
              {option.label}
            </ChipButton>
          ))}
        </div>
      ) : null}
      {!posePriority ? (
        <p
          className="type-caption mt-2 text-[var(--text-muted)]"
          data-testid="day-pose-priority-hint"
        >
          Pose over plate is off — stills will follow the plate&rsquo;s stance more closely.
        </p>
      ) : null}
      {autoReviewStills && qualityStatus ? (
        <p
          className="type-caption mt-2 text-[var(--text-muted)]"
          role="status"
          data-testid="day-quality-status"
        >
          {qualityStatus}
        </p>
      ) : null}
      {allowCompanions ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]" data-testid="day-companions-hint">
          Second adults allowed — friend or selfie companion with a different face (not a Cast
          twin).
        </p>
      ) : null}
      {mood === 'suggestive' ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]" data-testid="day-mood-hint">
          Suggestive heat — clothed innuendo; Suggest day / Queue day mix spicy beats.
        </p>
      ) : null}
      {mood === 'sport' ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]" data-testid="day-mood-hint">
          Sport — each slot picks a sport that fits that time of day (including swim, volleyball,
          boxing, surfing, and cycling road/gravel/MTB/CX/track), mid-action pose + athletic kit
          (Outfit Keep dress is discarded for the kit).
        </p>
      ) : null}
      {mood === 'vacation' ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]" data-testid="day-mood-hint">
          Vacation — mixed energy: RELAXING + active (swim, kick, bike, toss, jump, dance, climb);
          Suggest day spreads pose classes so you don’t get three mid-strides.
        </p>
      ) : null}
      {mood === 'intimate' ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]" data-testid="day-mood-hint">
          {mix === 'solo'
            ? 'Intimate solo — one adult; self-touch / undress beats.'
            : mix === 'duo'
              ? 'Intimate duo — partner scenes; partners get different faces from Cast.'
              : 'Intimate mixed — solo and duo beats; partners get different faces from Cast.'}
        </p>
      ) : null}
      {mood === 'raunchy' ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]" data-testid="day-mood-hint">
          {mix === 'solo'
            ? 'Raunchy solo — wardrobe fails as the setup; crude self-touch is the punchline.'
            : mix === 'duo'
              ? 'Raunchy duo — slapstick sex and partner comedy; partners get different faces from Cast.'
              : 'Raunchy mixed — wardrobe fails and slapstick sex; partners get different faces from Cast.'}
        </p>
      ) : null}
      {!intimateEnabled ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]" data-testid="day-mood-nsfw-hint">
          Intimate and Raunchy stay off until the NSFW generator env flag is enabled.
        </p>
      ) : null}
    </div>
  );
}
