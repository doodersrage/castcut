import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGenerationDiagnostics,
  enrichGenerateResult,
  summarizeDiagnostics,
} from './generation-diagnostics';
import type { ToolGenerateResult } from '../specialized/types';

describe('generation-diagnostics', () => {
  describe('buildGenerationDiagnostics', () => {
    it('defaults wardrobeSummary/location to null and duoMode to false with no metadata', () => {
      const diagnostics = buildGenerationDiagnostics({ hints: '', prompt: 'a portrait' });
      assert.equal(diagnostics.wardrobeSummary, null);
      assert.equal(diagnostics.location, null);
      assert.equal(diagnostics.duoMode, false);
      assert.equal(diagnostics.teamKit, undefined);
    });

    it('takes wardrobeSummary from the first wardrobeAssignments entry', () => {
      const diagnostics = buildGenerationDiagnostics({
        metadata: { wardrobeAssignments: [{ summary: 'red jacket' }, { summary: 'other' }] },
      });
      assert.equal(diagnostics.wardrobeSummary, 'red jacket');
    });

    it('falls back to randomOutfit.summary when wardrobeAssignments is absent', () => {
      const diagnostics = buildGenerationDiagnostics({
        metadata: { randomOutfit: { summary: 'random fit' } },
      });
      assert.equal(diagnostics.wardrobeSummary, 'random fit');
    });

    it('prefers wardrobeAssignments over randomOutfit when both are present', () => {
      const diagnostics = buildGenerationDiagnostics({
        metadata: {
          wardrobeAssignments: [{ summary: 'assigned' }],
          randomOutfit: { summary: 'random fit' },
        },
      });
      assert.equal(diagnostics.wardrobeSummary, 'assigned');
    });

    it('passes through location and duoMode from metadata', () => {
      const diagnostics = buildGenerationDiagnostics({
        metadata: { location: 'a beach', duoMode: true },
      });
      assert.equal(diagnostics.location, 'a beach');
      assert.equal(diagnostics.duoMode, true);
    });

    it('passes through the teamKit flag from input (not metadata)', () => {
      const diagnostics = buildGenerationDiagnostics({ teamKit: true });
      assert.equal(diagnostics.teamKit, true);
    });

    it('includes the base PromptDiagnostics fields from lintPrompt', () => {
      const diagnostics = buildGenerationDiagnostics({ hints: '', prompt: 'a portrait' });
      assert.ok('inferred' in diagnostics);
      assert.ok('issues' in diagnostics);
      assert.ok('suggestions' in diagnostics);
    });
  });

  describe('enrichGenerateResult', () => {
    function baseResult(overrides?: Partial<ToolGenerateResult>): ToolGenerateResult {
      return {
        prompt: 'a portrait',
        provider: 'template',
        model: 'flux' as ToolGenerateResult['model'],
        comfyNode: 'node-1',
        limits: { maxChars: 500, maxSentences: 5, maxTokens: 200 },
        ...overrides,
      };
    }

    it('attaches diagnostics built from the result prompt/metadata/hints', () => {
      const result = baseResult({ metadata: { location: 'a park' } });
      const enriched = enrichGenerateResult(result, 'some hints', { teamKit: true });
      assert.equal(enriched.prompt, result.prompt);
      assert.equal(enriched.diagnostics.location, 'a park');
      assert.equal(enriched.diagnostics.teamKit, true);
    });

    it('works with no hints/extras provided', () => {
      const result = baseResult();
      const enriched = enrichGenerateResult(result);
      assert.equal(enriched.diagnostics.teamKit, undefined);
      assert.equal(enriched.diagnostics.location, null);
    });
  });

  describe('summarizeDiagnostics', () => {
    it('returns "general" when nothing is inferred', () => {
      const summary = summarizeDiagnostics({
        inferred: {
          sport: null,
          cyclingDiscipline: null,
          duoMode: false,
          peopleCount: null,
          athleticCompetition: false,
          gender: 'any',
        },
        issues: [],
        suggestions: [],
      });
      assert.equal(summary, 'general');
    });

    it('joins sport, cyclingDiscipline, duo, competition, and gender with a middle dot', () => {
      const summary = summarizeDiagnostics({
        inferred: {
          sport: 'cycling',
          cyclingDiscipline: 'road',
          duoMode: true,
          peopleCount: 2,
          athleticCompetition: true,
          gender: 'women',
        },
        issues: [],
        suggestions: [],
      });
      assert.equal(summary, 'cycling · road · duo · competition · women');
    });

    it('includes cyclingDiscipline whenever it is truthy, regardless of sport (the source has no sport === "cycling" gate)', () => {
      // Read carefully: summarizeDiagnostics only checks `if (inferred.sport)`
      // then, nested inside, `if (inferred.cyclingDiscipline)` — it never
      // actually checks that sport is 'cycling'. So a (contrived) inferred
      // shape with sport: 'running' and a non-null cyclingDiscipline still
      // renders both parts. Verified by running this exact case rather than
      // assuming the "cycling only" framing implied by the field's name.
      const summary = summarizeDiagnostics({
        inferred: {
          sport: 'running',
          cyclingDiscipline: 'road',
          duoMode: false,
          peopleCount: 1,
          athleticCompetition: false,
          gender: 'any',
        },
        issues: [],
        suggestions: [],
      });
      assert.equal(summary, 'running · road');
    });

    it('omits cyclingDiscipline when it is null', () => {
      const summary = summarizeDiagnostics({
        inferred: {
          sport: 'running',
          cyclingDiscipline: null,
          duoMode: false,
          peopleCount: 1,
          athleticCompetition: false,
          gender: 'any',
        },
        issues: [],
        suggestions: [],
      });
      assert.equal(summary, 'running');
    });

    it('omits gender when it is "any"', () => {
      const summary = summarizeDiagnostics({
        inferred: {
          sport: 'running',
          cyclingDiscipline: null,
          duoMode: false,
          peopleCount: 1,
          athleticCompetition: false,
          gender: 'any',
        },
        issues: [],
        suggestions: [],
      });
      assert.equal(summary, 'running');
    });
  });
});
