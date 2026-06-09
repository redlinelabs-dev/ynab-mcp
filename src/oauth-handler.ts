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

export async function handleOAuthCallback(
  request: Request,
  storage: OAuthStorage,
  config: OAuthConfig,
  fetchFn: FetchFn,
  nowMs: number,
): Promise<Response> {
  const url = new URL(request.url);
  const stateParam = url.searchParams.get("state");
  const cookieVal = parseCookieValue(request.headers.get("cookie"), "oauth_state");

  // Cookie encodes both state UUID and scope as "uuid.scope" (UUIDs have no dots).
  const lastDot = cookieVal ? cookieVal.lastIndexOf(".") : -1;
  const statePart = lastDot >= 0 ? cookieVal!.slice(0, lastDot) : (cookieVal ?? "");
  const scopePart = lastDot >= 0 ? cookieVal!.slice(lastDot + 1) : "read-only";
  const readOnly = scopePart !== "full";

  if (!stateParam || !cookieVal || !safeEqual(stateParam, statePart)) {
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

export function handleOAuthAuthorize(
  config: OAuthConfig,
  scope: "read-only" | "full" = "read-only",
): Response {
  const state = crypto.randomUUID();
  const url = new URL(config.authorizeEndpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  if (scope === "read-only") url.searchParams.set("scope", "read-only");
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      // Cookie encodes scope alongside state UUID so the callback knows which scope was granted.
      "Set-Cookie": `oauth_state=${state}.${scope}; HttpOnly; SameSite=Lax; Secure; Path=/callback; Max-Age=600`,
    },
  });
}
