import {
	DEFAULT_LAYOUT_SPACING,
	type LayoutEdge,
	type LayoutBounds,
	type LayoutResult,
	type LayoutEngineResolver,
	type LayoutPath,
	type LayoutPoint,
	type NodeSize,
	type PositionedNode,
} from "../layout/layout";
import {
	createVariableWidthConnectorDashOutlines,
	createVariableWidthConnectorOutline,
	resolveMindMapConnectorStrokeWidths,
	type VariableWidthConnectorOutline,
} from "../layout/connector-geometry";
import {
	parseMindMapCssColor,
	type MindMapRgbaColor,
	type MindMapThemeColorResolver,
} from "../presentation/color-contrast";
import type { MindMapTopicCommandAvailability } from "./frontend";
import {
	BUILT_IN_MIND_MAP_ASSET_REGISTRY,
	createMindMapAssetVisualDescriptor,
	resolveMindMapNodeAssets,
	type MindMapAssetColorRole,
	type MindMapAssetPaint,
	type MindMapAssetPrimitive,
	type MindMapAssetRegistry,
	type MindMapAssetStroke,
	type MindMapAssetVisualDescriptor,
} from "../presentation/assets";
import {
	resolveMindMapDecorationGeometry,
	type MindMapDecorationGeometryDescriptor,
} from "../presentation/decorations";
import {
	createMindMapMinimapTransform,
	mindMapMinimapPointToScene,
	mindMapSceneBoundsToMinimap,
	projectMindMapLayoutToMinimap,
	type MindMapMinimapNodeProjection,
	type MindMapMinimapTransform,
} from "../layout/minimap";
import {
	createMindMapViewportSceneBounds,
	resolveMindMapSceneCulling,
	type MindMapSceneCullingResult,
} from "../layout/scene-culling";
import {
	createObMindTranslator,
	DEFAULT_OBMIND_LANGUAGE,
	normalizeObMindLanguage,
	type ObMindLanguage,
	type ObMindTranslator,
} from "../i18n/i18n";
import {
	BILATERAL_TREE_LAYOUT_ENGINE_ID,
	BUILT_IN_MIND_MAP_LAYOUT_ENGINE_REGISTRY,
} from "../layout/layouts";
import { resolveBilateralRootChildDropOrientation } from "../layout/bilateral-layout";
import {
	BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
	type DomSvgCssEffect,
	type DomSvgMindMapEffectRegistry,
	type DomSvgNodeFillEffect,
	type DomSvgNodeStrokeEffect,
} from "./dom-svg-effects";
import {
	createHandDrawnNodeContour,
	sampleCubicBezier,
	type HandDrawnPoint,
	type HandDrawnNodeContourShape,
} from "../presentation/hand-drawn";
import {
	createMindMapNodeEditSnapshot,
	type LayoutOrientation,
	type MindMapNode,
	type MindMapNodeEditSnapshot,
} from "../core/model";
import { isLocalMindMapLinkTarget } from "../core/link-target";
import {
	resolveMindMapCanvasPointerIntent,
	resolveMindMapNodeClickIntent,
	resolveMindMapNodeEditorKeyIntent,
	resolveMindMapNodeKeyIntent,
	type MindMapKeyGesture,
	type MindMapNodeEditorKeyIntent,
} from "../topic/interaction/node-interaction";
import {
	createVisibleMindMapNavigation,
	resolveMindMapNavigationKeyIntent,
	resolveVisibleMindMapNavigationTarget,
} from "../topic/interaction/node-navigation";
import { collectMindMapNodesInRectangle } from "../topic/interaction/node-selection";
import {
	resolveMindMapTopicCommandShortcut,
	type MindMapTopicCommand,
} from "../topic/interaction/topic-command";
import {
	createMindMapTaskCheckmarkPathData,
	MIND_MAP_TASK_CHECKMARK_STROKE_WIDTH,
	MIND_MAP_TASK_CHECKMARK_VIEWBOX_SIZE,
	MIND_MAP_TASK_CONTROL_GAP,
	MIND_MAP_TASK_CONTROL_SIZE,
	resolveMindMapTaskCheckmarkStrokeWidth,
} from "../presentation/task-control";
import {
	applyNodeDragAutoPan,
	calculateNodeDragAutoPan,
	canContinueNodeDragAfterRender,
	clientPointToNodeDragScene,
	hasCrossedNodeDragThreshold,
	resolveAxisAlignedNodeDragPreviewGeometry,
	resolveNodeDragDropPreview,
	type NodeDragDropPreview,
	type NodeDragDropTarget,
	type NodeDragPoint,
	type NodeDragPreviewGeometryResolver,
	type NodeDragPreviewSegment,
} from "../topic/interaction/node-drag";
import {
	createMindMapDisclosureDescription,
	resolveMindMapDisclosurePlacement,
	resolveMindMapOutgoingOrientation,
	resolveMindMapPositionedBranchOrientation,
	type MindMapDisclosureAccessibleTextContext,
	type MindMapDisclosureConnectionSide,
} from "../layout/collapse-indicator";
import {
	createMindMapNodeContentLayoutStrategy,
	resolveMindMapNodeEditorBlockLayout,
	type MindMapNodeContentLayoutPolicy,
	type MindMapNodeContentLayoutStrategy,
} from "../layout/node-content-layout";
import { resolveMindMapConnectorStrokeProfile } from "../presentation/formatting";
import {
	createRootBranchColorIndexMap,
	hasDistinctMindMapNodeFill,
	isSafeHostColorToken,
	isSafeLiteralColor,
	resolveMindMapNodeFillSource,
	resolveMindMapThemeColors,
	resolveMindMapThemeRoles,
	resolveMindMapNodeTextColor,
	type MindMapColorScheme,
	type MindMapEdgePresentation,
	type MindMapEdgeRouting,
	type MindMapInteractionState,
	type MindMapInteractionEvent,
	type MindMapLineStyle,
	type MindMapNodePresentation,
	type MindMapPresentation,
	type MindMapConnectorStrokeProfile,
	type MindMapThemeColor,
	type MindMapThemeColorTokens,
	type MindMapViewportState,
} from "../presentation/presentation";
import {
	type MindMapExportCaptureRequest,
	type MindMapExportEllipsePrimitive,
	MindMapExportError,
	type MindMapExportPaint,
	type MindMapExportPrimitive,
	type MindMapExportRectPrimitive,
	type MindMapExportScene,
	type MindMapExportTextPrimitive,
	throwIfMindMapExportAborted,
} from "../export/types";
import {
	createMindMapAssetExportPrimitives,
	createMindMapDecorationExportPrimitives,
	type MindMapAssetExportColors,
	type MindMapDecorationExportPrimitiveOptions,
	type MindMapExportTextStyle,
} from "../export/presentation-primitives";

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const FIT_PADDING = 32;
const MIN_EDGE_PADDING = 2;
const EDGE_ANTIALIAS_PADDING = 1;
const MAX_HAND_DRAWN_WIDTH_SCALE = 1.06;
const MAX_HAND_DRAWN_OFFSET_SCALE = 1.2;
const MEASUREMENT_EPSILON = 0.5;
const EXPORT_WORK_BATCH_SIZE = 48;
const MIND_MAP_MINIMAP_WIDTH = 180;
const MIND_MAP_MINIMAP_HEIGHT = 120;
const MIND_MAP_MINIMAP_PADDING = 8;
const MIND_MAP_DECORATION_MARKER_SIZE = 18;
const MIND_MAP_DECORATION_HIT_WIDTH = 14;
const MIND_MAP_NODE_ASSET_SIZE = 16;
const MIND_MAP_NODE_ASSET_GAP = 4;
const MIND_MAP_NODE_LINK_CONTROL_SIZE = 18;
const MIND_MAP_NODE_LINK_CONTROL_GAP = 2;
const MIND_MAP_NODE_LINK_LABEL_GAP = 4;
const VARIABLE_WIDTH_LINE_PATTERNS: Readonly<
	Record<Exclude<MindMapLineStyle, "solid">, {
		readonly dashLength: number;
		readonly gapLength: number;
	}>
> = {
	dashed: { dashLength: 6, gapLength: 4 },
	dotted: { dashLength: 2, gapLength: 3 },
};
let rendererInstanceSequence = 0;

export interface MindMapRenderInput {
	readonly root: MindMapNode;
	readonly sourceRevision: string;
	readonly language: ObMindLanguage;
	readonly colorScheme: MindMapColorScheme;
	readonly presentation: MindMapPresentation;
	readonly interaction: MindMapInteractionState;
	readonly topicCommandAvailability: MindMapTopicCommandAvailability;
}

export interface MindMapRendererCallbacks {
	interaction(event: MindMapInteractionEvent): void;
	renderError?(error: Error): void;
}

/**
 * Renderer-independent viewport coordinates. The center is expressed in scene
 * space so a future Canvas, SVG-only, or WebGL renderer can restore the same
 * view without knowing this renderer's pixel translation.
 */
export type MindMapRendererViewport = MindMapViewportState;

/**
 * The view depends on this small interface rather than a particular DOM shape.
 * A future SVG-only or Canvas renderer can replace this implementation without
 * changing parsing, layout, controller, or navigation code.
 */
export interface MindMapRenderer {
	mount(container: HTMLElement): void;
	render(input: MindMapRenderInput): void;
	captureExportScene?(
		request: MindMapExportCaptureRequest,
		signal?: AbortSignal,
		onProgress?: MindMapExportCaptureProgressCallback,
	): Promise<MindMapExportScene>;
	fitView(): void;
	getViewport(): MindMapRendererViewport | null;
	setViewport(viewport: MindMapRendererViewport): boolean;
	setViewActive(active: boolean): void;
	focusNode(nodeId: string): boolean;
	beginNodeEdit(nodeId: string, initialText?: string): boolean;
	handleKeyboardGesture(gesture: MindMapKeyGesture): boolean;
	destroy(): void;
}

export interface MindMapRendererFactory {
	create(callbacks: MindMapRendererCallbacks): MindMapRenderer;
}

/**
 * Progress emitted while the renderer turns a rendered mind-map into an
 * immutable, renderer-neutral export scene. Encoding and downloading report
 * their own progress at the export host boundary; this contract deliberately
 * stops before those adapter-specific steps.
 */
export type MindMapExportCaptureStage =
	| "preparing"
	| "measuring"
	| "layout"
	| "drawing"
	| "complete";

export interface MindMapExportCaptureProgress {
	readonly stage: MindMapExportCaptureStage;
	readonly completed: number;
	readonly total: number;
}

export type MindMapExportCaptureProgressCallback = (
	progress: MindMapExportCaptureProgress,
) => void;

export interface DomSvgMindMapRendererOptions {
	readonly layoutEngines?: LayoutEngineResolver;
	readonly effects?: DomSvgMindMapEffectRegistry;
	readonly contentLayoutStrategy?: MindMapNodeContentLayoutStrategy;
	readonly dragPreviewGeometryResolver?: NodeDragPreviewGeometryResolver;
	readonly assetRegistry?: MindMapAssetRegistry;
}

/**
 * Interaction snapshots are intentionally excluded except for collapsed IDs:
 * selection, focus, hover, and viewport changes do not alter scene geometry or
 * presentation. Revision fields are the invalidation contract for immutable
 * presentation snapshots, while root identity and sourceRevision guard source
 * replacement.
 */
export function canReuseRenderedMindMapScene(
	previous: MindMapRenderInput,
	next: MindMapRenderInput,
): boolean {
	const previousLayout = previous.presentation.layout;
	const nextLayout = next.presentation.layout;
	const previousTheme = previous.presentation.theme;
	const nextTheme = next.presentation.theme;

	return (
		previous.root === next.root &&
		previous.sourceRevision === next.sourceRevision &&
		previous.language === next.language &&
		previous.colorScheme === next.colorScheme &&
		previous.presentation.revision === next.presentation.revision &&
		previousLayout.revision === nextLayout.revision &&
		previousLayout.engineId === nextLayout.engineId &&
		previousLayout.orientation === nextLayout.orientation &&
		previousLayout.spacing.level === nextLayout.spacing.level &&
		previousLayout.spacing.sibling === nextLayout.spacing.sibling &&
		previousLayout.spacing.subtree === nextLayout.spacing.subtree &&
		previousTheme.id === nextTheme.id &&
		previousTheme.revision === nextTheme.revision &&
		setsEqual(
			previous.interaction.collapsedNodeIds,
			next.interaction.collapsedNodeIds,
		)
	);
}

interface ViewportTransform {
	x: number;
	y: number;
	scale: number;
}

interface ActivePointer {
	id: number;
	clientX: number;
	clientY: number;
}

interface ActiveMinimapPointer {
	readonly id: number;
}

interface ActiveSelectionMarquee {
	readonly id: number;
	readonly startClient: NodeDragPoint;
	currentClient: NodeDragPoint;
	readonly element: HTMLDivElement;
}

interface ActiveNodeDrag {
	readonly id: number;
	readonly sourceNodeId: string;
	readonly sourceSnapshot: MindMapNodeEditSnapshot;
	readonly sourceRevision: string;
	readonly dragStartClient: NodeDragPoint;
	started: boolean;
	dropTarget: NodeDragDropTarget | null;
}

interface ActiveNodeEdit {
	readonly nodeId: string;
	readonly expectedText: string;
	readonly sourceSnapshot: MindMapNodeEditSnapshot;
	readonly input: HTMLTextAreaElement;
	readonly contentButton: HTMLButtonElement;
	blurFrame: number | null;
	finalized: boolean;
}

interface ActiveNodeContextMenu {
	readonly element: HTMLDivElement;
	readonly nodeIds: readonly string[];
	readonly primaryNodeId: string;
}

type NodeContextMenuAction =
	| "edit"
	| "source"
	| "create-child"
	| "create-sibling";

type NodeContextMenuGroup =
	| "edit"
	| "structure"
	| "clipboard"
	| "danger"
	| "source";

interface NodeContextMenuItemDescriptor {
	readonly label: string;
	readonly group: NodeContextMenuGroup;
	readonly action?: NodeContextMenuAction;
	readonly command?: MindMapTopicCommand;
	readonly tone?: "danger";
	readonly disabled?: boolean;
	readonly disabledReason?: string;
}

interface ViewportSize {
	readonly width: number;
	readonly height: number;
}

interface MindMapTreeItemSemantics {
	readonly level: number;
	readonly setSize: number;
	readonly posInSet: number;
	readonly expanded: boolean | null;
}

interface MindMapExportNodeEntry {
	readonly node: MindMapNode;
	readonly depth: number;
}

interface MindMapExportSceneCacheEntry {
	readonly key: string;
	readonly scene: MindMapExportScene;
}

interface MindMapExportColorResolverSession {
	readonly resolve: ExportColorResolver;
	dispose(): void;
}

interface MindMapExportSceneBuildOptions {
	readonly input: MindMapRenderInput;
	readonly result: LayoutResult;
	readonly elementsByNodeId: ReadonlyMap<string, HTMLElement>;
	readonly colorContainer: HTMLElement;
	readonly scope: MindMapExportCaptureRequest["scope"];
	readonly signal: AbortSignal;
	readonly onProgress: MindMapExportCaptureProgressCallback | undefined;
	/** Live canvas geometry is transformed by the current viewport scale. */
	readonly coordinateScale: number;
	readonly yieldBetweenBatches: boolean;
}

interface MindMapExportAbortContext {
	readonly controller: AbortController;
	readonly signal: AbortSignal;
	dispose(): void;
}

interface HtmlElementFactory {
	createElement<K extends keyof HTMLElementTagNameMap>(
		tagName: K,
	): HTMLElementTagNameMap[K];
}

interface SvgElementFactory {
	createElementNS<K extends keyof SVGElementTagNameMap>(
		namespace: "http://www.w3.org/2000/svg",
		tagName: K,
	): SVGElementTagNameMap[K];
}

interface FragmentFactory {
	createDocumentFragment(): DocumentFragment;
}

export class DomSvgMindMapRenderer implements MindMapRenderer {
	private readonly callbacks: MindMapRendererCallbacks;
	private readonly layoutEngines: LayoutEngineResolver;
	private readonly effects: DomSvgMindMapEffectRegistry;
	private readonly contentLayoutStrategy: MindMapNodeContentLayoutStrategy;
	private readonly dragPreviewGeometryResolver:
		| NodeDragPreviewGeometryResolver
		| null;
	private readonly assetRegistry: MindMapAssetRegistry;
	private readonly layoutId = `obmind-layout-view:${++rendererInstanceSequence}`;
	private readonly measuredNodes = new Map<string, NodeSize>();
	private readonly nodeElements = new Map<string, HTMLElement>();
	private readonly visibleNodes = new Map<string, MindMapNode>();
	private readonly branchIndexByNodeId = new Map<string, number>();
	private readonly decorationElements = new Map<string, SVGGElement>();
	/** Abort controllers for snapshots that are still waiting on layout/fonts. */
	private readonly exportAbortControllers = new Set<AbortController>();
	/**
	 * Scene caching is strictly per renderer/tab. Entries are invalidated when
	 * rendered geometry or appearance changes, but intentionally survive pure
	 * selection, hover, focus, and viewport updates.
	 */
	private readonly exportSceneCache = new Map<
		MindMapExportCaptureRequest["scope"],
		MindMapExportSceneCacheEntry
	>();
	private exportSceneRevision = 0;
	private editorLabelSequence = 0;

	private container: HTMLElement | null = null;
	private surface: HTMLDivElement | null = null;
	private scene: HTMLDivElement | null = null;
	private svg: SVGSVGElement | null = null;
	private decorationSvg: SVGSVGElement | null = null;
	private nodesLayer: HTMLDivElement | null = null;
	private minimap: SVGSVGElement | null = null;
	private colorProbe: HTMLSpanElement | null = null;
	private readonly themeColorResolutionCache = new Map<
		string,
		MindMapRgbaColor | null
	>();
	private resizeObserver: ResizeObserver | null = null;
	private renderInput: MindMapRenderInput | null = null;
	private layoutResult: LayoutResult | null = null;
	private renderedSceneBounds: LayoutBounds | null = null;
	private measurementFrame: number | null = null;
	private animationWindow: Window | null = null;
	private activePointer: ActivePointer | null = null;
	private activeMinimapPointer: ActiveMinimapPointer | null = null;
	private activeSelectionMarquee: ActiveSelectionMarquee | null = null;
	private activeNodeDrag: ActiveNodeDrag | null = null;
	private activeNodeDragClientPoint: NodeDragPoint | null = null;
	private nodeDragAutoPanFrame: number | null = null;
	private nodeDragGhost: HTMLDivElement | null = null;
	private nodeDropIndicator: HTMLDivElement | null = null;
	private nodeDropPreview: HTMLDivElement | null = null;
	private nodeDropPreviewConnector: HTMLDivElement | null = null;
	private nodeDropTargetId: string | null = null;
	private suppressNodeActivationUntil = 0;
	private lastViewportSize: ViewportSize | null = null;
	private fitRequested = false;
	private destroyed = false;
	private containerAlreadyScoped = false;
	private measurementRevision: string | null = null;
	private activeNodeEdit: ActiveNodeEdit | null = null;
	private activeNodeContextMenu: ActiveNodeContextMenu | null = null;
	private sceneCulling: MindMapSceneCullingResult | null = null;
	private decorationDescriptors: readonly MindMapDecorationGeometryDescriptor[] =
		[];
	private minimapTransform: MindMapMinimapTransform | null = null;
	private minimapRenderedLayout: LayoutResult | null = null;
	private minimapRenderedBounds: LayoutBounds | null = null;
	private minimapRenderedThemeKey: string | null = null;
	private minimapViewportElement: SVGRectElement | null = null;
	private transform: ViewportTransform = { x: 0, y: 0, scale: 1 };
	private viewActive = false;
	private isSpaceKeyHeld = false;
	private spaceGestureOwner: "canvas" | "node" = "canvas";

	constructor(
		callbacks: MindMapRendererCallbacks,
		options: DomSvgMindMapRendererOptions = {},
	) {
		this.callbacks = callbacks;
		this.layoutEngines =
			options.layoutEngines ??
			BUILT_IN_MIND_MAP_LAYOUT_ENGINE_REGISTRY;
		this.effects =
			options.effects ?? BUILT_IN_DOM_SVG_EFFECT_REGISTRY;
		this.contentLayoutStrategy =
			options.contentLayoutStrategy ??
			createMindMapNodeContentLayoutStrategy();
		this.dragPreviewGeometryResolver =
			options.dragPreviewGeometryResolver ?? null;
		this.assetRegistry =
			options.assetRegistry ?? BUILT_IN_MIND_MAP_ASSET_REGISTRY;
	}

	mount(container: HTMLElement): void {
		if (this.destroyed) {
			return;
		}
		if (this.container === container) {
			return;
		}
		if (this.container !== null) {
			throw new Error(
				createObMindTranslator(DEFAULT_OBMIND_LANGUAGE).t(
					"renderer.error.already-mounted",
				),
			);
		}

		this.container = container;
		this.containerAlreadyScoped = container.classList.contains("obmind-renderer");
		container.classList.add("obmind-renderer");

		const ownerDocument = container.ownerDocument;
		const surface = createHtmlElement(ownerDocument, "div");
		surface.className = "obmind-renderer-surface";
		surface.tabIndex = 0;
		surface.setAttribute("role", "group");
		surface.setAttribute(
			"aria-label",
			createObMindTranslator(DEFAULT_OBMIND_LANGUAGE).t(
				"renderer.canvas.aria",
			),
		);

		const scene = createHtmlElement(ownerDocument, "div");
		scene.className = "obmind-renderer-scene";

		const svg = createSvgElement(ownerDocument, "svg");
		svg.classList.add("obmind-renderer-edges");
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("focusable", "false");

		const decorationSvg = createSvgElement(ownerDocument, "svg");
		decorationSvg.classList.add("obmind-renderer-decorations");
		decorationSvg.setAttribute("role", "group");
		decorationSvg.setAttribute(
			"aria-label",
			createObMindTranslator(DEFAULT_OBMIND_LANGUAGE).t(
				"renderer.decorations.aria",
			),
		);

		const nodesLayer = createHtmlElement(ownerDocument, "div");
		nodesLayer.className = "obmind-renderer-nodes";
		nodesLayer.setAttribute("role", "tree");
		nodesLayer.setAttribute("aria-multiselectable", "true");
		nodesLayer.setAttribute(
			"aria-label",
			createObMindTranslator(DEFAULT_OBMIND_LANGUAGE).t(
				"renderer.tree.aria",
			),
		);

		const minimap = createSvgElement(ownerDocument, "svg");
		minimap.classList.add("obmind-minimap");
		minimap.setAttribute("role", "region");
		minimap.setAttribute("tabindex", "0");
		minimap.setAttribute("focusable", "true");
		minimap.setAttribute(
			"aria-label",
			createObMindTranslator(DEFAULT_OBMIND_LANGUAGE).t(
				"renderer.minimap.aria",
			),
		);
		minimap.setAttribute("hidden", "");
		const colorProbe = createHtmlElement(ownerDocument, "span");
		colorProbe.className = "obmind-color-probe";
		colorProbe.setAttribute("aria-hidden", "true");

		scene.append(svg, decorationSvg, nodesLayer);
		surface.append(scene, minimap);
		container.append(colorProbe, surface);

		this.surface = surface;
		this.scene = scene;
		this.svg = svg;
		this.decorationSvg = decorationSvg;
		this.nodesLayer = nodesLayer;
		this.minimap = minimap;
		this.colorProbe = colorProbe;
		this.animationWindow = ownerDocument.defaultView;
		this.updateSurfaceAccessibleLabel(
			this.renderInput?.language ?? DEFAULT_OBMIND_LANGUAGE,
		);

		this.animationWindow?.addEventListener(
			"keydown",
			this.handleRendererWindowKeyDown,
			{ capture: true },
		);
		this.animationWindow?.addEventListener(
			"keyup",
			this.handleRendererWindowKeyUp,
			{ capture: true },
		);
		this.animationWindow?.addEventListener(
			"pointerdown",
			this.handleWindowPointerDown,
			{ capture: true },
		);
		surface.addEventListener("pointerdown", this.handlePointerDown);
		surface.addEventListener("pointermove", this.handlePointerMove);
		surface.addEventListener("pointerup", this.handlePointerEnd);
		surface.addEventListener("pointercancel", this.handlePointerCancel);
		surface.addEventListener("pointerleave", this.handlePointerLeave);
		surface.addEventListener(
			"lostpointercapture",
			this.handleLostPointerCapture,
		);
		surface.addEventListener("wheel", this.handleWheel, { passive: false });
		nodesLayer.addEventListener("click", this.handleNodeClick);
		nodesLayer.addEventListener("dblclick", this.handleNodeDoubleClick);
		nodesLayer.addEventListener("keydown", this.handleNodeKeyDown);
		nodesLayer.addEventListener(
			"contextmenu",
			this.handleNodeContextMenu,
		);
		nodesLayer.addEventListener(
			"pointerover",
			this.handleNodePointerOver,
		);
		nodesLayer.addEventListener(
			"pointerout",
			this.handleNodePointerOut,
		);
		decorationSvg.addEventListener("click", this.handleDecorationClick);
		decorationSvg.addEventListener("keydown", this.handleDecorationKeyDown);
		minimap.addEventListener("pointerdown", this.handleMinimapPointerDown);
		minimap.addEventListener("pointermove", this.handleMinimapPointerMove);
		minimap.addEventListener("pointerup", this.handleMinimapPointerEnd);
		minimap.addEventListener("pointercancel", this.handleMinimapPointerCancel);
		minimap.addEventListener(
			"lostpointercapture",
			this.handleMinimapLostPointerCapture,
		);

		const ResizeObserverConstructor =
			ownerDocument.defaultView?.ResizeObserver ?? ResizeObserver;
		this.resizeObserver = new ResizeObserverConstructor(this.handleResize);
		this.resizeObserver.observe(surface);
		this.lastViewportSize = {
			width: surface.clientWidth,
			height: surface.clientHeight,
		};
		this.applyTransform();

		if (this.renderInput !== null) {
			this.applyPresentationToContainer(
				this.renderInput.presentation,
				resolveMindMapThemeColors(
					this.renderInput.presentation.theme,
					this.renderInput.colorScheme,
				),
			);
			this.themeColorResolutionCache.clear();
			this.renderLayout();
		}
	}

	render(input: MindMapRenderInput): void {
		if (this.destroyed) {
			return;
		}

		// Keep pre-i18n renderer callers safe while the typed public contract
		// requires a language. Persisted views always provide this field.
		const language = normalizeObMindLanguage(input.language);
		const previousInput = this.renderInput;
		if (
			this.activeNodeContextMenu !== null &&
			previousInput !== null &&
			(previousInput.sourceRevision !== input.sourceRevision ||
				previousInput.root.source.path !== input.root.source.path ||
				previousInput.language !== language)
		) {
			this.closeNodeContextMenu();
		}
		if (
			this.activeNodeDrag !== null &&
			!canContinueNodeDragAfterRender(
				input.root,
				this.activeNodeDrag.sourceNodeId,
				this.activeNodeDrag.sourceRevision,
				input.sourceRevision,
			)
		) {
			this.cancelNodeDrag();
		}
		const activeEdit = this.activeNodeEdit;
		if (activeEdit !== null) {
			const latestNode = findNodeById(input.root, activeEdit.nodeId);
			if (
				latestNode === null ||
				!nodeMatchesMindMapEditSnapshot(
					latestNode,
					activeEdit.sourceSnapshot,
				)
			) {
				this.finishNodeEdit(false, false);
			}
		}
		const measurementRevision = [
			input.sourceRevision,
			input.presentation.theme.styleId,
			input.presentation.theme.styleRevision,
			input.presentation.formatting.fontFamily.id,
			input.presentation.formatting.fontFamily.revision,
			input.presentation.formatting.fontFamily.fontFamilyToken ??
				"style-default",
			createNodeMeasurementOverrideSignature(input.presentation.nodes),
			this.contentLayoutStrategy.id,
			this.contentLayoutStrategy.revision,
		].join(":");
		const measurementRevisionChanged =
			this.measurementRevision !== measurementRevision;
		if (measurementRevisionChanged) {
			this.measuredNodes.clear();
			this.measurementRevision = measurementRevision;
		}

		const nextInput: MindMapRenderInput = {
			root: input.root,
			sourceRevision: input.sourceRevision,
			language,
			colorScheme: input.colorScheme,
			presentation: input.presentation,
			topicCommandAvailability:
				input.topicCommandAvailability,
			interaction: {
				...input.interaction,
				collapsedNodeIds: new Set(
					input.interaction.collapsedNodeIds,
				),
				selectedNodeIds: new Set(
					input.interaction.selectedNodeIds,
				),
			},
		};
		this.renderInput = nextInput;
		this.updateSurfaceAccessibleLabel(nextInput.language);

		if (
			!measurementRevisionChanged &&
			previousInput !== null &&
			this.layoutResult !== null &&
			canReuseRenderedMindMapScene(previousInput, nextInput)
		) {
			this.updateNodeInteractionClasses(nextInput.interaction);
			this.refreshSceneCulling();
			this.updateDecorationInteractionClasses(
				nextInput.interaction.selectedDecorationId,
			);
			return;
		}

		const currentIds = collectNodeIds(input.root);
		for (const id of this.measuredNodes.keys()) {
			if (!currentIds.has(id)) {
				this.measuredNodes.delete(id);
			}
		}

		this.branchIndexByNodeId.clear();
		for (const [nodeId, branchIndex] of createRootBranchColorIndexMap(
			input.root,
		)) {
			this.branchIndexByNodeId.set(nodeId, branchIndex);
		}
		this.applyPresentationToContainer(
			input.presentation,
			resolveMindMapThemeColors(
				input.presentation.theme,
				input.colorScheme,
			),
		);
		this.themeColorResolutionCache.clear();

		if (this.nodesLayer !== null) {
			this.renderLayout();
		}
	}

	/**
	 * This stays separate from geometry so a language-only render can refresh
	 * accessibility chrome without changing viewport or source-derived state.
	 */
	private updateSurfaceAccessibleLabel(language: ObMindLanguage): void {
		const translator = createObMindTranslator(language);
		this.surface?.setAttribute(
			"aria-label",
			translator.t("renderer.canvas.aria"),
		);
		this.nodesLayer?.setAttribute("aria-label", translator.t("renderer.tree.aria"));
		this.decorationSvg?.setAttribute(
			"aria-label",
			translator.t("renderer.decorations.aria"),
		);
		this.minimap?.setAttribute(
			"aria-label",
			translator.t("renderer.minimap.aria"),
		);
	}

	private readonly handleDecorationClick = (event: MouseEvent): void => {
		const decorationId = this.resolveDecorationIdFromEventTarget(event.target);
		if (decorationId === null) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		this.callbacks.interaction({
			type: "decoration-select",
			decorationId,
		});
	};

	private readonly handleDecorationKeyDown = (
		event: KeyboardEvent,
	): void => {
		if (event.key !== "Enter" && event.key !== " ") {
			return;
		}
		const decorationId = this.resolveDecorationIdFromEventTarget(event.target);
		if (decorationId === null) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		this.callbacks.interaction({
			type: "decoration-select",
			decorationId,
		});
	};

	private resolveDecorationIdFromEventTarget(
		target: EventTarget | null,
	): string | null {
		if (!isElement(target)) {
			return null;
		}
		const element = target.closest<SVGGElement>(
			"[data-obmind-decoration-id]",
		);
		const decorationId = element?.dataset.obmindDecorationId;
		return element !== null &&
			element !== undefined &&
			this.decorationSvg?.contains(element) === true &&
			decorationId !== undefined &&
			this.decorationElements.has(decorationId)
			? decorationId
			: null;
	}

	private readonly handleMinimapPointerDown = (
		event: PointerEvent,
	): void => {
		const minimap = this.minimap;
		if (
			minimap === null ||
			!event.isPrimary ||
			(event.pointerType === "mouse" && event.button !== 0) ||
			this.minimapTransform === null
		) {
			return;
		}
		this.activeMinimapPointer = { id: event.pointerId };
		if (typeof minimap.setPointerCapture === "function") {
			minimap.setPointerCapture(event.pointerId);
		}
		this.recenterFromMinimapClientPoint(event.clientX, event.clientY);
		event.preventDefault();
		event.stopPropagation();
	};

	private readonly handleMinimapPointerMove = (
		event: PointerEvent,
	): void => {
		if (this.activeMinimapPointer?.id !== event.pointerId) {
			return;
		}
		this.recenterFromMinimapClientPoint(event.clientX, event.clientY);
		event.preventDefault();
		event.stopPropagation();
	};

	private readonly handleMinimapPointerEnd = (
		event: PointerEvent,
	): void => {
		if (this.activeMinimapPointer?.id !== event.pointerId) {
			return;
		}
		this.cancelMinimapPointer();
		event.preventDefault();
		event.stopPropagation();
	};

	private readonly handleMinimapPointerCancel = (
		event: PointerEvent,
	): void => {
		if (this.activeMinimapPointer?.id !== event.pointerId) {
			return;
		}
		this.cancelMinimapPointer();
		event.preventDefault();
		event.stopPropagation();
	};

	private readonly handleMinimapLostPointerCapture = (
		event: PointerEvent,
	): void => {
		if (this.activeMinimapPointer?.id === event.pointerId) {
			this.activeMinimapPointer = null;
		}
	};

	private cancelMinimapPointer(): void {
		const active = this.activeMinimapPointer;
		this.activeMinimapPointer = null;
		const minimap = this.minimap;
		if (
			active !== null &&
			minimap !== null &&
			typeof minimap.hasPointerCapture === "function" &&
			minimap.hasPointerCapture(active.id) &&
			typeof minimap.releasePointerCapture === "function"
		) {
			minimap.releasePointerCapture(active.id);
		}
	}

	private recenterFromMinimapClientPoint(
		clientX: number,
		clientY: number,
	): void {
		const minimap = this.minimap;
		const transform = this.minimapTransform;
		const surface = this.surface;
		if (
			minimap === null ||
			transform === null ||
			surface === null ||
			surface.clientWidth <= 0 ||
			surface.clientHeight <= 0
		) {
			return;
		}
		const rect = minimap.getBoundingClientRect();
		const width = rect.width > 0 ? rect.width : MIND_MAP_MINIMAP_WIDTH;
		const height = rect.height > 0 ? rect.height : MIND_MAP_MINIMAP_HEIGHT;
		const localPoint = {
			x: ((clientX - rect.left) / width) * MIND_MAP_MINIMAP_WIDTH,
			y: ((clientY - rect.top) / height) * MIND_MAP_MINIMAP_HEIGHT,
		};
		const scenePoint = mindMapMinimapPointToScene(localPoint, transform);
		const scale = this.transform.scale;
		this.transform = {
			x: surface.clientWidth / 2 - scenePoint.x * scale,
			y: surface.clientHeight / 2 - scenePoint.y * scale,
			scale,
		};
		this.applyTransform();
		this.notifyViewportChanged("pan");
	}

