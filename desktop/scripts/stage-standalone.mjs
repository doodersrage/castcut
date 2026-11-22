import { cp, lstat, mkdir, readdir, readFile, readlink, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dest = path.join(repoRoot, 'desktop', 'src-tauri', 'resources', 'server');

async function mustExist(filePath, hint) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(
      `${hint} Missing ${path.relative(repoRoot, filePath)}. Run npm run build first.`
    );
  }
}

async function vendorOnnxRuntimeNativeLibs() {
  // Next standalone tracing often copies onnxruntime_binding.node but omits sibling
  // libonnxruntime.so.* files. linuxdeploy then fails AppImage bundling with
  // "Could not find dependency: libonnxruntime.so.1".
  // Only vendor the CPU runtime + napi binding — CUDA/TensorRT provider .so files
  // pull libcublas and break AppImage packaging on CI runners without CUDA.
  const platforms = [
    [
      'linux',
      'x64',
      ['onnxruntime_binding.node', 'libonnxruntime.so.1', 'libonnxruntime_providers_shared.so'],
    ],
    [
      'linux',
      'arm64',
      ['onnxruntime_binding.node', 'libonnxruntime.so.1', 'libonnxruntime_providers_shared.so'],
    ],
    ['darwin', 'arm64', ['onnxruntime_binding.node', 'libonnxruntime.1.24.3.dylib']],
    ['darwin', 'x64', ['onnxruntime_binding.node', 'libonnxruntime.1.24.3.dylib']],
    ['win32', 'x64', ['onnxruntime_binding.node', 'onnxruntime.dll']],
  ];
  let copied = 0;
  for (const [os, arch, files] of platforms) {
    const srcDir = path.join(
      repoRoot,
      'node_modules',
      'onnxruntime-node',
      'bin',
      'napi-v6',
      os,
      arch
    );
    const destDir = path.join(dest, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', os, arch);
    try {
      await stat(srcDir);
    } catch {
      continue;
    }
    await mkdir(destDir, { recursive: true });
    for (const file of files) {
      const from = path.join(srcDir, file);
      try {
        await stat(from);
      } catch {
        continue;
      }
      await cp(from, path.join(destDir, file), { force: true });
      copied += 1;
    }
  }
  if (copied > 0) {
    console.log(`Vendored ${copied} onnxruntime-node CPU native file(s) into staged server`);
  }

  // Drop optional GPU provider plugins if standalone tracing pulled them in.
  const gpuProviders = [
    'libonnxruntime_providers_cuda.so',
    'libonnxruntime_providers_tensorrt.so',
    'onnxruntime_providers_cuda.dll',
    'onnxruntime_providers_tensorrt.dll',
  ];
  for (const [os, arch] of [
    ['linux', 'x64'],
    ['linux', 'arm64'],
    ['win32', 'x64'],
  ]) {
    const dir = path.join(dest, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', os, arch);
    for (const file of gpuProviders) {
      try {
        await rm(path.join(dir, file), { force: true });
      } catch {
        // ignore
      }
    }
  }
}

async function dropMuslNativePackages() {
  // The desktop app runs on glibc Linux, macOS and Windows — never musl (Alpine). Next's
  // standalone trace can copy sharp's musl build (@img/sharp-linuxmusl-*, @img/sharp-libvips-
  // linuxmusl-*), and linuxdeploy then fails the AppImage: "Could not find dependency:
  // libc.musl-x86_64.so.1" (v2.3.1 release, 2026-10-05).
  // Every copy, nested ones included (next/node_modules/@img/sharp-linuxmusl-x64 on v2.3.2).
  const dropped = [];
  const walk = async dir => {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (path.basename(dir) === '@img' && entry.name.includes('linuxmusl')) {
        await rm(full, { recursive: true, force: true });
        dropped.push(path.relative(dest, full));
      } else if (
        entry.name === 'node_modules' ||
        entry.name.startsWith('@') ||
        dir.endsWith('node_modules')
      ) {
        await walk(full);
      }
    }
  };
  await walk(path.join(dest, 'node_modules'));
  if (dropped.length > 0) {
    console.log(`Dropped ${dropped.length} musl-only native package(s): ${dropped.join(', ')}`);
  }
}

/** Every file under `dir` (recursive), for scanning the server chunks. */
async function listFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * Turbopack's hashed externals as real folders. A Turbopack standalone server loads packages it
 * keeps external (sharp, @napi-rs/canvas, @huggingface/transformers) as `<name>-<hash>`, through
 * symlinks in `.next/node_modules` (sharp-20c6a5da84e2135f -> ../../node_modules/sharp). On the
 * Windows installer they were missing: every route that loads sharp failed with
 * ERR_MODULE_NOT_FOUND "Cannot find package 'sharp-20c6a5da84e2135f'", so ComfyUI showed as
 * unreachable (issue #8, v4.2.2). Each name the server chunks ask for is made a real copy of the
 * package: a symlink replaced by what it points at, a missing one copied from node_modules.
 */
export async function materializeHashedExternals(serverDir, fallbackNodeModules) {
  const linkRoot = path.join(serverDir, '.next', 'node_modules');
  const wanted = new Set();
  const pattern = /["']((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)-([0-9a-f]{16})["']/g;
  for (const file of await listFiles(path.join(serverDir, '.next', 'server'))) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(pattern)) wanted.add(`${match[1]}|${match[2]}`);
  }
  const made = [];
  for (const key of wanted) {
    const [name, hash] = key.split('|');
    const at = path.join(linkRoot, `${name}-${hash}`);
    let info = null;
    try {
      info = await lstat(at);
    } catch {
      info = null;
    }
    if (info && !info.isSymbolicLink()) continue;
    // Where the package is: the link's own target, else the server's traced copy, else the repo's.
    const candidates = [];
    if (info?.isSymbolicLink()) candidates.push(path.resolve(path.dirname(at), await readlink(at)));
    candidates.push(
      path.join(serverDir, 'node_modules', name),
      path.join(fallbackNodeModules, name)
    );
    let source = null;
    for (const candidate of candidates) {
      try {
        if ((await stat(path.join(candidate, 'package.json'))).isFile()) {
          source = candidate;
          break;
        }
      } catch {
        // next
      }
    }
    if (!source) throw new Error(`No package for the server's external ${name}-${hash}.`);
    await rm(at, { recursive: true, force: true });
    await mkdir(path.dirname(at), { recursive: true });
    await cp(source, at, { recursive: true, dereference: true });
    made.push(`${name}-${hash}`);
  }
  if (made.length)
    console.log(`Made ${made.length} hashed external(s) real folders: ${made.join(', ')}`);
  return made;
}

async function main() {
  const standalone = path.join(repoRoot, '.next', 'standalone');
  const staticDir = path.join(repoRoot, '.next', 'static');
  const publicDir = path.join(repoRoot, 'public');
  await mustExist(path.join(standalone, 'server.js'), 'Standalone server is not built.');
  await mustExist(staticDir, 'Next static assets are not built.');
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await cp(standalone, dest, { recursive: true });
  await mkdir(path.join(dest, '.next'), { recursive: true });
  await cp(staticDir, path.join(dest, '.next', 'static'), { recursive: true });
  await cp(publicDir, path.join(dest, 'public'), { recursive: true });
  await vendorOnnxRuntimeNativeLibs();
  await dropMuslNativePackages();
  await materializeHashedExternals(dest, path.join(repoRoot, 'node_modules'));
  console.log(`Staged standalone server at ${path.relative(repoRoot, dest)}`);
}

// Run as a script (npm run desktop:stage); imported, only the helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
