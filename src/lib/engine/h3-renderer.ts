/**
 * MiniMax-H3 clip engine (2026-10-14): image-to-video with its own sound, from MiniMax's FL2VA
 * model (pruned int8) with lightx2v's 8-step Turbo LoRA run at 6 steps, the nvfp4 text encoder.
 *
 * Live on four Day stills against LTX-2.5 and WAN (same directions): the best motion and scene
 * coherence by eye, fuller sound (mean −14 dB vs LTX −25/−28), spoken lines word for word — at
 * ~145 s a clip (LTX ~29 s, WAN ~190 s silent). Face match median 0.24 (LTX 0.17, WAN 0.37).
 * Tried and left out: the 4-step Turbo v1.2 LoRA (~106 s; light streaks, less motion, face
 * 0.18), Reference-to-video from the plate (invents a new scene), the int8 text encoder (spilled
 * into RAM and swap on a 24 GB card).
 *
 * Adult (2026-10-14, 7 sweep stills × two prompt sets): solo poses held 3 of 3; two-person acts
 * held 8 of 8 where WAN held 2 of 8 (its "motion" was mostly the pair coming apart — he gets up,
 * the camera pushes in). H3 moves about a third as much as WAN; a harder pace line raised it
 * ~1.4× but lost the oral clip, so the app's own intimate clip prompt is kept. Its sound there is
 * breathing and sighs, no words.
 *
 * Licence: MiniMax's model licence excludes use in the US, EU, UK and South Korea — said where
 * the engine is offered and downloaded. Rides the WAN clip graph like LTX-2.5 (ltx25-renderer.ts).
 */

import { PRODUCT_OUTPUT_PREFIX } from '../app/brand';
import {
  CLIP_SAMPLERS,
  CLIP_SAVES,
  findEndImageLoader,
  findStartImage,
  traceText,
} from '../video/ltx25-renderer';

export const H3_MODEL_ID = 'minimax-h3';
export const H3_REQUIRED_NODE = 'MiniMaxH3ImageToVideo';
export const H3_FILES = {
  transformer: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
  turboLora: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
  textEncoder: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  videoVae: 'minimax_h3_video_vae_fp16.safetensors',
  audioVae: 'minimax_h3_audio_vae_fp32.safetensors',
} as const;
/**
 * MiniMax-H3's reference model (M11): the same text encoder and VAEs, its own transformer and
 * Turbo LoRA. A part rendered on it sees the Cast's pictures as well as the frame it starts from.
 */
export const H3_REF_FILES = {
  transformer: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
  turboLora: 'minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors',
} as const;
export const H3_REF_NODE = 'MiniMaxH3ReferenceToVideo';
export const H3_REF_STEPS = 8;

export const H3_LICENCE_NOTE =
  'MiniMax-H3’s licence does not allow use in the US, EU, UK or South Korea.';
/** The live test's step count for the 8-step Turbo LoRA (as good as 8, a quarter faster). */
export const H3_STEPS = 6;
/** Long side of the clip (the tested 768×1024 for a 3:4 still). */
export const H3_LONG_SIDE = 1024;
const H3_FPS = 24;
/** Frame counts sit on a 17k+5 grid; 124 (~5 s) is the shortest trained length. */
const H3_MIN_FRAMES = 124;
/**
 * H3's own shot length. Past it H3 does not carry the shot on, it starts a new one: a 10 s
 * running-away clip (243 frames, 2026-10-24) hard-cut at frame ~120 to a front-on face close-up,
 * though the prompt said one continuous shot. Longer clips are chained parts of this length
 * (patchH3ReplayGraph, clip/extend-server.ts).
 */
export const H3_PART_FRAMES = H3_MIN_FRAMES;
const H3_MAX_FRAMES = 362;
/**
 * A long part (M11 T13): up to H3's longest trained length, one continuous shot when the prompt
 * times its action in blocks ("0–5s: … 5–10s: … 10–15s: …") and says no cuts — live
 * (2026-10-29, the beach clip): two 15 s renders held one take, the framing and their texture to
 * the end, where the same 15 s with one action cut to a new shot at 5.5 s. A 30 s clip is then two
 * hops, not five, and each hop is where the detail went. Its sound drifted into music (as the
 * first clip's does past H3's own length), so a long part renders silent.
 */
