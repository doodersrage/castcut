import type { DetailLevel } from './detail-level';
import { getDetailLimits } from './detail-level';
import {
  expansionBeatsForProfile,
  fluxIgnoresNegative,
  isEditInstructionProfile,
} from './comfy-models/prompt-profiles';
import { COMFY_IMAGE_MODELS, DEFAULT_COMFY_MODEL } from './comfy-models/registry';
import type { ComfyImageModel, PromptProfileId } from './comfy-models/types';

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

export function looksLikeTagSoup(text: string): boolean {
  if (/[.!?]\s/.test(text) && text.split(/[.!?]/).filter(Boolean).length >= 2) {
    return false;
  }

  const parts = text
    .split(/[,;|]+/)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length < 3) {
    return false;
  }

  const avgPartLen = parts.reduce((sum, part) => sum + part.length, 0) / parts.length;
  return avgPartLen < 35;
}

export function isSceneDescription(text: string): boolean {
  return /[.!?]\s/.test(text) && splitSentences(text).length >= 2;
}

export function profileUsesTagFormat(profile: PromptProfileId): boolean {
  return profile === 'sd15_weighted';
}

export function profileSkipsProsePadding(profile: PromptProfileId): boolean {
  return profileUsesTagFormat(profile) || isEditInstructionProfile(profile);
}

const EXPANSION_BEAT_PATTERNS = [
  /\bfine surface textures read clearly\b/i,
  /\bthe lighting mixes a warm key from camera-left\b/i,
  /\bin the midground, supporting elements settle\b/i,
  /\bmaterial weight grounds the image\b/i,
  /\bthe composition holds at a natural eye level\b/i,
  /\bsmall environmental details in the distance\b/i,
  /\bforeground and background elements read in clear spatial layers\b/i,
  /\bsurface color and texture stay consistent\b/i,
  /\bthe main subject remains centered in the midground\b/i,
  /\blighting stays even enough to preserve shape\b/i,
  /\bthe surrounding space stays empty of other figures\b/i,
  /\bdirectional light sculpts one face\b/i,
  /\bsurface textures read clearly on the sole subject\b/i,
  /\bthe environment recedes through soft atmospheric depth without introducing\b/i,
  /\ba single background detail in .+ adds depth under the same light\b/i,
  /\bthe empty background adds depth under the same light\b/i,
];

export function isExpansionBeatSentence(sentence: string): boolean {
  return EXPANSION_BEAT_PATTERNS.some(pattern => pattern.test(sentence));
}

export function tagSoupToProse(text: string): string {
  const parts = text
    .split(/[,;|]+/)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return text;
  }

  const capitalize = (value: string) =>
    value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  const [primary, ...supporting] = parts;
  const lead = capitalize(primary!);

  if (supporting.length === 0) {
    return `${lead} under clear directional light in a unified scene.`;
  }

  if (supporting.length === 1) {
    return `${lead}, with ${supporting[0]!.toLowerCase()}, under clear directional light.`;
  }

  return `${lead}, featuring ${supporting.slice(0, -1).join(', ').toLowerCase()}, and ${supporting.at(-1)!.toLowerCase()}, in one cohesive scene with readable lighting.`;
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const normalized = tag.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function splitTags(text: string): string[] {
  return dedupeTags(
    text
      .split(/[,;|]+/)
      .map(part => part.trim())
      .filter(Boolean)
  );
}

export function joinTags(tags: string[]): string {
  return dedupeTags(tags).join(', ');
}

const LOW_PRIORITY_TAG_PATTERNS = [
  /^highly detailed$/i,
  /^masterpiece$/i,
  /^best quality$/i,
  /^8k$/i,
  /^atmospheric perspective$/i,
  /^depth of field$/i,
  /^cinematic lighting$/i,
  /^detailed textures$/i,
  /^sharp focus$/i,
  /^empty background$/i,
  /^no crowd$/i,
  /^solo$/i,
  /^single subject$/i,
];

