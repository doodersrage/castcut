'use client';

import CastcutNodesHint from '@/components/CastcutNodesHint';
import DayPosePackPicker from '@/components/day-planner/DayPosePackPicker';
import { ChipButton, FieldLabel, SwitchButton, TextArea } from '@/components/ui/Field';
import { usePlayChecksReadiness } from '@/hooks/usePlayChecksReadiness';
import type { DayRenderQuality } from '@/lib/day-quality-preset';
import type { DayIntimateMix, DayMoodSetting, DaySlot } from '@/lib/day-planner';
import { summarizePlayChecks } from '@/lib/play-checks-readiness';

export type DayQualitySwitches = {
  /** Default on — loosen the plate's grip on stance when the beat needs a different body. */
  posePriority: boolean;
  onPosePriorityChange: (next: boolean) => void;
  identityBoost: boolean;
  onIdentityBoostChange: (next: boolean) => void;
  faceFinish: boolean;
  onFaceFinishChange: (next: boolean) => void;
  autoReviewStills: boolean;
  onAutoReviewStillsChange: (next: boolean) => void;
  redoPoseMisses: boolean;
  onRedoPoseMissesChange: (next: boolean) => void;
  bestOfTwoHardPoses: boolean;
  onBestOfTwoHardPosesChange: (next: boolean) => void;
  bestEnginePerPose: boolean;
  onBestEnginePerPoseChange: (next: boolean) => void;
};

export type DayQualityStatusProps = {
  faceFinish: boolean;
  autoReviewStills: boolean;
  redoPoseMisses: boolean;
  bestOfTwoHardPoses: boolean;
  /** Latest Face finish line (running / applied / skipped / paused). */
  faceFinishStatus?: string | null;
  /** Latest quality-gate line (reviewing / passed / requeueing / paused). */
  qualityStatus?: string | null;
  /** Latest pose-redo line (checking / matched / redoing). */
  poseRedoStatus?: string | null;
  /** Latest best-of-two line (checking / second take / kept). */
  bestOfTwoStatus?: string | null;
};

/**
 * What the checks are doing right now — live lines that stay visible under the plan bar whether
 * or not the Advanced drawer is open.
 */
export function DayQualityStatusLines({
  faceFinish,
  autoReviewStills,
  redoPoseMisses,
  bestOfTwoHardPoses,
  faceFinishStatus = null,
  qualityStatus = null,
  poseRedoStatus = null,
  bestOfTwoStatus = null,
}: DayQualityStatusProps) {
  const lines: Array<{ id: string; text: string; live?: boolean }> = [];
  if (faceFinish && faceFinishStatus) {
    lines.push({ id: 'day-face-finish-status', text: faceFinishStatus });
  }
  if (autoReviewStills && qualityStatus) {
    lines.push({ id: 'day-quality-status', text: qualityStatus, live: true });
  }
  if (redoPoseMisses && !autoReviewStills && poseRedoStatus) {
    lines.push({ id: 'day-pose-redo-status', text: poseRedoStatus, live: true });
  }
  if (bestOfTwoHardPoses && !autoReviewStills && bestOfTwoStatus) {
    lines.push({ id: 'day-best-of-two-status', text: bestOfTwoStatus, live: true });
  }
  if (lines.length === 0) return null;
  return (
    <div className="space-y-0.5">
      {lines.map(line => (
        <p
          key={line.id}
          className="type-caption text-[var(--text-muted)]"
          role={line.live ? 'status' : undefined}
          data-testid={line.id}
        >
          {line.text}
        </p>
      ))}
    </div>
  );
}

export type DayAdvancedDrawerProps = DayQualitySwitches & {
  id: string;
  busy?: boolean;
  renderQuality: DayRenderQuality;
  onRenderQualityChange: (next: DayRenderQuality) => void;
  /** Pose pack: poses the whole Day from a theme. */
  slots: DaySlot[];
  dayMood: DayMoodSetting;
  intimateEnabled: boolean;
  intimateMix: DayIntimateMix;
  allowCompanions: boolean;
  model?: string | null;
  onSlotsChange: (next: DaySlot[]) => void;
  notes: string;
  onNotesChange: (next: string) => void;
  className?: string;
};

/**
 * What the Quality preset means on this engine, switch by switch — the seven check switches
 * with their hints, the render quality by hand, the pose pack and the Day notes. Changing a
 * switch here turns the preset into Custom.
 */
