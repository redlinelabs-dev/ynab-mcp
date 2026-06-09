# Contributing

## Development

```bash
npm install
npm run dev       # watch mode
npm run check     # typecheck + lint + format check
npm run build     # production build
npm run fix       # auto-fix lint + format issues
```

## Commits

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/). This is enforced by a git hook via commitlint.

```
feat: add tool for listing scheduled transactions
fix: handle null payee_name in transaction formatter
refactor: extract HTTP helpers
docs: update setup instructions
chore: bump dependencies
```

Breaking changes use `!` after the type:

```
feat!: rename list_txns tool to list_transactions
```

## How releases work

Releases are fully automated. You never manually bump versions or edit the changelog.

1. **You merge PRs to `main`** with conventional commit messages.
2. **release-please** (GitHub Action) reads those commits and opens a "Release PR" that bumps the version in `package.json` and updates `CHANGELOG.md`.
3. **You merge the Release PR.** That's the only manual step.
4. **The publish workflow** triggers automatically: it runs checks, builds, and publishes to npm as `@redlinelabs/ynab-mcp`.

## Versioning

This project uses [0ver](https://0ver.org/). The major version stays at `0` permanently.

- `fix:` / `perf:` -> patch bump (0.1.0 -> 0.1.1)
- `feat:` -> patch bump (0.1.0 -> 0.1.1)
- `feat!:` / breaking change -> minor bump (0.1.1 -> 0.2.0)
