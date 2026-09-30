/**
 * Day weather / season: one choice layered on any mood. It rides on the slot's Setting (the
 * SCENE lead, SETTING line and recipe room all read it), phrased for outdoor places ("wet
 * pavement, a clear umbrella") or indoor ones ("rain streaking the windows").
 */

export type DayWeather = 'rain' | 'snow' | 'autumn' | 'summer';

export const DAY_WEATHER_OPTIONS: Array<{ id: DayWeather | ''; label: string; hint: string }> = [
  { id: '', label: 'Any', hint: 'Whatever the setting suggests' },
  { id: 'rain', label: 'Rain', hint: 'Wet streets, umbrellas, rain on the windows' },
  { id: 'snow', label: 'Snow', hint: 'Snowfall, winter coats outdoors, cozy light inside' },
  { id: 'autumn', label: 'Autumn', hint: 'Falling leaves, low golden sun' },
  { id: 'summer', label: 'Summer', hint: 'Bright hard sun and heat' },
];

export function normalizeDayWeather(value: unknown): DayWeather | null {
  return value === 'rain' || value === 'snow' || value === 'autumn' || value === 'summer'
    ? value
    : null;
}

const OUTDOOR_RE =
  /\b(?:street|sidewalk|pavement|crosswalk|alley|park|garden|beach|shore|pier|promenade|riverside|river|rooftop|terrace|balcony|patio|courtyard|forest|clearing|trail|mountain|field|market|plaza|square|steps|outside|outdoors?|harbou?r|dock|boardwalk|campsite|lake|pool|stadium|court|track|pitch|city)\b/i;
/** Rooms that name an outdoor view ("taxi … city lights outside") are still indoors. */
const INDOOR_ANCHOR_RE =
  /\b(?:bedroom|bathroom|kitchen|living room|taxi|car|hotel room|booth|studio|hall|lobby)\b/i;

export function dayWeatherIsOutdoor(setting: string): boolean {
  return OUTDOOR_RE.test(setting) && !INDOOR_ANCHOR_RE.test(setting);
}

const PHRASES: Record<DayWeather, { outdoor: string; indoor: string }> = {
  rain: {
    outdoor:
      'on a rainy day — wet pavement with reflections, soft overcast light, raindrops, a clear umbrella or a light raincoat over the outfit',
    indoor: 'on a rainy day — rain streaking the windows, soft gray daylight, cozy lamps on',
  },
  snow: {
    outdoor:
      'in falling snow — snow on the ground and rooftops, cold blue light, a warm winter coat and scarf over the outfit',
    indoor: 'on a snowy day — snow falling outside the windows, warm cozy light inside',
  },
  autumn: {
    outdoor: 'in autumn — orange and gold leaves on the trees and ground, low warm sun',
    indoor: 'in autumn — low golden light through the windows, autumn leaves outside',
  },
  summer: {
    outdoor: 'on a hot summer day — bright hard sunlight, deep shadows, clear blue sky',
    indoor: 'on a hot summer day — bright sun through open windows, warm light',
  },
};

/** The setting with the day's weather on it (unchanged with no weather or no setting). */
export function withDayWeather(
  setting: string | null | undefined,
  weather: unknown
): string | undefined {
  const place = setting?.trim();
  const kind = normalizeDayWeather(weather);
  if (!place || !kind) {
    return place || undefined;
  }
  const phrase = PHRASES[kind][dayWeatherIsOutdoor(place) ? 'outdoor' : 'indoor'];
  return `${place.replace(/[.\s]+$/, '')}, ${phrase}`;
}
