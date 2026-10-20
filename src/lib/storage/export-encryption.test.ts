import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("export-encryption", async () => {
  const { encryptExportPayload, decryptExportPayload } = await import("./export-encryption");

  it("round-trips plaintext through encrypt then decrypt with the same passphrase", () => {
    const plaintext = JSON.stringify({ hello: "world", n: 42 });
    const encrypted = encryptExportPayload(plaintext, "correct horse battery staple");
    const decrypted = decryptExportPayload(encrypted, "correct horse battery staple");
    assert.equal(decrypted, plaintext);
  });

  it("produces a JSON envelope with v/salt/iv/tag/data as base64 strings", () => {
    const encrypted = encryptExportPayload("hi", "pw");
    const parsed = JSON.parse(encrypted) as Record<string, unknown>;
    assert.equal(parsed.v, 1);
    for (const field of ["salt", "iv", "tag", "data"]) {
      assert.equal(typeof parsed[field], "string");
      assert.doesNotThrow(() => Buffer.from(parsed[field] as string, "base64"));
    }
  });

  it("produces different ciphertext for the same plaintext on repeated calls (random salt/iv)", () => {
    const a = encryptExportPayload("same text", "pw");
    const b = encryptExportPayload("same text", "pw");
    assert.notEqual(a, b);
  });

  it("fails to decrypt with the wrong passphrase", () => {
    const encrypted = encryptExportPayload("secret data", "right-pass");
    assert.throws(() => decryptExportPayload(encrypted, "wrong-pass"));
  });

  it("rejects an unsupported envelope version", () => {
    const encrypted = encryptExportPayload("secret data", "pw");
    const tampered = JSON.stringify({ ...JSON.parse(encrypted), v: 2 });
    assert.throws(() => decryptExportPayload(tampered, "pw"), /Unsupported encrypted export version/);
  });

  it("fails to decrypt when the ciphertext has been tampered with (auth tag mismatch)", () => {
    const encrypted = encryptExportPayload("secret data", "pw");
    const parsed = JSON.parse(encrypted) as { data: string };
    const bytes = Buffer.from(parsed.data, "base64");
    bytes[0] = bytes[0]! ^ 0xff;
    const tampered = JSON.stringify({ ...JSON.parse(encrypted), data: bytes.toString("base64") });
    assert.throws(() => decryptExportPayload(tampered, "pw"));
  });

  it("supports empty-string plaintext", () => {
    const encrypted = encryptExportPayload("", "pw");
    assert.equal(decryptExportPayload(encrypted, "pw"), "");
  });
});
