import { getSamplingBoost, pickFewShotExamples } from './variation-seed';
import { parseCharacterHints, pickCharacterIdentitySeed } from './character-hints';
import {
  buildClaritySystemAddendum,
  buildDetailUserDirective,
  compactVariationHint,
  formatPromptForModel,
  getModelFewShots,
  QWEN_FEW_SHOT_BY_DETAIL,
  sanitizeQwenPrompt,
  compactPromptForProfile,
  trimPromptToMaxChars,
} from './qwen-clarity';
import { stripPromptArtifacts, isThinkingOnlyArtifact } from './prompt-cleanup';
import { withRawPrompt } from './raw-prompt';
import { chatCompletion, chatCompletionStream } from './llm-client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
  resolveRequestTemplateFallback,
  type LlmRequestOptions,
} from './llm-request-options';
import { expandSparsePromptWithLlm, needsSparsePromptExpand } from './sparse-prompt-expand';
import {
  DISTINCT_PEOPLE_FEW_SHOT_BY_DETAIL,
  DISTINCT_PEOPLE_FEW_SHOT_INPUT,
  getDetailLimits,
  GROUPED_COUPLE_FEW_SHOT_BY_DETAIL,
  GROUPED_COUPLE_FEW_SHOT_INPUT,
} from './detail-level';
import {
  buildModelSystemPrompt,
  fluxIgnoresNegative,
  getComfyModelDefinition,
  type PromptProfileId,
} from './comfy-models';
import {
  buildDistinctPeopleSystemAddendum,
  buildDistinctPeopleUserDirective,
  buildGroupedPeopleSystemAddendum,
  ensureDistinctPeoplePrompt,
  isMultiPersonInput,
  paintDistinctPeopleScene,
  paintGroupedPeopleScene,
  parsePeopleConstraint,
  stripStreetClothingFromAthleticPeoplePrompt,
} from './distinct-people';
import { inferAthleticSport } from './athletic-sport-profiles';
import {
  formatSportActionInstructions,
  stripForeignSportActionsFromPrompt,
  ensureAthleticBottomInPrompt,
} from './athletic-sport-actions';
import {
  buildSinglePersonSystemAddendum,
  buildSoloSubjectLockDirective,
  ensureSinglePersonPrompt,
} from './single-person';
import { DEFAULT_GENERATION_SETTINGS, type GenerationSettings } from './generation-settings';
import {
  resolveModelForPromptGeneration,
  resolveModelForQueueTool,
  stripEditInstructionLead,
} from './queue-tool-model';
import { type VariationSettings } from './variation-settings';
import {
  buildGenerateWardrobeAssignments,
  buildGenerateWardrobeUserDirective,
  mergeGenerateWardrobeIntoPrompt,
  type GenerateWardrobeAssignment,
} from './generate-wardrobe';
import { buildNoClothingUserDirective, hintsImplyNoClothing } from './clothing-tags';

export type PromptMode = 'positive' | 'negative';
export type { GenerationSettings, VariationSettings } from './generation-settings';
export type { DetailLevel } from './detail-level';
export type { QwenImageModel } from './qwen-model';

export type GenerateResult = {
  prompt: string;
  mode: PromptMode;
  provider: 'llm' | 'template';
  model: GenerationSettings['model'];
  comfyNode: string;
  limits: {
    minChars?: number;
    maxChars: number;
    maxSentences: number;
    maxTokens: number;
  };
  metadata?: {
    rawPrompt?: string;
    wardrobeAssignments?: Array<{
      wardrobeId?: string | null;
      bottomId?: string | null;
      footwearId?: string | null;
      accessoriesId?: string | null;
    }>;
  };
};

export type GeneratePromptOptions = {
  recentClothing?: string[];
  lockedWardrobeId?: string;
  /** Pin environment/variation seed for reproducible Generate rolls. */
  variationSeed?: string;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
  /** Queue tool id — edit models map to txt2img for scene-generation tools. */
  tool?: string;
  /** Session LLM overrides (model / enabled / template fallback). */
  llm?: LlmRequestOptions;
};

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const KEYWORDS_ONLY_SYSTEM_ADDENDUM = `Keywords-only mode:
- Expand the user's keywords into one model-ready prompt.
- Stay faithful to those keywords for setting, wardrobe, props, and subjects.
- Do not invent a wardrobe catalog, outfit roll, or substitute a different location unless the keywords ask for it.
- Do not copy clothing or places from example prompts—there are none in this request.`;

