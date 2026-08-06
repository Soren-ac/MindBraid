// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { parseMarkdown } from "../src/core/parser";
import {
	createDefaultMindMapInteractionState,
	createDefaultMindMapPresentation,
	literalColor,
	type MindMapInteractionEvent,
	type MindMapNodePresentation,
} from "../src/presentation/presentation";
import {
	DomSvgMindMapRenderer,
	type MindMapRenderInput,
} from "../src/ui/renderer";

afterEach(() => {
	document.body.replaceChildren();
});

describe("DOM/SVG renderer canvas focus", () => {
	it("routes Space only to the active renderer when an old tab retains focus", () => {
		const mindMap = parseMarkdown("# Topic", "Map.md", "Map");
		const topic = mindMap.root.children[0];
		if (topic === undefined) {
			throw new Error("Renderer fixture is missing its topic node.");
		}
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
		const firstContainer = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		const secondContainer = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		document.body.append(firstContainer, secondContainer);
		const firstRenderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		const secondInteractions: MindMapInteractionEvent[] = [];
		const secondRenderer = new DomSvgMindMapRenderer({
			interaction: (event) => secondInteractions.push(event),
		});
		firstRenderer.mount(firstContainer);
		secondRenderer.mount(secondContainer);
		firstRenderer.render(input);
		secondRenderer.render(input);
		firstRenderer.setViewActive(false);
		secondRenderer.setViewActive(true);

		const firstTopicButton = firstContainer.querySelector<HTMLButtonElement>(
			`[data-obmind-node-id="${topic.id}"] .obmind-node-content`,
		);
		const secondTopicButton = secondContainer.querySelector<HTMLButtonElement>(
			`[data-obmind-node-id="${topic.id}"] .obmind-node-content`,
		);
		const firstSurface = firstContainer.querySelector<HTMLElement>(
			".obmind-renderer-surface",
		);
		const secondSurface = secondContainer.querySelector<HTMLElement>(
			".obmind-renderer-surface",
		);
		if (
			firstTopicButton === null ||
			secondTopicButton === null ||
			firstSurface === null ||
			secondSurface === null
		) {
			throw new Error("Renderer fixture is missing its topics or canvases.");
		}
		const setPointerCapture = vi.fn();
		const releasePointerCapture = vi.fn();
		Object.defineProperties(secondSurface, {
			setPointerCapture: {
				configurable: true,
				value: setPointerCapture,
			},
			releasePointerCapture: {
				configurable: true,
				value: releasePointerCapture,
			},
			hasPointerCapture: {
				configurable: true,
				value: vi.fn(() => true),
			},
		});

		firstTopicButton.focus();
		expect(document.activeElement).toBe(firstTopicButton);
		const spaceDown = new KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			key: " ",
		});
		firstTopicButton.dispatchEvent(spaceDown);

		expect(spaceDown.defaultPrevented).toBe(true);
		expect(firstSurface.classList.contains("obmind-renderer-space-pan")).toBe(
			false,
		);
		expect(secondSurface.classList.contains("obmind-renderer-space-pan")).toBe(
			true,
		);

		const spaceUp = new KeyboardEvent("keyup", {
			bubbles: true,
			cancelable: true,
			key: " ",
		});
		firstTopicButton.dispatchEvent(spaceUp);
		expect(spaceUp.defaultPrevented).toBe(true);
		expect(secondSurface.classList.contains("obmind-renderer-space-pan")).toBe(
			false,
		);

		firstTopicButton.dispatchEvent(
			new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				key: " ",
			}),
		);
		expect(secondSurface.classList.contains("obmind-renderer-space-pan")).toBe(
			true,
		);
		secondSurface.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				button: 0,
				clientX: 100,
				clientY: 100,
				isPrimary: true,
				pointerId: 41,
				pointerType: "mouse",
			}),
		);
		expect(secondSurface.classList.contains("obmind-renderer-panning")).toBe(
			true,
		);
		secondRenderer.setViewActive(false);
		expect(secondSurface.classList.contains("obmind-renderer-space-pan")).toBe(
			false,
		);
		expect(secondSurface.classList.contains("obmind-renderer-panning")).toBe(
			false,
		);
		expect(releasePointerCapture).toHaveBeenCalledWith(41);

		secondRenderer.setViewActive(true);
		secondTopicButton.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				button: 0,
				clientX: 20,
				clientY: 20,
				isPrimary: true,
				pointerId: 42,
				pointerType: "mouse",
			}),
		);
		secondSurface.dispatchEvent(
			new PointerEvent("pointermove", {
				bubbles: true,
				button: 0,
				clientX: 80,
				clientY: 80,
				isPrimary: true,
				pointerId: 42,
				pointerType: "mouse",
			}),
		);
		expect(
			secondSurface.classList.contains("obmind-renderer-node-dragging"),
		).toBe(true);
		secondRenderer.setViewActive(false);
		expect(
			secondSurface.classList.contains("obmind-renderer-node-dragging"),
		).toBe(false);
		secondSurface.dispatchEvent(
			new PointerEvent("pointerup", {
				bubbles: true,
				button: 0,
				clientX: 80,
				clientY: 80,
				isPrimary: true,
				pointerId: 42,
				pointerType: "mouse",
			}),
		);
		expect(
			secondInteractions.some(({ type }) => type === "node-move-request"),
		).toBe(false);

		firstRenderer.destroy();
		secondRenderer.destroy();
	});

	it("moves focus off a cleared topic so Space remains a canvas pan gesture", () => {
		const mindMap = parseMarkdown("# Topic", "Map.md", "Map");
		const topic = mindMap.root.children[0];
		if (topic === undefined) {
			throw new Error("Renderer fixture is missing its topic node.");
		}

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
		renderer.setViewActive(true);

		const selectedInteraction = {
			...createDefaultMindMapInteractionState(),
			selectedNodeIds: new Set([topic.id]),
			primarySelectedNodeId: topic.id,
			selectionAnchorNodeId: topic.id,
			focusedNodeId: topic.id,
		};
		const baseInput = {
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN" as const,
			colorScheme: "dark" as const,
			presentation: createDefaultMindMapPresentation("left-to-right"),
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		};
		renderer.render({ ...baseInput, interaction: selectedInteraction });

		const surface = container.querySelector<HTMLElement>(
			".obmind-renderer-surface",
		);
		const topicButton = container.querySelector<HTMLButtonElement>(
			`[data-obmind-node-id="${topic.id}"] .obmind-node-content`,
		);
		if (surface === null || topicButton === null) {
			throw new Error("Renderer fixture is missing its canvas or topic button.");
		}

		Object.defineProperties(surface, {
			setPointerCapture: { configurable: true, value: vi.fn() },
			releasePointerCapture: { configurable: true, value: vi.fn() },
			hasPointerCapture: {
				configurable: true,
				value: vi.fn(() => false),
			},
		});

		topicButton.focus();
		expect(document.activeElement).toBe(topicButton);

		surface.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				button: 0,
				clientX: 500,
				clientY: 500,
				isPrimary: true,
				pointerId: 17,
				pointerType: "mouse",
			}),
		);
		expect(document.activeElement).toBe(surface);

		surface.dispatchEvent(
			new PointerEvent("pointerup", {
				bubbles: true,
				button: 0,
				clientX: 500,
				clientY: 500,
				isPrimary: true,
				pointerId: 17,
				pointerType: "mouse",
			}),
		);
		renderer.render({
			...baseInput,
			interaction: createDefaultMindMapInteractionState(),
		});
		interactions.length = 0;

		// Electron can retain or restore the old button as the native keyboard
		// target even though the renderer moved focus and cleared logical state.
		// Recreate that host behavior: canvas ownership must still win.
		topicButton.focus();
		expect(document.activeElement).toBe(topicButton);

		const spaceDown = new KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			key: " ",
		});
		topicButton.dispatchEvent(spaceDown);

		expect(spaceDown.defaultPrevented).toBe(true);
		expect(surface.classList.contains("obmind-renderer-space-pan")).toBe(true);
		expect(interactions.some(({ type }) => type === "node-select")).toBe(false);

		surface.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				button: 0,
				clientX: 500,
				clientY: 500,
				isPrimary: true,
				pointerId: 31,
				pointerType: "mouse",
			}),
		);
		expect(surface.classList.contains("obmind-renderer-panning")).toBe(true);
		surface.dispatchEvent(
			new PointerEvent("pointermove", {
				bubbles: true,
				button: 0,
				clientX: 540,
				clientY: 525,
				isPrimary: true,
				pointerId: 31,
				pointerType: "mouse",
			}),
		);
		surface.dispatchEvent(
			new PointerEvent("pointerup", {
				bubbles: true,
				button: 0,
				clientX: 540,
				clientY: 525,
				isPrimary: true,
				pointerId: 31,
				pointerType: "mouse",
			}),
		);
		expect(surface.classList.contains("obmind-renderer-panning")).toBe(false);
		expect(interactions.some(({ type }) => type === "node-select")).toBe(false);

		const spaceUp = new KeyboardEvent("keyup", {
			bubbles: true,
			cancelable: true,
			key: " ",
		});
		topicButton.dispatchEvent(spaceUp);
		expect(spaceUp.defaultPrevented).toBe(true);
		expect(surface.classList.contains("obmind-renderer-space-pan")).toBe(false);

		renderer.destroy();
	});

	it("keeps Space as an edit shortcut after an explicit node interaction", () => {
		const mindMap = parseMarkdown("# Topic", "Map.md", "Map");
		const topic = mindMap.root.children[0];
		if (topic === undefined) {
			throw new Error("Renderer fixture is missing its topic node.");
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
		renderer.setViewActive(true);
		const interaction = {
			...createDefaultMindMapInteractionState(),
			selectedNodeIds: new Set([topic.id]),
			primarySelectedNodeId: topic.id,
			selectionAnchorNodeId: topic.id,
			focusedNodeId: topic.id,
		};
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

		const topicButton = container.querySelector<HTMLButtonElement>(
			`[data-obmind-node-id="${topic.id}"] .obmind-node-content`,
		);
		const surface = container.querySelector<HTMLElement>(
			".obmind-renderer-surface",
		);
		if (surface === null || topicButton === null) {
			throw new Error("Renderer fixture is missing its canvas or topic button.");
		}

		// Pointer ownership marks this as an intentional node keyboard context.
		topicButton.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				button: 0,
				isPrimary: true,
				pointerId: 23,
				pointerType: "mouse",
			}),
		);
		topicButton.dispatchEvent(
			new PointerEvent("pointerup", {
				bubbles: true,
				button: 0,
				isPrimary: true,
				pointerId: 23,
				pointerType: "mouse",
			}),
		);
		topicButton.focus();
		const spaceDown = new KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			key: " ",
		});
		topicButton.dispatchEvent(spaceDown);

		expect(container.querySelector(".obmind-node-editor")).not.toBeNull();
		expect(surface.classList.contains("obmind-renderer-space-pan")).toBe(false);

		renderer.destroy();
	});

	it("does not steal Space from host text controls outside the canvas", () => {
		const container = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"div",
		) as HTMLDivElement;
		const input = document.createElementNS(
			"http://www.w3.org/1999/xhtml",
			"input",
		) as HTMLInputElement;
		document.body.append(container, input);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		renderer.setViewActive(true);

		const surface = container.querySelector<HTMLElement>(
			".obmind-renderer-surface",
		);
		if (surface === null) {
			throw new Error("Renderer fixture is missing its canvas.");
		}
		input.focus();
		const spaceDown = new KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			key: " ",
		});
		input.dispatchEvent(spaceDown);

		expect(spaceDown.defaultPrevented).toBe(false);
		expect(surface.classList.contains("obmind-renderer-space-pan")).toBe(false);

		renderer.destroy();
	});

	it("does not turn Space on a focused task checkbox into canvas panning", () => {
		const mindMap = parseMarkdown("- [ ] Task", "Map.md", "Map");
		const task = mindMap.root.children[0];
		if (task === undefined) {
			throw new Error("Renderer fixture is missing its task node.");
		}
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
		renderer.setViewActive(true);
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

		const surface = container.querySelector<HTMLElement>(
			".obmind-renderer-surface",
		);
		const taskCheckbox = container.querySelector<HTMLButtonElement>(
			`[data-obmind-node-id="${task.id}"] .obmind-node-task-checkbox`,
		);
		if (surface === null || taskCheckbox === null) {
			throw new Error("Renderer fixture is missing its task checkbox.");
		}

		taskCheckbox.focus();
		const spaceDown = new KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			key: " ",
		});
		taskCheckbox.dispatchEvent(spaceDown);

		expect(spaceDown.defaultPrevented).toBe(false);
		expect(surface.classList.contains("obmind-renderer-space-pan")).toBe(false);
		taskCheckbox.click();
		expect(interactions).toContainEqual(
			expect.objectContaining({
				type: "node-task-toggle",
				nodeId: task.id,
			}),
		);
		expect(interactions).not.toContainEqual(
			expect.objectContaining({ type: "node-focus" }),
		);
		expect(interactions).not.toContainEqual(
			expect.objectContaining({ type: "viewport-change" }),
		);

		renderer.destroy();
	});
});

