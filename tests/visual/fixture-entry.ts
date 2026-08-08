import { BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION } from "../../src/application/composition/built-in-composition";
import { parseMarkdown } from "../../src/core/parser";
import type { MindMapNode } from "../../src/core/model";
import {
	createDefaultMindMapInteractionState,
	createDefaultMindMapPresentation,
	type MindMapInteractionState,
	type MindMapPresentation,
} from "../../src/presentation/presentation";
import { BasicMindMapFrontend } from "../../src/ui/basic-frontend";
import { OBMIND_ICON_ID } from "../../src/ui/branding";
import type {
	MindMapFrontend,
	MindMapFrontendEvent,
} from "../../src/ui/frontend";
import type { MindMapLargeMapGuardState } from "../../src/layout/large-map-policy";

export type MindBraidVisualStyleId =
	| "colorful"
	| "pencil-sketch"
	| "atlas-cards";

export type MindBraidVisualPaletteId =
	| "colorful"
	| "morandi-mint"
	| "retro-autumn";

export interface MindBraidVisualFixtureOptions {
	readonly colorScheme?: "light" | "dark";
	readonly paletteId?: MindBraidVisualPaletteId;
	readonly styleId?: MindBraidVisualStyleId;
}

type SidebarTabId = "appearance" | "topic" | "layout";

const VISUAL_FIXTURE_PATH = "Visual regression.md";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const VISUAL_FIXTURE_DOCUMENT = parseMarkdown(
	`# Product strategy
## Discover the problem
- [x] Read customer interviews
- [ ] This deliberately long topic demonstrates adaptive topic sizing, natural wrapping, and stable connector placement without allowing the label to overflow its visible node shape
  - Preserve the critical source details
  - Capture the decision context
## Design the map
- Keep themes and palettes independent
- Use disclosure controls for complex branches
## Ship with confidence
- Verify light and dark appearances
- Export a shareable result`,
	VISUAL_FIXTURE_PATH,
	"Visual regression",
);

const VISUAL_TOPIC_IDS = Object.freeze({
	productStrategy: findNodeId("Product strategy"),
	discoverProblem: findNodeId("Discover the problem"),
	longTask: findNodeId(
		"This deliberately long topic demonstrates adaptive topic sizing, natural wrapping, and stable connector placement without allowing the label to overflow its visible node shape",
	),
	designMap: findNodeId("Design the map"),
});

let activeFixture: MindBraidVisualFixture | null = null;

export function mountVisualFixture(
	container: HTMLElement,
	options: MindBraidVisualFixtureOptions = {},
): void {
	activeFixture?.destroy();
	activeFixture = new MindBraidVisualFixture(container, options);
}

export function resetVisualFixture(
	options: MindBraidVisualFixtureOptions = {},
): void {
	activeFixture?.reset(options);
}

export function selectVisualTopic(topic: keyof typeof VISUAL_TOPIC_IDS): boolean {
	return activeFixture?.selectTopic(VISUAL_TOPIC_IDS[topic]) ?? false;
}

export function beginEditingVisualTopic(
	topic: keyof typeof VISUAL_TOPIC_IDS,
): boolean {
	return activeFixture?.beginEditingTopic(VISUAL_TOPIC_IDS[topic]) ?? false;
}

export function collapseVisualTopic(
	topic: keyof typeof VISUAL_TOPIC_IDS,
): boolean {
	return activeFixture?.collapseTopic(VISUAL_TOPIC_IDS[topic]) ?? false;
}

export function showVisualSidebar(tab: SidebarTabId): boolean {
	return activeFixture?.showSidebar(tab) ?? false;
}

export function showVisualLargeMapGuard(): void {
	activeFixture?.showLargeMapGuard();
}

export async function waitForVisualFixture(): Promise<void> {
	await new Promise<void>((resolve) => {
		window.requestAnimationFrame(() =>
			window.requestAnimationFrame(() => resolve()),
		);
	});
	await document.fonts?.ready;
}

export function destroyVisualFixture(): void {
	activeFixture?.destroy();
	activeFixture = null;
}

