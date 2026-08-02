# Current, substantiated SEO practices (Aug 2025 – Aug 2026)

**Compiled:** 2026-08-02
**Scope:** an actionable playbook for `https://ynab-mcp.redlinelabs.dev` — a small technical
documentation site for a developer/prosumer tool, built with Astro + Starlight, statically
prerendered and deployed to GitHub Pages.

## Evidence rules used to build this document

Every practice below had to clear two bars, or it was cut:

1. **Primary source only.** Google Search Central documentation or blog, the Google Search Status
   Dashboard, `web.dev` / Chrome for Developers (Google's own performance docs), or Bing Webmaster
   official docs/blog. Reputable third-party studies appear only as _supporting_ evidence next to a
   primary claim, never as the sole basis for one.
2. **Published or explicitly confirmed-current between August 2025 and August 2026.** Where a
   long-standing fundamental still applies, the citation is to an in-window page that restates it —
   not to the original announcement.

Anything I could not substantiate that way is in [§6 Deliberately excluded](#6-deliberately-excluded)
rather than quietly omitted. Where a citation is _weaker_ than the bar, I say so inline instead of
dropping the item silently.

Notation: each source is cited with its URL and its own "Last updated" / publication date as the
page itself reports it.

---

## 1. AI-era search

### 1.1 Eligibility for AI Overviews and AI Mode is ordinary Search eligibility

**What to do.** Nothing special. Make sure pages are indexed, return 200, and are eligible to be
shown with a snippet. Do not add AI-specific markup, files, or formats.

**Why.** Google: "A page must be indexed and eligible to be shown in Google Search with a snippet,
fulfilling the Search technical requirements," and there are _no additional technical requirements_
for AI Overviews or AI Mode.
Source: <https://developers.google.com/search/docs/appearance/ai-features> — last updated
**2025-12-10**.

**Applies to this site how.** Already satisfied. Astro/Starlight emits static HTML with 200s, and
`sitemap-index.xml` is generated at build. The one thing to preserve is that no page ever ends up
`noindex` or `nosnippet` by accident — those directives are the documented way to _exclude_ yourself
from AI surfaces, so they must not be applied casually.

### 1.2 `llms.txt` does nothing for Google Search — do not treat it as an SEO measure

**What to do.** Do not create, maintain, or expand `llms.txt` _for search or AI-search visibility_.
If you keep one, keep it for a different, stated reason (see below) and hold it to a low
maintenance budget.

**Why.** Google states it verbatim: "You don't need to create new machine readable files, AI text
files, markup, or Markdown to appear in Google Search (including its generative AI capabilities), as
Google Search itself doesn't use them."
Source: <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide> — last
updated **2026-07-10**.
Google's own documentation changelog logs this clarification on **2026-06-15**: llms.txt files are
not required for Google Search visibility and won't affect rankings positively or negatively.
Source: <https://developers.google.com/search/updates> — page last updated **2026-07-29**.
The AI-features page independently says site owners need not create "new machine readable files, AI
text files, or markup."
Source: <https://developers.google.com/search/docs/appearance/ai-features> — **2025-12-10**.

**Actual adoption status, stated honestly.** No major search engine or AI provider has published a
commitment to consume `llms.txt`. Google has explicitly disclaimed it (above). I found no official
Bing, OpenAI, Anthropic, Meta, or Mistral documentation committing to read it. _Supporting
secondary evidence only:_ an Ahrefs analysis of 137,210 domains found that 97% of published
`llms.txt` files received zero requests in May 2026, and that of the small remainder that were
fetched, the top named agents were coding/agent tools (GPTBot, Claude-Code) rather than search
crawlers — <https://ahrefs.com/blog/llmstxt-study/>. Treat that number as directional, not as the
basis for the claim; the basis is Google's own disclaimer.

**Applies to this site how.** `site/public/llms.txt` exists and is a good, accurate document. Keep
it _only_ on the honest rationale that this project's audience literally is people running coding
agents, and coding agents are the one measured population that fetches these files — not because it
helps ranking or AI Overview citation. Do not spend effort growing it, do not add per-page
`.md` mirrors, and do not let anyone list it as an SEO win.

### 1.3 Google's anti-patterns for "AI optimization" — explicitly named

**What to do.** Avoid the four things Google names directly:

- **Don't chunk.** "There's no requirement to break your content into tiny pieces for AI to better
  understand it."
- **Don't write for machines.** "You don't need to write in a specific way just for generative AI
  search. AI systems can understand synonyms and general meanings of what someone is seeking."
- **Don't over-invest in schema for AI.** "Structured data isn't required for generative AI search,
  and there's no special schema.org markup you need to add."
- **Don't chase mentions.** "Seeking inauthentic 'mentions' across the web isn't as helpful as it
  might seem."

**Why.** All four are verbatim from
<https://developers.google.com/search/docs/fundamentals/ai-optimization-guide> — last updated
**2026-07-10**.

**Applies to this site how.** This kills several tempting "GEO/AEO" projects before they start: no
splitting reference pages into micro-pages per tool, no question-shaped rewrites of the Trust page,
no schema-everything sprint, no directory/mention campaign. The reference pages should stay
generated one-per-toolset, which is how the tool is actually organized.

### 1.4 What Google _does_ recommend for AI surfaces: unique, non-commodity, well-organized content

**What to do.** Publish content with a distinctive perspective and first-hand/expert detail rather
than restating what is already common knowledge; organize it with clear paragraphs, sections, and
headings; add images/video where they genuinely support the text; keep it crawlable; use semantic
HTML; keep page experience good; reduce duplicate content.

**Why.** These are the affirmative recommendations in Google's generative-AI optimization guide.
Source: <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide> — **2026-07-10**.

**Applies to this site how.** This site's genuine non-commodity assets are the things nobody else
can restate: _bank linking is impossible via the YNAB API_, _the 200 req/hr rate limit and how the
tool design works around it_, _milliunits_, _what is and isn't stored under OAuth vs PAT_, and the
per-toolset tool reference. Those are experience-derived claims backed by code. Lean into them; do
not add generic "what is MCP" or "what is budgeting" filler, which is exactly the commodity content
the guide warns about.

### 1.5 Google's position on AI-generated content: method-neutral, abuse-focused, disclosure-aware

**What to do.** Using AI to help produce content is not itself a violation. What is a violation is
_scaled content abuse_: generating many pages with little value. Where automation is used, make it
evident to visitors.

**Why.** The spam policies name it directly under scaled content abuse: "Using generative AI tools
or other similar tools to generate many pages without adding value for users."
Source: <https://developers.google.com/search/docs/essentials/spam-policies> — last updated
**2026-05-15**.
The helpful-content self-assessment asks: "Is the use of automation, including AI-generation,
self-evident to visitors through disclosures or in other ways?"
Source: <https://developers.google.com/search/docs/fundamentals/creating-helpful-content> — last
updated **2025-12-10**.
The AI optimization guide also warns against scaled content abuse and says to use AI tools
responsibly, in compliance with spam policies (**2026-07-10**, cited above).

**Applies to this site how.** The generated tool-reference pages (`scripts/generate-reference.ts`)
are programmatic but each corresponds to a real toolset with distinct content — that is generation
_with_ value, not scaled abuse. The risk to avoid is auto-fanning one page per _tool_ (46 thin
pages) for keyword coverage. Keep the 8 toolset pages.

### 1.6 E-E-A-T is current, and trust is the ranked-highest component

**What to do.** Make expertise and trust legible on the page: who made this, on what basis, sourced
against what. Don't fabricate credentials; do surface real ones.

**Why.** "Of these aspects, trust is most important." Google's helpful-content guidance still frames
Experience, Expertise, Authoritativeness, Trustworthiness as what its systems aim to reward, and
points at the Search Quality Rater Guidelines for how it is assessed. It also asks whether content
is "written or reviewed by an expert or enthusiast who demonstrably knows the topic well."
Source: <https://developers.google.com/search/docs/fundamentals/creating-helpful-content> —
**2025-12-10**.

**Applies to this site how.** The site is about someone's _money data_, so trust signals are not
decoration. Concretely: keep the Trust page as a first-class, linked-from-everywhere page; keep the
"every claim is checked against the code" property real (it is pinned by `test/docs.test.ts`); link
to the source repo, the ADRs, the MIT license, and the npm package from the footer (already done);
keep the YNAB non-affiliation disclaimer visible (already done).

### 1.7 Bing publishes separate, actionable AI-citation guidance — and it is not the same as Google's

**What to do.** For Bing/Copilot citation specifically: deepen coverage where you already get cited,
use headings and tables for clarity, support claims with examples and data, keep content fresh, and
keep text/image/video representations consistent. Bing also ties IndexNow to AI freshness:
"IndexNow helps keep information fresh across search and AI."

**Why.** Source: <https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview>
— published **2026-02-10**. Bing expanded these insights (Intents, Topics, Citation Share, Compare)
in <https://blogs.bing.com/search/June-2026/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare>
— **June 2026**.

**Note the divergence.** Bing's advice to use "FAQ sections" is about _content structure for
readability_, not about `FAQPage` structured data — which Google has retired as a rich result
(§2.2). Don't collapse the two.

**Applies to this site how.** Two cheap, real actions: register the property in Bing Webmaster
Tools to get the AI Performance report, and consider IndexNow submission on deploy. GitHub Pages
serves static files, so hosting the IndexNow key file is trivial (drop it in `site/public/`), and
the docs workflow already runs on merge. Note that IndexNow is a Microsoft/Bing-ecosystem protocol;
I found no in-window Google statement that Google consumes it, so scope the expectation to Bing.

### 1.8 Preferred Sources exists and now covers AI Mode / AI Overviews — but it is user-opt-in

**What to do.** Know that the mechanism exists: users select sites as preferred sources, and
selected sites can carry a "preferred" badge in Top Stories, AI Mode, and AI Overviews. Site owners
cannot apply — they can only point users at the source-preferences tool via a deeplink or an on-site
CTA button.

**Why.** Source: <https://developers.google.com/search/docs/appearance/preferred-sources> — last
updated **2026-05-27**. Google's documentation changelog logs the AI Overviews/AI Mode expansion on
**2026-05-27** (<https://developers.google.com/search/updates>, **2026-07-29**).

**Applies to this site how.** Low priority, honestly. The feature is oriented toward publications
and Top Stories; a tool's docs site has neither the news cadence nor the returning-reader base that
makes an opt-in CTA pay off. Recorded so nobody re-researches it; not on the checklist.

---

## 2. Technical SEO for a static docs site

### 2.1 Structured data: what currently earns rich results

**What to do.** Only implement types that are in Google's current gallery, and only where the markup
describes content actually visible on the page.

**Why.** The current gallery lists (among others) Article, Breadcrumb, Carousel, Dataset, Discussion
forum, Event, Image metadata, Local business, Organization, Product, Profile page, Q&A, Recipe,
Review snippet, **Software app**, Speakable, Video. Source:
<https://developers.google.com/search/docs/appearance/structured-data/search-gallery> — last updated
**2026-06-15**.

Relevant specifics for this site:

- **Breadcrumb** — still supported; needs a `BreadcrumbList` with `itemListElement` of at least two
  `ListItem`s carrying `position`, `name`, and `item`.
  <https://developers.google.com/search/docs/appearance/structured-data/breadcrumb> — **2025-12-10**.
- **Article** — supported for `Article` / `NewsArticle` / `BlogPosting`, with **no required
  properties**; it is explicitly optional and helps Google understand title/image/date.
  <https://developers.google.com/search/docs/appearance/structured-data/article> — **2025-12-10**.
- **Software app** — still supported, but requires `name`, `offers.price`, _and_ either
  `aggregateRating` or `review`.
  <https://developers.google.com/search/docs/appearance/structured-data/software-app> —
  **2025-12-10**.

**Applies to this site how.** The site currently emits **no JSON-LD at all**. The defensible
addition is **BreadcrumbList** on Starlight doc pages — the sidebar hierarchy (Reference →
Transactions, Connect your agent → Claude Code) is real, visible, and maps cleanly onto the required
shape. **Do not add SoftwareApplication**: its rich result requires a rating or review, and this is
a self-published tool with no third-party ratings to point at — manufacturing one would be a
guidelines problem, not a win. Article markup is optional with no required properties and buys
nothing measurable for evergreen docs; skip it. And per §1.3, do not add schema _for AI reasons_ —
schema is for rich results, and Google says AI features don't need it.

### 2.2 FAQ and HowTo structured data are dead — do not add them, don't panic-remove them

**What to do.** Do not implement `FAQPage` or `HowTo` markup. If a site already has it, leaving it
is harmless.

**Why.** Google's documentation changelog states the FAQ rich result "will no longer appear in
Google Search starting May 7, 2026"; the remaining exception is well-known authoritative government
and health sites. HowTo rich results were dropped earlier and the documentation removed. Both are
absent from the current rich-results gallery (**2026-06-15**, cited in §2.1).
Source: <https://developers.google.com/search/updates> — page last updated **2026-07-29**.
Google's guidance on unused markup is that structured data which isn't used "does not cause problems
for Search, but also has no visible effects."

Also removed from Search Console rich-result reporting and the Rich Results Test starting January
2026: Course Info, Claim Review, Estimated Salary, Learning Video, Special Announcement, Vehicle
Listing, and practice problems — per the same changelog and
<https://developers.google.com/search/blog/2025/11/update-on-our-efforts> (**November 2025**).

**Applies to this site how.** Straightforwardly protective: if a future contributor proposes "add
FAQ schema to the Trust page for rich results," the answer is no, with a date attached. Keeping an
FAQ _section_ as prose is fine and Bing even encourages it (§1.7) — just without the markup.

### 2.3 Canonicals: set them in HTML, self-reference, absolute URLs

**What to do.** Put `rel="canonical"` in the served HTML source (not injected by JavaScript), point
it at an absolute URL, and include a self-referential canonical on the canonical page itself. Don't
mix conflicting canonicalization signals.

**Why.** "Include a `rel="canonical"` link on the canonical page itself (also known as a
self-referential canonical)"; use absolute URLs; redirects are the strongest signal, `rel=canonical`
strong, sitemap inclusion weak.
Source: <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls> —
last updated **2026-07-10**.
On JavaScript specifically: "the best way to set the canonical URL is to use HTML, but if you have
to use JavaScript, make sure that you always set the canonical URL to the same value as the original
HTML." Google's changelog logs new JS-canonicalization guidance on **2025-12-17**.
Source: <https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics>
— last updated **2026-03-04**; changelog <https://developers.google.com/search/updates> — **2026-07-29**.

**Applies to this site how.** Starlight already emits a correct self-referential absolute canonical
on doc pages (verified in the build output: `<link rel="canonical"
href="https://ynab-mcp.redlinelabs.dev/trust/"/>`). **The custom landing page at
`site/src/pages/index.astro` does not** — it has no canonical tag at all. That is the single
clearest technical gap on the site, and it sits on the most important URL. Add
`<link rel="canonical" href="https://ynab-mcp.redlinelabs.dev/" />`.

### 2.4 Titles and meta descriptions

**What to do.** Every page gets a unique, descriptive `<title>`; keep branding to one end, separated
by a delimiter; avoid boilerplate repeated across pages, avoid keyword repetition ("there's no
reason to have the same words or phrases appear multiple times"), avoid vague titles like "Home",
avoid lengths that truncate. Make one heading visually dominant so Google can tell which is the
title.

**Why.** Source: <https://developers.google.com/search/docs/appearance/title-link> — last updated
**2025-12-10**. Google lists the failure modes it rewrites titles for: incomplete titles, outdated
or inaccurate text, boilerplate, multiple equal headings, language mismatch.

For descriptions: Google generates snippets from page content and "sometimes uses the meta
description HTML element if it might give users a more accurate description of the page than content
taken directly from the page." Write unique, genuinely descriptive summaries per page; programmatic
generation is acceptable at scale; avoid keyword lists. Preview controls are `nosnippet`,
`max-snippet:[n]`, and `data-nosnippet`.
Source: <https://developers.google.com/search/docs/appearance/snippet> — last updated **2026-04-20**.

**Applies to this site how.** Starlight derives per-page `<title>` and `og:title` from frontmatter
and emits a `meta name="description"` from the page description — good. Two things to audit: (a)
that every doc page's frontmatter actually sets a `description` rather than inheriting the site-wide
one, because a site-wide description repeated across 18 pages _is_ the boilerplate case Google names;
(b) that the eight generated reference pages don't share a templated description string. The landing
page title, "ynab-mcp — connect an AI agent to your YNAB budget", is a good example of the pattern:
descriptive, branded at the front, one delimiter.

### 2.5 Sitemaps: `lastmod` is the only optional tag Google uses

**What to do.** Include `<loc>` and an accurate `<lastmod>` reflecting _significant_ content changes.
Google ignores `<priority>` and `<changefreq>` entirely. Keep files under 50 MB / 50,000 URLs, UTF-8,
absolute URLs, canonical URLs only, hosted at the site root. Reference the sitemap from robots.txt
and/or submit in Search Console.

**Why.** "Google uses the `<lastmod>` value if it's consistently and verifiably accurate";
`<priority>` and `<changefreq>` are disregarded.
Source: <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap> — last
updated **2026-07-08**.
Bing independently frames sitemaps + IndexNow as the pairing that keeps content discoverable in AI
search: <https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview>
— **2026-02-10**.

**Applies to this site how.** The build produces `sitemap-index.xml` and `sitemap-0.xml`, but the
entries are **`<loc>`-only — no `<lastmod>`**. Adding accurate `lastmod` is a small config change
(Astro's sitemap integration supports it) and is worth doing _only if_ it can be sourced from real
per-page modification data. A `lastmod` stamped with the build time on every page every deploy is
worse than none: Google's condition is "consistently and verifiably accurate," and a docs site that
redeploys on every unrelated `src/` change would be claiming every page changed. Prefer git
per-file `mtime`, or leave it out.

### 2.6 robots.txt: what it can and cannot do

**What to do.** Use robots.txt to manage crawl traffic, and to advertise your sitemap. Do **not**
use it to keep pages out of the index — "it is not a mechanism for keeping a web page out of
Google"; blocked pages can still appear, without descriptions, if linked from elsewhere. Use
`noindex` or authentication for that. Don't block resources needed for rendering.

**Why.** Source: <https://developers.google.com/search/docs/crawling-indexing/robots/intro> — last
updated **2025-12-10**. (Google migrated crawling documentation to a dedicated section on
**2025-11-20** per <https://developers.google.com/search/updates>, **2026-07-29** — worth knowing if
old bookmarks 404.)

**Applies to this site how.** There is **no `robots.txt`** in `site/public/` and none in the build
output. No robots.txt means "crawl everything," which is the correct policy here — so the gap is not
harmful, but it forfeits the free `Sitemap:` directive. Add a two-line file:

```
User-agent: *
Allow: /

Sitemap: https://ynab-mcp.redlinelabs.dev/sitemap-index.xml
```

### 2.7 AI-crawler controls: `Google-Extended` is orthogonal to Search

**What to do.** Decide separately whether to allow Gemini training/grounding use. Blocking
`Google-Extended` in robots.txt does not affect Search.

**Why.** "Google-Extended does not impact a site's inclusion in Google Search nor is it used as a
ranking signal in Google Search"; it manages whether crawled content "may be used for training
future generations of Gemini models" and for grounding in Gemini apps.
Source: <https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers> — last
updated **2026-07-14**. Google added `Google-NotebookLM` to its user-triggered fetchers list on
**2025-10-09** (<https://developers.google.com/search/updates>, **2026-07-29**).

**Applies to this site how.** For an open-source MIT tool whose goal is adoption by people using AI
agents, blocking AI crawlers is self-defeating. The recommendation is to _allow_ them — but record
the decision explicitly in the robots.txt you add (§2.6), so it reads as a choice rather than an
oversight.

### 2.8 Core Web Vitals: three metrics, unchanged thresholds, still used by ranking systems

**What to do.** Hold LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, each at the **75th percentile** of real
field page loads, segmented mobile/desktop.

**Why.**

- **Still a ranking input:** "Core Web Vitals are used by our ranking systems." Google also
  qualifies it: Search "always seeks to show the most relevant content, even if the page experience
  is sub-par," and good CWV scores don't guarantee ranking.
  Source: <https://developers.google.com/search/docs/appearance/page-experience> — last updated
  **2025-12-10**. ✅ in window.
- **LCP 2.5 s @ p75:** <https://web.dev/articles/lcp> — last updated **2025-09-04**. ✅ in window.
- **INP 200 ms @ p75, and INP is a stable Core Web Vital (FID is gone):**
  <https://web.dev/articles/inp> — last updated **2025-09-02**. ✅ in window.
- **CLS 0.1 @ p75:** the canonical article (<https://web.dev/articles/cls>) is dated **2023-04-12**,
  which is _outside_ the window. The in-window confirmation that the threshold still stands is the
  live Search Console Core Web Vitals report documentation, which defines the Good bucket as
  LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 — <https://support.google.com/webmasters/answer/9205520>
  (Search Console Help; no page-level date published, verified live 2026-08-02). Flagged rather than
  hidden: this one item rests on an undated-but-live official surface plus an in-window CrUX
  confirmation that CLS remains one of the three reported Core Web Vitals
  (<https://developer.chrome.com/docs/crux/methodology/metrics>, last updated **2025-11-18**).
- **No threshold changes in the window.** Reviewing the 2026 CrUX monthly release notes
  (<https://developer.chrome.com/docs/crux/release-notes>, entries through **July 2026**) surfaces no
  change to metric definitions, thresholds, or the metric set; the three Core Web Vitals reported
  remain LCP, INP, CLS.

**Applies to this site how.** A prerendered Astro/Starlight site on GitHub Pages with no external
fonts, no trackers, and minimal JS is close to the best case for all three. The realistic risks are
(a) CLS from images without intrinsic dimensions — the landing page already sets `width`/`height` on
its logo `<img>`, keep that discipline; (b) CLS/LCP from any future web-font addition; (c) the
Pagefind search bundle, which is loaded by Starlight — it is lazy and shouldn't affect INP, but it
is the one JS surface worth measuring. Measure with field data, not lab scores: the thresholds are
defined on p75 _field_ data.

### 2.9 JavaScript / rendering: prerendering is endorsed

**What to do.** Serve real HTML. Google endorses SSR/pre-rendering: it "is still a great idea because
it makes your website faster for users and crawlers, and not all bots can run JavaScript." Set
`<title>`, meta description, canonical, and `noindex` in the HTML source, not via JS. Note that
Google only queues pages with a **200** status for rendering, and that using JS to _remove_ a
`noindex` present in the original HTML "may not work as expected."

**Why.** Source:
<https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics> — last
updated **2026-03-04**. Related changelog entries: JS execution may not occur for non-200 responses
(**2025-12-18**); `noindex` handling in JS-rendered pages is "not well defined" (**2025-12-15**) —
<https://developers.google.com/search/updates>, **2026-07-29**.

**Applies to this site how.** Astro static output already satisfies this entirely. Record it as a
constraint to protect: if anyone proposes client-rendered docs pages or a JS-injected meta layer,
this is the citation to point at.

### 2.10 hreflang: not applicable

**What to do.** Nothing. The site is single-language (`<html lang="en">`, `og:locale` `en`), with no
regional or translated variants. hreflang annotations exist to disambiguate _between_ language or
region variants; with none, there is nothing to annotate, and adding self-referential hreflang to a
monolingual site buys nothing.

**Applies to this site how.** Explicitly out of scope. Keep `lang="en"` correct on both the Starlight
pages and the custom landing page (both currently set it). Revisit only if translations ship.

---

## 3. Content and on-page

### 3.1 Internal linking and anchor text

**What to do.** Use real `<a href>` elements — not `span`s with click handlers or framework-only
link attributes. Every important page should be linked from at least one other page on the site.
Anchor text should be "descriptive, reasonably concise, and relevant to the page that it's on and to
the page it links to" — not "click here" or "read more." Image links need descriptive `alt`. Linking
out to good external sources supports trustworthiness.

**Why.** Source: <https://developers.google.com/search/docs/crawling-indexing/links-crawlable> — last
updated **2025-12-10**.

**Applies to this site how.** Starlight's sidebar gives every page an inbound link, so orphan risk is
nil. The improvable part is _contextual_ linking and anchor quality inside prose: the reference pages
should link to the Trust page where they describe write tools, the quick start should link to
`how-it-works` on first use of jargon like "milliunits" or "toolset," and the "Full tool reference →"
style anchors on the landing page are borderline generic — "Browse the full YNAB tool reference"
carries more meaning. Also: each tool wraps one YNAB API operation "with a backlink to it" — outbound
links to official YNAB API docs are exactly the trust-supporting external linking Google describes.

### 3.2 Freshness: what actually counts

**What to do.** Update content when it materially changes, and let `lastmod` reflect _significant_
updates to main content, structured data, or links (§2.5) — not cosmetic redeploys. Don't churn
dates for their own sake.

**Why.** The sitemap guidance conditions Google's use of `lastmod` on it being "consistently and
verifiably accurate" and ties it to significant updates —
<https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>, **2026-07-08**.
On the ranking side, Google says core-update recovery is slow and content-driven: "some changes can
take effect in a few days, but it could take several months for our systems to learn and confirm
that the site as a whole is now producing helpful, reliable, people-first content" — and that it is
"continually making updates to our search algorithms, including smaller core updates… not announced
because they aren't widely noticeable," so improvements can pay off outside announced windows.
Source: <https://developers.google.com/search/docs/appearance/core-updates> — last updated
**2025-12-10**.
Bing's version is more direct about AI: maintain freshness "ensuring AI references current versions,"
and use IndexNow to signal changes —
<https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview>,
**2026-02-10**.

**Applies to this site how.** This site's freshness story is naturally strong and should be made
_visible_: the tool reference is generated from the actual tool definitions, so it is accurate by
construction on every release. Surfacing the package version and a real "last updated" on reference
pages turns an existing property into a legible signal. Avoid the anti-pattern of bumping a
displayed date on every deploy.

### 3.3 Headings and semantic HTML

**What to do.** Use semantic HTML and a clear heading structure; make one heading visually dominant
so the page's title is unambiguous. Organize content with paragraphs, sections, and headings.

**Why.** Semantic HTML and clear organization are named recommendations in Google's generative-AI
optimization guide (<https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>,
**2026-07-10**), and "multiple equal headings" is listed as a title-rewriting trigger
(<https://developers.google.com/search/docs/appearance/title-link>, **2025-12-10**).

**Applies to this site how.** Starlight enforces a single `<h1>` per doc page from frontmatter, so
doc pages are safe. The landing page is the one to check: it has one `<h1>` and then `<h2>` section
titles with `<h3>` cards — a correct hierarchy. Keep it. The `aria-label`ed `<section>`s and `<nav>`s
already in `index.astro` are the semantic-HTML posture the guide asks for.

### 3.4 Core and spam updates in the window (context, not an action)

Announced ranking updates between Aug 2025 and Aug 2026, from the official Search Status Dashboard
(<https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history>):

| Update                        | Started    | Duration  |
| ----------------------------- | ---------- | --------- |
| August 2025 spam update       | 2025-08-26 | ~26 days  |
| December 2025 core update     | 2025-12-11 | ~18 days  |
| February 2026 Discover update | 2026-02-05 | ~22 days  |
| March 2026 spam update        | 2026-03-24 | ~20 hours |
| March 2026 core update        | 2026-03-27 | ~12 days  |
| May 2026 core update          | 2026-05-21 | ~12 days  |
| June 2026 spam update         | 2026-06-24 | ~2 days   |

Useful only as a diagnostic frame: if traffic moves sharply, check whether it coincides with a dated
update before rewriting anything, and remember Google's own guidance that unannounced smaller core
updates run continuously (§3.2).

---

## 4. Measurement

**What to do.** Verify the property in **Google Search Console** and use the Generative AI
performance report to see how content performs in AI experiences; verify in **Bing Webmaster Tools**
for the AI Performance report (Copilot/Bing citations, grounding queries, page-level citation
activity). Measure Core Web Vitals on _field_ data.

**Why.** Google introduced Search Generative AI performance reports in Search Console —
<https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports>, **June 2026**; the
AI optimization guide directs owners to monitor via that report (**2026-07-10**). Bing's AI
Performance report — <https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview>,
**2026-02-10**, expanded **June 2026**.

**Applies to this site how.** Verification on GitHub Pages with a custom domain is a DNS TXT record
(Search Console domain property) or a static HTML file dropped in `site/public/` — both trivial.
Without verification, everything above is unmeasurable, which is why it sits high on the checklist.

---

## 5. Site-state audit (as of 2026-08-02, from the repo)

Verified directly against `site/` and its build output, not assumed:

| Item                                         | State                                                                    | Ref   |
| -------------------------------------------- | ------------------------------------------------------------------------ | ----- |
| Static prerendered HTML                      | ✅ Astro static output                                                   | §2.9  |
| `<html lang="en">`                           | ✅ both Starlight and landing page                                       | §2.10 |
| Canonical on doc pages                       | ✅ self-referential absolute                                             | §2.3  |
| **Canonical on landing page**                | ❌ **absent**                                                            | §2.3  |
| Per-page `<title>` + meta description        | ✅ Starlight; ⚠️ audit for boilerplate                                   | §2.4  |
| Open Graph on doc pages                      | ✅ title/type/url/locale/description/site_name                           | §5.1  |
| Open Graph on landing page                   | ⚠️ no `og:site_name`, no `og:image`                                      | §5.1  |
| `og:image` / `twitter:image` anywhere        | ❌ absent (`twitter:card` is set to `summary_large_image` with no image) | §5.1  |
| Sitemap generated                            | ✅ `sitemap-index.xml` + `sitemap-0.xml`                                 | §2.5  |
| `<lastmod>` in sitemap                       | ❌ absent                                                                | §2.5  |
| `robots.txt`                                 | ❌ absent                                                                | §2.6  |
| Structured data (JSON-LD)                    | ❌ none                                                                  | §2.1  |
| `llms.txt`                                   | present — no SEO value, keep only on the agent-audience rationale        | §1.2  |
| Search Console / Bing Webmaster verification | ❌ no verification file or DNS record in repo                            | §4    |

### 5.1 A note on Open Graph, flagged honestly

Open Graph tags are **not** a Google Search ranking or appearance signal. Google's documented inputs
for titles and snippets are the `<title>` element, page content, meta description, and structured
data (§2.4). OG governs how links unfurl in social apps, chat clients, and Slack/Discord — which is
where a developer tool actually gets shared.

I am including this **outside the evidence bar** and labelling it as such: the Open Graph protocol
spec (<https://ogp.me/>) carries no publication date and no in-window restatement, so it fails the
12-month rule. It is here as _distribution hygiene_, not as a substantiated SEO practice, and it is
kept off the top-10 for that reason — with one exception: `twitter:card` is currently set to
`summary_large_image` with **no image to render**, which is a self-inflicted broken state worth
fixing either by adding an image or removing the card declaration.

---

## 6. Deliberately excluded

Things I looked into and cut. This list is deliberately as detailed as the inclusions, because
knowing what _not_ to do is most of the value here.

1. **`llms.txt` as an SEO or AI-visibility tactic.** Fails on primary evidence pointing the _other_
   way: Google explicitly says Search doesn't use it (§1.2). Included only as an honest
   status report and a "don't invest here" note.
2. **`llms-full.txt`, per-page `.md` mirrors, and Markdown-first serving for LLMs.** No primary
   source from any search engine or AI provider committing to consume them. Same disclaimer as
   llms.txt applies.
3. **"GEO"/"AEO" tactics generally** — entity stacking, answer-first paragraph templates, "chunking"
   pages for retrieval, question-shaped H2 fanning. Google names chunking and machine-targeted
   rewriting as unnecessary in the AI optimization guide (§1.3). Third-party GEO studies exist but
   are secondary and cannot carry a claim alone.
4. **Brand-mention / citation-building campaigns.** Google: "Seeking inauthentic 'mentions' across
   the web isn't as helpful as it might seem" (§1.3).
5. **FAQPage and HowTo structured data.** Both retired as rich results; FAQ gone from Google Search
   for non-government/health sites as of 2026-05-07 (§2.2).
6. **SoftwareApplication structured data for this site.** Supported in the abstract, but its rich
   result requires `aggregateRating` or `review` — there are no genuine third-party ratings, and
   self-supplied ones would be a structured-data guidelines problem. Excluded on applicability, not
   on evidence.
7. **Article / BlogPosting structured data here.** Supported and optional with no required
   properties, so it can't be called wrong — but it delivers no documented benefit for evergreen
   tool documentation, so it's excluded as unjustified work rather than as unsubstantiated.
8. **Keyword density, LSI keywords, TF-IDF targets, word-count minimums, "optimal" title/description
   character counts.** No primary source states any numeric target. Google's own title guidance is
   qualitative (descriptive, concise, unique, no repetition) and explicitly warns against repeating
   words. The familiar "50–60 char titles / 155–160 char descriptions" numbers come from SERP pixel
   measurement by third parties, not from Google.
9. **Domain authority / page authority / any vendor authority score.** Vendor metrics, not Google
   signals; no primary source.
10. **Link building as a practice.** Google's in-window links documentation covers crawlable links
    and anchor text; I found no in-window primary guidance endorsing outreach or acquisition tactics,
    and link schemes are a spam-policy violation. Excluded rather than guessed at.
11. **Specific INP/LCP/CLS threshold _changes_ in the window.** Checked the 2026 CrUX release notes
    month by month; there were none. Reporting "no change" is the substantiated finding; I did not
    manufacture an update.
12. **FID (First Input Delay).** Retired; INP is the stable responsiveness Core Web Vital
    (<https://web.dev/articles/inp>, **2025-09-02**). Any advice still referencing FID is stale.
13. **AMP.** Google simplified/removed AMP viewer and cache documentation on **2026-07-01**
    (<https://developers.google.com/search/updates>, **2026-07-29**). Irrelevant to a static docs
    site and shrinking as a surface.
14. **hreflang.** Not applicable — single-language site (§2.10).
15. **IndexNow as a _Google_ tactic.** Substantiated for Bing/Copilot only (§1.7); I found no
    in-window Google statement that Google consumes IndexNow, so the recommendation is scoped to
    Bing and not claimed for Google.
16. **Open Graph as an SEO practice.** Real for link unfurls, but the spec is undated and there is no
    in-window primary source making it a search practice — flagged and quarantined in §5.1 rather
    than laundered into the checklist.
17. **Preferred Sources as an action item.** Substantiated and in-window (§1.8), but it is user-opt-in
    and oriented toward publications; documented for completeness, excluded from the checklist as
    not worth the effort for this site.
18. **`nofollow` on outbound links, and `noopener` as an SEO measure.** `nofollow` is for distrusted
    or paid links only per the in-window links doc; applying it broadly is not advised. `noopener`
    (present on this site's external links) is a security/performance attribute with no SEO effect —
    keep it, but not for SEO reasons.
19. **"Publish frequently for freshness."** No primary source endorses cadence for its own sake; the
    substantiated version is accurate `lastmod` on significant changes (§3.2).
20. **Social signals, engagement metrics, bounce rate, and "dwell time" as ranking factors.** No
    primary source in or near the window; excluded entirely.

---

## 7. Prioritized top-10 checklist for `ynab-mcp.redlinelabs.dev`

Ordered by (evidence strength × impact) ÷ effort. Items 1–4 are the ones I'd do today.

1. **Add a self-referential canonical to the custom landing page.** `site/src/pages/index.astro` has
   no `<link rel="canonical">`; every Starlight page does. Add
   `<link rel="canonical" href="https://ynab-mcp.redlinelabs.dev/" />`. Highest-value gap because it
   is on the site's most important URL, and Google's canonicalization guidance is unambiguous that
   the canonical belongs in the HTML source with an absolute URL.
   (<https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls>, 2026-07-10)

2. **Add `site/public/robots.txt` with an explicit allow and a `Sitemap:` line.** There is currently
   no robots.txt at all. Point it at `https://ynab-mcp.redlinelabs.dev/sitemap-index.xml`, and
   deliberately _allow_ AI crawlers including `Google-Extended` — blocking it has no Search effect
   and would only cut this project off from the AI-agent audience it exists to serve.
   (<https://developers.google.com/search/docs/crawling-indexing/robots/intro>, 2025-12-10;
   <https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers>, 2026-07-14)

3. **Verify the property in Google Search Console and Bing Webmaster Tools.** Nothing else on this
   list is measurable without it, and both now ship AI-citation reporting: Google's Generative AI
   performance report and Bing's AI Performance report. On GitHub Pages this is a DNS TXT record or
   a file in `site/public/`.
   (<https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports>, June 2026;
   <https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview>, 2026-02-10)

4. **Audit per-page meta descriptions for boilerplate.** Confirm every doc page — especially the
   eight generated reference pages — sets its own frontmatter `description` rather than repeating a
   templated or site-wide string. Repeated boilerplate is one of the failure modes Google names for
   rewriting titles and ignoring descriptions.
   (<https://developers.google.com/search/docs/appearance/title-link>, 2025-12-10;
   <https://developers.google.com/search/docs/appearance/snippet>, 2026-04-20)

5. **Add `<lastmod>` to the sitemap — but only from real per-file modification data.** Google uses
   `lastmod` only when it is "consistently and verifiably accurate," and ignores `priority` and
   `changefreq` entirely. If accurate per-page dates can't be sourced (git mtime rather than build
   time), skip this item rather than stamping every page on every deploy.
   (<https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>, 2026-07-08)

6. **Add BreadcrumbList JSON-LD to Starlight doc pages — and nothing else.** The sidebar hierarchy is
   real and visible, and breadcrumb is one of the currently supported rich results. Explicitly do
   _not_ add FAQPage, HowTo, or SoftwareApplication (see items in §6).
   (<https://developers.google.com/search/docs/appearance/structured-data/breadcrumb>, 2025-12-10;
   gallery <https://developers.google.com/search/docs/appearance/structured-data/search-gallery>, 2026-06-15)

7. **Fix the broken `twitter:card` state: add an `og:image`/`twitter:image`, or drop the card.**
   Starlight declares `summary_large_image` with no image to render. Flagged as distribution hygiene,
   not SEO — Open Graph is not a Google signal, and this item is scoped accordingly (§5.1).

8. **Strengthen contextual internal links and anchor text.** Link reference pages to `/trust/` where
   they describe write tools, link first uses of "milliunits"/"toolset" to `/how-it-works/`, and
   replace generic anchors like "Full tool reference →" with descriptive ones. Keep the outbound
   links to the official YNAB API docs — external linking to good sources supports trustworthiness.
   (<https://developers.google.com/search/docs/crawling-indexing/links-crawlable>, 2025-12-10)

9. **Double down on the non-commodity content this project uniquely owns, and add none of the
   generic kind.** The bank-linking impossibility, the 200 req/hr limit, milliunits, and the
   OAuth-vs-PAT storage story are experience-derived and code-verified. Do not add "what is MCP" or
   "what is budgeting" pages, do not fan the 8 toolset reference pages into 46 per-tool pages, and do
   not rewrite anything into question-shaped chunks for AI.
   (<https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>, 2026-07-10;
   <https://developers.google.com/search/docs/essentials/spam-policies>, 2026-05-15)

10. **Protect the Core Web Vitals position you already have, and measure it on field data.** Targets:
    LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75. The static, font-free, tracker-free build is
    already near best-case — so this is a guardrail, not a project: keep intrinsic `width`/`height`
    on images, don't add web fonts or third-party scripts, and watch the Pagefind search bundle as
    the only meaningful JS surface.
    (<https://developers.google.com/search/docs/appearance/page-experience>, 2025-12-10;
    <https://web.dev/articles/lcp>, 2025-09-04; <https://web.dev/articles/inp>, 2025-09-02)

---

## 8. Source index

Primary — Google Search Central:

- AI features and your website — <https://developers.google.com/search/docs/appearance/ai-features> (2025-12-10)
- Optimizing for generative AI features — <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide> (2026-07-10)
- Creating helpful, people-first content (E-E-A-T) — <https://developers.google.com/search/docs/fundamentals/creating-helpful-content> (2025-12-10)
- Spam policies — <https://developers.google.com/search/docs/essentials/spam-policies> (2026-05-15)
- Page experience — <https://developers.google.com/search/docs/appearance/page-experience> (2025-12-10)
- Core updates — <https://developers.google.com/search/docs/appearance/core-updates> (2025-12-10)
- Title links — <https://developers.google.com/search/docs/appearance/title-link> (2025-12-10)
- Snippets & meta descriptions — <https://developers.google.com/search/docs/appearance/snippet> (2026-04-20)
- Canonicalization — <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls> (2026-07-10)
- Build a sitemap — <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap> (2026-07-08)
- robots.txt intro — <https://developers.google.com/search/docs/crawling-indexing/robots/intro> (2025-12-10)
- Google crawlers & Google-Extended — <https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers> (2026-07-14)
- Crawlable links & anchor text — <https://developers.google.com/search/docs/crawling-indexing/links-crawlable> (2025-12-10)
- JavaScript SEO basics — <https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics> (2026-03-04)
- Rich results gallery — <https://developers.google.com/search/docs/appearance/structured-data/search-gallery> (2026-06-15)
- Breadcrumb — <https://developers.google.com/search/docs/appearance/structured-data/breadcrumb> (2025-12-10)
- Article — <https://developers.google.com/search/docs/appearance/structured-data/article> (2025-12-10)
- Software app — <https://developers.google.com/search/docs/appearance/structured-data/software-app> (2025-12-10)
- Preferred sources — <https://developers.google.com/search/docs/appearance/preferred-sources> (2026-05-27)
- Documentation changelog — <https://developers.google.com/search/updates> (page last updated 2026-07-29)
- Simplifying the search results page, update — <https://developers.google.com/search/blog/2025/11/update-on-our-efforts> (Nov 2025)
- Generative AI performance reports in Search Console — <https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports> (Jun 2026)
- Search Status Dashboard, ranking updates history — <https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history>
- Core Web Vitals report (Search Console Help) — <https://support.google.com/webmasters/answer/9205520> (undated; verified live 2026-08-02)

Primary — Google performance docs:

- LCP — <https://web.dev/articles/lcp> (2025-09-04)
- INP — <https://web.dev/articles/inp> (2025-09-02)
- CrUX metrics methodology — <https://developer.chrome.com/docs/crux/methodology/metrics> (2025-11-18)
- CrUX release notes — <https://developer.chrome.com/docs/crux/release-notes> (through Jul 2026)
- CLS — <https://web.dev/articles/cls> (2023-04-12) ⚠️ _outside the window; used only alongside the
  in-window confirmations above_

Primary — Microsoft/Bing:

- AI Performance in Bing Webmaster Tools — <https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview> (2026-02-10)
- New AI visibility insights — <https://blogs.bing.com/search/June-2026/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare> (Jun 2026)

Secondary — supporting only, never load-bearing:

- Ahrefs, llms.txt request analysis across 137,210 domains — <https://ahrefs.com/blog/llmstxt-study/>
