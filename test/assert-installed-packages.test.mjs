import test from "node:test";
import assert from "node:assert/strict";

import { PACKAGES } from "../bin/lazypi.mjs";
import { expectedPackageSources, packageSourcesFromSettings } from "../scripts/assert-installed-packages.mjs";

test("expectedPackageSources matches the full catalog", () => {
	const expected = expectedPackageSources();
	assert.deepEqual(expected, PACKAGES.filter((pkg) => typeof pkg.source === "string").map((pkg) => pkg.source));
});

test("pi-ext catalog entries use the published moguw sources", () => {
	const expected = expectedPackageSources();
	for (const id of ["web-access", "hashline-edit-pro", "interactive-shell", "tool-display", "session-rename", "session-migrate", "session-fork"]) {
		const source = `npm:@moguw/pi-${id}`;
		assert.equal(PACKAGES.find((pkg) => pkg.id === id)?.source, source);
		assert.ok(expected.includes(source));
	}
});

test("turn telemetry and session recap are included as UI packages", () => {
	const expected = expectedPackageSources();
	for (const [id, source] of [["tps", "npm:@monotykamary/pi-tps"], ["recap", "npm:@lanlance/pi-recap"]]) {
		const pkg = PACKAGES.find((entry) => entry.id === id);
		assert.equal(pkg?.category, "ui");
		assert.equal(pkg.source, source);
		assert.ok(expected.includes(source));
	}
});

test("expectedPackageSources supports excluded package ids", () => {
	const extensionCount = PACKAGES.filter((pkg) => typeof pkg.source === "string").length;
	const excludedId = PACKAGES[0].id;
	const expected = expectedPackageSources({ except: [excludedId] });
	assert.equal(expected.includes(PACKAGES[0].source), false);
	assert.equal(expected.length, extensionCount - 1);
});

test("packageSourcesFromSettings reads string and object package entries", () => {
	const sources = packageSourcesFromSettings({
		packages: [
			"npm:pi-subagents",
			{ source: "npm:pi-ask-user" },
			{ source: "npm:pi-mcp-adapter", extra: true },
			{ nope: true },
		],
	});

	assert.deepEqual([...sources].sort(), ["npm:pi-ask-user", "npm:pi-mcp-adapter", "npm:pi-subagents"]);
});