class MindBraidVisualFixture {
	private readonly container: HTMLElement;
	private frontend: MindMapFrontend;
	private colorScheme: "light" | "dark";
	private paletteId: MindBraidVisualPaletteId;
	private styleId: MindBraidVisualStyleId;
	private interaction: MindMapInteractionState =
		createDefaultMindMapInteractionState();
	private presentation: MindMapPresentation;
	private largeMapGuard: MindMapLargeMapGuardState | null = null;

	public constructor(
		container: HTMLElement,
		options: MindBraidVisualFixtureOptions,
	) {
		this.container = container;
		this.colorScheme = options.colorScheme ?? "light";
		this.styleId = options.styleId ?? "colorful";
		this.paletteId = options.paletteId ?? "colorful";
		this.presentation = this.createPresentation();
		this.applySchemeClass();
		this.frontend = new BasicMindMapFrontend(
			(event) => {
				this.handleFrontendEvent(event);
			},
			undefined,
			renderVisualFixtureIcon,
		);
		this.frontend.mount(container);
		this.update();
	}

	public reset(options: MindBraidVisualFixtureOptions): void {
		this.colorScheme = options.colorScheme ?? "light";
		this.styleId = options.styleId ?? "colorful";
		this.paletteId = options.paletteId ?? "colorful";
		this.interaction = createDefaultMindMapInteractionState();
		this.largeMapGuard = null;
		this.presentation = this.createPresentation();
		this.applySchemeClass();
		this.update();
	}

	public selectTopic(nodeId: string): boolean {
		const button = this.findTopicElement(nodeId)?.querySelector<HTMLButtonElement>(
			".obmind-node-content",
		);
		if (button === null || button === undefined) {
			return false;
		}
		button.click();
		return true;
	}

	public beginEditingTopic(nodeId: string): boolean {
		const topic = this.findTopicElement(nodeId);
		if (topic === null) {
			return false;
		}
		if (!topic.classList.contains("obmind-node-selected")) {
			if (!this.selectTopic(nodeId)) {
				return false;
			}
		}
		const button = this.findTopicElement(nodeId)?.querySelector<HTMLButtonElement>(
			".obmind-node-content",
		);
		if (button === null || button === undefined) {
			return false;
		}
		button.click();
		return true;
	}

	public collapseTopic(nodeId: string): boolean {
		const toggle = this.findTopicElement(nodeId)?.querySelector<HTMLButtonElement>(
			".obmind-node-toggle",
		);
		if (toggle === null || toggle === undefined) {
			return false;
		}
		toggle.click();
		return true;
	}

	public showSidebar(tab: SidebarTabId): boolean {
		const root = this.container.querySelector<HTMLElement>(".obmind-frontend");
		if (root === null) {
			return false;
		}
		if (!root.classList.contains("obmind-sidebar-open")) {
			const toggle = this.container.querySelector<HTMLButtonElement>(
				'button[aria-label="Toggle settings panel"]',
			);
			if (toggle === null) {
				return false;
			}
			toggle.click();
		}
		const sidebarTab = this.container.querySelector<HTMLButtonElement>(
			`button[data-obmind-sidebar-tab="${tab}"]`,
		);
		if (sidebarTab === null) {
			return false;
		}
		sidebarTab.click();
		return true;
	}

	public showLargeMapGuard(): void {
		this.interaction = {
			...this.interaction,
			visibleDepthLimit: 3,
		};
		this.largeMapGuard = {
			fullMapConfirmed: false,
			protection: {
				hiddenNodeCount: 9_300,
				initialVisibleDepthLimit: 3,
				initialVisibleNodeCount: 700,
				level: "guarded",
				nodeCount: 10_000,
				requiresExplicitFullRender: true,
			},
		};
		this.update();
	}

	public destroy(): void {
		this.frontend.destroy();
		this.container.replaceChildren();
	}

	private createPresentation(): MindMapPresentation {
		const base = createDefaultMindMapPresentation("left-to-right");
		return {
			...base,
			theme:
				BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition.compose(
					this.styleId,
					this.paletteId,
				),
			formatting:
				BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.formatting.compose(
					"system-sans",
					"medium",
					"uniform",
				),
		};
	}

