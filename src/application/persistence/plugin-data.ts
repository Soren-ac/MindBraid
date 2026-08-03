import {
	createAnnotationStore,
	deserializeAnnotationStore,
	hydrateDocumentAnnotations,
	serializeAnnotationStore,
	type AnnotationStore,
} from "./annotations";
import {
	createObMindSettingsRegistries,
	normalizeObMindSettings,
	type ObMindSettingsRegistries,
	type ObMindSettings,
} from "../config";
import {
	BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
} from "../../ui/dom-svg-effects";
import type { MindMapFrontendCapabilities } from "../../ui/frontend";
import {
	BUILT_IN_MIND_MAP_LAYOUT_ENGINE_REGISTRY,
	DEFAULT_MIND_MAP_LAYOUT_ENGINE_ID,
} from "../../layout/layouts";
import type { MindMapDocument } from "../../core/model";
import type { MindMapPresentation } from "../../presentation/presentation";
import {
	cloneMindMapPresentationLibrary,
	createMindMapPresentationLibrary,
	normalizeMindMapPresentationLibrary,
	type MindMapPresentationLibrary,
	type MindMapPresentationLibraryValidators,
} from "../../presentation/presentation-library";
import {
	createMindMapPaletteRegistry,
	isBuiltInMindMapPaletteId,
} from "../../presentation/palettes";
import {
	createMindMapStyleRegistry,
	isBuiltInMindMapStyleId,
} from "../../presentation/styles";
import {
	BUILT_IN_MIND_MAP_PALETTE_SPECS,
	BUILT_IN_MIND_MAP_STYLE_SPECS,
	DEFAULT_MIND_MAP_PALETTE_ID,
	DEFAULT_MIND_MAP_STYLE_ID,
	createMindMapThemeCompositionRegistry,
} from "../../presentation/themes";

export const OBMIND_PLUGIN_DATA_VERSION = 2;

export interface ObMindPluginData {
	readonly version: typeof OBMIND_PLUGIN_DATA_VERSION;
	readonly settings: ObMindSettings;
	readonly annotations: AnnotationStore;
	readonly presentationLibrary: MindMapPresentationLibrary;
}

export interface ObMindPluginDataLoadResult {
	readonly data: ObMindPluginData;
	readonly migrated: boolean;
}

/**
 * Dependencies supplied by the active frontend composition while loading
 * plugin data. Loading custom definitions happens before this factory runs,
 * which lets settings accept valid custom IDs without hard-coding them.
 */
export interface ObMindPluginDataNormalizationOptions {
	readonly presentationLibraryValidators?: MindMapPresentationLibraryValidators;
	readonly createSettingsRegistries?: (
		library: MindMapPresentationLibrary,
	) => ObMindSettingsRegistries;
}

/**
 * Optional override used by trusted in-memory construction paths. Serialized
 * input must use `ObMindPluginDataNormalizationOptions` so its custom library
 * is normalized before an active registry is created.
 */
export interface ObMindPluginDataCreationOptions {
	readonly settingsRegistries?: ObMindSettingsRegistries;
}

export type ObMindPluginDataMutation = (
	current: ObMindPluginData,
) => ObMindPluginData;

/**
 * Host-independent serialized persistence boundary. Each mutation runs only
 * after prior writes settle, against the most recent successfully committed
 * snapshot. Failed writes do not advance that snapshot or poison later saves.
 */
export class SerializedObMindPluginDataStore {
	private committed: ObMindPluginData;
	private saveTail: Promise<void> = Promise.resolve();
	private closed = false;

	public constructor(
		initial: ObMindPluginData,
		private readonly persist: (data: ObMindPluginData) => Promise<void>,
	) {
		this.committed = cloneObMindPluginData(initial);
	}

	public getSnapshot(): ObMindPluginData {
		return cloneObMindPluginData(this.committed);
	}

