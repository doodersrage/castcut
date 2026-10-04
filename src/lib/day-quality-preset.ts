import type { QueueQualityProfile } from './queue-quality-profile';

/**
 * Day's one Quality control: Fast / Balanced / Best. A preset is a render quality (the Engine's
 * Good / Best, written to Day's tool queue profile) plus the check switches that used to sit in
 * a row of seven under the board. The preset is never stored — it is read back from the
 * switches, and shows as Custom when they match none (an Advanced-drawer edit).
 *
 * Not part of the preset: Pose over plate (a plate-stance choice, default on) and the
 * adult-appearance gate (always on).
 */

export type DayRenderQuality = 'good' | 'best';

export type DayQualityPreset = 'fast' | 'balanced' | 'best';

export type DayQualityPresetChoice = DayQualityPreset | 'custom';

export const DAY_QUALITY_CHECK_KEYS = [
  'identityBoost',
  'faceFinish',
  'autoReviewStills',
  'redoPoseMisses',
  'bestOfTwoHardPoses',
  'bestEnginePerPose',
] as const;

export type DayQualityCheckKey = (typeof DAY_QUALITY_CHECK_KEYS)[number];

export type DayQualityChecks = Record<DayQualityCheckKey, boolean>;

export type DayQualitySettings = DayQualityChecks & { renderQuality: DayRenderQuality };

const NO_CHECKS: DayQualityChecks = {
  identityBoost: false,
  faceFinish: false,
  autoReviewStills: false,
  redoPoseMisses: false,
  bestOfTwoHardPoses: false,
  bestEnginePerPose: false,
};

export const DAY_QUALITY_PRESETS: Record<DayQualityPreset, DayQualitySettings> = {
  // A quick first pass: Good render, nothing checked afterwards.
  fast: { ...NO_CHECKS, renderQuality: 'good' },
  // The default: Best render, the lead's face re-rendered, a pose miss redone once, and a pose
  // the engine keeps missing rendered on the engine that holds it.
  balanced: {
    ...NO_CHECKS,
    renderQuality: 'best',
    faceFinish: true,
    redoPoseMisses: true,
    bestEnginePerPose: true,
  },
  // Balanced plus the vision review, a second take on hard poses and the full-plate face boost.
  best: {
    renderQuality: 'best',
    identityBoost: true,
    faceFinish: true,
    autoReviewStills: true,
    redoPoseMisses: true,
    bestOfTwoHardPoses: true,
    bestEnginePerPose: true,
  },
};

export const DEFAULT_DAY_QUALITY_PRESET: DayQualityPreset = 'balanced';

export const DAY_QUALITY_PRESET_OPTIONS: Array<{
  id: DayQualityPreset;
  label: string;
  hint: string;
}> = [
  { id: 'fast', label: 'Fast', hint: 'Good render, no extra checks — a quick first pass.' },
  {
    id: 'balanced',
    label: 'Balanced',
    hint: 'Best render · Face finish · Redo pose misses once · Pick the best engine per pose.',
  },
  {
    id: 'best',
    label: 'Best',
    hint: 'Balanced plus Auto-review stills, Best of two for hard poses and Face boost — needs a vision model and DWPose.',
  },
];

const CHECK_LABELS: Record<DayQualityCheckKey, string> = {
  identityBoost: 'Face boost',
  faceFinish: 'Face finish',
  autoReviewStills: 'Auto-review stills',
  redoPoseMisses: 'Redo pose misses once',
  bestOfTwoHardPoses: 'Best of two for hard poses',
  bestEnginePerPose: 'Pick the best engine per pose',
};

export function dayQualityPresetSettings(preset: DayQualityPreset): DayQualitySettings {
  return { ...DAY_QUALITY_PRESETS[preset] };
}

/** The preset these settings spell, or Custom when they match none. */
export function deriveDayQualityPreset(settings: DayQualitySettings): DayQualityPresetChoice {
  for (const preset of ['fast', 'balanced', 'best'] as const) {
    const candidate = DAY_QUALITY_PRESETS[preset];
    if (
      candidate.renderQuality === settings.renderQuality &&
      DAY_QUALITY_CHECK_KEYS.every(key => candidate[key] === settings[key])
    ) {
      return preset;
    }
  }
  return 'custom';
}

export function dayQualityPresetLabel(choice: DayQualityPresetChoice): string {
  if (choice === 'custom') return 'Custom';
  return DAY_QUALITY_PRESET_OPTIONS.find(option => option.id === choice)?.label ?? choice;
}

/**
 * The Engine's quality profile as Day's two-way render quality. Best is the Engine's Best
 * (`max`); Good covers Good (`final`), Fast (`draft`, which every real queue promotes to Good
 * anyway) and Custom (`followSettings`).
 */
export function dayRenderQualityFromProfile(
  profile: QueueQualityProfile | undefined
): DayRenderQuality {
  return profile === 'max' ? 'best' : 'good';
}

export function dayRenderQualityProfile(quality: DayRenderQuality): QueueQualityProfile {
  return quality === 'best' ? 'max' : 'final';
}

export function dayRenderQualityLabel(quality: DayRenderQuality): string {
  return quality === 'best' ? 'Best' : 'Good';
}

/** Day's quality settings as stored: the tool switches plus Day's queue profile. */
export function dayQualitySettingsOf(
  tool: Partial<Record<DayQualityCheckKey, boolean | undefined>>,
  dayProfile: QueueQualityProfile | undefined
): DayQualitySettings {
  return {
    renderQuality: dayRenderQualityFromProfile(dayProfile),
    identityBoost: tool.identityBoost === true,
    faceFinish: tool.faceFinish === true,
    autoReviewStills: tool.autoReviewStills === true,
    redoPoseMisses: tool.redoPoseMisses === true,
    bestOfTwoHardPoses: tool.bestOfTwoHardPoses === true,
    bestEnginePerPose: tool.bestEnginePerPose === true,
  };
}

/** The tool-settings patch (the six switches) a preset writes — one write, not six. */
export function dayQualityChecksPatch(settings: DayQualitySettings): DayQualityChecks {
  return {
    identityBoost: settings.identityBoost,
    faceFinish: settings.faceFinish,
    autoReviewStills: settings.autoReviewStills,
    redoPoseMisses: settings.redoPoseMisses,
    bestOfTwoHardPoses: settings.bestOfTwoHardPoses,
    bestEnginePerPose: settings.bestEnginePerPose,
  };
}

/** "Best render · Face finish · Redo pose misses once" — what this Day will do. */
export function dayQualitySummary(settings: DayQualitySettings): string {
  const parts = [`${dayRenderQualityLabel(settings.renderQuality)} render`];
  for (const key of DAY_QUALITY_CHECK_KEYS) {
    if (settings[key]) parts.push(CHECK_LABELS[key]);
  }
  return parts.join(' · ');
}