function buildFewShotMessages(
  mode: PromptMode,
  settings: GenerationSettings,
  input: string
): ChatMessage[] {
  if (mode === 'negative') {
    return [];
  }

  // Completionist local models overfit few-shot scenes (location/wardrobe).
  if (settings.seedLlmWithIngredients === false) {
    return [];
  }

  const multiPerson = isMultiPersonInput(input);
  const baseExamples = QWEN_FEW_SHOT_BY_DETAIL[settings.detail];
  const detailExamples = getModelFewShots(settings.model, settings.detail, baseExamples);

  const pinnedExample = multiPerson
    ? settings.distinctPeople
      ? DISTINCT_PEOPLE_FEW_SHOT_BY_DETAIL[settings.detail]
      : GROUPED_COUPLE_FEW_SHOT_BY_DETAIL[settings.detail]
    : undefined;

  const pool = detailExamples.filter(
    example =>
      example.input !== DISTINCT_PEOPLE_FEW_SHOT_INPUT &&
      example.input !== GROUPED_COUPLE_FEW_SHOT_INPUT
  );

  const selected = pickFewShotExamples(
    pool,
    settings.variation.strength,
    settings.variation.enabled
  );

  const messages = pinnedExample ? [pinnedExample, ...selected] : selected;

  return messages.flatMap(example => [
    { role: 'user' as const, content: example.input },
    { role: 'assistant' as const, content: example.output },
  ]);
}

function shouldPreserveSubject(input: string): boolean {
  return /keep|preserve|same (face|person|subject|pose)/i.test(input);
}

function buildUserMessage(
  input: string,
  mode: PromptMode,
  settings: GenerationSettings,
  wardrobeAssignments?: GenerateWardrobeAssignment[] | null,
  variationSeed?: string,
  avoidedTokensInstruction?: string
): string {
  const trimmed = input.trim();
  if (mode === 'negative' || shouldPreserveSubject(trimmed)) {
    return trimmed;
  }

  const seedIngredients = settings.seedLlmWithIngredients !== false;

  // Keywords-only: send the user's text plus hard fidelity rules—no flavor,
  // wardrobe, environment, or sport seed lines that completionist models latch onto.
  if (!seedIngredients) {
    const extras: string[] = [buildDetailUserDirective(settings.detail, settings.model)];
    if (isMultiPersonInput(trimmed) && settings.distinctPeople) {
      extras.push(buildDistinctPeopleUserDirective(trimmed));
    } else if (!isMultiPersonInput(trimmed) && !settings.distinctPeople) {
      const soloLock = buildSoloSubjectLockDirective(trimmed);
      if (soloLock) {
        extras.push(soloLock);
      }
    }
    if (avoidedTokensInstruction?.trim()) {
      extras.push(avoidedTokensInstruction.trim());
    }
    extras.push(
      'Write one model-ready prompt from the keywords above only. Do not invent a wardrobe catalog or substitute a different location unless the keywords ask for it.'
    );
    return `Scene keywords:\n${trimmed}\n\n${extras.join('\n\n')}`;
  }

  const extras: string[] = [buildDetailUserDirective(settings.detail, settings.model)];
  const peopleConstraint = parsePeopleConstraint(trimmed);

  if (isMultiPersonInput(trimmed)) {
    if (settings.distinctPeople) {
      extras.push(buildDistinctPeopleUserDirective(trimmed));
    }
  }

  if (settings.variation.enabled) {
    const hint = compactVariationHint(settings.variation.strength, settings.detail, {
      distinctPeople: settings.distinctPeople,
      peopleCount: peopleConstraint.count,
      gender: peopleConstraint.gender,
    });
    if (hint) {
      extras.push(hint);
    }
  }

  // When the user did not name a face, inject a concrete identity so models
  // do not collapse to the same stock man/woman prior.
  if (!settings.distinctPeople && !isMultiPersonInput(trimmed)) {
    const identitySeed = pickCharacterIdentitySeed(parseCharacterHints(trimmed));
    if (identitySeed) {
      extras.push(
        `Subject identity (mandatory — specific face, age read, ancestry, hair, and body; do not use a generic stock model): ${identitySeed}`
      );
    }
  }

  if (!isMultiPersonInput(trimmed) && !settings.distinctPeople) {
    const soloLock = buildSoloSubjectLockDirective(trimmed);
    if (soloLock) {
      extras.push(soloLock);
    }
  }

  const wardrobeDirective = wardrobeAssignments?.length
    ? buildGenerateWardrobeUserDirective(wardrobeAssignments)
    : null;
  if (wardrobeDirective) {
    extras.push(wardrobeDirective);
  } else if (hintsImplyNoClothing(trimmed)) {
    extras.push(buildNoClothingUserDirective());
  }

  if (variationSeed?.trim() && settings.variation.enabled) {
    extras.push(`Environment variation seed (honor closely): ${variationSeed.trim()}`);
  }

  const sport = inferAthleticSport(trimmed);
  if (sport) {
    const sportLines = formatSportActionInstructions(sport, trimmed);
    if (sportLines) {
      extras.push(sportLines);
    }
  }

  if (avoidedTokensInstruction?.trim()) {
    extras.push(avoidedTokensInstruction.trim());
  }

  return `${trimmed}\n\n${extras.join('\n\n')}`;
}

