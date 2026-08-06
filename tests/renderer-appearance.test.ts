// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION } from "../src/application/composition/built-in-composition";
import { BILATERAL_TREE_LAYOUT_ENGINE_ID } from "../src/layout/bilateral-layout";
import type {
	MindMapExportCirclePrimitive,
	MindMapExportEllipsePrimitive,
	MindMapExportPathPrimitive,
	MindMapExportRectPrimitive,
} from "../src/export/types";
import { serializeMindMapExportSceneToSvg } from "../src/export/svg";
import { parseMarkdown } from "../src/core/parser";
import {
	createDefaultMindMapInteractionState,
	createDefaultMindMapPresentation,
	createDefaultMindMapPaletteSpec,
	createDefaultMindMapThemeSpec,
	createMindMapRenderEffectRef,
	composeMindMapTheme,
	literalColor,
	resolveMindMapThemeColors,
	type MindMapInteractionEvent,
	type MindMapThemeColor,
} from "../src/presentation/presentation";
import { PENCIL_DOT_EFFECT_ID } from "../src/presentation/render-effects";
import { createAtlasCardsStyleSpec } from "../src/presentation/styles";
import { DomSvgMindMapRenderer } from "../src/ui/renderer";
import { createMindMapTaskCheckmarkPathData } from "../src/presentation/task-control";

afterEach(() => {
	document.body.replaceChildren();
});

