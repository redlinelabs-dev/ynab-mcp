import type { ToolContext } from "./tools.js";

import { YnabClient } from "./client.js";
import { requireEnv } from "./env.js";
import { parseToolsets } from "./toolsets.js";

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
