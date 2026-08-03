// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { parseMarkdown } from "../src/core/parser";
import { TAG_LABEL_ASSET_ID } from "../src/presentation/assets";
import {
	createDefaultMindMapInteractionState,
	createDefaultMindMapPresentation,
	type MindMapInteractionEvent,
	type MindMapInteractionState,
	type MindMapPresentation,
} from "../src/presentation/presentation";
import { projectMindMapFocus } from "../src/topic/interaction/node-focus";
import {
	DomSvgMindMapRenderer,
	type MindMapRenderInput,
} from "../src/ui/renderer";

afterEach(() => {
	document.body.replaceChildren();
});

describe("P0 renderer decorations and accessibility", () => {
	it("renders selectable decorations and includes them in the immutable export scene", async () => {
		const mindMap = parseMarkdown(
			"# Plan\n## Build\n# Release",
			"Map.md",
			"Map",
		);
		const plan = mindMap.root.children[0];
		const build = plan?.children[0];
		const release = mindMap.root.children[1];
		if (plan === undefined || build === undefined || release === undefined) {
			throw new Error("Expected decoration fixture nodes.");
		}

		const presentation = createDecoratedPresentation(plan.id, build.id, release.id);
		const interactions: MindMapInteractionEvent[] = [];
		const container = createContainer();
		const renderer = new DomSvgMindMapRenderer({
			interaction: (event) => interactions.push(event),
		});
		renderer.mount(container);
		renderer.render(createInput(mindMap, presentation));

		const layer = container.querySelector<SVGSVGElement>(
			".obmind-renderer-decorations",
		);
		const tag = getDecoration(container, "tag");
		const boundary = getDecoration(container, "boundary");
		const summary = getDecoration(container, "summary");
		const relationship = getDecoration(container, "relationship");
		expect(layer?.getAttribute("role")).toBe("group");
		expect(tag.getAttribute("role")).toBe("button");
		expect(tag.querySelector("text")?.textContent).toBe("Milestone");
		expect(boundary.querySelector("rect")).not.toBeNull();
		expect(summary.querySelector("polyline")).not.toBeNull();
		expect(relationship.querySelector("path")).not.toBeNull();

		relationship.dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true }),
		);
		tag.dispatchEvent(
			new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				key: "Enter",
			}),
		);
		tag.dispatchEvent(
			new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				key: " ",
			}),
		);
		expect(interactions).toContainEqual({
			type: "decoration-select",
			decorationId: "relationship",
		});
		expect(interactions).toContainEqual({
			type: "decoration-select",
			decorationId: "tag",
		});
		expect(
			interactions.filter(
				(event) =>
					event.type === "decoration-select" && event.decorationId === "tag",
			).length,
		).toBe(2);

		renderer.render(
			createInput(mindMap, presentation, {
				...createDefaultMindMapInteractionState(),
				selectedDecorationId: "relationship",
			}),
		);
		expect(getDecoration(container, "relationship").getAttribute("aria-pressed")).toBe(
			"true",
		);

		const scene = await renderer.captureExportScene({ scope: "full-map" });
		const ids = new Set(scene.primitives.map((primitive) => primitive.id));
		expect(ids).toContain("boundary");
		expect(ids).toContain("summary");
		expect(ids).toContain("relationship");
		expect(ids).toContain("tag:asset:tag-label:label");
		expect(
			scene.primitives.some((primitive) =>
				primitive.id?.includes("minimap") === true,
			),
		).toBe(false);

		renderer.destroy();
	});

	it("uses root treatment for a focused branch and keeps edges out of keyboard focus", () => {
		const mindMap = parseMarkdown(
			"# Parent\n## Child\n### Grandchild",
			"Map.md",
			"Map",
		);
		const parent = mindMap.root.children[0];
		const child = parent?.children[0];
		if (parent === undefined || child === undefined) {
			throw new Error("Expected focus fixture nodes.");
		}
		const projection = projectMindMapFocus(mindMap.root, parent.id, null);
		const container = createContainer();
		const renderer = new DomSvgMindMapRenderer({ interaction: () => undefined });
		renderer.mount(container);
		renderer.render({
			...createInput(mindMap),
			root: projection.root,
			interaction: {
				...createDefaultMindMapInteractionState(),
				focusRootNodeId: parent.id,
			},
		});

		const rootItem = getNode(container, parent.id);
		const childItem = getNode(container, child.id);
		expect(rootItem.classList.contains("obmind-node-root")).toBe(true);
		expect(rootItem.dataset.obmindNodeRole).toBe("root");
		expect(rootItem.getAttribute("aria-level")).toBe("1");
		expect(rootItem.getAttribute("aria-setsize")).toBe("1");
		expect(rootItem.getAttribute("aria-posinset")).toBe("1");
		expect(rootItem.getAttribute("aria-expanded")).toBe("true");
		expect(childItem.getAttribute("aria-level")).toBe("2");
		for (const edge of Array.from(
			container.querySelectorAll<SVGPathElement>(".obmind-edge"),
		)) {
			expect(edge.getAttribute("focusable")).toBe("false");
			expect(edge.getAttribute("tabindex")).toBe("-1");
			expect(edge.getAttribute("aria-hidden")).toBe("true");
		}

		renderer.render({
			...createInput(mindMap),
			root: projection.root,
			interaction: {
				...createDefaultMindMapInteractionState(),
				focusRootNodeId: parent.id,
				collapsedNodeIds: new Set([parent.id]),
			},
		});
		expect(getNode(container, parent.id).getAttribute("aria-expanded")).toBe(
			"false",
		);
		expect(
			container.querySelector(`[data-obmind-node-id="${child.id}"]`),
		).toBeNull();

		renderer.destroy();
	});
});

