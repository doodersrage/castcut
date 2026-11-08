/**
 * Writing an episode (Part 19 G3): a premise becomes a screenplay the Script section reads —
 * first an outline (a title, a logline and its scenes: heading, what happens, who is in it),
 * then each scene written out in Fountain, one LLM call per scene so a small local model can
 * do it, each given the outline and how the scene before ended. The scenes joined are an
 * ordinary script: Who's who, places, shot drafting and an episode run (episode-run.ts) all
 * apply. Pure (the calls are /api/script-episode).
 */

import { parseScript } from '../script/parse';

export type EpisodeOutlineScene = {
  /** "INT. KITCHEN - MORNING". */
  heading: string;
  /** What happens, a sentence or two. */
  summary: string;
  /** Who is in it (Cast names as given, or new people). */
  who: string[];
};

export type EpisodeOutline = {
  title: string;
  logline: string;
  scenes: EpisodeOutlineScene[];
};

export type EpisodeCastMember = { name: string; sex?: string };

export const EPISODE_MINUTES_MIN = 3;
export const EPISODE_MINUTES_MAX = 60;
export const EPISODE_SCENES_MAX = 40;

/**
 * About 45 seconds of film a scene, as Castcut cuts one — measured on the 2026-11-06 episode: 24
 * scenes of about a page each, 234 shots, cut as stills with every line read, came to about 18
 * minutes (a stage page is a minute; a cut of held stills and read lines runs faster). A half
 * hour is 40 scenes — 390 to 480 shots, within an episode run's 600. Longer episodes stop at 40:
 * write two.
 */
export const EPISODE_SECONDS_PER_SCENE = 45;

