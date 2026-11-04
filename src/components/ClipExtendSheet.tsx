'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import SideSheet from '@/components/ui/SideSheet';
import {
  CLIP_EXTEND_MAX_SEGMENTS,
  requestClipExtendPlan,
  type ClipExtendRequest,
} from '@/lib/clip/extend';
import { sharedLlmRequestBody } from '@/lib/llm/request-options';
import { SPOKEN_LINE_TONES } from '@/lib/video/ltx25-renderer';
import { loadSettingsCache } from '@/lib/settings/cache';
import { SegmentedControl } from '@/components/ui/ToolPageShell';
import { DAY_H3_PART_SECONDS } from '@/lib/day/clip-length';

export type ClipExtendChoice = {
  direction?: string;
  beats?: string[];
  lines?: string[];
  tones?: string[];
  /** Each part's length in seconds (0 = the engine's own; the Animate sheet's H3 parts). */
  partSeconds?: number[];
  /** Two people on H3 (M11 T21): who says each line (same order as lines). */
  speakers?: Array<'lead' | 'partner'>;
};

/**
 * "Make it 30 s" with a say in it: where the clip should go (it steers the written beats), and
 * the beats themselves — one line per part, written from the scene and the direction, each
 * editable, more parts for a longer clip. Start uses them as they stand; with no beats the
 * server writes them.
 */
