/**
 * Story's side of the adult safeguards (adult-age-safeguard.ts): on a Suggestive / Sultry /
 * Explicit / Raunchy story every still names everyone's adult age, and youth-coded words from
 * the scene, the bible or the player's own text are taken out before it is queued. Story's
 * prompts used to say "adult" barely or not at all.
 */

import { applyAdultAgeSafeguards, type AgePersonNoun } from './adult-age-safeguard';
import { storyRatingNeedsAdultSafeguards } from './adult-appearance-gate';
import type { CharacterAgeBand } from './character-appearance';
import { isRapidDuoRecipePrompt, RAPID_DUO_RECIPE_MARK } from './prompt-recipe-mark';

export type StoryStillAgeInput = {
  /** The story's rating (RoleplayContentId). */
  content: string | null | undefined;
  manLead: boolean;
  /** The Cast's picked age. */
  leadAgeBand?: CharacterAgeBand | null;
  /** The Cast / bible look, read for an age when no trait was picked. */
  leadDescriptor?: string | null;
  /** People the pose guide draws; unknown → read from the prompt, else "everyone" wording. */
  people?: number | null;
  /** The stronger wording — the one requeue after the adult-appearance gate withheld a take. */
  strong?: boolean;
};

/** How many people a Story still prompt shows, when the pose guide did not say. 0 = unknown. */
export function storyStillPeople(prompt: string, people?: number | null): number {
  if (people && people > 0) return people;
  if (prompt.includes(RAPID_DUO_RECIPE_MARK)) return 2;
  if (/\bExplicit solo photo:|\bOne (?:woman|man) alone\b/.test(prompt)) return 1;
  if (
    /\b(?:TWO PEOPLE|exactly two (?:people|adults)|both of them|the two of them|a couple)\b/i.test(
      prompt
    )
  ) {
    return 2;
  }
  if (isRapidDuoRecipePrompt(prompt) && /\btogether\b/.test(prompt)) return 2;
  return 0;
}

/** The Story still prompt with the adult safeguards, when the rating calls for them. */
export function withStoryAdultAges(prompt: string, input: StoryStillAgeInput): string {
  if (!storyRatingNeedsAdultSafeguards(input.content)) return prompt;
  const leadNoun: AgePersonNoun = input.manLead ? 'man' : 'woman';
  const people = storyStillPeople(prompt, input.people);
  return applyAdultAgeSafeguards(prompt, {
    lead: {
      noun: people === 1 || people === 2 ? leadNoun : 'person',
      ageBand: input.leadAgeBand ?? null,
      descriptor: input.leadDescriptor ?? null,
    },
    // Story's second person is not a Cast record: the mature default.
    partner: people === 2 ? { noun: 'person' } : null,
    people,
    strong: input.strong,
  });
}
