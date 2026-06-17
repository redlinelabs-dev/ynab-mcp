// PKCE (RFC 7636) for the upstream YNAB authorization-code leg. YNAB supports
// S256: we send code_challenge = base64url(SHA-256(verifier)) on /authorize and
// the raw verifier on the token exchange. Runtime-agnostic: uses only the global
// `crypto` (WebCrypto), available in both Node >= 24 and the Workers runtime.

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

// SHA-256 → base64url, the S256 transform YNAB expects.
export async function s256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

// A fresh verifier (32 random bytes → 43-char base64url) plus its S256 challenge.
export async function generatePkce(): Promise<PkcePair> {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const verifier = base64UrlEncode(random);
  const challenge = await s256Challenge(verifier);
  return { verifier, challenge };
}
