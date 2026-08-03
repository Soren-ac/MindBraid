import { describe, expect, it } from "vitest";

import type { LayoutPath, LayoutResult } from "../src/layout/layout";
import { createMindMapNodeEditSnapshot } from "../src/core/model";
import {
	canContinueNodeDragAfterRender,
	isValidNodeDragDrop,
} from "../src/topic/interaction/node-drag";
import { parseMarkdown } from "../src/core/parser";
import {
	createDefaultMindMapInteractionState,
	createDefaultMindMapPresentation,
	createMindMapRenderEffectRef,
	type MindMapPresentation,
} from "../src/presentation/presentation";
import {
	applyRoutingToEnginePath,
	calculateEdgeRenderPadding,
	calculateTerminalMarkerGeometry,
	canReuseRenderedMindMapScene,
	nodeMatchesMindMapEditSnapshot,
	resolveMindMapConnectorWidth,
	resolveMindMapNodeEditorBlurAction,
	type MindMapRenderInput,
} from "../src/ui/renderer";
import { BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION } from "../src/application/composition/built-in-composition";

const document = parseMarkdown("# Topic", "Map.md", "Map");
const topic = document.root.children[0];

if (topic === undefined) {
	throw new Error("Renderer fixture is missing its topic node.");
}

const edgeId = `edge:${document.root.id.length}:${document.root.id}:${topic.id}`;
const result: LayoutResult = {
	nodes: [
		{
			node: document.root,
			x: 0,
			y: 0,
			width: 120,
			height: 50,
			depth: 0,
		},
		{
			node: topic,
			x: 200,
			y: 10,
			width: 100,
			height: 40,
			depth: 1,
		},
	],
	edges: [
		{
			id: edgeId,
			fromId: document.root.id,
			toId: topic.id,
			path: {
				start: { x: 120, y: 25 },
				segments: [
					{
						kind: "cubic",
						control1: { x: 160, y: 25 },
						control2: { x: 160, y: 30 },
						to: { x: 200, y: 30 },
					},
				],
			},
		},
	],
	bounds: { x: 0, y: 0, width: 300, height: 50 },
};

function createRenderInput(): MindMapRenderInput {
	return {
		root: document.root,
		sourceRevision: "source:1",
		language: "zh-CN",
		colorScheme: "dark",
		presentation: createDefaultMindMapPresentation("left-to-right"),
		interaction: createDefaultMindMapInteractionState(),
		topicCommandAvailability: {
			hasInternalClipboard: false,
			hasUndoEntry: false,
			hasRedoEntry: false,
		},
	};
}

function withEdgeVisuals(options: {
	readonly width?: number;
	readonly roughness?: number;
	readonly markerSize?: number;
	readonly edgeOverrideWidth?: number;
}): MindMapPresentation {
	const base = createDefaultMindMapPresentation("left-to-right");
	return {
		...base,
		theme: {
			...base.theme,
			tokens: {
				...base.theme.tokens,
				edge: {
					...base.theme.tokens.edge,
					width: options.width ?? base.theme.tokens.edge.width,
				},
				effects: {
					...base.theme.tokens.effects,
					edgeStroke:
						options.roughness === undefined
							? null
							: createMindMapRenderEffectRef("test-pencil", {
									roughness: options.roughness,
								}),
					terminalMarker:
						options.markerSize === undefined
							? null
							: {
									effect:
										createMindMapRenderEffectRef(
											"test-marker",
										),
									placement: "leaf-target",
									size: options.markerSize,
								},
				},
			},
		},
		edges:
			options.edgeOverrideWidth === undefined
				? base.edges
				: new Map([
						[
							edgeId,
							{ width: options.edgeOverrideWidth },
						],
					]),
	};
}

