'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { FieldError, TextInput } from '@/components/ui/Field';
import { SegmentedControl } from '@/components/ui/ToolPageShell';
import { suggestLineForActiveCast } from '@/lib/audio/spoken-line-context';
import type { SpokenLineHeat } from '@/lib/audio/spoken-line';
import { requestClipBeats } from '@/lib/clip/extend';
import { sharedLlmRequestBody } from '@/lib/llm/request-options';
import { loadSettingsCache } from '@/lib/settings/cache';
import {
  DAY_CLIP_EXTRA_SECONDS,
  DAY_H3_PART_SECONDS,
  dayH3TotalWith,
  DAY_TALK_TOTAL_SECONDS,
  dayH3ExtraParts,
  dayTalkExtraParts,
  dayTalkTotalOut,
  normalizeDayClipExtraSeconds,
  normalizeDayTalkTotalSeconds,
  type DayAnimateChoice,
  type DayClipExtraSeconds,
  type DayTalkTotalSeconds,
} from '@/lib/day/clip-length';
import type { DaySlot } from '@/lib/day/planner';
import { normalizeSpokenLine, SPOKEN_LINE_MAX_CHARS } from '@/lib/video/ltx25-renderer';

export type DayClipPreview = {
  engineLabel: string;
  talking: boolean;
  /** A longer clip comes out silent on this engine (MiniMax-H3 with no spoken line). */
  silentWhenLong?: boolean;
  prompt: string;
  defaultDirection: string;
  /** Clip length in seconds for each DAY_CLIP_EXTRA_SECONDS choice, on this engine. */
  lengthSeconds: number[];
  /**
   * A one-person talking clip on LTX-2.5: Length is the total dialogue (the first clip, then
   * parts that each say a line). The scene etc. are for writing those lines.
   */
  talkLength?: {
    firstSec: number;
    lead: 'woman' | 'man';
    scene: string;
    setting?: string;
    when?: string;
    heat?: SpokenLineHeat;
    castId?: string;
  };
  /**
   * MiniMax-H3 (not pinned to a last frame): Length is the total — the first clip at H3's own
   * ~5 s, then H3 parts that carry it on (past ~5 s H3 cuts to a new shot).
   */
  chainLength?: { firstSec: number };
};

/**
 * Animate, with a say in it: the engine the clip runs on and its direction — what happens in
 * the clip, the slot's beat by default — editable. Whatever is typed is built into the prompt the
 * same way the default is (day-clip-direction.ts), so it is formatted for the engine; "What gets
 * sent" shows the result. Talking slots speak their line instead. Length adds seconds to the
 * clip's default (remembered for the next Animate); on a one-person LTX talking clip it is the
 * total dialogue, and each part past the first clip says a line of its own.
 */