	private update(): void {
		this.frontend.update({
			appearanceMode: this.colorScheme,
			capabilities:
				BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities,
			colorScheme: this.colorScheme,
			document: {
				status: "ready",
				source: {
					basename: "Visual regression",
					extension: "md",
					name: VISUAL_FIXTURE_PATH,
					path: VISUAL_FIXTURE_PATH,
				},
				document: VISUAL_FIXTURE_DOCUMENT,
			},
			interaction: this.interaction,
			largeMapGuard: this.largeMapGuard,
			language: "en",
			presentation: this.presentation,
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasRedoEntry: false,
				hasUndoEntry: false,
			},
			presentationHistoryAvailability: {
				hasUndoEntry: false,
				hasRedoEntry: false,
				undoAction: null,
				redoAction: null,
			},
		});
	}

	private handleFrontendEvent(event: MindMapFrontendEvent): void {
		switch (event.type) {
			case "change-appearance":
				if (event.appearanceMode !== "system") {
					this.colorScheme = event.appearanceMode;
					this.applySchemeClass();
					this.update();
				}
				return;
			case "change-style":
				if (isVisualStyleId(event.styleId)) {
					this.styleId = event.styleId;
					this.presentation = this.createPresentation();
					this.update();
				}
				return;
			case "change-palette":
				if (isVisualPaletteId(event.paletteId)) {
					this.paletteId = event.paletteId;
					this.presentation = this.createPresentation();
					this.update();
				}
				return;
			case "change-layout":
				this.presentation = {
					...this.presentation,
					layout: event.layout,
				};
				this.update();
				return;
			case "toggle-node":
				this.toggleCollapsedNode(event.nodeId);
				return;
			case "expand-all":
				this.interaction = {
					...this.interaction,
					collapsedNodeIds: new Set(),
				};
				this.update();
				return;
			case "collapse-all":
				this.interaction = {
					...this.interaction,
					collapsedNodeIds: new Set([VISUAL_FIXTURE_DOCUMENT.root.id]),
				};
				this.update();
				return;
			case "selection-change":
				this.interaction = {
					...this.interaction,
					primarySelectedNodeId: event.primaryNodeId,
					selectedNodeIds: new Set(event.selectedNodeIds),
					selectionAnchorNodeId: event.anchorNodeId,
				};
				this.update();
				return;
			case "focus-change":
				this.interaction = {
					...this.interaction,
					focusedNodeId: event.nodeId,
				};
				this.update();
				return;
			case "hover-change":
				this.interaction = {
					...this.interaction,
					hoveredNodeId: event.nodeId,
				};
				this.update();
				return;
			case "change-visible-depth":
				this.interaction = {
					...this.interaction,
					visibleDepthLimit: event.depth,
				};
				this.update();
				return;
			case "show-full-large-map":
				if (this.largeMapGuard !== null) {
					this.largeMapGuard = {
						...this.largeMapGuard,
						fullMapConfirmed: true,
					};
					this.interaction = {
						...this.interaction,
						visibleDepthLimit: null,
					};
					this.update();
				}
				return;
			case "change-minimap-visibility":
				this.interaction = {
					...this.interaction,
					minimapVisible: event.visible,
				};
				this.update();
				return;
			case "select-decoration":
				this.interaction = {
					...this.interaction,
					selectedDecorationId: event.decorationId,
				};
				this.update();
				return;
			case "viewport-change":
				this.interaction = {
					...this.interaction,
					viewport: event.viewport,
				};
				return;
			default:
				return;
		}
	}

	private toggleCollapsedNode(nodeId: string): void {
		const collapsedNodeIds = new Set(this.interaction.collapsedNodeIds);
		if (collapsedNodeIds.has(nodeId)) {
			collapsedNodeIds.delete(nodeId);
		} else {
			collapsedNodeIds.add(nodeId);
		}
		this.interaction = {
			...this.interaction,
			collapsedNodeIds,
		};
		this.update();
	}

	private findTopicElement(nodeId: string): HTMLElement | null {
		for (const element of Array.from(
			this.container.querySelectorAll<HTMLElement>("[data-obmind-node-id]"),
		)) {
			if (element.dataset.obmindNodeId === nodeId) {
				return element;
			}
		}
		return null;
	}

	private applySchemeClass(): void {
		this.container.classList.toggle(
			"obmind-appearance-light",
			this.colorScheme === "light",
		);
		this.container.classList.toggle(
			"obmind-appearance-dark",
			this.colorScheme === "dark",
		);
	}
}

