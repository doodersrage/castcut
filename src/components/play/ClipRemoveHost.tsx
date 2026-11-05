'use client';

import { useEffect, useRef, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import FixAreaBrushCanvas, {
  type FixAreaBrushHandle,
} from '@/components/fix-area/FixAreaBrushCanvas';
import { pushAppToast } from '@/lib/app/toast';
import { ClipJobBusyError } from '@/lib/clip/clip-jobs';
import { runClipJob, runningTrackedClipJob } from '@/lib/clip/clip-jobs-tracker';
import { CLIP_REMOVE_OPEN_EVENT, type ClipRemoveTarget } from '@/lib/clip/remove-open';

/** The clip's first frame as a picture to paint on (a data URL), or null when it can't be read. */
function firstFrame(clipUrl: string): Promise<string | null> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    const done = (value: string | null) => {
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };
    video.addEventListener('error', () => done(null), { once: true });
    video.addEventListener(
      'loadeddata',
      () => {
        video.currentTime = Math.min(0.05, (video.duration || 1) / 10);
      },
      { once: true }
    );
    video.addEventListener(
      'seeked',
      () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext('2d')?.drawImage(video, 0, 0);
          done(canvas.toDataURL('image/png'));
        } catch {
          done(null);
        }
      },
      { once: true }
    );
    video.src = clipUrl;
  });
}

async function dataUrlBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/**
 * "Remove from clip" (Gallery ⋯ → Clip; clip/vace.ts): paint over what should go on the clip's
 * first frame, and WAN VACE fills it from the scene — the same area on every frame, so it suits
 * something that stays put. The new clip is kept in the Gallery as the clip's child, like the
 * other clip tools (a background job; the jobs tray follows it).
 */
export default function ClipRemoveHost() {
  const [target, setTarget] = useState<ClipRemoveTarget | null>(null);
  const [frame, setFrame] = useState<string | null | 'loading'>('loading');
  const [hasMask, setHasMask] = useState(false);
  const [words, setWords] = useState('');
  const [track, setTrack] = useState(true);
  const brushRef = useRef<FixAreaBrushHandle>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<ClipRemoveTarget>).detail;
      if (!detail?.clipUrl) return;
      setTarget(detail);
      setFrame('loading');
      setHasMask(false);
      setWords('');
      setTrack(true);
      void firstFrame(detail.clipUrl).then(setFrame);
    };
    window.addEventListener(CLIP_REMOVE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CLIP_REMOVE_OPEN_EVENT, onOpen);
  }, []);

  if (!target) return null;
  const close = () => setTarget(null);

  const remove = async () => {
    const exported = brushRef.current?.exportMask();
    if (!exported) return;
    if (runningTrackedClipJob()) {
      pushAppToast({
        text: 'Another clip job is running — one at a time. It is in the jobs tray.',
        tone: 'warning',
      });
      return;
    }
    const { clipUrl, entry } = target;
    const form = new FormData();
    form.append('mask', await dataUrlBlob(exported.dataUrl), 'mask.png');
    form.append('clipUrl', clipUrl);
    form.append('entryId', entry.id);
    const said = words.trim();
    if (said) form.append('words', said);
    form.append('track', track ? 'true' : 'false');
    close();
    pushAppToast({
      text: `${said ? 'Replacing it' : 'Removing it from the clip'}… It takes several minutes — follow it in the jobs tray.`,
      tone: 'info',
      ttlMs: 8000,
    });
    const about = entry.prompt ? ` · ${entry.prompt.slice(0, 120)}` : '';
    const name = said ? `Replace with ${said.slice(0, 40)}` : 'Remove from clip';
    try {
      await runClipJob({
        tool: 'remove',
        body: form,
        keep: {
          kind: 'remove',
          prompt: `${name}${about}`,
          tool: entry.tool || 'gallery',
          sourceEntryId: entry.id,
        },
        owner: { feature: 'gallery', ref: entry.id },
        label: `${name}${about.slice(0, 63)}`,
      });
    } catch (error) {
      if (error instanceof ClipJobBusyError) pushAppToast({ text: error.message, tone: 'warning' });
    }
  };

  return (
    <Dialog
      open
      onClose={close}
      labelledBy="clip-remove-title"
      size="3xl"
      testId="clip-remove-dialog"
      overlayClassName="p-2 sm:p-4"
      backdropClassName="bg-black/80"
      panelClassName="max-h-[96vh] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-primary)] shadow-xl"
      bodyClassName="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="clip-remove-title" className="type-title text-base font-semibold">
            Remove or replace
          </h2>
          <p className="type-caption text-[var(--text-muted)]">
            Paint over it on the first frame. It is followed as it moves and filled from the scene —
            or with what you name below.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={close} data-testid="clip-remove-close">
          Close
        </Button>
      </div>
      {frame === 'loading' ? (
        <p className="type-caption text-[var(--text-muted)]" role="status">
          Reading the clip&apos;s first frame…
        </p>
      ) : frame ? (
        <FixAreaBrushCanvas ref={brushRef} imageUrl={frame} onMaskChange={setHasMask} />
      ) : (
        <p className="type-caption text-[var(--tint-warning-text)]" role="alert">
          This clip&apos;s picture couldn&apos;t be read here.
        </p>
      )}
      <input
        type="text"
        value={words}
        maxLength={200}
        placeholder="What goes there instead? Empty: nothing — the background behind it"
        aria-label="What goes there instead"
        className="ui-input"
        onChange={event => setWords(event.target.value)}
        data-testid="clip-remove-words"
      />
      <label className="type-caption flex items-center gap-2">
        <input
          type="checkbox"
          checked={track}
          onChange={event => setTrack(event.target.checked)}
          data-testid="clip-remove-track"
        />
        Follow it as it moves (off: the same area on every frame)
      </label>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!hasMask}
          onClick={() => void remove()}
          data-testid="clip-remove-go"
        >
          {words.trim() ? 'Replace it' : 'Remove it'}
        </Button>
      </div>
    </Dialog>
  );
}
