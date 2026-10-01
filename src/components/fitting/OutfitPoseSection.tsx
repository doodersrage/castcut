'use client';

import { useState } from 'react';
import MyPosesStrip from '@/components/pose/MyPosesStrip';
import PoseBodiesSvg from '@/components/pose/PoseBodiesSvg';
import PoseJointEditor from '@/components/pose/PoseJointEditor';
import { Button } from '@/components/ui/Button';
import type { PhotoPose } from '@/lib/day-pose-guide';
import { poseStarterBody } from '@/lib/pose-starters';

/**
 * Outfit → Pose: try a kit on in the plate's own stance (default), in a pose you drag into
 * shape, or in a pose read from any photo (a pose plate) — the skeleton goes to the try-on as a
 * pose map (Image 3), like Day's guides.
 */
export default function OutfitPoseSection({
  pose,
  busy,
  onChange,
  leadNoun = 'woman',
  hideLabel = false,
}: {
  pose?: PhotoPose;
  busy: boolean;
  onChange: (pose: PhotoPose | undefined) => void;
  /** Pronoun for the hint ("render him / her"). */
  leadNoun?: 'woman' | 'man' | 'person';
  /** The surrounding card already titles this "Pose". */
  hideLabel?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const fromPhoto = Boolean(pose) && pose?.source !== 'edited';
  // A pose plate: read the pose out of any photo of a person and try the kit on in it.
  const readPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoStatus('Reading the pose…');
    try {
      // Loaded on demand: pulls in the ComfyUI upload + DWPose detection.
      const { readPoseFromPhoto } = await import('@/lib/pose-library-import');
      const read = await readPoseFromPhoto(file);
      setEditing(false);
      onChange({ ...read, people: read.people.slice(0, 1), source: 'photo' });
      setPhotoStatus(
        read.people.length > 1
          ? 'Using the pose of the largest person in your photo.'
          : 'Using the pose from your photo.'
      );
    } catch (error) {
      setPhotoStatus(error instanceof Error ? error.message : 'Could not read that photo.');
    } finally {
      setPhotoBusy(false);
    }
  };
  const startPose: PhotoPose = pose ?? {
    aspect: 2 / 3,
    people: [poseStarterBody('stand')],
    source: 'edited',
  };

  return (
    <div className="space-y-2" data-testid="outfit-pose">
      <div className="flex flex-wrap items-center gap-2">
        {hideLabel ? null : (
          <span className="type-caption w-16 shrink-0 text-[var(--text-muted)]">Pose</span>
        )}
        <div className="ui-segmented" role="radiogroup" aria-label="Try-on pose">
          <button
            type="button"
            role="radio"
            className="ui-segmented-item"
            aria-checked={!pose}
            data-active={!pose ? 'true' : 'false'}
            disabled={busy}
            data-testid="outfit-pose-plate"
            title="Keep the plate's own stance — a fitting"
            onClick={() => {
              setEditing(false);
              setPhotoStatus(null);
              onChange(undefined);
            }}
          >
            As the plate
          </button>
          <button
            type="button"
            role="radio"
            className="ui-segmented-item"
            aria-checked={Boolean(pose) && !fromPhoto}
            data-active={pose && !fromPhoto ? 'true' : 'false'}
            disabled={busy}
            data-testid="outfit-pose-custom"
            title="Open the pose editor. The try-on uses the pose when you choose Use this pose."
            onClick={() => setEditing(true)}
          >
            Custom pose
          </button>
          <label
            role="radio"
            className="ui-segmented-item cursor-pointer"
            aria-checked={fromPhoto}
            data-active={fromPhoto ? 'true' : 'false'}
            aria-disabled={busy || photoBusy}
            data-testid="outfit-pose-photo"
            title="Pick a photo of someone in the pose you want — only the pose is used, not the person or clothes"
          >
            {photoBusy ? 'Reading…' : 'Pose from a photo'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy || photoBusy}
              onChange={event => {
                void readPhoto(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
      {editing ? (
        <PoseJointEditor
          bodies={startPose.people.slice(0, 1)}
          aspect={startPose.aspect}
          testIdPrefix="outfit-pose"
          allowTwo={false}
          possessive={leadNoun === 'man' ? 'his' : 'her'}
          leadsPrompt
          words={pose?.words}
          onSave={next => {
            onChange({ ...next, people: next.people.slice(0, 1) });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : pose ? (
        <div className="flex items-center gap-3">
          <PoseBodiesSvg
            layers={[{ bodies: pose.people }]}
            aspect={pose.aspect}
            height={96}
            label={fromPhoto ? 'Try-on pose read from your photo' : 'Custom try-on pose'}
            testId="outfit-pose-figure"
          />
          <div className="space-y-1">
            <p className="type-caption text-[var(--text-muted)]">
              Try-ons render {leadNoun === 'man' ? 'him' : leadNoun === 'woman' ? 'her' : 'them'} in
              this pose{fromPhoto ? ' (read from your photo)' : ''}. A clear, simple pose follows
              best.
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              data-testid="outfit-pose-edit"
              onClick={() => setEditing(true)}
            >
              Edit pose
            </Button>
          </div>
        </div>
      ) : null}
      {pose?.words && !editing ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="outfit-pose-day-words">
          Prompt says: {pose.words}
        </p>
      ) : null}
      {photoStatus ? (
        <p
          className="type-caption text-[var(--text-muted)]"
          role="status"
          data-testid="outfit-pose-photo-status"
        >
          {photoStatus}
        </p>
      ) : null}
      {!editing ? (
        <MyPosesStrip
          disabled={busy}
          maxPeople={1}
          testIdPrefix="outfit-my-poses"
          onPick={picked => onChange({ ...picked, people: picked.people.slice(0, 1) })}
        />
      ) : null}
    </div>
  );
}
