import { describe, expect, it } from "vitest";

import { BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION } from "../src/application/composition/built-in-composition";
import { localizeMindMapFrontendCapabilities } from "../src/i18n/capability-i18n";
import { createObMindTranslator } from "../src/i18n/i18n";

describe("Obsidian host i18n catalog", () => {
	it("localizes host notices with named numeric values", () => {
		const chinese = createObMindTranslator("zh-CN");
		const english = createObMindTranslator("en");

		expect(
			chinese.t("notice.import-complete", {
				count: chinese.formatNumber(12345),
				path: "Maps/Plan.md",
			}),
		).toContain("已将");
		expect(
			english.t("notice.import-complete", {
				count: english.formatNumber(12345),
				path: "Maps/Plan.md",
			}),
		).toBe("Imported 12,345 topics to Maps/Plan.md.");
	});

	it("keeps language option labels self-identifying", () => {
		for (const language of ["zh-CN", "en"] as const) {
			const translator = createObMindTranslator(language);
			expect(translator.t("language.zh-CN")).toBe("简体中文");
			expect(translator.t("language.en")).toBe("English");
		}
	});
});

describe("localized capability snapshots", () => {
	it("translates built-ins by stable ID and preserves custom labels", () => {
		const capabilities = BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities;
		const customStyle = {
			...capabilities.styles[0]!,
			id: "user-style-demo",
			label: "My paper style",
			origin: "user" as const,
			editable: true,
		};
		const customPalette = {
			...capabilities.palettes[0]!,
			id: "user-palette-demo",
			label: "My summer palette",
			origin: "user" as const,
			editable: true,
		};
		const localized = localizeMindMapFrontendCapabilities(
			{
				...capabilities,
				styles: [...capabilities.styles, customStyle],
				palettes: [...capabilities.palettes, customPalette],
			},
			"zh-CN",
		);

		expect(
			localized.styles.find(({ id }) => id === "pencil-sketch")?.label,
		).toBe("铅笔手绘");
		expect(
			localized.palettes.find(({ id }) => id === "morandi-mint")?.label,
		).toBe("莫兰迪薄荷");
		expect(
			localized.styles.find(({ id }) => id === "user-style-demo")?.label,
		).toBe("My paper style");
		expect(
			localized.palettes.find(({ id }) => id === "user-palette-demo")?.label,
		).toBe("My summer palette");
	});
});