function getLlmTemperature(variation: VariationSettings): number {
  const configured = Number(process.env.LLM_TEMPERATURE);
  const base =
    Number.isFinite(configured) && configured >= 0 && configured <= 2 ? configured : 0.95;

  if (!variation.enabled) {
    return Math.max(0, base - 0.1);
  }

  const { temperatureBoost } = getSamplingBoost(variation.strength);
  return Math.min(2, base + temperatureBoost);
}

function getLlmSamplingParams(variation: VariationSettings): Record<string, number> {
  if (!variation.enabled) {
    return { top_p: 0.9 };
  }

  const { topP, frequencyPenalty, presencePenalty } = getSamplingBoost(variation.strength);

  return {
    top_p: topP,
    frequency_penalty: frequencyPenalty,
    presence_penalty: presencePenalty,
  };
}

function hashSeedString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % 2_147_483_647 || 1;
}

function getLlmSeed(variationSeed?: string): number {
  if (variationSeed?.trim()) {
    return hashSeedString(variationSeed.trim());
  }
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0]! % 2_147_483_647;
}

function preparePromptSource(
  raw: string,
  input: string,
  mode: PromptMode,
  settings: GenerationSettings
): string {
  const cleaned = sanitizePrompt(raw);
  let withDistinctPeople =
    mode === 'positive' ? ensureDistinctPeoplePrompt(cleaned, input, settings) : cleaned;
  if (mode === 'positive' && settings.distinctPeople && inferAthleticSport(input) !== null) {
    withDistinctPeople = stripStreetClothingFromAthleticPeoplePrompt(withDistinctPeople);
  }
  return withDistinctPeople;
}

function finalizePromptFromSource(
  source: string,
  input: string,
  mode: PromptMode,
  settings: GenerationSettings,
  wardrobeAssignments?: GenerateWardrobeAssignment[] | null,
  tool?: string
): string {
  const sanitized = sanitizeQwenPrompt(source, settings.detail, input, settings.model, {
    distinctPeople: mode === 'positive' && settings.distinctPeople,
    // Keywords-only: do not invent setting/location beats to hit min length.
    enforceMinimum: mode !== 'positive' || settings.seedLlmWithIngredients !== false,
  });
  const formatted = formatPromptForModel(sanitized, settings.model, input, mode);
  const scenePrompt = mode === 'positive' ? stripEditInstructionLead(formatted, tool) : formatted;
  const sportAware =
    mode === 'positive'
      ? (() => {
          const sport = inferAthleticSport(input);
          let result = scenePrompt;
          if (sport) {
            result = stripForeignSportActionsFromPrompt(result, sport, input);
            if (sport !== 'cycling') {
              result = ensureAthleticBottomInPrompt(result, sport, {
                hints: input,
                wardrobeSummary: wardrobeAssignments?.[0]?.summary,
              });
            }
          }
          return result;
        })()
      : formatted;
  if (!wardrobeAssignments?.length) {
    if (mode === 'positive' && !settings.distinctPeople && !isMultiPersonInput(input)) {
      const profile = getComfyModelDefinition(settings.model).profile;
      return ensureSinglePersonPrompt(sportAware, profile);
    }
    return sportAware;
  }

  const { maxChars } = getDetailLimits(settings.detail, settings.model);
  let merged = mergeGenerateWardrobeIntoPrompt(sportAware, wardrobeAssignments, maxChars, input);
  if (mode === 'positive' && !settings.distinctPeople && !isMultiPersonInput(input)) {
    merged = ensureSinglePersonPrompt(merged, getComfyModelDefinition(settings.model).profile);
  }
  const profile = getComfyModelDefinition(settings.model).profile;
  return trimPromptToMaxChars(compactPromptForProfile(merged, profile), maxChars);
}

