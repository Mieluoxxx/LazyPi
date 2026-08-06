#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, join, posix, resolve, win32 } from "node:path";
import { spawnSync } from "node:child_process";
import { argv, cwd, exit, stdout, stderr } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	cancel as clackCancel,
	confirm as clackConfirm,
	groupMultiselect,
	intro,
	isCancel,
	log,
	note,
	outro,
	select,
} from "@clack/prompts";

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

// Customize this array; it is the only extension catalog used by the CLI.
export const PACKAGES = [
	// core
	{ id: "web-access", category: "core", source: "npm:pi-web-access", description: "Web search and page fetch", hint: "Built-in web search and URL fetching.", postInstall: [{ requiresSelected: ["sidebar"], jsonMerge: { path: "../web-search.json", value: { shortcuts: { curate: "ctrl+shift+f" } } } }] },
	{ id: "mcp", category: "core", source: "npm:pi-mcp-adapter", description: "MCP server integration", hint: "Connect Pi to any MCP-compatible tool server." },
	{ id: "subagents", category: "core", source: "npm:pi-subagents", description: "Sub-agent execution", hint: "Run isolated sub-agents for parallel work." },
	{ id: "advisor", category: "core", source: "npm:@juicesharp/rpiv-advisor", description: "Second-opinion reviewer", hint: "Escalate to a stronger reviewer model for a plan, correction, or stop signal." },
	{ id: "workspace-history", category: "core", source: "npm:pi-workspace-history", description: "Workspace history", hint: "Track and revisit workspace session history." },
	{ id: "goal", category: "core", source: "npm:@narumitw/pi-goal", description: "Goal tracking", hint: "Track goals across Pi sessions." },
	{ id: "vision", category: "core", source: "npm:@getpipher/vision", description: "Vision support", hint: "Add image-aware capabilities to Pi." },
	// ui
	{ id: "zentui", category: "ui", source: "npm:pi-zentui", description: "Terminal user interface", hint: "Add a richer terminal UI for Pi workflows." },
	{ id: "tool-display", category: "ui", source: "npm:pi-tool-display", description: "Tool result display", hint: "Customize how Pi tool results are presented.", postInstall: [{ requiresSelected: ["hashline-edit-pro"], jsonMerge: { path: "extensions/pi-tool-display/config.json", value: { registerToolOverrides: { read: false } } } }] },
	{ id: "sidebar", category: "ui", source: "npm:@esso0428/pi-sidebar", description: "Floating right sidebar", hint: "Show model, context, git, and session metadata in a right sidebar overlay; toggle with ctrl+shift+s." },
	// tools
	{ id: "interactive-shell", category: "tools", source: "npm:pi-interactive-shell", description: "Interactive shell overlays", hint: "Run long-running CLIs and terminal workflows in observable overlays." },
	{ id: "btw", category: "tools", source: "npm:pi-btw", description: "Side-chat popover", hint: "Ask quick questions without polluting your conversation history." },
	{ id: "hashline-edit-pro", category: "tools", source: "npm:pi-hashline-edit-pro", description: "Hashline editing", hint: "Add hash-anchored read and edit output." },
	{ id: "fff", category: "tools", source: "npm:@ff-labs/pi-fff", description: "FFF workflow", hint: "Add the FFF workflow to Pi." },
	{ id: "simplify", category: "tools", source: "npm:pi-simplify", description: "Code simplify review", hint: "Reviews recently changed code for clarity and maintainability." },
	{ id: "slopchop", category: "tools", source: "npm:pi-slopchop", description: "Diff review and annotation", hint: "Walk the diff, annotate changes, and send feedback to the agent." },
	{ id: "agent-browser", category: "tools", source: "npm:pi-agent-browser-native", description: "Browser automation", hint: "Drive real browser sessions to browse, click, and capture screenshots." },
	{ id: "plan-mode", category: "tools", source: "npm:@narumitw/pi-plan-mode", description: "Read-only plan mode", hint: "Add a Codex-like /plan mode for structured planning before edits." },
	{ id: "session-rename", category: "tools", source: "npm:@moguw/pi-session-rename", description: "Session auto-naming", hint: "Auto-name Pi sessions from conversation context; manage with /rename." },
	{ id: "session-migrate", category: "tools", source: "npm:@moguw/pi-session-migrate", description: "Session migration", hint: "Migrate Pi sessions after a project moves to a new path; run /migrate." },
	// codex
	{ id: "apply-patch", category: "codex", source: "git:github.com/code-yeongyu/pi-apply-patch", description: "Codex-style patch editing", hint: "Adds the Codex apply_patch tool; replaces write/edit while a GPT model is active." },
	// themes
	{ id: "vesper-dark", category: "themes", themeFiles: ["themes/vesper-dark.json"], description: "Vesper dark theme", hint: "Warm peach-and-mint dark theme; set settings.theme to \"vesper-dark\" to activate." },
	{ id: "vesper-light", category: "themes", themeFiles: ["themes/vesper-light.json"], description: "Vesper light theme", hint: "Light variant of the Vesper theme; set settings.theme to \"vesper-light\" to activate." },
	// config
	{ id: "global-agents", category: "config", agentFiles: ["agent/AGENTS.md"], description: "Global AGENTS.md", hint: "Installs the agent personality/config file to ~/.pi/agent/AGENTS.md (backed up before overwrite)." },
];
const CATEGORIES = [...new Set(PACKAGES.map((pkg) => pkg.category))];