describe("P0 renderer minimap and culling", () => {
	it("recenters from the minimap, releases active pointer capture when hidden, and excludes minimap chrome from export", async () => {
		const mindMap = parseMarkdown("# Topic\n## Child", "Map.md", "Map");
		const interactions: MindMapInteractionEvent[] = [];
		const container = createContainer();
		const renderer = new DomSvgMindMapRenderer({
			interaction: (event) => interactions.push(event),
		});
		renderer.mount(container);
		const surface = getSurface(container);
		setElementSize(surface, 480, 300);
		renderer.render(
			createInput(
				mindMap,
				createDefaultMindMapPresentation("left-to-right"),
				{
					...createDefaultMindMapInteractionState(),
					minimapVisible: true,
				},
			),
		);

		const minimap = container.querySelector<SVGSVGElement>(".obmind-minimap");
		if (minimap === null) {
			throw new Error("Expected minimap.");
		}
		const setPointerCapture = vi.fn();
		const releasePointerCapture = vi.fn();
		Object.defineProperties(minimap, {
			setPointerCapture: { configurable: true, value: setPointerCapture },
			releasePointerCapture: { configurable: true, value: releasePointerCapture },
			hasPointerCapture: {
				configurable: true,
				value: vi.fn(() => true),
			},
			getBoundingClientRect: {
				configurable: true,
				value: () => new DOMRect(0, 0, 180, 120),
			},
		});
		expect(minimap.hasAttribute("hidden")).toBe(false);
		expect(minimap.style.display).toBe("");
		const overview = minimap.querySelector<SVGGElement>(
			".obmind-minimap-map",
		);
		expect(overview?.dataset.obmindMinimapNodeCount).toBe("3");
		expect(overview?.dataset.obmindMinimapEdgeCount).toBe("2");
		expect(
			minimap.querySelector(".obmind-minimap-edges")?.getAttribute("d"),
		).toMatch(/^M /u);
		expect(
			minimap.querySelector(".obmind-minimap-nodes")?.getAttribute("d"),
		).toContain(" Z");
		expect(
			minimap.querySelector(".obmind-minimap-root-nodes"),
		).not.toBeNull();
		expect(minimap.lastElementChild?.classList).toContain(
			"obmind-minimap-viewport",
		);
		minimap.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				cancelable: true,
				button: 0,
				clientX: 150,
				clientY: 80,
				isPrimary: true,
				pointerId: 91,
				pointerType: "mouse",
			}),
		);
		expect(setPointerCapture).toHaveBeenCalledWith(91);
		expect(interactions).toContainEqual(
			expect.objectContaining({ type: "viewport-change", reason: "pan" }),
		);

		const scene = await renderer.captureExportScene({ scope: "visible-map" });
		expect(
			scene.primitives.some((primitive) =>
				primitive.id?.includes("minimap") === true,
			),
		).toBe(false);

		renderer.render(createInput(mindMap));
		expect(minimap.hasAttribute("hidden")).toBe(true);
		expect(minimap.style.display).toBe("");
		expect(releasePointerCapture).toHaveBeenCalledWith(91);

		renderer.render(
			createInput(
				mindMap,
				createDefaultMindMapPresentation("left-to-right"),
				{
					...createDefaultMindMapInteractionState(),
					minimapVisible: true,
				},
			),
		);
		expect(minimap.style.display).toBe("");
		minimap.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				cancelable: true,
				button: 0,
				clientX: 30,
				clientY: 40,
				isPrimary: true,
				pointerId: 92,
				pointerType: "mouse",
			}),
		);
		renderer.destroy();
		expect(releasePointerCapture).toHaveBeenCalledWith(92);
	});

	it("culls large offscreen maps while pinning search-selected nodes and exporting every node asset", async () => {
		const source = Array.from(
			{ length: 420 },
			(_, index) => `# Topic ${String(index + 1)}`,
		).join("\n");
		const mindMap = parseMarkdown(source, "Large.md", "Large");
		const last = mindMap.root.children.at(-1);
		if (last === undefined) {
			throw new Error("Expected a final large-map topic.");
		}
		const base = createDefaultMindMapPresentation("left-to-right");
		const presentation: MindMapPresentation = {
			...base,
			revision: base.revision + 1,
			nodes: new Map([
				[
					last.id,
					{
						iconId: "flag",
						markerIds: ["priority-high"],
					},
				],
			]),
		};
		const container = createContainer();
		const renderer = new DomSvgMindMapRenderer({ interaction: () => undefined });
		renderer.mount(container);
		setElementSize(getSurface(container), 320, 180);
		const minimapInteraction = {
			...createDefaultMindMapInteractionState(),
			minimapVisible: true,
		};
		renderer.render(createInput(mindMap, presentation, minimapInteraction));

		const mountedBeforeSelection = container.querySelectorAll(".obmind-node").length;
		expect(mountedBeforeSelection).toBeLessThan(mindMap.root.children.length + 1);
		expect(
			container.querySelector<SVGGElement>(".obmind-minimap-map")?.dataset
				.obmindMinimapNodeCount,
		).toBe(String(mindMap.root.children.length + 1));
		expect(
			container.querySelector(`[data-obmind-node-id="${last.id}"]`),
		).toBeNull();

		renderer.render(
			createInput(mindMap, presentation, {
				...minimapInteraction,
				selectedNodeIds: new Set([last.id]),
				primarySelectedNodeId: last.id,
				selectionAnchorNodeId: last.id,
				focusedNodeId: last.id,
				hoveredNodeId: last.id,
			}),
		);
		expect(
			container.querySelector(`[data-obmind-node-id="${last.id}"]`),
		).not.toBeNull();

		const scene = await renderer.captureExportScene({ scope: "full-map" });
		expect(
			scene.primitives.some(
				(primitive) =>
					primitive.kind === "text" && primitive.text === "Topic 420",
			),
		).toBe(true);
		expect(
			scene.primitives.some(
				(primitive) =>
					primitive.id?.includes(`${last.id}:asset:0:asset:flag`) === true,
			),
		).toBe(true);
		expect(
			scene.primitives.some(
				(primitive) =>
					primitive.id?.includes(
						`${last.id}:asset:1:asset:priority-high`,
					) === true,
			),
		).toBe(true);

		renderer.destroy();
	});
});

