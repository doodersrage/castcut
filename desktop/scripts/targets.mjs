import { execSync } from 'node:child_process';
import os from 'node:os';

/** Official Node 24 (LTS) distro used as the bundled runtime sidecar. */
export const BUNDLED_NODE_VERSION = '24.22.2';

const HOST_TRIPLES = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'win32-arm64': 'aarch64-pc-windows-msvc',
  'win32-x64': 'x86_64-pc-windows-msvc',
};

const NODE_DIST = {
  'aarch64-apple-darwin': { platform: 'darwin', arch: 'arm64', archive: 'tar.gz', binary: 'node' },
  'x86_64-apple-darwin': { platform: 'darwin', arch: 'x64', archive: 'tar.gz', binary: 'node' },
  'aarch64-unknown-linux-gnu': { platform: 'linux', arch: 'arm64', archive: 'tar.xz', binary: 'node' },
  'x86_64-unknown-linux-gnu': { platform: 'linux', arch: 'x64', archive: 'tar.xz', binary: 'node' },
  'aarch64-pc-windows-msvc': { platform: 'win', arch: 'arm64', archive: 'zip', binary: 'node.exe' },
  'x86_64-pc-windows-msvc': { platform: 'win', arch: 'x64', archive: 'zip', binary: 'node.exe' },
};

export function hostRustTarget() {
  const fromEnv = process.env.TAURI_ENV_TARGET_TRIPLE?.trim() || process.env.RUST_TARGET?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const rustc = execSync('rustc -vV', { encoding: 'utf8' });
    const match = rustc.match(/^host:\s+(\S+)/m);
    if (match?.[1]) {
      return match[1];
    }
  } catch {
    // rustc is optional for staging; fall back to process platform.
  }
  const key = `${os.platform()}-${os.arch()}`;
  const mapped = HOST_TRIPLES[key];
  if (!mapped) {
    throw new Error(`Unsupported desktop host ${key}. Set RUST_TARGET.`);
  }
  return mapped;
}

export function nodeDistForTarget(rustTarget) {
  const dist = NODE_DIST[rustTarget];
  if (!dist) {
    throw new Error(`No Node.js distro mapping for ${rustTarget}.`);
  }
  const folder = `node-v${BUNDLED_NODE_VERSION}-${dist.platform}-${dist.arch}`;
  const ext = dist.archive;
  return {
    ...dist,
    folder,
    url: `https://nodejs.org/dist/v${BUNDLED_NODE_VERSION}/${folder}.${ext}`,
    filename: `${folder}.${ext}`,
  };
}

export function sidecarBinaryName(rustTarget) {
  const dist = nodeDistForTarget(rustTarget);
  return dist.binary === 'node.exe' ? `node-${rustTarget}.exe` : `node-${rustTarget}`;
}