export const H3_LONG_PART_FRAMES = H3_MAX_FRAMES;

/** The fewest frames on H3's grid (17k + 5, at least its shortest) holding `frames`. */
export function h3GridFrames(frames: number): number {
  const steps = Math.max(0, Math.ceil((Math.max(frames, H3_MIN_FRAMES) - H3_MIN_FRAMES) / 17));
  return Math.min(H3_MAX_FRAMES, H3_MIN_FRAMES + steps * 17);
}

/** A long part's action, timed: "0–5s: she … 5–10s: she …" (whole seconds from the part's start). */
export function h3TimedBlocks(blocks: ReadonlyArray<{ beat: string; seconds: number }>): string {
  let at = 0;
  return blocks
    .map(block => {
      const from = Math.round(at);
      at += block.seconds;
      const text = block.beat.trim().replace(/[.\s]+$/, '');
      return `${from}–${Math.round(at)}s: ${text}.`;
    })
    .join(' ');
}

/**
 * How H3's MP4 is saved (M11 T3): re-encoded at CRF 12. SaveVideo's "auto" kept H3's own stream,
 * about 1–2 Mbit/s at 768×1024 — and a longer clip's next part starts from that last frame, so the
 * blocking compounded part over part. (Older ComfyUI without these options ignores them.)
 */
export const H3_SAVE_QUALITY = { 'codec.encoding': 're-encode', 'codec.encoding.crf': 12 } as const;

export function isH3Model(model: string | null | undefined): boolean {
  return String(model ?? '').trim() === H3_MODEL_ID;
}

/** H3 frames for a WAN clip's length (frames at `fps`): 17k+5, between 124 and 362. */
export function h3FrameCount(frames: number, fps: number): number {
  const seconds = frames > 0 && fps > 0 ? frames / fps : 4;
  const snapped = Math.round((seconds * H3_FPS - 5) / 17) * 17 + 5;
  return Math.min(H3_MAX_FRAMES, Math.max(H3_MIN_FRAMES, snapped));
}

type WorkflowNode = { class_type?: string; inputs?: Record<string, unknown>; _meta?: unknown };
type Workflow = Record<string, WorkflowNode>;

const isRef = (value: unknown): value is [string, number] =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === 'string';

/**
 * H3 runs with no negative prompt, and a camera sentence that names what must not happen ("does
 * not move, zoom or push in, and there is no close-up") made it cut to a face close-up mid-clip:
 * a night talking clip replayed on its own seed cut at 2.0 s every time with that sentence and
 * never with it said positively (2026-10-14; 9 other seeds cut on neither). Each camera sentence
 * becomes one fixed tripod framing, and the words zoom / push-in / close-up go.
 */
