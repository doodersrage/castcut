'use client';

/** A track's loudness, sampled into `buckets` peaks 0–1 (for a waveform), with its length. */

const cache = new Map<string, Promise<{ peaks: Float32Array; seconds: number } | null>>();

export function audioPeaks(
  url: string,
  buckets = 1200
): Promise<{ peaks: Float32Array; seconds: number } | null> {
  const key = `${url}|${buckets}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const response = await fetch(url, { credentials: 'same-origin' });
        if (!response.ok) return null;
        const data = await response.arrayBuffer();
        const Context =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) return null;
        const context = new Context();
        try {
          const audio = await context.decodeAudioData(data);
          const channel = audio.getChannelData(0);
          const size = Math.max(1, Math.floor(channel.length / buckets));
          const peaks = new Float32Array(buckets);
          let top = 0;
          for (let b = 0; b < buckets; b += 1) {
            let peak = 0;
            const start = b * size;
            for (let i = start; i < Math.min(channel.length, start + size); i += 8) {
              const value = Math.abs(channel[i]!);
              if (value > peak) peak = value;
            }
            peaks[b] = peak;
            if (peak > top) top = peak;
          }
          if (top > 0) for (let b = 0; b < buckets; b += 1) peaks[b] = peaks[b]! / top;
          return { peaks, seconds: audio.duration };
        } finally {
          void context.close();
        }
      } catch {
        return null;
      }
    })();
    cache.set(key, pending);
  }
  return pending;
}