export default function DayAnimateSheet({
  slot,
  preview,
  initialExtraSeconds,
  initialTalkTotalSeconds,
  busy,
  onAnimate,
  onClose,
}: {
  slot: DaySlot | null;
  preview: (slot: DaySlot, direction?: string, extraSeconds?: number) => DayClipPreview;
  initialExtraSeconds?: number;
  initialTalkTotalSeconds?: number;
  busy?: boolean;
  onAnimate: (slot: DaySlot, choice: DayAnimateChoice) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const initial = slot ? preview(slot) : null;
  const [direction, setDirection] = useState(initial?.defaultDirection ?? '');
  const [extraSeconds, setExtraSeconds] = useState<DayClipExtraSeconds>(() =>
    normalizeDayClipExtraSeconds(initialExtraSeconds)
  );
  const [talkTotal, setTalkTotal] = useState<DayTalkTotalSeconds>(() =>
    normalizeDayTalkTotalSeconds(initialTalkTotalSeconds)
  );
  const [lines, setLines] = useState<string[]>([]);
  // MiniMax-H3 parts (M11 T2): what happens in each, and how long each runs (0 = H3's own).
  const [partBeats, setPartBeats] = useState<string[]>([]);
  const [partSeconds, setPartSeconds] = useState<number[]>([]);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  if (!slot || !initial) return null;
  const edited = direction.trim() && direction.trim() !== initial.defaultDirection.trim();
  const talk = initial.talkLength;
  const chain = talk ? undefined : initial.chainLength;
  const current = preview(slot, edited ? direction : undefined, talk || chain ? 0 : extraSeconds);
  const parts = talk
    ? dayTalkExtraParts(talk.firstSec, talkTotal)
    : chain
      ? dayH3ExtraParts(chain.firstSec, talkTotal)
      : 0;
  const pronoun = talk?.lead === 'man' ? 'he' : 'she';

  // Drafts the empty lines one after another, each following the slot's line and those before it.
  const writeRest = async () => {
    if (!talk) return;
    setWriting(true);
    setWriteError(null);
    const next = Array.from({ length: parts }, (_, index) => lines[index] ?? '');
    try {
      for (let index = 0; index < parts; index += 1) {
        if (next[index]!.trim()) continue;
        const said = [slot.line ?? '', ...next.slice(0, index)]
          .map(line => normalizeSpokenLine(line))
          .filter(Boolean);
        next[index] = await suggestLineForActiveCast(
          {
            scene: talk.scene,
            setting: talk.setting,
            when: talk.when,
            heat: talk.heat,
            continues: said,
          },
          { castId: talk.castId }
        );
        setLines([...next]);
      }
    } catch (error) {
      const written = next.some(line => line.trim());
      setWriteError(
        `${error instanceof Error ? error.message : 'Could not write the lines.'}${written ? ' The lines written so far are kept — press Write the rest again.' : ''}`
      );
    } finally {
      setWriting(false);
    }
  };

  // Beats for the H3 parts, from the slot's beat and the direction (the empty ones only).
  const writeBeats = async () => {
    setWriting(true);
    setWriteError(null);
    try {
      const written = await requestClipBeats(
        {
          scene: [slot.sceneHints?.trim() || slot.label, edited ? direction.trim() : '']
            .filter(Boolean)
            .join(' Then: '),
          setting: slot.location,
          direction: edited ? direction : undefined,
          count: parts,
        },
        sharedLlmRequestBody(loadSettingsCache().shared)
      );
      setPartBeats(list =>
        Array.from({ length: parts }, (_, index) => list[index]?.trim() || written[index] || '')
      );
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Could not write the beats.');
    } finally {
      setWriting(false);
    }
  };

  const submit = () =>
    onAnimate(
      slot,
      talk
        ? {
            extraSeconds,
            talkTotalSeconds: talkTotal,
            lines: Array.from({ length: parts }, (_, index) => lines[index] ?? ''),
          }
        : chain
          ? {
              direction: edited && !current.talking ? direction : undefined,
              extraSeconds: 0,
              talkTotalSeconds: talkTotal,
              lines: Array.from({ length: parts }, () => ''),
              // Each part's own beat; one left empty is written from the scene when the part starts
              // (a bare "carry on" pushed the camera in part after part, M11).
              beats: Array.from({ length: parts }, (_, index) => partBeats[index]?.trim() ?? ''),
              partSeconds: Array.from({ length: parts }, (_, index) => partSeconds[index] ?? 0),
            }
          : {
              direction: edited && !current.talking ? direction : undefined,
              extraSeconds,
            }
    );

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy={titleId}
      testId="day-animate-sheet"
      size="lg"
      align="sheet"
      bodyClassName="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5"
    >
      <div>
        <h2 id={titleId} className="type-heading">
          Animate {slot.label}
        </h2>
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-animate-engine">
          Runs on {current.engineLabel}
          {current.talking ? ' · a talking clip' : ''}
        </p>
      </div>
      {current.talking ? (
        <p className="type-caption text-[var(--text-secondary)]" data-testid="day-animate-talking">
          This slot has a line, so the clip is her saying it: “{slot.line?.trim()}”. The direction
          doesn&apos;t apply to talking clips — clear the line for a motion clip.
        </p>
      ) : (
        <label className="block space-y-1">
          <span className="type-caption text-[var(--text-muted)]">What happens in the clip</span>
          <textarea
            rows={3}
            maxLength={300}
            autoFocus
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 type-body text-[var(--text-primary)]"
            value={direction}
            onChange={event => setDirection(event.target.value)}
            data-testid="day-animate-direction"
          />
          <span className="flex items-center justify-between type-caption text-[var(--text-muted)]">
            <span>
              {edited
                ? 'Your direction — formatted for the engine when you Animate.'
                : 'The slot’s beat. Write what should happen instead, in plain words.'}
            </span>
            {edited ? (
              <Button
                variant="underline"
                type="button"
                onClick={() => setDirection(initial.defaultDirection)}
                data-testid="day-animate-reset"
              >
                Back to the beat
              </Button>
            ) : null}
          </span>
        </label>
      )}
      {talk ? (
        <div className="space-y-2" data-testid="day-animate-length">
          <span className="type-caption block text-[var(--text-muted)]">Length</span>
          <SegmentedControl
            aria-label="Dialogue length"
            value={String(talkTotal)}
            onChange={value => setTalkTotal(normalizeDayTalkTotalSeconds(value))}
            options={DAY_TALK_TOTAL_SECONDS.map(total => ({
              value: String(total),
              label:
                total === DAY_TALK_TOTAL_SECONDS[0]
                  ? `${formatSeconds(talk.firstSec)} (default)`
                  : `${total} s`,
              testId: `day-animate-talk-${total}`,
            }))}
          />
          {parts > 0 ? (
            <>
              <p className="type-caption text-[var(--text-muted)]">
                About {formatSeconds(dayTalkTotalOut(talk.firstSec, parts))}: the first clip with
                the slot’s line, then {parts} more part{parts === 1 ? '' : 's'}, each saying the
                next line. They render after the first clip lands — a few minutes more — and come
                back as one clip (the short one stays in the Gallery). A part with no line runs
                without words.
              </p>
              <div className="space-y-1" data-testid="day-animate-lines">
                <span className="flex items-center justify-between gap-2">
                  <span className="type-caption text-[var(--text-muted)]">
                    Then {pronoun} says…
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    disabled={writing}
                    onClick={() => void writeRest()}
                    data-testid="day-animate-write-lines"
                  >
                    {writing ? 'Writing…' : 'Write the rest'}
                  </Button>
                </span>
                {Array.from({ length: parts }, (_, index) => (
                  <TextInput
                    key={index}
                    value={lines[index] ?? ''}
                    maxLength={SPOKEN_LINE_MAX_CHARS}
                    placeholder={`Part ${index + 2} — empty for no words`}
                    aria-label={`Line for part ${index + 2}`}
                    disabled={writing}
                    onChange={event =>
                      setLines(list => {
                        const next = [...list];
                        next[index] = event.target.value;
                        return next;
                      })
                    }
                    data-testid={`day-animate-line-${index}`}
                  />
                ))}
                {writeError ? <FieldError>{writeError}</FieldError> : null}
              </div>
            </>
          ) : null}
        </div>
      ) : chain ? (
        <div className="space-y-1" data-testid="day-animate-length">
          <span className="type-caption block text-[var(--text-muted)]">Length</span>
          <SegmentedControl
            aria-label="Clip length"
            value={String(talkTotal)}
            onChange={value => setTalkTotal(normalizeDayTalkTotalSeconds(value))}
            options={DAY_TALK_TOTAL_SECONDS.map(total => ({
              value: String(total),
              label:
                total === DAY_TALK_TOTAL_SECONDS[0]
                  ? `${formatSeconds(chain.firstSec)} (default)`
                  : `${total} s`,
              testId: `day-animate-chain-${total}`,
            }))}
          />
          {parts > 0 ? (
            <>
              <p className="type-caption text-[var(--text-muted)]" data-testid="day-animate-chain">
                About{' '}
                {formatSeconds(
                  dayH3TotalWith(
                    chain.firstSec,
                    Array.from({ length: parts }, (_, index) => partSeconds[index] ?? 0)
                  )
                )}
                : MiniMax-H3 makes one ~5 s shot at a time, so this is the first clip, then {parts}{' '}
                more part{parts === 1 ? '' : 's'}, each starting where the last one ends, with the
                place’s sound. They render after the first clip lands — about 2½ minutes a part —
                and come back as one clip (the short one stays in the Gallery).
              </p>
              <div className="space-y-2" data-testid="day-animate-parts">
                <span className="flex items-center justify-between gap-2">
                  <span className="type-caption text-[var(--text-muted)]">Then…</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    disabled={writing}
                    onClick={() => void writeBeats()}
                    data-testid="day-animate-write-beats"
                  >
                    {writing ? 'Writing…' : 'Write the beats'}
                  </Button>
                </span>
                {Array.from({ length: parts }, (_, index) => (
                  <div
                    key={index}
                    className="space-y-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
                    data-testid={`day-animate-part-${index}`}
                  >
                    <TextInput
                      value={partBeats[index] ?? ''}
                      maxLength={240}
                      placeholder={`Part ${index + 2} — empty: written from the scene`}
                      aria-label={`What happens in part ${index + 2}`}
                      disabled={writing}
                      onChange={event =>
                        setPartBeats(list => {
                          const next = [...list];
                          next[index] = event.target.value;
                          return next;
                        })
                      }
                      data-testid={`day-animate-part-beat-${index}`}
                    />
                    <SegmentedControl
                      aria-label={`Length of part ${index + 2}`}
                      value={String(partSeconds[index] ?? 0)}
                      onChange={value =>
                        setPartSeconds(list => {
                          const next = [...list];
                          next[index] = Number(value) || 0;
                          return next;
                        })
                      }
                      options={DAY_H3_PART_SECONDS.map(sec => ({
                        value: String(sec),
                        label: sec ? `${sec} s` : '~5 s',
                        testId: `day-animate-part-${index}-sec-${sec}`,
                      }))}
                    />
                  </div>
                ))}
                {writeError ? <FieldError>{writeError}</FieldError> : null}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1" data-testid="day-animate-length">
          <span className="type-caption block text-[var(--text-muted)]">Length</span>
          <SegmentedControl
            aria-label="Clip length"
            value={String(extraSeconds)}
            onChange={value => setExtraSeconds(normalizeDayClipExtraSeconds(value))}
            options={DAY_CLIP_EXTRA_SECONDS.map((extra, index) => ({
              value: String(extra),
              label: `${formatSeconds(current.lengthSeconds[index] ?? 0)}${extra === 0 ? ' (default)' : ''}`,
              testId: `day-animate-length-${extra}`,
            }))}
          />
          {extraSeconds > 0 ? (
            <p className="type-caption text-[var(--text-muted)]">
              Longer clips take longer to render, and motion past ~6 s can drift or repeat.
              {current.silentWhenLong
                ? ' On MiniMax-H3 a longer clip with no line comes out silent — Add sound gives it the place’s sound.'
                : ''}
            </p>
          ) : null}
        </div>
      )}
      <details className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-2 py-1">
        <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
          What gets sent
        </summary>
        <p
          className="type-caption mt-1 whitespace-pre-wrap text-[var(--text-secondary)]"
          data-testid="day-animate-prompt"
        >
          {current.prompt}
        </p>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={busy || writing}
          data-testid="day-animate-submit"
          onClick={submit}
        >
          Animate
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} data-testid="day-animate-cancel">
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}

/** 4 → "4 s", 5.875 → "5.9 s". */
function formatSeconds(seconds: number): string {
  const rounded = Math.round(seconds * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} s`;
}
