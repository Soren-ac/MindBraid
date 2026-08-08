import { defineConfig, devices } from "@playwright/test";

const visualPlatform = resolveVisualPlatformName(process.platform);

/**
 * Chromium-only visual coverage intentionally runs in the same Linux browser
 * family as CI. The fixture supplies a minimal, deterministic Obsidian-token
 * host so the browser exercises the real DOM/SVG frontend rather than a mock
 * markup copy.
 */
export default defineConfig({
	globalSetup: "./tests/visual/global-setup.ts",
	testDir: "./tests/visual",
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI === "true" ? 1 : 0,
	workers: 1,
	timeout: 30_000,
	expect: {
		timeout: 8_000,
		toHaveScreenshot: {
			animations: "disabled",
			caret: "hide",
			maxDiffPixelRatio: 0.012,
		},
	},
	outputDir: "node_modules/.cache/mindbraid-playwright-results",
	snapshotPathTemplate:
		"{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}",
	use: {
		...devices["Desktop Chrome"],
		browserName: "chromium",
		colorScheme: "light",
		deviceScaleFactor: 1,
		locale: "en-US",
		timezoneId: "UTC",
		viewport: { width: 1440, height: 960 },
		launchOptions: {
			args: ["--force-color-profile=srgb", "--font-render-hinting=none"],
		},
	},
	projects: [
		{
			name: `chromium-${visualPlatform}`,
		},
	],
});

/**
 * Browser text rasterization is intentionally checked per operating-system
 * family. The fixture fixes all controllable rendering inputs, while separate
 * baselines keep a macOS font anti-aliasing difference from masking a genuine
 * Linux CI regression (or vice versa).
 */
function resolveVisualPlatformName(platform: NodeJS.Platform): string {
	switch (platform) {
		case "darwin":
			return "macos";
		case "win32":
			return "windows";
		default:
			return platform;
	}
}
