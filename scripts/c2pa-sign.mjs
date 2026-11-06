#!/usr/bin/env node
/**
 * Content Credentials (C2PA): sign one media file — run as its own short-lived process by
 * src/lib/video/content-credentials-server.ts, so the WebAssembly memory a long film needs is
 * handed back when it exits (Wasm memory never shrinks inside a running server).
 *
 * stdin: JSON { input, output, format, manifest, keyPem, chainPem }
 * stdout: JSON { ok: true, state, codes } | { ok: false, error }
 *
 * The C2PA library (@contentauth/c2pa-wasm) builds the manifest and hashes the file; it hands back
 * the claim to sign and expects a whole COSE_Sign1 with the certificate chain, which is made here
 * with node:crypto. The file is read from disk in slices (a Blob backed by the file, read through
 * a FileReaderSync stand-in), never loaded whole; the signed copy comes back in memory and is
 * written to `output`. After signing, the copy is read back and checked.
 */

import { closeSync, fstatSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { createPrivateKey, sign, X509Certificate } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

/** Minimal CBOR (RFC 8949): what a COSE_Sign1 needs. */
function head(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 0x100) return Buffer.from([(major << 5) | 24, n]);
  if (n < 0x10000) return Buffer.from([(major << 5) | 25, n >> 8, n & 0xff]);
  const out = Buffer.alloc(5);
  out[0] = (major << 5) | 26;
  out.writeUInt32BE(n, 1);
  return out;
}
export function cbor(value) {
  if (value === null) return Buffer.from([0xf6]);
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([head(3, bytes.length), bytes]);
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.concat([head(2, value.length), Buffer.from(value)]);
  }
  if (Array.isArray(value)) return Buffer.concat([head(4, value.length), ...value.map(cbor)]);
  if (value instanceof Map) {
    return Buffer.concat([
      head(5, value.size),
      ...[...value].flatMap(([key, item]) => [cbor(key), cbor(item)]),
    ]);
  }
  if (typeof value === 'object' && 'tag' in value) {
    return Buffer.concat([head(6, value.tag), cbor(value.value)]);
  }
  throw new Error(`cbor: can't encode ${typeof value}`);
}

/** The COSE algorithm for a key: [c2pa name, COSE id, how node signs]. */
export function signingAlgorithm(key) {
  const type = key.asymmetricKeyType;
  if (type === 'ec') {
    const curve = key.asymmetricKeyDetails?.namedCurve;
    if (curve === 'prime256v1' || curve === 'P-256') return ['es256', -7, 'sha256'];
    if (curve === 'secp384r1' || curve === 'P-384') return ['es384', -35, 'sha384'];
    if (curve === 'secp521r1' || curve === 'P-521') return ['es512', -36, 'sha512'];
  }
  if (type === 'ed25519') return ['ed25519', -8, null];
  if (type === 'rsa' || type === 'rsa-pss') return ['ps256', -37, 'sha256'];
  throw new Error(`Content Credentials can't sign with a ${type} key.`);
}

function pemCertificates(pem) {
  return (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []).map(
    block => new X509Certificate(block).raw
  );
}

/**
 * The signer the C2PA library calls: the claim in, a COSE_Sign1 out (protected: the algorithm and
 * the x5chain; detached payload), padded to exactly `reserveSize`.
 */
export function coseSigner({ keyPem, chainPem }) {
  const key = createPrivateKey(keyPem);
  const [alg, coseAlg, hash] = signingAlgorithm(key);
  const chain = pemCertificates(chainPem);
  if (!chain.length) throw new Error('No signing certificate.');
  const reserveSize = chain.reduce((sum, der) => sum + der.length, 0) + 4096;
  const protectedHeader = cbor(
    new Map([
      [1, coseAlg],
      [33, chain.length === 1 ? chain[0] : chain],
    ])
  );
  return {
    alg,
    reserveSize,
    sign: async claim => {
      const toBeSigned = cbor(['Signature1', protectedHeader, Buffer.alloc(0), Buffer.from(claim)]);
      const signature = sign(hash, toBeSigned, {
        key,
        ...(alg.startsWith('es') ? { dsaEncoding: 'ieee-p1363' } : {}),
        ...(alg === 'ps256' ? { padding: 6 /* RSA_PKCS1_PSS_PADDING */, saltLength: 32 } : {}),
      });
      const build = pad =>
        cbor({
          tag: 18,
          value: [protectedHeader, new Map([['pad', Buffer.alloc(pad)]]), null, signature],
        });
      let pad = Math.max(0, reserveSize - build(0).length);
      let out = build(pad);
      // The pad's own length header can grow by a byte or two: take them back off the pad.
      while (out.length > reserveSize && pad > 0) out = build(--pad);
      if (out.length > reserveSize) throw new Error('The signature is larger than its space.');
      return new Uint8Array(out);
    },
  };
}

/** A Blob backed by a file, read in slices (the C2PA library reads it through FileReaderSync). */
class FileSlice extends Blob {
  constructor(fd, start, end) {
    super([]);
    this.fd = fd;
    this.start = start;
    this.end = end;
  }
  get size() {
    return this.end - this.start;
  }
  slice(from = 0, to = this.size) {
    const clamp = n => Math.max(0, Math.min(this.size, n < 0 ? this.size + n : n));
    const start = clamp(from);
    return new FileSlice(this.fd, this.start + start, this.start + Math.max(start, clamp(to)));
  }
}

if (typeof globalThis.FileReaderSync === 'undefined') {
  globalThis.FileReaderSync = class {
    readAsArrayBuffer(blob) {
      if (!(blob instanceof FileSlice)) throw new Error('FileReaderSync: a file slice only');
      const out = new Uint8Array(blob.size);
      for (let at = 0; at < out.length;) {
        const read = readSync(blob.fd, out, at, out.length - at, blob.start + at);
        if (!read) break;
        at += read;
      }
      return out.buffer;
    }
  };
}

export async function signFile({ input, output, format, manifest, keyPem, chainPem }) {
  const { initSync, WasmBuilder, WasmReader } = await import('@contentauth/c2pa-wasm');
  initSync({ module: readFileSync(require.resolve('@contentauth/c2pa-wasm/c2pa.wasm')) });
  const builder = WasmBuilder.fromJson(JSON.stringify(manifest));
  const fd = openSync(input, 'r');
  let signed;
  try {
    signed = await builder.sign(
      coseSigner({ keyPem, chainPem }),
      [],
      format,
      new FileSlice(fd, 0, fstatSync(fd).size)
    );
  } finally {
    closeSync(fd);
    builder.free();
  }
  writeFileSync(output, signed);
  const reader = await WasmReader.fromBytes(format, signed);
  const report = JSON.parse(reader.json());
  reader.free();
  const codes = (report.validation_status ?? []).map(entry => entry.code);
  return { state: report.validation_state ?? 'Unknown', codes };
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  try {
    const result = await signFile(JSON.parse(raw));
    process.stdout.write(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    process.stdout.write(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })
    );
    process.exitCode = 1;
  }
}
