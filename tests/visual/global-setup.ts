import { build } from "esbuild";

/**
 * Build the browser-only fixture immediately before Playwright launches. The
 * generated bundle lives under node_modules/.cache, keeping test artefacts out
 * of the plugin's distributable source tree and Git status.
 */
export default async function buildVisualFixture(): Promise<void> {
	await build({
		bundle: true,
		entryPoints: ["tests/visual/fixture-entry.ts"],
		format: "iife",
		globalName: "MindBraidVisualFixture",
		logLevel: "info",
		outfile: "node_modules/.cache/mindbraid-visual/fixture.js",
		platform: "browser",
		sourcemap: false,
		target: "es2021",
		treeShaking: true,
	});
}
