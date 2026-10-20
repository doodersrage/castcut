export type ComfyOutputImage = {
  filename: string;
  subfolder: string;
  type: string;
  /** Explicit format hint from ComfyUI (e.g. "video/webp", "image/png"). */
  format?: string;
};

/** Media kind for gallery rendering: still image, video/animated, audio, or mesh download. */
export type ComfyOutputMediaKind = 'image' | 'video' | 'audio' | 'mesh';

const VIDEO_FILE_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi']);

const AUDIO_FILE_EXTENSIONS = new Set(['wav', 'mp3', 'flac', 'ogg', 'm4a']);

const MESH_FILE_EXTENSIONS = new Set(['obj', 'glb', 'gltf', 'stl', 'ply']);

/** Animated formats that should be rendered like video (looping, no controls needed). */
const ANIMATED_IMAGE_EXTENSIONS = new Set(['webp', 'gif']);

function fileExtensionOf(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match ? match[1].toLowerCase() : '';
}

const VIDEO_MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
};

const MESH_MIME_BY_EXT: Record<string, string> = {
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  obj: 'model/obj',
  stl: 'model/stl',
  ply: 'model/ply',
};

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

function normalizeMime(raw: string | null | undefined): string {
  return (raw ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/** Detect mp4/webm/webp from magic bytes when ComfyUI labels the file as image/png. */
export function sniffMediaContentType(bytes: ArrayBuffer | Uint8Array | Buffer): string | null {
  const buf = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  if (buf.length < 12) {
    return null;
  }
  // ISO BMFF (mp4 / mov) — `ftyp` box at offset 4.
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    return 'video/mp4';
  }
  // EBML (webm / mkv).
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return 'video/webm';
  }
  // RIFF WEBP / WAVE
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    if (buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
      return 'image/webp';
    }
    if (buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45) {
      return 'audio/wav';
    }
  }
  // fLaC
  if (buf[0] === 0x66 && buf[1] === 0x4c && buf[2] === 0x61 && buf[3] === 0x43) {
    return 'audio/flac';
  }
  // glTF binary (GLB)
  if (buf[0] === 0x67 && buf[1] === 0x6c && buf[2] === 0x54 && buf[3] === 0x46) {
    return 'model/gltf-binary';
  }
  return null;
}

/**
 * Content-Type for `/view` proxies. ComfyUI often sends mp4 as `image/png` or
 * `application/octet-stream`; Firefox then refuses `<video>` with
 * "No video with supported format and MIME type found."
 */
export function contentTypeForViewBytes(
  filename: string,
  upstream?: string | null,
  bytes?: ArrayBuffer | Uint8Array | Buffer | null
): string {
  const sniffed = bytes ? sniffMediaContentType(bytes) : null;
  if (sniffed?.startsWith('video/')) {
    return sniffed;
  }

  const ext = fileExtensionOf(filename);
  const videoMime = VIDEO_MIME_BY_EXT[ext];
  const raw = normalizeMime(upstream);
  if (videoMime) {
    if (
      !raw ||
      raw === 'application/octet-stream' ||
      raw === 'text/plain' ||
      raw.startsWith('image/')
    ) {
      return videoMime;
    }
    return raw.startsWith('video/') ? raw : videoMime;
  }

  const audioMime = AUDIO_MIME_BY_EXT[ext];
  if (audioMime) {
    if (
      !raw ||
      raw === 'application/octet-stream' ||
      raw === 'text/plain' ||
      raw.startsWith('image/')
    ) {
      return audioMime;
    }
    return raw.startsWith('audio/') ? raw : audioMime;
  }

  const meshMime = MESH_MIME_BY_EXT[ext];
  if (meshMime) {
    if (
      !raw ||
      raw === 'application/octet-stream' ||
      raw === 'text/plain' ||
      raw.startsWith('image/')
    ) {
      return meshMime;
    }
    return raw.startsWith('model/') || raw.includes('gltf') ? raw : meshMime;
  }

  if (sniffed) {
    return sniffed;
  }
  if (
    raw.startsWith('image/') ||
    raw.startsWith('video/') ||
    raw.startsWith('audio/') ||
    raw.startsWith('model/')
  ) {
    return raw;
  }
  return IMAGE_MIME_BY_EXT[ext] || raw || 'image/png';
}

export function isHtmlVideoContentType(contentType: string): boolean {
  return normalizeMime(contentType).startsWith('video/');
}

const HTML_VIDEO_URL_EXT = /\.(mp4|webm|mov|mkv)$/i;
const AUDIO_URL_EXT = /\.(wav|mp3|flac|ogg|m4a)$/i;
const MESH_URL_EXT = /\.(obj|glb|gltf|stl|ply)$/i;

