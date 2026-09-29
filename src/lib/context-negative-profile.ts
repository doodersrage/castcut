import type { AthleticSport } from './athletic-sport-profiles';
import { COMFY_MODEL_IDS, getComfyModelDefinition, type ComfyImageModel } from './comfy-models';
import {
  DEFAULT_NEGATIVE_PROFILES,
  resolveNegativeProfile,
  type NegativeProfile,
} from './negative-profiles';

export type NegativeProfileContext = {
  tool?: string;
  model?: ComfyImageModel | string;
  hints?: string;
  sport?: AthleticSport | null;
};

function hintsMatch(profile: NegativeProfile, corpus: string): boolean {
  if (!profile.hints?.trim()) {
    return false;
  }
  const tokens = profile.hints
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(token => token.length > 3);
  return tokens.some(token => corpus.includes(token));
}

function isQwenModelContext(model: ComfyImageModel | string | undefined): boolean {
  if (!model) {
    return false;
  }
  if (/qwen/i.test(model)) {
    return true;
  }
  if (!COMFY_MODEL_IDS.has(model)) {
    return false;
  }
  return getComfyModelDefinition(model).category === 'qwen';
}

function isVideoModelContext(model: ComfyImageModel | string | undefined): boolean {
  if (!model) {
    return false;
  }
  if (/video|wan|hunyuan|ltx/i.test(String(model))) {
    if (COMFY_MODEL_IDS.has(model)) {
      return getComfyModelDefinition(model).category === 'video';
    }
    return /video/i.test(String(model));
  }
  if (!COMFY_MODEL_IDS.has(model)) {
    return false;
  }
  return getComfyModelDefinition(model).category === 'video';
}

export function resolveContextNegativeProfile(
  profiles: NegativeProfile[] | undefined,
  selectedId: string | undefined,
  context: NegativeProfileContext
): NegativeProfile | undefined {
  const list = profiles?.length ? profiles : DEFAULT_NEGATIVE_PROFILES;
  const corpus = `${context.tool ?? ''} ${context.hints ?? ''}`.toLowerCase();
  const qwenModel = isQwenModelContext(context.model);
  const videoModel = isVideoModelContext(context.model);

  if (context.sport) {
    const sportMatch = list.find(
      entry => entry.sport === context.sport && entry.id.startsWith('sport-')
    );
    if (sportMatch) {
      return sportMatch;
    }
  }

  if (
    context.sport ||
    /\b(?:athlete|athletic|sport|cycling|running|workout|race kit|training)\b/i.test(corpus)
  ) {
    const athletic = list.find(entry => entry.id === 'wardrobe-athletic');
    if (athletic) {
      return athletic;
    }
  }

  if (
    context.tool === 'character' ||
    context.tool === 'duo' ||
    context.tool === 'gallery-mutate' ||
    /\b(?:wardrobe|outfit|clothing|fashion|wearing)\b/i.test(corpus)
  ) {
    const wardrobe = list.find(entry => entry.id === 'wardrobe-people');
    if (wardrobe) {
      return wardrobe;
    }
  }

  if (
    context.tool === 'video' ||
    videoModel ||
    /\b(video|i2v|t2v|wan\s*video|motion clip)\b/i.test(corpus)
  ) {
    if (
      /wan.*lightning|lightning.*wan|4[\s-]?step.*video|video.*4[\s-]?step|wan.*rapid[\s_-]*aio|rapid[\s_-]*aio.*wan|phr00t.*wan/i.test(
        `${context.model ?? ''} ${corpus}`
      )
    ) {
      const lightning = list.find(entry => entry.id === 'video-motion-lightning');
      if (lightning) {
        return lightning;
      }
    }
    const video = list.find(entry => entry.id === 'video-motion');
    if (video) {
      return video;
    }
  }

  if (context.tool === 'pet' || /\b(dog|cat|pet|puppy|kitten|bird|rabbit)\b/i.test(corpus)) {
    const pet = list.find(entry => entry.id === 'pet');
    if (pet) {
      return pet;
    }
  }

  if (context.tool === 'fantasy' || /\b(fantasy|mage|dragon|elf|spell|enchanted)\b/i.test(corpus)) {
    const fantasy = list.find(entry => entry.id === 'fantasy');
    if (fantasy) {
      return fantasy;
    }
  }

  if (
    context.tool === 'background' ||
    /\b(architecture|interior|building|landscape|environment only)\b/i.test(corpus)
  ) {
    const architecture = list.find(entry => entry.id === 'architecture');
    if (architecture) {
      return architecture;
    }
  }

  if (/\b(portrait|face|headshot|skin texture)\b/i.test(corpus)) {
    if (qwenModel) {
      const qwenPortrait = list.find(entry => entry.id === 'qwen-portrait');
      if (qwenPortrait) {
        return qwenPortrait;
      }
    }
    const portrait = list.find(entry => entry.id === 'portrait');
    if (portrait) {
      return portrait;
    }
  }

  // The shipped default selection is the SD profile; on a Qwen model that is not a choice, it is
  // the default — use the Qwen one. A profile the user picked on purpose still wins.
  if (qwenModel) {
    const qwenGeneral = list.find(entry => entry.id === 'qwen-general');
    if (qwenGeneral && (!selectedId?.trim() || selectedId.trim() === 'general-sd')) {
      return qwenGeneral;
    }
  }

  for (const profile of list) {
    if (hintsMatch(profile, corpus)) {
      return profile;
    }
  }

  return resolveNegativeProfile(list, selectedId);
}
