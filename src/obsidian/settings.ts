import {
	App,
	PluginSettingTab,
	Setting,
} from "obsidian";

import {
	MAX_LAYOUT_SPACING,
	MIN_LAYOUT_SPACING,
	DEFAULT_SETTINGS,
	clampLayoutSpacingValue,
	isAppearanceMode,
	isLayoutOrientation,
} from "../application/config";
import {
	createObMindTranslator,
	isObMindLanguage,
	type ObMindTranslationKey,
} from "../i18n/i18n";
import type ObMindPlugin from "./main";

type ObMindSettingDefinitionItem = PluginSettingTab extends {
	getSettingDefinitions(): Array<infer Item>;
}
	? Item
	: Record<string, unknown>;

export {
	DEFAULT_SETTINGS,
	isAppearanceMode,
	isLayoutDirection,
	isLayoutEngineId,
	isLayoutOrientation,
	isMindMapPaletteId,
	isMindMapStyleId,
	normalizeObMindSettings,
	requireDefaultLayoutDirection,
	type ObMindAppearanceMode,
	type ObMindSettings,
} from "../application/config";

const SPACING_DEFINITIONS = [
	{
		key: "level",
		nameKey: "settings.spacing.level.name",
		descriptionKey: "settings.spacing.level.description",
	},
	{
		key: "sibling",
		nameKey: "settings.spacing.sibling.name",
		descriptionKey: "settings.spacing.sibling.description",
	},
	{
		key: "subtree",
		nameKey: "settings.spacing.subtree.name",
		descriptionKey: "settings.spacing.subtree.description",
	},
] as const satisfies readonly {
	readonly key: "level" | "sibling" | "subtree";
	readonly nameKey: ObMindTranslationKey;
	readonly descriptionKey: ObMindTranslationKey;
}[];

export class ObMindSettingTab extends PluginSettingTab {
	public constructor(app: App, private readonly obMindPlugin: ObMindPlugin) {
		super(app, obMindPlugin);
	}

	public display(): void {
		this.renderSettings();
	}

	private renderSettings(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("obmind-settings");

		const translator = this.translator();
		const capabilities = this.obMindPlugin.getMindMapFrontendCapabilities();

		new Setting(containerEl)
			.setName(translator.t("language.setting.name"))
			.setDesc(translator.t("language.setting.description"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("zh-CN", translator.t("language.zh-CN"))
					.addOption("en", translator.t("language.en"))
					.setValue(this.obMindPlugin.settings.language)
					.onChange(async (value) => {
						if (!isObMindLanguage(value)) {
							return;
						}
						await this.obMindPlugin.setMindMapLanguage(value);
					});
			});

		new Setting(containerEl)
			.setName(translator.t("settings.appearance.name"))
			.setDesc(translator.t("settings.appearance.description"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("system", translator.t("appearance.system"))
					.addOption("light", translator.t("appearance.light"))
					.addOption("dark", translator.t("appearance.dark"))
					.setValue(this.obMindPlugin.settings.appearanceMode)
					.onChange(async (value) => {
						if (isAppearanceMode(value)) {
							await this.obMindPlugin.setAppearanceMode(value);
						}
					});
			});

		new Setting(containerEl)
			.setName(translator.t("settings.default-layout.name"))
			.setDesc(translator.t("settings.default-layout.description"))
			.addDropdown((dropdown) => {
				for (const layout of capabilities.layouts) {
					dropdown.addOption(layout.engineId, layout.label);
				}
				dropdown
					.setValue(this.obMindPlugin.settings.layoutEngineId)
					.onChange(async (value) => {
						if (
							capabilities.layouts.some(
								({ engineId }) => engineId === value,
							)
						) {
							await this.obMindPlugin.setLayoutEngineId(value);
						}
					});
			});

		new Setting(containerEl)
			.setName(translator.t("settings.layout-direction.name"))
			.setDesc(translator.t("settings.layout-direction.description"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption(
						"left-to-right",
						translator.t("direction.left-to-right"),
					)
					.addOption(
						"right-to-left",
						translator.t("direction.right-to-left"),
					)
					.addOption(
						"top-to-bottom",
						translator.t("direction.top-to-bottom"),
					)
					.addOption(
						"bottom-to-top",
						translator.t("direction.bottom-to-top"),
					)
					.setValue(this.obMindPlugin.settings.layoutOrientation)
					.onChange(async (value) => {
						if (isLayoutOrientation(value)) {
							await this.obMindPlugin.setLayoutDirection(value);
						}
					});
			});

		for (const definition of SPACING_DEFINITIONS) {
			new Setting(containerEl)
				.setName(translator.t(definition.nameKey))
				.setDesc(translator.t(definition.descriptionKey))
				.addSlider((slider) => {
					slider
						.setLimits(MIN_LAYOUT_SPACING, MAX_LAYOUT_SPACING, 4)
						.setValue(
							this.obMindPlugin.settings.layoutSpacing[definition.key],
						)
						.onChange(async (value) => {
							await this.obMindPlugin.setLayoutSpacing({
								...this.obMindPlugin.settings.layoutSpacing,
								[definition.key]: clampLayoutSpacingValue(
									value,
									this.obMindPlugin.settings.layoutSpacing[
										definition.key
									],
								),
							});
						});
				});
		}

		new Setting(containerEl)
			.setName(translator.t("settings.default-style.name"))
			.setDesc(translator.t("settings.default-style.description"))
			.addDropdown((dropdown) => {
				for (const style of capabilities.styles) {
					dropdown.addOption(style.id, style.label);
				}
				dropdown
					.setValue(this.obMindPlugin.settings.styleId)
					.onChange(async (value) => {
						if (capabilities.styles.some(({ id }) => id === value)) {
							await this.obMindPlugin.setStyleId(value);
						}
					});
			});

		new Setting(containerEl)
			.setName(translator.t("settings.default-palette.name"))
			.setDesc(translator.t("settings.default-palette.description"))
			.addDropdown((dropdown) => {
				for (const palette of capabilities.palettes) {
					dropdown.addOption(palette.id, palette.label);
				}
				dropdown
					.setValue(this.obMindPlugin.settings.paletteId)
					.onChange(async (value) => {
						if (capabilities.palettes.some(({ id }) => id === value)) {
							await this.obMindPlugin.setPaletteId(value);
						}
					});
			});
	}

