import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { chmod, copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { hostRustTarget, nodeDistForTarget, sidecarBinaryName } from './targets.mjs';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binariesDir = path.join(desktopRoot, 'src-tauri', 'binaries');

async function download(url, dest) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed ${response.status} ${url}`);
  }
  await pipeline(response.body, createWriteStream(dest));
}

function extract(archivePath, destDir, dist) {
  if (dist.archive === 'zip') {
    if (process.platform === 'win32') {
      // Windows' own bsdtar reads zips (by full path: Git's GNU tar is first on a runner's PATH
      // and cannot). Expand-Archive broke on the runner image of 2026-11-20 ("Cannot find an
      // overload for ExtractToDirectory"), failing the v4.2.1 Windows build; kept as a fallback.
      const systemTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
      try {
        execFileSync(systemTar, ['-x', '-f', archivePath, '-C', destDir], { stdio: 'inherit' });
        return;
      } catch (error) {
        console.warn(`tar.exe could not unzip ${archivePath} (${error.message}); trying Expand-Archive`);
      }
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', `Expand-Archive -Force -Path "${archivePath}" -DestinationPath "${destDir}"`],
        { stdio: 'inherit' }
      );
      return;
    }
    execFileSync('unzip', ['-q', '-o', archivePath, '-d', destDir], { stdio: 'inherit' });
    return;
  }
  execFileSync('tar', ['-x', '-f', archivePath, '-C', destDir], { stdio: 'inherit' });
}

async function main() {
  const rustTarget = process.argv[2] || hostRustTarget();
  const dist = nodeDistForTarget(rustTarget);
  await mkdir(binariesDir, { recursive: true });
  const work = path.join(binariesDir, '.download');
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const archivePath = path.join(work, dist.filename);
  console.log(`Downloading Node ${dist.url}`);
  await download(dist.url, archivePath);
  extract(archivePath, work, dist);
  const extracted = path.join(
    work,
    dist.folder,
    dist.platform === 'win' ? dist.binary : path.join('bin', dist.binary)
  );
  const dest = path.join(binariesDir, sidecarBinaryName(rustTarget));
  await copyFile(extracted, dest);
  if (process.platform !== 'win32') {
    await chmod(dest, 0o755);
  }
  await rm(work, { recursive: true, force: true });
  console.log(`Wrote ${dest}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
