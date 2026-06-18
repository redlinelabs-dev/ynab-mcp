// SQLite-backed persistence for the OAuth authorization server, using the
// built-in `node:sqlite` (no native build, no dependency). Holds registered
// clients, in-flight authorization state, our issued codes/tokens (by hash),
// and per-tenant grants (with the YNAB tokens sealed by the caller). Rows with
// an `expires_at` are treated as absent once expired, and consumed via `take*`
// (delete-on-read) for one-time use.

import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export interface GrantRecord {
  grantId: string;
  userId: string;
  clientId: string;
  encAccess: string;
  encRefresh: string;
  expiresAt: number;
  readOnly: boolean;
  scope: string;
}

export interface PendingAuthRecord {
  id: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scope: string;
  expiresAt: number;
}

export interface LoginStateRecord {
  upstreamState: string;
  pendingId: string;
  verifier: string;
  scope: string;
  expiresAt: number;
}

export interface AuthCodeRecord {
  codeHash: string;
  grantId: string;
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scope: string;
  expiresAt: number;
}

export interface AccessTokenRecord {
  tokenHash: string;
  grantId: string;
  clientId: string;
  scope: string;
  expiresAt: number;
}

export interface RefreshTokenRecord {
  tokenHash: string;
  grantId: string;
  clientId: string;
  scope: string;
}

const grantRow = z.object({
  grant_id: z.string(),
  user_id: z.string(),
  client_id: z.string(),
  enc_access: z.string(),
  enc_refresh: z.string(),
  expires_at: z.number(),
  read_only: z.number(),
  scope: z.string(),
});

const pendingRow = z.object({
  id: z.string(),
  client_id: z.string(),
  redirect_uri: z.string(),
  code_challenge: z.string(),
  state: z.string().nullable(),
  scope: z.string(),
  expires_at: z.number(),
});

const loginRow = z.object({
  upstream_state: z.string(),
  pending_id: z.string(),
  verifier: z.string(),
  scope: z.string(),
  expires_at: z.number(),
});

const codeRow = z.object({
  code_hash: z.string(),
  grant_id: z.string(),
  client_id: z.string(),
  code_challenge: z.string(),
  redirect_uri: z.string(),
  scope: z.string(),
  expires_at: z.number(),
});

const accessRow = z.object({
  token_hash: z.string(),
  grant_id: z.string(),
  client_id: z.string(),
  scope: z.string(),
  expires_at: z.number(),
});

const refreshRow = z.object({
  token_hash: z.string(),
  grant_id: z.string(),
  client_id: z.string(),
  scope: z.string(),
});

const clientRow = z.object({ client_json: z.string() });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  client_id TEXT PRIMARY KEY, client_json TEXT NOT NULL, issued_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS grants (
  grant_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, client_id TEXT NOT NULL,
  enc_access TEXT NOT NULL, enc_refresh TEXT NOT NULL, expires_at INTEGER NOT NULL,
  read_only INTEGER NOT NULL, scope TEXT NOT NULL, UNIQUE(user_id, client_id));
