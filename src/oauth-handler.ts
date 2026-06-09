import type { FetchFn } from "./client.js";
import type { OAuthConfig } from "./oauth-config.js";
import type { OAuthStorage } from "./worker-config.js";

import { exchangeYnabCode } from "./ynab-oauth.js";

function parseCookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    if (trimmed.slice(0, eqIdx).trim() === name) return trimmed.slice(eqIdx + 1).trim();
  }
  return null;
}

// Constant-time string comparison — prevents timing oracle on state token.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function hmacVerify(secret: string, message: string, mac: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  try {
    const b64 = mac.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const macBytes = Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0));
    return crypto.subtle.verify("HMAC", key, macBytes, new TextEncoder().encode(message));
  } catch {
    return false;
  }
}

// Cookie name uses __Host- prefix: requires Secure + Path=/ + no Domain.
// Prevents sibling-subdomain shadowing and locks the cookie to this exact origin.
const COOKIE_NAME = "__Host-oauth_state";

export async function handleOAuthCallback(
  request: Request,
  storage: OAuthStorage,
  config: OAuthConfig,
  fetchFn: FetchFn,
  nowMs: number,
): Promise<Response> {
  const url = new URL(request.url);
  const stateParam = url.searchParams.get("state");
  const cookieVal = parseCookieValue(request.headers.get("cookie"), COOKIE_NAME);

  // Cookie format: state.scope.mac — mac = HMAC-SHA256(cookieSecret, "state.scope")
  if (!cookieVal) {
    return new Response("Invalid or missing state parameter", { status: 400 });
  }
  const lastDot = cookieVal.lastIndexOf(".");
  if (lastDot < 0) {
    return new Response("Invalid or missing state parameter", { status: 400 });
  }
  const mac = cookieVal.slice(lastDot + 1);
  const payload = cookieVal.slice(0, lastDot); // "state.scope"
  const scopeDot = payload.lastIndexOf(".");
  const statePart = scopeDot >= 0 ? payload.slice(0, scopeDot) : payload;
  const scopePart = scopeDot >= 0 ? payload.slice(scopeDot + 1) : "read-only";
  const readOnly = scopePart !== "full";

  if (!stateParam || !safeEqual(stateParam, statePart)) {
    return new Response("Invalid or missing state parameter", { status: 400 });
  }

  if (!(await hmacVerify(config.cookieSecret, payload, mac))) {
    return new Response("Invalid or missing state parameter", { status: 400 });
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("Missing code parameter", { status: 400 });
  }

  try {
    const tokens = await exchangeYnabCode(code, config, fetchFn);
    const props = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: nowMs + tokens.expiresIn * 1000,
      readOnly,
    };
    await storage.put("oauth_props", props);
    return new Response("Connected! You can close this tab.", { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`OAuth error: ${message}`, { status: 502 });
  }
}

export async function handleOAuthAuthorize(
  config: OAuthConfig,
  scope: "read-only" | "full" = "read-only",
): Promise<Response> {
  const state = crypto.randomUUID();
  const payload = `${state}.${scope}`;
  const mac = await hmacSign(config.cookieSecret, payload);

  const redirectUrl = new URL(config.authorizeEndpoint);
  redirectUrl.searchParams.set("client_id", config.clientId);
  redirectUrl.searchParams.set("redirect_uri", config.redirectUri);
  redirectUrl.searchParams.set("response_type", "code");
  redirectUrl.searchParams.set("state", state);
  if (scope === "read-only") redirectUrl.searchParams.set("scope", "read-only");
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl.toString(),
      // __Host- requires Secure + Path=/ + no Domain — prevents subdomain shadowing.
      // Value is state.scope.mac so the MAC binds scope to the state UUID.
      "Set-Cookie": `${COOKIE_NAME}=${payload}.${mac}; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=600`,
    },
  });
}
