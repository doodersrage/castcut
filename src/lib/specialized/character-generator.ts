import {
  buildCharacterPresetBlock,
  buildCharacterPresetSanitizeContext,
  buildCharacterPresetUserDirective,
  buildPoseAnchorUserDirective,
  buildPresetWardrobeSummary,
  countCharacterPresetSelections,
  hasCharacterPresetOptions,
  hasPoseAnchor,
  isDuoHeadcount,
  mergeCharacterPresetsIntoPrompt,
  normalizeCharacterPresetOptions,
} from '../character-options';
import {
  buildCharacterMandatoryBlock,
  buildDuoIdentityUserDirective,
  parseCharacterHints,
  pickCharacterIdentitySeed,
  pickDuoCharacterIdentitySeeds,
} from '../character-hints';
import { buildMandatoryLocationBlock, parseSettingHint } from '../hint-location';
import {
  buildSinglePersonSystemAddendum,
  buildSinglePersonUserDirective,
  buildSoloSubjectLockDirective,
} from '../single-person';
import {
  buildDistinctPeopleUserDirective,
  ensureDistinctPeoplePrompt,
  parsePeopleConstraint,
  stripStreetClothingFromAthleticPeoplePrompt,
} from '../distinct-people';
import {
  buildClothingCoherenceUserDirective,
  buildClothingPickFilters,
  buildNoClothingUserDirective,
  hintsImplyNoClothing,
  subjectGenderToClothingGender,
} from '../clothing-tags';
import {
  buildGenerateWardrobeAssignments,
  buildGenerateWardrobeUserDirective,
  mergeGenerateWardrobeIntoPrompt,
} from '../generate-wardrobe';
import { inferAthleticSport } from '../athletic-sport-profiles';
import {
  formatSportActionInstructions,
  getSportActionInstructions,
  stripIncompatibleSportActionsFromPrompt,
  ensureCyclingHelmetInPrompt,
  ensureAthleticBottomInPrompt,
} from '../athletic-sport-actions';
import { DEFAULT_GENERATION_SETTINGS } from '../generation-settings';
import { hasWardrobeCatalogSelection, shouldPickRandomCharacterOutfit } from '../clothing-catalog';
import { getDetailLimits } from '../detail-level';
import { mergeLocationExclusions } from '../location-exclusions';
import { applyLockedLocation } from '../locked-location';
import { applyLockedVariationSeed } from '../locked-variation-seed';
import { buildRandomCharacterSeed } from './scene-pools';
import { runSpecializedPrompt } from './runner';
import type { CharacterOptions, ToolGenerateResult } from './types';

const PORTRAIT_FRAMING: Record<NonNullable<CharacterOptions['portraitStyle']>, string> = {
  portrait: 'tight portrait framing on face, hair, expression, and shoulders',
  'full-body': 'full-body framing from head to shoes with readable posture',
  action:
    'dynamic action framing: mid-motion body with visible momentum, engaged muscles, and environment interaction—never a static standing pose',
};

const ACTION_INSTRUCTIONS = `- Name a specific verb/action (sprint, leap, dodge, climb, strike, vault, slide, reach, etc.) and show the body mid-movement.
- Describe weight shift, limb extension, muscle tension, and fabric/hair reacting to motion.
- Include one concrete environment beat tied to the action (splashing water, kicked dust, swinging door, wind-lifted coat).
- Prefer energetic camera language: low angle, slight motion blur on extremities, or freeze-frame peak action.`;

