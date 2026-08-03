import { describe, expect, it } from "vitest";

import {
	BUILT_IN_MIND_MAP_ASSET_REGISTRY,
	TAG_LABEL_ASSET_ID,
	type MindMapAssetVisualDescriptor,
} from "../src/presentation/assets";
import type {
	MindMapDecorationGeometryDescriptor,
} from "../src/presentation/decorations";
import {
	createMindMapAssetExportPrimitives,
	createMindMapDecorationExportPrimitives,
	type MindMapAssetExportColors,
	type MindMapDecorationExportPrimitiveOptions,
	type MindMapExportTextStyle,
} from "../src/export/presentation-primitives";
import { serializeMindMapExportSceneToSvg } from "../src/export/svg";
import { createExportScene } from "./export-fixtures";

const ASSET_COLORS: MindMapAssetExportColors = {
	foreground: "#101820",
	muted: "#62717c",
	surface: "#f8fafc",
	accent: "#2463eb",
	positive: "#18864b",
	warning: "#ba7200",
	danger: "#b32929",
};

const LABEL_STYLE: MindMapExportTextStyle = {
	fill: "#101820",
	fontFamily: "system-ui, sans-serif",
	fontSize: 12,
	fontWeight: "600",
	fontStyle: "normal",
	baselineOffset: 4,
};

const ALL_PRIMITIVE_ASSET: MindMapAssetVisualDescriptor = {
	id: "all-primitives",
	label: "All primitives",
	capabilityLabelKey: "capability.asset.all-primitives",
	kind: "icon",
	revision: 1,
	viewBox: { width: 100, height: 100 },
	primitives: [
		{
			kind: "circle",
			centerX: 12,
			centerY: 15,
			radius: 8,
			fill: { kind: "role", role: "accent", opacity: 0.4 },
			stroke: { role: "foreground", width: 2 },
		},
		{
			kind: "rect",
			x: 24,
			y: 8,
			width: 20,
			height: 16,
			radius: 3,
			fill: { kind: "role", role: "surface" },
			stroke: { role: "muted", width: 1 },
		},
		{
			kind: "line",
			start: { x: 4, y: 42 },
			end: { x: 32, y: 42 },
			stroke: { role: "positive", width: 2, lineCap: "round" },
		},
		{
			kind: "polyline",
			points: [
				{ x: 4, y: 56 },
				{ x: 18, y: 48 },
				{ x: 32, y: 56 },
			],
			stroke: { role: "warning", width: 2, lineJoin: "round" },
		},
		{
			kind: "polygon",
			points: [
				{ x: 56, y: 40 },
				{ x: 72, y: 56 },
				{ x: 48, y: 60 },
			],
			fill: { kind: "role", role: "danger" },
			stroke: { role: "foreground", width: 1 },
		},
		{
			kind: "arc",
			centerX: 72,
			centerY: 20,
			radius: 10,
			startAngle: -90,
			endAngle: 180,
			stroke: { role: "accent", width: 2, lineCap: "round" },
		},
	],
	labelContent: null,
};

const MARKER_ASSET: MindMapAssetVisualDescriptor = {
	id: "priority",
	label: "Priority",
	capabilityLabelKey: "capability.asset.priority",
	kind: "marker",
	revision: 1,
	viewBox: { width: 24, height: 24 },
	primitives: [
		{
			kind: "circle",
			centerX: 12,
			centerY: 12,
			radius: 9,
			fill: { kind: "role", role: "warning" },
			stroke: { role: "foreground", width: 1 },
		},
	],
	labelContent: null,
};

