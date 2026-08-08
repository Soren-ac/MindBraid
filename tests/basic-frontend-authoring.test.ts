// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { BasicMindMapFrontend } from "../src/ui/basic-frontend";
import { BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION } from "../src/application/composition/built-in-composition";
import type {
	MindMapFrontendEvent,
	MindMapFrontendFrame,
} from "../src/ui/frontend";
import {
	BILATERAL_TREE_LAYOUT_ENGINE_ID,
	TREE_LAYOUT_ENGINE_ID,
} from "../src/layout/layouts";
import { parseMarkdown } from "../src/core/parser";
import {
	createDefaultMindMapInteractionState,
	createDefaultMindMapPresentation,
} from "../src/presentation/presentation";
import { TAG_LABEL_ASSET_ID } from "../src/presentation/assets";
import type {
	MindMapRenderer,
	MindMapRendererCallbacks,
	MindMapRendererFactory,
} from "../src/ui/renderer";

type ApplyPresentationPatchEvent = Extract<
	MindMapFrontendEvent,
	{ readonly type: "apply-presentation-patch" }
>;

const renderer: MindMapRenderer = {
	mount: () => undefined,
	render: () => undefined,
	fitView: () => undefined,
	getViewport: () => null,
	setViewport: () => true,
	setViewActive: () => undefined,
	focusNode: () => false,
	beginNodeEdit: () => false,
	handleKeyboardGesture: () => false,
	destroy: () => undefined,
};

const rendererFactory: MindMapRendererFactory = {
	create: () => renderer,
};

function createRendererHarness(): {
	readonly factory: MindMapRendererFactory;
	emit(event: Parameters<MindMapRendererCallbacks["interaction"]>[0]): void;
} {
	let callbacks: MindMapRendererCallbacks | null = null;
	return {
		factory: {
			create: (nextCallbacks) => {
				callbacks = nextCallbacks;
				return renderer;
			},
		},
		emit: (event) => {
			if (callbacks === null) {
				throw new Error("Expected the frontend to create its renderer.");
			}
			callbacks.interaction(event);
		},
	};
}

function createAuthoringFrame(
	layoutEngineId = TREE_LAYOUT_ENGINE_ID,
): MindMapFrontendFrame {
	const document = parseMarkdown("# Topic\n- Child", "Map.md", "Map");
	const presentation = createDefaultMindMapPresentation("left-to-right");
	return {
		language: "en",
		document: {
			status: "ready",
			source: {
				path: "Map.md",
				basename: "Map",
				name: "Map.md",
				extension: "md",
			},
			document,
		},
		appearanceMode: "system",
		colorScheme: "dark",
		presentation: {
			...presentation,
			layout: {
				...presentation.layout,
				engineId: layoutEngineId,
				options: {},
			},
			theme:
				BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition.compose(
					"colorful",
					"colorful",
				),
		},
		interaction: createDefaultMindMapInteractionState(),
		capabilities: BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities,
		topicCommandAvailability: {
			hasInternalClipboard: false,
			hasUndoEntry: false,
			hasRedoEntry: false,
		},
		presentationHistoryAvailability: {
			hasUndoEntry: false,
			hasRedoEntry: false,
			undoAction: null,
			redoAction: null,
		},
	};
}

function createSelectedAuthoringFrame(): {
	readonly frame: MindMapFrontendFrame;
	readonly nodeIds: readonly [string, string];
} {
	const initial = createAuthoringFrame();
	if (initial.document.status !== "ready") {
		throw new Error("Expected a ready test frame.");
	}
	const heading = initial.document.document.root.children[0];
	const child = heading?.children[0];
	if (heading === undefined || child === undefined) {
		throw new Error("Expected two source-backed topics.");
	}
	const nodeIds = [heading.id, child.id] as const;
	return {
		nodeIds,
		frame: {
			...initial,
			interaction: {
				...initial.interaction,
				selectedNodeIds: new Set(nodeIds),
				primarySelectedNodeId: heading.id,
				selectionAnchorNodeId: heading.id,
			},
		},
	};
}

