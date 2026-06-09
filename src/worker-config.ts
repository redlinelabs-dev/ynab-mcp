import { z } from "zod";

import type { FetchFn } from "./client.js";
import type { OAuthConfig } from "./oauth-config.js";
import type { ToolContext } from "./tools.js";

import { YnabClient } from "./client.js";
import { requireEnv } from "./env.js";
import { parseToolsets } from "./toolsets.js";
import { refreshYnabToken } from "./ynab-oauth.js";

export interface OAuthProps {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  readOnly: boolean;
}

const OAuthPropsSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
  readOnly: z.boolean().default(true), // old stored tokens default to read-only (safe)
});

export async function getOrRefreshToken(
  props: OAuthProps,
  config: OAuthConfig,
  fetchFn: FetchFn,
  nowMs: number,
): Promise<{ token: string; refreshed: OAuthProps | null }> {
  if (nowMs < props.expiresAt) {
    return { token: props.accessToken, refreshed: null };
  }
  const tokens = await refreshYnabToken(props.refreshToken, config, fetchFn);
  const refreshed: OAuthProps = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: nowMs + tokens.expiresIn * 1000,
    readOnly: props.readOnly,
  };
  return { token: refreshed.accessToken, refreshed };
}

export async function makeToolContextFromProps(
  props: OAuthProps,
  config: OAuthConfig,
  fetchFn: FetchFn,
  nowMs: number,
): Promise<{ ctx: ToolContext; refreshed: OAuthProps | null }> {
  const { token, refreshed } = await getOrRefreshToken(props, config, fetchFn, nowMs);
  const ctx: ToolContext = {
    client: new YnabClient(token),
    enabledGroups: parseToolsets("all"),
    readOnly: props.readOnly,
    defaultBudget: "last-used",
  };
  return { ctx, refreshed };
}

export interface OAuthStorage {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
}

const OAUTH_PROPS_KEY = "oauth_props";

export async function initFromStorage(
  storage: OAuthStorage,
  config: OAuthConfig,
  fetchFn: FetchFn,
  nowMs: number,
): Promise<{ ctx: ToolContext; refreshed: OAuthProps | null }> {
  const raw = await storage.get(OAUTH_PROPS_KEY);
  if (!raw) {
    throw new Error("No OAuth props found in storage — user must complete OAuth login first");
  }
  const props = OAuthPropsSchema.parse(raw);
  const result = await makeToolContextFromProps(props, config, fetchFn, nowMs);
  if (result.refreshed) {
    await storage.put(OAUTH_PROPS_KEY, result.refreshed);
  }
  return result;
}

export function makeToolContext(devToken: string | undefined | null): ToolContext {
  const token = requireEnv(
    devToken,
    "YNAB_DEV_TOKEN",
    "Set it via: wrangler secret put YNAB_DEV_TOKEN",
  );
  return {
    client: new YnabClient(token),
    enabledGroups: parseToolsets("all"),
    readOnly: true,
    defaultBudget: "last-used",
  };
}
