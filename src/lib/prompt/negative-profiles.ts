export type NegativeProfile = {
  id: string;
  label: string;
  hints?: string;
  sport?: string;
  preserveSubject?: boolean;
  extra?: string;
  /** When set, used verbatim instead of calling /api/negative. */
  staticPrompt?: string;
};

export const DEFAULT_NEGATIVE_PROFILES: NegativeProfile[] = [
  {
    id: 'general-sd',
    label: 'General SD / SDXL',
    hints: 'high quality scene',
    preserveSubject: true,
  },
  {
    id: 'qwen-general',
    label: 'Qwen · general',
    hints: 'qwen image quality',
    preserveSubject: true,
    staticPrompt:
      'blurry, low quality, distorted, deformed, watermark, text, logo, oversaturated, noisy grain',
  },
  {
    id: 'qwen-portrait',
    label: 'Qwen · portrait',
    hints: 'qwen portrait face skin',
    preserveSubject: true,
    staticPrompt:
      'blurry face, distorted hands, extra fingers, deformed anatomy, plastic skin, watermark, text, logo',
  },
  {
    id: 'portrait',
    label: 'Portrait',
    hints: 'portrait, face, skin texture',
    preserveSubject: true,
    extra:
      'deformed face, extra fingers, blurry eyes, plastic skin, waxy skin, airbrushed, doll-like',
  },
  {
    id: 'architecture',
    label: 'Architecture / interior',
    hints: 'architecture, interior, building',
    preserveSubject: false,
    extra: 'people, figures, text watermark',
  },
  {
    id: 'pet',
    label: 'Pet / animal',
    hints: 'pet, animal, fur detail',
    preserveSubject: true,
    extra: 'extra limbs, deformed anatomy, human hands',
  },
  {
    id: 'fantasy',
    label: 'Fantasy / costume',
    hints: 'fantasy costume, magical scene',
    preserveSubject: true,
    extra: 'modern streetwear, logos, watermark',
  },
  {
    id: 'sport-cycling',
    label: 'Sport · cycling',
    sport: 'cycling',
    preserveSubject: true,
  },
  {
    id: 'sport-running',
    label: 'Sport · running',
    sport: 'running',
    preserveSubject: true,
  },
  {
    id: 'video-motion',
    label: 'Video · motion / WAN',
    hints: 'video wan motion temporal continuity i2v t2v',
    preserveSubject: true,
    staticPrompt:
      'flicker, morphing, identity drift, abrupt cuts, extra limbs, extra arms, extra legs, duplicate subjects, warped hands, fused fingers, deformed anatomy, floating objects, suddenly appearing props, disappearing props, face melt, body warp, temporal jitter',
  },
  {
    id: 'video-motion-lightning',
    label: 'Video · WAN Lightning',
    hints: 'wan lightning 4step 4-step fast video',
    preserveSubject: true,
    staticPrompt:
      'flicker, morphing, identity drift, abrupt cuts, extra limbs, warped hands, duplicate subjects, floating props',
  },
  {
    id: 'wardrobe-people',
    label: 'Wardrobe · people / character',
    hints: 'wardrobe outfit clothing character portrait fashion',
    preserveSubject: true,
    staticPrompt:
      'wrong outfit layers, mismatched clothing, clothing clipping through body, floating garments, duplicate outfits, wardrobe text overlay, clothing label watermark',
  },
  {
    id: 'wardrobe-athletic',
    label: 'Wardrobe · athletic',
    hints: 'athlete athletic sport kit race training workout',
    preserveSubject: true,
    staticPrompt:
      'street clothes on athlete, casual jeans on sport kit, hoodie over race kit, missing athletic bottoms, barefoot athlete, wrong sport uniform, clothing clipping through body',
  },
];

export function appendTokensToNegativeProfileExtra(
  profiles: NegativeProfile[],
  profileId: string,
  tokens: string[]
): { profiles: NegativeProfile[]; added: number } {
  const normalized = [...new Set(tokens.map(token => token.trim()).filter(Boolean))];
  if (normalized.length === 0) {
    return { profiles, added: 0 };
  }

  let added = 0;
  const nextProfiles = profiles.map(profile => {
    if (profile.id !== profileId) {
      return profile;
    }
    const existing = profile.extra?.trim() ?? '';
    const existingParts = new Set(
      existing
        .split(/[,;]+/)
        .map(part => part.trim())
        .filter(Boolean)
    );
    for (const token of normalized) {
      if (!existingParts.has(token)) {
        existingParts.add(token);
        added += 1;
      }
    }
    return {
      ...profile,
      extra: [...existingParts].join(', '),
    };
  });

  return { profiles: nextProfiles, added };
}

export function resolveNegativeProfile(
  profiles: NegativeProfile[] | undefined,
  profileId?: string
): NegativeProfile | undefined {
  const list = profiles?.length ? profiles : DEFAULT_NEGATIVE_PROFILES;
  if (!profileId?.trim()) {
    return list[0];
  }
  return list.find(entry => entry.id === profileId) ?? list[0];
}

export async function fetchNegativeWithProfile(input: {
  profile?: NegativeProfile;
  hints?: string;
  sport?: string | null;
}): Promise<string | null> {
  const profile = input.profile;
  if (profile?.staticPrompt?.trim()) {
    return profile.staticPrompt.trim();
  }

  const response = await fetch('/api/negative', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hints: input.hints?.trim() || profile?.hints,
      sport: input.sport ?? profile?.sport,
      preserveSubject: profile?.preserveSubject,
      extra: profile?.extra,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { prompt?: string };
  return data.prompt?.trim() || null;
}
