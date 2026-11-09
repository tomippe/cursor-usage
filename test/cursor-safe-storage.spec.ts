import { describe, expect, it } from "bun:test";
import { createCipheriv, pbkdf2Sync, randomBytes } from "crypto";
import {
  CURSOR_SAFE_STORAGE_PREFIX,
  decryptStoredCursorAuthToken,
  decryptWindowsOsCryptGcm,
  userIdFromJwt,
} from "../src/cursor-safe-storage";

function encryptSafeStorage(plain: string, password: string, iterations: number, envelope: "v10" | "v11"): string {
  const key = pbkdf2Sync(password, "saltysalt", iterations, 16, "sha1");
  const cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return CURSOR_SAFE_STORAGE_PREFIX + Buffer.concat([Buffer.from(envelope), body]).toString("base64");
}

function unsignedJwt(sub: string): string {
  const payload = Buffer.from(JSON.stringify({ sub })).toString("base64url");
  return `eyJhbGciOiJub25lIn0.${payload}.sig`;
}

describe("Cursor access token storage", () => {
  it("returns a plaintext JWT unchanged", () => {
    const jwt = unsignedJwt("google-oauth2|12345");
    expect(decryptStoredCursorAuthToken(jwt, "unused", 1003)).toBe(jwt);
  });

  it("decrypts the macOS v10 safeStorage envelope", () => {
    const jwt = unsignedJwt("google-oauth2|12345");
    const stored = encryptSafeStorage(jwt, "keychain-password", 1003, "v10");
    expect(decryptStoredCursorAuthToken(stored, "keychain-password", 1003)).toBe(jwt);
  });

  it("decrypts the Linux v11 envelope with one PBKDF2 round", () => {
    const jwt = unsignedJwt("auth0|user_01");
    const stored = encryptSafeStorage(jwt, "peanuts", 1, "v11");
    expect(decryptStoredCursorAuthToken(stored, "peanuts", [1, 1003])).toBe(jwt);
  });

  it("rejects an unknown safeStorage envelope", () => {
    const stored = CURSOR_SAFE_STORAGE_PREFIX + Buffer.from("v99not-ciphertext").toString("base64");
    expect(() => decryptStoredCursorAuthToken(stored, "password", [1003, 1])).toThrow(
      "Unsupported Cursor safeStorage envelope",
    );
  });

  it("reads the user id from old and new subject formats", () => {
    expect(userIdFromJwt(unsignedJwt("google-oauth2|12345"))).toBe("12345");
    expect(userIdFromJwt(unsignedJwt("auth0|user_01"))).toBe("user_01");
    expect(userIdFromJwt(unsignedJwt("user_01"))).toBe("user_01");
  });

  it("decrypts the Windows Chromium v10 AES-256-GCM envelope", () => {
    const jwt = unsignedJwt("auth0|user_01");
    const key = randomBytes(32);
    const iv = Buffer.alloc(12, 7);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(jwt, "utf8"), cipher.final()]);
    const blob = Buffer.concat([Buffer.from("v10"), iv, data, cipher.getAuthTag()]);
    const stored = CURSOR_SAFE_STORAGE_PREFIX + blob.toString("base64");
    const ciphertext = Buffer.from(stored.slice(CURSOR_SAFE_STORAGE_PREFIX.length), "base64");
    expect(decryptWindowsOsCryptGcm(ciphertext, key)).toBe(jwt);
    expect(userIdFromJwt(jwt)).toBe("user_01");
  });
});
