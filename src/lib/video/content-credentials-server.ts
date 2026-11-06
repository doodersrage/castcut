/**
 * Content Credentials (C2PA) on a rendered film, server side: the install's signing identity and
 * the signing itself, which runs as its own process (scripts/c2pa-sign.mjs) so the memory a long
 * film takes to sign is handed back afterwards.
 *
 * The identity: CASTCUT_C2PA_CERT_FILE + CASTCUT_C2PA_KEY_FILE (PEM; the certificate chain, signer
 * first, and its private key) when set — a certificate from a C2PA-recognised authority, which
 * readers then show by name. Else the install's own, made the first time it signs and kept in the
 * data folder (c2pa/, the key readable by its owner only).
 *
 * A film is never held back by this: anything that goes wrong leaves it unsigned, with a note.
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CURRENT_APP_VERSION } from '../app/version';
import { resolvePromptDataDir } from '../prompt/data-paths';
import {
  makeContentCredentialsIdentity,
  type ContentCredentialsIdentity,
} from './content-credentials-cert';
import {
  contentCredentialsFormat,
  filmContentCredentialsManifest,
  type ContentCredentialsRequest,
  type ContentCredentialsResult,
} from './content-credentials';

/** Larger films aren't signed: the signed copy is built in memory (about 4× the file at peak). */
export const CONTENT_CREDENTIALS_MAX_BYTES = 1.5 * 1024 ** 3;
const SIGN_TIMEOUT_MS = 10 * 60_000;

let identityPromise: Promise<ContentCredentialsIdentity> | null = null;

async function readIdentityFiles(certFile: string, keyFile: string) {
  const [chainPem, keyPem] = await Promise.all([
    fs.readFile(/* turbopackIgnore: true */ certFile, 'utf8'),
    fs.readFile(/* turbopackIgnore: true */ keyFile, 'utf8'),
  ]);
  return { chainPem, keyPem };
}

/** The identity films are signed with (yours from the environment, else the install's own). */
export function contentCredentialsIdentity(): Promise<ContentCredentialsIdentity> {
  identityPromise ??= (async () => {
    const certFile = process.env.CASTCUT_C2PA_CERT_FILE?.trim();
    const keyFile = process.env.CASTCUT_C2PA_KEY_FILE?.trim();
    if (certFile && keyFile) return readIdentityFiles(certFile, keyFile);
    const dir = path.join(resolvePromptDataDir(), 'c2pa');
    const chainFile = path.join(/* turbopackIgnore: true */ dir, 'chain.pem');
    const keyPath = path.join(/* turbopackIgnore: true */ dir, 'key.pem');
    const kept = await readIdentityFiles(chainFile, keyPath).catch(() => null);
    if (kept) return kept;
    const made = makeContentCredentialsIdentity();
    await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
    await fs.writeFile(/* turbopackIgnore: true */ keyPath, made.keyPem, { mode: 0o600 });
    await fs.writeFile(/* turbopackIgnore: true */ chainFile, made.chainPem);
    return made;
  })().catch(error => {
    identityPromise = null;
    throw error;
  });
  return identityPromise;
}

function signerScript(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), 'scripts', 'c2pa-sign.mjs');
}

function runSigner(payload: object): Promise<{ state?: string; codes?: string[] }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [signerScript()], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), SIGN_TIMEOUT_MS);
    child.stdout.setEncoding('utf8').on('data', chunk => (out += chunk));
    child.stderr.setEncoding('utf8').on('data', chunk => (err += chunk));
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(out) as {
          ok: boolean;
          error?: string;
          state?: string;
          codes?: string[];
        };
        if (result.ok) resolve(result);
        else reject(new Error(result.error ?? 'signing failed'));
      } catch {
        reject(new Error(err.trim().split('\n').pop() || `signer exited ${code ?? 'early'}`));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

/**
 * Sign a rendered film in place of its file: the signed copy is written beside it and its path
 * returned, with what the reader said. Unsigned (the same file, and a note) when it can't be.
 */
export async function signFilmWithContentCredentials(input: {
  file: string;
  extension: string;
  title?: string | null;
  request: ContentCredentialsRequest;
}): Promise<{ file: string; result: ContentCredentialsResult }> {
  const format = contentCredentialsFormat(input.extension);
  if (!format) {
    return {
      file: input.file,
      result: { signed: false, note: `a .${input.extension} isn’t signed` },
    };
  }
  try {
    const { size } = await fs.stat(/* turbopackIgnore: true */ input.file);
    if (size > CONTENT_CREDENTIALS_MAX_BYTES) {
      return {
        file: input.file,
        result: { signed: false, note: 'too large to sign here (over 1.5 GB)' },
      };
    }
    const identity = await contentCredentialsIdentity();
    const output = input.file.replace(/(\.[^.\\/]+)?$/, `-c2pa.${input.extension}`);
    const read = await runSigner({
      input: input.file,
      output,
      format,
      manifest: filmContentCredentialsManifest({
        title: input.title,
        version: CURRENT_APP_VERSION,
        engines: input.request.engines,
      }),
      keyPem: identity.keyPem,
      chainPem: identity.chainPem,
    });
    // An untrusted signer is the normal case for an install's own certificate.
    const problems = (read.codes ?? []).filter(code => code !== 'signingCredential.untrusted');
    if (read.state === 'Invalid' || problems.length) {
      await fs.rm(/* turbopackIgnore: true */ output, { force: true });
      return {
        file: input.file,
        result: { signed: false, note: `the signature didn't check out (${problems.join(', ')})` },
      };
    }
    return { file: output, result: { signed: true } };
  } catch (error) {
    console.warn('[content-credentials] not signed:', error);
    return {
      file: input.file,
      result: {
        signed: false,
        note: error instanceof Error ? error.message.slice(0, 200) : 'signing failed',
      },
    };
  }
}
