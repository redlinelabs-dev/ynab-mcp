// Pure breadcrumb derivation behind Head.astro's BreadcrumbList JSON-LD. Split out so it's
// importable by vitest without an Astro render context — see CLAUDE.md and issue #28.
//
// Typed structurally against the shape Starlight's `starlightRoute.sidebar` actually has
// (see @astrojs/starlight/utils/routing/types SidebarEntry), rather than importing that
// internal type, so this module has no dependency on Starlight beyond the field names it reads.

export type SidebarEntry =
  | { type: "link"; label: string; href: string; isCurrent: boolean }
  | { type: "group"; label: string; entries: SidebarEntry[] };

export type Crumb = { name: string; item: string };

/** The first real page inside a sidebar group — the URL its label points at in practice. */
export function firstHref(entry: SidebarEntry): string | undefined {
  if (entry.type === "link") return entry.href;
  for (const child of entry.entries) {
    const href = firstHref(child);
    if (href !== undefined) return href;
  }
  return undefined;
}

/**
 * The trail of sidebar labels leading to the current page, outermost first.
 *
 * A group contributes a crumb pointing at its first page (the same target the landing
 * page's "Reference" nav link uses). When that first page *is* the current page, the group
 * crumb is dropped rather than emitted with a duplicate URL: this page is the section root,
 * so `Home > Page` is the shortest true path.
 */
export function trailTo(entries: SidebarEntry[]): Crumb[] | undefined {
  for (const entry of entries) {
    if (entry.type === "link") {
      if (entry.isCurrent) return [{ name: entry.label, item: entry.href }];
      continue;
    }
    const inner = trailTo(entry.entries);
    if (inner === undefined) continue;
    const groupHref = firstHref(entry);
    if (groupHref === undefined || groupHref === inner[0]?.item) return inner;
    return [{ name: entry.label, item: groupHref }, ...inner];
  }
  return undefined;
}