function finalizePrompt(
  raw: string,
  input: string,
  mode: PromptMode,
  settings: GenerationSettings,
  wardrobeAssignments?: GenerateWardrobeAssignment[] | null,
  tool?: string
): string {
  return finalizePromptFromSource(
    preparePromptSource(raw, input, mode, settings),
    input,
    mode,
    settings,
    wardrobeAssignments,
    tool
  );
}

async function finalizePromptWithSparseExpand(
  raw: string,
  input: string,
  mode: PromptMode,
  settings: GenerationSettings,
  wardrobeAssignments?: GenerateWardrobeAssignment[] | null,
  tool?: string,
  llm?: LlmRequestOptions
): Promise<string> {
  let source = preparePromptSource(raw, input, mode, settings);
  // Sparse expand explicitly invents garments/locations — skip in keywords-only mode.
  if (mode === 'positive' && settings.seedLlmWithIngredients !== false) {
    const preview = sanitizeQwenPrompt(source, settings.detail, input, settings.model, {
      distinctPeople: settings.distinctPeople,
      enforceMinimum: false,
    });
    if (needsSparsePromptExpand(preview, settings.detail, settings.model)) {
      const expanded = await expandSparsePromptWithLlm({
        draft: preview,
        hints: input,
        detail: settings.detail,
        model: settings.model,
        endpoint: resolveRequestLlmEndpoint(llm),
        llmModel: resolveRequestLlmModel(llm),
      });
      if (expanded) {
        source = expanded;
      }
    }
  }
  return finalizePromptFromSource(source, input, mode, settings, wardrobeAssignments, tool);
}

export type GenerateLlmRequest = {
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  extraBody: Record<string, unknown>;
};

/** Builds the chat messages / sampling params shared by streaming and non-streaming LLM calls. */
export function buildGenerateLlmRequest(
  input: string,
  mode: PromptMode,
  settings: GenerationSettings,
  wardrobeAssignments?: GenerateWardrobeAssignment[] | null,
  variationSeed?: string,
  avoidedTokensInstruction?: string
): GenerateLlmRequest {
  let systemPrompt = buildModelSystemPrompt(settings.model, mode);

  if (mode === 'positive') {
    systemPrompt = `${systemPrompt}\n\n${buildClaritySystemAddendum(settings.detail, settings.model)}`;

    if (settings.seedLlmWithIngredients === false) {
      systemPrompt = `${systemPrompt}\n\n${KEYWORDS_ONLY_SYSTEM_ADDENDUM}`;
    }

    if (isMultiPersonInput(input.trim())) {
      if (settings.distinctPeople) {
        systemPrompt = `${systemPrompt}\n\n${buildDistinctPeopleSystemAddendum(input.trim())}`;
      } else {
        systemPrompt = `${systemPrompt}\n\n${buildGroupedPeopleSystemAddendum(input.trim())}`;
      }
    } else if (!settings.distinctPeople) {
      systemPrompt = `${systemPrompt}\n\n${buildSinglePersonSystemAddendum()}`;
    }
  }

  systemPrompt = `${systemPrompt}\n\nOutput ONLY the raw prompt text. No numbered analysis, thinking steps, labels, markdown, or explanations.`;

  const seedIngredients = settings.seedLlmWithIngredients !== false;
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...buildFewShotMessages(mode, settings, input),
    {
      role: 'user',
      content: buildUserMessage(
        input,
        mode,
        settings,
        seedIngredients ? wardrobeAssignments : null,
        seedIngredients ? variationSeed : undefined,
        avoidedTokensInstruction
      ),
    },
  ];

  const extraBody: Record<string, unknown> = {
    ...getLlmSamplingParams(settings.variation),
  };

  // Don't pin sampling to a locked variation seed when ingredients are off.
  if (settings.variation.enabled) {
    extraBody.seed = getLlmSeed(seedIngredients ? variationSeed : undefined);
  }

  return {
    messages,
    maxTokens: getDetailLimits(settings.detail, settings.model).maxTokens,
    temperature: getLlmTemperature(settings.variation),
    extraBody,
  };
}

