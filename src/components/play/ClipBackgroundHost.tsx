'use client';

import { useEffect, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { pushAppToast } from '@/lib/app/toast';
import { ClipJobBusyError } from '@/lib/clip/clip-jobs';
import { runClipJob, runningTrackedClipJob } from '@/lib/clip/clip-jobs-tracker';
import { CLIP_BACKGROUND_OPEN_EVENT, type ClipBackgroundTarget } from '@/lib/clip/background-open';
import { CLIP_LOOK_MAX, cleanClipLook } from '@/lib/clip/vace';

/** A few places to start from; your own words go in the box. */
const PLACES = [
  'a sunny beach with soft waves behind',
  'a rainy city street at night, neon signs reflected on the wet pavement',
  'a cosy café with warm lamps',
  'a snowy forest in soft daylight',
  'a rooftop at sunset over the city',
] as const;

/**
 * Change the background (clip/vace.ts): the people in the clip kept exactly, the place behind
 * them redrawn as what you say. Opened from the Gallery ⋯ → Clip (background-open.ts).
 */
export default function ClipBackgroundHost() {
  const [target, setTarget] = useState<ClipBackgroundTarget | null>(null);
  const [words, setWords] = useState('');

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<ClipBackgroundTarget>).detail;
      if (!detail?.clipUrl || !detail.entry) return;
      setWords('');
      setTarget(detail);
    };
    window.addEventListener(CLIP_BACKGROUND_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CLIP_BACKGROUND_OPEN_EVENT, onOpen);
  }, []);

  if (!target) return null;
  const close = () => setTarget(null);
  const place = cleanClipLook(words);
  const go = async () => {
    if (!place) return;
    const { entry, clipUrl } = target;
    close();
    if (runningTrackedClipJob()) {
      pushAppToast({
        text: 'Another clip job is running — one at a time. It is in the jobs tray.',
        tone: 'warning',
      });
      return;
    }
    pushAppToast({
      text: 'Changing the background… It takes several minutes — follow it in the jobs tray.',
      tone: 'info',
      ttlMs: 8000,
    });
    const label = `New background · ${place}`;
    try {
      await runClipJob({
        tool: 'background',
        body: { clipUrl, entryId: entry.id, words: place },
        keep: {
          kind: 'background',
          prompt: `${label}${entry.prompt ? ` · ${entry.prompt.slice(0, 120)}` : ''}`,
          tool: entry.tool || 'gallery',
          sourceEntryId: entry.id,
        },
        owner: { feature: 'gallery', ref: entry.id },
        label: label.slice(0, 120),
      });
    } catch (error) {
      if (error instanceof ClipJobBusyError) pushAppToast({ text: error.message, tone: 'warning' });
    }
  };

  return (
    <Dialog
      open
      onClose={close}
      labelledBy="clip-background-title"
      size="lg"
      testId="clip-background-dialog"
      bodyClassName="flex flex-col gap-3 p-4"
    >
      <div>
        <h2 id="clip-background-title" className="type-title text-base font-semibold">
          Change the background
        </h2>
        <p className="type-caption text-[var(--text-muted)]">
          The people stay exactly as they are — faces, clothes, movement; the place behind them is
          redrawn as what you say. Several minutes; the original stays in the Gallery.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {PLACES.map((entry, index) => (
          <Button
            key={entry}
            size="sm"
            variant={place === entry ? 'secondary' : 'ghost'}
            onClick={() => setWords(entry)}
            data-testid={`clip-background-place-${index}`}
          >
            {entry.split(',')[0]}
          </Button>
        ))}
      </div>
      <input
        type="text"
        value={words}
        maxLength={CLIP_LOOK_MAX}
        placeholder="A sunny beach · a rainy street at night · a library with tall shelves"
        aria-label="The new background"
        className="ui-input"
        autoFocus
        onChange={event => setWords(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') void go();
        }}
        data-testid="clip-background-words"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!place}
          onClick={() => void go()}
          data-testid="clip-background-go"
        >
          Change it
        </Button>
      </div>
    </Dialog>
  );
}
