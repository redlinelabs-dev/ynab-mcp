// AES-256-GCM sealing for YNAB tokens at rest + SHA-256 hashing for opaque-token
// lookups. Runtime-agnostic WebCrypto (Node >= 24). The key comes from an env
// secret (`ENCRYPTION_KEY`, base64 of 32 random bytes) — never hardcoded.

const IV_BYTES = 12;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// Import a 32-byte base64 key for AES-256-GCM.
export async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = fromBase64(base64Key);
  if (raw.byteLength !== 32) {
    throw new Error("ENCRYPTION_KEY must be base64 of exactly 32 bytes (AES-256)");
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

// Encrypt plaintext → base64(iv || ciphertext+tag). A fresh random IV per call.
export async function seal(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  const out = new Uint8Array(iv.byteLength + cipher.byteLength);
  out.set(iv, 0);
  out.set(cipher, iv.byteLength);
  return toBase64(out);
}

// Decrypt a base64(iv || ciphertext+tag) blob; throws if tampered.
export async function unseal(key: CryptoKey, blob: string): Promise<string> {
  const bytes = fromBase64(blob);
  const iv = bytes.slice(0, IV_BYTES);
  const cipher = bytes.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

// Hex SHA-256 — opaque tokens are stored and looked up by hash, never plaintext.
export async function sha256Hex(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