describe("DOM/SVG renderer appearance", () => {
	it("renders Atlas Cards with branch-colored first topics and surface subtopics", () => {
		const mindMap = parseMarkdown(
			"# Strategy\n## Research\n### Notes",
			"Atlas.md",
			"Atlas",
		);
		const mainTopic = mindMap.root.children[0];
		const subtopic = mainTopic?.children[0];
		const deeperSubtopic = subtopic?.children[0];
		if (
			mainTopic === undefined ||
			subtopic === undefined ||
			deeperSubtopic === undefined
		) {
			throw new Error("Expected a three-level Atlas fixture.");
		}

		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		const presentation = createDefaultMindMapPresentation("left-to-right");
		const theme = composeMindMapTheme(
			createAtlasCardsStyleSpec(),
			createDefaultMindMapPaletteSpec({
				id: "atlas-appearance",
				label: "Atlas appearance",
				colors: {
					canvas: literalColor("#fffdf9"),
					surface: literalColor("#f4f0e8"),
					surfaceEmphasis: literalColor("#e8d2ba"),
					text: literalColor("#302820"),
					textOnAccent: literalColor("#ffffff"),
					border: literalColor("#d8cbbd"),
					edge: literalColor("#ad9885"),
					branchPalette: [literalColor("#d97c5a")],
				},
				roles: {
					root: {
						fill: literalColor("#e8d2ba"),
						stroke: literalColor("#c7a883"),
						textColor: literalColor("#302820"),
					},
				},
			}),
		);
		renderer.render({
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN",
			colorScheme: "light",
			presentation: { ...presentation, theme },
			interaction: createDefaultMindMapInteractionState(),
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		});

		const getTopicFill = (nodeId: string): string => {
			const content = container.querySelector<HTMLElement>(
				`[data-obmind-node-id="${nodeId}"] .obmind-node-content`,
			);
			if (content === null) {
				throw new Error(`Expected topic ${nodeId} to be rendered.`);
			}
			return content.style.getPropertyValue("--obmind-node-fill");
		};

		expect(getTopicFill(mainTopic.id)).toBe("#d97c5a");
		expect(getTopicFill(subtopic.id)).toBe("#f4f0e8");
		expect(getTopicFill(deeperSubtopic.id)).toBe("#f4f0e8");
		const edge = container.querySelector<SVGPathElement>(".obmind-edge");
		if (edge === null) {
			throw new Error("Expected Atlas to render an edge.");
		}
		expect(edge.style.stroke).toBe("#d97c5a");
		expect(edge.getAttribute("d")).not.toMatch(/[CQ]/u);

		renderer.destroy();
	});

	it("keeps the collapsed center topic disclosure available for expansion", () => {
		const mindMap = parseMarkdown(
			"# First\n## Child\n# Second",
			"Interaction Test.md",
			"Interaction Test",
		);
		const interactions: MindMapInteractionEvent[] = [];
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: (event) => interactions.push(event),
		});
		renderer.mount(container);
		const presentation = createDefaultMindMapPresentation("left-to-right");
		renderer.render({
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN",
			colorScheme: "light",
			presentation: {
				...presentation,
				layout: {
					...presentation.layout,
					engineId: BILATERAL_TREE_LAYOUT_ENGINE_ID,
				},
			},
			interaction: {
				...createDefaultMindMapInteractionState(),
				collapsedNodeIds: new Set([mindMap.root.id]),
			},
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		});

		const root = container.querySelector<HTMLElement>(
			`[data-obmind-node-id="${mindMap.root.id}"]`,
		);
		const toggle = root?.querySelector<HTMLButtonElement>(
			".obmind-node-toggle",
		);
		expect(root?.classList.contains("obmind-node-collapsed")).toBe(true);
		expect(toggle?.hidden).toBe(false);
		expect(toggle?.textContent).toBe("3");
		expect(toggle?.getAttribute("aria-expanded")).toBe("false");

		toggle?.click();
		expect(interactions).toContainEqual({
			type: "node-toggle",
			nodeId: mindMap.root.id,
		});
		renderer.destroy();
	});

	it("captures visible and full export snapshots without changing live interaction state", async () => {
		const mindMap = parseMarkdown(
			"# Parent\n## Child\n### Grandchild\n- [x] Complete task",
			"Map.md",
			"Map",
		);
		const parent = mindMap.root.children[0];
		if (parent === undefined) {
			throw new Error("Expected the renderer export fixture to contain Parent.");
		}
		const interaction = {
			...createDefaultMindMapInteractionState(),
			collapsedNodeIds: new Set([parent.id]),
			selectedNodeIds: new Set([parent.id]),
			primarySelectedNodeId: parent.id,
			selectionAnchorNodeId: parent.id,
			focusedNodeId: parent.id,
			hoveredNodeId: parent.id,
			viewport: { centerX: 50, centerY: 25, scale: 1.25 },
		};
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		renderer.render({
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN",
			colorScheme: "dark",
			presentation: createDefaultMindMapPresentation("left-to-right"),
			interaction,
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		});

		const visibleScene = await renderer.captureExportScene({
			scope: "visible-map",
		});
		const fullScene = await renderer.captureExportScene({
			scope: "full-map",
		});
		const visibleText = getExportText(visibleScene);
		const fullText = getExportText(fullScene);

		expect(visibleScene.scope).toBe("visible-map");
		expect(visibleText).toContain("Parent");
		expect(visibleText).not.toContain("Grandchild");
		expect(fullScene.scope).toBe("full-map");
		expect(fullText).toContain("Grandchild");
		expect(fullText).toContain("Complete task");
		expect(
			fullScene.primitives.some(
				(primitive) => primitive.id?.includes("toggle") === true,
			),
		).toBe(false);
		expect(interaction.collapsedNodeIds).toEqual(new Set([parent.id]));
		expect(interaction.selectedNodeIds).toEqual(new Set([parent.id]));
		expect(interaction.focusedNodeId).toBe(parent.id);
		expect(interaction.hoveredNodeId).toBe(parent.id);
		expect(
			container.querySelector<HTMLElement>(
				`.obmind-node[data-obmind-node-id="${parent.id}"]`,
			)?.classList.contains("obmind-node-selected"),
		).toBe(true);
		expect(
			container.querySelector(".obmind-export-measure-layer"),
		).toBeNull();

		renderer.destroy();
	});

	it("rejects an already-cancelled snapshot without leaving measurement DOM", async () => {
		const mindMap = parseMarkdown("# Topic", "Map.md", "Map");
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		renderer.render({
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN",
			colorScheme: "dark",
			presentation: createDefaultMindMapPresentation("left-to-right"),
			interaction: createDefaultMindMapInteractionState(),
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		});
		const controller = new AbortController();
		controller.abort();

		await expect(
			renderer.captureExportScene(
				{ scope: "visible-map" },
				controller.signal,
			),
		).rejects.toMatchObject({ code: "aborted" });
		expect(
			container.querySelector(".obmind-export-measure-layer"),
		).toBeNull();

		renderer.destroy();
	});

	it("releases an in-flight measurement layer when its renderer is destroyed", async () => {
		const mindMap = parseMarkdown("# Topic", "Map.md", "Map");
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		renderer.render({
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN",
			colorScheme: "dark",
			presentation: createDefaultMindMapPresentation("left-to-right"),
			interaction: createDefaultMindMapInteractionState(),
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		});
		const ownerWindow = document.defaultView;
		if (ownerWindow === null) {
			throw new Error("Expected a renderer test window.");
		}
		const requestAnimationFrame = vi
			.spyOn(ownerWindow, "requestAnimationFrame")
			.mockImplementation(() => 73);
		const cancelAnimationFrame = vi.spyOn(
			ownerWindow,
			"cancelAnimationFrame",
		);
		try {
			const capture = renderer.captureExportScene({
				scope: "full-map",
			});
			await Promise.resolve();
			expect(
				container.querySelector(".obmind-export-measure-layer"),
			).not.toBeNull();
			renderer.destroy();
			await expect(capture).rejects.toMatchObject({ code: "aborted" });
			expect(cancelAnimationFrame).toHaveBeenCalledWith(73);
			expect(
				container.querySelector(".obmind-export-measure-layer"),
			).toBeNull();
		} finally {
			requestAnimationFrame.mockRestore();
			cancelAnimationFrame.mockRestore();
			renderer.destroy();
		}
	});

	it("uses the live layout for visible exports and reserves hidden measurement for full exports", async () => {
		const mindMap = parseMarkdown(
			"# Parent\n## Child\n### Grandchild",
			"Map.md",
			"Map",
		);
		const parent = mindMap.root.children[0];
		if (parent === undefined) {
			throw new Error("Expected a parent topic.");
		}
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		renderer.render({
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN",
			colorScheme: "dark",
			presentation: createDefaultMindMapPresentation("left-to-right"),
			interaction: {
				...createDefaultMindMapInteractionState(),
				collapsedNodeIds: new Set([parent.id]),
			},
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		});

		const visibleCapture = renderer.captureExportScene({
			scope: "visible-map",
		});
		expect(
			container.querySelector(".obmind-export-measure-layer"),
		).toBeNull();
		const visible = await visibleCapture;
		expect(getExportText(visible)).not.toContain("Grandchild");

		const progress: string[] = [];
		const fullCapture = renderer.captureExportScene(
			{ scope: "full-map" },
			undefined,
			(event) => progress.push(event.stage),
		);
		expect(
			container.querySelector(".obmind-export-measure-layer"),
		).not.toBeNull();
		const full = await fullCapture;
		expect(getExportText(full)).toContain("Grandchild");
		expect(progress).toEqual(
			expect.arrayContaining([
				"preparing",
				"measuring",
				"layout",
				"drawing",
				"complete",
			]),
		);
		expect(
			container.querySelector(".obmind-export-measure-layer"),
		).toBeNull();

		renderer.destroy();
	});

	it("remeasures linked topics for visible exports without reserving omitted link controls", async () => {
		const mindMap = parseMarkdown(
			"# [Plan](Notes/Plan.md)",
			"Map.md",
			"Map",
		);
		const topic = mindMap.root.children[0];
		if (topic === undefined) {
			throw new Error("Expected a linked topic.");
		}
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		renderer.render({
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN",
			colorScheme: "light",
			presentation: createDefaultMindMapPresentation("left-to-right"),
			interaction: createDefaultMindMapInteractionState(),
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		});

		expect(
			container.querySelector<HTMLElement>(
				`[data-obmind-node-id="${topic.id}"]`,
			)?.classList.contains("obmind-node-has-links"),
		).toBe(true);
		const visibleCapture = renderer.captureExportScene({
			scope: "visible-map",
		});
		expect(
			container.querySelector(".obmind-export-measure-layer"),
		).not.toBeNull();
		const visible = await visibleCapture;
		const full = await renderer.captureExportScene({ scope: "full-map" });
		const getShape = (scene: typeof visible) => {
			const shape = scene.primitives.find(
				(primitive) =>
					(primitive.kind === "rect" || primitive.kind === "ellipse") &&
					primitive.id === `${topic.id}:shape`,
			);
			if (shape === undefined || shape.kind === "circle") {
				throw new Error("Expected an exported linked-topic shape.");
			}
			return shape;
		};

		expect(getShape(visible)).toEqual(getShape(full));
		expect(
			visible.primitives.some(
				(primitive) => primitive.id?.includes(":link:") === true,
			),
		).toBe(false);
		expect(
			container.querySelector(".obmind-export-measure-layer"),
		).toBeNull();

		renderer.destroy();
	});

	it("caches immutable visible scene snapshots and extracts long labels by run rather than character", async () => {
		const longTopic = "Long topic ".repeat(300).trim();
		const mindMap = parseMarkdown(
			`# ${longTopic}`,
			"Map.md",
			"Map",
		);
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		const input = {
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN" as const,
			colorScheme: "dark" as const,
			presentation: createDefaultMindMapPresentation("left-to-right"),
			interaction: createDefaultMindMapInteractionState(),
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		};
		renderer.render(input);
		const createRange = vi.spyOn(document, "createRange");
		try {
			const first = await renderer.captureExportScene({
				scope: "visible-map",
			});
			expect(getExportText(first)).toContain(longTopic);
			expect(createRange.mock.calls.length).toBeLessThan(64);
			createRange.mockClear();

			const firstBounds = first.bounds as { width: number };
			firstBounds.width = 987_654;
			const cached = await renderer.captureExportScene({
				scope: "visible-map",
			});
			expect(cached).not.toBe(first);
			expect(cached.bounds.width).not.toBe(987_654);
			expect(createRange).not.toHaveBeenCalled();

			renderer.render({
				...input,
				sourceRevision: "source:changed-after-cache",
			});
			const refreshed = await renderer.captureExportScene({
				scope: "visible-map",
			});
			expect(refreshed.sourceRevision).toBe("source:changed-after-cache");
		} finally {
			createRange.mockRestore();
			renderer.destroy();
		}
	});

	it("repaints container, nodes, branches, and edges when only the color scheme changes", () => {
		const mindMap = parseMarkdown("# Topic", "Map.md", "Map");
		const presentation = createAppearancePresentation();
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);

		const baseInput = {
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN" as const,
			presentation,
			interaction: createDefaultMindMapInteractionState(),
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		} as const;

		renderer.render({ ...baseInput, colorScheme: "dark" });
		expectAppearanceColors(container, {
			surface: "#111111",
			fill: "#111111",
			stroke: "#333333",
			edge: "#333333",
		});

		renderer.render({ ...baseInput, colorScheme: "light" });
		expectAppearanceColors(container, {
			surface: "#eeeeee",
			fill: "#eeeeee",
			stroke: "#cccccc",
			edge: "#cccccc",
		});

		renderer.destroy();
	});

	it("derives disclosure colors from the node branch and refreshes explicit node colors", () => {
		const mindMap = parseMarkdown(
			"# Parent\n## Child\n### Grandchild",
			"Map.md",
			"Map",
		);
		const parent = mindMap.root.children[0];
		if (parent === undefined) {
			throw new Error("Expected a parent topic.");
		}
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		const presentation = createAppearancePresentation();
		const baseInput = {
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN" as const,
			presentation,
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		} as const;
		const getDisclosure = (): {
			readonly node: HTMLElement;
			readonly toggle: HTMLButtonElement;
		} => {
			const node = container.querySelector<HTMLElement>(
				`[data-obmind-node-id="${parent.id}"]`,
			);
			const toggle = node?.querySelector<HTMLButtonElement>(
				".obmind-node-toggle",
			);
			if (
				node === null ||
				node === undefined ||
				toggle === null ||
				toggle === undefined
			) {
				throw new Error("Expected a disclosure control for Parent.");
			}
			return { node, toggle };
		};

		renderer.render({
			...baseInput,
			colorScheme: "dark",
			interaction: createDefaultMindMapInteractionState(),
		});
		const darkDisclosure = getDisclosure();
		expect(
			darkDisclosure.node.style.getPropertyValue(
				"--obmind-disclosure-accent",
			),
		).toBe("#333333");
		expect(
			darkDisclosure.node.style.getPropertyValue(
				"--obmind-disclosure-surface",
			),
		).toBe("#101010");
		expect(darkDisclosure.toggle.textContent).toBe("");
		expect(darkDisclosure.toggle.getAttribute("aria-expanded")).toBe(
			"true",
		);

		renderer.render({
			...baseInput,
			colorScheme: "light",
			interaction: createDefaultMindMapInteractionState(),
		});
		const lightDisclosure = getDisclosure();
		expect(
			lightDisclosure.node.style.getPropertyValue(
				"--obmind-disclosure-accent",
			),
		).toBe("#cccccc");
		expect(
			lightDisclosure.node.style.getPropertyValue(
				"--obmind-disclosure-surface",
			),
		).toBe("#fefefe");

		const explicitAccent = literalColor("#d14f79");
		renderer.render({
			...baseInput,
			colorScheme: "dark",
			presentation: {
				...presentation,
				revision: presentation.revision + 1,
				nodes: new Map([
					[parent.id, { stroke: explicitAccent }],
				]),
			},
			interaction: {
				...createDefaultMindMapInteractionState(),
				collapsedNodeIds: new Set([parent.id]),
			},
		});
		const disclosure = getDisclosure();
		expect(
			disclosure.node.style.getPropertyValue(
				"--obmind-disclosure-accent",
			),
		).toBe("#d14f79");
		expect(disclosure.toggle.textContent).toBe("2");
		expect(disclosure.toggle.dataset.obmindHiddenCount).toBe("2");
		expect(disclosure.toggle.getAttribute("aria-expanded")).toBe("false");

		renderer.destroy();
	});

	it("ignores inactive branch colors and follows the topic treatment that is actually visible", () => {
		const mindMap = parseMarkdown(
			"# Parent\n## Child",
			"Map.md",
			"Map",
		);
		const parent = mindMap.root.children[0];
		if (parent === undefined) {
			throw new Error("Expected a parent topic.");
		}
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		const presentation = createDefaultMindMapPresentation(
			"left-to-right",
		);
		const roleFill = literalColor("#82cbb0");
		const normalText = literalColor("#26352f");
		const inactiveBranch = literalColor("#ff00aa");
		const theme = createDefaultMindMapThemeSpec({
			id: "inactive-disclosure-branch",
			revision: 1,
			tokens: {
				colors: {
					canvas: literalColor("#ffffff"),
					text: normalText,
					branchPalette: [inactiveBranch],
				},
				node: { borderWidth: 0 },
				branches: {
					mode: "root-subtree",
					colorNodeFill: false,
					colorNodeStroke: false,
					colorNodeText: false,
					colorEdgeStroke: false,
				},
				roles: {
					mainTopic: {
						shape: "rounded-rectangle",
						fill: roleFill,
						borderWidth: 0,
					},
				},
			},
		});
		const renderTheme = (
			nextTheme: typeof theme,
			revision: number,
		): HTMLElement => {
			renderer.render({
				root: mindMap.root,
				sourceRevision: mindMap.sourceRevision,
				language: "zh-CN",
				colorScheme: "light",
				presentation: {
					...presentation,
					revision,
					theme: nextTheme,
				},
				interaction: createDefaultMindMapInteractionState(),
				topicCommandAvailability: {
					hasInternalClipboard: false,
					hasUndoEntry: false,
					hasRedoEntry: false,
				},
			});
			const node = container.querySelector<HTMLElement>(
				`[data-obmind-node-id="${parent.id}"]`,
			);
			if (node === null) {
				throw new Error("Expected the Parent topic to be rendered.");
			}
			return node;
		};

		const filledNode = renderTheme(theme, 1);
		expect(
			filledNode.style.getPropertyValue("--obmind-disclosure-accent"),
		).toBe("#82cbb0");
		expect(
			filledNode.style.getPropertyValue("--obmind-disclosure-accent"),
		).not.toBe("#ff00aa");

		const unfilledTheme = createDefaultMindMapThemeSpec({
			...theme,
			revision: 2,
			tokens: {
				...theme.tokens,
				roles: {
					...theme.tokens.roles,
					mainTopic: {
						...theme.tokens.roles.mainTopic,
						shape: "none",
					},
				},
			},
		});
		const unfilledNode = renderTheme(unfilledTheme, 2);
		expect(
			unfilledNode.style.getPropertyValue(
				"--obmind-disclosure-accent",
			),
		).toBe("#26352f");

		renderer.destroy();
	});

	it("reserves task-control space and derives checkbox colors from the visible topic", async () => {
		const mindMap = parseMarkdown(
			"- [ ] Pending\n- [x] Complete\n- [ ] مهمة",
			"Map.md",
			"Map",
		);
		const pending = mindMap.root.children[0];
		const complete = mindMap.root.children[1];
		const rtl = mindMap.root.children[2];
		if (pending === undefined || complete === undefined || rtl === undefined) {
			throw new Error("Expected three task topics.");
		}
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		const presentation = createDefaultMindMapPresentation(
			"left-to-right",
		);
		const theme = createDefaultMindMapThemeSpec({
			id: "task-control-test",
			revision: 1,
			tokens: {
				colors: {
					canvas: literalColor("#ffffff"),
					text: literalColor("#202124"),
					textOnAccent: literalColor("#ffffff"),
					branchPalette: [literalColor("#e5252a")],
				},
				node: {
					borderWidth: 0,
					paddingInline: 13,
				},
				branches: {
					mode: "root-subtree",
					colorNodeFill: true,
					colorNodeStroke: false,
					colorNodeText: false,
					colorEdgeStroke: true,
				},
				roles: {
					mainTopic: {
						shape: "rounded-rectangle",
						borderWidth: 0,
						paddingInline: 13,
					},
				},
			},
		});
		renderer.render({
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN",
			colorScheme: "light",
			presentation: {
				...presentation,
				theme,
			},
			interaction: createDefaultMindMapInteractionState(),
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		});

		const getTaskControl = (
			nodeId: string,
		): { readonly node: HTMLElement; readonly control: HTMLButtonElement } => {
			const node = container.querySelector<HTMLElement>(
				`[data-obmind-node-id="${nodeId}"]`,
			);
			const control = node?.querySelector<HTMLButtonElement>(
				".obmind-node-task-checkbox",
			);
			if (
				node === null ||
				node === undefined ||
				control === null ||
				control === undefined
			) {
				throw new Error("Expected a task control.");
			}
			return { node, control };
		};
		const pendingTask = getTaskControl(pending.id);
		const completeTask = getTaskControl(complete.id);
		const rtlTask = getTaskControl(rtl.id);

		expect(pendingTask.node.classList.contains("obmind-node-has-task")).toBe(
			true,
		);
		expect(
			pendingTask.node.style.getPropertyValue(
				"--obmind-task-inline-inset",
			),
		).toBe("13px");
		expect(
			pendingTask.node.style.getPropertyValue(
				"--obmind-task-control-size",
			),
		).toBe("16px");
		expect(
			pendingTask.node.style.getPropertyValue(
				"--obmind-task-control-gap",
			),
		).toBe("7px");
		expect(
			pendingTask.node.style.getPropertyValue("--obmind-task-accent"),
		).toBe("#ffffff");
		expect(
			pendingTask.node.style.getPropertyValue("--obmind-task-surface"),
		).toBe("#e5252a");
		expect(pendingTask.control.textContent).toBe("");
		expect(pendingTask.control.getAttribute("aria-checked")).toBe("false");
		expect(completeTask.control.textContent).toBe("");
		expect(completeTask.control.getAttribute("aria-checked")).toBe("true");
		expect(
			completeTask.control.querySelector(".obmind-node-task-checkmark")
				?.getAttribute("d"),
		).toBe(createMindMapTaskCheckmarkPathData());
		expect(rtlTask.node.getAttribute("dir")).toBe("auto");
		expect(
			rtlTask.node
				.querySelector(".obmind-node-content")
				?.getAttribute("dir"),
		).toBe("auto");

		const scene = await renderer.captureExportScene({ scope: "full-map" });
		const exportedCheckmark = scene.primitives.find(
			(primitive): primitive is MindMapExportPathPrimitive =>
				primitive.kind === "path" &&
				primitive.id === `${complete.id}:task-check`,
		);
		expect(exportedCheckmark).toMatchObject({
			kind: "path",
			fill: { kind: "none" },
			lineCap: "round",
			lineJoin: "round",
		});
		expect(exportedCheckmark?.strokeWidth).toBeCloseTo(1.75);
		expect(
			scene.primitives.some(
				(primitive) =>
					primitive.kind === "text" &&
					primitive.id === `${complete.id}:task-check`,
			),
		).toBe(false);

		renderer.destroy();
	});

	it("keeps pencil treatment and paper texture stable while only the palette changes", () => {
		const mindMap = parseMarkdown("# Topic", "Map.md", "Map");
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);

		const basePresentation = createDefaultMindMapPresentation(
			"left-to-right",
		);
		const renderPalette = (paletteId: string, revision: number): void => {
			renderer.render({
				root: mindMap.root,
				sourceRevision: mindMap.sourceRevision,
				language: "zh-CN",
				colorScheme: "dark",
				presentation: {
					...basePresentation,
					revision,
					theme:
						BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition.compose(
							"pencil-sketch",
							paletteId,
						),
				},
				interaction: createDefaultMindMapInteractionState(),
				topicCommandAvailability: {
					hasInternalClipboard: false,
					hasUndoEntry: false,
					hasRedoEntry: false,
				},
			});
		};

		renderPalette("pencil-sketch", 1);
		const pencilTexture = getPaperTextureVariables(container);
		const pencilTopic = getRenderedTopic(container);
		const pencilStroke = pencilTopic.content.style.getPropertyValue(
			"--obmind-node-stroke",
		);
		const pencilTreatment = {
			shape: pencilTopic.node.dataset.obmindNodeShape,
			strokeEffect: pencilTopic.node.dataset.obmindNodeStrokeEffect,
			fillEffect: pencilTopic.node.dataset.obmindNodeFillEffect,
			fontFamily: pencilTopic.content.style.getPropertyValue(
				"--obmind-node-font-family",
			),
		};

		renderPalette("colorful", 2);
		const colorfulTopic = getRenderedTopic(container);
		expect(getPaperTextureVariables(container)).toEqual(pencilTexture);
		expect({
			shape: colorfulTopic.node.dataset.obmindNodeShape,
			strokeEffect: colorfulTopic.node.dataset.obmindNodeStrokeEffect,
			fillEffect: colorfulTopic.node.dataset.obmindNodeFillEffect,
			fontFamily: colorfulTopic.content.style.getPropertyValue(
				"--obmind-node-font-family",
			),
		}).toEqual(pencilTreatment);
		expect(
			colorfulTopic.content.style.getPropertyValue(
				"--obmind-node-stroke",
			),
		).not.toBe(pencilStroke);

		renderer.destroy();
	});

	it("captures registered Technical Draft and Charcoal materials for export", async () => {
		const mindMap = parseMarkdown(
			"# Parent\n## Child\n- Detail",
			"Materials.md",
			"Materials",
		);
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		const base = createDefaultMindMapPresentation("left-to-right");
		const renderStyle = (styleId: string, revision: number): void => {
			renderer.render({
				root: mindMap.root,
				sourceRevision: mindMap.sourceRevision,
				language: "zh-CN",
				colorScheme: "light",
				presentation: {
					...base,
					revision,
					theme:
						BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition.compose(
							styleId,
							"colorful",
						),
				},
				interaction: createDefaultMindMapInteractionState(),
				topicCommandAvailability: {
					hasInternalClipboard: false,
					hasUndoEntry: false,
					hasRedoEntry: false,
				},
			});
		};

		renderStyle("technical-draft", 1);
		expect(container.dataset.obmindCanvasEffect).toBe("technical-grid");
		const technicalScene = await renderer.captureExportScene({
			scope: "visible-map",
		});
		expect(technicalScene.canvasTexture).toMatchObject({
			kind: "technical-grid",
			cellSize: 24,
			majorEvery: 5,
			opacity: 0.18,
		});

		renderStyle("charcoal", 2);
		expect(container.dataset.obmindCanvasEffect).toBe("charcoal-paper");
		expect(
			container.querySelector<HTMLElement>(".obmind-node-heading")?.dataset
				.obmindNodeStrokeEffect,
		).toBe("charcoal-stroke");
		const charcoalHeading = container.querySelector<HTMLElement>(
			".obmind-node-heading",
		);
		expect(charcoalHeading?.dataset.obmindNodeStrokeGeometry).toBe(
			"rough-contour",
		);
		const liveContour = charcoalHeading?.querySelector<SVGPathElement>(
			".obmind-node-stroke-path",
		);
		expect(
			charcoalHeading
				?.querySelector<SVGSVGElement>(".obmind-node-stroke-overlay")
				?.hasAttribute("hidden"),
		).toBe(false);
		expect(liveContour?.getAttribute("d")).toMatch(/^M .* L .* Z$/);
		expect(liveContour?.getAttribute("stroke-dasharray")).toBe(
			"19 1.3 7 0.7 29 1.1",
		);
		expect(
			container
				.querySelector<SVGCircleElement>(".obmind-edge-terminal")
				?.getAttribute("opacity"),
		).toBe("0.62");
		const charcoalScene = await renderer.captureExportScene({
			scope: "visible-map",
		});
		expect(charcoalScene.canvasTexture?.kind).toBe("charcoal-paper");
		expect(
			charcoalScene.primitives.some(
				(primitive) =>
					"fill" in primitive &&
					typeof primitive.fill !== "string" &&
					primitive.fill.kind === "speckle",
			),
		).toBe(true);
		expect(
			charcoalScene.primitives.some(
				(primitive) =>
					primitive.kind === "path" &&
					primitive.opacity !== undefined &&
					primitive.opacity < 1,
			),
		).toBe(true);
		const charcoalContours = charcoalScene.primitives.filter(
			(primitive): primitive is MindMapExportPathPrimitive =>
				primitive.kind === "path" &&
				(primitive.id?.endsWith(":contour") ?? false),
		);
		expect(charcoalContours.length).toBeGreaterThan(0);
		expect(
			charcoalContours.every(
				(primitive) =>
					JSON.stringify(primitive.dashArray) ===
					JSON.stringify([19, 1.3, 7, 0.7, 29, 1.1]),
			),
		).toBe(true);
		const charcoalSvg = serializeMindMapExportSceneToSvg(charcoalScene, {
			background: "theme",
			padding: 0,
		}).svg;
		expect(charcoalSvg).toContain(
			'stroke-dasharray="19 1.3 7 0.7 29 1.1"',
		);
		const charcoalBaseShapes = charcoalScene.primitives.filter(
			(
				primitive,
			): primitive is
				| MindMapExportRectPrimitive
				| MindMapExportEllipsePrimitive =>
				(primitive.kind === "rect" || primitive.kind === "ellipse") &&
				(primitive.id?.endsWith(":shape") ?? false) &&
				!(primitive.id?.endsWith(":double:shape") ?? false),
		);
		expect(charcoalBaseShapes.length).toBeGreaterThan(0);
		expect(
			charcoalBaseShapes.every(
				(primitive) =>
					primitive.stroke === "transparent" &&
					primitive.strokeWidth === 0,
			),
		).toBe(true);
		const charcoalOutlines = charcoalScene.primitives.filter(
			(primitive): primitive is MindMapExportPathPrimitive =>
				primitive.kind === "path" &&
				(primitive.id?.endsWith(":contour") ?? false),
		);
		expect(charcoalOutlines).toHaveLength(charcoalBaseShapes.length);
		expect(
			charcoalOutlines.every(
				(primitive) =>
					primitive.strokeWidth >= 0.8 &&
					(primitive.opacity ?? 1) < 1 &&
					primitive.data.endsWith(" Z"),
			),
		).toBe(true);
		expect(
			charcoalScene.primitives.some(
				(primitive) => primitive.id?.endsWith(":double:shape") ?? false,
			),
		).toBe(false);
		const charcoalTerminalMarkers = charcoalScene.primitives.filter(
			(
				primitive,
			): primitive is MindMapExportCirclePrimitive =>
				primitive.kind === "circle" &&
				(primitive.id?.endsWith(":terminal") ?? false),
		);
		expect(charcoalTerminalMarkers.length).toBeGreaterThan(0);
		expect(
			charcoalTerminalMarkers.every(
				(primitive) => primitive.opacity === 0.62,
			),
		).toBe(true);

		renderer.destroy();
	});

	it("keeps normal selection feedback when Charcoal topics cannot render a rough contour", () => {
		const mindMap = parseMarkdown(
			"# Main topic\n## Supporting detail",
			"Charcoal feedback.md",
			"Charcoal feedback",
		);
		const mainTopic = mindMap.root.children[0];
		const supportingDetail = mainTopic?.children[0];
		if (mainTopic === undefined || supportingDetail === undefined) {
			throw new Error("Expected the Charcoal fixture to contain two topics.");
		}

		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		const presentation = createDefaultMindMapPresentation("left-to-right");
		const charcoalTheme =
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition.compose(
				"charcoal",
				"colorful",
			);

		const render = (
			theme: typeof charcoalTheme,
			interaction = createDefaultMindMapInteractionState(),
			revision = 1,
		): void => {
			renderer.render({
				root: mindMap.root,
				sourceRevision: mindMap.sourceRevision,
				language: "zh-CN",
				colorScheme: "light",
				presentation: { ...presentation, revision, theme },
				interaction,
				topicCommandAvailability: {
					hasInternalClipboard: false,
					hasUndoEntry: false,
					hasRedoEntry: false,
				},
			});
		};

		render(charcoalTheme);
		const rootElement = container.querySelector<HTMLElement>(
			`[data-obmind-node-id="${mindMap.root.id}"]`,
		);
		const mainElement = container.querySelector<HTMLElement>(
			`[data-obmind-node-id="${mainTopic.id}"]`,
		);
		const detailElement = container.querySelector<HTMLElement>(
			`[data-obmind-node-id="${supportingDetail.id}"]`,
		);
		if (
			rootElement === null ||
			mainElement === null ||
			detailElement === null
		) {
			throw new Error("Expected all Charcoal fixture topics to be rendered.");
		}
		expect(rootElement.dataset.obmindNodeStrokeGeometry).toBe(
			"rough-contour",
		);
		expect(mainElement.dataset.obmindNodeStrokeGeometry).toBe(
			"rough-contour",
		);

		const unframedCharcoalTheme = {
			...charcoalTheme,
			revision: `${String(charcoalTheme.revision)}:unframed`,
			tokens: {
				...charcoalTheme.tokens,
				roles: {
					...charcoalTheme.tokens.roles,
					root: {
						...charcoalTheme.tokens.roles.root,
						shape: "none" as const,
					},
					mainTopic: {
						...charcoalTheme.tokens.roles.mainTopic,
						shape: "underline" as const,
					},
				},
			},
		};
		render(
			unframedCharcoalTheme,
			{
				...createDefaultMindMapInteractionState(),
				selectedNodeIds: new Set([mindMap.root.id, mainTopic.id]),
				primarySelectedNodeId: mindMap.root.id,
				selectionAnchorNodeId: mindMap.root.id,
				focusedNodeId: mindMap.root.id,
			},
			2,
		);

		// The same DOM elements are reused across a presentation change. Their
		// stale contour marker must be removed so the regular selected/focused
		// CSS treatment remains available for unframed topics.
		expect(rootElement.dataset.obmindNodeStrokeGeometry).toBeUndefined();
		expect(mainElement.dataset.obmindNodeStrokeGeometry).toBeUndefined();
		expect(
			rootElement
				.querySelector<SVGSVGElement>(".obmind-node-stroke-overlay")
				?.hasAttribute("hidden"),
		).toBe(true);
		expect(
			mainElement
				.querySelector<SVGSVGElement>(".obmind-node-stroke-overlay")
				?.hasAttribute("hidden"),
		).toBe(true);
		expect(rootElement.classList.contains("obmind-node-selected")).toBe(true);
		expect(rootElement.classList.contains("obmind-node-focused")).toBe(true);
		expect(mainElement.classList.contains("obmind-node-selected")).toBe(true);

		// A shape that can draw a contour remains on the charcoal treatment.
		expect(detailElement.dataset.obmindNodeStrokeGeometry).toBe(
			"rough-contour",
		);
		expect(
			detailElement
				.querySelector<SVGSVGElement>(".obmind-node-stroke-overlay")
				?.hasAttribute("hidden"),
		).toBe(false);

		renderer.destroy();
	});

	it("uses normal palette text for every visually unfilled built-in topic", () => {
		const mindMap = parseMarkdown("# Main\n## Child", "Map.md", "Map");
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		const base = createDefaultMindMapPresentation("left-to-right");
		const composition = BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION;
		let checkedNodeCount = 0;

		for (const colorScheme of ["light", "dark"] as const) {
			for (const style of composition.capabilities.styles) {
				for (const palette of composition.capabilities.palettes) {
					const theme = composition.themeComposition.compose(
						style.id,
						palette.id,
					);
					renderer.render({
						root: mindMap.root,
						sourceRevision: mindMap.sourceRevision,
						language: "zh-CN",
						colorScheme,
						presentation: {
							...base,
							revision: checkedNodeCount + 1,
							theme,
						},
						interaction: createDefaultMindMapInteractionState(),
						topicCommandAvailability: {
							hasInternalClipboard: false,
							hasUndoEntry: false,
							hasRedoEntry: false,
						},
					});

					const colors = resolveMindMapThemeColors(theme, colorScheme);
					const expectedText = themeColorCssValue(colors.text);
					const canvas = themeColorCssValue(colors.canvas);
					for (const node of Array.from(
						container.querySelectorAll<HTMLElement>(".obmind-node"),
					)) {
						const content = node.querySelector<HTMLElement>(
							".obmind-node-content",
						);
						if (content === null) {
							continue;
						}
						const shape = node.dataset.obmindNodeShape;
						const fill = content.style.getPropertyValue(
							"--obmind-node-fill",
						);
						if (
							shape !== "none" &&
							shape !== "underline" &&
							fill !== canvas
						) {
							continue;
						}
						checkedNodeCount += 1;
						expect(
							content.style.getPropertyValue("--obmind-node-text"),
							`${style.id}/${palette.id}/${colorScheme}/${node.dataset.obmindNodeRole}`,
						).toBe(expectedText);
					}
				}
			}
		}

		expect(checkedNodeCount).toBeGreaterThan(0);
		renderer.destroy();
	});

	it("applies document-wide font and connector width without changing the theme axes", () => {
		const mindMap = parseMarkdown("# Topic", "Map.md", "Map");
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		const base = createDefaultMindMapPresentation("left-to-right");

		renderer.render({
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN",
			colorScheme: "dark",
			presentation: {
				...base,
				theme:
					BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition.compose(
						"colorful",
						"colorful",
					),
				formatting:
					BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.formatting.compose(
						"monospace",
						"thick",
					),
			},
			interaction: createDefaultMindMapInteractionState(),
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		});

		const topic = getRenderedTopic(container);
		const edge = container.querySelector<SVGPathElement>(".obmind-edge");
		expect(
			topic.content.style.getPropertyValue("--obmind-node-font-family"),
		).toBe("var(--font-monospace)");
		expect(edge?.style.strokeWidth).toBe("2.25px");
		expect(container.dataset.obmindThemeId).toBe("colorful--colorful");

		renderer.destroy();
	});

	it("preserves dashed line style and edge effects for tapered connectors", () => {
		const mindMap = parseMarkdown("# Topic", "Map.md", "Map");
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		const base = createDefaultMindMapPresentation("left-to-right");
		const pencilTheme =
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition.compose(
				"pencil-sketch",
				"pencil-sketch",
			);

		renderer.render({
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN",
			colorScheme: "dark",
			presentation: {
				...base,
				theme: {
					...pencilTheme,
					tokens: {
						...pencilTheme.tokens,
						edge: {
							...pencilTheme.tokens.edge,
							lineStyle: "dashed",
						},
					},
				},
				formatting:
					BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.formatting.compose(
						"style-default",
						"thick",
						"taper-to-child",
					),
			},
			interaction: createDefaultMindMapInteractionState(),
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		});

		const edges = Array.from(
			container.querySelectorAll<SVGPathElement>(".obmind-edge"),
		);
		expect(edges.length).toBeGreaterThan(2);
		expect(
			edges.every(
				(edge) =>
					edge.dataset.obmindConnectorProfile === "taper-to-child" &&
					edge.dataset.obmindLineStyle === "dashed" &&
					edge.style.stroke === "none" &&
					edge.style.fill !== "",
			),
		).toBe(true);
		expect(
			edges.some((edge) => edge.classList.contains("obmind-edge-pass-primary")),
		).toBe(true);
		expect(
			edges.some((edge) => edge.classList.contains("obmind-edge-pass-secondary")),
		).toBe(true);

		renderer.destroy();
	});

	it("captures tapered connectors as filled export outlines", async () => {
		const mindMap = parseMarkdown("# Topic", "Map.md", "Map");
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		const base = createDefaultMindMapPresentation("left-to-right");

		renderer.render({
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN",
			colorScheme: "dark",
			presentation: {
				...base,
				theme: {
					...base.theme,
					tokens: {
						...base.theme.tokens,
						edge: {
							...base.theme.tokens.edge,
							lineStyle: "dashed",
						},
					},
				},
				formatting:
					BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.formatting.compose(
						"style-default",
						"thick",
						"taper-to-child",
					),
			},
			interaction: createDefaultMindMapInteractionState(),
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		});

		const scene = await renderer.captureExportScene({
			scope: "visible-map",
		});
		const connectorPaths = scene.primitives.filter(
			(primitive): primitive is MindMapExportPathPrimitive =>
				primitive.kind === "path" &&
				primitive.id?.includes(":connector:") === true,
		);
		expect(connectorPaths.length).toBeGreaterThan(0);
		expect(
			connectorPaths.every(
				(primitive) =>
					primitive.fill.kind === "color" &&
					primitive.strokeWidth === 0 &&
					primitive.dashArray === undefined,
			),
		).toBe(true);

		renderer.destroy();
	});
});