describe("renderer scene invalidation", () => {
	it("reuses geometry when only selection, focus, hover, or viewport changes", () => {
		const previous = createRenderInput();
		const next: MindMapRenderInput = {
			...previous,
			interaction: {
				...previous.interaction,
				selectedNodeIds: new Set([topic.id]),
				focusedNodeId: topic.id,
				hoveredNodeId: document.root.id,
				viewport: { centerX: 10, centerY: 20, scale: 1.2 },
			},
		};

		expect(canReuseRenderedMindMapScene(previous, next)).toBe(true);
	});

	it("invalidates for source, layout, presentation, root, and collapse changes", () => {
		const previous = createRenderInput();

		expect(
			canReuseRenderedMindMapScene(previous, {
				...previous,
				sourceRevision: "source:2",
			}),
		).toBe(false);
		expect(
			canReuseRenderedMindMapScene(previous, {
				...previous,
				colorScheme: "light",
			}),
		).toBe(false);
		expect(
			canReuseRenderedMindMapScene(previous, {
				...previous,
				presentation: {
					...previous.presentation,
					revision: previous.presentation.revision + 1,
				},
			}),
		).toBe(false);
		expect(
			canReuseRenderedMindMapScene(previous, {
				...previous,
				presentation: {
					...previous.presentation,
					layout: {
						...previous.presentation.layout,
						orientation: "top-to-bottom",
					},
				},
			}),
		).toBe(false);
		expect(
			canReuseRenderedMindMapScene(previous, {
				...previous,
				root: { ...previous.root },
			}),
		).toBe(false);
		expect(
			canReuseRenderedMindMapScene(previous, {
				...previous,
				interaction: {
					...previous.interaction,
					collapsedNodeIds: new Set([topic.id]),
				},
			}),
		).toBe(false);
	});

	it("keeps an inline editor through an equivalent parser refresh only", () => {
		const snapshot = createMindMapNodeEditSnapshot(
			topic,
			document.sourceRevision,
		);
		const reparsed = parseMarkdown("# Topic", "Map.md", "Map");
		const equivalentTopic = reparsed.root.children[0];

		if (equivalentTopic === undefined) {
			throw new Error("Equivalent renderer fixture is missing its topic.");
		}
		expect(equivalentTopic).not.toBe(topic);
		expect(
			nodeMatchesMindMapEditSnapshot(
				equivalentTopic,
				snapshot,
			),
		).toBe(true);
		const changedTopic = parseMarkdown(
			"# Changed",
			"Map.md",
			"Map",
		).root.children[0];
		if (changedTopic === undefined) {
			throw new Error("Changed renderer fixture is missing its topic.");
		}
		expect(
			nodeMatchesMindMapEditSnapshot(
				changedTopic,
				snapshot,
			),
		).toBe(false);
	});
});

describe("renderer node-drag guards", () => {
	it("cancels a drag when its immutable source frame changes", () => {
		expect(
			canContinueNodeDragAfterRender(
				document.root,
				topic.id,
				"source:1",
				"source:1",
			),
		).toBe(true);
		expect(
			canContinueNodeDragAfterRender(
				document.root,
				topic.id,
				"source:1",
				"source:2",
			),
		).toBe(false);
	});

	it("allows a child drop on the root but never sibling placement around it", () => {
		expect(
			isValidNodeDragDrop(
				document.root,
				topic.id,
				document.root.id,
				"child",
			),
		).toBe(true);
		expect(
			isValidNodeDragDrop(
				document.root,
				topic.id,
				document.root.id,
				"before",
			),
		).toBe(false);
	});
});

