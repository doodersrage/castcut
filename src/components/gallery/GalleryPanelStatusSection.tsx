'use client';

import type { RefObject } from 'react';
import { GalleryPanelHeader, GalleryPickDock } from '@/components/gallery/GalleryPanelChrome';
import StatusToastStrip from '@/components/ui/StatusToastStrip';
import type { GalleryHandoffPayload } from '@/lib/gallery-handoff';
import { toneForStatusText } from '@/lib/status-progress';

type GalleryPanelStatusSectionProps = {
  showHeader: boolean;
  leanGallery: boolean;
  compact: boolean;
  limit?: number;
  uploadInputRef: RefObject<HTMLInputElement | null>;
  header: {
    activeJobs: number;
    entriesLength: number;
    uploadingImages: boolean;
    onRefreshPending: () => void;
    onArchiveThenPurge: () => void;
    onFinishPendingPurge: () => void;
    onPurgeRestOnly: () => void;
  };
  requeueStatus: string | null;
  pickFor: GalleryHandoffPayload['target'] | null;
};

export default function GalleryPanelStatusSection({
  showHeader,
  leanGallery,
  compact,
  limit,
  uploadInputRef,
  header,
  requeueStatus,
  pickFor,
}: GalleryPanelStatusSectionProps) {
  return (
    <>
      {showHeader ? (
        <GalleryPanelHeader
          leanGallery={leanGallery}
          activeJobs={header.activeJobs}
          entriesLength={header.entriesLength}
          compact={compact}
          limit={limit}
          onRefreshPending={header.onRefreshPending}
          onArchiveThenPurge={header.onArchiveThenPurge}
          onFinishPendingPurge={header.onFinishPendingPurge}
          onPurgeRestOnly={header.onPurgeRestOnly}
          onUpload={() => uploadInputRef.current?.click()}
          uploading={header.uploadingImages}
        />
      ) : null}

      {requeueStatus ? (
        <div data-testid="gallery-requeue-status">
          <StatusToastStrip
            notes={[
              {
                id: 'gallery-requeue',
                text: requeueStatus,
                tone: toneForStatusText(requeueStatus),
              },
            ]}
          />
        </div>
      ) : null}

      {pickFor ? <GalleryPickDock pickFor={pickFor} /> : null}
    </>
  );
}
