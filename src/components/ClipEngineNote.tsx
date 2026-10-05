'use client';

import { useState, useSyncExternalStore } from 'react';
import { EngineHealthNote } from '@/components/EngineHealth';
import { isLtx25Model } from '@/lib/ltx25-renderer';
import { resolvePreferredVideoModel } from '@/lib/queue-tool-model';
import {
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveToolSettings,
} from '@/lib/settings-cache';

const subscribe = () => () => {};

/** The clip engine picked in Video → Model (what Day / Story Animate use). */
function pickedVideoModel(): string {
  return resolvePreferredVideoModel({
    toolModel: loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).model,
    sharedModel: loadSettingsCache().shared.model,
  });
}

/**
 * One line under Animate saying which engine the clips render on — only when LTX-2.5 is picked,
 * because two-person adult clips quietly stay on WAN there (LTX-2.5 drifts off the act) and take
 * about three times as long as the solo ones.
 */
export default function ClipEngineNote({
  twoPersonAdultPossible,
}: {
  /** The day / story can hold two-person adult stills (their clips render on WAN). */
  twoPersonAdultPossible: boolean;
}) {
  const model = useSyncExternalStore(subscribe, pickedVideoModel, () => '');
  const [keepLtx, setKeepLtx] = useState(
    () => loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).ltxClothedSolo === true
  );
  // Says so here, before Animate fails, when this ComfyUI can't run the clip engine.
  const health = (
    <EngineHealthNote model={model} hideReady className="mt-2" testId="clip-engine-health" />
  );
  if (!isLtx25Model(model)) return health;
  return (
    <>
      <p className="type-caption mt-2 text-[var(--text-muted)]" data-testid="clip-engine-note">
        {keepLtx
          ? twoPersonAdultPossible
            ? 'Clips: LTX-2.5 (fast); two-person adult stills render on WAN, about 3× slower.'
            : 'Clips render on LTX-2.5 (fast).'
          : twoPersonAdultPossible
            ? 'Clips: clothed one-person and two-person adult stills render on WAN (holds the face, about 3× slower); the rest on LTX-2.5.'
            : 'Clips: clothed one-person stills render on WAN (holds the face, about 3× slower); the rest on LTX-2.5.'}
      </p>
      <label className="type-caption mt-1 flex items-center gap-2 text-[var(--text-muted)]">
        <input
          type="checkbox"
          checked={keepLtx}
          data-testid="clip-engine-ltx-clothed-solo"
          onChange={event => {
            const next = event.target.checked;
            setKeepLtx(next);
            saveToolSettings('video', {
              ...loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE),
              ltxClothedSolo: next,
            });
          }}
        />
        Use LTX-2.5 for clothed one-person clips too (faster; the face drifts)
      </label>
      {health}
    </>
  );
}
