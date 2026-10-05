'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import PoseBodiesSvg from '@/components/pose/PoseBodiesSvg';
import MyPosesStrip from '@/components/pose/MyPosesStrip';
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/Field';
import { usePoseLibrary } from '@/hooks/usePoseLibrary';
import { usePoseReferences } from '@/hooks/usePoseReferences';
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
import { fitPhotoPoseToHeadcount } from '@/lib/photo-pose-fit';
import {
  POSE_REFERENCE_SOURCE_WORDS,
  poseReferenceCreditText,
  poseReferencesFor,
} from '@/lib/pose-references';

// A modal used now and then: its own chunk, shared by every page, instead of a copy in each
// tool page's bundle.
const PoseJointEditor = dynamic(() => import('@/components/pose/PoseJointEditor'), {
  ssr: false,
});

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
  backdropUrl,
  backdropLabel,
  photoPeople,
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
  /** The Cast's plate, shown behind the figure in the pose editor as a guide to proportions. */
  backdropUrl?: string | null;
  backdropLabel?: string;
  /**
   * How many people this still draws (1 solo, 2 duo): "From a photo" keeps that many from the
   * photo, and a duo needs two. Unset = as many as the photo has.
   */
  photoPeople?: number;
  onChange: (patch: PosePicks) => void;
}) {
  const library = usePoseLibrary();
  const references = usePoseReferences();
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  // The picture the pose was read from, shown beside the figure while that pose is in use. Kept
  // for this visit only (an object URL): the slot / beat stores the skeleton, not the photo.
  const [photoThumb, setPhotoThumb] = useState<{ url: string; pose: PhotoPose } | null>(null);
  const thumbUrlRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (thumbUrlRef.current) URL.revokeObjectURL(thumbUrlRef.current);
    },
    []
  );

  const plan = useMemo(
    () =>
      resolveSceneGuidePlan(sceneText, fallbackIndex, {
        ...options,
        library,
        references,
        avoidLayouts: picks.poseLayout ? undefined : weakLayouts,
        openPose: true,
      }),
    [fallbackIndex, library, options, picks.poseLayout, references, sceneText, weakLayouts]
  );

  const { intent, routedAround, openPose } = plan;
  // A still the plan draws with one figure (a Day slot with no partner): a partner posed here is
  // kept with the pose, but only the lead is drawn.
  const soloStill = options.forcePeople === 1;
  // What the editor opens on: the whole custom pose (a solo still draws only its lead, but the
  // partner is not lost by editing), and the beat's duo layout to seed a partner from.
  const editorPlan = useMemo(() => {
    if (!editing) return { bodies: openPose.keypoints, duoSeed: undefined };
    const plannedWith = (extra: PoseGuideBuildOptions) =>
      resolveSceneGuidePlan(sceneText, fallbackIndex, {
        ...options,
        ...extra,
        library,
        references,
        openPose: true,
      }).openPose.keypoints;
    const bodies =
      picks.posePhoto && picks.posePhoto.people.length > openPose.keypoints.length
        ? plannedWith({ forcePeople: undefined })
        : openPose.keypoints;
    const duo = bodies.length < 2 ? plannedWith({ photoPose: undefined, forcePeople: 2 }) : [];
    return { bodies, duoSeed: duo.length === 2 ? duo : undefined };
  }, [
    editing,
    fallbackIndex,
    library,
    openPose.keypoints,
    options,
    picks.posePhoto,
    references,
    sceneText,
  ]);
  const drawnId = intent.intimate ?? intent.social ?? intent.base;
  // Real-world references for this pose: "Try another" walks through them, then the drawing.
  const poseReferences = intent.intimate
    ? []
    : poseReferencesFor(references, drawnId, openPose.keypoints.length, intent.base);
  const reference = openPose.referenceId
    ? (poseReferences.find(ref => ref.id === openPose.referenceId) ?? null)
    : null;
  const fromPhoto = Boolean(picks.posePhoto);
  const edited = picks.posePhoto?.source === 'edited';
  const name = fromPhoto
    ? edited
      ? 'Your edit'
      : 'Your photo'
    : `${poseLayoutLabel(drawnId)}${
        reference
          ? ` · ${reference.source === 'drawn' ? 'drawn' : 'real'} pose ${poseReferences.indexOf(reference) + 1} of ${poseReferences.length}`
          : openPose.libraryEntryId
            ? ' · real pose'
            : ''
      }`;
  const people = openPose.keypoints.length;
  const busy = disabled || photoBusy;

  const readPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(false);
    setPhotoStatus('Reading the pose…');
    try {
      // Loaded on demand: pulls in ComfyUI upload + DWPose.
      const { readPoseFromPhoto } = await import('@/lib/pose-library-import');
      const { pose, note } = fitPhotoPoseToHeadcount(await readPoseFromPhoto(file), photoPeople);
      onChange({ posePhoto: pose, poseLayout: undefined, poseVariant: undefined });
      if (thumbUrlRef.current) URL.revokeObjectURL(thumbUrlRef.current);
      thumbUrlRef.current = URL.createObjectURL(file);
      setPhotoThumb({ url: thumbUrlRef.current, pose });
      setPhotoStatus(note);
    } catch (error) {
      setPhotoError(true);
      setPhotoStatus(error instanceof Error ? error.message : 'Could not read that photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const savePhoto = async () => {
    if (!picks.posePhoto) return;
    const { savePhotoPoseToLibrary } = await import('@/lib/pose-library-import');
    const { key } = savePhotoPoseToLibrary(picks.posePhoto, drawnId);
    setPhotoError(false);
    setPhotoStatus(`Saved to the pose library as ${poseLayoutLabel(drawnId)} (${key}).`);
  };

  // The photo beside the figure only while the pose read from it is still the one in use.
  const thumbUrl =
    photoThumb &&
    picks.posePhoto &&
    !edited &&
    JSON.stringify(picks.posePhoto.people) === JSON.stringify(photoThumb.pose.people)
      ? photoThumb.url
      : null;

  if (editing) {
    return (
      <PoseJointEditor
        bodies={editorPlan.bodies}
        aspect={openPose.canvas.width / openPose.canvas.height}
        testIdPrefix={testIdPrefix}
        duoSeed={editorPlan.duoSeed}
        soloStill={soloStill}
        backdropUrl={backdropUrl}
        backdropLabel={backdropLabel}
        onCancel={() => setEditing(false)}
        onSave={pose => {
          onChange({ posePhoto: pose, poseLayout: undefined, poseVariant: undefined });
          setPhotoError(false);
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
      <div className="flex shrink-0 gap-1.5">
        {thumbUrl ? (
          // An object URL of the player's own file: next/image cannot optimise it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt="The photo this pose was read from"
            className="w-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-cover"
            style={{ height: compact ? 96 : 120, maxWidth: compact ? 72 : 90 }}
            data-testid={`${testIdPrefix}-photo-thumb`}
          />
        ) : null}
        <PoseBodiesSvg
          layers={[{ bodies: openPose.keypoints }]}
          aspect={openPose.canvas.width / openPose.canvas.height}
          height={compact ? 96 : 120}
          label={`Pose guide: ${name}`}
        />
      </div>
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
        {reference ? (
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid={`${testIdPrefix}-reference-credit`}
          >
            Pose from{' '}
            <a
              href={reference.credit.source}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              title={reference.credit.title}
            >
              {POSE_REFERENCE_SOURCE_WORDS[reference.source]}
            </a>{' '}
            · {poseReferenceCreditText(reference)}
          </p>
        ) : null}
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
              title={
                poseReferences.length
                  ? `Next variant of this pose: ${poseReferences.length} reference poses (photos, motion capture or drawings), then the drawing`
                  : 'Redraw the guide as a different variant of this pose'
              }
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
        <MyPosesStrip
          disabled={busy}
          testIdPrefix={`${testIdPrefix}-my-poses`}
          onPick={pose =>
            onChange({ posePhoto: pose, poseLayout: undefined, poseVariant: undefined })
          }
        />
        {/* Tap targets 32 px tall: as bare text links they were 18 px on a phone. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0 type-caption text-[var(--text-muted)]">
          <button
            type="button"
            className="inline-flex min-h-8 items-center underline"
            disabled={busy}
            data-testid={`${testIdPrefix}-edit`}
            onClick={() => setEditing(true)}
          >
            Edit joints
          </button>
          <label
            className="inline-flex min-h-8 cursor-pointer items-center underline"
            data-testid={`${testIdPrefix}-photo`}
            title={
              photoPeople === 2
                ? 'Pick a photo of two people in the pose you want — only the pose is used, not the people or clothes'
                : 'Pick a photo of someone in the pose you want — only the pose is used, not the person or clothes'
            }
          >
            {photoBusy ? 'Reading…' : fromPhoto && !edited ? 'Another photo…' : 'From a photo…'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              data-testid={`${testIdPrefix}-photo-input`}
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
                  setPhotoError(false);
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
            className={`type-caption ${
              photoError
                ? 'text-[var(--tint-warning-text,var(--accent-text))]'
                : 'text-[var(--text-muted)]'
            }`}
            role={photoError ? 'alert' : undefined}
            data-error={photoError ? 'true' : undefined}
            data-testid={`${testIdPrefix}-photo-status`}
          >
            {photoStatus}
          </p>
        ) : null}
      </div>
    </div>
  );
}