describe("inline editor blur policy", () => {
	it("commits a deliberate focus move with a related target", () => {
		expect(
			resolveMindMapNodeEditorBlurAction({
				activeElement: "other",
				documentHasFocus: true,
				hasRelatedTarget: true,
			}),
		).toBe("commit");
	});

	it("keeps the draft when the window loses focus", () => {
		expect(
			resolveMindMapNodeEditorBlurAction({
				activeElement: "editor",
				documentHasFocus: false,
				hasRelatedTarget: false,
			}),
		).toBe("keep");
	});

	it("keeps the draft when the editor still owns activeElement", () => {
		expect(
			resolveMindMapNodeEditorBlurAction({
				activeElement: "editor",
				documentHasFocus: true,
				hasRelatedTarget: false,
			}),
		).toBe("keep");
	});

	it("refocuses a transient document-level blur", () => {
		expect(
			resolveMindMapNodeEditorBlurAction({
				activeElement: "document",
				documentHasFocus: true,
				hasRelatedTarget: false,
			}),
		).toBe("refocus");
	});

	it("commits when focus moved to another control in the same document", () => {
		expect(
			resolveMindMapNodeEditorBlurAction({
				activeElement: "other",
				documentHasFocus: true,
				hasRelatedTarget: false,
			}),
		).toBe("commit");
	});
});

describe("renderer edge geometry", () => {
	it("keeps a terminal circle outside the target and tangent to its port", () => {
		const path: LayoutPath = {
			start: { x: 0, y: 20 },
			segments: [
				{
					kind: "cubic",
					control1: { x: 30, y: 20 },
					control2: { x: 80, y: 20 },
					to: { x: 100, y: 20 },
				},
			],
		};
		const marker = calculateTerminalMarkerGeometry(path, 10);

		expect(marker).toEqual({
			center: { x: 95, y: 20 },
			radius: 5,
		});
		expect(marker.center.x + marker.radius).toBe(100);
	});

	it("computes SVG bleed from widths, hand-drawn roughness, and markers", () => {
		const basePadding = calculateEdgeRenderPadding(
			result,
			withEdgeVisuals({ width: 2 }),
		);
		const widePadding = calculateEdgeRenderPadding(
			result,
			withEdgeVisuals({ width: 20 }),
		);
		const roughPadding = calculateEdgeRenderPadding(
			result,
			withEdgeVisuals({ width: 20, roughness: 4 }),
		);
		const markerPadding = calculateEdgeRenderPadding(
			result,
			withEdgeVisuals({
				width: 2,
				markerSize: 40,
			}),
		);
		const overridePadding = calculateEdgeRenderPadding(
			result,
			withEdgeVisuals({
				width: 2,
				edgeOverrideWidth: 50,
			}),
		);

		expect(widePadding).toBeGreaterThan(basePadding);
		expect(roughPadding).toBeGreaterThan(widePadding);
		expect(markerPadding).toBeGreaterThanOrEqual(41);
		expect(overridePadding).toBeGreaterThanOrEqual(28);
	});

	it("resolves connector width from edge override, document formatting, then style", () => {
		const base = createDefaultMindMapPresentation("left-to-right");
		const formatted: MindMapPresentation = {
			...base,
			formatting:
				BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.formatting.compose(
					"style-default",
					"thick",
				),
		};

		expect(resolveMindMapConnectorWidth(base)).toBe(
			base.theme.tokens.edge.width,
		);
		expect(resolveMindMapConnectorWidth(formatted)).toBe(2.25);
		expect(resolveMindMapConnectorWidth(formatted, { width: 4 })).toBe(4);
		expect(calculateEdgeRenderPadding(result, formatted)).toBeGreaterThanOrEqual(
			calculateEdgeRenderPadding(result, base),
		);
	});

	it("applies presentation routing between bilateral engine-owned ports", () => {
		const path = result.edges[0]?.path;
		if (path === undefined) {
			throw new Error("Renderer fixture edge is missing its path.");
		}

		expect(applyRoutingToEnginePath(path, "bezier")).toBe(path);
		expect(applyRoutingToEnginePath(path, "straight")).toEqual({
			start: path.start,
			segments: [{ kind: "line", to: { x: 200, y: 30 } }],
		});
		const orthogonal = applyRoutingToEnginePath(path, "orthogonal");
		expect(orthogonal.start).toEqual(path.start);
		expect(orthogonal.segments).toHaveLength(3);
		expect(orthogonal.segments.every(({ kind }) => kind === "line")).toBe(
			true,
		);
		expect(orthogonal.segments.at(-1)?.to).toEqual({ x: 200, y: 30 });
	});
});
