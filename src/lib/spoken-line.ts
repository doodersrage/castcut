/**
 * Suggested lines for talking clips (ltx25-renderer withSpokenLine): what the Cast says to the
 * camera in a Day slot or Story scene. One short line, in their voice, fitting the scene — the
 * player taps it in; nothing talks unless they do.
 */

import { normalizeSpokenLine } from './ltx25-renderer';

/** About 5 s of speech. */
export const SPOKEN_LINE_MAX_WORDS = 14;

export type SpokenLineRequest = {
  /** What happens (Day beat / Story scene blurb). */
  scene: string;
  /** Where (Setting), when known. */
  setting?: string;
  /** Time of day / slot label. */
  when?: string;
  name?: string;
  /** Personality / catchphrase from the bible, when there is one. */
  personality?: string;
  /** 'man' writes him; else her. */
  lead?: 'woman' | 'man';
  /** How hot the scene is (Day mood / Story rating) — see {@link spokenLineHeat}. */
  heat?: SpokenLineHeat;
  /** Lines already used nearby — say something else. */
  avoid?: string[];
  /** Write the other person's answer to this line (two-person conversations). */
  replyTo?: string;
};

export type SpokenLineHeat = 'clean' | 'flirty' | 'sensual' | 'explicit';

/** Day mood or Story rating → how a line may sound. */
export function spokenLineHeat(moodOrRating: string | null | undefined): SpokenLineHeat {
  switch (moodOrRating) {
    case 'suggestive':
      return 'flirty';
    case 'intimate':
    case 'sultry':
      return 'sensual';
    case 'raunchy':
    case 'explicit':
      return 'explicit';
    default:
      return 'clean';
  }
}

/**
 * Voice per heat. Live (2026-10-09): one "flirty is fine" rule under a vlog framing gave
 * intimate and raunchy scenes small-talk quips — an adult scene needs what would really be said
 * in that moment, to the lover as much as to the camera.
 */
const HEAT_RULES: Record<SpokenLineHeat, string[]> = {
  clean: [
    '- Natural spoken English, like a vlog or a moment caught on a phone.',
    '- Keep it clean and friendly.',
  ],
  flirty: [
    '- Teasing and flirty, said to someone they like behind the camera — confident, playful.',
    '- Suggestive is fine; no explicit sexual words.',
  ],
  sensual: [
    '- An intimate moment with a lover (in the scene or behind the camera): what they would really murmur — soft, breathy, warm, sensual. Short is better.',
    '- Suggestive and sensual, not crude. Not the moment for jokes or small talk — their personality only colours the words.',
    '- Tone only, write a new one: "Come here." / "Slower… stay right there." / "I missed this."',
  ],
  explicit: [
    '- A heated sex scene: the dirty talk they would really say in that moment — breathless, short, direct, to their lover. Explicit words are fine.',
    '- Not the moment for jokes or small talk — their personality only colours the words.',
    '- Tone only, write a new one: "God, don\'t stop." / "Harder. Right there." / "Fuck, I needed this."',
    '- Consenting adults only. Nothing about age, nothing non-consensual, no violence.',
  ],
};

/** The local model opened nine lines of nine with "You're" — ask for a different start. */
const OPENING_RULE = '- Do not start with "You\'re" or "You are"; vary how it opens.';

/** Who the line is said to: the partner when the scene has one, else whoever holds the phone. */
export function spokenLineListener(scene: string): string {
  return /\b(her|his|their) (partner|boyfriend|girlfriend|husband|wife|date|lover)\b|\b(together|both|couple)\b/i.test(
    scene
  )
    ? 'the other person in the scene'
    : 'a friend filming on a phone';
}

/**
 * Live (2026-10-10, 8 vacation beats, the 8B LM Studio model): asked for one line, it narrated
 * the action ("Clinking cups with you"), went whimsical ("caught a fish staring at me") or fell
 * into one formula ("That fountain light? Perfect…"); the bible catchphrase pulled coffee into a
 * beach bar. Four candidates with different intents, picked in code ({@link pickSpokenLine}),
 * gave lines about the straw, the clutch, the towel, the last song.
 */
const GROUNDED_RULES = [
  '- What a real person would actually say out loud at that moment, like on a home video: plain everyday words.',
  '- React to ONE concrete thing in the scene (the view, the food, the drink, the music, the weather, the other person) — what they notice, want, or suggest next.',
  '- Do not describe what they are doing ("clinking cups with you", "waving at you"); the video already shows it.',
  '- No poetry, no metaphors, nothing whimsical or random; it has to make sense right there.',
  '- Never use the words perfect, light, glow, flicker, vibe.',
  '- Match the time of day (no sunset in the afternoon, no sunrise at night).',
];

const GROUNDED_EXAMPLES: Partial<Record<SpokenLineHeat, string>> = {
  clean:
    '- Style only, write new ones: "Okay, you have to try this." / "Come here, look how far you can see." / "Wait, is that our waiter waving?"',
  flirty:
    '- Style only, write new ones: "Keep looking at me like that." / "You owe me a dance later."',
};