export function h3CameraWords(prompt: string): string {
  return (
    prompt
      // "Camera: … " sentences that list what the camera must not do — the wording that held.
      .replace(/Camera:[^.]*\b(?:zoom|push[- ]?in|close-?ups?)\b[^.]*\./gi, match => {
        const who = /\b(her|his|their) whole body\b/i.exec(match)?.[1];
        return `Camera: one fixed wide shot on a tripod for the whole clip, ${
          who ? `${who} whole body in view from head to feet, ` : ''
        }the same framing as the first frame from start to end.`;
      })
      // Any other sentence naming them ("it does not move, zoom or push in").
      .replace(/[^.]*\b(?:zoom|push(?:es)?[- ]?in|close-?ups?)\b[^.]*\.\s*/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

export type H3ConvertResult = { workflow: Workflow; converted: boolean; reason?: string };

/**
 * A talking clip longer than H3's default: the line is ~5 s of speech (about 14 words), and with
 * nothing said about the rest H3 filled the extra seconds with made-up, speech-like babble. Said
 * positively (H3 has no negative prompt, see h3CameraWords).
 */
export const H3_LONG_TALK_TAIL =
  'The line is said once. After it the person stays quiet with the mouth closed, and only soft ' +
  'room sound is heard until the end of the clip.';

/**
 * Whether H3 renders sound for this clip. Its sound is made in the same pass as the picture and
 * nothing in a motion prompt steers it: at the default length it stayed room sound, but a longer
 * clip without a spoken line drifted into music. Past the default a clip with no line is silent,
 * as LTX's are (Add sound gives it the place's sound). `speech` unknown: sound, as before.
 */
export function h3RendersSound(frames: number, speech: boolean | undefined): boolean {
  return speech !== false || frames <= H3_MIN_FRAMES;
}

/**
 * WAN (or any KSampler + LoadImage + video save) clip graph → MiniMax-H3 first(+last)-frame graph
 * with sound, saved as an MP4. The canvas follows the still's aspect (GetImageSize + math) at a
 * long side of 1024. A quoted line in the prompt is spoken. Unchanged when it isn't a clip graph.
 */
export function convertVideoWorkflowToH3(
  input: Record<string, unknown>,
  options: {
    seed?: number;
    endImage?: string;
    /** The clip has a spoken line (videoSpeech); undefined keeps the old always-sound graph. */
    speech?: boolean;
  } = {}
): H3ConvertResult {
  const workflow = input as Workflow;
  const entries = Object.entries(workflow);
  const sampler = entries.find(([, node]) => CLIP_SAMPLERS.has(node?.class_type ?? ''))?.[1];
  const save = entries.find(([, node]) => CLIP_SAVES.has(node?.class_type ?? ''))?.[1];
  const endLoader = findEndImageLoader(workflow);
  const image = findStartImage(workflow, endLoader);
  const endFromGraph = endLoader ? workflow[endLoader]?.inputs?.image : undefined;
  const endImage = [options.endImage, endFromGraph]
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .find(value => value && !value.includes('{{'));
  if (!sampler?.inputs || !save?.inputs || !image) {
    return { workflow, converted: false, reason: 'not an image-to-video clip graph' };
  }
  const positive = traceText(workflow, sampler.inputs.positive) ?? '';
  if (!positive.trim()) return { workflow, converted: false, reason: 'no prompt text' };

  const i2v = entries.find(([, node]) =>
    /ImageToVideo|ImgToVideo|FrameToVideo/.test(node?.class_type ?? '')
  )?.[1];
  const latentRef = sampler.inputs.latent_image;
  const latent = isRef(latentRef) ? workflow[latentRef[0]] : undefined;
  const sized = i2v?.inputs?.length !== undefined ? i2v : latent;
  const length = Number(sized?.inputs?.length) || 64;
  const fps = Number(save.inputs.fps ?? save.inputs.frame_rate) || 16;
  const seed = Number(options.seed ?? sampler.inputs.seed ?? sampler.inputs.noise_seed) || 0;
  const prefix = String(save.inputs.filename_prefix ?? PRODUCT_OUTPUT_PREFIX);
  // The still's own side scaled so its long side is H3_LONG_SIDE, on the 32-px grid.
  const frames = h3FrameCount(length, fps);
  const sound = h3RendersSound(frames, options.speech);
  const prompt = [
    h3CameraWords(positive.trim()),
    options.speech === true && frames > H3_MIN_FRAMES ? H3_LONG_TALK_TAIL : '',
  ]
    .filter(Boolean)
    .join(' ');
  const side = (own: 'a' | 'b') =>
    `max(256, round(${own} * ${H3_LONG_SIDE} / max(a, b) / 32) * 32)`;

  const next: Workflow = {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: H3_FILES.transformer, weight_dtype: 'default' },
    },
    '2': {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ['1', 0], lora_name: H3_FILES.turboLora, strength_model: 1 },
    },
    '3': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: H3_FILES.textEncoder, type: 'minimax', device: 'default' },
    },
    '4': { class_type: 'VAELoader', inputs: { vae_name: H3_FILES.videoVae } },
    '5': { class_type: 'VAELoader', inputs: { vae_name: H3_FILES.audioVae } },
    '6': { class_type: 'LoadImage', inputs: { image } },
    '7': { class_type: 'GetImageSize', inputs: { image: ['6', 0] } },
    '8': {
      class_type: 'ComfyMathExpression',
      inputs: { expression: side('a'), 'values.a': ['7', 0], 'values.b': ['7', 1] },
    },
    '9': {
      class_type: 'ComfyMathExpression',
      inputs: { expression: side('b'), 'values.a': ['7', 0], 'values.b': ['7', 1] },
    },
    '10': {
      class_type: H3_REQUIRED_NODE,
      inputs: {
        clip: ['3', 0],
        vae: ['4', 0],
        prompt,
        width: ['8', 1],
        height: ['9', 1],
        length: frames,
        first_frame: ['6', 0],
        ...(endImage ? { last_frame: ['11', 0] } : {}),
      },
    },
    '12': { class_type: 'RandomNoise', inputs: { noise_seed: seed } },
    '13': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } },
    '14': {
      class_type: 'BasicScheduler',
      inputs: { model: ['2', 0], scheduler: 'simple', steps: H3_STEPS, denoise: 1 },
    },
    '15': { class_type: 'BasicGuider', inputs: { model: ['2', 0], conditioning: ['10', 0] } },
    '16': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['12', 0],
        guider: ['15', 0],
        sampler: ['13', 0],
        sigmas: ['14', 0],
        latent_image: ['10', 1],
      },
    },
    '17': { class_type: 'VAEDecode', inputs: { samples: ['16', 0], vae: ['4', 0] } },
    '19': {
      class_type: 'CreateVideo',
      inputs: { images: ['17', 0], ...(sound ? { audio: ['18', 0] } : {}), fps: H3_FPS },
    },
    '20': {
      class_type: 'SaveVideo',
      inputs: {
        video: ['19', 0],
        filename_prefix: prefix,
        format: 'mp4',
        codec: 'h264',
        ...H3_SAVE_QUALITY,
      },
    },
  };
  if (endImage) next['11'] = { class_type: 'LoadImage', inputs: { image: endImage } };
  if (sound) {
    next['18'] = { class_type: 'VAEDecodeAudio', inputs: { samples: ['16', 0], vae: ['5', 0] } };
  } else {
    delete next['5'];
  }
  return { workflow: next, converted: true };
}