/** True when a `<video>` element can play this view/download URL (not animated webp/gif). */
export function isHtmlVideoViewUrl(url: string): boolean {
  return viewUrlFilenameMatches(url, HTML_VIDEO_URL_EXT);
}

const ANIMATED_IMAGE_URL_EXT = /\.(webp|gif)$/i;

export function isAnimatedImageViewUrl(url: string): boolean {
  return viewUrlFilenameMatches(url, ANIMATED_IMAGE_URL_EXT);
}

export function isAudioViewUrl(url: string): boolean {
  return viewUrlFilenameMatches(url, AUDIO_URL_EXT);
}

export function isMeshViewUrl(url: string): boolean {
  return viewUrlFilenameMatches(url, MESH_URL_EXT);
}

/** True for mp4/webm or animated webp/gif view URLs. */
export function isMotionViewUrl(url: string): boolean {
  return isHtmlVideoViewUrl(url) || isAnimatedImageViewUrl(url);
}

export function mediaKindFromViewUrl(url: string): ComfyOutputMediaKind {
  if (isHtmlVideoViewUrl(url) || isAnimatedImageViewUrl(url)) {
    return 'video';
  }
  if (isAudioViewUrl(url)) {
    return 'audio';
  }
  if (isMeshViewUrl(url)) {
    return 'mesh';
  }
  return 'image';
}

/** Stills can zoom / pinch / before-after; clips, audio, and meshes cannot. */
export function isStillLightboxKind(kind: ComfyOutputMediaKind | undefined): boolean {
  return kind === 'image' || kind == null;
}

export function galleryDownloadActionLabel(kind: ComfyOutputMediaKind | undefined): string {
  switch (kind) {
    case 'audio':
      return 'Download audio';
    case 'mesh':
      return 'Download 3D file';
    case 'video':
      return 'Download video';
    default:
      return 'Download image';
  }
}

function viewUrlFilenameMatches(url: string, pattern: RegExp): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = new URL(trimmed, 'http://local.invalid');
    const fromQuery = parsed.searchParams.get('filename')?.trim() || '';
    if (pattern.test(fromQuery) || pattern.test(parsed.pathname)) {
      return true;
    }
  } catch {
    // Fall through to the loose path matcher.
  }
  return pattern.test(trimmed.split('?')[0] ?? trimmed);
}

/** mp4/webm/mov/mkv — play in `<video>`. Animated webp/gif stay on `<img>`. */
export function isHtmlVideoContainer(
  image: Pick<ComfyOutputImage, 'filename' | 'format'>
): boolean {
  if (VIDEO_FILE_EXTENSIONS.has(fileExtensionOf(image.filename))) {
    return true;
  }
  const format = image.format?.toLowerCase() ?? '';
  return format.startsWith('video/') && !format.includes('webp') && !format.includes('gif');
}

/** Animated webp/gif or mp4/webm — gallery should not run these through the stills `w=` proxy. */
export function isGalleryMotionOutput(
  image: Pick<ComfyOutputImage, 'filename' | 'format'>
): boolean {
  if (isHtmlVideoContainer(image) || resolveComfyOutputMediaKind(image) === 'video') {
    return true;
  }
  // Comfy SaveAnimatedWEBP often stores bare `.webp` with no format hint.
  return isAnimatedImageViewUrl(image.filename);
}

export function shouldSkipGalleryThumbProxy(filename: string): boolean {
  const ext = fileExtensionOf(filename);
  return (
    VIDEO_FILE_EXTENSIONS.has(ext) ||
    AUDIO_FILE_EXTENSIONS.has(ext) ||
    MESH_FILE_EXTENSIONS.has(ext) ||
    ext === 'gif' ||
    ext === 'webp'
  );
}

/** True when Sharp must not resize this output (clip, audio, or mesh). */
export function isGalleryPassthroughOutput(
  image: Pick<ComfyOutputImage, 'filename' | 'format'>
): boolean {
  const kind = resolveComfyOutputMediaKind(image);
  return kind === 'video' || kind === 'audio' || kind === 'mesh' || isGalleryMotionOutput(image);
}

/** GIF, or WebP with the VP8X animation flag. Sharp would flatten these to a still. */
export function isAnimatedImageBytes(
  filename: string,
  bytes: ArrayBuffer | Uint8Array | Buffer
): boolean {
  const ext = fileExtensionOf(filename);
  if (ext === 'gif') {
    return true;
  }
  if (ext !== 'webp') {
    return false;
  }
  const buf = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  if (buf.length < 21) {
    return false;
  }
  if (buf[0] !== 0x52 || buf[1] !== 0x49 || buf[2] !== 0x46 || buf[3] !== 0x46) {
    return false;
  }
  if (buf[8] !== 0x57 || buf[9] !== 0x45 || buf[10] !== 0x42 || buf[11] !== 0x50) {
    return false;
  }
  // VP8X chunk
  if (buf[12] !== 0x56 || buf[13] !== 0x50 || buf[14] !== 0x38 || buf[15] !== 0x58) {
    return false;
  }
  return (buf[20] & 0x02) !== 0;
}

