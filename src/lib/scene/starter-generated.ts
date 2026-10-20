import type { SceneStarterCategory, SceneStarterPreset } from './starter-types';

type PortraitStyle = NonNullable<SceneStarterPreset['portraitStyle']>;

type GeneratedSpec = {
  label: string;
  hints: string;
  portraitStyle?: PortraitStyle;
  duo?: boolean;
  teamKit?: boolean;
  tags?: string[];
};

function crossProduct(
  category: SceneStarterCategory,
  idPrefix: string,
  axes: { name: string; values: string[] }[],
  build: (picked: Record<string, string>, index: number) => GeneratedSpec | null,
  limit: number
): SceneStarterPreset[] {
  if (axes.length === 0) {
    return [];
  }

  const results: SceneStarterPreset[] = [];
  const indices = new Array(axes.length).fill(0);

  while (results.length < limit) {
    const picked: Record<string, string> = {};
    for (let axisIndex = 0; axisIndex < axes.length; axisIndex += 1) {
      picked[axes[axisIndex]!.name] = axes[axisIndex]!.values[indices[axisIndex]!]!;
    }

    const spec = build(picked, results.length);
    if (spec) {
      results.push({
        id: `${idPrefix}-${String(results.length + 1).padStart(3, '0')}`,
        category,
        ...spec,
      });
    }

    let carry = axes.length - 1;
    while (carry >= 0) {
      indices[carry] += 1;
      if (indices[carry]! < axes[carry]!.values.length) {
        break;
      }
      indices[carry] = 0;
      carry -= 1;
    }
    if (carry < 0) {
      break;
    }
  }

  return results;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildGeneratedSceneStarters(): SceneStarterPreset[] {
  const portrait = crossProduct(
    'portrait',
    'gen-portrait',
    [
      {
        name: 'look',
        values: [
          'soft natural',
          'editorial beauty',
          'film noir',
          'high-fashion',
          'documentary candid',
          'retro vintage',
          'minimal clean',
          'dramatic chiaroscuro',
        ],
      },
      {
        name: 'light',
        values: [
          'window light',
          'golden hour backlight',
          'overcast open shade',
          'single hard key',
          'ring-light glam',
          'blue hour ambient',
        ],
      },
    ],
    ({ look, light }) => ({
      label: `${titleCase(look)} · ${titleCase(light)}`,
      hints: `${look} portrait with ${light}, shallow depth of field, expressive eyes, natural skin texture`,
      portraitStyle: 'portrait',
      tags: ['editorial', 'studio'],
    }),
    28
  );

  const urban = crossProduct(
    'urban',
    'gen-urban',
    [
      {
        name: 'place',
        values: [
          'rooftop',
          'neon alley',
          'glass atrium',
          'subway platform',
          'parking garage',
          'riverwalk',
          'night market',
          'fire escape',
        ],
      },
      {
        name: 'time',
        values: [
          'at blue hour',
          'during rain',
          'at golden hour',
          'late at night',
          'on overcast afternoon',
          'at early dawn',
        ],
      },
    ],
    ({ place, time }) => ({
      label: `${titleCase(place)} ${time}`,
      hints: `person in a ${place} ${time}, cinematic urban depth, detailed architecture, atmospheric perspective`,
      portraitStyle: 'full-body',
      tags: ['outdoor', 'moody'],
    }),
    28
  );

  const nature = crossProduct(
    'nature',
    'gen-nature',
    [
      {
        name: 'biome',
        values: [
          'alpine meadow',
          'redwood forest',
          'desert canyon',
          'coastal cliff',
          'tropical waterfall',
          'lavender field',
          'snowy pine ridge',
          'prairie grassland',
        ],
      },
      {
        name: 'weather',
        values: [
          'in clear morning light',
          'under moody storm clouds',
          'with rolling fog',
          'at golden sunset',
          'after fresh snowfall',
          'with light rain mist',
        ],
      },
    ],
    ({ biome, weather }) => ({
      label: `${titleCase(biome)} · ${titleCase(weather)}`,
      hints: `${biome} ${weather}, rich natural textures, layered depth, crisp environmental detail`,
      portraitStyle: 'full-body',
      tags: ['outdoor'],
    }),
    32
  );

  const lifestyle = crossProduct(
    'lifestyle',
    'gen-lifestyle',
    [
      {
        name: 'activity',
        values: [
          'reading in a café',
          'journaling at a desk',
          'stretching on a yoga mat',
          'browsing a bookstore',
          'watering balcony plants',
          'sketching in a notebook',
          'packing for travel',
          'playing vinyl records',
        ],
      },
      {
        name: 'mood',
        values: [
          'calm morning routine',
          'lazy weekend afternoon',
          'focused creative flow',
          'social weekend outing',
        ],
      },
    ],
    ({ activity, mood }) => ({
      label: `${titleCase(activity)} · ${titleCase(mood)}`,
      hints: `person ${activity}, ${mood}, authentic candid moment, warm natural light`,
      portraitStyle: 'portrait',
      tags: ['candid', 'indoor'],
    }),
    28
  );

  const fashion = crossProduct(
    'fashion',
    'gen-fashion',
    [
      {
        name: 'style',
        values: [
          'minimal tailoring',
          'streetwear layers',
          'flowing evening gown',
          'utility cargo look',
          'monochrome suit',
          'bohemian maxi dress',
          'leather and denim',
          'avant-garde silhouette',
        ],
      },
      {
        name: 'set',
        values: [
          'white cyclorama',
          'industrial warehouse',
          'sunlit concrete stairs',
          'mirror-filled dressing room',
        ],
      },
    ],
    ({ style, set }) => ({
      label: `${titleCase(style)} · ${titleCase(set)}`,
      hints: `fashion editorial, ${style} on ${set}, confident pose, polished styling, magazine-ready framing`,
      portraitStyle: 'full-body',
      tags: ['editorial', 'studio'],
    }),
    24
  );

  const scifi = crossProduct(
    'scifi',
    'gen-scifi',
    [
      {
        name: 'world',
        values: [
          'orbital habitat ring',
          'neon megacity slum',
          'terraforming colony',
          'abandoned research lab',
          'cryogenic vault',
          'floating sky platform',
          'asteroid mining bay',
          'bioluminescent jungle dome',
        ],
      },
      {
        name: 'element',
        values: [
          'with holographic UI',
          'with drifting ash particles',
          'with volumetric god rays',
          'under crimson emergency lights',
        ],
      },
    ],
    ({ world, element }) => ({
      label: `${titleCase(world)} · ${titleCase(element)}`,
      hints: `${world} ${element}, futuristic materials, cinematic sci-fi scale, detailed atmosphere`,
      portraitStyle: 'full-body',
      tags: ['moody', 'outdoor'],
    }),
    20
  );

  const cozy = crossProduct(
    'cozy',
    'gen-cozy',
    [
      {
        name: 'space',
        values: [
          'reading nook',
          'rainy window seat',
          'wood-stove cabin corner',
          'string-light bedroom',
          'small bakery counter',
          'tea house booth',
          'knitted blanket sofa',
          'book-lined study',
        ],
      },
      {
        name: 'moment',
        values: [
          'with steam rising from a mug',
          'while soft jazz plays',
          'as rain taps the glass',
          'in amber lamp glow',
        ],
      },
    ],
    ({ space, moment }) => ({
      label: `${titleCase(space)} · ${titleCase(moment)}`,
      hints: `${space} ${moment}, intimate hygge mood, tactile textures, warm inviting light`,
      tags: ['cozy', 'indoor'],
    }),
    20
  );

  const duo = crossProduct(
    'lifestyle',
    'gen-duo',
    [
      {
        name: 'scene',
        values: [
          'sharing coffee at a corner table',
          'laughing on a park bench',
          'walking through a night market',
          'hiking a forest trail',
          'dancing in a dim studio',
          'cooking together at home',
          'window-shopping downtown',
          'waiting at a train platform',
        ],
      },
      {
        name: 'tone',
        values: [
          'candid and playful',
          'quiet and intimate',
          'energetic and competitive',
          'stylish editorial',
        ],
      },
    ],
    ({ scene, tone }) => ({
      label: `${titleCase(scene)} · ${titleCase(tone)}`,
      hints: `two people ${scene}, ${tone}, balanced interaction, natural body language, cinematic framing`,
      portraitStyle: 'portrait',
      duo: true,
      tags: ['duo', 'candid'],
    }),
    20
  );

  const sportStyle = crossProduct(
    'sport',
    'gen-sport-solo',
    [
      {
        name: 'sport',
        values: [
          'open-water swimmer',
          'rock climber',
          'skateboarder',
          'surfer',
          'tennis player',
          'boxer training',
          'rower on a lake',
          'skier in powder',
        ],
      },
      {
        name: 'beat',
        values: [
          'mid-action peak moment',
          'pre-start focused tension',
          'celebratory finish',
          'rain-soaked gritty effort',
        ],
      },
    ],
    ({ sport, beat }) => ({
      label: `${titleCase(sport)} · ${titleCase(beat)}`,
      hints: `${sport} ${beat}, dynamic sports photography, muscle tension, environmental context`,
      portraitStyle: 'action',
      tags: ['action', 'outdoor'],
    }),
    20
  );

  return [
    ...portrait,
    ...urban,
    ...nature,
    ...lifestyle,
    ...fashion,
    ...scifi,
    ...cozy,
    ...duo,
    ...sportStyle,
  ];
}
