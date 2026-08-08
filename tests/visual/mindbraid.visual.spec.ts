import { expect, test, type Page } from "@playwright/test";

import { MIND_BRAID_VISUAL_HOST_CSS } from "./host-css";

type FixtureOptions = {
	readonly colorScheme?: "light" | "dark";
	readonly paletteId?: "colorful" | "morandi-mint" | "retro-autumn";
	readonly styleId?: "colorful" | "pencil-sketch" | "atlas-cards";
};

type VisualFixtureApi = {
	mountVisualFixture(container: HTMLElement, options?: FixtureOptions): void;
	selectVisualTopic(topic: "productStrategy" | "discoverProblem" | "longTask" | "designMap"): boolean;
	beginEditingVisualTopic(topic: "productStrategy" | "discoverProblem" | "longTask" | "designMap"): boolean;
	collapseVisualTopic(topic: "productStrategy" | "discoverProblem" | "longTask" | "designMap"): boolean;
	showVisualSidebar(tab: "appearance" | "topic" | "layout"): boolean;
	showVisualLargeMapGuard(): void;
	waitForVisualFixture(): Promise<void>;
};

declare global {
	interface Window {
		MindBraidVisualFixture: VisualFixtureApi;
	}
}

const VISUAL_ROOT = "#obmind-visual-root";
const FIXTURE_BUNDLE = "node_modules/.cache/mindbraid-visual/fixture.js";

test.describe("MindBraid visual regression", () => {
	test("renders a light colorful map with wrapped text and task control", async ({
		page,
	}) => {
		await mountFixture(page, {
			colorScheme: "light",
			paletteId: "colorful",
			styleId: "colorful",
		});

		await expect(
			page.locator(".obmind-node-task-checkbox:not([hidden]):not(:disabled)").first(),
		).toBeVisible();
		await expect(page.locator(VISUAL_ROOT)).toHaveScreenshot(
			"light-colorful-spectrum.png",
		);
	});

	test("renders a dark pencil map with a Morandi palette", async ({ page }) => {
		await mountFixture(page, {
			colorScheme: "dark",
			paletteId: "morandi-mint",
			styleId: "pencil-sketch",
		});

		await expect(page.locator(VISUAL_ROOT)).toHaveScreenshot(
			"dark-pencil-morandi.png",
		);
	});

	test("renders selected, inline-editing, and collapsed topic states", async ({
		page,
	}) => {
		await mountFixture(page, {
			colorScheme: "light",
			paletteId: "retro-autumn",
			styleId: "atlas-cards",
		});

		expect(
			await page.evaluate(() =>
				window.MindBraidVisualFixture.selectVisualTopic("longTask"),
			),
		).toBe(true);
		await waitForFixture(page);
		await expect(page.locator(VISUAL_ROOT)).toHaveScreenshot(
			"selected-long-topic.png",
		);

		expect(
			await page.evaluate(() =>
				window.MindBraidVisualFixture.beginEditingVisualTopic("longTask"),
			),
		).toBe(true);
		await expect(page.locator(".obmind-node-editor")).toBeVisible();
		await expect(page.locator(VISUAL_ROOT)).toHaveScreenshot(
			"inline-topic-editor.png",
		);

		await mountFixture(page, {
			colorScheme: "light",
			paletteId: "retro-autumn",
			styleId: "atlas-cards",
		});
		expect(
			await page.evaluate(() =>
				window.MindBraidVisualFixture.collapseVisualTopic("discoverProblem"),
			),
		).toBe(true);
		await waitForFixture(page);
		await expect(page.locator(".obmind-node-collapsed .obmind-node-toggle")).toBeVisible();
		await expect(page.locator(VISUAL_ROOT)).toHaveScreenshot(
			"collapsed-disclosure-count.png",
		);
	});

	test("renders the Appearance and Layout inspector panels", async ({ page }) => {
		await mountFixture(page, {
			colorScheme: "dark",
			paletteId: "morandi-mint",
			styleId: "pencil-sketch",
		});

		expect(
			await page.evaluate(() =>
				window.MindBraidVisualFixture.showVisualSidebar("appearance"),
			),
		).toBe(true);
		await waitForFixture(page);
		await expect(page.locator(".obmind-sidebar")).toHaveScreenshot(
			"sidebar-appearance.png",
		);

		expect(
			await page.evaluate(() =>
				window.MindBraidVisualFixture.showVisualSidebar("layout"),
			),
		).toBe(true);
		await waitForFixture(page);
		await expect(page.locator(".obmind-sidebar")).toHaveScreenshot(
			"sidebar-layout.png",
		);
	});

	test("renders and explicitly acknowledges the large-map safety notice", async ({
		page,
	}) => {
		await mountFixture(page, {
			colorScheme: "dark",
			paletteId: "retro-autumn",
			styleId: "atlas-cards",
		});
		await page.evaluate(() => window.MindBraidVisualFixture.showVisualLargeMapGuard());
		await waitForFixture(page);

		const notice = page.locator(".obmind-large-map-notice");
		await expect(notice).toBeVisible();
		await expect(notice).toHaveScreenshot("large-map-protection.png");
		await notice.locator(".obmind-large-map-notice-action").click();
		await expect(notice).toBeHidden();
	});
});

async function mountFixture(page: Page, options: FixtureOptions): Promise<void> {
	await page.setContent('<div id="obmind-visual-root" class="obmind-view"></div>');
	await page.addStyleTag({ content: MIND_BRAID_VISUAL_HOST_CSS });
	await page.addStyleTag({ path: "styles.css" });
	await page.addScriptTag({ path: FIXTURE_BUNDLE });
	await page.evaluate((fixtureOptions) => {
		const container = document.querySelector<HTMLElement>("#obmind-visual-root");
		if (container === null) {
			throw new Error("Visual fixture root is missing.");
		}
		window.MindBraidVisualFixture.mountVisualFixture(container, fixtureOptions);
	}, options);
	await waitForFixture(page);
}

async function waitForFixture(page: Page): Promise<void> {
	await page.evaluate(() => window.MindBraidVisualFixture.waitForVisualFixture());
}
