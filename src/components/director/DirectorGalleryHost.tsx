'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { pushAppToast } from '@/lib/app/toast';
import { getCharacter } from '@/lib/character/os';
import { ClipJobBusyError } from '@/lib/clip/clip-jobs';
import { runClipJob, runningTrackedClipJob } from '@/lib/clip/clip-jobs-tracker';
import { dayPartnerNoun } from '@/lib/day/partner';
import { copyMovesForm } from '@/lib/media/actions-client';
import { DIRECTOR_OPEN_EVENT, type DirectorOpenRequest } from '@/lib/director/open-event';

const DirectorSheet = dynamic(() => import('@/components/director/DirectorSheet'), {
  ssr: false,
});

/**
 * The Director on a Gallery still (⋯ → Make it move → Direct a move…): the clip runs as a Copy
 * moves background job and is kept in the Gallery as the still's child.
 */
export default function DirectorGalleryHost() {
  const [request, setRequest] = useState<DirectorOpenRequest | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<DirectorOpenRequest>).detail;
      if (detail?.stillUrl) setRequest(detail);
    };
    window.addEventListener(DIRECTOR_OPEN_EVENT, open);
    return () => window.removeEventListener(DIRECTOR_OPEN_EVENT, open);
  }, []);
  if (!request) return null;
  const cast = request.characterId ? getCharacter(request.characterId) : undefined;
  const label = `Direct a move${request.prompt ? ` · ${request.prompt.slice(0, 60)}` : ''}`;
  return (
    <DirectorSheet
      open
      stillUrl={request.stillUrl}
      castId={request.characterId}
      castName={cast?.name}
      body={dayPartnerNoun(cast ?? {}) === 'man' ? 'male' : 'female'}
      busy={Boolean(runningTrackedClipJob())}
      onClose={() => setRequest(null)}
      onRender={(video, options) => {
        pushAppToast({
          text: 'Directing — a few minutes on ComfyUI. Follow it in the jobs tray.',
          tone: 'info',
          ttlMs: 8000,
        });
        void runClipJob({
          tool: 'moves',
          body: copyMovesForm({
            video,
            stillUrl: request.stillUrl,
            look: (cast?.descriptor || cast?.hints || request.prompt || '').trim().slice(0, 600),
            place: options.place,
            motion: options.motion,
            seat: options.seat,
          }),
          keep: {
            kind: 'moves',
            prompt: label,
            tool: request.tool || 'gallery',
            sourceEntryId: request.entryId,
          },
          owner: { feature: 'gallery', ref: request.entryId },
          label,
        }).catch(error => {
          // The tracker has said why (with Retry); a busy server is the one case it doesn't.
          if (error instanceof ClipJobBusyError)
            pushAppToast({ text: error.message, tone: 'warning' });
        });
      }}
      testId="gallery-director"
    />
  );
}
