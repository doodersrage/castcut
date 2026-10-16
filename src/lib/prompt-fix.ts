import {
  ensureAthleticBottomInPrompt,
  ensureCyclingHelmetInPrompt,
  inferCyclingDiscipline,
  stripForeignSportActionsFromPrompt,
  stripIncompatibleCyclingVenuesFromPrompt,
} from './athletic-sport-actions';
import { inferAthleticSport } from './athletic-sport-profiles';
import { stripStreetClothingFromAthleticPeoplePrompt, isMultiPersonInput } from './distinct-people';
import { lintPrompt, type PromptDiagnosticIssue } from './prompt-diagnostics';
import { ensureSinglePersonPrompt } from './single-person';

export type PromptFixChange = {
  code: string;
  description: string;
};

export type PromptFixResult = {
  prompt: string;
  hints?: string;
  changed: boolean;
  changes: PromptFixChange[];
  remainingIssues: PromptDiagnosticIssue[];
};

export function fixPromptRules(input: { hints?: string; prompt: string }): PromptFixResult {
  const hints = input.hints?.trim() ?? '';
  const corpus = [hints, input.prompt].filter(Boolean).join(' ');
  const sport = inferAthleticSport(corpus);
  const changes: PromptFixChange[] = [];
  let prompt = input.prompt.trim();

  if (sport) {
    const beforeSport = prompt;
    prompt = stripForeignSportActionsFromPrompt(prompt, sport, corpus);
    if (prompt !== beforeSport) {
      changes.push({
        code: 'sport.strip_foreign_actions',
        description: 'Removed actions or gear from another sport.',
      });
    }

    const beforeForeign = prompt;
    prompt = stripForeignSportActionsFromPrompt(prompt, sport);
    if (prompt !== beforeForeign) {
      changes.push({
        code: 'sport.strip_foreign_verbs',
        description: 'Removed incompatible sport verbs.',
      });
    }
  }

  if (sport === 'cycling') {
    const discipline = inferCyclingDiscipline(corpus);
    const beforeVenue = prompt;
    prompt = stripIncompatibleCyclingVenuesFromPrompt(prompt, discipline);
    if (prompt !== beforeVenue) {
      changes.push({
        code: 'cycling.strip_velodrome',
        description: 'Removed velodrome/indoor track from gravel/off-road scene.',
      });
    }

    const beforeHelmet = prompt;
    prompt = ensureCyclingHelmetInPrompt(prompt, corpus);
    if (prompt !== beforeHelmet) {
      changes.push({
        code: 'cycling.add_helmet',
        description: 'Added discipline-appropriate cycling helmets.',
      });
    }
  } else if (sport) {
    const beforeBottom = prompt;
    prompt = ensureAthleticBottomInPrompt(prompt, sport, { hints: corpus });
    if (prompt !== beforeBottom) {
      changes.push({
        code: 'sport.add_bottom_layer',
        description: 'Added missing athletic shorts or pants.',
      });
    }
  }

  if (!isMultiPersonInput(corpus)) {
    const beforeSolo = prompt;
    prompt = ensureSinglePersonPrompt(prompt);
    if (prompt !== beforeSolo) {
      changes.push({
        code: 'solo.strip_extra_people',
        description: 'Removed split-screen or extra-person wording for a solo scene.',
      });
    }
  }

  if (sport && /\bon the (?:left|right)\b/i.test(prompt)) {
    const beforeStreet = prompt;
    prompt = stripStreetClothingFromAthleticPeoplePrompt(prompt);
    if (prompt !== beforeStreet) {
      changes.push({
        code: 'athletic.strip_street_clothes',
        description: 'Removed street clothes from athletic duo sentences.',
      });
    }
  }

  const remaining = lintPrompt({ hints, prompt }).issues.filter(
    issue => issue.severity === 'error'
  );

  return {
    prompt,
    hints: hints || undefined,
    changed: changes.length > 0,
    changes,
    remainingIssues: remaining,
  };
}