	async captureExportScene(
		request: MindMapExportCaptureRequest,
		signal?: AbortSignal,
		onProgress?: MindMapExportCaptureProgressCallback,
	): Promise<MindMapExportScene> {
		const abortContext = createMindMapExportAbortContext(signal);
		this.exportAbortControllers.add(abortContext.controller);
		try {
			const captureSignal = abortContext.signal;
			throwIfMindMapExportAborted(captureSignal);
			reportMindMapExportCaptureProgress(onProgress, "preparing", 0, 1);
			const input = this.renderInput;
			const translator = createObMindTranslator(
				input?.language ?? DEFAULT_OBMIND_LANGUAGE,
			);
			const container = this.container;
			const ownerDocument = container?.ownerDocument;
			if (
				this.destroyed ||
				input === null ||
				container === null ||
				ownerDocument === undefined
			) {
				throw new MindMapExportError(
					translator.t("renderer.export.scene-unavailable"),
					"scene-unavailable",
				);
			}
			if (this.activeNodeEdit !== null || this.activeNodeDrag !== null) {
				throw new MindMapExportError(
					translator.t(
						"renderer.export.finish-editing-or-dragging",
					),
					"scene-unavailable",
				);
			}

			const exportInput = createMindMapExportRenderInput(
				input,
				request.scope,
			);
			const cacheRevision = this.exportSceneRevision;
			const cacheKey = this.createExportSceneCacheKey(
				exportInput,
				request.scope,
				cacheRevision,
			);
			const cached = this.exportSceneCache.get(request.scope);
			if (cached?.key === cacheKey) {
				throwIfMindMapExportAborted(captureSignal);
				reportMindMapExportCaptureProgress(onProgress, "complete", 1, 1);
				return cloneMindMapExportScene(cached.scene);
			}

			const liveExport =
				request.scope === "visible-map"
					? this.resolveLiveMindMapExportElements(input, exportInput)
					: null;
			const scene =
				liveExport === null
					? await this.captureMeasuredMindMapExportScene({
							input: exportInput,
							container,
							ownerDocument,
							scope: request.scope,
							signal: captureSignal,
							onProgress,
						})
					: await this.buildMindMapExportScene({
							input: exportInput,
							result: liveExport.result,
							elementsByNodeId: liveExport.elementsByNodeId,
							colorContainer: container,
							scope: request.scope,
							signal: captureSignal,
							onProgress,
							coordinateScale: this.transform.scale,
							yieldBetweenBatches: false,
						});
			throwIfMindMapExportAborted(captureSignal);

			const cachedScene = cloneMindMapExportScene(scene);
			if (
				!this.destroyed &&
				this.exportSceneRevision === cacheRevision
			) {
				this.exportSceneCache.set(request.scope, {
					key: cacheKey,
					scene: cachedScene,
				});
			}
			reportMindMapExportCaptureProgress(onProgress, "complete", 1, 1);
			return cloneMindMapExportScene(cachedScene);
		} finally {
			this.exportAbortControllers.delete(abortContext.controller);
			abortContext.dispose();
		}
	}

	private createExportSceneCacheKey(
		input: MindMapRenderInput,
		scope: MindMapExportCaptureRequest["scope"],
		cacheRevision: number,
	): string {
		return [
			String(cacheRevision),
			scope,
			input.sourceRevision,
			input.colorScheme,
			String(input.presentation.revision),
			String(input.presentation.layout.revision),
		].join("|");
	}

	private invalidateExportSceneCache(): void {
		this.exportSceneRevision += 1;
		this.exportSceneCache.clear();
	}

	/**
	 * Visible-map exports use the existing, positioned topic DOM and live
	 * layout when the live topic has no interaction-only control that changes
	 * its measured geometry. Linked topics reserve inline space for buttons that
	 * are intentionally excluded from exports, so those snapshots fall back to
	 * the isolated measurement path used by full-map capture.
	 */
	private resolveLiveMindMapExportElements(
		liveInput: MindMapRenderInput,
		exportInput: MindMapRenderInput,
	): {
		readonly result: LayoutResult;
		readonly elementsByNodeId: ReadonlyMap<string, HTMLElement>;
	} | null {
		const result = this.layoutResult;
		if (
			result === null ||
			this.renderInput !== liveInput ||
			liveInput.root !== exportInput.root ||
			liveInput.sourceRevision !== exportInput.sourceRevision
		) {
			return null;
		}

		const expected = collectExportNodeEntries(
			exportInput.root,
			exportInput.interaction.collapsedNodeIds,
		);
		if (expected.length !== result.nodes.length) {
			return null;
		}
		const expectedIds = new Set(expected.map((entry) => entry.node.id));
		const elementsByNodeId = new Map<string, HTMLElement>();
		for (const positioned of result.nodes) {
			if (!expectedIds.has(positioned.node.id)) {
				return null;
			}
			const element = this.nodeElements.get(positioned.node.id);
			if (element === undefined) {
				return null;
			}
			if (element.classList.contains("obmind-node-has-links")) {
				return null;
			}
			elementsByNodeId.set(positioned.node.id, element);
		}
		return { result, elementsByNodeId };
	}

	/**
	 * Full-map snapshots expand the immutable export input in a private layer.
	 * They never mount hidden descendants in the live scene or touch its
	 * interaction/viewport state.
	 */
	private async captureMeasuredMindMapExportScene(parameters: {
		readonly input: MindMapRenderInput;
		readonly container: HTMLElement;
		readonly ownerDocument: Document;
		readonly scope: MindMapExportCaptureRequest["scope"];
		readonly signal: AbortSignal;
		readonly onProgress: MindMapExportCaptureProgressCallback | undefined;
	}): Promise<MindMapExportScene> {
		const exportInput = parameters.input;
		const entries = collectExportNodeEntries(
			exportInput.root,
			exportInput.interaction.collapsedNodeIds,
		);
		const branchIndexes = createRootBranchColorIndexMap(exportInput.root);
		const treeSemantics = createMindMapTreeItemSemantics(
			exportInput.root,
			new Set(entries.map(({ node }) => node.id)),
			exportInput.interaction.collapsedNodeIds,
		);
		const colors = resolveMindMapThemeColors(
			exportInput.presentation.theme,
			exportInput.colorScheme,
		);
		const measureLayer = createHtmlElement(parameters.ownerDocument, "div");
		measureLayer.className =
			"obmind-renderer-nodes obmind-export-measure-layer";
		measureLayer.setAttribute("aria-hidden", "true");
		parameters.container.append(measureLayer);
		copyMindMapExportCssSnapshot(parameters.container, measureLayer);

		const elementsByNodeId = new Map<string, HTMLElement>();
		let contrastColorResolver: MindMapExportColorResolverSession | null =
			null;
		try {
			contrastColorResolver = createExportColorResolver(
				parameters.ownerDocument,
				measureLayer,
			);
			const snapshotColorResolver = contrastColorResolver;
			const resolveExportContrastColor: MindMapThemeColorResolver = (
				color,
			) =>
				parseMindMapCssColor(
					snapshotColorResolver.resolve(resolveThemeColor(color)),
				);
			reportMindMapExportCaptureProgress(
				parameters.onProgress,
				"measuring",
				0,
				entries.length,
			);
			const disclosureSide = resolveMindMapDisclosurePlacement(
				exportInput.presentation.layout.orientation,
			).connectionSide;
			for (let index = 0; index < entries.length; index += 1) {
				throwIfMindMapExportAborted(parameters.signal);
				const entry = entries[index];
				if (entry === undefined) {
					continue;
				}
				const element = this.createNodeElement(
					entry.node.id,
					`${this.layoutId.replaceAll(":", "-")}-export-editor-${entry.node.id}`,
				);
				this.updateNodeElement(
					element,
					entry.node,
					entry.depth,
					exportInput,
					colors,
					treeSemantics.get(entry.node.id) ?? {
						level: entry.depth + 1,
						setSize: 1,
						posInSet: 1,
						expanded:
							entry.node.children.length === 0 ? null : true,
					},
					disclosureSide,
					branchIndexes,
					resolveExportContrastColor,
				);
				element.classList.add("obmind-export-measure-node");
				measureLayer.append(element);
				elementsByNodeId.set(entry.node.id, element);
				reportMindMapExportCaptureProgress(
					parameters.onProgress,
					"measuring",
					index + 1,
					entries.length,
				);
				if (shouldYieldMindMapExportWork(index + 1, entries.length)) {
					await waitForExportLayout(
						parameters.ownerDocument,
						parameters.signal,
						exportInput.language,
					);
				}
			}

			await waitForMindMapExportFonts(
				parameters.ownerDocument,
				parameters.signal,
				exportInput.language,
			);
			await waitForExportLayout(
				parameters.ownerDocument,
				parameters.signal,
				exportInput.language,
			);
			throwIfMindMapExportAborted(parameters.signal);

			const measuredSizes = new Map<string, NodeSize>();
			for (const [nodeId, element] of elementsByNodeId) {
				const width = element.offsetWidth;
				const height = element.offsetHeight;
				if (width > 0 && height > 0) {
					measuredSizes.set(nodeId, { width, height });
				}
			}
			reportMindMapExportCaptureProgress(
				parameters.onProgress,
				"layout",
				0,
				1,
			);
			const result = this.calculateLayoutWithMeasurements(
				exportInput,
				measuredSizes,
				exportInput.interaction.collapsedNodeIds,
				`${this.layoutId}:export:${parameters.scope}`,
			);
			reportMindMapExportCaptureProgress(
				parameters.onProgress,
				"layout",
				1,
				1,
			);
			return this.buildMindMapExportScene({
				input: exportInput,
				result,
				elementsByNodeId,
				colorContainer: measureLayer,
				scope: parameters.scope,
				signal: parameters.signal,
				onProgress: parameters.onProgress,
				coordinateScale: 1,
				yieldBetweenBatches: true,
			});
		} finally {
			contrastColorResolver?.dispose();
			measureLayer.remove();
		}
	}

	private async buildMindMapExportScene(
		options: MindMapExportSceneBuildOptions,
	): Promise<MindMapExportScene> {
		const colors = resolveMindMapThemeColors(
			options.input.presentation.theme,
			options.input.colorScheme,
		);
		const branchIndexes = createRootBranchColorIndexMap(options.input.root);
		const colorResolver = createExportColorResolver(
			options.colorContainer.ownerDocument,
			options.colorContainer,
		);
		try {
			const primitives: MindMapExportPrimitive[] = [];
			const decorationDescriptors = resolveMindMapDecorationDescriptors(
				options.result,
				options.input,
			);
			const totalWork =
				options.result.edges.length +
				options.result.nodes.length +
				decorationDescriptors.length;
			let completedWork = 0;
			reportMindMapExportCaptureProgress(
				options.onProgress,
				"drawing",
				completedWork,
				totalWork,
			);
			await appendExportEdgePrimitives(
				primitives,
				options.result,
				options.input,
				colors,
				branchIndexes,
				this.effects,
				colorResolver.resolve,
				options.signal,
				{
					ownerDocument: options.colorContainer.ownerDocument,
					yieldBetweenBatches: options.yieldBetweenBatches,
					onProcessed: () => {
						completedWork += 1;
						reportMindMapExportCaptureProgress(
							options.onProgress,
							"drawing",
							completedWork,
							totalWork,
						);
					},
				},
			);
			throwIfMindMapExportAborted(options.signal);
			if (decorationDescriptors.length > 0) {
				primitives.push(
					...createMindMapDecorationExportPrimitives(
						decorationDescriptors,
						createMindMapDecorationExportPrimitiveOptions(
							this.assetRegistry,
							colors,
							colorResolver.resolve,
							resolveMindMapExportDecorationFontFamily(
								options.colorContainer,
							),
						),
					),
				);
				completedWork += decorationDescriptors.length;
				reportMindMapExportCaptureProgress(
					options.onProgress,
					"drawing",
					completedWork,
					totalWork,
				);
			}
			const shapes = new Set<MindMapExportScene["nodeShapes"][number]>();
			for (let index = 0; index < options.result.nodes.length; index += 1) {
				throwIfMindMapExportAborted(options.signal);
				const positioned = options.result.nodes[index];
				if (positioned === undefined) {
					continue;
				}
				const element = options.elementsByNodeId.get(positioned.node.id);
				if (element !== undefined) {
					appendExportNodePrimitives(
						primitives,
						element,
						positioned,
						shapes,
						{
							input: options.input,
							colors,
							branchIndexes,
							assetRegistry: this.assetRegistry,
							effects: this.effects,
						},
						colorResolver.resolve,
						options.signal,
						options.coordinateScale,
					);
				}
				completedWork += 1;
				reportMindMapExportCaptureProgress(
					options.onProgress,
					"drawing",
					completedWork,
					totalWork,
				);
				if (
					options.yieldBetweenBatches &&
					shouldYieldMindMapExportWork(
						index + 1,
						options.result.nodes.length,
					)
				) {
					await waitForExportLayout(
						options.colorContainer.ownerDocument,
						options.signal,
						options.input.language,
					);
				}
			}
			const edgePadding = calculateEdgeRenderPadding(
				options.result,
				options.input.presentation,
			);
			const baseBounds = {
				x: options.result.bounds.x - edgePadding,
				y: options.result.bounds.y - edgePadding,
				width: Math.max(1, options.result.bounds.width + edgePadding * 2),
				height: Math.max(1, options.result.bounds.height + edgePadding * 2),
			};
			const bounds = unionMindMapLayoutBounds(
				baseBounds,
				resolveMindMapDecorationDescriptorBounds(decorationDescriptors),
			);
			const canvasEffect = this.effects.resolveCanvasTexture(
				options.input.presentation.theme.tokens.effects.canvasTexture,
				`style:${options.input.presentation.theme.styleId}`,
			);
			return {
				sourcePath: options.input.root.source.path,
				sourceRevision: options.input.sourceRevision,
				presentationRevision: options.input.presentation.revision,
				scope: options.scope,
				bounds,
				backgroundColor: colorResolver.resolve(
					resolveThemeColor(colors.canvas),
				),
				canvasTexture:
					canvasEffect?.createExportTexture({
						textMuted: colorResolver.resolve(
							resolveThemeColor(colors.textMuted),
						),
						border: colorResolver.resolve(resolveThemeColor(colors.border)),
					}) ?? null,
				primitives,
				nodeShapes: [...shapes],
			};
		} finally {
			colorResolver.dispose();
		}
	}

	fitView(): void {
		if (this.destroyed) {
			return;
		}

		this.fitRequested = true;
		if (this.renderInput !== null && this.nodesLayer !== null) {
			this.scheduleMeasurement();
		}
	}

	getViewport(): MindMapRendererViewport | null {
		const surface = this.surface;
		if (
			surface === null ||
			surface.clientWidth <= 0 ||
			surface.clientHeight <= 0
		) {
			return null;
		}

		return {
			centerX:
				(surface.clientWidth / 2 - this.transform.x) /
				this.transform.scale,
			centerY:
				(surface.clientHeight / 2 - this.transform.y) /
				this.transform.scale,
			scale: this.transform.scale,
		};
	}

	setViewport(viewport: MindMapRendererViewport): boolean {
		const surface = this.surface;
		if (
			surface === null ||
			surface.clientWidth <= 0 ||
			surface.clientHeight <= 0 ||
			!Number.isFinite(viewport.centerX) ||
			!Number.isFinite(viewport.centerY) ||
			!Number.isFinite(viewport.scale) ||
			viewport.scale <= 0
		) {
			return false;
		}

		const scale = clamp(viewport.scale, MIN_SCALE, MAX_SCALE);
		this.transform = {
			x: surface.clientWidth / 2 - viewport.centerX * scale,
			y: surface.clientHeight / 2 - viewport.centerY * scale,
			scale,
		};
		this.applyTransform();
		return true;
	}

	setViewActive(active: boolean): void {
		if (this.destroyed) {
			return;
		}

		this.viewActive = active;
		if (!active) {
			this.isSpaceKeyHeld = false;
			this.surface?.classList.remove("obmind-renderer-space-pan");
			this.cancelSelectionMarquee();
			this.cancelNodeDrag();
			this.cancelCanvasPointer();
			this.cancelMinimapPointer();
		}
	}

	focusNode(nodeId: string): boolean {
		const surface = this.surface;
		const element = this.nodeElements.get(nodeId);
		const positioned = this.layoutResult?.nodes.find(
			(candidate) => candidate.node.id === nodeId,
		);
		if (
			surface === null ||
			element === undefined ||
			positioned === undefined ||
			surface.clientWidth <= 0 ||
			surface.clientHeight <= 0
		) {
			return false;
		}
		this.spaceGestureOwner = "node";

		if (this.activeNodeEdit?.nodeId === nodeId) {
			this.activeNodeEdit.input.focus({ preventScroll: true });
		} else {
			element
				.querySelector<HTMLButtonElement>(".obmind-node-content")
				?.focus({ preventScroll: true });
		}
		const centerX = positioned.x + positioned.width / 2;
		const centerY = positioned.y + positioned.height / 2;
		this.transform = {
			x: surface.clientWidth / 2 - centerX * this.transform.scale,
			y: surface.clientHeight / 2 - centerY * this.transform.scale,
			scale: this.transform.scale,
		};
		this.applyTransform();
		this.notifyViewportChanged("pan");
		this.callbacks.interaction({
			type: "node-focus",
			nodeId,
		});
		return true;
	}

	beginNodeEdit(nodeId: string, initialText?: string): boolean {
		if (this.destroyed || this.activeNodeDrag !== null) {
			return false;
		}

		const node = this.visibleNodes.get(nodeId);
		const nodeElement = this.nodeElements.get(nodeId);
		if (this.activeNodeEdit?.nodeId === nodeId) {
			if (initialText !== undefined) {
				this.activeNodeEdit.input.value = initialText;
				resizeNodeEditor(this.activeNodeEdit.input);
			}
			this.activeNodeEdit.input.focus({ preventScroll: true });
			this.activeNodeEdit.input.select();
			return true;
		}
		const contentButton =
			nodeElement?.querySelector<HTMLButtonElement>(
				".obmind-node-content",
			);
		if (
			node === undefined ||
			nodeElement === undefined ||
			contentButton === null ||
			contentButton === undefined
		) {
			return false;
		}
		this.spaceGestureOwner = "node";

		this.finishNodeEdit(false, false);

		const input = createHtmlElement(
			nodeElement.ownerDocument,
			"textarea",
		);
		input.className = "obmind-node-editor";
		input.value = initialText ?? node.text;
		const editorLabel = nodeElement.querySelector<HTMLElement>(
			".obmind-node-editor-accessible-label",
		);
		const translator = createObMindTranslator(
			this.renderInput?.language ?? DEFAULT_OBMIND_LANGUAGE,
		);
		if (editorLabel !== null) {
			input.setAttribute("aria-labelledby", editorLabel.id);
		} else {
			input.setAttribute(
				"aria-label",
				translator.t("renderer.editor.edit-node-with-name", {
					node: node.text,
				}),
			);
		}
		input.autocomplete = "off";
		input.spellcheck = true;
		input.wrap = "soft";
		copyNodeEditorStyles(contentButton, input);
		resizeNodeEditor(input);

		const edit: ActiveNodeEdit = {
			nodeId,
			expectedText: node.text,
			sourceSnapshot: createMindMapNodeEditSnapshot(
				node,
				this.renderInput?.sourceRevision ?? "",
			),
			input,
			contentButton,
			blurFrame: null,
			finalized: false,
		};
		this.activeNodeEdit = edit;
		nodeElement.classList.add("obmind-node-editing");
		nodeElement.classList.remove("obmind-node-edit-invalid");
		// Replace the content control in place so the editor remains the node's
		// single measured content box. Appending it to `.obmind-node` would make
		// it a second in-flow child whenever a host/theme overrides `[hidden]`.
		contentButton.replaceWith(input);
		resizeNodeEditor(input);
		input.addEventListener("keydown", this.handleNodeEditorKeyDown);
		input.addEventListener("blur", this.handleNodeEditorBlur);
		input.addEventListener("input", this.handleNodeEditorInput);
		input.addEventListener(
			"pointerdown",
			this.handleNodeEditorPointerEvent,
		);
		input.addEventListener(
			"click",
			this.handleNodeEditorPointerEvent,
		);
		this.callbacks.interaction({
			type: "node-select",
			nodeId,
			mode: "replace",
		});
		this.callbacks.interaction({
			type: "node-focus",
			nodeId,
		});
		input.focus({ preventScroll: true });
		input.select();
		this.scheduleMeasurement();
		return true;
	}

	handleKeyboardGesture(gesture: MindMapKeyGesture): boolean {
		if (this.destroyed || !this.viewActive) {
			return false;
		}

		if (this.activeNodeEdit !== null) {
			return this.performNodeEditorKeyIntent(
				resolveMindMapNodeEditorKeyIntent({
					...gesture,
					allowsLineBreaks:
						this.activeNodeEdit.sourceSnapshot.kind !== "root",
				}),
			);
		}

		if (gesture.isComposing === true) {
			return false;
		}

		const command = resolveMindMapTopicCommandShortcut(
			gesture,
			(this.renderInput?.interaction.selectedNodeIds.size ?? 0) > 0,
		);
		if (command !== null) {
			return this.requestTopicCommand(command);
		}

		const activeElement =
			this.nodesLayer?.ownerDocument.activeElement ?? null;
		if (!isElement(activeElement)) {
			return false;
		}
		const contentButton = activeElement.closest<HTMLButtonElement>(
			'button[data-obmind-action="select"]',
		);
		const nodeId = contentButton?.closest<HTMLElement>(".obmind-node")
			?.dataset.obmindNodeId;
		if (
			contentButton === null ||
			contentButton === undefined ||
			nodeId === undefined ||
			!this.nodesLayer?.contains(contentButton)
		) {
			return false;
		}

		return this.performNodeKeyboardGesture(nodeId, gesture);
	}

	destroy(): void {
		if (this.destroyed) {
			return;
		}
		this.destroyed = true;
		for (const controller of this.exportAbortControllers) {
			controller.abort();
		}
		this.exportAbortControllers.clear();
		this.finishNodeEdit(false, false);
		this.cancelNodeDrag();
		this.cancelSelectionMarquee();
		this.cancelMinimapPointer();
		this.closeNodeContextMenu();

		if (this.measurementFrame !== null) {
			this.animationWindow?.cancelAnimationFrame(this.measurementFrame);
			this.measurementFrame = null;
		}

		this.resizeObserver?.disconnect();
		this.resizeObserver = null;

		const surface = this.surface;
		if (surface !== null) {
			if (
				this.activePointer !== null &&
				surface.hasPointerCapture(this.activePointer.id)
			) {
				surface.releasePointerCapture(this.activePointer.id);
			}
			surface.removeEventListener("pointerdown", this.handlePointerDown);
			surface.removeEventListener("pointermove", this.handlePointerMove);
			surface.removeEventListener("pointerup", this.handlePointerEnd);
			surface.removeEventListener("pointercancel", this.handlePointerCancel);
			surface.removeEventListener("pointerleave", this.handlePointerLeave);
			surface.removeEventListener(
				"lostpointercapture",
				this.handleLostPointerCapture,
			);
			surface.removeEventListener("wheel", this.handleWheel);
		}
		this.nodesLayer?.removeEventListener("click", this.handleNodeClick);
		this.nodesLayer?.removeEventListener(
			"dblclick",
			this.handleNodeDoubleClick,
		);
		this.nodesLayer?.removeEventListener(
			"keydown",
			this.handleNodeKeyDown,
		);
		this.nodesLayer?.removeEventListener(
			"contextmenu",
			this.handleNodeContextMenu,
		);
		this.nodesLayer?.removeEventListener(
			"pointerover",
			this.handleNodePointerOver,
		);
		this.nodesLayer?.removeEventListener(
			"pointerout",
			this.handleNodePointerOut,
		);
		this.decorationSvg?.removeEventListener(
			"click",
			this.handleDecorationClick,
		);
		this.decorationSvg?.removeEventListener(
			"keydown",
			this.handleDecorationKeyDown,
		);
		this.minimap?.removeEventListener(
			"pointerdown",
			this.handleMinimapPointerDown,
		);
		this.minimap?.removeEventListener(
			"pointermove",
			this.handleMinimapPointerMove,
		);
		this.minimap?.removeEventListener(
			"pointerup",
			this.handleMinimapPointerEnd,
		);
		this.minimap?.removeEventListener(
			"pointercancel",
			this.handleMinimapPointerCancel,
		);
		this.minimap?.removeEventListener(
			"lostpointercapture",
			this.handleMinimapLostPointerCapture,
		);
		this.animationWindow?.removeEventListener(
			"keydown",
			this.handleRendererWindowKeyDown,
			{ capture: true },
		);
		this.animationWindow?.removeEventListener(
			"keyup",
			this.handleRendererWindowKeyUp,
			{ capture: true },
		);
		this.animationWindow?.removeEventListener(
			"pointerdown",
			this.handleWindowPointerDown,
			{ capture: true },
		);

		surface?.remove();
		this.colorProbe?.remove();
		if (this.container !== null && !this.containerAlreadyScoped) {
			this.container.classList.remove("obmind-renderer");
		}

		this.nodeElements.clear();
		this.visibleNodes.clear();
		this.branchIndexByNodeId.clear();
		this.decorationElements.clear();
		this.measuredNodes.clear();
		this.exportSceneCache.clear();
		this.activePointer = null;
		this.activeSelectionMarquee = null;
		this.activeNodeDrag = null;
		this.nodeDragGhost = null;
		this.nodeDropIndicator = null;
		this.nodeDropTargetId = null;
		this.suppressNodeActivationUntil = 0;
		this.lastViewportSize = null;
		this.layoutResult = null;
		this.renderedSceneBounds = null;
		this.sceneCulling = null;
		this.decorationDescriptors = [];
		this.minimapTransform = null;
		this.minimapRenderedLayout = null;
		this.minimapRenderedBounds = null;
		this.minimapRenderedThemeKey = null;
		this.minimapViewportElement = null;
		this.renderInput = null;
		this.fitRequested = false;
		this.container = null;
		this.surface = null;
		this.scene = null;
		this.svg = null;
		this.decorationSvg = null;
		this.nodesLayer = null;
		this.minimap = null;
		this.colorProbe = null;
		this.themeColorResolutionCache.clear();
		this.animationWindow = null;
		this.measurementRevision = null;
		this.activeNodeEdit = null;
		this.activeNodeContextMenu = null;
	}

	private renderLayout(): void {
		const input = this.renderInput;
		if (
			input === null ||
			this.nodesLayer === null ||
			this.svg === null ||
			this.scene === null
		) {
			return;
		}
		this.invalidateExportSceneCache();

		const orientation = input.presentation.layout.orientation;
		const colors = resolveMindMapThemeColors(
			input.presentation.theme,
			input.colorScheme,
		);
		const result = this.calculateLayout(input);
		this.layoutResult = result;
		const culling = this.resolveSceneCulling(result, input);
		this.sceneCulling = culling;
		this.reconcileNodes(result.nodes, input, colors, culling);
		if (
			this.activeNodeDrag !== null &&
			!this.visibleNodes.has(this.activeNodeDrag.sourceNodeId)
		) {
			this.cancelNodeDrag();
		}
		this.renderEdges(
			result,
			orientation,
			input.presentation,
			colors,
			culling,
		);
		this.renderDecorations(result, input, colors);
		this.renderMinimap();
		this.scheduleMeasurement();
	}

	private calculateLayout(input: MindMapRenderInput): LayoutResult {
		return this.calculateLayoutWithMeasurements(
			input,
			this.measuredNodes,
			input.interaction.collapsedNodeIds,
			this.layoutId,
		);
	}

	private calculateLayoutWithMeasurements(
		input: MindMapRenderInput,
		sizes: ReadonlyMap<string, NodeSize>,
		collapsedIds: ReadonlySet<string>,
		layoutId: string,
	): LayoutResult {
		const layout = input.presentation.layout;
		const layoutEngine = this.layoutEngines.resolve(layout.engineId);
		return layoutEngine.layout({
			layoutId,
			documentId: input.root.id,
			revision: layout.revision,
			engineId: layout.engineId,
			root: input.root,
			sizes,
			orientation: layout.orientation,
			collapsedIds,
			spacing: {
				primaryGap:
					layout.spacing.level ??
					DEFAULT_LAYOUT_SPACING.primaryGap,
				secondaryGap:
					layout.spacing.subtree ??
					DEFAULT_LAYOUT_SPACING.secondaryGap,
				siblingGap: layout.spacing.sibling,
				subtreeGap: layout.spacing.subtree,
			},
			options: layout.options,
		});
	}

	private reconcileNodes(
		positionedNodes: readonly PositionedNode[],
		input: MindMapRenderInput,
		colors: MindMapThemeColorTokens,
		culling: MindMapSceneCullingResult,
	): void {
		const layer = this.nodesLayer;
		if (layer === null) {
			return;
		}

		const nextIds = new Set<string>();
		const positionedById = new Map(
			positionedNodes.map((positioned) => [
				positioned.node.id,
				positioned,
			]),
		);
		const rootPosition = positionedById.get(input.root.id);
		const treeSemantics = createMindMapTreeItemSemantics(
			input.root,
			new Set(positionedById.keys()),
			input.interaction.collapsedNodeIds,
		);
		this.visibleNodes.clear();

		for (const positioned of positionedNodes) {
			const { node } = positioned;
			this.visibleNodes.set(node.id, node);
			if (!culling.mountedNodeIds.has(node.id)) {
				continue;
			}
			nextIds.add(node.id);

			let element = this.nodeElements.get(node.id);
			if (element === undefined) {
				element = this.createNodeElement(node.id);
				this.nodeElements.set(node.id, element);
				layer.append(element);
				this.resizeObserver?.observe(element);
			}

			const nodePresentation = this.updateNodeElement(
				element,
				node,
				positioned.depth,
				input,
				colors,
				treeSemantics.get(node.id) ?? {
					level: positioned.depth + 1,
					setSize: 1,
					posInSet: 1,
					expanded: node.children.length === 0 ? null : true,
				},
				resolveMindMapDisclosurePlacement(
					resolveMindMapOutgoingOrientation({
						node,
						positionedNode: positioned,
						visibleChildren: node.children
							.map((child) => positionedById.get(child.id))
							.filter(
								(child): child is PositionedNode =>
									child !== undefined,
							),
						positionedRoot: rootPosition,
						fallback: input.presentation.layout.orientation,
					}),
				).connectionSide,
			);
			this.updateNodeStrokeOverlay(
				element,
				node.id,
				positioned,
				nodePresentation,
				input.presentation,
			);
			// Keep topic elements in the normal 2-D layout tree. A 3-D transform
			// promotes every topic to its own compositing layer in Chromium. When
			// the scene is zoomed, those layers can be rasterized at a fractional
			// scale and make text look soft until a hover invalidates the layer.
			// The scene transform below still handles pan/zoom for the whole map.
			element.style.left = `${positioned.x}px`;
			element.style.top = `${positioned.y}px`;
			element.style.removeProperty("transform");
		}

		for (const [id, element] of this.nodeElements) {
			if (!nextIds.has(id)) {
				if (this.activeNodeEdit?.nodeId === id) {
					this.finishNodeEdit(false, false);
				}
				this.resizeObserver?.unobserve(element);
				element.remove();
				this.nodeElements.delete(id);
			}
		}
	}

	private resolveSceneCulling(
		result: LayoutResult,
		input: MindMapRenderInput,
	): MindMapSceneCullingResult {
		const surface = this.surface;
		const viewport = this.getViewport();
		const viewportBounds =
			surface === null || viewport === null
				? null
				: createMindMapViewportSceneBounds(
						viewport,
						surface.clientWidth,
						surface.clientHeight,
					);
		return resolveMindMapSceneCulling(
			result,
			viewportBounds,
			this.collectSceneCullingPinnedNodeIds(input),
		);
	}

	private collectSceneCullingPinnedNodeIds(
		input: MindMapRenderInput,
	): ReadonlySet<string> {
		const pinned = new Set(input.interaction.selectedNodeIds);
		const candidates = [
			input.interaction.primarySelectedNodeId,
			input.interaction.focusedNodeId,
			input.interaction.hoveredNodeId,
			this.activeNodeEdit?.nodeId ?? null,
			this.activeNodeDrag?.sourceNodeId ?? null,
			this.nodeDropTargetId,
		];
		for (const nodeId of candidates) {
			if (nodeId !== null) {
				pinned.add(nodeId);
			}
		}
		return pinned;
	}

	private refreshSceneCulling(): void {
		const input = this.renderInput;
		const result = this.layoutResult;
		if (input === null || result === null || this.destroyed) {
			return;
		}
		const culling = this.resolveSceneCulling(result, input);
		const previous = this.sceneCulling;
		this.sceneCulling = culling;
		if (
			previous === null ||
			!setsEqual(previous.mountedNodeIds, culling.mountedNodeIds) ||
			!setsEqual(previous.renderedEdgeIds, culling.renderedEdgeIds)
		) {
			const colors = resolveMindMapThemeColors(
				input.presentation.theme,
				input.colorScheme,
			);
			this.reconcileNodes(result.nodes, input, colors, culling);
		this.renderEdges(
				result,
				input.presentation.layout.orientation,
				input.presentation,
				colors,
				culling,
			);
			this.renderDecorations(result, input, colors);
		}
		this.renderMinimap();
	}

	private updateNodeInteractionClasses(
		interaction: MindMapInteractionState,
	): void {
		for (const [nodeId, element] of this.nodeElements) {
			const selected = interaction.selectedNodeIds.has(nodeId);
			element.classList.toggle(
				"obmind-node-selected",
				selected,
			);
			element.setAttribute("aria-selected", String(selected));
			element.classList.toggle(
				"obmind-node-focused",
				interaction.focusedNodeId === nodeId,
			);
			element.classList.toggle(
				"obmind-node-hovered",
				interaction.hoveredNodeId === nodeId,
			);
		}
	}

