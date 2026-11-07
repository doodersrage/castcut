'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError, FieldLabel, TextInput } from '@/components/ui/Field';
import SideSheet from '@/components/ui/SideSheet';
import {
  EPISODE_MINUTES_MAX,
  EPISODE_MINUTES_MIN,
  episodeFountain,
  episodeSceneCount,
  episodeSceneTail,
  EPISODE_SCENES_MAX,
  EPISODE_SCENES_MIN,
  EPISODE_SECONDS_PER_SCENE,
  type EpisodeCastMember,
  type EpisodeOutline,
  type EpisodeWriteSeed,
} from '@/lib/day/episode-writer';
import { DEFAULT_EPISODE_AUTOPILOT, type EpisodeAutopilot } from '@/lib/day/episode-autopilot';
import { useNsfwGeneratorEnabled } from '@/hooks/useNsfwGeneratorEnabled';

const AREA =
  'w-full rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2 text-sm';

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/script-episode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'The LLM could not write that.');
  return data;
}

/**
 * Write an episode (Part 19 G3, episode-writer.ts): a premise and a length become an outline
 * you can change — each scene's heading and what happens, any taken out — then the screenplay,
 * written scene by scene by your LLM (Stop keeps what's written; Carry on goes on from there).
 * The finished script goes into the Script box, read like any other before you keep it.
 */