export default function ClipExtendSheet({
  open,
  onClose,
  request,
  onStart,
  testId = 'clip-extend-sheet',
}: {
  open: boolean;
  onClose: () => void;
  /** The clip and its scene (direction and beats come from this sheet). */
  request: Omit<ClipExtendRequest, 'direction' | 'beats'>;
  onStart: (choice: ClipExtendChoice) => void;
  testId?: string;
}) {
  const [direction, setDirection] = useState('');
  const [beats, setBeats] = useState<string[]>([]);
  // A line per part (LTX clips lip-sync; WAN clips cannot).
  const [lines, setLines] = useState<string[]>([]);
  const [tones, setTones] = useState<string[]>([]);
  // Two people on H3: who says each line (the Cast unless picked).
  const [speakers, setSpeakers] = useState<Array<'lead' | 'partner'>>([]);
  // Each H3 part's length (0 = H3's own ~5 s), as on Animate.
  const [partSeconds, setPartSeconds] = useState<number[]>([]);
  const [engine, setEngine] = useState<'ltx' | 'wan' | 'h3' | null>(null);
  const [people, setPeople] = useState(1);
  const [partSec, setPartSec] = useState(4.3);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const write = async () => {
    setWriting(true);
    setError(null);
    try {
      const plan = await requestClipExtendPlan(
        { ...request, direction: direction.trim() || undefined },
        sharedLlmRequestBody(loadSettingsCache().shared)
      );
      setBeats(plan.beats);
      setLines(plan.beats.map(() => ''));
      setTones(plan.beats.map(() => ''));
      setSpeakers(plan.beats.map(() => 'lead'));
      setPartSeconds(plan.beats.map(() => 0));
      setPartSec(plan.partSec);
      setEngine(plan.engine);
      setPeople(plan.people ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write the beats.');
    } finally {
      setWriting(false);
    }
  };

  const keptIndexes = beats.map((beat, index) => (beat.trim() ? index : -1)).filter(i => i >= 0);
  const kept = keptIndexes.map(index => beats[index]!.trim());
  const keptLines = keptIndexes.map(index => (lines[index] ?? '').trim());
  const keptTones = keptIndexes.map(index => tones[index] ?? '');
  const keptSpeakers = keptIndexes.map(index => speakers[index] ?? 'lead');
  const twoTalk = engine === 'h3' && people >= 2;
  const keptSeconds = keptIndexes.map(index => partSeconds[index] ?? 0);
  const start = () => {
    onStart({
      direction: direction.trim() || undefined,
      beats: kept.length ? kept : undefined,
      lines:
        (engine === 'ltx' || engine === 'h3') && keptLines.some(Boolean) ? keptLines : undefined,
      tones:
        (engine === 'ltx' || engine === 'h3') && keptTones.some(Boolean) ? keptTones : undefined,
      partSeconds: engine === 'h3' && keptSeconds.some(Boolean) ? keptSeconds : undefined,
      speakers:
        twoTalk && keptLines.some(Boolean) && keptSpeakers.includes('partner')
          ? keptSpeakers
          : undefined,
    });
    onClose();
  };

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title="Make it 30 s"
      description="The clip carries on in parts that continue from each other — a few minutes."
      testId={testId}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={writing}
            onClick={start}
            data-testid={`${testId}-start`}
          >
            {kept.length ? `Make it longer · ${kept.length} parts` : 'Make it longer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="type-label">Where it goes (optional)</span>
          <TextArea
            rows={2}
            value={direction}
            maxLength={300}
            placeholder="She finishes her coffee, grabs her keys and heads for the door."
            onChange={event => setDirection(event.target.value)}
            data-testid={`${testId}-direction`}
          />
          <span className="type-caption block text-[var(--text-muted)]">
            Small steps work best: the same people and place, no cuts — the camera stays put.
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={writing}
            loading={writing}
            loadingLabel="Writing"
            onClick={() => void write()}
            data-testid={`${testId}-write`}
          >
            {beats.length ? 'Write them again' : 'Write the beats'}
          </Button>
          <span className="type-caption text-[var(--text-muted)]">
            {beats.length
              ? engine === 'wan'
                ? `About ${partSec} s each — edit any line. This clip renders on WAN, which cannot move lips to words, so its parts stay wordless.`
                : engine === 'h3'
                  ? `About ${partSec} s each on MiniMax-H3, each starting where the last one ends, with the place’s sound — edit any line, and give a part something to say if you like.`
                  : `About ${partSec} s each — edit any line, and give a part something to say if you like.`
              : 'Or start now and they are written for you.'}
          </span>
        </div>
        {beats.length && engine === 'h3' && people >= 2 ? (
          // Two people (M11 T21): every join softens their skin a little; fewer joins hold it.
          <p className="type-caption text-[var(--text-muted)]" data-testid={`${testId}-two-people`}>
            Two people: each join softens their skin a little, so their faces hold best from a
            longer first clip — it needs fewer joins.
          </p>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
        {beats.length ? (
          <ol className="space-y-2" data-testid={`${testId}-beats`}>
            {beats.map((beat, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="type-caption mt-2 w-5 shrink-0 text-right text-[var(--text-muted)]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <TextArea
                    value={beat}
                    rows={2}
                    className="py-2 type-body"
                    maxLength={240}
                    aria-label={`Part ${index + 1}`}
                    onChange={event =>
                      setBeats(list =>
                        list.map((entry, at) => (at === index ? event.target.value : entry))
                      )
                    }
                    data-testid={`${testId}-beat-${index}`}
                  />
                  {engine === 'ltx' || engine === 'h3' ? (
                    // The line and how it's said side by side, so the tone is there from the start.
                    <div className="flex flex-wrap items-center gap-2">
                      <TextInput
                        value={lines[index] ?? ''}
                        maxLength={90}
                        placeholder="Says… (optional)"
                        aria-label={`Line for part ${index + 1}`}
                        className="min-w-[12rem] flex-1"
                        onChange={event =>
                          setLines(list => {
                            const next = [...list];
                            next[index] = event.target.value;
                            return next;
                          })
                        }
                        data-testid={`${testId}-line-${index}`}
                      />
                      <SelectInput
                        value={tones[index] || 'natural'}
                        aria-label={`How part ${index + 1}'s line is said`}
                        title={
                          (lines[index] ?? '').trim()
                            ? undefined
                            : 'How the line is said — type a line first'
                        }
                        disabled={!(lines[index] ?? '').trim()}
                        className="w-auto"
                        onChange={event =>
                          setTones(list => {
                            const next = [...list];
                            next[index] =
                              event.target.value === 'natural' ? '' : event.target.value;
                            return next;
                          })
                        }
                        data-testid={`${testId}-tone-${index}`}
                      >
                        {SPOKEN_LINE_TONES.map(option => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </SelectInput>
                      {twoTalk ? (
                        <SelectInput
                          value={speakers[index] ?? 'lead'}
                          aria-label={`Who says part ${index + 1}'s line`}
                          disabled={!(lines[index] ?? '').trim()}
                          className="w-auto"
                          onChange={event =>
                            setSpeakers(list => {
                              const next = [...list];
                              next[index] = event.target.value === 'partner' ? 'partner' : 'lead';
                              return next;
                            })
                          }
                          data-testid={`${testId}-speaker-${index}`}
                        >
                          <option value="lead">Your Cast says it</option>
                          <option value="partner">The other person says it</option>
                        </SelectInput>
                      ) : null}
                    </div>
                  ) : null}
                  {engine === 'h3' ? (
                    <SegmentedControl
                      aria-label={`Length of part ${index + 1}`}
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
                        testId: `${testId}-part-${index}-sec-${sec}`,
                      }))}
                    />
                  ) : null}
                </div>
                <button
                  type="button"
                  className="ui-chip mt-1 shrink-0"
                  aria-label={`Remove part ${index + 1}`}
                  onClick={() => {
                    setBeats(list => list.filter((_, at) => at !== index));
                    setLines(list => list.filter((_, at) => at !== index));
                    setTones(list => list.filter((_, at) => at !== index));
                    setPartSeconds(list => list.filter((_, at) => at !== index));
                    setSpeakers(list => list.filter((_, at) => at !== index));
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
            {beats.length < CLIP_EXTEND_MAX_SEGMENTS ? (
              <li>
                <button
                  type="button"
                  className="ui-chip"
                  onClick={() => {
                    setBeats(list => [...list, '']);
                    setLines(list => [...list, '']);
                    setTones(list => [...list, '']);
                    setPartSeconds(list => [...list, 0]);
                    setSpeakers(list => [...list, 'lead']);
                  }}
                  data-testid={`${testId}-add`}
                >
                  + Add a part
                </button>
              </li>
            ) : null}
          </ol>
        ) : null}
      </div>
    </SideSheet>
  );
}