	private createNodeElement(
		id: string,
		editorLabelId?: string,
	): HTMLElement {
		const ownerDocument = this.nodesLayer?.ownerDocument;
		if (ownerDocument === undefined) {
			throw new Error(
				createObMindTranslator(DEFAULT_OBMIND_LANGUAGE).t(
					"renderer.error.not-mounted",
				),
			);
		}

		const element = createHtmlElement(ownerDocument, "div");
		element.className = "obmind-node";
		element.dataset.obmindNodeId = id;
		element.setAttribute("role", "treeitem");

		const strokeOverlay = createSvgElement(ownerDocument, "svg");
		strokeOverlay.classList.add("obmind-node-stroke-overlay");
		strokeOverlay.setAttribute("aria-hidden", "true");
		strokeOverlay.setAttribute("focusable", "false");
		strokeOverlay.setAttribute("preserveAspectRatio", "none");
		strokeOverlay.setAttribute("hidden", "");
		const strokePath = createSvgElement(ownerDocument, "path");
		strokePath.classList.add("obmind-node-stroke-path");
		strokeOverlay.append(strokePath);

		const toggleButton = createHtmlElement(ownerDocument, "button");
		toggleButton.className = "obmind-node-toggle";
		toggleButton.type = "button";
		toggleButton.dataset.obmindAction = "toggle";

		const contentButton = createHtmlElement(ownerDocument, "button");
		contentButton.className = "obmind-node-content";
		contentButton.type = "button";
		contentButton.dataset.obmindAction = "select";

		const taskCheckbox = createHtmlElement(ownerDocument, "button");
		taskCheckbox.className = "obmind-node-task-checkbox";
		taskCheckbox.type = "button";
		taskCheckbox.dataset.obmindTaskToggle = "true";
		taskCheckbox.setAttribute("role", "checkbox");
		const taskIcon = createSvgElement(ownerDocument, "svg");
		taskIcon.classList.add("obmind-node-task-icon");
		taskIcon.setAttribute(
			"viewBox",
			`0 0 ${String(MIND_MAP_TASK_CHECKMARK_VIEWBOX_SIZE)} ${String(MIND_MAP_TASK_CHECKMARK_VIEWBOX_SIZE)}`,
		);
		taskIcon.setAttribute("aria-hidden", "true");
		taskIcon.setAttribute("focusable", "false");
		const taskCheckmark = createSvgElement(ownerDocument, "path");
		taskCheckmark.classList.add("obmind-node-task-checkmark");
		taskCheckmark.setAttribute(
			"d",
			createMindMapTaskCheckmarkPathData(),
		);
		taskCheckmark.setAttribute("fill", "none");
		taskCheckmark.setAttribute("stroke", "currentColor");
		taskCheckmark.setAttribute(
			"stroke-width",
			String(MIND_MAP_TASK_CHECKMARK_STROKE_WIDTH),
		);
		taskCheckmark.setAttribute("stroke-linecap", "round");
		taskCheckmark.setAttribute("stroke-linejoin", "round");
		taskIcon.append(taskCheckmark);
		taskCheckbox.append(taskIcon);

		const assets = createHtmlElement(ownerDocument, "span");
		assets.className = "obmind-node-assets";
		assets.setAttribute("aria-hidden", "true");
		const label = createHtmlElement(ownerDocument, "span");
		label.className = "obmind-node-label";
		contentButton.append(assets, label);
		const links = createHtmlElement(ownerDocument, "span");
		links.className = "obmind-node-links";
		links.setAttribute("role", "group");

		const editorLabel = createHtmlElement(ownerDocument, "span");
		editorLabel.className =
			"obmind-node-editor-accessible-label";
		editorLabel.id =
			editorLabelId ??
			(`${this.layoutId.replaceAll(":", "-")}-editor-` +
				`${++this.editorLabelSequence}`);
		editorLabel.textContent = createObMindTranslator(
			this.renderInput?.language ?? DEFAULT_OBMIND_LANGUAGE,
		).t("renderer.editor.edit-node");

		element.append(
			strokeOverlay,
			toggleButton,
			taskCheckbox,
			contentButton,
			links,
			editorLabel,
		);
		return element;
	}

	private updateNodeElement(
		element: HTMLElement,
		node: MindMapNode,
		depth: number,
		input: MindMapRenderInput,
		colors: MindMapThemeColorTokens,
		treeSemantics: MindMapTreeItemSemantics,
		disclosureSide: MindMapDisclosureConnectionSide,
		branchIndexByNodeId: ReadonlyMap<string, number> =
			this.branchIndexByNodeId,
		resolveColor: MindMapThemeColorResolver =
			this.resolveThemeColorForContrast,
	): MindMapNodePresentation {
		const translator = createObMindTranslator(input.language);
		const isCollapsed = input.interaction.collapsedNodeIds.has(node.id);
		const isSelected = input.interaction.selectedNodeIds.has(node.id);
		const isFocused = input.interaction.focusedNodeId === node.id;
		const isHovered = input.interaction.hoveredNodeId === node.id;
		const nodePresentation = resolveNodePresentation(
			node,
			depth,
			input.presentation,
			input.colorScheme,
			branchIndexByNodeId.get(node.id),
			resolveColor,
		);
		const contentLayout = this.contentLayoutStrategy.resolve({
			kind: node.kind,
			depth,
			orientation: input.presentation.layout.orientation,
			theme: input.presentation.theme,
			nodePresentation,
		});
		const appearanceColors = resolveNodeAppearanceColors(
			nodePresentation,
			input.presentation,
			colors,
			depth === 0,
		);

		element.classList.remove(
			"obmind-node-root",
			"obmind-node-heading",
			"obmind-node-list",
			"obmind-node-collapsed",
			"obmind-node-leaf",
			"obmind-node-selected",
			"obmind-node-focused",
			"obmind-node-hovered",
			"obmind-node-has-task",
			"obmind-node-has-links",
		);
		element.classList.add(`obmind-node-${node.kind}`);
		element.classList.toggle("obmind-node-root", depth === 0);
		element.classList.toggle("obmind-node-collapsed", isCollapsed);
		element.classList.toggle("obmind-node-leaf", node.children.length === 0);
		element.classList.toggle("obmind-node-selected", isSelected);
		element.classList.toggle("obmind-node-focused", isFocused);
		element.classList.toggle("obmind-node-hovered", isHovered);
		element.classList.toggle(
			"obmind-node-has-task",
			node.kind === "list" && node.taskState !== null,
		);
		element.setAttribute("aria-level", String(treeSemantics.level));
		element.setAttribute("aria-setsize", String(treeSemantics.setSize));
		element.setAttribute("aria-posinset", String(treeSemantics.posInSet));
		element.setAttribute("aria-selected", String(isSelected));
		if (treeSemantics.expanded === null) {
			element.removeAttribute("aria-expanded");
		} else {
			element.setAttribute("aria-expanded", String(treeSemantics.expanded));
		}
		element.dataset.obmindDisclosureSide = disclosureSide;
		element.dataset.obmindNodeRole =
			nodePresentation.role ?? roleForNode(node, depth);
		setOptionalDataAttribute(
			element,
			"obmindNodeVariant",
			nodePresentation.variant,
		);
		setOptionalDataAttribute(
			element,
			"obmindNodeShape",
			nodePresentation.shape,
		);
		this.applyNodeEffects(element, node.id, input.presentation);

		const activeEdit =
			this.activeNodeEdit?.nodeId === node.id
				? this.activeNodeEdit
				: null;
		const contentButton =
			activeEdit?.contentButton ??
			element.querySelector<HTMLButtonElement>(
				".obmind-node-content",
			);
		const label =
			contentButton?.querySelector<HTMLElement>(
				".obmind-node-label",
			) ?? null;
		const assetContainer = contentButton?.querySelector<HTMLElement>(
			".obmind-node-assets",
		) ?? null;
		const taskCheckbox = element.querySelector<HTMLButtonElement>(
			".obmind-node-task-checkbox",
		);
		const toggleButton = element.querySelector<HTMLButtonElement>(
			".obmind-node-toggle",
		);
		const editorLabel = element.querySelector<HTMLElement>(
			".obmind-node-editor-accessible-label",
		);
		const links = element.querySelector<HTMLElement>(".obmind-node-links");
		applyNodeLinkControlStyles(
			element,
			nodePresentation,
			appearanceColors,
			colors,
			depth === 0,
		);

		const displayText = nodePresentation.content?.plainText ?? node.text;
		if (label !== null) {
			updateNodeLabel(label, displayText, nodePresentation);
		}
		if (links !== null) {
			const linkButtons = node.links.flatMap((link, index) => {
				if (!isLocalMindMapLinkTarget(link.target)) {
					return [];
				}
				const button = createHtmlElement(links.ownerDocument, "button");
				button.type = "button";
				button.className = "obmind-node-link";
				button.dataset.obmindNodeLinkIndex = String(index);
				button.append(createMindMapNodeLinkIcon(links.ownerDocument));
				button.title = translator.t("renderer.link.open-title", {
					label: link.label,
				});
				button.setAttribute(
					"aria-label",
					translator.t("renderer.link.open-aria", {
						label: link.label,
					}),
				);
				return [button];
			});
			const actionableLinkCount = linkButtons.length;
			links.replaceChildren(...linkButtons);
			links.hidden = actionableLinkCount === 0;
			element.classList.toggle(
				"obmind-node-has-links",
				actionableLinkCount > 0,
			);
			setCssProperty(
				element,
				"--obmind-node-link-reserve",
				actionableLinkCount > 0
					? `${String(
							actionableLinkCount * MIND_MAP_NODE_LINK_CONTROL_SIZE +
								Math.max(0, actionableLinkCount - 1) *
									MIND_MAP_NODE_LINK_CONTROL_GAP +
								MIND_MAP_NODE_LINK_LABEL_GAP,
						)}px`
					: null,
			);
			links.setAttribute(
				"aria-label",
				translator.t("renderer.link.group-aria", { node: displayText }),
			);
		}
		if (taskCheckbox !== null && taskCheckbox !== undefined) {
			const taskState =
				node.kind === "list" ? node.taskState : null;
			taskCheckbox.hidden = taskState === null;
			taskCheckbox.setAttribute(
				"aria-checked",
				taskState === "checked" ? "true" : "false",
			);
			const taskAction =
				taskState === "checked"
					? translator.t("renderer.task.mark-incomplete")
					: translator.t("renderer.task.mark-complete");
			taskCheckbox.title = taskAction;
			taskCheckbox.setAttribute(
				"aria-label",
				translator.t("renderer.task.aria", {
					action: taskAction,
					node: displayText,
				}),
			);
			taskCheckbox.disabled = activeEdit !== null || taskState === null;
		}
		if (contentButton !== null) {
			if (assetContainer !== null) {
				renderMindMapNodeAssets(
					assetContainer,
					resolveMindMapNodeAssets(this.assetRegistry, nodePresentation),
					colors,
					appearanceColors,
				);
			}
			applyNodePresentationStyles(
				contentButton,
				nodePresentation,
				appearanceColors,
			);
			applyNodeTaskControlStyles(
				element,
				nodePresentation,
				colors,
				appearanceColors,
				resolveColor,
			);
			applyNodeDisclosureStyles(
				element,
				node.id,
				nodePresentation,
				input.presentation,
				colors,
				appearanceColors,
				resolveColor,
			);
			applyNodeContentLayoutStyles(contentButton, contentLayout);
			element.setAttribute("dir", contentLayout.text.textDirection);
			contentButton.title = translator.t("renderer.topic.title");
			contentButton.setAttribute(
				"aria-label",
				translator.t("renderer.topic.aria", { node: displayText }),
			);
			contentButton.setAttribute(
				"aria-keyshortcuts",
				"F2 Space Tab Enter Control+Enter Meta+Enter",
			);
			if (this.activeNodeEdit?.nodeId === node.id) {
				copyNodeEditorStyles(
					contentButton,
					this.activeNodeEdit.input,
				);
				applyNodeContentLayoutStyles(
					this.activeNodeEdit.input,
					contentLayout,
				);
			}
		}
		if (toggleButton !== null) {
			const disclosure = createMindMapDisclosureDescription(
				node,
				input.interaction.collapsedNodeIds,
				(context) =>
					formatLocalizedMindMapDisclosureAccessibleText(
						context,
						translator,
					),
			);
			const hasChildren = disclosure !== null;
			toggleButton.hidden = !hasChildren;
			toggleButton.disabled = !hasChildren;
			toggleButton.textContent =
				disclosure?.state === "collapsed"
					? translator.formatNumber(
							disclosure.hiddenDescendantCount,
						)
					: "";
			toggleButton.title =
				disclosure?.state === "collapsed"
					? translator.t("renderer.disclosure.expand-title", {
							node: disclosure.nodeText,
							count: translator.formatNumber(
								disclosure.hiddenDescendantCount,
							),
						})
					: translator.t("renderer.disclosure.collapse-title", {
							node: disclosure?.nodeText ?? node.text,
						});
			toggleButton.setAttribute(
				"aria-label",
				disclosure?.accessibleText ??
					translator.t("renderer.disclosure.none", { node: node.text }),
			);
			toggleButton.setAttribute(
				"aria-expanded",
				String(disclosure?.expanded ?? true),
			);
			toggleButton.dataset.obmindDisclosureSide = disclosureSide;
			toggleButton.dataset.obmindHiddenCount = String(
				disclosure?.hiddenDescendantCount ?? 0,
			);
		}
		if (editorLabel !== null) {
			editorLabel.textContent = translator.t(
				"renderer.editor.edit-node-with-name",
				{ node: displayText },
			);
		}
		return nodePresentation;
	}

	private applyNodeEffects(
		element: HTMLElement,
		nodeId: string,
		presentation: MindMapPresentation,
	): void {
		clearCssPropertiesWithPrefix(element, "--obmind-effect-");
		const stroke = this.effects.resolveNodeStroke(
			presentation.theme.tokens.effects.nodeStroke,
			nodeId,
		);
		const fill = this.effects.resolveNodeFill(
			presentation.theme.tokens.effects.nodeFill,
		);
		applyCssEffect(element, "obmindNodeStrokeEffect", stroke);
		// A stroke profile may advertise a contour while the current topic shape
		// cannot render one (for example, `none` and `underline`). The overlay
		// updater owns this geometry marker because it has the final shape and
		// measured-size checks. Clearing it here also prevents an old contour
		// marker from suppressing the regular selected/focused treatment during a
		// re-render.
		setOptionalDataAttribute(element, "obmindNodeStrokeGeometry", undefined);
		applyCssEffect(element, "obmindNodeFillEffect", fill);
	}

	private updateNodeStrokeOverlay(
		element: HTMLElement,
		nodeId: string,
		positioned: PositionedNode,
		nodePresentation: MindMapNodePresentation,
		presentation: MindMapPresentation,
	): void {
		const overlay = element.querySelector<SVGSVGElement>(
			".obmind-node-stroke-overlay",
		);
		const path = overlay?.querySelector<SVGPathElement>(
			".obmind-node-stroke-path",
		);
		const effect = this.effects.resolveNodeStroke(
			presentation.theme.tokens.effects.nodeStroke,
			nodeId,
		);
		const contourShape = resolveHandDrawnNodeContourShape(
			nodePresentation.shape,
		);
		if (
			overlay === null ||
			overlay === undefined ||
			path === null ||
			path === undefined ||
			effect?.contour === null ||
			effect?.contour === undefined ||
			contourShape === null ||
			!Number.isFinite(positioned.width) ||
			!Number.isFinite(positioned.height) ||
			positioned.width <= 0 ||
			positioned.height <= 0
		) {
			overlay?.setAttribute("hidden", "");
			path?.removeAttribute("d");
			path?.removeAttribute("stroke-dasharray");
			setOptionalDataAttribute(
				element,
				"obmindNodeStrokeGeometry",
				undefined,
			);
			setCssProperty(element, "--obmind-node-stroke-render-width", null);
			setCssProperty(element, "--obmind-node-stroke-render-opacity", null);
			return;
		}

		const borderWidth =
			nodePresentation.borderWidth ?? presentation.theme.tokens.node.borderWidth;
		const strokeWidth = Math.max(
			effect.exportEffect.minimumWidth,
			borderWidth * effect.exportEffect.widthScale,
		);
		const inset = Math.max(
			effect.exportEffect.inset,
			effect.contour.roughness + strokeWidth / 2 + 0.25,
		);
		const points = createHandDrawnNodeContour({
			shape: contourShape,
			width: positioned.width,
			height: positioned.height,
			radius:
				nodePresentation.radius ?? presentation.theme.tokens.node.radius,
			inset,
			stableKey: nodeId,
			roughness: effect.contour.roughness,
			sampleSpacing: effect.contour.sampleSpacing,
			maximumPointCount: effect.contour.maximumPointCount,
		});

		overlay.setAttribute(
			"viewBox",
			`0 0 ${String(positioned.width)} ${String(positioned.height)}`,
		);
		overlay.removeAttribute("hidden");
		path.setAttribute("d", createClosedPolylinePathData(points));
		if (effect.contour.dashArray === null) {
			path.removeAttribute("stroke-dasharray");
		} else {
			path.setAttribute(
				"stroke-dasharray",
				effect.contour.dashArray.map(String).join(" "),
			);
		}
		setCssProperty(
			element,
			"--obmind-node-stroke-render-width",
			`${String(strokeWidth)}px`,
		);
		setCssProperty(
			element,
			"--obmind-node-stroke-render-opacity",
			String(effect.exportEffect.opacity),
		);
		setOptionalDataAttribute(
			element,
			"obmindNodeStrokeGeometry",
			effect.contour.kind,
		);
	}

	private renderEdges(
		result: LayoutResult,
		orientation: LayoutOrientation,
		presentation: MindMapPresentation,
		colors: MindMapThemeColorTokens,
		culling: MindMapSceneCullingResult,
	): void {
		const svg = this.svg;
		if (svg === null) {
			return;
		}

		const nodesById = new Map(
			result.nodes.map((positioned) => [positioned.node.id, positioned]),
		);
		const fragment = createDomFragment(svg.ownerDocument);

		for (const edge of result.edges) {
			if (!culling.renderedEdgeIds.has(edge.id)) {
				continue;
			}
			const from = nodesById.get(edge.fromId);
			const to = nodesById.get(edge.toId);
			if (from === undefined || to === undefined) {
				continue;
			}

			const edgePresentation = resolveEdgePresentation(
				edge,
				presentation,
				this.branchIndexByNodeId.get(edge.toId),
			);
			const routing =
				edgePresentation?.routing ??
				presentation.theme.tokens.edge.routing;
			const pathGeometry =
				edge.path === undefined
					? createFallbackLayoutPath(
							from,
							to,
							orientation,
							routing,
						)
					: presentation.layout.engineId ===
						  BILATERAL_TREE_LAYOUT_ENGINE_ID
						? applyRoutingToEnginePath(edge.path, routing)
						: edge.path;
			const connectorProfile = resolveMindMapConnectorStrokeProfile(
				presentation.formatting.connectorProfile,
				presentation.theme.tokens.edge.connectorProfile,
			);
			const lineStyle =
				edgePresentation?.lineStyle ??
				presentation.theme.tokens.edge.lineStyle;
			const useVariableWidthOutline =
				connectorProfile.kind === "taper-to-child";
			const handDrawnStrokes = this.effects.createEdgeStrokes(
				presentation.theme.tokens.effects.edgeStroke,
				sampleLayoutPath(pathGeometry),
				edge.id,
			);
			if (useVariableWidthOutline) {
				const width = resolveMindMapConnectorWidth(
					presentation,
					edgePresentation,
				);
				const widths = resolveMindMapConnectorStrokeWidths(
					width,
					connectorProfile,
				);
				const strokes =
					handDrawnStrokes ??
					[
						{
							points: pathGeometry,
							opacity: 1,
							widthScale: 1,
						},
					];
				strokes.forEach((stroke, passIndex) => {
					const outlines = createVariableWidthConnectorOutlinesForLineStyle(
						stroke.points,
						connectorProfile,
						widths.startWidth * stroke.widthScale,
						widths.endWidth * stroke.widthScale,
						lineStyle,
					);
					outlines.forEach((outline, segmentIndex) => {
						const path = createEdgeSvgPath(
							svg.ownerDocument,
							edge,
							edgePresentation,
							createLayoutPathData(outline.closedPath),
						);
						if (handDrawnStrokes !== null) {
							path.classList.add(
								passIndex === 0
									? "obmind-edge-pass-primary"
									: "obmind-edge-pass-secondary",
							);
						}
						path.dataset.obmindConnectorSegment = String(segmentIndex);
						applyVariableWidthEdgePresentationStyles(
							path,
							edgePresentation,
							presentation,
							colors,
							lineStyle,
							stroke.opacity,
						);
						fragment.append(path);
					});
				});
			} else if (handDrawnStrokes === null) {
				const path = createEdgeSvgPath(
					svg.ownerDocument,
					edge,
					edgePresentation,
					createLayoutPathData(pathGeometry),
				);
				applyEdgePresentationStyles(
					path,
					edgePresentation,
					presentation,
					colors,
				);
				fragment.append(path);
			} else {
				handDrawnStrokes.forEach((stroke, passIndex) => {
					const path = createEdgeSvgPath(
						svg.ownerDocument,
						edge,
						edgePresentation,
						createPolylinePathData(stroke.points),
					);
					path.classList.add(
						passIndex === 0
							? "obmind-edge-pass-primary"
							: "obmind-edge-pass-secondary",
					);
					applyEdgePresentationStyles(
						path,
						edgePresentation,
						presentation,
						colors,
						stroke.widthScale,
						stroke.opacity,
					);
					fragment.append(path);
				});
			}

			const markerSpec =
				presentation.theme.tokens.effects.terminalMarker;
			const markerEffect = this.effects.resolveTerminalMarker(
				markerSpec?.effect ?? null,
			);
			const shouldRenderMarker =
				markerSpec !== null &&
				markerEffect !== null &&
				(markerSpec.placement === "all-targets" ||
					to.node.children.length === 0);
			if (shouldRenderMarker) {
				const markerGeometry = calculateTerminalMarkerGeometry(
					pathGeometry,
					markerSpec.size,
				);
				const marker = createSvgElement(
					svg.ownerDocument,
					"circle",
				);
				marker.classList.add("obmind-edge-terminal");
				marker.dataset.obmindEffect = markerEffect.profileId;
				marker.dataset.obmindEdgeId = edge.id;
				marker.setAttribute(
					"cx",
					String(markerGeometry.center.x),
				);
				marker.setAttribute(
					"cy",
					String(markerGeometry.center.y),
				);
				marker.setAttribute(
					"r",
					String(markerGeometry.radius),
				);
				marker.setAttribute(
					"fill",
					resolveThemeColor(
						resolveEdgeColor(
							edgePresentation,
							presentation,
							colors,
						),
					),
				);
				marker.setAttribute("opacity", String(markerEffect.opacity));
				marker.setAttribute("focusable", "false");
				marker.setAttribute("tabindex", "-1");
				marker.setAttribute("aria-hidden", "true");
				fragment.append(marker);
			}
		}

		svg.replaceChildren(fragment);

		const { bounds } = result;
		const edgePadding = calculateEdgeRenderPadding(
			result,
			presentation,
		);
		const svgX = bounds.x - edgePadding;
		const svgY = bounds.y - edgePadding;
		const svgWidth = Math.max(1, bounds.width + edgePadding * 2);
		const svgHeight = Math.max(1, bounds.height + edgePadding * 2);
		this.renderedSceneBounds = {
			x: svgX,
			y: svgY,
			width: svgWidth,
			height: svgHeight,
		};
		svg.style.left = `${svgX}px`;
		svg.style.top = `${svgY}px`;
		svg.setAttribute("width", String(svgWidth));
		svg.setAttribute("height", String(svgHeight));
		svg.setAttribute(
			"viewBox",
			`${svgX} ${svgY} ${svgWidth} ${svgHeight}`,
		);
	}

	private renderDecorations(
		result: LayoutResult,
		input: MindMapRenderInput,
		colors: MindMapThemeColorTokens,
	): void {
		const svg = this.decorationSvg;
		if (svg === null) {
			return;
		}

		const descriptors = resolveMindMapDecorationDescriptors(result, input);
		this.decorationDescriptors = descriptors;
		this.decorationElements.clear();

		const translator = createObMindTranslator(input.language);
		const fragment = createDomFragment(svg.ownerDocument);
		for (const descriptor of descriptors) {
			const element = this.createDecorationElement(
				descriptor,
				colors,
				input.interaction.selectedDecorationId === descriptor.id,
				translator,
			);
			this.decorationElements.set(descriptor.id, element);
			fragment.append(element);
		}
		svg.replaceChildren(fragment);

		const baseBounds = this.renderedSceneBounds ?? result.bounds;
		const decorationBounds = resolveMindMapDecorationDescriptorBounds(
			descriptors,
		);
		const sceneBounds = unionMindMapLayoutBounds(baseBounds, decorationBounds);
		this.renderedSceneBounds = sceneBounds;
		svg.style.left = `${sceneBounds.x}px`;
		svg.style.top = `${sceneBounds.y}px`;
		svg.setAttribute("width", String(Math.max(1, sceneBounds.width)));
		svg.setAttribute("height", String(Math.max(1, sceneBounds.height)));
		svg.setAttribute(
			"viewBox",
			`${sceneBounds.x} ${sceneBounds.y} ${Math.max(1, sceneBounds.width)} ${Math.max(1, sceneBounds.height)}`,
		);
	}

	private createDecorationElement(
		descriptor: MindMapDecorationGeometryDescriptor,
		colors: MindMapThemeColorTokens,
		selected: boolean,
		translator: ObMindTranslator,
	): SVGGElement {
		const svg = this.decorationSvg;
		if (svg === null) {
			throw new Error(
				createObMindTranslator(DEFAULT_OBMIND_LANGUAGE).t(
					"renderer.error.not-mounted",
				),
			);
		}
		const group = createSvgElement(
			svg.ownerDocument,
			"g",
		);
		group.classList.add(
			"obmind-decoration",
			`obmind-decoration-${descriptor.kind}`,
		);
		group.dataset.obmindDecorationId = descriptor.id;
		group.dataset.obmindDecorationKind = descriptor.kind;
		group.setAttribute("role", "button");
		group.setAttribute("tabindex", "0");
		group.setAttribute("focusable", "true");
		group.setAttribute(
			"aria-label",
			this.createDecorationAccessibleLabel(descriptor, translator),
		);
		group.setAttribute("aria-pressed", String(selected));

		switch (descriptor.kind) {
			case "boundary":
				this.appendBoundaryDecoration(group, descriptor, colors);
				break;
			case "relationship":
				this.appendRelationshipDecoration(group, descriptor, colors);
				break;
			case "summary":
				this.appendSummaryDecoration(group, descriptor, colors);
				break;
			case "marker":
				this.appendMarkerDecoration(group, descriptor, colors);
				break;
		}
		this.applyDecorationSelectionStyles(group, selected);
		return group;
	}

	private createDecorationAccessibleLabel(
		descriptor: MindMapDecorationGeometryDescriptor,
		translator: ObMindTranslator,
	): string {
		const kind =
			descriptor.kind === "marker"
				? translator.t("renderer.decoration.kind.marker")
				: descriptor.kind === "boundary"
					? translator.t("renderer.decoration.kind.boundary")
					: descriptor.kind === "relationship"
						? translator.t("renderer.decoration.kind.relationship")
						: translator.t("renderer.decoration.kind.summary");
		const label =
			descriptor.kind === "summary"
				? descriptor.text
				: descriptor.kind === "marker"
					? (descriptor.label ?? descriptor.markerId)
					: (descriptor.label ?? kind);
		return translator.t("renderer.decoration.aria", { kind, label });
	}

	private appendBoundaryDecoration(
		group: SVGGElement,
		descriptor: Extract<
			MindMapDecorationGeometryDescriptor,
			{ readonly kind: "boundary" }
		>,
		colors: MindMapThemeColorTokens,
	): void {
		const hit = createSvgElement(group.ownerDocument, "rect");
		hit.classList.add("obmind-decoration-hit");
		hit.setAttribute("x", String(descriptor.bounds.x));
		hit.setAttribute("y", String(descriptor.bounds.y));
		hit.setAttribute("width", String(descriptor.bounds.width));
		hit.setAttribute("height", String(descriptor.bounds.height));
		hit.setAttribute("rx", "10");
		hit.setAttribute("fill", "transparent");
		hit.setAttribute("stroke", "transparent");
		hit.setAttribute("pointer-events", "all");
		const visible = createSvgElement(group.ownerDocument, "rect");
		visible.classList.add("obmind-decoration-outline");
		visible.dataset.obmindDecorationVisible = "true";
		visible.setAttribute("x", String(descriptor.bounds.x));
		visible.setAttribute("y", String(descriptor.bounds.y));
		visible.setAttribute("width", String(descriptor.bounds.width));
		visible.setAttribute("height", String(descriptor.bounds.height));
		visible.setAttribute("rx", "10");
		visible.setAttribute("fill", "none");
		visible.setAttribute("stroke", resolveThemeColor(colors.border));
		visible.setAttribute("stroke-dasharray", "6 4");
		visible.setAttribute("pointer-events", "none");
		group.append(hit, visible);
		if (descriptor.labelAnchor !== null && descriptor.label !== undefined) {
			group.append(
				createMindMapDecorationText(
					group.ownerDocument,
					descriptor.label,
					descriptor.labelAnchor.x,
					descriptor.labelAnchor.y + 12,
					colors,
					"start",
				),
			);
		}
	}

	private appendRelationshipDecoration(
		group: SVGGElement,
		descriptor: Extract<
			MindMapDecorationGeometryDescriptor,
			{ readonly kind: "relationship" }
		>,
		colors: MindMapThemeColorTokens,
	): void {
		const data = createQuadraticDecorationPathData(
			descriptor.start,
			descriptor.control,
			descriptor.end,
		);
		const hit = createSvgElement(group.ownerDocument, "path");
		hit.classList.add("obmind-decoration-hit");
		hit.setAttribute("d", data);
		hit.setAttribute("fill", "none");
		hit.setAttribute("stroke", "transparent");
		hit.setAttribute("stroke-width", String(MIND_MAP_DECORATION_HIT_WIDTH));
		hit.setAttribute("pointer-events", "stroke");
		const visible = createSvgElement(group.ownerDocument, "path");
		visible.classList.add("obmind-decoration-relationship-path");
		visible.dataset.obmindDecorationVisible = "true";
		visible.setAttribute("d", data);
		visible.setAttribute("fill", "none");
		visible.setAttribute("stroke", resolveThemeColor(colors.accent));
		visible.setAttribute("stroke-linecap", "round");
		visible.setAttribute("pointer-events", "none");
		group.append(hit, visible);
		if (descriptor.labelAnchor !== null && descriptor.label !== undefined) {
			group.append(
				createMindMapDecorationText(
					group.ownerDocument,
					descriptor.label,
					descriptor.labelAnchor.x,
					descriptor.labelAnchor.y - 5,
					colors,
					"center",
				),
			);
		}
	}

	private appendSummaryDecoration(
		group: SVGGElement,
		descriptor: Extract<
			MindMapDecorationGeometryDescriptor,
			{ readonly kind: "summary" }
		>,
		colors: MindMapThemeColorTokens,
	): void {
		const points = descriptor.bracket
			.map(({ x, y }) => `${x},${y}`)
			.join(" ");
		const hit = createSvgElement(group.ownerDocument, "polyline");
		hit.classList.add("obmind-decoration-hit");
		hit.setAttribute("points", points);
		hit.setAttribute("fill", "none");
		hit.setAttribute("stroke", "transparent");
		hit.setAttribute("stroke-width", String(MIND_MAP_DECORATION_HIT_WIDTH));
		hit.setAttribute("pointer-events", "stroke");
		const visible = createSvgElement(group.ownerDocument, "polyline");
		visible.classList.add("obmind-decoration-summary-bracket");
		visible.dataset.obmindDecorationVisible = "true";
		visible.setAttribute("points", points);
		visible.setAttribute("fill", "none");
		visible.setAttribute("stroke", resolveThemeColor(colors.accent));
		visible.setAttribute("stroke-linecap", "round");
		visible.setAttribute("stroke-linejoin", "round");
		visible.setAttribute("pointer-events", "none");
		group.append(hit, visible);
		group.append(
			createMindMapDecorationText(
				group.ownerDocument,
				descriptor.text,
				descriptor.textAnchor.x,
				descriptor.textAnchor.y,
				colors,
				descriptor.textAlignment,
			),
		);
	}

	private appendMarkerDecoration(
		group: SVGGElement,
		descriptor: Extract<
			MindMapDecorationGeometryDescriptor,
			{ readonly kind: "marker" }
		>,
		colors: MindMapThemeColorTokens,
	): void {
		const originX = descriptor.anchor.x + 4;
		const originY = descriptor.anchor.y - MIND_MAP_DECORATION_MARKER_SIZE - 4;
		const hit = createSvgElement(group.ownerDocument, "rect");
		hit.classList.add("obmind-decoration-hit");
		hit.setAttribute("x", String(originX - 3));
		hit.setAttribute("y", String(originY - 3));
		hit.setAttribute("width", String(MIND_MAP_DECORATION_MARKER_SIZE + 6));
		hit.setAttribute("height", String(MIND_MAP_DECORATION_MARKER_SIZE + 6));
		hit.setAttribute("rx", "4");
		hit.setAttribute("fill", "transparent");
		hit.setAttribute("stroke", "transparent");
		hit.setAttribute("pointer-events", "all");
		const highlight = createSvgElement(group.ownerDocument, "rect");
		highlight.classList.add("obmind-decoration-marker-highlight");
		highlight.dataset.obmindDecorationVisible = "true";
		highlight.setAttribute("x", String(originX - 2));
		highlight.setAttribute("y", String(originY - 2));
		highlight.setAttribute("width", String(MIND_MAP_DECORATION_MARKER_SIZE + 4));
		highlight.setAttribute("height", String(MIND_MAP_DECORATION_MARKER_SIZE + 4));
		highlight.setAttribute("rx", "4");
		highlight.setAttribute("fill", "none");
		highlight.setAttribute("stroke", resolveThemeColor(colors.accent));
		highlight.setAttribute("stroke-opacity", "0");
		highlight.setAttribute("pointer-events", "none");
		group.append(hit, highlight);

		const asset = resolveMindMapDecorationMarkerAsset(
			this.assetRegistry,
			descriptor.markerId,
		);
		if (asset === null) {
			const fallback = createSvgElement(group.ownerDocument, "circle");
			fallback.dataset.obmindDecorationVisible = "true";
			fallback.setAttribute("cx", String(originX + 9));
			fallback.setAttribute("cy", String(originY + 9));
			fallback.setAttribute("r", "7");
			fallback.setAttribute("fill", resolveThemeColor(colors.surfaceEmphasis));
			fallback.setAttribute("stroke", resolveThemeColor(colors.accent));
			fallback.setAttribute("pointer-events", "none");
			group.append(fallback);
		} else {
			const scale =
				MIND_MAP_DECORATION_MARKER_SIZE /
				Math.max(asset.viewBox.width, asset.viewBox.height);
			const assetGroup = createSvgElement(group.ownerDocument, "g");
			assetGroup.setAttribute(
				"transform",
				`translate(${originX} ${originY}) scale(${scale})`,
			);
			assetGroup.setAttribute("pointer-events", "none");
			const appearance: ResolvedNodeAppearanceColors = {
				fill: colors.surface,
				stroke: colors.border,
				textColor: colors.text,
				branchColor: colors.accent,
			};
			for (const primitive of asset.primitives) {
				assetGroup.append(
					createMindMapAssetPrimitiveElement(
						group.ownerDocument,
						primitive,
						colors,
						appearance,
					),
				);
			}
			if (asset.labelContent !== null && descriptor.label !== undefined) {
				const label = createSvgElement(group.ownerDocument, "text");
				label.setAttribute("x", String(asset.viewBox.width / 2));
				label.setAttribute("y", String(asset.viewBox.height / 2 + 2.5));
				label.setAttribute("text-anchor", "middle");
				label.setAttribute(
					"font-size",
					String(
						Math.max(
							4,
							Math.min(7, 42 / Math.max(1, descriptor.label.length)),
						),
					),
				);
				label.setAttribute("fill", resolveThemeColor(colors.text));
				label.setAttribute("aria-hidden", "true");
				label.textContent = descriptor.label.slice(
					0,
					asset.labelContent.maximumLength,
				);
				assetGroup.append(label);
			}
			group.append(assetGroup);
		}
		if (descriptor.label !== undefined && asset?.labelContent === null) {
			group.append(
				createMindMapDecorationText(
					group.ownerDocument,
					descriptor.label,
					originX + MIND_MAP_DECORATION_MARKER_SIZE + 4,
					originY + 13,
					colors,
					"start",
				),
			);
		}
	}

