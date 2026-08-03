import { describe, expect, it } from "vitest";

import type { PositionedNode } from "../src/layout/layout";
import type { LayoutOrientation, MindMapNode } from "../src/core/model";
import {
	applyNodeDragAutoPan,
	calculateNodeDragAutoPan,
	canContinueNodeDragAfterRender,
	clientPointToNodeDragScene,
	hasCrossedNodeDragThreshold,
	isValidNodeDragDrop,
	resolveNodeDragDropPreview,
	resolveNodeDragDropTarget,
	type NodeDragDropPreview,
} from "../src/topic/interaction/node-drag";
import { parseMarkdown } from "../src/core/parser";

const document = parseMarkdown(
	[
		"# A",
		"## B",
		"- B item",
		"## C",
		"- C item",
		"- C item 2",
	].join("\n"),
	"Map.md",
	"Map",
);

const root = document.root;
const headingA = requireChild(root, 0);
const headingB = requireChild(headingA, 0);
const headingC = requireChild(headingA, 1);
const listB = requireChild(headingB, 0);
const listC = requireChild(headingC, 0);
const listC2 = requireChild(headingC, 1);

describe("node drag coordinate helpers", () => {
	it("uses a five screen-pixel threshold", () => {
		expect(
			hasCrossedNodeDragThreshold(
				{ x: 10, y: 10 },
				{ x: 13, y: 13 },
			),
		).toBe(false);
		expect(
			hasCrossedNodeDragThreshold(
				{ x: 10, y: 10 },
				{ x: 13, y: 14 },
			),
		).toBe(true);
		expect(
			hasCrossedNodeDragThreshold(
				{ x: 0, y: 0 },
				{ x: 100, y: 100 },
				-1,
			),
		).toBe(false);
	});

	it("converts client coordinates into the transformed scene", () => {
		expect(
			clientPointToNodeDragScene(
				{ x: 130, y: 250 },
				{ left: 10, top: 20 },
				{ x: 20, y: 30, scale: 2 },
			),
		).toEqual({ x: 50, y: 100 });
		expect(
			clientPointToNodeDragScene(
				{ x: 0, y: 0 },
				{ left: 0, top: 0 },
				{ x: 0, y: 0, scale: 0 },
			),
		).toBeNull();
	});

	it("calculates bounded edge auto-pan deltas", () => {
		const bounds = {
			left: 100,
			top: 50,
			right: 500,
			bottom: 350,
		};

		expect(calculateNodeDragAutoPan({ x: 300, y: 200 }, bounds)).toEqual({
			x: 0,
			y: 0,
		});
		expect(calculateNodeDragAutoPan({ x: 100, y: 350 }, bounds)).toEqual({
			x: -18,
			y: 18,
		});
		expect(calculateNodeDragAutoPan({ x: 124, y: 74 }, bounds)).toEqual({
			x: -9,
			y: -9,
		});
		expect(
			calculateNodeDragAutoPan(
				{ x: Number.NaN, y: 0 },
				bounds,
			),
		).toEqual({ x: 0, y: 0 });
	});

	it("moves the scene opposite viewport travel", () => {
		expect(
			applyNodeDragAutoPan(
				{ x: 20, y: 30, scale: 1.5 },
				{ x: 12, y: -8 },
			),
		).toEqual({
			x: 8,
			y: 38,
			scale: 1.5,
		});
	});
});

