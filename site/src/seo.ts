// Shared SEO/unfurl constants for both halves of the site: the custom landing page
// (src/pages/index.astro) and the Starlight doc pages (src/components/Head.astro, which
// overrides Starlight's own <head>). Kept in one module so the two can't drift.
//
// Everything here is a plain string emitted into static HTML at build time — no client
// JavaScript, no external hosts. See docs/research/seo-current-practices.md.

/** Canonical origin. Must match `site` in astro.config.mjs. */
export const SITE_URL = "https://ynab-mcp.redlinelabs.dev";

/** The link-unfurl card. A committed PNG (source: site/assets/og-card.svg), not a service. */
export const OG_IMAGE = `${SITE_URL}/og.png`;
export const OG_IMAGE_WIDTH = "1200";
export const OG_IMAGE_HEIGHT = "630";
export const OG_IMAGE_ALT =
  "ynab-mcp — Model Context Protocol server for YNAB. " +
  "Point an AI agent at your budget. Nothing moves without you asking.";
