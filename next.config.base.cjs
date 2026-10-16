// Castcut's Next config, shared with Prompt Studio through prompt-studio-core (its next.config.ts).
// Plain CommonJS so both apps' next.config.ts can require it: Next compiles a TypeScript config to
// CommonJS, which cannot require another .ts file.

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS config (see above)
const os = require('node:os');

// `next dev` serves its scripts only to localhost unless the page's host is listed here, so
// opening it at the machine's LAN IP or through the reverse proxy left the login form dead
// (a plain form submit back to /login, 2026-10-14). This machine's own addresses and the
// PROMPT_TRUSTED_HOSTS names are what the app already accepts as same-origin.
function devOrigins() {
  const hosts = new Set(['127.0.0.1']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const entry of list ?? []) {
      if (entry.family === 'IPv4') hosts.add(entry.address);
    }
  }
  for (const name of (process.env.PROMPT_TRUSTED_HOSTS ?? '').split(',')) {
    if (name.trim()) hosts.add(name.trim().toLowerCase());
  }
  return [...hosts];
}

/** @type {import('next').NextConfig} */
const baseConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Security headers (audit, 2026-10-11): none were sent. Another site could frame the app and
  // trick clicks (Restore backup, Delete), browsers could MIME-sniff media, full URLs leaked as
  // Referer, and X-Powered-By named the framework. HSTS belongs on the TLS reverse proxy.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Microphone stays allowed (Cast voice recording).
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), usb=()' },
        ],
      },
    ];
  },
  allowedDevOrigins: devOrigins(),
  env: {
    NEXT_PUBLIC_PROMPT_NSFW_GENERATOR_ENABLED:
      process.env.NEXT_PUBLIC_PROMPT_NSFW_GENERATOR_ENABLED ??
      process.env.PROMPT_NSFW_GENERATOR_ENABLED ??
      '',
    NEXT_PUBLIC_PROMPT_DESKTOP: process.env.NEXT_PUBLIC_PROMPT_DESKTOP ?? '',
  },

  // Keep dynamic filesystem ops out of NFT / Turbopack traces. services/ held the Diffusers
  // engine, now its own repo (castcut-diffusers, installed into the data folder): an old
  // checkout's leftovers there (LoRAs, outputs, venvs — ~1 GB) never belong in a build.
  // NOTE: the key MUST start with '/' — it's a route glob matched against the route path
  // (see https://nextjs.org/docs/app/api-reference/config/next-config-js/output), not a
  // bare wildcard. A key of '*' (no leading slash) never matches any real route and silently
  // does nothing, which is why this block had zero effect despite being "correct" glob syntax.
  outputFileTracingExcludes: {
    '/*': [
      './services/**/*',
      './src/lib/comfyui-view-cache.ts',
      // Scratch/cleanup dir from prior sessions — never belongs in a build output.
      './_to_delete/**/*',
    ],
  },
  // The Castcut node pack the app serves for copy-install (src/app/api/castcut-nodes/file).
  outputFileTracingIncludes: {
    '/api/castcut-nodes/file': ['./comfyui-nodes/castcut/castcut_nodes.py'],
  },

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '47832',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '47832',
        pathname: '/**',
      },
    ],
    // Optimize image loading
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  experimental: {
    optimizePackageImports: ['@tanstack/react-virtual', '@xyflow/react', 'dexie'],
    serverActions: {
      bodySizeLimit: '80mb',
    },
    // src/proxy.ts runs on every /api request, and Next buffers request bodies for the proxy
    // only up to 10 MB by default — the rest is cut off. The gallery sync push (the whole
    // gallery with saved workflows) passes that in normal use and then failed with a 500, and
    // large uploads were at risk the same way.
    proxyClientMaxBodySize: '80mb',
    optimizeCss: true,
  },
  serverExternalPackages: ['onnxruntime-web', 'onnxruntime-node', '@huggingface/transformers'],

  async redirects() {
    return [
      {
        source: '/duo',
        destination: '/character?mode=duo',
        permanent: true,
      },
      {
        source: '/random-scene',
        destination: '/?source=random',
        permanent: true,
      },
      {
        source: '/roleplay',
        destination: '/story',
        permanent: true,
      },
      {
        source: '/roleplay/:path*',
        destination: '/story/:path*',
        permanent: true,
      },
      {
        source: '/m/play',
        destination: '/m/story',
        permanent: true,
      },
      {
        source: '/m/play/:path*',
        destination: '/m/story/:path*',
        permanent: true,
      },
    ];
  },

  // Add service worker configuration
  async rewrites() {
    return [
      {
        source: '/sw.js',
        destination: '/service-worker.js',
      },
    ];
  },
};

module.exports = baseConfig;
