// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// Public docs site for ynab-mcp (consumers, not contributors — see ADR-0005).
// Deployed to GitHub Pages behind the custom domain https://ynab-mcp.redlinelabs.dev/
// (CNAME + .nojekyll in public/, path-filtered workflow at .github/workflows/pages.yml).
export default defineConfig({
  site: "https://ynab-mcp.redlinelabs.dev",
  integrations: [
    starlight({
      title: "ynab-mcp",
      description:
        "An MCP server that connects an AI agent to your YNAB budget — read balances and categories, " +
        "categorize transactions, or just ask questions, without giving the agent your bank.",
      favicon: "/favicon.svg",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/redlinelabs-dev/ynab-mcp" },
      ],
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Start here",
          items: [{ label: "Quick start (PAT)", slug: "start-here/quick-start" }],
        },
        {
          label: "Connect your agent",
          items: [
            { label: "Claude Desktop", slug: "connect/claude-desktop" },
            { label: "Claude Code", slug: "connect/claude-code" },
            { label: "Codex app", slug: "connect/codex-app" },
            { label: "Codex CLI", slug: "connect/codex-cli" },
            { label: "hermes-agent", slug: "connect/hermes-agent" },
            { label: "Generic MCP client", slug: "connect/generic-mcp-client" },
          ],
        },
        {
          label: "Host your own",
          items: [{ label: "Docker & docker-compose", slug: "host-your-own" }],
        },
        {
          label: "Trust",
          items: [{ label: "What's stored, what isn't possible", slug: "trust" }],
        },
        {
          label: "Reference",
          items: [
            { label: "Budgets", slug: "reference/budgets" },
            { label: "Accounts", slug: "reference/accounts" },
            { label: "Categories", slug: "reference/categories" },
            { label: "Transactions", slug: "reference/transactions" },
            { label: "Months", slug: "reference/months" },
            { label: "Payees", slug: "reference/payees" },
            { label: "Scheduled transactions", slug: "reference/scheduled" },
            { label: "Money movements", slug: "reference/money_movements" },
          ],
        },
        {
          label: "How it works",
          items: [{ label: "Jargon, decoded", slug: "how-it-works" }],
        },
      ],
    }),
  ],
});
