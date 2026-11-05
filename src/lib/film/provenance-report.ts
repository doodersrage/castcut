/**
 * The film's shot report (reproducibility): every shot in film order with what made it — the tool,
 * the model, the seed, the size and steps, the LoRAs that were on, the prompt — read from its
 * Gallery record, so a shot can be made again or credited. Pure.
 */

import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery-entry';

export type ProvenanceShot = { key: string; title: string; kind: string; entryId?: string };

/** One row per shot: #, shot, kind, tool, model, seed, size · steps, LoRAs, prompt. */
export function shotProvenanceRows(
  shots: readonly ProvenanceShot[],
  gallery: readonly ComfyGalleryEntry[]
): string[][] {
  const byPrompt = new Map(gallery.map(entry => [entry.promptId, entry]));
  const byId = new Map(gallery.map(entry => [entry.id, entry]));
  return shots.map((shot, index) => {
    const id = shot.entryId?.trim();
    const entry = id ? (byPrompt.get(id) ?? byId.get(id)) : undefined;
    const params = entry?.queueParams ?? {};
    const model =
      entry?.model?.trim() || String(params.unetFilename ?? params.checkpointFilename ?? '').trim();
    const size = params.width && params.height ? `${params.width}×${params.height}` : '';
    const steps = params.steps ? `${params.steps} steps` : '';
    return [
      String(index + 1),
      shot.title,
      shot.kind,
      entry?.tool ?? (entry ? '' : 'not in the Gallery'),
      model,
      params.seed !== undefined && params.seed !== '' ? String(params.seed) : '',
      [size, steps].filter(Boolean).join(' · '),
      (entry?.sessionActiveLoraIds ?? []).join(', '),
      (entry?.prompt ?? '').slice(0, 400),
    ];
  });
}

export const SHOT_PROVENANCE_COLUMNS = [
  '#',
  'Shot',
  'Kind',
  'Tool',
  'Model',
  'Seed',
  'Size · steps',
  'LoRAs',
  'Prompt',
] as const;
