/**
 * How a render was made (R4, ROADMAP §4.2): its Gallery entry — the attempt record — read out as
 * labelled rows for a take's "How this was made": what made it, the settings, the references it
 * was given, when, and whether the exact graph is still stored for replay. Rows with nothing to
 * say are left out. Pure.
 */
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { galleryDerivedKindLabel } from './derived-kind';
import { galleryToolLabel } from './tool-href';
import { formatComfyHostLabel } from '../queue/status-notes';

export type ProvenanceRow = {
  /** Stable key (tests, data-testid). */
  key: string;
  label: string;
  value: string;
  /** Prose (a prompt): shown as a block, not a short value. */
  long?: boolean;
};

export type ProvenanceEntry = Pick<
  ComfyGalleryEntry,
  | 'prompt'
  | 'negativePrompt'
  | 'tool'
  | 'model'
  | 'derivedKind'
  | 'queueParams'
  | 'queueQualityProfile'
  | 'engineId'
  | 'comfyUrl'
  | 'sourceImageUrl'
  | 'controlImageUrls'
  | 'sessionActiveLoraIds'
  | 'hasStoredWorkflow'
  | 'workflowJson'
  | 'workflowJsonOmitted'
  | 'status'
  | 'statusMessage'
  | 'queuedAt'
  | 'completedAt'
  | 'renderDurationMs'
>;

const ENGINE_LABELS: Record<string, string> = {
  comfyui: 'ComfyUI',
  diffusers: 'Diffusers',
  fal: 'Fal',
  replicate: 'Replicate',
  openai: 'ChatGPT',
  gemini: 'Gemini',
  grok: 'Grok',
  runway: 'Runway',
  luma: 'Luma',
};

function text(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return typeof value === 'string' ? value.trim() : '';
}

/** "42 s", "3 min 5 s". */
export function formatRenderDuration(ms: number | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '';
  const secs = Math.max(1, Math.round(ms / 1000));
  if (secs < 60) return `${secs} s`;
  const mins = Math.floor(secs / 60);
  const rest = secs % 60;
  return rest ? `${mins} min ${rest} s` : `${mins} min`;
}

/** Whether replaying it exactly is possible from what Castcut kept. */
export function storedGraphNote(
  entry: Pick<ProvenanceEntry, 'hasStoredWorkflow' | 'workflowJson' | 'workflowJsonOmitted'>
): string {
  if (entry.workflowJson || (entry.hasStoredWorkflow && !entry.workflowJsonOmitted)) {
    return 'Stored — the Gallery can replay it exactly';
  }
  if (entry.workflowJsonOmitted) {
    return 'Not kept (too large, or pruned) — only ComfyUI’s own history may still have it';
  }
  return 'Not stored with this render';
}

/** Where a replay's graph came from (requeue.ts `requeueComfyJobFromEntry`). */
export type ReplayGraphSource = 'stored' | 'history' | 'rebuilt';

/**
 * What a requeue says it did (M6 D19). A replay that couldn't find the exact graph — not on this
 * device, not in ComfyUI's history — is rebuilt from the current template, and says so: after an
 * update that changed the template it is not the same render.
 */
export function replayOutcomeLabel(input: {
  newSeed?: boolean;
  qualityProfile?: string;
  replayedFrom?: ReplayGraphSource;
}): string {
  if (input.newSeed || input.qualityProfile) return 'queued variation';
  if (input.replayedFrom === 'stored' || input.replayedFrom === 'history') {
    return 'replayed the exact graph';
  }
  if (input.replayedFrom === 'rebuilt') {
    return 'rebuilt from the current template — the exact graph isn’t on this device or in ComfyUI’s history';
  }
  return 'queued again';
}

export function galleryEntryProvenance(
  entry: ProvenanceEntry,
  options: {
    /** The Cast it was made of, by name (the entry holds only ids). */
    castName?: string | null;
    /**
     * What made it, when the caller knows better than `tool` says: Day and Scene stills are
     * queued through the edit pipeline, so their entry says "image-prompt" (job-context.ts).
     */
    madeWith?: string;
    formatTime?: (ms: number) => string;
  } = {}
): ProvenanceRow[] {
  const formatTime =
    options.formatTime ??
    ((ms: number) => new Date(ms).toLocaleString(undefined, { hour12: false }));
  const rows: ProvenanceRow[] = [];
  const add = (key: string, label: string, value: string, long?: boolean) => {
    if (value) rows.push({ key, label, value, ...(long ? { long } : {}) });
  };
  const params = entry.queueParams ?? {};

  if (entry.status !== 'completed') {
    add(
      'status',
      'Status',
      [entry.status, text(entry.statusMessage)].filter(Boolean).join(' — ') || 'unknown'
    );
  }
  const derived = galleryDerivedKindLabel(entry.derivedKind);
  add(
    'made-with',
    'Made with',
    [options.madeWith?.trim() || galleryToolLabel(entry.tool), derived].filter(Boolean).join(', ')
  );
  const host = formatComfyHostLabel(entry.comfyUrl);
  const engine = ENGINE_LABELS[entry.engineId ?? 'comfyui'] ?? text(entry.engineId);
  add(
    'engine',
    'Engine',
    [engine, host && engine === 'ComfyUI' ? host : ''].filter(Boolean).join(' · ')
  );
  add('model', 'Model', text(entry.model));
  add('quality', 'Quality', text(entry.queueQualityProfile));
  add('seed', 'Seed', text(params.seed));
  const width = text(params.width);
  const height = text(params.height);
  add('size', 'Size', width && height ? `${width} × ${height}` : '');
  add('steps', 'Steps', text(params.steps));
  add('cfg', 'CFG', text(params.cfg));
  add(
    'sampler',
    'Sampler',
    [text(params.samplerName), text(params.scheduler)].filter(Boolean).join(' · ')
  );
  add('denoise', 'Denoise', text(params.denoise));
  add('cast', 'Cast', text(options.castName));

  const references = [
    entry.sourceImageUrl?.trim() ? 'a source picture' : '',
    entry.controlImageUrls?.length
      ? `${entry.controlImageUrls.length} control picture${entry.controlImageUrls.length === 1 ? '' : 's'}`
      : '',
    params.inputImageFilenames && params.inputImageFilenames.length > 1
      ? `${params.inputImageFilenames.length} reference pictures`
      : '',
    entry.sessionActiveLoraIds?.length
      ? `${entry.sessionActiveLoraIds.length} LoRA${entry.sessionActiveLoraIds.length === 1 ? '' : 's'}`
      : '',
  ].filter(Boolean);
  add('references', 'Given', references.join(', '));

  if (Number.isFinite(entry.queuedAt) && entry.queuedAt > 0) {
    add('queued', 'Queued', formatTime(entry.queuedAt));
  }
  if (entry.completedAt && Number.isFinite(entry.completedAt)) {
    add('finished', 'Finished', formatTime(entry.completedAt));
  }
  add('render-time', 'Render time', formatRenderDuration(entry.renderDurationMs));
  add('graph', 'Exact graph', storedGraphNote(entry));
  add('prompt', 'Prompt', text(entry.prompt), true);
  add('negative', 'Negative prompt', text(entry.negativePrompt), true);
  return rows;
}
