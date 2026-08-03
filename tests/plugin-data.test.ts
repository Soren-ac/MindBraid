import { describe, expect, it } from "vitest";

import {
	captureDocumentAnnotations,
	createAnnotationStore,
	getDocumentAnnotationRecord,
	upsertDocumentAnnotationRecord,
} from "../src/application/persistence/annotations";
import { BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION } from "../src/application/composition/built-in-composition";
import {
	DEFAULT_SETTINGS,
	createObMindSettingsRegistries,
} from "../src/application/config";
import { parseMarkdown } from "../src/core/parser";
import {
	createDefaultMindMapPaletteSpec,
	createDefaultMindMapPresentation,
	createDefaultMindMapStyleSpec,
	literalColor,
} from "../src/presentation/presentation";
import {
	createObMindPluginData,
	normalizeObMindPluginData,
	OBMIND_PLUGIN_DATA_VERSION,
	refreshObMindPluginDocumentAnnotations,
	SerializedObMindPluginDataStore,
	type ObMindPluginData,
} from "../src/application/persistence/plugin-data";

describe("plugin data envelope", () => {
	it("migrates settings that predate the appearance selector", () => {
		const legacySettings = {
			layoutOrientation: DEFAULT_SETTINGS.layoutOrientation,
			layoutDirection: DEFAULT_SETTINGS.layoutDirection,
			layoutSpacing: DEFAULT_SETTINGS.layoutSpacing,
			layoutEngineId: DEFAULT_SETTINGS.layoutEngineId,
			themeId: "pencil-sketch",
		};

		const result = normalizeObMindPluginData({
			version: OBMIND_PLUGIN_DATA_VERSION,
			settings: legacySettings,
			annotations: createAnnotationStore(),
		});

		expect(result.migrated).toBe(true);
		expect(result.data.settings.appearanceMode).toBe("system");
	});

	it("migrates legacy root settings without losing valid choices", () => {
		const result = normalizeObMindPluginData({
			layoutDirection: "top-to-bottom",
			layoutEngineId: "tree",
			themeId: "pencil-sketch",
		});

		expect(result.migrated).toBe(true);
		expect(result.data).toMatchObject({
			version: OBMIND_PLUGIN_DATA_VERSION,
			settings: {
				layoutOrientation: "top-to-bottom",
				layoutDirection: "top-to-bottom",
			},
			annotations: { annotations: [], documents: [] },
		});
	});

	it("loads the current envelope and isolates malformed annotations", () => {
		const result = normalizeObMindPluginData({
			version: OBMIND_PLUGIN_DATA_VERSION,
			settings: DEFAULT_SETTINGS,
			annotations: { version: 99, annotations: [], documents: [] },
		});

		expect(result.migrated).toBe(true);
		expect(result.data.settings).toEqual(DEFAULT_SETTINGS);
		expect(result.data.annotations).toEqual(createAnnotationStore());
	});

	it("migrates annotation-store v3 inside the current plugin envelope", () => {
		const result = normalizeObMindPluginData({
			version: OBMIND_PLUGIN_DATA_VERSION,
			settings: DEFAULT_SETTINGS,
			annotations: {
				version: 3,
				annotations: [],
				documents: [],
			},
		});

		expect(result.migrated).toBe(true);
		expect(result.data.annotations).toEqual(createAnnotationStore());
	});

	it("clones valid settings and annotations into a current envelope", () => {
		const annotations = createAnnotationStore();
		const data = createObMindPluginData(DEFAULT_SETTINGS, annotations);

		expect(data).toEqual({
			version: OBMIND_PLUGIN_DATA_VERSION,
			settings: DEFAULT_SETTINGS,
			annotations,
			presentationLibrary: {
				version: 1,
				nextStyleOrdinal: 1,
				nextPaletteOrdinal: 1,
				styles: [],
				palettes: [],
			},
		});
		expect(data.settings).not.toBe(DEFAULT_SETTINGS);
	});

	it("migrates a v1 envelope to v2 with an empty custom library", () => {
		const result = normalizeObMindPluginData({
			version: 1,
			settings: {
				...DEFAULT_SETTINGS,
				styleId: "cloud",
				paletteId: "pencil-sketch",
			},
			annotations: createAnnotationStore(),
		});

		expect(result.migrated).toBe(true);
		expect(result.data.version).toBe(2);
		expect(result.data.settings).toMatchObject({
			styleId: "cloud",
			paletteId: "pencil-sketch",
		});
		expect(result.data.presentationLibrary.styles).toEqual([]);
		expect(result.data.presentationLibrary.palettes).toEqual([]);
	});

	it("loads valid custom definitions before normalizing settings and isolates broken sibling records", () => {
		const validStyle = {
			...createDefaultMindMapStyleSpec({
				id: "custom-style-1",
				label: "Custom geometry",
			}),
			revision: 1,
		};
		const validPalette = {
			...createDefaultMindMapPaletteSpec({
				id: "custom-palette-1",
				label: "Custom colors",
				lightColors: { canvas: literalColor("#fefefe") },
			}),
			revision: 1,
		};
		const invalidStyle = {
			...validStyle,
			id: "custom-style-2",
			tokens: {
				...validStyle.tokens,
				roles: {
					...validStyle.tokens.roles,
					root: {
						...validStyle.tokens.roles.root,
						fill: literalColor("#000000"),
					},
				},
			},
		};
		const invalidPalette = {
			...validPalette,
			id: "custom-palette-2",
			colors: {
				...validPalette.colors,
				canvas: { kind: "literal", value: "url(https://example.com)" },
			},
		};

		const result = normalizeObMindPluginData({
			version: OBMIND_PLUGIN_DATA_VERSION,
			settings: {
				...DEFAULT_SETTINGS,
				styleId: "custom-style-1",
				paletteId: "custom-palette-1",
			},
			annotations: createAnnotationStore(),
			presentationLibrary: {
				version: 1,
				nextStyleOrdinal: 1,
				nextPaletteOrdinal: 1,
				styles: [validStyle, invalidStyle],
				palettes: [validPalette, invalidPalette],
			},
		});

		expect(result.migrated).toBe(true);
		expect(result.data.presentationLibrary.styles.map(({ id }) => id)).toEqual([
			"custom-style-1",
		]);
		expect(result.data.presentationLibrary.palettes.map(({ id }) => id)).toEqual([
			"custom-palette-1",
		]);
		expect(result.data.settings).toMatchObject({
			styleId: "custom-style-1",
			paletteId: "custom-palette-1",
		});
	});

	it("preserves valid custom siblings that follow malformed records in an older library payload", () => {
		const validStyle = {
			...createDefaultMindMapStyleSpec({
				id: "custom-style-14",
				label: "Later valid style",
			}),
			revision: 1,
		};
		const validPalette = {
			...createDefaultMindMapPaletteSpec({
				id: "custom-palette-14",
				label: "Later valid palette",
			}),
			revision: 1,
		};

		const result = normalizeObMindPluginData({
			version: OBMIND_PLUGIN_DATA_VERSION,
			settings: {
				...DEFAULT_SETTINGS,
				styleId: validStyle.id,
				paletteId: validPalette.id,
			},
			annotations: createAnnotationStore(),
			presentationLibrary: {
				version: 0,
				nextStyleOrdinal: 1,
				nextPaletteOrdinal: 1,
				styles: [
					{
						...validStyle,
						id: "custom-style-13",
						tokens: {
							...validStyle.tokens,
							edge: { ...validStyle.tokens.edge, color: literalColor("#000") },
						},
					},
					validStyle,
				],
				palettes: [
					{
						...validPalette,
						id: "custom-palette-13",
						colors: { ...validPalette.colors, maxWidth: 200 },
					},
					validPalette,
				],
			},
		});

		expect(result.migrated).toBe(true);
		expect(result.data.presentationLibrary.styles.map(({ id }) => id)).toEqual([
			"custom-style-14",
		]);
		expect(result.data.presentationLibrary.palettes.map(({ id }) => id)).toEqual([
			"custom-palette-14",
		]);
		expect(result.data.settings).toMatchObject({
			styleId: "custom-style-14",
			paletteId: "custom-palette-14",
		});
	});

	it("keeps a valid custom library when an unrelated v2 settings record is malformed", () => {
		const validStyle = {
			...createDefaultMindMapStyleSpec({
				id: "custom-style-9",
				label: "Preserved style",
			}),
			revision: 1,
		};
		const result = normalizeObMindPluginData({
			version: OBMIND_PLUGIN_DATA_VERSION,
			settings: null,
			annotations: createAnnotationStore(),
			presentationLibrary: {
				version: 1,
				nextStyleOrdinal: 10,
				nextPaletteOrdinal: 1,
				styles: [validStyle],
				palettes: [],
			},
		});

		expect(result.migrated).toBe(true);
		expect(result.data.settings).toEqual(DEFAULT_SETTINGS);
		expect(result.data.presentationLibrary.styles.map(({ id }) => id)).toEqual([
			"custom-style-9",
		]);
	});

	it("uses an injected active registry factory after normalizing the library", () => {
		const extensionRegistries = createObMindSettingsRegistries({
			layoutEngines: { has: (id) => id === "extension-layout" },
			styles: { has: (id) => id === "extension-style" },
			palettes: { has: (id) => id === "extension-palette" },
			defaultLayoutEngineId: "extension-layout",
			defaultStyleId: "extension-style",
			defaultPaletteId: "extension-palette",
		});
		let receivedLibraryVersion: number | null = null;
		const result = normalizeObMindPluginData(
			{
				version: OBMIND_PLUGIN_DATA_VERSION,
				settings: {
					...DEFAULT_SETTINGS,
					layoutEngineId: "extension-layout",
					styleId: "extension-style",
					paletteId: "extension-palette",
				},
				annotations: createAnnotationStore(),
				presentationLibrary: {
					version: 1,
					nextStyleOrdinal: 1,
					nextPaletteOrdinal: 1,
					styles: [],
					palettes: [],
				},
			},
			{
				createSettingsRegistries(library) {
					receivedLibraryVersion = library.version;
					return extensionRegistries;
				},
			},
		);

		expect(receivedLibraryVersion).toBe(1);
		expect(result.data.settings).toMatchObject({
			layoutEngineId: "extension-layout",
			styleId: "extension-style",
			paletteId: "extension-palette",
		});
	});

	it("commits queued mutations in order against successful state", async () => {
		const persisted: ObMindPluginData[] = [];
		const releases: Array<() => void> = [];
		const store = new SerializedObMindPluginDataStore(
			createObMindPluginData(DEFAULT_SETTINGS, createAnnotationStore()),
			(data) =>
				new Promise<void>((resolve) => {
					persisted.push(data);
					releases.push(resolve);
				}),
		);

		const first = store.update((data) =>
			createObMindPluginData(
				{
					...data.settings,
					layoutOrientation: "right-to-left",
					layoutDirection: "left-to-right",
					layoutSpacing: {
						...data.settings.layoutSpacing,
						level: 100,
					},
				},
				data.annotations,
			),
		);
		const second = store.update((data) =>
			createObMindPluginData(
				{
					...data.settings,
					layoutOrientation: "bottom-to-top",
					layoutDirection: "top-to-bottom",
				},
				data.annotations,
			),
		);

		expect(store.getSnapshot().settings).toEqual(DEFAULT_SETTINGS);
		await Promise.resolve();
		await Promise.resolve();
		expect(persisted.map((data) => data.settings.layoutOrientation)).toEqual([
			"right-to-left",
		]);
		releases.shift()?.();
		await first;
		expect(store.getSnapshot().settings.layoutOrientation).toBe(
			"right-to-left",
		);
		await Promise.resolve();
		await Promise.resolve();
		expect(persisted.map((data) => data.settings.layoutOrientation)).toEqual([
			"right-to-left",
			"bottom-to-top",
		]);
		expect(persisted[1]?.settings.layoutSpacing.level).toBe(100);
		releases.shift()?.();
		await second;
		expect(store.getSnapshot().settings).toMatchObject({
			layoutOrientation: "bottom-to-top",
			layoutDirection: "top-to-bottom",
			layoutSpacing: { level: 100 },
		});
	});

	it("continues after an adapter failure from the last committed snapshot", async () => {
		let callCount = 0;
		const persisted: ObMindPluginData[] = [];
		const store = new SerializedObMindPluginDataStore(
			createObMindPluginData(DEFAULT_SETTINGS, createAnnotationStore()),
			(data) => {
				callCount += 1;
				persisted.push(data);
				return callCount === 1
					? Promise.reject(new Error("first failed"))
					: Promise.resolve();
			},
		);

		await expect(
			store.update((data) =>
				createObMindPluginData(
					{
						...data.settings,
						layoutSpacing: {
							...data.settings.layoutSpacing,
							level: 100,
						},
					},
					data.annotations,
				),
			),
		).rejects.toThrow("first failed");
		expect(store.getSnapshot().settings).toEqual(DEFAULT_SETTINGS);

		await expect(
			store.update((data) =>
				createObMindPluginData(
					{
						...data.settings,
						layoutOrientation: "bottom-to-top",
						layoutDirection: "top-to-bottom",
					},
					data.annotations,
				),
			),
		).resolves.toBeUndefined();
		expect(callCount).toBe(2);
		expect(persisted[1]?.settings).toMatchObject({
			layoutOrientation: "bottom-to-top",
			layoutSpacing: DEFAULT_SETTINGS.layoutSpacing,
		});
		expect(store.getSnapshot().settings).toMatchObject({
			layoutOrientation: "bottom-to-top",
			layoutSpacing: DEFAULT_SETTINGS.layoutSpacing,
		});
	});

	it("rebases locator hydration over a newer queued presentation save", async () => {
		const previousDocument = parseMarkdown(
			"# Parent\n## Topic",
			"Map.md",
			"Map",
		);
		const nextDocument = parseMarkdown(
			"Intro\n# Parent\n## Topic",
			"Map.md",
			"Map",
		);
		const basePresentation =
			createDefaultMindMapPresentation("left-to-right");
		const topic = previousDocument.root.children[0]?.children[0];
		if (topic === undefined) {
			throw new Error("Expected a topic.");
		}
		const initialRecord = captureDocumentAnnotations(
			previousDocument,
			basePresentation,
			{
				...basePresentation,
				nodes: new Map([[topic.id, { shape: "ellipse" }]]),
			},
			new Set(),
			null,
		);
		const store = new SerializedObMindPluginDataStore(
			createObMindPluginData(
				DEFAULT_SETTINGS,
				upsertDocumentAnnotationRecord(
					createAnnotationStore(),
					initialRecord,
				),
			),
			() => Promise.resolve(),
		);

		await store.update((data) => {
			const current = getDocumentAnnotationRecord(
				data.annotations,
				"Map.md",
			);
			if (current === null) {
				throw new Error("Expected a persisted document record.");
			}
			return createObMindPluginData(
				data.settings,
				upsertDocumentAnnotationRecord(data.annotations, {
					...current,
					styleId: "cloud",
				}),
			);
		});
		await store.update((data) =>
			refreshObMindPluginDocumentAnnotations(
				data,
				nextDocument,
				basePresentation,
				BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities,
			),
		);

		const record = getDocumentAnnotationRecord(
			store.getSnapshot().annotations,
			"Map.md",
		);
		expect(record?.styleId).toBe("cloud");
		expect(record?.nodes[0]?.target.locator.sourceAnchor.line).toBe(2);
	});

	it("does not start queued persistence after close", async () => {
		const firstWrite = createDeferred();
		let persistCount = 0;
		let pendingMutationRan = false;
		const store = new SerializedObMindPluginDataStore(
			createObMindPluginData(DEFAULT_SETTINGS, createAnnotationStore()),
			() => {
				persistCount += 1;
				return firstWrite.promise;
			},
		);

		const first = store.update((data) =>
			createObMindPluginData(
				{
					...data.settings,
					layoutOrientation: "right-to-left",
					layoutDirection: "left-to-right",
				},
				data.annotations,
			),
		);
		const pending = store.update((data) => {
			pendingMutationRan = true;
			return createObMindPluginData(
				{
					...data.settings,
					layoutOrientation: "bottom-to-top",
					layoutDirection: "top-to-bottom",
				},
				data.annotations,
			);
		});

		await Promise.resolve();
		await Promise.resolve();
		expect(persistCount).toBe(1);
		store.close();
		firstWrite.resolve();

		await expect(first).resolves.toBeUndefined();
		await expect(pending).resolves.toBeUndefined();
		expect(persistCount).toBe(1);
		expect(pendingMutationRan).toBe(false);
		expect(store.getSnapshot().settings.layoutOrientation).toBe(
			"right-to-left",
		);
		await expect(store.update((data) => data)).resolves.toBeUndefined();
		expect(persistCount).toBe(1);
	});
});

function createDeferred(): {
	readonly promise: Promise<void>;
	readonly resolve: () => void;
} {
	let resolvePromise: (() => void) | null = null;
	const promise = new Promise<void>((resolve) => {
		resolvePromise = resolve;
	});
	return {
		promise,
		resolve: () => {
			resolvePromise?.();
		},
	};
}
