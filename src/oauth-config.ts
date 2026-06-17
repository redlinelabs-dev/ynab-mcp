import { requireEnv } from "./env.js";

export const YNAB_AUTHORIZE_ENDPOINT = "https://app.ynab.com/oauth/authorize";
export const YNAB_TOKEN_ENDPOINT = "https://app.ynab.com/oauth/token";

interface OAuthEnv {
  YNAB_CLIENT_ID: string;
  YNAB_CLIENT_SECRET: string;
  YNAB_REDIRECT_URI: string;
  COOKIE_SECRET: string;
}

export interface OAuthConfig {
  authorizeEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  cookieSecret: string;
}

export function oauthConfig(env: OAuthEnv): OAuthConfig {
  return {
    authorizeEndpoint: YNAB_AUTHORIZE_ENDPOINT,
    tokenEndpoint: YNAB_TOKEN_ENDPOINT,
    clientId: requireEnv(env.YNAB_CLIENT_ID, "YNAB_CLIENT_ID"),
    clientSecret: requireEnv(env.YNAB_CLIENT_SECRET, "YNAB_CLIENT_SECRET"),
    redirectUri: requireEnv(env.YNAB_REDIRECT_URI, "YNAB_REDIRECT_URI"),
    cookieSecret: requireEnv(env.COOKIE_SECRET, "COOKIE_SECRET"),
  };
}