describe("DOM/SVG renderer node links", () => {
	it("renders only Vault-local links inside the topic and preserves source indexes", () => {
		const mindMap = parseMarkdown(
			"# [Website](https://example.com) [Plan](Notes/Plan.md) [[Wiki]]",
			"Map.md",
			"Map",
		);
		const topic = mindMap.root.children[0];
		if (topic === undefined) {
			throw new Error("Renderer fixture is missing its linked topic node.");
		}
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
		renderer.setViewActive(true);
		const presentation = createDefaultMindMapPresentation("left-to-right");
		const nodePresentations: ReadonlyMap<string, MindMapNodePresentation> =
			new Map([
				[
					topic.id,
					{
						paddingInline: 13,
						textColor: literalColor("#112233"),
					},
				],
			]);
		const renderInput: MindMapRenderInput = {
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN" as const,
			colorScheme: "light" as const,
			presentation: {
				...presentation,
				nodes: nodePresentations,
			},
			interaction: createDefaultMindMapInteractionState(),
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		};
		renderer.render(renderInput);

		const nodeElement = container.querySelector<HTMLElement>(
			`[data-obmind-node-id="${topic.id}"]`,
		);
		const linkButtons = Array.from(
			nodeElement?.querySelectorAll<HTMLButtonElement>(
				".obmind-node-link",
			) ?? [],
		);
		expect(linkButtons).toHaveLength(2);
		expect(
			linkButtons.map(({ dataset }) => dataset.obmindNodeLinkIndex),
		).toEqual(["1", "2"]);
		expect(
			linkButtons.every(
				(button) => button.querySelector(".obmind-node-link-icon") !== null,
			),
		).toBe(true);
		expect(nodeElement?.classList.contains("obmind-node-has-links")).toBe(
			true,
		);
		expect(
			nodeElement?.style.getPropertyValue("--obmind-node-link-reserve"),
		).toBe("42px");
		expect(
			nodeElement?.style.getPropertyValue("--obmind-node-link-color"),
		).toBe("#112233");
		expect(
			nodeElement?.style.getPropertyValue("--obmind-node-link-inset"),
		).toBe("13px");
		expect(
			nodeElement?.style.getPropertyValue(
				"--obmind-node-link-control-size",
			),
		).toBe("18px");
		expect(
			nodeElement?.style.getPropertyValue(
				"--obmind-node-link-control-gap",
			),
		).toBe("2px");
		expect(
			nodeElement?.style.getPropertyValue("--obmind-node-link-label-gap"),
		).toBe("4px");

		linkButtons[0]?.click();
		expect(interactions).toContainEqual({
			type: "node-link-activate",
			nodeId: topic.id,
			linkIndex: 1,
		});
		expect(
			interactions.some(
				(event) =>
					event.type === "node-link-activate" && event.linkIndex === 0,
			),
		).toBe(false);

		expect(renderer.beginNodeEdit(topic.id)).toBe(true);
		expect(nodeElement?.classList.contains("obmind-node-editing")).toBe(true);
		renderer.render({
			...renderInput,
			interaction: {
				...renderInput.interaction,
				hoveredNodeId: topic.id,
			},
		});
		const links = nodeElement?.querySelector<HTMLElement>(
			".obmind-node-links",
		);
		expect(links?.hidden).toBe(false);
		expect(nodeElement?.classList.contains("obmind-node-has-links")).toBe(
			true,
		);
		expect(
			nodeElement?.style.getPropertyValue("--obmind-node-link-reserve"),
		).toBe("42px");
		const editor = nodeElement?.querySelector<HTMLTextAreaElement>(
			".obmind-node-editor",
		);
		if (editor === null || editor === undefined) {
			throw new Error("Expected the inline topic editor.");
		}
		editor.value = "";
		editor.dispatchEvent(new Event("input", { bubbles: true }));
		editor.dispatchEvent(
			new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				key: "Enter",
			}),
		);
		expect(editor.getAttribute("aria-invalid")).toBe("true");
		expect(
			nodeElement?.classList.contains("obmind-node-edit-invalid"),
		).toBe(true);
		editor.value = topic.text;
		editor.dispatchEvent(new Event("input", { bubbles: true }));
		expect(editor.hasAttribute("aria-invalid")).toBe(false);
		expect(
			nodeElement?.classList.contains("obmind-node-edit-invalid"),
		).toBe(false);
		editor?.dispatchEvent(
			new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				key: "Escape",
			}),
		);
		expect(nodeElement?.classList.contains("obmind-node-editing")).toBe(
			false,
		);
		expect(links?.hidden).toBe(false);
		expect(nodeElement?.classList.contains("obmind-node-has-links")).toBe(
			true,
		);

		interactions.length = 0;
		links
			?.querySelector<HTMLButtonElement>(
				'[data-obmind-node-link-index="2"]',
			)
			?.click();
		expect(interactions).toContainEqual({
			type: "node-link-activate",
			nodeId: topic.id,
			linkIndex: 2,
		});
		renderer.destroy();
	});

	it("keeps an external-only Markdown link as readable topic text without an action", () => {
		const mindMap = parseMarkdown(
			"# [Website](https://example.com)",
			"Map.md",
			"Map",
		);
		const topic = mindMap.root.children[0];
		if (topic === undefined) {
			throw new Error("Renderer fixture is missing its external-link topic.");
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
			interaction: createDefaultMindMapInteractionState(),
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		});

		const nodeElement = container.querySelector<HTMLElement>(
			`[data-obmind-node-id="${topic.id}"]`,
		);
		expect(
			nodeElement?.querySelector(".obmind-node-label")?.textContent,
		).toBe("Website");
		expect(nodeElement?.querySelector(".obmind-node-link")).toBeNull();
		expect(nodeElement?.classList.contains("obmind-node-has-links")).toBe(
			false,
		);
		expect(
			nodeElement?.style.getPropertyValue("--obmind-node-link-reserve"),
		).toBe("");

		renderer.destroy();
	});
});