/** Use a `<video>` tag: real clips, including mp4s Comfy named like `.png`. */
export function shouldUseHtmlVideoElement(
  kind: ComfyOutputMediaKind | undefined,
  url: string
): boolean {
  if (!url.trim() || isAnimatedImageViewUrl(url)) {
    return false;
  }
  return kind === 'video' || isHtmlVideoViewUrl(url);
}

/**
 * Resolves whether a ComfyUI output should be rendered as a `<video>` element
 * (mp4/webm/etc, or animated webp/gif) versus a plain `<img>`.
 *
 * Animated webp/gif are treated as "video" so the gallery can render them
 * with the same looping/muted playback UX as true video containers, while
 * plain photographic outputs remain classic images.
 */
export function resolveComfyOutputMediaKind(
  image: Pick<ComfyOutputImage, 'filename' | 'format'>
): ComfyOutputMediaKind {
  const ext = fileExtensionOf(image.filename);
  const format = image.format?.toLowerCase() ?? '';

  // Container extensions win even when Comfy tags the output as image/png.
  if (VIDEO_FILE_EXTENSIONS.has(ext)) {
    return 'video';
  }
  if (format.startsWith('video/')) {
    return 'video';
  }
  if (format.startsWith('image/')) {
    const formatExt = format.split('/')[1] ?? '';
    if (ANIMATED_IMAGE_EXTENSIONS.has(formatExt)) {
      return 'video';
    }
    return 'image';
  }

  if (format.startsWith('audio/') || AUDIO_FILE_EXTENSIONS.has(ext)) {
    return 'audio';
  }
  if (format.includes('model') || format.includes('mesh') || MESH_FILE_EXTENSIONS.has(ext)) {
    return 'mesh';
  }
  // Bare .webp/.gif without format are ambiguous (photo vs animated). Prefer
  // still image unless Comfy explicitly tagged video/* or image/webp|gif above.
  if (ANIMATED_IMAGE_EXTENSIONS.has(ext) && format.includes('anim')) {
    return 'video';
  }
  return 'image';
}

/** Default long-edge for gallery grid/list thumbs (proxy resize). */
export const GALLERY_THUMB_WIDTH = 512;

/** Responsive thumb widths used for `srcSet`. */
export const GALLERY_THUMB_SRCSET_WIDTHS = [256, 512, 768] as const;

/** Tiny chips under multi-image gallery cards. */
export const GALLERY_STRIP_THUMB_WIDTH = 128;

/** Mid-res lightbox / slideshow display before full download. */
export const GALLERY_LIGHTBOX_WIDTH = 1600;

/** Encode quality for gallery thumbs / lightbox proxies (higher = less false compression). */
export const GALLERY_PROXY_ENCODE_QUALITY = {
  /** Grid / strip thumbs — keep lean for many cards. */
  thumb: { avif: 58, webp: 78, jpeg: 82 },
  /** Lightbox mid-res — prioritize fidelity over bytes. */
  lightbox: { avif: 72, webp: 88, jpeg: 90 },
} as const;

/** Dynamic quality adjustment based on image complexity */
export function calculateDynamicQuality(
  buffer: Buffer,
  width: number,
  format: 'avif' | 'webp' | 'jpeg',
  tier: 'thumb' | 'lightbox'
): number {
  // For now, we'll implement a basic algorithm that adjusts quality
  // based on image size and complexity (to be expanded in future iterations)

  // Base quality from static settings
  const baseQuality = GALLERY_PROXY_ENCODE_QUALITY[tier][format];

  // Adjust quality based on image dimensions - larger images can use higher quality
  // since they have more detail that benefits from better compression
  let adjustedQuality: number = baseQuality;

  // For large images (e.g., >1000px), we can afford higher quality
  if (width > 1000) {
    adjustedQuality = Math.min(baseQuality + 5, 95);
  }

  // For smaller images, reduce quality to save space
  else if (width <= 256) {
    adjustedQuality = Math.max(baseQuality - 10, 30);
  }

  return adjustedQuality;
}

export function galleryProxyEncodeTier(width: number): 'thumb' | 'lightbox' {
  return width >= GALLERY_LIGHTBOX_WIDTH ? 'lightbox' : 'thumb';
}