export async function generateCharacterPrompt(
  options: CharacterOptions
): Promise<ToolGenerateResult> {
  const detail = options.detail === 'concise' ? 'balanced' : options.detail;
  const portraitStyle = options.portraitStyle ?? 'portrait';
  const seedIngredients = options.seedLlmWithIngredients !== false;
  const effectiveHints = seedIngredients
    ? applyLockedLocation(options.hints, options.lockedLocation)
    : options.hints;
  const parsed = parseCharacterHints(effectiveHints);
  const presetOptions = normalizeCharacterPresetOptions(options.presetOptions, {
    clothingGender: subjectGenderToClothingGender(parsed.gender),
  });
  const peopleConstraint = parsePeopleConstraint(effectiveHints ?? '');
  const duoFromHints = (peopleConstraint.count ?? 0) >= 2;
  const duoMode = isDuoHeadcount(presetOptions) || duoFromHints;
  const settingHint = parseSettingHint(effectiveHints);
  const locationExclude = mergeLocationExclusions(
    options.recentLocations,
    options.blockedLocations
  );
  const { seed: rolledSeed, location: sceneLocation } = buildRandomCharacterSeed(
    effectiveHints,
    portraitStyle,
    locationExclude,
    options.avoidedTokens
  );
  const seed = applyLockedVariationSeed(rolledSeed, options.variationSeed);
  const alwaysIncludeClothing = options.alwaysIncludeClothing !== false;
  const clothingFilters = buildClothingPickFilters({
    gender: parsed.gender,
    sceneLocation,
    environmentSeed: seed,
    hints: options.hints,
    presetOptions,
    excludeIds: options.recentClothing,
    avoidedTokens: options.avoidedTokens,
  });
  const wardrobeCorpus = [options.hints, seed].filter(Boolean).join(', ');
  const wardrobeAssignments =
    seedIngredients &&
    shouldPickRandomCharacterOutfit({
      presetOptions,
      hints: options.hints,
      alwaysIncludeClothing,
    })
      ? buildGenerateWardrobeAssignments(
          wardrobeCorpus,
          {
            ...DEFAULT_GENERATION_SETTINGS,
            distinctPeople: duoMode,
            alwaysIncludeClothing,
          },
          {
            assumePeople: true,
            forcedCount: duoMode ? 2 : 1,
            forcedDistinctPeople: duoMode,
            forcedGender: duoMode
              ? peopleConstraint.gender === 'women' || peopleConstraint.gender === 'men'
                ? peopleConstraint.gender
                : 'mixed'
              : undefined,
            recentClothing: options.recentClothing,
            teamKit: options.teamKit,
            lockedWardrobeId: options.lockedWardrobeId,
            avoidedTokens: options.avoidedTokens,
          }
        )
      : null;
  const presetWardrobeSummary = hasWardrobeCatalogSelection(presetOptions)
    ? buildPresetWardrobeSummary(presetOptions)
    : null;
  const environmentSeed = wardrobeAssignments?.length
    ? `${seed}, ${wardrobeAssignments
        .map(assignment => `${assignment.label ?? 'the subject'} wearing ${assignment.summary}`)
        .join('; ')}`
    : presetWardrobeSummary
      ? `${seed}, wearing ${presetWardrobeSummary}`
      : seed;
  const keywordsOnly = !seedIngredients;
  // Infer sport/action only from user text when ingredients are off—rolled
  // environment seeds otherwise pull athletic kit into "keywords-only" runs.
  const intentCorpus = keywordsOnly
    ? (options.hints ?? '').trim()
    : [options.hints, seed, environmentSeed].filter(Boolean).join(', ');
  const intentSport = inferAthleticSport(intentCorpus);
  const athleticDuoContext =
    duoMode &&
    (intentSport !== null ||
      Boolean(
        wardrobeAssignments?.some(
          assignment => assignment.filters.athleticActivity || assignment.filters.athleticSport
        )
      ));
  const cyclingHelmetRequired =
    intentSport === 'cycling' ||
    Boolean(wardrobeAssignments?.some(a => a.filters.athleticSport === 'cycling'));
  const identitySeed = duoMode ? null : pickCharacterIdentitySeed(parsed);
  const duoIdentitySeeds = duoMode
    ? pickDuoCharacterIdentitySeeds(
        peopleConstraint.gender === 'women' ||
          peopleConstraint.gender === 'men' ||
          peopleConstraint.gender === 'mixed'
          ? peopleConstraint.gender
          : parsed.gender,
        parsed.wantsMinimalHair,
        athleticDuoContext
      )
    : null;
  const duoIdentityDirective = duoIdentitySeeds
    ? buildDuoIdentityUserDirective(
        duoIdentitySeeds[0],
        duoIdentitySeeds[1],
        athleticDuoContext,
        cyclingHelmetRequired
      )
    : null;
  const mandatoryBlock = buildCharacterMandatoryBlock(parsed);
  const locationBlock = seedIngredients ? buildMandatoryLocationBlock(settingHint.location) : null;
  const presetBlock = buildCharacterPresetBlock(presetOptions);
  const presetDirective = buildCharacterPresetUserDirective(presetOptions);
  const hasPresets = hasCharacterPresetOptions(presetOptions);
  // Sanitize/format must not see rolled location/environment seeds — those leak
  // into min-char padding as invented setting phrases that were never in the LLM draft.
  const sanitizeContext = buildCharacterPresetSanitizeContext(
    options.hints,
    '',
    keywordsOnly ? normalizeCharacterPresetOptions({}) : presetOptions
  );

  const actionBlock =
    !keywordsOnly && portraitStyle === 'action' && !hasPoseAnchor(presetOptions)
      ? intentSport
        ? `\n${formatSportActionInstructions(intentSport, intentCorpus)}`
        : `\n${ACTION_INSTRUCTIONS}`
      : '';

  const framingInstruction = hasPoseAnchor(presetOptions)
    ? 'Frame enough of the body and anchored object that the pose anchor reads clearly—avoid tight face-only portrait cropping that hides limb placement.'
    : PORTRAIT_FRAMING[portraitStyle];

  const soloRules = duoMode
    ? `- Describe EXACTLY TWO people interacting—balanced visual weight, readable gestures, and clear spatial relationship. No crowd, no extras with faces.
- Both subjects need clearly contrasting visual identity: different face shape, hair style/color, skin tone, and age read—not two interchangeable generic figures.
- For athletic competition, both wear the same race kit cut; rivals differ only in accent color or bib number—not unrelated outfit types.`
    : `- Describe EXACTLY ONE person—never a couple, group, crowd, or background extras with faces.
- No second person, no silhouettes, no reflections with another face, no bystanders, no staff, no audience.
${buildSinglePersonSystemAddendum()}`;

  const toolInstructions = keywordsOnly
    ? `You are a character prompt generator for ComfyUI.
${soloRules}
- Expand the user's keywords into one model-ready character prompt.
- Stay faithful to those keywords for identity, wardrobe, setting, and props.
- Do not invent a wardrobe catalog, outfit roll, identity seed, or substitute a different location unless the keywords ask for it.
- ${framingInstruction}
- Be specific and renderable, but invent details only where the keywords are silent and never replace what they specify.
- When a MANDATORY CHARACTER block is present, follow it exactly for sex/gender, age, and hair.`
    : `You are a character prompt generator for ComfyUI.
${soloRules}
- ${framingInstruction}${actionBlock}
- Include concrete visual identity: age read, ethnicity, face shape, hair, eyes, skin details, clothing materials, accessories, pose, expression, and one environmental context beat.
- When a MANDATORY SETTING block is present, place the character in that exact location with visible environmental detail.
- When an environment seed is provided, use it for pose/mood/lighting—but never override a mandatory setting with a different place.
- When a CHARACTER PRESET block is present, follow its composition, lens, camera angle, lighting, physique, expression, gaze, realism, hair, pose anchor, wardrobe, and accessory phrases exactly—integrate them smoothly into prose.
- Positional anchors must tie limbs to the named object; avoid impossible contortions or floating limbs.
- Be highly specific and renderable—avoid generic phrases like "beautiful woman" without detail.
- When a MANDATORY CHARACTER block is present, follow it exactly for sex/gender, age, and hair. Never override it with a random identity seed.
- When wardrobe catalog ingredients or a random outfit seed is present, keep every assigned garment and make styling fit the subject's gender and the scene (weather, location, activity)—do not swap to an unrelated outfit.
- Do not default to bald or shaved hair unless the mandatory block explicitly requests it.`;

  const poseAnchorDirective = buildPoseAnchorUserDirective(presetOptions);
  const clothingDirective = !seedIngredients
    ? null
    : wardrobeAssignments?.length
      ? wardrobeAssignments.length === 1 && !wardrobeAssignments[0]?.label
        ? buildClothingCoherenceUserDirective(
            wardrobeAssignments[0]!.filters,
            wardrobeAssignments[0]!.summary
          )
        : buildGenerateWardrobeUserDirective(wardrobeAssignments, {
            teamKit: options.teamKit,
          })
      : presetWardrobeSummary
        ? buildClothingCoherenceUserDirective(clothingFilters, presetWardrobeSummary)
        : hintsImplyNoClothing(options.hints) || hintsImplyNoClothing(seed)
          ? buildNoClothingUserDirective()
          : null;

  const needsWardrobePostProcess =
    !keywordsOnly &&
    (Boolean(wardrobeAssignments?.length) ||
      Boolean(presetWardrobeSummary) ||
      hasPresets ||
      hasPoseAnchor(presetOptions));

  const finalizeCharacterPrompt = (prompt: string): string => {
    const { maxChars } = getDetailLimits(detail, options.model);
    let result = prompt;
    if (duoMode) {
      result = ensureDistinctPeoplePrompt(result, options.hints ?? '', {
        ...DEFAULT_GENERATION_SETTINGS,
        distinctPeople: true,
        seedLlmWithIngredients: seedIngredients,
      });
      if (athleticDuoContext) {
        result = stripStreetClothingFromAthleticPeoplePrompt(result);
      }
    }
    if (wardrobeAssignments?.length) {
      result = mergeGenerateWardrobeIntoPrompt(
        result,
        wardrobeAssignments,
        maxChars,
        options.hints
      );
    } else if (presetWardrobeSummary) {
      result = mergeGenerateWardrobeIntoPrompt(
        result,
        [
          {
            summary: presetWardrobeSummary,
            filters: clothingFilters,
            wardrobeId: presetOptions.wardrobeCatalog,
            footwearId: presetOptions.footwearCatalog,
            accessoriesId: presetOptions.accessoriesCatalog,
          },
        ],
        maxChars,
        options.hints
      );
    }
    if (hasPresets || hasPoseAnchor(presetOptions)) {
      result = mergeCharacterPresetsIntoPrompt(result, presetOptions);
    }
    if (intentSport) {
      result = stripIncompatibleSportActionsFromPrompt(result, intentSport, intentCorpus);
    }
    if (cyclingHelmetRequired) {
      result = ensureCyclingHelmetInPrompt(result, intentCorpus);
    }
    if (intentSport && intentSport !== 'cycling') {
      result = ensureAthleticBottomInPrompt(result, intentSport, {
        hints: intentCorpus,
        wardrobeSummary: wardrobeAssignments?.[0]?.summary ?? presetWardrobeSummary ?? undefined,
      });
    }
    return result;
  };

  const postProcessPrompt =
    needsWardrobePostProcess || duoMode || intentSport ? finalizeCharacterPrompt : undefined;

  const hintText = options.hints?.trim() || '';
  const userParts = keywordsOnly
    ? [
        options.activeCharacterDescriptor?.trim()
          ? `Active character descriptor (mandatory): ${options.activeCharacterDescriptor.trim()}`
          : null,
        mandatoryBlock,
        hintText
          ? `Scene keywords:\n${hintText}`
          : 'Scene keywords:\n(none provided — invent a single coherent character from the framing only, without a wardrobe catalog)',
        `Framing: ${portraitStyle}`,
        duoMode
          ? 'DUO MODE (mandatory): exactly two interacting people in frame. No third person, crowd, or background faces.'
          : (buildSoloSubjectLockDirective(effectiveHints) ?? buildSinglePersonUserDirective()),
        options.avoidedTokensInstruction ?? null,
        'Write one model-ready character prompt from the keywords above. Do not invent a wardrobe catalog or substitute a different location unless the keywords ask for it.',
      ]
    : [
        presetBlock,
        presetDirective,
        options.activeCharacterDescriptor?.trim()
          ? `Active character descriptor (mandatory): ${options.activeCharacterDescriptor.trim()}`
          : null,
        poseAnchorDirective,
        mandatoryBlock,
        locationBlock || null,
        duoIdentityDirective,
        mandatoryBlock
          ? null
          : identitySeed
            ? `FACE AND BODY FIRST (mandatory — commit to this exact face geometry and this exact body height/size/proportions/posture; never a stock beauty face or default slim/fitness silhouette): ${identitySeed}`
            : null,
        `Environment and mood: ${environmentSeed}`,
        clothingDirective,
        hasPoseAnchor(presetOptions)
          ? 'Pose anchor preset is active—prioritize it over default portrait/action framing.'
          : `Framing: ${portraitStyle}`,
        portraitStyle === 'action' && !hasPoseAnchor(presetOptions)
          ? intentSport
            ? getSportActionInstructions(intentSport, intentCorpus)
            : 'The character must be actively doing something—not posing for a portrait.'
          : null,
        duoMode
          ? 'DUO MODE (mandatory): exactly two interacting people in frame. No third person, crowd, or background faces.'
          : (buildSoloSubjectLockDirective(effectiveHints) ?? buildSinglePersonUserDirective()),
        duoFromHints ? buildDistinctPeopleUserDirective(options.hints ?? '') : null,
        options.avoidedTokensInstruction ?? null,
        'Write one model-ready character prompt.',
      ];
  const filteredUserParts = userParts.filter(Boolean);

  const userMessage = filteredUserParts.join('\n\n');
  const variationStrength = options.variationStrength ?? 50;
  const temperature = parsed.hasIdentityConstraints
    ? 0.55 + variationStrength / 400
    : 0.75 + variationStrength / 200;

  return runSpecializedPrompt({
    model: options.model,
    detail,
    toolInstructions,
    userMessage,
    templateFallback: () => {
      if (keywordsOnly) {
        return buildCharacterTemplate(
          hintText || parsed.raw,
          portraitStyle,
          null,
          normalizeCharacterPresetOptions({}),
          duoMode
        );
      }
      let prompt = buildCharacterTemplate(
        parsed.raw,
        portraitStyle,
        identitySeed,
        presetOptions,
        duoMode
      );
      const { maxChars } = getDetailLimits(detail, options.model);
      if (wardrobeAssignments?.length) {
        prompt = mergeGenerateWardrobeIntoPrompt(
          prompt,
          wardrobeAssignments,
          maxChars,
          options.hints
        );
      } else if (presetWardrobeSummary) {
        prompt = mergeGenerateWardrobeIntoPrompt(
          prompt,
          [{ summary: presetWardrobeSummary, filters: clothingFilters }],
          maxChars,
          options.hints
        );
      }
      if (intentSport) {
        prompt = stripIncompatibleSportActionsFromPrompt(prompt, intentSport, intentCorpus);
      }
      return prompt;
    },
    sanitizeInput: sanitizeContext,
    enforceMinimum: keywordsOnly ? false : !(hasPresets || hasPoseAnchor(presetOptions)),
    postProcessPrompt: keywordsOnly
      ? intentSport
        ? (prompt: string) =>
            stripIncompatibleSportActionsFromPrompt(prompt, intentSport, intentCorpus)
        : undefined
      : postProcessPrompt,
    temperature: options.llm?.temperature ?? temperature,
    allowTemplateFallback: options.llm?.allowTemplateFallback,
    llmModel: options.llm?.llmModel,
    llmEnabled: options.llm?.llmEnabled,
    llmProvider: options.llm?.llmProvider,
    llmApiKey: options.llm?.llmApiKey,
    soloSubject: !duoMode,
    seed: keywordsOnly ? hintText || undefined : environmentSeed,
    metadata: {
      portraitStyle,
      hints: parsed.raw || null,
      location: settingHint.location,
      sceneLocation: keywordsOnly ? null : sceneLocation,
      seed: keywordsOnly ? hintText || null : environmentSeed,
      wardrobeAssignments: keywordsOnly ? null : wardrobeAssignments,
      randomOutfit: keywordsOnly ? null : (wardrobeAssignments ?? null),
      alwaysIncludeClothing,
      seedLlmWithIngredients: seedIngredients,
      identitySeed: keywordsOnly ? null : identitySeed,
      parsedHints: parsed,
      presetOptions: keywordsOnly ? normalizeCharacterPresetOptions({}) : presetOptions,
      duoMode,
      teamKit: options.teamKit ?? false,
      presetCount: !keywordsOnly && hasPresets ? countCharacterPresetSelections(presetOptions) : 0,
    },
  });
}

