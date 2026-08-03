import {
	OBMIND_CORE_EN_MESSAGES,
	OBMIND_CORE_ZH_CN_MESSAGES,
} from "./i18n-core-catalog";
import {
	OBMIND_FRONTEND_EN_MESSAGES,
	OBMIND_FRONTEND_ZH_CN_MESSAGES,
} from "./i18n-frontend-catalog";
import {
	OBMIND_LIBRARY_EN_MESSAGES,
	OBMIND_LIBRARY_ZH_CN_MESSAGES,
} from "./i18n-library-catalog";
import {
	OBMIND_OBSIDIAN_EN_MESSAGES,
	OBMIND_OBSIDIAN_ZH_CN_MESSAGES,
} from "./i18n-obsidian-catalog";
import {
	OBMIND_RENDERER_EN_MESSAGES,
	OBMIND_RENDERER_ZH_CN_MESSAGES,
} from "./i18n-renderer-catalog";

export const OBMIND_LANGUAGES = Object.freeze(["zh-CN", "en"] as const);
export type ObMindLanguage = (typeof OBMIND_LANGUAGES)[number];

export const DEFAULT_OBMIND_LANGUAGE: ObMindLanguage = "zh-CN";

const EN_MESSAGES = {
	...OBMIND_CORE_EN_MESSAGES,
	...OBMIND_FRONTEND_EN_MESSAGES,
	...OBMIND_LIBRARY_EN_MESSAGES,
	...OBMIND_RENDERER_EN_MESSAGES,
	...OBMIND_OBSIDIAN_EN_MESSAGES,
} as const;

export type ObMindTranslationKey = keyof typeof EN_MESSAGES;
export type ObMindTranslationValue = string | number;
export type ObMindTranslationValues = Readonly<
	Record<string, ObMindTranslationValue>
>;

const ZH_CN_MESSAGES = {
	...OBMIND_CORE_ZH_CN_MESSAGES,
	...OBMIND_FRONTEND_ZH_CN_MESSAGES,
	...OBMIND_LIBRARY_ZH_CN_MESSAGES,
	...OBMIND_RENDERER_ZH_CN_MESSAGES,
	...OBMIND_OBSIDIAN_ZH_CN_MESSAGES,
} as const satisfies Record<ObMindTranslationKey, string>;

const CATALOGS: Readonly<
	Record<ObMindLanguage, Readonly<Record<ObMindTranslationKey, string>>>
> = Object.freeze({
	"zh-CN": ZH_CN_MESSAGES,
	en: EN_MESSAGES,
});

const NAMED_PARAMETER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

export interface ObMindTranslator {
	readonly language: ObMindLanguage;
	t(
		key: ObMindTranslationKey,
		values?: ObMindTranslationValues,
	): string;
	formatNumber(
		value: number,
		options?: Intl.NumberFormatOptions,
	): string;
}

/**
 * Carries stable product copy across host/frontend boundaries without freezing
 * the language at the throw site. The receiving UI translates the key using
 * its current language and treats all other Error messages as diagnostics.
 */
export class ObMindLocalizedError extends Error {
	public readonly values: ObMindTranslationValues;

	public constructor(
		public readonly translationKey: ObMindTranslationKey,
		values: ObMindTranslationValues = {},
	) {
		super(translationKey);
		this.name = "ObMindLocalizedError";
		this.values = Object.freeze({ ...values });
	}
}

export function isObMindLanguage(value: unknown): value is ObMindLanguage {
	return value === "zh-CN" || value === "en";
}

export function normalizeObMindLanguage(value: unknown): ObMindLanguage {
	return isObMindLanguage(value) ? value : DEFAULT_OBMIND_LANGUAGE;
}

export function createObMindTranslator(
	language: ObMindLanguage,
): ObMindTranslator {
	return Object.freeze({
		language,
		t: (
			key: ObMindTranslationKey,
			values?: ObMindTranslationValues,
		) => translateObMind(language, key, values),
		formatNumber: (
			value: number,
			options?: Intl.NumberFormatOptions,
		) =>
			new Intl.NumberFormat(language, options).format(value),
	});
}

export function translateObMind(
	language: ObMindLanguage,
	key: ObMindTranslationKey,
	values: ObMindTranslationValues = {},
): string {
	const message = CATALOGS[language][key];
	return message.replace(
		NAMED_PARAMETER_PATTERN,
		(fullMatch, parameter: string) => {
			const value = values[parameter];
			return value === undefined ? fullMatch : String(value);
		},
	);
}

/** Never exposes an arbitrary lower-level Error.message as product UI copy. */
export function localizeObMindError(
	error: unknown,
	translator: ObMindTranslator,
	fallbackKey: ObMindTranslationKey,
	fallbackValues: ObMindTranslationValues = {},
): string {
	return error instanceof ObMindLocalizedError
		? translator.t(error.translationKey, error.values)
		: translator.t(fallbackKey, fallbackValues);
}

/** Exposed for catalog and interpolation tests without exporting mutable maps. */
export function getObMindTranslationKeys(): readonly ObMindTranslationKey[] {
	return Object.freeze(Object.keys(EN_MESSAGES) as ObMindTranslationKey[]);
}

export function getObMindMessageParameters(
	language: ObMindLanguage,
	key: ObMindTranslationKey,
): readonly string[] {
	const parameters = new Set<string>();
	for (const match of CATALOGS[language][key].matchAll(
		NAMED_PARAMETER_PATTERN,
	)) {
		const parameter = match[1];
		if (parameter !== undefined) {
			parameters.add(parameter);
		}
	}
	return Object.freeze([...parameters]);
}