export default function EpisodeWriterSheet({
  open,
  lead,
  cast,
  llmBody,
  onClose,
  onDone,
  canAutopilot = false,
  seed,
}: {
  open: boolean;
  /** A short from Day: its idea, tone and moments (a count of scenes, not minutes). */
  seed?: EpisodeWriteSeed | null;
  /** Offer "Make the whole episode for me" (the page can prepare and start a run). */
  canAutopilot?: boolean;
  lead: string;
  cast: readonly EpisodeCastMember[];
  llmBody: Record<string, unknown>;
  onClose: () => void;
  /** The screenplay, as Fountain — and the autopilot's settings when it is to make the episode. */
  onDone: (fountain: string, autopilot: EpisodeAutopilot | null) => void;
}) {
  const [premise, setPremise] = useState(seed?.premise ?? '');
  const [minutes, setMinutes] = useState(30);
  // A short is counted in scenes (Day's moments); an episode in minutes.
  const [scenes, setScenes] = useState<number | null>(seed?.scenes ?? null);
  const [tone, setTone] = useState(seed?.tone ?? '');
  const [outline, setOutline] = useState<EpisodeOutline | null>(null);
  // Written scenes, by outline index.
  const [written, setWritten] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);
  const [autopilotOn, setAutopilotOn] = useState(false);
  // Adult writing: offered only where the server allows adult content; on for an Intimate short.
  const adultAllowed = useNsfwGeneratorEnabled();
  const [adultAsked, setAdultAsked] = useState<boolean>(() =>
    ['intimate', 'raunchy'].includes(String(seed?.mood ?? '').toLowerCase())
  );
  const adult = adultAllowed && adultAsked;
  const [pilot, setPilot] = useState<EpisodeAutopilot>(DEFAULT_EPISODE_AUTOPILOT);

  const base = {
    lead,
    cast,
    tone: tone.trim() || undefined,
    ...llmBody,
    ...(adult ? { adult: true } : {}),
  };

  const writeOutline = async () => {
    setBusy('Writing the outline…');
    setError(null);
    try {
      const data = await post<{ outline: EpisodeOutline }>({
        ...base,
        step: 'outline',
        premise,
        minutes,
        ...(scenes ? { scenes } : {}),
      });
      setOutline(data.outline);
      setWritten([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write the outline.');
    } finally {
      setBusy(null);
    }
  };

  const writeScenes = async () => {
    if (!outline) return;
    stopRef.current = false;
    setError(null);
    const done = [...written];
    for (let index = done.length; index < outline.scenes.length; index += 1) {
      if (stopRef.current) break;
      setBusy(`Writing scene ${index + 1} of ${outline.scenes.length}…`);
      let text: string | null = null;
      // One try again: a small model sometimes writes nothing usable.
      for (let attempt = 0; attempt < 2 && !text; attempt += 1) {
        try {
          text = (
            await post<{ text: string }>({
              ...base,
              step: 'scene',
              outline,
              index,
              before: index > 0 ? episodeSceneTail(done[index - 1] ?? '') : '',
            })
          ).text;
        } catch (err) {
          if (attempt === 1) {
            setError(
              `Scene ${index + 1}: ${err instanceof Error ? err.message : 'not written'} — Carry on tries it again.`
            );
          }
        }
      }
      if (!text) break;
      done.push(text);
      setWritten([...done]);
    }
    setBusy(null);
  };

  const editScene = (index: number, patch: Partial<EpisodeOutline['scenes'][number]>) => {
    if (!outline) return;
    setOutline({
      ...outline,
      scenes: outline.scenes.map((scene, i) => (i === index ? { ...scene, ...patch } : scene)),
    });
    // A changed scene, and those after it, are written again.
    setWritten(list => list.slice(0, index));
  };

  const complete = Boolean(outline && written.length === outline.scenes.length);

  return (
    <SideSheet
      open={open}
      onClose={() => {
        stopRef.current = true;
        onClose();
      }}
      title={seed ? 'Write a short' : 'Write an episode'}
      description={`For ${lead}: an outline from your premise, then the screenplay, scene by scene, by your LLM.`}
      size="lg"
      testId="episode-writer"
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <FieldLabel htmlFor="episode-premise">What it&apos;s about</FieldLabel>
          <textarea
            id="episode-premise"
            className={`${AREA} h-24`}
            maxLength={2000}
            placeholder="A letter from her estranged sister brings Mara back to the seaside town she left — and to the café they ran together."
            value={premise}
            disabled={busy !== null}
            data-testid="episode-premise"
            onChange={event => setPremise(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {scenes ? (
              <label className="flex items-center gap-1">
                <input
                  type="number"
                  min={EPISODE_SCENES_MIN}
                  max={EPISODE_SCENES_MAX}
                  aria-label="This many scenes"
                  className="w-16 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5"
                  value={scenes}
                  disabled={busy !== null}
                  data-testid="episode-scenes"
                  onChange={event => {
                    const value = Math.round(Number(event.target.value));
                    if (value > 0) setScenes(Math.min(EPISODE_SCENES_MAX, value));
                  }}
                />
                scenes · about {Math.max(1, Math.round((scenes * EPISODE_SECONDS_PER_SCENE) / 60))}{' '}
                min
              </label>
            ) : (
              <label className="flex items-center gap-1">
                About
                <input
                  type="number"
                  min={EPISODE_MINUTES_MIN}
                  max={EPISODE_MINUTES_MAX}
                  aria-label="About this many minutes"
                  className="w-16 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5"
                  value={minutes}
                  disabled={busy !== null}
                  data-testid="episode-minutes"
                  onChange={event => {
                    const value = Math.round(Number(event.target.value));
                    if (value > 0) setMinutes(Math.min(EPISODE_MINUTES_MAX, value));
                  }}
                />
                minutes · {episodeSceneCount(minutes)} scenes
              </label>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              data-testid="episode-length-unit"
              onClick={() =>
                setScenes(
                  scenes
                    ? null
                    : Math.max(
                        EPISODE_SCENES_MIN,
                        Math.min(EPISODE_SCENES_MAX, episodeSceneCount(minutes))
                      )
                )
              }
            >
              {scenes ? 'In minutes' : 'In scenes'}
            </Button>
            {adultAllowed ? (
              <label
                className="flex items-center gap-1"
                title="Explicit scenes between consenting adults — every character over 21 (the server allows adult content)"
              >
                <input
                  type="checkbox"
                  checked={adultAsked}
                  disabled={busy !== null}
                  data-testid="episode-adult"
                  onChange={event => setAdultAsked(event.target.checked)}
                />
                Adult
              </label>
            ) : null}
            <label className="flex min-w-48 flex-1 items-center gap-1">
              Tone
              <TextInput
                value={tone}
                maxLength={60}
                placeholder="warm comedy-drama"
                disabled={busy !== null}
                data-testid="episode-tone"
                onChange={event => setTone(event.target.value)}
              />
            </label>
          </div>
          <Button
            size="sm"
            variant={outline ? 'ghost' : 'primary'}
            disabled={busy !== null || !premise.trim()}
            data-testid="episode-write-outline"
            onClick={() => void writeOutline()}
          >
            {outline ? 'Write a new outline' : 'Write the outline'}
          </Button>
        </div>

        {outline ? (
          <section className="space-y-2" data-testid="episode-outline">
            <p className="type-body font-medium">{outline.title}</p>
            {outline.logline ? (
              <p className="type-caption text-[var(--text-secondary)]">{outline.logline}</p>
            ) : null}
            <ol className="space-y-2">
              {outline.scenes.map((scene, index) => (
                <li
                  key={index}
                  className="space-y-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] p-2"
                  data-testid={`episode-scene-${index}`}
                  data-written={index < written.length}
                >
                  <div className="flex items-center gap-2">
                    <span className="type-caption w-6 tabular-nums text-[var(--text-muted)]">
                      {index + 1}
                    </span>
                    <TextInput
                      aria-label={`Scene ${index + 1} heading`}
                      value={scene.heading}
                      disabled={busy !== null}
                      onChange={event => editScene(index, { heading: event.target.value })}
                    />
                    <span className="type-caption shrink-0 text-[var(--text-muted)]">
                      {index < written.length ? 'written' : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null || outline.scenes.length <= 2}
                      aria-label={`Take out scene ${index + 1}`}
                      onClick={() => {
                        setOutline({
                          ...outline,
                          scenes: outline.scenes.filter((_, i) => i !== index),
                        });
                        setWritten(list => list.slice(0, index));
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                  <textarea
                    aria-label={`Scene ${index + 1}: what happens`}
                    className={`${AREA} h-14`}
                    value={scene.summary}
                    maxLength={600}
                    disabled={busy !== null}
                    onChange={event => editScene(index, { summary: event.target.value })}
                  />
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              {busy && busy.startsWith('Writing scene') ? (
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="episode-stop"
                  onClick={() => {
                    stopRef.current = true;
                  }}
                >
                  Stop after this scene
                </Button>
              ) : complete ? null : (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy !== null}
                  data-testid="episode-write-scenes"
                  title="Each scene is one call to your LLM — a half hour takes a while on a local model"
                  onClick={() => void writeScenes()}
                >
                  {written.length ? 'Carry on writing' : 'Write the screenplay'}
                </Button>
              )}
              <Button
                size="sm"
                variant={complete ? 'primary' : 'ghost'}
                disabled={busy !== null || !written.length}
                data-testid="episode-use"
                title={
                  autopilotOn
                    ? 'Keep it, cast it, plan the shots, render every one and keep the best — then the cut'
                    : 'Into the Script box: see how it reads, then Keep this script'
                }
                onClick={() =>
                  onDone(episodeFountain(outline, written), autopilotOn ? pilot : null)
                }
              >
                {autopilotOn
                  ? 'Make the episode'
                  : complete
                    ? 'Put it in the script box'
                    : `Use the ${written.length} written so far`}
              </Button>
            </div>
            {canAutopilot && written.length ? (
              <fieldset
                className="space-y-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] p-2 text-sm"
                data-testid="episode-autopilot"
              >
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={autopilotOn}
                    data-testid="episode-autopilot-on"
                    onChange={event => setAutopilotOn(event.target.checked)}
                  />
                  Make the whole episode for me
                </label>
                <p className="type-caption text-[var(--text-muted)]">
                  Keeps the script, confirms Who&apos;s who, plans every scene&apos;s shots, makes
                  them Scenes and renders each — keeping the best take by its checks — then cuts the
                  film. Hours for a half hour: keep this page open (overnight is fine).
                </p>
                {autopilotOn ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={pilot.makeCast}
                        data-testid="episode-autopilot-cast"
                        onChange={event => setPilot({ ...pilot, makeCast: event.target.checked })}
                      />
                      Make the recurring parts Cast
                    </label>
                    <label className="flex items-center gap-1">
                      redo a failing take
                      <select
                        aria-label="Times to render a failing take again"
                        className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5"
                        value={pilot.redo}
                        data-testid="episode-autopilot-redo"
                        onChange={event => setPilot({ ...pilot, redo: Number(event.target.value) })}
                      >
                        {[0, 1, 2, 3].map(n => (
                          <option key={n} value={n}>
                            {n}×
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-1">
                      animate
                      <select
                        aria-label="Which kept takes to animate"
                        className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5"
                        value={pilot.animate}
                        data-testid="episode-autopilot-animate"
                        onChange={event =>
                          setPilot({
                            ...pilot,
                            animate: event.target.value as EpisodeAutopilot['animate'],
                          })
                        }
                      >
                        <option value="none">nothing (stills)</option>
                        <option value="lines">the shots with a line</option>
                        <option value="all">every shot</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={pilot.cutWhenDone}
                        data-testid="episode-autopilot-cut"
                        onChange={event =>
                          setPilot({ ...pilot, cutWhenDone: event.target.checked })
                        }
                      />
                      Cut the film when it&apos;s done
                    </label>
                  </div>
                ) : null}
              </fieldset>
            ) : null}
          </section>
        ) : null}
        {busy ? (
          <p
            className="type-caption text-[var(--text-muted)]"
            role="status"
            data-testid="episode-busy"
          >
            {busy}
          </p>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </SideSheet>
  );
}
