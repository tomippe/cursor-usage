import { execFile } from "child_process";
import { createDecipheriv, pbkdf2Sync } from "crypto";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

/** Prefix Cursor writes when `cursorAuth/accessToken` is encrypted at rest. */
export const CURSOR_SAFE_STORAGE_PREFIX = "cursor-safe-storage:v1:";

const SALT = "saltysalt";
const IV = Buffer.alloc(16, 0x20);
const DPAPI_PREFIX = Buffer.from("DPAPI");
const WINDOWS_GCM_NONCE_LENGTH = 12;
const GCM_TAG_LENGTH = 16;

let cachedMacPassword: string | null = null;
let cachedWindowsOsCryptKey: Buffer | null = null;

function stripTrailingNewline(value: string): string {
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

function execFileText(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: 20_000, windowsHide: true, maxBuffer: 1024 * 1024, env },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim();
          reject(detail ? new Error(detail) : error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/**
 * Chromium / Electron safeStorage ciphertext.
 * macOS uses the `v10` envelope and 1003 PBKDF2 rounds.
 * Linux uses `v11` (or `v10`) and 1 round, with 1003 as a fallback.
 */
export function decryptChromiumSafeStorage(
  ciphertext: Buffer,
  password: string,
  iterations: number,
): string {
  const envelope = ciphertext.subarray(0, 3).toString("utf8");
  if (envelope !== "v10" && envelope !== "v11") {
    throw new Error("Unsupported Cursor safeStorage envelope");
  }

  const key = pbkdf2Sync(password, SALT, iterations, 16, "sha1");
  const decipher = createDecipheriv("aes-128-cbc", key, IV);
  const plain = Buffer.concat([
    decipher.update(ciphertext.subarray(3)),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

export function decryptStoredCursorAuthToken(
  stored: string,
  password: string,
  iterations: number | number[],
): string {
  if (!stored.startsWith(CURSOR_SAFE_STORAGE_PREFIX)) {
    return stored;
  }

  const ciphertext = Buffer.from(stored.slice(CURSOR_SAFE_STORAGE_PREFIX.length), "base64");
  if (ciphertext.length < 4) {
    throw new Error("Cursor access token ciphertext is empty");
  }

  const rounds = Array.isArray(iterations) ? iterations : [iterations];
  let lastError: unknown;
  for (const count of rounds) {
    try {
      return decryptChromiumSafeStorage(ciphertext, password, count);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not decrypt Cursor access token");
}

async function readMacSafeStoragePassword(): Promise<string> {
  if (cachedMacPassword !== null) return cachedMacPassword;
  const stdout = await execFileText("security", [
    "find-generic-password",
    "-s",
    "Cursor Safe Storage",
    "-a",
    "Cursor Key",
    "-w",
  ]);
  const password = stripTrailingNewline(stdout);
  if (!password) {
    throw new Error("Cursor Safe Storage keychain item is empty");
  }
  cachedMacPassword = password;
  return password;
}

async function readLinuxSafeStoragePassword(): Promise<string> {
  const lookups = [
    ["lookup", "application", "Cursor"],
    ["lookup", "xdg:schema", "chrome_libsecret_os_crypt_password_v2", "application", "Cursor"],
    ["lookup", "application", "cursor"],
  ];
  for (const args of lookups) {
    try {
      const password = stripTrailingNewline(await execFileText("secret-tool", args));
      if (password) return password;
    } catch {
      // Try the next secret-store attribute, then the basic_text password.
    }
  }
  return "peanuts";
}

async function unprotectWindowsDpapi(ciphertext: Buffer): Promise<Buffer> {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$cipher = [Convert]::FromBase64String($env:CURSOR_USAGE_CIPHER_B64)
$plain = [System.Security.Cryptography.ProtectedData]::Unprotect($cipher, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($plain))
`;
  const stdout = await execFileText(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { ...process.env, CURSOR_USAGE_CIPHER_B64: ciphertext.toString("base64") },
  );
  return Buffer.from(stdout.trim(), "base64");
}

function windowsLocalStatePath(): string {
  return join(process.env.APPDATA ?? join(homedir(), "AppData/Roaming"), "Cursor", "Local State");
}

async function readWindowsOsCryptKey(): Promise<Buffer> {
  if (cachedWindowsOsCryptKey !== null) return cachedWindowsOsCryptKey;
  const localState = JSON.parse(await readFile(windowsLocalStatePath(), "utf8")) as {
    os_crypt?: { encrypted_key?: unknown };
  };
  const encryptedKeyB64 = localState.os_crypt?.encrypted_key;
  if (typeof encryptedKeyB64 !== "string" || encryptedKeyB64.length === 0) {
    throw new Error("Cursor Local State is missing os_crypt.encrypted_key");
  }
  const wrapped = Buffer.from(encryptedKeyB64, "base64");
  if (wrapped.length <= DPAPI_PREFIX.length || !wrapped.subarray(0, DPAPI_PREFIX.length).equals(DPAPI_PREFIX)) {
    throw new Error("Cursor Local State key is not DPAPI-wrapped");
  }
  const key = await unprotectWindowsDpapi(wrapped.subarray(DPAPI_PREFIX.length));
  if (key.length !== 32) {
    throw new Error("Cursor OSCrypt key has unexpected length");
  }
  cachedWindowsOsCryptKey = key;
  return key;
}

/**
 * Chromium OSCrypt on Windows: `v10` + 12-byte nonce + AES-256-GCM ciphertext + 16-byte tag.
 * The AES key comes from Local State `os_crypt.encrypted_key` after DPAPI unprotect.
 */
export function decryptWindowsOsCryptGcm(ciphertext: Buffer, aesKey: Buffer): string {
  const envelope = ciphertext.subarray(0, 3).toString("utf8");
  if (envelope !== "v10" && envelope !== "v11") {
    throw new Error("Unsupported Windows safeStorage envelope");
  }
  const minimum = 3 + WINDOWS_GCM_NONCE_LENGTH + GCM_TAG_LENGTH + 1;
  if (ciphertext.length < minimum) {
    throw new Error("Cursor access token ciphertext is empty");
  }
  const iv = ciphertext.subarray(3, 3 + WINDOWS_GCM_NONCE_LENGTH);
  const tag = ciphertext.subarray(ciphertext.length - GCM_TAG_LENGTH);
  const data = ciphertext.subarray(3 + WINDOWS_GCM_NONCE_LENGTH, ciphertext.length - GCM_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", aesKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Plain JWTs pass through. `cursor-safe-storage:v1:` values are decrypted. */
export async function resolveCursorAccessToken(stored: string): Promise<string> {
  if (!stored.startsWith(CURSOR_SAFE_STORAGE_PREFIX)) {
    return stored;
  }

  if (process.platform === "win32") {
    const ciphertext = Buffer.from(stored.slice(CURSOR_SAFE_STORAGE_PREFIX.length), "base64");
    const envelope = ciphertext.subarray(0, 3).toString("utf8");
    if (envelope === "v10" || envelope === "v11") {
      return decryptWindowsOsCryptGcm(ciphertext, await readWindowsOsCryptKey());
    }
    return (await unprotectWindowsDpapi(ciphertext)).toString("utf8");
  }

  const password = process.platform === "darwin"
    ? await readMacSafeStoragePassword()
    : await readLinuxSafeStoragePassword();
  const iterations = process.platform === "darwin" ? [1003] : [1, 1003];
  return decryptStoredCursorAuthToken(stored, password, iterations);
}

export function userIdFromJwt(jwt: string): string {
  const segment = jwt.split(".")[1];
  if (!segment) {
    throw new Error("Access token is not a JWT");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw new Error("Access token payload is not valid JSON");
  }

  const sub = payload && typeof payload === "object" && "sub" in payload
    ? (payload as { sub: unknown }).sub
    : undefined;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("Access token is missing sub");
  }

  const pieces = sub.split("|");
  const userId = pieces.length >= 2 ? pieces[1] : pieces[0];
  if (!userId) {
    throw new Error("Access token sub has no user id");
  }
  return userId;
}
