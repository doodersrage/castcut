/**
 * Director: JPEG frames into a Motion-JPEG AVI. The browser renders each frame to a JPEG, and
 * this wraps them in the simplest container ffmpeg reads everywhere — no encoder, no realtime
 * recording, the same in Chrome, Firefox and the desktop app. The server re-encodes it to H.264
 * for Wan (motion-transfer-server.ts).
 */

export type AviOptions = { width: number; height: number; fps: number };

const fourcc = (view: DataView, at: number, code: string) => {
  for (let i = 0; i < 4; i += 1) view.setUint8(at + i, code.charCodeAt(i));
};

/** A Motion-JPEG AVI of `frames` (each a whole JPEG file). */
export function mjpegAvi(frames: Uint8Array[], options: AviOptions): Uint8Array {
  const { width, height, fps } = options;
  if (!frames.length) throw new Error('No frames to put in the video.');
  const padded = frames.map(frame => frame.length + (frame.length % 2));
  const moviData = padded.reduce((sum, size) => sum + 8 + size, 0);
  const largest = Math.max(...frames.map(frame => frame.length));
  const hdrlSize = 4 + (8 + 56) + (8 + 4 + (8 + 56) + (8 + 40));
  const moviSize = 4 + moviData;
  const idxSize = 16 * frames.length;
  const total = 12 + (8 + hdrlSize) + (8 + moviSize) + (8 + idxSize);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  let at = 0;
  const u32 = (value: number) => {
    view.setUint32(at, value >>> 0, true);
    at += 4;
  };
  const u16 = (value: number) => {
    view.setUint16(at, value, true);
    at += 2;
  };
  const tag = (code: string) => {
    fourcc(view, at, code);
    at += 4;
  };

  tag('RIFF');
  u32(total - 8);
  tag('AVI ');

  tag('LIST');
  u32(hdrlSize);
  tag('hdrl');
  tag('avih');
  u32(56);
  u32(Math.round(1_000_000 / fps)); // microseconds per frame
  u32(largest * fps); // max bytes per second
  u32(0); // padding granularity
  u32(0x10); // AVIF_HASINDEX
  u32(frames.length);
  u32(0); // initial frames
  u32(1); // streams
  u32(largest);
  u32(width);
  u32(height);
  u32(0);
  u32(0);
  u32(0);
  u32(0);

  tag('LIST');
  u32(4 + (8 + 56) + (8 + 40));
  tag('strl');
  tag('strh');
  u32(56);
  tag('vids');
  tag('MJPG');
  u32(0); // flags
  u16(0); // priority
  u16(0); // language
  u32(0); // initial frames
  u32(1); // scale
  u32(fps); // rate: fps = rate / scale
  u32(0); // start
  u32(frames.length); // length
  u32(largest); // suggested buffer size
  u32(0xffffffff); // quality: default
  u32(0); // sample size
  u16(0);
  u16(0);
  u16(width);
  u16(height);
  tag('strf');
  u32(40);
  u32(40); // BITMAPINFOHEADER size
  u32(width);
  u32(height);
  u16(1); // planes
  u16(24); // bits per pixel
  tag('MJPG');
  u32(width * height * 3);
  u32(0);
  u32(0);
  u32(0);
  u32(0);

  tag('LIST');
  u32(moviSize);
  const moviStart = at;
  tag('movi');
  const offsets: number[] = [];
  frames.forEach((frame, i) => {
    offsets.push(at - moviStart);
    tag('00dc');
    u32(frame.length);
    bytes.set(frame, at);
    at += padded[i]!;
  });

  tag('idx1');
  u32(idxSize);
  frames.forEach((frame, i) => {
    tag('00dc');
    u32(0x10); // AVIIF_KEYFRAME
    u32(offsets[i]!);
    u32(frame.length);
  });
  return bytes;
}

/** Read an AVI's frame count, size and rate back (for tests). */
export function readAviHeader(bytes: Uint8Array): AviOptions & { frames: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (text(0) !== 'RIFF' || text(8) !== 'AVI ') throw new Error('Not an AVI file.');
  // avih follows RIFF(12) + LIST hdrl header (12).
  const avih = 24;
  if (text(avih) !== 'avih') throw new Error('No AVI header.');
  const micro = view.getUint32(avih + 8, true);
  return {
    fps: Math.round(1_000_000 / micro),
    frames: view.getUint32(avih + 8 + 16, true),
    width: view.getUint32(avih + 8 + 32, true),
    height: view.getUint32(avih + 8 + 36, true),
  };
}
