import { describe, expect, it } from "vitest";

import {
	createMindMapStylePreviewScene,
	createMindMapStylePreviewEdgePathData,
	createMindMapStylePreviewTaperedEdgePathData,
} from "../src/presentation/style-preview-scene";
import {
	createAtlasCardsStyleSpec,
	createCharcoalStyleSpec,
	createCloudStyleSpec,
	createSwissEditorialStyleSpec,
	createTechnicalDraftStyleSpec,
} from "../src/presentation/styles";
import { BUILT_IN_DOM_SVG_EFFECT_REGISTRY } from "../src/ui/dom-svg-effects";

describe("Mind-map style preview scene", () => {
	it("shows Atlas primary branch cards and neutral deeper cards", () => {
		const scene = createMindMapStylePreviewScene(
			createAtlasCardsStyleSpec(),
			BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
		);

		expect(
			scene.nodes
				.filter((node) => node.role === "main-topic")
				.every((node) => node.fillSource === "branch"),
		).toBe(true);
		expect(
			scene.nodes
				.filter((node) => node.role === "subtopic")
				.every((node) => node.fillSource === "surface"),
		).toBe(true);
		expect(scene.edges.every((edge) => edge.routing === "straight")).toBe(
			true,
		);
	});

	it("keeps Swiss Editorial role hierarchy, typography, underline treatment, and rounded orthogonal routing", () => {
		const scene = createMindMapStylePreviewScene(
			createSwissEditorialStyleSpec(),
			BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
		);

		expect(scene.nodes.map((node) => node.role)).toEqual([
			"root",
			"main-topic",
			"main-topic",
			"subtopic",
			"subtopic",
		]);
		const root = scene.nodes[0];
		const mainTopics = scene.nodes.filter(
			(node) => node.role === "main-topic",
		);
		const subtopics = scene.nodes.filter(
			(node) => node.role === "subtopic",
		);
		expect(root?.shape).toBe("none");
		expect(root?.metrics.typography).toMatchObject({
			fontSize: 30,
			fontWeight: 750,
		});
		expect(mainTopics.every((node) => node.shape === "underline")).toBe(true);
		expect(subtopics.every((node) => node.shape === "none")).toBe(true);
		expect(scene.edges.every((edge) => edge.routing === "rounded-orthogonal")).toBe(
			true,
		);
		expect(createMindMapStylePreviewEdgePathData(scene.edges[0]!)).toContain(
			"Q",
		);
	});

	it("renders Organic Classic as a tapered Bezier preview without topic containers", () => {
		const scene = createMindMapStylePreviewScene(
			createCloudStyleSpec(),
			BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
		);

		expect(scene.nodes[0]?.shape).toBe("ellipse");
		expect(
			scene.nodes
				.filter((node) => node.role !== "root")
				.every((node) => node.shape === "none"),
		).toBe(true);
		expect(
			scene.edges.every(
				(edge) =>
					edge.routing === "bezier" &&
					edge.connectorProfile.kind === "taper-to-child",
			),
		).toBe(true);
		const taperedPath = createMindMapStylePreviewTaperedEdgePathData(
			scene.edges[0]!,
		);
		expect(taperedPath).toMatch(/^M /);
		expect(taperedPath).toMatch(/ Z$/);
		expect(taperedPath).not.toContain("NaN");
	});

	it("uses registered Technical Draft effect semantics and role typography", () => {
		const scene = createMindMapStylePreviewScene(
			createTechnicalDraftStyleSpec(),
			BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
		);

		expect(scene.effects.canvasTexture).toMatchObject({
			profileId: "technical-grid",
			kind: "canvas-texture",
			presentation: { canvasTexture: "technical-grid" },
		});
		expect(
			scene.nodes.every((node) => node.shape === "rectangle"),
		).toBe(true);
		expect(scene.nodes[0]?.metrics.typography.fontFamilyToken).toBe(
			"font-monospace",
		);
		expect(
			createMindMapStylePreviewEdgePathData(scene.edges[0]!),
		).toContain("H");
	});

	it("uses one dry Charcoal contour and powder treatment rather than Pencil double-stroke semantics", () => {
		const scene = createMindMapStylePreviewScene(
			createCharcoalStyleSpec(),
			BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
		);

		expect(scene.effects.nodeStroke).toMatchObject({
			profileId: "charcoal-stroke",
			presentation: {
				nodeStroke: "dry",
				nodeStrokeDashArray: [5.7, 0.55, 2.1, 0.55, 8.7, 0.55],
			},
		});
		expect(scene.effects.nodeFill).toMatchObject({
			profileId: "charcoal-fill",
			presentation: { nodeFill: "powder" },
		});
		expect(scene.effects.edgeStroke).toMatchObject({
			profileId: "charcoal-edge",
			presentation: { edgeStroke: "dry" },
		});
		expect(scene.edges[0]?.lineStyle).toBe("solid");
	});
});
