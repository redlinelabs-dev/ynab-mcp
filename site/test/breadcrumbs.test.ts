import { describe, expect, it } from "vitest";

import { firstHref, type SidebarEntry, trailTo } from "../src/lib/breadcrumbs.ts";

function link(label: string, href: string, isCurrent = false): SidebarEntry {
  return { type: "link", label, href, isCurrent };
}

function group(label: string, entries: SidebarEntry[]): SidebarEntry {
  return { type: "group", label, entries };
}

describe("firstHref", () => {
  it("returns a link's own href", () => {
    expect(firstHref(link("Quick start", "/start-here/quick-start/"))).toBe(
      "/start-here/quick-start/",
    );
  });

  it("returns the first descendant link's href for a group", () => {
    const entry = group("Reference", [
      link("Budgets", "/reference/budgets/"),
      link("Accounts", "/reference/accounts/"),
    ]);
    expect(firstHref(entry)).toBe("/reference/budgets/");
  });

  it("recurses through nested groups", () => {
    const entry = group("Outer", [group("Inner", [link("Leaf", "/leaf/")])]);
    expect(firstHref(entry)).toBe("/leaf/");
  });

  it("returns undefined for an empty group", () => {
    expect(firstHref(group("Empty", []))).toBeUndefined();
  });
});

describe("trailTo", () => {
  it("returns a single crumb for a top-level current link", () => {
    const sidebar = [link("Trust", "/trust/", true)];
    expect(trailTo(sidebar)).toEqual([{ name: "Trust", item: "/trust/" }]);
  });

  it("prefixes the group crumb when the current page isn't the group's first page", () => {
    const sidebar = [
      group("Reference", [
        link("Budgets", "/reference/budgets/"),
        link("Accounts", "/reference/accounts/", true),
      ]),
    ];
    expect(trailTo(sidebar)).toEqual([
      { name: "Reference", item: "/reference/budgets/" },
      { name: "Accounts", item: "/reference/accounts/" },
    ]);
  });

  it("drops the group crumb when the current page is the group's own first page", () => {
    const sidebar = [
      group("Reference", [
        link("Budgets", "/reference/budgets/", true),
        link("Accounts", "/reference/accounts/"),
      ]),
    ];
    expect(trailTo(sidebar)).toEqual([{ name: "Budgets", item: "/reference/budgets/" }]);
  });

  it("returns undefined when no entry is current", () => {
    const sidebar = [link("Trust", "/trust/"), group("Reference", [link("Budgets", "/b/")])];
    expect(trailTo(sidebar)).toBeUndefined();
  });

  it("skips groups that don't contain the current page", () => {
    const sidebar = [
      group("Connect", [link("Claude Desktop", "/connect/claude-desktop/")]),
      group("Reference", [link("Budgets", "/reference/budgets/", true)]),
    ];
    expect(trailTo(sidebar)).toEqual([{ name: "Budgets", item: "/reference/budgets/" }]);
  });
});
