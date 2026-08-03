import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../src/core/parser";
import type { LayoutResult } from "../src/layout/layout";
import {
	createMindMapMinimapTransform,
	mindMapMinimapPointToScene,
	mindMapSceneBoundsToMinimap,
	mindMapScenePointToMinimap,
	projectMindMapLayoutToMinimap,
} from "../src/layout/minimap";

describe("mind-map minimap geometry", () => {
	it("round-trips scene and minimap points", () => {
		const transform = createMindMapMinimapTransform(
			{ x: -100, y: 20, width: 800, height: 400 },
			{ width: 200, height: 120 },
			10,
		);
		if (transform === null) {
			throw new Error("Expected minimap transform.");
		}
		const scenePoint = { x: 240, y: 180 };
		const minimapPoint = mindMapScenePointToMinimap(scenePoint, transform);
		expect(mindMapMinimapPointToScene(minimapPoint, transform)).toEqual(
			scenePoint,
		);
	});

	it("maps the viewport rectangle into minimap coordinates", () => {
		const transform = createMindMapMinimapTransform(
			{ x: 0, y: 0, width: 1000, height: 500 },
			{ width: 220, height: 120 },
			10,
		);
		if (transform === null) {
			throw new Error("Expected minimap transform.");
		}
		const viewport = mindMapSceneBoundsToMinimap(
			{ x: 200, y: 100, width: 400, height: 200 },
			transform,
		);
		expect(viewport.width).toBeCloseTo(80);
		expect(viewport.height).toBeCloseTo(40);
	});

	it("projects every finite node plus explicit and fallback edge geometry", () => {
		const layout = createProjectionFixture();
		const transform = createMindMapMinimapTransform(
			layout.bounds,
			{ width: 140, height: 90 },
			10,
		);
		if (transform === null) {
			throw new Error("Expected minimap transform.");
		}

		const projection = projectMindMapLayoutToMinimap(layout, transform);
		expect(projection.nodes).toEqual([
			{ nodeId: layout.nodes[0]?.node.id, x: 10, y: 10, width: 40, height: 20 },
			{ nodeId: layout.nodes[1]?.node.id, x: 70, y: 20, width: 20, height: 10 },
			{ nodeId: layout.nodes[2]?.node.id, x: 110, y: 60, width: 10, height: 10 },
		]);
		expect(projection.edges).toEqual([
			{
				edgeId: "explicit",
				fromNodeId: layout.nodes[0]?.node.id,
				toNodeId: layout.nodes[1]?.node.id,
				path: {
					start: { x: 50, y: 20 },
					segments: [
						{ kind: "line", to: { x: 55, y: 20 } },
						{
							kind: "quadratic",
							control: { x: 60, y: 25 },
							to: { x: 65, y: 25 },
						},
						{
							kind: "cubic",
							control1: { x: 70, y: 25 },
							control2: { x: 75, y: 30 },
							to: { x: 80, y: 25 },
						},
					],
				},
			},
			{
				edgeId: "fallback",
				fromNodeId: layout.nodes[1]?.node.id,
				toNodeId: layout.nodes[2]?.node.id,
				path: {
					start: { x: 80, y: 25 },
					segments: [{ kind: "line", to: { x: 115, y: 65 } }],
				},
			},
		]);
	});

	it("keeps distant sub-pixel nodes visible without moving their center", () => {
		const layout = createProjectionFixture({
			nodes: [
				{
					...createProjectionFixture().nodes[0]!,
					x: 20,
					y: 30,
					width: 0.25,
					height: 0.5,
				},
			],
			edges: [],
		});
		const transform = createMindMapMinimapTransform(
			layout.bounds,
			{ width: 140, height: 90 },
			10,
		);
		if (transform === null) {
			throw new Error("Expected minimap transform.");
		}

		const projection = projectMindMapLayoutToMinimap(layout, transform, {
			minimumNodeSize: 3,
		});
		const node = projection.nodes[0];
		if (node === undefined) {
			throw new Error("Expected projected node.");
		}
		expect(node.width).toBe(3);
		expect(node.height).toBe(3);
		expect(node.x + node.width / 2).toBeCloseTo(30.125);
		expect(node.y + node.height / 2).toBeCloseTo(40.25);
	});

	it("omits non-finite source geometry and cannot emit a scene from an invalid transform", () => {
		const layout = createProjectionFixture();
		const [first, second, third] = layout.nodes;
		if (first === undefined || second === undefined || third === undefined) {
			throw new Error("Expected layout fixture nodes.");
		}
		const invalidLayout: LayoutResult = {
			...layout,
			nodes: [
				first,
				second,
				{ ...third, x: Number.NaN },
				{ ...third, node: { ...third.node, id: "negative" }, width: -1 },
			],
			edges: [
				{
					id: "valid-fallback",
					fromId: first.node.id,
					toId: second.node.id,
				},
				{
					id: "invalid-explicit",
					fromId: first.node.id,
					toId: second.node.id,
					path: {
						start: { x: 0, y: 0 },
						segments: [
							{ kind: "line", to: { x: Number.POSITIVE_INFINITY, y: 0 } },
						],
					},
				},
				{
					id: "missing-fallback-endpoint",
					fromId: first.node.id,
					toId: third.node.id,
				},
			],
		};
		const transform = createMindMapMinimapTransform(
			invalidLayout.bounds,
			{ width: 140, height: 90 },
			10,
		);
		if (transform === null) {
			throw new Error("Expected minimap transform.");
		}

		const projection = projectMindMapLayoutToMinimap(invalidLayout, transform);
		expect(projection.nodes.map((node) => node.nodeId)).toEqual([
			first.node.id,
			second.node.id,
		]);
		expect(projection.edges.map((edge) => edge.edgeId)).toEqual([
			"valid-fallback",
		]);
		expect(
			projectMindMapLayoutToMinimap(invalidLayout, {
				...transform,
				scale: Number.NaN,
			}),
		).toEqual({ nodes: [], edges: [] });
	});
});

function createProjectionFixture(
	overrides: Partial<LayoutResult> = {},
): LayoutResult {
	const document = parseMarkdown("# A\n# B\n# C", "Map.md", "Map");
	const [first, second, third] = document.root.children;
	if (first === undefined || second === undefined || third === undefined) {
		throw new Error("Expected parser fixture nodes.");
	}
	return {
		nodes: [
			{ node: first, x: 0, y: 0, width: 40, height: 20, depth: 1 },
			{ node: second, x: 60, y: 10, width: 20, height: 10, depth: 1 },
			{ node: third, x: 100, y: 50, width: 10, height: 10, depth: 1 },
		],
		edges: [
			{
				id: "explicit",
				fromId: first.id,
				toId: second.id,
				path: {
					start: { x: 40, y: 10 },
					segments: [
						{ kind: "line", to: { x: 45, y: 10 } },
						{
							kind: "quadratic",
							control: { x: 50, y: 15 },
							to: { x: 55, y: 15 },
						},
						{
							kind: "cubic",
							control1: { x: 60, y: 15 },
							control2: { x: 65, y: 20 },
							to: { x: 70, y: 15 },
						},
					],
				},
			},
			{ id: "fallback", fromId: second.id, toId: third.id },
		],
		bounds: { x: 0, y: 0, width: 120, height: 70 },
		...overrides,
	};
}
