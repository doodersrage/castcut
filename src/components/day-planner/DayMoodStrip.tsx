'use client';

import { Button } from '@/components/ui/Button';
import { SwitchButton } from '@/components/ui/Field';
import { usePlayChecksReadiness } from '@/hooks/usePlayChecksReadiness';
import { summarizePlayChecks } from '@/lib/play-checks-readiness';
import { DAY_THEME_OPTIONS, dayThemeOf } from '@/lib/day-themes';
import { DAY_WEATHER_OPTIONS } from '@/lib/day-weather';
import DayPartnerPicker, { type DayPartnerOption } from '@/components/day-planner/DayPartnerPicker';
import { DAY_NEW_PARTNER_OPTIONS, type DayPartnerNoun } from '@/lib/day-partner';
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
  type DayMoodSetting,
} from '@/lib/day-planner';

export type DayMoodStripProps = {
  busy?: boolean;
  allowCompanions?: boolean;
  onAllowCompanionsChange?: (next: boolean) => void;
  /** Cast member who plays the second person on duo stills ('' = an invented stranger). */
  partnerId?: string;
  partnerOptions?: DayPartnerOption[];
  onPartnerChange?: (next: string) => void;
  /** The engine has two-women adult layouts (Rapid AIO). */
  partnerTwoWomen?: boolean;
  /** The Cast lead's gender, from their description. */
  leadNoun?: DayPartnerNoun;
  /** "Same stranger all day": the invented partner's face, and a reset. */
  partnerStandInUrl?: string;
  /** Weather / season on every setting ('' = whatever the setting says). */
  dayWeather?: string;
  onDayWeatherChange?: (next: string) => void;
  onNewPartnerStandIn?: () => void;
  /** Default on — loosen the plate's grip on stance when the beat needs a different body. */
  posePriority?: boolean;
  onPosePriorityChange?: (next: boolean) => void;
  /** Opt-in: full plate as an extra identity reference on face-break stills. */
  identityBoost?: boolean;
  onIdentityBoostChange?: (next: boolean) => void;
  /** Opt-in: re-render the lead's face on each still against the Cast face crop. */
  faceFinish?: boolean;
  onFaceFinishChange?: (next: boolean) => void;
  /** Latest Face finish line (running / applied / skipped / paused). */
  faceFinishStatus?: string | null;
  /** Opt-in vision review + bounded requeue of broken Day stills. */
  autoReviewStills?: boolean;
  onAutoReviewStillsChange?: (next: boolean) => void;
  /** Latest quality-gate line (reviewing / passed / requeueing / paused). */
  qualityStatus?: string | null;
  dayMood?: DayMoodSetting;
  onDayMoodChange?: (next: DayMoodSetting) => void;
  intimateMix?: DayIntimateMix;
  onIntimateMixChange?: (next: DayIntimateMix) => void;
  /**
   * One "People" control for every mood (replaces the companions switch + adult-only Mix):
   * Solo, Mixed (some stills with a second person) or Duo (every still).
   */
  people?: DayIntimateMix;
  onPeopleChange?: (next: DayIntimateMix) => void;
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
  partnerId = '',
  partnerOptions = [],
  onPartnerChange,
  partnerTwoWomen = false,
  leadNoun = 'woman',
  partnerStandInUrl,
  dayWeather = '',
  onDayWeatherChange,
  onNewPartnerStandIn,
  posePriority = true,
  onPosePriorityChange,
  identityBoost = false,
  onIdentityBoostChange,
  faceFinish = false,
  onFaceFinishChange,
  faceFinishStatus = null,
  autoReviewStills = false,
  onAutoReviewStillsChange,
  qualityStatus = null,
  dayMood = 'everyday',
  onDayMoodChange,
  intimateMix = 'mixed',
  onIntimateMixChange,
  people,
  onPeopleChange,
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
  // Themes (Date night, Night out…) sit between the clothed moods and the adult ones.
  const activeMood: DayMoodSetting = dayThemeOf(dayMood)?.id ?? mood;
  // Two rows: what kind of day (everyday, sport, themes…) and how much heat (Suggestive and up).
  const isHeatMood = (id: DayMoodSetting) => id === 'suggestive' || isDayAdultMood(id);
  const moodGroups: Array<{
    label: string;
    options: Array<{ id: DayMoodSetting; label: string; hint: string }>;
  }> = [
    {
      label: 'Kind of day',
      options: [...DAY_MOOD_OPTIONS.filter(option => !isHeatMood(option.id)), ...DAY_THEME_OPTIONS],
    },
    {
      label: 'Heat',
      options: DAY_MOOD_OPTIONS.filter(
        option => isHeatMood(option.id) && (intimateEnabled || !isDayAdultMood(option.id))
      ),
    },
  ];
  const leadPronoun = leadNoun === 'man' ? 'him' : 'her';
  const showAdultMix = isDayAdultMood(mood) && Boolean(onIntimateMixChange) && !onPeopleChange;
  const peopleValue: DayIntimateMix =
    people ?? (isDayAdultMood(mood) ? mix : allowCompanions ? 'mixed' : 'solo');
  const adultPeople = isDayAdultMood(mood);
  const peopleOptions: Array<{ id: DayIntimateMix; label: string; hint: string }> = [
    {
      id: 'solo',
      label: 'Solo',
      hint: adultPeople ? 'One adult only' : `Just ${leadPronoun} — no second person in any still`,
    },
    {
      id: 'mixed',
      label: 'Mixed',
      hint: adultPeople
        ? 'Solo and duo adult beats'
        : 'Some stills with a friend or partner (different face from Cast)',
    },
    {
      id: 'duo',
      label: 'Duo',
      hint: adultPeople ? 'Partner scenes only' : 'Every still with a friend or partner',
    },
  ];
  // Partner: whenever a still can have two people — companions on, or an adult mood not set to Solo.
  const duoPossible = onPeopleChange
    ? peopleValue !== 'solo'
    : allowCompanions || (isDayAdultMood(mood) && mix !== 'solo');
  const showPartner = Boolean(onPartnerChange) && duoPossible;
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
          <span className={`${groupLabel} self-start pt-2`}>Mood</span>
          <div className="min-w-0 flex-1 space-y-1.5">
            {moodGroups.map(group => (
              <div
                key={group.label}
                className="ui-segmented"
                data-wrap="true"
                role="group"
                aria-label={group.label}
              >
                {group.options.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    className="ui-segmented-item"
                    aria-checked={activeMood === option.id}
                    data-active={activeMood === option.id ? 'true' : 'false'}
                    disabled={busy}
                    data-testid={`day-mood-${option.id}`}
                    title={option.hint}
                    onClick={() => onDayMoodChange(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {onDayWeatherChange ? (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1.5"
          role="radiogroup"
          aria-label="Weather"
          data-testid="day-weather"
        >
          <span className={groupLabel}>Weather</span>
          <div className="ui-segmented" data-wrap="true">
            {DAY_WEATHER_OPTIONS.map(option => (
              <button
                key={option.id || 'any'}
                type="button"
                role="radio"
                className="ui-segmented-item"
                aria-checked={dayWeather === option.id}
                data-active={dayWeather === option.id ? 'true' : 'false'}
                disabled={busy}
                data-testid={`day-weather-${option.id || 'any'}`}
                title={option.hint}
                onClick={() => onDayWeatherChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {onPeopleChange ? (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1.5"
          role="radiogroup"
          aria-label="People in each still"
          data-testid="day-intimate-mix"
        >
          <span className={groupLabel}>People</span>
          <div className="ui-segmented" data-wrap="true">
            {peopleOptions.map(option => (
              <button
                key={option.id}
                type="button"
                role="radio"
                className="ui-segmented-item"
                aria-checked={peopleValue === option.id}
                data-active={peopleValue === option.id ? 'true' : 'false'}
                disabled={busy}
                data-testid={`day-intimate-mix-${option.id}`}
                title={option.hint}
                onClick={() => onPeopleChange(option.id)}
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
      {(onAllowCompanionsChange && !onPeopleChange) ||
      onPosePriorityChange ||
      onAutoReviewStillsChange ? (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1"
          role="group"
          aria-label="Day options"
          data-testid="day-options"
        >
          <span className={groupLabel}>Options</span>
          {onAllowCompanionsChange && !onPeopleChange ? (
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
          {onIdentityBoostChange ? (
            <SwitchButton
              checked={identityBoost}
              disabled={busy}
              data-testid="day-identity-boost"
              title="Walking, dancing and leaning stills also look at the full plate for the face. Closer likeness, but now and then a second person or the plate's outfit sneaks in — best with Auto-review stills on."
              onChange={onIdentityBoostChange}
            >
              Face boost
            </SwitchButton>
          ) : null}
          {onFaceFinishChange ? (
            <SwitchButton
              checked={faceFinish}
              disabled={busy}
              data-testid="day-face-finish"
              title="After each still lands, re-render just her face against the Cast face crop (on a two-person still only the lead's face, kept only when it comes out closer) — sharper eyes and a closer likeness on small full-body faces. Works on any engine's stills (uses Qwen Edit 2511 or Klein 9B Distilled); adds a few seconds per still."
              onChange={onFaceFinishChange}
            >
              Face finish
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
      {identityBoost && !autoReviewStills ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-identity-boost-hint">
          Face boost is on — turn on Auto-review stills so the odd extra person or borrowed outfit
          gets rerolled.
        </p>
      ) : null}
      {faceFinish && faceFinishStatus ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-face-finish-status">
          {faceFinishStatus}
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
      {showPartner && onPartnerChange ? (
        <div
          className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-x-2"
          data-testid="day-partner"
        >
          <span className={`${groupLabel} sm:pt-6`}>Partner</span>
          <DayPartnerPicker
            value={partner ? partner.id : ''}
            options={partnerOptions}
            standInUrl={partnerStandInUrl}
            disabled={busy}
            onChange={onPartnerChange}
          />
        </div>
      ) : null}
      {showPartner && partner ? (
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
      ) : null}
      {showPartner && partner?.invented && onNewPartnerStandIn ? (
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
        </div>
      ) : null}
      {showPartner && partner ? null : (
          onPeopleChange ? duoPossible && !isDayAdultMood(mood) : allowCompanions
        ) ? (
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
              ? 'Intimate duo — every still is a partner scene.'
              : 'Intimate mixed — solo and partner beats.'}
        </p>
      ) : null}
      {mood === 'raunchy' ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-mood-hint">
          {mix === 'solo'
            ? 'Raunchy solo — wardrobe fails as the setup; crude self-touch is the punchline.'
            : mix === 'duo'
              ? 'Raunchy duo — slapstick sex and partner comedy.'
              : 'Raunchy mixed — wardrobe fails and slapstick sex.'}
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