function tagTrimScore(tag: string, index: number): number {
  let score = 40;
  if (index === 0) {
    score += 100;
  }
  if (index === 1) {
    score += 50;
  }
  if (LOW_PRIORITY_TAG_PATTERNS.some(pattern => pattern.test(tag))) {
    score -= 35;
  }
  if (tag.length > 45) {
    score -= 10;
  }
  return score;
}

export function trimTagsToMaxChars(tags: string[], maxChars: number): string {
  if (tags.length === 0) {
    return '';
  }

  const joined = joinTags(tags);
  if (joined.length <= maxChars) {
    return joined;
  }

  const indexed = tags.map((tag, index) => ({
    tag,
    index,
    score: tagTrimScore(tag, index),
  }));

  const protectedIndexes = new Set(
    indexed.filter(entry => entry.index <= 1).map(entry => entry.index)
  );
  const removable = indexed
    .filter(entry => !protectedIndexes.has(entry.index))
    .sort((a, b) => a.score - b.score);

  let kept = [...tags];
  for (const entry of removable) {
    const candidate = joinTags(kept.filter((_, index) => index !== entry.index));
    if (candidate.length <= maxChars) {
      kept = kept.filter((_, index) => index !== entry.index);
      break;
    }
    kept = kept.filter((_, index) => index !== entry.index);
  }

  let result = joinTags(kept);
  while (result.length > maxChars && kept.length > 1) {
    kept = kept.slice(0, -1);
    result = joinTags(kept);
  }

  if (result.length > maxChars) {
    result = result
      .slice(0, maxChars)
      .replace(/,\s*[^,]*$/, '')
      .trim();
  }

  return result;
}

export const SD15_EXPANSION_TAG_BEATS = [
  'sharp focus',
  'detailed textures',
  'cinematic lighting',
  'depth of field',
  'atmospheric perspective',
  'highly detailed',
];

export const SOLO_SUBJECT_TAG_BEATS = ['solo', 'empty background', 'no crowd', 'single subject'];

export function expandTagsToMinChars(
  text: string,
  detail: DetailLevel,
  model: ComfyImageModel,
  soloSubject = false
): string {
  const { minChars, maxChars } = getDetailLimits(detail, model);
  if (!minChars || text.length >= minChars) {
    return trimTagsToMaxChars(splitTags(text), maxChars);
  }

  let tags = splitTags(text);
  const beats = soloSubject ? SOLO_SUBJECT_TAG_BEATS : SD15_EXPANSION_TAG_BEATS;
  let beatIndex = 0;

  while (joinTags(tags).length < minChars && beatIndex < beats.length) {
    tags.push(beats[beatIndex]!);
    tags = dedupeTags(tags);
    beatIndex += 1;
  }

  return trimTagsToMaxChars(tags, maxChars);
}

