'use client';

import { useState } from 'react';
import MyPosesStrip from '@/components/pose/MyPosesStrip';
import PoseBodiesSvg from '@/components/pose/PoseBodiesSvg';
import PoseJointEditor from '@/components/pose/PoseJointEditor';
import { Button } from '@/components/ui/Button';
import type { PhotoPose } from '@/lib/day-pose-guide';
import { poseStarterBody } from '@/lib/pose-starters';

/**
 * Outfit → Pose: try a kit on in the plate's own stance (default) or in a pose you drag into
 * shape — the skeleton goes to the try-on as a pose map (Image 3), like Day's guides.
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
              onChange(undefined);
            }}
          >
            As the plate
          </button>
          <button
            type="button"
            role="radio"
            className="ui-segmented-item"
            aria-checked={Boolean(pose)}
            data-active={pose ? 'true' : 'false'}
            disabled={busy}
            data-testid="outfit-pose-custom"
            title="Drag a figure into the pose to try the kit on in"
            onClick={() => {
              if (!pose) onChange(startPose);
              setEditing(true);
            }}
          >
            Custom pose
          </button>
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
            label="Custom try-on pose"
            testId="outfit-pose-figure"
          />
          <div className="space-y-1">
            <p className="type-caption text-[var(--text-muted)]">
              Try-ons render {leadNoun === 'man' ? 'him' : leadNoun === 'woman' ? 'her' : 'them'} in
              this pose. A clear, simple pose follows best.
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
