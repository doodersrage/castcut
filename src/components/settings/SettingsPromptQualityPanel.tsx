'use client';

import Link from 'next/link';
import RenderRealismHints from '@/components/RenderRealismHints';
import AnatomyGuardHints from '@/components/AnatomyGuardHints';
import QueueQualityProfileHints from '@/components/QueueQualityProfileHints';
import { useState, useSyncExternalStore } from 'react';
import { ChipButton } from '@/components/ui/Field';
import { clearPoseLibrary, poseLibraryCount, subscribePoseLibrary } from '@/lib/pose-library';
import { importPoseFromPhoto, POSE_IMPORT_LAYOUTS } from '@/lib/pose-library-import';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { DetailLevel } from '@/lib/detail-level';
import {
  MODEL_SAMPLER_PRESET_OPTIONS,
  normalizeModelSamplerPresetTier,
} from '@/lib/model-sampler-defaults';
import {
  RESOLUTION_ORIENTATION_CORE,
  RESOLUTION_ORIENTATION_OPTIONS,
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
} from '@/lib/model-resolution-defaults';
import { normalizeQueueQualityProfile } from '@/lib/queue-quality-profile';
import {
  normalizePoseGuideStylePreference,
  type PoseGuideStylePreference,
} from '@/lib/pose-guide-prompt';

const DETAIL_OPTIONS: Array<{ id: DetailLevel; label: string }> = [
  { id: 'concise', label: 'Concise' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'rich', label: 'Rich' },
];

const POSE_GUIDE_STYLE_OPTIONS: Array<{
  id: PoseGuideStylePreference;
  label: string;
  description: string;
}> = [
  {
    id: 'openpose',
    label: 'OpenPose',
    description:
      'Day and Story send Image 3 as a standard OpenPose keypoint map — the pose format Qwen Image Edit understands natively, with head direction and position-based lead mapping.',
  },
  {
    id: 'openpose-hands',
    label: 'OpenPose + hands',
    description:
      'OpenPose body map plus 21-point hand keypoints, for self-touch, grips and hands on a partner. Experimental — compare against plain OpenPose in the Film loop pose-match stat.',
  },
  {
    id: 'legacy',
    label: 'Legacy capsules',
    description:
      'Older colored capsule (or gray outline on Rapid AIO / Edit-2511) mannequins with long anti-leak prompts. Use to compare against OpenPose.',
  },
];

/**
 * Harvested-pose library (Day Auto-review + DWPose). Count and a reset — the entries are
 * browser-local, so this is the only way to see or clear them.
 */
