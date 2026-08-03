import { describe, expect, it } from "vitest";

import type { LayoutResult } from "../src/layout/layout";
import { parseMarkdown } from "../src/core/parser";
import {
	createMindMapViewportSceneBounds,
	resolveMindMapSceneCulling,
} from "../src/layout/scene-culling";

function createLayout(): LayoutResult {
	const document = parseMarkdown("# A\n# B\n# C", "Map.md", "Map");
	return {
		nodes: document.root.children.map((node, index) => ({
			node,
			x: index * 300,
			y: 0,
			width: 100,
			height: 40,
			depth: 1,
		})),
		edges: [
			{
				id: "edge-a-b",
				fromId: document.root.children[0]?.id ?? "a",
				toId: document.root.children[1]?.id ?? "b",
				path: {
					start: { x: 100, y: 20 },
					segments: [{ kind: "line", to: { x: 300, y: 20 } }],
				},
			},
		],
		bounds: { x: 0, y: 0, width: 700, height: 40 },
	};
}

describe("mind-map scene culling", () => {
	it("keeps all nodes below the configured threshold", () => {
		const layout = createLayout();
		const result = resolveMindMapSceneCulling(
			layout,
			{ x: 0, y: 0, width: 120, height: 80 },
			new Set(),
			{ minimumNodeCount: 4, overscan: 0 },
		);
		expect(result.active).toBe(false);
		expect(result.mountedNodeIds.size).toBe(3);
	});

	it("culls outside topics while preserving pinned interaction nodes", () => {
		const layout = createLayout();
		const pinnedId = layout.nodes[2]?.node.id;
		if (pinnedId === undefined) {
			throw new Error("Expected pinned node.");
		}
		const result = resolveMindMapSceneCulling(
			layout,
			{ x: -10, y: -10, width: 150, height: 80 },
			new Set([pinnedId]),
			{ minimumNodeCount: 1, overscan: 0 },
		);
		expect(result.active).toBe(true);
		expect(result.mountedNodeIds).toEqual(
			new Set([layout.nodes[0]?.node.id, pinnedId]),
		);
		expect(result.renderedEdgeIds).toEqual(new Set(["edge-a-b"]));
	});

	it("converts pixel viewport dimensions to scene coordinates", () => {
		expect(
			createMindMapViewportSceneBounds(
				{ centerX: 100, centerY: 50, scale: 2 },
				400,
				200,
			),
		).toEqual({ x: 0, y: 0, width: 200, height: 100 });
	});
});
