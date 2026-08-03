# Changelog

## [0.2.1](https://github.com/redlinelabs-dev/ynab-mcp/compare/ynab-mcp-v0.2.0...ynab-mcp-v0.2.1) (2026-08-03)


### Features

* **site:** implement substantiated SEO practices from the research playbook ([a75d40e](https://github.com/redlinelabs-dev/ynab-mcp/commit/a75d40eb345b5f28bf18b01046e7d41dbf3ba2b0))
* **skills:** add /seo project skill wrapping the research playbook ([5705d14](https://github.com/redlinelabs-dev/ynab-mcp/commit/5705d1458726e3e98b2257192794934b91d153b6))


### Documentation

* **adr:** amend ADR-0005 — OAuth becomes the preferred connection method ([3d3c70e](https://github.com/redlinelabs-dev/ynab-mcp/commit/3d3c70e5c3511a5aa10b81f99bf2ea20ee9d7aaa))
* **research:** current substantiated SEO practices (Aug 2025–Aug 2026) ([f86c172](https://github.com/redlinelabs-dev/ynab-mcp/commit/f86c172a367b4e4456b2c982451525d75d797201))
* **site:** add YNAB's required non-affiliation disclaimer verbatim ([d1fa9e7](https://github.com/redlinelabs-dev/ynab-mcp/commit/d1fa9e7d810c808dae79a42fc96cca4b9c100c7e))
* **site:** make OAuth the preferred connection method ([292a0fc](https://github.com/redlinelabs-dev/ynab-mcp/commit/292a0fc099f1ba3b631205decd9a70355d86bf6e))

## [0.2.0](https://github.com/redlinelabs-dev/ynab-mcp/compare/ynab-mcp-v0.1.0...ynab-mcp-v0.2.0) (2026-08-02)


### ⚠ BREAKING CHANGES

* self-hosted Node + Docker OAuth MCP server (replaces Cloudflare Workers)

### Features

* budget-automation tools across all three roadmap phases ([c07b40a](https://github.com/redlinelabs-dev/ynab-mcp/commit/c07b40a16dd9f6faf93d106928cd0526e1baf464))
* cloudflare workers bootstrap and OAuth config foundation ([7bdc592](https://github.com/redlinelabs-dev/ynab-mcp/commit/7bdc592a8ab0a6975aa9462234bf23f1eae56bc4))
* cloudflare workers OAuth flow and token lifecycle ([7b087fc](https://github.com/redlinelabs-dev/ynab-mcp/commit/7b087fc37d60b8398d9969d4127d7d8b77048a58))
* demo mode — YNAB_DEMO=1 serves a fictional budget, no credentials ([136f73b](https://github.com/redlinelabs-dev/ynab-mcp/commit/136f73b43a7505ac5b73676052732a28b04f1fe1))
* expand YNAB API coverage ([120ba23](https://github.com/redlinelabs-dev/ynab-mcp/commit/120ba2304dd7544d3fbd9b86374504dbd281be8c))
* publish @redlinelabs/ynab-mcp to npm under MIT (ADR-0005) ([3284f46](https://github.com/redlinelabs-dev/ynab-mcp/commit/3284f46bc6ecf68e2b4b89df0e039571eb257f6a))
* publish GHCR image; Tailscale-sidecar compose as the preferred deploy ([8d6b7fa](https://github.com/redlinelabs-dev/ynab-mcp/commit/8d6b7fadebf21c166a29d29f44eb69876f82f21e))
* scaffold YNAB MCP server ([f7fb69b](https://github.com/redlinelabs-dev/ynab-mcp/commit/f7fb69b1bc6b5d816bd030ae1d382ed227563ce2))
* scheduled transaction CRUD tools (get, create, update, delete) ([ab4d9c5](https://github.com/redlinelabs-dev/ynab-mcp/commit/ab4d9c57ebea25d7a6bb6c1bce2f63f39011faff))
* self-hosted Node + Docker OAuth MCP server (replaces Cloudflare Workers) ([5729cc3](https://github.com/redlinelabs-dev/ynab-mcp/commit/5729cc3750ac8e38f20eba803b5135bc4822460d))
* **server:** opt-in PAT pass-through for /mcp (header auth) ([7b3fb00](https://github.com/redlinelabs-dev/ynab-mcp/commit/7b3fb0088f6b2c559ce6a72cb7842ed3d12a447c))
* **site:** public docs site at ynab-mcp.redlinelabs.dev ([931e10c](https://github.com/redlinelabs-dev/ynab-mcp/commit/931e10c36e5aa89d9178e0f34308cac56823dba8))
* **tools:** broaden to ~full YNAB API coverage (40 tools) ([4b5f6a9](https://github.com/redlinelabs-dev/ynab-mcp/commit/4b5f6a9b386370d747618547f5c82de64ef54e9a))
* **transactions:** support split transactions on create_transaction ([6154b7b](https://github.com/redlinelabs-dev/ynab-mcp/commit/6154b7bb6d430982b35bcf0629389f28c4dc71a9))
* ynab authorization code exchange ([3c535fb](https://github.com/redlinelabs-dev/ynab-mcp/commit/3c535fb6ad8f6e705fd56929c33ce3d4a27857f7))


### Bug Fixes

* **compose:** forward YNAB_PAT_PASSTHROUGH / YNAB_READ_ONLY to the container ([a5c7f0f](https://github.com/redlinelabs-dev/ynab-mcp/commit/a5c7f0ff1ea5af3478d4532989729d51ac6735fb))
* **deploy:** keep bind-mounts, add PUID/PGID, document data-dir ownership ([45195e2](https://github.com/redlinelabs-dev/ynab-mcp/commit/45195e2464fcc97c5d53880c782f29a7ed10f610))
* harden OAuth cookie integrity and remove CSRF scope elevation ([30f1ba3](https://github.com/redlinelabs-dev/ynab-mcp/commit/30f1ba3c84ee8c41ba4c1bd56ffdecd27dfe5e87))
* **oauth:** non-rotating refresh tokens + single YNAB refresh site ([4351064](https://github.com/redlinelabs-dev/ynab-mcp/commit/4351064dbaf71adde9eaac3858f8ce2019a8bcc9))
* **server:** advertise /mcp as the OAuth protected resource (RFC 9728) ([82b187b](https://github.com/redlinelabs-dev/ynab-mcp/commit/82b187bdfff1087e04a2d7e4d9959eca523e0208))
* **server:** return json body on /mcp + add request logging (proxy timeout) ([1f401d4](https://github.com/redlinelabs-dev/ynab-mcp/commit/1f401d4e1249896e849446e95fb6be965374e5f4))
* **server:** trust loopback proxy so express-rate-limit reads client IP ([1f3e338](https://github.com/redlinelabs-dev/ynab-mcp/commit/1f3e33864efbba5838bb2c2d9a17805cc5c2cd82))
* skip install scripts in Docker prod-deps stage ([20382fc](https://github.com/redlinelabs-dev/ynab-mcp/commit/20382fcf5d785c0145c7510e6ad72e74c2441e63))


### Refactoring

* extract parseScope and kvStorage into worker-helpers module ([9de7914](https://github.com/redlinelabs-dev/ynab-mcp/commit/9de79140ed92999aa7f57582a45779cddc3011bd))


### Documentation

* add agent skills config (issue tracker, domain docs) ([3856083](https://github.com/redlinelabs-dev/ynab-mcp/commit/38560833d249e10a11086d58dcdf85e4a46e7bba))
* add roadmap mapping budget-automation vision to tools ([26f1cef](https://github.com/redlinelabs-dev/ynab-mcp/commit/26f1cef8690d6ec1006a49d2fb4fdea2bfcf5d09))
* clarify GHCR private-package fix (make public or sudo docker login) ([86b530e](https://github.com/redlinelabs-dev/ynab-mcp/commit/86b530ea71ff0cf38efb72511eadcf81e8592096))
* how to connect remote clients (Claude Code/Desktop) to the deployed server ([8377dd5](https://github.com/redlinelabs-dev/ynab-mcp/commit/8377dd5a0b8401d154bdaea7f489926b08666fec))
* record ADRs, glossary, and remote-OAuth direction ([5cb7ac2](https://github.com/redlinelabs-dev/ynab-mcp/commit/5cb7ac2b7324f8f9f7c2f48f0e175f6a6001558a))


### Miscellaneous

* ignore .atrium/ and .mcp.json local agent artifacts ([4b607a0](https://github.com/redlinelabs-dev/ynab-mcp/commit/4b607a0c76b82fc5be9ea6d815d9ab20cdf19a38))

## Changelog
