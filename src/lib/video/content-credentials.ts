/**
 * Content Credentials (C2PA) on a rendered film: what the signed manifest says. A film Cut renders
 * is a composite — edited in Castcut from pictures and clips AI models made — so it is declared as
 * `compositeWithTrainedAlgorithmicMedia` (the IPTC term C2PA readers show as "made with AI"), with
 * Castcut as the software and the engines named. Pure; the signing is content-credentials-server.ts.
 */

/** The IPTC digital source type for a film edited together from AI-made shots. */
export const COMPOSITE_WITH_AI =
  'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia';

/** What the client sends with a render to have it signed (cut option on by default). */
export type ContentCredentialsRequest = {
  /** The engines that made the film's shots, by name ("Qwen-Image 2.1 Turbo"). */
  engines?: string[];
};

export type ContentCredentialsResult = {
  signed: boolean;
  /** Why it isn't signed, or what the reader said of the signature. */
  note?: string;
};

export function normalizeContentCredentialsRequest(raw: unknown): ContentCredentialsRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const engines = Array.isArray((raw as ContentCredentialsRequest).engines)
    ? [
        ...new Set(
          (raw as { engines: unknown[] }).engines
            .filter((name): name is string => typeof name === 'string')
            .map(name => name.replace(/\s+/g, ' ').trim().slice(0, 80))
            .filter(Boolean)
        ),
      ].slice(0, 20)
    : [];
  return engines.length ? { engines } : {};
}

/** The manifest definition (c2pa-rs's ManifestDefinition JSON) for a rendered film. */
export function filmContentCredentialsManifest(input: {
  title?: string | null;
  version: string;
  engines?: readonly string[];
}): Record<string, unknown> {
  const engines = [...new Set((input.engines ?? []).map(name => name.trim()).filter(Boolean))];
  const agent = { name: 'Castcut', version: input.version };
  return {
    claim_generator_info: [agent],
    title: input.title?.trim().slice(0, 120) || 'Castcut film',
    assertions: [
      {
        label: 'c2pa.actions.v2',
        data: {
          actions: [
            {
              action: 'c2pa.created',
              digitalSourceType: COMPOSITE_WITH_AI,
              softwareAgent: agent,
              description: engines.length
                ? `Edited in Castcut from pictures and clips made with ${engines.join(', ')}.`
                : 'Edited in Castcut from AI-made pictures and clips.',
            },
          ],
        },
      },
    ],
  };
}

/** The C2PA format of a rendered film by its extension, or null when it can't be signed. */
export function contentCredentialsFormat(extension: string): string | null {
  const ext = extension.replace(/^\./, '').toLowerCase();
  if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  return null;
}

/**
 * The engines a film's shots were made with, by name, from their Gallery entries (a shot's
 * `entryId` is its entry's id or prompt id); shots from elsewhere (an upload) name none.
 */
export function filmEngineNames(
  shots: readonly { entryId?: string }[],
  gallery: readonly { id: string; promptId?: string; model?: string }[],
  label: (model: string) => string | null
): string[] {
  const byId = new Map<string, string>();
  for (const entry of gallery) {
    if (!entry.model) continue;
    byId.set(entry.id, entry.model);
    if (entry.promptId) byId.set(entry.promptId, entry.model);
  }
  const names = shots
    .map(shot => (shot.entryId ? byId.get(shot.entryId.trim()) : undefined))
    .filter((model): model is string => Boolean(model))
    .map(model => label(model))
    .filter((name): name is string => Boolean(name));
  return [...new Set(names)].slice(0, 20);
}
