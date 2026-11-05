'use client';

import { useEffect, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { pushAppToast } from '@/lib/app/toast';
import { ClipJobBusyError } from '@/lib/clip/clip-jobs';
import { runClipJob, runningTrackedClipJob } from '@/lib/clip/clip-jobs-tracker';
import {
  CLIP_RESTYLE_OPEN_EVENT,
  type ClipRestyleChoice,
  type ClipRestyleTarget,
} from '@/lib/clip/restyle-open';
import { CLIP_LOOK_MAX, CLIP_STYLES, cleanClipLook, type ClipStyleId } from '@/lib/clip/vace';
import { sharedLlmRequestBody } from '@/lib/llm/request-options';
import { loadSettingsCache } from '@/lib/settings/cache';

const STYLE_IDS = Object.keys(CLIP_STYLES) as ClipStyleId[];

/** The Gallery's own run: a background job, the new clip kept as the entry's child. */
async function restyleInGallery(target: ClipRestyleTarget, choice: ClipRestyleChoice) {
  const entry = target.entry;
  if (!entry) return;
  if (runningTrackedClipJob()) {
    pushAppToast({
      text: 'Another clip job is running — one at a time. It is in the jobs tray.',
      tone: 'warning',
    });
    return;
  }
  const name = 'style' in choice ? CLIP_STYLES[choice.style].label : choice.look;
  const label = `Restyle · ${name}`;
  pushAppToast({
    text: 'Restyling the clip… It takes several minutes — follow it in the jobs tray.',
    tone: 'info',
    ttlMs: 8000,
  });
  try {
    await runClipJob({
      tool: 'restyle',
      body: {
        clipUrl: target.clipUrl,
        entryId: entry.id,
        ...choice,
        ...sharedLlmRequestBody(loadSettingsCache().shared),
      },
      keep: {
        kind: 'restyle',
        prompt: `${label}${entry.prompt ? ` · ${entry.prompt.slice(0, 120)}` : ''}`,
        tool: entry.tool || 'gallery',
        sourceEntryId: entry.id,
      },
      owner: { feature: 'gallery', ref: entry.id },
      label: `${label}${entry.prompt ? ` · ${entry.prompt.slice(0, 60)}` : ''}`,
    });
  } catch (error) {
    if (error instanceof ClipJobBusyError) pushAppToast({ text: error.message, tone: 'warning' });
  }
}

/**
 * Restyle's look picker (clip/vace.ts): a preset — anime, film noir, claymation, watercolour,
 * vintage film, 3D animated — or your own words ("1980s VHS", "oil painting"). Opened from the
 * Gallery ⋯ → Clip and from Day's and Story's card menus (restyle-open.ts).
 */
export default function ClipRestyleHost() {
  const [target, setTarget] = useState<ClipRestyleTarget | null>(null);
  const [style, setStyle] = useState<ClipStyleId | 'own'>('anime');
  const [look, setLook] = useState('');

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<ClipRestyleTarget>).detail;
      if (!detail?.clipUrl) return;
      setTarget(detail);
    };
    window.addEventListener(CLIP_RESTYLE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CLIP_RESTYLE_OPEN_EVENT, onOpen);
  }, []);

  if (!target) return null;
  const close = () => setTarget(null);
  const own = cleanClipLook(look);
  const ready = style !== 'own' || own.length > 0;
  const go = () => {
    if (!ready) return;
    const choice: ClipRestyleChoice = style === 'own' ? { look: own } : { style };
    close();
    if (target.run) target.run(choice);
    else void restyleInGallery(target, choice);
  };

  return (
    <Dialog
      open
      onClose={close}
      labelledBy="clip-restyle-title"
      size="lg"
      testId="clip-restyle-dialog"
      bodyClassName="flex flex-col gap-3 p-4"
    >
      <div>
        <h2 id="clip-restyle-title" className="type-title text-base font-semibold">
          Restyle the clip
        </h2>
        <p className="type-caption text-[var(--text-muted)]">
          Repainted in a look — its scene, framing and motion kept. Several minutes; the original
          stays in the Gallery.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Look">
        {STYLE_IDS.map(id => (
          <Button
            key={id}
            size="sm"
            variant={style === id ? 'secondary' : 'ghost'}
            role="radio"
            aria-checked={style === id}
            onClick={() => setStyle(id)}
            data-testid={`clip-restyle-${id}`}
          >
            {CLIP_STYLES[id].label}
          </Button>
        ))}
        <Button
          size="sm"
          variant={style === 'own' ? 'secondary' : 'ghost'}
          role="radio"
          aria-checked={style === 'own'}
          onClick={() => setStyle('own')}
          data-testid="clip-restyle-own"
        >
          Your own look
        </Button>
      </div>
      {style === 'own' ? (
        <input
          type="text"
          value={look}
          maxLength={CLIP_LOOK_MAX}
          placeholder="1980s VHS · oil painting · pastel storybook"
          aria-label="Your own look"
          className="ui-input"
          autoFocus
          onChange={event => setLook(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') go();
          }}
          data-testid="clip-restyle-look"
        />
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!ready} onClick={go} data-testid="clip-restyle-go">
          Restyle
        </Button>
      </div>
    </Dialog>
  );
}