function getExportText(scene: {
	readonly primitives: readonly { readonly kind: string; readonly text?: string }[];
}): string {
	return scene.primitives
		.filter(
			(primitive): primitive is { readonly kind: "text"; readonly text: string } =>
				primitive.kind === "text" && primitive.text !== undefined,
		)
		.map((primitive) => primitive.text)
		.join("");
}

function getRenderedTopic(container: HTMLElement): {
	readonly node: HTMLElement;
	readonly content: HTMLElement;
} {
	const node = container.querySelector<HTMLElement>(".obmind-node-heading");
	const content = node?.querySelector<HTMLElement>(".obmind-node-content");
	if (node === null || node === undefined || content === null || content === undefined) {
		throw new Error("Expected the renderer to create a heading topic.");
	}
	return { node, content };
}

function getPaperTextureVariables(
	container: HTMLElement,
): Readonly<Record<string, string>> {
	return Object.fromEntries(
		[
			"--obmind-effect-paper-fine-cell",
			"--obmind-effect-paper-coarse-cell",
			"--obmind-effect-paper-offset-x",
			"--obmind-effect-paper-offset-y",
			"--obmind-effect-paper-opacity",
		].map((property) => [property, container.style.getPropertyValue(property)]),
	);
}

function themeColorCssValue(color: MindMapThemeColor): string {
	return color.kind === "host" ? `var(--${color.token})` : color.value;
}

