'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ContinuityFinding } from '@/lib/checks/findings';
import type { FindingDecision, FindingDecisionKind } from '@/lib/checks/finding-decisions';

export type CutContinuityItem = {
  finding: ContinuityFinding;
  shotKey: string;
  shotTitle: string;
  decision?: FindingDecision;
};

/**
 * Cut's Continuity list (M2 C2): what the checks found on the film's shots — evidence, what to
 * do — and your decision about each: **It's fine** (dismissed: it stops flagging, and the pre-cut
 * check leaves it out) or **It's real** (accepted: kept on the list, marked). Decisions sync with
 * the rest of the studio and can be taken back.
 */
export default function CutContinuity({
  items,
  disabled,
  onPick,
  onDecide,
}: {
  items: CutContinuityItem[];
  disabled?: boolean;
  onPick: (shotKey: string) => void;
  onDecide: (id: string, kind: FindingDecisionKind | null) => void;
}) {
  const [showDismissed, setShowDismissed] = useState(false);
  const open = items.filter(item => item.decision?.decision !== 'dismissed');
  const dismissed = items.filter(item => item.decision?.decision === 'dismissed');
  if (items.length === 0) {
    return (
      <p className="type-caption text-[var(--text-muted)]" data-testid="cut-continuity-empty">
        Nothing flagged on these shots.
      </p>
    );
  }
  const row = (item: CutContinuityItem) => {
    const { finding } = item;
    const decision = item.decision?.decision;
    return (
      <li
        key={finding.id}
        className="ui-list-row flex-col items-stretch gap-1 sm:flex-row sm:items-start"
        data-testid={`cut-finding-${finding.id}`}
        data-decision={decision ?? 'open'}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="type-caption">
            <span
              className={`mr-1 rounded-full border px-1.5 text-3xs ${
                finding.severity === 'blocks'
                  ? 'border-current ui-status-danger'
                  : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
              }`}
            >
              {finding.severity === 'blocks' ? 'Blocks' : finding.source}
            </span>
            <Button
              variant="quiet"
              type="button"
              className="font-medium hover:underline"
              title="Show this shot in the monitor"
              onClick={() => onPick(item.shotKey)}
            >
              {item.shotTitle}
            </Button>
            {' · '}
            {finding.evidence}
            {decision === 'accepted' ? (
              <span className="ml-1 text-[var(--text-muted)]">· you said it&apos;s real</span>
            ) : null}
          </p>
          <p className="type-caption text-[var(--text-muted)]">{finding.suggestion}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          {decision ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              data-testid={`cut-finding-undo-${finding.id}`}
              onClick={() => onDecide(finding.id, null)}
            >
              Undo
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                data-testid={`cut-finding-dismiss-${finding.id}`}
                title="It's fine — stop flagging it (the pre-cut check leaves it out)"
                onClick={() => onDecide(finding.id, 'dismissed')}
              >
                It&apos;s fine
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                data-testid={`cut-finding-accept-${finding.id}`}
                title="It's real — keep it on the list, marked"
                onClick={() => onDecide(finding.id, 'accepted')}
              >
                It&apos;s real
              </Button>
            </>
          )}
        </div>
      </li>
    );
  };
  return (
    <div className="space-y-2" data-testid="cut-continuity">
      {open.length > 0 ? (
        <ul className="ui-list">{open.map(row)}</ul>
      ) : (
        <p className="type-caption text-[var(--text-muted)]">
          Everything flagged here is marked fine.
        </p>
      )}
      {dismissed.length > 0 ? (
        <div>
          <Button
            variant="quiet"
            type="button"
            className="type-caption hover:underline"
            aria-expanded={showDismissed}
            data-testid="cut-continuity-dismissed-toggle"
            onClick={() => setShowDismissed(value => !value)}
          >
            {showDismissed ? 'Hide' : 'Show'} {dismissed.length} marked fine
          </Button>
          {showDismissed ? <ul className="ui-list mt-1">{dismissed.map(row)}</ul> : null}
        </div>
      ) : null}
    </div>
  );
}
