import { z } from "zod";

import type { FetchFn } from "./client.js";
import type { OAuthConfig } from "./oauth-config.js";

const YnabTokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});

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
): Promise<YnabTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });

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