	private applyDecorationSelectionStyles(
		group: SVGGElement,
		selected: boolean,
	): void {
		group.classList.toggle("obmind-decoration-selected", selected);
		group.setAttribute("aria-pressed", String(selected));
		for (const visible of Array.from(
			group.querySelectorAll<SVGElement>(
				"[data-obmind-decoration-visible]",
			),
		)) {
			visible.setAttribute("stroke-width", selected ? "3" : "1.5");
			if (visible.classList.contains("obmind-decoration-marker-highlight")) {
				visible.setAttribute("stroke-opacity", selected ? "1" : "0");
			}
		}
	}

	private updateDecorationInteractionClasses(
		selectedDecorationId: string | null,
	): void {
		for (const [decorationId, element] of this.decorationElements) {
			this.applyDecorationSelectionStyles(
				element,
				decorationId === selectedDecorationId,
			);
		}
	}

	private renderMinimap(): void {
		const minimap = this.minimap;
		const input = this.renderInput;
		const result = this.layoutResult;
		const surface = this.surface;
		if (
			minimap === null ||
			input === null ||
			result === null ||
			surface === null ||
			!input.interaction.minimapVisible
		) {
			this.cancelMinimapPointer();
			this.minimapTransform = null;
			minimap?.setAttribute("hidden", "");
			return;
		}
		const sceneBounds = this.renderedSceneBounds ?? result.bounds;
		const transform = createMindMapMinimapTransform(
			sceneBounds,
			{
				width: MIND_MAP_MINIMAP_WIDTH,
				height: MIND_MAP_MINIMAP_HEIGHT,
			},
			MIND_MAP_MINIMAP_PADDING,
		);
		if (transform === null) {
			this.cancelMinimapPointer();
			this.minimapTransform = null;
			this.minimapRenderedLayout = null;
			this.minimapRenderedBounds = null;
			this.minimapRenderedThemeKey = null;
			this.minimapViewportElement = null;
			minimap.setAttribute("hidden", "");
			return;
		}
		this.minimapTransform = transform;
		minimap.removeAttribute("hidden");
		minimap.setAttribute(
			"viewBox",
			`0 0 ${MIND_MAP_MINIMAP_WIDTH} ${MIND_MAP_MINIMAP_HEIGHT}`,
		);
		const scene = mindMapSceneBoundsToMinimap(sceneBounds, transform);
		const colors = resolveMindMapThemeColors(
			input.presentation.theme,
			input.colorScheme,
		);
		const themeKey = `${String(input.presentation.theme.revision)}:${input.colorScheme}`;
		if (
			this.minimapRenderedLayout !== result ||
			!layoutBoundsEqual(this.minimapRenderedBounds, sceneBounds) ||
			this.minimapRenderedThemeKey !== themeKey
		) {
			this.rebuildMinimapScene(
				minimap,
				result,
				input.root.id,
				scene,
				transform,
				colors,
			);
			this.minimapRenderedLayout = result;
			this.minimapRenderedBounds = { ...sceneBounds };
			this.minimapRenderedThemeKey = themeKey;
		}
		const viewport = this.getViewport();
		const viewportBounds =
			viewport === null
				? null
				: createMindMapViewportSceneBounds(
						viewport,
						surface.clientWidth,
						surface.clientHeight,
					);
		if (viewportBounds !== null) {
			const viewportRect = mindMapSceneBoundsToMinimap(
				viewportBounds,
				transform,
			);
			const outline = this.minimapViewportElement;
			if (outline !== null) {
				outline.removeAttribute("hidden");
				outline.setAttribute("x", String(viewportRect.x));
				outline.setAttribute("y", String(viewportRect.y));
				outline.setAttribute(
					"width",
					String(Math.max(1, viewportRect.width)),
				);
				outline.setAttribute(
					"height",
					String(Math.max(1, viewportRect.height)),
				);
			}
		} else {
			this.minimapViewportElement?.setAttribute("hidden", "");
		}
	}

	private rebuildMinimapScene(
		minimap: SVGSVGElement,
		result: LayoutResult,
		rootNodeId: string,
		scene: LayoutBounds,
		transform: MindMapMinimapTransform,
		colors: MindMapThemeColorTokens,
	): void {
		const fragment = createDomFragment(minimap.ownerDocument);
		const background = createSvgElement(minimap.ownerDocument, "rect");
		background.setAttribute("x", "0");
		background.setAttribute("y", "0");
		background.setAttribute("width", String(MIND_MAP_MINIMAP_WIDTH));
		background.setAttribute("height", String(MIND_MAP_MINIMAP_HEIGHT));
		background.setAttribute("fill", "transparent");
		background.setAttribute("pointer-events", "all");

		const sceneRect = createSvgElement(minimap.ownerDocument, "rect");
		sceneRect.classList.add("obmind-minimap-scene");
		sceneRect.setAttribute("x", String(scene.x));
		sceneRect.setAttribute("y", String(scene.y));
		sceneRect.setAttribute("width", String(scene.width));
		sceneRect.setAttribute("height", String(scene.height));
		sceneRect.setAttribute("rx", "2");
		sceneRect.setAttribute("fill", resolveThemeColor(colors.canvas));
		sceneRect.setAttribute("stroke", resolveThemeColor(colors.border));
		sceneRect.setAttribute("pointer-events", "none");

		const projection = projectMindMapLayoutToMinimap(result, transform);
		const mapGroup = createSvgElement(minimap.ownerDocument, "g");
		mapGroup.classList.add("obmind-minimap-map");
		mapGroup.setAttribute("aria-hidden", "true");
		mapGroup.dataset.obmindMinimapNodeCount = String(projection.nodes.length);
		mapGroup.dataset.obmindMinimapEdgeCount = String(projection.edges.length);

		if (projection.edges.length > 0) {
			const edges = createSvgElement(minimap.ownerDocument, "path");
			edges.classList.add("obmind-minimap-edges");
			edges.setAttribute(
				"d",
				projection.edges
					.map((edge) => createLayoutPathData(edge.path))
					.join(" "),
			);
			edges.setAttribute("fill", "none");
			edges.setAttribute("stroke", resolveThemeColor(colors.edge));
			edges.setAttribute("stroke-width", "0.8");
			edges.setAttribute("stroke-opacity", "0.72");
			edges.setAttribute("stroke-linecap", "round");
			edges.setAttribute("stroke-linejoin", "round");
			edges.setAttribute("pointer-events", "none");
			mapGroup.append(edges);
		}

		const regularNodes = projection.nodes.filter(
			(node) => node.nodeId !== rootNodeId,
		);
		if (regularNodes.length > 0) {
			const nodes = createSvgElement(minimap.ownerDocument, "path");
			nodes.classList.add("obmind-minimap-nodes");
			nodes.setAttribute("d", createMinimapNodePathData(regularNodes));
			nodes.setAttribute("fill", resolveThemeColor(colors.textMuted));
			nodes.setAttribute("fill-opacity", "0.88");
			nodes.setAttribute("pointer-events", "none");
			mapGroup.append(nodes);
		}

		const rootNodes = projection.nodes.filter(
			(node) => node.nodeId === rootNodeId,
		);
		if (rootNodes.length > 0) {
			const roots = createSvgElement(minimap.ownerDocument, "path");
			roots.classList.add("obmind-minimap-root-nodes");
			roots.setAttribute("d", createMinimapNodePathData(rootNodes));
			roots.setAttribute("fill", resolveThemeColor(colors.accent));
			roots.setAttribute("pointer-events", "none");
			mapGroup.append(roots);
		}

		const viewport = createSvgElement(minimap.ownerDocument, "rect");
		viewport.classList.add("obmind-minimap-viewport");
		viewport.setAttribute("fill", resolveThemeColor(colors.accent));
		viewport.setAttribute("fill-opacity", "0.06");
		viewport.setAttribute("stroke", resolveThemeColor(colors.accent));
		viewport.setAttribute("stroke-width", "1.5");
		viewport.setAttribute("pointer-events", "none");
		viewport.setAttribute("hidden", "");

		fragment.append(background, sceneRect, mapGroup, viewport);
		minimap.replaceChildren(fragment);
		this.minimapViewportElement = viewport;
	}

	private scheduleMeasurement(): void {
		if (this.measurementFrame !== null || this.destroyed) {
			return;
		}

		const animationWindow = this.animationWindow;
		if (animationWindow === null) {
			return;
		}

		this.measurementFrame = animationWindow.requestAnimationFrame(() => {
			this.measurementFrame = null;
			this.measureAndRefineLayout();
		});
	}

	private measureAndRefineLayout(): void {
		const input = this.renderInput;
		if (
			input === null ||
			this.nodesLayer === null ||
			this.svg === null ||
			this.destroyed
		) {
			return;
		}

		let measurementsChanged = false;
		for (const [id, element] of this.nodeElements) {
			const width = element.offsetWidth;
			const height = element.offsetHeight;
			if (width <= 0 || height <= 0) {
				continue;
			}

			const previous = this.measuredNodes.get(id);
			if (
				previous === undefined ||
				Math.abs(previous.width - width) > MEASUREMENT_EPSILON ||
				Math.abs(previous.height - height) > MEASUREMENT_EPSILON
			) {
				this.measuredNodes.set(id, { width, height });
				measurementsChanged = true;
			}
		}

		if (measurementsChanged) {
			const orientation =
				input.presentation.layout.orientation;
			const colors = resolveMindMapThemeColors(
				input.presentation.theme,
				input.colorScheme,
			);
			let refined: LayoutResult;
			try {
				refined = this.calculateLayout(input);
			} catch (error: unknown) {
				this.callbacks.renderError?.(toError(error, input.language));
				return;
			}
			this.layoutResult = refined;
			this.invalidateExportSceneCache();
			const culling = this.resolveSceneCulling(refined, input);
			this.sceneCulling = culling;
			this.reconcileNodes(refined.nodes, input, colors, culling);
			this.renderEdges(
				refined,
				orientation,
				input.presentation,
				colors,
				culling,
			);
			this.renderDecorations(refined, input, colors);
		}
		this.renderMinimap();

		if (this.fitRequested && this.applyFitTransform()) {
			this.fitRequested = false;
		}
	}

	private applyFitTransform(): boolean {
		const surface = this.surface;
		const result = this.layoutResult;
		if (surface === null || result === null) {
			return false;
		}

		const viewportWidth = surface.clientWidth;
		const viewportHeight = surface.clientHeight;
		if (viewportWidth <= 0 || viewportHeight <= 0) {
			return false;
		}

		const bounds = this.renderedSceneBounds ?? result.bounds;
		const availableWidth = Math.max(1, viewportWidth - FIT_PADDING * 2);
		const availableHeight = Math.max(1, viewportHeight - FIT_PADDING * 2);
		const scale = clamp(
			Math.min(
				availableWidth / Math.max(1, bounds.width),
				availableHeight / Math.max(1, bounds.height),
				1,
			),
			MIN_SCALE,
			MAX_SCALE,
		);

		this.transform = {
			x: viewportWidth / 2 - (bounds.x + bounds.width / 2) * scale,
			y: viewportHeight / 2 - (bounds.y + bounds.height / 2) * scale,
			scale,
		};
		this.applyTransform();
		this.notifyViewportChanged("fit");
		return true;
	}

	private applyTransform(): void {
		if (this.scene === null) {
			return;
		}
		const { x, y, scale } = this.transform;
		// Use a 2-D transform and do not keep the scene in a permanent
		// `will-change: transform` layer. Persistent 3-D promotion is a common
		// source of blurry DOM text in Chromium/Electron; the compositor can
		// still optimize this transform while panning or zooming.
		this.scene.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
		this.refreshSceneCulling();
	}

	private readonly resolveThemeColorForContrast: MindMapThemeColorResolver = (
		color,
	) => {
		const cacheKey =
			color.kind === "host"
				? `host:${color.token}`
				: `literal:${color.value}`;
		if (this.themeColorResolutionCache.has(cacheKey)) {
			return this.themeColorResolutionCache.get(cacheKey) ?? null;
		}

		const direct =
			color.kind === "literal"
				? parseMindMapCssColor(color.value)
				: null;
		const probe = this.colorProbe;
		const animationWindow = this.animationWindow;
		if (probe === null || animationWindow === null) {
			this.themeColorResolutionCache.set(cacheKey, direct);
			return direct;
		}

		const computedProbe = animationWindow.getComputedStyle(probe);
		const variableValue =
			color.kind === "host"
				? computedProbe.getPropertyValue(`--${color.token}`).trim()
				: null;
		if (color.kind === "host" && variableValue?.length === 0) {
			this.themeColorResolutionCache.set(cacheKey, null);
			return null;
		}

		probe.style.removeProperty("color");
		probe.style.setProperty(
			"color",
			variableValue ?? resolveThemeColor(color),
		);
		const acceptedColor = probe.style.getPropertyValue("color");
		let resolved =
			acceptedColor.length === 0
				? null
				: parseMindMapCssColor(
						animationWindow.getComputedStyle(probe).color,
					);
		resolved ??=
			variableValue === null
				? null
				: parseMindMapCssColor(variableValue);
		resolved ??= direct;
		this.themeColorResolutionCache.set(cacheKey, resolved);
		return resolved;
	};

	private applyPresentationToContainer(
		presentation: MindMapPresentation,
		colors: MindMapThemeColorTokens,
	): void {
		const container = this.container;
		if (container === null) {
			return;
		}

		container.dataset.obmindThemeId = presentation.theme.id;
		container.dataset.obmindThemeRevision = String(
			presentation.theme.revision,
		);
		container.dataset.obmindLayoutEngine = presentation.layout.engineId;
		container.dataset.obmindLayoutOrientation =
			presentation.layout.orientation;
		clearCssPropertiesWithPrefix(container, "--obmind-effect-");
		applyCssEffect(
			container,
			"obmindCanvasEffect",
			this.effects.resolveCanvasTexture(
				presentation.theme.tokens.effects.canvasTexture,
				`style:${presentation.theme.styleId}`,
			),
		);

		const { typography, node } = presentation.theme.tokens;
		setCssProperty(
			container,
			"--obmind-theme-canvas",
			resolveThemeColor(colors.canvas),
		);
		setCssProperty(
			container,
			"--obmind-theme-surface",
			resolveThemeColor(colors.surface),
		);
		setCssProperty(
			container,
			"--obmind-theme-surface-emphasis",
			resolveThemeColor(colors.surfaceEmphasis),
		);
		setCssProperty(
			container,
			"--obmind-theme-surface-hover",
			resolveThemeColor(colors.surfaceHover),
		);
		setCssProperty(
			container,
			"--obmind-theme-text",
			resolveThemeColor(colors.text),
		);
		setCssProperty(
			container,
			"--obmind-theme-text-on-accent",
			resolveThemeColor(colors.textOnAccent),
		);
		setCssProperty(
			container,
			"--obmind-theme-text-muted",
			resolveThemeColor(colors.textMuted),
		);
		setCssProperty(
			container,
			"--obmind-theme-border",
			resolveThemeColor(colors.border),
		);
		setCssProperty(
			container,
			"--obmind-theme-border-hover",
			resolveThemeColor(colors.borderHover),
		);
		setCssProperty(
			container,
			"--obmind-theme-accent",
			resolveThemeColor(colors.accent),
		);
		setCssProperty(
			container,
			"--obmind-theme-edge",
			resolveThemeColor(colors.edge),
		);
		setCssProperty(
			container,
			"--obmind-theme-selection",
			resolveThemeColor(colors.selection),
		);
		setCssProperty(
			container,
			"--obmind-theme-font-family",
			`var(--${
				presentation.formatting.fontFamily.fontFamilyToken ??
				typography.fontFamilyToken
			})`,
		);
		setCssProperty(
			container,
			"--obmind-theme-font-size",
			`${typography.fontSize}px`,
		);
		setCssProperty(
			container,
			"--obmind-theme-root-font-size",
			`${typography.rootFontSize}px`,
		);
		setCssProperty(
			container,
			"--obmind-theme-font-weight",
			String(typography.fontWeight),
		);
		setCssProperty(
			container,
			"--obmind-theme-root-font-weight",
			String(typography.rootFontWeight),
		);
		setCssProperty(
			container,
			"--obmind-theme-line-height",
			String(typography.lineHeight),
		);
		setCssProperty(
			container,
			"--obmind-theme-node-max-width",
			`${node.maxWidth}px`,
		);
		setCssProperty(
			container,
			"--obmind-theme-node-min-height",
			`${node.minHeight}px`,
		);
		setCssProperty(
			container,
			"--obmind-theme-node-padding-inline",
			`${node.paddingInline}px`,
		);
		setCssProperty(
			container,
			"--obmind-theme-node-padding-block",
			`${node.paddingBlock}px`,
		);
		setCssProperty(
			container,
			"--obmind-theme-node-border-width",
			`${node.borderWidth}px`,
		);
		setCssProperty(
			container,
			"--obmind-theme-node-radius",
			`${node.radius}px`,
		);
		setCssProperty(
			container,
			"--obmind-theme-edge-width",
			`${resolveMindMapConnectorWidth(presentation)}px`,
		);
	}

	private readonly handleNodeClick = (event: MouseEvent): void => {
		if (Date.now() < this.suppressNodeActivationUntil) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		const target = event.target;
		if (!isElement(target)) {
			return;
		}
		const linkButton = target.closest<HTMLButtonElement>(
			"button[data-obmind-node-link-index]",
		);
		if (linkButton !== null && this.nodesLayer?.contains(linkButton)) {
			const nodeId = linkButton.closest<HTMLElement>(".obmind-node")
				?.dataset.obmindNodeId;
			const linkIndex = Number(linkButton.dataset.obmindNodeLinkIndex);
			if (
				nodeId !== undefined &&
				Number.isSafeInteger(linkIndex) &&
				linkIndex >= 0 &&
				this.visibleNodes.get(nodeId)?.links[linkIndex] !== undefined
			) {
				event.preventDefault();
				event.stopPropagation();
				this.callbacks.interaction({
					type: "node-link-activate",
					nodeId,
					linkIndex,
				});
			}
			return;
		}
		const taskCheckbox = target.closest<HTMLElement>(
			"[data-obmind-task-toggle]",
		);
		if (
			taskCheckbox !== null &&
			this.nodesLayer?.contains(taskCheckbox)
		) {
			const nodeId = taskCheckbox.closest<HTMLElement>(".obmind-node")
				?.dataset.obmindNodeId;
			const node =
				nodeId === undefined
					? undefined
					: this.visibleNodes.get(nodeId);
			const sourceRevision = this.renderInput?.sourceRevision;
			if (
				node?.kind === "list" &&
				node.taskState !== null &&
				sourceRevision !== undefined
			) {
				event.preventDefault();
				event.stopPropagation();
				this.callbacks.interaction({
					type: "node-task-toggle",
					nodeId: node.id,
					sourceSnapshot: createMindMapNodeEditSnapshot(
						node,
						sourceRevision,
					),
				});
			}
			return;
		}

		const button = target.closest<HTMLButtonElement>(
			"button[data-obmind-action]",
		);
		if (button === null || !this.nodesLayer?.contains(button)) {
			return;
		}

		const nodeElement = button.closest<HTMLElement>(".obmind-node");
		const id = nodeElement?.dataset.obmindNodeId;
		const node = id === undefined ? undefined : this.visibleNodes.get(id);
		if (node === undefined) {
			return;
		}
		this.spaceGestureOwner = "node";

		if (button.dataset.obmindAction === "toggle") {
			this.callbacks.interaction({
				type: "node-toggle",
				nodeId: node.id,
			});
		} else if (button.dataset.obmindAction === "select") {
			event.preventDefault();
			event.stopPropagation();
			const intent = resolveMindMapNodeClickIntent({
				alreadySelected:
					this.renderInput?.interaction.selectedNodeIds.has(
						node.id,
					) ?? false,
				altKey: event.altKey,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
				shiftKey: event.shiftKey,
			});
			if (intent === "edit") {
				this.beginNodeEdit(node.id);
			} else if (intent === "open-source") {
				this.activateNode(node.id);
			} else {
				this.selectAndFocusNode(
					node.id,
					event.shiftKey
						? "range"
						: event.ctrlKey || event.metaKey
							? "toggle"
							: "replace",
				);
			}
		}
	};

	private readonly handleNodeDoubleClick = (event: MouseEvent): void => {
		if (Date.now() < this.suppressNodeActivationUntil) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		const target = event.target;
		if (!isElement(target)) {
			return;
		}
		if (target.closest("[data-obmind-task-toggle]") !== null) {
			return;
		}
		if (target.closest("[data-obmind-node-link-index]") !== null) {
			return;
		}

		const contentButton = target.closest<HTMLButtonElement>(
			'button[data-obmind-action="select"]',
		);
		const nodeId = contentButton?.closest<HTMLElement>(".obmind-node")
			?.dataset.obmindNodeId;
		if (
			contentButton === null ||
			contentButton === undefined ||
			nodeId === undefined ||
			!this.nodesLayer?.contains(contentButton) ||
			!this.visibleNodes.has(nodeId)
		) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		this.selectAndFocusNode(nodeId);
		this.beginNodeEdit(nodeId);
	};

	private readonly handleNodeContextMenu = (event: MouseEvent): void => {
		const target = event.target;
		if (!isElement(target)) {
			return;
		}
		const nodeElement = target.closest<HTMLElement>(".obmind-node");
		const nodeId = nodeElement?.dataset.obmindNodeId;
		const node =
			nodeId === undefined ? undefined : this.visibleNodes.get(nodeId);
		const surface = this.surface;
		const input = this.renderInput;
		if (
			node === undefined ||
			surface === null ||
			input === null ||
			!this.nodesLayer?.contains(nodeElement ?? null)
		) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		const alreadySelected =
			input.interaction.selectedNodeIds.has(node.id);
		const nodeIds = alreadySelected
			? [...input.interaction.selectedNodeIds]
			: [node.id];
		if (!alreadySelected) {
			this.selectAndFocusNode(node.id);
		}
		this.openNodeContextMenu(
			node,
			nodeIds,
			event.clientX,
			event.clientY,
		);
	};

	private openNodeContextMenu(
		node: MindMapNode,
		nodeIds: readonly string[],
		clientX: number,
		clientY: number,
	): void {
		const surface = this.surface;
		if (surface === null) {
			return;
		}
		const translator = createObMindTranslator(
			this.renderInput?.language ?? DEFAULT_OBMIND_LANGUAGE,
		);
		this.closeNodeContextMenu();
		const menu = createHtmlElement(surface.ownerDocument, "div");
		menu.className =
			"obmind-node-context-menu obmind-floating-panel";
		menu.setAttribute("role", "menu");
		menu.setAttribute(
			"aria-label",
			translator.t("renderer.context-menu.aria", { node: node.text }),
		);
		const items: readonly NodeContextMenuItemDescriptor[] = [
			{
				label: translator.t("renderer.context-menu.edit-topic"),
				group: "edit",
				action: "edit",
			},
			{
				label: translator.t("renderer.context-menu.add-child"),
				group: "structure",
				action: "create-child",
			},
			{
				label: translator.t("renderer.context-menu.add-sibling"),
				group: "structure",
				action: "create-sibling",
				disabled: node.kind === "root",
			},
			{
				label: translator.t("renderer.context-menu.insert-parent"),
				group: "structure",
				command: "create-parent",
				disabled: node.kind === "root",
				disabledReason:
					node.kind === "root"
							? translator.t("renderer.context-menu.root-no-parent")
							: undefined,
			},
			{
				label: translator.t("renderer.context-menu.outdent"),
				group: "structure",
				command: "outdent",
				disabled: !this.canOutdentNode(node.id),
				disabledReason: !this.canOutdentNode(node.id)
						? translator.t("renderer.context-menu.outermost")
						: undefined,
			},
			{
				label: translator.t("renderer.context-menu.copy-branch"),
				group: "clipboard",
				command: "copy",
				disabled: node.kind === "root",
				disabledReason:
					node.kind === "root"
							? translator.t("renderer.context-menu.root-no-copy")
							: undefined,
			},
			{
				label: translator.t("renderer.context-menu.cut-branch"),
				group: "clipboard",
				command: "cut",
				disabled: node.kind === "root",
			},
			{
				label: translator.t("renderer.context-menu.paste-child"),
				group: "clipboard",
				command: "paste-child",
				disabled:
					!this.renderInput?.topicCommandAvailability
						.hasInternalClipboard,
				disabledReason:
					this.renderInput?.topicCommandAvailability
						.disabledReasons?.["paste-child"],
			},
			{
				label: translator.t("renderer.context-menu.paste-sibling"),
				group: "clipboard",
				command: "paste-sibling",
				disabled:
					node.kind === "root" ||
					!this.renderInput?.topicCommandAvailability
						.hasInternalClipboard,
				disabledReason:
					node.kind === "root"
							? translator.t("renderer.context-menu.root-no-sibling")
							: this.renderInput?.topicCommandAvailability
									.disabledReasons?.["paste-sibling"],
			},
			{
				label: translator.t("renderer.context-menu.delete-branch"),
				group: "danger",
				command: "delete-branch",
				tone: "danger",
				disabled: node.kind === "root",
			},
			{
				label: translator.t("renderer.context-menu.delete-topic-only"),
				group: "danger",
				command: "delete-single",
				tone: "danger",
				disabled: node.kind === "root",
			},
			{
				label: translator.t("renderer.context-menu.open-source"),
				group: "source",
				action: "source",
			},
		];
		let previousGroup: NodeContextMenuGroup | null = null;
		for (const item of items) {
			if (previousGroup !== null && previousGroup !== item.group) {
				const separator = createHtmlElement(
					surface.ownerDocument,
					"div",
				);
				separator.className =
					"obmind-node-context-menu-separator";
				separator.setAttribute("role", "separator");
				menu.append(separator);
			}
			previousGroup = item.group;
			const button = createHtmlElement(
				surface.ownerDocument,
				"button",
			);
			button.type = "button";
			button.className = "obmind-node-context-menu-item";
			button.setAttribute("role", "menuitem");
			button.dataset.obmindContextGroup = item.group;
			if (item.tone !== undefined) {
				button.dataset.obmindContextTone = item.tone;
			}
			button.disabled = item.disabled === true;
			if (item.disabledReason !== undefined) {
				button.title = item.disabledReason;
				button.setAttribute("aria-description", item.disabledReason);
			}
			if (item.action !== undefined) {
				button.dataset.obmindContextAction = item.action;
			}
			if (item.command !== undefined) {
				button.dataset.obmindTopicCommand = item.command;
			}
			const label = createHtmlElement(
				surface.ownerDocument,
				"span",
			);
			label.className = "obmind-node-context-menu-label";
			label.textContent = item.label;
			button.append(label);
			menu.append(button);
		}
		menu.addEventListener("pointerdown", this.handleContextMenuPointerDown);
		menu.addEventListener("click", this.handleContextMenuClick);
		surface.append(menu);
		const rect = surface.getBoundingClientRect();
		const left = Math.max(
			8,
			Math.min(
				clientX - rect.left,
				surface.clientWidth - menu.offsetWidth - 8,
			),
		);
		const top = Math.max(
			8,
			Math.min(
				clientY - rect.top,
				surface.clientHeight - menu.offsetHeight - 8,
			),
		);
		menu.style.left = `${left}px`;
		menu.style.top = `${top}px`;
		this.activeNodeContextMenu = {
			element: menu,
			nodeIds: [...nodeIds],
			primaryNodeId: node.id,
		};
		menu
			.querySelector<HTMLButtonElement>("button:not(:disabled)")
			?.focus({ preventScroll: true });
	}

	private canOutdentNode(nodeId: string): boolean {
		const root = this.renderInput?.root;
		if (root === undefined || root.id === nodeId) {
			return false;
		}

		const pending: Array<{
			readonly node: MindMapNode;
			readonly parent: MindMapNode | null;
		}> = [{ node: root, parent: null }];
		while (pending.length > 0) {
			const entry = pending.pop();
			if (entry === undefined) {
				continue;
			}
			if (entry.node.id === nodeId) {
				return entry.parent !== null && entry.parent.kind !== "root";
			}
			for (const child of entry.node.children) {
				pending.push({ node: child, parent: entry.node });
			}
		}
		return false;
	}

	private readonly handleContextMenuPointerDown = (
		event: PointerEvent,
	): void => {
		event.stopPropagation();
	};

	private readonly handleContextMenuClick = (event: MouseEvent): void => {
		const active = this.activeNodeContextMenu;
		const target = event.target;
		if (active === null || !isElement(target)) {
			return;
		}
		const button = target.closest<HTMLButtonElement>(
			".obmind-node-context-menu-item",
		);
		if (
			button === null ||
			button.disabled ||
			!active.element.contains(button)
		) {
			return;
		}
		const node = this.visibleNodes.get(active.primaryNodeId);
		const sourceRevision = this.renderInput?.sourceRevision;
		const action = button.dataset.obmindContextAction;
		const command = button.dataset
			.obmindTopicCommand as MindMapTopicCommand | undefined;
		if (action === "edit") {
			this.beginNodeEdit(active.primaryNodeId);
		} else if (action === "source") {
			this.activateNode(active.primaryNodeId);
		} else if (
			(action === "create-child" || action === "create-sibling") &&
			node !== undefined &&
			sourceRevision !== undefined
		) {
			this.callbacks.interaction({
				type: "node-create-request",
				nodeId: node.id,
				relation:
					action === "create-child" ? "child" : "sibling",
				sourceSnapshot: createMindMapNodeEditSnapshot(
					node,
					sourceRevision,
				),
			});
		} else if (command !== undefined && sourceRevision !== undefined) {
			this.callbacks.interaction({
				type: "topic-command-request",
				command,
				nodeIds: active.nodeIds,
				primaryNodeId: active.primaryNodeId,
				sourceRevision,
			});
		}
		this.closeNodeContextMenu();
	};

	private readonly handleWindowPointerDown = (event: PointerEvent): void => {
		const menu = this.activeNodeContextMenu?.element;
		if (
			menu !== undefined &&
			(!isElement(event.target) || !menu.contains(event.target))
		) {
			this.closeNodeContextMenu();
		}
	};

	private closeNodeContextMenu(): void {
		const active = this.activeNodeContextMenu;
		this.activeNodeContextMenu = null;
		if (active === null) {
			return;
		}
		active.element.removeEventListener(
			"pointerdown",
			this.handleContextMenuPointerDown,
		);
		active.element.removeEventListener(
			"click",
			this.handleContextMenuClick,
		);
		active.element.remove();
	}

	private readonly handleNodeKeyDown = (event: KeyboardEvent): void => {
		if (!this.viewActive) {
			event.preventDefault();
			return;
		}
		this.spaceGestureOwner = "node";
		this.handleNodeKeyboardGesture(event);
	};

