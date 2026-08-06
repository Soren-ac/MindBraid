import { describe, expect, it } from "vitest";

import { BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION } from "../src/application/composition/built-in-composition";
import { localizeMindMapFrontendCapabilities } from "../src/i18n/capability-i18n";
import {
	DEFAULT_OBMIND_LANGUAGE,
	ObMindLocalizedError,
	createObMindTranslator,
	getObMindMessageParameters,
	getObMindTranslationKeys,
	isObMindLanguage,
	localizeObMindError,
	normalizeObMindLanguage,
	translateObMind,
} from "../src/i18n/i18n";

describe("ObMind internationalization", () => {
	it("uses Simplified Chinese as the fresh-install and invalid-value fallback", () => {
		expect(DEFAULT_OBMIND_LANGUAGE).toBe("zh-CN");
		expect(normalizeObMindLanguage(undefined)).toBe("zh-CN");
		expect(normalizeObMindLanguage("fr")).toBe("zh-CN");
		expect(isObMindLanguage("zh-CN")).toBe(true);
		expect(isObMindLanguage("en")).toBe(true);
		expect(isObMindLanguage("zh-TW")).toBe(false);
	});

	it("translates stable keys with named interpolation", () => {
		expect(
			translateObMind("zh-CN", "view.title-for-file", {
				name: "项目计划",
			}),
		).toBe("思维导图：项目计划");
		expect(
			translateObMind("en", "view.title-for-file", {
				name: "Roadmap",
			}),
		).toBe("Mind map: Roadmap");
	});

	it("keeps named placeholders aligned between both catalogs", () => {
		for (const key of getObMindTranslationKeys()) {
			expect([...getObMindMessageParameters("zh-CN", key)].sort()).toEqual(
				[...getObMindMessageParameters("en", key)].sort(),
			);
		}
	});

	it("formats numbers with the explicitly selected locale", () => {
		const value = 1234567.89;
		for (const language of ["zh-CN", "en"] as const) {
			expect(
				createObMindTranslator(language).formatNumber(value, {
					maximumFractionDigits: 1,
				}),
			).toBe(
				new Intl.NumberFormat(language, {
					maximumFractionDigits: 1,
				}).format(value),
			);
		}
	});

	it("translates stable cross-boundary errors and hides arbitrary messages", () => {
		const translator = createObMindTranslator("zh-CN");
		expect(
			localizeObMindError(
				new ObMindLocalizedError("error.rename-conflict", {
					name: "Roadmap.md",
				}),
				translator,
				"common.unknown-error",
			),
		).toBe("当前位置已存在名为“Roadmap.md”的笔记。");
		expect(
			localizeObMindError(
				new Error("Raw adapter failure"),
				translator,
				"common.unknown-error",
			),
		).toBe("未知错误");
	});

	it("localizes built-in capabilities without changing their stable IDs", () => {
		const capabilities =
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities;
		const chinese = localizeMindMapFrontendCapabilities(
			capabilities,
			"zh-CN",
		);
		const english = localizeMindMapFrontendCapabilities(capabilities, "en");

		expect(chinese.layouts[0]?.engineId).toBe(
			english.layouts[0]?.engineId,
		);
		expect(chinese.layouts[0]?.label).toBe("平衡思维导图");
		expect(english.layouts[0]?.label).toBe("Balanced mind map");
		expect(
			chinese.palettes.find(({ id }) => id === "morandi-mint")?.label,
		).toBe("莫兰迪薄荷");
		expect(
			chinese.palettes.find(({ id }) => id === "coastal-ink")?.label,
		).toBe("海岸墨色");
		expect(
			chinese.palettes.find(({ id }) => id === "deep-lagoon")?.label,
		).toBe("深海潟湖");
		expect(
			chinese.palettes.find(({ id }) => id === "coral-tide")?.label,
		).toBe("珊瑚潮汐");
		expect(
			english.palettes.find(({ id }) => id === "coastal-ink")?.label,
		).toBe("Coastal Ink");
		expect(
			english.palettes.find(({ id }) => id === "deep-lagoon")?.label,
		).toBe("Deep Lagoon");
		expect(
			english.palettes.find(({ id }) => id === "coral-tide")?.label,
		).toBe("Coral Tide");
		expect(
			chinese.connectorProfiles.find(({ id }) => id === "uniform")
				?.label,
		).toBe("等宽");
		expect(
			chinese.renderEffects.find(({ id }) => id === "paper-grain")?.label,
		).toBe("纸张纹理");
		expect(chinese.styles.find(({ id }) => id === "cloud")?.label).toBe(
			"经典有机",
		);
		expect(
			chinese.styles.find(({ id }) => id === "swiss-editorial")?.label,
		).toBe("瑞士编辑风");
		expect(
			english.styles.find(({ id }) => id === "atlas-cards")?.label,
		).toBe("Atlas Cards");
		expect(
			chinese.styles.find(({ id }) => id === "technical-draft")?.label,
		).toBe("技术制图");
		expect(english.styles.find(({ id }) => id === "charcoal")?.label).toBe(
			"Charcoal",
		);
		expect(
			chinese.renderEffects.find(({ id }) => id === "technical-grid")
				?.label,
		).toBe("工程网格");
		expect(
			english.renderEffects.find(({ id }) => id === "charcoal-edge")?.label,
		).toBe("Charcoal connector");
	});

	it("provides translation keys for every built-in capability label", () => {
		const capabilities =
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities;
		const keys = new Set<string>(getObMindTranslationKeys());
		const expectedKeys = [
			...capabilities.layouts.map(
				({ engineId }) => `capability.layout.${engineId}`,
			),
			...capabilities.styles
				.filter(({ origin }) => origin === "built-in")
				.map(({ id }) => `capability.style.${id}`),
			...capabilities.palettes
				.filter(({ origin }) => origin === "built-in")
				.map(({ id }) => `capability.palette.${id}`),
			...capabilities.globalFonts.map(
				({ id }) => `capability.font.${id}`,
			),
			...capabilities.connectorWidths.map(
				({ id }) => `capability.connector-width.${id}`,
			),
			...capabilities.connectorProfiles.map(
				({ id }) => `capability.connector-profile.${id}`,
			),
			...capabilities.renderEffects.map(
				({ id }) => `capability.effect.${id}`,
			),
			...capabilities.export.encoders.map(
				({ format }) => `capability.export.${format}`,
			),
			...capabilities.layouts.flatMap(({ options }) =>
				options.flatMap((option) => [
					`capability.layout-option.${option.key}.label`,
					...(option.description === undefined
						? []
						: [`capability.layout-option.${option.key}.description`]),
					...(option.type === "select"
						? option.choices.map(
								({ value }) =>
									`capability.layout-option.${option.key}.choice.${value}`,
							)
						: []),
				]),
			),
		];

		expect(expectedKeys.filter((key) => !keys.has(key))).toEqual([]);
	});

	it("preserves user-authored Style and Palette labels literally", () => {
		const capabilities =
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities;
		const firstStyle = capabilities.styles[0];
		const firstPalette = capabilities.palettes[0];
		if (firstStyle === undefined || firstPalette === undefined) {
			throw new Error("Built-in presentation capabilities are unavailable.");
		}
		const localized = localizeMindMapFrontendCapabilities(
			{
				...capabilities,
				styles: [
					...capabilities.styles,
					{
						...firstStyle,
						id: "user-style",
						label: "我的样式 / My Style",
						origin: "user",
						editable: true,
					},
				],
				palettes: [
					...capabilities.palettes,
					{
						...firstPalette,
						id: "user-palette",
						label: "团队配色 2026",
						origin: "user",
						editable: true,
					},
				],
			},
			"en",
		);

		expect(localized.styles.at(-1)?.label).toBe("我的样式 / My Style");
		expect(localized.palettes.at(-1)?.label).toBe("团队配色 2026");
	});
});
