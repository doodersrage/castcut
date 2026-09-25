'use client';

import { useMemo, useState } from 'react';
import PoseBodiesSvg from '@/components/pose/PoseBodiesSvg';
import PoseJointEditor from '@/components/pose/PoseJointEditor';
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/Field';
import { usePoseLibrary } from '@/hooks/usePoseLibrary';
import {
  POSE_CAMERA_CHOICES,
  POSE_LOOK_CHOICES,
  resolveSceneGuidePlan,
  type PoseLookChoice,
  type PhotoPose,
  type PoseCameraChoice,
  type PoseGuideBuildOptions,
} from '@/lib/day-pose-guide';
import { POSE_PICKER_GROUPS, poseLayoutLabel } from '@/lib/pose-layout-labels';

/** What the player can set on a slot / beat pose. */
export type PosePicks = {
  poseLayout?: string;
  poseVariant?: number;
  posePhoto?: PhotoPose;
  poseCamera?: PoseCameraChoice;
  poseLead?: 'left' | 'right';
  poseLook?: PoseLookChoice;
};

const LOOK_LABELS: Record<PoseLookChoice, string> = {
  camera: 'At the camera',
  away: 'Away, off frame',
  down: 'Down',
  partner: 'At the other person',
};

const CAMERA_LABELS: Record<PoseCameraChoice, string> = {
  front: 'Eye level, front',
  side: 'Side view',
  overhead: 'Overhead',
  low: 'Low angle',
};

const selectClass = 'w-auto! min-w-[8rem] py-1 text-sm';

/**
 * Pose preview for a Day slot or Story beat: the skeleton the guide will draw (same plan as the
 * queue, including pose-library and photo poses), its name, and the controls — Change pose,
 * Try another, camera, which side the lead stands on, and a pose read from your own photo.
 */