	private handleNodeKeyboardGesture(event: KeyboardEvent): boolean {
		const target = event.target;
		if (!isElement(target)) {
			return false;
		}
		const contentButton = target.closest<HTMLButtonElement>(
			'button[data-obmind-action="select"]',
		);
		const nodeId = contentButton?.closest<HTMLElement>(".obmind-node")
			?.dataset.obmindNodeId;
		if (
			contentButton === null ||
			contentButton === undefined ||
			nodeId === undefined ||
			!this.nodesLayer?.contains(contentButton)
		) {
			return false;
		}

		const handled = this.performNodeKeyboardGesture(nodeId, {
			altKey: event.altKey,
			ctrlKey: event.ctrlKey,
			isComposing: event.isComposing,
			key: event.key,
			metaKey: event.metaKey,
			repeat: event.repeat,
			shiftKey: event.shiftKey,
		});
		if (!handled) {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();
		return true;
	}

	private performNodeKeyboardGesture(
		nodeId: string,
		gesture: MindMapKeyGesture,
	): boolean {
		const node = this.visibleNodes.get(nodeId);
		if (node === undefined) {
			return false;
		}
		const renderInput = this.renderInput;
		const navigationIntent =
			renderInput === null
				? null
				: resolveMindMapNavigationKeyIntent({
						...gesture,
						orientation:
							renderInput.presentation.layout.orientation,
					});
		if (navigationIntent !== null && renderInput !== null) {
			if (this.activeNodeDrag !== null) {
				return true;
			}
			const navigation = createVisibleMindMapNavigation(
				renderInput.root,
				renderInput.interaction.collapsedNodeIds,
			);
			if (navigationIntent.type === "navigate") {
				const targetNodeId =
					resolveVisibleMindMapNavigationTarget(
						navigation,
						nodeId,
						navigationIntent.target,
					);
				if (targetNodeId !== null) {
					this.selectAndFocusNode(targetNodeId);
					this.focusNode(targetNodeId);
				}
				return true;
			}

			const siblingId = resolveVisibleMindMapNavigationTarget(
				navigation,
				nodeId,
				navigationIntent.direction === "previous"
					? "previous-sibling"
					: "next-sibling",
			);
			const sibling =
				siblingId === null
					? undefined
					: this.visibleNodes.get(siblingId);
			if (
				node.kind !== "root" &&
				sibling !== undefined &&
				sibling.kind !== "root"
			) {
				this.callbacks.interaction({
					type: "node-move-request",
					nodeId,
					targetNodeId: sibling.id,
					placement:
						navigationIntent.direction === "previous"
							? "before"
							: "after",
					sourceSnapshot: createMindMapNodeEditSnapshot(
						node,
						renderInput.sourceRevision,
					),
					targetSnapshot: createMindMapNodeEditSnapshot(
						sibling,
						renderInput.sourceRevision,
					),
				});
			}
			return true;
		}
		const intent = resolveMindMapNodeKeyIntent({
			...gesture,
			nodeKind: node.kind,
			selected:
				this.renderInput?.interaction.selectedNodeIds.has(
					nodeId,
				) ?? false,
		});
		if (intent === null) {
			return false;
		}
		if (this.activeNodeDrag !== null) {
			// Escape is handled by the window-level drag guard. Consume every
			// other recognized node gesture while a pointer move is pending so
			// editing/creation cannot race the structural source snapshot.
			return true;
		}

		if (intent === "consume") {
			return true;
		} else if (intent === "select") {
			this.selectAndFocusNode(nodeId);
		} else if (intent === "edit") {
			this.beginNodeEdit(nodeId);
		} else if (intent === "open-source") {
			this.activateNode(nodeId);
		} else if (intent === "clear-selection") {
			this.callbacks.interaction({
				type: "canvas-clear-selection",
			});
			this.claimCanvasKeyboardContext();
		} else {
			const sourceRevision = this.renderInput?.sourceRevision;
			if (sourceRevision === undefined) {
				return false;
			}
			this.callbacks.interaction({
				type: "node-create-request",
				nodeId,
				relation:
					intent === "create-child"
						? "child"
						: "sibling",
				sourceSnapshot: createMindMapNodeEditSnapshot(
					node,
					sourceRevision,
				),
			});
		}
		return true;
	}

	private requestTopicCommand(
		command: MindMapTopicCommand,
	): boolean {
		const input = this.renderInput;
		if (input === null) {
			return false;
		}
		const selectedNodeIds = [...input.interaction.selectedNodeIds];
		const primaryNodeId =
			input.interaction.primarySelectedNodeId ??
			input.interaction.focusedNodeId ??
			selectedNodeIds[0] ??
			null;
		if (
			command !== "undo" &&
			command !== "redo" &&
			selectedNodeIds.length === 0
		) {
			return false;
		}
		this.callbacks.interaction({
			type: "topic-command-request",
			command,
			nodeIds: selectedNodeIds,
			primaryNodeId,
			sourceRevision: input.sourceRevision,
		});
		return true;
	}

	private selectAndFocusNode(
		nodeId: string,
		mode: "replace" | "add" | "toggle" | "range" = "replace",
	): void {
		this.spaceGestureOwner = "node";
		this.callbacks.interaction({
			type: "node-select",
			nodeId,
			mode,
		});
		this.callbacks.interaction({
			type: "node-focus",
			nodeId,
		});
	}

	private activateNode(nodeId: string): void {
		if (this.destroyed || !this.visibleNodes.has(nodeId)) {
			return;
		}
		this.callbacks.interaction({
			type: "node-activate",
			nodeId,
		});
	}

	private finishNodeEdit(
		commit: boolean,
		restoreFocus: boolean,
		continuation?: {
			readonly type: "create-node";
			readonly relation: "child" | "sibling";
		},
	): void {
		const edit = this.activeNodeEdit;
		if (edit === null || edit.finalized) {
			return;
		}

		const nextText = edit.input.value.trim();
		if (commit && nextText.length === 0 && !this.destroyed) {
			this.nodeElements
				.get(edit.nodeId)
				?.classList.add("obmind-node-edit-invalid");
			edit.input.setCustomValidity(
				createObMindTranslator(
					this.renderInput?.language ?? DEFAULT_OBMIND_LANGUAGE,
				).t("renderer.editor.empty-text"),
			);
			edit.input.setAttribute("aria-invalid", "true");
			if (edit.input.isConnected) {
				edit.input.focus({ preventScroll: true });
				edit.input.reportValidity();
			}
			return;
		}

		edit.finalized = true;
		this.activeNodeEdit = null;
		if (edit.blurFrame !== null) {
			edit.input.ownerDocument.defaultView?.cancelAnimationFrame(
				edit.blurFrame,
			);
			edit.blurFrame = null;
		}
		edit.input.removeEventListener(
			"keydown",
			this.handleNodeEditorKeyDown,
		);
		edit.input.removeEventListener("blur", this.handleNodeEditorBlur);
		edit.input.removeEventListener("input", this.handleNodeEditorInput);
		edit.input.removeEventListener(
			"pointerdown",
			this.handleNodeEditorPointerEvent,
		);
		edit.input.removeEventListener(
			"click",
			this.handleNodeEditorPointerEvent,
		);
		const nodeElement = this.nodeElements.get(edit.nodeId);
		// Restore the same content slot that the input occupied. Keeping exactly
		// one in-flow content element prevents a transient duplicate topic and
		// keeps node measurement stable across edit lifecycle changes.
		edit.input.replaceWith(edit.contentButton);
		nodeElement?.classList.remove("obmind-node-editing");
		nodeElement?.classList.remove("obmind-node-edit-invalid");
		this.scheduleMeasurement();

		if (
			commit &&
			(nextText !== edit.expectedText ||
				continuation !== undefined) &&
			!this.destroyed
		) {
			this.callbacks.interaction({
				type: "node-edit-commit",
				nodeId: edit.nodeId,
				expectedText: edit.expectedText,
				sourceSnapshot: edit.sourceSnapshot,
				text: nextText,
				continuation,
			});
		}

		if (
			restoreFocus &&
			!this.destroyed &&
			edit.contentButton.isConnected
		) {
			edit.contentButton.focus({ preventScroll: true });
		}
	}

	private readonly handleNodeEditorKeyDown = (
		event: KeyboardEvent,
	): void => {
		if (event.target !== this.activeNodeEdit?.input) {
			return;
		}
		if (!this.viewActive) {
			event.preventDefault();
			return;
		}
		event.stopPropagation();
		this.finishNodeEditFromKeyboard(event);
	};

	private finishNodeEditFromKeyboard(event: KeyboardEvent): boolean {
		if (event.target !== this.activeNodeEdit?.input) {
			return false;
		}

		const handled = this.performNodeEditorKeyIntent(
			resolveMindMapNodeEditorKeyIntent({
				altKey: event.altKey,
				ctrlKey: event.ctrlKey,
				isComposing: event.isComposing,
				key: event.key,
				metaKey: event.metaKey,
				repeat: event.repeat,
				shiftKey: event.shiftKey,
				allowsLineBreaks:
					this.activeNodeEdit.sourceSnapshot.kind !== "root",
			}),
		);
		if (!handled) {
			return false;
		}

		event.preventDefault();
		return true;
	}

	private performNodeEditorKeyIntent(
		intent: MindMapNodeEditorKeyIntent | null,
	): boolean {
		switch (intent) {
			case "cancel-edit":
				this.finishNodeEdit(false, false);
				return true;
			case "commit-edit":
				this.finishNodeEdit(true, true);
				return true;
			case "commit-and-create-child":
				this.finishNodeEdit(true, false, {
					type: "create-node",
					relation: "child",
				});
				return true;
			case "consume":
				return true;
			case null:
				return false;
		}
	}

	private readonly handleRendererWindowKeyDown = (
		event: KeyboardEvent,
	): void => {
		if (!this.viewActive) {
			return;
		}

		if (
			this.activeNodeContextMenu !== null &&
			event.key === "Escape"
		) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.closeNodeContextMenu();
			this.surface?.focus({ preventScroll: true });
			return;
		}
		if (this.activeNodeDrag !== null && event.key === "Escape") {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.cancelNodeDrag();
			return;
		}

		const nodeOwnsSpaceGesture =
			this.spaceGestureOwner === "node" &&
			this.isNodeKeyboardTarget(event.target);
		const hostControlOwnsSpaceGesture =
			this.surface !== null &&
			shouldPreserveHostSpaceActivation(event.target, this.surface);
		const taskControlOwnsSpaceGesture =
			isElement(event.target) &&
			this.nodesLayer?.contains(event.target) === true &&
			event.target.closest("[data-obmind-task-toggle]") !== null;
		// Track Space before the focus-in-surface check so holding Space before
		// clicking the canvas still works. A canvas gesture keeps ownership even
		// if Electron leaves DOM focus on an old topic button; consume both the
		// semantic key event and the button's native activation in that case.
		if (
			event.key === " " &&
			!event.repeat &&
			!event.isComposing &&
			this.surface !== null &&
			this.activePointer === null &&
			this.activeSelectionMarquee === null &&
			this.activeNodeEdit === null &&
			!nodeOwnsSpaceGesture &&
			!hostControlOwnsSpaceGesture &&
			!taskControlOwnsSpaceGesture
		) {
			this.isSpaceKeyHeld = true;
			this.surface.classList.add("obmind-renderer-space-pan");
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}

		if (
			!isElement(event.target) ||
			this.surface === null ||
			!this.surface.contains(event.target)
		) {
			return;
		}
		// Obsidian handles several editing keys at the workspace/document level
		// before a target-level listener runs. Intercept recognized mind-map
		// gestures at the window boundary so Escape cannot switch leaves and
		// Tab cannot move focus instead of creating a child.
		const handled = this.handleKeyboardGesture({
			altKey: event.altKey,
			ctrlKey: event.ctrlKey,
			isComposing: event.isComposing,
			key: event.key,
			metaKey: event.metaKey,
			repeat: event.repeat,
			shiftKey: event.shiftKey,
		});
		if (handled) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	};

	private readonly handleRendererWindowKeyUp = (
		event: KeyboardEvent,
	): void => {
		if (!this.viewActive) {
			return;
		}

		if (event.key === " " && this.isSpaceKeyHeld) {
			this.isSpaceKeyHeld = false;
			this.surface?.classList.remove("obmind-renderer-space-pan");
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	};

	private isNodeKeyboardTarget(target: EventTarget | null): boolean {
		return (
			isElement(target) &&
			target.closest(".obmind-node") !== null &&
			this.nodesLayer?.contains(target) === true
		);
	}

	private claimCanvasKeyboardContext(): void {
		this.spaceGestureOwner = "canvas";
		const surface = this.surface;
		const activeElement = surface?.ownerDocument.activeElement ?? null;
		if (
			isElement(activeElement) &&
			this.nodesLayer?.contains(activeElement) === true &&
			activeElement.closest(".obmind-node") !== null &&
			typeof (activeElement as HTMLElement).blur === "function"
		) {
			(activeElement as HTMLElement).blur();
		}
		surface?.focus({ preventScroll: true });
	}

	private readonly handleNodeEditorBlur = (event: FocusEvent): void => {
		const edit = this.activeNodeEdit;
		if (event.target !== edit?.input) {
			return;
		}
		if (event.relatedTarget !== null) {
			const action = resolveMindMapNodeEditorBlurAction({
				activeElement: "other",
				documentHasFocus: true,
				hasRelatedTarget: true,
			});
			if (action === "commit") {
				this.finishNodeEdit(true, false);
			}
			return;
		}

		const animationWindow = edit.input.ownerDocument.defaultView;
		if (animationWindow === null || edit.blurFrame !== null) {
			return;
		}
		edit.blurFrame = animationWindow.requestAnimationFrame(() => {
			if (this.activeNodeEdit !== edit || edit.finalized) {
				return;
			}
			edit.blurFrame = null;
			const ownerDocument = edit.input.ownerDocument;
			const activeElement = ownerDocument.activeElement;
			const action = resolveMindMapNodeEditorBlurAction({
				activeElement:
					activeElement === edit.input
						? "editor"
						: activeElement === null ||
							  activeElement === ownerDocument.body ||
							  activeElement ===
									ownerDocument.documentElement
							? "document"
							: "other",
				documentHasFocus: ownerDocument.hasFocus(),
				hasRelatedTarget: false,
			});
			if (action === "keep") {
				return;
			}
			if (action === "refocus") {
				edit.input.focus({ preventScroll: true });
				return;
			}
			this.finishNodeEdit(true, false);
		});
	};

	private readonly handleNodeEditorInput = (event: Event): void => {
		const input = this.activeNodeEdit?.input;
		if (input === undefined || event.target !== input) {
			return;
		}
		if (input.value.trim().length > 0) {
			input.setCustomValidity("");
			input.removeAttribute("aria-invalid");
			this.nodeElements
				.get(this.activeNodeEdit?.nodeId ?? "")
				?.classList.remove("obmind-node-edit-invalid");
		}
		resizeNodeEditor(input);
		this.scheduleMeasurement();
	};

	private readonly handleNodeEditorPointerEvent = (
		event: Event,
	): void => {
		event.stopPropagation();
	};

	private readonly handleNodePointerOver = (
		event: PointerEvent,
	): void => {
		const target = event.target;
		if (!isElement(target)) {
			return;
		}
		const nodeElement = target.closest<HTMLElement>(".obmind-node");
		if (
			nodeElement === null ||
			!this.nodesLayer?.contains(nodeElement) ||
			(isElement(event.relatedTarget) &&
				nodeElement.contains(event.relatedTarget))
		) {
			return;
		}
		const id = nodeElement.dataset.obmindNodeId;
		if (id !== undefined && this.visibleNodes.has(id)) {
			this.callbacks.interaction({
				type: "node-hover",
				nodeId: id,
			});
		}
	};

	private readonly handleNodePointerOut = (
		event: PointerEvent,
	): void => {
		const target = event.target;
		if (!isElement(target)) {
			return;
		}
		const nodeElement = target.closest<HTMLElement>(".obmind-node");
		if (
			nodeElement === null ||
			!this.nodesLayer?.contains(nodeElement) ||
			(isElement(event.relatedTarget) &&
				nodeElement.contains(event.relatedTarget))
		) {
			return;
		}
		this.callbacks.interaction({
			type: "node-hover",
			nodeId: null,
		});
	};

	private readonly handlePointerDown = (event: PointerEvent): void => {
		const surface = this.surface;
		if (
			surface === null ||
			!event.isPrimary ||
			(event.pointerType === "mouse" && event.button !== 0) ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey
		) {
			return;
		}

		const target = event.target;
		if (isElement(target)) {
			if (target.closest(".obmind-node") !== null) {
				this.spaceGestureOwner = "node";
			}
			if (target.closest("[data-obmind-task-toggle]") !== null) {
				return;
			}
			if (target.closest("[data-obmind-node-link-index]") !== null) {
				return;
			}
			const contentButton = target.closest<HTMLButtonElement>(
				'button[data-obmind-action="select"]',
			);
			const nodeElement =
				contentButton?.closest<HTMLElement>(".obmind-node");
			const nodeId = nodeElement?.dataset.obmindNodeId;
			const node =
				nodeId === undefined
					? undefined
					: this.visibleNodes.get(nodeId);
			const sourceRevision = this.renderInput?.sourceRevision;
			if (
				contentButton !== null &&
				contentButton !== undefined &&
				this.nodesLayer?.contains(contentButton) === true &&
				node !== undefined &&
				node.kind !== "root" &&
				sourceRevision !== undefined &&
				!event.shiftKey
			) {
				// An active inline editor owns the current explicit source
				// gesture. Do not let the same pointer silently commit text and
				// begin a structural move from an older revision.
				if (this.activeNodeEdit !== null) {
					return;
				}
				this.activeNodeDrag = {
					id: event.pointerId,
					sourceNodeId: node.id,
					sourceSnapshot: createMindMapNodeEditSnapshot(
						node,
						sourceRevision,
					),
					sourceRevision,
					dragStartClient: {
						x: event.clientX,
						y: event.clientY,
					},
					started: false,
					dropTarget: null,
				};
				return;
			}
			if (target.closest(".obmind-node") !== null) {
				return;
			}
		}

		const canvasIntent = resolveMindMapCanvasPointerIntent({
			hasActiveEdit: this.activeNodeEdit !== null,
			shiftKey: event.shiftKey,
			spaceKey: this.isSpaceKeyHeld,
		});
		if (canvasIntent === "begin-marquee") {
			this.beginSelectionMarquee(event);
			return;
		}

		if (canvasIntent === "commit-edit-clear-selection-and-pan") {
			const activeEdit = this.activeNodeEdit;
			if (activeEdit !== null) {
				this.finishNodeEdit(true, false);
				if (this.activeNodeEdit === activeEdit) {
					// Empty drafts remain in the inline editor for correction.
					// Do not let the browser move focus or start panning after
					// the validation failure.
					event.preventDefault();
					return;
				}
			}
		}

		this.claimCanvasKeyboardContext();
		this.callbacks.interaction({
			type: "canvas-clear-selection",
		});
		this.activePointer = {
			id: event.pointerId,
			clientX: event.clientX,
			clientY: event.clientY,
		};
		surface.setPointerCapture(event.pointerId);
		surface.classList.add("obmind-renderer-panning");
		event.preventDefault();
	};

	private readonly handlePointerMove = (event: PointerEvent): void => {
		const marquee = this.activeSelectionMarquee;
		if (marquee !== null && marquee.id === event.pointerId) {
			marquee.currentClient = {
				x: event.clientX,
				y: event.clientY,
			};
			this.updateSelectionMarquee(marquee);
			event.preventDefault();
			return;
		}

		const nodeDrag = this.activeNodeDrag;
		if (nodeDrag !== null && nodeDrag.id === event.pointerId) {
			const clientPoint = {
				x: event.clientX,
				y: event.clientY,
			};
			if (
				!nodeDrag.started &&
				!hasCrossedNodeDragThreshold(
					nodeDrag.dragStartClient,
					clientPoint,
				)
			) {
				return;
			}

			if (!nodeDrag.started && !this.beginNodeDrag(nodeDrag)) {
				this.cancelNodeDrag();
				return;
			}

			const dropPreview = this.resolveNodeDragPreview(
				nodeDrag.sourceNodeId,
				event.clientX,
				event.clientY,
			);
			const dropTarget =
				dropPreview.status === "valid"
					? dropPreview.target
					: null;
			this.activeNodeDragClientPoint = clientPoint;
			nodeDrag.dropTarget = dropTarget;
			this.updateNodeDragGhost(
				event.clientX,
				event.clientY,
				dropTarget === null,
			);
			this.updateNodeDropPreview(
				dropPreview,
				nodeDrag.sourceNodeId,
			);
			this.scheduleNodeDragAutoPan();
			event.preventDefault();
			return;
		}

		const pointer = this.activePointer;
		if (pointer === null || pointer.id !== event.pointerId) {
			return;
		}

		this.transform.x += event.clientX - pointer.clientX;
		this.transform.y += event.clientY - pointer.clientY;
		pointer.clientX = event.clientX;
		pointer.clientY = event.clientY;
		this.applyTransform();
		event.preventDefault();
	};

	private readonly handlePointerEnd = (event: PointerEvent): void => {
		if (this.activeSelectionMarquee?.id === event.pointerId) {
			this.completeSelectionMarquee();
			event.preventDefault();
			return;
		}

		const nodeDrag = this.activeNodeDrag;
		if (nodeDrag !== null && nodeDrag.id === event.pointerId) {
			if (nodeDrag.started) {
				// Pointer capture can deliver a final pointerup without a
				// preceding move at the exact release coordinates. Resolve
				// once more so an old valid target is never committed after
				// the pointer has already left it.
				const dropPreview = this.resolveNodeDragPreview(
					nodeDrag.sourceNodeId,
					event.clientX,
					event.clientY,
				);
				nodeDrag.dropTarget =
					dropPreview.status === "valid"
						? dropPreview.target
						: null;
				this.updateNodeDropPreview(
					dropPreview,
					nodeDrag.sourceNodeId,
				);
			}
			this.completeNodeDrag(nodeDrag);
			if (nodeDrag.started) {
				event.preventDefault();
			}
			return;
		}

		const pointer = this.activePointer;
		const surface = this.surface;
		if (pointer === null || pointer.id !== event.pointerId) {
			return;
		}

		this.activePointer = null;
		surface?.classList.remove("obmind-renderer-panning");
		if (surface?.hasPointerCapture(event.pointerId)) {
			surface.releasePointerCapture(event.pointerId);
		}
		this.notifyViewportChanged("pan");
	};

	private readonly handlePointerCancel = (event: PointerEvent): void => {
		if (this.activeSelectionMarquee?.id === event.pointerId) {
			this.cancelSelectionMarquee();
			event.preventDefault();
			return;
		}

		const nodeDrag = this.activeNodeDrag;
		if (nodeDrag !== null && nodeDrag.id === event.pointerId) {
			const wasStarted = nodeDrag.started;
			this.cancelNodeDrag(false);
			if (wasStarted) {
				event.preventDefault();
			}
			return;
		}

		const pointer = this.activePointer;
		if (pointer === null || pointer.id !== event.pointerId) {
			return;
		}
		this.activePointer = null;
		this.surface?.classList.remove("obmind-renderer-panning");
		this.notifyViewportChanged("pan");
	};

	private cancelCanvasPointer(): void {
		const pointer = this.activePointer;
		this.activePointer = null;
		this.surface?.classList.remove("obmind-renderer-panning");
		if (
			pointer !== null &&
			this.surface?.hasPointerCapture(pointer.id)
		) {
			this.surface.releasePointerCapture(pointer.id);
		}
		if (pointer !== null) {
			this.notifyViewportChanged("pan");
		}
	}

	private readonly handlePointerLeave = (event: PointerEvent): void => {
		const nodeDrag = this.activeNodeDrag;
		if (
			nodeDrag !== null &&
			nodeDrag.id === event.pointerId &&
			!nodeDrag.started
		) {
			this.cancelNodeDrag(false);
		}
	};

	private readonly handleLostPointerCapture = (event: PointerEvent): void => {
		if (this.activeSelectionMarquee?.id === event.pointerId) {
			this.cancelSelectionMarquee(false);
			return;
		}
		if (this.activeNodeDrag?.id === event.pointerId) {
			this.cancelNodeDrag(false);
			return;
		}
		if (this.activePointer?.id !== event.pointerId) {
			return;
		}
		this.activePointer = null;
		this.surface?.classList.remove("obmind-renderer-panning");
		this.notifyViewportChanged("pan");
	};

	private beginNodeDrag(drag: ActiveNodeDrag): boolean {
		const surface = this.surface;
		if (surface === null) {
			return false;
		}
		surface.setPointerCapture(drag.id);
		drag.started = true;
		surface.classList.add("obmind-renderer-node-dragging");
		const source = this.visibleNodes.get(drag.sourceNodeId);
		if (source !== undefined) {
			for (const nodeId of collectNodeIds(source)) {
				this.nodeElements
					.get(nodeId)
					?.classList.add("obmind-node-drag-source");
			}

			const ghost = createHtmlElement(
				surface.ownerDocument,
				"div",
			);
			ghost.className = "obmind-node-drag-ghost";
			ghost.textContent = source.text;
			ghost.setAttribute("aria-hidden", "true");
			surface.append(ghost);
			this.nodeDragGhost = ghost;
		}
		this.updateNodeDragGhost(
			drag.dragStartClient.x,
			drag.dragStartClient.y,
			false,
		);
		this.selectAndFocusNode(drag.sourceNodeId);
		return true;
	}

	private beginSelectionMarquee(event: PointerEvent): void {
		const surface = this.surface;
		if (surface === null) {
			return;
		}
		// Electron can retain native focus on the previous topic even after the
		// logical selection is cleared. Explicitly blur that control and keep
		// Space ownership on the canvas for the following pan gesture.
		this.claimCanvasKeyboardContext();
		const element = createHtmlElement(
			surface.ownerDocument,
			"div",
		);
		element.className = "obmind-selection-marquee";
		element.setAttribute("aria-hidden", "true");
		surface.append(element);
		this.activeSelectionMarquee = {
			id: event.pointerId,
			startClient: {
				x: event.clientX,
				y: event.clientY,
			},
			currentClient: {
				x: event.clientX,
				y: event.clientY,
			},
			element,
		};
		surface.setPointerCapture(event.pointerId);
		surface.classList.add("obmind-renderer-selecting");
		this.updateSelectionMarquee(this.activeSelectionMarquee);
		event.preventDefault();
	}

	private updateSelectionMarquee(marquee: ActiveSelectionMarquee): void {
		const surface = this.surface;
		if (surface === null) {
			return;
		}
		const rect = surface.getBoundingClientRect();
		const left =
			Math.min(marquee.startClient.x, marquee.currentClient.x) -
			rect.left;
		const top =
			Math.min(marquee.startClient.y, marquee.currentClient.y) -
			rect.top;
		const width = Math.abs(
			marquee.currentClient.x - marquee.startClient.x,
		);
		const height = Math.abs(
			marquee.currentClient.y - marquee.startClient.y,
		);
		marquee.element.style.left = `${left}px`;
		marquee.element.style.top = `${top}px`;
		marquee.element.style.width = `${width}px`;
		marquee.element.style.height = `${height}px`;
	}

	private completeSelectionMarquee(): void {
		const marquee = this.activeSelectionMarquee;
		const layoutNodes = this.layoutResult?.nodes;
		if (marquee === null || layoutNodes === undefined) {
			this.cancelSelectionMarquee();
			return;
		}
		const start = this.clientPointToScene(
			marquee.startClient.x,
			marquee.startClient.y,
		);
		const end = this.clientPointToScene(
			marquee.currentClient.x,
			marquee.currentClient.y,
		);
		const selectedIds =
			start === null || end === null
				? []
				: collectMindMapNodesInRectangle(
						layoutNodes.map((positioned) => ({
							id: positioned.node.id,
							x: positioned.x,
							y: positioned.y,
							width: positioned.width,
							height: positioned.height,
						})),
						{
							left: start.x,
							top: start.y,
							right: end.x,
							bottom: end.y,
						},
					);
		this.callbacks.interaction({
			type: "nodes-select",
			nodeIds: selectedIds,
			mode: "replace",
			primaryNodeId:
				selectedIds[selectedIds.length - 1] ?? null,
		});
		this.cancelSelectionMarquee();
		// The selection callback can synchronously re-render the view and let the
		// host restore its previous control focus. Reassert canvas ownership only
		// after that update has completed.
		this.claimCanvasKeyboardContext();
	}

	private cancelSelectionMarquee(
		releasePointerCapture = true,
	): void {
		const marquee = this.activeSelectionMarquee;
		this.activeSelectionMarquee = null;
		marquee?.element.remove();
		this.surface?.classList.remove("obmind-renderer-selecting");
		if (
			releasePointerCapture &&
			marquee !== null &&
			this.surface?.hasPointerCapture(marquee.id)
		) {
			this.surface.releasePointerCapture(marquee.id);
		}
	}

	private updateNodeDragGhost(
		clientX: number,
		clientY: number,
		invalid: boolean,
	): void {
		const surface = this.surface;
		const ghost = this.nodeDragGhost;
		if (surface === null || ghost === null) {
			return;
		}
		const rect = surface.getBoundingClientRect();
		ghost.style.transform = `translate3d(${clientX - rect.left + 12}px, ${clientY - rect.top + 12}px, 0)`;
		ghost.classList.toggle("obmind-node-drag-ghost-invalid", invalid);
	}

	private updateNodeDropPreview(
		preview: NodeDragDropPreview,
		sourceNodeId: string,
	): void {
		if (this.nodeDropTargetId !== null) {
			this.nodeElements
				.get(this.nodeDropTargetId)
				?.classList.remove("obmind-node-drop-child-target");
			this.nodeDropTargetId = null;
		}
		this.nodeDropIndicator?.remove();
		this.nodeDropPreview?.remove();
		this.nodeDropPreviewConnector?.remove();
		this.nodeDropIndicator = null;
		this.nodeDropPreview = null;
		this.nodeDropPreviewConnector = null;

		if (preview.status !== "valid") {
			this.refreshSceneCulling();
			return;
		}
		const dropTarget = preview.target;
		this.nodeDropTargetId = dropTarget.nodeId;
		this.refreshSceneCulling();
		const targetElement = this.nodeElements.get(
			dropTarget.nodeId,
		);
		if (targetElement === undefined) {
			this.nodeDropTargetId = null;
			return;
		}
		if (dropTarget.placement === "child") {
			targetElement.classList.add(
				"obmind-node-drop-child-target",
			);
		}

		const scene = this.scene;
		const source = this.visibleNodes.get(sourceNodeId);
		if (scene === null || source === undefined) {
			return;
		}

		const connector = createHtmlElement(
			scene.ownerDocument,
			"div",
		);
		connector.className = "obmind-node-drop-preview-connector";
		connector.dataset.obmindDropPlacement = dropTarget.placement;
		applyNodeDragPreviewSegment(
			connector,
			preview.geometry.connector,
		);

		const placeholder = createHtmlElement(
			scene.ownerDocument,
			"div",
		);
		placeholder.className = "obmind-node-drop-preview";
		placeholder.dataset.obmindDropPlacement = dropTarget.placement;
		placeholder.textContent = source.text;
		placeholder.setAttribute("aria-hidden", "true");
		const bounds = preview.geometry.placeholderBounds;
		placeholder.style.left = `${bounds.x}px`;
		placeholder.style.top = `${bounds.y}px`;
		placeholder.style.width = `${bounds.width}px`;
		placeholder.style.height = `${bounds.height}px`;

		scene.append(connector, placeholder);
		this.nodeDropPreviewConnector = connector;
		this.nodeDropPreview = placeholder;

		if (preview.geometry.insertionMarker !== null) {
			const indicator = createHtmlElement(
				scene.ownerDocument,
				"div",
			);
			indicator.className = "obmind-node-drop-indicator";
			indicator.dataset.obmindDropPlacement =
				dropTarget.placement;
			applyNodeDragPreviewSegment(
				indicator,
				preview.geometry.insertionMarker,
			);
			scene.append(indicator);
			this.nodeDropIndicator = indicator;
		}
	}

	private completeNodeDrag(drag: ActiveNodeDrag): void {
		this.stopNodeDragAutoPan();
		const input = this.renderInput;
		const target =
			drag.dropTarget === null
				? undefined
				: this.visibleNodes.get(drag.dropTarget.nodeId);
		const sourceIsCurrent =
			input !== null &&
			canContinueNodeDragAfterRender(
				input.root,
				drag.sourceNodeId,
				drag.sourceRevision,
				input.sourceRevision,
			);
		const payload =
			drag.started &&
			sourceIsCurrent &&
			input !== null &&
			drag.dropTarget !== null &&
			target !== undefined
				? {
						type: "node-move-request" as const,
						nodeId: drag.sourceNodeId,
						targetNodeId: target.id,
						placement: drag.dropTarget.placement,
						sourceSnapshot: drag.sourceSnapshot,
						targetSnapshot:
							createMindMapNodeEditSnapshot(
								target,
								drag.sourceRevision,
							),
					}
				: undefined;

		this.activeNodeDrag = null;
		if (drag.started) {
			this.suppressNodeActivationUntil = Date.now() + 350;
			this.notifyViewportChanged("pan");
		}
		this.clearNodeDragVisuals();
		const surface = this.surface;
		if (surface?.hasPointerCapture(drag.id)) {
			surface.releasePointerCapture(drag.id);
		}
		if (payload !== undefined && !this.destroyed) {
			this.callbacks.interaction(payload);
		}
	}

	private cancelNodeDrag(releasePointerCapture = true): void {
		this.stopNodeDragAutoPan();
		const drag = this.activeNodeDrag;
		if (drag === null) {
			this.clearNodeDragVisuals();
			return;
		}
		this.activeNodeDrag = null;
		if (drag.started) {
			this.suppressNodeActivationUntil = Date.now() + 350;
			this.notifyViewportChanged("pan");
		}
		this.clearNodeDragVisuals();
		const surface = this.surface;
		if (
			releasePointerCapture &&
			surface?.hasPointerCapture(drag.id)
		) {
			surface.releasePointerCapture(drag.id);
		}
	}

	private clearNodeDragVisuals(): void {
		this.surface?.classList.remove(
			"obmind-renderer-node-dragging",
		);
		for (const element of this.nodeElements.values()) {
			element.classList.remove(
				"obmind-node-drag-source",
				"obmind-node-drop-child-target",
			);
		}
		this.nodeDragGhost?.remove();
		this.nodeDropIndicator?.remove();
		this.nodeDropPreview?.remove();
		this.nodeDropPreviewConnector?.remove();
		this.nodeDragGhost = null;
		this.nodeDropIndicator = null;
		this.nodeDropPreview = null;
		this.nodeDropPreviewConnector = null;
		this.nodeDropTargetId = null;
		this.refreshSceneCulling();
	}

	private scheduleNodeDragAutoPan(): void {
		if (
			this.nodeDragAutoPanFrame !== null ||
			this.activeNodeDrag === null ||
			!this.activeNodeDrag.started ||
			this.activeNodeDragClientPoint === null
		) {
			return;
		}
		const animationWindow =
			this.surface?.ownerDocument.defaultView ?? this.animationWindow;
		if (animationWindow === null) {
			return;
		}
		this.nodeDragAutoPanFrame = animationWindow.requestAnimationFrame(
			this.advanceNodeDragAutoPan,
		);
	}

	private readonly advanceNodeDragAutoPan = (): void => {
		this.nodeDragAutoPanFrame = null;
		const drag = this.activeNodeDrag;
		const point = this.activeNodeDragClientPoint;
		const surface = this.surface;
		if (
			drag === null ||
			!drag.started ||
			point === null ||
			surface === null
		) {
			return;
		}

		const rect = surface.getBoundingClientRect();
		const delta = calculateNodeDragAutoPan(point, {
			left: rect.left,
			top: rect.top,
			right: rect.right,
			bottom: rect.bottom,
		});
		if (delta.x === 0 && delta.y === 0) {
			return;
		}

		const nextTransform = applyNodeDragAutoPan(
			this.transform,
			delta,
		);
		this.transform.x = nextTransform.x;
		this.transform.y = nextTransform.y;
		this.applyTransform();
		const dropPreview = this.resolveNodeDragPreview(
			drag.sourceNodeId,
			point.x,
			point.y,
		);
		drag.dropTarget =
			dropPreview.status === "valid"
				? dropPreview.target
				: null;
		this.updateNodeDropPreview(
			dropPreview,
			drag.sourceNodeId,
		);
		this.updateNodeDragGhost(
			point.x,
			point.y,
			drag.dropTarget === null,
		);
		this.scheduleNodeDragAutoPan();
	};

	private stopNodeDragAutoPan(): void {
		if (this.nodeDragAutoPanFrame !== null) {
			const animationWindow =
				this.surface?.ownerDocument.defaultView ??
				this.animationWindow;
			animationWindow?.cancelAnimationFrame(
				this.nodeDragAutoPanFrame,
			);
			this.nodeDragAutoPanFrame = null;
		}
		this.activeNodeDragClientPoint = null;
	}

	private clientPointToScene(
		clientX: number,
		clientY: number,
	): LayoutPoint | null {
		const surface = this.surface;
		if (
			surface === null ||
			!Number.isFinite(clientX) ||
			!Number.isFinite(clientY) ||
			this.transform.scale <= 0
		) {
			return null;
		}
		const rect = surface.getBoundingClientRect();
		return clientPointToNodeDragScene(
			{ x: clientX, y: clientY },
			{ left: rect.left, top: rect.top },
			this.transform,
		);
	}

	private resolveNodeDragPreview(
		sourceNodeId: string,
		clientX: number,
		clientY: number,
	): NodeDragDropPreview {
		const point = this.clientPointToScene(clientX, clientY);
		const input = this.renderInput;
		const positionedNodes = this.layoutResult?.nodes;
		if (
			point === null ||
			input === null ||
			positionedNodes === undefined
		) {
			return {
				status: "none",
				reason: "no-positioned-target",
			};
		}
		const layoutEngine = this.layoutEngines.resolve(
			input.presentation.layout.engineId,
		);
		const rootPosition = positionedNodes.find(
			(positioned) => positioned.node.id === input.root.id,
		);
		const defaultGeometryResolver: NodeDragPreviewGeometryResolver = (
			request,
		) => {
			const prospectiveRootOrientation =
				input.presentation.layout.engineId ===
					BILATERAL_TREE_LAYOUT_ENGINE_ID &&
				request.placement === "child" &&
				request.target.node.id === input.root.id
					? resolveBilateralRootChildDropOrientation(
							input.root,
							sourceNodeId,
							input.interaction.collapsedNodeIds,
							request.orientation,
							input.presentation.layout.options,
						)
					: null;
			return resolveAxisAlignedNodeDragPreviewGeometry({
				...request,
				orientation:
					prospectiveRootOrientation ??
					resolveMindMapPositionedBranchOrientation(
						request.target,
						rootPosition,
						request.orientation,
					),
			});
		};

		return resolveNodeDragDropPreview({
			root: input.root,
			positionedNodes,
			sourceNodeId,
			orientation: input.presentation.layout.orientation,
			point,
			resolveNodeDropPlacement:
				layoutEngine.resolveNodeDropPlacement,
			resolvePreviewGeometry:
				this.dragPreviewGeometryResolver ??
				defaultGeometryResolver,
			previewSpacing: {
				primaryGap: input.presentation.layout.spacing.level,
				siblingGap:
					input.presentation.layout.spacing.sibling,
			},
		});
	}

	private readonly handleWheel = (event: WheelEvent): void => {
		const surface = this.surface;
		if (surface === null) {
			return;
		}

		event.preventDefault();
		const rect = surface.getBoundingClientRect();
		const pointerX = event.clientX - rect.left;
		const pointerY = event.clientY - rect.top;
		const worldX = (pointerX - this.transform.x) / this.transform.scale;
		const worldY = (pointerY - this.transform.y) / this.transform.scale;
		const normalizedDelta = normalizeWheelDelta(event, surface.clientHeight);
		const nextScale = clamp(
			this.transform.scale * Math.exp(-normalizedDelta * 0.0015),
			MIN_SCALE,
			MAX_SCALE,
		);

		if (nextScale === this.transform.scale) {
			return;
		}

		this.transform = {
			x: pointerX - worldX * nextScale,
			y: pointerY - worldY * nextScale,
			scale: nextScale,
		};
		this.applyTransform();
		this.notifyViewportChanged("zoom");
	};

	private readonly handleResize = (): void => {
		const surface = this.surface;
		if (surface !== null) {
			const nextSize = {
				width: surface.clientWidth,
				height: surface.clientHeight,
			};
			const previousSize = this.lastViewportSize;
			if (
				previousSize !== null &&
				previousSize.width > 0 &&
				previousSize.height > 0 &&
				nextSize.width > 0 &&
				nextSize.height > 0
			) {
				this.transform.x +=
					(nextSize.width - previousSize.width) / 2;
				this.transform.y +=
					(nextSize.height - previousSize.height) / 2;
				this.applyTransform();
			}
			this.lastViewportSize = nextSize;
		}
		this.scheduleMeasurement();
	};

	private notifyViewportChanged(
		reason: Extract<
			MindMapInteractionEvent,
			{ readonly type: "viewport-change" }
		>["reason"],
	): void {
		if (this.destroyed) {
			return;
		}
		const viewport = this.getViewport();
		if (viewport !== null) {
			this.callbacks.interaction({
				type: "viewport-change",
				viewport,
				reason,
			});
		}
	}
}

function createMindMapTreeItemSemantics(
	root: MindMapNode,
	visibleNodeIds: ReadonlySet<string>,
	collapsedNodeIds: ReadonlySet<string>,
): ReadonlyMap<string, MindMapTreeItemSemantics> {
	const semantics = new Map<string, MindMapTreeItemSemantics>();
	const visit = (
		node: MindMapNode,
		depth: number,
		siblings: readonly MindMapNode[],
		position: number,
	): void => {
		if (!visibleNodeIds.has(node.id)) {
			return;
		}
		const expanded =
			node.children.length === 0
				? null
				: !collapsedNodeIds.has(node.id);
		semantics.set(node.id, {
			level: depth + 1,
			setSize: siblings.length,
			posInSet: position + 1,
			expanded,
		});
		if (expanded !== true) {
			return;
		}
		const visibleChildren = node.children.filter((child) =>
			visibleNodeIds.has(child.id),
		);
		for (let index = 0; index < visibleChildren.length; index += 1) {
			const child = visibleChildren[index];
			if (child !== undefined) {
				visit(child, depth + 1, visibleChildren, index);
			}
		}
	};
	visit(root, 0, [root], 0);
	return semantics;
}

function resolveMindMapDecorationDescriptors(
	result: LayoutResult,
	input: MindMapRenderInput,
): readonly MindMapDecorationGeometryDescriptor[] {
	return resolveMindMapDecorationGeometry(input.presentation.decorations, {
		nodeBounds: result.nodes.map((positioned) => ({
			id: positioned.node.id,
			x: positioned.x,
			y: positioned.y,
			width: positioned.width,
			height: positioned.height,
		})),
		orientation: input.presentation.layout.orientation,
	}).descriptors;
}

function createMindMapDecorationExportPrimitiveOptions(
	assetRegistry: MindMapAssetRegistry,
	colors: MindMapThemeColorTokens,
	resolveColor: (color: string) => string,
	fontFamily: string,
): MindMapDecorationExportPrimitiveOptions {
	const labelColor = resolveColor(resolveThemeColor(colors.text));
	const textStyle = (
		baselineOffset: number,
		textAnchor?: MindMapExportTextStyle["textAnchor"],
	): MindMapExportTextStyle => ({
		fill: labelColor,
		fontFamily,
		fontSize: 12,
		fontWeight: "500",
		fontStyle: "normal",
		baselineOffset,
		...(textAnchor === undefined ? {} : { textAnchor }),
	});
	return {
		markerAssets: createMindMapDecorationMarkerAssetMap(assetRegistry),
		marker: {
			colors: createMindMapDecorationAssetExportColors(
				colors,
				resolveColor,
			),
			width: MIND_MAP_DECORATION_MARKER_SIZE,
			height: MIND_MAP_DECORATION_MARKER_SIZE,
			offsetX: 4,
			offsetY: -MIND_MAP_DECORATION_MARKER_SIZE - 4,
			labelGap: 4,
			fit: "contain",
			label: textStyle(4, "start"),
		},
		boundary: {
			fill: { kind: "none" },
			stroke: {
				color: resolveColor(resolveThemeColor(colors.border)),
				width: 1.5,
				dashArray: [6, 4],
			},
			radius: 10,
			label: textStyle(12, "start"),
		},
		summary: {
			stroke: {
				color: resolveColor(resolveThemeColor(colors.accent)),
				width: 1.5,
				lineCap: "round",
				lineJoin: "round",
			},
			text: textStyle(0),
		},
		relationship: {
			stroke: {
				color: resolveColor(resolveThemeColor(colors.accent)),
				width: 1.5,
				lineCap: "round",
			},
			label: textStyle(-5, "middle"),
		},
	};
}

function createMindMapDecorationMarkerAssetMap(
	assetRegistry: MindMapAssetRegistry,
): ReadonlyMap<string, MindMapAssetVisualDescriptor> {
	const assets = new Map<string, MindMapAssetVisualDescriptor>();
	for (const asset of assetRegistry.list()) {
		if (asset.kind === "marker" || asset.kind === "tag") {
			assets.set(asset.id, createMindMapAssetVisualDescriptor(asset));
		}
	}
	return assets;
}

function createMindMapDecorationAssetExportColors(
	colors: MindMapThemeColorTokens,
	resolveColor: (color: string) => string,
): MindMapAssetExportColors {
	return createMindMapAssetExportColorsForAppearance(
		colors,
		{
			fill: colors.surface,
			stroke: colors.border,
			textColor: colors.text,
			branchColor: colors.accent,
		},
		resolveColor,
	);
}

function createMindMapAssetExportColorsForAppearance(
	colors: MindMapThemeColorTokens,
	appearance: ResolvedNodeAppearanceColors,
	resolveColor: (color: string) => string,
): MindMapAssetExportColors {
	const resolve = (color: MindMapThemeColor): string =>
		resolveColor(resolveThemeColor(color));
	return {
		foreground: resolve(
			resolveMindMapAssetRoleColor("foreground", colors, appearance),
		),
		muted: resolve(
			resolveMindMapAssetRoleColor("muted", colors, appearance),
		),
		surface: resolve(
			resolveMindMapAssetRoleColor("surface", colors, appearance),
		),
		accent: resolve(
			resolveMindMapAssetRoleColor("accent", colors, appearance),
		),
		positive: resolve(
			resolveMindMapAssetRoleColor("positive", colors, appearance),
		),
		warning: resolve(
			resolveMindMapAssetRoleColor("warning", colors, appearance),
		),
		danger: resolve(
			resolveMindMapAssetRoleColor("danger", colors, appearance),
		),
	};
}

function resolveMindMapExportDecorationFontFamily(
	container: HTMLElement,
): string {
	const style = container.ownerDocument.defaultView?.getComputedStyle(container);
	const interfaceFont = style?.getPropertyValue("--font-interface").trim();
	if (interfaceFont !== undefined && interfaceFont.length > 0) {
		return interfaceFont;
	}
	const fontFamily = style?.fontFamily.trim();
	return fontFamily !== undefined && fontFamily.length > 0
		? fontFamily
		: "sans-serif";
}

function createQuadraticDecorationPathData(
	start: LayoutPoint,
	control: LayoutPoint,
	end: LayoutPoint,
): string {
	return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
}

function createMindMapDecorationText(
	ownerDocument: Document,
	text: string,
	x: number,
	y: number,
	colors: MindMapThemeColorTokens,
	alignment: "start" | "center" | "end",
): SVGTextElement {
	const element = createSvgElement(ownerDocument, "text");
	element.classList.add("obmind-decoration-label");
	element.setAttribute("x", String(x));
	element.setAttribute("y", String(y));
	element.setAttribute(
		"text-anchor",
		alignment === "center" ? "middle" : alignment,
	);
	element.setAttribute("fill", resolveThemeColor(colors.text));
	element.setAttribute("font-family", "var(--font-interface)");
	element.setAttribute("font-size", "12");
	element.setAttribute("font-weight", "500");
	element.setAttribute("pointer-events", "none");
	element.setAttribute("aria-hidden", "true");
	element.textContent = text;
	return element;
}

function resolveMindMapDecorationMarkerAsset(
	registry: MindMapAssetRegistry,
	markerId: string,
): MindMapAssetVisualDescriptor | null {
	try {
		return createMindMapAssetVisualDescriptor(
			registry.resolveByKind(markerId, "marker"),
		);
	} catch {
		try {
			return createMindMapAssetVisualDescriptor(
				registry.resolveByKind(markerId, "tag"),
			);
		} catch {
			return null;
		}
	}
}

function resolveMindMapDecorationDescriptorBounds(
	descriptors: readonly MindMapDecorationGeometryDescriptor[],
): LayoutBounds | null {
	let result: LayoutBounds | null = null;
	for (const descriptor of descriptors) {
		let bounds: LayoutBounds;
		switch (descriptor.kind) {
			case "boundary":
				bounds = { ...descriptor.bounds };
				break;
			case "relationship":
				bounds = boundsForMindMapPoints([
					descriptor.start,
					descriptor.control,
					descriptor.end,
				]);
				if (descriptor.labelAnchor !== null && descriptor.label !== undefined) {
					bounds = unionMindMapLayoutBounds(bounds, {
						x: descriptor.labelAnchor.x -
							Math.min(120, descriptor.label.length * 3.5),
						y: descriptor.labelAnchor.y - 18,
						width: Math.min(240, descriptor.label.length * 7),
						height: 20,
					});
				}
				break;
			case "summary": {
				bounds = boundsForMindMapPoints(descriptor.bracket);
				const textWidth = Math.min(240, descriptor.text.length * 7);
				bounds = unionMindMapLayoutBounds(bounds, {
					x:
						descriptor.textAlignment === "end"
							? descriptor.textAnchor.x - textWidth
							: descriptor.textAlignment === "center"
								? descriptor.textAnchor.x - textWidth / 2
								: descriptor.textAnchor.x,
					y: descriptor.textAnchor.y - 16,
					width: textWidth,
					height: 20,
				});
				break;
			}
			case "marker": {
				const labelWidth =
					descriptor.label === undefined
						? 0
						: Math.min(240, descriptor.label.length * 7 + 4);
				bounds = {
					x: descriptor.anchor.x + 1,
					y:
						descriptor.anchor.y - MIND_MAP_DECORATION_MARKER_SIZE - 7,
					width: MIND_MAP_DECORATION_MARKER_SIZE + 8 + labelWidth,
					height: MIND_MAP_DECORATION_MARKER_SIZE + 8,
				};
				break;
			}
		}
		result = result === null ? bounds : unionMindMapLayoutBounds(result, bounds);
	}
	return result;
}

function boundsForMindMapPoints(
	points: readonly LayoutPoint[],
): LayoutBounds {
	let minimumX = Number.POSITIVE_INFINITY;
	let minimumY = Number.POSITIVE_INFINITY;
	let maximumX = Number.NEGATIVE_INFINITY;
	let maximumY = Number.NEGATIVE_INFINITY;
	for (const point of points) {
		minimumX = Math.min(minimumX, point.x);
		minimumY = Math.min(minimumY, point.y);
		maximumX = Math.max(maximumX, point.x);
		maximumY = Math.max(maximumY, point.y);
	}
	return Number.isFinite(minimumX)
		? {
				x: minimumX,
				y: minimumY,
				width: Math.max(0, maximumX - minimumX),
				height: Math.max(0, maximumY - minimumY),
			}
		: { x: 0, y: 0, width: 0, height: 0 };
}

function unionMindMapLayoutBounds(
	first: LayoutBounds,
	second: LayoutBounds | null,
): LayoutBounds {
	if (second === null) {
		return { ...first };
	}
	const left = Math.min(first.x, second.x);
	const top = Math.min(first.y, second.y);
	const right = Math.max(first.x + first.width, second.x + second.width);
	const bottom = Math.max(first.y + first.height, second.y + second.height);
	return {
		x: left,
		y: top,
		width: Math.max(0, right - left),
		height: Math.max(0, bottom - top),
	};
}

function formatLocalizedMindMapDisclosureAccessibleText(
	context: MindMapDisclosureAccessibleTextContext,
	translator: ObMindTranslator,
): string {
	if (context.state === "collapsed") {
		return translator.t("renderer.disclosure.expand-aria", {
			node: context.nodeText,
			count: translator.formatNumber(context.hiddenDescendantCount),
		});
	}
	return translator.t("renderer.disclosure.collapse-aria", {
		node: context.nodeText,
		directCount: translator.formatNumber(context.directChildCount),
		totalCount: translator.formatNumber(context.totalDescendantCount),
	});
}

export function createDomSvgMindMapRendererFactory(
	options: DomSvgMindMapRendererOptions = {},
): MindMapRendererFactory {
	return {
		create(callbacks) {
			return new DomSvgMindMapRenderer(callbacks, options);
		},
	};
}

export const DOM_SVG_MIND_MAP_RENDERER_FACTORY =
	createDomSvgMindMapRendererFactory();

function findNodeById(
	root: MindMapNode,
	nodeId: string,
): MindMapNode | null {
	const pending = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		if (node.id === nodeId) {
			return node;
		}
		for (const child of node.children) {
			pending.push(child);
		}
	}
	return null;
}