	public update(mutation: ObMindPluginDataMutation): Promise<void> {
		if (this.closed) {
			return Promise.resolve();
		}

		const save = this.saveTail.then(async () => {
			// Closing stops work that has not reached the persistence boundary yet.
			if (this.closed) {
				return;
			}

			const next = cloneObMindPluginData(
				mutation(cloneObMindPluginData(this.committed)),
			);
			await this.persist(cloneObMindPluginData(next));
			this.committed = next;
		});
		this.saveTail = save.then(
			() => undefined,
			() => undefined,
		);
		return save;
	}

	public close(): void {
		this.closed = true;
	}
}

/**
 * Normalize `Plugin.loadData()` without trusting unknown nested values.
 *
 * Pre-envelope releases wrote settings directly at the root; those values are
 * accepted as a migration source. Corrupt annotation data falls back to an
 * empty store without discarding otherwise valid settings.
 */
export function normalizeObMindPluginData(
	value: unknown,
	options: ObMindPluginDataNormalizationOptions = {},
): ObMindPluginDataLoadResult {
	if (isRecord(value) && value.version === OBMIND_PLUGIN_DATA_VERSION) {
		const rawSettings = isRecord(value.settings) ? value.settings : {};
		const annotations = deserializeAnnotationStore(value.annotations);
		const presentationLibrary = normalizePresentationLibrary(
			value.presentationLibrary,
			options,
		);
		const settingsRegistries = createSettingsRegistries(
			presentationLibrary.library,
			options,
		);
		const settings = normalizeObMindSettings(
			rawSettings,
			settingsRegistries,
		);
		return {
			data: {
				version: OBMIND_PLUGIN_DATA_VERSION,
				settings,
				annotations: annotations?.store ?? createAnnotationStore(),
				presentationLibrary: presentationLibrary.library,
			},
			migrated:
				annotations === null ||
				annotations.migrated ||
				presentationLibrary.migrated ||
				!settingsEqual(settings, rawSettings),
		};
	}
	if (isRecord(value) && value.version === 1) {
		const rawSettings = isRecord(value.settings) ? value.settings : {};
		const annotations = deserializeAnnotationStore(value.annotations);
		const presentationLibrary = normalizePresentationLibrary(undefined, options);
		const settings = normalizeObMindSettings(
			rawSettings,
			createSettingsRegistries(presentationLibrary.library, options),
		);
		return {
			data: {
				version: OBMIND_PLUGIN_DATA_VERSION,
				settings,
				annotations: annotations?.store ?? createAnnotationStore(),
				presentationLibrary: presentationLibrary.library,
			},
			migrated: true,
		};
	}
	const presentationLibrary = normalizePresentationLibrary(undefined, options);
	const settings = normalizeObMindSettings(
		value,
		createSettingsRegistries(presentationLibrary.library, options),
	);

	return {
		data: {
			version: OBMIND_PLUGIN_DATA_VERSION,
			settings,
			annotations: createAnnotationStore(),
			presentationLibrary: presentationLibrary.library,
		},
		migrated: true,
	};
}

export function createObMindPluginData(
	settings: ObMindSettings,
	annotations: AnnotationStore,
	presentationLibrary: MindMapPresentationLibrary =
		createMindMapPresentationLibrary(),
	options: ObMindPluginDataCreationOptions = {},
): ObMindPluginData {
	const normalizedAnnotations = deserializeAnnotationStore(annotations);
	if (normalizedAnnotations === null) {
		throw new TypeError("Cannot create plugin data from invalid annotations.");
	}
	const clonedLibrary = cloneMindMapPresentationLibrary(presentationLibrary);
	const settingsRegistries =
		options.settingsRegistries ??
		createObMindSettingsRegistriesForPresentationLibrary(clonedLibrary);
	return {
		version: OBMIND_PLUGIN_DATA_VERSION,
		settings: normalizeObMindSettings(settings, settingsRegistries),
		annotations: normalizedAnnotations.store,
		presentationLibrary: clonedLibrary,
	};
}

/**
 * Refresh document-bound locators against the annotation state that is
 * current when a serialized mutation actually runs. Recomputing here avoids
 * writing an earlier hydration snapshot over a newer presentation save.
 */
