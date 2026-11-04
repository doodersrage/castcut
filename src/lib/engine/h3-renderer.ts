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

/** What a reference-model prompt adds that a part must not carry on: its tags, dialogue, sound. */
const H3_REFERENCE_SENTENCE =
  /<(?:Picture|Video|Audio) \d+>|<d>|\(S[12]\)|overall_soundscape:|non_diegetic_music:|silently keeps? looking|The camera never cuts or moves/;

/**
 * A clip rendered on H3's reference model (a kept voice, two people talking: withH3VoiceAnchor,
 * withH3Conversation) as the first/last-frame graph it was made from, for Make longer to replay —
 * read as LTX before, its parts lost H3, the voices and the dialogue fixes. The start (and end)
 * frame come back from the guides that pinned them; the prompt keeps its action and place, not
 * the voice tags, the dialogue or the sound lines (each part says its own). The graph as it is
 * when it is already a first/last-frame graph; null when it is neither.
 */
export function h3ReplaySource(
  source: Record<string, WorkflowNode | undefined>
): Record<string, WorkflowNode | undefined> | null {
  if (isH3ClipGraph(source)) return source;
  const graph = JSON.parse(JSON.stringify(source)) as Workflow;
  const entries = Object.entries(graph);
  const ref = entries.find(([, node]) => node?.class_type === H3_REF_NODE);
  if (!ref?.[1]?.inputs) return null;
  const [id, node] = ref;
  const old = node.inputs!;
  const guides = entries.filter(([, other]) => other?.class_type === H3_GUIDE_NODE);
  const pinned = (frame: number) =>
    guides.find(([, guide]) => Number(guide?.inputs?.frame_idx) === frame)?.[1]?.inputs?.image;
  const first = pinned(0) ?? old['ref_images.ref_image_1'];
  if (!isRef(first)) return null;
  const last = pinned(-1);
  const prompt = String(old.prompt ?? '')
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => !H3_REFERENCE_SENTENCE.test(sentence))
    .join(' ')
    .trim();
  graph[id] = {
    class_type: H3_REQUIRED_NODE,
    inputs: {
      clip: old.clip,
      vae: old.vae,
      prompt,
      width: old.width,
      height: old.height,
      length: old.length,
      first_frame: first,
      ...(isRef(last) ? { last_frame: last } : {}),
    },
  };
  // The reference model's own nodes go; whatever read a guide reads the H3 node again.
  const gone = new Set(Object.keys(graph).filter(key => /^h3(?:pin|voice|ref|vref)/.test(key)));
  for (const key of gone) delete graph[key];
  for (const other of Object.values(graph)) {
    if (!other?.inputs) continue;
    for (const [name, value] of Object.entries(other.inputs)) {
      if (isRef(value) && gone.has(value[0])) other.inputs[name] = [id, 0];
    }
  }
  for (const other of Object.values(graph)) {
    if (other?.class_type === 'UNETLoader' && other.inputs)
      other.inputs.unet_name = H3_FILES.transformer;
    if (other?.class_type === 'LoraLoaderModelOnly' && other.inputs)
      other.inputs.lora_name = H3_FILES.turboLora;
    if (other?.class_type === 'BasicScheduler' && other.inputs) other.inputs.steps = H3_STEPS;
  }
  return graph;
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
    /** People in the shot (M11 T21): two keep both in view, and the motion is theirs. */
    people?: number;
    /** The other person's answer in the same part, and who gives it (two people talking). */
    reply?: string;
    replier?: 'She' | 'He';
  }
): string {
  const two = (part.people ?? 1) >= 2;
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
      `The framing stays as in the first frame from start to end: the same distance, the same height, everything in view that was in view. The place around ${two ? 'them' : who === 'He' ? 'him' : 'her'} stays exactly as in the first frame, with only what is already there.`,
      two ? 'Both people stay in the shot, in view, from the first frame to the last.' : '',
      held.length
        ? two
          ? `They keep holding exactly what they hold — ${held.join(' and ')} — the whole time, the same number of each, every one firmly in a hand.`
          : `${who} keeps holding ${held.join(' and ')} the whole time.`
        : '',
      // Live (2026-10-31): a part reached its end pose in a second and froze there, and
      // sunglasses came and went between parts; "then settles back" made every part stop dead in its
      // last second (stop-motion at each join, v3.4.5).
      part.blocks?.length
        ? ''
        : two
          ? 'The movement is unhurried and keeps going through the whole part — still moving at the last frame, never freezing or holding a pose. Each wears exactly what they wear in the first frame the whole time, nothing put on or taken off.'
          : `The movement is unhurried and keeps going through the whole part — still moving at the last frame, never freezing or holding a pose. ${who} wears exactly what ${who === 'He' ? 'he' : 'she'} wears in the first frame the whole time, nothing put on or taken off.`,
      own,
      line && part.reply?.trim()
        ? `${who} says, "${line}" Then ${part.replier === 'He' ? 'he' : 'she'} answers, "${part.reply.trim().replace(/["“”]/g, '')}"`
        : line
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
    /**
     * Input-folder videos (no sound), each with what it tells — "<Video k> …", the rest of the
     * sentence (M11 T21: the moment before the part, and how the first clip really looks).
     */
    videos?: ReadonlyArray<{ video: string; tells: string }>;
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
  const videoTags = (input.videos ?? [])
    .map((video, k) => `<Video ${k + 1}> ${video.tells}`)
    .join(' ');
  const refs: Record<string, unknown> = {};
  input.videos?.forEach((video, k) => {
    graph[`h3vref${k + 1}`] = { class_type: 'LoadVideo', inputs: { file: video.video } };
    graph[`h3vref${k + 1}p`] = {
      class_type: 'GetVideoComponents',
      inputs: { video: [`h3vref${k + 1}`, 0] },
    };
    refs[`ref_videos.ref_video_${k + 1}`] = [`h3vref${k + 1}p`, 0];
  });
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
      prompt: [videoTags, tags, input.look?.trim(), String(old.prompt ?? '')]
        .filter(Boolean)
        .join(' '),
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

/** A dubbed line's language ("says clearly in Spanish, …", day/dub.ts); English otherwise. */
const DIALOGUE_LANGUAGE =
  /\bin (Spanish|French|German|Italian|Portuguese|Japanese|Korean|Chinese)\b/;

/**
 * The prompt's spoken line in H3's own dialogue syntax: the speaker tagged `(S1)`, the words in
 * `<d>[Language] … .</d>`, and after the line the place's sound — never silence. Live
 * (2026-11-03, three of the user's 5 s talking clips on the reference model, same seeds): the line
 * in plain quotes with "silence from her" after it said the line, fell silent ~1 s, then made up
 * more ("…and didn't just launch night from York"), whatever else changed — a clean voice clip,
 * the voice as sound alone, a pinned last frame, the line spread over the shot (1 clean of 12);
 * the soundscape alone 0 of 3. In this syntax all 3 said the line once and stopped (Whisper).
 * Null when the prompt has no line.
 */
export function h3Dialogue(prompt: string, who: 'She' | 'He' = 'She'): string | null {
  // "says, …", "says clearly, …" (Day's talking clips), "says softly …", "says clearly in Spanish, …".
  const quoted = prompt.match(/\bsays\b([^"]{0,32})"([^"]+)"/);
  const words = quoted?.[2]?.trim();
  if (!quoted || !words) return null;
  const how = quoted[1]!.replace(/[,\s]+$/, '').trimEnd();
  const language = how.match(DIALOGUE_LANGUAGE)?.[1] ?? 'English';
  const line = /[.?!…]$/.test(words) ? words : `${words}.`;
  const place = prompt.match(/\bfirst frame \(([^)]+)\)/)?.[1]?.trim();
  const pronoun = who === 'He' ? 'he' : 'she';
  const said = `${prompt.slice(0, quoted.index)}(S1), on-screen, says${how} <d>[${language}] ${line}</d>${prompt.slice(quoted.index! + quoted[0].length)}`;
  return [
    said.trim(),
    `${who} says it once; after the line ${pronoun} silently keeps looking, lips closed, until the shot ends.`,
    'Only (S1) speaks. No other voices, no voiceover, no singing.',
    `overall_soundscape: the quiet natural sound of ${place ? `the ${place}` : 'the place'} — soft room tone and gentle ambience, no voices.`,
    'non_diegetic_music: N/A',
  ].join(' ');
}

/**
 * `graph` with its H3 node's spoken line in the dialogue syntax ({@link h3Dialogue}): for a talking
 * part with no voice to keep, which renders on the plain model — without it a line came out
 * garbled or repeated to the end of the part. Unchanged when the prompt has no line.
 */
export function withH3Dialogue<T extends Record<string, WorkflowNode | undefined>>(
  graph: T,
  who: 'She' | 'He' = 'She'
): T {
  const id = Object.keys(graph).find(key =>
    [H3_REQUIRED_NODE, H3_REF_NODE].includes(graph[key]?.class_type ?? '')
  );
  const node = id ? graph[id] : undefined;
  if (!id || !node) return graph;
  const prompt = String(node.inputs?.prompt ?? '');
  if (/<d>\[/.test(prompt)) return graph;
  const said = h3Dialogue(prompt, who);
  if (!said) return graph;
  return { ...graph, [id]: { ...node, inputs: { ...node.inputs, prompt: said } } };
}

/** What the voice reference is for: its sound only, and — when known — the words it says, never said. */
function voiceWordsLine(words: string | undefined, who: 'She' | 'He', audio = 1): string {
  const her = who === 'He' ? 'his' : 'her';
  const hers = who === 'He' ? 'his' : 'hers';
  const said = words?.replace(/["“”]/g, '').trim();
  return said
    ? `<Audio ${audio}> is only how ${her} voice sounds: its words ("${said}") are not ${hers} to say — ${who === 'He' ? 'he' : 'she'} never says them.`
    : `<Audio ${audio}> is only how ${her} voice sounds, not what ${who === 'He' ? 'he' : 'she'} says.`;
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
    /**
     * What the voice clip says (Whisper, cast/voice-anchor-server.ts): named as words she never
     * says. Live (2026-11-03): 1 of 12 talking clips said the clip's own "This is what I sound
     * like" after its line; told them, the same seed did not, nor 3 that were clean before.
     */
    clipWords?: string;
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
  // The line in H3's dialogue syntax: the voice belongs to its speaker, (S1).
  const said = h3Dialogue(String(old.prompt ?? ''), who);
  const them = said ? '(S1)' : who === 'He' ? 'him' : 'her';
  const speaker = said ? '(S1)' : who.toLowerCase();
  const tags = [
    ...pictures.map((picture, k) => `<Picture ${k + 1}> is ${picture.shows}.`),
    `${voiceClip ? `<Video 1> with its sound <Audio 1> is ${them}, speaking` : `<Audio 1> is ${who === 'He' ? 'his' : 'her'} voice`}: ${speaker} speaks in exactly that voice — the same person, pitch, tone, accent and pace. ${voiceWordsLine(input.clipWords, who)}`,
  ].join(' ');
  graph[id] = {
    class_type: H3_REF_NODE,
    inputs: {
      clip: old.clip,
      prompt: [tags, input.look?.trim(), said ?? String(old.prompt ?? '')]
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
  pinH3Frames(graph, id, old);
  return graph;
}

/** The reference model's node at `id` pinned to the old graph's first / last frames. */
function pinH3Frames(graph: Workflow, id: string, old: Record<string, unknown>): void {
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
}

/** One person in a two-person conversation (M11 T21): who they are and their kept voice. */
export type H3Speaker = {
  /** How the prompt names them: "woman", "man", "other woman". */
  noun: string;
  who: 'She' | 'He';
  /** Their kept voice clip (ComfyUI input video with sound); none: H3 gives them a voice. */
  voiceClip?: string;
  /** What that clip says (Whisper): named as words they never say. */
  clipWords?: string;
};

/** Said before the lines (M11 T21): one shot, both people in it (with the start frame as Picture 1). */
const H3_CONVERSATION_CAMERA =
  'The camera never cuts or moves to either speaker: one fixed camera on a tripod, both people in frame the whole time, framed exactly as in the first frame.';

/**
 * A conversation prompt's line and reply (conversationClipPrompt: `… says, "X" … answers, "Y"`)
 * in H3's dialogue syntax, two speakers: (S1) says the line, (S2) replies, one at a time. Null
 * when the prompt has no line and reply.
 */
export function h3Conversation(source: string, first: H3Speaker, second: H3Speaker): string | null {
  // One speaker's "the person stays quiet" tail (H3_LONG_TALK_TAIL) is not for two.
  const prompt = source.replace(H3_LONG_TALK_TAIL, '').replace(/\s{2,}/g, ' ');
  const said = prompt.match(/\bsays\b([^"]{0,32})"([^"]+)"/);
  if (!said || said.index === undefined) return null;
  const rest = prompt.slice(said.index + said[0].length);
  const answered = rest.match(/\b(?:answers|replies)\b([^"]{0,32})"([^"]+)"/);
  if (!answered || answered.index === undefined) return null;
  const how = said[1]!.replace(/[,\s]+$/, '').trimEnd();
  const language = how.match(DIALOGUE_LANGUAGE)?.[1] ?? 'English';
  const line = (words: string) =>
    /[.?!…]$/.test(words.trim()) ? words.trim() : `${words.trim()}.`;
  const place = prompt.match(/\bfirst frame \(([^)]+)\)/)?.[1]?.trim();
  // The sentence that says the line ("The woman turns to the man and says, …") becomes (S1)'s.
  const head = prompt.slice(0, said.index);
  const before = head.slice(0, Math.max(0, head.search(/[^.!?]*$/)));
  const after = rest.slice(answered.index + answered[0].length);
  return [
    `${before.trimEnd()} ${H3_CONVERSATION_CAMERA} (S1), the ${first.noun}, on-screen, says${how} <d>[${language}] ${line(said[2]!)}</d> Then (S2), the ${second.noun}, on-screen, replies <d>[${language}] ${line(answered[2]!)}</d>${after}`.trim(),
    'Each says their line once; after it they silently keep looking, lips closed, until the shot ends.',
    'Only (S1) and (S2) speak, one at a time, each in their own voice, each mouth moving only for their own line. No other voices, no voiceover, no singing.',
    `overall_soundscape: the quiet natural sound of ${place ? `the ${place}` : 'the place'} — soft room tone and gentle ambience, no voices.`,
    'non_diegetic_music: N/A',
  ].join(' ');
}

/**
 * A two-person conversation on the reference model (M11 T21): each speaker's kept voice clip as
 * a video with its sound — the first speaker's first — and the line and reply in H3's
 * two-speaker dialogue ({@link h3Conversation}). Live (2026-11-04, a woman and a man on a
 * rooftop ledge, three seeds): both lines word for word in order, hers ~205 Hz then his
 * 130–150 Hz, her mouth moving on hers and his on his, no made-up speech; the user: "sounds good
 * enough". Null when the graph is not H3, the prompt has no line and reply, or neither has a voice.
 */
export function withH3Conversation(
  source: Workflow,
  input: {
    first: H3Speaker;
    second: H3Speaker;
    pictures?: ReadonlyArray<{ image: string; shows: string }>;
    look?: string;
  }
): Workflow | null {
  return withH3Speakers(source, input, prompt => h3Conversation(prompt, input.first, input.second));
}

/**
 * A part of a two-person talking clip (M11 T21): one of the two says the part's line in their
 * own voice while the other listens, both voices given ({@link withH3Conversation}'s graph) — so
 * each keeps their voice from part to part. Null as withH3Conversation.
 */
export function withH3PartSpeaker(
  source: Workflow,
  input: {
    first: H3Speaker;
    second: H3Speaker;
    /** Who says this part's line. */
    speaking: 'first' | 'second';
    pictures?: ReadonlyArray<{ image: string; shows: string }>;
    look?: string;
  }
): Workflow | null {
  return withH3Speakers(source, input, prompt =>
    input.speaking === 'first'
      ? h3OneSpeaks(prompt, input.first, '(S1)', input.second, '(S2)')
      : h3OneSpeaks(prompt, input.second, '(S2)', input.first, '(S1)')
  );
}

/**
 * A part's line (`… says, "X" …`) in H3's dialogue syntax, said by one of two speakers while the
 * other listens. Null when the prompt has no line.
 */
export function h3OneSpeaks(
  source: string,
  speaker: H3Speaker,
  tag: string,
  listener: H3Speaker,
  listenerTag: string
): string | null {
  const prompt = source.replace(H3_LONG_TALK_TAIL, '').replace(/\s{2,}/g, ' ');
  const said = prompt.match(/\bsays\b([^"]{0,32})"([^"]+)"/);
  if (!said || said.index === undefined) return null;
  const how = said[1]!.replace(/[,\s]+$/, '').trimEnd();
  const language = how.match(DIALOGUE_LANGUAGE)?.[1] ?? 'English';
  const words = said[2]!.trim();
  const line = /[.?!…]$/.test(words) ? words : `${words}.`;
  const place = prompt.match(/\bfirst frame \(([^)]+)\)/)?.[1]?.trim();
  const head = prompt.slice(0, said.index);
  const before = head.slice(0, Math.max(0, head.search(/[^.!?]*$/)));
  // The rest of the sentence that quoted the line ("— her lips move with every word.").
  const after = prompt.slice(said.index + said[0].length).replace(/^[^.!?]*[.!?]?/, '');
  const them = listener.who === 'He' ? 'his' : 'her';
  return [
    `${before.trimEnd()} ${H3_CONVERSATION_CAMERA} ${tag}, the ${speaker.noun}, on-screen, says${how} <d>[${language}] ${line}</d>${after}`.trim(),
    `${speaker.who} says it once; after it ${speaker.who === 'He' ? 'he' : 'she'} silently keeps looking, lips closed, until the shot ends.`,
    `${listenerTag}, the ${listener.noun}, listens and says nothing — ${them} mouth closed or smiling.`,
    `Only ${tag} speaks, in ${speaker.who === 'He' ? 'his' : 'her'} own voice. No other voices, no voiceover, no singing.`,
    `overall_soundscape: the quiet natural sound of ${place ? `the ${place}` : 'the place'} — soft room tone and gentle ambience, no voices.`,
    'non_diegetic_music: N/A',
  ].join(' ');
}

/** {@link withH3Conversation}'s graph, its dialogue written by `dialogue` from the part's prompt. */
function withH3Speakers(
  source: Workflow,
  input: {
    first: H3Speaker;
    second: H3Speaker;
    pictures?: ReadonlyArray<{ image: string; shows: string }>;
    look?: string;
  },
  dialogue: (prompt: string) => string | null
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
  const voiced = [
    { speaker: input.first, tag: '(S1)' },
    { speaker: input.second, tag: '(S2)' },
  ].filter(entry => entry.speaker.voiceClip?.trim());
  if (!voiced.length) return null;
  const [id, node] = h3;
  const old = node.inputs!;
  const said = dialogue(String(old.prompt ?? ''));
  if (!said) return null;
  unet.inputs.unet_name = H3_REF_FILES.transformer;
  if (lora?.inputs) lora.inputs.lora_name = H3_REF_FILES.turboLora;
  if (scheduler?.inputs) scheduler.inputs.steps = H3_REF_STEPS;
  const pictures = input.pictures ?? [];
  const refs: Record<string, unknown> = {};
  // The start frame as <Picture 1> too, not only pinned: pinned alone, H3 cut to a close-up of
  // the man for his reply on 2 of 4 seeds even told the camera never cuts; as Picture 1 as well,
  // both stayed in frame 4 of 4, those two seeds included (live, 2026-11-04).
  const start = isRef(old.first_frame) ? old.first_frame : null;
  if (start) refs['ref_images.ref_image_1'] = start;
  const offset = start ? 1 : 0;
  pictures.forEach((picture, k) => {
    graph[`h3ref${k + 1 + offset}`] = { class_type: 'LoadImage', inputs: { image: picture.image } };
    refs[`ref_images.ref_image_${k + 1 + offset}`] = [`h3ref${k + 1 + offset}`, 0];
  });
  const voiceTags = voiced.map(({ speaker, tag }, k) => {
    const n = k + 1;
    graph[`h3voice${n}`] = { class_type: 'LoadVideo', inputs: { file: speaker.voiceClip!.trim() } };
    graph[`h3voice${n}parts`] = {
      class_type: 'GetVideoComponents',
      inputs: { video: [`h3voice${n}`, 0] },
    };
    refs[`ref_videos.ref_video_${n}`] = [`h3voice${n}parts`, 0];
    refs[`ref_video_audios.ref_video_audio_${n}`] = [`h3voice${n}parts`, 1];
    return `<Video ${n}> with its sound <Audio ${n}> is ${tag}, the ${speaker.noun}, speaking: ${tag} speaks in exactly that voice — the same person, pitch, tone, accent and pace. ${voiceWordsLine(speaker.clipWords, speaker.who, n)}`;
  });
  const tags = [
    ...(start
      ? [
          '<Picture 1> is the first frame: the shot as it is now, which the video starts from exactly — both people stay in it, framed just so.',
        ]
      : []),
    ...pictures.map((picture, k) => `<Picture ${k + 1 + offset}> is ${picture.shows}.`),
    ...voiceTags,
  ].join(' ');
  graph[id] = {
    class_type: H3_REF_NODE,
    inputs: {
      clip: old.clip,
      prompt: [tags, input.look?.trim(), said].filter(Boolean).join(' '),
      width: old.width,
      height: old.height,
      length: old.length,
      ref_image_size: 'match',
      vae: old.vae,
      audio_vae: [audioVae, 0],
      ...refs,
    },
  };
  pinH3Frames(graph, id, old);
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
