import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { promisify } from 'node:util';
import {
  COMPOSITE_WITH_AI,
  contentCredentialsFormat,
  filmContentCredentialsManifest,
  filmEngineNames,
  normalizeContentCredentialsRequest,
} from './content-credentials';
import { makeContentCredentialsIdentity } from './content-credentials-cert';
import { resolveFfmpegBinary } from './server-encode';

const run = promisify(execFile);

const certificates = (pem: string) =>
  (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []).map(
    block => new X509Certificate(block)
  );

describe('Content Credentials: the signing identity', () => {
  it('is a signing certificate issued by its own CA — never one that signed itself', () => {
    const identity = makeContentCredentialsIdentity({ now: new Date('2026-11-06T12:00:00Z') });
    const [signer, authority] = certificates(identity.chainPem);
    assert.ok(signer && authority);
    assert.equal(authority.ca, true);
    assert.equal(signer.ca, false);
    assert.ok(signer.verify(authority.publicKey), 'the CA signed the signer');
    assert.ok(authority.verify(authority.publicKey));
    assert.ok(!signer.verify(signer.publicKey), 'not self-signed');
    assert.equal(signer.issuer, authority.subject);
    assert.notEqual(signer.subject, signer.issuer);
    // id-kp-emailProtection: an extended key usage C2PA accepts.
    assert.deepEqual(signer.keyUsage, ['1.3.6.1.5.5.7.3.4']);
    assert.ok(new Date(signer.validTo).getUTCFullYear() >= 2036);
    assert.match(identity.keyPem, /BEGIN PRIVATE KEY/);
  });
});

describe('Content Credentials: the manifest', () => {
  it('declares a composite of AI-made media, edited in Castcut, naming the engines', () => {
    const manifest = filmContentCredentialsManifest({
      title: ' The Last Cup of Salt ',
      version: '3.8.0',
      engines: ['Qwen-Image 2.1 Turbo (8-step)', 'Wan 2.2', 'Wan 2.2'],
    }) as {
      title: string;
      claim_generator_info: unknown[];
      assertions: { label: string; data: { actions: Record<string, unknown>[] } }[];
    };
    assert.equal(manifest.title, 'The Last Cup of Salt');
    assert.deepEqual(manifest.claim_generator_info, [{ name: 'Castcut', version: '3.8.0' }]);
    const [action] = manifest.assertions[0]!.data.actions;
    assert.equal(manifest.assertions[0]!.label, 'c2pa.actions.v2');
    assert.equal(action!.action, 'c2pa.created');
    assert.equal(action!.digitalSourceType, COMPOSITE_WITH_AI);
    assert.equal(
      action!.description,
      'Edited in Castcut from pictures and clips made with Qwen-Image 2.1 Turbo (8-step), Wan 2.2.'
    );
    assert.equal(
      (filmContentCredentialsManifest({ version: '1' }) as { title: string }).title,
      'Castcut film'
    );
  });

  it('takes only engine names from a request, and only formats it can sign', () => {
    assert.equal(normalizeContentCredentialsRequest(null), null);
    assert.deepEqual(normalizeContentCredentialsRequest({}), {});
    assert.deepEqual(normalizeContentCredentialsRequest({ engines: ['  A  ', 4, 'A', ''] }), {
      engines: ['A'],
    });
    assert.equal(contentCredentialsFormat('mp4'), 'video/mp4');
    assert.equal(contentCredentialsFormat('.MOV'), 'video/quicktime');
    assert.equal(contentCredentialsFormat('webm'), null);
  });

  it('names the engines from the shots’ Gallery entries, once each', () => {
    const names = filmEngineNames(
      [{ entryId: 'p1' }, { entryId: 'g2' }, { entryId: 'p3' }, {}, { entryId: 'unknown' }],
      [
        { id: 'g1', promptId: 'p1', model: 'turbo' },
        { id: 'g2', model: 'wan' },
        { id: 'g3', promptId: 'p3', model: 'turbo' },
      ],
      model => ({ turbo: 'Qwen-Image 2.1 Turbo', wan: 'Wan 2.2' })[model] ?? null
    );
    assert.deepEqual(names, ['Qwen-Image 2.1 Turbo', 'Wan 2.2']);
  });
});

describe('Content Credentials: a film signed and read back', () => {
  let ffmpeg: string | null = null;
  let dir = '';
  const savedDataDir = process.env.PROMPT_DATA_DIR;
  before(async () => {
    ffmpeg = await resolveFfmpegBinary().catch(() => null);
    dir = await mkdtemp(path.join(tmpdir(), 'c2pa-'));
    process.env.PROMPT_DATA_DIR = dir;
  });
  after(async () => {
    if (savedDataDir === undefined) delete process.env.PROMPT_DATA_DIR;
    else process.env.PROMPT_DATA_DIR = savedDataDir;
    await rm(dir, { recursive: true, force: true });
  });

  it('signs an MP4 that still plays, and keeps the install’s identity', async t => {
    if (!ffmpeg) return t.skip('no ffmpeg');
    const film = path.join(dir, 'film.mp4');
    await run(ffmpeg!, [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=160x90:rate=12',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=1',
      '-shortest',
      '-pix_fmt',
      'yuv420p',
      film,
    ]);
    const { signFilmWithContentCredentials } = await import('./content-credentials-server');
    const signed = await signFilmWithContentCredentials({
      file: film,
      extension: 'mp4',
      title: 'Test film',
      request: { engines: ['Qwen-Image 2.1 Turbo'] },
    });
    assert.deepEqual(signed.result, { signed: true });
    assert.notEqual(signed.file, film);
    assert.ok((await stat(signed.file)).size > (await stat(film)).size);
    // The C2PA store sits in the MP4 (a uuid box labelled c2pa) and the picture is untouched.
    assert.ok((await readFile(signed.file)).includes(Buffer.from('c2pa')));
    const probe = await run(ffmpeg!.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1'), [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'csv=p=0',
      signed.file,
    ]).catch(() => null);
    if (probe) assert.deepEqual(probe.stdout.trim().split('\n').sort(), ['audio', 'video']);
    // The identity is kept, the key private to its owner.
    const key = await stat(path.join(dir, 'c2pa', 'key.pem'));
    if (process.platform !== 'win32') assert.equal(key.mode & 0o077, 0);
    assert.ok(await stat(path.join(dir, 'c2pa', 'chain.pem')));
  });

  it('leaves a format it can’t sign as it is, with a note', async () => {
    const { signFilmWithContentCredentials } = await import('./content-credentials-server');
    const result = await signFilmWithContentCredentials({
      file: path.join(dir, 'film.webm'),
      extension: 'webm',
      request: {},
    });
    assert.deepEqual(result, {
      file: path.join(dir, 'film.webm'),
      result: { signed: false, note: 'a .webm isn’t signed' },
    });
  });
});
