import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dest = path.join(repoRoot, 'desktop', 'src-tauri', 'resources', 'server');

async function mustExist(filePath, hint) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(`${hint} Missing ${path.relative(repoRoot, filePath)}. Run npm run build first.`);
  }
}

async function vendorOnnxRuntimeNativeLibs() {
  // Next standalone tracing often copies onnxruntime_binding.node but omits sibling
  // libonnxruntime.so.* files. linuxdeploy then fails AppImage bundling with
  // "Could not find dependency: libonnxruntime.so.1".
  // Only vendor the CPU runtime + napi binding — CUDA/TensorRT provider .so files
  // pull libcublas and break AppImage packaging on CI runners without CUDA.
  const platforms = [
    ['linux', 'x64', ['onnxruntime_binding.node', 'libonnxruntime.so.1', 'libonnxruntime_providers_shared.so']],
    ['linux', 'arm64', ['onnxruntime_binding.node', 'libonnxruntime.so.1', 'libonnxruntime_providers_shared.so']],
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
    const destDir = path.join(
      dest,
      'node_modules',
      'onnxruntime-node',
      'bin',
      'napi-v6',
      os,
      arch
    );
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
  const imgDir = path.join(dest, 'node_modules', '@img');
  let entries = [];
  try {
    entries = await readdir(imgDir);
  } catch {
    return;
  }
  const musl = entries.filter(name => name.includes('linuxmusl'));
  for (const name of musl) {
    await rm(path.join(imgDir, name), { recursive: true, force: true });
  }
  if (musl.length > 0) {
    console.log(`Dropped ${musl.length} musl-only native package(s): ${musl.join(', ')}`);
  }
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
  console.log(`Staged standalone server at ${path.relative(repoRoot, dest)}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
