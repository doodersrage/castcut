'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import SideSheet from '@/components/ui/SideSheet';
import { sharedLlmRequestBody } from '@/lib/llm/request-options';
import { loadSettingsCache } from '@/lib/settings/cache';
import type { RoleplayStoryBeat } from '@/lib/story/roleplay';
import { storyFeelingArc, storyOutline, type StoryNotes } from '@/lib/story/story-outline';

const ACT_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Act I — set-up',
  2: 'Act II — the turn',
  3: 'Act III — the end',
};

const clock = (sec: number) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Story → Outline (story-outline.ts): the scenes as a beat board — each one's rough screen time and
 * the running total, where the three acts fall — with **Branch from here** on each (the story as
 * it is kept in your stories, a new one carries on from that scene), and an editor's **notes**: a
 * logline, a short synopsis and notes to act on, from your LLM.
 */
export default function StoryOutlineSheet({
  story,
  lead,
  tone,
  disabled,
  onBranch,
}: {
  story: readonly RoleplayStoryBeat[];
  lead: string;
  tone?: string;
  disabled?: boolean;
  /** Keep this story, and carry on a new one from scene `index`. */
  onBranch: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<StoryNotes | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchAt, setBranchAt] = useState<number | null>(null);
  const outline = useMemo(() => storyOutline(story), [story]);
  const arc = useMemo(() => storyFeelingArc(story), [story]);

  const writeNotes = async () => {
    setWriting(true);
    setError(null);
    try {
      const response = await fetch('/api/story/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          lead,
          tone,
          beats: story.map(beat => ({
            title: beat.title,
            blurb: beat.blurb,
            line: beat.line,
            replyLine: beat.replyLine,
            narration: beat.narration,
          })),
          ...sharedLlmRequestBody(loadSettingsCache().shared),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        notes?: StoryNotes;
        error?: string;
      };
      if (!response.ok || !data.notes) throw new Error(data.error ?? 'Could not write the notes.');
      setNotes(data.notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write the notes.');
    } finally {
      setWriting(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={!story.length}
        data-testid="story-outline-open"
        title="The scenes as a beat board — screen time, acts, branch a version — and an editor's notes"
        onClick={() => setOpen(true)}
      >
        Outline
      </Button>
      <SideSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Outline"
        description={`${story.length} scene${story.length === 1 ? '' : 's'} · about ${clock(outline.totalSec)} on screen`}
        size="lg"
        testId="story-outline"
      >
        {arc.length >= 2 ? (
          <figure className="mb-3 space-y-1" data-testid="story-outline-arc">
            <svg
              viewBox={`0 0 ${(arc.length - 1) * 40 + 20} 60`}
              className="h-16 w-full"
              preserveAspectRatio="none"
              role="img"
              aria-label={`The story's feeling, scene by scene: ${arc.map(point => point.tone || 'unnamed').join(', ')}`}
            >
              <line
                x1="0"
                y1="30"
                x2={(arc.length - 1) * 40 + 20}
                y2="30"
                stroke="currentColor"
                strokeOpacity="0.15"
              />
              <polyline
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                points={arc
                  .map(point => `${point.index * 40 + 10},${30 - point.valence * 12}`)
                  .join(' ')}
              />
              {arc.map(point => (
                <circle
                  key={point.index}
                  cx={point.index * 40 + 10}
                  cy={30 - point.valence * 12}
                  r="3"
                  fill="var(--accent)"
                />
              ))}
            </svg>
            <figcaption className="type-caption text-[var(--text-muted)]">
              The feeling, scene by scene — up is happier, down is sadder or darker
            </figcaption>
          </figure>
        ) : null}
        <ol className="space-y-1" data-testid="story-outline-scenes">
          {outline.scenes.map(scene => (
            <li key={scene.index}>
              {scene.opensAct ? (
                <p
                  className="type-caption mb-0.5 mt-2 font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                  data-testid={`story-outline-act-${scene.opensAct}`}
                >
                  {ACT_LABELS[scene.opensAct]}
                </p>
              ) : null}
              <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-2 py-1.5">
                <span className="type-caption w-6 shrink-0 tabular-nums text-[var(--text-muted)]">
                  {scene.index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm" title={story[scene.index]?.blurb}>
                  {scene.title}
                </span>
                <span
                  className="type-caption shrink-0 tabular-nums text-[var(--text-muted)]"
                  title="Rough screen time · where it starts"
                >
                  {Math.round(scene.seconds)} s · {clock(scene.startSec)}
                </span>
                {branchAt === scene.index ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={disabled}
                      data-testid={`story-outline-branch-confirm-${scene.index}`}
                      onClick={() => {
                        setBranchAt(null);
                        setOpen(false);
                        onBranch(scene.index);
                      }}
                    >
                      Branch
                    </Button>
                    <Button size="sm" variant="underline" onClick={() => setBranchAt(null)}>
                      No
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    className="shrink-0"
                    data-testid={`story-outline-branch-${scene.index}`}
                    title="Keep this story as it is (in your stories) and carry on a new version from this scene"
                    onClick={() => setBranchAt(scene.index)}
                  >
                    Branch from here
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
        {story.length > 0 && story.length < 3 ? (
          <p className="type-caption mt-2 text-[var(--text-muted)]">Acts show from three scenes.</p>
        ) : null}

        <section className="mt-5 space-y-2" data-testid="story-outline-notes">
          <div className="flex items-center justify-between gap-2">
            <p className="type-body font-medium">Notes</p>
            <Button
              size="sm"
              variant="secondary"
              disabled={writing || !story.length}
              data-testid="story-outline-write-notes"
              onClick={() => void writeNotes()}
            >
              {writing ? 'Reading the story…' : notes ? 'Read it again' : 'Write notes'}
            </Button>
          </div>
          {notes ? (
            <div className="space-y-2 text-sm">
              {notes.logline ? (
                <p data-testid="story-outline-logline">
                  <span className="type-caption block text-[var(--text-muted)]">Logline</span>
                  {notes.logline}
                </p>
              ) : null}
              {notes.synopsis ? (
                <p data-testid="story-outline-synopsis">
                  <span className="type-caption block text-[var(--text-muted)]">Synopsis</span>
                  {notes.synopsis}
                </p>
              ) : null}
              {notes.notes.length ? (
                <div>
                  <span className="type-caption block text-[var(--text-muted)]">Notes</span>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {notes.notes.map(note => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <Button
                size="sm"
                variant="underline"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(
                      [notes.logline, notes.synopsis, ...notes.notes.map(note => `- ${note}`)]
                        .filter(Boolean)
                        .join('\n\n')
                    )
                    .catch(() => undefined)
                }
              >
                Copy
              </Button>
            </div>
          ) : (
            <p className="type-caption text-[var(--text-muted)]">
              A logline, a short synopsis and notes to act on — what drags, where the turn is,
              whether it ends — from your LLM.
            </p>
          )}
          {error ? <p className="type-caption text-[var(--danger)]">{error}</p> : null}
        </section>
      </SideSheet>
    </>
  );
}