	/** Re-renders an open settings pane after another UI changes language. */
	public refreshLanguage(): void {
		if (this.containerEl.isConnected) {
			this.renderSettings();
		}
	}

	public getSettingDefinitions(): ObMindSettingDefinitionItem[] {
		const translator = this.translator();
		const capabilities = this.obMindPlugin.getMindMapFrontendCapabilities();
		const layoutOptions = Object.fromEntries(
			capabilities.layouts.map(({ engineId, label }) => [engineId, label]),
		);
		const styleOptions = Object.fromEntries(
			capabilities.styles.map(({ id, label }) => [id, label]),
		);
		const paletteOptions = Object.fromEntries(
			capabilities.palettes.map(({ id, label }) => [id, label]),
		);

		return [
			{
				name: translator.t("language.setting.name"),
				desc: translator.t("language.setting.description"),
				control: {
					type: "dropdown",
					key: "language",
					defaultValue: DEFAULT_SETTINGS.language,
					options: {
						"zh-CN": translator.t("language.zh-CN"),
						en: translator.t("language.en"),
					},
				},
			},
			{
				name: translator.t("settings.appearance.name"),
				desc: translator.t("settings.appearance.description"),
				control: {
					type: "dropdown",
					key: "appearanceMode",
					defaultValue: DEFAULT_SETTINGS.appearanceMode,
					options: {
						system: translator.t("appearance.system"),
						light: translator.t("appearance.light"),
						dark: translator.t("appearance.dark"),
					},
				},
			},
			{
				name: translator.t("settings.default-layout.name"),
				desc: translator.t("settings.default-layout.description"),
				control: {
					type: "dropdown",
					key: "layoutEngineId",
					defaultValue: DEFAULT_SETTINGS.layoutEngineId,
					options: layoutOptions,
				},
			},
			{
				name: translator.t("settings.layout-direction.name"),
				desc: translator.t("settings.layout-direction.description"),
				control: {
					type: "dropdown",
					key: "layoutDirection",
					defaultValue: DEFAULT_SETTINGS.layoutOrientation,
					options: {
						"left-to-right": translator.t("direction.left-to-right"),
						"right-to-left": translator.t("direction.right-to-left"),
						"top-to-bottom": translator.t("direction.top-to-bottom"),
						"bottom-to-top": translator.t("direction.bottom-to-top"),
					},
				},
			},
			...SPACING_DEFINITIONS.map((definition) => ({
				name: translator.t(definition.nameKey),
				desc: translator.t(definition.descriptionKey),
				control: {
					type: "slider" as const,
					key: `layoutSpacing.${definition.key}`,
					defaultValue: DEFAULT_SETTINGS.layoutSpacing[definition.key],
					min: MIN_LAYOUT_SPACING,
					max: MAX_LAYOUT_SPACING,
					step: 4,
					displayFormat: (value: number) =>
						translator.t("settings.spacing.pixels", { value }),
				},
			})),
			{
				name: translator.t("settings.default-style.name"),
				desc: translator.t("settings.default-style.description"),
				control: {
					type: "dropdown",
					key: "styleId",
					defaultValue: DEFAULT_SETTINGS.styleId,
					options: styleOptions,
				},
			},
			{
				name: translator.t("settings.default-palette.name"),
				desc: translator.t("settings.default-palette.description"),
				control: {
					type: "dropdown",
					key: "paletteId",
					defaultValue: DEFAULT_SETTINGS.paletteId,
					options: paletteOptions,
				},
			},
		];
	}