describe("presentation export primitives", () => {
	it("converts every asset primitive, including an arc, with resolved colors", () => {
		const primitives = createMindMapAssetExportPrimitives({
			asset: ALL_PRIMITIVE_ASSET,
			bounds: { x: 10, y: 20, width: 200, height: 100 },
			colors: ASSET_COLORS,
			fit: "stretch",
			idPrefix: "node-1",
		});

		expect(primitives.map(({ kind }) => kind)).toEqual([
			"ellipse",
			"rect",
			"path",
			"path",
			"path",
			"path",
		]);
		expect(primitives[0]).toMatchObject({
			id: "node-1:asset:all-primitives:0",
			fill: { kind: "color", value: "#2463eb" },
			fillOpacity: 0.4,
			stroke: "#101820",
		});
		expect(primitives[2]).toMatchObject({
			data: "M 18 62 L 74 62",
			stroke: "#18864b",
			lineCap: "round",
		});
		const polygon = primitives[4];
		const arc = primitives[5];
		if (polygon?.kind !== "path" || arc?.kind !== "path") {
			throw new Error("Expected polygon and arc export paths.");
		}
		expect(polygon.data).toContain("Z");
		expect(polygon.fill).toEqual({ kind: "color", value: "#b32929" });
		expect(arc.data).toContain("A 20 10 0 1 1");
		expect(arc.stroke).toBe("#2463eb");
	});

	it("exports tag labels and all four decoration geometry kinds", () => {
		const tag = BUILT_IN_MIND_MAP_ASSET_REGISTRY.resolve(TAG_LABEL_ASSET_ID);
		const tagPrimitives = createMindMapAssetExportPrimitives({
			asset: {
				id: tag.id,
				label: tag.label,
				capabilityLabelKey: tag.capabilityLabelKey,
				kind: tag.kind,
				revision: tag.revision,
				viewBox: tag.visual.viewBox,
				primitives: tag.visual.primitives,
				labelContent: tag.visual.labelContent ?? null,
			},
			bounds: { x: 40, y: 10, width: 96, height: 24 },
			colors: ASSET_COLORS,
			fit: "stretch",
			idPrefix: "topic-1",
			label: { text: "Launch <Q4>", style: LABEL_STYLE },
		});
		const decorationPrimitives = createMindMapDecorationExportPrimitives(
			createDecorationDescriptors(),
			createDecorationOptions(),
		);

		expect(
			tagPrimitives.find(
				(primitive) => primitive.kind === "text",
			),
		).toMatchObject({
			id: "topic-1:asset:tag-label:label",
			text: "Launch <Q4>",
		});
		expect(decorationPrimitives.map(({ id }) => id)).toEqual([
			"marker-1:asset:priority:0",
			"marker-1:label",
			"boundary-1",
			"boundary-1:label",
			"summary-1",
			"summary-1:text",
			"relationship-1",
			"relationship-1:label",
		]);
		expect(
			decorationPrimitives.find(({ id }) => id === "summary-1:text"),
		).toMatchObject({ text: "Result", textAnchor: "middle" });
		const relationship = decorationPrimitives.find(
			({ id }) => id === "relationship-1",
		);
		if (relationship?.kind !== "path") {
			throw new Error("Expected a relationship export path.");
		}
		expect(relationship.data).toContain(" Q ");

		const serialized = serializeMindMapExportSceneToSvg(
			createExportScene({
				primitives: [
					...createMindMapAssetExportPrimitives({
						asset: ALL_PRIMITIVE_ASSET,
						bounds: { x: 10, y: 20, width: 200, height: 100 },
						colors: ASSET_COLORS,
						fit: "stretch",
						idPrefix: "node-1",
					}),
					...tagPrimitives,
					...decorationPrimitives,
				],
			}),
			{ background: "transparent", padding: 0 },
		);

		expect(serialized.svg).toContain("<ellipse");
		expect(serialized.svg).toContain("<rect");
		expect(serialized.svg).toContain("<circle");
		expect(serialized.svg).toContain('fill-opacity="0.4"');
		expect(serialized.svg).toContain('text-anchor="middle"');
		expect(serialized.svg).toContain("Launch &lt;Q4&gt;");
		expect(serialized.svg).toContain(
			'data-obmind-export-id="relationship-1"',
		);
	});

	it("keeps a decoration tag label inside its resolved asset", () => {
		const tag = BUILT_IN_MIND_MAP_ASSET_REGISTRY.resolve(TAG_LABEL_ASSET_ID);
		const primitives = createMindMapDecorationExportPrimitives(
			[
				{
					kind: "marker",
					id: "marker-tag",
					nodeId: "node-1",
					markerId: TAG_LABEL_ASSET_ID,
					label: "Q4",
					anchor: { x: 10, y: 20 },
					labelAnchor: { x: 10, y: 20 },
				},
			],
			{
				...createDecorationOptions(),
				markerAssets: new Map([
					[
						TAG_LABEL_ASSET_ID,
						{
							id: tag.id,
							label: tag.label,
							capabilityLabelKey: tag.capabilityLabelKey,
							kind: tag.kind,
							revision: tag.revision,
							viewBox: tag.visual.viewBox,
							primitives: tag.visual.primitives,
							labelContent: tag.visual.labelContent ?? null,
						},
					],
				]),
			},
		);

		expect(primitives.map(({ id }) => id)).toContain(
			"marker-tag:asset:tag-label:label",
		);
		expect(primitives.map(({ id }) => id)).not.toContain("marker-tag:label");
		expect(
			primitives.find(
				({ id }) => id === "marker-tag:asset:tag-label:label",
			),
		).toMatchObject({ text: "Q4" });
	});
});

