import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';

export function encryptExportPayload(plaintext: string, passphrase: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}

export function decryptExportPayload(payload: string, passphrase: string): string {
  const parsed = JSON.parse(payload) as {
    v: number;
    salt: string;
    iv: string;
    tag: string;
    data: string;
  };
  if (parsed.v !== 1) {
    throw new Error('Unsupported encrypted export version.');
  }
  const key = scryptSync(passphrase, Buffer.from(parsed.salt, 'base64'), 32);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