// ---------------------------------------------------------------------------
// Agent files (theme and config file installation)
// ---------------------------------------------------------------------------
// Catalog entries can ship files that install into Pi's agent directory:
// `themeFiles` land under themes/, `agentFiles` land at the agent root.
// Installing copies each file, backing up any existing file with the same name.
function themeTargetDir() {
	return join(agentConfigDir(), "themes");
}
function repoFilePath(relativePath) {
	return join(dirname(fileURLToPath(import.meta.url)), "..", relativePath);
}
function entryFileTargets(pkg) {
	const targets = [];
	for (const file of pkg.themeFiles ?? []) {
		targets.push({
			kind: "theme",
			name: basename(file),
			sourcePath: repoFilePath(file),
			targetPath: join(themeTargetDir(), basename(file)),
		});
	}
	for (const file of pkg.agentFiles ?? []) {
		targets.push({
			kind: "agent-file",
			name: basename(file),
			sourcePath: repoFilePath(file),
			targetPath: join(agentConfigDir(), basename(file)),
		});
	}
	return targets;
}
function isFileInstall(pkg) {
	return entryFileTargets(pkg).length > 0;
}
function fileInstallLabel(pkg) {
	return [...(pkg.themeFiles ?? []), ...(pkg.agentFiles ?? [])].join(", ");
}
function fileNeedsSync(file) {
	if (!existsSync(file.sourcePath)) return true;
	if (!existsSync(file.targetPath)) return true;
	return readFileSync(file.sourcePath, "utf8") !== readFileSync(file.targetPath, "utf8");
}
function fileInstallNeeded(pkg) {
	return entryFileTargets(pkg).some(fileNeedsSync);
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------
const isTTY = Boolean(stdout.isTTY);
const c = (code) => (s) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c("1");
const dim = c("2");
const red = c("31");
const green = c("32");
const yellow = c("33");
const cyan = c("36");
const blue = c("94");
const white = c("1;97");
const PACKAGE_COMMAND = `npx ${(() => {
	try {
		return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).name || "lazypi";
	} catch {
		return "lazypi";
	}
})()}`;
function printHeader(text) {
	console.log(`\n${bold(text)}`);
}

// ASCII "Pi" logo: capital P + lowercase i, with a blue "zzz" cascade
// rising from where the dot of the "i" would be. Letters in bold white,
// sleep trail in blue.
function renderLogo() {
	const Z = (s) => blue(s);
	const P = (s) => white(s);
	return [
		"",
		"                 " + Z("z Z z"),
		"                " + Z("z Z"),
		"               " + Z("z"),
		"        " + P("____   "),
		"       " + P("|  _ \\(_)"),
		"       " + P("| |_) | |"),
		"       " + P("|  __/| |"),
		"       " + P("|_|   |_|"),
		"",
	].join("\n");
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
const KNOWN_COMMANDS = new Set(["install", "status", "update", "doctor", "remove"]);

function parseArgs(args) {
	const flags = {
		command: "install",
		local: false,
		yes: false,
		help: false,
		only: null,
		except: null,
		targets: [],
	};

	let i = 0;
	if (args[0] && KNOWN_COMMANDS.has(args[0])) {
		flags.command = args[0];
		i = 1;
	}

	for (; i < args.length; i++) {
		const arg = args[i];
		if (arg === "-l" || arg === "--local") flags.local = true;
		else if (arg === "-y" || arg === "--yes") flags.yes = true;
		else if (arg === "-h" || arg === "--help") flags.help = true;
		else if (arg === "--only") flags.only = parseList(args[++i]);
		else if (arg.startsWith("--only=")) flags.only = parseList(arg.slice("--only=".length));
		else if (arg === "--except") flags.except = parseList(args[++i]);
		else if (arg.startsWith("--except=")) flags.except = parseList(arg.slice("--except=".length));
		else if (flags.command === "remove" && !arg.startsWith("-")) flags.targets.push(arg);
		else {
			console.error(red(`Unknown argument: ${arg}`));
			flags.help = true;
			break;
		}
	}

	return flags;
}

function parseList(value) {
	if (!value) return [];
	return value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function validateSelectors(list, label) {
	const ids = new Set(PACKAGES.map((p) => p.id));
	const bad = list.filter((name) => !CATEGORIES.includes(name) && !ids.has(name));
	if (bad.length > 0) {
		console.error(red(`Unknown ${label}: ${bad.join(", ")}`));
		console.error(`Valid categories: ${CATEGORIES.join(", ")}`);
		console.error(`Valid package ids:  ${[...ids].join(", ")}`);
		exit(2);
	}
}

function matchesSelector(pkg, selectors) {
	return selectors.some((name) => name === pkg.category || name === pkg.id);
}

function resolveSelection(flags) {
	if (flags.only) {
		validateSelectors(flags.only, "--only");
		return new Set(PACKAGES.filter((p) => matchesSelector(p, flags.only)).map((p) => p.id));
	}
	if (flags.except) {
		validateSelectors(flags.except, "--except");
		return new Set(PACKAGES.filter((p) => !matchesSelector(p, flags.except)).map((p) => p.id));
	}
	return new Set(PACKAGES.map((p) => p.id));
}

function expandPackageDependencies(selectedIds) {
	const expanded = new Set(selectedIds);
	let changed = true;
	while (changed) {
		changed = false;
		for (const pkg of PACKAGES) {
			if (!expanded.has(pkg.id) || !Array.isArray(pkg.dependencies)) continue;
			for (const dependencyId of pkg.dependencies) {
				if (expanded.has(dependencyId)) continue;
				expanded.add(dependencyId);
				changed = true;
			}
		}
	}
	return expanded;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------
function printHelp() {
	console.log(`${bold("lazypi")} — personal Pi extension manager

${bold("Usage:")}
  ${PACKAGE_COMMAND} [command] [options]

${bold("Commands:")}
  install   Install the selected extension catalog (default)
  remove    Remove a catalog extension by id or raw Pi source
  status    Show installed, missing, and extra Pi extensions
  update    Run the overall Pi extension update
  doctor    Check the Pi extension environment

${bold("Install options:")}
  --only <list>       Install only the given categories or extension ids
  --except <list>     Install everything except the given categories or ids
  -l, --local         Install into the current project (.pi/settings.json)
  -y, --yes           Skip the picker and confirmation prompt
  -h, --help          Show this help

${bold("Default behaviour:")}
  - Every catalog extension is installed by default.
  - On a TTY, an interactive picker starts with everything selected.
  - With --yes, --only, or --except the picker is skipped.
  - update does not filter one extension; use pi update <source> for that.

${bold("Categories:")}
${CATEGORIES.map((category) => `  ${category}`).join("\n")}

${bold("Examples:")}
  ${PACKAGE_COMMAND}                              # everything
  ${PACKAGE_COMMAND} --yes                        # everything, no prompt
  ${PACKAGE_COMMAND} --only core                  # core extensions
  ${PACKAGE_COMMAND} --only subagents,mcp         # selected extensions
  ${PACKAGE_COMMAND} --only core --local          # project-local install
  ${PACKAGE_COMMAND} status
  ${PACKAGE_COMMAND} doctor`);
}

// ---------------------------------------------------------------------------
// Pi / settings plumbing
// ---------------------------------------------------------------------------
// On Windows, package-manager CLIs and global Node bins are usually `.cmd`
// shims. Node's child_process docs note that those need to be launched via a
// shell, so we route spawned commands through the platform shell there while
// keeping direct execution on Unix.
export function buildSpawnOptions(options = {}, platformName = platform()) {
	const resolved = { ...options };
	if (platformName === "win32" && resolved.shell == null) resolved.shell = true;
	return resolved;
}

export function spawnCommand(command, args = [], options = {}) {
	return spawnSync(command, args, buildSpawnOptions(options));
}

function hasCmd(name) {
	const probe = spawnCommand(platform() === "win32" ? "where" : "which", [name], { stdio: "ignore" });
	return probe.status === 0;
}

export function resolveAgentConfigDir(configured, home = homedir(), platformName = platform()) {
	const joinPath = platformName === "win32" ? win32.join : posix.join;
	if (!configured) return joinPath(home, ".pi", "agent");
	if (configured === "~") return home;
	if (configured.startsWith("~/") || (platformName === "win32" && configured.startsWith("~\\"))) {
		return joinPath(home, configured.slice(2));
	}
	return configured;
}

function agentConfigDir() {
	return resolveAgentConfigDir(process.env.PI_CODING_AGENT_DIR);
}

function settingsPath(local) {
	return local ? join(cwd(), ".pi", "settings.json") : join(agentConfigDir(), "settings.json");
}



function readSettings(local) {
	const path = settingsPath(local);
	if (!existsSync(path)) return { path, exists: false, parsed: null, error: null };
	try {
		return { path, exists: true, parsed: JSON.parse(readFileSync(path, "utf8")), error: null };
	} catch (err) {
		return { path, exists: true, parsed: null, error: err instanceof Error ? err.message : String(err) };
	}
}
function backupPath(path) {
	const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
	return `${path}.lazypi.${timestamp}.bak`;
}

function writeSettings(local, mutate) {
	const current = readSettings(local);
	if (current.error) return { ok: false, path: current.path, error: current.error };
	const settings = current.parsed ?? {};
	const changed = mutate(settings);
	if (!changed) return { ok: true, path: current.path, backup: null, changed: false };
	mkdirSync(dirname(current.path), { recursive: true });
	let backup = null;
	if (current.exists) {
		backup = backupPath(current.path);
		copyFileSync(current.path, backup);
	}
	writeFileSync(current.path, JSON.stringify(settings, null, 2) + "\n", "utf8");
	return { ok: true, path: current.path, backup, changed: true };
}
function installRoot(local) {
	return local ? join(cwd(), ".pi") : agentConfigDir();
}

function isJsonObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJsonObjectFile(path) {
	if (!existsSync(path)) return { exists: false, value: {} };
	try {
		const value = JSON.parse(readFileSync(path, "utf8"));
		if (!isJsonObject(value)) return { exists: true, error: "the JSON root must be an object" };
		return { exists: true, value };
	} catch (err) {
		return { exists: true, error: err instanceof Error ? err.message : String(err) };
	}
}

function mergeJsonObjects(target, source) {
	let changed = false;
	for (const [key, sourceValue] of Object.entries(source)) {
		const targetValue = target[key];
		if (isJsonObject(sourceValue)) {
			if (!isJsonObject(targetValue)) {
				target[key] = {};
				changed = true;
			}
			if (mergeJsonObjects(target[key], sourceValue)) changed = true;
		} else if (!Object.is(targetValue, sourceValue)) {
			target[key] = sourceValue;
			changed = true;
		}
	}
	return changed;
}

function applyJsonMergePostInstall(local, ownerId, rule) {
	const jsonMerge = rule?.jsonMerge;
	if (!isJsonObject(jsonMerge) || typeof jsonMerge.path !== "string" || !isJsonObject(jsonMerge.value)) {
		return { ok: false, error: `invalid postInstall jsonMerge metadata for ${ownerId}` };
	}
	const path = join(installRoot(local), jsonMerge.path);
	const current = readJsonObjectFile(path);
	if (current.error) return { ok: false, path, error: current.error };
	const changed = mergeJsonObjects(current.value, jsonMerge.value);
	if (!changed) return { ok: true, path, changed: false, backup: null };
	try {
		mkdirSync(dirname(path), { recursive: true });
		let backup = null;
		if (current.exists) {
			backup = backupPath(path);
			copyFileSync(path, backup);
		}
		writeFileSync(path, JSON.stringify(current.value, null, 2) + "\n", "utf8");
		return { ok: true, path, changed: true, backup };
	} catch (err) {
		return { ok: false, path, error: err instanceof Error ? err.message : String(err) };
	}
}

function runSelectedPostInstalls(selected, local, failedIds = new Set()) {
	const selectedIds = new Set(selected.map((pkg) => pkg.id));
	const results = [];
	for (const pkg of selected) {
		for (const rule of pkg.postInstall ?? []) {
			const required = Array.isArray(rule.requiresSelected) ? rule.requiresSelected : [];
			if (!required.every((id) => selectedIds.has(id))) continue;
			const involvedIds = [pkg.id, ...required];
			if (involvedIds.some((id) => failedIds.has(id))) continue;
			const result = applyJsonMergePostInstall(local, pkg.id, rule);
			const entry = { ownerId: pkg.id, ...result };
			results.push(entry);
			if (!result.ok) return { ok: false, results, failure: entry };
		}
	}
	return { ok: true, results };
}

function reportPostInstallResults(result, interactive) {
	if (!result.ok) {
		const message = `Post-install configuration failed after extension installation for ${result.failure.ownerId}${result.failure.path ? ` at ${result.failure.path}` : ""}: ${result.failure.error}`;
		if (interactive) log.error(message);
		else console.error(red(message));
		return false;
	}
	for (const entry of result.results) {
		if (!entry.changed) continue;
		const backup = entry.backup ? ` Backup: ${entry.backup}` : "";
		const message = `Applied post-install configuration for ${entry.ownerId}.${backup}`;
		if (interactive) log.success(message);
		else console.log(green(message));
	}
	return true;
}

function installAgentFiles(pkg) {
	const installed = [];
	const missingSource = [];
	for (const file of entryFileTargets(pkg)) {
		if (!existsSync(file.sourcePath)) {
			missingSource.push(file.name);
			continue;
		}
		if (!fileNeedsSync(file)) continue;
		mkdirSync(dirname(file.targetPath), { recursive: true });
		let backup = null;
		if (existsSync(file.targetPath)) {
			backup = backupPath(file.targetPath);
			copyFileSync(file.targetPath, backup);
		}
		copyFileSync(file.sourcePath, file.targetPath);
		installed.push({ kind: file.kind, name: file.name, backup });
	}
	return { ok: missingSource.length === 0, installed, missingSource };
}

function reportAgentFileInstall(result, interactive) {
	for (const entry of result.installed) {
		const backup = entry.backup ? ` Backup: ${entry.backup}` : "";
		const kindLabel = entry.kind === "theme" ? "theme" : "agent file";
		const message = `Installed ${kindLabel} ${entry.name}.${backup}`;
		if (interactive) log.success(message);
		else console.log(green(message));
	}
	if (result.missingSource.length > 0) {
		const message = `Source file(s) missing from this repo: ${result.missingSource.join(", ")}`;
		if (interactive) log.error(message);
		else console.error(red(message));
	}
}




function packageEntrySource(entry) {
	if (typeof entry === "string") return entry;
	if (entry && typeof entry === "object" && typeof entry.source === "string") return entry.source;
	return null;
}

function readInstalledSources(local) {
	const current = readSettings(local);
	if (!current.exists) return { sources: new Set(), path: current.path, exists: false };
	if (current.error) return { sources: new Set(), path: current.path, exists: true, error: current.error };
	const sources = new Set();
	for (const entry of current.parsed?.packages ?? []) {
		const source = packageEntrySource(entry);
		if (source) sources.add(source);
	}
	return { sources, path: current.path, exists: true };
}
function normalizedPackageEntries(settings, catalog = PACKAGES) {
	if (!Array.isArray(settings?.packages)) return { ordered: null, constrained: false, cycle: false };
	const entries = settings.packages;
	const sources = entries.map(packageEntrySource);
	const indexes = new Map();
	for (const [index, source] of sources.entries()) if (source && !indexes.has(source)) indexes.set(source, index);
	const prerequisites = entries.map(() => new Set());
	let constrained = false;
	for (const pkg of catalog) {
		if (!Array.isArray(pkg.loadBefore)) continue;
		const from = indexes.get(pkg.source);
		if (from == null) continue;
		for (const targetRef of pkg.loadBefore) {
			const target = catalog.find((candidate) => candidate.id === targetRef || candidate.source === targetRef);
			const to = target ? indexes.get(target.source) : undefined;
			if (to == null || from === to || prerequisites[to].has(from)) continue;
			prerequisites[to].add(from);
			constrained = true;
		}
	}
	if (!constrained) return { ordered: entries, constrained: false, cycle: false };
	const state = entries.map(() => 0);
	const order = [];
	let cycle = false;
	const visit = (index) => {
		if (state[index] === 2 || cycle) return;
		if (state[index] === 1) {
			cycle = true;
			return;
		}
		state[index] = 1;
		for (const prerequisite of prerequisites[index]) visit(prerequisite);
		state[index] = 2;
		order.push(index);
	};
	for (let index = 0; index < entries.length; index++) visit(index);
	if (cycle) return { ordered: entries, constrained, cycle: true };
	return { ordered: order.map((index) => entries[index]), constrained, cycle: false };
}

export function normalizePackageLoadOrderInSettings(settings, catalog = PACKAGES) {
	const result = normalizedPackageEntries(settings, catalog);
	if (!result.constrained || result.cycle) return false;
	const changed = result.ordered.some((entry, index) => entry !== settings.packages[index]);
	if (changed) settings.packages = result.ordered;
	return changed;
}

function normalizePackageLoadOrder(local) {
	return writeSettings(local, normalizePackageLoadOrderInSettings);
}

function packageLoadOrderStatusFromSettings(settings, catalog = PACKAGES) {
	const result = normalizedPackageEntries(settings, catalog);
	if (!result.constrained) return { checked: false };
	return {
		checked: true,
		ok: !result.cycle && result.ordered.every((entry, index) => entry === settings.packages[index]),
		cycle: result.cycle,
	};
}

function packageLoadOrderStatus(local) {
	const current = readSettings(local);
	if (!current.exists) return { checked: false, path: current.path, exists: false };
	if (current.error) return { checked: false, path: current.path, exists: true, error: current.error };
	return { ...packageLoadOrderStatusFromSettings(current.parsed), path: current.path, exists: true };
}

function reportLoadOrderNormalization(result, interactive) {
	if (!result.ok) {
		const message = `Could not update package load order in ${result.path} — ${result.error}`;
		if (interactive) log.warn(message);
		else console.warn(yellow(message));
		return;
	}
	if (!result.changed) return;
	const backup = result.backup ? ` Backup: ${result.backup}` : "";
	const message = `Updated package load order from catalog metadata.${backup}`;
	if (interactive) log.success(message);
	else console.log(green(message));
}


function packageInstallStatus(pkg, installedPiSources) {
	if (isFileInstall(pkg)) {
		const installed = entryFileTargets(pkg).every((file) => existsSync(file.targetPath));
		return { installed, present: installed };
	}
	const installed = installedPiSources.has(pkg.source);
	return { installed, present: installed };
}

function isPackageInstalled(pkg, installedPiSources) {
	return packageInstallStatus(pkg, installedPiSources).installed;
}

function isPackagePresent(pkg, installedPiSources) {
	return packageInstallStatus(pkg, installedPiSources).present;
}




function runPi(args) {
	const result = spawnCommand("pi", args, { stdio: "inherit" });
	return result.status ?? 1;
}



// ---------------------------------------------------------------------------
// Pi / settings plumbing (shared helpers)
// ---------------------------------------------------------------------------
function readJsonSafe(path) {
	try {
		if (!existsSync(path)) return null;
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Auth detection (read-only)
// ---------------------------------------------------------------------------
// Pi reads credentials from auth.json in its agent config directory and also
// honors provider env vars. LazyPi reports available credentials so users
// know whether to run `pi /login` first.
const AUTH_ENV_VARS = [
	["ANTHROPIC_API_KEY", "anthropic"],
	["OPENAI_API_KEY", "openai"],
	["GOOGLE_API_KEY", "google"],
	["GEMINI_API_KEY", "google"],
	["OPENROUTER_API_KEY", "openrouter"],
	["TOGETHER_API_KEY", "together"],
	["GROQ_API_KEY", "groq"],
	["MISTRAL_API_KEY", "mistral"],
];

function authJsonPath() {
	return join(agentConfigDir(), "auth.json");
}

function detectAuth() {
	const envProviders = new Map(); // provider -> env var name
	for (const [name, provider] of AUTH_ENV_VARS) {
		if (process.env[name] && !envProviders.has(provider)) envProviders.set(provider, name);
	}
	const auth = readJsonSafe(authJsonPath()) ?? {};
	const fileProviders = Object.keys(auth);
	return {
		envProviders: [...envProviders.entries()].map(([provider, envVar]) => ({ provider, envVar })),
		fileProviders,
		path: authJsonPath(),
		authed: envProviders.size > 0 || fileProviders.length > 0,
	};
}

function formatAuthSummary(state) {
	const bits = [];
	for (const { provider, envVar } of state.envProviders) bits.push(`${provider} (${envVar})`);
	for (const provider of state.fileProviders) bits.push(`${provider} (auth.json)`);
	return bits.length > 0 ? bits.join(", ") : "none detected";
}

// ---------------------------------------------------------------------------
// Interactive prompts (powered by @clack/prompts)
// ---------------------------------------------------------------------------
function isInteractive() {
	return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function abortIfCancelled(value) {
	if (isCancel(value)) {
		clackCancel("Aborted.");
		exit(0);
	}
	return value;
}

async function confirm(message, initial = false) {
	const answer = await clackConfirm({ message, initialValue: initial });
	return abortIfCancelled(answer);
}

async function askLazyOrPick(totalCount) {
	const options = [
		{ value: "lazy", label: `Install everything`, hint: `all ${totalCount} packages` },
		{ value: "pick", label: "Pick packages", hint: "open a checklist" },
	];

	const choice = await select({
		message: `Install all ${totalCount} Pi packages the lazy way, or pick them yourself?`,
		options,
		initialValue: "lazy",
	});
	return abortIfCancelled(choice);
}

async function runPicker(initialSelected) {
	const idWidth = Math.max(...PACKAGES.map((p) => p.id.length));
	const options = {};
	for (const cat of CATEGORIES) {
		const pkgs = PACKAGES.filter((p) => p.category === cat);
		if (pkgs.length === 0) continue;
		options[cat] = pkgs.map((pkg) => ({
			value: pkg.id,
			label: `${pkg.id.padEnd(idWidth + 2)}${pkg.description}`,
		}));
	}

	const picked = await groupMultiselect({
		message: "Pick packages to install",
		options,
		initialValues: [...initialSelected],
		required: false,
		selectableGroups: true,
	});
	abortIfCancelled(picked);
	return new Set(picked);
}

// ---------------------------------------------------------------------------
// Ensure Pi is present (offer to install)
// ---------------------------------------------------------------------------
async function ensurePi(flags) {
	if (hasCmd("pi")) return true;

	log.warn("Could not find the `pi` command on PATH.");
	const ok = flags.yes || (await confirm("Install Pi now with `npm install -g @earendil-works/pi-coding-agent`?", true));
	if (!ok) {
		log.error(`Install Pi first, then re-run ${PACKAGE_COMMAND}.`);
		return false;
	}

	log.step("Installing Pi via `npm install -g @earendil-works/pi-coding-agent`");
	const code = spawnCommand("npm", ["install", "-g", "@earendil-works/pi-coding-agent"], { stdio: "inherit" }).status;
	if (code !== 0) {
		log.error("Failed to install Pi. On some systems a global npm install needs sudo:\n  sudo npm install -g @earendil-works/pi-coding-agent");
		return false;
	}

	if (!hasCmd("pi")) {
		log.error(`Installed Pi, but \`pi\` is still not on PATH. Open a new shell and re-run ${PACKAGE_COMMAND}.`);
		return false;
	}
	return true;
}

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------
async function cmdInstall(flags) {
	let selectedIds = expandPackageDependencies(resolveSelection(flags));

	const usedSelectionFlag = Boolean(flags.only || flags.except);
	const interactive = !flags.yes && !usedSelectionFlag && isInteractive();

	if (interactive) {
		console.log(renderLogo());
		intro(bold("LazyPi"));
	}
	if (!(await ensurePi(flags))) return 127;

	if (interactive) {
		const choice = await askLazyOrPick(PACKAGES.length);
		if (choice === "pick") selectedIds = expandPackageDependencies(await runPicker(selectedIds));
	}

	const selected = PACKAGES.filter((p) => selectedIds.has(p.id));
	if (selected.length === 0) {
		if (interactive) outro("Nothing selected — nothing to install.");
		else console.log(yellow("Nothing selected — nothing to install."));
		return 0;
	}

	reportLoadOrderNormalization(normalizePackageLoadOrder(flags.local), interactive);
	const { sources: installedSources, error: settingsError } = readInstalledSources(flags.local);
	if (settingsError) log.warn(`Could not parse ${settingsPath(flags.local)} — ${settingsError}`);

	const toInstall = selected.filter((pkg) => (isFileInstall(pkg) ? fileInstallNeeded(pkg) : !isPackageInstalled(pkg, installedSources)));
	const alreadyInstalled = selected.filter((pkg) => !(isFileInstall(pkg) ? fileInstallNeeded(pkg) : !isPackageInstalled(pkg, installedSources)));
	const scope = flags.local ? "project (.pi/settings.json)" : `global (${settingsPath(false)})`;
	const summary = [
		`Target:            ${scope}`,
		`Selected:          ${selected.length}/${PACKAGES.length}`,
		`Already installed: ${alreadyInstalled.length}`,
		`Will install:      ${toInstall.length}`,
		`Pi credentials:    ${formatAuthSummary(detectAuth())}`,
	].join("\n");
	if (interactive) note(summary, "Plan");
	else console.log(summary);

	if (toInstall.length === 0) {
		const postInstall = runSelectedPostInstalls(selected, flags.local);
		if (!reportPostInstallResults(postInstall, interactive)) return 1;
		printCheatsheet(selected, interactive);
		const done = "Nothing to do — every selected package is already installed.";
		if (interactive) log.success(green(done));
		else console.log(green(done));
		printNextSteps(detectAuth(), 0, interactive);
		return 0;
	}

	const piArgs = flags.local ? ["install", "-l"] : ["install"];
	const failed = [];
	for (const pkg of toInstall) {
		if (isFileInstall(pkg)) {
			const action = pkg.category === "themes" ? `install theme ${pkg.id}` : `install agent file ${pkg.id}`;
			if (interactive) log.step(action);
			else console.log(`\n→ ${action}`);
			const themeResult = installAgentFiles(pkg);
			if (!themeResult.ok) {
				failed.push(pkg);
				if (interactive) log.error(`failed to install ${pkg.id}`);
				else console.error(red(`  ✗ failed to install ${pkg.id}`));
			} else {
				reportAgentFileInstall(themeResult, interactive);
			}
			continue;
		}
		const action = `pi install ${pkg.source}`;
		if (interactive) log.step(action);
		else console.log(`\n→ ${action}`);
		const env = pkg.source.startsWith("git:")
			? { ...process.env, npm_config_ignore_scripts: "true" }
			: process.env;
		const status = spawnCommand("pi", [...piArgs, pkg.source], { stdio: "inherit", env }).status;
		if (status !== 0) {
			failed.push(pkg);
			if (interactive) log.error(`failed to install ${pkg.id}`);
			else console.error(red(`  ✗ failed to install ${pkg.id}`));
		}
	}

	reportLoadOrderNormalization(normalizePackageLoadOrder(flags.local), interactive);
	const installedCount = toInstall.length - failed.length;
	const failedIds = new Set(failed.map((pkg) => pkg.id));
	const postInstall = runSelectedPostInstalls(selected, flags.local, failedIds);
	const postInstallOk = reportPostInstallResults(postInstall, interactive);
	if (failed.length === 0) {
		if (!postInstallOk) return 1;
		printCheatsheet(selected, interactive);
		printNextSteps(detectAuth(), installedCount, interactive);
		return 0;
	}

	const failureList = failed.map((p) => `- ${p.id} (${isFileInstall(p) ? fileInstallLabel(p) : p.source})`).join("\n");
	if (interactive) {
		note(failureList, "Failures");
		outro(red(`Finished with ${failed.length} failure(s).`));
	} else {
		console.error(red(`\nLazyPi finished with ${failed.length} failure(s):`));
		console.error(failureList);
	}
	return 1;
}

function printNextSteps(state, installedCount, interactive) {
	const lines = [];
	if (state.authed) {
		lines.push(`Pi credentials: ${formatAuthSummary(state)}`);
		lines.push("");
		lines.push("You're all set. Run `pi` to get started.");
	} else {
		lines.push("Pi credentials: none detected.");
		lines.push("");
		lines.push("Run `pi`, then type `/login` inside Pi to sign in, or set a provider API key.");
	}

	const title = installedCount > 0 ? `Installed ${installedCount} catalog item(s) — next steps` : "Next steps";
	const body = lines.join("\n");
	if (interactive) {
		note(body, title);
		outro(green("Done."));
	} else {
		printHeader(title + ":");
		console.log(body);
	}
}

function printCheatsheet(selected, interactive) {
	if (selected.length === 0) return;
	const lines = selected.map((p) => `${p.id.padEnd(20)} ${p.hint}`);
	if (interactive) note(lines.join("\n"), "What you've got");
	else {
		printHeader("What you've got:");
		for (const line of lines) console.log(`  ${line}`);
		console.log(dim("\nRemove catalog items with `lazypi remove <id>`."));
	}
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------
function cmdStatus(flags) {
	const { sources, path, exists, error } = readInstalledSources(flags.local);
	console.log(`Settings file: ${bold(path)}`);
	if (!exists) {
		console.log(yellow("  (not found — Pi has not written settings yet)"));
	} else if (error) {
		console.error(red(`  could not parse: ${error}`));
		return 1;
	}

	const catalogSources = new Set(PACKAGES.map((p) => p.source));
	const installed = PACKAGES.filter((pkg) => isPackageInstalled(pkg, sources));
	const missing = PACKAGES.filter((pkg) => !isPackagePresent(pkg, sources));
	const others = [...sources].filter((src) => !catalogSources.has(src));

	printHeader(`Installed from LazyPi catalog (${installed.length}/${PACKAGES.length}):`);
	if (installed.length === 0) console.log(dim("  none"));
	for (const pkg of installed) console.log(`  ${green("✓")} [${pkg.category}] ${pkg.id.padEnd(20)} ${dim(isFileInstall(pkg) ? fileInstallLabel(pkg) : pkg.source)}`);

	printHeader(`Missing from LazyPi catalog (${missing.length}):`);
	if (missing.length === 0) console.log(dim("  none — full catalog is installed"));
	for (const pkg of missing) console.log(`  ${dim("·")} [${pkg.category}] ${pkg.id.padEnd(20)} ${dim(isFileInstall(pkg) ? fileInstallLabel(pkg) : pkg.source)}`);

	printHeader(`Other Pi extensions outside the LazyPi catalog (${others.length}):`);
	if (others.length === 0) console.log(dim("  none"));
	for (const src of others) console.log(`  ${cyan("·")} ${src}`);

	return 0;
}

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------
async function cmdUpdate(flags) {
	if (flags.only || flags.except) {
		console.error(red("`update` does not filter individual extensions; use `pi update <source>` for one extension."));
		return 2;
	}
	if (!(await ensurePi(flags))) return 127;
	reportLoadOrderNormalization(normalizePackageLoadOrder(flags.local), false);
	console.log(bold(flags.local ? "pi update --extensions" : "pi update"));
	return runPi(flags.local ? ["update", "--extensions"] : ["update"]);
}

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------
function cmdDoctor(flags) {
	let problems = 0;
	let warnings = 0;
	const pass = (msg) => console.log(`  ${green("✓")} ${msg}`);
	const warn = (msg, { fatal = true } = {}) => {
		console.log(`  ${yellow("!")} ${msg}`);
		if (fatal) problems++;
		else warnings++;
	};
	const fail = (msg) => {
		console.log(`  ${red("✗")} ${msg}`);
		problems++;
	};

	printHeader("Environment");
	const nodeMajor = Number(process.versions.node.split(".")[0]);
	if (Number.isFinite(nodeMajor) && nodeMajor >= 20) pass(`Node ${process.versions.node}`);
	else fail(`Node ${process.versions.node} — LazyPi requires Node >= 20`);
	if (hasCmd("npm")) pass("npm is on PATH");
	else fail("npm is not on PATH — LazyPi can't install Pi for you");
	if (hasCmd("git")) pass("git is on PATH");
	else warn("git is not on PATH — required by Git-based extensions");

	printHeader("Pi");
	if (hasCmd("pi")) {
		pass("`pi` is on PATH");
		const v = spawnCommand("pi", ["--version"], { encoding: "utf8" });
		const vout = (v.stdout ?? "").trim() || (v.stderr ?? "").trim();
		if (vout) pass(`pi --version: ${vout}`);
		else warn("Could not read `pi --version` output");
	} else fail(`\`pi\` is not on PATH — run ${PACKAGE_COMMAND} to install it`);

	printHeader("Settings");
	const settingsState = readInstalledSources(flags.local);
	if (!settingsState.exists) warn(`${settingsState.path} does not exist yet (Pi has not been run)`);
	else if (settingsState.error) fail(`${settingsState.path} is not valid JSON — ${settingsState.error}`);
	else {
		pass(`${settingsState.path} is readable`);
		const order = packageLoadOrderStatus(flags.local);
		if (order.cycle) fail("Catalog package load-order metadata contains a cycle");
		else if (order.checked && order.ok) pass("Catalog package load order is valid");
		else if (order.checked) warn("Catalog package load order is stale — run LazyPi install to repair it", { fatal: false });
	}

	printHeader("Catalog");
	const extensionCount = PACKAGES.filter((pkg) => !isFileInstall(pkg)).length;
	const fileEntryCount = PACKAGES.length - extensionCount;
	pass(`${extensionCount} Pi extension(s) and ${fileEntryCount} file-based item(s) configured`);

	printHeader("Auth");
	const auth = detectAuth();
	for (const { provider, envVar } of auth.envProviders) pass(`env var ${envVar} → ${provider}`);
	if (auth.fileProviders.length > 0) pass(`${auth.path} → ${auth.fileProviders.join(", ")}`);
	if (!auth.authed) warn("No credentials detected — run `pi` then `/login`, or export a provider API key", { fatal: false });

	console.log("");
	if (problems === 0 && warnings === 0) {
		console.log(green("All checks passed."));
		return 0;
	}
	if (problems === 0) {
		console.log(yellow(`${warnings} warning(s) found.`));
		return 0;
	}
	console.log(yellow(`${problems} problem(s) found${warnings ? `, ${warnings} warning(s)` : ""}.`));
	return 1;
}

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------
async function cmdRemove(flags, targets) {
	if (targets.length === 0) {
		if (!isInteractive()) {
			console.error(red(`Usage: ${PACKAGE_COMMAND} remove <id|source> [...]`));
			return 2;
		}
		const { sources } = readInstalledSources(flags.local);
		const installedPkgs = PACKAGES.filter((p) => isPackagePresent(p, sources));
		if (installedPkgs.length === 0) {
			console.log(yellow("No catalog extensions are installed."));
			return 0;
		}
		const idWidth = Math.max(...installedPkgs.map((p) => p.id.length));
		const { multiselect } = await import("@clack/prompts");
		const picked = await multiselect({
			message: "Select extensions to remove",
			options: installedPkgs.map((p) => ({ value: p.id, label: `${p.id.padEnd(idWidth + 2)}${p.description}` })),
			required: false,
		});
		abortIfCancelled(picked);
		if (!picked.length) {
			console.log(yellow("Nothing selected."));
			return 0;
		}
		targets = picked;
	}

	let exitCode = 0;
	for (const target of targets) {
		const pkg = PACKAGES.find((p) => p.id === target);
		if (pkg && isFileInstall(pkg)) {
			const files = entryFileTargets(pkg).filter((file) => existsSync(file.targetPath));
			if (files.length === 0) {
				console.log(yellow(`${pkg.category === "themes" ? "Theme" : "Agent file"} ${pkg.id} is not installed.`));
				continue;
			}
			for (const file of files) {
				rmSync(file.targetPath);
				const kindLabel = file.kind === "theme" ? "theme" : "agent file";
				console.log(green(`Removed ${kindLabel} ${file.name}.`));
			}
			continue;
		}
		const source = pkg ? pkg.source : target;
		const piArgs = flags.local ? ["remove", "-l", source] : ["remove", source];
		const result = spawnCommand("pi", piArgs, { stdio: "inherit" });
		if (result.status !== 0) {
			console.error(red(`Failed to remove ${target}`));
			exitCode = 1;
		}
	}
	return exitCode;
}


// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
	const flags = parseArgs(argv.slice(2));
	if (flags.help) {
		printHelp();
		return 0;
	}
	switch (flags.command) {
		case "install":
			return cmdInstall(flags);
		case "status":
			return cmdStatus(flags);
		case "update":
			return cmdUpdate(flags);
		case "doctor":
			return cmdDoctor(flags);
		case "remove":
			return cmdRemove(flags, flags.targets);
		default:
			printHelp();
			return 2;
	}
}

export function resolveEntrypointUrl(scriptPath) {
	if (!scriptPath) return null;
	try {
		return pathToFileURL(realpathSync(scriptPath)).href;
	} catch {
		return pathToFileURL(resolve(scriptPath)).href;
	}
}

const entrypoint = resolveEntrypointUrl(argv[1]);

if (entrypoint === import.meta.url) {
	main().then((code) => exit(code ?? 0)).catch((err) => {
		stderr.write(`${err?.stack || err}\n`);
		exit(1);
	});
}