describe("node drag drop zones", () => {
	it("uses an injected layout-engine placement resolver", () => {
		const target = at(headingC, 100, 100);
		let resolvedTargetId: string | null = null;
		const result = resolveNodeDragDropTarget({
			root,
			sourceNodeId: headingB.id,
			positionedNodes: [target],
			orientation: "left-to-right",
			point: { x: 150, y: 120 },
			resolveNodeDropPlacement: ({ target: positioned }) => {
				resolvedTargetId = positioned.node.id;
				return "after";
			},
		});

		expect(resolvedTargetId).toBe(headingC.id);
		expect(result?.placement).toBe("after");
	});

	for (const orientation of [
		"left-to-right",
		"right-to-left",
	] as const) {
		it(`uses vertical before/child/after bands for ${orientation}`, () => {
			const target = at(headingC, 100, 100);

			expect(
				resolve(root, headingB.id, [target], orientation, {
					x: 150,
					y: 105,
				})?.placement,
			).toBe("before");
			expect(
				resolve(root, headingB.id, [target], orientation, {
					x: 150,
					y: 120,
				})?.placement,
			).toBe("child");
			expect(
				resolve(root, headingB.id, [target], orientation, {
					x: 150,
					y: 135,
				})?.placement,
			).toBe("after");
		});
	}

	for (const orientation of [
		"top-to-bottom",
		"bottom-to-top",
	] as const) {
		it(`uses horizontal before/child/after bands for ${orientation}`, () => {
			const target = at(headingC, 100, 100);

			expect(
				resolve(root, headingB.id, [target], orientation, {
					x: 110,
					y: 120,
				})?.placement,
			).toBe("before");
			expect(
				resolve(root, headingB.id, [target], orientation, {
					x: 150,
					y: 120,
				})?.placement,
			).toBe("child");
			expect(
				resolve(root, headingB.id, [target], orientation, {
					x: 190,
					y: 120,
				})?.placement,
			).toBe("after");
		});
	}

	it("allows only the center child zone on the root", () => {
		const target = at(root, 100, 100);

		expect(
			resolve(
				root,
				headingB.id,
				[target],
				"left-to-right",
				{ x: 150, y: 120 },
			)?.placement,
		).toBe("child");
		expect(
			resolve(
				root,
				headingB.id,
				[target],
				"left-to-right",
				{ x: 150, y: 105 },
			),
		).toBeNull();
	});
});