function withDecorations(
	frame: MindMapFrontendFrame,
	decorations: MindMapFrontendFrame["presentation"]["decorations"],
	selectedDecorationId: string | null = frame.interaction.selectedDecorationId,
): MindMapFrontendFrame {
	return {
		...frame,
		presentation: { ...frame.presentation, decorations },
		interaction: { ...frame.interaction, selectedDecorationId },
	};
}

function withSelectedDecoration(
	frame: MindMapFrontendFrame,
	decorations: MindMapFrontendFrame["presentation"]["decorations"],
	selectedDecorationId: string,
): MindMapFrontendFrame {
	return {
		...withDecorations(frame, decorations, selectedDecorationId),
		interaction: {
			...frame.interaction,
			selectedNodeIds: new Set(),
			primarySelectedNodeId: null,
			selectionAnchorNodeId: null,
			focusedNodeId: null,
			selectedDecorationId,
		},
	};
}

function requireElement<ElementType extends Element>(selector: string): ElementType {
	const element = document.body.querySelector<ElementType>(selector);
	if (element === null) {
		throw new Error(`Expected element matching ${selector}.`);
	}
	return element;
}

function presentationPatches(
	events: readonly MindMapFrontendEvent[],
): ApplyPresentationPatchEvent[] {
	return events.filter(
		(event): event is ApplyPresentationPatchEvent =>
			event.type === "apply-presentation-patch",
	);
}

afterEach(() => {
	document.body.replaceChildren();
});