function PoseLibraryControl() {
  const count = useSyncExternalStore(subscribePoseLibrary, poseLibraryCount, () => null);
  const [layout, setLayout] = useState<string>(POSE_IMPORT_LAYOUTS[0] ?? 'stand');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (count === null) {
    return null;
  }
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setStatus('Reading the pose…');
    try {
      const result = await importPoseFromPhoto({ file, layout });
      setStatus(
        `Saved as ${result.key} (${result.people} ${result.people === 1 ? 'person' : 'people'}).`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1.5 type-caption text-[var(--text-muted)]">
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="pose-library-count">
          Pose library: {count} {count === 1 ? 'pose' : 'poses'} — harvested from well-matched
          stills or imported from photos (needs DWPose in ComfyUI).
        </span>
        {count > 0 ? (
          <ChipButton active={false} onClick={() => clearPoseLibrary()}>
            Clear
          </ChipButton>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          Import pose as
          <select
            className="rounded border border-[var(--border-default)] bg-[var(--bg-base)] px-1.5 py-0.5 text-[var(--text-primary)]"
            value={layout}
            disabled={busy}
            onChange={event => setLayout(event.target.value)}
          >
            {POSE_IMPORT_LAYOUTS.map(id => (
              <option key={id} value={id}>
                {id.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="cursor-pointer underline">
          {busy ? 'Importing…' : 'from photo…'}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={event => {
              void onFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
      </div>
      {status ? <p data-testid="pose-library-import-status">{status}</p> : null}
    </div>
  );
}

type SettingsPromptQualityPanelProps = {
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  freeVramGb?: number | null;
  totalVramGb?: number | null;
};

export default function SettingsPromptQualityPanel({
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  freeVramGb,
  totalVramGb,
}: SettingsPromptQualityPanelProps) {
  const detail = sharedSettings.detail ?? 'balanced';
  const poseGuideStyle = normalizePoseGuideStylePreference(sharedSettings.poseGuideStyle);
  const vramEnabled = sharedSettings.vramGuardEnabled !== false;
  const minFreeGb = sharedSettings.vramGuardMinFreeGb ?? 6;
  const freeVramAfterMax = sharedSettings.freeVramAfterMax === true;
  const samplerPreset = normalizeModelSamplerPresetTier(sharedSettings.modelSamplerPreset);
  const orientation = normalizeResolutionOrientation(sharedSettings.modelResolutionOrientation);
  const coreOrientations = RESOLUTION_ORIENTATION_OPTIONS.filter(option =>
    RESOLUTION_ORIENTATION_CORE.includes(option.id)
  );

  return (
    <>
      <ToolSection id="settings-comfyui-prompt-quality" title="Prompt quality">
        <p className="text-sm text-[var(--text-muted)]">
          Defaults applied when generating and when queueing to ComfyUI. Tool sidebars can still
          override for a single session.
        </p>

        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">Default prompt detail</p>
          <div className="flex flex-wrap gap-1.5">
            {DETAIL_OPTIONS.map(option => (
              <ChipButton
                key={option.id}
                active={detail === option.id}
                disabled={!sharedMounted}
                onClick={() => updateSharedSettings({ detail: option.id })}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
          <p className="type-caption text-[var(--text-muted)]">
            Controls LLM length/density budgets (concise / balanced / rich).
          </p>
        </div>

        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">Default sampler preset</p>
          <div className="flex flex-wrap gap-1.5">
            {MODEL_SAMPLER_PRESET_OPTIONS.map(option => (
              <ChipButton
                key={option.id}
                active={samplerPreset === option.id}
                disabled={!sharedMounted}
                title={option.description}
                onClick={() => updateSharedSettings({ modelSamplerPreset: option.id })}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">Default orientation</p>
          <div className="flex flex-wrap gap-1.5">
            {coreOrientations.map(option => (
              <ChipButton
                key={option.id}
                active={orientation === option.id}
                disabled={!sharedMounted}
                title={option.description}
                onClick={() => updateSharedSettings({ modelResolutionOrientation: option.id })}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
          <p className="type-caption text-[var(--text-muted)]">
            Extra Qwen ratios remain available in tool sidebars.
          </p>
        </div>

        <RenderRealismHints
          mode={sharedSettings.renderRealismMode ?? 'off'}
          onModeChange={mode => updateSharedSettings({ renderRealismMode: mode })}
        />
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--text-primary)]">Pose guide style</p>
          <div className="flex flex-wrap gap-1.5">
            {POSE_GUIDE_STYLE_OPTIONS.map(option => (
              <ChipButton
                key={option.id}
                active={poseGuideStyle === option.id}
                disabled={!sharedMounted}
                title={option.description}
                onClick={() => updateSharedSettings({ poseGuideStyle: option.id })}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
          <p className="type-caption text-[var(--text-muted)]">
            {POSE_GUIDE_STYLE_OPTIONS.find(option => option.id === poseGuideStyle)?.description}
          </p>
          <PoseLibraryControl />
        </div>
        <AnatomyGuardHints
          mode={sharedSettings.anatomyGuardMode ?? 'standard'}
          onModeChange={mode => updateSharedSettings({ anatomyGuardMode: mode })}
          model={sharedSettings.model}
        />
        <label className="flex items-start gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/40 px-3 py-2.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-muted)]/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--accent-ring)]">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
            checked={sharedSettings.kleinEnhancerEnabled !== false}
            disabled={!sharedMounted}
            onChange={event => updateSharedSettings({ kleinEnhancerEnabled: event.target.checked })}
          />
          <span>
            <span className="block font-medium text-[var(--text-primary)]">
              Flux2 Klein Enhancer pack
            </span>
            <span className="type-caption mt-0.5 block text-[var(--text-muted)]">
              Wire{' '}
              <a
                href="https://github.com/capitan01R/ComfyUI-Flux2Klein-Enhancer"
                className="ui-text-link"
                target="_blank"
                rel="noreferrer"
              >
                ComfyUI-Flux2Klein-Enhancer
              </a>{' '}
              nodes at queue time when installed: Multi ReferenceLatent on compose (plus Identity
              Feature Transfer Final when Identity lock is on); Text Enhancer on Klein T2I; optional
              Color Anchor with few-step ramp tuning. Identity lock strength maps to HARD/MID/SOFT
              (4B caps at MID).
            </span>
          </span>
        </label>
        {sharedSettings.kleinEnhancerEnabled !== false ? (
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/30 px-3 py-3">
            <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
                checked={sharedSettings.kleinEnhancerTextEnabled !== false}
                disabled={!sharedMounted}
                onChange={event =>
                  updateSharedSettings({ kleinEnhancerTextEnabled: event.target.checked })
                }
              />
              <span>
                <span className="block font-medium text-[var(--text-primary)]">Text Enhancer</span>
                <span className="type-caption mt-0.5 block text-[var(--text-muted)]">
                  Subtle positive-conditioning emphasis on Klein T2I and compose prompts.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
                checked={sharedSettings.kleinEnhancerColorAnchorEnabled !== false}
                disabled={!sharedMounted}
                onChange={event =>
                  updateSharedSettings({ kleinEnhancerColorAnchorEnabled: event.target.checked })
                }
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[var(--text-primary)]">
                  Color Anchor (compose)
                </span>
                <span className="type-caption mt-0.5 block text-[var(--text-muted)]">
                  Anchors output channel means toward Figure 1 during sampling.
                </span>
                {sharedSettings.kleinEnhancerColorAnchorEnabled !== false ? (
                  <label className="mt-2 block space-y-1">
                    <span className="type-caption text-[var(--text-muted)]">
                      Strength —{' '}
                      {(sharedSettings.kleinEnhancerColorAnchorStrength ?? 0.45).toFixed(2)}
                    </span>
                    <input
                      type="range"
                      min={0.15}
                      max={0.85}
                      step={0.05}
                      disabled={!sharedMounted}
                      value={sharedSettings.kleinEnhancerColorAnchorStrength ?? 0.45}
                      onChange={event =>
                        updateSharedSettings({
                          kleinEnhancerColorAnchorStrength: Number(event.target.value),
                        })
                      }
                      className="w-full accent-[var(--accent)]"
                    />
                  </label>
                ) : null}
              </span>
            </label>
          </div>
        ) : null}
        <QueueQualityProfileHints
          profile={normalizeQueueQualityProfile(sharedSettings.queueQualityProfile)}
          samplerPreset={samplerPreset}
          resolutionSizeTier={normalizeResolutionSizeTier(sharedSettings.modelResolutionSizeTier)}
          onProfileChange={profile =>
            updateSharedSettings({
              queueQualityProfile: profile,
              sessionQueueMode: 'off',
            })
          }
        />

        <p className="type-caption text-[var(--text-muted)]">
          Theme and density live in{' '}
          <Link
            href="/profile"
            className="text-[var(--accent-text)] underline-offset-2 hover:underline"
          >
            Profile → Appearance
          </Link>
          .
        </p>
      </ToolSection>

      <ToolSection id="settings-comfyui-vram-guard" title="VRAM Max guard">
        <p className="text-sm text-[var(--text-muted)]">
          When free VRAM is low, Max enrich automatically downgrades to Final (skips neural upscale
          / peak refiner load).
        </p>
        {typeof freeVramGb === 'number' ? (
          <p className="type-caption text-[var(--text-muted)]">
            ComfyUI now: {freeVramGb.toFixed(1)}
            {typeof totalVramGb === 'number' ? ` / ${totalVramGb.toFixed(1)}` : ''} GB free
          </p>
        ) : null}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={vramEnabled}
            disabled={!sharedMounted}
            onChange={event => updateSharedSettings({ vramGuardEnabled: event.target.checked })}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentFocusClass()}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              Downgrade Max → Final when VRAM is tight
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Recommended on for 16–24GB cards while other jobs are running.
            </span>
          </span>
        </label>
        <label className="block space-y-2 text-sm">
          <span className="type-caption text-[var(--text-muted)]">
            Min free VRAM before Max (GB)
          </span>
          <input
            type="number"
            min={1}
            max={48}
            step={0.5}
            disabled={!sharedMounted || !vramEnabled}
            value={minFreeGb}
            onChange={event =>
              updateSharedSettings({
                vramGuardMinFreeGb: Number(event.target.value),
              })
            }
            className="ui-input w-full max-w-[10rem]"
          />
        </label>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={freeVramAfterMax}
            disabled={!sharedMounted}
            onChange={event => updateSharedSettings({ freeVramAfterMax: event.target.checked })}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentFocusClass()}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              Free VRAM after Max jobs
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Calls ComfyUI&apos;s unload/free-memory endpoint once a Max-quality gallery job
              finishes, so the next job on that host starts with a clean slate.
            </span>
          </span>
        </label>
      </ToolSection>
    </>
  );
}
