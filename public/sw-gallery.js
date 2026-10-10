const IMAGE_CACHE = 'gallery-images-v4';
const MAX_CACHED_IMAGES = 200;

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then(keys =>
          Promise.all(keys.filter(key => key !== IMAGE_CACHE).map(key => caches.delete(key)))
        ),
    ])
  );
});

async function trimImageCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_CACHED_IMAGES) {
    return;
  }
  const overflow = keys.length - MAX_CACHED_IMAGES;
  await Promise.all(keys.slice(0, overflow).map(key => cache.delete(key)));
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') {
    return;
  }

  // Cache ComfyUI image proxy responses only — never HTML/RSC navigations
  // (hijacking navigate/text/html breaks Next soft-refresh and looks like a load loop).
  if (!url.pathname.startsWith('/api/comfyui/view')) {
    return;
  }
  // Video and audio stream in byte ranges: a 206 cannot be cached (cache.put throws), which
  // failed the whole response — talking clips showed "no video with supported format". Leave
  // them to the network.
  if (
    event.request.headers.has('range') ||
    /\.(mp4|webm|mov|mkv|wav|mp3|flac|ogg|m4a|aac)$/i.test(url.searchParams.get('filename') || '')
  ) {
    return;
  }

  event.respondWith(
    caches.open(IMAGE_CACHE).then(async cache => {
      const cached = await cache.match(event.request);
      if (cached) {
        return cached;
      }
      const response = await fetch(event.request);
      if (response.status === 200) {
        // A failed cache write must never fail the picture itself.
        await cache.put(event.request, response.clone()).catch(() => undefined);
        void trimImageCache(cache);
      }
      return response;
    })
  );
});
