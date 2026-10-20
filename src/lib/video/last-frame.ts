/** Extract a decoded frame from a same-origin (or CORS) video as a JPEG blob. */

function extractVideoFrameAt(url: string, seekSeconds: number, frameLabel: string): Promise<Blob> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error('Clip URL is empty.');
  }
  if (typeof document === 'undefined') {
    throw new Error('Video frame extract needs a browser.');
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const fail = (message: string) => {
      video.removeAttribute('src');
      video.load();
      reject(new Error(message));
    };

    video.onerror = () => fail('Could not load that clip.');
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const target =
        seekSeconds < 0
          ? duration > 0.08
            ? duration - 0.05
            : 0
          : duration > 0
            ? Math.min(Math.max(0, seekSeconds), Math.max(0, duration - 0.001))
            : Math.max(0, seekSeconds);
      video.currentTime = target;
    };
    video.onseeked = () => {
      const width = video.videoWidth || 1024;
      const height = video.videoHeight || 1024;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        fail(`Could not draw the ${frameLabel}.`);
        return;
      }
      context.drawImage(video, 0, 0, width, height);
      canvas.toBlob(
        blob => {
          video.removeAttribute('src');
          video.load();
          if (!blob) {
            fail(`${frameLabel} was empty.`);
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        0.92
      );
    };
    video.src = trimmed;
  });
}

export async function extractVideoFirstFrame(url: string): Promise<Blob> {
  return extractVideoFrameAt(url, 0.05, 'first frame');
}

export async function extractVideoLastFrame(url: string): Promise<Blob> {
  return extractVideoFrameAt(url, -1, 'last frame');
}