export function refreshObMindPluginDocumentAnnotations(
	data: ObMindPluginData,
	document: MindMapDocument,
	basePresentation: MindMapPresentation,
	capabilities: MindMapFrontendCapabilities,
): ObMindPluginData {
	const refreshed = hydrateDocumentAnnotations(
		data.annotations,
		document,
		basePresentation,
		capabilities,
	);
	return serializeAnnotationStore(refreshed.store) ===
		serializeAnnotationStore(data.annotations)
		? data
		: createObMindPluginData(
			data.settings,
			refreshed.store,
			data.presentationLibrary,
		);
}

export function cloneObMindPluginData(
	data: ObMindPluginData,
): ObMindPluginData {
	return createObMindPluginData(
		data.settings,
		data.annotations,
		data.presentationLibrary,
	);
}

/**
 * Default safety adapters for the bundled DOM/SVG frontend. Other frontends
 * can inject their own effect and color policy through normalization options.
 */
export const BUILT_IN_MIND_MAP_PRESENTATION_LIBRARY_VALIDATORS: MindMapPresentationLibraryValidators =
	Object.freeze<MindMapPresentationLibraryValidators>({
		validateStyle(style) {
			createMindMapStyleRegistry(
				[style],
				BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
				style.id,
			);
		},
		validatePalette(palette) {
			createMindMapPaletteRegistry([palette], palette.id);
		},
		isStyleIdReserved: (styleId) => isBuiltInMindMapStyleId(styleId),
		isPaletteIdReserved: (paletteId) =>
			isBuiltInMindMapPaletteId(paletteId),
	});

/**
 * Builds the active default-ID registries after custom definitions have been
 * isolated and validated. It intentionally composes style and palette lists
 * only here; `config.ts` remains independent from presentation-library data.
 */
export function createObMindSettingsRegistriesForPresentationLibrary(
	library: MindMapPresentationLibrary,
): ObMindSettingsRegistries {
	const activeComposition = createMindMapThemeCompositionRegistry(
		BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
		[...BUILT_IN_MIND_MAP_STYLE_SPECS, ...library.styles],
		[...BUILT_IN_MIND_MAP_PALETTE_SPECS, ...library.palettes],
		DEFAULT_MIND_MAP_STYLE_ID,
		DEFAULT_MIND_MAP_PALETTE_ID,
	);
	return createObMindSettingsRegistries({
		layoutEngines: BUILT_IN_MIND_MAP_LAYOUT_ENGINE_REGISTRY,
		styles: activeComposition.styles,
		palettes: activeComposition.palettes,
		defaultLayoutEngineId: DEFAULT_MIND_MAP_LAYOUT_ENGINE_ID,
		defaultStyleId: DEFAULT_MIND_MAP_STYLE_ID,
		defaultPaletteId: DEFAULT_MIND_MAP_PALETTE_ID,
	});
}

function normalizePresentationLibrary(
	value: unknown,
	options: ObMindPluginDataNormalizationOptions,
) {
	return normalizeMindMapPresentationLibrary(
		value,
		options.presentationLibraryValidators ??
			BUILT_IN_MIND_MAP_PRESENTATION_LIBRARY_VALIDATORS,
	);
}

function createSettingsRegistries(
	library: MindMapPresentationLibrary,
	options: ObMindPluginDataNormalizationOptions,
): ObMindSettingsRegistries {
	return (
		options.createSettingsRegistries?.(library) ??
		createObMindSettingsRegistriesForPresentationLibrary(library)
	);
}

function settingsEqual(
	left: ObMindSettings,
	right: Record<string, unknown>,
): boolean {
	const spacing = right.layoutSpacing;
	return (
		right.appearanceMode === left.appearanceMode &&
		right.layoutOrientation === left.layoutOrientation &&
		right.layoutDirection === left.layoutDirection &&
		right.layoutEngineId === left.layoutEngineId &&
		right.styleId === left.styleId &&
		right.paletteId === left.paletteId &&
		isRecord(spacing) &&
		spacing.level === left.layoutSpacing.level &&
		spacing.sibling === left.layoutSpacing.sibling &&
		spacing.subtree === left.layoutSpacing.subtree
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
