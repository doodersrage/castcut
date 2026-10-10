/**
 * "Score this film": an original instrumental for a cut, from ACE-Step 1.5 (ComfyUI core nodes,
 * the official turbo all-in-one checkpoint). The Day mood / theme or the Story tone picks the
 * style; the length follows the cut. Live (2026-10-10): 30 s of instrumental indie pop in 8 s of
 * render, no vocals detected.
 */

export const ACE_STEP_CHECKPOINT = 'ace_step_1.5_turbo_aio.safetensors';
export const ACE_STEP_REQUIRED_NODES = [
  'TextEncodeAceStepAudio1.5',
  'EmptyAceStep1.5LatentAudio',
  'VAEDecodeAudio',
  'SaveAudioMP3',
] as const;
export const FILM_SCORE_SAVE_NODE = '8';

export type FilmScoreBrief = {
  /** Day mood or theme id (everyday, workday, date-night, …). */
  mood?: string;
  /** Story tone (cozy, noir, romantic, …). */
  tone?: string;
};

type Style = { tags: string; bpm: number; key: string };

const STYLES: Record<string, Style> = {
  everyday: {
    tags: 'warm acoustic indie pop, strummed guitar, light percussion, cheerful and easygoing',
    bpm: 104,
    key: 'G major',
  },
  workday: {
    tags: 'upbeat indie pop for a day-in-the-life montage, bright plucked guitar, warm bass, claps and tight drums, optimistic city energy',
    bpm: 112,
    key: 'C major',
  },
  vacation: {
    tags: 'sunny tropical house, steel drums, marimba, airy synths, relaxed summer groove',
    bpm: 108,
    key: 'F major',
  },
  sport: {
    tags: 'driving electronic workout track, punchy kick, energetic synth bass, motivating build-ups',
    bpm: 128,
    key: 'A minor',
  },
  suggestive: {
    tags: 'sultry slow R&B instrumental, smooth electric piano, deep bass, soft snaps, late-night mood',
    bpm: 84,
    key: 'D minor',
  },
  intimate: {
    tags: 'slow sensual downtempo, soft pads, warm Rhodes, gentle heartbeat bass, candlelit and close',
    bpm: 72,
    key: 'E minor',
  },
  raunchy: {
    tags: 'deep sultry trip-hop, heavy slow groove, breathy synth pads, dark bass, seductive',
    bpm: 80,
    key: 'C minor',
  },
  'date-night': {
    tags: 'romantic smooth jazz-pop, brushed drums, warm piano, soft saxophone, evening glow',
    bpm: 92,
    key: 'Bb major',
  },
  'night-out': {
    tags: 'glossy nu-disco, four-on-the-floor, funky bass, shimmering synths, city lights',
    bpm: 120,
    key: 'A minor',
  },
  'lazy-sunday': {
    tags: 'mellow lo-fi hip-hop, dusty vinyl, soft keys, lazy swing, cozy morning',
    bpm: 78,
    key: 'F major',
  },
  photoshoot: {
    tags: 'chic fashion runway electronica, minimal beat, sleek synths, confident strut',
    bpm: 118,
    key: 'G minor',
  },
  cosplay: {
    tags: 'energetic anime-style J-pop instrumental, bright synths, fast drums, playful and heroic',
    bpm: 140,
    key: 'E major',
  },
  // Story tones.
  silly: {
    tags: 'quirky playful pizzicato strings, bouncy tuba, whistles, comedic',
    bpm: 116,
    key: 'C major',
  },
  cinematic: {
    tags: 'cinematic orchestral score, sweeping strings, warm horns, emotional build',
    bpm: 90,
    key: 'D minor',
  },
  cozy: {
    tags: 'cozy acoustic folk, soft guitar, light piano, warm and homely',
    bpm: 88,
    key: 'G major',
  },
  chaotic: {
    tags: 'frantic punk-rock instrumental, fast drums, distorted guitars, wild energy',
    bpm: 170,
    key: 'E minor',
  },
  noir: {
    tags: 'film noir jazz, muted trumpet, upright bass, brushed drums, smoky and mysterious',
    bpm: 76,
    key: 'C minor',
  },
  romantic: {
    tags: 'romantic piano and strings, tender, swelling, heartfelt',
    bpm: 80,
    key: 'Eb major',
  },
  horror: {
    tags: 'dark ambient horror score, dissonant strings, low drones, tense',
    bpm: 70,
    key: 'C# minor',
  },
  deadpan: {
    tags: 'dry minimalist indie, sparse guitar, steady simple beat, understated',
    bpm: 96,
    key: 'D major',
  },
  epic: {
    tags: 'epic orchestral trailer music, big drums, brass, choir pads, heroic',
    bpm: 100,
    key: 'D minor',
  },
  dreamy: {
    tags: 'dreamy ambient shoegaze, washed-out guitars, shimmering pads, floating',
    bpm: 82,
    key: 'A major',
  },
  gritty: {
    tags: 'gritty blues rock instrumental, overdriven guitar, heavy drums, raw',
    bpm: 100,
    key: 'E minor',
  },
  melancholy: {
    tags: 'melancholic solo piano with soft cello, slow and reflective',
    bpm: 68,
    key: 'A minor',
  },
};

