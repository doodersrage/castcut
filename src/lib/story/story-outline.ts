/**
 * The Story's outline (Part 18 R5): each scene's rough screen time — a clip runs about 5 s, a
 * still holds about 3 s, a line takes as long as it is to say — the running total, and where the
 * three acts fall by time (the first quarter sets it up, the middle half turns it, the last
 * quarter ends it). And the words for the AI's notes on it: a logline, a short synopsis and a
 * story editor's notes. Pure; the model call is in story-outline-server.ts.
 */

import type { RoleplayStoryBeat } from './roleplay';

export type OutlineScene = {
  index: number;
  title: string;
  /** Rough screen time and where it starts (seconds). */
  seconds: number;
  startSec: number;
  /** The act this scene opens, when it opens one. */
  opensAct?: 1 | 2 | 3;
};

const WORDS_PER_SEC = 2.5;

/** A scene's rough screen time: its shot, or as long as its words take to say. */
export function sceneSeconds(
  beat: Pick<RoleplayStoryBeat, 'clipStatus' | 'line' | 'replyLine' | 'narration'>
): number {
  const shot = beat.clipStatus === 'completed' ? 5 : 3;
  const words = [beat.line, beat.replyLine, beat.narration]
    .filter(Boolean)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.round(Math.max(shot, words / WORDS_PER_SEC + 1) * 10) / 10;
}

/** The outline: each scene's time, start and the act it opens. */
export function storyOutline(beats: readonly RoleplayStoryBeat[]): {
  scenes: OutlineScene[];
  totalSec: number;
} {
  let at = 0;
  const scenes = beats.map((beat, index) => {
    const seconds = sceneSeconds(beat);
    const scene: OutlineScene = {
      index,
      title: beat.title?.trim() || `Scene ${index + 1}`,
      seconds,
      startSec: Math.round(at * 10) / 10,
    };
    at += seconds;
    return scene;
  });
  const totalSec = Math.round(at * 10) / 10;
  // Acts by time: the scene that starts at or past each boundary opens that act.
  if (scenes.length >= 3) {
    scenes[0]!.opensAct = 1;
    for (const [act, share] of [
      [2, 0.25],
      [3, 0.75],
    ] as const) {
      const opener = scenes.find(scene => scene.startSec >= totalSec * share && !scene.opensAct);
      if (opener) opener.opensAct = act;
    }
  }
  return { scenes, totalSec };
}

export type StoryNotes = { logline: string; synopsis: string; notes: string[] };

/** The model's brief: the story's scenes in order, and what to write back (JSON). */
export function storyNotesMessages(input: {
  lead: string;
  tone?: string;
  beats: ReadonlyArray<
    Pick<RoleplayStoryBeat, 'title' | 'blurb' | 'line' | 'replyLine' | 'narration'>
  >;
}) {
  const scenes = input.beats
    .map((beat, index) =>
      [
        `${index + 1}. ${beat.title?.trim() || 'Scene'} — ${beat.blurb?.trim() || ''}`,
        beat.line?.trim() ? `   ${input.lead}: “${beat.line.trim()}”` : '',
        beat.replyLine?.trim() ? `   Reply: “${beat.replyLine.trim()}”` : '',
        beat.narration?.trim() ? `   Voice-over: “${beat.narration.trim()}”` : '',
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n');
  const system = [
    'You are a story editor reading a short film told in scenes.',
    'Write back JSON only: {"logline": string, "synopsis": string, "notes": string[]}.',
    '- logline: one sentence, who wants what and what stands in the way (under 35 words).',
    '- synopsis: 3 to 5 sentences, the story as it stands, in the present tense.',
    '- notes: 3 to 6 short, specific notes a writer can act on — what drags, where the turn is or is missing, whether she wants something, whether it ends — each naming the scene numbers it is about.',
    'Plain words. No praise, no headings, nothing outside the JSON.',
  ].join('\n');
  const user = [
    `Lead: ${input.lead || 'the lead'}${input.tone ? ` · Tone: ${input.tone}` : ''}`,
    'Scenes:',
    scenes,
  ].join('\n');
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user.slice(0, 12_000) },
  ];
}

/** The model's reply read as notes (null when it isn't the JSON asked for). */
export function parseStoryNotes(reply: string | null | undefined): StoryNotes | null {
  const text = reply ?? '';
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const json = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const logline = typeof json.logline === 'string' ? json.logline.trim().slice(0, 400) : '';
    const synopsis = typeof json.synopsis === 'string' ? json.synopsis.trim().slice(0, 1500) : '';
    const notes = Array.isArray(json.notes)
      ? json.notes
          .filter((note): note is string => typeof note === 'string' && Boolean(note.trim()))
          .map(note => note.trim().slice(0, 300))
          .slice(0, 8)
      : [];
    return logline || synopsis || notes.length ? { logline, synopsis, notes } : null;
  } catch {
    return null;
  }
}