CREATE TABLE IF NOT EXISTS pending_auth (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL, state TEXT, scope TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_state (
  upstream_state TEXT PRIMARY KEY, pending_id TEXT NOT NULL, verifier TEXT NOT NULL,
  scope TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS auth_codes (
  code_hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL, client_id TEXT NOT NULL,
  code_challenge TEXT NOT NULL, redirect_uri TEXT NOT NULL, scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS access_tokens (
  token_hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL, client_id TEXT NOT NULL,
  scope TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL, client_id TEXT NOT NULL, scope TEXT NOT NULL);
`;

function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}

export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  // --- Clients (DCR) ---
  putClient(clientId: string, client: unknown, nowMs: number): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO clients (client_id, client_json, issued_at) VALUES (?, ?, ?)",
      )
      .run(clientId, JSON.stringify(client), nowMs);
  }

  getClient(clientId: string): unknown {
    const raw = this.db
      .prepare("SELECT client_json FROM clients WHERE client_id = ?")
      .get(clientId);
    if (raw === undefined) return undefined;
    return JSON.parse(clientRow.parse(raw).client_json);
  }

  // --- Grants (one per user+client; new one replaces the old) ---
  upsertGrant(grant: GrantRecord): void {
    this.db
      .prepare("DELETE FROM grants WHERE user_id = ? AND client_id = ?")
      .run(grant.userId, grant.clientId);
    this.db
      .prepare(
        `INSERT INTO grants
         (grant_id, user_id, client_id, enc_access, enc_refresh, expires_at, read_only, scope)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        grant.grantId,
        grant.userId,
        grant.clientId,
        grant.encAccess,
        grant.encRefresh,
        grant.expiresAt,
        boolToInt(grant.readOnly),
        grant.scope,
      );
  }

  getGrant(grantId: string): GrantRecord | undefined {
    const raw = this.db.prepare("SELECT * FROM grants WHERE grant_id = ?").get(grantId);
    if (raw === undefined) return undefined;
    const r = grantRow.parse(raw);
    return {
      grantId: r.grant_id,
      userId: r.user_id,
      clientId: r.client_id,
      encAccess: r.enc_access,
      encRefresh: r.enc_refresh,
      expiresAt: r.expires_at,
      readOnly: r.read_only !== 0,
      scope: r.scope,
    };
  }

  updateGrantTokens(
    grantId: string,
    encAccess: string,
    encRefresh: string,
    expiresAt: number,
  ): void {
    this.db
      .prepare(
        "UPDATE grants SET enc_access = ?, enc_refresh = ?, expires_at = ? WHERE grant_id = ?",
      )
      .run(encAccess, encRefresh, expiresAt, grantId);
  }

  deleteGrant(grantId: string): void {
    this.db.prepare("DELETE FROM grants WHERE grant_id = ?").run(grantId);
  }

  // --- Pending authorize request (kept until the callback completes) ---
  putPendingAuth(p: PendingAuthRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO pending_auth
         (id, client_id, redirect_uri, code_challenge, state, scope, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(p.id, p.clientId, p.redirectUri, p.codeChallenge, p.state, p.scope, p.expiresAt);
  }

  takePendingAuth(id: string, nowMs: number): PendingAuthRecord | undefined {
    const raw = this.db.prepare("SELECT * FROM pending_auth WHERE id = ?").get(id);
    this.db.prepare("DELETE FROM pending_auth WHERE id = ?").run(id);
    if (raw === undefined) return undefined;
    const r = pendingRow.parse(raw);
    if (r.expires_at <= nowMs) return undefined;
    return {
      id: r.id,
      clientId: r.client_id,
      redirectUri: r.redirect_uri,
      codeChallenge: r.code_challenge,
      state: r.state,
      scope: r.scope,
      expiresAt: r.expires_at,
    };
  }

  // --- Upstream (YNAB) login state ---
  putLoginState(s: LoginStateRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO login_state (upstream_state, pending_id, verifier, scope, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(s.upstreamState, s.pendingId, s.verifier, s.scope, s.expiresAt);
  }

  takeLoginState(upstreamState: string, nowMs: number): LoginStateRecord | undefined {
    const raw = this.db
      .prepare("SELECT * FROM login_state WHERE upstream_state = ?")
      .get(upstreamState);
    this.db.prepare("DELETE FROM login_state WHERE upstream_state = ?").run(upstreamState);
    if (raw === undefined) return undefined;
    const r = loginRow.parse(raw);
    if (r.expires_at <= nowMs) return undefined;
    return {
      upstreamState: r.upstream_state,
      pendingId: r.pending_id,
      verifier: r.verifier,
      scope: r.scope,
      expiresAt: r.expires_at,
    };
  }

  // --- Our issued authorization codes (one-time) ---
  putAuthCode(c: AuthCodeRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO auth_codes
         (code_hash, grant_id, client_id, code_challenge, redirect_uri, scope, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(c.codeHash, c.grantId, c.clientId, c.codeChallenge, c.redirectUri, c.scope, c.expiresAt);
  }

  getAuthCode(codeHash: string, nowMs: number): AuthCodeRecord | undefined {
    const raw = this.db.prepare("SELECT * FROM auth_codes WHERE code_hash = ?").get(codeHash);
    if (raw === undefined) return undefined;
    const r = codeRow.parse(raw);
    if (r.expires_at <= nowMs) return undefined;
    return {
      codeHash: r.code_hash,
      grantId: r.grant_id,
      clientId: r.client_id,
      codeChallenge: r.code_challenge,
      redirectUri: r.redirect_uri,
      scope: r.scope,
      expiresAt: r.expires_at,
    };
  }

  takeAuthCode(codeHash: string, nowMs: number): AuthCodeRecord | undefined {
    const found = this.getAuthCode(codeHash, nowMs);
    this.db.prepare("DELETE FROM auth_codes WHERE code_hash = ?").run(codeHash);
    return found;
  }

  // --- Our issued access tokens ---
  putAccessToken(t: AccessTokenRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO access_tokens (token_hash, grant_id, client_id, scope, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(t.tokenHash, t.grantId, t.clientId, t.scope, t.expiresAt);
  }

  getAccessToken(tokenHash: string, nowMs: number): AccessTokenRecord | undefined {
    const raw = this.db.prepare("SELECT * FROM access_tokens WHERE token_hash = ?").get(tokenHash);
    if (raw === undefined) return undefined;
    const r = accessRow.parse(raw);
    if (r.expires_at <= nowMs) return undefined;
    return {
      tokenHash: r.token_hash,
      grantId: r.grant_id,
      clientId: r.client_id,
      scope: r.scope,
      expiresAt: r.expires_at,
    };
  }

  deleteAccessToken(tokenHash: string): void {
    this.db.prepare("DELETE FROM access_tokens WHERE token_hash = ?").run(tokenHash);
  }

  // --- Our issued refresh tokens (non-rotating: stable for the grant's life) ---
  putRefreshToken(t: RefreshTokenRecord): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO refresh_tokens (token_hash, grant_id, client_id, scope) VALUES (?, ?, ?, ?)",
      )
      .run(t.tokenHash, t.grantId, t.clientId, t.scope);
  }

  getRefreshToken(tokenHash: string): RefreshTokenRecord | undefined {
    const raw = this.db.prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?").get(tokenHash);
    if (raw === undefined) return undefined;
    const r = refreshRow.parse(raw);
    return { tokenHash: r.token_hash, grantId: r.grant_id, clientId: r.client_id, scope: r.scope };
  }

  deleteRefreshToken(tokenHash: string): void {
    this.db.prepare("DELETE FROM refresh_tokens WHERE token_hash = ?").run(tokenHash);
  }
}