/**
 * Match the source-backed target while deliberately ignoring the whole-buffer
 * revision. An equivalent refresh can keep the draft visible, but the editor
 * retains its original immutable revision so a later commit still stale-
 * rejects instead of rebinding a line-based ID to a newly inserted duplicate.
 */
export function nodeMatchesMindMapEditSnapshot(
	node: MindMapNode,
	snapshot: MindMapNodeEditSnapshot,
): boolean {
	const current = createMindMapNodeEditSnapshot(
		node,
		snapshot.sourceRevision,
	);
	if (
		current.id !== snapshot.id ||
		current.kind !== snapshot.kind ||
		current.text !== snapshot.text ||
		current.source.path !== snapshot.source.path ||
		current.source.line !== snapshot.source.line ||
		current.source.ch !== snapshot.source.ch
	) {
		return false;
	}

	switch (current.kind) {
		case "root":
			return snapshot.kind === "root";
		case "heading":
			return (
				snapshot.kind === "heading" &&
				current.level === snapshot.level &&
				current.sourceLine === snapshot.sourceLine
			);
		case "list":
			return (
				snapshot.kind === "list" &&
				current.marker === snapshot.marker &&
				current.ordered === snapshot.ordered &&
				current.ordinal === snapshot.ordinal &&
				current.taskState === snapshot.taskState &&
				current.sourceLine === snapshot.sourceLine
			);
	}
}

export type MindMapNodeEditorBlurAction =
	| "commit"
	| "keep"
	| "refocus";

/**
 * Distinguish a deliberate same-window focus move from transient browser,
 * window, or leaf focus changes. Only the former is an implicit blur commit.
 */
export function resolveMindMapNodeEditorBlurAction(input: {
	readonly activeElement: "document" | "editor" | "other";
	readonly documentHasFocus: boolean;
	readonly hasRelatedTarget: boolean;
}): MindMapNodeEditorBlurAction {
	if (input.hasRelatedTarget) {
		return "commit";
	}
	if (!input.documentHasFocus || input.activeElement === "editor") {
		return "keep";
	}
	return input.activeElement === "document" ? "refocus" : "commit";
}

function collectNodeIds(root: MindMapNode): Set<string> {
	const ids = new Set<string>();
	const pending = [root];

	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		ids.add(node.id);
		for (let index = node.children.length - 1; index >= 0; index -= 1) {
			const child = node.children[index];
			if (child !== undefined) {
				pending.push(child);
			}
		}
	}

	return ids;
}

function collectExportNodeEntries(
	root: MindMapNode,
	collapsedNodeIds: ReadonlySet<string>,
): readonly MindMapExportNodeEntry[] {
	const entries: MindMapExportNodeEntry[] = [];
	const pending: MindMapExportNodeEntry[] = [{ node: root, depth: 0 }];
	while (pending.length > 0) {
		const entry = pending.pop();
		if (entry === undefined) {
			continue;
		}
		entries.push(entry);
		if (collapsedNodeIds.has(entry.node.id)) {
			continue;
		}
		for (
			let index = entry.node.children.length - 1;
			index >= 0;
			index -= 1
		) {
			const child = entry.node.children[index];
			if (child !== undefined) {
				pending.push({ node: child, depth: entry.depth + 1 });
			}
		}
	}
	return entries;
}

/**
 * Export deliberately receives an interaction-free view of the current
 * document. The presentation data contracts are immutable; clone their
 * collection boundaries so a later render cannot reuse a mutable Map/array
 * owned by an integration adapter while this capture awaits fonts or layout.
 */
function createMindMapExportRenderInput(
	input: MindMapRenderInput,
	scope: MindMapExportCaptureRequest["scope"],
): MindMapRenderInput {
	const collapsedNodeIds =
		scope === "full-map"
			? new Set<string>()
			: new Set(input.interaction.collapsedNodeIds);
	return {
		root: input.root,
		sourceRevision: input.sourceRevision,
		language: input.language,
		colorScheme: input.colorScheme,
		presentation: {
			...input.presentation,
			nodes: new Map(input.presentation.nodes),
			edges: new Map(input.presentation.edges),
			decorations: [...input.presentation.decorations],
		},
		interaction: {
			collapsedNodeIds,
			selectedNodeIds: new Set(),
			primarySelectedNodeId: null,
			selectionAnchorNodeId: null,
			focusedNodeId: null,
			hoveredNodeId: null,
			focusRootNodeId: input.interaction.focusRootNodeId,
			visibleDepthLimit: input.interaction.visibleDepthLimit,
			selectedDecorationId: null,
			minimapVisible: false,
			viewport: null,
		},
		topicCommandAvailability: {
			...input.topicCommandAvailability,
		},
	};
}

/**
 * Keep a measurement layer visually isolated from subsequent tab renders.
 * The renderer writes theme/effect variables inline on its container; copying
 * the resolved custom-property values at click time prevents a palette/theme
 * change during an awaited font load from leaking into the export snapshot.
 */
function copyMindMapExportCssSnapshot(
	source: HTMLElement,
	target: HTMLElement,
): void {
	for (let index = 0; index < source.attributes.length; index += 1) {
		const attribute = source.attributes.item(index);
		if (attribute === null) {
			continue;
		}
		if (attribute.name.startsWith("data-obmind-")) {
			target.setAttribute(attribute.name, attribute.value);
		}
	}
	for (let index = 0; index < source.style.length; index += 1) {
		const property = source.style.item(index);
		if (!property.startsWith("--")) {
			continue;
		}
		setCssProperty(
			target,
			property,
			source.style.getPropertyValue(property),
		);
	}

	const ownerWindow = source.ownerDocument.defaultView;
	if (ownerWindow === null) {
		return;
	}
	const computed = ownerWindow.getComputedStyle(source);
	for (let index = 0; index < computed.length; index += 1) {
		const property = computed.item(index);
		if (!property.startsWith("--")) {
			continue;
		}
		const value = computed.getPropertyValue(property).trim();
		if (value.length > 0) {
			setCssProperty(target, property, value);
		}
	}
}

function reportMindMapExportCaptureProgress(
	callback: MindMapExportCaptureProgressCallback | undefined,
	stage: MindMapExportCaptureStage,
	completed: number,
	total: number,
): void {
	if (callback === undefined) {
		return;
	}
	const normalizedTotal = Math.max(0, Math.floor(total));
	const normalizedCompleted = Math.min(
		normalizedTotal,
		Math.max(0, Math.floor(completed)),
	);
	if (!shouldReportMindMapExportProgress(normalizedCompleted, normalizedTotal)) {
		return;
	}
	try {
		callback({
			stage,
			completed: normalizedCompleted,
			total: normalizedTotal,
		});
	} catch {
		// Progress is informational. A frontend repaint failure must not turn a
		// user-authorized, otherwise valid export into an error.
	}
}

function shouldReportMindMapExportProgress(
	completed: number,
	total: number,
): boolean {
	if (total <= EXPORT_WORK_BATCH_SIZE) {
		return true;
	}
	const interval = Math.max(1, Math.ceil(total / 24));
	return completed === 0 || completed === total || completed % interval === 0;
}

function shouldYieldMindMapExportWork(
	completed: number,
	total: number,
): boolean {
	return (
		completed > 0 &&
		completed < total &&
		completed % EXPORT_WORK_BATCH_SIZE === 0
	);
}

/**
 * Cache entries never escape directly. Consumers receive a fresh structural
 * copy so an encoder or future UI adapter cannot mutate the renderer's
 * per-tab export snapshot before a second export starts.
 */
function cloneMindMapExportScene(
	scene: MindMapExportScene,
): MindMapExportScene {
	return {
		...scene,
		bounds: { ...scene.bounds },
		canvasTexture:
			scene.canvasTexture === null ? null : { ...scene.canvasTexture },
		primitives: scene.primitives.map(cloneMindMapExportPrimitive),
		nodeShapes: [...scene.nodeShapes],
	};
}

function cloneMindMapExportPrimitive(
	primitive: MindMapExportPrimitive,
): MindMapExportPrimitive {
	switch (primitive.kind) {
		case "rect":
		case "ellipse":
		case "circle":
			return {
				...primitive,
				fill: cloneMindMapExportPaint(primitive.fill),
			};
		case "path":
			return {
				...primitive,
				fill: cloneMindMapExportPaint(primitive.fill),
				dashArray:
					primitive.dashArray === undefined
						? undefined
						: [...primitive.dashArray],
			};
		case "text":
			return { ...primitive };
	}
}

function cloneMindMapExportPaint(
	paint: MindMapExportPaint,
): MindMapExportPaint {
	switch (paint.kind) {
		case "none":
			return { kind: "none" };
		case "color":
			return { kind: "color", value: paint.value };
		case "hatch":
		case "speckle":
			return { ...paint };
	}
}

function createMindMapExportAbortContext(
	upstream: AbortSignal | undefined,
): MindMapExportAbortContext {
	const controller = new AbortController();
	const forwardAbort = (): void => {
		controller.abort();
	};
	if (upstream?.aborted === true) {
		forwardAbort();
	} else {
		upstream?.addEventListener("abort", forwardAbort, { once: true });
	}
	return {
		controller,
		signal: controller.signal,
		dispose(): void {
			upstream?.removeEventListener("abort", forwardAbort);
		},
	};
}

async function waitForMindMapExportFonts(
	ownerDocument: Document,
	signal: AbortSignal | undefined,
	language: ObMindLanguage,
): Promise<void> {
	const ready = ownerDocument.fonts?.ready;
	if (ready === undefined) {
		return;
	}
	await waitForMindMapExportPromise(ready, signal, language);
}

function waitForMindMapExportPromise<T>(
	promise: PromiseLike<T>,
	signal: AbortSignal | undefined,
	language: ObMindLanguage,
): Promise<T> {
	throwIfMindMapExportAborted(signal);
	return new Promise<T>((resolve, reject) => {
		const cleanup = (): void => {
			signal?.removeEventListener("abort", handleAbort);
		};
		const handleAbort = (): void => {
			cleanup();
			reject(
				new MindMapExportError(
					createObMindTranslator(language).t("renderer.export.cancelled"),
					"aborted",
				),
			);
		};
		void promise.then(
			(value) => {
				cleanup();
				resolve(value);
			},
			(error: unknown) => {
				cleanup();
				reject(
					error instanceof Error
						? error
						: new Error(
								createObMindTranslator(language).t(
									"renderer.export.preparation-failed",
								),
							),
				);
			},
		);
		signal?.addEventListener("abort", handleAbort, { once: true });
		if (signal?.aborted === true) {
			handleAbort();
		}
	});
}

async function waitForExportLayout(
	ownerDocument: Document,
	signal: AbortSignal | undefined,
	language: ObMindLanguage,
): Promise<void> {
	throwIfMindMapExportAborted(signal);
	const ownerWindow = ownerDocument.defaultView;
	if (ownerWindow === null) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		let frame = 0;
		const cleanup = (): void => {
			if (frame !== 0) {
				ownerWindow.cancelAnimationFrame(frame);
			}
			signal?.removeEventListener("abort", handleAbort);
		};
		const handleAbort = (): void => {
			cleanup();
			reject(
				new MindMapExportError(
					createObMindTranslator(language).t("renderer.export.cancelled"),
					"aborted",
				),
			);
		};
		frame = ownerWindow.requestAnimationFrame(() => {
			frame = 0;
			cleanup();
			resolve();
		});
		signal?.addEventListener("abort", handleAbort, { once: true });
		if (signal?.aborted === true) {
			handleAbort();
		}
	});
}

type ExportColorResolver = (color: string) => string;

function createExportColorResolver(
	ownerDocument: Document,
	container: HTMLElement,
): MindMapExportColorResolverSession {
	const ownerWindow = ownerDocument.defaultView;
	const probe = createHtmlElement(ownerDocument, "span");
	probe.className = "obmind-export-color-probe";
	container.append(probe);
	const cache = new Map<string, string>();
	return {
		resolve(color: string): string {
			const candidate = color.trim();
			const cached = cache.get(candidate);
			if (cached !== undefined) {
				return cached;
			}
			if (
				candidate.length === 0 ||
				candidate.toLowerCase().includes("url(") ||
				candidate.includes(";") ||
				candidate.includes("{") ||
				candidate.includes("}")
			) {
				cache.set(candidate, "transparent");
				return "transparent";
			}
			setCssProperty(probe, "color", null);
			setCssProperty(probe, "color", candidate);
			const resolved =
				ownerWindow?.getComputedStyle(probe).color.trim() ?? "";
			const result =
				resolved.length > 0 && !resolved.toLowerCase().includes("url(")
					? resolved
					: "transparent";
			cache.set(candidate, result);
			return result;
		},
		dispose(): void {
			probe.remove();
			cache.clear();
		},
	};
}

async function appendExportEdgePrimitives(
	primitives: MindMapExportPrimitive[],
	result: LayoutResult,
	input: MindMapRenderInput,
	colors: MindMapThemeColorTokens,
	branchIndexes: ReadonlyMap<string, number>,
	effects: DomSvgMindMapEffectRegistry,
	resolveColor: ExportColorResolver,
	signal: AbortSignal | undefined,
	options: {
		readonly ownerDocument: Document;
		readonly yieldBetweenBatches: boolean;
		readonly onProcessed: () => void;
	},
): Promise<void> {
	const nodesById = new Map(
		result.nodes.map((positioned) => [positioned.node.id, positioned]),
	);
	for (let index = 0; index < result.edges.length; index += 1) {
		throwIfMindMapExportAborted(signal);
		const edge = result.edges[index];
		if (edge === undefined) {
			continue;
		}
		const from = nodesById.get(edge.fromId);
		const to = nodesById.get(edge.toId);
		if (from === undefined || to === undefined) {
			options.onProcessed();
			continue;
		}
		const edgePresentation = resolveEdgePresentation(
			edge,
			input.presentation,
			branchIndexes.get(edge.toId),
		);
		const routing =
			edgePresentation?.routing ??
			input.presentation.theme.tokens.edge.routing;
		const geometry =
			edge.path === undefined
				? createFallbackLayoutPath(
						from,
						to,
						input.presentation.layout.orientation,
						routing,
					)
				: input.presentation.layout.engineId ===
					  BILATERAL_TREE_LAYOUT_ENGINE_ID
					? applyRoutingToEnginePath(edge.path, routing)
					: edge.path;
		const color = resolveColor(
			resolveThemeColor(
				resolveEdgeColor(edgePresentation, input.presentation, colors),
			),
		);
		const width = resolveMindMapConnectorWidth(
			input.presentation,
			edgePresentation,
		);
		const connectorProfile = resolveMindMapConnectorStrokeProfile(
			input.presentation.formatting.connectorProfile,
			input.presentation.theme.tokens.edge.connectorProfile,
		);
		const lineStyle =
			edgePresentation?.lineStyle ??
			input.presentation.theme.tokens.edge.lineStyle;
		const dashArray =
			lineStyle === "dashed"
				? [6, 4]
				: lineStyle === "dotted"
					? [2, 3]
					: undefined;
		const handDrawn = effects.createEdgeStrokes(
			input.presentation.theme.tokens.effects.edgeStroke,
			sampleLayoutPath(geometry),
			edge.id,
		);
		if (connectorProfile.kind === "taper-to-child") {
			const widths = resolveMindMapConnectorStrokeWidths(
				width,
				connectorProfile,
			);
			const strokes =
				handDrawn ??
				[
					{
						points: geometry,
						opacity: 1,
						widthScale: 1,
					},
				];
			for (let passIndex = 0; passIndex < strokes.length; passIndex += 1) {
				const stroke = strokes[passIndex];
				if (stroke === undefined) {
					continue;
				}
				const outlines = createVariableWidthConnectorOutlinesForLineStyle(
					stroke.points,
					connectorProfile,
					widths.startWidth * stroke.widthScale,
					widths.endWidth * stroke.widthScale,
					lineStyle,
				);
				for (
					let segmentIndex = 0;
					segmentIndex < outlines.length;
					segmentIndex += 1
				) {
					const outline = outlines[segmentIndex];
					if (outline === undefined) {
						continue;
					}
					primitives.push({
						kind: "path",
						id: `${edge.id}:connector:${String(passIndex)}:${String(segmentIndex)}`,
						data: createLayoutPathData(outline.closedPath),
						fill: { kind: "color", value: color },
						stroke: "transparent",
						strokeWidth: 0,
						opacity: stroke.opacity,
					});
				}
			}
		} else if (handDrawn === null) {
			primitives.push({
				kind: "path",
				id: edge.id,
				data: createLayoutPathData(geometry),
				fill: { kind: "none" },
				stroke: color,
				strokeWidth: width,
				dashArray,
				lineCap: "round",
				lineJoin: "round",
			});
		} else {
			for (const stroke of handDrawn) {
				primitives.push({
					kind: "path",
					id: edge.id,
					data: createPolylinePathData(stroke.points),
					fill: { kind: "none" },
					stroke: color,
					strokeWidth: width * stroke.widthScale,
					dashArray,
					lineCap: "round",
					lineJoin: "round",
					opacity: stroke.opacity,
				});
			}
		}

		const markerSpec =
			input.presentation.theme.tokens.effects.terminalMarker;
		const markerEffect = effects.resolveTerminalMarker(
			markerSpec?.effect ?? null,
		);
		const shouldRenderMarker =
			markerSpec !== null &&
			markerEffect !== null &&
			(markerSpec.placement === "all-targets" ||
				to.node.children.length === 0);
		if (shouldRenderMarker) {
			const marker = calculateTerminalMarkerGeometry(
				geometry,
				markerSpec.size,
			);
			primitives.push({
				kind: "circle",
				id: `${edge.id}:terminal`,
				centerX: marker.center.x,
				centerY: marker.center.y,
				radius: marker.radius,
				fill: { kind: "color", value: color },
				stroke: "transparent",
				strokeWidth: 0,
				opacity: markerEffect.opacity,
			});
		}
		options.onProcessed();
		if (
			options.yieldBetweenBatches &&
			shouldYieldMindMapExportWork(index + 1, result.edges.length)
		) {
			await waitForExportLayout(
				options.ownerDocument,
				signal,
				input.language,
			);
		}
	}
}

interface MindMapExportNodeAssetContext {
	readonly input: MindMapRenderInput;
	readonly colors: MindMapThemeColorTokens;
	readonly branchIndexes: ReadonlyMap<string, number>;
	readonly assetRegistry: MindMapAssetRegistry;
	readonly effects: DomSvgMindMapEffectRegistry;
}