/** Bounded per-URL cache to avoid re-allocating URLSearchParams on every render pass. */
const _stripUrlCacheMaxSize = 4096;
const _stripUrlCache = new Map<string, string>();

/** Strip gallery proxy `w=` so "Open original" / full-res links never hit a resized encode. */
export function stripGalleryViewWidthParam(url: string): string {
  const cached = _stripUrlCache.get(url);
  if (cached) return cached;

  let result: string;
  try {
    const parsed = new URL(url, 'http://local.invalid');
    if (!parsed.searchParams.has('w')) {
      result = url;
    } else {
      parsed.searchParams.delete('w');
      if (/^https?:\/\//i.test(url)) {
        result = parsed.toString();
      } else {
        result = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    }
  } catch {
    result = url
      .replace(/([?&])w=\d+(&|$)/i, (_, sep: string, end: string) => (end === '&' ? sep : ''))
      .replace(/\?$/, '');
  }

  if (_stripUrlCache.size >= _stripUrlCacheMaxSize) {
    const half = Math.floor(_stripUrlCacheMaxSize / 2);
    let evicted = 0;
    for (const k of _stripUrlCache.keys()) {
      if (evicted >= half) break;
      _stripUrlCache.delete(k);
      evicted += 1;
    }
  }
  _stripUrlCache.set(url, result);
  return result;
}

/** Ultra-small LQIP under gallery heroes. */
export const GALLERY_LQIP_WIDTH = 32;

export function extractImagesFromOutputs(
  outputs: Record<string, unknown> | undefined
): ComfyOutputImage[] {
  if (!outputs) {
    return [];
  }

  const images: ComfyOutputImage[] = [];

  for (const nodeOutput of Object.values(outputs)) {
    if (!nodeOutput || typeof nodeOutput !== 'object') {
      continue;
    }

    // Most nodes (SaveImage, PreviewVideo, SaveAnimatedWEBP, SaveVideo) emit
    // refs under "images"; VHS uses "gifs"; SaveAudio uses "audio"; Hunyuan3D
    // SaveGLB uses "3d". Same {filename,subfolder,type} shape throughout.
    const record = nodeOutput as Record<string, unknown>;
    const refLists = ['videos', 'gifs', 'audio', '3d', 'mesh', 'files', 'images']
      .map(key => record[key])
      .filter((list): list is unknown[] => Array.isArray(list));

    for (const refList of refLists) {
      for (const image of refList) {
        if (!image || typeof image !== 'object') {
          continue;
        }

        const ref = image as Record<string, unknown>;
        if (typeof ref.filename !== 'string' || !ref.filename.trim()) {
          continue;
        }

        images.push({
          filename: ref.filename,
          subfolder: typeof ref.subfolder === 'string' ? ref.subfolder : '',
          type: typeof ref.type === 'string' ? ref.type : 'output',
          format: typeof ref.format === 'string' ? ref.format : undefined,
        });
      }
    }
  }

  return preferGalleryPlaybackOutputsFirst(images);
}

function galleryPlaybackRank(image: ComfyOutputImage): number {
  if (isGalleryMotionOutput(image)) {
    return 0;
  }
  const kind = resolveComfyOutputMediaKind(image);
  if (kind === 'audio' || kind === 'mesh') {
    return 1;
  }
  return 2;
}

function preferGalleryPlaybackOutputsFirst(images: ComfyOutputImage[]): ComfyOutputImage[] {
  const ranked = images.map((image, index) => ({ image, index, rank: galleryPlaybackRank(image) }));
  if (ranked.every(entry => entry.rank === 2)) {
    return images;
  }
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return ranked.map(entry => entry.image);
}

export type ComfyViewPathOptions = {
  /** When set, `/api/comfyui/view` returns a resized image thumb. */
  width?: number;
};

export function buildComfyViewPath(
  comfyUrl: string,
  image: ComfyOutputImage,
  options?: ComfyViewPathOptions
): string {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder,
    type: image.type,
    comfyUrl: comfyUrl.replace(/\/+$/, ''),
  });
  const width = options?.width;
  if (
    typeof width === 'number' &&
    Number.isFinite(width) &&
    width > 0 &&
    !shouldSkipGalleryThumbProxy(image.filename)
  ) {
    params.set('w', String(Math.min(Math.floor(width), 2048)));
  }
  return `/api/comfyui/view?${params.toString()}`;
}

/** Build a `srcSet` for responsive gallery thumbs. */
export function buildComfyViewSrcSet(
  comfyUrl: string,
  image: ComfyOutputImage,
  widths: readonly number[] = GALLERY_THUMB_SRCSET_WIDTHS
): string {
  return widths
    .map(width => `${buildComfyViewPath(comfyUrl, image, { width })} ${width}w`)
    .join(', ');
}
