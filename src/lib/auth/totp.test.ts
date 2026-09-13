import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { generateTotpSecret, totpUri, verifyTotp } from './totp';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const index = BASE32.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Independent HOTP so tests do not rely on totp.ts internals. */
function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

describe('auth/totp', () => {
  describe('generateTotpSecret', () => {
    it('returns a non-empty base32 alphabet string', () => {
      const secret = generateTotpSecret();
      assert.ok(secret.length >= 16);
      assert.match(secret, /^[A-Z2-7]+$/);
    });

    it('returns a different secret on each call', () => {
      assert.notEqual(generateTotpSecret(), generateTotpSecret());
    });
  });

  describe('totpUri', () => {
    it('builds an otpauth URI with encoded label and issuer', () => {
      const uri = totpUri('alice', 'JBSWY3DPEHPK3PXP', 'Castcut');
      assert.equal(
        uri,
        'otpauth://totp/Castcut%3Aalice?secret=JBSWY3DPEHPK3PXP&issuer=Castcut&algorithm=SHA1&digits=6&period=30'
      );
    });

    it('defaults the issuer to Castcut', () => {
      const uri = totpUri('bob', 'ABCDEFGHIJKLMNOP');
      assert.match(uri, /^otpauth:\/\/totp\/Castcut%3Abob\?/);
      assert.match(uri, /issuer=Castcut/);
    });
  });

  describe('verifyTotp', () => {
    it('accepts the current-window token for a known secret', () => {
      const secret = generateTotpSecret();
      const counter = Math.floor(Date.now() / 30_000);
      const token = hotp(secret, counter);
      assert.equal(verifyTotp(secret, token), true);
    });

    it('accepts a token from an adjacent window (±1)', () => {
      const secret = generateTotpSecret();
      const counter = Math.floor(Date.now() / 30_000);
      assert.equal(verifyTotp(secret, hotp(secret, counter - 1)), true);
      assert.equal(verifyTotp(secret, hotp(secret, counter + 1)), true);
    });

    it('rejects a token outside the default window', () => {
      const secret = generateTotpSecret();
      const counter = Math.floor(Date.now() / 30_000);
      assert.equal(verifyTotp(secret, hotp(secret, counter - 2)), false);
    });

    it('rejects non-6-digit tokens (and strips spaces before checking)', () => {
      const secret = generateTotpSecret();
      assert.equal(verifyTotp(secret, '12345'), false);
      assert.equal(verifyTotp(secret, 'abcdef'), false);
      assert.equal(verifyTotp(secret, ''), false);
      const counter = Math.floor(Date.now() / 30_000);
      const token = hotp(secret, counter);
      assert.equal(verifyTotp(secret, `${token.slice(0, 3)} ${token.slice(3)}`), true);
    });

    it('rejects a well-formed token for the wrong secret', () => {
      const a = generateTotpSecret();
      const b = generateTotpSecret();
      const counter = Math.floor(Date.now() / 30_000);
      assert.equal(verifyTotp(b, hotp(a, counter)), false);
    });
  });
});
