/**
 * How good each check is (M2 C5, ROADMAP §5.5: measure false positives and negatives before a
 * check becomes a gate). Your decisions are the labels: a finding you marked fine is likely a
 * false positive, one you marked real is confirmed. A render you marked Looks wrong that no check
 * flagged is a miss (a false negative, as far as Castcut can tell). Only measured: nothing here
 * changes what a check does. Pure.
 */
import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery-entry';
import type { FindingDecision } from './finding-decisions';
import { findingsForGalleryEntry, type ContinuityRule } from './findings';

export const CONTINUITY_RULE_LABELS: Record<ContinuityRule, string> = {
  'face-miss': 'Face match',
  'pose-miss': 'Pose match',
  'marks-missing': 'Marks check',
  'clip-cuts': 'Clip cuts midway',
  'clip-silent': 'Talking clip silent',
  'adult-withheld': 'Adult check',
  'looks-wrong': 'Your Looks wrong',
  'outfit-miss': 'Outfit check',
  'place-miss': 'Place check',
  'source-gone': 'Cut: source gone',
  'outfit-jump': 'Cut: outfit jump',
  'look-mismatch': 'Cut: look mismatch',
  'plate-drift': 'Cut: plate drift',
  'coverage-establishing': 'Script: no establishing shot',
  'coverage-reaction': 'Script: no reaction',
  'coverage-kept': 'Script: nothing kept',
};

const RULES = Object.keys(CONTINUITY_RULE_LABELS) as ContinuityRule[];

export type CheckQualityRow = {
  rule: ContinuityRule;
  label: string;
  /** Findings of this rule (the Gallery's renders; Cut-only rules: the ones you decided on). */
  found: number;
  dismissed: number;
  accepted: number;
  /** Cut-only rules are counted only as far as you have looked at them. */
  decidedOnly?: boolean;
};

export type CheckQuality = {
  rows: CheckQualityRow[];
  /** Renders you marked Looks wrong that no automatic check flagged. */
  missed: number;
};

type QualityEntry = Pick<
  ComfyGalleryEntry,
  'promptId' | 'playChecks' | 'adultCheck' | 'playerVerdict' | 'derivedKind'
>;

/** The rule a finding id ends with (`<subject>:<rule>`). */
export function ruleOfFindingId(id: string): ContinuityRule | null {
  const rule = id.slice(id.lastIndexOf(':') + 1) as ContinuityRule;
  return RULES.includes(rule) ? rule : null;
}

export function checkQuality(
  entries: readonly QualityEntry[],
  decisions: readonly FindingDecision[]
): CheckQuality {
  const decided = new Map(decisions.map(entry => [entry.id, entry.decision]));
  const rows = new Map<ContinuityRule, CheckQualityRow>();
  const row = (rule: ContinuityRule) => {
    let found = rows.get(rule);
    if (!found) {
      found = { rule, label: CONTINUITY_RULE_LABELS[rule], found: 0, dismissed: 0, accepted: 0 };
      rows.set(rule, found);
    }
    return found;
  };
  const seen = new Set<string>();
  let missed = 0;
  for (const entry of entries) {
    const findings = findingsForGalleryEntry(entry);
    for (const finding of findings) {
      seen.add(finding.id);
      const target = row(finding.rule);
      target.found += 1;
      const decision = decided.get(finding.id);
      if (decision === 'dismissed') target.dismissed += 1;
      if (decision === 'accepted') target.accepted += 1;
    }
    if (
      entry.playerVerdict?.verdict === 'looks-wrong' &&
      !findings.some(finding => finding.rule !== 'looks-wrong')
    ) {
      missed += 1;
    }
  }
  // Findings only Cut makes (cross-shot rules, a gone source): as far as you've decided on them.
  for (const [id, decision] of decided) {
    if (seen.has(id)) continue;
    const rule = ruleOfFindingId(id);
    if (!rule) continue;
    const target = row(rule);
    target.decidedOnly = true;
    target.found += 1;
    if (decision === 'dismissed') target.dismissed += 1;
    if (decision === 'accepted') target.accepted += 1;
  }
  return {
    rows: RULES.filter(rule => rows.has(rule)).map(rule => rows.get(rule)!),
    missed,
  };
}

export type LabelledFinding = {
  id: string;
  rule: ContinuityRule;
  /** The render (prompt id) or Cut shot it is about. */
  subject: string;
  label: 'false-positive' | 'confirmed';
  note?: string;
  evidence?: string;
  at: number;
};

/** Every finding you decided on, as a labelled example (export for measuring a check). */
export function labelledFindings(
  entries: readonly QualityEntry[],
  decisions: readonly FindingDecision[]
): LabelledFinding[] {
  const evidence = new Map<string, string>();
  for (const entry of entries) {
    for (const finding of findingsForGalleryEntry(entry))
      evidence.set(finding.id, finding.evidence);
  }
  return decisions.flatMap((decision): LabelledFinding[] => {
    const rule = ruleOfFindingId(decision.id);
    if (!rule) return [];
    return [
      {
        id: decision.id,
        rule,
        subject: decision.id.slice(0, decision.id.lastIndexOf(':')),
        label: decision.decision === 'dismissed' ? 'false-positive' : 'confirmed',
        ...(decision.note ? { note: decision.note } : {}),
        ...(evidence.get(decision.id) ? { evidence: evidence.get(decision.id) } : {}),
        at: decision.at,
      },
    ];
  });
}
