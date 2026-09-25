'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import PoseBodiesSvg from '@/components/pose/PoseBodiesSvg';
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/Field';
import ModalPortal from '@/components/ui/ModalPortal';
import { galleryEntryPrimaryViewUrl, getGalleryEntryById } from '@/lib/comfyui-gallery';
import type { PhotoPose } from '@/lib/day-pose-guide';
import {
  applyPoseToDaySlot,
  applyPoseToStoryBeat,
  daySlotPoseTargets,
  storyBeatPoseTargets,
  type PoseTargetOption,
} from '@/lib/gallery-pose-targets';
import { POSE_IMPORT_GROUPS } from '@/lib/pose-import-layouts';
import { poseLayoutLabel } from '@/lib/pose-layout-labels';
import { GALLERY_USE_POSE_EVENT } from '@/lib/gallery-pose-event';

type Read =
  { status: 'reading' } | { status: 'error'; message: string } | { status: 'ok'; pose: PhotoPose };

function GalleryPoseDialog({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const titleId = useId();
  const [read, setRead] = useState<Read>({ status: 'reading' });
  const [layout, setLayout] = useState<string>('stand');
  const [slots] = useState<PoseTargetOption[]>(() => daySlotPoseTargets());
  const [beats] = useState<PoseTargetOption[]>(() => storyBeatPoseTargets());
  const [slot, setSlot] = useState(() => slots[0]?.key ?? '');
  const [beat, setBeat] = useState(() => beats[0]?.key ?? '');
  const [done, setDone] = useState<{ text: string; href?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const entry = getGalleryEntryById(entryId);
    const url = entry ? galleryEntryPrimaryViewUrl(entry) : null;
    if (!url) {
      queueMicrotask(() => {
        if (!cancelled) setRead({ status: 'error', message: 'This entry has no still to read.' });
      });
      return;
    }
    void import('@/lib/pose-library-import')
      .then(({ readPoseFromImageUrl }) => readPoseFromImageUrl(url))
      .then(pose => {
        if (!cancelled) setRead({ status: 'ok', pose });
      })
      .catch(error => {
        if (!cancelled) {
          setRead({
            status: 'error',
            message: error instanceof Error ? error.message : 'Could not read the pose.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  const pose = read.status === 'ok' ? read.pose : null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--bg-base)]/70 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="gallery-pose-dialog"
          className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          onClick={event => event.stopPropagation()}
          onKeyDown={event => {
            if (event.key === 'Escape') onClose();
          }}
        >
          <h2 id={titleId} className="type-heading">
            Use this pose
          </h2>
          {read.status === 'reading' ? (
            <p className="type-caption text-[var(--text-muted)]">Reading the pose (DWPose)…</p>
          ) : read.status === 'error' ? (
            <p
              className="type-caption text-[var(--tint-warning-text,var(--text-muted))]"
              data-testid="gallery-pose-error"
            >
              {read.message}
            </p>
          ) : (
            <div className="flex items-start gap-3">
              <PoseBodiesSvg
                layers={[{ bodies: read.pose.people }]}
                aspect={read.pose.aspect}
                height={120}
                label="Pose read from this still"
              />
              <p className="type-caption text-[var(--text-muted)]">
                {read.pose.people.length} {read.pose.people.length === 1 ? 'person' : 'people'} —
                the guide draws exactly this skeleton wherever you use it.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Save to the pose library
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <SelectInput
                value={layout}
                aria-label="File the pose under"
                className="w-auto! min-w-[10rem] py-1 text-sm"
                onChange={event => setLayout(event.target.value)}
              >
                {POSE_IMPORT_GROUPS.map(group => (
                  <optgroup key={group.label} label={group.label}>
                    {group.ids.map(id => (
                      <option key={id} value={id}>
                        {poseLayoutLabel(id)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </SelectInput>
              <Button
                size="sm"
                variant="secondary"
                disabled={!pose}
                data-testid="gallery-pose-save"
                onClick={() => {
                  if (!pose) return;
                  void import('@/lib/pose-library-import').then(({ savePhotoPoseToLibrary }) => {
                    const { key } = savePhotoPoseToLibrary(pose, layout);
                    setDone({
                      text: `Saved to the pose library as ${poseLayoutLabel(layout)} (${key}).`,
                    });
                  });
                }}
              >
                Save
              </Button>
            </div>
          </div>

          {slots.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">Use for a Day slot</p>
              <div className="flex flex-wrap items-center gap-2">
                <SelectInput
                  value={slot}
                  aria-label="Day slot"
                  className="w-auto! min-w-[10rem] py-1 text-sm"
                  onChange={event => setSlot(event.target.value)}
                >
                  {slots.map(option => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </SelectInput>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!pose || !slot}
                  data-testid="gallery-pose-day"
                  onClick={() => {
                    if (!pose) return;
                    applyPoseToDaySlot(slot, pose);
                    setDone({ text: 'Day slot will draw this pose.', href: '/day' });
                  }}
                >
                  Use
                </Button>
              </div>
            </div>
          ) : null}

          {beats.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">Use for a Story beat</p>
              <div className="flex flex-wrap items-center gap-2">
                <SelectInput
                  value={beat}
                  aria-label="Story beat"
                  className="w-auto! min-w-[10rem] py-1 text-sm"
                  onChange={event => setBeat(event.target.value)}
                >
                  {beats.map(option => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </SelectInput>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!pose || !beat}
                  data-testid="gallery-pose-story"
                  onClick={() => {
                    if (!pose) return;
                    applyPoseToStoryBeat(beat, pose);
                    setDone({
                      text: "The beat's next queue or retry draws this pose.",
                      href: '/story',
                    });
                  }}
                >
                  Use
                </Button>
              </div>
            </div>
          ) : null}

          {done ? (
            <p
              className="type-caption text-[var(--text-secondary)]"
              data-testid="gallery-pose-done"
            >
              {done.text}{' '}
              {done.href ? (
                <Link href={done.href} className="ui-text-link">
                  Open
                </Link>
              ) : null}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** Mounted once with the gallery's modals; opens the dialog when a card asks. */
export default function GalleryPoseDialogHost() {
  const [entryId, setEntryId] = useState<string | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id === 'string' && id) setEntryId(id);
    };
    window.addEventListener(GALLERY_USE_POSE_EVENT, open);
    return () => window.removeEventListener(GALLERY_USE_POSE_EVENT, open);
  }, []);
  return entryId ? (
    <GalleryPoseDialog key={entryId} entryId={entryId} onClose={() => setEntryId(null)} />
  ) : null;
}