export async function generateWithLlm(
  input: string,
  mode: PromptMode,
  settings: GenerationSettings = DEFAULT_GENERATION_SETTINGS,
  wardrobeAssignments?: GenerateWardrobeAssignment[] | null,
  variationSeed?: string,
  avoidedTokensInstruction?: string,
  tool?: string,
  llm?: LlmRequestOptions
): Promise<{ prompt: string; rawPrompt: string }> {
  const request = buildGenerateLlmRequest(
    input,
    mode,
    settings,
    wardrobeAssignments,
    variationSeed,
    avoidedTokensInstruction
  );

  const content = await chatCompletion({
    messages: request.messages,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
    model: resolveRequestLlmModel(llm),
    extraBody: request.extraBody,
    endpoint: resolveRequestLlmEndpoint(llm),
  });

  const rawPrompt = stripPromptArtifacts(content).trim() || content.trim();
  const prompt = await finalizePromptWithSparseExpand(
    content,
    input.trim(),
    mode,
    settings,
    wardrobeAssignments,
    tool,
    llm
  );
  return { prompt, rawPrompt };
}

function sanitizePrompt(raw: string): string {
  const cleaned = stripPromptArtifacts(raw);
  if (!cleaned.trim() || isThinkingOnlyArtifact(cleaned)) {
    throw new Error('LLM returned reasoning text instead of a prompt.');
  }

  return cleaned;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseKeywords(input: string): string[] {
  return input
    .split(/[,;|]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function paintSceneFromKeywords(
  input: string,
  settings: GenerationSettings = DEFAULT_GENERATION_SETTINGS
): string {
  const profile = getComfyModelDefinition(settings.model).profile;
  const keywords = parseKeywords(input);
  const primary = keywords[0] ?? input.trim();
  const supporting = keywords.slice(0, settings.detail === 'rich' ? 3 : 2);
  const topic = supporting.length > 0 ? `${primary}, ${supporting.join(', ')}` : primary;
  const normalized =
    topic.toLowerCase().startsWith('a ') || topic.toLowerCase().startsWith('an ')
      ? topic
      : topic.charAt(0).toLowerCase() + topic.slice(1);

  return paintSceneForProfile(normalized, settings.detail, profile);
}

function paintSceneForProfile(
  normalized: string,
  detail: GenerationSettings['detail'],
  profile: PromptProfileId
): string {
  if (profile === 'qwen_edit_instruction') {
    if (detail === 'concise') {
      return `Replace the scene with ${normalized} under clear directional light.`;
    }
    if (detail === 'rich') {
      return `Replace the scene with ${capitalize(normalized)} under clear directional light, surfaces showing tangible texture. The main subject anchors the frame while atmosphere builds from foreground to background. One distant environmental beat completes the unified composition.`;
    }
    return `Replace the scene with ${capitalize(normalized)} under clear directional light, with visible texture. The main subject anchors the frame while one background detail adds depth.`;
  }

  if (profile === 'instruct_pix2pix') {
    if (detail === 'concise') {
      return `Transform the image to show ${normalized}.`;
    }
    return `Transform the image to show ${capitalize(normalized)} with clear lighting and cohesive detail throughout the frame.`;
  }

  if (profile === 'qwen_t2i_factual') {
    if (detail === 'concise') {
      return `${capitalize(normalized)} under clear light with readable color and spatial depth. The main subject holds the frame in one cohesive moment.`;
    }
    if (detail === 'rich') {
      return `${capitalize(normalized)} anchors the midground with clear shape, texture, and color under soft directional light. Foreground and background elements sit in readable spatial layers—near surfaces show material detail while distant forms fade with atmospheric depth. Warm key light from camera-left mixes with cooler ambient fill, keeping subjects and any visible text sharp and legible.`;
    }
    return `${capitalize(normalized)} under clear directional light, with visible texture and cohesive color. The main subject sits in the midground while the background adds spatial depth in the same moment.`;
  }

  if (profile === 'flux_klein' || profile === 'flux_prose') {
    if (detail === 'concise') {
      return `${capitalize(normalized)} holds the frame under clear directional light. The subject reads sharply in the foreground with a simple background.`;
    }
    if (detail === 'rich') {
      return `${capitalize(normalized)} anchors the foreground, posture and materials rendered with tactile detail—worn surfaces, visible texture, and weight in the light. The setting unfolds in layered depth from near detail through midground forms to a hazy background, warm key light from camera-left mixing with cool ambient fill. Lighting follows a photographic logic: soft key, gentle fill, subtle rim separation on the subject. Materials read distinctly throughout—matte versus glossy, fine grain, natural imperfections. Shot at eye level with moderate depth of field, the main subject tack sharp while the environment recedes into atmospheric perspective.`;
    }
    return `${capitalize(normalized)} anchors the frame in the foreground with clear material detail. The setting builds behind in layered depth under soft directional light with warm key and cool fill. Moderate depth of field, eye-level composition.`;
  }

  if (profile === 'flux_schnell') {
    if (detail === 'concise') {
      return `${capitalize(normalized)} under clear light with a readable subject and simple background.`;
    }
    return `${capitalize(normalized)} in a cohesive scene with directional light, material detail, and a clear foreground subject.`;
  }

  if (profile === 'sd15_weighted') {
    const tags = normalized
      .split(/,\s*/)
      .map(part => part.trim())
      .filter(Boolean)
      .slice(0, detail === 'rich' ? 8 : detail === 'balanced' ? 6 : 4);
    return tags.join(', ');
  }

  if (profile === 'qwen_t2i_rich') {
    if (detail === 'concise') {
      return `${capitalize(normalized)} under clear directional light. The main subject holds the frame in one cohesive moment.`;
    }
    if (detail === 'rich') {
      return `${capitalize(normalized)} anchors the foreground with posture, clothing, and surface texture reading clearly in the light. The setting builds through midground detail into a soft atmospheric background, wet or worn materials catching specular highlights beside matte surfaces. Warm key light from camera-left mixes with cooler ambient fill across the frame, color temperature shifting from golden highlights to blue-gray shadows. Fine environmental beats—distant glow, weathered architecture, or natural depth—settle into the background while the air holds tangible atmosphere. The composition holds at eye level with moderate depth of field, the subject sharp while the scene recedes into unified perspective.`;
    }
    return `${capitalize(normalized)} under clear directional light, with visible texture and a cohesive palette. The main subject anchors the frame while one background detail adds depth to the same moment.`;
  }

  if (detail === 'concise') {
    return `${capitalize(normalized)} under clear directional light. The main subject holds the frame in one cohesive moment.`;
  }

  if (detail === 'rich') {
    return `${capitalize(normalized)} under clear directional light, surfaces showing tangible texture and material weight. The main subject anchors the frame in a single frozen moment, posture and clothing reading clearly in the light. Atmosphere builds depth from foreground to background while supporting details settle naturally into the midground. One distant environmental beat completes the same unified scene.`;
  }

  return `${capitalize(normalized)} under clear directional light, with visible texture and a cohesive palette. The main subject anchors the frame while one background detail adds depth to the same moment.`;
}

export function generateWithTemplate(
  input: string,
  mode: PromptMode,
  settings: GenerationSettings = DEFAULT_GENERATION_SETTINGS,
  wardrobeAssignments?: GenerateWardrobeAssignment[] | null,
  tool?: string
): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Input cannot be empty.');
  }

  if (mode === 'negative') {
    const profile = getComfyModelDefinition(settings.model).profile;
    if (fluxIgnoresNegative(profile)) {
      return `Stable composition with unchanged facial features, pose, and proportions. Clean unmarked surfaces. ${trimmed}.`;
    }
    if (profile === 'qwen_t2i_factual' || profile === 'qwen_t2i_rich') {
      return `Avoid changing facial features, pose, proportions, and composition unless requested. ${trimmed}.`;
    }
    if (profile === 'qwen_edit_instruction') {
      return `Do not change pose, face, or lighting unless specified. Only edit what is requested. Avoid: ${trimmed}.`;
    }
    if (profile === 'instruct_pix2pix') {
      return `Keep the rest of the image unchanged. ${trimmed}.`;
    }
    if (profile === 'sd15_weighted') {
      return `blurry, low quality, watermark, deformed, bad anatomy, extra limbs, ${trimmed}`;
    }
    return `Do not alter unrelated elements. Keep facial features, pose, proportions, and background composition unchanged unless explicitly requested. Avoid changing: ${trimmed}.`;
  }

  const lower = trimmed.toLowerCase();
  const preserveRequested = shouldPreserveSubject(trimmed);

  if (/^(remove|delete|erase)\b/.test(lower)) {
    return finalizePrompt(
      `Keep the subject's identity, pose, and proportions unchanged. ${capitalize(trimmed)}. Fill the removed area naturally so it matches the surrounding scene in light, texture, and color.`,
      trimmed,
      mode,
      settings,
      wardrobeAssignments,
      tool
    );
  }

  if (/^(add|insert|put)\b/.test(lower)) {
    return finalizePrompt(
      `Keep the subject's identity, pose, and proportions unchanged. ${capitalize(trimmed)}. The added elements sit naturally in the frame with matching perspective, lighting, and atmosphere.`,
      trimmed,
      mode,
      settings,
      wardrobeAssignments,
      tool
    );
  }

  if (/figure\s*[12]|picture\s*[12]/i.test(trimmed)) {
    return finalizePrompt(
      `Keep identity, pose, and framing from Figure 1 unless specified. ${capitalize(trimmed)}.`,
      trimmed,
      mode,
      settings,
      wardrobeAssignments,
      tool
    );
  }

  if (preserveRequested) {
    const sceneWords = trimmed
      .replace(/\b(keep|preserve|same)\b[^,.;|]*/gi, '')
      .replace(/^[,;\s|]+|[,;\s|]+$/g, '')
      .trim();

    const painted = paintSceneFromKeywords(sceneWords || trimmed, {
      ...settings,
      variation: { enabled: false, strength: 0 },
      distinctPeople: false,
      detail: 'balanced',
    });
    return finalizePrompt(
      `Keep the subject's facial features, body proportions, and pose exactly unchanged. ${painted.replace(/^The image shows /, 'The surrounding scene becomes ')}`,
      trimmed,
      mode,
      settings,
      wardrobeAssignments,
      tool
    );
  }

  if (!settings.distinctPeople && isMultiPersonInput(trimmed)) {
    const groupedScene = paintGroupedPeopleScene(trimmed, settings);
    if (groupedScene) {
      return finalizePrompt(groupedScene, trimmed, mode, settings, wardrobeAssignments, tool);
    }
  }

  if (settings.distinctPeople && isMultiPersonInput(trimmed)) {
    const distinctScene = paintDistinctPeopleScene(trimmed, settings);
    if (distinctScene) {
      return finalizePrompt(distinctScene, trimmed, mode, settings, wardrobeAssignments, tool);
    }
  }

  return finalizePrompt(
    paintSceneFromKeywords(trimmed, settings),
    trimmed,
    mode,
    settings,
    wardrobeAssignments,
    tool
  );
}

function buildGenerateResult(
  prompt: string,
  mode: PromptMode,
  provider: GenerateResult['provider'],
  settings: GenerationSettings,
  wardrobeAssignments?: GenerateWardrobeAssignment[] | null,
  rawPrompt?: string
): GenerateResult {
  const limits = getDetailLimits(settings.detail, settings.model);
  const modelDef = getComfyModelDefinition(settings.model);
  const wardrobeMeta = wardrobeAssignments?.length
    ? {
        wardrobeAssignments: wardrobeAssignments.map(assignment => ({
          wardrobeId: assignment.wardrobeId,
          footwearId: assignment.footwearId,
          accessoriesId: assignment.accessoriesId,
        })),
      }
    : undefined;

  return {
    prompt,
    mode,
    provider,
    model: settings.model,
    comfyNode: modelDef.comfyNode,
    limits: {
      minChars: limits.minChars,
      maxChars: limits.maxChars,
      maxSentences: limits.maxSentences,
      maxTokens: limits.maxTokens,
    },
    metadata: withRawPrompt(wardrobeMeta, rawPrompt),
  };
}

export async function generatePrompt(
  input: string,
  mode: PromptMode,
  settings: GenerationSettings = DEFAULT_GENERATION_SETTINGS,
  options?: GeneratePromptOptions
): Promise<GenerateResult> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Input cannot be empty.');
  }

  // Write prompts with a scene/T2I profile when on Generate, even if an edit
  // checkpoint is selected for queueing. Report the user's selected model back.
  const selectedModel = resolveModelForQueueTool(settings.model, options?.tool);
  const promptModel = resolveModelForPromptGeneration(selectedModel, options?.tool);
  const writeSettings: GenerationSettings = {
    ...settings,
    model: promptModel,
  };
  const resultSettings: GenerationSettings = {
    ...writeSettings,
    model: selectedModel,
  };

  const llmEnabled = resolveRequestLlmEnabled(options?.llm);
  const seedIngredients = writeSettings.seedLlmWithIngredients !== false;
  const wardrobeAssignments =
    mode === 'positive' && seedIngredients
      ? buildGenerateWardrobeAssignments(trimmed, writeSettings, {
          recentClothing: options?.recentClothing,
          lockedWardrobeId: options?.lockedWardrobeId,
          avoidedTokens: options?.avoidedTokens,
        })
      : null;

  if (llmEnabled) {
    try {
      const { prompt, rawPrompt } = await generateWithLlm(
        trimmed,
        mode,
        writeSettings,
        wardrobeAssignments,
        options?.variationSeed,
        options?.avoidedTokensInstruction,
        options?.tool,
        options?.llm
      );
      return buildGenerateResult(
        prompt,
        mode,
        'llm',
        resultSettings,
        wardrobeAssignments,
        rawPrompt
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown LLM error';
      const fallbackAllowed = resolveRequestTemplateFallback(options?.llm);

      if (!fallbackAllowed) {
        throw new Error(message);
      }

      console.warn('[prompt-generator] LLM failed, using template fallback:', message);
    }
  }

  const templatePrompt = generateWithTemplate(
    trimmed,
    mode,
    writeSettings,
    wardrobeAssignments,
    options?.tool
  );
  return buildGenerateResult(
    templatePrompt,
    mode,
    'template',
    resultSettings,
    wardrobeAssignments,
    templatePrompt
  );
}

