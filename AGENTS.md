# AGENTS.md

## Project overview

LazyPi is a reusable Pi extension-manager template. It provides a catalog of Pi extensions and a Node CLI that installs, updates, checks, and removes them.

Customize the template in two places:

1. Change `name` in `package.json` to the package you will publish.
2. Replace `PACKAGES` in `bin/lazypi.mjs` with your extension catalog.

The CLI reads the package name from `package.json`, so help and error messages do not need a second package-name edit.

## Catalog conventions
Supported categories are derived automatically from the `category` values in `PACKAGES`.
`PACKAGES` is the source of truth for the distributed extension catalog; no separate category list needs editing.

Each entry has an `id`, `category`, `description`, and `hint`. Extension entries also declare a `source` (npm or Git Pi install source); file-based entries declare `themeFiles` and/or `agentFiles` instead. Optional `dependencies`, `loadBefore`, and `postInstall` fields express catalog relationships and selected-install configuration. Keep entries ordered by category and use the repository's existing formatting.
Catalog load-order metadata is applied to existing settings without discarding unrelated packages or fields. A timestamped backup is created before a settings file is rewritten.

Selected-package `postInstall` JSON merges run only when their required package ids are selected in the same LazyPi install invocation. They preserve unrelated configuration and create a timestamped backup before changing an existing file.

File-based catalog entries ship JSON files installed into Pi's agent directory: `themes` entries copy from `themes/` into the agent themes directory; `config` entries with `agentFiles` (for example `agent/AGENTS.md`) copy to the agent root. An existing file is backed up with a timestamped `.lazypi.<timestamp>.bak` before being overwritten; identical files are skipped. These installs never modify settings such as `settings.theme`.

## Settings boundaries

Global Pi settings are read from `~/.pi/agent/settings.json`, or from `PI_CODING_AGENT_DIR` when set. `--local` uses `.pi/settings.json` in the current working directory.

Do not replace a user's settings file wholesale. Preserve unrelated package entries and settings fields. Keep global and local paths independent.

## CLI commands

- `install` installs the selected catalog extensions, syncs file-based entries (themes and agent config files), and repairs declared package order.
- `status` reports installed, missing, and extra Pi extensions.
- `update` delegates to Pi's overall update command; it does not select one extension.
- `doctor` checks Node, npm, git, Pi, settings, catalog order, and auth.
- `remove` removes a catalog id or raw Pi source.

Use `pi update <source>` when updating one extension directly.

## Testing

Run the local suite with:

```bash
npm ci
npm test
node scripts/packed-cli-smoke.mjs
```

The packed smoke test must continue to execute the published-style npm artifact, not only the source file.

## Git guidance

Use Conventional Commits, for example:

- `feat: add extension to catalog`
- `fix: preserve custom Pi settings`
- `docs: update CLI usage`
