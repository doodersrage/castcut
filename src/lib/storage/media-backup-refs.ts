/**
 * The ComfyUI pictures a studio backup points at — Cast reference photos, face locks, dress
 * plates, packshots, pose guides. The JSON backup carries only their names; the Pictures backup
 * carries the files. Gallery renders are left out: the Gallery keeps its own copies.
 */

export type ComfyFileType = 'input' | 'output' | 'temp';

export type ComfyFileRef = { filename: string; subfolder: string; type: ComfyFileType };

export const MEDIA_BACKUP_MAX_COMFY_FILES = 20_000;

/** Backup sections that are not worth scanning (renders are copied separately; logs). */
const SKIPPED_KEYS = new Set(['comfyGallery', 'history', 'webhookLog']);

function asType(value: unknown): ComfyFileType | null {
  return value === 'input' || value === 'output' || value === 'temp' ? value : null;
}

function cleanRef(filename: string, subfolder: string, type: ComfyFileType): ComfyFileRef | null {
  const name = filename.trim();
  const folder = subfolder.trim().replace(/^\/+|\/+$/g, '');
  if (!name || name.length > 255 || /[\\/\0]/.test(name) || name.includes('..')) return null;
  if (folder.includes('..') || /[\\\0]/.test(folder)) return null;
  // Only picture-like names: references in prose or ids are not files.
  if (!/\.[A-Za-z0-9]{2,5}$/.test(name)) return null;
  return { filename: name, subfolder: folder, type };
}

/** A `/view?filename=…` link (the app's proxy or ComfyUI's own) → the file it shows. */
export function comfyRefFromViewUrl(url: string): ComfyFileRef | null {
  if (!/\/view\?[^#]*\bfilename=/.test(url)) return null;
  try {
    const params = new URL(url, 'http://local').searchParams;
    const type = asType(params.get('type') || 'output');
    if (!type || type === 'temp') return null;
    return cleanRef(params.get('filename') ?? '', params.get('subfolder') ?? '', type);
  } catch {
    return null;
  }
}

function refKey(ref: ComfyFileRef): string {
  return `${ref.type}/${ref.subfolder}/${ref.filename}`;
}

/**
 * Every ComfyUI file the backup names: view links anywhere in it, `{ filename, subfolder, type }`
 * records, and upload names kept as `filename` / `…Filename` (ComfyUI input files).
 */
export function collectComfyFileRefs(backup: unknown): ComfyFileRef[] {
  const found = new Map<string, ComfyFileRef>();
  const add = (ref: ComfyFileRef | null) => {
    if (ref && found.size < MEDIA_BACKUP_MAX_COMFY_FILES) found.set(refKey(ref), ref);
  };
  const seen = new Set<object>();
  const walk = (value: unknown, depth: number) => {
    if (depth > 40 || value === null) return;
    if (typeof value === 'string') {
      if (value.includes('/view?')) add(comfyRefFromViewUrl(value));
      return;
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    const ownType = asType(record.type);
    for (const [key, child] of Object.entries(record)) {
      if (depth === 0 && SKIPPED_KEYS.has(key)) continue;
      if (typeof child === 'string' && /(^f|F)ilename$/.test(key) && !child.includes('/view?')) {
        const subfolder = typeof record.subfolder === 'string' ? record.subfolder : '';
        // A name and folder joined ("day-plates/plate.png") is how input uploads are referenced.
        const slash = child.lastIndexOf('/');
        add(
          slash > 0 && !subfolder
            ? cleanRef(child.slice(slash + 1), child.slice(0, slash), ownType ?? 'input')
            : cleanRef(child, subfolder, ownType ?? 'input')
        );
        continue;
      }
      walk(child, depth + 1);
    }
  };
  walk(backup, 0);
  return [...found.values()];
}