/** A graph rendered by MiniMax-H3 (its history replays as "Make it 30 s" parts). */
export function isH3ClipGraph(graph: Record<string, WorkflowNode | undefined>): boolean {
  return Object.values(graph).some(node => node?.class_type === H3_REQUIRED_NODE);
}

/**
 * A part's prompt from the clip's own: the part's beat first, the clip's spoken line taken out
 * (only the first clip says it — a part says its own `line`, if any), the "Ns clip" length set
 * to the part's, and the place's sound named (said positively — H3 has no negative prompt).
 */
export function h3PartPrompt(
  clipPrompt: string,
  part: {
    beat: string;
    place?: string;
    line?: string;
    speaker?: 'She' | 'He';
    /** A long part: its action in timed blocks, rendered silent (H3_LONG_PART_FRAMES). */
    blocks?: ReadonlyArray<{ beat: string; seconds: number }>;
    /** What the first frame shows them holding — kept in hand (a phone vanished mid-clip). */
    held?: readonly string[];
    /** No line in a clip whose other parts speak: said outright that nobody speaks. */
    wordless?: boolean;
  }
): string {
  const held = (part.held ?? []).filter(item => item.trim());
  const place = part.place
    ?.trim()
    .replace(/[.\s]+$/, '')
    .replace(/^(a|an|the)\s+/i, '');
  const own = clipPrompt
    .replace(H3_LONG_TALK_TAIL, ' ')
    // Sentences that quote a spoken line.
    .replace(/[^.!?]*["“][^"”]+["”][^.!?]*[.!?]?/g, ' ')
    .replace(/^\s*\d+(?:\.\d+)?s clip,?\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[a-z]/, letter => letter.toUpperCase());
  const line = part.line?.trim().replace(/["“”]/g, '');
  const who = part.speaker ?? 'She';
  // The framing held, said positively (M11: a part told only to carry on pushed in part over
  // part); prop nouns from the clip's camera and quality words left out — a part drew a tripod,
  // another a studio light.
  return h3CameraWords(
    [
      part.blocks?.length
        ? `${Math.round(part.blocks.reduce((sum, block) => sum + block.seconds, 0))}s clip, one continuous shot, no cuts, from the first frame to the last — a single take carrying straight on from the first frame. ${h3TimedBlocks(part.blocks)}`
        : `5s clip, one continuous shot with no cuts, carrying straight on from the first frame to the last. ${part.beat.trim()}`,
      `The framing stays as in the first frame from start to end: the same distance, the same height, everything in view that was in view. The place around ${who === 'He' ? 'him' : 'her'} stays exactly as in the first frame, with only what is already there.`,
      held.length ? `${who} keeps holding ${held.join(' and ')} the whole time.` : '',
      // Live (2026-10-31): a part reached its end pose in a second and froze there, and
      // sunglasses came and went between parts.
      part.blocks?.length
        ? ''
        : `The movement is unhurried and fills the whole part: ${who.toLowerCase()} makes the gesture, then settles back into a relaxed pose — never freezing, still breathing and shifting a little to the last frame. ${who} wears exactly what ${who === 'He' ? 'he' : 'she'} wears in the first frame the whole time, nothing put on or taken off.`,
      own,
      line
        ? `${who} says, "${line}" — ${who === 'He' ? 'his' : 'her'} lips move with every word.`
        : part.wordless
          ? // Live: a wordless part of a talking clip made up a line of its own.
            `Nobody speaks in this part — no words, ${who === 'He' ? 'his' : 'her'} mouth closed or smiling; only the sound of the place.`
          : '',
      part.blocks?.length
        ? 'Camera: one locked-off shot, no cuts, no new shot, no camera move.'
        : `Sound: the natural sound of ${place ? `the ${place}` : 'the place'} — soft room tone and the small sounds of what is happening${line ? ', under the voice' : ''}.`,
    ]
      .filter(Boolean)
      .join(' ')
  )
    .replace(/\s+on a tripod\b/gi, '')
    .replace(/studio-grade lighting/gi, 'the place’s own light');
}

/**
 * The clip's H3 graph replayed as one part: it starts on `lastFrame` (no last frame pinned),
 * runs H3's own shot length, renders sound, and says `prompt`. Null when it is not an H3 graph.
 */
/**
 * A part's graph (patchH3ReplayGraph) on H3's reference model (M11): <Picture 1> is the frame it
 * starts from — H3 starts the video on it — and the rest are the Cast's pictures (its face, its
 * look plate), named in the prompt with what they show; `look` restates her appearance (a picture
 * tag alone carries no identity). The first frame is not pinned again with a guide: in the test
 * that made the part cut to the reference's own composition. Null when it is not an H3 graph.
 */
export function withH3References(
  source: Workflow,
  input: {
    /** Input-folder images: [the start frame, …the Cast's pictures]. */
    pictures: ReadonlyArray<{ image: string; shows: string }>;
    look?: string;
  }
): Workflow | null {
  const graph = JSON.parse(JSON.stringify(source)) as Workflow;
  const entries = Object.entries(graph);
  const h3 = entries.find(([, node]) => node?.class_type === H3_REQUIRED_NODE);
  const unet = entries.find(([, node]) => node?.class_type === 'UNETLoader')?.[1];
  const lora = entries.find(([, node]) => node?.class_type === 'LoraLoaderModelOnly')?.[1];
  const scheduler = entries.find(([, node]) => node?.class_type === 'BasicScheduler')?.[1];
  const audioVae = entries.find(
    ([, node]) => node?.class_type === 'VAELoader' && node.inputs?.vae_name === H3_FILES.audioVae
  )?.[0];
  if (!h3?.[1]?.inputs || !unet?.inputs || !input.pictures.length) return null;
  const old = h3[1].inputs;
  unet.inputs.unet_name = H3_REF_FILES.transformer;
  if (lora?.inputs) lora.inputs.lora_name = H3_REF_FILES.turboLora;
  if (scheduler?.inputs) scheduler.inputs.steps = H3_REF_STEPS;
  const tags = input.pictures
    .map((picture, k) => `<Picture ${k + 1}> is ${picture.shows}.`)
    .join(' ');
  const refs: Record<string, unknown> = {};
  input.pictures.forEach((picture, k) => {
    // The start frame's loader (its size sets the video's) is <Picture 1>.
    const loader = k === 0 && isRef(old.first_frame) ? graph[old.first_frame[0]] : undefined;
    if (loader?.inputs && loader.class_type === 'LoadImage') {
      loader.inputs.image = picture.image;
      refs['ref_images.ref_image_1'] = old.first_frame;
      return;
    }
    const id = `h3ref${k + 1}`;
    graph[id] = { class_type: 'LoadImage', inputs: { image: picture.image } };
    refs[`ref_images.ref_image_${k + 1}`] = [id, 0];
  });
  graph[h3[0]] = {
    class_type: H3_REF_NODE,
    inputs: {
      clip: old.clip,
      prompt: [tags, input.look?.trim(), String(old.prompt ?? '')].filter(Boolean).join(' '),
      width: old.width,
      height: old.height,
      length: old.length,
      ref_image_size: 'match',
      vae: old.vae,
      ...(audioVae ? { audio_vae: [audioVae, 0] } : {}),
      ...refs,
    },
  };
  return graph;
}

/**
 * The line given its own time, and silence after it (M11 T16). Live: on the reference model a short
 * line left the rest of the part to fill, and 2 of 5 parts babbled on after it ("…let's go to grab
 * a wretch"); told the line's window and that she stops after it, both re-rendered parts said
 * their line once (Whisper) — "say nothing more" alone still left a tail on one.
 */
export function timedLine(prompt: string, seconds: number, who: 'She' | 'He' = 'She'): string {
  // "says, …", "says clearly, …" (Day's talking clips), "says softly …".
  const line = prompt.match(/\bsays\b[^"]{0,24}"([^"]+)"/)?.[1]?.trim();
  if (!line) return '';
  const words = line.split(/\s+/).filter(Boolean).length;
  const span = Math.max(1, seconds);
  const end = Math.min(span - 1, Math.max(2, Math.round((words / 2.6 + 0.8) * 10) / 10));
  const fmt = (value: number) => String(Math.round(value * 10) / 10);
  const pronoun = who === 'He' ? 'he' : 'she';
  return `Timing: 0–${fmt(end)}s: ${pronoun} says "${line}" once. ${fmt(end)}–${fmt(span)}s: ${pronoun} stops talking, closes ${who === 'He' ? 'his' : 'her'} mouth and listens — silence from ${who === 'He' ? 'him' : 'her'}, only the sound of the place.`;
}

/**
 * `graph` with its H3 node's spoken line timed ({@link timedLine}): for a talking part with no
 * voice to keep, which renders on the plain model — without it a line came out garbled or
 * repeated to the end of the part. Unchanged when the prompt has no line.
 */
export function withH3TimedLine<T extends Record<string, WorkflowNode | undefined>>(
  graph: T,
  who: 'She' | 'He' = 'She'
): T {
  const id = Object.keys(graph).find(key =>
    [H3_REQUIRED_NODE, H3_REF_NODE].includes(graph[key]?.class_type ?? '')
  );
  const node = id ? graph[id] : undefined;
  if (!id || !node) return graph;
  const prompt = String(node.inputs?.prompt ?? '');
  if (/\bTiming: 0–/.test(prompt)) return graph;
  const timing = timedLine(prompt, Number(node.inputs?.length) / 24 || 5, who);
  if (!timing) return graph;
  return { ...graph, [id]: { ...node, inputs: { ...node.inputs, prompt: `${prompt} ${timing}` } } };
}

/** The guide node that pins a picture (or a clip with its sound) at a frame of an H3 video. */
export const H3_GUIDE_NODE = 'MiniMaxH3AddGuide';
/** Frames of the voice reference clip (H3's 17k+5 grid): ~1.6 s at 24 fps. */
export const H3_VOICE_CLIP_FRAMES = 39;

/**
 * A talking part on the reference model with her voice (M11 T16): `voiceClip` — a short clip of
 * her speaking, with its sound, from the first clip — is <Video 1> / <Audio 1>, the Cast's
 * pictures (if any) come before it, and the part's own first and last frames stay pinned
 * (MiniMaxH3AddGuide, as the first/last-frame model pins them). Live (2026-10-30, a 30 s talking
 * clip): the user heard each plain H3 part as a new voice, the last two as "someone else
 * entirely"; anchored this way the voice held and sounded natural ("sounds better overall"). A
 * 39-frame 512 px reference took 221–227 s a part (the whole 5 s clip at full size: ~430 s).
 * Null when the graph is not H3's first/last-frame one.
 */
export function withH3VoiceAnchor(
  source: Workflow,
  input: {
    /** ComfyUI input video: her speaking, ~1.6 s with sound. */
    voiceClip?: string;
    /**
     * Or, with no clip, a ComfyUI input audio of her voice alone (a voice from the player's own
     * recording): <Audio 1>. Live (2026-10-30, the same two clips): pitch 232 / 186 Hz against
     * 235 / 188 with the clip; the user: "Sounds just like her".
     */
    voiceAudio?: string;
    pictures?: ReadonlyArray<{ image: string; shows: string }>;
    look?: string;
    who?: 'She' | 'He';
  }
): Workflow | null {
  const graph = JSON.parse(JSON.stringify(source)) as Workflow;
  const entries = Object.entries(graph);
  const h3 = entries.find(([, node]) => node?.class_type === H3_REQUIRED_NODE);
  const unet = entries.find(([, node]) => node?.class_type === 'UNETLoader')?.[1];
  const lora = entries.find(([, node]) => node?.class_type === 'LoraLoaderModelOnly')?.[1];
  const scheduler = entries.find(([, node]) => node?.class_type === 'BasicScheduler')?.[1];
  const audioVae = entries.find(
    ([, node]) => node?.class_type === 'VAELoader' && node.inputs?.vae_name === H3_FILES.audioVae
  )?.[0];
  if (!h3?.[1]?.inputs || !unet?.inputs || !audioVae) return null;
  const voiceClip = input.voiceClip?.trim();
  const voiceAudio = input.voiceAudio?.trim();
  if (!voiceClip && !voiceAudio) return null;
  const [id, node] = h3;
  const old = node.inputs!;
  unet.inputs.unet_name = H3_REF_FILES.transformer;
  if (lora?.inputs) lora.inputs.lora_name = H3_REF_FILES.turboLora;
  if (scheduler?.inputs) scheduler.inputs.steps = H3_REF_STEPS;
  const pictures = input.pictures ?? [];
  const refs: Record<string, unknown> = {};
  pictures.forEach((picture, k) => {
    graph[`h3ref${k + 1}`] = { class_type: 'LoadImage', inputs: { image: picture.image } };
    refs[`ref_images.ref_image_${k + 1}`] = [`h3ref${k + 1}`, 0];
  });
  if (voiceClip) {
    graph.h3voice = { class_type: 'LoadVideo', inputs: { file: voiceClip } };
    graph.h3voiceparts = { class_type: 'GetVideoComponents', inputs: { video: ['h3voice', 0] } };
    refs['ref_videos.ref_video_1'] = ['h3voiceparts', 0];
    refs['ref_video_audios.ref_video_audio_1'] = ['h3voiceparts', 1];
  } else {
    graph.h3voice = { class_type: 'LoadAudio', inputs: { audio: voiceAudio } };
    refs['ref_audios.ref_audio_1'] = ['h3voice', 0];
  }
  const who = input.who ?? 'She';
  const them = who === 'He' ? 'him' : 'her';
  const tags = [
    ...pictures.map((picture, k) => `<Picture ${k + 1}> is ${picture.shows}.`),
    `${voiceClip ? `<Video 1> with its sound <Audio 1> is ${them}, speaking` : `<Audio 1> is ${who === 'He' ? 'his' : 'her'} voice`}: ${who.toLowerCase()} speaks in exactly that voice — the same person, pitch, tone, accent and pace. <Audio 1> is only how ${who === 'He' ? 'his' : 'her'} voice sounds, not what ${who === 'He' ? 'he' : 'she'} says.`,
  ].join(' ');
  graph[id] = {
    class_type: H3_REF_NODE,
    inputs: {
      clip: old.clip,
      prompt: [
        tags,
        input.look?.trim(),
        String(old.prompt ?? ''),
        timedLine(String(old.prompt ?? ''), Number(old.length) / 24 || 5, who),
      ]
        .filter(Boolean)
        .join(' '),
      width: old.width,
      height: old.height,
      length: old.length,
      ref_image_size: 'match',
      vae: old.vae,
      audio_vae: [audioVae, 0],
      ...refs,
    },
  };
  // Its first and last frames pinned as the first/last-frame model pinned them.
  let positive: [string, number] = [id, 0];
  const pins: Array<[unknown, number]> = [
    [old.first_frame, 0],
    [old.last_frame, -1],
  ];
  pins.forEach(([image, frame], k) => {
    if (!isRef(image)) return;
    graph[`h3pin${k + 1}`] = {
      class_type: H3_GUIDE_NODE,
      inputs: { positive, vae: old.vae, latent: [id, 1], image, frame_idx: frame },
    };
    positive = [`h3pin${k + 1}`, 0];
  });
  // Whatever read the conditioning reads the pinned one.
  for (const [key, other] of Object.entries(graph)) {
    if (key.startsWith('h3pin') || !other?.inputs) continue;
    for (const [name, value] of Object.entries(other.inputs)) {
      if (isRef(value) && value[0] === id && value[1] === 0) other.inputs[name] = positive;
    }
  }
  return graph;
}

export function patchH3ReplayGraph(
  source: Record<string, WorkflowNode | undefined>,
  input: {
    lastFrame: string;
    prompt: string;
    seed: number;
    prefix: string;
    /** A long part's length (H3's grid; default H3's own shot). */
    frames?: number;
    /** No sound (a long part: its sound drifted into music). */
    silent?: boolean;
    /** A ComfyUI input the part ends on (a keyframe, M11 T14): H3's last frame pinned. */
    endFrame?: string;
  }
): { graph: Workflow; saveNode: string } | null {
  const graph = JSON.parse(JSON.stringify(source)) as Workflow;
  const entries = Object.entries(graph);
  const h3 = entries.find(([, node]) => node?.class_type === H3_REQUIRED_NODE)?.[1];
  const firstRef = h3?.inputs?.first_frame;
  const firstId = isRef(firstRef) ? firstRef[0] : undefined;
  const loader = firstId ? graph[firstId] : undefined;
  const sampler = entries.find(([, node]) => node?.class_type === 'SamplerCustomAdvanced');
  const create = entries.find(([, node]) => node?.class_type === 'CreateVideo')?.[1];
  const save = entries.find(([, node]) => node?.class_type === 'SaveVideo');
  if (!h3?.inputs || !loader?.inputs || loader.class_type !== 'LoadImage') return null;
  if (!sampler || !create?.inputs || !save?.[1].inputs) return null;
  loader.inputs.image = input.lastFrame;
  // Each part starts from the last one's frame: saved near-lossless, so it starts from less mush.
  Object.assign(save[1].inputs, H3_SAVE_QUALITY);
  const lastRef = h3.inputs.last_frame;
  delete h3.inputs.last_frame;
  if (isRef(lastRef) && lastRef[0] !== firstId) delete graph[lastRef[0]];
  if (input.endFrame) {
    graph.h3end = { class_type: 'LoadImage', inputs: { image: input.endFrame } };
    h3.inputs.last_frame = ['h3end', 0];
  }
  h3.inputs.length = input.frames ? h3GridFrames(input.frames) : H3_PART_FRAMES;
  h3.inputs.prompt = input.prompt;
  for (const [, node] of entries) {
    if (node?.class_type === 'RandomNoise' && node.inputs) {
      node.inputs.noise_seed = input.seed % 2 ** 32;
    }
  }
  // A long clip with no line rendered silent (h3RendersSound); a part at H3's own length has sound.
  if (input.silent) {
    delete create.inputs.audio;
  } else if (!isRef(create.inputs.audio)) {
    let vaeId = entries.find(
      ([, node]) => node?.class_type === 'VAELoader' && node.inputs?.vae_name === H3_FILES.audioVae
    )?.[0];
    if (!vaeId) {
      vaeId = 'h3audiovae';
      graph[vaeId] = { class_type: 'VAELoader', inputs: { vae_name: H3_FILES.audioVae } };
    }
    graph.h3audio = {
      class_type: 'VAEDecodeAudio',
      inputs: { samples: [sampler[0], 0], vae: [vaeId, 0] },
    };
    create.inputs.audio = ['h3audio', 0];
  }
  save[1].inputs.filename_prefix = input.prefix;
  return { graph, saveNode: save[0] };
}
