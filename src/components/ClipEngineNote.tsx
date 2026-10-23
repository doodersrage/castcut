'use client';

import { useState, useSyncExternalStore } from 'react';
import { EngineHealthNote } from '@/components/EngineHealth';
import { H3_LICENCE_NOTE } from '@/lib/engine/h3-renderer';
import { dayClipVideoModel, isLtx25Model, storyClipChoice } from '@/lib/video/ltx25-renderer';
import { resolvePreferredVideoModel } from '@/lib/queue/tool-model';
import {
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveToolSettings,
} from '@/lib/settings/cache';

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
 * because two-person adult clips stay on WAN there unless the player keeps LTX for them, and take
 * about three times as long. Clothed one-person clips run on LTX unless the player opts out.
 */
export default function ClipEngineNote({
  twoPersonAdultPossible,
  day = false,
  dayLabel = 'Day clips on',
  story = false,
}: {
  /** The day / story can hold two-person adult stills (their clips render on WAN). */
  twoPersonAdultPossible: boolean;
  /** Day: its clips are LTX-2.5 unless the player picks WAN here (Video `dayClips`). */
  day?: boolean;
  /** The day choice's label (Scene: its clips follow the same choice as Day's). */
  dayLabel?: string;
  /** Story: its clips follow Video → Model unless the player picks MiniMax-H3 (`storyClips`). */
  story?: boolean;
}) {
  const picked = useSyncExternalStore(subscribe, pickedVideoModel, () => '');
  const [dayClips, setDayClips] = useState<'ltx' | 'wan' | 'h3'>(() => {
    const saved = loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).dayClips;
    return saved === 'wan' || saved === 'h3' ? saved : 'ltx';
  });
  const [storyClips, setStoryClips] = useState<'ltx' | 'wan' | 'h3'>(() =>
    storyClipChoice(loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).storyClips)
  );
  const model =
    day && picked
      ? dayClipVideoModel(dayClips, picked)
      : story && picked
        ? dayClipVideoModel(storyClips, picked)
        : picked;
  const storyChoice = story ? (
    <label className="type-caption mt-2 flex flex-wrap items-center gap-2 text-[var(--text-muted)]">
      Story clips on
      <select
        className="ui-input !w-auto min-w-0 max-w-full !py-0.5"
        value={storyClips}
        data-testid="clip-engine-story"
        onChange={event => {
          const next = storyClipChoice(event.target.value);
          setStoryClips(next);
          saveToolSettings('video', {
            ...loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE),
            storyClips: next,
          });
        }}
      >
        <option value="ltx">LTX-2.5 (default)</option>
        <option value="wan">WAN</option>
        <option value="h3" title="Best motion, with sound — about 5× slower">
          MiniMax-H3 (best motion, slower)
        </option>
      </select>
      {storyClips === 'wan' ? (
        <span>— talking clips still use LTX-2.5 (only it makes sound)</span>
      ) : null}
      {storyClips === 'h3' ? (
        <span
          data-testid="clip-engine-story-h3-note"
          title="Lines are spoken with sound (no kept Cast voice); text-to-video stays on the Video model."
        >
          — about 2½ min a clip. {H3_LICENCE_NOTE}
        </span>
      ) : null}
    </label>
  ) : null;
  const dayChoice = day ? (
    <label className="type-caption mt-2 flex flex-wrap items-center gap-2 text-[var(--text-muted)]">
      {dayLabel}
      <select
        className="ui-input !w-auto min-w-0 max-w-full !py-0.5"
        value={dayClips}
        data-testid="clip-engine-day"
        onChange={event => {
          const value = event.target.value;
          const next = value === 'wan' || value === 'h3' ? value : 'ltx';
          setDayClips(next);
          saveToolSettings('video', {
            ...loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE),
            dayClips: next,
          });
        }}
      >
        <option value="ltx">LTX-2.5 (default)</option>
        <option value="wan">WAN</option>
        <option value="h3" title="Best motion, with sound — about 5× slower">
          MiniMax-H3 (best motion, slower)
        </option>
      </select>
      {dayClips === 'wan' ? (
        <span>— talking clips still use LTX-2.5 (only it makes sound)</span>
      ) : null}
      {dayClips === 'h3' ? (
        <span
          data-testid="clip-engine-h3-note"
          title="Lines are spoken with sound (no kept Cast voice). Two-person adult clips stay on H3 too — it kept the act together where WAN let it come apart, with gentler motion."
        >
          — about 2½ min a clip. {H3_LICENCE_NOTE}
        </span>
      ) : null}
    </label>
  ) : null;
  const [keepLtx, setKeepLtx] = useState(
    () => loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).ltxClothedSolo !== false
  );
  const [ltxDuo, setLtxDuo] = useState(
    () => loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).ltxAdultDuo === true
  );
  const [refine, setRefine] = useState(
    () => loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).ltxRefine === true
  );
  // Says so here, before Animate fails, when this ComfyUI can't run the clip engine.
  const health = (
    <EngineHealthNote model={model} hideReady className="mt-2" testId="clip-engine-health" />
  );
  if (!isLtx25Model(model)) {
    return (
      <>
        {dayChoice}
        {storyChoice}
        {health}
      </>
    );
  }
  return (
    <>
      {dayChoice}
      {storyChoice}
      {/* Only when clips split across engines — "Clips render on LTX-2.5" repeated the picker. */}
      {keepLtx && !(twoPersonAdultPossible && !ltxDuo) && dayChoice ? null : (
        <p className="type-caption mt-2 text-[var(--text-muted)]" data-testid="clip-engine-note">
          {keepLtx
            ? twoPersonAdultPossible && !ltxDuo
              ? 'Clips: LTX-2.5 (fast); two-person adult stills render on WAN, about 3× slower.'
              : 'Clips render on LTX-2.5 (fast).'
            : twoPersonAdultPossible && !ltxDuo
              ? 'Clips: clothed one-person and two-person adult stills render on WAN (about 3× slower); the rest on LTX-2.5.'
              : 'Clips: clothed one-person stills render on WAN (about 3× slower); the rest on LTX-2.5.'}
        </p>
      )}
      <label
        className="type-caption mt-1 flex items-center gap-2 text-[var(--text-muted)]"
        title="Uses LTX-2.5 instead of WAN — faster, and it kept her face closer"
      >
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
        Faster clips for clothed one-person shots
      </label>
      {twoPersonAdultPossible ? (
        <label
          className="type-caption mt-1 flex items-center gap-2 text-[var(--text-muted)]"
          title="Uses LTX-2.5 instead of WAN, tuned for pace; Add sound gives them sound"
        >
          <input
            type="checkbox"
            checked={ltxDuo}
            data-testid="clip-engine-ltx-adult-duo"
            onChange={event => {
              const next = event.target.checked;
              setLtxDuo(next);
              saveToolSettings('video', {
                ...loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE),
                ltxAdultDuo: next,
              });
            }}
          />
          Faster clips for two-person adult shots
        </label>
      ) : null}
      <label
        className="type-caption mt-1 flex items-center gap-2 text-[var(--text-muted)]"
        title="One more pass: crisper, about 2× slower, and can shift the face a little. Needs the Refine-Details LoRA."
      >
        <input
          type="checkbox"
          checked={refine}
          data-testid="clip-engine-ltx-refine"
          onChange={event => {
            const next = event.target.checked;
            setRefine(next);
            saveToolSettings('video', {
              ...loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE),
              ltxRefine: next,
            });
          }}
        />
        Refine detail (slower)
      </label>
      {health}
    </>
  );
}
