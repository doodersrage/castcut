/**
 * The pictures (and clips, sounds) a graph loads from ComfyUI's input folder — a Day still's plate,
 * face crop, pose guide, dress plate. ComfyUI rejects a graph whose file is gone with a bare
 * "Invalid image file"; a replay of an old still meets that when the input folder was cleaned or
 * the job runs on another ComfyUI. Checked before queueing so the reason can be named. Models and
 * node types are checked by the loader preflight (workflow-preflight-core).
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ComfyInputRef = {
  filename: string;
  subfolder: string;
  type: 'input' | 'output' | 'temp';
};

/** Input names per loader node: the field holding the file name. */
const INPUT_FIELDS: Record<string, string> = {
  LoadImage: 'image',
  LoadImageMask: 'image',
  LoadImageOutput: 'image',
  LoadVideo: 'file',
  LoadAudio: 'audio',
  VHS_LoadVideo: 'video',
  VHS_LoadAudioUpload: 'audio',
};

/** "sub/name.png [output]" → { filename, subfolder, type } (ComfyUI's annotated-name form). */
export function parseComfyInputName(raw: string): ComfyInputRef | null {
  let name = raw.trim();
  let type: ComfyInputRef['type'] = 'input';
  const tag = name.match(/\s*\[(input|output|temp)\]$/);
  if (tag) {
    type = tag[1] as ComfyInputRef['type'];
    name = name.slice(0, tag.index).trim();
  }
  if (!name || name.includes('..') || /^[a-z]+:\/\//i.test(name)) return null;
  const slash = name.lastIndexOf('/');
  return slash >= 0
    ? { filename: name.slice(slash + 1), subfolder: name.slice(0, slash), type }
    : { filename: name, subfolder: '', type };
}

export function comfyInputFilesInGraph(
  workflow: Record<string, unknown> | null | undefined
): ComfyInputRef[] {
  const found = new Map<string, ComfyInputRef>();
  for (const node of Object.values(workflow ?? {})) {
    if (!node || typeof node !== 'object') continue;
    const { class_type: classType, inputs } = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const field = classType ? INPUT_FIELDS[classType] : undefined;
    const value = field ? inputs?.[field] : undefined;
    if (typeof value !== 'string') continue;
    const ref = parseComfyInputName(value);
    if (ref) found.set(`${ref.type}/${ref.subfolder}/${ref.filename}`, ref);
  }
  return [...found.values()];
}

/** Files the graph loads that ComfyUI says it does not have (404). Unreachable → none (not blocking). */
export async function findMissingComfyInputs(
  baseUrl: string,
  workflow: Record<string, unknown> | null | undefined,
  fetchImpl: FetchLike = fetch
): Promise<ComfyInputRef[]> {
  const base = baseUrl.replace(/\/+$/, '');
  const refs = comfyInputFilesInGraph(workflow);
  const missing = await Promise.all(
    refs.map(async ref => {
      const params = new URLSearchParams({
        filename: ref.filename,
        subfolder: ref.subfolder,
        type: ref.type,
      });
      try {
        const response = await fetchImpl(`${base}/view?${params.toString()}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(10_000),
        });
        return response.status === 404 ? ref : null;
      } catch {
        return null;
      }
    })
  );
  return missing.filter((ref): ref is ComfyInputRef => Boolean(ref));
}

export function missingComfyInputsMessage(missing: ComfyInputRef[]): string {
  const names = missing.map(ref =>
    ref.subfolder ? `${ref.subfolder}/${ref.filename}` : ref.filename
  );
  const shown =
    names.slice(0, 4).join(', ') + (names.length > 4 ? ` and ${names.length - 4} more` : '');
  return (
    `This job loads ${names.length === 1 ? 'a picture' : `${names.length} pictures`} ComfyUI no longer has (${shown}) — ` +
    `removed from its input folder, or this is a different ComfyUI. Restore ${names.length === 1 ? 'it' : 'them'} with a Pictures backup ` +
    '(Settings → Data), or render the shot again from its card instead of replaying this graph.'
  );
}
