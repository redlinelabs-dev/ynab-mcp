import { z } from "zod";

import type { FetchFn } from "./client.js";
import type { OAuthConfig } from "./oauth-config.js";

const YnabTokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});

const YNAB_USER_ENDPOINT = "https://api.ynab.com/v1/user";

const YnabUserSchema = z.object({
  data: z.object({ user: z.object({ id: z.string() }) }),
});

// The authenticated user's stable YNAB id — used to key the OAuth grant so the
// same person re-authorizing from the same MCP client replaces their old grant
// (rather than piling up orphans), while different clients stay isolated.
export async function fetchYnabUserId(
  accessToken: string,
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const response = await fetchFn(YNAB_USER_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `YNAB user lookup failed: ${response.status} ${response.statusText} — ${text.slice(0, 300)}`,
    );
  }
  const json: unknown = await response.json();
  return YnabUserSchema.parse(json).data.user.id;
}

export interface YnabTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function refreshYnabToken(
  refreshToken: string,
  config: OAuthConfig,
  fetchFn: FetchFn = fetch,
): Promise<YnabTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetchFn(config.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `YNAB token refresh failed: ${response.status} ${response.statusText} — ${text.slice(0, 300)}`,
    );
  }

  const json: unknown = await response.json();
  const parsed = YnabTokenSchema.parse(json);
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    expiresIn: parsed.expires_in,
  };
}

export async function exchangeYnabCode(
  code: string,
  config: OAuthConfig,
  fetchFn: FetchFn = fetch,
  codeVerifier?: string,
): Promise<YnabTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });
  // PKCE (RFC 7636): the verifier proves we initiated this authorization.
  if (codeVerifier) body.set("code_verifier", codeVerifier);

  const response = await fetchFn(config.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `YNAB token exchange failed: ${response.status} ${response.statusText} — ${text.slice(0, 300)}`,
    );
  }

  const json: unknown = await response.json();
  const parsed = YnabTokenSchema.parse(json);
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    expiresIn: parsed.expires_in,
  };
}