function findNodeId(text: string): string {
	const pending: MindMapNode[] = [VISUAL_FIXTURE_DOCUMENT.root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		if (node.text === text) {
			return node.id;
		}
		for (const child of node.children) {
			pending.push(child);
		}
	}
	throw new Error(`Visual fixture topic not found: ${text}`);
}

function isVisualStyleId(value: string): value is MindBraidVisualStyleId {
	return value === "colorful" || value === "pencil-sketch" || value === "atlas-cards";
}

function isVisualPaletteId(value: string): value is MindBraidVisualPaletteId {
	return value === "colorful" || value === "morandi-mint" || value === "retro-autumn";
}

/**
 * The production adapter injects Obsidian's Lucide renderer. Browser tests do
 * not load Obsidian, so this tiny deterministic adapter keeps the same SVG
 * footprint without introducing icon text that would obscure the real chrome.
 */
function renderVisualFixtureIcon(element: HTMLElement, iconId: string): void {
	const svg = createVisualSvgElement(element.ownerDocument, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("aria-hidden", "true");

	if (iconId === OBMIND_ICON_ID) {
		appendSvgPath(svg, "M15 3C8.5 1 3 6 3 12s5.5 11 12 9");
		appendSvgPath(svg, "M8 10h7v4H8z");
		appendSvgPath(svg, "M15 12h2c2 0 2-4 4-4m-4 4c2 0 2 4 4 4");
		appendSvgCircle(svg, 21, 8, 1);
		appendSvgCircle(svg, 21, 16, 1);
	} else {
		const path = iconPath(iconId);
		appendSvgPath(svg, path);
	}
	element.replaceChildren(svg);
}

function appendSvgPath(svg: SVGSVGElement, data: string): void {
	const path = createVisualSvgElement(svg.ownerDocument, "path");
	path.setAttribute("d", data);
	svg.append(path);
}

function appendSvgCircle(
	svg: SVGSVGElement,
	cx: number,
	cy: number,
	radius: number,
): void {
	const circle = createVisualSvgElement(svg.ownerDocument, "circle");
	circle.setAttribute("cx", String(cx));
	circle.setAttribute("cy", String(cy));
	circle.setAttribute("r", String(radius));
	circle.setAttribute("fill", "currentColor");
	circle.setAttribute("stroke", "none");
	svg.append(circle);
}

/**
 * The real adapter uses Obsidian's `Document.win.createSvg`. Chromium's
 * standalone DOM has no such extension, so the test bridge invokes the native
 * DOM operation through its prototype without pretending it is an Obsidian
 * host document.
 */
function createVisualSvgElement<K extends keyof SVGElementTagNameMap>(
	ownerDocument: Document,
	tagName: K,
): SVGElementTagNameMap[K] {
	const createElementNs = Reflect.get(
		Document.prototype,
		"createElementNS",
	) as (this: Document, namespaceUri: string, qualifiedName: K) => SVGElementTagNameMap[K];
	return Reflect.apply(createElementNs, ownerDocument, [
		SVG_NAMESPACE,
		tagName,
	]);
}

function iconPath(iconId: string): string {
	switch (iconId) {
		case "undo-2":
			return "M9 7 4 12l5 5M4 12h10a6 6 0 0 1 6 6";
		case "redo-2":
			return "m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6";
		case "maximize":
			return "M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5";
		case "chevrons-up-down":
			return "m7 15 5 5 5-5M7 9l5-5 5 5";
		case "chevrons-down-up":
			return "m7 4 5 5 5-5m-10 16 5-5 5 5";
		case "panel-right":
			return "M4 4h16v16H4zM15 4v16";
		case "palette":
			return "M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h2a3 3 0 0 0 0-6z";
		case "square-pen":
			return "M4 20h4L19 9l-4-4L4 16zM13 7l4 4";
		case "network":
			return "M12 4v6m0 4v6M6 7l6 3 6-3M6 17l6-3 6 3M4 5h4v4H4zM10 10h4v4h-4zM16 5h4v4h-4zM4 15h4v4H4zM16 15h4v4h-4z";
		case "x":
			return "M6 6l12 12M18 6 6 18";
		case "download":
			return "M12 3v12m0 0 4-4m-4 4-4-4M5 20h14";
		default:
			return "M5 5h14v14H5zM8 12h8M12 8v8";
	}
}
