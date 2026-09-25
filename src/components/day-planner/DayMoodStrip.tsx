'use client';

import { SwitchButton } from '@/components/ui/Field';
import { usePlayChecksReadiness } from '@/hooks/usePlayChecksReadiness';
import { summarizePlayChecks } from '@/lib/play-checks-readiness';
import {
  DAY_INTIMATE_MIX_OPTIONS,
  DAY_LENGTHS,
  DEFAULT_DAY_LENGTH,
  type DayLength,
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
  /** Stills on the board (2–8). */
  dayLength?: DayLength;
  onDayLengthChange?: (next: DayLength) => void;
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
  dayLength = DEFAULT_DAY_LENGTH,
  onDayLengthChange,
  className = '',
}: DayMoodStripProps) {
  const mood = normalizeDayMood(dayMood);
  // What Auto-review can measure on this setup (DWPose / FaceAnalysis installed in ComfyUI).
  const { readiness } = usePlayChecksReadiness(undefined, { enabled: autoReviewStills });
  const checksLine = summarizePlayChecks(readiness);
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

  const groupLabel = 'type-caption w-16 shrink-0 text-[var(--text-muted)]';

  return (
    <div className={`space-y-2 ${className}`.trim()} data-testid="day-mood-strip">
      {onDayLengthChange ? (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1.5"
          role="group"
          aria-label="Day length"
          data-testid="day-length"
        >
          <span className={groupLabel}>Stills</span>
          <div className="ui-segmented" data-wrap="true">
            {DAY_LENGTHS.map(length => (
              <button
                key={length}
                type="button"
                className="ui-segmented-item"
                aria-pressed={dayLength === length}
                data-active={dayLength === length ? 'true' : 'false'}
                disabled={busy}
                data-testid={`day-length-${length}`}
                title={
                  length > 4
                    ? `${length} stills — adds late-morning / late-night slots`
                    : `${length} stills`
                }
                onClick={() => onDayLengthChange(length)}
              >
                {length}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {onDayMoodChange ? (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1.5"
          role="radiogroup"
          aria-label="Day mood"
          data-testid="day-mood-group"
        >
          <span className={groupLabel}>Mood</span>
          <div className="ui-segmented" data-wrap="true">
            {moodOptions.map(option => (
              <button
                key={option.id}
                type="button"
                role="radio"
                className="ui-segmented-item"
                aria-checked={mood === option.id}
                data-active={mood === option.id ? 'true' : 'false'}
                disabled={busy}
                data-testid={`day-mood-${option.id}`}
                title={option.hint}
                onClick={() => onDayMoodChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {showAdultMix ? (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1.5"
          role="radiogroup"
          aria-label="Who's in the scene"
          data-testid="day-intimate-mix"
        >
          <span className={groupLabel}>Mix</span>
          <div className="ui-segmented" data-wrap="true">
            {DAY_INTIMATE_MIX_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                role="radio"
                className="ui-segmented-item"
                aria-checked={mix === option.id}
                data-active={mix === option.id ? 'true' : 'false'}
                disabled={busy}
                data-testid={`day-intimate-mix-${option.id}`}
                title={option.hint}
                onClick={() => onIntimateMixChange?.(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {onAllowCompanionsChange || onPosePriorityChange || onAutoReviewStillsChange ? (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1"
          role="group"
          aria-label="Day options"
          data-testid="day-options"
        >
          <span className={groupLabel}>Options</span>
          {onAllowCompanionsChange ? (
            <SwitchButton
              checked={allowCompanions}
              disabled={busy}
              data-testid="day-allow-companions"
              title="Allow a friend or selfie companion (different face from Cast)"
              onChange={onAllowCompanionsChange}
            >
              Duo · companions
            </SwitchButton>
          ) : null}
          {onPosePriorityChange ? (
            <SwitchButton
              checked={posePriority}
              disabled={busy}
              data-testid="day-pose-priority"
              title="Let the beat's pose win over the plate's stance (Qwen Edit 2511 copies Image 1 otherwise). Turn off if faces drift."
              onChange={onPosePriorityChange}
            >
              Pose over plate
            </SwitchButton>
          ) : null}
          {onAutoReviewStillsChange ? (
            <SwitchButton
              checked={autoReviewStills}
              disabled={busy}
              data-testid="day-auto-review"
              title="Vision-check each finished still and requeue broken faces, hands, or outfits (needs a vision model)"
              onChange={onAutoReviewStillsChange}
            >
              Auto-review stills
            </SwitchButton>
          ) : null}
        </div>
      ) : null}
      {!posePriority ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-pose-priority-hint">
          Pose over plate is off — stills will follow the plate&rsquo;s stance more closely.
        </p>
      ) : null}
      {autoReviewStills && checksLine ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-play-checks">
          {checksLine}
        </p>
      ) : null}
      {autoReviewStills && qualityStatus ? (
        <p
          className="type-caption text-[var(--text-muted)]"
          role="status"
          data-testid="day-quality-status"
        >
          {qualityStatus}
        </p>
      ) : null}
      {allowCompanions ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-companions-hint">
          Second adults allowed — friend or selfie companion with a different face (not a Cast
          twin).
        </p>
      ) : null}
      {mood === 'suggestive' ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-mood-hint">
          Suggestive heat — clothed innuendo; Suggest day / Queue day mix spicy beats.
        </p>
      ) : null}
      {mood === 'sport' ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-mood-hint">
          Sport — each slot picks a sport that fits that time of day (including swim, volleyball,
          boxing, surfing, and cycling road/gravel/MTB/CX/track), mid-action pose + athletic kit
          (Outfit Keep dress is discarded for the kit).
        </p>
      ) : null}
      {mood === 'vacation' ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-mood-hint">
          Vacation — mixed energy: RELAXING + active (swim, kick, bike, toss, jump, dance, climb);
          Suggest day spreads pose classes so you don’t get three mid-strides.
        </p>
      ) : null}
      {mood === 'intimate' ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-mood-hint">
          {mix === 'solo'
            ? 'Intimate solo — one adult; self-touch / undress beats.'
            : mix === 'duo'
              ? 'Intimate duo — partner scenes; partners get different faces from Cast.'
              : 'Intimate mixed — solo and duo beats; partners get different faces from Cast.'}
        </p>
      ) : null}
      {mood === 'raunchy' ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-mood-hint">
          {mix === 'solo'
            ? 'Raunchy solo — wardrobe fails as the setup; crude self-touch is the punchline.'
            : mix === 'duo'
              ? 'Raunchy duo — slapstick sex and partner comedy; partners get different faces from Cast.'
              : 'Raunchy mixed — wardrobe fails and slapstick sex; partners get different faces from Cast.'}
        </p>
      ) : null}
      {!intimateEnabled ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-mood-nsfw-hint">
          Intimate and Raunchy stay off until the NSFW generator env flag is enabled.
        </p>
      ) : null}
    </div>
  );
}
