import {
  buildClothingCoherenceUserDirective,
  buildClothingGuardrailLines,
  buildClothingPickFilters,
  hintsImplyNoClothing,
  type ClothingPickFilters,
} from './clothing-tags';
import {
  promptContainsSportWardrobeConflict,
  summaryMatchesSportWardrobe,
} from './athletic-sport-profiles';
import {
  resolveAthleticSportForWardrobe,
  stripIncompatibleSportActionsFromPrompt,
  ensureCyclingHelmetInPrompt,
  ensureAthleticBottomInPrompt,
  appendCyclingHelmetToSummary,
} from './athletic-sport-actions';
import {
  mergeWardrobeAssignmentsIntoPrompt,
  pickRandomCharacterOutfit,
  buildOutfitFromLockedWardrobeId,
  type RandomCharacterOutfit,
} from './clothing-catalog';
import { isMultiPersonInput, parsePeopleConstraint } from './distinct-people';
import type { GenerationSettings } from './generation-settings';
import { parseSettingHint } from './hint-location';
import type { SubjectGender } from './variation-seed';

export type GenerateWardrobeAssignment = {
  label?: string;
  summary: string;
  filters: ClothingPickFilters;
  wardrobeId?: string | null;
  bottomId?: string | null;
  footwearId?: string | null;
  accessoriesId?: string | null;
};

const PERSON_HINT =
  /\b(?:\d+\s+(?:people|persons|figures|characters|models|women|men|girls|boys))\b|\b(?:a\s+)?(?:young|old|elderly|middle-aged|teen(?:age)?)?\s*(?:man|woman|person|girl|boy|guy|lady|gentleman|model|character|vendor|monk|dancer|fisherman|boxer|chef|waiter|nurse|doctor|soldier|knight|wizard|hero|villain|protagonist|musician|courier|diver|painter|botanist|mechanic|sailor|archivist|chef|dancer)\b|\b(?:portrait\s+of|selfie\s+of|headshot\s+of|bust\s+of)\b/i;

export function inputImpliesPeople(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) {
    return false;
  }

  return isMultiPersonInput(trimmed) || PERSON_HINT.test(trimmed);
}

export function shouldPickGenerateWardrobe(
  input: string,
  alwaysIncludeClothing?: boolean,
  assumePeople = false
): boolean {
  if (hintsImplyNoClothing(input)) {
    return false;
  }

  if (!assumePeople && !inputImpliesPeople(input)) {
    return false;
  }

  // Unchecked "Always include wardrobe" means do not auto-roll catalog outfits.
  if (alwaysIncludeClothing !== true) {
    return false;
  }

  return true;
}

function assignmentGenderForSlot(
  slotIndex: number,
  constraintGender: SubjectGender
): SubjectGender | undefined {
  if (constraintGender === 'women' || constraintGender === 'men') {
    return constraintGender;
  }

  if (constraintGender === 'mixed') {
    return slotIndex === 0 ? 'women' : 'men';
  }

  return undefined;
}

function assignmentCount(input: string, settings: GenerationSettings): number {
  if (!isMultiPersonInput(input)) {
    return 1;
  }

  if (!settings.distinctPeople) {
    return 1;
  }

  const count = parsePeopleConstraint(input).count ?? 2;
  return Math.min(Math.max(count, 2), 4);
}

function assignmentLabel(
  index: number,
  count: number,
  distinctPeople: boolean
): string | undefined {
  if (count <= 1 || !distinctPeople) {
    return undefined;
  }

  if (index === 0) {
    return 'person on the left';
  }

  if (index === 1) {
    return 'person on the right';
  }

  return `person ${index + 1}`;
}

function collectOutfitIds(outfit: RandomCharacterOutfit): string[] {
  return [outfit.wardrobeId, outfit.bottomId, outfit.footwearId, outfit.accessoriesId].filter(
    (id): id is string => Boolean(id)
  );
}

import { hintsDescribeAthleticDuoCompetition } from './athletic-duo-hints';

export { hintsDescribeAthleticDuoCompetition };

