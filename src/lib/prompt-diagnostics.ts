import {
  inferCyclingDiscipline,
  promptContainsForeignSportActions,
  promptMentionsBicycleOrRiding,
  promptMissingAthleticBottom,
  type CyclingDiscipline,
} from './athletic-sport-actions';
import { inferAthleticSport, type AthleticSport } from './athletic-sport-profiles';
import { parsePeopleConstraint, isMultiPersonInput } from './distinct-people';
import { hintsDescribeAthleticDuoCompetition } from './athletic-duo-hints';

export type DiagnosticSeverity = 'error' | 'warn' | 'info';

export type PromptDiagnosticIssue = {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
};

export type PromptDiagnosticsInferred = {
  sport: AthleticSport | null;
  cyclingDiscipline: CyclingDiscipline | null;
  duoMode: boolean;
  peopleCount: number | null;
  athleticCompetition: boolean;
  gender: ReturnType<typeof parsePeopleConstraint>['gender'];
};

export type PromptDiagnostics = {
  inferred: PromptDiagnosticsInferred;
  issues: PromptDiagnosticIssue[];
  suggestions: string[];
};

const STREET_CLOTHING_ON_ATHLETE =
  /\b(?:linen dress|evening gown|bright sari|paint-stained apron|bomber jacket|wearing (?:a )?(?:linen )?dress)\b/i;

const HELMET_PRESENT =
  /\b(?:cycling helmet|bike helmet|aero helmet|gravel helmet|mountain bike helmet|track cycling helmet|helmet)\b/i;

const ELDERLY_ATHLETE = /\b(?:elderly|retired|reading glasses)\b/i;

const VELODROME = /\b(?:velodrome|banking turn|indoor track)\b/i;

const GRAVEL_CONTEXT =
  /\b(?:gravel(?:\s+(?:bike|bicycle|cyclist|cyclists|ride|racing))?|bikepacking|fire road|doubletrack)\b/i;

export function analyzePromptDiagnostics(corpus: string, prompt?: string): PromptDiagnostics {
  const hintText = corpus.trim();
  const text = [corpus, prompt].filter(Boolean).join(' ');
  const peopleText = hintText || text;
  const sport = inferAthleticSport(text);
  const cyclingDiscipline = sport === 'cycling' ? inferCyclingDiscipline(text) : null;
  const people = parsePeopleConstraint(peopleText);
  const peopleCount = people.count;
  const duoMode = (peopleCount ?? 0) >= 2;
  const athleticCompetition = hintsDescribeAthleticDuoCompetition(peopleText);
  const issues: PromptDiagnosticIssue[] = [];
  const suggestions: string[] = [];

  if (sport === 'cycling' && prompt) {
    if (STREET_CLOTHING_ON_ATHLETE.test(prompt)) {
      issues.push({
        severity: 'error',
        code: 'cycling.street_clothes',
        message: 'Prompt describes street clothes on a cyclist—use cycling kit only.',
      });
    }
    // Only require a helmet when a bicycle / riding is actually in the scene —
    // cycling kit portraits and studio try-ons should not force helmets.
    if (
      promptMentionsBicycleOrRiding(text) &&
      !HELMET_PRESENT.test(prompt) &&
      !HELMET_PRESENT.test(hintText)
    ) {
      issues.push({
        severity: 'warn',
        code: 'cycling.missing_helmet',
        message: 'Bicycle scene has no helmet — add one if riders are on the bike.',
      });
      suggestions.push('Add a gravel/road/aero cycling helmet for each rider.');
    }
    if (cyclingDiscipline === 'gravel' && VELODROME.test(prompt)) {
      issues.push({
        severity: 'error',
        code: 'cycling.gravel_velodrome',
        message: 'Gravel scene mentions velodrome/indoor track—use fire roads or doubletrack.',
      });
    }
    if (duoMode && ELDERLY_ATHLETE.test(prompt)) {
      issues.push({
        severity: 'warn',
        code: 'duo.elderly_athlete',
        message: 'Competition duo uses elderly descriptors—prefer twenties to forties.',
      });
    }
  }

  if (sport && prompt && promptContainsForeignSportActions(sport, prompt)) {
    issues.push({
      severity: 'error',
      code: 'sport.foreign_actions',
      message: 'Prompt mixes in actions or gear from another sport.',
    });
  }

  if (
    sport &&
    prompt &&
    (sport === 'running' || sport === 'track_field') &&
    promptMissingAthleticBottom(prompt, sport)
  ) {
    issues.push({
      severity: 'error',
      code: 'running.missing_bottom',
      message: 'Runner prompt lacks visible shorts or track pants.',
    });
    suggestions.push('Add running shorts or track pants to the outfit description.');
  }

  if (prompt && !duoMode && isMultiPersonInput(peopleText) === false) {
    if (/\bon the left\b/i.test(prompt) && /\bon the right\b/i.test(prompt)) {
      issues.push({
        severity: 'error',
        code: 'solo.split_screen',
        message:
          'Solo prompt uses left/right split framing—likely to produce a diptych or two subjects.',
      });
      suggestions.push('Describe one unified subject in one continuous scene.');
    }
  }

  if (duoMode && prompt && !/\bon the (?:left|right)\b/i.test(prompt)) {
    issues.push({
      severity: 'warn',
      code: 'duo.missing_placement',
      message:
        'Multi-person prompt lacks left/right placement—harder for the model to separate subjects.',
    });
  }

  if (GRAVEL_CONTEXT.test(text) && sport !== 'cycling') {
    issues.push({
      severity: 'info',
      code: 'sport.gravel_hint',
      message: 'Gravel cues detected—confirm cycling sport is intended.',
    });
  }

  if (issues.length === 0 && sport === 'cycling' && duoMode) {
    suggestions.push('Use action framing + competition hints for best duo cycling results.');
  }

  return {
    inferred: {
      sport,
      cyclingDiscipline,
      duoMode,
      peopleCount,
      athleticCompetition,
      gender: people.gender,
    },
    issues,
    suggestions,
  };
}

export function lintPrompt(input: { hints?: string; prompt?: string }): PromptDiagnostics {
  return analyzePromptDiagnostics(input.hints ?? '', input.prompt);
}
