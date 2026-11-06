/**
 * Content Credentials (C2PA): the certificate a film is signed with. Every install makes its own
 * the first time it signs — a small certificate authority of its own, and under it the signing
 * certificate (P-256, ten years) — because C2PA never accepts a certificate that signed itself.
 * Readers show the signature as valid but the signer as unrecognised ("untrusted"): it proves the
 * film hasn't changed since Castcut made it and says how it was made, not who you are. A
 * certificate from a C2PA-recognised authority can be used instead (content-credentials-server.ts).
 *
 * Node's crypto makes the keys and signatures; this writes the X.509 structure (DER) by hand, as
 * no dependency is needed for it. Server-only (node:crypto).
 */

import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

const length = (n: number): Buffer => {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
};
const tlv = (tag: number, ...parts: Buffer[]): Buffer => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), length(body.length), body]);
};
const sequence = (...parts: Buffer[]) => tlv(0x30, ...parts);
const set = (...parts: Buffer[]) => tlv(0x31, ...parts);
const integer = (bytes: Buffer) =>
  tlv(0x02, bytes[0]! & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes);
const utf8 = (text: string) => tlv(0x0c, Buffer.from(text, 'utf8'));
const boolean = (value: boolean) => tlv(0x01, Buffer.from([value ? 0xff : 0]));
const octets = (bytes: Buffer) => tlv(0x04, bytes);
const bitString = (bytes: Buffer, unusedBits = 0) => tlv(0x03, Buffer.from([unusedBits]), bytes);

/** An object identifier, from its dotted form. */
export function derOid(dotted: string): Buffer {
  const [first = 0, second = 0, ...rest] = dotted.split('.').map(Number);
  const out = [first * 40 + second];
  for (const part of rest) {
    const chunk = [part & 0x7f];
    for (let value = Math.floor(part / 128); value > 0; value = Math.floor(value / 128)) {
      chunk.unshift((value & 0x7f) | 0x80);
    }
    out.push(...chunk);
  }
  return tlv(0x06, Buffer.from(out));
}

const time = (date: Date) => {
  const stamp = `${date.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;
  // UTCTime through 2049, GeneralizedTime after (RFC 5280 4.1.2.5).
  return date.getUTCFullYear() < 2050
    ? tlv(0x17, Buffer.from(stamp.slice(2)))
    : tlv(0x18, Buffer.from(stamp));
};
const distinguishedName = (commonName: string, organization: string) =>
  sequence(
    set(sequence(derOid('2.5.4.3'), utf8(commonName))),
    set(sequence(derOid('2.5.4.10'), utf8(organization)))
  );
const extension = (id: string, critical: boolean, value: Buffer) =>
  sequence(derOid(id), ...(critical ? [boolean(true)] : []), octets(value));
const ECDSA_WITH_SHA256 = sequence(derOid('1.2.840.10045.4.3.2'));
/** id-kp-emailProtection: one of the extended key usages C2PA accepts for a signer. */
const EMAIL_PROTECTION = '1.3.6.1.5.5.7.3.4';
const DAY_MS = 86_400_000;

function certificate(input: {
  subject: Buffer;
  issuer: Buffer;
  publicKey: KeyObject;
  issuerKey: KeyObject;
  authority: boolean;
  issuerKeyId?: Buffer;
  days: number;
  now: Date;
}): { der: Buffer; keyId: Buffer } {
  const spki = input.publicKey.export({ type: 'spki', format: 'der' });
  const keyId = createHash('sha1').update(spki).digest();
  const serial = randomBytes(16);
  serial[0]! &= 0x7f;
  // A minute back, so a clock a little behind still finds it valid.
  const from = new Date(input.now.getTime() - 60_000);
  const extensions = [
    // basicConstraints: a CA, or not (an empty sequence).
    extension('2.5.29.19', true, input.authority ? sequence(boolean(true)) : sequence()),
    // keyUsage: keyCertSign + cRLSign for the CA, digitalSignature for the signer.
    extension(
      '2.5.29.15',
      true,
      input.authority ? bitString(Buffer.from([0x06]), 1) : bitString(Buffer.from([0x80]), 7)
    ),
    extension('2.5.29.14', false, octets(keyId)),
    ...(input.issuerKeyId
      ? [extension('2.5.29.35', false, sequence(tlv(0x80, input.issuerKeyId)))]
      : []),
    ...(input.authority ? [] : [extension('2.5.29.37', false, sequence(derOid(EMAIL_PROTECTION)))]),
  ];
  const tbs = sequence(
    tlv(0xa0, integer(Buffer.from([2]))),
    integer(serial),
    ECDSA_WITH_SHA256,
    input.issuer,
    sequence(time(from), time(new Date(from.getTime() + input.days * DAY_MS))),
    input.subject,
    spki,
    tlv(0xa3, sequence(...extensions))
  );
  const signature = sign('sha256', tbs, input.issuerKey);
  return { der: sequence(tbs, ECDSA_WITH_SHA256, bitString(signature)), keyId };
}

/** DER as PEM. */
export function certificatePem(der: Buffer): string {
  const lines = der.toString('base64').match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

export type ContentCredentialsIdentity = {
  /** The signing key (PKCS#8 PEM). */
  keyPem: string;
  /** The signing certificate, then the CA's (PEM). */
  chainPem: string;
};

/**
 * A new signing identity: a CA and the signing certificate it issued. The CA's key is thrown
 * away once it has signed — nothing else is ever issued under it.
 */
export function makeContentCredentialsIdentity(options?: {
  name?: string;
  now?: Date;
  days?: number;
}): ContentCredentialsIdentity {
  const now = options?.now ?? new Date();
  const days = options?.days ?? 3650;
  const name = options?.name?.trim() || 'Castcut';
  const authorityKeys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const signerKeys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const authorityName = distinguishedName(`${name} local signing CA`, 'Castcut');
  const authority = certificate({
    subject: authorityName,
    issuer: authorityName,
    publicKey: authorityKeys.publicKey,
    issuerKey: authorityKeys.privateKey,
    authority: true,
    days,
    now,
  });
  const signer = certificate({
    subject: distinguishedName(name, 'Castcut'),
    issuer: authorityName,
    publicKey: signerKeys.publicKey,
    issuerKey: authorityKeys.privateKey,
    authority: false,
    issuerKeyId: authority.keyId,
    days,
    now,
  });
  return {
    keyPem: signerKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    chainPem: certificatePem(signer.der) + certificatePem(authority.der),
  };
}
