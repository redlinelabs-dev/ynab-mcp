// The OAuth 2.1 authorization server we present to MCP clients, implemented
// against the MCP SDK's OAuthServerProvider interface. We are the AS to the MCP
// client (issue our own codes + tokens); the authorize() step proxies the user's
// browser to YNAB (the upstream IdP) and the /callback completes by minting our
// code. YNAB tokens live in the grant, sealed at rest. The SDK's router validates
// the MCP client's PKCE for us (skipLocalPkceValidation stays false).

import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Response } from "express";

import {
  InvalidGrantError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { OAuthClientInformationFullSchema } from "@modelcontextprotocol/sdk/shared/auth.js";

import type { FetchFn } from "./client.js";
import type { OAuthConfig } from "./oauth-config.js";

import { seal, sha256Hex, unseal } from "./encryption.js";
import { generatePkce } from "./pkce.js";
import { Store } from "./store.js";
import { exchangeYnabCode, fetchYnabUserId, refreshYnabToken } from "./ynab-oauth.js";

const TEN_MINUTES_MS = 600_000;
const AUTH_CODE_TTL_MS = 60_000;

export interface CallbackResult {
  ok: boolean;
  redirectTo?: string;
  status?: number;
  message?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderConsent(pendingId: string, clientName: string): string {
  const client = escapeHtml(clientName || "An application");
  const pending = escapeHtml(pendingId);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Connect YNAB</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem}
fieldset{border:1px solid #ddd;border-radius:8px;margin:1.5rem 0;padding:1rem}
label{display:block;margin:.5rem 0;cursor:pointer}.hint{color:#666;font-size:.85rem;margin-left:1.5rem}
button{background:#1a1a1a;color:#fff;border:0;border-radius:6px;padding:.7rem 1.4rem;font-size:1rem;cursor:pointer}</style>
</head><body>
<h1>Connect your YNAB account</h1>
<p><strong>${client}</strong> wants to access your YNAB data.</p>
<form method="POST" action="/ynab/consent">
<input type="hidden" name="pending" value="${pending}">
<fieldset><legend>Access level</legend>
<label><input type="radio" name="scope" value="read-only" checked> Read-only (recommended)</label>
<div class="hint">View budgets, accounts, and transactions. Cannot make changes.</div>
<label><input type="radio" name="scope" value="full"> Allow write access</label>
<div class="hint">Also create and update transactions, categories, and more.</div>
</fieldset>
<button type="submit">Continue to YNAB</button>
</form></body></html>`;
}

export interface YnabProviderOptions {
  store: Store;
  config: OAuthConfig;
  encKey: CryptoKey;
  fetchFn: FetchFn;
  accessTokenTtlSec: number;
  now?: () => number;
}

export class YnabOAuthProvider implements OAuthServerProvider {
  private readonly store: Store;
  private readonly config: OAuthConfig;
  private readonly encKey: CryptoKey;
  private readonly fetchFn: FetchFn;
  private readonly accessTokenTtlSec: number;
  private readonly now: () => number;

  constructor(options: YnabProviderOptions) {
    this.store = options.store;
    this.config = options.config;
    this.encKey = options.encKey;
    this.fetchFn = options.fetchFn;
    this.accessTokenTtlSec = options.accessTokenTtlSec;
    this.now = options.now ?? (() => Date.now());
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId: string): OAuthClientInformationFull | undefined => {
        const raw = this.store.getClient(clientId);
        if (raw === undefined) return undefined;
        return OAuthClientInformationFullSchema.parse(raw);
      },
      registerClient: (client): OAuthClientInformationFull => {
        const full = OAuthClientInformationFullSchema.parse(client);
        this.store.putClient(full.client_id, full, this.now());
        return full;
      },
    };
  }

  // Step 1: render the consent screen and stash the MCP client's authorize request.
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const pendingId = crypto.randomUUID();
    this.store.putPendingAuth({
      id: pendingId,
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state ?? null,
      scope: (params.scopes ?? []).join(" "),
      expiresAt: this.now() + TEN_MINUTES_MS,
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderConsent(pendingId, client.client_name ?? ""));
  }

  // Step 2 (custom route POST /ynab/consent): start the upstream YNAB leg.
  async beginUpstreamLogin(pendingId: string, scopeChoice: string): Promise<string> {
    const scope: "read-only" | "full" = scopeChoice === "full" ? "full" : "read-only";
    const { verifier, challenge } = await generatePkce();
    const upstreamState = crypto.randomUUID();
    this.store.putLoginState({
      upstreamState,
      pendingId,
      verifier,
      scope,
      expiresAt: this.now() + TEN_MINUTES_MS,
    });
    const url = new URL(this.config.authorizeEndpoint);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", upstreamState);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (scope === "read-only") url.searchParams.set("scope", "read-only");
    return url.toString();
  }

  // Step 3 (custom route GET /callback): exchange the YNAB code, create the
  // grant, and mint our authorization code for the waiting MCP client.
  async handleCallback(params: {
    state: string | null;
    code: string | null;
  }): Promise<CallbackResult> {
    const now = this.now();
    if (!params.state) return { ok: false, status: 400, message: "Missing state parameter" };
    const login = this.store.takeLoginState(params.state, now);
    if (!login) return { ok: false, status: 400, message: "Invalid or expired login state" };
    if (!params.code) return { ok: false, status: 400, message: "Missing code parameter" };
    const pending = this.store.takePendingAuth(login.pendingId, now);
    if (!pending) return { ok: false, status: 400, message: "Authorization request expired" };

    try {
      const tokens = await exchangeYnabCode(params.code, this.config, this.fetchFn, login.verifier);
      const userId = await fetchYnabUserId(tokens.accessToken, this.fetchFn);
      const readOnly = login.scope !== "full";
      const scope = readOnly ? "ynab.read" : "ynab.read ynab.write";
      const grantId = crypto.randomUUID();
      this.store.upsertGrant({
        grantId,
        userId,
        clientId: pending.clientId,
        encAccess: await seal(this.encKey, tokens.accessToken),
        encRefresh: await seal(this.encKey, tokens.refreshToken),
        expiresAt: now + tokens.expiresIn * 1000,
        readOnly,
        scope,
      });
      const code = crypto.randomUUID();
      this.store.putAuthCode({
        codeHash: await sha256Hex(code),
        grantId,
        clientId: pending.clientId,
        codeChallenge: pending.codeChallenge,
        redirectUri: pending.redirectUri,
        scope,
        expiresAt: now + AUTH_CODE_TTL_MS,
      });
      const redirectTo = new URL(pending.redirectUri);
      redirectTo.searchParams.set("code", code);
      if (pending.state) redirectTo.searchParams.set("state", pending.state);
      return { ok: true, redirectTo: redirectTo.toString() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, status: 502, message: `OAuth error: ${message}` };
    }
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const row = this.store.getAuthCode(await sha256Hex(authorizationCode), this.now());
    if (!row) throw new InvalidGrantError("Authorization code is invalid or expired");
    return row.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const row = this.store.takeAuthCode(await sha256Hex(authorizationCode), this.now());
    if (!row) throw new InvalidGrantError("Authorization code is invalid or expired");
    if (row.clientId !== client.client_id) {
      throw new InvalidGrantError("Authorization code was issued to another client");
    }
    if (redirectUri !== undefined && redirectUri !== row.redirectUri) {
      throw new InvalidGrantError("redirect_uri does not match the authorization request");
    }
    return this.issueTokens(row.grantId, row.clientId, row.scope);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
  ): Promise<OAuthTokens> {
    const row = this.store.takeRefreshToken(await sha256Hex(refreshToken));
    if (!row) throw new InvalidGrantError("Refresh token is invalid");
    if (row.clientId !== client.client_id) {
      throw new InvalidGrantError("Refresh token was issued to another client");
    }
    const grant = this.store.getGrant(row.grantId);
    if (!grant) throw new InvalidGrantError("The grant for this token no longer exists");

    const now = this.now();
    // Keep the upstream YNAB token live alongside our refresh.
    if (now >= grant.expiresAt - 60_000) {
      const ynabRefresh = await unseal(this.encKey, grant.encRefresh);
      const fresh = await refreshYnabToken(ynabRefresh, this.config, this.fetchFn);
      this.store.updateGrantTokens(
        grant.grantId,
        await seal(this.encKey, fresh.accessToken),
        await seal(this.encKey, fresh.refreshToken),
        now + fresh.expiresIn * 1000,
      );
    }
    return this.issueTokens(grant.grantId, row.clientId, row.scope);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const row = this.store.getAccessToken(await sha256Hex(token), this.now());
    if (!row) throw new InvalidTokenError("Access token is invalid or expired");
    return {
      token,
      clientId: row.clientId,
      scopes: row.scope.split(" ").filter(Boolean),
      expiresAt: Math.floor(row.expiresAt / 1000),
      extra: { grantId: row.grantId },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    const hash = await sha256Hex(request.token);
    this.store.deleteAccessToken(hash);
    this.store.takeRefreshToken(hash);
  }

  private async issueTokens(
    grantId: string,
    clientId: string,
    scope: string,
  ): Promise<OAuthTokens> {
    const accessToken = crypto.randomUUID();
    const refreshToken = crypto.randomUUID();
    const now = this.now();
    this.store.putAccessToken({
      tokenHash: await sha256Hex(accessToken),
      grantId,
      clientId,
      scope,
      expiresAt: now + this.accessTokenTtlSec * 1000,
    });
    this.store.putRefreshToken({
      tokenHash: await sha256Hex(refreshToken),
      grantId,
      clientId,
      scope,
    });
    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: this.accessTokenTtlSec,
      refresh_token: refreshToken,
      scope,
    };
  }
}
