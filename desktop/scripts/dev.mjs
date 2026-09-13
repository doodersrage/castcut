import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const desktopRoot = path.join(repoRoot, 'desktop');
const PORT = process.env.PORT?.trim() || '47832';
const origin = `http://127.0.0.1:${PORT}`;

async function isUp() {
  try {
    const response = await fetch(`${origin}/api/health`, { cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

function run(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  return child;
}

async function waitForHealth(timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isUp()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Castcut did not become ready at ${origin}`);
}

async function main() {
  let nextDev;
  if (!(await isUp())) {
    console.log(`Starting Next.js on ${origin}`);
    nextDev = run('npm', ['run', 'dev'], repoRoot);
  }
  try {
    await waitForHealth();
    const tauri = run('npx', ['tauri', 'dev'], desktopRoot);
    await new Promise((resolve, reject) => {
      tauri.on('exit', code => {
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`tauri dev exited ${code}`));
        }
      });
      tauri.on('error', reject);
    });
  } finally {
    nextDev?.kill();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