describe("node drag drop preview", () => {
	const source = at(headingB, 20, 20, 80, 30);
	const target = at(headingC, 100, 100, 100, 40);
	const targetParent = at(headingA, 0, 90, 70, 60);
	const positionedNodes = [source, target, targetParent];
	const previewSpacing = {
		primaryGap: 20,
		siblingGap: 10,
	};
	const cases = [
		{
			orientation: "left-to-right",
			childBounds: { x: 220, y: 105, width: 80, height: 30 },
			childConnector: {
				start: { x: 200, y: 120 },
				end: { x: 220, y: 120 },
			},
			beforeBounds: { x: 110, y: 60, width: 80, height: 30 },
			beforeMarker: {
				start: { x: 100, y: 100 },
				end: { x: 200, y: 100 },
			},
			afterBounds: { x: 110, y: 150, width: 80, height: 30 },
			afterMarker: {
				start: { x: 100, y: 140 },
				end: { x: 200, y: 140 },
			},
		},
		{
			orientation: "right-to-left",
			childBounds: { x: 0, y: 105, width: 80, height: 30 },
			childConnector: {
				start: { x: 100, y: 120 },
				end: { x: 80, y: 120 },
			},
			beforeBounds: { x: 110, y: 60, width: 80, height: 30 },
			beforeMarker: {
				start: { x: 100, y: 100 },
				end: { x: 200, y: 100 },
			},
			afterBounds: { x: 110, y: 150, width: 80, height: 30 },
			afterMarker: {
				start: { x: 100, y: 140 },
				end: { x: 200, y: 140 },
			},
		},
		{
			orientation: "top-to-bottom",
			childBounds: { x: 110, y: 160, width: 80, height: 30 },
			childConnector: {
				start: { x: 150, y: 140 },
				end: { x: 150, y: 160 },
			},
			beforeBounds: { x: 10, y: 105, width: 80, height: 30 },
			beforeMarker: {
				start: { x: 100, y: 100 },
				end: { x: 100, y: 140 },
			},
			afterBounds: { x: 210, y: 105, width: 80, height: 30 },
			afterMarker: {
				start: { x: 200, y: 100 },
				end: { x: 200, y: 140 },
			},
		},
		{
			orientation: "bottom-to-top",
			childBounds: { x: 110, y: 50, width: 80, height: 30 },
			childConnector: {
				start: { x: 150, y: 100 },
				end: { x: 150, y: 80 },
			},
			beforeBounds: { x: 10, y: 105, width: 80, height: 30 },
			beforeMarker: {
				start: { x: 100, y: 100 },
				end: { x: 100, y: 140 },
			},
			afterBounds: { x: 210, y: 105, width: 80, height: 30 },
			afterMarker: {
				start: { x: 200, y: 100 },
				end: { x: 200, y: 140 },
			},
		},
	] as const;

	for (const previewCase of cases) {
		it(`describes child, before and after geometry for ${previewCase.orientation}`, () => {
			const childPreview = requireValidPreview(
				previewFor(
					previewCase.orientation,
					"child",
					positionedNodes,
					previewSpacing,
				),
			);
			expect(childPreview.geometry.placeholderBounds).toEqual(
				previewCase.childBounds,
			);
			expect(childPreview.geometry.connector).toEqual(
				previewCase.childConnector,
			);
			expect(childPreview.geometry.insertionMarker).toBeNull();

			const beforePreview = requireValidPreview(
				previewFor(
					previewCase.orientation,
					"before",
					positionedNodes,
					previewSpacing,
				),
			);
			expect(beforePreview.geometry.placeholderBounds).toEqual(
				previewCase.beforeBounds,
			);
			expect(beforePreview.geometry.insertionMarker).toEqual(
				previewCase.beforeMarker,
			);

			const afterPreview = requireValidPreview(
				previewFor(
					previewCase.orientation,
					"after",
					positionedNodes,
					previewSpacing,
				),
			);
			expect(afterPreview.geometry.placeholderBounds).toEqual(
				previewCase.afterBounds,
			);
			expect(afterPreview.geometry.insertionMarker).toEqual(
				previewCase.afterMarker,
			);
		});
	}

	it("connects a sibling placeholder from the target parent", () => {
		const preview = requireValidPreview(
			previewFor(
				"left-to-right",
				"before",
				positionedNodes,
				previewSpacing,
			),
		);
		expect(preview.geometry.connector).toEqual({
			start: { x: 70, y: 120 },
			end: { x: 110, y: 75 },
		});
	});

	it("distinguishes empty canvas, invalid structure and missing source geometry", () => {
		expect(
			resolveNodeDragDropPreview({
				root,
				sourceNodeId: headingB.id,
				positionedNodes,
				orientation: "left-to-right",
				point: { x: 1_000, y: 1_000 },
			}),
		).toEqual({
			status: "none",
			reason: "no-positioned-target",
		});

		const selfDrop = resolveNodeDragDropPreview({
			root,
			sourceNodeId: headingB.id,
			positionedNodes,
			orientation: "left-to-right",
			point: { x: 50, y: 30 },
			resolveNodeDropPlacement: () => "child",
		});
		expect(selfDrop.status).toBe("invalid");
		if (selfDrop.status === "invalid") {
			expect(selfDrop.reason).toBe("invalid-structural-target");
			expect(selfDrop.candidate.nodeId).toBe(headingB.id);
		}

		const missingSource = resolveNodeDragDropPreview({
			root,
			sourceNodeId: headingB.id,
			positionedNodes: [target, targetParent],
			orientation: "left-to-right",
			point: { x: 150, y: 120 },
			resolveNodeDropPlacement: () => "child",
		});
		expect(missingSource.status).toBe("invalid");
		if (missingSource.status === "invalid") {
			expect(missingSource.reason).toBe("source-not-positioned");
		}
	});

	it("accepts layout-owned geometry and rejects unusable geometry", () => {
		const customGeometry = {
			targetBounds: { x: 1, y: 2, width: 3, height: 4 },
			placeholderBounds: { x: 5, y: 6, width: 7, height: 8 },
			connector: {
				start: { x: 9, y: 10 },
				end: { x: 11, y: 12 },
			},
			insertionMarker: null,
		};
		const customPreview = requireValidPreview(
			resolveNodeDragDropPreview({
				root,
				sourceNodeId: headingB.id,
				positionedNodes,
				orientation: "left-to-right",
				point: { x: 150, y: 120 },
				resolveNodeDropPlacement: () => "child",
				resolvePreviewGeometry: () => customGeometry,
			}),
		);
		expect(customPreview.geometry).toBe(customGeometry);

		const unusablePreview = resolveNodeDragDropPreview({
			root,
			sourceNodeId: headingB.id,
			positionedNodes,
			orientation: "left-to-right",
			point: { x: 150, y: 120 },
			resolveNodeDropPlacement: () => "child",
			resolvePreviewGeometry: () => ({
				...customGeometry,
				placeholderBounds: {
					...customGeometry.placeholderBounds,
					x: Number.NaN,
				},
			}),
		});
		expect(unusablePreview.status).toBe("invalid");
		if (unusablePreview.status === "invalid") {
			expect(unusablePreview.reason).toBe(
				"preview-geometry-unavailable",
			);
		}
	});
});