export function buildGenerateWardrobeAssignments(
  input: string,
  settings: GenerationSettings,
  options?: {
    assumePeople?: boolean;
    recentClothing?: readonly string[];
    forcedCount?: number;
    forcedDistinctPeople?: boolean;
    forcedGender?: SubjectGender;
    teamKit?: boolean;
    lockedWardrobeId?: string;
    fantasyWardrobe?: boolean;
    avoidedTokens?: readonly string[];
  }
): GenerateWardrobeAssignment[] | null {
  if (!shouldPickGenerateWardrobe(input, settings.alwaysIncludeClothing, options?.assumePeople)) {
    return null;
  }

  const trimmed = input.trim();
  const location = parseSettingHint(trimmed).location;
  const constraint = parsePeopleConstraint(trimmed);
  const resolvedGender = options?.forcedGender ?? constraint.gender;
  const distinctPeople = options?.forcedDistinctPeople ?? settings.distinctPeople;
  const count = options?.forcedCount ?? assignmentCount(trimmed, { ...settings, distinctPeople });
  const excludeIds: string[] = [...(options?.recentClothing ?? [])];
  const assignments: GenerateWardrobeAssignment[] = [];
  const sharedCompetitionKit =
    options?.teamKit === true || hintsDescribeAthleticDuoCompetition(trimmed);

  for (let index = 0; index < count; index += 1) {
    if (index > 0 && sharedCompetitionKit && assignments[0]) {
      assignments.push({
        ...assignments[0],
        label: assignmentLabel(index, count, distinctPeople),
      });
      continue;
    }

    const filters = buildClothingPickFilters({
      gender: assignmentGenderForSlot(index, resolvedGender),
      sceneLocation: location,
      environmentSeed: trimmed,
      hints: trimmed,
      excludeIds,
      fantasyWardrobe: options?.fantasyWardrobe,
      avoidedTokens: options?.avoidedTokens,
    });
    const outfit =
      options?.lockedWardrobeId && index === 0
        ? (buildOutfitFromLockedWardrobeId(options.lockedWardrobeId, filters) ??
          pickRandomCharacterOutfit(filters))
        : options?.lockedWardrobeId && sharedCompetitionKit && assignments[0]
          ? ({
              summary: assignments[0].summary,
              wardrobeId: assignments[0].wardrobeId ?? null,
              bottomId: assignments[0].bottomId ?? null,
              footwearId: assignments[0].footwearId ?? null,
              accessoriesId: assignments[0].accessoriesId ?? null,
              wardrobe: null,
              footwear: null,
              accessories: null,
              filters: assignments[0].filters,
            } satisfies RandomCharacterOutfit)
          : pickRandomCharacterOutfit(filters);
    if (!outfit.summary.trim()) {
      continue;
    }

    excludeIds.push(...collectOutfitIds(outfit));
    const summary =
      filters.athleticSport === 'cycling'
        ? appendCyclingHelmetToSummary(outfit.summary, trimmed)
        : outfit.summary;
    assignments.push({
      label: assignmentLabel(index, count, distinctPeople),
      summary,
      filters: outfit.filters,
      wardrobeId: outfit.wardrobeId,
      bottomId: outfit.bottomId,
      footwearId: outfit.footwearId,
      accessoriesId: outfit.accessoriesId,
    });
  }

  return assignments.length > 0 ? assignments : null;
}