function appendExportNodePrimitives(
	primitives: MindMapExportPrimitive[],
	element: HTMLElement,
	positioned: PositionedNode,
	shapes: Set<MindMapExportScene["nodeShapes"][number]>,
	assetContext: MindMapExportNodeAssetContext,
	resolveColor: ExportColorResolver,
	signal: AbortSignal | undefined,
	coordinateScale: number,
): void {
	throwIfMindMapExportAborted(signal);
	const content = element.querySelector<HTMLElement>(".obmind-node-content");
	const ownerWindow = element.ownerDocument.defaultView;
	if (content === null || ownerWindow === null) {
		return;
	}
	const style = ownerWindow.getComputedStyle(content);
	const shape = resolveExportNodeShape(element.dataset.obmindNodeShape);
	shapes.add(shape);
	const width = content.offsetWidth || positioned.width;
	const height = content.offsetHeight || positioned.height;
	const x = positioned.x;
	const y = positioned.y;
	const stroke = resolveColor(
		style.getPropertyValue("--obmind-node-stroke").trim() ||
			style.borderTopColor ||
			style.color,
	);
	const strokeWidth = parseCssPixelValue(style.borderTopWidth, 0);
	const strokeEffect = assetContext.effects.resolveNodeStroke(
		assetContext.input.presentation.theme.tokens.effects.nodeStroke,
		positioned.node.id,
	);
	const effectStroke = resolveExportNodeEffectStroke(
		element,
		stroke,
		strokeEffect,
		ownerWindow,
		resolveColor,
	);
	const fillEffect = assetContext.effects.resolveNodeFill(
		assetContext.input.presentation.theme.tokens.effects.nodeFill,
	);
	const fill = createExportNodeFill(
		fillEffect,
		style,
		effectStroke,
		resolveColor,
	);
	const baseStroke =
		strokeEffect?.exportEffect.baseStroke === "replace"
			? "transparent"
			: stroke;
	const baseStrokeWidth =
		strokeEffect?.exportEffect.baseStroke === "replace" ? 0 : strokeWidth;

	if (shape === "underline") {
		const bottomWidth = parseCssPixelValue(style.borderBottomWidth, strokeWidth);
		primitives.push({
			kind: "path",
			id: `${positioned.node.id}:shape`,
			data: `M ${String(x)} ${String(y + height)} L ${String(x + width)} ${String(y + height)}`,
			fill: { kind: "none" },
			stroke: resolveColor(style.borderBottomColor || stroke),
			strokeWidth: bottomWidth,
			lineCap: "round",
		});
	} else if (shape !== "none") {
		primitives.push(
			createExportNodeShapePrimitive(
				positioned.node.id,
				shape,
				x,
				y,
				width,
				height,
				fill,
				baseStroke,
				baseStrokeWidth,
				style,
			),
		);
		appendExportNodeStrokeEffect(
			primitives,
			positioned.node.id,
			shape,
			x,
			y,
			width,
			height,
			effectStroke,
			strokeWidth,
			style,
			strokeEffect,
		);
	}

	appendExportTaskPrimitive(
		primitives,
		element,
		positioned,
		content,
		resolveColor,
		coordinateScale,
	);
	appendExportNodeAssetPrimitives(
		primitives,
		element,
		positioned,
		content,
		assetContext,
		resolveColor,
		coordinateScale,
		signal,
	);
	primitives.push(
		...captureExportTextPrimitives(
			element,
			positioned,
			content,
			resolveColor,
			signal,
			coordinateScale,
		),
	);
}

function resolveExportNodeEffectStroke(
	element: HTMLElement,
	fallbackStroke: string,
	effect: DomSvgNodeStrokeEffect | null,
	ownerWindow: Window,
	resolveColor: ExportColorResolver,
): string {
	if (effect?.contour === null || effect?.contour === undefined) {
		return fallbackStroke;
	}
	const path = element.querySelector<SVGPathElement>(
		".obmind-node-stroke-path",
	);
	if (path === null) {
		return fallbackStroke;
	}
	const resolved = resolveColor(ownerWindow.getComputedStyle(path).stroke);
	return resolved === "transparent" ? fallbackStroke : resolved;
}

function resolveExportNodeShape(
	value: string | undefined,
): MindMapExportScene["nodeShapes"][number] {
	switch (value) {
		case "rectangle":
		case "pill":
		case "ellipse":
		case "underline":
		case "none":
		case "rounded-rectangle":
			return value;
		default:
			return "rounded-rectangle";
	}
}

function resolveHandDrawnNodeContourShape(
	shape: MindMapNodePresentation["shape"],
): HandDrawnNodeContourShape | null {
	switch (shape) {
		case "rectangle":
		case "rounded-rectangle":
		case "pill":
		case "ellipse":
			return shape;
		case "none":
		case "underline":
			return null;
		case undefined:
			return "rounded-rectangle";
	}
}

function createExportNodeFill(
	effect: DomSvgNodeFillEffect | null,
	style: CSSStyleDeclaration,
	stroke: string,
	resolveColor: ExportColorResolver,
): MindMapExportPaint {
	const background = resolveColor(style.backgroundColor);
	return (
		effect?.createExportPaint({ background, stroke }) ?? {
			kind: "color",
			value: background,
		}
	);
}

function createExportNodeShapePrimitive(
	id: string,
	shape: MindMapExportScene["nodeShapes"][number],
	x: number,
	y: number,
	width: number,
	height: number,
	fill: MindMapExportPaint,
	stroke: string,
	strokeWidth: number,
	style: CSSStyleDeclaration,
): MindMapExportRectPrimitive | MindMapExportEllipsePrimitive {
	if (shape === "ellipse") {
		return {
			kind: "ellipse",
			id: `${id}:shape`,
			centerX: x + width / 2,
			centerY: y + height / 2,
			radiusX: width / 2,
			radiusY: height / 2,
			fill,
			stroke,
			strokeWidth,
		};
	}
	const radius =
		shape === "rectangle"
			? 0
			: shape === "pill"
				? Math.min(width, height) / 2
				: parseCssPixelValue(style.borderTopLeftRadius, 8);
	return {
		kind: "rect",
		id: `${id}:shape`,
		x,
		y,
		width,
		height,
		radiusX: radius,
		radiusY: radius,
		fill,
		stroke,
		strokeWidth,
	};
}

function appendExportNodeStrokeEffect(
	primitives: MindMapExportPrimitive[],
	id: string,
	shape: MindMapExportScene["nodeShapes"][number],
	x: number,
	y: number,
	width: number,
	height: number,
	stroke: string,
	strokeWidth: number,
	style: CSSStyleDeclaration,
	effect: DomSvgNodeStrokeEffect | null,
): void {
	if (effect === null) {
		return;
	}
	const { exportEffect } = effect;
	const effectStrokeWidth = Math.max(
		exportEffect.minimumWidth,
		strokeWidth * exportEffect.widthScale,
	);
	const contourShape = resolveHandDrawnNodeContourShape(shape);
	if (effect.contour !== null && contourShape !== null) {
		const contourInset = Math.max(
			exportEffect.inset,
			effect.contour.roughness + effectStrokeWidth / 2 + 0.25,
		);
		const contour = createHandDrawnNodeContour({
			shape: contourShape,
			width,
			height,
			radius:
				shape === "pill"
					? Math.min(width, height) / 2
					: parseCssPixelValue(style.borderTopLeftRadius, 8),
			inset: contourInset,
			stableKey: id,
			roughness: effect.contour.roughness,
			sampleSpacing: effect.contour.sampleSpacing,
			maximumPointCount: effect.contour.maximumPointCount,
		}).map((point) => ({ x: x + point.x, y: y + point.y }));
		primitives.push({
			kind: "path",
			id: `${id}:contour`,
			data: createClosedPolylinePathData(contour),
			fill: { kind: "none" },
			stroke,
			strokeWidth: effectStrokeWidth,
			dashArray: effect.contour.dashArray ?? undefined,
			lineCap: "round",
			lineJoin: "round",
			opacity: exportEffect.opacity,
		});
		return;
	}
	const inset = exportEffect.inset;
	const offsetX = exportEffect.offsetX;
	const offsetY = exportEffect.offsetY;
	const rotation = exportEffect.rotationDegrees;
	const innerWidth = Math.max(1, width - inset * 2);
	const innerHeight = Math.max(1, height - inset * 2);
	const primitive = createExportNodeShapePrimitive(
		`${id}:double`,
		shape,
		x + inset + offsetX,
		y + inset + offsetY,
		innerWidth,
		innerHeight,
		{ kind: "none" },
		stroke,
		effectStrokeWidth,
		style,
	);
	primitives.push({
		...primitive,
		opacity: exportEffect.opacity,
		transform:
			Math.abs(rotation) > 0.001
				? `rotate(${String(rotation)} ${String(x + width / 2)} ${String(y + height / 2)})`
				: undefined,
	});
}

function appendExportTaskPrimitive(
	primitives: MindMapExportPrimitive[],
	element: HTMLElement,
	positioned: PositionedNode,
	content: HTMLElement,
	resolveColor: ExportColorResolver,
	coordinateScale: number,
): void {
	const task = element.querySelector<HTMLButtonElement>(
		".obmind-node-task-checkbox",
	);
	if (task === null || task.hidden) {
		return;
	}
	const ownerWindow = element.ownerDocument.defaultView;
	if (ownerWindow === null) {
		return;
	}
	const style = ownerWindow.getComputedStyle(task);
	const contentRect = content.getBoundingClientRect();
	const taskRect = task.getBoundingClientRect();
	const scale = normalizeMindMapExportCoordinateScale(coordinateScale);
	const width =
		task.offsetWidth ||
		taskRect.width / scale ||
		MIND_MAP_TASK_CONTROL_SIZE;
	const height =
		task.offsetHeight ||
		taskRect.height / scale ||
		MIND_MAP_TASK_CONTROL_SIZE;
	const x = positioned.x + (taskRect.left - contentRect.left) / scale;
	const y = positioned.y + (taskRect.top - contentRect.top) / scale;
	primitives.push({
		kind: "rect",
		id: `${positioned.node.id}:task`,
		x,
		y,
		width,
		height,
		radiusX: parseCssPixelValue(style.borderTopLeftRadius, 3),
		radiusY: parseCssPixelValue(style.borderTopLeftRadius, 3),
		fill: { kind: "color", value: resolveColor(style.backgroundColor) },
		stroke: resolveColor(style.borderTopColor || style.color),
		strokeWidth: parseCssPixelValue(style.borderTopWidth, 1),
	});
	if (task.getAttribute("aria-checked") === "true") {
		primitives.push({
			kind: "path",
			id: `${positioned.node.id}:task-check`,
			data: createMindMapTaskCheckmarkPathData({
				x,
				y,
				width,
				height,
			}),
			fill: { kind: "none" },
			stroke: resolveColor(style.color),
			strokeWidth: resolveMindMapTaskCheckmarkStrokeWidth(width, height),
			lineCap: "round",
			lineJoin: "round",
		});
	}
}

function appendExportNodeAssetPrimitives(
	primitives: MindMapExportPrimitive[],
	element: HTMLElement,
	positioned: PositionedNode,
	content: HTMLElement,
	context: MindMapExportNodeAssetContext,
	resolveColor: ExportColorResolver,
	coordinateScale: number,
	signal: AbortSignal | undefined,
): void {
	const container = element.querySelector<HTMLElement>(".obmind-node-assets");
	const ownerWindow = element.ownerDocument.defaultView;
	if (container === null || container.hidden || ownerWindow === null) {
		return;
	}
	const contrastResolver: MindMapThemeColorResolver = (color) =>
		parseMindMapCssColor(resolveColor(resolveThemeColor(color)));
	const nodePresentation = resolveNodePresentation(
		positioned.node,
		positioned.depth,
		context.input.presentation,
		context.input.colorScheme,
		context.branchIndexes.get(positioned.node.id),
		contrastResolver,
	);
	const appearance = resolveNodeAppearanceColors(
		nodePresentation,
		context.input.presentation,
		context.colors,
		positioned.depth === 0,
	);
	const colors = createMindMapAssetExportColorsForAppearance(
		context.colors,
		appearance,
		resolveColor,
	);
	const contentRect = content.getBoundingClientRect();
	const contentStyle = ownerWindow.getComputedStyle(content);
	const scale = normalizeMindMapExportCoordinateScale(coordinateScale);
	const fallbackX =
		positioned.x + parseCssPixelValue(contentStyle.paddingLeft, 8);
	const fallbackY =
		positioned.y +
		Math.max(0, (positioned.height - MIND_MAP_NODE_ASSET_SIZE) / 2);
	const assetElements = Array.from(
		container.querySelectorAll<SVGSVGElement>(".obmind-node-asset"),
	);
	for (let index = 0; index < assetElements.length; index += 1) {
		throwIfMindMapExportAborted(signal);
		const assetElement = assetElements[index];
		const assetId = assetElement?.dataset.obmindAssetId;
		if (assetElement === undefined || assetId === undefined) {
			continue;
		}
		let asset: MindMapAssetVisualDescriptor;
		try {
			asset = createMindMapAssetVisualDescriptor(
				context.assetRegistry.resolve(assetId),
			);
		} catch {
			continue;
		}
		const rect = assetElement.getBoundingClientRect();
		const width =
			rect.width > 0
				? rect.width / scale
				: MIND_MAP_NODE_ASSET_SIZE;
		const height =
			rect.height > 0
				? rect.height / scale
				: MIND_MAP_NODE_ASSET_SIZE;
		const x =
			rect.width > 0
				? positioned.x + (rect.left - contentRect.left) / scale
				: fallbackX +
					index * (MIND_MAP_NODE_ASSET_SIZE + MIND_MAP_NODE_ASSET_GAP);
		const y =
			rect.height > 0
				? positioned.y + (rect.top - contentRect.top) / scale
				: fallbackY;
		primitives.push(
			...createMindMapAssetExportPrimitives({
				asset,
				bounds: { x, y, width, height },
				colors,
				fit: "contain",
				idPrefix: `${positioned.node.id}:asset:${String(index)}`,
			}),
		);
	}
}

interface MutableExportTextRun {
	primitive: MindMapExportTextPrimitive;
	endX: number;
	top: number;
	styleSignature: string;
}

interface MindMapExportTextLineFragment {
	readonly text: string;
	readonly rect: DOMRect;
}

function captureExportTextPrimitives(
	element: HTMLElement,
	positioned: PositionedNode,
	content: HTMLElement,
	resolveColor: ExportColorResolver,
	signal: AbortSignal | undefined,
	coordinateScale: number,
): readonly MindMapExportTextPrimitive[] {
	const label = element.querySelector<HTMLElement>(".obmind-node-label");
	const ownerDocument = element.ownerDocument;
	const ownerWindow = ownerDocument.defaultView;
	if (label === null || ownerWindow === null) {
		return [];
	}
	const contentRect = content.getBoundingClientRect();
	const runs: MutableExportTextRun[] = [];
	let hasUsableTextGeometry = false;
	const walker = ownerDocument.createTreeWalker(
		label,
		4,
	);
	let textNode = walker.nextNode();
	while (textNode !== null) {
		throwIfMindMapExportAborted(signal);
		const parent = textNode.parentElement ?? label;
		const style = ownerWindow.getComputedStyle(parent);
		for (const fragment of collectMindMapExportTextLineFragments(
			ownerDocument,
			textNode,
			signal,
		)) {
			if (fragment.rect.width > 0) {
				hasUsableTextGeometry = true;
			}
			if (fragment.rect.width > 0 || fragment.text.trim().length > 0) {
				appendExportTextRun(
					runs,
					fragment.text,
					fragment.rect,
					contentRect,
					positioned,
					style,
					resolveColor,
					coordinateScale,
				);
			}
		}
		textNode = walker.nextNode();
	}

	if (runs.length > 0 && hasUsableTextGeometry) {
		return runs.map(({ primitive }) => primitive);
	}
	const style = ownerWindow.getComputedStyle(label);
	const fontSize = parseCssPixelValue(style.fontSize, 13);
	const lineHeight = parseCssPixelValue(style.lineHeight, fontSize * 1.2);
	return [
		{
			kind: "text",
			id: `${positioned.node.id}:text`,
			x:
				positioned.x +
				parseCssPixelValue(
					ownerWindow.getComputedStyle(content).paddingLeft,
					8,
				),
			y:
				positioned.y +
				parseCssPixelValue(
					ownerWindow.getComputedStyle(content).paddingTop,
					4,
				) +
				(lineHeight - fontSize) / 2 +
				fontSize * 0.8,
			text: label.textContent ?? positioned.node.text,
			fill: resolveColor(style.color),
			fontFamily: style.fontFamily,
			fontSize,
			fontWeight: style.fontWeight,
			fontStyle: style.fontStyle === "italic" ? "italic" : "normal",
			textDecoration: style.textDecorationLine.includes("line-through")
				? "line-through"
				: undefined,
		},
	];
}

/**
 * Resolve text one rendered line/run at a time. The former character-range
 * approach made long topics allocate a Range for every code point. Here a
 * binary search finds each visual line boundary, reducing DOM range work from
 * O(characters) to roughly O(lines × log(characters per line)).
 */
function collectMindMapExportTextLineFragments(
	ownerDocument: Document,
	textNode: Node,
	signal: AbortSignal | undefined,
): readonly MindMapExportTextLineFragment[] {
	const text = textNode.textContent ?? "";
	const fragments: MindMapExportTextLineFragment[] = [];
	let logicalLineStart = 0;
	for (let offset = 0; offset <= text.length; offset += 1) {
		const isLineEnd =
			offset === text.length ||
			text[offset] === "\n" ||
			text[offset] === "\r";
		if (!isLineEnd) {
			continue;
		}
		if (logicalLineStart < offset) {
			appendMindMapExportVisualLineFragments(
				fragments,
				ownerDocument,
				textNode,
				text,
				logicalLineStart,
				offset,
				signal,
			);
		}
		if (text[offset] === "\r" && text[offset + 1] === "\n") {
			offset += 1;
		}
		logicalLineStart = offset + 1;
	}
	return fragments;
}

function appendMindMapExportVisualLineFragments(
	fragments: MindMapExportTextLineFragment[],
	ownerDocument: Document,
	textNode: Node,
	text: string,
	start: number,
	end: number,
	signal: AbortSignal | undefined,
): void {
	let lineStart = start;
	while (lineStart < end) {
		throwIfMindMapExportAborted(signal);
		const lineEnd = findMindMapExportVisualLineEnd(
			ownerDocument,
			textNode,
			text,
			lineStart,
			end,
		);
		if (lineEnd <= lineStart) {
			break;
		}
		const rect = getMindMapExportTextRangeRect(
			ownerDocument,
			textNode,
			lineStart,
			lineEnd,
		);
		if (rect !== null) {
			fragments.push({
				text: text.slice(lineStart, lineEnd),
				rect,
			});
		}
		lineStart = lineEnd;
	}
}

function findMindMapExportVisualLineEnd(
	ownerDocument: Document,
	textNode: Node,
	text: string,
	start: number,
	end: number,
): number {
	const boundaries = collectMindMapExportTextBoundaries(text, start, end);
	if (boundaries.length <= 1) {
		return end;
	}
	let lower = 1;
	let upper = boundaries.length - 1;
	let best = 1;
	while (lower <= upper) {
		const middle = Math.floor((lower + upper) / 2);
		const boundary = boundaries[middle];
		if (boundary === undefined) {
			break;
		}
		const rectangles = getMindMapExportTextRangeRects(
			ownerDocument,
			textNode,
			start,
			boundary,
		);
		if (rectangles.length <= 1) {
			best = middle;
			lower = middle + 1;
		} else {
			upper = middle - 1;
		}
	}
	return boundaries[best] ?? end;
}

function collectMindMapExportTextBoundaries(
	text: string,
	start: number,
	end: number,
): readonly number[] {
	const boundaries: number[] = [start];
	let offset = start;
	while (offset < end) {
		const codePoint = text.codePointAt(offset);
		offset += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
		boundaries.push(Math.min(offset, end));
	}
	return boundaries;
}

function getMindMapExportTextRangeRect(
	ownerDocument: Document,
	textNode: Node,
	start: number,
	end: number,
): DOMRect | null {
	return getMindMapExportTextRangeRects(
		ownerDocument,
		textNode,
		start,
		end,
	)[0] ?? null;
}

function getMindMapExportTextRangeRects(
	ownerDocument: Document,
	textNode: Node,
	start: number,
	end: number,
): readonly DOMRect[] {
	const range = ownerDocument.createRange();
	try {
		range.setStart(textNode, start);
		range.setEnd(textNode, end);
		const rectangles = range.getClientRects();
		const values: DOMRect[] = [];
		for (let index = 0; index < rectangles.length; index += 1) {
			const rectangle = rectangles.item(index);
			if (rectangle !== null) {
				values.push(rectangle);
			}
		}
		return values;
	} finally {
		range.detach();
	}
}

function appendExportTextRun(
	runs: MutableExportTextRun[],
	text: string,
	rect: DOMRect,
	contentRect: DOMRect,
	positioned: PositionedNode,
	style: CSSStyleDeclaration,
	resolveColor: ExportColorResolver,
	coordinateScale: number,
): void {
	const fontSize = parseCssPixelValue(style.fontSize, 13);
	const scale = normalizeMindMapExportCoordinateScale(coordinateScale);
	const x = positioned.x + (rect.left - contentRect.left) / scale;
	const top = positioned.y + (rect.top - contentRect.top) / scale;
	const y = top + Math.max(rect.height / scale, fontSize) * 0.8;
	const styleSignature = [
		style.color,
		style.fontFamily,
		style.fontSize,
		style.fontWeight,
		style.fontStyle,
		style.textDecorationLine,
	].join("|");
	const previous = runs.at(-1);
	if (
		previous !== undefined &&
		previous.styleSignature === styleSignature &&
		Math.abs(previous.top - top) <= 1 &&
		Math.abs(previous.endX - x) <= Math.max(2, fontSize * 0.2)
	) {
		previous.primitive = {
			...previous.primitive,
			text: previous.primitive.text + text,
		};
		previous.endX = x + rect.width / scale;
		return;
	}
	runs.push({
		primitive: {
			kind: "text",
			x,
			y,
			text,
			fill: resolveColor(style.color),
			fontFamily: style.fontFamily,
			fontSize,
			fontWeight: style.fontWeight,
			fontStyle: style.fontStyle === "italic" ? "italic" : "normal",
			textDecoration: style.textDecorationLine.includes("line-through")
				? "line-through"
				: undefined,
		},
		endX: x + rect.width / scale,
		top,
		styleSignature,
	});
}

function normalizeMindMapExportCoordinateScale(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 1;
}

