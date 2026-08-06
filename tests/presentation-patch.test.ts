import { describe, expect, it } from "vitest";

import { BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION } from "../src/application/composition/built-in-composition";
import {
	applyMindMapPresentationPatch,
	createMindMapPresentationPatch,
} from "../src/presentation/presentation-patch";
import { createDefaultMindMapPresentation } from "../src/presentation/presentation";
import { TAG_LABEL_ASSET_ID } from "../src/presentation/assets";

const capabilities = BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities;

describe("presentation patches", () => {
	it("applies registered layouts, styles, palettes, and element overrides immutably", () => {
		const current = createDefaultMindMapPresentation("left-to-right");
		const next = applyMindMapPresentationPatch(
			current,
			{
				layout: {
					...current.layout,
					orientation: "bottom-to-top",
					spacing: { level: 96, sibling: 28, subtree: 36 },
				},
				styleId: capabilities.styles[0]!.id,
				paletteId: capabilities.palettes[1]!.id,
				nodes: new Map([
					["node:1", { shape: "pill", fill: { kind: "literal", value: "#abc" } }],
				]),
				edges: new Map([["edge:1", { routing: "straight", width: 2 }]]),
			},
			{
				capabilities,
				nodeIds: new Set(["node:1"]),
				edgeIds: new Set(["edge:1"]),
			},
		);

		expect(next).not.toBe(current);
		expect(next.revision).toBe(current.revision + 1);
		expect(next.layout.orientation).toBe("bottom-to-top");
		expect(next.theme.styleId).toBe(capabilities.styles[0]!.id);
		expect(next.theme.paletteId).toBe(capabilities.palettes[1]!.id);
		expect(next.nodes.get("node:1")).toMatchObject({ shape: "pill" });
		expect(current.nodes.size).toBe(0);
	});

	it("rejects unsupported capabilities, CSS-like colors, URLs, and unknown IDs", () => {
		const current = createDefaultMindMapPresentation("left-to-right");
		const context = {
			capabilities,
			nodeIds: new Set(["known"]),
			edgeIds: new Set<string>(),
		};

		expect(() =>
			applyMindMapPresentationPatch(
				current,
				{ styleId: "url(https://example.com)" },
				context,
			),
		).toThrow();
		expect(() =>
			applyMindMapPresentationPatch(
				current,
				{
					nodes: new Map([
						[
							"known",
							{
								fill: {
									kind: "literal",
									value: "url(https://example.com/image.png)",
								},
							},
						],
					]),
				},
				context,
			),
		).toThrow();
		expect(() =>
			applyMindMapPresentationPatch(
				current,
				{ nodes: new Map([["missing", { shape: "pill" }]]) },
				context,
			),
		).toThrow("Unknown presentation node");
		expect(() =>
			applyMindMapPresentationPatch(
				current,
				{
					layout: {
						...current.layout,
						engineId: "not-registered",
					},
				},
				context,
			),
		).toThrow("Unsupported layout engine");
	});

	it("derives a replayable sparse patch between snapshots", () => {
		const previous = createDefaultMindMapPresentation("left-to-right");
		const next = {
			...previous,
			revision: previous.revision + 1,
			layout: {
				...previous.layout,
				orientation: "right-to-left" as const,
			},
			nodes: new Map([["node:1", { maxWidth: 320 }]]),
		};
		const patch = createMindMapPresentationPatch(previous, next);
		const applied = applyMindMapPresentationPatch(previous, patch, {
			capabilities,
			nodeIds: new Set(["node:1"]),
			edgeIds: new Set(),
		});

		expect(applied.layout.orientation).toBe("right-to-left");
		expect(applied.nodes).toEqual(next.nodes);
	});

	it("keeps unrelated view overrides out of a replayed element patch", () => {
		const base = createDefaultMindMapPresentation("left-to-right");
		const viewPresentation = {
			...base,
			nodes: new Map([
				["node:view-only", { shape: "pill" as const }],
				["node:edited", { maxWidth: 200 }],
			]),
		};
		const preview = {
			...viewPresentation,
			revision: viewPresentation.revision + 1,
			nodes: new Map([
				["node:view-only", { shape: "pill" as const }],
				["node:edited", { maxWidth: 280 }],
			]),
		};
		const patch = createMindMapPresentationPatch(
			viewPresentation,
			preview,
		);
		const documentPresentation = {
			...base,
			nodes: new Map([
				["node:document-only", { shape: "ellipse" as const }],
			]),
		};

		expect(patch.nodes).toEqual(
			new Map([["node:edited", { maxWidth: 280 }]]),
		);
		expect(
			applyMindMapPresentationPatch(documentPresentation, patch, {
				capabilities,
				nodeIds: new Set([
					"node:view-only",
					"node:edited",
					"node:document-only",
				]),
				edgeIds: new Set(),
			}),
		).toMatchObject({
			nodes: new Map([
				["node:document-only", { shape: "ellipse" }],
				["node:edited", { maxWidth: 280 }],
			]),
		});
	});

	it("falls back the untouched appearance axis when a base snapshot uses a removed ID", () => {
		const current = createDefaultMindMapPresentation("left-to-right");
		const styleOnly = applyMindMapPresentationPatch(
			current,
			{ styleId: "pencil-sketch" },
			{ capabilities },
		);
		const paletteOnly = applyMindMapPresentationPatch(
			current,
			{ paletteId: "morandi-mint" },
			{ capabilities },
		);

		expect(styleOnly.theme.styleId).toBe("pencil-sketch");
		expect(styleOnly.theme.paletteId).toBe(capabilities.defaultPaletteId);
		expect(paletteOnly.theme.styleId).toBe(capabilities.defaultStyleId);
		expect(paletteOnly.theme.paletteId).toBe("morandi-mint");
	});

	it("applies global font and connector width independently of style and palette", () => {
		const current = createDefaultMindMapPresentation("left-to-right");
		const fontOnly = applyMindMapPresentationPatch(
			current,
			{ fontFamilyId: "handwritten" },
			{ capabilities },
		);
		const widthOnly = applyMindMapPresentationPatch(
			fontOnly,
			{ connectorWidthId: "thick" },
			{ capabilities },
		);

		expect(fontOnly.formatting).toMatchObject({
			fontFamily: {
				id: "handwritten",
				fontFamilyToken: "obmind-font-handwritten",
			},
			connectorWidth: { id: "style-default", width: null },
		});
		expect(widthOnly.formatting).toMatchObject({
			fontFamily: { id: "handwritten" },
			connectorWidth: { id: "thick", width: 2.25 },
		});
		expect(widthOnly.theme).toEqual(current.theme);
		expect(widthOnly.layout).toEqual(current.layout);

		const replay = createMindMapPresentationPatch(current, widthOnly);
		expect(replay).toMatchObject({
			fontFamilyId: "handwritten",
			connectorWidthId: "thick",
		});
	});

	it("rejects unknown global formatting capabilities", () => {
		const current = createDefaultMindMapPresentation("left-to-right");
		expect(() =>
			applyMindMapPresentationPatch(
				current,
				{ fontFamilyId: "missing-font" },
				{ capabilities },
			),
		).toThrow("Unsupported global font");
		expect(() =>
			applyMindMapPresentationPatch(
				current,
				{ connectorWidthId: "missing-width" },
				{ capabilities },
			),
		).toThrow("Unsupported connector width");
	});

	it("rejects decorations the active frontend cannot render", () => {
		const current = createDefaultMindMapPresentation("left-to-right");
		const markerAsset = capabilities.assets.find(
			(asset) => asset.kind === "marker",
		);
		expect(markerAsset).toBeDefined();
		expect(() =>
			applyMindMapPresentationPatch(
				current,
				{
					decorations: [
						{
							id: "marker-1",
							kind: "marker",
							nodeId: "node:1",
							markerId: markerAsset!.id,
						},
					],
				},
				{
					capabilities: {
						...capabilities,
						renderedDecorations:
							capabilities.renderedDecorations.filter(
								(kind) => kind !== "marker",
							),
					},
					nodeIds: new Set(["node:1"]),
				},
			),
		).toThrow("Unsupported decoration kind");
	});

	it("accepts a free-text tag as a point decoration without making it a node marker", () => {
		const current = createDefaultMindMapPresentation("left-to-right");
		const tagged = applyMindMapPresentationPatch(
			current,
			{
				decorations: [
					{
						id: "tag-1",
						kind: "marker",
						nodeId: "node:1",
						markerId: TAG_LABEL_ASSET_ID,
						label: "Release candidate",
					},
				],
			},
			{ capabilities, nodeIds: new Set(["node:1"]) },
		);

		expect(tagged.decorations).toEqual([
			{
				id: "tag-1",
				kind: "marker",
				nodeId: "node:1",
				markerId: TAG_LABEL_ASSET_ID,
				label: "Release candidate",
			},
		]);
		expect(() =>
			applyMindMapPresentationPatch(
				current,
				{
					nodes: new Map([
						["node:1", { markerIds: [TAG_LABEL_ASSET_ID] }],
					]),
				},
				{ capabilities, nodeIds: new Set(["node:1"]) },
			),
		).toThrow("Unsupported marker");
		expect(() =>
			applyMindMapPresentationPatch(
				current,
				{
					decorations: [
						{
							id: "tag-without-text",
							kind: "marker",
							nodeId: "node:1",
							markerId: TAG_LABEL_ASSET_ID,
						},
					],
				},
				{ capabilities, nodeIds: new Set(["node:1"]) },
			),
		).toThrow("Tag marker decorations require text");
	});
});
