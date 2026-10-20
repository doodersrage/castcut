export type LightboxHistogram = {
  r: number[];
  g: number[];
  b: number[];
  /** 0–1 mean luminance. */
  meanLuma: number;
  /** Rough exposure hint. */
  exposure: 'dark' | 'balanced' | 'bright' | 'clipped';
};

const BUCKETS = 32;

function emptyChannels(): number[] {
  return Array.from({ length: BUCKETS }, () => 0);
}

/**
 * Prefer same-origin `/api/comfyui/view` (optionally with a small `w`) so canvas
 * sampling is not CORS-tainted by raw Comfy host URLs.
 */
export function resolveHistogramSampleUrl(url: string): string {
  if (!url) {
    return url;
  }

  if (url.startsWith('/api/')) {
    try {
      const parsed = new URL(url, 'http://local.invalid');
      if (!parsed.searchParams.has('w')) {
        parsed.searchParams.set('w', '160');
      }
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return url;
    }
  }

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    if (path.endsWith('/view')) {
      const filename = parsed.searchParams.get('filename');
      if (filename?.trim()) {
        const params = new URLSearchParams({
          filename: filename.trim(),
          subfolder: parsed.searchParams.get('subfolder') ?? '',
          type: parsed.searchParams.get('type') ?? 'output',
          comfyUrl: `${parsed.protocol}//${parsed.host}`,
          w: '160',
        });
        return `/api/comfyui/view?${params.toString()}`;
      }
    }
  } catch {
    // keep original
  }

  return url;
}

/**
 * Sample an image URL into coarse RGB histograms.
 * Uses fetch→blob when possible so same-origin proxy URLs never taint the canvas.
 */
export async function computeLightboxHistogram(url: string): Promise<LightboxHistogram | null> {
  if (typeof window === 'undefined' || !url) {
    return null;
  }

  const sampleUrl = resolveHistogramSampleUrl(url);
  let objectUrl: string | null = null;

  try {
    const image = await loadImageForSampling(sampleUrl).then(result => {
      objectUrl = result.objectUrl;
      return result.image;
    });
    const maxEdge = 160;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight, 1));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return null;
    }
    ctx.drawImage(image, 0, 0, width, height);
    let data: ImageData;
    try {
      data = ctx.getImageData(0, 0, width, height);
    } catch {
      return null;
    }

    const r = emptyChannels();
    const g = emptyChannels();
    const b = emptyChannels();
    let lumaSum = 0;
    let count = 0;
    let dark = 0;
    let bright = 0;
    const pixels = data.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const rv = pixels[i] ?? 0;
      const gv = pixels[i + 1] ?? 0;
      const bv = pixels[i + 2] ?? 0;
      const a = pixels[i + 3] ?? 0;
      if (a < 8) {
        continue;
      }
      const ri = Math.min(BUCKETS - 1, Math.floor((rv / 255) * BUCKETS));
      const gi = Math.min(BUCKETS - 1, Math.floor((gv / 255) * BUCKETS));
      const bi = Math.min(BUCKETS - 1, Math.floor((bv / 255) * BUCKETS));
      r[ri] = (r[ri] ?? 0) + 1;
      g[gi] = (g[gi] ?? 0) + 1;
      b[bi] = (b[bi] ?? 0) + 1;
      const luma = (0.2126 * rv + 0.7152 * gv + 0.0722 * bv) / 255;
      lumaSum += luma;
      count += 1;
      if (luma < 0.08) {
        dark += 1;
      }
      if (luma > 0.92) {
        bright += 1;
      }
    }
    if (count === 0) {
      return null;
    }
    const meanLuma = lumaSum / count;
    const darkRatio = dark / count;
    const brightRatio = bright / count;
    let exposure: LightboxHistogram['exposure'] = 'balanced';
    if (brightRatio > 0.12 || darkRatio > 0.12) {
      exposure = 'clipped';
    } else if (meanLuma < 0.32) {
      exposure = 'dark';
    } else if (meanLuma > 0.68) {
      exposure = 'bright';
    }

    return { r, g, b, meanLuma, exposure };
  } catch {
    return null;
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

async function loadImageForSampling(
  url: string
): Promise<{ image: HTMLImageElement; objectUrl: string | null }> {
  // Same-origin (and rewritten proxy) URLs: fetch as blob so getImageData is never tainted.
  if (url.startsWith('/') || url.startsWith(window.location.origin)) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`histogram fetch failed (${response.status})`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const image = await loadImageElement(objectUrl, false);
    return { image, objectUrl };
  }

  const image = await loadImageElement(url, true);
  return { image, objectUrl: null };
}

function loadImageElement(url: string, anonymous: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    if (anonymous) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image load failed'));
    image.src = url;
  });
}

export function normalizeHistogramChannel(values: number[]): number[] {
  const peak = Math.max(1, ...values);
  return values.map(value => value / peak);
}
