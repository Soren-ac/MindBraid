import { describe, expect, it } from "vitest";

import type { MindMapDocument, MindMapNode } from "../src/core/model";
import { parseMarkdown } from "../src/core/parser";
import {
	createDefaultMindMapPresentation,
} from "../src/presentation/presentation";
import { MindMapViewSession } from "../src/application/session";
import type { MindMapLargeMapProtection } from "../src/layout/large-map-policy";

function parse(content: string) {
	return parseMarkdown(content, "Notes/Test.md", "Test");
}

describe("MindMapViewSession", () => {
	it("keeps interaction collections independent per open tab", () => {
		const document = parse("# A\n## B");
		const branchId = document.root.children[0]?.id;
		if (branchId === undefined) {
			throw new Error("Expected branch");
		}
		const first = new MindMapViewSession();
		const second = new MindMapViewSession();

		expect(first.toggleNode(document.root, branchId)).toBe(true);
		expect(first.getInteractionState().collapsedNodeIds).toEqual(
			new Set([branchId]),
		);
		expect(second.getInteractionState().collapsedNodeIds).toEqual(
			new Set(),
		);
	});

	it("clears logical focus when selection becomes empty", () => {
		const document = parse("# A");
		const nodeId = document.root.children[0]?.id;
		if (nodeId === undefined) {
			throw new Error("Expected topic");
		}
		const session = new MindMapViewSession();
		session.setSelection(new Set([nodeId]), nodeId);

		session.setSelection(new Set(), null, null);

		expect(session.getInteractionState()).toMatchObject({
			selectedNodeIds: new Set(),
			primarySelectedNodeId: null,
			selectionAnchorNodeId: null,
			focusedNodeId: null,
		});
	});

	it("keeps focus, depth, and minimap navigation state local to one tab", () => {
		const document = parse("# A\n## B\n### C");
		const branch = requireNode(document, "B");
		const first = new MindMapViewSession();
		const second = new MindMapViewSession();

		expect(first.setFocusRoot(document.root, branch.id)).toBe(true);
		expect(first.setVisibleDepthLimit(1)).toBe(true);
		expect(first.setMinimapVisible(true)).toBe(true);

		expect(first.getInteractionState()).toMatchObject({
			focusRootNodeId: branch.id,
			visibleDepthLimit: 1,
			minimapVisible: true,
			selectedNodeIds: new Set([branch.id]),
		});
		expect(second.getInteractionState()).toMatchObject({
			focusRootNodeId: null,
			visibleDepthLimit: null,
			minimapVisible: false,
		});
	});

	it("keeps a large-map full-render acknowledgement local to one tab and source", () => {
		const session = new MindMapViewSession();
		const initial = createLargeMapProtection({
			nodeCount: 10_001,
			initialVisibleDepthLimit: 3,
			initialVisibleNodeCount: 40,
			hiddenNodeCount: 9_961,
		});

		expect(
			session.applyLargeMapProtection("Notes/Large.md", initial),
		).toBe(true);
		expect(session.getInteractionState().visibleDepthLimit).toBe(3);
		expect(session.getLargeMapGuardState("Notes/Large.md")).toEqual({
			protection: initial,
			fullMapConfirmed: false,
		});

		expect(session.confirmLargeMapFullRender("Notes/Large.md")).toBe(true);
		expect(session.getInteractionState().visibleDepthLimit).toBeNull();
		expect(
			session.getLargeMapGuardState("Notes/Large.md")?.fullMapConfirmed,
		).toBe(true);

		const refreshed = createLargeMapProtection({
			nodeCount: 12_001,
			initialVisibleDepthLimit: 2,
			initialVisibleNodeCount: 13,
			hiddenNodeCount: 11_988,
		});
		expect(
			session.applyLargeMapProtection("Notes/Large.md", refreshed),
		).toBe(false);
		expect(session.getInteractionState().visibleDepthLimit).toBeNull();
		expect(session.getLargeMapGuardState("Notes/Large.md")).toEqual({
			protection: refreshed,
			fullMapConfirmed: true,
		});

		session.resetForSource();
		expect(session.getLargeMapGuardState("Notes/Large.md")).toBeNull();
		expect(
			session.applyLargeMapProtection("Notes/Other-large.md", initial),
		).toBe(true);
		expect(session.getInteractionState().visibleDepthLimit).toBe(3);
	});

	it("replaces only its own automatic depth as protection becomes stricter", () => {
		const session = new MindMapViewSession();
		const warning = createLargeMapProtection({
			level: "warning",
			nodeCount: 5_001,
			initialVisibleDepthLimit: 4,
			initialVisibleNodeCount: 121,
			hiddenNodeCount: 4_880,
		});
		const guarded = createLargeMapProtection({
			nodeCount: 10_001,
			initialVisibleDepthLimit: 3,
			initialVisibleNodeCount: 40,
			hiddenNodeCount: 9_961,
		});

		session.applyLargeMapProtection("Notes/Growing.md", warning);
		expect(session.getInteractionState().visibleDepthLimit).toBe(4);
		expect(
			session.applyLargeMapProtection("Notes/Growing.md", guarded),
		).toBe(true);
		expect(session.getInteractionState().visibleDepthLimit).toBe(3);

		// A user-selected depth is not silently overwritten by another refresh.
		session.setVisibleDepthLimit(1);
		expect(
			session.applyLargeMapProtection("Notes/Growing.md", warning),
		).toBe(false);
		expect(session.getInteractionState().visibleDepthLimit).toBe(1);
	});

	it("drills into a hidden search result instead of implicitly rendering a guarded map", () => {
		const document = parse("# A\n## B\n### Target\n#### Child");
		const target = requireNode(document, "Target");
		const session = new MindMapViewSession();
		session.applyLargeMapProtection(
			"Notes/Test.md",
			createLargeMapProtection({
				nodeCount: 10_001,
				initialVisibleDepthLimit: 1,
				initialVisibleNodeCount: 2,
				hiddenNodeCount: 9_999,
			}),
		);

		expect(session.revealNode(document.root, target.id)).toBe(true);
		expect(session.getInteractionState()).toMatchObject({
			focusRootNodeId: target.id,
			visibleDepthLimit: 1,
			selectedNodeIds: new Set([target.id]),
		});
	});

	it("keeps node and decoration selections mutually exclusive", () => {
		const document = parse("# A");
		const topic = requireNode(document, "A");
		const base = createDefaultMindMapPresentation("left-to-right");
		const decorated = {
			...base,
			decorations: [
				{
					id: "summary-1",
					kind: "summary" as const,
					nodeIds: [topic.id],
					text: "Summary",
				},
			],
		};
		const session = new MindMapViewSession();
		session.setDocumentPresentationOverride(decorated);

		expect(session.setSelectedDecoration("summary-1")).toBe(true);
		expect(session.getInteractionState()).toMatchObject({
			selectedDecorationId: "summary-1",
			selectedNodeIds: new Set(),
		});

		session.setSelection(new Set([topic.id]), topic.id);
		expect(session.getInteractionState()).toMatchObject({
			selectedDecorationId: null,
			selectedNodeIds: new Set([topic.id]),
		});
	});

	it("drops decoration selection when an effective presentation removes it", () => {
		const document = parse("# A");
		const topic = requireNode(document, "A");
		const base = createDefaultMindMapPresentation("left-to-right");
		const session = new MindMapViewSession();
		session.setDocumentPresentationOverride({
			...base,
			decorations: [
				{
					id: "boundary-1",
					kind: "boundary",
					nodeIds: [topic.id],
				},
			],
		});
		session.setSelectedDecoration("boundary-1");

		session.updateEffectivePresentationOverride((presentation) => ({
			...presentation,
			decorations: [],
		}));

		expect(session.getInteractionState().selectedDecorationId).toBeNull();
	});

	it("does not resurrect a collapsed state after a branch becomes a leaf", () => {
		const branchDocument = parse("# A\n## B");
		const branchId = branchDocument.root.children[0]?.id;
		if (branchId === undefined) {
			throw new Error("Expected branch");
		}
		const session = new MindMapViewSession();
		session.toggleNode(branchDocument.root, branchId);

		const leafDocument = parse("# A");
		session.reconcileDocument(branchDocument, leafDocument);
		session.reconcileDocument(
			leafDocument,
			parse("# A\n## C"),
		);

		expect(session.getInteractionState().collapsedNodeIds).toEqual(
			new Set(),
		);
	});

	it("collapse all keeps the root and first level visible", () => {
		const document = parse("# A\n## B\n### C\n# D");
		const session = new MindMapViewSession();
		session.collapseAll(document.root);

		expect([
			...session.getInteractionState().collapsedNodeIds,
		]).toEqual([
			document.root.children[0]?.id,
			document.root.children[0]?.children[0]?.id,
		]);
	});

	it("reveals a hidden search result by expanding ancestors and selecting it", () => {
		const document = parse("# A\n## B\n### Target\n#### Child");
		const branchA = requireNode(document, "A");
		const branchB = requireNode(document, "B");
		const target = requireNode(document, "Target");
		const session = new MindMapViewSession();
		session.toggleNode(document.root, branchA.id);
		session.toggleNode(document.root, branchB.id);

		expect(session.revealNode(document.root, target.id)).toBe(true);

		expect(session.getInteractionState()).toMatchObject({
			collapsedNodeIds: new Set(),
			selectedNodeIds: new Set([target.id]),
			primarySelectedNodeId: target.id,
			selectionAnchorNodeId: target.id,
			focusedNodeId: target.id,
		});
		expect(session.revealNode(document.root, "missing")).toBe(false);
	});

	it("keeps layout/theme choices but clears source-specific overrides", () => {
		const base = createDefaultMindMapPresentation("left-to-right");
		const presentation = {
			...base,
			nodes: new Map([
				["node:1", { shape: "pill" as const }],
			]),
			edges: new Map([
				["edge:1", { lineStyle: "dashed" as const }],
			]),
			decorations: [
				{
					id: "marker:1",
					kind: "marker" as const,
					nodeId: "node:1",
					markerId: "priority",
				},
			],
		};
		const session = new MindMapViewSession();
		session.setViewPresentationOverride(presentation);

		session.resetForSource();
		const next = session.getPresentationOverride();

		expect(next?.layout).toBe(presentation.layout);
		expect(next?.theme).toBe(presentation.theme);
		expect(next?.nodes.size).toBe(0);
		expect(next?.edges.size).toBe(0);
		expect(next?.decorations).toEqual([]);
	});

	it("keeps a view-scoped presentation above refreshed document state", () => {
		const documentPresentation = {
			...createDefaultMindMapPresentation("left-to-right"),
			revision: 2,
		};
		const refreshedDocumentPresentation = {
			...createDefaultMindMapPresentation("top-to-bottom"),
			revision: 3,
		};
		const viewPresentation = {
			...createDefaultMindMapPresentation("left-to-right"),
			revision: 4,
			layout: {
				...createDefaultMindMapPresentation("left-to-right").layout,
				orientation: "right-to-left" as const,
			},
		};
		const session = new MindMapViewSession();
		session.hydrateDocumentState(
			documentPresentation,
			new Set(),
			null,
		);
		session.setViewPresentationOverride(viewPresentation);

		session.hydrateDocumentState(
			refreshedDocumentPresentation,
			new Set(),
			null,
		);

		expect(session.getPresentationOverride()).toBe(viewPresentation);
		session.setViewPresentationOverride(null);
		expect(session.getPresentationOverride()).toBe(
			refreshedDocumentPresentation,
		);
	});

	it("restores a presentation preview baseline without replacing the document layer", () => {
		const documentPresentation = {
			...createDefaultMindMapPresentation("left-to-right"),
			revision: 2,
		};
		const viewPresentation = {
			...createDefaultMindMapPresentation("top-to-bottom"),
			revision: 3,
		};
		const previewPresentation = {
			...viewPresentation,
			revision: 4,
			layout: {
				...viewPresentation.layout,
				orientation: "right-to-left" as const,
			},
		};
		const baselineViewport = {
			centerX: 40,
			centerY: 60,
			scale: 1.25,
		};
		const session = new MindMapViewSession();
		session.hydrateDocumentState(documentPresentation, new Set(), null);
		session.setViewPresentationOverride(viewPresentation);
		session.setViewport(baselineViewport);
		session.setViewPresentationOverride(previewPresentation);
		session.setViewport({ centerX: 5, centerY: 10, scale: 2 });

		session.restorePresentationPreviewBaseline(
			viewPresentation,
			baselineViewport,
		);

		expect(session.getViewPresentationOverride()).toBe(viewPresentation);
		expect(session.getInteractionState().viewport).toEqual(baselineViewport);
		session.setViewPresentationOverride(null);
		expect(session.getPresentationOverride()).toBe(documentPresentation);
	});

	it("does not carry a hydrated document presentation into another source", () => {
		const presentation =
			createDefaultMindMapPresentation("top-to-bottom");
		const session = new MindMapViewSession();
		session.hydrateDocumentState(presentation, new Set(), null);

		session.resetForSource();

		expect(session.getPresentationOverride()).toBeNull();
	});

	it("reconciles all transient node state after source lines shift", () => {
		const previous = parse("# A\n## B\n### C\n# D");
		const next = parse("Intro\n\n# A\n## B\n### C\n# D");
		const previousA = requireNode(previous, "A");
		const previousB = requireNode(previous, "B");
		const previousC = requireNode(previous, "C");
		const previousD = requireNode(previous, "D");
		const session = new MindMapViewSession();
		session.toggleNode(previous.root, previousA.id);
		session.setSelection(
			new Set([previousA.id, previousB.id]),
			previousB.id,
			previousA.id,
		);
		session.setFocusedNode(previousC.id);
		session.setHoveredNode(previousD.id);

		session.reconcileDocument(previous, next);

		const nextA = requireNode(next, "A");
		const nextB = requireNode(next, "B");
		const nextC = requireNode(next, "C");
		const nextD = requireNode(next, "D");
		expect(session.getInteractionState()).toMatchObject({
			collapsedNodeIds: new Set([nextA.id]),
			selectedNodeIds: new Set([nextA.id, nextB.id]),
			primarySelectedNodeId: nextB.id,
			selectionAnchorNodeId: nextA.id,
			focusedNodeId: nextC.id,
			hoveredNodeId: nextD.id,
		});
	});

	it("preserves stable IDs and viewport on an unrelated source refresh", () => {
		const previous = parse("# A\n## B");
		const next = parse("# A\n## B\nBody text");
		const branch = requireNode(previous, "A");
		const selected = requireNode(previous, "B");
		const session = new MindMapViewSession();
		session.toggleNode(previous.root, branch.id);
		session.setSelection(new Set([selected.id]), selected.id);
		session.setHoveredNode(selected.id);
		session.setViewport({
			centerX: 20,
			centerY: 30,
			scale: 1.25,
		});

		session.reconcileDocument(previous, next);

		expect(session.getInteractionState()).toMatchObject({
			collapsedNodeIds: new Set([branch.id]),
			selectedNodeIds: new Set([selected.id]),
			primarySelectedNodeId: selected.id,
			selectionAnchorNodeId: selected.id,
			focusedNodeId: selected.id,
			hoveredNodeId: selected.id,
			viewport: {
				centerX: 20,
				centerY: 30,
				scale: 1.25,
			},
		});
	});

	it("preserves the viewport while activating a refreshed task toggle", () => {
		const previous = parse("- [ ] Task");
		const next = parse("- [x] Task");
		const previousTask = requireNode(previous, "Task");
		const nextTask = requireNode(next, "Task");
		const session = new MindMapViewSession();
		const viewport = {
			centerX: 860,
			centerY: -240,
			scale: 1.4,
		};
		const stalePersistedViewport = {
			centerX: 0,
			centerY: 0,
			scale: 1,
		};
		session.setSelection(new Set([previousTask.id]), previousTask.id);
		session.setViewport(viewport);

		session.reconcileDocument(previous, next);
		session.hydrateDocumentState(
			createDefaultMindMapPresentation("left-to-right"),
			new Set(),
			stalePersistedViewport,
			"preserve",
		);
		session.setSelection(new Set([nextTask.id]), nextTask.id);

		expect(session.getInteractionState()).toMatchObject({
			selectedNodeIds: new Set([nextTask.id]),
			primarySelectedNodeId: nextTask.id,
			focusedNodeId: nextTask.id,
			viewport,
		});
	});

	it("drops ambiguous duplicate state instead of rebinding it", () => {
		const previous = parse(
			"# Root\n## Same\n### Child\n## Same\n### Child",
		);
		const repeated = findNodes(previous, "Same");
		const target = repeated[1];
		if (target === undefined) {
			throw new Error("Expected a repeated branch.");
		}
		const next = parse(
			"# Root\n## Same\n### Child\n## Same\n### Child\n## Same\n### Child",
		);
		const session = new MindMapViewSession();
		session.toggleNode(previous.root, target.id);
		session.setSelection(new Set([target.id]), target.id);
		session.setFocusedNode(target.id);
		session.setHoveredNode(target.id);

		session.reconcileDocument(previous, next);

		expect(session.getInteractionState()).toMatchObject({
			collapsedNodeIds: new Set(),
			selectedNodeIds: new Set(),
			primarySelectedNodeId: null,
			selectionAnchorNodeId: null,
			focusedNodeId: null,
			hoveredNodeId: null,
		});
	});

	it("reconciles a uniquely fingerprinted branch after it moves", () => {
		const previous = parse(
			"# First\n## Topic\n### Child\n# Second",
		);
		const next = parse(
			"# First\n# Second\n## Topic\n### Child",
		);
		const previousTopic = requireNode(previous, "Topic");
		const session = new MindMapViewSession();
		session.toggleNode(previous.root, previousTopic.id);
		session.setSelection(
			new Set([previousTopic.id]),
			previousTopic.id,
		);
		session.setHoveredNode(previousTopic.id);

		session.reconcileDocument(previous, next);

		const nextTopic = requireNode(next, "Topic");
		expect(session.getInteractionState()).toMatchObject({
			collapsedNodeIds: new Set([nextTopic.id]),
			selectedNodeIds: new Set([nextTopic.id]),
			primarySelectedNodeId: nextTopic.id,
			selectionAnchorNodeId: nextTopic.id,
			focusedNodeId: nextTopic.id,
			hoveredNodeId: nextTopic.id,
		});
	});

	it("drops missing nodes and collapse state for a branch that became a leaf", () => {
		const previous = parse("# A\n## B");
		const next = parse("# A");
		const previousA = requireNode(previous, "A");
		const previousB = requireNode(previous, "B");
		const session = new MindMapViewSession();
		session.toggleNode(previous.root, previousA.id);
		session.setSelection(new Set([previousB.id]), previousB.id);
		session.setFocusedNode(previousB.id);
		session.setHoveredNode(previousB.id);

		session.reconcileDocument(previous, next);

		expect(session.getInteractionState()).toMatchObject({
			collapsedNodeIds: new Set(),
			selectedNodeIds: new Set(),
			primarySelectedNodeId: null,
			selectionAnchorNodeId: null,
			focusedNodeId: null,
			hoveredNodeId: null,
		});
	});
});

function requireNode(
	document: MindMapDocument,
	text: string,
): MindMapNode {
	const node = findNodes(document, text)[0];
	if (node === undefined) {
		throw new Error(`Expected node "${text}".`);
	}
	return node;
}

function findNodes(
	document: MindMapDocument,
	text: string,
): MindMapNode[] {
	const matches: MindMapNode[] = [];
	const pending: MindMapNode[] = [document.root];
	while (pending.length > 0) {
		const node = pending.shift();
		if (node === undefined) {
			continue;
		}
		if (node.text === text) {
			matches.push(node);
		}
		pending.push(...node.children);
	}
	return matches;
}

function createLargeMapProtection(
	values: Omit<
		MindMapLargeMapProtection,
		"level" | "requiresExplicitFullRender"
	> & {
		readonly level?: MindMapLargeMapProtection["level"];
	},
): MindMapLargeMapProtection {
	return {
		...values,
		level: values.level ?? "guarded",
		requiresExplicitFullRender: true,
	};
}