	public getControlValue(key: string): unknown {
		if (key === "language") {
			return this.obMindPlugin.settings.language;
		}
		if (key === "appearanceMode") {
			return this.obMindPlugin.settings.appearanceMode;
		}
		if (key === "layoutEngineId") {
			return this.obMindPlugin.settings.layoutEngineId;
		}
		if (key === "layoutDirection") {
			return this.obMindPlugin.settings.layoutOrientation;
		}
		if (key.startsWith("layoutSpacing.")) {
			const spacingKey = key.slice("layoutSpacing.".length);
			if (
				spacingKey === "level" ||
				spacingKey === "sibling" ||
				spacingKey === "subtree"
			) {
				return this.obMindPlugin.settings.layoutSpacing[spacingKey];
			}
		}
		if (key === "styleId") {
			return this.obMindPlugin.settings.styleId;
		}
		if (key === "paletteId") {
			return this.obMindPlugin.settings.paletteId;
		}

		return undefined;
	}

	public async setControlValue(key: string, value: unknown): Promise<void> {
		const capabilities = this.obMindPlugin.getMindMapFrontendCapabilities();
		if (key === "language" && isObMindLanguage(value)) {
			await this.obMindPlugin.setMindMapLanguage(value);
			return;
		}
		if (key === "appearanceMode" && isAppearanceMode(value)) {
			await this.obMindPlugin.setAppearanceMode(value);
			return;
		}
		if (
			key === "layoutEngineId" &&
			typeof value === "string" &&
			capabilities.layouts.some(({ engineId }) => engineId === value)
		) {
			await this.obMindPlugin.setLayoutEngineId(value);
			return;
		}
		if (key === "layoutDirection" && isLayoutOrientation(value)) {
			await this.obMindPlugin.setLayoutDirection(value);
			return;
		}
		if (key.startsWith("layoutSpacing.") && typeof value === "number") {
			const spacingKey = key.slice("layoutSpacing.".length);
			if (
				spacingKey === "level" ||
				spacingKey === "sibling" ||
				spacingKey === "subtree"
			) {
				await this.obMindPlugin.setLayoutSpacing({
					...this.obMindPlugin.settings.layoutSpacing,
					[spacingKey]: clampLayoutSpacingValue(
						value,
						this.obMindPlugin.settings.layoutSpacing[spacingKey],
					),
				});
				return;
			}
		}
		if (
			key === "styleId" &&
			typeof value === "string" &&
			capabilities.styles.some(({ id }) => id === value)
		) {
			await this.obMindPlugin.setStyleId(value);
			return;
		}
		if (
			key === "paletteId" &&
			typeof value === "string" &&
			capabilities.palettes.some(({ id }) => id === value)
		) {
			await this.obMindPlugin.setPaletteId(value);
		}
	}

	private translator() {
		return createObMindTranslator(this.obMindPlugin.getMindMapLanguage());
	}
}
