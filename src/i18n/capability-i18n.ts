import type {
	MindMapFrontendCapabilities,
	MindMapLayoutOptionCapability,
} from "../ui/frontend";
import {
	createObMindTranslator,
	getObMindTranslationKeys,
	type ObMindLanguage,
	type ObMindTranslationKey,
} from "./i18n";

type BuiltInCapabilityNamespace =
	| "layout"
	| "style"
	| "palette"
	| "font"
	| "connector-width"
	| "connector-profile"
	| "effect"
	| "asset"
	| "export";

/**
 * Creates a display-only capability snapshot for one language. Stable IDs and
 * all executable specs remain unchanged. User Style/Palette labels are kept
 * literally because they are user-authored data, not product copy.
 */
export function localizeMindMapFrontendCapabilities(
	capabilities: MindMapFrontendCapabilities,
	language: ObMindLanguage,
): MindMapFrontendCapabilities {
	const translator = createObMindTranslator(language);
	const translateRegistered = (
		namespace: BuiltInCapabilityNamespace,
		id: string,
		fallback: string,
	): string => {
		const key = `capability.${namespace}.${id}` as ObMindTranslationKey;
		return hasTranslationKey(key) ? translator.t(key) : fallback;
	};

	return {
		...capabilities,
		layouts: capabilities.layouts.map((layout) => ({
			...layout,
			label: translateRegistered("layout", layout.engineId, layout.label),
			spacing:
				layout.spacing === undefined
					? undefined
					: {
							level: {
								...layout.spacing.level,
								label: translator.t("capability.spacing.level"),
							},
							sibling: {
								...layout.spacing.sibling,
								label: translator.t("capability.spacing.sibling"),
							},
							subtree: {
								...layout.spacing.subtree,
								label: translator.t("capability.spacing.subtree"),
						},
					},
			options: layout.options.map((option) =>
				localizeLayoutOption(option, (key, values) =>
					translator.t(key, values),
				),
			),
		})),
		styles: capabilities.styles.map((style) => ({
			...style,
			label:
				style.origin === "built-in"
					? translateRegistered("style", style.id, style.label)
					: style.label,
		})),
		palettes: capabilities.palettes.map((palette) => ({
			...palette,
			label:
				palette.origin === "built-in"
					? translateRegistered("palette", palette.id, palette.label)
					: palette.label,
		})),
		globalFonts: capabilities.globalFonts.map((font) => ({
			...font,
			label: translateRegistered("font", font.id, font.label),
		})),
		connectorWidths: capabilities.connectorWidths.map((width) => ({
			...width,
			label: translateRegistered(
				"connector-width",
				width.id,
				width.label,
			),
		})),
		connectorProfiles: capabilities.connectorProfiles.map((profile) => ({
			...profile,
			label: translateRegistered(
				"connector-profile",
				profile.id,
				profile.label,
			),
		})),
		renderEffects: capabilities.renderEffects.map((effect) => ({
			...effect,
			label: translateRegistered("effect", effect.id, effect.label),
		})),
		assets: capabilities.assets.map((asset) => ({
			...asset,
			label: translateRegistered("asset", asset.id, asset.label),
		})),
		export: {
			...capabilities.export,
			encoders: capabilities.export.encoders.map((encoder) => ({
				...encoder,
				label: translateRegistered(
					"export",
					encoder.format,
					encoder.label,
				),
			})),
		},
	};
}

function localizeLayoutOption(
	option: MindMapLayoutOptionCapability,
	t: (
		key: ObMindTranslationKey,
		values?: Readonly<Record<string, string | number>>,
	) => string,
): MindMapLayoutOptionCapability {
	const labelKey =
		`capability.layout-option.${option.key}.label` as ObMindTranslationKey;
	const descriptionKey =
		`capability.layout-option.${option.key}.description` as ObMindTranslationKey;
	const label = hasTranslationKey(labelKey) ? t(labelKey) : option.label;
	const description =
		option.description === undefined
			? undefined
			: hasTranslationKey(descriptionKey)
				? t(descriptionKey)
				: option.description;
	if (option.type !== "select") {
		return {
			...option,
			label,
			description,
		};
	}
	return {
		...option,
		label,
		description,
		choices: option.choices.map((choice) => {
			const key =
				`capability.layout-option.${option.key}.choice.${choice.value}` as ObMindTranslationKey;
			return {
				...choice,
				label: hasTranslationKey(key) ? t(key) : choice.label,
			};
		}),
	};
}

const TRANSLATION_KEY_SET = new Set<string>(getObMindTranslationKeys());

function hasTranslationKey(key: string): key is ObMindTranslationKey {
	return TRANSLATION_KEY_SET.has(key);
}
