# LazyPi

LazyPi is a small, opinionated Pi extension-manager template. It installs a catalog of Pi extensions, tracks what is installed in Pi settings, and provides status, update, doctor, and remove commands.

Customize two things before publishing:

1. Change `name` in `package.json` to your package, for example `@moguw/lazypi`.
2. Replace the `PACKAGES` array in `bin/lazypi.mjs` with your catalog.

The CLI reads its package name from `package.json`, so help and error messages update automatically. Catalog dependencies, load-order constraints, and selected-package post-install configuration also live on catalog entries; no third registry is required.

## Quick start

```bash
npx @moguw/lazypi
```

Use `--yes` for a non-interactive install:

```bash
npx @moguw/lazypi --yes
```

LazyPi installs Pi if it is not already available, then installs the selected catalog extensions. Re-running the command is idempotent: extensions already present in Pi settings are skipped.

## Commands

| Command | What it does |
| --- | --- |
| `npx @moguw/lazypi` | Install the catalog, using the interactive picker on a TTY |
| `npx @moguw/lazypi install --only core` | Install only selected categories or extension ids |
| `npx @moguw/lazypi status` | Show installed, missing, and extra Pi extensions |
| `npx @moguw/lazypi update` | Run the overall Pi extension update |
| `npx @moguw/lazypi doctor` | Check Node, npm, git, Pi, settings, and auth |
| `npx @moguw/lazypi remove <id>` | Remove a catalog extension by id |

`update --only` does not update a single extension. To update one Pi extension, use Pi directly:

```bash
pi update npm:your-package
```

## Install options

```bash
npx @moguw/lazypi --only core
npx @moguw/lazypi --only subagents,mcp
npx @moguw/lazypi --except tools
npx @moguw/lazypi --local
npx @moguw/lazypi --yes
```

Global settings are read from `~/.pi/agent/settings.json`, or from the directory specified by `PI_CODING_AGENT_DIR`. `--local` uses `.pi/settings.json` in the current project.

When catalog metadata declares `loadBefore`, install repairs existing settings order and creates a timestamped `.bak` file. This keeps extensions that depend on load order working after the template catalog changes.

When a selected package declares `postInstall`, LazyPi runs that JSON merge only when all of its `requiresSelected` package ids are selected in the same install invocation. It preserves unrelated configuration and creates a timestamped backup when an existing file changes.

File-based catalog entries ship JSON files that LazyPi installs into Pi's agent directory. `themes` entries copy files from `themes/` into the agent themes directory; entries with `agentFiles` (for example the `config`-category `global-agents` entry) copy files from `agent/` to the agent root (`~/.pi/agent/AGENTS.md`). An existing file with the same name is backed up with a timestamped `.lazypi.<timestamp>.bak` before it is overwritten; identical files are skipped. These installs never modify settings such as `settings.theme` — activate a theme by setting it there yourself. `--local` does not relocate file-based entries; they are always installed agent-globally.
The only catalog source of truth is `PACKAGES` in [`bin/lazypi.mjs`](bin/lazypi.mjs). Each entry has:

- `id` — selector used by `--only`, `--except`, and `remove`
- `category` — any category used by your catalog; the CLI derives the category list automatically
- `source` — an npm or Git Pi install source (required for extension entries; file-based entries use `themeFiles`/`agentFiles` instead)
- `description` — short picker text
- `hint` — post-install guidance
- `dependencies` — optional package ids automatically selected with this package
- `loadBefore` — optional package ids that this package must load before
- `postInstall` — optional selected-package JSON merge rules run after a matching install
- `themeFiles` — optional theme JSON files (relative to this repo) that a `themes` entry copies into Pi's themes directory
- `agentFiles` — optional agent config files (relative to this repo) copied to the Pi agent root (for example `agent/AGENTS.md`)
Replace the complete `PACKAGES` array with your own entries. Keep dependency, load-order, and selected-package post-install relationships in the entries themselves so the catalog remains the only extension list to maintain.

## Development

Requirements:

- Node.js 20 or newer
- npm
- Pi for integration and install-flow checks

Install dependencies and run the tests:

```bash
npm ci
npm test
node scripts/packed-cli-smoke.mjs
```

The packed smoke test verifies that the npm artifact exposes the `lazypi` binary and that `npx`-style execution can invoke it.

## Publishing

After changing `package.json` and `PACKAGES`, verify the packed artifact:

```bash
npm pack --dry-run
npm publish --access public --provenance
```

The repository uses Release Please for versioning and GitHub Actions for publishing.