export function buildGenerateWardrobeUserDirective(
  assignments: GenerateWardrobeAssignment[],
  options?: { teamKit?: boolean }
): string | null {
  if (assignments.length === 0) {
    return null;
  }

  if (assignments.length === 1 && !assignments[0]?.label) {
    const assignment = assignments[0]!;
    return buildClothingCoherenceUserDirective(assignment.filters, assignment.summary);
  }

  const lines = assignments.map(assignment => {
    const who = assignment.label ?? 'the subject';
    return `${who}: ${assignment.summary}`;
  });

  const guardrailBlocks = assignments
    .map(assignment => {
      const who = assignment.label ?? 'the subject';
      const guardrails = buildClothingGuardrailLines(assignment.filters);
      if (guardrails.length === 0) {
        return null;
      }
      return `${who} — ${guardrails.join(' ')}`;
    })
    .filter(Boolean);

  const sharedCompetitionKit =
    assignments.length >= 2 &&
    assignments.every(assignment => assignment.summary === assignments[0]?.summary) &&
    assignments.some(assignment => assignment.filters.athleticSport);

  const teamKit = options?.teamKit === true;

  return [
    'WARDROBE COHERENCE (mandatory):',
    "Weave each assigned outfit into that person's sentence—do not add a separate wardrobe paragraph before the scene.",
    sharedCompetitionKit && teamKit
      ? 'Both wear identical race kits—same colors and garment types; only bib numbers may differ.'
      : sharedCompetitionKit
        ? 'Both competitors wear the same race kit cut and garment types—rivals may differ only in accent color, bib number, or shoe color, not different outfit categories or silhouettes.'
        : 'Each person gets their own scene-appropriate outfit.',
    ...lines.map(line => `- ${line}`),
    ...(guardrailBlocks.length > 0
      ? ['Per-person scene rules:', ...guardrailBlocks.map(line => `- ${line}`)]
      : []),
    'Keep every assigned garment type in the final prompt for each person.',
    'Use short garment labels only—not long material paragraphs.',
    'Mention each assigned garment once—do not repeat pieces or add duplicate garment types.',
    'Do not swap to unrelated outfits or merge separate wardrobes into one blob.',
  ].join(' ');
}

export function refreshSportWardrobeAssignmentForPrompt(
  prompt: string,
  assignment: GenerateWardrobeAssignment,
  intentHints?: string
): GenerateWardrobeAssignment {
  const intentCorpus = [intentHints, assignment.filters.athleticSport].filter(Boolean).join(' ');
  const sport = resolveAthleticSportForWardrobe(
    intentCorpus,
    prompt,
    assignment.filters.athleticSport ?? null
  );
  if (!sport) {
    return assignment;
  }

  const needsRefresh =
    assignment.filters.athleticSport !== sport ||
    !summaryMatchesSportWardrobe(sport, assignment.summary) ||
    promptContainsSportWardrobeConflict(prompt, sport, assignment.summary);

  if (!needsRefresh) {
    return { ...assignment, filters: { ...assignment.filters, athleticSport: sport } };
  }

  const filters = buildClothingPickFilters({
    gender:
      assignment.filters.gender === 'women'
        ? 'women'
        : assignment.filters.gender === 'men'
          ? 'men'
          : undefined,
    hints: intentHints,
    environmentSeed: [intentHints, prompt].filter(Boolean).join(' '),
    excludeIds: assignment.filters.excludeIds,
    avoidedTokens: assignment.filters.avoidedTokens,
  });

  const outfit = pickRandomCharacterOutfit({
    ...filters,
    athleticSport: sport,
    athleticActivity: true,
    gender: assignment.filters.gender,
  });

  if (!outfit.summary.trim()) {
    return assignment;
  }

  return {
    ...assignment,
    summary:
      sport === 'cycling'
        ? appendCyclingHelmetToSummary(outfit.summary, intentHints)
        : outfit.summary,
    filters: outfit.filters,
    wardrobeId: outfit.wardrobeId,
    bottomId: outfit.bottomId,
    footwearId: outfit.footwearId,
    accessoriesId: outfit.accessoriesId,
  };
}

export function mergeGenerateWardrobeIntoPrompt(
  prompt: string,
  assignments: GenerateWardrobeAssignment[],
  maxChars?: number,
  intentHints?: string
): string {
  const sport = resolveAthleticSportForWardrobe(
    intentHints ?? '',
    prompt,
    assignments[0]?.filters.athleticSport ?? null
  );
  const working = sport
    ? stripIncompatibleSportActionsFromPrompt(prompt, sport, intentHints)
    : prompt;
  const refreshed = assignments.map(assignment =>
    refreshSportWardrobeAssignmentForPrompt(working, assignment, intentHints)
  );
  const merged = mergeWardrobeAssignmentsIntoPrompt(working, refreshed, maxChars);
  if (sport === 'cycling') {
    return ensureCyclingHelmetInPrompt(merged, intentHints ?? '');
  }
  if (sport) {
    return ensureAthleticBottomInPrompt(merged, sport, {
      hints: intentHints,
      wardrobeSummary: refreshed[0]?.summary,
    });
  }
  return merged;
}
