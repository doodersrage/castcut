'use client';

import QualityPresetSegments from '@/components/ui/QualityPresetSegments';
import { SelectInput } from '@/components/ui/Field';
import {
  DAY_QUALITY_PRESET_OPTIONS,
  type DayQualityPreset,
  type DayQualityPresetChoice,
} from '@/lib/day/quality-preset';
import { DAY_THEME_OPTIONS, dayThemeOf } from '@/lib/day/themes';
import { DAY_WEATHER_OPTIONS } from '@/lib/day/weather';
import type { DayPartnerNoun } from '@/lib/day/partner';
import {
  DAY_INTIMATE_PLAYFUL_HINT,
  DAY_INTIMATE_PLAYFUL_LABEL,
  DAY_LENGTHS,
  DAY_MOOD_OPTIONS,
  DEFAULT_DAY_LENGTH,
  dayPickerMood,
  isDayAdultMood,
  normalizeDayMood,
  type DayIntimateMix,
  type DayLength,
  type DayMoodSetting,
} from '@/lib/day/planner';

export type DayPlanBarProps = {
  busy?: boolean;
  dayLength?: DayLength;
  onDayLengthChange: (next: DayLength) => void;
  /** The mood flavor: `'raunchy'` shows as Intimate with Playful on. */
  dayMood: DayMoodSetting;
  onDayMoodChange: (next: DayMoodSetting) => void;
  /** Intimate's Playful toggle (crude sexual comedy — once the Raunchy mood). */
  onIntimatePlayfulChange?: (next: boolean) => void;
  /** When false, Intimate is hidden (NSFW generator env off). */
  intimateEnabled: boolean;
  people: DayIntimateMix;
  onPeopleChange: (next: DayIntimateMix) => void;
  leadNoun?: DayPartnerNoun;
  /** Weather / season on every setting ('' = whatever the setting says). */
  dayWeather: string;
  onDayWeatherChange: (next: string) => void;
  qualityPreset: DayQualityPresetChoice;
  onQualityPresetChange: (next: DayQualityPreset) => void;
  /** "Best render · Face finish · …" for the current preset. */
  qualitySummary: string;
  advancedOpen: boolean;
  onAdvancedToggle: () => void;
  advancedId: string;
  className?: string;
  /** The Stills (Day length) control — Scene has one shot, so it leaves it out. */
  showLength?: boolean;
  /** The bar's test id (Scene: its own). */
  testId?: string;
};

const isHeatMood = (id: DayMoodSetting) => id === 'suggestive' || isDayAdultMood(id);

/** One line on what the picked mood does to the plan (the NSFW flag note is the mood's title). */
export function DayMoodHints({
  dayMood,
  intimateMix,
}: {
  dayMood: DayMoodSetting;
  intimateMix: DayIntimateMix;
  intimateEnabled?: boolean;
}) {
  const mood = normalizeDayMood(dayMood);
  const mix = intimateMix;
  const hint =
    mood === 'suggestive'
      ? 'Suggestive heat — clothed innuendo; Suggest day / Queue day mix spicy beats.'
      : mood === 'sport'
        ? 'Sport — each slot picks a sport that fits that time of day (including swim, volleyball, boxing, surfing, and cycling road/gravel/MTB/CX/track), mid-action pose + athletic kit (Outfit Keep dress is discarded for the kit).'
        : mood === 'vacation'
          ? 'Vacation — mixed energy: RELAXING + active (swim, kick, bike, toss, jump, dance, climb); Suggest day spreads pose classes so you don’t get three mid-strides.'
          : mood === 'intimate'
            ? mix === 'solo'
              ? 'Intimate solo — one adult; self-touch / undress beats.'
              : mix === 'duo'
                ? 'Intimate duo — every still is a partner scene.'
                : 'Intimate mixed — solo and partner beats.'
            : mood === 'raunchy'
              ? mix === 'solo'
                ? 'Intimate · Playful solo — wardrobe fails as the setup; crude self-touch is the punchline.'
                : mix === 'duo'
                  ? 'Intimate · Playful duo — slapstick sex and partner comedy.'
                  : 'Intimate · Playful mixed — wardrobe fails and slapstick sex.'
              : null;
  return (
    <>
      {hint ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-mood-hint">
          {hint}
        </p>
      ) : null}
    </>
  );
}

/**
 * The Day's plan on one line: Stills · Mood · People · Weather · Quality · Advanced. These are
 * chosen once per Day, so they sit above the board; what is about one slot lives in its sheet,
 * and the check switches behind Advanced.
 */