function createAppearancePresentation() {
	const presentation = createDefaultMindMapPresentation("left-to-right");
	const theme = createDefaultMindMapThemeSpec({
		id: "appearance-test",
		revision: 1,
		tokens: {
			colors: {
				canvas: literalColor("#101010"),
				surface: literalColor("#111111"),
				border: literalColor("#222222"),
				edge: literalColor("#222222"),
				branchPalette: [literalColor("#333333")],
			},
			branches: {
				mode: "root-subtree",
				colorNodeFill: false,
				colorNodeStroke: true,
				colorNodeText: false,
				colorEdgeStroke: true,
			},
			effects: {
				terminalMarker: {
					effect: createMindMapRenderEffectRef(
						PENCIL_DOT_EFFECT_ID,
					),
					placement: "all-targets",
					size: 5,
				},
			},
		},
	});

	return {
		...presentation,
		theme: {
			...theme,
			lightColors: {
				canvas: literalColor("#fefefe"),
				surface: literalColor("#eeeeee"),
				border: literalColor("#dddddd"),
				edge: literalColor("#dddddd"),
				branchPalette: [literalColor("#cccccc")],
			},
		},
	};
}

function expectAppearanceColors(
	container: HTMLElement,
	expected: {
		readonly surface: string;
		readonly fill: string;
		readonly stroke: string;
		readonly edge: string;
	},
): void {
	expect(
		container.style.getPropertyValue("--obmind-theme-surface"),
	).toBe(expected.surface);
	const topic = container.querySelector<HTMLElement>(
		".obmind-node-heading .obmind-node-content",
	);
	const edge = container.querySelector<SVGPathElement>(".obmind-edge");
	const marker = container.querySelector<SVGCircleElement>(
		".obmind-edge-terminal",
	);
	if (topic === null || edge === null || marker === null) {
		throw new Error(
			"Expected the renderer to create a topic, edge, and marker.",
		);
	}
	expect(topic.style.getPropertyValue("--obmind-node-fill")).toBe(
		expected.fill,
	);
	expect(topic.style.getPropertyValue("--obmind-node-stroke")).toBe(
		expected.stroke,
	);
	expect(edge.style.stroke).toBe(expected.edge);
	expect(marker.getAttribute("fill")).toBe(expected.edge);
}
