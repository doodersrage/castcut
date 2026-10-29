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
  part: { beat: string; place?: string; line?: string; speaker?: 'She' | 'He' }
): string {
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
      `5s clip, carrying straight on from the first frame. ${part.beat.trim()}`,
      'The framing stays as in the first frame from start to end: the same distance, the same height, everything in view that was in view.',
      own,
      line
        ? `${who} says, "${line}" — ${who === 'He' ? 'his' : 'her'} lips move with every word.`
        : '',
      `Sound: the natural sound of ${place ? `the ${place}` : 'the place'} — soft room tone and the small sounds of what is happening${line ? ', under the voice' : ''}.`,
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
export function patchH3ReplayGraph(
  source: Record<string, WorkflowNode | undefined>,
  input: { lastFrame: string; prompt: string; seed: number; prefix: string }
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
  h3.inputs.length = H3_PART_FRAMES;
  h3.inputs.prompt = input.prompt;
  for (const [, node] of entries) {
    if (node?.class_type === 'RandomNoise' && node.inputs) {
      node.inputs.noise_seed = input.seed % 2 ** 32;
    }
  }
  // A long clip with no line rendered silent (h3RendersSound); a part at H3's own length has sound.
  if (!isRef(create.inputs.audio)) {
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