export function episodeSceneCount(minutes: number): number {
  const clamped = Math.min(EPISODE_MINUTES_MAX, Math.max(EPISODE_MINUTES_MIN, Math.round(minutes)));
  return Math.min(
    EPISODE_SCENES_MAX,
    Math.max(3, Math.round((clamped * 60) / EPISODE_SECONDS_PER_SCENE))
  );
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Adult writing (2026-11-06, the user: "give the option to send adult content to the script
 * writer"): only when the server allows adult content (the route checks), and only ever about
 * adults — the same over-21 line the stills are held to (adult-appearance-gate.ts).
 */
export const EPISODE_ADULT_RULES =
  'This is adult fiction for consenting adults, and explicit intimate scenes are allowed. Every ' +
  'character is an adult over 21 — never give anyone an age under 21, never a school, a ' +
  'classroom, a teenager or a child, never describe anyone as childlike or young-looking. ' +
  'Intimacy is only ever between consenting adults: nothing non-consensual, coerced or with ' +
  'anyone unable to consent.';

function castLine(lead: string, cast: readonly EpisodeCastMember[]): string {
  const named = [
    { name: lead, sex: cast.find(member => member.name === lead)?.sex },
    ...cast.filter(member => member.name !== lead),
  ]
    .filter(member => member.name.trim())
    .slice(0, 8)
    .map(member =>
      member.sex === 'woman' || member.sex === 'man'
        ? `${member.name} (a ${member.sex})`
        : member.name
    );
  return named.join(', ');
}

/** A short counted in scenes (moments), not minutes: 2 at least — one is a Scene of its own. */
export const EPISODE_SCENES_MIN = 2;

/** A scene count as asked (2–40), or null: the length is in minutes. */
export function normalizeEpisodeScenes(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(EPISODE_SCENES_MAX, Math.max(EPISODE_SCENES_MIN, n));
}

/** How many scenes the outline asks for: the count when one is given, else the minutes'. */
export function episodeLengthScenes(input: { minutes: number; scenes?: number | null }): number {
  return normalizeEpisodeScenes(input.scenes) ?? episodeSceneCount(input.minutes);
}

/**
 * A short from Day (2026-11-06): Day's idea, mood and number of moments, carried to the Scene
 * page's Write an episode — scripts make the film now; Day's moments are its scenes.
 */
export type EpisodeWriteSeed = {
  premise: string;
  tone?: string;
  scenes: number;
  /** Short's mood (or theme): kept with the script, its Scenes made in it. */
  mood?: string;
};

const DAY_MOOD_TONES: Record<string, string> = {
  everyday: 'everyday slice of life, warm and observant',
  vacation: 'a holiday away, sunny and easy',
  sport: 'sporty and driven: training, the match, the team, in the right kit',
  suggestive: 'flirty and playful, glamorous, always clothed',
  intimate: 'intimate and sensual, between consenting adults',
};

/**
 * The moods a short can be written in (Write an episode's LLM): Intimate only with adult
 * writing allowed (the server's adult setting) — else its scenes stay on Short's own board.
 */
export function dayShortMoodAvailable(
  mood: string | null | undefined,
  options: { adult?: boolean } = {}
): boolean {
  const id = String(mood ?? 'everyday')
    .trim()
    .toLowerCase();
  return options.adult === true || (id !== 'intimate' && id !== 'raunchy');
}

export function dayShortSeed(input: {
  premise: string;
  mood: string | null | undefined;
  moments: number;
  /** Adult writing allowed (the server's adult setting): Intimate's mood goes too. */
  adult?: boolean;
}): EpisodeWriteSeed {
  const mood = String(input.mood ?? '')
    .trim()
    .slice(0, 40);
  const tone = DAY_MOOD_TONES[mood.toLowerCase()];
  return {
    premise: input.premise.trim().slice(0, 2000),
    ...(tone ? { tone } : {}),
    scenes: normalizeEpisodeScenes(input.moments) ?? EPISODE_SCENES_MIN,
    ...(mood && dayShortMoodAvailable(mood, { adult: input.adult }) ? { mood } : {}),
  };
}

/** The Script page, its writer open on the seed. */
export function episodeWriteHref(castId: string, seed: EpisodeWriteSeed): string {
  const params = new URLSearchParams({
    character: castId,
    write: 'short',
    premise: seed.premise,
    scenes: String(seed.scenes),
  });
  if (seed.tone) params.set('tone', seed.tone);
  if (seed.mood) params.set('mood', seed.mood);
  return `/script?${params.toString()}`;
}

/**
 * The seed in a Script page URL (`?write=short&…`), or null. An adult mood is read only with
 * adult writing allowed (`adult`: the server's setting, as the page knows it).
 */
export function readEpisodeWriteSeed(
  search: string,
  options: { adult?: boolean } = {}
): EpisodeWriteSeed | null {
  const params = new URLSearchParams(search);
  if (params.get('write') !== 'short') return null;
  const premise = (params.get('premise') ?? '').trim().slice(0, 2000);
  const scenes = normalizeEpisodeScenes(params.get('scenes'));
  if (!premise || !scenes) return null;
  const tone = (params.get('tone') ?? '').trim().slice(0, 60);
  const mood = (params.get('mood') ?? '').trim().slice(0, 40);
  return {
    premise,
    scenes,
    ...(tone ? { tone } : {}),
    ...(mood && dayShortMoodAvailable(mood, options) ? { mood } : {}),
  };
}

export function episodeOutlineMessages(input: {
  premise: string;
  lead: string;
  cast: readonly EpisodeCastMember[];
  minutes: number;
  /** A short counted in scenes: overrides the minutes. */
  scenes?: number | null;
  tone?: string;
  /** Adult writing ({@link EPISODE_ADULT_RULES}) — the route allows it only when the server does. */
  adult?: boolean;
}): ChatMessage[] {
  const scenes = normalizeEpisodeScenes(input.scenes);
  const count = scenes ?? episodeSceneCount(input.minutes);
  const onScreen = Math.round((count * EPISODE_SECONDS_PER_SCENE) / 60);
  return [
    {
      role: 'system',
      content:
        'You are a television writer breaking a story into scenes. Reply with JSON only, no prose: ' +
        '{"title": string, "logline": string, "scenes": [{"heading": string, "summary": string, "who": string[]}]}. ' +
        'Each heading is a screenplay scene heading in capitals — INT. or EXT., the place, a dash, the time of day ' +
        '(MORNING, DAY, EVENING or NIGHT) — e.g. "INT. KITCHEN - MORNING". Each summary is one or two sentences of ' +
        'what is seen and what changes. "who" names the people in the scene. Give the story a clear set-up, a turn ' +
        'in the middle and an ending; places can repeat; keep each scene to one place and time.' +
        (input.adult ? ` ${EPISODE_ADULT_RULES}` : ''),
    },
    {
      role: 'user',
      content: [
        `Premise: ${input.premise.trim()}`,
        `The lead: ${input.lead}. The cast to use: ${castLine(input.lead, input.cast)}. Add other people only if the story needs them.`,
        input.tone?.trim() ? `Tone: ${input.tone.trim()}.` : '',
        scenes
          ? `Length: a short — write exactly ${count} scenes, about ${onScreen <= 1 ? 'a minute' : `${onScreen} minutes`} on screen.`
          : `Length: about ${Math.round(input.minutes)} minutes on screen — write exactly ${count} scenes.`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
}

const HEADING = /^(INT\.?\/EXT\.?|INT\.|EXT\.|I\/E\.?)\s+.+/i;

/** A heading as a screenplay writes it: capitals, INT./EXT., " - TIME". */
export function normalizeEpisodeHeading(raw: string): string {
  let heading = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/^\d+[.)]\s*/, '');
  if (!heading) return '';
  if (!HEADING.test(heading)) heading = `INT. ${heading}`;
  heading = heading.toUpperCase().replace(/\s+[–—]\s+/g, ' - ');
  if (!/ - [A-Z ]+$/.test(heading)) heading = `${heading} - DAY`;
  return heading.slice(0, 120);
}

function jsonIn(reply: string | null | undefined): unknown {
  const text = (reply ?? '').replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    // Cut off by the token limit mid-scene: keep the scenes written whole and close the list.
    const cut = text.slice(start, end + 1);
    const lastScene = cut.lastIndexOf('}');
    for (let at = lastScene; at > 0; at = cut.lastIndexOf('}', at - 1)) {
      try {
        return JSON.parse(`${cut.slice(0, at + 1)}]}`);
      } catch {
        // not a scene's end yet — try the one before
      }
    }
    return null;
  }
}

/** Tokens to ask for an outline of `scenes` scenes: ~70 a scene, with room for title and logline. */
export function episodeOutlineTokens(scenes: number): number {
  return Math.min(8000, 600 + scenes * 110);
}

export function parseEpisodeOutline(reply: string | null | undefined): EpisodeOutline | null {
  const json = jsonIn(reply) as Record<string, unknown> | null;
  if (!json || !Array.isArray(json.scenes)) return null;
  const scenes = json.scenes
    .map(raw => (raw ?? {}) as Record<string, unknown>)
    .map(scene => ({
      heading: typeof scene.heading === 'string' ? normalizeEpisodeHeading(scene.heading) : '',
      summary: typeof scene.summary === 'string' ? scene.summary.trim().slice(0, 600) : '',
      who: (Array.isArray(scene.who) ? scene.who : [])
        .filter((name): name is string => typeof name === 'string' && Boolean(name.trim()))
        .map(name => name.trim().slice(0, 40))
        .slice(0, 6),
    }))
    .filter(scene => scene.heading && scene.summary)
    .slice(0, EPISODE_SCENES_MAX);
  if (scenes.length < 2) return null;
  const title = typeof json.title === 'string' ? json.title.trim().slice(0, 80) : '';
  const logline = typeof json.logline === 'string' ? json.logline.trim().slice(0, 400) : '';
  return { title: title || 'Episode', logline, scenes };
}

export function episodeSceneMessages(input: {
  outline: EpisodeOutline;
  index: number;
  lead: string;
  cast: readonly EpisodeCastMember[];
  /** The end of the scene before, as written (its last lines). */
  before?: string;
  tone?: string;
  adult?: boolean;
}): ChatMessage[] {
  const scene = input.outline.scenes[input.index]!;
  const list = input.outline.scenes
    .map((entry, i) => `${i + 1}. ${entry.heading} — ${entry.summary}`)
    .join('\n');
  return [
    {
      role: 'system',
      content:
        'You are a television writer. Write ONE scene of a screenplay in Fountain format and nothing else — no ' +
        'notes, no markdown. Start with the scene heading on its own line. Then action in short present-tense ' +
        'paragraphs of what the camera sees, and dialogue: the speaker’s name in CAPITALS on its own line, their ' +
        'line under it. Blank lines between elements. About one page: four to eight short beats, lines people ' +
        'would say aloud. Where it matters how a line is said, put it in parentheses on its own line between ' +
        'the name and the line — how the voice sounds (amused, bristling, near tears, teasing), not only ' +
        'quietly or softly. Do not write the next scene.' +
        (input.adult ? ` ${EPISODE_ADULT_RULES}` : ''),
    },
    {
      role: 'user',
      content: [
        `"${input.outline.title}" — ${input.outline.logline}`,
        `The cast: ${castLine(input.lead, input.cast)}.`,
        input.tone?.trim() ? `Tone: ${input.tone.trim()}.` : '',
        `The episode's scenes:\n${list}`,
        input.before?.trim() ? `How the scene before ended:\n${input.before.trim()}` : '',
        `Write scene ${input.index + 1}: ${scene.heading} — ${scene.summary}` +
          (scene.who.length ? ` (with ${scene.who.join(', ')})` : ''),
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

/**
 * A written scene, cleaned: fences and chatter gone, its own heading first (the outline's, when
 * the model wrote none or another), cut before a second heading. Null when there's nothing a
 * script reader takes as a scene.
 */
export function parseEpisodeScene(
  reply: string | null | undefined,
  heading: string
): string | null {
  const lines = (reply ?? '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/\s+$/, '').replace(/^\*\*(.+)\*\*$/, '$1'));
  const first = lines.findIndex(line => HEADING.test(line.trim()));
  let body = (first >= 0 ? lines.slice(first + 1) : lines).filter(
    line => !/^(here is|here's|sure|scene \d+:?)/i.test(line.trim())
  );
  const next = body.findIndex(line => HEADING.test(line.trim()));
  if (next >= 0) body = body.slice(0, next);
  const text = `${heading}\n\n${body
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
  const parsed = parseScript(text);
  const scene = parsed.scenes[0];
  return scene && scene.elements.length > 0 ? text : null;
}

/** The last lines of a written scene, for the next one to follow on from. */
export function episodeSceneTail(text: string, lines = 6): string {
  return text.trim().split('\n').filter(Boolean).slice(-lines).join('\n');
}

/** The written scenes as one Fountain script, under its title. */
export function episodeFountain(
  outline: Pick<EpisodeOutline, 'title'>,
  scenes: readonly string[]
): string {
  return `Title: ${outline.title}\n\n${scenes.map(scene => scene.trim()).join('\n\n')}\n`;
}

/**
 * The next one (2026-11-06: a series): Write an episode seeded to go on from a script — the
 * premise says what it follows and how its last scene ended (to be edited: what happens next),
 * the same number of scenes, the same mood. The writer knows the Cast already.
 */
export function nextEpisodeSeed(script: {
  name: string;
  mood?: string;
  scenes: ReadonlyArray<{
    heading: string;
    elements: ReadonlyArray<{ kind: string; text: string; speaker?: string }>;
  }>;
}): EpisodeWriteSeed {
  const last = script.scenes[script.scenes.length - 1];
  const ending = last
    ? episodeSceneTail(
        [
          last.heading,
          ...last.elements
            .filter(element => element.kind === 'action' || element.kind === 'dialogue')
            .map(element =>
              element.kind === 'dialogue' && element.speaker
                ? `${element.speaker}: ${element.text}`
                : element.text
            ),
        ].join('\n'),
        6
      )
    : '';
  const premise = [
    `The next episode after “${script.name.trim() || 'the last one'}”.`,
    ending ? `How it ended:\n${ending}` : '',
    'What happens next: ',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 2000);
  return {
    premise,
    scenes: normalizeEpisodeScenes(script.scenes.length) ?? EPISODE_SCENES_MIN,
    ...(script.mood?.trim() ? { mood: script.mood.trim().slice(0, 40) } : {}),
  };
}
