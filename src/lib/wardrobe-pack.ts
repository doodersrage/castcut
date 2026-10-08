/**
 * Wardrobe packs: saved clothing photos and saved shoes (their packshots, descriptions and
 * words) as one .zip, to move them to another install or share them. Pure parts here; the
 * download / upload side is wardrobe-pack-client.ts.
 */
import { buildZipBlob, type ZipFileEntry } from './gallery-zip-core';
import { readZipBinaryEntries } from './zip-read';

export const WARDROBE_PACK_FORMAT = 'castcut-wardrobe-pack';
export const WARDROBE_PACK_VERSION = 1;
const MANIFEST = 'wardrobe-pack.json';
/** A pack is a handful of packshots; anything far bigger is not one. */
export const WARDROBE_PACK_MAX_BYTES = 120 * 1024 * 1024;

export type WardrobePackClothing = { label: string; description?: string; file: string };
export type WardrobePackShoes = { label: string; words?: string; file: string };

export type WardrobePackManifest = {
  format: typeof WARDROBE_PACK_FORMAT;
  version: number;
  exportedAt: string;
  clothing: WardrobePackClothing[];
  shoes: WardrobePackShoes[];
};

export type WardrobePackItemInput = {
  label: string;
  /** Clothing: the vision description. Shoes: the words the prompt names them by. */
  text?: string;
  image: Uint8Array;
  /** png / jpg / webp — from the image's own bytes when not given. */
  extension?: string;
};

export function imageExtension(data: Uint8Array): string {
  if (data[0] === 0x89 && data[1] === 0x50) return 'png';
  if (data[0] === 0xff && data[1] === 0xd8) return 'jpg';
  if (data[0] === 0x52 && data[1] === 0x49 && data[8] === 0x57 && data[9] === 0x45) return 'webp';
  return 'png';
}

/** The pack .zip for these items (either list may be empty). */
export function buildWardrobePackZip(input: {
  clothing: WardrobePackItemInput[];
  shoes: WardrobePackItemInput[];
  now?: Date;
}): Blob {
  const files: ZipFileEntry[] = [];
  const manifest: WardrobePackManifest = {
    format: WARDROBE_PACK_FORMAT,
    version: WARDROBE_PACK_VERSION,
    exportedAt: (input.now ?? new Date()).toISOString(),
    clothing: [],
    shoes: [],
  };
  input.clothing.forEach((item, index) => {
    const file = `clothing/${String(index + 1).padStart(2, '0')}.${item.extension ?? imageExtension(item.image)}`;
    files.push({ filename: file, data: item.image });
    manifest.clothing.push({
      label: item.label,
      ...(item.text?.trim() ? { description: item.text.trim() } : {}),
      file,
    });
  });
  input.shoes.forEach((item, index) => {
    const file = `shoes/${String(index + 1).padStart(2, '0')}.${item.extension ?? imageExtension(item.image)}`;
    files.push({ filename: file, data: item.image });
    manifest.shoes.push({
      label: item.label,
      ...(item.text?.trim() ? { words: item.text.trim() } : {}),
      file,
    });
  });
  files.unshift({
    filename: MANIFEST,
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  });
  return buildZipBlob(files);
}

export type ParsedWardrobePack = {
  clothing: Array<{ label: string; description?: string; image: Uint8Array; name: string }>;
  shoes: Array<{ label: string; words?: string; image: Uint8Array; name: string }>;
};

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

/** Read a pack .zip; throws a readable error when it is not one. */
export async function parseWardrobePack(buffer: ArrayBuffer): Promise<ParsedWardrobePack> {
  if (buffer.byteLength > WARDROBE_PACK_MAX_BYTES) {
    throw new Error('That file is too large to be a wardrobe pack.');
  }
  const entries = await readZipBinaryEntries(buffer);
  const byName = new Map(entries.map(entry => [entry.filename, entry.data]));
  const raw = byName.get(MANIFEST);
  if (!raw) throw new Error('Not a wardrobe pack — no wardrobe-pack.json inside.');
  let manifest: Partial<WardrobePackManifest>;
  try {
    manifest = JSON.parse(new TextDecoder().decode(raw)) as Partial<WardrobePackManifest>;
  } catch {
    throw new Error('The wardrobe pack’s list could not be read.');
  }
  if (manifest.format !== WARDROBE_PACK_FORMAT) throw new Error('Not a wardrobe pack.');
  const image = (file: unknown) => {
    const name = typeof file === 'string' ? file : '';
    const data = /^(?:clothing|shoes)\/[\w.-]+\.(?:png|jpe?g|webp)$/i.test(name)
      ? byName.get(name)
      : undefined;
    return data && data.byteLength > 0 ? { data, name } : null;
  };
  const clothing: ParsedWardrobePack['clothing'] = [];
  for (const item of Array.isArray(manifest.clothing) ? manifest.clothing : []) {
    const found = image(item?.file);
    if (!found) continue;
    clothing.push({
      label: text(item.label, 80) ?? 'Clothing',
      ...(text(item.description, 1200) ? { description: text(item.description, 1200) } : {}),
      image: found.data,
      name: found.name,
    });
  }
  const shoes: ParsedWardrobePack['shoes'] = [];
  for (const item of Array.isArray(manifest.shoes) ? manifest.shoes : []) {
    const found = image(item?.file);
    if (!found) continue;
    shoes.push({
      label: text(item.label, 80) ?? 'Shoes',
      ...(text(item.words, 200) ? { words: text(item.words, 200) } : {}),
      image: found.data,
      name: found.name,
    });
  }
  if (clothing.length === 0 && shoes.length === 0) {
    throw new Error('The wardrobe pack has no clothing or shoes in it.');
  }
  return { clothing, shoes };
}

/** Same text as one already saved (an import twice, or a pack of things you have): skip it. */
export function wardrobePackDuplicate(
  text: string | undefined,
  label: string,
  saved: ReadonlyArray<{ label: string; text?: string }>
): boolean {
  const norm = (value: string | undefined) =>
    (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const key = norm(text) || norm(label);
  return Boolean(key) && saved.some(item => (norm(item.text) || norm(item.label)) === key);
}