/** Four intents, so the candidates differ (adult heat: no jokes). */
const CANDIDATE_INTENTS: Record<SpokenLineHeat, string> = {
  clean: 'a question, an invitation, a reaction, a small joke',
  flirty: 'a tease, an invitation, a compliment, a dare',
  sensual: 'a request, a reaction, a whisper, praise',
  explicit: 'a request, a reaction, a demand, praise',
};

export function buildSpokenLineMessages(input: SpokenLineRequest) {
  const who = input.name?.trim() || (input.lead === 'man' ? 'he' : 'she');
  const heat = input.heat ?? 'clean';
  const replyTo = input.replyTo?.trim();
  const lines = [
    replyTo
      ? `Write FOUR different lines the other person in the scene could say back to ${input.name?.trim() || (input.lead === 'man' ? 'him' : 'her')}, answering: "${replyTo.slice(0, 160)}" — one per line, numbered 1-4.`
      : `Write FOUR different lines ${who} could say out loud, to ${spokenLineListener(input.scene)}, in a ~5 second video clip — one per line, numbered 1-4: ${CANDIDATE_INTENTS[heat]}.`,
    `- ${heat === 'clean' ? 3 : 2} to ${SPOKEN_LINE_MAX_WORDS - 2} words each, first person.`,
    '- It must fit exactly what is happening right now.',
    ...GROUNDED_RULES,
    ...HEAT_RULES[heat],
    GROUNDED_EXAMPLES[heat] ?? '',
    OPENING_RULE,
    '- No quotation marks, no stage directions, no emojis, no hashtags, no names of real people or brands.',
    '- Reply with the four numbered lines only.',
  ].filter(Boolean);
  const user = [
    `Scene: ${input.scene.trim().slice(0, 400)}`,
    input.setting?.trim() ? `Where: ${input.setting.trim().slice(0, 200)}` : '',
    input.when?.trim() ? `When: ${input.when.trim()}` : '',
    input.personality?.trim()
      ? `Personality (tone only, not the topic): ${input.personality.trim().slice(0, 300)}`
      : '',
    input.avoid?.length ? `Do not repeat: ${input.avoid.slice(0, 6).join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return [
    { role: 'system' as const, content: lines.join('\n') },
    { role: 'user' as const, content: user },
  ];
}

const STOCK_WORDS = /\b(perfect|perfectly|light|glow|glows|flicker|vibes?|magic)\b/i;
const STOP_WORDS = new Set(
  'the a an and or of to in on at with her his their she he it is are for from by up one two both over this that'.split(
    ' '
  )
);

function contentWords(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z]+/g) ?? [])
      .filter(word => word.length > 3 && !STOP_WORDS.has(word))
      .map(word => word.replace(/(es|s)$/, ''))
  );
}

/**
 * The numbered candidates → the one most tied to the scene (shared words), without stock words or
 * the "That X? …" formula and not already used nearby; ties picked at random.
 */
export function pickSpokenLine(
  reply: string | null | undefined,
  context: { scene: string; setting?: string; avoid?: string[] },
  random: () => number = Math.random
): string {
  const avoid = new Set((context.avoid ?? []).map(line => line.toLowerCase()));
  const candidates = (reply ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .split('\n')
    .map(line => parseSpokenLine(line.replace(/^\s*\d+\s*[.):-]\s*/, '')))
    .filter(line => line && !avoid.has(line.toLowerCase()));
  if (!candidates.length) return '';
  const sceneWords = contentWords(`${context.scene} ${context.setting ?? ''}`);
  const scored = candidates.map(line => ({
    line,
    score:
      [...contentWords(line)].filter(word => sceneWords.has(word)).length -
      (STOCK_WORDS.test(line) ? 2 : 0) -
      (/^(that|this)\b[^?]{0,24}\?/i.test(line) ? 1 : 0),
  }));
  const best = Math.max(...scored.map(entry => entry.score));
  const top = scored.filter(entry => entry.score === best);
  return top[Math.floor(random() * top.length)]!.line;
}

/** The LLM's reply as a usable line, or '' when it is not one. */
export function parseSpokenLine(reply: string | null | undefined): string {
  const first =
    (reply ?? '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .split('\n')
      .map(line => line.trim())
      .find(line => line && !/^(line|answer|here)[^:]*:\s*$/i.test(line)) ?? '';
  const cleaned = first
    .replace(/^(line|answer)\s*:\s*/i, '')
    // *sighs*, (laughs), [smiles]: stage directions, not words.
    .replace(/\*[^*]+\*/g, ' ')
    .replace(/^[-•]\s*/, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/#\w+/g, '');
  const line = normalizeSpokenLine(cleaned.replace(/^['‘’]+|['‘’]+$/g, ''));
  const words = line.split(/\s+/).filter(Boolean).length;
  return words >= 2 && words <= SPOKEN_LINE_MAX_WORDS ? line : '';
}

/** Ask `/api/spoken-line` for a line (client). Rejects with the server's message. */
export async function requestSpokenLine(
  input: SpokenLineRequest,
  llmBody?: Record<string, unknown>
): Promise<string> {
  const response = await fetch('/api/spoken-line', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...input, ...llmBody }),
  });
  const data = (await response.json().catch(() => ({}))) as { line?: string; error?: string };
  if (!response.ok || !data.line) throw new Error(data.error ?? 'Could not suggest a line.');
  return data.line;
}