export default function DayAdvancedDrawer({
  id,
  busy = false,
  renderQuality,
  onRenderQualityChange,
  posePriority,
  onPosePriorityChange,
  identityBoost,
  onIdentityBoostChange,
  faceFinish,
  onFaceFinishChange,
  autoReviewStills,
  onAutoReviewStillsChange,
  redoPoseMisses,
  onRedoPoseMissesChange,
  bestOfTwoHardPoses,
  onBestOfTwoHardPosesChange,
  bestEnginePerPose,
  onBestEnginePerPoseChange,
  slots,
  dayMood,
  intimateEnabled,
  intimateMix,
  allowCompanions,
  model,
  onSlotsChange,
  notes,
  onNotesChange,
  className = '',
}: DayAdvancedDrawerProps) {
  // What Auto-review can measure on this setup (DWPose / FaceAnalysis installed in ComfyUI).
  const checksOn = autoReviewStills || redoPoseMisses || bestOfTwoHardPoses;
  const { readiness } = usePlayChecksReadiness(undefined, { enabled: checksOn });
  const checksLine = summarizePlayChecks(readiness);
  const label = 'type-caption w-16 shrink-0 text-[var(--text-muted)]';

  return (
    <div
      id={id}
      className={`space-y-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-3 ${className}`.trim()}
      data-testid="day-advanced-drawer"
    >
      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-1"
        role="group"
        aria-label="Render quality"
      >
        <span className={label}>Render</span>
        <ChipButton
          active={renderQuality === 'good'}
          disabled={busy}
          title="Everyday keepers — stronger sampler, medium or larger canvas."
          data-testid="day-render-quality-good"
          onClick={() => onRenderQualityChange('good')}
        >
          Good
        </ChipButton>
        <ChipButton
          active={renderQuality === 'best'}
          disabled={busy}
          title="Full sampler, largest canvas, and extra polish."
          data-testid="day-render-quality-best"
          onClick={() => onRenderQualityChange('best')}
        >
          Best
        </ChipButton>
        <span className="type-caption text-[var(--text-muted)]">
          The Engine&rsquo;s quality for Day stills — set by the Quality preset.
        </span>
      </div>
      <div
        className="flex flex-wrap items-start gap-x-2 gap-y-1"
        role="group"
        aria-label="Day options"
        data-testid="day-options"
      >
        <span className={`${label} pt-1.5`}>Checks</span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-2 gap-y-1">
          <SwitchButton
            checked={posePriority}
            disabled={busy}
            data-testid="day-pose-priority"
            title="Let the beat's pose win over the plate's stance (Qwen Edit 2511 copies Image 1 otherwise). Turn off if faces drift. Not part of the Quality preset."
            onChange={onPosePriorityChange}
          >
            Pose over plate
          </SwitchButton>
          <SwitchButton
            checked={identityBoost}
            disabled={busy}
            data-testid="day-identity-boost"
            title="Walking, dancing and leaning stills also look at the full plate for the face. Closer likeness, but now and then a second person or the plate's outfit sneaks in — best with Auto-review stills on."
            onChange={onIdentityBoostChange}
          >
            Face boost
          </SwitchButton>
          <SwitchButton
            checked={faceFinish}
            disabled={busy}
            data-testid="day-face-finish"
            title="After each still lands, re-render just her face against the Cast face crop (on a two-person still only the lead's face, kept only when it comes out closer) — sharper eyes and a closer likeness on small full-body faces. Works on any engine's stills (uses Qwen Edit 2511 or Klein 9B Distilled); adds a few seconds per still."
            onChange={onFaceFinishChange}
          >
            Face finish
          </SwitchButton>
          <SwitchButton
            checked={autoReviewStills}
            disabled={busy}
            data-testid="day-auto-review"
            title="Vision-check each finished still and requeue broken faces, hands, or outfits (needs a vision model)"
            onChange={onAutoReviewStillsChange}
          >
            Auto-review stills
          </SwitchButton>
          <SwitchButton
            checked={redoPoseMisses}
            disabled={busy}
            data-testid="day-redo-pose-misses"
            title={
              autoReviewStills
                ? 'Auto-review is on and already rerolls stills that missed their pose — this takes over when Auto-review is off.'
                : "Read each finished still's pose back (DWPose) and, when it missed the pose guide, queue that slot once more with the pose spelled out. Once per still — never loops."
            }
            onChange={onRedoPoseMissesChange}
          >
            Redo pose misses once
          </SwitchButton>
          <SwitchButton
            checked={bestOfTwoHardPoses}
            disabled={busy}
            data-testid="day-best-of-two"
            title={
              autoReviewStills
                ? 'Auto-review is on and already rerolls stills that missed their pose — this takes over when Auto-review is off.'
                : 'Lying, kneeling, floor, climbing and bending stills get a second take with a new seed; the one whose pose reads closer to the guide (DWPose) is kept and the other shown beside it. Never more than two.'
            }
            onChange={onBestOfTwoHardPosesChange}
          >
            Best of two for hard poses
          </SwitchButton>
          <SwitchButton
            checked={bestEnginePerPose}
            disabled={busy}
            data-testid="day-best-engine-per-pose"
            title="One-person stills whose pose your engine keeps missing on the pose report card (right at most half the time) render on another installed engine that got it right every time — that still only. The card says when it happens."
            onChange={onBestEnginePerPoseChange}
          >
            Pick the best engine per pose
          </SwitchButton>
        </div>
      </div>
      {!posePriority ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-pose-priority-hint">
          Pose over plate is off — stills will follow the plate&rsquo;s stance more closely.
        </p>
      ) : null}
      {identityBoost && !autoReviewStills ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-identity-boost-hint">
          Face boost is on — turn on Auto-review stills so the odd extra person or borrowed outfit
          gets rerolled.
        </p>
      ) : null}
      {checksOn && checksLine ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-play-checks">
          {checksLine}
        </p>
      ) : null}
      {bestOfTwoHardPoses && !autoReviewStills ? (
        <CastcutNodesHint testId="day-best-of-two-castcut-hint">
          Best of two runs as two jobs here — with the Castcut nodes both takes render in one job.
        </CastcutNodesHint>
      ) : null}
      <DayPosePackPicker
        slots={slots}
        dayMood={dayMood}
        intimateEnabled={intimateEnabled}
        intimateMix={intimateMix}
        allowCompanions={allowCompanions}
        model={model}
        busy={busy}
        onSlotsChange={onSlotsChange}
      />
      <label className="block space-y-1.5">
        <FieldLabel>Day notes</FieldLabel>
        <TextArea
          rows={2}
          value={notes}
          data-testid="day-notes"
          placeholder="e.g. cozy autumn day, light rain in the evening"
          onChange={event => onNotesChange(event.target.value)}
        />
      </label>
    </div>
  );
}
