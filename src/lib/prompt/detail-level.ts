import { DEFAULT_COMFY_MODEL, getPromptLimits, type ComfyImageModel } from '../comfy-models/client';

export type DetailLevel = 'concise' | 'balanced' | 'rich';

export type DetailLimits = {
  minSentences: number;
  maxSentences: number;
  minChars?: number;
  maxChars: number;
  maxTokens: number;
  label: string;
};

const DETAIL_LABELS: Record<DetailLevel, string> = {
  concise: 'Concise',
  balanced: 'Balanced',
  rich: 'Rich',
};

export function normalizeDetailLevel(value?: string | null): DetailLevel {
  if (value === 'concise' || value === 'balanced' || value === 'rich') {
    return value;
  }
  return 'balanced';
}

export function getDetailLimits(
  detail: DetailLevel,
  model: ComfyImageModel = DEFAULT_COMFY_MODEL
): DetailLimits {
  return {
    ...getPromptLimits(detail, model),
    label: DETAIL_LABELS[detail],
  };
}

export function detailLevelLabel(detail: DetailLevel): string {
  return DETAIL_LABELS[detail];
}

export type FewShotExample = {
  input: string;
  output: string;
};

export const DISTINCT_PEOPLE_FEW_SHOT_INPUT = 'two women, rooftop bar, city lights';
export const GROUPED_COUPLE_FEW_SHOT_INPUT = 'tropical beach sunset, couple walking';

export const DISTINCT_PEOPLE_FEW_SHOT_BY_DETAIL: Record<DetailLevel, FewShotExample> = {
  concise: {
    input: DISTINCT_PEOPLE_FEW_SHOT_INPUT,
    output:
      'A rooftop bar at night, city lights below the glass railing. On the left, a young Black woman with box braids laughs; on the right, an older white woman with a silver bob listens.',
  },
  balanced: {
    input: DISTINCT_PEOPLE_FEW_SHOT_INPUT,
    output:
      'A rooftop bar at night, city lights spread below a glass railing. On the left, a young Black woman with box braids and a leather jacket laughs against the rail; on the right, an older white woman with a silver bob listens over a sweating glass.',
  },
  rich: {
    input: DISTINCT_PEOPLE_FEW_SHOT_INPUT,
    output:
      'A rooftop bar at night, city lights spread below a glass railing, warm amber fixtures glowing on polished wood. On the left, a young Black woman with box braids and a leather jacket laughs against the rail, a sweating glass in hand. On the right, an older white woman with a silver bob leans in to listen, city glow reflecting in her eyes. The skyline fades into haze beyond the rail.',
  },
};

export const GROUPED_COUPLE_FEW_SHOT_BY_DETAIL: Record<DetailLevel, FewShotExample> = {
  concise: {
    input: GROUPED_COUPLE_FEW_SHOT_INPUT,
    output:
      'A wide tropical beach at golden hour, orange light on turquoise water. A couple walks barefoot near the shoreline, wind lifting their clothes.',
  },
  balanced: {
    input: GROUPED_COUPLE_FEW_SHOT_INPUT,
    output:
      'A wide tropical beach at golden hour, orange light skimming turquoise water. A couple walks barefoot near the shoreline, wind lifting their clothes as soft pink clouds streak the sky.',
  },
  rich: {
    input: GROUPED_COUPLE_FEW_SHOT_INPUT,
    output:
      'A wide tropical beach at golden hour, orange light skimming turquoise water and wet sand. A couple walks barefoot near the shoreline, wind lifting their clothes as soft pink clouds streak the sky. Palm shadows stretch across the dunes behind them while distant waves fold into white foam.',
  },
};

export const QWEN_FEW_SHOT_BY_DETAIL: Record<DetailLevel, FewShotExample[]> = {
  concise: [
    {
      input: 'neon alley, rain, black cat',
      output:
        'A narrow cyberpunk alley at midnight, rain-slick asphalt mirroring neon signs. A black cat crouches on a fire escape, amber eyes catching the light.',
    },
    {
      input: 'gothic cathedral, candles, fog',
      output:
        'Inside a gothic cathedral, candlelight cuts through low fog above the aisle. Vaulted stone arches fade into shadow.',
    },
  ],
  balanced: [
    {
      input: 'neon alley, rain, black cat',
      output:
        'A narrow cyberpunk alley at midnight, rain-slick asphalt mirroring magenta and cyan neon signs. Steam curls from sidewalk grates between cracked pavement. A sleek black cat crouches on a rusted fire escape, amber eyes catching a stray beam of light.',
    },
    {
      input: 'gothic cathedral, candles, fog',
      output:
        'Inside a vast gothic cathedral, candle flames cut through low fog above worn flagstones. Vaulted stone arches fade into shadow. Stained glass throws fractured color across the aisle.',
    },
  ],
  rich: [
    {
      input: 'neon alley, rain, black cat',
      output:
        'A narrow cyberpunk alley at midnight, rain-slick asphalt mirroring magenta and cyan neon signs overhead. Steam curls from sidewalk grates between cracked pavement, wet brick walls dripping on both sides. In the midground, a sleek black cat crouches on a rusted fire escape, amber eyes catching a stray beam of light. Far down the alley, a faint red siren glow stains the hazy horizon.',
    },
    {
      input: 'gothic cathedral, candles, fog',
      output:
        'Inside a vast gothic cathedral, hundreds of candles line the central aisle, their warm flames cutting through low rolling fog. Worn flagstones catch fractured ruby and sapphire light from stained glass high above. Vaulted stone arches rise into shadow, dust motes drifting in the still air. Distant organ pipes fade into the dark upper nave, the space humming with quiet reverence.',
    },
  ],
};

export type { ComfyImageModel, QwenImageModel } from '../comfy-models/client';
