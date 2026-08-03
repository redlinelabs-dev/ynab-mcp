# How the site screenshots were made

Captured **2026-08-02/03** against `@redlinelabs/ynab-mcp@0.2.1` running in **demo mode** —
`YNAB_DEMO=1`, no token, entirely fictional data — per issue #17: every image is a genuine
session, no mock-ups, no edited chrome (rectangular cropping only). Files live in
`site/src/assets/screenshots/` and are embedded from the `site/src/content/docs/connect/` pages.

## Per-harness setup used

- **Claude Code v2.1.220 (WSL2):** isolated session so no personal servers appear —
  `claude --strict-mcp-config --mcp-config <file>` where the file defines only
  `ynab: npx -y @redlinelabs/ynab-mcp` with `YNAB_DEMO=1`. Captures: the `/mcp` panel, and one
  budget question.
- **Claude Desktop (Windows, Aug 2026 build):** stdio entry in `%APPDATA%\Claude\claude_desktop_config.json`
  (`npx -y @redlinelabs/ynab-mcp`, env `YNAB_DEMO=1`); full quit + relaunch to load it. Captures:
  Settings → Connectors → ynab tool list, and one budget question.
- **Codex CLI (WSL2):** `[mcp_servers.ynab]` stdio block in `~/.codex/config.toml` with
  `YNAB_DEMO=1`. One capture showing tool calls with raw responses plus the summary.
- **Codex app (Windows):** same config file as the CLI (`C:\Users\<user>\.codex\config.toml`),
  stdio via `command = "cmd", args = ["/c", "npx", ...]`, `startup_timeout_sec = 120` for the
  first npx download. Prompt tip that made it use tools first-try: name YNAB explicitly
  ("Check my YNAB budget — how's this month looking?").
- **hermes-agent:** deliberately not captured (owner decision, 2026-08-03) — its remote-MCP/OAuth
  support was never verified against this server, and its connect page says so rather than
  implying otherwise.

## Retake checklist (when a harness UI changes)

1. Run the server with `YNAB_DEMO=1` only — never against a real account. Before capturing,
   check the harness for existing _real_ ynab configs (remote URL + token) that could win over
   the demo entry; disable them for the session and restore after.
2. Ask "How's my budget looking this month?" (or the YNAB-naming variant for Codex). The answer
   must show the fictional Demo Budget — ~$5,300 income, an overspent Hobbies category with a
   $219.99 "Model kit", "Nimbus Analytics Payroll" paychecks. Anything else = real data, discard.
3. Sweep the frame: window titles, scrollback, sidebars — no tokens, no real amounts, no
   addresses. Crop rather than blur; blurring reads as edited chrome. The shipped set crops out
   app sidebars, tab strips, and banners entirely, because that's where harnesses put account
   names and usernames — do the same on retakes (sharp `extract`; see git history for the
   originals' crop boxes).
4. PNG, roughly 1200–1300 px wide, into `site/src/assets/screenshots/`, embedded with alt text
   that describes what the reader is looking at.