function createDecorationDescriptors(): readonly MindMapDecorationGeometryDescriptor[] {
	return [
		{
			kind: "marker",
			id: "marker-1",
			nodeId: "node-1",
			markerId: "priority",
			label: "P1",
			anchor: { x: 10, y: 20 },
			labelAnchor: { x: 10, y: 20 },
		},
		{
			kind: "boundary",
			id: "boundary-1",
			nodeIds: ["node-1", "node-2"],
			label: "Group",
			bounds: { x: 5, y: 10, width: 220, height: 100 },
			labelAnchor: { x: 17, y: 22 },
		},
		{
			kind: "summary",
			id: "summary-1",
			nodeIds: ["node-1", "node-2"],
			text: "Result",
			groupBounds: { x: 10, y: 20, width: 180, height: 80 },
			side: "right",
			bracket: [
				{ x: 190, y: 20 },
				{ x: 210, y: 20 },
				{ x: 210, y: 100 },
				{ x: 190, y: 100 },
			],
			textAnchor: { x: 228, y: 60 },
			textAlignment: "center",
		},
		{
			kind: "relationship",
			id: "relationship-1",
			fromNodeId: "node-1",
			toNodeId: "node-2",
			label: "depends on",
			start: { x: 40, y: 40 },
			control: { x: 110, y: 0 },
			end: { x: 180, y: 40 },
			labelAnchor: { x: 110, y: 20 },
		},
	];
}

function createDecorationOptions(): MindMapDecorationExportPrimitiveOptions {
	return {
		markerAssets: new Map([["priority", MARKER_ASSET]]),
		marker: {
			colors: ASSET_COLORS,
			width: 18,
			height: 18,
			offsetX: 2,
			offsetY: 1,
			labelGap: 4,
			label: LABEL_STYLE,
		},
		boundary: {
			fill: { kind: "color", value: "#dbeafe" },
			stroke: {
				color: "#2463eb",
				width: 1.5,
				dashArray: [4, 2],
				opacity: 0.8,
			},
			radius: 8,
			label: LABEL_STYLE,
		},
		summary: {
			stroke: { color: "#18864b", width: 2, lineJoin: "round" },
			text: LABEL_STYLE,
		},
		relationship: {
			stroke: {
				color: "#b32929",
				width: 1.5,
				lineCap: "round",
			},
			label: LABEL_STYLE,
		},
	};
}