function createDecoratedPresentation(
	planId: string,
	buildId: string,
	releaseId: string,
): MindMapPresentation {
	const base = createDefaultMindMapPresentation("left-to-right");
	return {
		...base,
		revision: base.revision + 1,
		decorations: [
			{
				id: "tag",
				kind: "marker",
				nodeId: planId,
				markerId: TAG_LABEL_ASSET_ID,
				label: "Milestone",
			},
			{
				id: "boundary",
				kind: "boundary",
				nodeIds: [planId, buildId],
				label: "Scope",
			},
			{
				id: "summary",
				kind: "summary",
				nodeIds: [planId, buildId],
				text: "Outcome",
			},
			{
				id: "relationship",
				kind: "relationship",
				fromNodeId: buildId,
				toNodeId: releaseId,
				label: "blocks",
			},
		],
	};
}

function createInput(
	mindMap: ReturnType<typeof parseMarkdown>,
	presentation: MindMapPresentation = createDefaultMindMapPresentation(
		"left-to-right",
	),
	interaction: MindMapInteractionState = createDefaultMindMapInteractionState(),
): MindMapRenderInput {
	return {
		root: mindMap.root,
		sourceRevision: mindMap.sourceRevision,
		language: "en",
		colorScheme: "light",
		presentation,
		interaction,
		topicCommandAvailability: {
			hasInternalClipboard: false,
			hasUndoEntry: false,
			hasRedoEntry: false,
		},
	};
}

function createContainer(): HTMLDivElement {
	const container = document.createElementNS(
		"http://www.w3.org/1999/xhtml",
		"div",
	) as HTMLDivElement;
	document.body.append(container);
	return container;
}

function getDecoration(container: HTMLElement, id: string): SVGGElement {
	const decoration = container.querySelector<SVGGElement>(
		`[data-obmind-decoration-id="${id}"]`,
	);
	if (decoration === null) {
		throw new Error(`Expected decoration ${id}.`);
	}
	return decoration;
}

function getNode(container: HTMLElement, id: string): HTMLElement {
	const node = container.querySelector<HTMLElement>(
		`[data-obmind-node-id="${id}"]`,
	);
	if (node === null) {
		throw new Error(`Expected node ${id}.`);
	}
	return node;
}

function getSurface(container: HTMLElement): HTMLDivElement {
	const surface = container.querySelector<HTMLDivElement>(
		".obmind-renderer-surface",
	);
	if (surface === null) {
		throw new Error("Expected renderer surface.");
	}
	return surface;
}

function setElementSize(
	element: HTMLElement,
	width: number,
	height: number,
): void {
	Object.defineProperties(element, {
		clientWidth: { configurable: true, value: width },
		clientHeight: { configurable: true, value: height },
	});
}
