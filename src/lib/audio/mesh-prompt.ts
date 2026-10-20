/** Portable tokens for audio / mesh Comfy packs. */

export const AUDIO_SECONDS_TOKEN = '{{AUDIO_SECONDS}}';
export const MESH_RESOLUTION_TOKEN = '{{MESH_RESOLUTION}}';

export const AUDIO_MESH_WORKFLOW_TOKENS = [AUDIO_SECONDS_TOKEN, MESH_RESOLUTION_TOKEN] as const;

export function buildAudioPrompt(input: {
  subject: string;
  mood?: string;
  instruments?: string;
  durationSec?: number;
}): string {
  const parts = [
    input.subject.trim(),
    input.mood?.trim() ? `mood: ${input.mood.trim()}` : '',
    input.instruments?.trim() ? `instruments: ${input.instruments.trim()}` : '',
    input.durationSec && input.durationSec > 0 ? `duration about ${input.durationSec}s` : '',
  ].filter(Boolean);
  return parts.join('. ');
}

export function buildMeshPrompt(input: {
  subject: string;
  materials?: string;
  style?: string;
}): string {
  const parts = [
    input.subject.trim(),
    input.materials?.trim() ? `materials: ${input.materials.trim()}` : '',
    input.style?.trim() ? `style: ${input.style.trim()}` : '',
    'clean topology, readable silhouette',
  ].filter(Boolean);
  return parts.join('. ');
}
