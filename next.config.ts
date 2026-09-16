import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const baseConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
  env: {
    NEXT_PUBLIC_PROMPT_NSFW_GENERATOR_ENABLED:
      process.env.NEXT_PUBLIC_PROMPT_NSFW_GENERATOR_ENABLED ??
      process.env.PROMPT_NSFW_GENERATOR_ENABLED ??
      '',
    NEXT_PUBLIC_PROMPT_DESKTOP: process.env.NEXT_PUBLIC_PROMPT_DESKTOP ?? '',
  },

  // Keep local Python engine envs and dynamic filesystem ops out of NFT / Turbopack traces.
  // The diffusers-engine loras/outputs dirs are runtime data (downloaded LoRAs, generated
  // images), not code the engine needs to boot — including them was bloating the standalone
  // output by ~650MB. run.sh/app/requirements.txt/configs stay traced so autostart still works.
  // NOTE: the key MUST start with '/' — it's a route glob matched against the route path
  // (see https://nextjs.org/docs/app/api-reference/config/next-config-js/output), not a
  // bare wildcard. A key of '*' (no leading slash) never matches any real route and silently
  // does nothing, which is why this block had zero effect despite being "correct" glob syntax.
  outputFileTracingExcludes: {
    '/*': [
      './services/**/.venv/**/*',
      './services/diffusers-engine/.venv/**/*',
      './services/diffusers-engine/loras/**/*',
      './services/diffusers-engine/outputs/**/*',
      './src/lib/comfyui-view-cache.ts',
      // Scratch/cleanup dir from prior sessions — never belongs in a build output.
      './_to_delete/**/*',
    ],
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

// Skip @next/bundle-analyzer wrapper entirely when ANALYZE is off — saves build-time.
// When enabled, wrap with the standard plugin (openAnalyzer: false = silent mode).
const _isAnalyzing = process.env.ANALYZE === 'true';
export default (_isAnalyzing
  ? bundleAnalyzer({ ...baseConfig, openAnalyzer: true })
  : baseConfig) as NextConfig;
