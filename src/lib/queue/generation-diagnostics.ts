import type { CyclingDiscipline } from '../scene/athletic-sport-actions';
import {
  analyzePromptDiagnostics,
  lintPrompt,
  type PromptDiagnostics,
} from '../prompt/diagnostics';
import type { ToolGenerateResult } from '../specialized/types';

export type GenerationDiagnostics = PromptDiagnostics & {
  wardrobeSummary?: string | null;
  location?: string | null;
  duoMode?: boolean;
  teamKit?: boolean;
};

export function buildGenerationDiagnostics(input: {
  hints?: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
  teamKit?: boolean;
}): GenerationDiagnostics {
  const base = lintPrompt({ hints: input.hints, prompt: input.prompt });
  const metadata = input.metadata ?? {};
  const wardrobeAssignments = metadata.wardrobeAssignments as
    Array<{ summary?: string }> | undefined;

  const wardrobeSummary =
    wardrobeAssignments?.[0]?.summary ??
    (metadata.randomOutfit as { summary?: string } | null)?.summary ??
    null;

  return {
    ...base,
    wardrobeSummary,
    location: (metadata.location as string | null) ?? null,
    duoMode: Boolean(metadata.duoMode),
    teamKit: input.teamKit,
  };
}

export function enrichGenerateResult(
  result: ToolGenerateResult,
  hints?: string,
  extras?: { teamKit?: boolean }
): ToolGenerateResult & { diagnostics: GenerationDiagnostics } {
  return {
    ...result,
    diagnostics: buildGenerationDiagnostics({
      hints,
      prompt: result.prompt,
      metadata: result.metadata,
      teamKit: extras?.teamKit,
    }),
  };
}

export function summarizeDiagnostics(diagnostics: PromptDiagnostics): string {
  const parts: string[] = [];
  const { inferred } = diagnostics;

  if (inferred.sport) {
    parts.push(inferred.sport);
    if (inferred.cyclingDiscipline) {
      parts.push(inferred.cyclingDiscipline);
    }
  }
  if (inferred.duoMode) {
    parts.push('duo');
  }
  if (inferred.athleticCompetition) {
    parts.push('competition');
  }
  if (inferred.gender && inferred.gender !== 'any') {
    parts.push(inferred.gender);
  }

  return parts.length > 0 ? parts.join(' · ') : 'general';
}

export { analyzePromptDiagnostics, lintPrompt };
export type { PromptDiagnostics, CyclingDiscipline };
export { inferAthleticSport } from '../scene/athletic-sport-profiles';
export { inferCyclingDiscipline } from '../scene/athletic-sport-actions';
export { hintsDescribeAthleticDuoCompetition } from '../scene/athletic-duo-hints';