export default function DayPlanBar({
  busy = false,
  dayLength = DEFAULT_DAY_LENGTH,
  onDayLengthChange,
  dayMood,
  onDayMoodChange,
  onIntimatePlayfulChange,
  intimateEnabled,
  people,
  onPeopleChange,
  leadNoun = 'woman',
  dayWeather,
  onDayWeatherChange,
  qualityPreset,
  onQualityPresetChange,
  qualitySummary,
  advancedOpen,
  onAdvancedToggle,
  advancedId,
  className = '',
  showLength = true,
  testId = 'day-plan-bar',
}: DayPlanBarProps) {
  // Intimate · Playful (the 'raunchy' flavor) is Intimate in the picker with Playful on.
  const picked = dayPickerMood(normalizeDayMood(dayMood));
  const mood = picked.mood;
  // Themes (Date night, Night out…) sit between the clothed moods and the adult ones.
  const activeMood: DayMoodSetting = dayThemeOf(dayMood)?.id ?? mood;
  const showPlayful =
    activeMood === 'intimate' && intimateEnabled && Boolean(onIntimatePlayfulChange);
  const kindOptions = [
    ...DAY_MOOD_OPTIONS.filter(option => !isHeatMood(option.id)),
    ...DAY_THEME_OPTIONS,
  ];
  const heatOptions = DAY_MOOD_OPTIONS.filter(
    option => isHeatMood(option.id) && (intimateEnabled || !isDayAdultMood(option.id))
  );
  const adultPeople = isDayAdultMood(mood);
  const leadPronoun = leadNoun === 'man' ? 'him' : 'her';
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
  const groupLabel = 'type-caption shrink-0 text-[var(--text-muted)]';
  const group = 'flex items-center gap-x-2';

  return (
    <div className={className} data-testid={testId}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2">
        {showLength ? (
          <div className={group} role="group" aria-label="Day length" data-testid="day-length">
            <span className={groupLabel}>Stills</span>
            <div className="ui-segmented">
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
        <label className={group}>
          <span className={groupLabel}>Mood</span>
          <SelectInput
            value={activeMood}
            disabled={busy}
            aria-label="Day mood"
            data-testid="day-mood"
            title={
              intimateEnabled
                ? undefined
                : 'Intimate is off on this install — an admin turns it on in the server’s settings.'
            }
            className="!w-auto"
            onChange={event => onDayMoodChange(event.target.value as DayMoodSetting)}
          >
            <optgroup label="Kind of day">
              {kindOptions.map(option => (
                <option
                  key={option.id}
                  value={option.id}
                  title={option.hint}
                  data-testid={`day-mood-${option.id}`}
                >
                  {option.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Heat">
              {heatOptions.map(option => (
                <option
                  key={option.id}
                  value={option.id}
                  title={option.hint}
                  data-testid={`day-mood-${option.id}`}
                >
                  {option.label}
                </option>
              ))}
            </optgroup>
          </SelectInput>
        </label>
        <div
          className={group}
          role="radiogroup"
          aria-label="People in each still"
          data-testid="day-intimate-mix"
        >
          <span className={groupLabel}>People</span>
          <div className="ui-segmented">
            {peopleOptions.map(option => (
              <button
                key={option.id}
                type="button"
                role="radio"
                className="ui-segmented-item"
                aria-checked={people === option.id}
                data-active={people === option.id ? 'true' : 'false'}
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
        {showPlayful ? (
          <div className={group} data-testid="day-intimate-playful-group">
            <div className="ui-segmented">
              <button
                type="button"
                className="ui-segmented-item"
                aria-pressed={picked.playful}
                data-active={picked.playful ? 'true' : 'false'}
                disabled={busy}
                data-testid="day-intimate-playful"
                title={DAY_INTIMATE_PLAYFUL_HINT}
                onClick={() => onIntimatePlayfulChange?.(!picked.playful)}
              >
                {DAY_INTIMATE_PLAYFUL_LABEL}
              </button>
            </div>
          </div>
        ) : null}
        <label className={group}>
          <span className={groupLabel}>Weather</span>
          <SelectInput
            value={dayWeather}
            disabled={busy}
            aria-label="Weather"
            data-testid="day-weather"
            className="!w-auto"
            onChange={event => onDayWeatherChange(event.target.value)}
          >
            {DAY_WEATHER_OPTIONS.map(option => (
              <option
                key={option.id || 'any'}
                value={option.id}
                title={option.hint}
                data-testid={`day-weather-${option.id || 'any'}`}
              >
                {option.label}
              </option>
            ))}
          </SelectInput>
        </label>
        {/* What the preset does is its hover text, not a line under the bar (UI review 2026-10-15). */}
        <div className={group} title={qualitySummary} data-testid="day-quality-summary">
          <span className={groupLabel}>Quality</span>
          <QualityPresetSegments
            label="Quality"
            options={DAY_QUALITY_PRESET_OPTIONS}
            value={qualityPreset}
            disabled={busy}
            testId="day-quality-preset"
            onChange={onQualityPresetChange}
          />
        </div>
        <button
          type="button"
          className="ui-text-link type-caption"
          aria-expanded={advancedOpen}
          aria-controls={advancedId}
          data-testid="day-quality-advanced"
          onClick={onAdvancedToggle}
        >
          Advanced {advancedOpen ? '▴' : '▾'}
        </button>
      </div>
    </div>
  );
}