describe("node drag structural validation", () => {
	it("allows before/after moves across parents for the same node kind", () => {
		expect(
			isValidNodeDragDrop(
				root,
				headingB.id,
				headingC.id,
				"before",
			),
		).toBe(true);
		expect(
			isValidNodeDragDrop(root, listC.id, listC2.id, "after"),
		).toBe(true);
		expect(
			isValidNodeDragDrop(root, listB.id, listC.id, "before"),
		).toBe(true);
		expect(
			isValidNodeDragDrop(root, listC.id, headingC.id, "before"),
		).toBe(false);
	});

	it("rejects the root, self drops, and descendant targets", () => {
		expect(
			isValidNodeDragDrop(root, root.id, headingA.id, "child"),
		).toBe(false);
		expect(
			isValidNodeDragDrop(
				root,
				headingB.id,
				headingB.id,
				"child",
			),
		).toBe(false);
		expect(
			isValidNodeDragDrop(
				root,
				headingA.id,
				headingB.id,
				"child",
			),
		).toBe(false);
	});

	it("rejects heading into list while allowing representable child moves", () => {
		expect(
			isValidNodeDragDrop(
				root,
				headingB.id,
				listC.id,
				"child",
			),
		).toBe(false);
		expect(
			isValidNodeDragDrop(
				root,
				listC.id,
				headingB.id,
				"child",
			),
		).toBe(true);
	});

	it("rejects list destinations whose requested parent cannot survive reparsing", () => {
		expect(
			isValidNodeDragDrop(
				root,
				listC.id,
				headingA.id,
				"child",
			),
		).toBe(false);
		expect(
			isValidNodeDragDrop(root, listC.id, root.id, "child"),
		).toBe(false);
	});

	it("rejects heading drops that would exceed ATX level six", () => {
		const deepDocument = parseMarkdown(
			"# Target\n# Moving\n###### Deep",
			"Deep.md",
			"Deep",
		);
		const target = requireChild(deepDocument.root, 0);
		const moving = requireChild(deepDocument.root, 1);

		expect(
			isValidNodeDragDrop(
				deepDocument.root,
				moving.id,
				target.id,
				"child",
			),
		).toBe(false);
	});
});

describe("node drag render continuity", () => {
	it("keeps a drag only for the exact source revision and existing node", () => {
		expect(
			canContinueNodeDragAfterRender(
				root,
				headingB.id,
				"revision:1",
				"revision:1",
			),
		).toBe(true);
		expect(
			canContinueNodeDragAfterRender(
				root,
				headingB.id,
				"revision:1",
				"revision:2",
			),
		).toBe(false);
		expect(
			canContinueNodeDragAfterRender(
				root,
				"missing",
				"revision:1",
				"revision:1",
			),
		).toBe(false);
		expect(
			canContinueNodeDragAfterRender(
				root,
				root.id,
				"revision:1",
				"revision:1",
			),
		).toBe(false);
	});
});

function requireChild(node: MindMapNode, index: number): MindMapNode {
	const child = node.children[index];
	if (child === undefined) {
		throw new Error(`Missing fixture child ${String(index)} of ${node.text}.`);
	}
	return child;
}

function at(
	node: MindMapNode,
	x: number,
	y: number,
	width = 100,
	height = 40,
): PositionedNode {
	return {
		node,
		x,
		y,
		width,
		height,
		depth: 0,
	};
}

function resolve(
	tree: MindMapNode,
	sourceNodeId: string,
	positionedNodes: readonly PositionedNode[],
	orientation: LayoutOrientation,
	point: { readonly x: number; readonly y: number },
) {
	return resolveNodeDragDropTarget({
		root: tree,
		sourceNodeId,
		positionedNodes,
		orientation,
		point,
	});
}

function previewFor(
	orientation: LayoutOrientation,
	placement: "before" | "after" | "child",
	positionedNodes: readonly PositionedNode[],
	previewSpacing: {
		readonly primaryGap: number;
		readonly siblingGap: number;
	},
): NodeDragDropPreview {
	return resolveNodeDragDropPreview({
		root,
		sourceNodeId: headingB.id,
		positionedNodes,
		orientation,
		point: { x: 150, y: 120 },
		resolveNodeDropPlacement: () => placement,
		previewSpacing,
	});
}

function requireValidPreview(
	preview: NodeDragDropPreview,
): Extract<NodeDragDropPreview, { readonly status: "valid" }> {
	if (preview.status !== "valid") {
		throw new Error(
			`Expected a valid preview, received ${preview.status}.`,
		);
	}
	return preview;
}