export type GenerateStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; result: GenerateResult }
  | { type: 'error'; message: string };

/**
 * Streaming counterpart to `generatePrompt`. Mirrors the same LLM → template
 * fallback control flow, but yields raw text deltas as they arrive so a
 * caller can progressively fill a UI, then finalizes with the same
 * sanitize/format pipeline once the LLM response completes.
 */
export async function* generatePromptStream(
  input: string,
  mode: PromptMode,
  settings: GenerationSettings = DEFAULT_GENERATION_SETTINGS,
  options?: GeneratePromptOptions
): AsyncGenerator<GenerateStreamEvent, void, unknown> {
  const trimmed = input.trim();
  if (!trimmed) {
    yield { type: 'error', message: 'Input cannot be empty.' };
    return;
  }

  const selectedModel = resolveModelForQueueTool(settings.model, options?.tool);
  const promptModel = resolveModelForPromptGeneration(selectedModel, options?.tool);
  const writeSettings: GenerationSettings = {
    ...settings,
    model: promptModel,
  };
  const resultSettings: GenerationSettings = {
    ...writeSettings,
    model: selectedModel,
  };

  const llmEnabled = resolveRequestLlmEnabled(options?.llm);
  const seedIngredients = writeSettings.seedLlmWithIngredients !== false;
  const wardrobeAssignments =
    mode === 'positive' && seedIngredients
      ? buildGenerateWardrobeAssignments(trimmed, writeSettings, {
          recentClothing: options?.recentClothing,
          lockedWardrobeId: options?.lockedWardrobeId,
          avoidedTokens: options?.avoidedTokens,
        })
      : null;

  if (llmEnabled) {
    try {
      const request = buildGenerateLlmRequest(
        trimmed,
        mode,
        writeSettings,
        wardrobeAssignments,
        options?.variationSeed,
        options?.avoidedTokensInstruction
      );

      let raw = '';
      for await (const delta of chatCompletionStream({
        messages: request.messages,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        model: resolveRequestLlmModel(options?.llm),
        extraBody: request.extraBody,
        usageContext: { route: 'generate-stream' },
        endpoint: resolveRequestLlmEndpoint(options?.llm),
      })) {
        raw += delta;
        yield { type: 'delta', text: delta };
      }

      const rawPrompt = stripPromptArtifacts(raw).trim() || raw.trim();
      const prompt = await finalizePromptWithSparseExpand(
        raw,
        trimmed,
        mode,
        writeSettings,
        wardrobeAssignments,
        options?.tool,
        options?.llm
      );

      yield {
        type: 'done',
        result: buildGenerateResult(
          prompt,
          mode,
          'llm',
          resultSettings,
          wardrobeAssignments,
          rawPrompt
        ),
      };
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown LLM error';
      const fallbackAllowed = resolveRequestTemplateFallback(options?.llm);

      if (!fallbackAllowed) {
        yield { type: 'error', message };
        return;
      }

      console.warn('[prompt-generator] LLM stream failed, using template fallback:', message);
    }
  }

  {
    const templatePrompt = generateWithTemplate(
      trimmed,
      mode,
      writeSettings,
      wardrobeAssignments,
      options?.tool
    );
    yield {
      type: 'done',
      result: buildGenerateResult(
        templatePrompt,
        mode,
        'template',
        resultSettings,
        wardrobeAssignments,
        templatePrompt
      ),
    };
  }
}
