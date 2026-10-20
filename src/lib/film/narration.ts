/**
 * Narration over a Day shot (2026-10-14): a line of voice-over — not said on screen — rendered by
 * LTX-2.5 in audio-only mode (the ComfyUI-LTXVideo pack's LTXVAudioOnlyModel: the video stream
 * skipped, a one-frame dummy latent) and mixed into the cut from the shot's start, ducking the
 * music like a talking clip's line. With a kept Cast voice the ID-LoRA steers it (as talking
 * clips are).
 *
 * Live (2026-10-14, two lines, 6 s): both said word for word (faster-whisper), with and without a
 * voice; the voice moved pitch toward the sample on one line (186 → 203 Hz vs 196) and overshot
 * on the other (226), breathier — offered, not forced. Pure graph builder.
 */

import { LTX25_FILES, LTX25_ID_LORA } from '../ltx25-renderer';

export const NARRATION_REQUIRED_NODES = [
  'LTXVAudioOnlyModel',
  'LTXVAudioOnlyEmptyVideoLatent',
] as const;
export const NARRATION_SAVE_NODE = '70';
/** Longest line: about 6 s of speech at a calm pace. */
export const NARRATION_MAX_CHARS = 140;

/** Seconds of audio for a line: ~2.6 words a second at a calm voice-over pace, 3–10 s. */
export function narrationSeconds(line: string): number {
  const words = line.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(10, Math.max(3, Math.ceil(words / 2.6) + 1.5));
}

export function normalizeNarration(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim().slice(0, NARRATION_MAX_CHARS)
    : '';
}

export function buildNarrationGraph(input: {
  line: string;
  speaker: 'woman' | 'man';
  seed: number;
  prefix: string;
  /** A kept Cast voice (ComfyUI input audio), steered through the ID-LoRA. */
  voiceSample?: string;
}): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  const who = input.speaker === 'man' ? 'A man' : 'A woman';
  const text = `${who} speaks a calm voice-over, close to the microphone, warm and natural: "${input.line}" Clean studio voice-over, no music, no background noise.`;
  // 24 fps frames for the audio latent, on LTX's 8k+1 grid.
  const frames = Math.round((narrationSeconds(input.line) * 24) / 8) * 8 + 1;
  const g: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: LTX25_FILES.transformer, weight_dtype: 'default' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: LTX25_FILES.textEncoder, type: 'ltxv', device: 'default' },
    },
    '4': { class_type: 'VAELoader', inputs: { vae_name: LTX25_FILES.audioVae } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text } },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { clip: ['2', 0], text: 'music, singing, noise, echo, distortion' },
    },
    '7': {
      class_type: 'LTXVConditioning',
      inputs: { positive: ['5', 0], negative: ['6', 0], frame_rate: 24 },
    },
    '16': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral' } },
    '17': {
      class_type: 'ManualSigmas',
      inputs: { sigmas: '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0' },
    },
    '18': { class_type: 'RandomNoise', inputs: { noise_seed: input.seed } },
  };
  let model: [string, number] = ['1', 0];
  let positive: [string, number] = ['7', 0];
  let negative: [string, number] = ['7', 1];
  const voice = input.voiceSample?.trim();
  if (voice) {
    g['50'] = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ['1', 0], lora_name: LTX25_ID_LORA, strength_model: 0.5 },
    };
    g['51'] = { class_type: 'LoadAudio', inputs: { audio: voice } };
    g['52'] = {
      class_type: 'LTXVReferenceAudio',
      inputs: {
        model: ['50', 0],
        positive,
        negative,
        reference_audio: ['51', 0],
        audio_vae: ['4', 0],
        identity_guidance_scale: 3,
        start_percent: 0,
        end_percent: 1,
      },
    };
    model = ['52', 0];
    positive = ['52', 1];
    negative = ['52', 2];
  }
  g['60'] = { class_type: 'LTXVAudioOnlyModel', inputs: { model } };
  g['61'] = { class_type: 'LTXVAudioOnlyEmptyVideoLatent', inputs: {} };
  g['13'] = {
    class_type: 'LTXVEmptyLatentAudio',
    inputs: { frames_number: frames, frame_rate: 24, batch_size: 1, audio_vae: ['4', 0] },
  };
  g['14'] = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: ['61', 0], audio_latent: ['13', 0] },
  };
  g['15'] = {
    class_type: 'LTXVDualCFGGuider',
    inputs: { model: ['60', 0], positive, negative, video_cfg: 1, audio_cfg: 1 },
  };
  g['19'] = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['18', 0],
      guider: ['15', 0],
      sampler: ['16', 0],
      sigmas: ['17', 0],
      latent_image: ['14', 0],
    },
  };
  g['20'] = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['19', 0] } };
  g['54'] = {
    class_type: 'LTXVAudioVAEDecode',
    inputs: { samples: ['20', 1], audio_vae: ['4', 0] },
  };
  g[NARRATION_SAVE_NODE] = {
    class_type: 'SaveAudio',
    inputs: { audio: ['54', 0], filename_prefix: input.prefix },
  };
  return g;
}