function parseCssPixelValue(
	value: string | undefined,
	fallback: number,
): number {
	if (value === undefined) {
		return fallback;
	}
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Palette-only changes must repaint without invalidating measured topic
 * geometry. Keep only node override fields that can affect shape, content, or
 * text measurement; color fields and branch-color selection are deliberately
 * excluded.
 */
function createNodeMeasurementOverrideSignature(
	nodes: ReadonlyMap<string, MindMapNodePresentation>,
): string {
	return JSON.stringify(
		[...nodes.entries()]
			.sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
			.map(([nodeId, presentation]) => {
				const {
					fill: _fill,
					stroke: _stroke,
					textColor: _textColor,
					branchColorIndex: _branchColorIndex,
					...measurementPresentation
				} = presentation;
				return [nodeId, measurementPresentation];
			}),
	);
}

export function resolveMindMapConnectorWidth(
	presentation: MindMapPresentation,
	edgePresentation?: MindMapEdgePresentation,
): number {
	return (
		edgePresentation?.width ??
		presentation.formatting.connectorWidth.width ??
		presentation.theme.tokens.edge.width
	);
}

export function calculateEdgeRenderPadding(
	result: LayoutResult,
	presentation: MindMapPresentation,
): number {
	if (result.edges.length === 0) {
		return MIN_EDGE_PADDING;
	}

	let maximumWidth = 0;
	for (const edge of result.edges) {
		const width = resolveMindMapConnectorWidth(
			presentation,
			presentation.edges.get(edge.id),
		);
		if (Number.isFinite(width) && width > 0) {
			maximumWidth = Math.max(maximumWidth, width);
		}
	}

	const edgeStrokeEffect =
		presentation.theme.tokens.effects.edgeStroke;
	const roughness =
		edgeStrokeEffect === null
			? 0
			: finiteEffectOption(
					edgeStrokeEffect.options.roughness,
					1.15,
					0,
					4,
				);
	const strokeBleed =
		(maximumWidth * MAX_HAND_DRAWN_WIDTH_SCALE) / 2 +
		roughness * MAX_HAND_DRAWN_OFFSET_SCALE +
		EDGE_ANTIALIAS_PADDING;
	const markerSpec =
		presentation.theme.tokens.effects.terminalMarker;
	const markerBleed =
		markerSpec === null
			? 0
			: normalizeTerminalMarkerRadius(markerSpec.size) * 2 +
				EDGE_ANTIALIAS_PADDING;

	return Math.max(
		MIN_EDGE_PADDING,
		Math.ceil(strokeBleed),
		Math.ceil(markerBleed),
	);
}

function createFallbackLayoutPath(
	from: PositionedNode,
	to: PositionedNode,
	orientation: LayoutOrientation,
	routing: MindMapEdgeRouting,
): LayoutPath {
	const vertical =
		orientation === "top-to-bottom" ||
		orientation === "bottom-to-top";
	const start = vertical
		? {
				x: from.x + from.width / 2,
				y:
					orientation === "top-to-bottom"
						? from.y + from.height
						: from.y,
			}
		: {
				x:
					orientation === "left-to-right"
						? from.x + from.width
						: from.x,
				y: from.y + from.height / 2,
			};
	const end = vertical
		? {
				x: to.x + to.width / 2,
				y:
					orientation === "top-to-bottom"
						? to.y
						: to.y + to.height,
			}
		: {
				x:
					orientation === "left-to-right"
						? to.x
						: to.x + to.width,
				y: to.y + to.height / 2,
			};

	return createRoutedLayoutPath(start, end, vertical, routing);
}

/**
 * Bilateral layout owns the source/target ports, while the presentation owns
 * the requested edge style. Re-routing between those ports keeps both sides
 * correct without forcing a global orientation onto the engine.
 */
export function applyRoutingToEnginePath(
	path: LayoutPath,
	routing: MindMapEdgeRouting,
): LayoutPath {
	if (routing === "bezier") {
		return path;
	}

	return createRoutedLayoutPath(
		path.start,
		getLayoutPathEnd(path),
		isPathPrimarilyVertical(path),
		routing,
	);
}

function createRoutedLayoutPath(
	start: LayoutPoint,
	end: LayoutPoint,
	vertical: boolean,
	routing: MindMapEdgeRouting,
): LayoutPath {
	if (routing === "straight") {
		return {
			start,
			segments: [{ kind: "line", to: end }],
		};
	}

	const primaryControl = vertical
		? (start.y + end.y) / 2
		: (start.x + end.x) / 2;
	if (routing === "orthogonal") {
		return {
			start,
			segments: vertical
				? [
						{
							kind: "line",
							to: { x: start.x, y: primaryControl },
						},
						{
							kind: "line",
							to: { x: end.x, y: primaryControl },
						},
						{ kind: "line", to: end },
					]
				: [
						{
							kind: "line",
							to: { x: primaryControl, y: start.y },
						},
						{
							kind: "line",
							to: { x: primaryControl, y: end.y },
						},
						{ kind: "line", to: end },
					],
		};
	}

	if (routing === "rounded-orthogonal") {
		return createRoundedOrthogonalPath(
			start,
			end,
			vertical,
			primaryControl,
		);
	}

	return {
		start,
		segments: [
			vertical
				? {
						kind: "cubic",
						control1: { x: start.x, y: primaryControl },
						control2: { x: end.x, y: primaryControl },
						to: end,
					}
				: {
						kind: "cubic",
						control1: { x: primaryControl, y: start.y },
						control2: { x: primaryControl, y: end.y },
						to: end,
					},
		],
	};
}

function createRoundedOrthogonalPath(
	start: LayoutPoint,
	end: LayoutPoint,
	vertical: boolean,
	primaryControl: number,
): LayoutPath {
	if (vertical) {
		const radius = Math.min(
			8,
			Math.abs(end.x - start.x) / 2,
			Math.abs(end.y - start.y) / 4,
		);
		const secondaryDirection = Math.sign(end.x - start.x) || 1;
		const primaryDirection = Math.sign(end.y - start.y) || 1;
		return {
			start,
			segments: [
				{
					kind: "line",
					to: {
						x: start.x,
						y: primaryControl - radius * primaryDirection,
					},
				},
				{
					kind: "quadratic",
					control: { x: start.x, y: primaryControl },
					to: {
						x: start.x + radius * secondaryDirection,
						y: primaryControl,
					},
				},
				{
					kind: "line",
					to: {
						x: end.x - radius * secondaryDirection,
						y: primaryControl,
					},
				},
				{
					kind: "quadratic",
					control: { x: end.x, y: primaryControl },
					to: {
						x: end.x,
						y: primaryControl + radius * primaryDirection,
					},
				},
				{ kind: "line", to: end },
			],
		};
	}

	const radius = Math.min(
		8,
		Math.abs(end.y - start.y) / 2,
		Math.abs(end.x - start.x) / 4,
	);
	const secondaryDirection = Math.sign(end.y - start.y) || 1;
	const primaryDirection = Math.sign(end.x - start.x) || 1;
	return {
		start,
		segments: [
			{
				kind: "line",
				to: {
					x: primaryControl - radius * primaryDirection,
					y: start.y,
				},
			},
			{
				kind: "quadratic",
				control: { x: primaryControl, y: start.y },
				to: {
					x: primaryControl,
					y: start.y + radius * secondaryDirection,
				},
			},
			{
				kind: "line",
				to: {
					x: primaryControl,
					y: end.y - radius * secondaryDirection,
				},
			},
			{
				kind: "quadratic",
				control: { x: primaryControl, y: end.y },
				to: {
					x: primaryControl + radius * primaryDirection,
					y: end.y,
				},
			},
			{
				kind: "line",
				to: end,
			},
		],
	};
}

function isPathPrimarilyVertical(path: LayoutPath): boolean {
	let current = path.start;
	for (const segment of path.segments) {
		const directionPoint =
			segment.kind === "cubic"
				? segment.control1
				: segment.kind === "quadratic"
					? segment.control
					: segment.to;
		const deltaX = directionPoint.x - current.x;
		const deltaY = directionPoint.y - current.y;
		if (Math.abs(deltaX) > 0.001 || Math.abs(deltaY) > 0.001) {
			return Math.abs(deltaY) > Math.abs(deltaX);
		}
		current = segment.to;
	}

	const end = getLayoutPathEnd(path);
	return Math.abs(end.y - path.start.y) > Math.abs(end.x - path.start.x);
}

function createLayoutPathData(path: LayoutPath): string {
	const commands = [`M ${path.start.x} ${path.start.y}`];
	for (const segment of path.segments) {
		switch (segment.kind) {
			case "line":
				commands.push(`L ${segment.to.x} ${segment.to.y}`);
				break;
			case "quadratic":
				commands.push(
					`Q ${segment.control.x} ${segment.control.y} ${segment.to.x} ${segment.to.y}`,
				);
				break;
			case "cubic":
				commands.push(
					`C ${segment.control1.x} ${segment.control1.y} ${segment.control2.x} ${segment.control2.y} ${segment.to.x} ${segment.to.y}`,
				);
				break;
		}
	}
	return commands.join(" ");
}

function createMinimapNodePathData(
	nodes: readonly MindMapMinimapNodeProjection[],
): string {
	return nodes
		.map((node) => {
			const right = node.x + node.width;
			const bottom = node.y + node.height;
			return `M ${node.x} ${node.y} H ${right} V ${bottom} H ${node.x} Z`;
		})
		.join(" ");
}

function createPolylinePathData(
	points: readonly HandDrawnPoint[],
): string {
	const first = points[0];
	if (first === undefined) {
		return "";
	}
	return [
		`M ${first.x} ${first.y}`,
		...points
			.slice(1)
			.map((point) => `L ${point.x} ${point.y}`),
	].join(" ");
}

function createClosedPolylinePathData(
	points: readonly HandDrawnPoint[],
): string {
	const path = createPolylinePathData(points);
	return path.length === 0 ? "" : `${path} Z`;
}

function sampleLayoutPath(path: LayoutPath): readonly HandDrawnPoint[] {
	const points: HandDrawnPoint[] = [path.start];
	let current: LayoutPoint = path.start;
	for (const segment of path.segments) {
		switch (segment.kind) {
			case "line":
				points.push(segment.to);
				break;
			case "quadratic":
				for (let index = 1; index < 8; index += 1) {
					const progress = index / 7;
					const inverse = 1 - progress;
					points.push({
						x:
							inverse * inverse * current.x +
							2 *
								inverse *
								progress *
								segment.control.x +
							progress *
								progress *
								segment.to.x,
						y:
							inverse * inverse * current.y +
							2 *
								inverse *
								progress *
								segment.control.y +
							progress *
								progress *
								segment.to.y,
					});
				}
				break;
			case "cubic":
				points.push(
					...sampleCubicBezier(
						current,
						segment.control1,
						segment.control2,
						segment.to,
						12,
					).slice(1),
				);
				break;
		}
		current = segment.to;
	}
	if (points.length === 1) {
		points.push(path.start);
	}
	return points;
}

function getLayoutPathEnd(path: LayoutPath): LayoutPoint {
	return path.segments.at(-1)?.to ?? path.start;
}

export interface TerminalMarkerGeometry {
	readonly center: LayoutPoint;
	readonly radius: number;
}

/**
 * Places the marker immediately before the target port. Its circumference is
 * tangent to the node boundary at the path endpoint, so the complete circle
 * remains visible instead of being painted underneath the target card.
 */
export function calculateTerminalMarkerGeometry(
	path: LayoutPath,
	size: number,
): TerminalMarkerGeometry {
	const endpoint = getLayoutPathEnd(path);
	const radius = normalizeTerminalMarkerRadius(size);
	const direction = getLayoutPathTerminalDirection(path);
	if (direction === null) {
		return { center: endpoint, radius };
	}

	return {
		center: {
			x: endpoint.x - direction.x * radius,
			y: endpoint.y - direction.y * radius,
		},
		radius,
	};
}

function getLayoutPathTerminalDirection(
	path: LayoutPath,
): LayoutPoint | null {
	let current = path.start;
	let terminalVector: LayoutPoint | null = null;

	for (const segment of path.segments) {
		const vectorStart =
			segment.kind === "cubic"
				? segment.control2
				: segment.kind === "quadratic"
					? segment.control
					: current;
		const deltaX = segment.to.x - vectorStart.x;
		const deltaY = segment.to.y - vectorStart.y;
		if (Math.abs(deltaX) > 0.001 || Math.abs(deltaY) > 0.001) {
			terminalVector = { x: deltaX, y: deltaY };
		}
		current = segment.to;
	}

	if (terminalVector === null) {
		return null;
	}
	const length = Math.hypot(terminalVector.x, terminalVector.y);
	if (length <= 0.001) {
		return null;
	}
	return {
		x: terminalVector.x / length,
		y: terminalVector.y / length,
	};
}

function normalizeTerminalMarkerRadius(size: number): number {
	return Number.isFinite(size) ? Math.max(1, size / 2) : 1;
}

function applyNodePresentationStyles(
	element: HTMLElement,
	nodePresentation: MindMapNodePresentation | undefined,
	appearanceColors: ResolvedNodeAppearanceColors,
): void {
	const typography = nodePresentation?.typography;

	setCssProperty(
		element,
		"--obmind-node-fill",
		resolveThemeColor(appearanceColors.fill),
	);
	setCssProperty(
		element,
		"--obmind-node-stroke",
		resolveThemeColor(appearanceColors.stroke),
	);
	setCssProperty(
		element,
		"--obmind-node-text",
		appearanceColors.textColor === undefined
			? null
			: resolveThemeColor(appearanceColors.textColor),
	);
	setCssProperty(
		element,
		"--obmind-node-border-width",
		nodePresentation?.borderWidth === undefined
			? null
			: `${nodePresentation.borderWidth}px`,
	);
	setCssProperty(
		element,
		"--obmind-node-radius",
		nodePresentation?.radius === undefined
			? null
			: `${nodePresentation.radius}px`,
	);
	setCssProperty(
		element,
		"--obmind-node-max-width",
		nodePresentation?.maxWidth === undefined
			? null
			: `${nodePresentation.maxWidth}px`,
	);
	setCssProperty(
		element,
		"--obmind-node-min-height",
		nodePresentation?.minHeight === undefined
			? null
			: `${nodePresentation.minHeight}px`,
	);
	setCssProperty(
		element,
		"--obmind-node-padding-inline",
		nodePresentation?.paddingInline === undefined
			? null
			: `${nodePresentation.paddingInline}px`,
	);
	setCssProperty(
		element,
		"--obmind-node-padding-block",
		nodePresentation?.paddingBlock === undefined
			? null
			: `${nodePresentation.paddingBlock}px`,
	);
	setCssProperty(
		element,
		"--obmind-node-font-family",
		typography?.fontFamilyToken === undefined
			? null
			: `var(--${typography.fontFamilyToken})`,
	);
	setCssProperty(
		element,
		"--obmind-node-font-size",
		typography?.fontSize === undefined
			? null
			: `${typography.fontSize}px`,
	);
	setCssProperty(
		element,
		"--obmind-node-font-weight",
		typography?.fontWeight === undefined
			? null
			: String(typography.fontWeight),
	);
	setCssProperty(
		element,
		"--obmind-node-line-height",
		typography?.lineHeight === undefined
			? null
			: String(typography.lineHeight),
	);
	setCssProperty(
		element,
		"--obmind-node-font-style",
		typography?.italic === undefined
			? null
			: typography.italic
				? "italic"
				: "normal",
	);
}

interface ResolvedNodeAppearanceColors {
	readonly fill: MindMapThemeColor;
	readonly stroke: MindMapThemeColor;
	readonly textColor?: MindMapThemeColor;
	readonly branchColor?: MindMapThemeColor;
}

function applyNodeLinkControlStyles(
	element: HTMLElement,
	nodePresentation: MindMapNodePresentation | undefined,
	appearanceColors: ResolvedNodeAppearanceColors,
	colors: MindMapThemeColorTokens,
	isRoot: boolean,
): void {
	setCssProperty(
		element,
		"--obmind-node-link-color",
		resolveThemeColor(
			appearanceColors.textColor ??
				(isRoot ? colors.textOnAccent : colors.text),
		),
	);
	setCssProperty(
		element,
		"--obmind-node-link-inset",
		nodePresentation?.paddingInline === undefined
			? null
			: `${nodePresentation.paddingInline}px`,
	);
	setCssProperty(
		element,
		"--obmind-node-link-control-size",
		`${MIND_MAP_NODE_LINK_CONTROL_SIZE}px`,
	);
	setCssProperty(
		element,
		"--obmind-node-link-control-gap",
		`${MIND_MAP_NODE_LINK_CONTROL_GAP}px`,
	);
	setCssProperty(
		element,
		"--obmind-node-link-label-gap",
		`${MIND_MAP_NODE_LINK_LABEL_GAP}px`,
	);
}

function applyNodeTaskControlStyles(
	element: HTMLElement,
	nodePresentation: MindMapNodePresentation | undefined,
	colors: MindMapThemeColorTokens,
	appearanceColors: ResolvedNodeAppearanceColors,
	resolveColor: MindMapThemeColorResolver,
): void {
	const fillIsVisible = hasDistinctMindMapNodeFill(
		nodePresentation?.shape,
		appearanceColors.fill,
		colors.canvas,
		resolveColor,
	);
	const surface = fillIsVisible ? appearanceColors.fill : colors.canvas;
	const accent = appearanceColors.textColor ?? appearanceColors.stroke;
	setCssProperty(
		element,
		"--obmind-task-inline-inset",
		nodePresentation?.paddingInline === undefined
			? null
			: `${nodePresentation.paddingInline}px`,
	);
	setCssProperty(
		element,
		"--obmind-task-control-size",
		`${MIND_MAP_TASK_CONTROL_SIZE}px`,
	);
	setCssProperty(
		element,
		"--obmind-task-control-gap",
		`${MIND_MAP_TASK_CONTROL_GAP}px`,
	);
	setCssProperty(
		element,
		"--obmind-task-accent",
		resolveThemeColor(accent),
	);
	setCssProperty(
		element,
		"--obmind-task-surface",
		resolveThemeColor(surface),
	);
	setCssProperty(
		element,
		"--obmind-task-check",
		resolveThemeColor(surface),
	);
}

function resolveNodeAppearanceColors(
	nodePresentation: MindMapNodePresentation | undefined,
	presentation: MindMapPresentation,
	colors: MindMapThemeColorTokens,
	isRoot: boolean,
): ResolvedNodeAppearanceColors {
	const theme = presentation.theme.tokens;
	const branchColor = getBranchColor(
		colors,
		nodePresentation?.branchColorIndex,
	);
	return {
	fill: resolveNodeFill(
			nodePresentation,
			colors,
			isRoot,
		),
		stroke:
			nodePresentation?.stroke ??
			(theme.branches.colorNodeStroke ? branchColor : undefined) ??
			(isRoot ? colors.accent : colors.border),
		textColor:
			nodePresentation?.textColor ??
			(!isRoot && theme.branches.colorNodeText
				? branchColor
				: undefined) ??
			(isRoot ? undefined : colors.text),
		branchColor,
	};
}

function renderMindMapNodeAssets(
	container: HTMLElement,
	assets: ReturnType<typeof resolveMindMapNodeAssets>,
	colors: MindMapThemeColorTokens,
	appearanceColors: ResolvedNodeAppearanceColors,
): void {
	const descriptors = [
		...(assets.icon === null ? [] : [assets.icon]),
		...assets.markers,
	];
	const elements = descriptors.map((descriptor) =>
		createMindMapAssetElement(
			container.ownerDocument,
			descriptor,
			colors,
			appearanceColors,
		),
	);
	container.replaceChildren(...elements);
	const visible = elements.length > 0;
	container.hidden = !visible;
	setCssProperty(container, "display", visible ? "inline-flex" : null);
	setCssProperty(container, "align-items", visible ? "center" : null);
	setCssProperty(
		container,
		"gap",
		visible ? `${MIND_MAP_NODE_ASSET_GAP}px` : null,
	);
	setCssProperty(
		container,
		"margin-inline-end",
		visible ? `${MIND_MAP_NODE_ASSET_GAP}px` : null,
	);
	setCssProperty(container, "vertical-align", visible ? "middle" : null);
	const label = container.parentElement?.querySelector<HTMLElement>(
		".obmind-node-label",
	);
	if (label !== null && label !== undefined) {
		setCssProperty(label, "display", visible ? "inline" : null);
	}
}

function createMindMapAssetElement(
	ownerDocument: Document,
	descriptor: MindMapAssetVisualDescriptor,
	colors: MindMapThemeColorTokens,
	appearanceColors: ResolvedNodeAppearanceColors,
): SVGSVGElement {
	const svg = createSvgElement(ownerDocument, "svg");
	svg.classList.add("obmind-node-asset");
	svg.dataset.obmindAssetId = descriptor.id;
	svg.dataset.obmindAssetKind = descriptor.kind;
	svg.setAttribute(
		"viewBox",
		`0 0 ${String(descriptor.viewBox.width)} ${String(descriptor.viewBox.height)}`,
	);
	svg.setAttribute("width", String(MIND_MAP_NODE_ASSET_SIZE));
	svg.setAttribute("height", String(MIND_MAP_NODE_ASSET_SIZE));
	svg.setAttribute("focusable", "false");
	svg.setAttribute("aria-hidden", "true");
	for (const primitive of descriptor.primitives) {
		svg.append(
			createMindMapAssetPrimitiveElement(
				ownerDocument,
				primitive,
				colors,
				appearanceColors,
			),
		);
	}
	return svg;
}

function createMindMapAssetPrimitiveElement(
	ownerDocument: Document,
	primitive: MindMapAssetPrimitive,
	colors: MindMapThemeColorTokens,
	appearanceColors: ResolvedNodeAppearanceColors,
): SVGElement {
	const applyPaint = (element: SVGElement, paint: MindMapAssetPaint): void => {
		element.setAttribute(
			"fill",
			paint.kind === "none"
				? "none"
				: resolveThemeColor(
						resolveMindMapAssetRoleColor(
							paint.role,
							colors,
							appearanceColors,
						),
					),
		);
		if (paint.kind === "role" && paint.opacity !== undefined) {
			element.setAttribute("fill-opacity", String(paint.opacity));
		}
	};
	const applyStroke = (
		element: SVGElement,
		stroke: MindMapAssetStroke | undefined,
	): void => {
		if (stroke === undefined) {
			element.setAttribute("stroke", "none");
			return;
		}
		element.setAttribute(
			"stroke",
			resolveThemeColor(
				resolveMindMapAssetRoleColor(
					stroke.role,
					colors,
					appearanceColors,
				),
			),
		);
		element.setAttribute("stroke-width", String(stroke.width));
		if (stroke.lineCap !== undefined) {
			element.setAttribute("stroke-linecap", stroke.lineCap);
		}
		if (stroke.lineJoin !== undefined) {
			element.setAttribute("stroke-linejoin", stroke.lineJoin);
		}
	};

	switch (primitive.kind) {
		case "circle": {
			const element = createSvgElement(ownerDocument, "circle");
			element.setAttribute("cx", String(primitive.centerX));
			element.setAttribute("cy", String(primitive.centerY));
			element.setAttribute("r", String(primitive.radius));
			applyPaint(element, primitive.fill);
			applyStroke(element, primitive.stroke);
			return element;
		}
		case "rect": {
			const element = createSvgElement(ownerDocument, "rect");
			element.setAttribute("x", String(primitive.x));
			element.setAttribute("y", String(primitive.y));
			element.setAttribute("width", String(primitive.width));
			element.setAttribute("height", String(primitive.height));
			if (primitive.radius !== undefined) {
				element.setAttribute("rx", String(primitive.radius));
				element.setAttribute("ry", String(primitive.radius));
			}
			applyPaint(element, primitive.fill);
			applyStroke(element, primitive.stroke);
			return element;
		}
		case "line": {
			const element = createSvgElement(ownerDocument, "line");
			element.setAttribute("x1", String(primitive.start.x));
			element.setAttribute("y1", String(primitive.start.y));
			element.setAttribute("x2", String(primitive.end.x));
			element.setAttribute("y2", String(primitive.end.y));
			applyStroke(element, primitive.stroke);
			return element;
		}
		case "polyline":
		case "polygon": {
			const element = createSvgElement(ownerDocument, primitive.kind);
			element.setAttribute(
				"points",
				primitive.points
					.map(({ x, y }) => `${String(x)},${String(y)}`)
					.join(" "),
			);
			if (primitive.kind === "polygon") {
				applyPaint(element, primitive.fill);
				applyStroke(element, primitive.stroke);
			} else {
				element.setAttribute("fill", "none");
				applyStroke(element, primitive.stroke);
			}
			return element;
		}
		case "arc": {
			const element = createSvgElement(ownerDocument, "path");
			element.setAttribute(
				"d",
				createMindMapAssetArcPath(primitive),
			);
			element.setAttribute("fill", "none");
			applyStroke(element, primitive.stroke);
			return element;
		}
	}
}

function createMindMapAssetArcPath(
	primitive: Extract<MindMapAssetPrimitive, { readonly kind: "arc" }>,
): string {
	const startRadians = (primitive.startAngle * Math.PI) / 180;
	const endRadians = (primitive.endAngle * Math.PI) / 180;
	const start = {
		x: primitive.centerX + Math.cos(startRadians) * primitive.radius,
		y: primitive.centerY + Math.sin(startRadians) * primitive.radius,
	};
	const end = {
		x: primitive.centerX + Math.cos(endRadians) * primitive.radius,
		y: primitive.centerY + Math.sin(endRadians) * primitive.radius,
	};
	const sweep = Math.abs(primitive.endAngle - primitive.startAngle);
	return `M ${String(start.x)} ${String(start.y)} A ${String(primitive.radius)} ${String(primitive.radius)} 0 ${sweep > 180 ? "1" : "0"} 1 ${String(end.x)} ${String(end.y)}`;
}

function resolveMindMapAssetRoleColor(
	role: MindMapAssetColorRole,
	colors: MindMapThemeColorTokens,
	appearanceColors: ResolvedNodeAppearanceColors,
): MindMapThemeColor {
	switch (role) {
		case "foreground":
			return appearanceColors.textColor ?? colors.text;
		case "muted":
			return colors.textMuted;
		case "surface":
			return appearanceColors.fill;
		case "accent":
			return appearanceColors.branchColor ?? colors.accent;
		case "positive":
			return colors.branchPalette[1] ?? colors.accent;
		case "warning":
			return colors.branchPalette[2] ?? colors.accent;
		case "danger":
			return colors.branchPalette[4] ?? colors.accent;
	}
}

function applyNodeDisclosureStyles(
	element: HTMLElement,
	nodeId: string,
	nodePresentation: MindMapNodePresentation | undefined,
	presentation: MindMapPresentation,
	colors: MindMapThemeColorTokens,
	appearanceColors: ResolvedNodeAppearanceColors,
	resolveColor: MindMapThemeColorResolver,
): void {
	const accent = resolveNodeDisclosureAccent(
		nodeId,
		nodePresentation,
		presentation,
		colors,
		appearanceColors,
		resolveColor,
	);
	setCssProperty(
		element,
		"--obmind-disclosure-accent",
		resolveThemeColor(accent),
	);
	setCssProperty(
		element,
		"--obmind-disclosure-surface",
		resolveThemeColor(colors.canvas),
	);
}

function resolveNodeDisclosureAccent(
	nodeId: string,
	nodePresentation: MindMapNodePresentation | undefined,
	presentation: MindMapPresentation,
	colors: MindMapThemeColorTokens,
	appearanceColors: ResolvedNodeAppearanceColors,
	resolveColor: MindMapThemeColorResolver,
): MindMapThemeColor {
	const explicitNodePresentation = presentation.nodes.get(nodeId);
	const shape = nodePresentation?.shape;
	const strokeIsVisible =
		shape !== "none" &&
		(nodePresentation?.borderWidth ??
			presentation.theme.tokens.node.borderWidth) > 0;
	const fillIsVisible = hasDistinctMindMapNodeFill(
		shape,
		appearanceColors.fill,
		colors.canvas,
		resolveColor,
	);

	if (strokeIsVisible && explicitNodePresentation?.stroke !== undefined) {
		return explicitNodePresentation.stroke;
	}
	if (fillIsVisible && explicitNodePresentation?.fill !== undefined) {
		return explicitNodePresentation.fill;
	}
	if (explicitNodePresentation?.textColor !== undefined) {
		return explicitNodePresentation.textColor;
	}

	const branches = presentation.theme.tokens.branches;
	const branchColorIsVisible =
		appearanceColors.branchColor !== undefined &&
		((branches.colorNodeStroke && strokeIsVisible) ||
			(branches.colorNodeFill && fillIsVisible) ||
			branches.colorNodeText ||
			branches.colorEdgeStroke);
	if (branchColorIsVisible && appearanceColors.branchColor !== undefined) {
		return appearanceColors.branchColor;
	}

	if (strokeIsVisible && nodePresentation?.stroke !== undefined) {
		return nodePresentation.stroke;
	}
	if (fillIsVisible && nodePresentation?.fill !== undefined) {
		return nodePresentation.fill;
	}
	if (fillIsVisible) {
		return appearanceColors.fill;
	}
	if (strokeIsVisible) {
		return appearanceColors.stroke;
	}
	return appearanceColors.textColor ?? appearanceColors.stroke;
}

function resolveNodeFill(
	nodePresentation: MindMapNodePresentation | undefined,
	colors: MindMapThemeColorTokens,
	isRoot: boolean,
): MindMapThemeColor {
	return (
		nodePresentation?.fill ??
		(isRoot ? colors.surfaceEmphasis : colors.surface)
	);
}

function copyNodeEditorStyles(
	contentButton: HTMLElement,
	editor: HTMLTextAreaElement,
): void {
	for (let index = editor.style.length - 1; index >= 0; index -= 1) {
		const property = editor.style.item(index);
		if (
			property.startsWith("--obmind-node-") ||
			property.startsWith("--obmind-content-") ||
			property.startsWith("--obmind-editor-")
		) {
			editor.style.removeProperty(property);
		}
	}
	for (let index = 0; index < contentButton.style.length; index += 1) {
		const property = contentButton.style.item(index);
		if (
			!property.startsWith("--obmind-node-") &&
			!property.startsWith("--obmind-content-") &&
			!property.startsWith("--obmind-editor-")
		) {
			continue;
		}
		editor.style.setProperty(
			property,
			contentButton.style.getPropertyValue(property),
		);
	}
}

function applyNodeContentLayoutStyles(
	element: HTMLElement,
	policy: MindMapNodeContentLayoutPolicy,
): void {
	setCssProperty(
		element,
		"--obmind-content-min-inline-size",
		`${policy.minInlineSize}px`,
	);
	setCssProperty(
		element,
		"--obmind-content-max-inline-size",
		`${policy.maxInlineSize}px`,
	);
	setCssProperty(
		element,
		"--obmind-editor-max-block-size",
		`${policy.editor.maxBlockSize}px`,
	);
	element.dataset.obmindContentLayoutRole = policy.role;
	element.dataset.obmindBranchAxis = policy.branchFlow.axis;
	element.dataset.obmindBranchSign = String(policy.branchFlow.sign);
	element.setAttribute("dir", policy.text.textDirection);
}

function resizeNodeEditor(editor: HTMLTextAreaElement): void {
	const lines = editor.value.split("\n");
	editor.cols = Math.max(
		8,
		Math.min(
			48,
			...lines.map((line) => [...line].length + 1),
		),
	);
	editor.rows = Math.max(1, lines.length);
	editor.style.removeProperty("height");
	editor.classList.remove("obmind-node-editor-scrollable");
	if (editor.isConnected && editor.scrollHeight > 0) {
		const layout = resolveMindMapNodeEditorBlockLayout(
			editor.scrollHeight,
			Math.max(0, editor.offsetHeight - editor.clientHeight),
			Number.parseFloat(
				editor.style.getPropertyValue(
					"--obmind-editor-max-block-size",
				),
			),
		);
		editor.style.setProperty("height", `${layout.blockSize}px`);
		editor.classList.toggle(
			"obmind-node-editor-scrollable",
			layout.scrollable,
		);
	}
}

function updateNodeLabel(
	label: HTMLElement,
	fallbackText: string,
	presentation: MindMapNodePresentation,
): void {
	const content = presentation.content;
	if (content === undefined || content.runs.length === 0) {
		if (
			label.dataset.obmindContentKind !== "plain" ||
			label.textContent !== fallbackText
		) {
			label.dataset.obmindContentKind = "plain";
			label.replaceChildren(fallbackText);
		}
		return;
	}

	const signature = JSON.stringify(content);
	if (
		label.dataset.obmindContentKind === "rich" &&
		label.dataset.obmindContentSignature === signature
	) {
		return;
	}

	const fragment = createDomFragment(label.ownerDocument);
	for (const run of content.runs) {
		const span = createHtmlElement(label.ownerDocument, "span");
		span.className = "obmind-node-text-run";
		span.classList.toggle(
			"obmind-node-text-run-bold",
			run.bold === true,
		);
		span.classList.toggle(
			"obmind-node-text-run-italic",
			run.italic === true,
		);
		span.classList.toggle(
			"obmind-node-text-run-code",
			run.code === true,
		);
		span.classList.toggle(
			"obmind-node-text-run-strike",
			run.strike === true,
		);
		if (run.color !== undefined) {
			span.style.color = resolveThemeColor(run.color);
		}
		span.textContent = run.text;
		fragment.append(span);
	}
	label.dataset.obmindContentKind = "rich";
	label.dataset.obmindContentSignature = signature;
	label.replaceChildren(fragment);
}

function createEdgeSvgPath(
	ownerDocument: Document,
	edge: LayoutEdge,
	edgePresentation: MindMapEdgePresentation | undefined,
	pathData: string,
): SVGPathElement {
	const path = createSvgElement(ownerDocument, "path");
	path.classList.add("obmind-edge");
	path.dataset.obmindEdgeId = edge.id;
	setOptionalDataAttribute(
		path,
		"obmindEdgeVariant",
		edgePresentation?.variant,
	);
	path.setAttribute("d", pathData);
	path.setAttribute("fill", "none");
	path.setAttribute("vector-effect", "non-scaling-stroke");
	path.setAttribute("focusable", "false");
	path.setAttribute("tabindex", "-1");
	path.setAttribute("aria-hidden", "true");
	return path;
}

function createVariableWidthConnectorOutlinesForLineStyle(
	centerline: LayoutPath | readonly LayoutPoint[],
	profile: MindMapConnectorStrokeProfile,
	startWidth: number,
	endWidth: number,
	lineStyle: MindMapLineStyle,
): readonly VariableWidthConnectorOutline[] {
	if (lineStyle === "solid") {
		return [
			createVariableWidthConnectorOutline(centerline, {
				profile,
				startWidth,
				endWidth,
			}),
		];
	}
	return createVariableWidthConnectorDashOutlines(centerline, {
		profile,
		startWidth,
		endWidth,
		...VARIABLE_WIDTH_LINE_PATTERNS[lineStyle],
	});
}

function resolveEdgePresentation(
	edge: LayoutEdge,
	presentation: MindMapPresentation,
	rootBranchIndex: number | undefined,
): MindMapEdgePresentation | undefined {
	const override = presentation.edges.get(edge.id);
	const automaticBranchIndex =
		presentation.theme.tokens.branches.mode === "root-subtree" &&
		presentation.theme.tokens.branches.colorEdgeStroke
			? rootBranchIndex
			: undefined;
	if (override === undefined && automaticBranchIndex === undefined) {
		return undefined;
	}
	return {
		...override,
		branchColorIndex:
			override?.branchColorIndex ?? automaticBranchIndex,
	};
}

function resolveEdgeColor(
	edgePresentation: MindMapEdgePresentation | undefined,
	presentation: MindMapPresentation,
	colors: MindMapThemeColorTokens,
): MindMapThemeColor {
	return (
		edgePresentation?.color ??
		getBranchColor(
			colors,
			edgePresentation?.branchColorIndex,
		) ??
		colors.edge
	);
}

function applyEdgePresentationStyles(
	element: SVGPathElement,
	edgePresentation: MindMapEdgePresentation | undefined,
	presentation: MindMapPresentation,
	colors: MindMapThemeColorTokens,
	widthScale = 1,
	opacity = 1,
): void {
	const edgeTheme = presentation.theme.tokens.edge;
	const color = resolveEdgeColor(
		edgePresentation,
		presentation,
		colors,
	);
	const width = resolveMindMapConnectorWidth(
		presentation,
		edgePresentation,
	);
	const lineStyle =
		edgePresentation?.lineStyle ?? edgeTheme.lineStyle;

	element.style.stroke = resolveThemeColor(color);
	element.style.strokeWidth = `${width * widthScale}px`;
	element.style.opacity = String(opacity);
	element.style.strokeDasharray =
		lineStyle === "dashed"
			? "6 4"
			: lineStyle === "dotted"
				? "2 3"
				: "";
}

function applyVariableWidthEdgePresentationStyles(
	element: SVGPathElement,
	edgePresentation: MindMapEdgePresentation | undefined,
	presentation: MindMapPresentation,
	colors: MindMapThemeColorTokens,
	lineStyle: MindMapLineStyle,
	opacity = 1,
): void {
	const color = resolveEdgeColor(
		edgePresentation,
		presentation,
		colors,
	);
	element.removeAttribute("vector-effect");
	setCssProperty(element, "fill", resolveThemeColor(color));
	setCssProperty(element, "stroke", "none");
	setCssProperty(element, "stroke-width", "0");
	setCssProperty(element, "stroke-dasharray", null);
	setCssProperty(element, "opacity", String(opacity));
	element.dataset.obmindConnectorProfile = "taper-to-child";
	element.dataset.obmindLineStyle = lineStyle;
}

function resolveThemeColor(color: MindMapThemeColor): string {
	if (color.kind === "host") {
		return isSafeHostColorToken(color.token)
			? `var(--${color.token})`
			: "transparent";
	}

	return isSafeLiteralColor(color.value)
		? color.value
		: "transparent";
}

function getBranchColor(
	colors: MindMapThemeColorTokens,
	index: number | undefined,
): MindMapThemeColor | undefined {
	if (index === undefined || !Number.isInteger(index)) {
		return undefined;
	}
	const palette = colors.branchPalette;
	if (palette.length === 0) {
		return undefined;
	}
	const normalizedIndex = ((index % palette.length) + palette.length) %
		palette.length;
	return palette[normalizedIndex];
}

function resolveNodePresentation(
	node: MindMapNode,
	depth: number,
	presentation: MindMapPresentation,
	colorScheme: MindMapColorScheme,
	rootBranchIndex: number | undefined,
	resolveColor: MindMapThemeColorResolver,
): MindMapNodePresentation {
	const semanticRole = roleForNode(node, depth);
	const override = presentation.nodes.get(node.id);
	const role = override?.role ?? semanticRole;
	const roles = resolveMindMapThemeRoles(
		presentation.theme,
		colorScheme,
	);
	const roleDefaults =
		role === "root"
			? roles.root
			: role === "main-topic"
				? roles.mainTopic
				: roles.subtopic;
	const globalFontFamilyToken =
		presentation.formatting.fontFamily.fontFamilyToken;
	const branchColorIndex =
		override?.branchColorIndex ??
		roleDefaults.branchColorIndex ??
		(presentation.theme.tokens.branches.mode === "root-subtree" &&
		depth > 0
			? rootBranchIndex
			: undefined);
	const basePresentation: MindMapNodePresentation = {
		...roleDefaults,
		...override,
		role,
		branchColorIndex,
	};
	const colors = resolveMindMapThemeColors(
		presentation.theme,
		colorScheme,
	);
	const isRoot = depth === 0;
	const branchColor = getBranchColor(colors, branchColorIndex);
	const effectiveFill = resolveNodeFillForTreatment({
		explicitFill: override?.fill,
		roleFill: roleDefaults.fill,
		fillSource: resolveMindMapNodeFillSource(
			presentation.theme.tokens.nodeTreatment,
			role,
		),
		branchColor,
		colors,
		isRoot,
		branches: presentation.theme.tokens.branches,
	});
	const textColor = resolveMindMapNodeTextColor({
		shape: basePresentation.shape,
		effectiveFill,
		canvas: colors.canvas,
		defaultTextColor: colors.text,
		contrastTextColor: colors.textOnAccent,
		roleTextColor: roleDefaults.textColor,
		branchTextColor:
			!isRoot && presentation.theme.tokens.branches.colorNodeText
				? branchColor
				: undefined,
		explicitTextColor: override?.textColor,
		resolveColor,
	});

	return {
		...basePresentation,
		fill: effectiveFill,
		textColor,
		typography:
			roleDefaults.typography === undefined &&
			override?.typography === undefined &&
			globalFontFamilyToken === null
				? undefined
				: {
						...roleDefaults.typography,
						...(globalFontFamilyToken === null
							? {}
							: { fontFamilyToken: globalFontFamilyToken }),
						...override?.typography,
					},
	};
}

interface NodeFillTreatmentResolutionInput {
	readonly explicitFill?: MindMapThemeColor;
	readonly roleFill?: MindMapThemeColor;
	readonly fillSource: ReturnType<typeof resolveMindMapNodeFillSource>;
	readonly branchColor?: MindMapThemeColor;
	readonly colors: MindMapThemeColorTokens;
	readonly isRoot: boolean;
	readonly branches: MindMapPresentation["theme"]["tokens"]["branches"];
}

/**
 * Resolves the actual topic fill after the Style chooses a semantic source.
 * Explicit node formatting remains authoritative; Styles never embed palette
 * values and Palette role colors remain available through `automatic`.
 */
function resolveNodeFillForTreatment(
	input: NodeFillTreatmentResolutionInput,
): MindMapThemeColor {
	if (input.explicitFill !== undefined) {
		return input.explicitFill;
	}
	const automaticFallback = input.isRoot
		? input.colors.surfaceEmphasis
		: input.colors.surface;
	switch (input.fillSource) {
		case "branch":
			return input.branchColor ?? automaticFallback;
		case "surface":
			return input.colors.surface;
		case "surface-emphasis":
			return input.colors.surfaceEmphasis;
		case "canvas":
			return input.colors.canvas;
		case "automatic":
			return (
				input.roleFill ??
				(!input.isRoot && input.branches.colorNodeFill
					? input.branchColor
					: undefined) ??
				automaticFallback
			);
	}
}

function roleForNode(
	node: MindMapNode,
	depth: number,
): "root" | "main-topic" | "subtopic" {
	if (depth === 0) {
		return "root";
	}
	return depth === 1 ? "main-topic" : "subtopic";
}

function applyNodeDragPreviewSegment(
	element: HTMLElement,
	segment: NodeDragPreviewSegment,
): void {
	const deltaX = segment.end.x - segment.start.x;
	const deltaY = segment.end.y - segment.start.y;
	const length = Math.hypot(deltaX, deltaY);
	const angle = Math.atan2(deltaY, deltaX);
	element.style.left = `${segment.start.x}px`;
	element.style.top = `${segment.start.y}px`;
	element.style.width = `${Math.max(1, length)}px`;
	element.style.transform = `translateY(-50%) rotate(${angle}rad)`;
}

function setOptionalDataAttribute(
	element: HTMLElement | SVGElement,
	key: string,
	value: string | undefined,
): void {
	if (value === undefined || value.length === 0) {
		delete element.dataset[key];
	} else {
		element.dataset[key] = value;
	}
}

function setCssProperty(
	element: HTMLElement | SVGElement,
	name: string,
	value: string | null,
): void {
	if (value === null) {
		element.style.removeProperty(name);
	} else {
		element.style.setProperty(name, value);
	}
}

function applyCssEffect(
	element: HTMLElement,
	datasetKey: string,
	effect: DomSvgCssEffect | null,
): void {
	if (effect === null) {
		delete element.dataset[datasetKey];
		return;
	}
	element.dataset[datasetKey] = effect.profileId;
	for (const [property, value] of Object.entries(effect.variables)) {
		element.style.setProperty(property, value);
	}
}

function clearCssPropertiesWithPrefix(
	element: HTMLElement,
	prefix: string,
): void {
	for (let index = element.style.length - 1; index >= 0; index -= 1) {
		const property = element.style.item(index);
		if (property.startsWith(prefix)) {
			element.style.removeProperty(property);
		}
	}
}

function normalizeWheelDelta(event: WheelEvent, viewportHeight: number): number {
	if (event.deltaMode === 1) {
		return event.deltaY * 16;
	}
	if (event.deltaMode === 2) {
		return event.deltaY * Math.max(1, viewportHeight);
	}
	return event.deltaY;
}

function isElement(target: EventTarget | null): target is Element {
	return (
		target !== null &&
		typeof (target as Partial<Element>).closest === "function"
	);
}

function shouldPreserveHostSpaceActivation(
	target: EventTarget | null,
	surface: HTMLElement,
): boolean {
	if (!isElement(target) || surface.contains(target)) {
		return false;
	}
	// A hidden, inactive ObMind tab can retain DOM focus after the workspace
	// activates another ObMind leaf. Its stale control must not prevent the
	// active renderer from claiming Space as a canvas gesture.
	if (target.closest(".obmind-renderer") !== null) {
		return false;
	}
	return (
		target.closest(
			'input, textarea, select, button, a, [contenteditable="true"], [role="button"]',
		) !== null
	);
}

function createHtmlElement<K extends keyof HTMLElementTagNameMap>(
	ownerDocument: Document,
	tagName: K,
): HTMLElementTagNameMap[K] {
	const factory: HtmlElementFactory = ownerDocument;
	return factory.createElement(tagName);
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
	ownerDocument: Document,
	tagName: K,
): SVGElementTagNameMap[K] {
	const factory: SvgElementFactory = ownerDocument;
	return factory.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function createMindMapNodeLinkIcon(ownerDocument: Document): SVGSVGElement {
	const icon = createSvgElement(ownerDocument, "svg");
	icon.classList.add("obmind-node-link-icon");
	icon.setAttribute("viewBox", "0 0 24 24");
	icon.setAttribute("aria-hidden", "true");
	icon.setAttribute("focusable", "false");
	icon.setAttribute("fill", "none");
	icon.setAttribute("stroke", "currentColor");
	icon.setAttribute("stroke-width", "2");
	icon.setAttribute("stroke-linecap", "round");
	icon.setAttribute("stroke-linejoin", "round");
	const path = createSvgElement(ownerDocument, "path");
	path.setAttribute(
		"d",
		"M8 12h8M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2",
	);
	icon.append(path);
	return icon;
}

function createDomFragment(ownerDocument: Document): DocumentFragment {
	const factory: FragmentFactory = ownerDocument;
	return factory.createDocumentFragment();
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function finiteEffectOption(
	value: string | number | boolean | undefined,
	fallback: number,
	minimum: number,
	maximum: number,
): number {
	return typeof value === "number" && Number.isFinite(value)
		? clamp(value, minimum, maximum)
		: fallback;
}

function layoutBoundsEqual(
	first: LayoutBounds | null,
	second: LayoutBounds,
): boolean {
	return (
		first !== null &&
		first.x === second.x &&
		first.y === second.y &&
		first.width === second.width &&
		first.height === second.height
	);
}

function setsEqual(
	first: ReadonlySet<string>,
	second: ReadonlySet<string>,
): boolean {
	if (first.size !== second.size) {
		return false;
	}
	for (const value of first) {
		if (!second.has(value)) {
			return false;
		}
	}
	return true;
}

function toError(error: unknown, language: ObMindLanguage): Error {
	return error instanceof Error
		? error
		: new Error(createObMindTranslator(language).t("renderer.error.unknown"));
}
