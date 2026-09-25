'use client';

import { SwitchButton } from '@/components/ui/Field';
import { usePlayChecksReadiness } from '@/hooks/usePlayChecksReadiness';
import { summarizePlayChecks } from '@/lib/play-checks-readiness';

/**
 * Outfit's Auto-review switch: score each try-on (face match vs the plate + a vision read of the
 * outfit) so Keep is picked with numbers. Shows what this setup can measure while it's on.
 */
export default function FittingAutoReviewToggle({
  enabled,
  busy = false,
  checksOff = [],
  onChange,
}: {
  enabled: boolean;
  busy?: boolean;
  /** Checks that switched themselves off this session (missing node pack / vision model). */
  checksOff?: string[];
  onChange: (next: boolean) => void;
}) {
  const { readiness } = usePlayChecksReadiness(undefined, { enabled });
  const checksLine = summarizePlayChecks(readiness);
  return (
    <div className="space-y-1" data-testid="fitting-auto-review">
      <SwitchButton
        checked={enabled}
        disabled={busy}
        data-testid="fitting-auto-review-switch"
        title="Score each try-on: face match against the plate (ComfyUI_FaceAnalysis) and a vision read of the outfit, face and hands"
        onChange={onChange}
      >
        Auto-review try-ons
      </SwitchButton>
      {enabled ? (
        <p className="type-caption text-[var(--text-muted)]">
          Each try-on gets a face match and an outfit score on its Compare card; the best clean one
          is marked. Nothing is requeued for you.
        </p>
      ) : null}
      {enabled && checksLine ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="fitting-play-checks">
          {checksLine}
        </p>
      ) : null}
      {checksOff.map(note => (
        <p key={note} className="type-caption text-[var(--text-muted)]">
          {note}
        </p>
      ))}
    </div>
  );
}