/** Style for the brief: the mood / theme first, then the Story tone, else Everyday's. */
export function filmScoreStyle(brief: FilmScoreBrief): Style {
  const style =
    (brief.mood && STYLES[brief.mood]) || (brief.tone && STYLES[brief.tone]) || STYLES.everyday!;
  return { ...style, tags: `${style.tags}, instrumental, no vocals` };
}

/** How long to render: the cut's length plus a tail to fade on (ACE-Step can end early). */
export function filmScoreSeconds(cutSeconds: number): number {
  const secs = Number.isFinite(cutSeconds) && cutSeconds > 0 ? cutSeconds : 45;
  return Math.min(240, Math.max(15, Math.ceil(secs + 6)));
}

/** The cut's length from its shots: clips as they run (4 s when unknown), stills as they hold. */
export function estimateCutSeconds(
  shots: Array<{ kind?: string; holdSec?: number }>,
  options: { stillHoldSec?: number; crossfadeSec?: number; length?: unknown } = {}
): number {
  if (typeof options.length === 'number' && options.length > 0) return options.length;
  const still = options.stillHoldSec ?? 2.5;
  const total = shots.reduce(
    (sum, shot) =>
      sum + (shot.holdSec && shot.holdSec > 0 ? shot.holdSec : shot.kind === 'clip' ? 4 : still),
    0
  );
  return Math.max(
    10,
    total - Math.max(0, options.crossfadeSec ?? 0) * Math.max(0, shots.length - 1)
  );
}

/** The ACE-Step 1.5 graph (the official turbo AIO template: 8 steps, CFG 1, euler / simple, shift 3). */
export function buildFilmScoreGraph(input: {
  tags: string;
  bpm: number;
  key: string;
  seconds: number;
  seed: number;
  prefix: string;
}): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: ACE_STEP_CHECKPOINT } },
    '2': {
      class_type: 'TextEncodeAceStepAudio1.5',
      inputs: {
        clip: ['1', 1],
        tags: input.tags,
        lyrics: '[Instrumental]',
        seed: input.seed,
        bpm: input.bpm,
        duration: input.seconds,
        timesignature: '4',
        language: 'en',
        keyscale: input.key,
        generate_audio_codes: true,
        cfg_scale: 2,
        temperature: 0.85,
        top_p: 0.9,
        top_k: 0,
        min_p: 0,
      },
    },
    '3': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['2', 0] } },
    '4': {
      class_type: 'EmptyAceStep1.5LatentAudio',
      inputs: { seconds: input.seconds, batch_size: 1 },
    },
    '5': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3 } },
    '6': {
      class_type: 'KSampler',
      inputs: {
        model: ['5', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
        seed: input.seed,
        steps: 8,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
      },
    },
    '7': { class_type: 'VAEDecodeAudio', inputs: { samples: ['6', 0], vae: ['1', 2] } },
    [FILM_SCORE_SAVE_NODE]: {
      class_type: 'SaveAudioMP3',
      inputs: { audio: ['7', 0], filename_prefix: input.prefix, quality: 'V0' },
    },
  };
}

/** Ask the server to score a cut (client). Resolves to the track's URL and a label. */
export async function requestFilmScore(input: {
  brief: FilmScoreBrief;
  cutSeconds: number;
}): Promise<{ url: string; label: string }> {
  const response = await fetch('/api/film/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  });
  const data = (await response.json().catch(() => ({}))) as {
    url?: string;
    label?: string;
    error?: string;
  };
  if (!response.ok || !data.url) throw new Error(data.error ?? 'Could not score the film.');
  return { url: data.url, label: data.label ?? 'Score' };
}
