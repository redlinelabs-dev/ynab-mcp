#!/usr/bin/env node
// Self-hosted HTTP entrypoint (ADR-0004): the multi-tenant YNAB OAuth MCP server
// as a plain Node + Express process, for Docker/homelab deployment behind a
// private HTTPS front (Tailscale `serve` or a reverse proxy). All real logic lives
// in the tsgo-checked, unit-tested core modules; this file is the thin bootstrap.

import "dotenv/config";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

import type { OAuthConfig } from "./oauth-config.js";
import type { OAuthProps } from "./worker-config.js";

import { importKey, seal, unseal } from "./encryption.js";
import { requireEnv } from "./env.js";
import { buildMcpServer } from "./mcp-server.js";
import { YNAB_AUTHORIZE_ENDPOINT, YNAB_TOKEN_ENDPOINT } from "./oauth-config.js";
import { YnabOAuthProvider } from "./oauth-server.js";
import { Store } from "./store.js";
import { makeToolContextFromProps } from "./worker-config.js";

const ConsentForm = z.object({ pending: z.string(), scope: z.string().optional() });
const CallbackQuery = z.object({ state: z.string().optional(), code: z.string().optional() });

// MCP-client access token lifetime (~1h57m) — under YNAB's 2h so the client
// refreshes before the upstream token dies (which refreshes YNAB underneath).
const ACCESS_TOKEN_TTL_SEC = 7000;

async function main(): Promise<void> {
  const publicUrl = requireEnv(
    process.env["PUBLIC_URL"],
    "PUBLIC_URL",
    "The external https base URL, e.g. https://ynab.your-tailnet.ts.net",
  );
  const encKey = await importKey(
    requireEnv(
      process.env["ENCRYPTION_KEY"],
      "ENCRYPTION_KEY",
      "Generate with: openssl rand -base64 32",
    ),
  );
  const config: OAuthConfig = {
    authorizeEndpoint: YNAB_AUTHORIZE_ENDPOINT,
    tokenEndpoint: YNAB_TOKEN_ENDPOINT,
    clientId: requireEnv(process.env["YNAB_CLIENT_ID"], "YNAB_CLIENT_ID"),
    clientSecret: requireEnv(process.env["YNAB_CLIENT_SECRET"], "YNAB_CLIENT_SECRET"),
    redirectUri: (process.env["YNAB_REDIRECT_URI"] ?? `${publicUrl}/callback`).trim(),
    cookieSecret: "", // unused in the Node flow (state is DB-backed, not cookie-backed)
  };
  const databasePath = (process.env["DATABASE_PATH"] ?? "./data/ynab-mcp.db").trim();
  const port = Number(process.env["PORT"] ?? "8080");

  const store = new Store(databasePath);
  const provider = new YnabOAuthProvider({
    store,
    config,
    encKey,
    fetchFn: fetch,
    accessTokenTtlSec: ACCESS_TOKEN_TTL_SEC,
  });

  const app = express();
  // Behind the Tailscale `serve` (or a reverse proxy) on loopback, so trust the
  // X-Forwarded-* headers from 127.0.0.1 — needed for express-rate-limit to read
  // the client IP instead of throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
  app.set("trust proxy", "loopback");

  // The MCP endpoint is the OAuth protected resource (RFC 9728). Advertising it as
  // `${PUBLIC_URL}/mcp` makes the SDK serve protected-resource metadata at
  // /.well-known/oauth-protected-resource/mcp, which clients (Claude Desktop, etc.)
  // discover to start the OAuth flow.
  const issuerUrl = new URL(publicUrl);
  const resourceServerUrl = new URL("/mcp", publicUrl);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceServerUrl);

  // OAuth server endpoints to MCP clients: /authorize, /token, /register, /revoke,
  // and the .well-known metadata. Must be mounted at the application root.
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
      resourceServerUrl,
      resourceName: "YNAB MCP",
      scopesSupported: ["ynab.read", "ynab.write"],
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Consent submitted → begin the upstream YNAB login leg.
  app.post("/ynab/consent", express.urlencoded({ extended: false }), (req, res) => {
    const form = ConsentForm.safeParse(req.body);
    if (!form.success) {
      res.status(400).send("Missing pending authorization");
      return;
    }
    provider
      .beginUpstreamLogin(form.data.pending, form.data.scope ?? "read-only")
      .then((location) => res.redirect(302, location))
      .catch((err: unknown) => res.status(500).send(errorText(err)));
  });

  // YNAB redirects here → complete the grant and redirect back to the MCP client.
  app.get("/callback", (req, res) => {
    const query = CallbackQuery.safeParse(req.query);
    provider
      .handleCallback({
        state: query.success ? (query.data.state ?? null) : null,
        code: query.success ? (query.data.code ?? null) : null,
      })
      .then((result) => {
        if (result.ok && result.redirectTo) {
          res.redirect(302, result.redirectTo);
        } else {
          res.status(result.status ?? 400).send(result.message ?? "Authorization failed");
        }
      })
      .catch((err: unknown) => res.status(500).send(errorText(err)));
  });

  // The authenticated MCP endpoint (stateless Streamable HTTP, one transport per request).
  app.all(
    "/mcp",
    requireBearerAuth({ verifier: provider, resourceMetadataUrl }),
    express.json(),
    (req, res) => {
      handleMcp(provider, store, encKey, config, req, res).catch((err: unknown) => {
        if (!res.headersSent) res.status(500).json({ error: errorText(err) });
      });
    },
  );

  app.listen(port, () => {
    console.error(`YNAB MCP server listening on :${port} (public: ${publicUrl})`);
  });
}

async function handleMcp(
  provider: YnabOAuthProvider,
  store: Store,
  encKey: CryptoKey,
  config: OAuthConfig,
  req: express.Request,
  res: express.Response,
): Promise<void> {
  const grantId = req.auth?.extra?.["grantId"];
  if (typeof grantId !== "string") {
    res.status(401).json({ error: "No grant associated with token" });
    return;
  }
  const grant = store.getGrant(grantId);
  if (!grant) {
    res.status(401).json({ error: "Grant no longer exists" });
    return;
  }

  const props: OAuthProps = {
    accessToken: await unseal(encKey, grant.encAccess),
    refreshToken: await unseal(encKey, grant.encRefresh),
    expiresAt: grant.expiresAt,
    readOnly: grant.readOnly,
  };
  const { ctx, refreshed } = await makeToolContextFromProps(props, config, fetch, Date.now());
  if (refreshed) {
    store.updateGrantTokens(
      grantId,
      await seal(encKey, refreshed.accessToken),
      await seal(encKey, refreshed.refreshToken),
      refreshed.expiresAt,
    );
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildMcpServer(ctx);
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