export default function PosePreview({
  sceneText,
  options,
  fallbackIndex = 0,
  picks,
  weakLayouts,
  disabled = false,
  compact = false,
  testIdPrefix = 'pose-preview',
  onChange,
}: {
  sceneText?: string;
  /** Guide options from the slot / beat plan (pose spec, variant, photo, camera, lead). */
  options: PoseGuideBuildOptions;
  fallbackIndex?: number;
  picks: PosePicks;
  /** Layouts the guide routes around when nothing is picked (poor pose-match record). */
  weakLayouts?: ReadonlySet<string>;
  disabled?: boolean;
  compact?: boolean;
  testIdPrefix?: string;
  onChange: (patch: PosePicks) => void;
}) {
  const library = usePoseLibrary();
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const plan = useMemo(
    () =>
      resolveSceneGuidePlan(sceneText, fallbackIndex, {
        ...options,
        library,
        avoidLayouts: picks.poseLayout ? undefined : weakLayouts,
        openPose: true,
      }),
    [fallbackIndex, library, options, picks.poseLayout, sceneText, weakLayouts]
  );

  const { intent, routedAround, openPose } = plan;
  const drawnId = intent.intimate ?? intent.social ?? intent.base;
  const fromPhoto = Boolean(picks.posePhoto);
  const edited = picks.posePhoto?.source === 'edited';
  const name = fromPhoto
    ? edited
      ? 'Your edit'
      : 'Your photo'
    : `${poseLayoutLabel(drawnId)}${openPose.libraryEntryId ? ' · real pose' : ''}`;
  const people = openPose.keypoints.length;
  const busy = disabled || photoBusy;

  const readPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoStatus('Reading the pose…');
    try {
      // Loaded on demand: pulls in ComfyUI upload + DWPose.
      const { readPoseFromPhoto } = await import('@/lib/pose-library-import');
      const pose = await readPoseFromPhoto(file);
      onChange({ posePhoto: pose, poseLayout: undefined, poseVariant: undefined });
      setPhotoStatus(
        `Using your photo (${pose.people.length} ${pose.people.length === 1 ? 'person' : 'people'}).`
      );
    } catch (error) {
      setPhotoStatus(error instanceof Error ? error.message : 'Could not read that photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const savePhoto = async () => {
    if (!picks.posePhoto) return;
    const { savePhotoPoseToLibrary } = await import('@/lib/pose-library-import');
    const { key } = savePhotoPoseToLibrary(picks.posePhoto, drawnId);
    setPhotoStatus(`Saved to the pose library as ${poseLayoutLabel(drawnId)} (${key}).`);
  };

  if (editing) {
    return (
      <PoseJointEditor
        bodies={openPose.keypoints}
        aspect={openPose.canvas.width / openPose.canvas.height}
        testIdPrefix={testIdPrefix}
        onCancel={() => setEditing(false)}
        onSave={pose => {
          onChange({ posePhoto: pose, poseLayout: undefined, poseVariant: undefined });
          setPhotoStatus('Using your edited pose.');
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div
      className={`flex gap-3 ${compact ? 'items-start' : 'items-center'}`}
      data-testid={testIdPrefix}
      data-pose={fromPhoto ? 'photo' : drawnId}
    >
      <PoseBodiesSvg
        layers={[{ bodies: openPose.keypoints }]}
        aspect={openPose.canvas.width / openPose.canvas.height}
        height={compact ? 96 : 120}
        label={`Pose guide: ${name}`}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="type-caption text-[var(--text-secondary)]">
          <span className="type-overline mr-1 text-[var(--text-muted)]">
            {fromPhoto || picks.poseLayout ? 'Picked' : 'From the beat'}
          </span>
          <span
            className="font-medium text-[var(--text-primary)]"
            data-testid={`${testIdPrefix}-name`}
          >
            {name}
          </span>
          {people > 1 ? ` · ${people} people` : ''}
        </p>
        {routedAround ? (
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid={`${testIdPrefix}-routed`}
          >
            Edit keeps missing &ldquo;{poseLayoutLabel(routedAround)}&rdquo; even with the pose
            spelled out, so the guide draws the plain posture — pick it below to force it.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <SelectInput
            value={fromPhoto ? '' : (picks.poseLayout ?? '')}
            disabled={busy}
            aria-label="Change pose"
            data-testid={`${testIdPrefix}-select`}
            className={selectClass}
            onChange={event =>
              onChange({
                poseLayout: event.target.value || undefined,
                poseVariant: undefined,
                posePhoto: undefined,
              })
            }
          >
            <option value="">{fromPhoto ? name : 'Auto — from the beat'}</option>
            {POSE_PICKER_GROUPS.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.ids.map(id => (
                  <option key={id} value={id}>
                    {poseLayoutLabel(id)}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectInput>
          {fromPhoto ? null : (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              data-testid={`${testIdPrefix}-another`}
              title="Redraw the guide as a different variant of this pose"
              onClick={() => onChange({ poseVariant: ((picks.poseVariant ?? 0) % 99) + 1 })}
            >
              Try another
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SelectInput
            value={picks.poseCamera ?? ''}
            disabled={busy}
            aria-label="Camera"
            data-testid={`${testIdPrefix}-camera`}
            className={selectClass}
            onChange={event =>
              onChange({ poseCamera: (event.target.value || undefined) as PoseCameraChoice })
            }
          >
            <option value="">
              Camera: auto{openPose.camera ? ` (${CAMERA_LABELS[openPose.camera]})` : ''}
            </option>
            {POSE_CAMERA_CHOICES.map(choice => (
              <option key={choice} value={choice}>
                {CAMERA_LABELS[choice]}
              </option>
            ))}
          </SelectInput>
          {people > 1 && !fromPhoto ? (
            <SelectInput
              value={picks.poseLead ?? ''}
              disabled={busy}
              aria-label="Where the Cast lead stands"
              data-testid={`${testIdPrefix}-lead`}
              className={selectClass}
              onChange={event =>
                onChange({
                  poseLead: (event.target.value || undefined) as 'left' | 'right' | undefined,
                })
              }
            >
              <option value="">Lead: as drawn</option>
              <option value="left">Lead on the left</option>
              <option value="right">Lead on the right</option>
            </SelectInput>
          ) : null}
          <SelectInput
            value={picks.poseLook ?? ''}
            disabled={busy}
            aria-label="Where the Cast looks"
            data-testid={`${testIdPrefix}-look`}
            className={selectClass}
            onChange={event =>
              onChange({ poseLook: (event.target.value || undefined) as PoseLookChoice })
            }
          >
            <option value="">Look: as posed</option>
            {POSE_LOOK_CHOICES.filter(choice => choice !== 'partner' || people > 1).map(choice => (
              <option key={choice} value={choice}>
                {LOOK_LABELS[choice]}
              </option>
            ))}
          </SelectInput>
        </div>
        <div className="flex flex-wrap items-center gap-2 type-caption text-[var(--text-muted)]">
          <button
            type="button"
            className="underline"
            disabled={busy}
            data-testid={`${testIdPrefix}-edit`}
            onClick={() => setEditing(true)}
          >
            Edit joints
          </button>
          <label className="cursor-pointer underline" data-testid={`${testIdPrefix}-photo`}>
            {photoBusy ? 'Reading…' : fromPhoto ? 'Use another photo…' : 'Use a photo…'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy}
              onChange={event => {
                void readPhoto(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>
          {fromPhoto ? (
            <>
              <button
                type="button"
                className="underline"
                disabled={busy}
                data-testid={`${testIdPrefix}-photo-clear`}
                onClick={() => {
                  onChange({ posePhoto: undefined });
                  setPhotoStatus(null);
                }}
              >
                {edited ? 'Clear edit' : 'Clear photo'}
              </button>
              <button
                type="button"
                className="underline"
                disabled={busy}
                title={`File this pose in the pose library under ${poseLayoutLabel(drawnId)}`}
                onClick={() => void savePhoto()}
              >
                Save to pose library
              </button>
            </>
          ) : null}
        </div>
        {photoStatus ? (
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid={`${testIdPrefix}-photo-status`}
          >
            {photoStatus}
          </p>
        ) : null}
      </div>
    </div>
  );
}