export function proseToTagSoup(text: string, maxTags = 10): string {
  const cleaned = text
    .replace(
      /\b(?:no other people|solo subject|single person|only one person|alone in the frame|unoccupied by other)[^.!?]*[.!?]?/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();

  const tags: string[] = [];

  for (const sentence of splitSentences(cleaned)) {
    const clauses = sentence
      .split(/[,;]|\s+(?:and|with|while|as)\s+/i)
      .map(clause =>
        clause
          .trim()
          .replace(/^[Aa]\s+/, '')
          .replace(/[.!?]+$/, '')
          .replace(/\s+/g, ' ')
      )
      .filter(clause => clause.length >= 3 && clause.length <= 80);

    for (const clause of clauses) {
      if (!isExpansionBeatSentence(clause)) {
        tags.push(clause);
      }
    }
  }

  if (tags.length === 0 && cleaned) {
    tags.push(cleaned.slice(0, 80));
  }

  return joinTags(dedupeTags(tags).slice(0, maxTags));
}

const NAMED_COLOR =
  /\b(?:red|blue|green|yellow|black|white|pink|purple|orange|brown|gold|silver|navy|crimson|ivory|beige|teal|coral|burgundy|olive|charcoal|cream|lavender|maroon|turquoise|indigo|amber|bronze|copper|emerald|sapphire)\b/i;
const NAMED_MATERIAL =
  /\b(?:silk|cotton|denim|leather|wool|linen|satin|velvet|chiffon|lace|nylon|polyester|suede|canvas|tweed|cashmere|metal|chrome|brushed|matte|glossy|stone|wood|glass|concrete|marble|ceramic|rubber)\b/i;
const WARDROBE_OR_PROP =
  /\b(?:blouse|dress|jacket|shirt|pants|skirt|coat|boots|sneakers|swimsuit|lingerie|hoodie|sweater|jeans|suit|gown|scarf|hat|glasses|necklace|earring|bracelet|ring|tattoo|helmet|gloves|shorts|top|shoes|sandals)\b/i;
const POSE_OR_ACTION =
  /\b(?:wearing|standing|sitting|holding|walking|running|posing|leaning|kneeling|reaching|looking|gazing|smiling|facing|crouching|stretching|dancing)\b/i;
const ATMOSPHERE_FILLER =
  /\b(?:foreground|midground|background|atmospheric haze|atmospheric depth|ambient fill|specular highlights|environmental beat|spatial layers|material weight grounds|surface textures read clearly|composition holds at a natural eye level)\b/i;

function sentenceTrimScore(sentence: string, index: number): number {
  let score = 50;
  if (index === 0) {
    score += 100;
  }
  if (isExpansionBeatSentence(sentence)) {
    score -= 100;
  }
  if (
    /\b(?:no other people|solo subject|single person|only one person|unoccupied by other)\b/i.test(
      sentence
    )
  ) {
    score -= 25;
  }
  if (ATMOSPHERE_FILLER.test(sentence)) {
    score -= 28;
  }
  if (/\b(?:subject|woman|man|person|people|character|figure|girl|boy|athlete)\b/i.test(sentence)) {
    score += 35;
  }
  if (POSE_OR_ACTION.test(sentence)) {
    score += 30;
  }
  if (WARDROBE_OR_PROP.test(sentence)) {
    score += 40;
  }
  if (NAMED_COLOR.test(sentence)) {
    score += 28;
  }
  if (NAMED_MATERIAL.test(sentence)) {
    score += 32;
  }
  if (/\b(?:light|lighting|illuminated|shadow|sunlight|moonlight)\b/i.test(sentence)) {
    score += 12;
  }
  if (
    /\b(?:texture|material|fabric|metal|stone|wood|glass|concrete|leather|skin)\b/i.test(sentence)
  ) {
    score += 18;
  }
  if (sentence.length < 35) {
    score -= 15;
  }
  return score;
}

/** True when the prompt already carries subject + specific visual detail (skip stock padding). */
export function promptHasSceneDensity(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  const sentences = splitSentences(trimmed).filter(sentence => !isExpansionBeatSentence(sentence));
  const core = sentences.join(' ').trim();
  if (!core) {
    return false;
  }

  const hasSubject =
    /\b(?:woman|man|person|people|figure|character|subject|girl|boy|athlete|cyclist|runner)\b/i.test(
      core
    ) || POSE_OR_ACTION.test(core);
  const hasSpecifics =
    NAMED_COLOR.test(core) ||
    NAMED_MATERIAL.test(core) ||
    WARDROBE_OR_PROP.test(core) ||
    /\b(?:tattoo|freckles|braid|ponytail|beard|scar)\b/i.test(core);

  if (hasSubject && hasSpecifics) {
    return true;
  }
  if (hasSubject && core.length >= 180) {
    return true;
  }
  if (sentences.length >= 2 && core.length >= 220) {
    return true;
  }
  return false;
}

const LEFT_PLACEMENT =
  /\b(on the left|to the left|left side of the frame|left side of|left side)\b/i;
const RIGHT_PLACEMENT =
  /\b(on the right|to the right|right side of the frame|right side of|right side)\b/i;

export function findDistinctPeopleSentenceIndexes(sentences: string[]): {
  leftIdx: number;
  rightIdx: number;
} {
  return {
    leftIdx: sentences.findIndex(sentence => LEFT_PLACEMENT.test(sentence)),
    rightIdx: sentences.findIndex(sentence => RIGHT_PLACEMENT.test(sentence)),
  };
}

const INCOMPLETE_DISTINCT_PEOPLE_BRIDGE =
  /^(?:in stark yet complementing contrast|in complementing contrast|in contrast|by contrast)(?:,|\.)?\s*$/i;

/** Drop trailing contrast lead-ins that never introduce the second person. */
export function stripIncompleteDistinctPeopleBridges(sentences: string[]): string[] {
  return sentences.filter(sentence => {
    const trimmed = sentence.trim();
    if (!trimmed) {
      return false;
    }
    if (INCOMPLETE_DISTINCT_PEOPLE_BRIDGE.test(trimmed)) {
      return false;
    }
    if (
      /^(?:in stark yet complementing contrast|in contrast),?\s*$/i.test(trimmed) &&
      !/\b(woman|man|person|figure|girl|boy|they|she|he)\b/i.test(trimmed)
    ) {
      return false;
    }
    return true;
  });
}

function trimDistinctPeoplePairToMaxChars(
  scene: string,
  left: string,
  right: string,
  maxChars: number
): string {
  const scenePart = scene.trim();
  const leftPart = left.trim();
  const rightPart = right.trim();
  const parts = [scenePart, leftPart, rightPart].filter(Boolean);
  const joined = parts.join(' ').trim();

  if (joined.length <= maxChars) {
    return joined;
  }

  const overhead =
    scenePart.length +
    (scenePart && leftPart ? 1 : 0) +
    (leftPart && rightPart ? 1 : 0) +
    (scenePart && !leftPart && rightPart ? 1 : 0);
  const peopleBudget = Math.max(160, maxChars - overhead);
  const rightReserve = Math.min(rightPart.length, Math.max(120, Math.floor(peopleBudget * 0.34)));
  const leftBudget = Math.max(140, peopleBudget - rightReserve - (leftPart && rightPart ? 1 : 0));
  const leftTrimmed = trimProseClauseToMaxChars(leftPart, leftBudget);
  const rightBudget = peopleBudget - leftTrimmed.length - (leftTrimmed && rightPart ? 1 : 0);
  const rightTrimmed = trimProseClauseToMaxChars(rightPart, Math.max(100, rightBudget));

  return [scenePart, leftTrimmed, rightTrimmed].filter(Boolean).join(' ').trim();
}

export function trimDistinctPeopleProseToMaxChars(sentences: string[], maxChars: number): string {
  if (sentences.length === 0) {
    return '';
  }

  const cleaned = stripIncompleteDistinctPeopleBridges(sentences);
  const working = cleaned.length > 0 ? cleaned : sentences;

  const joined = working.join(' ').trim();
  if (joined.length <= maxChars) {
    return joined;
  }

  const { leftIdx, rightIdx } = findDistinctPeopleSentenceIndexes(working);
  const scene = working[0] ?? '';

  if (leftIdx >= 0 && rightIdx >= 0) {
    if (leftIdx === rightIdx) {
      const pairBudget = Math.max(120, maxChars - scene.length - 1);
      const combined = trimProseClauseToMaxChars(working[leftIdx]!, pairBudget);
      return [scene, combined].filter(Boolean).join(' ').trim();
    }

    return trimDistinctPeoplePairToMaxChars(scene, working[leftIdx]!, working[rightIdx]!, maxChars);
  }

  if (leftIdx >= 0) {
    const leftBudget = Math.max(160, maxChars - scene.length - Math.floor(maxChars * 0.34) - 2);
    const leftTrimmed = trimProseClauseToMaxChars(working[leftIdx]!, leftBudget);
    const result = [scene, leftTrimmed].filter(Boolean).join(' ').trim();
    if (result.length <= maxChars) {
      return result;
    }
    return trimProseClauseToMaxChars(result, maxChars);
  }

  const keep = new Set<number>([0]);
  if (leftIdx >= 0) {
    keep.add(leftIdx);
  }
  if (rightIdx >= 0) {
    keep.add(rightIdx);
  }

  let result = [...keep]
    .sort((a, b) => a - b)
    .map(index => working[index]!)
    .join(' ')
    .trim();

  if (result.length > maxChars) {
    return trimCompleteSentencesToMaxChars(
      [...keep].sort((a, b) => a - b).map(index => working[index]!),
      maxChars
    );
  }

  for (let index = 0; index < working.length; index += 1) {
    if (keep.has(index)) {
      continue;
    }

    const candidate = `${result} ${working[index]!}`.trim();
    if (candidate.length <= maxChars) {
      result = candidate;
      keep.add(index);
    } else {
      break;
    }
  }

  return result.trim();
}

export function trimCompleteSentencesToMaxChars(sentences: string[], maxChars: number): string {
  if (sentences.length === 0) {
    return '';
  }

  let kept = [...sentences];
  while (kept.length > 1 && kept.join(' ').length > maxChars) {
    // Drop lowest-priority sentences first (never the lead until last resort).
    let dropAt = -1;
    let lowestScore = Number.POSITIVE_INFINITY;
    for (let index = 1; index < kept.length; index += 1) {
      const score = sentenceTrimScore(kept[index]!, index);
      if (score < lowestScore) {
        lowestScore = score;
        dropAt = index;
      }
    }
    if (dropAt < 0) {
      kept = kept.slice(0, -1);
    } else {
      kept = kept.filter((_, index) => index !== dropAt);
    }
  }

  const result = kept.join(' ').trim();
  if (result.length <= maxChars) {
    return result;
  }

  if (kept.length === 1) {
    return trimProseClauseToMaxChars(kept[0]!, maxChars);
  }

  return trimProseClauseToMaxChars(result, maxChars);
}

export function trimProseClauseToMaxChars(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  const slice = trimmed.slice(0, maxChars);
  const lastSentenceBreak = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? ')
  );

  if (lastSentenceBreak >= Math.floor(maxChars * 0.55)) {
    return slice.slice(0, lastSentenceBreak + 1).trim();
  }

  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace >= Math.floor(maxChars * 0.72)) {
    const wordTrimmed = slice.slice(0, lastSpace).trim();
    return wordTrimmed.endsWith('.') ? wordTrimmed : `${wordTrimmed}.`;
  }

  const hardTrim = slice.trimEnd().replace(/[,;:]\s*$/, '');
  return hardTrim.endsWith('.') ? hardTrim : `${hardTrim}.`;
}