function buildCharacterTemplate(
  hints: string,
  portraitStyle: NonNullable<CharacterOptions['portraitStyle']>,
  identitySeed: string | null,
  presetOptions: ReturnType<typeof normalizeCharacterPresetOptions>,
  duoMode = false
): string {
  const base = (() => {
    const subject = hints.trim() || identitySeed || 'a distinctive original person';
    const parsed = parseCharacterHints(hints);
    const location = parseSettingHint(hints).location;
    const locationNote = location ? ` The scene is set in ${location}.` : '';
    const hairNote = parsed.wantsMinimalHair
      ? 'Head and scalp read exactly as described.'
      : 'Hair is visible and specific—color, length, and texture read clearly—not bald or shaved unless requested.';
    const soloNote = duoMode
      ? 'Both subjects read as distinct individuals with balanced visual weight.'
      : 'No other people appear anywhere in the frame.';

    if (hasPoseAnchor(presetOptions)) {
      return `${capitalize(subject)}${locationNote} ${hairNote}. ${soloNote}`;
    }

    if (portraitStyle === 'full-body') {
      return `${capitalize(subject)} stands in clear directional light, full body visible from head to worn shoes.${locationNote} ${hairNote} Clothing shows material texture and fit; posture and expression read distinctly in the same moment. ${soloNote}`;
    }

    if (portraitStyle === 'action') {
      return `${capitalize(subject)} is caught mid-action—body driving through the scene with clear momentum under sharp directional light.${locationNote} Weight shifts forward, limbs extend, and clothing or hair reacts to the movement; muscles read engaged, not at rest. ${hairNote} One concrete environment beat ties to the motion (dust, spray, wind, or debris). ${soloNote}`;
    }

    return `${capitalize(subject)} in a close portrait under soft directional light.${locationNote} ${hairNote} Face, skin texture, and expression are rendered with specific detail; shoulders and clothing edge into frame. ${soloNote}`;
  })();

  return mergeCharacterPresetsIntoPrompt(base, presetOptions);
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}
