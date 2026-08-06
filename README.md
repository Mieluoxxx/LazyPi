# LazyPi

LazyPi is a reusable Pi extension-manager template. One repository holds a curated `PACKAGES` catalog and an `npx` CLI that installs, audits, updates, and removes Pi extensions from that catalog.

The catalog is the only extension list you maintain. It lives in `PACKAGES` inside [`bin/lazypi.mjs`](bin/lazypi.mjs), and every CLI command — help, picker, install, status, doctor, remove — derives from it automatically.

Fork it, replace the catalog with your own Pi extensions, publish under your npm name, and you have a personal extension manager you can hand to any machine with `npx`.

## Use this catalog

The published package is `@moguw/lazypi`. You do not need to clone anything to use it:

```bash
npx @moguw/lazypi               # install the whole catalog (interactive picker on a TTY)
npx @moguw/lazypi --yes         # same, no prompts
npx @moguw/lazypi status        # installed / missing / extra extensions
npx @moguw/lazypi doctor        # check Node, npm, git, Pi, settings, catalog, auth
npx @moguw/lazypi update        # run Pi's overall extension update
npx @moguw/lazypi remove <id>   # remove a catalog extension by id
```

LazyPi installs Pi itself if it is not already on PATH, then installs the selected catalog extensions. Re-running is idempotent: extensions already present in Pi settings are skipped.

Select what gets installed:

```bash
npx @moguw/lazypi --only core              # only a category
npx @moguw/lazypi --only subagents,mcp     # only specific extension ids
npx @moguw/lazypi --except tools           # everything but a category
npx @moguw/lazypi --local                  # install into .pi/settings.json of the current project
```

`update` does not update a single extension — for that use Pi directly: `pi update <source>`.

## Build your own LazyPi

### 1. Fork and clone

Fork the repository on GitHub, then:

```bash
git clone git@github.com:<your-user>/LazyPi.git
cd LazyPi
npm ci
```

### 2. Rename the npm package

The CLI reads its package name from `package.json`, so help and error messages pick it up with no second edit. Keep the name in `package-lock.json` in sync too:

```bash
npm pkg set name=@<your-npm-user>/lazypi
npm install --package-lock-only
```

### 3. Replace the catalog

`PACKAGES` in `bin/lazypi.mjs` is the source of truth. Each extension entry looks like this:

```js
{
  id: "subagents",
  category: "tools",
  source: "npm:pi-subagents",
  description: "Sub-agent execution",
  hint: "Run isolated sub-agents for parallel work.",
}
```

| Field | Meaning |
| --- | --- |
| `id` | Selector used by `--only`, `--except`, and `remove` |
| `category` | Any category you like; the CLI derives the category list automatically, nothing to register elsewhere |
| `source` | A Pi install source — `npm:<package>` or `git:...` |
| `description` | Short text shown in the picker |
| `hint` | Post-install guidance shown by `status` and the install cheatsheet |

Categories are derived automatically from the `category` values, so adding a new one never requires a separate list edit. Keep entries grouped by category and ordered like the existing ones.

#### Advanced fields

- `dependencies: ["other-id"]` — package ids automatically selected whenever this package is selected.
- `loadBefore: ["other-id"]` — packages this one must load before; `install` repairs the package order in existing settings to match.
- `postInstall: [{ requiresSelected: ["other-id"], jsonMerge: { path: "extensions/.../config.json", value: { ... } } }]` — a JSON merge applied after install, but only when every id in `requiresSelected` is selected in the same invocation. Unrelated configuration is preserved.
- File-based entries replace `source` with `themeFiles` and/or `agentFiles`:
  - `themes` category — `themeFiles: ["themes/your-theme.json"]` copies the file into Pi's agent themes directory.
  - `config` category — `agentFiles: ["agent/AGENTS.md"]` copies the file to the agent root (for example `~/.pi/agent/AGENTS.md`).

### 4. Test before publishing