export function trimSentencesForDistinctPeople(
  sentences: string[],
  maxSentences: number
): string[] {
  if (sentences.length <= maxSentences) {
    return sentences;
  }

  const { leftIdx, rightIdx } = findDistinctPeopleSentenceIndexes(sentences);

  if (leftIdx >= 0 && rightIdx >= 0) {
    const priority = leftIdx === rightIdx ? [leftIdx] : [leftIdx, rightIdx].sort((a, b) => a - b);

    if (maxSentences >= 3 && !priority.includes(0)) {
      priority.unshift(0);
    }

    const keepSet = new Set(priority);
    const result = [...priority];

    for (let index = 0; index < sentences.length && result.length < maxSentences; index += 1) {
      if (!keepSet.has(index)) {
        result.push(index);
        keepSet.add(index);
      }
    }

    return result
      .sort((a, b) => a - b)
      .slice(0, maxSentences)
      .map(index => sentences[index]!);
  }

  return trimSentencesByPriority(sentences, maxSentences);
}

export function trimSentencesByPriority(sentences: string[], maxSentences: number): string[] {
  if (sentences.length <= maxSentences) {
    return sentences;
  }

  const keep = new Set<number>([0]);
  const ranked = sentences
    .map((sentence, index) => ({
      index,
      score: sentenceTrimScore(sentence, index),
    }))
    .filter(entry => entry.index !== 0)
    .sort((a, b) => b.score - a.score);

  for (const entry of ranked) {
    if (keep.size >= maxSentences) {
      break;
    }
    keep.add(entry.index);
  }

  return [...keep].sort((a, b) => a - b).map(index => sentences[index]!);
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Words a scene lead can open on — anything else capitalized is a name ("Lana stands…"). */
const LOWERCASE_SCENE_LEAD_WORD =
  /^(?:a|an|the|she|he|they|her|his|their|its|it|this|that|these|those|one|two|three|some|in|on|at|under|inside|outside|with|by|from|beneath|behind|above|across|near|through|during|after|before|as|while|every|each|no|our|my|your)$/i;

function lowerSceneLead(text: string): string {
  // "Lana stands…" / "Lana, freckled…" — a named subject, not "Red jacket, blue jeans".
  const lead = /^([A-Z][a-z]+)(?:,|\s+[a-z]+s\b)/.exec(text);
  if (lead && !LOWERCASE_SCENE_LEAD_WORD.test(lead[1]!)) {
    return text;
  }
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function impliesMultiImageReferences(input: string): boolean {
  return /\b(figure\s*[12]|picture\s*[12]|image\s*[12]|photo\s*[12])\b/i.test(input);
}

export function enforcePromptShapeForProfile(
  prompt: string,
  profile: PromptProfileId,
  mode: 'positive' | 'negative',
  input = ''
): string {
  const text = prompt.trim();
  if (!text) {
    return text;
  }

  if (mode === 'negative') {
    if (fluxIgnoresNegative(profile)) {
      const stripped = text
        .replace(/\b(do not|don't|avoid|no|never)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      return `Stable composition with unchanged identity and proportions. ${capitalize(stripped)}.`;
    }
    return text;
  }

  if (profile === 'sd15_weighted') {
    if (looksLikeTagSoup(text)) {
      return joinTags(splitTags(text));
    }
    return proseToTagSoup(text);
  }

  if (profile === 'qwen_edit_instruction') {
    if (/\bFigure\s*[12]\b/i.test(text)) {
      return text;
    }

    const hasEditPattern = /\b(keep|preserve|replace|change|figure\s*[12])\b/i.test(text);

    if (hasEditPattern || /^replace the scene with/i.test(text)) {
      return text;
    }

    if (looksLikeTagSoup(text)) {
      const prose = tagSoupToProse(text);
      return `Replace the scene with ${lowerSceneLead(prose)}`;
    }

    if (isSceneDescription(text)) {
      return `Replace the scene with ${lowerSceneLead(text)}`;
    }

    if (!/^replace\b/i.test(text) && !/^keep\b/i.test(text)) {
      return `Replace the scene with ${lowerSceneLead(text)}`;
    }

    if (impliesMultiImageReferences(input) && !/\bFigure\s*[12]\b/i.test(text)) {
      return text;
    }

    return text;
  }

  if (profile === 'instruct_pix2pix') {
    if (/^(make|turn|change|add|remove|transform)\b/i.test(text)) {
      return text;
    }
    if (looksLikeTagSoup(text)) {
      const prose = tagSoupToProse(text);
      return `Transform the image to show ${prose.charAt(0).toLowerCase() + prose.slice(1)}`;
    }
    if (!/^transform the image\b/i.test(text)) {
      return `Transform the image to show ${text.charAt(0).toLowerCase() + text.slice(1)}`;
    }
    return text;
  }

  if (profile === 'omnigen_instruction' && !/\b(keep|replace|change|figure\s*[12])\b/i.test(text)) {
    if (looksLikeTagSoup(text)) {
      const prose = tagSoupToProse(text);
      return `Generate an image showing ${prose.charAt(0).toLowerCase() + prose.slice(1)}`;
    }
    return text;
  }

  if (
    (profile === 'flux_klein' || profile === 'flux_prose' || profile === 'flux_schnell') &&
    looksLikeTagSoup(text)
  ) {
    return tagSoupToProse(text);
  }

  if (isEditInstructionProfile(profile) && looksLikeTagSoup(text)) {
    return tagSoupToProse(text);
  }

  return text;
}

export function buildVisionFormatRules(
  profile: PromptProfileId,
  limits: {
    minSentences: number;
    maxSentences: number;
    maxChars: number;
  },
  detail: DetailLevel
): string {
  if (profileUsesTagFormat(profile)) {
    return `- Output comma-separated tags or brief weighted phrases—not full sentences.
- Front-load subject and style tokens. Optional weight syntax: (keyword:1.2).
- Keep the prompt compact (~${limits.maxChars} characters max, ${detail === 'rich' ? '6–8' : detail === 'balanced' ? '4–6' : '3–4'} tags).
- Do NOT write paragraph prose or multi-sentence descriptions.`;
  }

  if (profile === 'qwen_edit_instruction') {
    return `- Write a short edit instruction, not a scene essay.
- Prefer "Replace the scene with …" or "Keep … unchanged. Replace …".
- ${limits.minSentences}–${limits.maxSentences} short sentences (~${limits.maxChars} characters max).`;
  }

  if (profile === 'instruct_pix2pix') {
    return `- Write a direct edit command: "Transform the image to show …" or "Make …".
- ${limits.minSentences}–${limits.maxSentences} short sentences (~${limits.maxChars} characters max).`;
  }

  if (profile === 'omnigen_instruction') {
    return `- Write a concise generation instruction with explicit keep/replace language when needed.
- ${limits.minSentences}–${limits.maxSentences} sentences (~${limits.maxChars} characters max).`;
  }

  if (profile === 'qwen_t2i_factual') {
    return `- Write ${limits.minSentences}–${limits.maxSentences} factual sentences (~${limits.maxChars} characters max).
- Describe spatial layers, readable color, and visible text if any. Avoid poetic filler.`;
  }

  if (profile === 'flux_klein' || profile === 'flux_prose' || profile === 'flux_schnell') {
    return `- Write ${limits.minSentences}–${limits.maxSentences} sentences of photographic prose (~${limits.maxChars} characters max).
- Front-load the subject. Name materials, light direction, and camera feel—not bare quality tags.`;
  }

  return `- Write ${limits.minSentences}–${limits.maxSentences} sentences of plain factual prose (~${limits.maxChars} characters max).
- Use natural language suited to the target model—not tag soup.`;
}

export function expansionBeatsForSanitize(
  profile: PromptProfileId,
  soloSubject: boolean
): string[] {
  if (soloSubject) {
    return profileUsesTagFormat(profile)
      ? SOLO_SUBJECT_TAG_BEATS
      : [
          'The surrounding space stays empty of other figures, with layered depth and no distant people or silhouettes.',
          'Directional light sculpts one face, posture, and clothing texture while the background remains unoccupied.',
          'Surface textures read clearly on the sole subject, with no second face, reflection, or background figure anywhere.',
          'The environment recedes through soft atmospheric depth without introducing additional people or crowd energy.',
        ];
  }

  if (profileUsesTagFormat(profile)) {
    return SD15_EXPANSION_TAG_BEATS;
  }

  return expansionBeatsForProfile(profile);
}

export function resolveProfile(model: ComfyImageModel): PromptProfileId {
  return (
    COMFY_IMAGE_MODELS.find(entry => entry.id === model) ??
    COMFY_IMAGE_MODELS.find(entry => entry.id === DEFAULT_COMFY_MODEL)!
  ).profile;
}
