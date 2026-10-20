export type SportPreset = {
  id: string;
  label: string;
  hints: string;
  portraitStyle?: 'portrait' | 'full-body' | 'action';
  duo?: boolean;
  teamKit?: boolean;
  category: 'cycling' | 'running' | 'team' | 'combat' | 'other';
};

export const SPORT_PRESETS: readonly SportPreset[] = [
  {
    id: 'gravel-duo-race',
    label: 'Gravel duo race',
    hints: 'two female gravel cyclists in a fierce competition on a muddy doubletrack',
    portraitStyle: 'action',
    duo: true,
    teamKit: false,
    category: 'cycling',
  },
  {
    id: 'gravel-solo',
    label: 'Gravel solo',
    hints: 'gravel cyclist on a fire road climb, adventure ride',
    portraitStyle: 'action',
    category: 'cycling',
  },
  {
    id: 'road-crit',
    label: 'Road criterium',
    hints: 'road cyclist in a criterium sprint on wet pavement',
    portraitStyle: 'action',
    category: 'cycling',
  },
  {
    id: 'mtb-descent',
    label: 'MTB descent',
    hints: 'mountain biker on a rocky singletrack descent',
    portraitStyle: 'action',
    category: 'cycling',
  },
  {
    id: 'cx-race',
    label: 'Cyclocross',
    hints: 'cyclocross racer shouldering the bike over a muddy barrier',
    portraitStyle: 'action',
    category: 'cycling',
  },
  {
    id: 'track-sprint',
    label: 'Track sprint',
    hints: 'track cyclist sprinting on a velodrome banking turn',
    portraitStyle: 'action',
    category: 'cycling',
  },
  {
    id: 'marathon-solo',
    label: 'Marathon solo',
    hints: 'marathon runner on a city bridge at dawn, race bib, running singlet and shorts',
    portraitStyle: 'action',
    category: 'running',
  },
  {
    id: 'trail-run-solo',
    label: 'Trail run',
    hints: 'trail runner on a muddy forest singletrack, reflective vest, trail running shoes',
    portraitStyle: 'action',
    category: 'running',
  },
  {
    id: 'sprint-blocks',
    label: 'Sprint blocks',
    hints: 'sprinter in starting blocks on a rubber track, lane lines, explosive launch',
    portraitStyle: 'action',
    category: 'running',
  },
  {
    id: 'basketball-duo',
    label: 'Basketball 1v1',
    hints: 'two women in a fierce one-on-one basketball competition on court',
    portraitStyle: 'action',
    duo: true,
    category: 'team',
  },
  {
    id: 'soccer-duo',
    label: 'Soccer duel',
    hints: 'two players in fierce competition for the ball on a rain-soaked pitch',
    portraitStyle: 'action',
    duo: true,
    category: 'team',
  },
  {
    id: 'running-duo',
    label: 'Track duel',
    hints: 'two runners in fierce shoulder-to-shoulder track competition on a rubber track',
    portraitStyle: 'action',
    duo: true,
    category: 'running',
  },
  {
    id: 'marathon-duo',
    label: 'Marathon duel',
    hints: 'two marathon runners in fierce shoulder-to-shoulder competition on a city course',
    portraitStyle: 'action',
    duo: true,
    category: 'running',
  },
  {
    id: 'trail-run-duo',
    label: 'Trail run duo',
    hints: 'two trail runners racing side by side on a narrow muddy singletrack',
    portraitStyle: 'action',
    duo: true,
    category: 'running',
  },
  {
    id: 'relay-handoff',
    label: 'Relay handoff',
    hints: 'two runners in a fierce relay baton exchange on a track curve',
    portraitStyle: 'action',
    duo: true,
    category: 'running',
  },
  {
    id: 'martial-spar',
    label: 'Martial arts spar',
    hints: 'two martial artists in fierce sparring competition in the dojo',
    portraitStyle: 'action',
    duo: true,
    category: 'combat',
  },
];

export function getSportPreset(id: string): SportPreset | undefined {
  return SPORT_PRESETS.find(preset => preset.id === id);
}

export function sportPresetsByCategory(category: SportPreset['category']): SportPreset[] {
  return SPORT_PRESETS.filter(preset => preset.category === category);
}

export function sportPresetsForMode(mode: 'solo' | 'duo' | 'all' = 'all'): SportPreset[] {
  if (mode === 'all') {
    return [...SPORT_PRESETS];
  }
  if (mode === 'duo') {
    return SPORT_PRESETS.filter(preset => preset.duo === true);
  }
  return SPORT_PRESETS.filter(preset => !preset.duo);
}

/** True when `id` is one of the curated sport starter presets (not a scene/gen id). */
export function isSportStarterPreset(id: string): boolean {
  return SPORT_PRESETS.some(preset => preset.id === id);
}