```bash
npm test
node scripts/packed-cli-smoke.mjs
npm pack --dry-run
```

For a real install check in an isolated, throwaway agent directory, use a temporary `PI_CODING_AGENT_DIR`:

```bash
test_dir="$(mktemp -d)"
PI_CODING_AGENT_DIR="$test_dir" node bin/lazypi.mjs --yes
PI_CODING_AGENT_DIR="$test_dir" node bin/lazypi.mjs status
rm -rf "$test_dir"
```

Do not rely on `--local` for full isolation: theme and agent-file entries are always installed agent-globally, so `--local` only redirects the settings write.

### 5. Publish

The first release is a manual npm publish. Scoped packages default to private, so publish with public access unless your npm account supports private packages:

```bash
npm publish --access public
```

After that, the repository's Release Please workflow ([`.github/workflows/release-please.yml`](.github/workflows/release-please.yml)) takes over: conventional commits on your default branch open release PRs, and npm trusted publishing handles authentication with `--provenance`.

**Fork owners:** check the branch filters in `.github/workflows/test.yml` and `.github/workflows/release-please.yml`. This repository's default branch is `main`, but those workflows currently trigger on `master` — update them to your own default branch, or CI will never run.

## Maintain the catalog

A normal maintenance pass looks like this:

1. Run `pi list` and compare the installed sources against `PACKAGES`.
2. Add entries only for extensions you actually use; remove entries you no longer want installed.
3. For a new file-based entry, drop the file under `themes/` or `agent/` and reference it from the entry.
4. Run `npm test` and `node scripts/packed-cli-smoke.mjs`, then `node bin/lazypi.mjs status` to eyeball the catalog.
5. Commit with Conventional Commits, for example `feat: add extension to catalog` or `fix: preserve custom Pi settings`.

Two different update paths, and they do not overlap:

- `lazypi update` (via `pi update`) refreshes the extensions already installed on this machine.
- Editing `PACKAGES` changes what LazyPi will install in the future — then run `lazypi install` on each machine you manage.

Existing files are never silently destroyed. Before a settings file or an installed theme/agent file is rewritten, LazyPi copies it to a timestamped `.lazypi.<timestamp>.bak`; identical files are skipped. Unrelated packages and settings fields in your `settings.json` are preserved.

## Repository layout

```
bin/lazypi.mjs          CLI and the PACKAGES catalog (the source of truth)
themes/                 theme JSON files referenced by themes entries
agent/                  agent config files referenced by config entries (e.g. AGENTS.md)
test/                   node:test suite (catalog, load order, post-install, themes, CLI)
scripts/                packed-cli-smoke and installed-package assertion helpers
.github/workflows/      CI: test, windows-smoke, release-please
```

## Safety and behavior

- Global settings are read from `~/.pi/agent/settings.json`, or from `PI_CODING_AGENT_DIR` when set; `--local` uses `.pi/settings.json` in the current project.
- LazyPi never replaces your settings file wholesale. It preserves unrelated package entries and settings fields, and backs up the file before rewriting it.
- When catalog metadata declares `loadBefore`, install repairs existing settings order (timestamped backup included) so load-order-dependent extensions keep working after catalog changes.
- `postInstall` JSON merges run only when all `requiresSelected` ids are selected in the same install invocation, preserve unrelated configuration, and back up before changing an existing file.
- File-based installs (themes, agent config) copy into Pi's agent directory with a timestamped backup on overwrite and never touch settings such as `settings.theme` — activate a theme by setting it yourself.

## Development

Requirements: Node.js 20 or newer, npm, and Pi for install-flow checks.

```bash
npm ci
npm test
node scripts/packed-cli-smoke.mjs
```

The packed smoke test verifies that the npm artifact exposes the `lazypi` binary and that `npx`-style execution can invoke it. The CI workflows install Pi, run the full suite, run the packed smoke test, and assert that a full `lazypi --yes` install matches the catalog.