describe("BasicMindMapFrontend presentation authoring", () => {
	it("renders registered layout options and emits engine-owned patches", async () => {
		const events: MindMapFrontendEvent[] = [];
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(createAuthoringFrame());

		const compactness = document.body.querySelector<HTMLSelectElement>(
			'select[data-obmind-layout-option-key="compactness"]',
		);
		const alignment = document.body.querySelector<HTMLInputElement>(
			'input[data-obmind-layout-option-key="alignSameLevel"]',
		);
		expect(
			Array.from(compactness?.options ?? [], (option) => option.value),
		).toEqual(["compact", "comfortable", "spacious"]);
		expect(alignment?.type).toBe("checkbox");
		if (compactness === null || alignment === null) {
			throw new Error("Expected capability-derived tree layout controls.");
		}

		compactness.value = "compact";
		compactness.dispatchEvent(new Event("change", { bubbles: true }));
		alignment.checked = false;
		alignment.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => {
			expect(
				events.filter((event) => event.type === "apply-presentation-patch"),
			).toHaveLength(2);
		});
		const treePatches = events.filter(
			(event): event is ApplyPresentationPatchEvent =>
				event.type === "apply-presentation-patch",
		);
		expect(
			treePatches.map((event) => event.patch.layout),
		).toContainEqual(
			expect.objectContaining({
				engineId: TREE_LAYOUT_ENGINE_ID,
				options: { compactness: "compact" },
			}),
		);
		expect(
			treePatches.map((event) => event.patch.layout),
		).toContainEqual(
			expect.objectContaining({
				engineId: TREE_LAYOUT_ENGINE_ID,
				options: { alignSameLevel: false },
			}),
		);

		frontend.update(createAuthoringFrame(BILATERAL_TREE_LAYOUT_ENGINE_ID));
		const balance = document.body.querySelector<HTMLSelectElement>(
			'select[data-obmind-layout-option-key="balanceStrategy"]',
		);
		if (balance === null) {
			throw new Error("Expected the bilateral branch distribution control.");
		}
		balance.value = "alternating";
		balance.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => {
			const patches = events.filter(
				(event): event is ApplyPresentationPatchEvent =>
					event.type === "apply-presentation-patch",
			);
			expect(patches.map((event) => event.patch.layout)).toContainEqual(
				expect.objectContaining({
					engineId: BILATERAL_TREE_LAYOUT_ENGINE_ID,
					options: { balanceStrategy: "alternating" },
				}),
			);
		});
		frontend.destroy();
	});

	it("previews, commits, cancels, and resets multi-topic formatting", async () => {
		const events: MindMapFrontendEvent[] = [];
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		const frame = createAuthoringFrame();
		if (frame.document.status !== "ready") {
			throw new Error("Expected a ready test frame.");
		}
		const heading = frame.document.document.root.children[0];
		const child = heading?.children[0];
		if (heading === undefined || child === undefined) {
			throw new Error("Expected two source-backed topics.");
		}
		const selectedNodeIds = new Set([heading.id, child.id]);
		frontend.update({
			...frame,
			interaction: {
				...frame.interaction,
				selectedNodeIds,
				primarySelectedNodeId: heading.id,
				selectionAnchorNodeId: heading.id,
			},
		});

		const shape = document.body.querySelector<HTMLSelectElement>(
			'select[data-obmind-formatting-field="shape"]',
		);
		const fontSize = document.body.querySelector<HTMLInputElement>(
			'input[data-obmind-formatting-field="fontSize"]',
		);
		const borderWidth = document.body.querySelector<HTMLInputElement>(
			'input[data-obmind-formatting-field="borderWidth"]',
		);
		const reset = document.body.querySelector<HTMLButtonElement>(
			"button[data-obmind-formatting-reset]",
		);
		if (
			shape === null ||
			fontSize === null ||
			borderWidth === null ||
			reset === null
		) {
			throw new Error("Expected selected-topic formatting controls.");
		}
		expect(shape.closest("section")?.hidden).toBe(false);

		shape.value = "ellipse";
		shape.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => {
			expect(
				events.some((event) => event.type === "apply-presentation-patch"),
			).toBe(true);
		});
		const shapeEvent = events.find(
			(event) => event.type === "apply-presentation-patch",
		);
		if (shapeEvent?.type !== "apply-presentation-patch") {
			throw new Error("Expected a selected-topic shape patch.");
		}
		expect(shapeEvent.patch.nodes).toEqual(
			new Map([
				[heading.id, { shape: "ellipse" }],
				[child.id, { shape: "ellipse" }],
			]),
		);

		events.length = 0;
		fontSize.value = "24";
		fontSize.dispatchEvent(new Event("input", { bubbles: true }));
		fontSize.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => {
			expect(events.at(-1)?.type).toBe("commit-presentation-preview");
		});
		const preview = events.find(
			(event) => event.type === "preview-presentation-patch",
		);
		const commit = events.find(
			(event) => event.type === "commit-presentation-preview",
		);
		if (
			preview?.type !== "preview-presentation-patch" ||
			commit?.type !== "commit-presentation-preview"
		) {
			throw new Error("Expected one formatting preview lifecycle.");
		}
		expect(commit.gestureId).toBe(preview.gestureId);
		expect(preview.patch.nodes?.get(heading.id)).toEqual({
			typography: { fontSize: 24 },
		});

		events.length = 0;
		borderWidth.value = "3";
		borderWidth.dispatchEvent(new Event("input", { bubbles: true }));
		borderWidth.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
		await vi.waitFor(() => {
			expect(events.at(-1)?.type).toBe("cancel-presentation-preview");
		});

		const icon = frame.capabilities.assets.find((asset) => asset.kind === "icon");
		const marker = frame.capabilities.assets.find(
			(asset) => asset.kind === "marker",
		);
		if (icon === undefined || marker === undefined) {
			throw new Error("Expected built-in icon and marker assets.");
		}
		frontend.update({
			...frame,
			interaction: {
				...frame.interaction,
				selectedNodeIds: new Set([heading.id, child.id]),
				primarySelectedNodeId: heading.id,
				selectionAnchorNodeId: heading.id,
			},
			presentation: {
				...frame.presentation,
				nodes: new Map(
					[heading.id, child.id].map((nodeId) => [
						nodeId,
						{
							shape: "ellipse",
							iconId: icon.id,
							markerIds: [marker.id],
						},
					]),
				),
			},
		});
		events.length = 0;
		reset.click();
		await vi.waitFor(() => {
			expect(events).toHaveLength(1);
		});
		const resetEvent = events[0];
		if (resetEvent?.type !== "apply-presentation-patch") {
			throw new Error("Expected a selected-topic reset patch.");
		}
		expect(resetEvent.patch.nodes).toEqual(
			new Map([
				[
					heading.id,
					{ iconId: icon.id, markerIds: [marker.id] },
				],
				[
					child.id,
					{ iconId: icon.id, markerIds: [marker.id] },
				],
			]),
		);
		frontend.destroy();
	});

	it("applies icon and marker assets across every selected topic", async () => {
		const events: MindMapFrontendEvent[] = [];
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			rendererFactory,
			() => undefined,
		);
		const { frame, nodeIds } = createSelectedAuthoringFrame();
		frontend.mount(document.body);
		frontend.update(frame);

		const icon = requireElement<HTMLButtonElement>(
			'button[data-obmind-asset-kind="icon"]',
		);
		const iconId = icon.dataset.obmindAssetId;
		if (iconId === undefined) {
			throw new Error("Expected the icon asset to have an ID.");
		}
		icon.click();
		await vi.waitFor(() => {
			expect(presentationPatches(events)).toHaveLength(1);
		});
		const iconPatch = presentationPatches(events)[0];
		if (iconPatch?.patch.nodes === undefined) {
			throw new Error("Expected an icon node-presentation patch.");
		}
		expect(iconPatch.scope).toBe("document");
		for (const nodeId of nodeIds) {
			expect(iconPatch.patch.nodes.get(nodeId)).toEqual({ iconId });
		}

		events.length = 0;
		const marker = requireElement<HTMLButtonElement>(
			'button[data-obmind-asset-kind="marker"]',
		);
		const markerId = marker.dataset.obmindAssetId;
		if (markerId === undefined) {
			throw new Error("Expected the marker asset to have an ID.");
		}
		marker.click();
		await vi.waitFor(() => {
			expect(presentationPatches(events)).toHaveLength(1);
		});
		const markerPatch = presentationPatches(events)[0];
		if (markerPatch?.patch.nodes === undefined) {
			throw new Error("Expected a marker node-presentation patch.");
		}
		for (const nodeId of nodeIds) {
			expect(markerPatch.patch.nodes.get(nodeId)).toEqual({
				markerIds: [markerId],
			});
		}
		frontend.destroy();
	});

	it("re-enables decoration text entry after a document becomes ready", () => {
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			rendererFactory,
			() => undefined,
		);
		const frame = createAuthoringFrame();
		frontend.mount(document.body);
		frontend.update({ ...frame, document: { status: "idle" } });

		const text = requireElement<HTMLInputElement>(
			"input[data-obmind-decoration-text]",
		);
		expect(text.disabled).toBe(true);

		frontend.update(frame);
		expect(text.disabled).toBe(false);
		frontend.destroy();
	});

	it("uses one replacement text label per selected topic and can clear it", async () => {
		const events: MindMapFrontendEvent[] = [];
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			rendererFactory,
			() => undefined,
		);
		const { frame, nodeIds } = createSelectedAuthoringFrame();
		frontend.mount(document.body);
		frontend.update(frame);

		const labelInput = requireElement<HTMLInputElement>(
			"input[data-obmind-node-asset-label]",
		);
		const getTagButton = (): HTMLButtonElement =>
			requireElement<HTMLButtonElement>(
				`button[data-obmind-asset-id="${TAG_LABEL_ASSET_ID}"]`,
			);
		labelInput.value = "  Release candidate  ";
		labelInput.dispatchEvent(new Event("input", { bubbles: true }));
		expect(getTagButton().disabled).toBe(false);
		getTagButton().click();
		await vi.waitFor(() => {
			expect(presentationPatches(events)).toHaveLength(1);
		});
		const created = presentationPatches(events)[0];
		if (created?.patch.decorations === undefined) {
			throw new Error("Expected a text-label decoration patch.");
		}
		expect(created.patch.nodes).toBeUndefined();
		expect(created.patch.decorations).toHaveLength(2);
		for (const nodeId of nodeIds) {
			expect(created.patch.decorations).toContainEqual(
				expect.objectContaining({
					kind: "marker",
					nodeId,
					markerId: TAG_LABEL_ASSET_ID,
					label: "Release candidate",
				}),
			);
		}

		frontend.update(withDecorations(frame, created.patch.decorations));
		events.length = 0;
		getTagButton().click();
		await vi.waitFor(() => {
			expect(presentationPatches(events)).toHaveLength(1);
		});
		expect(presentationPatches(events)[0]?.patch.decorations).toEqual([]);

		const existingLabels = nodeIds.map((nodeId, index) => ({
			id: `existing-label-${String(index + 1)}`,
			kind: "marker" as const,
			nodeId,
			markerId: TAG_LABEL_ASSET_ID,
			label: `Old ${String(index + 1)}`,
		}));
		frontend.update(withDecorations(frame, existingLabels));
		labelInput.value = "Current label";
		labelInput.dispatchEvent(new Event("input", { bubbles: true }));
		events.length = 0;
		getTagButton().click();
		await vi.waitFor(() => {
			expect(presentationPatches(events)).toHaveLength(1);
		});
		const replacement = presentationPatches(events)[0];
		if (replacement?.patch.decorations === undefined) {
			throw new Error("Expected a replacement text-label patch.");
		}
		expect(replacement.patch.decorations).toHaveLength(2);
		expect(
			replacement.patch.decorations.some((decoration) =>
				existingLabels.some((existing) => existing.id === decoration.id),
			),
		).toBe(false);
		for (const nodeId of nodeIds) {
			expect(replacement.patch.decorations).toContainEqual(
				expect.objectContaining({
					kind: "marker",
					nodeId,
					markerId: TAG_LABEL_ASSET_ID,
					label: "Current label",
				}),
			);
		}

		const icon = frame.capabilities.assets.find((asset) => asset.kind === "icon");
		const marker = frame.capabilities.assets.find(
			(asset) => asset.kind === "marker",
		);
		if (icon === undefined || marker === undefined) {
			throw new Error("Expected built-in icon and marker assets.");
		}
		frontend.update({
			...withDecorations(frame, replacement.patch.decorations),
			presentation: {
				...frame.presentation,
				nodes: new Map(
					nodeIds.map((nodeId) => [
						nodeId,
						{ iconId: icon.id, markerIds: [marker.id] },
					]),
				),
				decorations: replacement.patch.decorations,
			},
		});
		events.length = 0;
		requireElement<HTMLButtonElement>(
			"button[data-obmind-node-assets-clear]",
		).click();
		await vi.waitFor(() => {
			expect(presentationPatches(events)).toHaveLength(1);
		});
		const cleared = presentationPatches(events)[0];
		if (cleared?.patch.nodes === undefined) {
			throw new Error("Expected a node-asset clear patch.");
		}
		for (const nodeId of nodeIds) {
			expect(cleared.patch.nodes.get(nodeId)).toBeNull();
		}
		expect(cleared.patch.decorations).toEqual([]);
		frontend.destroy();
	});

	it("creates each supported decoration type from the selected topics", async () => {
		const events: MindMapFrontendEvent[] = [];
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			rendererFactory,
			() => undefined,
		);
		const { frame, nodeIds } = createSelectedAuthoringFrame();
		frontend.mount(document.body);
		frontend.update(frame);

		const kind = requireElement<HTMLSelectElement>(
			"select[data-obmind-decoration-kind]",
		);
		const text = requireElement<HTMLInputElement>(
			"input[data-obmind-decoration-text]",
		);
		const create = requireElement<HTMLButtonElement>(
			"button[data-obmind-decoration-create]",
		);
		const createDecoration = async (
			kindValue: "relationship" | "boundary" | "summary" | "marker",
			label: string,
		): Promise<ApplyPresentationPatchEvent> => {
			frontend.update(frame);
			kind.value = kindValue;
			kind.dispatchEvent(new Event("change", { bubbles: true }));
			text.value = label;
			text.dispatchEvent(new Event("input", { bubbles: true }));
			events.length = 0;
			create.click();
			await vi.waitFor(() => {
				expect(presentationPatches(events)).toHaveLength(1);
			});
			const event = presentationPatches(events)[0];
			if (event === undefined) {
				throw new Error("Expected a decoration presentation patch.");
			}
			return event;
		};

		const relationship = await createDecoration("relationship", "Depends on");
		expect(relationship.scope).toBe("document");
		expect(relationship.patch.decorations).toEqual([
			{
				id: "relationship-1",
				kind: "relationship",
				fromNodeId: nodeIds[0],
				toNodeId: nodeIds[1],
				label: "Depends on",
			},
		]);

		const boundary = await createDecoration("boundary", "Release scope");
		expect(boundary.patch.decorations).toEqual([
			{
				id: "boundary-1",
				kind: "boundary",
				nodeIds,
				label: "Release scope",
			},
		]);

		const summary = await createDecoration("summary", "Complete launch checklist");
		expect(summary.patch.decorations).toEqual([
			{
				id: "summary-1",
				kind: "summary",
				nodeIds,
				text: "Complete launch checklist",
			},
		]);

		const tag = await createDecoration("marker", "Ship this week");
		expect(tag.patch.decorations).toHaveLength(2);
		for (const nodeId of nodeIds) {
			expect(tag.patch.decorations).toContainEqual(
				expect.objectContaining({
					kind: "marker",
					nodeId,
					markerId: TAG_LABEL_ASSET_ID,
					label: "Ship this week",
				}),
			);
		}
		frontend.destroy();
	});

	it("updates and deletes the selected decoration without changing Markdown", async () => {
		const events: MindMapFrontendEvent[] = [];
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			rendererFactory,
			() => undefined,
		);
		const { frame, nodeIds } = createSelectedAuthoringFrame();
		const selectedFrame = withSelectedDecoration(
			frame,
			[
				{
					id: "relationship-1",
					kind: "relationship",
					fromNodeId: nodeIds[0],
					toNodeId: nodeIds[1],
					label: "Old label",
				},
			],
			"relationship-1",
		);
		frontend.mount(document.body);
		frontend.update(selectedFrame);

		const editorText = requireElement<HTMLInputElement>(
			"input[data-obmind-decoration-editor-text]",
		);
		const saveButton = requireElement<HTMLButtonElement>(
			'button[data-obmind-decoration-save="relationship-1"]',
		);
		expect(editorText.value).toBe("Old label");
		expect(selectedFrame.interaction.selectedNodeIds).toHaveLength(0);
		expect(saveButton.disabled).toBe(false);
		editorText.value = "Updated label";
		editorText.dispatchEvent(new Event("input", { bubbles: true }));
		saveButton.click();
		await vi.waitFor(() => {
			expect(presentationPatches(events)).toHaveLength(1);
		});
		const updated = presentationPatches(events)[0];
		expect(updated?.patch.decorations).toEqual([
			{
				id: "relationship-1",
				kind: "relationship",
				fromNodeId: nodeIds[0],
				toNodeId: nodeIds[1],
				label: "Updated label",
			},
		]);

		if (updated?.patch.decorations === undefined) {
			throw new Error("Expected an updated decoration list.");
		}
		frontend.update(
			withSelectedDecoration(
				selectedFrame,
				updated.patch.decorations,
				"relationship-1",
			),
		);
		events.length = 0;
		requireElement<HTMLButtonElement>(
			'button[data-obmind-decoration-delete="relationship-1"]',
		).click();
		await vi.waitFor(() => {
			expect(presentationPatches(events)).toHaveLength(1);
		});
		expect(presentationPatches(events)[0]?.patch.decorations).toEqual([]);
		expect(events).toContainEqual({
			type: "select-decoration",
			decorationId: null,
		});
		frontend.destroy();
	});

	it("edits selected boundary and summary text without retargeting nodes", async () => {
		const cases = [
			{
				id: "boundary-1",
				oldText: "Old boundary",
				newText: "Updated boundary",
				decoration: {
					id: "boundary-1",
					kind: "boundary" as const,
					nodeIds: [] as readonly string[],
					label: "Old boundary",
				},
			},
			{
				id: "summary-1",
				oldText: "Old summary",
				newText: "Updated summary",
				decoration: {
					id: "summary-1",
					kind: "summary" as const,
					nodeIds: [] as readonly string[],
					text: "Old summary",
				},
			},
		] as const;
		const { frame, nodeIds } = createSelectedAuthoringFrame();
		const events: MindMapFrontendEvent[] = [];
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);

		for (const testCase of cases) {
			const decoration = { ...testCase.decoration, nodeIds };
			const selectedFrame = withSelectedDecoration(
				frame,
				[decoration],
				testCase.id,
			);
			frontend.update(selectedFrame);
			const editorText = requireElement<HTMLInputElement>(
				"input[data-obmind-decoration-editor-text]",
			);
			const saveButton = requireElement<HTMLButtonElement>(
				`button[data-obmind-decoration-save="${testCase.id}"]`,
			);
			expect(selectedFrame.interaction.selectedNodeIds).toHaveLength(0);
			expect(editorText.value).toBe(testCase.oldText);
			expect(saveButton.disabled).toBe(false);

			editorText.value = testCase.newText;
			editorText.dispatchEvent(new Event("input", { bubbles: true }));
			events.length = 0;
			saveButton.click();
			await vi.waitFor(() => {
				expect(presentationPatches(events)).toHaveLength(1);
			});
			const updated = presentationPatches(events)[0];
			if (updated?.patch.decorations === undefined) {
				throw new Error("Expected an updated decoration list.");
			}
			expect(updated.patch.decorations).toHaveLength(1);
			const result = updated.patch.decorations[0];
			if (result?.kind === "boundary") {
				expect(result.nodeIds).toEqual(nodeIds);
				expect(result.label).toBe(testCase.newText);
			} else if (result?.kind === "summary") {
				expect(result.nodeIds).toEqual(nodeIds);
				expect(result.text).toBe(testCase.newText);
			} else {
				throw new Error("Expected a boundary or summary decoration.");
			}
		}
		frontend.destroy();
	});

	it("emits focus, depth, breadcrumb, and minimap navigation intents", async () => {
		const events: MindMapFrontendEvent[] = [];
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			rendererFactory,
			() => undefined,
		);
		const { frame, nodeIds } = createSelectedAuthoringFrame();
		if (frame.document.status !== "ready") {
			throw new Error("Expected a ready test frame.");
		}
		frontend.mount(document.body);
		frontend.update(frame);

		requireElement<HTMLButtonElement>(
			'button[data-obmind-navigation-action="focus-selected"]',
		).click();
		await vi.waitFor(() => {
			expect(events).toContainEqual({
				type: "change-focus-root",
				nodeId: nodeIds[0],
			});
		});

		const focusedFrame = {
			...frame,
			interaction: {
				...frame.interaction,
				focusRootNodeId: nodeIds[0],
			},
		};
		frontend.update(focusedFrame);
		events.length = 0;
		requireElement<HTMLButtonElement>(
			`button[data-obmind-focus-node-id="${frame.document.document.root.id}"]`,
		).click();
		await vi.waitFor(() => {
			expect(events).toEqual([
				{ type: "change-focus-root", nodeId: null },
			]);
		});

		events.length = 0;
		const depth = requireElement<HTMLSelectElement>(
			"select[data-obmind-navigation-depth]",
		);
		depth.value = "2";
		depth.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => {
			expect(events).toEqual([{ type: "change-visible-depth", depth: 2 }]);
		});

		events.length = 0;
		const minimap = requireElement<HTMLInputElement>(
			"input.obmind-navigation-checkbox",
		);
		minimap.checked = true;
		minimap.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => {
			expect(events).toEqual([
				{ type: "change-minimap-visibility", visible: true },
			]);
		});
		frontend.destroy();
	});

	it("forwards decoration selection and clears it with blank-canvas selection", async () => {
		const events: MindMapFrontendEvent[] = [];
		const rendererHarness = createRendererHarness();
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			rendererHarness.factory,
			() => undefined,
		);
		const { frame } = createSelectedAuthoringFrame();
		frontend.mount(document.body);
		frontend.update(frame);

		rendererHarness.emit({
			type: "decoration-select",
			decorationId: "relationship-1",
		});
		await vi.waitFor(() => {
			expect(events).toEqual([
				{ type: "select-decoration", decorationId: "relationship-1" },
			]);
		});

		events.length = 0;
		rendererHarness.emit({ type: "canvas-clear-selection" });
		await vi.waitFor(() => {
			expect(events).toHaveLength(2);
		});
		expect(events[0]).toMatchObject({
			type: "selection-change",
			primaryNodeId: null,
			anchorNodeId: null,
		});
		const clearSelection = events[0];
		if (clearSelection?.type !== "selection-change") {
			throw new Error("Expected a cleared node selection event.");
		}
		expect(clearSelection.selectedNodeIds).toEqual(new Set());
		expect(events[1]).toEqual({
			type: "select-decoration",
			decorationId: null,
		});
		frontend.destroy();
	});
});
