import { OBMIND_ICON_ID } from "./branding";
import {
	applyPresentationLibraryDraftConflict,
	createPaletteLibraryEditor,
	createPaletteLibraryDraftChange,
	createStyleLibraryEditor,
	createStyleLibraryDraftChange,
	getLibraryEditorAction,
	getLibraryEditorControl,
	getPresentationLibraryDraftConflictAction,
} from "./basic-presentation-library-editor";
import {
	isAppearanceMode,
	type ObMindAppearanceMode,
} from "../application/config";
import {
	createBrowserDownloadMindMapExportSink,
	type MindMapExportArtifactSink,
} from "../export/download";
import {
	createBrowserMindMapExporterDependencies,
	createMindMapExportArtifact,
	type MindMapExporterDependencies,
} from "../export/exporter";
import {
	planMindMapExport,
} from "../export/plan";
import {
	isMindMapExportSceneCurrent,
	MindMapExportSession,
	type MindMapExportSceneRevision,
	type MindMapExportSessionOptions,
} from "../export/session";
import {
	advanceMindMapExportProgress,
	MIND_MAP_EXPORT_FORMATS,
	MindMapExportError,
	throwIfMindMapExportAborted,
	type MindMapExportCaptureRequest,
	type MindMapExportDiagnostic,
	type MindMapExportEncoderCapability,
	type MindMapExportExecutionContext,
	type MindMapExportFormat,
	type MindMapExportOptions,
	type MindMapExportPlan,
	type MindMapExportProgress,
	type MindMapExportProgressListener,
	type MindMapExportScene,
	type MindMapExportScope,
} from "../export/types";
import type {
	MindMapFrontend,
	MindMapFrontendCommand,
	MindMapFrontendEvent,
	MindMapFrontendEventSink,
	MindMapFrontendFrame,
	MindMapAssetCapability,
	MindMapLayoutOptionCapability,
	MindMapPaletteCapability,
	MindMapPresentationLibraryCommand,
	MindMapStyleCapability,
} from "./frontend";
import type { MindMapNode } from "../core/model";
import { createVisibleMindMapNavigation } from "../topic/interaction/node-navigation";
import {
	createMindMapDocumentSearchIndex,
	searchMindMapDocument,
	type MindMapDocumentSearchIndex,
} from "../topic/interaction/node-search";
import { applyMindMapSelection } from "../topic/interaction/node-selection";
import { projectMindMapFocus } from "../topic/interaction/node-focus";
import {
	createMindMapNodeFormattingPatch,
	type MindMapNodeFormattingCommand,
} from "../presentation/node-presentation-edit";
import {
	applyMindMapPresentationLibraryPaletteDraftChange,
	applyMindMapPresentationLibraryStyleDraftChange,
	createMindMapPresentationLibraryPaletteDraftState,
	createMindMapPresentationLibraryDraftConflict,
	createMindMapPresentationLibraryStyleDraftState,
	reconcileMindMapPresentationLibraryPaletteDraftState,
	reconcileMindMapPresentationLibraryStyleDraftState,
	toMindMapPresentationLibraryPaletteDefinition,
	toMindMapPresentationLibraryStyleDefinition,
	type MindMapPresentationLibraryDraftConflict,
	type MindMapPresentationLibraryPaletteDraftState,
	type MindMapPresentationLibraryStyleDraftState,
} from "../presentation/presentation-library-editor";
import type {
	MindMapPresentationLibraryEntryKind,
	MindMapPresentationLibraryRevisionConflict,
} from "../presentation/presentation-library";
import {
	isSafeHostColorToken,
	isSafeLiteralColor,
	literalColor,
	type MindMapColorScheme,
	type MindMapDecoration,
	type MindMapInteractionEvent,
	type MindMapLayoutOrientation,
	type MindMapNodeShape,
	type MindMapNodePresentation,
	type MindMapThemeColor,
} from "../presentation/presentation";
import {
	createMindMapStylePreviewScene,
	createMindMapStylePreviewEdgePathData,
	createMindMapStylePreviewTaperedEdgePathData,
	type MindMapStylePreviewEdge,
	type MindMapStylePreviewEffects,
	type MindMapStylePreviewNode,
} from "../presentation/style-preview-scene";
import {
	createMindMapRenderEffectResolver,
	type MindMapRenderEffectResolver,
} from "../presentation/render-effects";
import {
	createHandDrawnNodeContour,
	type HandDrawnNodeContourShape,
} from "../presentation/hand-drawn";
import type { MindMapPresentationPatch } from "../presentation/presentation-patch";
import {
	createMindMapPresentationHistoryAction,
	type MindMapPresentationHistoryAction,
} from "../presentation/presentation-history";
import { createMindMapNodeAssetPatch } from "../presentation/node-assets-edit";
import type { MindMapAssetColorRole } from "../presentation/assets";
import {
	applyMindMapDecorationCommand,
	createMindMapBoundaryDecorationDraft,
	createMindMapDecorationCommandState,
	createMindMapRelationshipDecorationDraft,
	createMindMapSummaryDecorationDraft,
	type MindMapDecorationCommand,
	type MindMapDecorationValidationContext,
} from "../presentation/decorations";
import {
	DOM_SVG_MIND_MAP_RENDERER_FACTORY,
	type MindMapExportCaptureProgress,
	type MindMapRenderer,
	type MindMapRendererFactory,
} from "./renderer";
import {
	createObMindTranslator,
	DEFAULT_OBMIND_LANGUAGE,
	isObMindLanguage,
	localizeObMindError,
	ObMindLocalizedError,
	type ObMindLanguage,
	type ObMindTranslationKey,
	type ObMindTranslationValues,
	type ObMindTranslator,
} from "../i18n/i18n";

let basicFrontendControlSequence = 0;

type SidebarTabId = "appearance" | "topic" | "layout";

const SIDEBAR_TAB_ORDER: readonly SidebarTabId[] = [
	"appearance",
	"topic",
	"layout",
];

function getAppearanceOptions(
	translator: ObMindTranslator,
): readonly { readonly value: ObMindAppearanceMode; readonly label: string }[] {
	return [
		{ value: "system", label: translator.t("frontend.appearance.system") },
		{ value: "light", label: translator.t("frontend.appearance.light") },
		{ value: "dark", label: translator.t("frontend.appearance.dark") },
	];
}

interface BasicFrontendElements {
	readonly root: HTMLElement;
	readonly fileName: HTMLElement;
	readonly fitButton: HTMLButtonElement;
	readonly expandButton: HTMLButtonElement;
	readonly collapseButton: HTMLButtonElement;
	readonly undoButton: HTMLButtonElement;
	readonly redoButton: HTMLButtonElement;
	readonly searchInput: HTMLInputElement;
	readonly searchResults: HTMLElement;
	readonly directionSelect: HTMLSelectElement;
	readonly spacingSection: HTMLElement;
	readonly spacingInputs: Readonly<
		Record<"level" | "sibling" | "subtree", HTMLInputElement>
	>;
	readonly spacingLabels: Readonly<
		Record<"level" | "sibling" | "subtree", HTMLElement>
	>;
	readonly layoutSelect: HTMLSelectElement;
	readonly layoutOptionsSection: HTMLElement;
	readonly layoutOptionsContainer: HTMLElement;
	readonly styleGrid: HTMLElement;
	readonly styleEditor: HTMLElement;
	readonly paletteGrid: HTMLElement;
	readonly paletteEditor: HTMLElement;
	readonly fontFamilySelect: HTMLSelectElement;
	readonly connectorWidthSelect: HTMLSelectElement;
	readonly connectorProfileSelect: HTMLSelectElement;
	readonly selectedFormattingSection: HTMLElement;
	readonly selectedFormattingControls: Readonly<{
		shape: HTMLSelectElement;
		fontSize: HTMLInputElement;
		fontWeight: HTMLInputElement;
		borderWidth: HTMLInputElement;
		radius: HTMLInputElement;
		fill: HTMLInputElement;
		stroke: HTMLInputElement;
		textColor: HTMLInputElement;
		reset: HTMLButtonElement;
	}>;
	readonly nodeAssetsSection: HTMLElement;
	readonly nodeAssetGrid: HTMLElement;
	readonly nodeAssetLabelRow: HTMLElement;
	readonly nodeAssetLabelInput: HTMLInputElement;
	readonly clearNodeAssetsButton: HTMLButtonElement;
	readonly decorationsSection: HTMLElement;
	readonly decorationKindSelect: HTMLSelectElement;
	readonly decorationAssetRow: HTMLElement;
	readonly decorationAssetSelect: HTMLSelectElement;
	readonly decorationTextRow: HTMLElement;
	readonly decorationTextInput: HTMLInputElement;
	readonly decorationCreateButton: HTMLButtonElement;
	readonly decorationList: HTMLElement;
	readonly decorationEditor: HTMLElement;
	readonly navigationSection: HTMLElement;
	readonly focusSelectedButton: HTMLButtonElement;
	readonly clearFocusButton: HTMLButtonElement;
	readonly focusBreadcrumbs: HTMLElement;
	readonly visibleDepthSelect: HTMLSelectElement;
	readonly minimapToggle: HTMLInputElement;
	readonly appearanceSelect: HTMLSelectElement;
	readonly languageSelect: HTMLSelectElement;
	readonly sidebarToggle: HTMLButtonElement;
	readonly presentationUndoButton: HTMLButtonElement;
	readonly presentationRedoButton: HTMLButtonElement;
	readonly sidebarCloseButton: HTMLButtonElement;
	readonly sidebarScroll: HTMLElement;
	readonly sidebarTabList: HTMLElement;
	readonly sidebarTabs: Readonly<Record<SidebarTabId, HTMLButtonElement>>;
	readonly sidebarPanels: Readonly<Record<SidebarTabId, HTMLElement>>;
	readonly exportButton: HTMLButtonElement;
	readonly sidebar: HTMLElement;
	readonly status: HTMLElement;
	readonly largeMapNotice: HTMLElement;
	readonly largeMapMessage: HTMLElement;
	readonly largeMapShowAllButton: HTMLButtonElement;
	readonly rendererContainer: HTMLElement;
}

interface HtmlElementFactory {
	createElement<K extends keyof HTMLElementTagNameMap>(
		tagName: K,
	): HTMLElementTagNameMap[K];
	createElementNS<K extends keyof SVGElementTagNameMap>(
		namespaceURI: "http://www.w3.org/2000/svg",
		tagName: K,
	): SVGElementTagNameMap[K];
}

export type MindMapIconRenderer = (
	element: HTMLElement,
	iconId: string,
) => void;

/**
 * Browser-specific services are injected so the DOM workflow remains easy to
 * test and a future desktop save adapter can replace downloads without
 * changing the renderer, export encoders, or sidebar UI.
 */
export interface BasicMindMapExportServices {
	createDependencies(ownerDocument: Document): MindMapExporterDependencies;
	createArtifact(
		scene: MindMapExportScene,
		options: MindMapExportOptions,
		dependencies: MindMapExporterDependencies,
		context?: MindMapExportExecutionContext,
	): ReturnType<typeof createMindMapExportArtifact>;
	createArtifactSink(ownerDocument: Document): MindMapExportArtifactSink;
	readonly createSession?: (
		options: MindMapExportSessionOptions,
	) => MindMapExportSession;
	readonly plan?: (
		scene: MindMapExportScene,
		options: MindMapExportOptions,
		context: {
			readonly limits: MindMapFrontendFrame["capabilities"]["export"]["limits"];
			readonly encoder: MindMapExportEncoderCapability | undefined;
		},
	) => MindMapExportPlan;
}

const DEFAULT_BASIC_MIND_MAP_EXPORT_SERVICES: BasicMindMapExportServices =
	Object.freeze({
		createDependencies: createBrowserMindMapExporterDependencies,
		createArtifact: createMindMapExportArtifact,
		createArtifactSink: createBrowserDownloadMindMapExportSink,
		createSession: (options: MindMapExportSessionOptions) =>
			new MindMapExportSession(options),
		plan: planMindMapExport,
	});

interface MindMapExportSceneCapturer {
	captureExportScene(
		request: MindMapExportCaptureRequest,
		signal?: AbortSignal,
		onProgress?: (progress: MindMapExportCaptureProgress) => void,
	): MindMapExportScene | Promise<MindMapExportScene>;
}

/**
 * Functional phase-one UI. It intentionally owns the whole toolbar/status/
 * canvas subtree so replacing `MindMapFrontendFactory` replaces the complete
 * visual frontend while the ItemView lifecycle and Obsidian integration stay
 * intact.
 */
export class BasicMindMapFrontend implements MindMapFrontend {
	private readonly eventSink: MindMapFrontendEventSink;
	private readonly rendererFactory: MindMapRendererFactory;
	private readonly renderIcon: MindMapIconRenderer;
	private readonly exportServices: BasicMindMapExportServices;

	private container: HTMLElement | null = null;
	private elements: BasicFrontendElements | null = null;
	private renderer: MindMapRenderer | null = null;
	private currentFrame: MindMapFrontendFrame | null = null;
	/**
	 * The frontend owns only product chrome localization. It is intentionally
	 * independent of the renderer so switching languages cannot reset viewport,
	 * selection, or an active in-node editor.
	 */
	private translator: ObMindTranslator = createObMindTranslator(
		DEFAULT_OBMIND_LANGUAGE,
	);
	private searchIndex: MindMapDocumentSearchIndex | null = null;
	private searchResultsOpen = false;
	private exportModal: BasicMindMapExportModal | null = null;
	private exportSession: MindMapExportSession | null = null;
	private exportAbortController: AbortController | null = null;
	private exportPreviewAbortController: AbortController | null = null;
	private exportSceneCacheKey: string | null = null;
	private readonly exportSceneCache = new Map<
		MindMapExportScope,
		MindMapExportScene
	>();
	private destroyed = false;
	private eventTail: Promise<void> = Promise.resolve();
	private styleEditorDraft: MindMapPresentationLibraryStyleDraftState | null =
		null;
	private paletteEditorDraft: MindMapPresentationLibraryPaletteDraftState | null =
		null;
	/** One current-entry mutation at a time; prevents local stale commands. */
	private presentationLibraryMutationInFlight: {
		readonly entryKind: MindMapPresentationLibraryEntryKind;
		readonly entryId: string;
	} | null = null;
	private activeSidebarTab: SidebarTabId = "appearance";

	public constructor(
		eventSink: MindMapFrontendEventSink,
		rendererFactory: MindMapRendererFactory =
			DOM_SVG_MIND_MAP_RENDERER_FACTORY,
		renderIcon: MindMapIconRenderer = renderTextIcon,
		exportServices: BasicMindMapExportServices =
			DEFAULT_BASIC_MIND_MAP_EXPORT_SERVICES,
	) {
		this.eventSink = eventSink;
		this.rendererFactory = rendererFactory;
		this.renderIcon = renderIcon;
		this.exportServices = exportServices;
	}

	private t(
		key: ObMindTranslationKey,
		values?: ObMindTranslationValues,
	): string {
		return this.translator.t(key, values);
	}

	private getErrorMessage(error: unknown): string {
		return localizeObMindError(
			error,
			this.translator,
			"frontend.error.unknown",
		);
	}

	private setLanguage(language: ObMindLanguage): void {
		if (this.translator.language === language) {
			return;
		}
		this.translator = createObMindTranslator(language);
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		refreshLocalizedElements(elements.root, this.translator);
		this.updateLanguageSelect(language);
		this.exportModal?.setLanguage(language);
	}

	public mount(container: HTMLElement): void {
		if (this.destroyed) {
			return;
		}
		if (this.container === container) {
			return;
		}
		if (this.container !== null) {
			throw new Error("Mind map frontend is already mounted.");
		}

		this.container = container;
		const ownerDocument = container.ownerDocument;
		const root = createElement(ownerDocument, "div", "obmind-frontend");

		// ── Top bar ────────────────────────────────────────────────────────
		const topbar = createElement(ownerDocument, "div", "obmind-topbar");
		topbar.setAttribute("role", "toolbar");
		setLocalizedAttribute(
			topbar,
			"aria-label",
			"frontend.toolbar.aria",
			this.translator,
		);

		// Brand pill (left)
		const brandPill = createElement(
			ownerDocument,
			"div",
			"obmind-pill obmind-pill-brand",
		);
		const brandIcon = createElement(
			ownerDocument,
			"span",
			"obmind-toolbar-brand",
		);
		this.renderIcon(brandIcon, OBMIND_ICON_ID);
		const fileName = createElement(
			ownerDocument,
			"div",
			"obmind-toolbar-file",
		);
		fileName.textContent = this.t("frontend.noActiveFile");
		brandPill.append(brandIcon, fileName);

		// Center action pills
		const topbarActions = createElement(
			ownerDocument,
			"div",
			"obmind-topbar-actions",
		);

		const searchPill = createElement(
			ownerDocument,
			"div",
			"obmind-pill obmind-pill-search",
		);
		const search = createToolbarSearch(searchPill, this.translator);

		const historyPill = createElement(
			ownerDocument,
			"div",
			"obmind-pill obmind-pill-history",
		);
		const undoButton = createToolbarButton(
			historyPill,
			"undo-2",
			this.t("frontend.toolbar.undo"),
			this.renderIcon,
		);
		setLocalizedButtonLabel(
			undoButton,
			"frontend.toolbar.undo",
			this.translator,
		);
		const redoButton = createToolbarButton(
			historyPill,
			"redo-2",
			this.t("frontend.toolbar.redo"),
			this.renderIcon,
		);
		setLocalizedButtonLabel(
			redoButton,
			"frontend.toolbar.redo",
			this.translator,
		);

		const viewPill = createElement(
			ownerDocument,
			"div",
			"obmind-pill obmind-pill-view",
		);
		const fitButton = createToolbarButton(
			viewPill,
			"maximize",
			this.t("frontend.toolbar.fit"),
			this.renderIcon,
		);
		setLocalizedButtonLabel(
			fitButton,
			"frontend.toolbar.fit",
			this.translator,
		);
		const expandButton = createToolbarButton(
			viewPill,
			"chevrons-up-down",
			this.t("frontend.toolbar.expand"),
			this.renderIcon,
		);
		setLocalizedButtonLabel(
			expandButton,
			"frontend.toolbar.expand",
			this.translator,
		);
		const collapseButton = createToolbarButton(
			viewPill,
			"chevrons-down-up",
			this.t("frontend.toolbar.collapse"),
			this.renderIcon,
		);
		setLocalizedButtonLabel(
			collapseButton,
			"frontend.toolbar.collapse",
			this.translator,
		);

		topbarActions.append(searchPill, historyPill, viewPill);

		// Panel pill (right)
		const panelPill = createElement(
			ownerDocument,
			"div",
			"obmind-pill obmind-pill-panel",
		);
		const sidebarToggle = createToolbarButton(
			panelPill,
			"panel-right",
			this.t("frontend.toolbar.toggleSidebar"),
			this.renderIcon,
		);
		setLocalizedButtonLabel(
			sidebarToggle,
			"frontend.toolbar.toggleSidebar",
			this.translator,
		);
		sidebarToggle.setAttribute("aria-pressed", "false");

		topbar.append(brandPill, topbarActions, panelPill);

		// ── Body row: canvas + sidebar ──────────────────────────────────────
		const bodyRow = createElement(ownerDocument, "div", "obmind-body-row");

		const body = createElement(ownerDocument, "div", "obmind-body");
		const rendererContainer = createElement(
			ownerDocument,
			"div",
			"obmind-canvas",
		);
		const status = createElement(
			ownerDocument,
			"div",
			"obmind-status obmind-status-blocking",
		);
		status.setAttribute("role", "status");
		status.setAttribute("aria-live", "polite");
		const largeMapNotice = createElement(
			ownerDocument,
			"aside",
			"obmind-large-map-notice",
		);
		largeMapNotice.hidden = true;
		largeMapNotice.setAttribute("aria-live", "polite");
		const largeMapMessage = createElement(
			ownerDocument,
			"span",
			"obmind-large-map-notice-message",
		);
		const largeMapShowAllButton = createElement(
			ownerDocument,
			"button",
			"obmind-large-map-notice-action",
		);
		largeMapShowAllButton.type = "button";
		setLocalizedButtonLabel(
			largeMapShowAllButton,
			"frontend.largeMap.showAll.aria",
			this.translator,
		);
		setLocalizedText(
			largeMapShowAllButton,
			"frontend.largeMap.showAll",
			this.translator,
		);
		largeMapNotice.append(largeMapMessage, largeMapShowAllButton);
		body.append(rendererContainer, status, largeMapNotice);

		// ── Sidebar ─────────────────────────────────────────────────────────
		const sidebar = createElement(ownerDocument, "div", "obmind-sidebar");
		const sidebarInstanceId = String(++basicFrontendControlSequence);
		sidebar.id = `obmind-sidebar-${sidebarInstanceId}`;
		sidebar.setAttribute("role", "complementary");
		sidebar.inert = true;
		sidebar.setAttribute("aria-hidden", "true");
		sidebarToggle.setAttribute("aria-controls", sidebar.id);
		sidebarToggle.setAttribute("aria-expanded", "false");
		const sidebarInner = createElement(
			ownerDocument,
			"div",
			"obmind-sidebar-inner",
		);
		const sidebarHeader = createElement(
			ownerDocument,
			"header",
			"obmind-sidebar-header",
		);
		const sidebarHeading = createElement(
			ownerDocument,
			"div",
			"obmind-sidebar-heading",
		);
		const sidebarTitle = createElement(
			ownerDocument,
			"h2",
			"obmind-sidebar-title",
		);
		sidebarTitle.id = `obmind-sidebar-title-${sidebarInstanceId}`;
		setLocalizedText(
			sidebarTitle,
			"frontend.sidebar.title",
			this.translator,
		);
		const sidebarDescription = createElement(
			ownerDocument,
			"p",
			"obmind-sidebar-description",
		);
		setLocalizedText(
			sidebarDescription,
			"frontend.sidebar.description",
			this.translator,
		);
		sidebarHeading.append(sidebarTitle, sidebarDescription);
		sidebar.setAttribute("aria-labelledby", sidebarTitle.id);
		const sidebarHeaderActions = createElement(
			ownerDocument,
			"div",
			"obmind-sidebar-header-actions",
		);
		const presentationUndoButton = createToolbarButton(
			sidebarHeaderActions,
			"undo-2",
			this.t("frontend.presentationHistory.undo"),
			this.renderIcon,
		);
		presentationUndoButton.classList.add(
			"obmind-sidebar-history-button",
		);
		setLocalizedButtonLabel(
			presentationUndoButton,
			"frontend.presentationHistory.undo",
			this.translator,
		);
		const presentationRedoButton = createToolbarButton(
			sidebarHeaderActions,
			"redo-2",
			this.t("frontend.presentationHistory.redo"),
			this.renderIcon,
		);
		presentationRedoButton.classList.add(
			"obmind-sidebar-history-button",
		);
		setLocalizedButtonLabel(
			presentationRedoButton,
			"frontend.presentationHistory.redo",
			this.translator,
		);
		const sidebarCloseButton = createToolbarButton(
			sidebarHeaderActions,
			"x",
			this.t("frontend.sidebar.close"),
			this.renderIcon,
		);
		sidebarCloseButton.classList.add("obmind-sidebar-close-button");
		setLocalizedButtonLabel(
			sidebarCloseButton,
			"frontend.sidebar.close",
			this.translator,
		);
		sidebarHeader.append(sidebarHeading, sidebarHeaderActions);

		const sidebarTabList = createElement(
			ownerDocument,
			"div",
			"obmind-sidebar-tabs",
		);
		sidebarTabList.setAttribute("role", "tablist");
		setLocalizedAttribute(
			sidebarTabList,
			"aria-label",
			"frontend.sidebar.tabs.aria",
			this.translator,
		);
		const sidebarPanels: Record<SidebarTabId, HTMLElement> = {
			appearance: createSidebarTabPanel(
				ownerDocument,
				sidebarInstanceId,
				"appearance",
			),
			topic: createSidebarTabPanel(
				ownerDocument,
				sidebarInstanceId,
				"topic",
			),
			layout: createSidebarTabPanel(
				ownerDocument,
				sidebarInstanceId,
				"layout",
			),
		};
		const sidebarTabs: Record<SidebarTabId, HTMLButtonElement> = {
			appearance: createSidebarTab(
				sidebarTabList,
				sidebarPanels.appearance,
				"appearance",
				"palette",
				"frontend.sidebar.tab.appearance",
				this.renderIcon,
				this.translator,
			),
			topic: createSidebarTab(
				sidebarTabList,
				sidebarPanels.topic,
				"topic",
				"square-pen",
				"frontend.sidebar.tab.topic",
				this.renderIcon,
				this.translator,
			),
			layout: createSidebarTab(
				sidebarTabList,
				sidebarPanels.layout,
				"layout",
				"network",
				"frontend.sidebar.tab.layout",
				this.renderIcon,
				this.translator,
			),
		};
		const sidebarScroll = createElement(
			ownerDocument,
			"div",
			"obmind-sidebar-scroll",
		);

		const appearanceSection = createLocalizedSidebarSection(
			ownerDocument,
			"frontend.sidebar.appearance",
			this.translator,
		);
		const languageSelect = createLocalizedSidebarSelect(
			appearanceSection,
			"frontend.language",
			"frontend.language.aria",
			this.translator,
		);
		languageSelect.dataset.obmindLanguageSelect = "true";
		const appearanceSelect = createLocalizedSidebarSelect(
			appearanceSection,
			"frontend.sidebar.appearanceMode",
			"frontend.sidebar.appearanceMode.aria",
			this.translator,
		);
		const styleSection = createLocalizedSidebarSection(
			ownerDocument,
			"frontend.sidebar.style",
			this.translator,
		);
		const styleGrid = createLocalizedPresetGrid(
			styleSection,
			"frontend.sidebar.style.aria",
			"obmind-style-card-grid",
			this.translator,
		);
		const styleEditor = createElement(
			ownerDocument,
			"div",
			"obmind-library-editor obmind-style-editor",
		);
		styleSection.append(styleEditor);
		const paletteSection = createLocalizedSidebarSection(
			ownerDocument,
			"frontend.sidebar.palette",
			this.translator,
		);
		const paletteGrid = createLocalizedPresetGrid(
			paletteSection,
			"frontend.sidebar.palette.aria",
			"obmind-palette-card-grid",
			this.translator,
		);
		const paletteEditor = createElement(
			ownerDocument,
			"div",
			"obmind-library-editor obmind-palette-editor",
		);
		paletteSection.append(paletteEditor);
		const formattingSection = createLocalizedSidebarSection(
			ownerDocument,
			"frontend.sidebar.formatting",
			this.translator,
		);
		const fontFamilySelect = createLocalizedSidebarSelect(
			formattingSection,
			"frontend.sidebar.font",
			"frontend.sidebar.font.aria",
			this.translator,
		);
		const connectorWidthSelect = createLocalizedSidebarSelect(
			formattingSection,
			"frontend.sidebar.connectorWidth",
			"frontend.sidebar.connectorWidth.aria",
			this.translator,
		);
		const connectorProfileSelect = createLocalizedSidebarSelect(
			formattingSection,
			"frontend.sidebar.connectorProfile",
			"frontend.sidebar.connectorProfile.aria",
			this.translator,
		);
		const selectedFormattingSection = createLocalizedSidebarSection(
			ownerDocument,
			"frontend.sidebar.selectedTopics",
			this.translator,
		);
		const selectedFormattingControls =
			createSelectedFormattingControls(
				selectedFormattingSection,
				this.translator,
			);
		const nodeAssetsSection = createLocalizedSidebarSection(
			ownerDocument,
			"frontend.sidebar.nodeInformation",
			this.translator,
		);
		const nodeAssetGrid = createElement(
			ownerDocument,
			"div",
			"obmind-node-asset-grid",
		);
		nodeAssetGrid.setAttribute("role", "group");
		setLocalizedAttribute(
			nodeAssetGrid,
			"aria-label",
			"frontend.nodeAssets.aria",
			this.translator,
		);
		const nodeAssetLabelRow = createElement(
			ownerDocument,
			"label",
			"obmind-sidebar-row obmind-node-asset-label-row",
		);
		const nodeAssetLabelCaption = createElement(
			ownerDocument,
			"span",
			"obmind-sidebar-row-label",
		);
		setLocalizedText(
			nodeAssetLabelCaption,
			"frontend.nodeAssets.label",
			this.translator,
		);
		const nodeAssetLabelInput = createElement(
			ownerDocument,
			"input",
			"obmind-inspector-input obmind-node-asset-label-input",
		);
		nodeAssetLabelInput.type = "text";
		nodeAssetLabelInput.maxLength = 100_000;
		nodeAssetLabelInput.dataset.obmindNodeAssetLabel = "true";
		nodeAssetLabelInput.autocomplete = "off";
		setLocalizedAttribute(
			nodeAssetLabelInput,
			"aria-label",
			"frontend.nodeAssets.label.aria",
			this.translator,
		);
		setLocalizedAttribute(
			nodeAssetLabelInput,
			"placeholder",
			"frontend.nodeAssets.label.placeholder",
			this.translator,
		);
		nodeAssetLabelRow.append(nodeAssetLabelCaption, nodeAssetLabelInput);
		const clearNodeAssetsButton = createElement(
			ownerDocument,
			"button",
			"obmind-sidebar-action-button obmind-node-assets-clear",
		);
		clearNodeAssetsButton.type = "button";
		clearNodeAssetsButton.dataset.obmindNodeAssetsClear = "true";
		setLocalizedButtonLabel(
			clearNodeAssetsButton,
			"frontend.nodeAssets.clear",
			this.translator,
		);
		setLocalizedText(
			clearNodeAssetsButton,
			"frontend.nodeAssets.clear",
			this.translator,
		);
		nodeAssetsSection.append(
			nodeAssetGrid,
			nodeAssetLabelRow,
			clearNodeAssetsButton,
		);
		const decorationsSection = createLocalizedSidebarSection(
			ownerDocument,
			"frontend.sidebar.decorations",
			this.translator,
		);
		setLocalizedAttribute(
			decorationsSection,
			"aria-label",
			"frontend.decorations.aria",
			this.translator,
		);
		const decorationKindSelect = createLocalizedSidebarSelect(
			decorationsSection,
			"frontend.decorations.type",
			"frontend.decorations.type.aria",
			this.translator,
		);
		decorationKindSelect.dataset.obmindDecorationKind = "true";
		const decorationAssetRow = createElement(
			ownerDocument,
			"label",
			"obmind-sidebar-row obmind-decoration-asset-row",
		);
		const decorationAssetCaption = createElement(
			ownerDocument,
			"span",
			"obmind-sidebar-row-label",
		);
		setLocalizedText(
			decorationAssetCaption,
			"frontend.decorations.asset",
			this.translator,
		);
		const decorationAssetSelect = createElement(
			ownerDocument,
			"select",
			"obmind-toolbar-select obmind-sidebar-select",
		);
		decorationAssetSelect.dataset.obmindDecorationAsset = "true";
		setLocalizedAttribute(
			decorationAssetSelect,
			"aria-label",
			"frontend.decorations.asset.aria",
			this.translator,
		);
		setLocalizedAttribute(
			decorationAssetSelect,
			"title",
			"frontend.decorations.asset.aria",
			this.translator,
		);
		decorationAssetRow.append(decorationAssetCaption, decorationAssetSelect);
		const decorationTextRow = createElement(
			ownerDocument,
			"label",
			"obmind-sidebar-row obmind-decoration-text-row",
		);
		const decorationTextCaption = createElement(
			ownerDocument,
			"span",
			"obmind-sidebar-row-label",
		);
		setLocalizedText(
			decorationTextCaption,
			"frontend.decorations.text",
			this.translator,
		);
		const decorationTextInput = createElement(
			ownerDocument,
			"input",
			"obmind-inspector-input obmind-decoration-text-input",
		);
		decorationTextInput.type = "text";
		decorationTextInput.maxLength = 100_000;
		decorationTextInput.dataset.obmindDecorationText = "true";
		decorationTextInput.autocomplete = "off";
		setLocalizedAttribute(
			decorationTextInput,
			"aria-label",
			"frontend.decorations.text.aria",
			this.translator,
		);
		setLocalizedAttribute(
			decorationTextInput,
			"placeholder",
			"frontend.decorations.text.placeholder",
			this.translator,
		);
		decorationTextRow.append(decorationTextCaption, decorationTextInput);
		const decorationCreateButton = createElement(
			ownerDocument,
			"button",
			"obmind-sidebar-action-button obmind-decoration-create",
		);
		decorationCreateButton.type = "button";
		decorationCreateButton.dataset.obmindDecorationCreate = "true";
		setLocalizedButtonLabel(
			decorationCreateButton,
			"frontend.decorations.create",
			this.translator,
		);
		const decorationCreateButtonText = createElement(
			ownerDocument,
			"span",
			"obmind-sidebar-action-button-label",
		);
		setLocalizedText(
			decorationCreateButtonText,
			"frontend.decorations.create",
			this.translator,
		);
		decorationCreateButton.append(decorationCreateButtonText);
		const decorationList = createElement(
			ownerDocument,
			"div",
			"obmind-decoration-list",
		);
		decorationList.setAttribute("role", "listbox");
		setLocalizedAttribute(
			decorationList,
			"aria-label",
			"frontend.decorations.list.aria",
			this.translator,
		);
		const decorationEditor = createElement(
			ownerDocument,
			"div",
			"obmind-decoration-editor",
		);
		setLocalizedAttribute(
			decorationEditor,
			"aria-label",
			"frontend.decorations.editor.aria",
			this.translator,
		);
		decorationsSection.append(
			decorationAssetRow,
			decorationTextRow,
			decorationCreateButton,
			decorationList,
			decorationEditor,
		);
		const navigationSection = createLocalizedSidebarSection(
			ownerDocument,
			"frontend.sidebar.navigation",
			this.translator,
		);
		const navigationActions = createElement(
			ownerDocument,
			"div",
			"obmind-navigation-actions",
		);
		const focusSelectedButton = createElement(
			ownerDocument,
			"button",
			"obmind-sidebar-action-button",
		);
		focusSelectedButton.type = "button";
		focusSelectedButton.dataset.obmindNavigationAction = "focus-selected";
		setLocalizedButtonLabel(
			focusSelectedButton,
			"frontend.navigation.focusSelected",
			this.translator,
		);
		setLocalizedText(
			focusSelectedButton,
			"frontend.navigation.focusSelected",
			this.translator,
		);
		const clearFocusButton = createElement(
			ownerDocument,
			"button",
			"obmind-sidebar-action-button",
		);
		clearFocusButton.type = "button";
		clearFocusButton.dataset.obmindNavigationAction = "clear-focus";
		setLocalizedButtonLabel(
			clearFocusButton,
			"frontend.navigation.clearFocus",
			this.translator,
		);
		setLocalizedText(
			clearFocusButton,
			"frontend.navigation.clearFocus",
			this.translator,
		);
		navigationActions.append(focusSelectedButton, clearFocusButton);
		const focusBreadcrumbs = createElement(
			ownerDocument,
			"div",
			"obmind-focus-breadcrumbs",
		);
		focusBreadcrumbs.setAttribute("role", "navigation");
		setLocalizedAttribute(
			focusBreadcrumbs,
			"aria-label",
			"frontend.navigation.breadcrumbs.aria",
			this.translator,
		);
		const visibleDepthSelect = createLocalizedSidebarSelect(
			navigationSection,
			"frontend.navigation.visibleDepth",
			"frontend.navigation.visibleDepth.aria",
			this.translator,
		);
		visibleDepthSelect.dataset.obmindNavigationDepth = "true";
		const minimapRow = createElement(
			ownerDocument,
			"label",
			"obmind-sidebar-row obmind-navigation-toggle",
		);
		const minimapLabel = createElement(
			ownerDocument,
			"span",
			"obmind-sidebar-row-label",
		);
		setLocalizedText(
			minimapLabel,
			"frontend.navigation.minimap",
			this.translator,
		);
		const minimapToggle = createElement(
			ownerDocument,
			"input",
			"obmind-navigation-checkbox",
		);
		minimapToggle.type = "checkbox";
		setLocalizedAttribute(
			minimapToggle,
			"aria-label",
			"frontend.navigation.minimap.aria",
			this.translator,
		);
		minimapRow.append(minimapLabel, minimapToggle);
		navigationSection.append(
			navigationActions,
			focusBreadcrumbs,
			minimapRow,
		);

		const layoutSection = createLocalizedSidebarSection(
			ownerDocument,
			"frontend.sidebar.layout",
			this.translator,
		);
		const layoutSelect = createLocalizedSidebarSelect(
			layoutSection,
			"frontend.sidebar.structure",
			"frontend.sidebar.structure.aria",
			this.translator,
		);
		const directionSelect = createLocalizedSidebarSelect(
			layoutSection,
			"frontend.sidebar.direction",
			"frontend.sidebar.direction.aria",
			this.translator,
		);
		const layoutOptionsSection = createLocalizedSidebarSection(
			ownerDocument,
			"frontend.sidebar.layoutOptions",
			this.translator,
		);
		const layoutOptionsContainer = createElement(
			ownerDocument,
			"div",
			"obmind-layout-options",
		);
		layoutOptionsSection.append(layoutOptionsContainer);

		const spacingSection = createLocalizedSidebarSection(
			ownerDocument,
			"frontend.sidebar.spacing",
			this.translator,
		);
		const spacing = createSidebarSpacingControls(
			spacingSection,
			this.translator,
		);

		sidebarPanels.appearance.append(
			appearanceSection,
			styleSection,
			paletteSection,
			formattingSection,
		);
		sidebarPanels.topic.append(
			selectedFormattingSection,
			nodeAssetsSection,
			decorationsSection,
		);
		sidebarPanels.layout.append(
			navigationSection,
			layoutSection,
			layoutOptionsSection,
			spacingSection,
		);
		applySidebarTabState(
			sidebarTabs,
			sidebarPanels,
			this.activeSidebarTab,
		);
		sidebarScroll.append(
			sidebarPanels.appearance,
			sidebarPanels.topic,
			sidebarPanels.layout,
		);
		const sidebarFooter = createElement(
			ownerDocument,
			"div",
			"obmind-sidebar-footer",
		);
		const exportButton = createSidebarExportButton(
			sidebarFooter,
			this.renderIcon,
			this.translator,
		);
		sidebarInner.append(
			sidebarHeader,
			sidebarTabList,
			sidebarScroll,
			sidebarFooter,
		);
		sidebar.append(sidebarInner);
		bodyRow.append(body, sidebar);
		root.append(topbar, bodyRow);
		container.append(root);

		this.elements = {
			root,
			fileName,
			fitButton,
			expandButton,
			collapseButton,
			undoButton,
			redoButton,
			searchInput: search.input,
			searchResults: search.results,
			directionSelect,
			spacingSection,
			spacingInputs: spacing.inputs,
			spacingLabels: spacing.labels,
			layoutSelect,
			layoutOptionsSection,
			layoutOptionsContainer,
			styleGrid,
			styleEditor,
			paletteGrid,
			paletteEditor,
			fontFamilySelect,
			connectorWidthSelect,
			connectorProfileSelect,
			selectedFormattingSection,
			selectedFormattingControls,
			nodeAssetsSection,
			nodeAssetGrid,
			nodeAssetLabelRow,
			nodeAssetLabelInput,
			clearNodeAssetsButton,
			decorationsSection,
			decorationKindSelect,
			decorationAssetRow,
			decorationAssetSelect,
			decorationTextRow,
			decorationTextInput,
			decorationCreateButton,
			decorationList,
			decorationEditor,
			navigationSection,
			focusSelectedButton,
			clearFocusButton,
			focusBreadcrumbs,
			visibleDepthSelect,
			minimapToggle,
			appearanceSelect,
			languageSelect,
			sidebarToggle,
			presentationUndoButton,
			presentationRedoButton,
			sidebarCloseButton,
			sidebarScroll,
			sidebarTabList,
			sidebarTabs,
			sidebarPanels,
			sidebar,
			exportButton,
			status,
			largeMapNotice,
			largeMapMessage,
			largeMapShowAllButton,
			rendererContainer,
		};

		this.renderer = this.rendererFactory.create({
			interaction: (event) => {
				this.handleRendererInteraction(event);
			},
			renderError: () => {
				this.showBlockingStatus(this.t("frontend.status.renderError"));
				this.setDocumentActionsEnabled(false);
			},
		});
		this.renderer.mount(rendererContainer);

		fitButton.addEventListener("click", this.handleFit);
		expandButton.addEventListener("click", this.handleExpand);
		collapseButton.addEventListener("click", this.handleCollapse);
		undoButton.addEventListener("click", this.handleUndo);
		redoButton.addEventListener("click", this.handleRedo);
		largeMapShowAllButton.addEventListener(
			"click",
			this.handleLargeMapShowAll,
		);
		presentationUndoButton.addEventListener(
			"click",
			this.handlePresentationUndo,
		);
		presentationRedoButton.addEventListener(
			"click",
			this.handlePresentationRedo,
		);
		search.input.addEventListener("input", this.handleSearchInput);
		search.input.addEventListener("focus", this.handleSearchFocus);
		search.input.addEventListener("keydown", this.handleSearchKeyDown);
		search.results.addEventListener("click", this.handleSearchResultClick);
		search.results.addEventListener(
			"keydown",
			this.handleSearchResultKeyDown,
		);
		directionSelect.addEventListener("change", this.handleDirection);
		for (const input of Object.values(spacing.inputs)) {
			input.addEventListener("change", this.handleSpacing);
		}
		layoutSelect.addEventListener("change", this.handleLayout);
		layoutOptionsContainer.addEventListener(
			"input",
			this.handleLayoutOptionInput,
		);
		layoutOptionsContainer.addEventListener(
			"change",
			this.handleLayoutOptionChange,
		);
		layoutOptionsContainer.addEventListener(
			"keydown",
			this.handleLayoutOptionKeyDown,
		);
		styleGrid.addEventListener("click", this.handleStylePresetClick);
		styleEditor.addEventListener("click", this.handleStyleEditorClick);
		styleEditor.addEventListener("input", this.handleStyleEditorChange);
		styleEditor.addEventListener("change", this.handleStyleEditorChange);
		paletteGrid.addEventListener(
			"click",
			this.handlePalettePresetClick,
		);
		paletteEditor.addEventListener(
			"click",
			this.handlePaletteEditorClick,
		);
		paletteEditor.addEventListener(
			"input",
			this.handlePaletteEditorChange,
		);
		paletteEditor.addEventListener(
			"change",
			this.handlePaletteEditorChange,
		);
		fontFamilySelect.addEventListener(
			"change",
			this.handleGlobalFont,
		);
		connectorWidthSelect.addEventListener(
			"change",
			this.handleConnectorWidth,
		);
		connectorProfileSelect.addEventListener(
			"change",
			this.handleConnectorProfile,
		);
		selectedFormattingSection.addEventListener(
			"input",
			this.handleSelectedFormattingInput,
		);
		selectedFormattingSection.addEventListener(
			"change",
			this.handleSelectedFormattingChange,
		);
		selectedFormattingSection.addEventListener(
			"click",
			this.handleSelectedFormattingClick,
		);
		selectedFormattingSection.addEventListener(
			"keydown",
			this.handleSelectedFormattingKeyDown,
		);
		nodeAssetsSection.addEventListener(
			"click",
			this.handleNodeAssetClick,
		);
		nodeAssetLabelInput.addEventListener(
			"input",
			this.handleNodeAssetLabelInput,
		);
		decorationsSection.addEventListener(
			"click",
			this.handleDecorationClick,
		);
		decorationsSection.addEventListener(
			"change",
			this.handleDecorationControlChange,
		);
		decorationsSection.addEventListener(
			"input",
			this.handleDecorationControlInput,
		);
		navigationSection.addEventListener(
			"click",
			this.handleNavigationClick,
		);
		visibleDepthSelect.addEventListener(
			"change",
			this.handleVisibleDepthChange,
		);
		minimapToggle.addEventListener(
			"change",
			this.handleMinimapChange,
		);
		appearanceSelect.addEventListener(
			"change",
			this.handleAppearance,
		);
		languageSelect.addEventListener("change", this.handleLanguage);
		sidebarTabList.addEventListener(
			"click",
			this.handleSidebarTabClick,
		);
		sidebarTabList.addEventListener(
			"keydown",
			this.handleSidebarTabKeyDown,
		);
		sidebarToggle.addEventListener("click", this.handleSidebarToggle);
		sidebarCloseButton.addEventListener(
			"click",
			this.handleSidebarToggle,
		);
		exportButton.addEventListener("click", this.handleExportOpen);

		if (this.currentFrame !== null) {
			this.update(this.currentFrame);
		}
	}

	public update(frame: MindMapFrontendFrame): void {
		if (this.destroyed) {
			return;
		}

		const previousFrame = this.currentFrame;
		this.currentFrame = frame;
		this.setLanguage(
			isObMindLanguage(frame.language)
				? frame.language
				: DEFAULT_OBMIND_LANGUAGE,
		);
		const exportSceneChanged =
			this.getExportSceneCacheKey(previousFrame) !==
			this.getExportSceneCacheKey(frame);
		if (exportSceneChanged) {
			this.exportPreviewAbortController?.abort();
			this.clearExportSceneCache();
			this.exportModal?.invalidatePreflight();
		}
		const elements = this.elements;
		if (elements === null) {
			return;
		}

		this.updateAppearanceSelect(frame);
		this.updateLanguageSelect(this.translator.language);
		this.updatePresentationSelects(frame);
		this.updateNodeAssetControls(frame);
		this.updateDecorationControls(frame);
		this.updateNavigationControls(frame);
		this.updateLargeMapGuard(frame);
		this.updatePresentationHistoryControls(frame);
		const state = frame.document;
		this.updateSearchIndex(frame);

		if (state.status === "idle") {
			elements.fileName.textContent = this.t("frontend.noActiveFile");
			this.showBlockingStatus(
				this.t("frontend.status.openMarkdown"),
			);
			this.setDocumentActionsEnabled(false);
			return;
		}

		elements.fileName.textContent =
			state.source?.name ?? this.t("frontend.status.sourceUnavailable");

		if (state.status === "unsupported") {
			this.showBlockingStatus(
				this.t("frontend.status.unsupported", {
					fileName: state.source.name,
				}),
			);
			this.setDocumentActionsEnabled(false);
			return;
		}

		if (state.status === "loading") {
			this.showBlockingStatus(this.t("frontend.status.loading"));
			this.setDocumentActionsEnabled(false);
			return;
		}

		if (state.status === "error") {
			this.showBlockingStatus(this.t("frontend.status.parseError"));
			this.setDocumentActionsEnabled(false);
			return;
		}

		elements.rendererContainer.hidden = false;
		this.setDocumentActionsEnabled(true);
		elements.undoButton.disabled =
			!frame.topicCommandAvailability.hasUndoEntry;
		elements.redoButton.disabled =
			!frame.topicCommandAvailability.hasRedoEntry;

		try {
			const focusProjection = projectMindMapFocus(
				state.document.root,
				frame.interaction.focusRootNodeId,
				frame.interaction.visibleDepthLimit,
			);
			this.renderer?.render({
				root: focusProjection.root,
				sourceRevision: state.document.sourceRevision,
				language: frame.language,
				colorScheme: frame.colorScheme,
				presentation: frame.presentation,
				interaction: frame.interaction,
				topicCommandAvailability:
					frame.topicCommandAvailability,
			});
		} catch (error: unknown) {
			this.showBlockingStatus(
				this.t("frontend.status.renderError"),
				this.getErrorMessage(error),
			);
			this.setDocumentActionsEnabled(false);
			return;
		}

		if (state.document.rawIsEmpty) {
			this.showInformationalStatus(this.t("frontend.status.empty"));
		} else if (!state.document.hasStructuralNodes) {
			this.showInformationalStatus(
				this.t("frontend.status.noStructure"),
			);
		} else {
			this.hideStatus();
		}

		const previousReady =
			previousFrame?.document.status === "ready"
				? previousFrame.document
				: null;
		const fileChanged =
			previousReady?.source.path !== state.source.path;
		const layoutChanged =
			previousFrame?.presentation.layout.revision !==
				frame.presentation.layout.revision ||
			previousFrame?.presentation.layout.engineId !==
				frame.presentation.layout.engineId ||
			previousFrame?.presentation.layout.orientation !==
				frame.presentation.layout.orientation;
		const styleChanged =
			previousFrame?.presentation.theme.styleId !==
				frame.presentation.theme.styleId ||
			previousFrame?.presentation.theme.styleRevision !==
				frame.presentation.theme.styleRevision;
		const globalFontChanged =
			previousFrame?.presentation.formatting.fontFamily.id !==
				frame.presentation.formatting.fontFamily.id ||
			previousFrame?.presentation.formatting.fontFamily.revision !==
				frame.presentation.formatting.fontFamily.revision;
		const focusChanged =
			previousFrame?.interaction.focusRootNodeId !==
				frame.interaction.focusRootNodeId ||
			previousFrame?.interaction.visibleDepthLimit !==
				frame.interaction.visibleDepthLimit;

		if (frame.interaction.viewport !== null) {
			this.renderer?.setViewport(frame.interaction.viewport);
		} else if (
			fileChanged ||
			layoutChanged ||
			styleChanged ||
			globalFontChanged ||
			focusChanged
		) {
			this.renderer?.fitView();
		}
	}

	public execute(command: MindMapFrontendCommand): boolean {
		if (this.destroyed) {
			return false;
		}
		if (command.type === "presentation-library-conflict") {
			this.recoverPresentationLibraryConflict(command.conflict);
			return true;
		}
		if (this.renderer === null) {
			return false;
		}

		switch (command.type) {
			case "fit-view":
				this.renderer.fitView();
				return true;
			case "set-view-active":
				this.renderer.setViewActive(command.active);
				return true;
			case "focus-node":
				return this.renderer.focusNode(command.nodeId);
			case "reveal-node":
				return this.renderer.focusNode(command.nodeId);
			case "begin-node-edit":
				return this.renderer.beginNodeEdit(command.nodeId);
			case "keyboard-gesture":
				return this.renderer.handleKeyboardGesture(
					command.gesture,
				);
			case "restore-viewport":
				return this.renderer.setViewport(command.viewport);
		}
	}

	public destroy(): void {
		if (this.destroyed) {
			return;
		}
		this.destroyed = true;
		this.exportAbortController?.abort();
		this.exportPreviewAbortController?.abort();
		this.closeExportModal();

		const elements = this.elements;
		if (elements !== null) {
			elements.fitButton.removeEventListener("click", this.handleFit);
			elements.expandButton.removeEventListener(
				"click",
				this.handleExpand,
			);
			elements.collapseButton.removeEventListener(
				"click",
				this.handleCollapse,
			);
			elements.undoButton.removeEventListener("click", this.handleUndo);
			elements.redoButton.removeEventListener("click", this.handleRedo);
			elements.largeMapShowAllButton.removeEventListener(
				"click",
				this.handleLargeMapShowAll,
			);
			elements.presentationUndoButton.removeEventListener(
				"click",
				this.handlePresentationUndo,
			);
			elements.presentationRedoButton.removeEventListener(
				"click",
				this.handlePresentationRedo,
			);
			elements.searchInput.removeEventListener(
				"input",
				this.handleSearchInput,
			);
			elements.searchInput.removeEventListener(
				"focus",
				this.handleSearchFocus,
			);
			elements.searchInput.removeEventListener(
				"keydown",
				this.handleSearchKeyDown,
			);
			elements.searchResults.removeEventListener(
				"click",
				this.handleSearchResultClick,
			);
			elements.searchResults.removeEventListener(
				"keydown",
				this.handleSearchResultKeyDown,
			);
			elements.directionSelect.removeEventListener(
				"change",
				this.handleDirection,
			);
			for (const input of Object.values(elements.spacingInputs)) {
				input.removeEventListener("change", this.handleSpacing);
			}
			elements.layoutSelect.removeEventListener(
				"change",
				this.handleLayout,
			);
			elements.layoutOptionsContainer.removeEventListener(
				"input",
				this.handleLayoutOptionInput,
			);
			elements.layoutOptionsContainer.removeEventListener(
				"change",
				this.handleLayoutOptionChange,
			);
			elements.layoutOptionsContainer.removeEventListener(
				"keydown",
				this.handleLayoutOptionKeyDown,
			);
			elements.styleGrid.removeEventListener(
				"click",
				this.handleStylePresetClick,
			);
			elements.styleEditor.removeEventListener(
				"click",
				this.handleStyleEditorClick,
			);
			elements.styleEditor.removeEventListener(
				"input",
				this.handleStyleEditorChange,
			);
			elements.styleEditor.removeEventListener(
				"change",
				this.handleStyleEditorChange,
			);
			elements.paletteGrid.removeEventListener(
				"click",
				this.handlePalettePresetClick,
			);
			elements.paletteEditor.removeEventListener(
				"click",
				this.handlePaletteEditorClick,
			);
			elements.paletteEditor.removeEventListener(
				"input",
				this.handlePaletteEditorChange,
			);
			elements.paletteEditor.removeEventListener(
				"change",
				this.handlePaletteEditorChange,
			);
			elements.fontFamilySelect.removeEventListener(
				"change",
				this.handleGlobalFont,
			);
			elements.connectorWidthSelect.removeEventListener(
				"change",
				this.handleConnectorWidth,
			);
			elements.connectorProfileSelect.removeEventListener(
				"change",
				this.handleConnectorProfile,
			);
				elements.selectedFormattingSection.removeEventListener(
				"input",
				this.handleSelectedFormattingInput,
			);
			elements.selectedFormattingSection.removeEventListener(
				"change",
				this.handleSelectedFormattingChange,
			);
			elements.selectedFormattingSection.removeEventListener(
				"click",
				this.handleSelectedFormattingClick,
			);
			elements.selectedFormattingSection.removeEventListener(
				"keydown",
					this.handleSelectedFormattingKeyDown,
				);
				elements.nodeAssetsSection.removeEventListener(
					"click",
					this.handleNodeAssetClick,
				);
				elements.nodeAssetLabelInput.removeEventListener(
					"input",
					this.handleNodeAssetLabelInput,
				);
				elements.decorationsSection.removeEventListener(
					"click",
					this.handleDecorationClick,
				);
				elements.decorationsSection.removeEventListener(
					"change",
					this.handleDecorationControlChange,
				);
				elements.decorationsSection.removeEventListener(
					"input",
					this.handleDecorationControlInput,
				);
				elements.navigationSection.removeEventListener(
					"click",
					this.handleNavigationClick,
				);
				elements.visibleDepthSelect.removeEventListener(
					"change",
					this.handleVisibleDepthChange,
				);
				elements.minimapToggle.removeEventListener(
					"change",
					this.handleMinimapChange,
				);
			elements.appearanceSelect.removeEventListener(
				"change",
				this.handleAppearance,
			);
			elements.languageSelect.removeEventListener(
				"change",
				this.handleLanguage,
			);
			elements.sidebarTabList.removeEventListener(
				"click",
				this.handleSidebarTabClick,
			);
			elements.sidebarTabList.removeEventListener(
				"keydown",
				this.handleSidebarTabKeyDown,
			);
			elements.sidebarToggle.removeEventListener(
				"click",
				this.handleSidebarToggle,
			);
			elements.sidebarCloseButton.removeEventListener(
				"click",
				this.handleSidebarToggle,
			);
			elements.exportButton.removeEventListener(
				"click",
				this.handleExportOpen,
			);
		}

		this.renderer?.destroy();
		elements?.root.remove();
		this.renderer = null;
		this.elements = null;
		this.container = null;
		this.currentFrame = null;
		this.searchIndex = null;
		this.searchResultsOpen = false;
		this.exportAbortController = null;
		this.exportPreviewAbortController = null;
		this.clearExportSceneCache();
		this.styleEditorDraft = null;
		this.paletteEditorDraft = null;
		this.presentationLibraryMutationInFlight = null;
	}

	private updatePresentationSelects(
		frame: MindMapFrontendFrame,
	): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}

		const layoutCapability = frame.capabilities.layouts.find(
			(layout) => layout.engineId === frame.presentation.layout.engineId,
		);
		updateToolbarSelect(
			elements.directionSelect,
			(layoutCapability?.orientations ?? []).map((orientation) => ({
				value: orientation,
				label: getOrientationLabel(orientation, this.translator),
			})),
			frame.presentation.layout.orientation,
			this.t("frontend.layout.unsupportedFlow"),
		);
		updateToolbarSelect(
			elements.layoutSelect,
			frame.capabilities.layouts.map((layout) => ({
				value: layout.engineId,
				label: layout.label,
			})),
			frame.presentation.layout.engineId,
			this.t("frontend.layout.custom"),
		);
		updateStylePresetGrid(
			elements.styleGrid,
			frame.capabilities.styles,
			createMindMapRenderEffectResolver(frame.capabilities.renderEffects),
			frame.presentation.theme.styleId,
			this.translator,
		);
		updatePalettePresetGrid(
			elements.paletteGrid,
			frame.capabilities.palettes,
			frame.presentation.theme.paletteId,
			frame.colorScheme,
			this.translator,
		);
		this.updateStyleLibraryEditor(frame);
		this.updatePaletteLibraryEditor(frame);
		updateToolbarSelect(
			elements.fontFamilySelect,
			frame.capabilities.globalFonts.map((font) => ({
				value: font.id,
				label: font.label,
			})),
			frame.presentation.formatting.fontFamily.id,
			this.t("frontend.format.styleDefault"),
		);
		updateToolbarSelect(
			elements.connectorWidthSelect,
			frame.capabilities.connectorWidths.map((width) => ({
				value: width.id,
				label: width.label,
			})),
			frame.presentation.formatting.connectorWidth.id,
			this.t("frontend.format.styleDefault"),
		);
		updateToolbarSelect(
			elements.connectorProfileSelect,
			frame.capabilities.connectorProfiles.map((profile) => ({
				value: profile.id,
				label: profile.label,
			})),
			frame.presentation.formatting.connectorProfile.id,
			this.t("frontend.format.styleDefault"),
		);
		this.updateSelectedFormattingControls(frame);
		updateLayoutOptionControls(
			elements.layoutOptionsContainer,
			layoutCapability?.options ?? [],
			frame.presentation.layout.options,
			this.translator,
		);
		elements.layoutOptionsSection.hidden =
			(layoutCapability?.options.length ?? 0) === 0;

		elements.spacingSection.hidden =
			layoutCapability?.supportsSpacing !== true;
		for (const key of ["level", "sibling", "subtree"] as const) {
			const input = elements.spacingInputs[key];
			const capability = layoutCapability?.spacing?.[key];
			const label = capability?.label ?? getSpacingLabel(key, this.translator);
			elements.spacingLabels[key].textContent = label;
			input.setAttribute(
				"aria-label",
				this.t("frontend.layout.spacing.aria", { label }),
			);
			input.disabled = capability === undefined;
			input.value = String(frame.presentation.layout.spacing[key]);
			if (capability !== undefined) {
				input.min = String(capability.minimum);
				input.max = String(capability.maximum);
				input.step = String(capability.step);
			}
		}
	}

	private updateSelectedFormattingControls(
		frame: MindMapFrontendFrame,
	): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		const selectedIds = [...frame.interaction.selectedNodeIds];
		const visible =
			frame.document.status === "ready" && selectedIds.length > 0;
		elements.selectedFormattingSection.hidden = !visible;
		if (!visible) {
			return;
		}
		const overrides = selectedIds.map(
			(nodeId) => frame.presentation.nodes.get(nodeId) ?? {},
		);
		const controls = elements.selectedFormattingControls;
		updateToolbarSelect(
			controls.shape,
			[
				{ value: "", label: this.t("frontend.inheritMixed") },
				...frame.capabilities.nodeShapes.map((shape) => ({
					value: shape,
					label: getNodeShapeLabel(shape, this.translator),
				})),
			],
			commonSelectedValue(overrides, (value) => value.shape) ?? "",
			this.t("frontend.inheritMixed"),
		);
		setMixedNumberInput(
			controls.fontSize,
			commonSelectedValue(
				overrides,
				(value) => value.typography?.fontSize,
			),
			this.translator,
		);
		setMixedNumberInput(
			controls.fontWeight,
			commonSelectedValue(
				overrides,
				(value) => value.typography?.fontWeight,
			),
			this.translator,
		);
		setMixedNumberInput(
			controls.borderWidth,
			commonSelectedValue(overrides, (value) => value.borderWidth),
			this.translator,
		);
		setMixedNumberInput(
			controls.radius,
			commonSelectedValue(overrides, (value) => value.radius),
			this.translator,
		);
		setMixedColorInput(
			controls.fill,
			commonSelectedValue(overrides, (value) => value.fill),
			this.translator,
		);
		setMixedColorInput(
			controls.stroke,
			commonSelectedValue(overrides, (value) => value.stroke),
			this.translator,
		);
		setMixedColorInput(
			controls.textColor,
			commonSelectedValue(overrides, (value) => value.textColor),
			this.translator,
		);
		controls.reset.textContent =
			selectedIds.length === 1
				? this.t("frontend.format.resetTopic")
					: this.t("frontend.format.resetTopics", {
						count: this.translator.formatNumber(selectedIds.length),
					});
	}

	private updateNodeAssetControls(frame: MindMapFrontendFrame): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		const selectedIds = [...frame.interaction.selectedNodeIds];
		const tagAssets = this.getTagAssets(frame);
		const supportedAssets = frame.capabilities.assets.filter(
			(asset) =>
				asset.kind === "icon" ||
				asset.kind === "marker" ||
				(asset.kind === "tag" &&
					asset.visual.labelContent !== undefined &&
					frame.capabilities.renderedDecorations.includes("marker")),
		);
		const visible =
			frame.document.status === "ready" &&
			selectedIds.length > 0 &&
			supportedAssets.length > 0;
		elements.nodeAssetsSection.hidden = !visible;
		elements.nodeAssetLabelRow.hidden = tagAssets.length === 0;
		elements.nodeAssetLabelInput.disabled = !visible || tagAssets.length === 0;
		if (!visible) {
			elements.nodeAssetGrid.replaceChildren();
			elements.clearNodeAssetsButton.disabled = true;
			return;
		}
		const overrides = selectedIds.map(
			(nodeId) => frame.presentation.nodes.get(nodeId) ?? {},
		);
		const tagLabel = normalizeMindMapDecorationText(
			elements.nodeAssetLabelInput.value,
		);
		const buttons = supportedAssets.map((asset) => {
			const button = createMindMapAssetCapabilityButton(
				elements.nodeAssetGrid.ownerDocument,
				asset,
			);
			const active =
				asset.kind === "icon"
					? overrides.every((override) => override.iconId === asset.id)
					: asset.kind === "marker"
						? overrides.every((override) =>
							override.markerIds?.includes(asset.id),
							)
						: tagLabel.length > 0 &&
							selectedIds.every((nodeId) =>
								this.hasNodeTagDecoration(frame, nodeId, asset.id, tagLabel),
							);
			button.setAttribute("aria-pressed", String(active));
			button.classList.toggle("obmind-node-asset-active", active);
			button.disabled = asset.kind === "tag" && tagLabel.length === 0;
			return button;
		});
		elements.nodeAssetGrid.replaceChildren(...buttons);
		elements.clearNodeAssetsButton.disabled = overrides.every(
			(override) =>
				override.iconId === undefined &&
				(override.markerIds?.length ?? 0) === 0,
		) && !this.hasAnyNodeTagDecoration(frame, selectedIds);
	}

	private readonly handleNodeAssetLabelInput = (): void => {
		this.updateNodeAssetTagButtonState();
	};

	private updateNodeAssetTagButtonState(): void {
		const elements = this.elements;
		const frame = this.currentFrame;
		if (elements === null || frame?.document.status !== "ready") {
			return;
		}
		const selectedIds = [...frame.interaction.selectedNodeIds];
		const label = normalizeMindMapDecorationText(
			elements.nodeAssetLabelInput.value,
		);
		for (const button of Array.from(
			elements.nodeAssetGrid.querySelectorAll<HTMLButtonElement>(
				'button[data-obmind-asset-kind="tag"]',
			),
		)) {
			const assetId = button.dataset.obmindAssetId;
			if (
				assetId === undefined ||
				!this.getTagAssets(frame).some((asset) => asset.id === assetId)
			) {
				continue;
			}
			const active =
				label.length > 0 &&
				selectedIds.length > 0 &&
				selectedIds.every((nodeId) =>
					this.hasNodeTagDecoration(frame, nodeId, assetId, label),
				);
			button.disabled = label.length === 0;
			button.setAttribute("aria-pressed", String(active));
			button.classList.toggle("obmind-node-asset-active", active);
		}
	}

	private readonly handleNodeAssetClick = (event: MouseEvent): void => {
		const target = event.target;
		if (!(target instanceof Element)) {
			return;
		}
		const frame = this.currentFrame;
		if (frame?.document.status !== "ready") {
			return;
		}
		const selectedIds = [...frame.interaction.selectedNodeIds];
		if (selectedIds.length === 0) {
			return;
		}
		let nodePatch: ReadonlyMap<string, MindMapNodePresentation | null> | null =
			null;
		if (
			target.closest<HTMLButtonElement>(
				"button[data-obmind-node-assets-clear]",
			) !== null
		) {
			nodePatch = createMindMapNodeAssetPatch(
				frame.presentation.nodes,
				selectedIds,
				{ type: "clear-assets" },
			);
			const state = this.createDecorationCommandState(frame);
			if (state === null) {
				return;
			}
			let next = state;
			const tagAssetIds = new Set(
				this.getTagAssets(frame).map((asset) => asset.id),
			);
			for (const decoration of state.decorations) {
				if (
					decoration.kind === "marker" &&
					selectedIds.includes(decoration.nodeId) &&
					tagAssetIds.has(decoration.markerId)
				) {
					next = applyMindMapDecorationCommand(
						next,
						{ type: "delete", id: decoration.id },
						this.getDecorationValidationContext(frame),
					);
				}
			}
			const hasNodeAssets = selectedIds.some((nodeId) => {
				const override = frame.presentation.nodes.get(nodeId);
				return (
					override?.iconId !== undefined ||
					(override?.markerIds?.length ?? 0) > 0
				);
			});
			if (!hasNodeAssets && next === state) {
				return;
			}
			this.dispatch({
				type: "apply-presentation-patch",
				patch: {
					...(hasNodeAssets && nodePatch !== null ? { nodes: nodePatch } : {}),
					...(next === state ? {} : { decorations: next.decorations }),
				},
				scope: "document",
				action: createMindMapPresentationHistoryAction(
					"frontend.nodeAssets.history",
				),
			});
			if (
				next !== state &&
				next.selection.selectedDecorationId !==
					frame.interaction.selectedDecorationId
			) {
				this.dispatch({
					type: "select-decoration",
					decorationId: next.selection.selectedDecorationId,
				});
			}
			return;
		} else {
			const button = target.closest<HTMLButtonElement>(
				"button[data-obmind-asset-id]",
			);
			const assetId = button?.dataset.obmindAssetId;
			if (button === null || assetId === undefined) {
				return;
			}
			const asset = frame.capabilities.assets.find(
				(candidate) => candidate.id === assetId,
			);
			if (asset?.kind === "icon") {
				const active = selectedIds.every(
					(nodeId) =>
						frame.presentation.nodes.get(nodeId)?.iconId === assetId,
				);
				nodePatch = createMindMapNodeAssetPatch(
					frame.presentation.nodes,
					selectedIds,
					{ type: "set-icon", iconId: active ? null : assetId },
				);
			} else if (asset?.kind === "marker") {
				const active = selectedIds.every((nodeId) =>
					frame.presentation.nodes
						.get(nodeId)
						?.markerIds?.includes(assetId),
				);
				nodePatch = createMindMapNodeAssetPatch(
					frame.presentation.nodes,
					selectedIds,
					{ type: "set-marker", markerId: assetId, enabled: !active },
				);
			} else if (
				asset?.kind === "tag" &&
				asset.visual.labelContent !== undefined &&
				frame.capabilities.renderedDecorations.includes("marker")
			) {
				const label = normalizeMindMapDecorationText(
					this.elements?.nodeAssetLabelInput.value ?? "",
				);
				if (label.length === 0) {
					this.showInformationalStatus(
						this.t("frontend.decorations.requiresText"),
					);
					this.elements?.nodeAssetLabelInput.focus();
					return;
				}
				const state = this.createDecorationCommandState(frame);
				if (state === null) {
					return;
				}
				const isAppliedToEverySelection = selectedIds.every((nodeId) =>
					this.hasNodeTagDecoration(frame, nodeId, asset.id, label),
				);
				let next = state;
				const selectedTagDecorations = state.decorations.filter(
					(decoration) =>
						decoration.kind === "marker" &&
						selectedIds.includes(decoration.nodeId) &&
						this.isTagMarker(frame, decoration),
				);
				if (isAppliedToEverySelection) {
					for (const decoration of selectedTagDecorations) {
						next = applyMindMapDecorationCommand(
							next,
							{ type: "delete", id: decoration.id },
							this.getDecorationValidationContext(frame),
						);
					}
				} else {
					for (const decoration of selectedTagDecorations) {
						next = applyMindMapDecorationCommand(
							next,
							{ type: "delete", id: decoration.id },
							this.getDecorationValidationContext(frame),
						);
					}
					for (const nodeId of selectedIds) {
						next = applyMindMapDecorationCommand(
							next,
							{
								type: "create",
								select: false,
								decoration: {
									kind: "marker",
									nodeId,
									markerId: asset.id,
									label,
								},
							},
							this.getDecorationValidationContext(frame),
						);
					}
				}
				this.commitDecorationState(
					frame,
					next,
					createMindMapPresentationHistoryAction(
						"frontend.nodeAssets.labelHistory",
					),
				);
				return;
			}
		}
		if (nodePatch !== null) {
			this.dispatch({
				type: "apply-presentation-patch",
				patch: { nodes: nodePatch },
				scope: "document",
				action: createMindMapPresentationHistoryAction(
					"frontend.nodeAssets.history",
				),
			});
		}
	};

	private updateDecorationControls(frame: MindMapFrontendFrame): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		const ready = frame.document.status === "ready";
		const tagAssets = this.getTagAssets(frame);
		const kinds = [
			...(frame.capabilities.renderedDecorations.includes("relationship")
				? [
						{
							value: "relationship",
							label: this.t("frontend.decorations.relationship"),
						},
					]
				: []),
			...(frame.capabilities.renderedDecorations.includes("boundary")
				? [
						{
							value: "boundary",
							label: this.t("frontend.decorations.boundary"),
						},
					]
				: []),
			...(frame.capabilities.renderedDecorations.includes("summary")
				? [
						{
							value: "summary",
							label: this.t("frontend.decorations.summary"),
						},
					]
				: []),
			...(frame.capabilities.renderedDecorations.includes("marker") &&
				tagAssets.length > 0
				? [
						{
							value: "marker",
							label: this.t("frontend.decorations.marker"),
						},
					]
				: []),
		];
		const visible = ready && kinds.length > 0;
		elements.decorationsSection.hidden = !visible;
		elements.decorationTextInput.disabled = !visible;
		if (!visible) {
			elements.decorationList.replaceChildren();
			elements.decorationEditor.replaceChildren();
			return;
		}
		const currentKind = kinds.some(
			({ value }) => value === elements.decorationKindSelect.value,
		)
			? elements.decorationKindSelect.value
			: (kinds[0]?.value ?? "relationship");
		updateToolbarSelect(
			elements.decorationKindSelect,
			kinds,
			currentKind,
			this.t("frontend.decorations.type"),
		);
		const currentAsset = tagAssets.some(
			({ id }) => id === elements.decorationAssetSelect.value,
		)
			? elements.decorationAssetSelect.value
			: (tagAssets[0]?.id ?? "");
		updateToolbarSelect(
			elements.decorationAssetSelect,
			tagAssets.map((asset) => ({ value: asset.id, label: asset.label })),
			currentAsset,
			this.t("frontend.decorations.asset"),
		);
		this.syncDecorationControlState(frame);
		this.updateDecorationList(frame);
		this.updateDecorationEditor(frame);
	}

	private syncDecorationControlState(frame: MindMapFrontendFrame): void {
		const elements = this.elements;
		if (elements === null || frame.document.status !== "ready") {
			return;
		}
		const kind = getMindMapDecorationAuthoringKind(
			elements.decorationKindSelect.value,
		);
		if (kind === null) {
			elements.decorationTextInput.disabled = true;
			return;
		}
		elements.decorationTextInput.disabled = false;
		elements.decorationAssetRow.hidden = kind !== "marker";
		const placeholderKey =
			kind === "summary"
				? "frontend.decorations.summary.placeholder"
				: kind === "marker"
					? "frontend.decorations.tag.placeholder"
					: "frontend.decorations.text.placeholder";
		setLocalizedAttribute(
			elements.decorationTextInput,
			"placeholder",
			placeholderKey,
			this.translator,
		);
		elements.decorationTextInput.required =
			kind === "summary" || kind === "marker";
		elements.decorationCreateButton.disabled = !this.canCreateDecoration(
			frame,
			kind,
			normalizeMindMapDecorationText(elements.decorationTextInput.value),
		);
		const selected = frame.presentation.decorations.find(
			(decoration) => decoration.id === frame.interaction.selectedDecorationId,
		);
		const saveButton =
			elements.decorationEditor.querySelector<HTMLButtonElement>(
				"button[data-obmind-decoration-save]",
			);
		const editorText = elements.decorationEditor.querySelector<HTMLInputElement>(
			"input[data-obmind-decoration-editor-text]",
		);
		if (saveButton !== null && selected !== undefined && editorText !== null) {
			saveButton.disabled = !this.canUpdateDecoration(
				frame,
				selected,
				normalizeMindMapDecorationText(editorText.value),
			);
		}
	}

	private updateDecorationList(frame: MindMapFrontendFrame): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		if (frame.presentation.decorations.length === 0) {
			const empty = createElement(
				elements.decorationList.ownerDocument,
				"p",
				"obmind-decoration-empty",
			);
			setLocalizedText(empty, "frontend.decorations.empty", this.translator);
			elements.decorationList.replaceChildren(empty);
			return;
		}
		const items = frame.presentation.decorations.map((decoration) => {
			const button = createElement(
				elements.decorationList.ownerDocument,
				"button",
				"obmind-decoration-list-item",
			);
			button.type = "button";
			button.dataset.obmindDecorationId = decoration.id;
			button.setAttribute("role", "option");
			button.setAttribute(
				"aria-selected",
				String(decoration.id === frame.interaction.selectedDecorationId),
			);
			button.classList.toggle(
				"obmind-decoration-list-item-active",
				decoration.id === frame.interaction.selectedDecorationId,
			);
			const kind = createElement(
				button.ownerDocument,
				"span",
				"obmind-decoration-list-kind",
			);
			kind.textContent = this.getDecorationKindLabel(decoration.kind);
			const label = createElement(
				button.ownerDocument,
				"span",
				"obmind-decoration-list-label",
			);
			label.textContent = this.getDecorationDescription(frame, decoration);
			button.append(kind, label);
			return button;
		});
		elements.decorationList.replaceChildren(...items);
	}

	private updateDecorationEditor(frame: MindMapFrontendFrame): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		const selected = frame.presentation.decorations.find(
			(decoration) => decoration.id === frame.interaction.selectedDecorationId,
		);
		if (selected === undefined) {
			const empty = createElement(
				elements.decorationEditor.ownerDocument,
				"p",
				"obmind-decoration-empty",
			);
			setLocalizedText(empty, "frontend.decorations.select", this.translator);
			elements.decorationEditor.replaceChildren(empty);
			return;
		}
		const header = createElement(
			elements.decorationEditor.ownerDocument,
			"p",
			"obmind-decoration-editor-title",
		);
		setLocalizedText(header, "frontend.decorations.editor", this.translator);
		const description = createElement(
			elements.decorationEditor.ownerDocument,
			"p",
			"obmind-decoration-editor-description",
		);
		description.textContent = this.getDecorationDescription(frame, selected);
		const textRow = createElement(
			elements.decorationEditor.ownerDocument,
			"label",
			"obmind-sidebar-row obmind-decoration-editor-text-row",
		);
		const textCaption = createElement(
			textRow.ownerDocument,
			"span",
			"obmind-sidebar-row-label",
		);
		setLocalizedText(textCaption, "frontend.decorations.text", this.translator);
		const textInput = createElement(
			textRow.ownerDocument,
			"input",
			"obmind-inspector-input obmind-decoration-editor-text-input",
		);
		textInput.type = "text";
		textInput.maxLength = 100_000;
		textInput.dataset.obmindDecorationEditorText = "true";
		textInput.autocomplete = "off";
		const tagMarker = this.isTagMarker(frame, selected);
		const requiredText = selected.kind === "summary" || tagMarker;
		textInput.required = requiredText;
		textInput.value =
			selected.kind === "summary" ? selected.text : (selected.label ?? "");
		setLocalizedAttribute(
			textInput,
			"aria-label",
			"frontend.decorations.text.aria",
			this.translator,
		);
		setLocalizedAttribute(
			textInput,
			"placeholder",
			requiredText && selected.kind === "summary"
				? "frontend.decorations.summary.placeholder"
				: requiredText
					? "frontend.decorations.tag.placeholder"
					: "frontend.decorations.text.placeholder",
			this.translator,
		);
		textRow.append(textCaption, textInput);
		const targets = createElement(
			elements.decorationEditor.ownerDocument,
			"p",
			"obmind-decoration-editor-targets",
		);
		if (selected.kind === "marker") {
			targets.textContent = this.getDecorationTargets(frame, selected);
		} else {
			setLocalizedText(
				targets,
				"frontend.decorations.targets",
				this.translator,
			);
		}
		const actions = createElement(
			elements.decorationEditor.ownerDocument,
			"div",
			"obmind-decoration-actions",
		);
		const save = createElement(
			actions.ownerDocument,
			"button",
			"obmind-sidebar-action-button",
		);
		save.type = "button";
		save.dataset.obmindDecorationSave = selected.id;
		setLocalizedButtonLabel(save, "frontend.decorations.save", this.translator);
		const saveText = createElement(
			save.ownerDocument,
			"span",
			"obmind-sidebar-action-button-label",
		);
		setLocalizedText(saveText, "frontend.decorations.save", this.translator);
		save.append(saveText);
		const remove = createElement(
			actions.ownerDocument,
			"button",
			"obmind-sidebar-action-button obmind-decoration-delete",
		);
		remove.type = "button";
		remove.dataset.obmindDecorationDelete = selected.id;
		setLocalizedButtonLabel(remove, "frontend.decorations.delete", this.translator);
		const removeText = createElement(
			remove.ownerDocument,
			"span",
			"obmind-sidebar-action-button-label",
		);
		setLocalizedText(removeText, "frontend.decorations.delete", this.translator);
		remove.append(removeText);
		actions.append(save, remove);
		elements.decorationEditor.replaceChildren(
			header,
			description,
			textRow,
			targets,
			actions,
		);
		this.syncDecorationControlState(frame);
	}

	private readonly handleDecorationControlChange = (): void => {
		const frame = this.currentFrame;
		if (frame !== null) {
			this.syncDecorationControlState(frame);
		}
	};

	private readonly handleDecorationControlInput = (): void => {
		const frame = this.currentFrame;
		if (frame !== null) {
			this.syncDecorationControlState(frame);
		}
	};

	private readonly handleDecorationClick = (event: MouseEvent): void => {
		const target = event.target;
		const frame = this.currentFrame;
		if (!(target instanceof Element) || frame?.document.status !== "ready") {
			return;
		}
		const decorationId = target.closest<HTMLButtonElement>(
			"button[data-obmind-decoration-id]",
		)?.dataset.obmindDecorationId;
		if (decorationId !== undefined) {
			this.dispatch({ type: "select-decoration", decorationId });
			return;
		}
		if (
			target.closest<HTMLButtonElement>(
				"button[data-obmind-decoration-create]",
			) !== null
		) {
			this.createDecorationFromControls(frame);
			return;
		}
		const deleteId = target.closest<HTMLButtonElement>(
			"button[data-obmind-decoration-delete]",
		)?.dataset.obmindDecorationDelete;
		if (deleteId !== undefined) {
			this.applyDecorationCommand(
				frame,
				{ type: "delete", id: deleteId },
				createMindMapPresentationHistoryAction(
					"frontend.decorations.deleteHistory",
				),
			);
			return;
		}
		const saveId = target.closest<HTMLButtonElement>(
			"button[data-obmind-decoration-save]",
		)?.dataset.obmindDecorationSave;
		if (saveId !== undefined) {
			this.updateSelectedDecoration(frame, saveId);
		}
	};

	private createDecorationFromControls(frame: MindMapFrontendFrame): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		const kind = getMindMapDecorationAuthoringKind(
			elements.decorationKindSelect.value,
		);
		if (kind === null) {
			return;
		}
		const selectedNodeIds = [...frame.interaction.selectedNodeIds];
		const text = normalizeMindMapDecorationText(
			elements.decorationTextInput.value,
		);
		if (!this.canCreateDecoration(frame, kind, text)) {
			this.showDecorationValidationMessage(kind, selectedNodeIds, text);
			return;
		}
		const context = this.getDecorationValidationContext(frame);
		try {
			switch (kind) {
				case "relationship":
					this.applyDecorationCommand(
						frame,
						{
							type: "create",
							decoration: createMindMapRelationshipDecorationDraft(
								selectedNodeIds,
								text.length === 0 ? {} : { label: text },
								context,
							),
						},
						createMindMapPresentationHistoryAction(
							"frontend.decorations.createHistory",
						),
					);
					return;
				case "boundary":
					this.applyDecorationCommand(
						frame,
						{
							type: "create",
							decoration: createMindMapBoundaryDecorationDraft(
								selectedNodeIds,
								text.length === 0 ? {} : { label: text },
								context,
							),
						},
						createMindMapPresentationHistoryAction(
							"frontend.decorations.createHistory",
						),
					);
					return;
				case "summary":
					this.applyDecorationCommand(
						frame,
						{
							type: "create",
							decoration: createMindMapSummaryDecorationDraft(
								selectedNodeIds,
								text,
								{},
								context,
							),
						},
						createMindMapPresentationHistoryAction(
							"frontend.decorations.createHistory",
						),
					);
					return;
				case "marker": {
					const markerId = elements.decorationAssetSelect.value;
					if (!this.getTagAssets(frame).some((asset) => asset.id === markerId)) {
						this.showInformationalStatus(this.t("frontend.decorations.invalid"));
						return;
					}
					let next = this.createDecorationCommandState(frame);
					if (next === null) {
						return;
					}
					const tagAssetIds = new Set(
						this.getTagAssets(frame).map((asset) => asset.id),
					);
					for (const decoration of next.decorations) {
						if (
							decoration.kind === "marker" &&
							selectedNodeIds.includes(decoration.nodeId) &&
							tagAssetIds.has(decoration.markerId)
						) {
							next = applyMindMapDecorationCommand(
								next,
								{ type: "delete", id: decoration.id },
								context,
							);
						}
					}
					for (const nodeId of selectedNodeIds) {
						next = applyMindMapDecorationCommand(
							next,
							{
								type: "create",
								select: false,
								decoration: {
									kind: "marker",
									nodeId,
									markerId,
									label: text,
								},
							},
							context,
						);
					}
					this.commitDecorationState(
						frame,
						next,
						createMindMapPresentationHistoryAction(
							"frontend.decorations.createHistory",
						),
					);
					return;
				}
			}
		} catch {
			this.showInformationalStatus(this.t("frontend.decorations.invalid"));
		}
	}

	private updateSelectedDecoration(
		frame: MindMapFrontendFrame,
		id: string,
	): void {
		const elements = this.elements;
		const current = frame.presentation.decorations.find(
			(decoration) => decoration.id === id,
		);
		const textInput = elements?.decorationEditor.querySelector<HTMLInputElement>(
			"input[data-obmind-decoration-editor-text]",
		);
		if (current === undefined || textInput === null || textInput === undefined) {
			return;
		}
		const text = normalizeMindMapDecorationText(textInput.value);
		if (!this.canUpdateDecoration(frame, current, text)) {
			this.showDecorationValidationMessage(
				current.kind,
				this.getDecorationTargetNodeIds(current),
				text,
			);
			return;
		}
		const optionalLabel = text.length === 0 ? undefined : text;
		switch (current.kind) {
			case "relationship":
				this.applyDecorationCommand(
					frame,
					{
						type: "update",
						id,
						decoration: {
							kind: "relationship",
							fromNodeId: current.fromNodeId,
							toNodeId: current.toNodeId,
							...(current.variant === undefined
								? {}
								: { variant: current.variant }),
							...(optionalLabel === undefined ? {} : { label: optionalLabel }),
						},
					},
					createMindMapPresentationHistoryAction(
						"frontend.decorations.updateHistory",
					),
				);
				return;
			case "boundary":
				this.applyDecorationCommand(
					frame,
					{
						type: "update",
						id,
						decoration: {
							kind: "boundary",
							nodeIds: [...current.nodeIds],
							...(current.variant === undefined
								? {}
								: { variant: current.variant }),
							...(optionalLabel === undefined ? {} : { label: optionalLabel }),
						},
					},
					createMindMapPresentationHistoryAction(
						"frontend.decorations.updateHistory",
					),
				);
				return;
			case "summary":
				this.applyDecorationCommand(
					frame,
					{
						type: "update",
						id,
						decoration: {
							kind: "summary",
							nodeIds: [...current.nodeIds],
							...(current.variant === undefined
								? {}
								: { variant: current.variant }),
							text,
						},
					},
					createMindMapPresentationHistoryAction(
						"frontend.decorations.updateHistory",
					),
				);
				return;
			case "marker":
				if (this.isTagMarker(frame, current)) {
					const state = this.createDecorationCommandState(frame);
					if (state === null) {
						return;
					}
					let next = state;
					for (const decoration of state.decorations) {
						if (
							decoration.id !== id &&
							decoration.kind === "marker" &&
							decoration.nodeId === current.nodeId &&
							this.isTagMarker(frame, decoration)
						) {
							next = applyMindMapDecorationCommand(
								next,
								{ type: "delete", id: decoration.id },
								this.getDecorationValidationContext(frame),
							);
						}
					}
					next = applyMindMapDecorationCommand(
						next,
						{
							type: "update",
							id,
							decoration: {
								kind: "marker",
								nodeId: current.nodeId,
								markerId: current.markerId,
								label: text,
							},
						},
						this.getDecorationValidationContext(frame),
					);
					this.commitDecorationState(
						frame,
						next,
						createMindMapPresentationHistoryAction(
							"frontend.decorations.updateHistory",
						),
					);
					return;
				}
				this.applyDecorationCommand(
					frame,
					{
						type: "update",
						id,
						decoration: {
							kind: "marker",
							nodeId: current.nodeId,
							markerId: current.markerId,
							...(optionalLabel === undefined ? {} : { label: optionalLabel }),
						},
					},
					createMindMapPresentationHistoryAction(
						"frontend.decorations.updateHistory",
					),
				);
				return;
		}
	}

	private canCreateDecoration(
		frame: MindMapFrontendFrame,
		kind: MindMapDecoration["kind"],
		text: string,
	): boolean {
		const selectedNodeIds = [...frame.interaction.selectedNodeIds];
		if (kind === "relationship") {
			return selectedNodeIds.length === 2;
		}
		if (kind === "boundary") {
			return selectedNodeIds.length > 0;
		}
		return selectedNodeIds.length > 0 && text.length > 0;
	}

	private canUpdateDecoration(
		frame: MindMapFrontendFrame,
		decoration: MindMapDecoration,
		text: string,
	): boolean {
		if (decoration.kind === "marker") {
			return !this.isTagMarker(frame, decoration) || text.length > 0;
		}
		if (!this.hasDecorationTargetNodes(frame, decoration)) {
			return false;
		}
		return decoration.kind !== "summary" || text.length > 0;
	}

	private hasDecorationTargetNodes(
		frame: MindMapFrontendFrame,
		decoration: Exclude<MindMapDecoration, { readonly kind: "marker" }>,
	): boolean {
		const nodeIds = this.getDecorationTargetNodeIds(decoration);
		if (nodeIds.length === 0) {
			return false;
		}
		const knownNodeIds = this.getDecorationValidationContext(frame).nodeIds;
		return (
			knownNodeIds === undefined ||
			nodeIds.every((nodeId) => knownNodeIds.has(nodeId))
		);
	}

	private getDecorationTargetNodeIds(
		decoration: MindMapDecoration,
	): readonly string[] {
		switch (decoration.kind) {
			case "marker":
				return [decoration.nodeId];
			case "boundary":
			case "summary":
				return [...decoration.nodeIds];
			case "relationship":
				return [decoration.fromNodeId, decoration.toNodeId];
		}
	}

	private showDecorationValidationMessage(
		kind: MindMapDecoration["kind"],
		selectedNodeIds: readonly string[],
		text: string,
	): void {
		if (kind === "relationship" && selectedNodeIds.length !== 2) {
			this.showInformationalStatus(this.t("frontend.decorations.requiresTwo"));
			return;
		}
		if (selectedNodeIds.length === 0) {
			this.showInformationalStatus(this.t("frontend.decorations.requiresTopics"));
			return;
		}
		if ((kind === "summary" || kind === "marker") && text.length === 0) {
			this.showInformationalStatus(this.t("frontend.decorations.requiresText"));
			return;
		}
		this.showInformationalStatus(this.t("frontend.decorations.invalid"));
	}

	private applyDecorationCommand(
		frame: MindMapFrontendFrame,
		command: MindMapDecorationCommand,
		action: MindMapPresentationHistoryAction,
	): void {
		const state = this.createDecorationCommandState(frame);
		if (state === null) {
			return;
		}
		try {
			const next = applyMindMapDecorationCommand(
				state,
				command,
				this.getDecorationValidationContext(frame),
			);
			if (command.type === "select") {
				this.dispatch({
					type: "select-decoration",
					decorationId: next.selection.selectedDecorationId,
				});
				return;
			}
			this.commitDecorationState(frame, next, action);
		} catch {
			this.showInformationalStatus(this.t("frontend.decorations.invalid"));
		}
	}

	private commitDecorationState(
		frame: MindMapFrontendFrame,
		state: ReturnType<typeof createMindMapDecorationCommandState>,
		action: MindMapPresentationHistoryAction,
	): void {
		this.dispatch({
			type: "apply-presentation-patch",
			patch: { decorations: state.decorations },
			scope: "document",
			action,
		});
		if (
			state.selection.selectedDecorationId !==
			frame.interaction.selectedDecorationId
		) {
			this.dispatch({
				type: "select-decoration",
				decorationId: state.selection.selectedDecorationId,
			});
		}
	}

	private createDecorationCommandState(
		frame: MindMapFrontendFrame,
	): ReturnType<typeof createMindMapDecorationCommandState> | null {
		try {
			return createMindMapDecorationCommandState(
				frame.presentation.decorations,
				frame.interaction.selectedDecorationId,
				this.getDecorationValidationContext(frame),
			);
		} catch {
			this.showInformationalStatus(this.t("frontend.decorations.invalid"));
			return null;
		}
	}

	private getDecorationValidationContext(
		frame: MindMapFrontendFrame,
	): MindMapDecorationValidationContext {
		if (frame.document.status !== "ready") {
			return {};
		}
		return { nodeIds: collectMindMapNodeIds(frame.document.document.root) };
	}

	private getTagAssets(
		frame: MindMapFrontendFrame,
	): readonly MindMapAssetCapability[] {
		return frame.capabilities.assets.filter(
			(asset) => asset.kind === "tag" && asset.visual.labelContent !== undefined,
		);
	}

	private hasNodeTagDecoration(
		frame: MindMapFrontendFrame,
		nodeId: string,
		markerId: string,
		label: string,
	): boolean {
		return frame.presentation.decorations.some(
			(decoration) =>
				decoration.kind === "marker" &&
				decoration.nodeId === nodeId &&
				decoration.markerId === markerId &&
				decoration.label === label,
		);
	}

	private hasAnyNodeTagDecoration(
		frame: MindMapFrontendFrame,
		nodeIds: readonly string[],
	): boolean {
		const tagAssetIds = new Set(this.getTagAssets(frame).map((asset) => asset.id));
		return frame.presentation.decorations.some(
			(decoration) =>
				decoration.kind === "marker" &&
				nodeIds.includes(decoration.nodeId) &&
				tagAssetIds.has(decoration.markerId),
		);
	}

	private isTagMarker(
		frame: MindMapFrontendFrame,
		decoration: MindMapDecoration,
	): boolean {
		return (
			decoration.kind === "marker" &&
			this.getTagAssets(frame).some((asset) => asset.id === decoration.markerId)
		);
	}

	private getDecorationKindLabel(kind: MindMapDecoration["kind"]): string {
		switch (kind) {
			case "marker":
				return this.t("frontend.decorations.marker");
			case "relationship":
				return this.t("frontend.decorations.relationship");
			case "boundary":
				return this.t("frontend.decorations.boundary");
			case "summary":
				return this.t("frontend.decorations.summary");
		}
	}

	private getDecorationDescription(
		frame: MindMapFrontendFrame,
		decoration: MindMapDecoration,
	): string {
		switch (decoration.kind) {
			case "marker":
				return decoration.label ?? this.getDecorationTargets(frame, decoration);
			case "relationship":
				return (
					decoration.label ??
					`${this.getNodeLabel(frame, decoration.fromNodeId)} → ${this.getNodeLabel(
						frame,
						decoration.toNodeId,
					)}`
				);
			case "boundary":
				return (
					decoration.label ??
					decoration.nodeIds
						.map((nodeId) => this.getNodeLabel(frame, nodeId))
						.join(", ")
				);
			case "summary":
				return decoration.text;
		}
	}

	private getDecorationTargets(
		frame: MindMapFrontendFrame,
		decoration: MindMapDecoration,
	): string {
		if (decoration.kind === "marker") {
			return this.getNodeLabel(frame, decoration.nodeId);
		}
		if (decoration.kind === "relationship") {
			return `${this.getNodeLabel(frame, decoration.fromNodeId)} → ${this.getNodeLabel(
				frame,
				decoration.toNodeId,
			)}`;
		}
		return decoration.nodeIds
			.map((nodeId) => this.getNodeLabel(frame, nodeId))
			.join(", ");
	}

	private getNodeLabel(frame: MindMapFrontendFrame, nodeId: string): string {
		if (frame.document.status !== "ready") {
			return nodeId;
		}
		return findMindMapNode(frame.document.document.root, nodeId)?.text ?? nodeId;
	}

	private updateNavigationControls(frame: MindMapFrontendFrame): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		const ready = frame.document.status === "ready";
		elements.navigationSection.hidden = !ready;
		if (!ready) {
			elements.focusBreadcrumbs.replaceChildren();
			elements.focusSelectedButton.disabled = true;
			elements.clearFocusButton.disabled = true;
			elements.visibleDepthSelect.disabled = true;
			elements.minimapToggle.disabled = true;
			return;
		}

		const root = frame.document.document.root;
		const projection = projectMindMapFocus(
			root,
			frame.interaction.focusRootNodeId,
			frame.interaction.visibleDepthLimit,
		);
		const primaryId = frame.interaction.primarySelectedNodeId;
		const primary =
			primaryId === null ? null : findMindMapNode(root, primaryId);
		elements.focusSelectedButton.disabled =
			primary === null || primary.id === root.id;
		elements.clearFocusButton.disabled =
			projection.focusRootNodeId === null;

		const breadcrumbChildren: Node[] = [];
		projection.breadcrumbs.forEach((breadcrumb, index) => {
			if (index > 0) {
				const separator = createElement(
					elements.focusBreadcrumbs.ownerDocument,
					"span",
					"obmind-focus-breadcrumb-separator",
				);
				separator.textContent = "›";
				separator.setAttribute("aria-hidden", "true");
				breadcrumbChildren.push(separator);
			}
			const button = createElement(
				elements.focusBreadcrumbs.ownerDocument,
				"button",
				"obmind-focus-breadcrumb",
			);
			button.type = "button";
			button.dataset.obmindFocusNodeId = breadcrumb.nodeId;
			button.textContent = breadcrumb.text;
			button.disabled =
				breadcrumb.nodeId === projection.root.id;
			button.title = this.t("frontend.navigation.focusBreadcrumb", {
				node: breadcrumb.text,
			});
			breadcrumbChildren.push(button);
		});
		elements.focusBreadcrumbs.replaceChildren(...breadcrumbChildren);

		updateToolbarSelect(
			elements.visibleDepthSelect,
			[
				{
					value: "all",
					label: this.getVisibleDepthAllLabel(frame),
				},
				...Array.from({ length: 6 }, (_, index) => ({
					value: String(index),
					label:
						index === 0
							? this.t("frontend.navigation.depthCurrent")
							: this.t("frontend.navigation.depthLevels", {
								count: this.translator.formatNumber(index),
							}),
				})),
			],
			frame.interaction.visibleDepthLimit === null
				? "all"
				: String(frame.interaction.visibleDepthLimit),
			this.getVisibleDepthAllLabel(frame),
		);
		elements.visibleDepthSelect.disabled = false;
		elements.minimapToggle.disabled = false;
		elements.minimapToggle.checked = frame.interaction.minimapVisible;
	}

	private updateLargeMapGuard(frame: MindMapFrontendFrame): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		const guard = frame.largeMapGuard;
		const visible =
			frame.document.status === "ready" &&
			guard !== null &&
			guard !== undefined &&
			guard.protection.requiresExplicitFullRender &&
			!guard.fullMapConfirmed;
		elements.largeMapNotice.hidden = !visible;
		if (!visible || guard === null || guard === undefined) {
			elements.largeMapMessage.textContent = "";
			elements.largeMapNotice.removeAttribute("aria-label");
			elements.largeMapShowAllButton.disabled = true;
			return;
		}

		const key =
			guard.protection.level === "guarded"
				? "frontend.largeMap.guarded"
				: "frontend.largeMap.warning";
		const message = this.t(key, {
			nodeCount: this.translator.formatNumber(
				guard.protection.nodeCount,
			),
			visibleNodeCount: this.translator.formatNumber(
				guard.protection.initialVisibleNodeCount,
			),
			hiddenNodeCount: this.translator.formatNumber(
				guard.protection.hiddenNodeCount,
			),
			depth: this.translator.formatNumber(
				guard.protection.initialVisibleDepthLimit ?? 0,
			),
		});
		elements.largeMapMessage.textContent = message;
		elements.largeMapNotice.setAttribute("aria-label", message);
		elements.largeMapShowAllButton.disabled = false;
	}

	private readonly handleNavigationClick = (event: MouseEvent): void => {
		const target = event.target;
		if (!(target instanceof Element)) {
			return;
		}
		const breadcrumb = target.closest<HTMLButtonElement>(
			"button[data-obmind-focus-node-id]",
		);
		if (breadcrumb !== null && !breadcrumb.disabled) {
			const frame = this.currentFrame;
			const nodeId = breadcrumb.dataset.obmindFocusNodeId;
			if (frame?.document.status === "ready" && nodeId !== undefined) {
				this.dispatch({
					type: "change-focus-root",
					nodeId:
						nodeId === frame.document.document.root.id
							? null
							: nodeId,
				});
			}
			return;
		}
		const action = target.closest<HTMLButtonElement>(
			"button[data-obmind-navigation-action]",
		)?.dataset.obmindNavigationAction;
		if (action === "focus-selected") {
			const nodeId = this.currentFrame?.interaction.primarySelectedNodeId;
			if (nodeId !== null && nodeId !== undefined) {
				this.dispatch({ type: "change-focus-root", nodeId });
			}
		} else if (action === "clear-focus") {
			this.dispatch({ type: "change-focus-root", nodeId: null });
		}
	};

	private readonly handleVisibleDepthChange = (): void => {
		const value = this.elements?.visibleDepthSelect.value;
		if (value === undefined) {
			return;
		}
		const depth = value === "all" ? null : Number(value);
		if (depth !== null && (!Number.isSafeInteger(depth) || depth < 0)) {
			return;
		}
		if (
			depth === null &&
			this.currentFrame?.largeMapGuard?.protection
				.requiresExplicitFullRender === true &&
			this.currentFrame.largeMapGuard.fullMapConfirmed === false
		) {
			this.dispatch({ type: "show-full-large-map" });
			return;
		}
		this.dispatch({ type: "change-visible-depth", depth });
	};

	private getVisibleDepthAllLabel(frame: MindMapFrontendFrame): string {
		return frame.largeMapGuard?.protection.requiresExplicitFullRender ===
			true && frame.largeMapGuard.fullMapConfirmed === false
			? this.t("frontend.largeMap.showAll")
			: this.t("frontend.navigation.depthAll");
	}

	private readonly handleMinimapChange = (): void => {
		const visible = this.elements?.minimapToggle.checked;
		if (visible !== undefined) {
			this.dispatch({ type: "change-minimap-visibility", visible });
		}
	};

	private updateStyleLibraryEditor(frame: MindMapFrontendFrame): void {
		const container = this.elements?.styleEditor;
		const selected = frame.capabilities.styles.find(
			({ id }) => id === frame.presentation.theme.styleId,
		);
		if (container === undefined || selected === undefined) {
			this.styleEditorDraft = null;
			container?.replaceChildren();
			return;
		}
		this.styleEditorDraft = reconcileMindMapPresentationLibraryStyleDraftState(
			this.styleEditorDraft,
			selected.style,
		);
		const draftState = this.styleEditorDraft;
		const mutationInFlight = this.isPresentationLibraryEntryMutationInFlight(
			"style",
			selected.id,
		);
		const draftConflict = draftState.conflict;
		const signature = `${selected.id}:${String(selected.style.revision)}:${String(
			selected.editable,
		)}:${frame.language}:${String(mutationInFlight)}:${getPresentationLibraryDraftConflictSignature(
			draftConflict,
		)}`;
		if (container.dataset.obmindEditorSignature === signature) {
			return;
		}
		container.dataset.obmindEditorSignature = signature;
		const editor = createStyleLibraryEditor({
			ownerDocument: container.ownerDocument,
			language: frame.language,
			capability: selected,
			draft: draftState.draft,
			nodeShapes: frame.capabilities.nodeShapes,
			edgeRoutings: frame.capabilities.edgeRoutings,
			canDuplicate:
				frame.capabilities.presentationLibrary.duplicateRegisteredStyles &&
				!mutationInFlight &&
				draftConflict === null,
			canEdit:
				selected.editable &&
				frame.capabilities.presentationLibrary.editUserStyles &&
				!mutationInFlight,
			canDelete:
				selected.editable &&
				frame.capabilities.presentationLibrary.deleteUserStyles &&
				!mutationInFlight &&
				draftConflict === null,
			...(mutationInFlight
				? { unavailableMessage: this.t("frontend.library.savingStyle") }
				: {}),
		});
		if (draftConflict !== null) {
			applyPresentationLibraryDraftConflict(editor, draftConflict);
		}
		container.replaceChildren(editor);
	}

	private updatePaletteLibraryEditor(frame: MindMapFrontendFrame): void {
		const container = this.elements?.paletteEditor;
		const selected = frame.capabilities.palettes.find(
			({ id }) => id === frame.presentation.theme.paletteId,
		);
		if (container === undefined || selected === undefined) {
			this.paletteEditorDraft = null;
			container?.replaceChildren();
			return;
		}
		this.paletteEditorDraft = reconcileMindMapPresentationLibraryPaletteDraftState(
			this.paletteEditorDraft,
			selected.palette,
		);
		const draftState = this.paletteEditorDraft;
		const mutationInFlight = this.isPresentationLibraryEntryMutationInFlight(
			"palette",
			selected.id,
		);
		const draftConflict = draftState.conflict;
		const signature = `${selected.id}:${String(
			selected.palette.revision,
		)}:${String(selected.editable)}:${frame.language}:${String(
			mutationInFlight,
		)}:${getPresentationLibraryDraftConflictSignature(draftConflict)}`;
		if (container.dataset.obmindEditorSignature === signature) {
			return;
		}
		container.dataset.obmindEditorSignature = signature;
		const editor = createPaletteLibraryEditor({
			ownerDocument: container.ownerDocument,
			language: frame.language,
			capability: selected,
			draft: draftState.draft,
			colorHost: this.elements?.root ?? container,
			canDuplicate:
				frame.capabilities.presentationLibrary.duplicateRegisteredPalettes &&
				!mutationInFlight &&
				draftConflict === null,
			canEdit:
				selected.editable &&
				frame.capabilities.presentationLibrary.editUserPalettes &&
				!mutationInFlight,
			canDelete:
				selected.editable &&
				frame.capabilities.presentationLibrary.deleteUserPalettes &&
				!mutationInFlight &&
				draftConflict === null,
			...(mutationInFlight
				? { unavailableMessage: this.t("frontend.library.savingPalette") }
				: {}),
		});
		if (draftConflict !== null) {
			applyPresentationLibraryDraftConflict(editor, draftConflict);
		}
		container.replaceChildren(editor);
	}

	private updateAppearanceSelect(frame: MindMapFrontendFrame): void {
		const appearanceSelect = this.elements?.appearanceSelect;
		if (appearanceSelect === undefined) {
			return;
		}
		updateToolbarSelect(
			appearanceSelect,
			getAppearanceOptions(this.translator),
			frame.appearanceMode,
			this.t("frontend.appearance.system"),
		);
	}

	private updateLanguageSelect(language: ObMindLanguage): void {
		const languageSelect = this.elements?.languageSelect;
		if (languageSelect === undefined) {
			return;
		}
		updateToolbarSelect(
			languageSelect,
			[
				{
					value: "zh-CN",
					label: this.t("frontend.language.zhCN"),
				},
				{ value: "en", label: this.t("frontend.language.en") },
			],
			language,
			this.t("frontend.language.zhCN"),
		);
	}

	private updateSearchIndex(frame: MindMapFrontendFrame): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		if (frame.document.status !== "ready") {
			this.searchIndex = null;
			elements.searchInput.disabled = true;
			elements.searchInput.value = "";
			this.searchResultsOpen = false;
			this.renderSearchResults();
			return;
		}

		elements.searchInput.disabled = false;
		if (
			this.searchIndex === null ||
			this.searchIndex.path !== frame.document.source.path ||
			this.searchIndex.sourceRevision !==
				frame.document.document.sourceRevision
		) {
			this.searchIndex = createMindMapDocumentSearchIndex(
				frame.document.document,
			);
		}
		this.renderSearchResults();
	}

	private renderSearchResults(): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		const query = elements.searchInput.value;
		const matches =
			this.searchIndex === null
				? []
				: searchMindMapDocument(this.searchIndex, query).slice(0, 30);
		const buttons = matches.map((match) => {
			const button = createElement(
				elements.searchResults.ownerDocument,
				"button",
				"obmind-search-result",
			);
			button.type = "button";
			button.dataset.obmindSearchNodeId = match.nodeId;
			button.setAttribute("role", "option");
			const text = createElement(
				button.ownerDocument,
				"span",
				"obmind-search-result-text",
			);
			text.textContent = match.text;
			const line = createElement(
				button.ownerDocument,
				"span",
				"obmind-search-result-line",
			);
			line.textContent = this.t("frontend.search.line", {
				line: this.translator.formatNumber(match.source.line + 1),
			});
			button.append(text, line);
			return button;
		});
		elements.searchResults.replaceChildren(...buttons);
		elements.searchResults.hidden =
			!this.searchResultsOpen ||
			query.trim().length === 0 ||
			buttons.length === 0;
		elements.searchInput.setAttribute(
			"aria-expanded",
			elements.searchResults.hidden ? "false" : "true",
		);
	}

	private readonly handleSearchInput = (): void => {
		this.searchResultsOpen = true;
		this.renderSearchResults();
	};

	private readonly handleSearchFocus = (): void => {
		this.searchResultsOpen = true;
		this.renderSearchResults();
	};

	private readonly handleSearchKeyDown = (event: KeyboardEvent): void => {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		const firstResult =
			elements.searchResults.querySelector<HTMLButtonElement>(
				".obmind-search-result",
			);
		if (event.key === "Escape") {
			this.searchResultsOpen = false;
			this.renderSearchResults();
			event.preventDefault();
			return;
		}
		if (event.key === "ArrowDown" && firstResult !== null) {
			firstResult.focus();
			event.preventDefault();
			return;
		}
		if (event.key === "Enter" && firstResult !== null) {
			const nodeId = firstResult.dataset.obmindSearchNodeId;
			if (nodeId !== undefined) {
				this.revealSearchNode(nodeId);
				event.preventDefault();
			}
		}
	};

	private readonly handleSearchResultClick = (event: MouseEvent): void => {
		const target = event.target;
		if (
			target === null ||
			typeof (target as Element).closest !== "function"
		) {
			return;
		}
		const button = (target as Element).closest<HTMLButtonElement>(
			".obmind-search-result",
		);
		const nodeId = button?.dataset.obmindSearchNodeId;
		if (button === null || nodeId === undefined) {
			return;
		}
		this.revealSearchNode(nodeId);
	};

	private readonly handleSearchResultKeyDown = (
		event: KeyboardEvent,
	): void => {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		const target = event.target;
		if (
			target === null ||
			typeof (target as Element).closest !== "function"
		) {
			return;
		}
		const results = Array.from(
			elements.searchResults.querySelectorAll<HTMLButtonElement>(
				".obmind-search-result",
			),
		);
		const currentButton = (target as Element).closest<HTMLButtonElement>(
			".obmind-search-result",
		);
		if (currentButton === null) {
			return;
		}
		const currentIndex = results.indexOf(currentButton);
		if (currentIndex < 0) {
			return;
		}
		if (event.key === "Escape") {
			this.searchResultsOpen = false;
			this.renderSearchResults();
			elements.searchInput.focus();
			elements.searchInput.select();
			event.preventDefault();
			return;
		}
		if (event.key === "ArrowDown") {
			results[Math.min(currentIndex + 1, results.length - 1)]?.focus();
			event.preventDefault();
			return;
		}
		if (event.key === "ArrowUp") {
			if (currentIndex === 0) {
				elements.searchInput.focus();
			} else {
				results[currentIndex - 1]?.focus();
			}
			event.preventDefault();
		}
	};

	private revealSearchNode(nodeId: string): void {
		this.searchResultsOpen = false;
		this.renderSearchResults();
		this.dispatch({ type: "reveal-node", nodeId });
	}

	private setDocumentActionsEnabled(enabled: boolean): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}

		elements.fitButton.disabled = !enabled;
		elements.expandButton.disabled = !enabled;
		elements.collapseButton.disabled = !enabled;
		elements.undoButton.disabled = !enabled;
		elements.redoButton.disabled = !enabled;
		elements.largeMapShowAllButton.disabled = !enabled;
		elements.layoutSelect.disabled = !enabled;
		for (const control of Array.from(
			elements.layoutOptionsContainer.querySelectorAll<
				HTMLInputElement | HTMLSelectElement
			>("input, select"),
		)) {
			control.disabled = !enabled;
		}
		elements.fontFamilySelect.disabled = !enabled;
		elements.connectorWidthSelect.disabled = !enabled;
		elements.connectorProfileSelect.disabled = !enabled;
		if (!enabled) {
			elements.nodeAssetLabelInput.disabled = true;
			for (const control of Array.from(
				elements.nodeAssetsSection.querySelectorAll<
					HTMLButtonElement | HTMLInputElement
				>("button, input"),
			)) {
				control.disabled = true;
			}
			for (const control of Array.from(
				elements.decorationsSection.querySelectorAll<
					HTMLButtonElement | HTMLInputElement | HTMLSelectElement
				>("button, input, select"),
			)) {
				control.disabled = true;
			}
		} else if (this.currentFrame !== null) {
			this.updateNodeAssetControls(this.currentFrame);
			this.updateDecorationControls(this.currentFrame);
			this.updateNavigationControls(this.currentFrame);
		}
		for (const control of Object.values(
			elements.selectedFormattingControls,
		)) {
			control.disabled = !enabled;
		}
		for (const button of Array.from(
			elements.styleGrid.querySelectorAll("button"),
		)) {
			button.disabled = !enabled;
		}
		for (const button of Array.from(
			elements.paletteGrid.querySelectorAll("button"),
		)) {
			button.disabled = !enabled;
		}
		elements.directionSelect.disabled = !enabled;
		elements.exportButton.disabled =
			!enabled || !this.isExportAvailable();
		elements.exportButton.title = elements.exportButton.disabled
			? this.t("frontend.export.buttonDisabled")
			: this.t("frontend.export.button");
		if (!enabled) {
			for (const input of Object.values(elements.spacingInputs)) {
				input.disabled = true;
			}
		} else if (this.currentFrame !== null) {
			this.updatePresentationSelects(this.currentFrame);
			this.updateLargeMapGuard(this.currentFrame);
		}
	}

	private showBlockingStatus(message: string, details?: string): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}

		elements.rendererContainer.hidden = true;
		elements.largeMapNotice.hidden = true;
		elements.largeMapShowAllButton.disabled = true;
		elements.status.hidden = false;
		elements.status.textContent = message;
		elements.status.title = details ?? "";
		elements.status.classList.remove("obmind-status-note");
		elements.status.classList.add("obmind-status-blocking");
	}

	private showInformationalStatus(message: string, details?: string): void {
		const status = this.elements?.status;
		if (status === undefined) {
			return;
		}

		status.hidden = false;
		status.textContent = message;
		status.title = details ?? "";
		status.classList.remove("obmind-status-blocking");
		status.classList.add("obmind-status-note");
	}

	private dispatchPresentationLibraryCommand(
		command: MindMapPresentationLibraryCommand,
	): void {
		const target = getPresentationLibraryMutationTarget(command);
		if (target !== null) {
			this.presentationLibraryMutationInFlight = target;
			this.refreshPresentationLibraryEditor(target.entryKind);
		}
		this.dispatch(
			{ type: "manage-presentation-library", command },
			() => {
				if (
					target !== null &&
					this.presentationLibraryMutationInFlight?.entryKind ===
						target.entryKind &&
					this.presentationLibraryMutationInFlight.entryId === target.entryId
				) {
					this.presentationLibraryMutationInFlight = null;
					this.refreshPresentationLibraryEditor(target.entryKind);
				}
			},
		);
	}

	private isPresentationLibraryEntryMutationInFlight(
		entryKind: MindMapPresentationLibraryEntryKind,
		entryId: string,
	): boolean {
		return (
			this.presentationLibraryMutationInFlight?.entryKind === entryKind &&
			this.presentationLibraryMutationInFlight.entryId === entryId
		);
	}

	private refreshPresentationLibraryEditor(
		entryKind: MindMapPresentationLibraryEntryKind,
	): void {
		if (this.destroyed || this.currentFrame === null) {
			return;
		}
		if (entryKind === "style") {
			const container = this.elements?.styleEditor;
			if (container !== undefined) {
				delete container.dataset.obmindEditorSignature;
			}
			this.updateStyleLibraryEditor(this.currentFrame);
			return;
		}
		const container = this.elements?.paletteEditor;
		if (container !== undefined) {
			delete container.dataset.obmindEditorSignature;
		}
		this.updatePaletteLibraryEditor(this.currentFrame);
	}

	/**
	 * A stale library draft is never retried automatically. A revision mismatch
	 * preserves a dirty local draft behind an explicit reload action; a missing
	 * entry has no safe target to retain, so it falls back to the authoritative
	 * library selection.
	 */
	private recoverPresentationLibraryConflict(
		conflict: MindMapPresentationLibraryRevisionConflict,
	): void {
		const isStyle = conflict.entryKind === "style";
		if (
			this.isPresentationLibraryEntryMutationInFlight(
				conflict.entryKind,
				conflict.entryId,
			)
		) {
			this.presentationLibraryMutationInFlight = null;
		}

		if (
			conflict.reason === "revision-mismatch" &&
			this.preservePresentationLibraryDraftConflict(conflict)
		) {
			this.refreshPresentationLibraryEditor(conflict.entryKind);
				this.showInformationalStatus(
					this.t(
						isStyle
							? "frontend.library.conflictStylePreserved"
							: "frontend.library.conflictPalettePreserved",
					),
			);
			return;
		}

		if (isStyle) {
			this.styleEditorDraft = null;
			const container = this.elements?.styleEditor;
			if (container !== undefined) {
				delete container.dataset.obmindEditorSignature;
			}
		} else {
			this.paletteEditorDraft = null;
			const container = this.elements?.paletteEditor;
			if (container !== undefined) {
				delete container.dataset.obmindEditorSignature;
			}
		}

		if (this.currentFrame !== null) {
			if (isStyle) {
				this.updateStyleLibraryEditor(this.currentFrame);
			} else {
				this.updatePaletteLibraryEditor(this.currentFrame);
			}
		}

		this.showInformationalStatus(
			conflict.reason === "entry-missing"
				? this.t(
					isStyle
						? "frontend.library.styleRemoved"
						: "frontend.library.paletteRemoved",
				)
				: this.t(
					isStyle
						? "frontend.library.styleReloaded"
						: "frontend.library.paletteReloaded",
				),
		);
	}

	private preservePresentationLibraryDraftConflict(
		conflict: MindMapPresentationLibraryRevisionConflict,
	): boolean {
		if (conflict.actualRevision === null) {
			return false;
		}
		if (conflict.entryKind === "style") {
			const draftState = this.styleEditorDraft;
			if (
				draftState === null ||
				draftState.styleId !== conflict.entryId ||
				draftState.revision !== conflict.expectedRevision ||
				!draftState.isDirty
			) {
				return false;
			}
			this.styleEditorDraft = {
				...draftState,
				conflict: createMindMapPresentationLibraryDraftConflict(
					conflict.entryKind,
					conflict.entryId,
					draftState.revision,
					conflict.actualRevision,
				),
			};
			return true;
		}

		const draftState = this.paletteEditorDraft;
		if (
			draftState === null ||
			draftState.paletteId !== conflict.entryId ||
			draftState.revision !== conflict.expectedRevision ||
			!draftState.isDirty
		) {
			return false;
		}
		this.paletteEditorDraft = {
			...draftState,
			conflict: createMindMapPresentationLibraryDraftConflict(
				conflict.entryKind,
				conflict.entryId,
				draftState.revision,
				conflict.actualRevision,
			),
		};
		return true;
	}

	private reloadStyleLibraryDraft(): void {
		const frame = this.currentFrame;
		const selected = frame?.capabilities.styles.find(
			({ id }) => id === frame.presentation.theme.styleId,
		);
		const draftState = this.styleEditorDraft;
		if (
			frame === null ||
			selected === undefined ||
			draftState === null ||
			draftState.styleId !== selected.id ||
			draftState.conflict === null
		) {
			return;
		}
		this.styleEditorDraft =
			createMindMapPresentationLibraryStyleDraftState(selected.style);
		this.refreshPresentationLibraryEditor("style");
		this.showInformationalStatus(
			this.t("frontend.library.styleDraftDiscarded"),
		);
	}

	private reloadPaletteLibraryDraft(): void {
		const frame = this.currentFrame;
		const selected = frame?.capabilities.palettes.find(
			({ id }) => id === frame.presentation.theme.paletteId,
		);
		const draftState = this.paletteEditorDraft;
		if (
			frame === null ||
			selected === undefined ||
			draftState === null ||
			draftState.paletteId !== selected.id ||
			draftState.conflict === null
		) {
			return;
		}
		this.paletteEditorDraft =
			createMindMapPresentationLibraryPaletteDraftState(selected.palette);
		this.refreshPresentationLibraryEditor("palette");
		this.showInformationalStatus(
			this.t("frontend.library.paletteDraftDiscarded"),
		);
	}

	private hideStatus(): void {
		const status = this.elements?.status;
		if (status !== undefined) {
			status.hidden = true;
			status.title = "";
		}
	}

	private updatePresentationHistoryControls(
		frame: MindMapFrontendFrame,
	): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		const availability = frame.presentationHistoryAvailability;
		const ready = frame.document.status === "ready";
		const undoAction = availability?.undoAction ?? null;
		const redoAction = availability?.redoAction ?? null;
		elements.presentationUndoButton.disabled =
			!ready || availability?.hasUndoEntry !== true;
		elements.presentationRedoButton.disabled =
			!ready || availability?.hasRedoEntry !== true;

		setLocalizedButtonLabel(
			elements.presentationUndoButton,
			undoAction === null
				? "frontend.presentationHistory.undo"
				: "frontend.presentationHistory.undoAction",
			this.translator,
			undoAction === null
				? undefined
				: {
						action: this.t(
							undoAction.translationKey,
							undoAction.values,
						),
					},
		);
		setLocalizedButtonLabel(
			elements.presentationRedoButton,
			redoAction === null
				? "frontend.presentationHistory.redo"
				: "frontend.presentationHistory.redoAction",
			this.translator,
			redoAction === null
				? undefined
				: {
						action: this.t(
							redoAction.translationKey,
							redoAction.values,
						),
					},
		);
	}

	private readonly handleFit = (): void => {
		this.dispatch({ type: "fit-view" });
	};

	private readonly handleLargeMapShowAll = (): void => {
		const guard = this.currentFrame?.largeMapGuard;
		if (
			this.currentFrame?.document.status !== "ready" ||
			guard?.protection.requiresExplicitFullRender !== true ||
			guard.fullMapConfirmed
		) {
			return;
		}
		this.dispatch({ type: "show-full-large-map" });
	};

	private readonly handleUndo = (): void => {
		const frame = this.currentFrame;
		if (frame?.document.status !== "ready") {
			return;
		}
		this.dispatch({
			type: "execute-topic-command",
			command: "undo",
			nodeIds: [...frame.interaction.selectedNodeIds],
			primaryNodeId: frame.interaction.primarySelectedNodeId,
			sourceRevision: frame.document.document.sourceRevision,
		});
	};

	private readonly handleRedo = (): void => {
		const frame = this.currentFrame;
		if (frame?.document.status !== "ready") {
			return;
		}
		this.dispatch({
			type: "execute-topic-command",
			command: "redo",
			nodeIds: [...frame.interaction.selectedNodeIds],
			primaryNodeId: frame.interaction.primarySelectedNodeId,
			sourceRevision: frame.document.document.sourceRevision,
		});
	};

	private readonly handlePresentationUndo = (): void => {
		const frame = this.currentFrame;
		if (
			frame?.document.status !== "ready" ||
			frame.presentationHistoryAvailability?.hasUndoEntry !== true
		) {
			return;
		}
		this.dispatch({
			type: "presentation-history",
			direction: "undo",
		});
	};

	private readonly handlePresentationRedo = (): void => {
		const frame = this.currentFrame;
		if (
			frame?.document.status !== "ready" ||
			frame.presentationHistoryAvailability?.hasRedoEntry !== true
		) {
			return;
		}
		this.dispatch({
			type: "presentation-history",
			direction: "redo",
		});
	};

	private handleRendererInteraction(
		event: MindMapInteractionEvent,
	): void {
		switch (event.type) {
			case "node-activate": {
				const node = this.findFrameNode(event.nodeId);
				if (node !== null) {
					this.dispatch({
						type: "navigate-to-source",
						source: node.source,
					});
				}
				return;
			}
			case "node-link-activate": {
				const frame = this.currentFrame;
				const node = this.findFrameNode(event.nodeId);
				const link = node?.links[event.linkIndex];
				if (frame?.document.status === "ready" && link !== undefined) {
					this.dispatch({
						type: "open-node-link",
						sourcePath: frame.document.source.path,
						link: { ...link },
					});
				}
				return;
			}
			case "node-toggle":
				this.dispatch({
					type: "toggle-node",
					nodeId: event.nodeId,
				});
				return;
			case "node-task-toggle":
				this.dispatch({
					type: "toggle-task",
					nodeId: event.nodeId,
					sourceSnapshot: event.sourceSnapshot,
				});
				return;
			case "node-create-request":
				if (!this.canCreateNode(event.nodeId, event.relation)) {
					return;
				}
				this.dispatch({
					type: "create-node",
					nodeId: event.nodeId,
					relation: event.relation,
					sourceSnapshot: event.sourceSnapshot,
				});
				return;
			case "node-move-request":
				if (
					!this.canMoveNode(
						event.nodeId,
						event.targetNodeId,
						event.placement,
					)
				) {
					return;
				}
				this.dispatch({
					type: "move-node",
					sourceNodeId: event.nodeId,
					targetNodeId: event.targetNodeId,
					placement: event.placement,
					sourceSnapshot: event.sourceSnapshot,
					targetSnapshot: event.targetSnapshot,
				});
				return;
			case "topic-command-request":
				this.dispatch({
					type: "execute-topic-command",
					command: event.command,
					nodeIds: event.nodeIds,
					primaryNodeId: event.primaryNodeId,
					sourceRevision: event.sourceRevision,
				});
				return;
			case "node-edit-commit":
				this.dispatch({
					type: "edit-node-text",
					nodeId: event.nodeId,
					expectedText: event.expectedText,
					sourceSnapshot: event.sourceSnapshot,
					text: event.text,
					continuation: event.continuation,
				});
				return;
			case "node-focus":
				this.dispatch({
					type: "focus-change",
					nodeId: event.nodeId,
				});
				return;
			case "node-hover":
				this.dispatch({
					type: "hover-change",
					nodeId: event.nodeId,
				});
				return;
			case "node-select": {
				const frame = this.currentFrame;
				if (frame?.document.status !== "ready") {
					return;
				}
				const selection = applyMindMapSelection({
					state: {
						selectedNodeIds:
							frame.interaction.selectedNodeIds,
						primaryNodeId:
							frame.interaction.primarySelectedNodeId,
						anchorNodeId:
							frame.interaction.selectionAnchorNodeId,
					},
					nodeId: event.nodeId,
					mode: event.mode,
					orderedNodeIds: createVisibleMindMapNavigation(
						frame.document.document.root,
						frame.interaction.collapsedNodeIds,
					).order,
				});
				this.dispatch({
					type: "selection-change",
					selectedNodeIds: selection.selectedNodeIds,
					primaryNodeId: selection.primaryNodeId,
					anchorNodeId: selection.anchorNodeId,
				});
				return;
			}
			case "nodes-select": {
				const current =
					this.currentFrame?.interaction.selectedNodeIds ??
					new Set<string>();
				const selected =
					event.mode === "add"
						? new Set(current)
						: new Set<string>();
				for (const nodeId of event.nodeIds) {
					selected.add(nodeId);
				}
				const primary =
					event.primaryNodeId !== null &&
					selected.has(event.primaryNodeId)
						? event.primaryNodeId
						: (selected.values().next().value ?? null);
				this.dispatch({
					type: "selection-change",
					selectedNodeIds: selected,
					primaryNodeId: primary,
					anchorNodeId: primary,
				});
				return;
			}
			case "decoration-select":
				this.dispatch({
					type: "select-decoration",
					decorationId: event.decorationId,
				});
				return;
			case "canvas-clear-selection":
				this.dispatch({
					type: "selection-change",
					selectedNodeIds: new Set(),
					primaryNodeId: null,
					anchorNodeId: null,
				});
				this.dispatch({
					type: "select-decoration",
					decorationId: null,
				});
				return;
			case "viewport-change":
				this.dispatch({
					type: "viewport-change",
					viewport: event.viewport,
				});
				return;
		}
	}

	private canCreateNode(
		nodeId: string,
		relation: "child" | "sibling",
	): boolean {
		const node = this.findFrameNode(nodeId);
		const editing = this.currentFrame?.capabilities.editing;
		if (node === null || editing === undefined) {
			return false;
		}

		return (
			relation === "child"
				? editing.createChildFor
				: editing.createSiblingFor
		).includes(node.kind);
	}

	private canMoveNode(
		sourceNodeId: string,
		targetNodeId: string,
		placement: "before" | "after" | "child",
	): boolean {
		const source = this.findFrameNode(sourceNodeId);
		const target = this.findFrameNode(targetNodeId);
		const moving = this.currentFrame?.capabilities.moving;
		if (
			source === null ||
			target === null ||
			moving === undefined ||
			source.kind === "root" ||
			!moving.movableNodeKinds.includes(source.kind) ||
			!moving.placements.includes(placement)
		) {
			return false;
		}

		return (
			target.kind !== "root" ||
			(placement === "child" && moving.rootAcceptsChildren)
		);
	}

	private findFrameNode(nodeId: string): MindMapNode | null {
		const document = this.currentFrame?.document;
		if (document?.status !== "ready") {
			return null;
		}

		const pending: MindMapNode[] = [document.document.root];
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

	private readonly handleExpand = (): void => {
		this.dispatch({ type: "expand-all" });
	};

	private readonly handleCollapse = (): void => {
		this.dispatch({ type: "collapse-all" });
	};

	private readonly handleDirection = (): void => {
		const frame = this.currentFrame;
		const orientation = this.elements?.directionSelect.value;
		const layoutCapability = frame?.capabilities.layouts.find(
			(layout) => layout.engineId === frame.presentation.layout.engineId,
		);
		if (
			frame === null ||
			orientation === undefined ||
			!layoutCapability?.orientations.includes(
				orientation as MindMapLayoutOrientation,
			)
		) {
			return;
		}
		this.dispatch({
			type: "change-layout",
			layout: {
				...frame.presentation.layout,
				revision: nextRevision(
					frame.presentation.layout.revision,
				),
				orientation: orientation as MindMapLayoutOrientation,
			},
			scope: "document",
		});
	};

	private readonly handleSpacing = (): void => {
		const frame = this.currentFrame;
		const elements = this.elements;
		const layoutCapability = frame?.capabilities.layouts.find(
			(layout) => layout.engineId === frame.presentation.layout.engineId,
		);
		if (
			frame === null ||
			elements === null ||
			layoutCapability?.supportsSpacing !== true ||
			layoutCapability.spacing === undefined
		) {
			return;
		}

		const spacing = { ...frame.presentation.layout.spacing };
		for (const key of ["level", "sibling", "subtree"] as const) {
			const value = Number(elements.spacingInputs[key].value);
			const capability = layoutCapability.spacing[key];
			if (!Number.isFinite(value)) {
				return;
			}
			spacing[key] = Math.min(
				capability.maximum,
				Math.max(capability.minimum, value),
			);
		}

		this.dispatch({
			type: "change-layout",
			layout: {
				...frame.presentation.layout,
				revision: nextRevision(
					frame.presentation.layout.revision,
				),
				spacing,
			},
			scope: "document",
		});
	};

	private readonly handleLayout = (): void => {
		const frame = this.currentFrame;
		const selectedId = this.elements?.layoutSelect.value;
		const selected = frame?.capabilities.layouts.find(
			(layout) => layout.engineId === selectedId,
		);
		if (
			frame === null ||
			selectedId === undefined ||
			selected === undefined
		) {
			return;
		}
		const orientation = selected.orientations.includes(
			frame.presentation.layout.orientation,
		)
			? frame.presentation.layout.orientation
			: selected.orientations[0];
		if (orientation === undefined) {
			return;
		}

		this.dispatch({
			type: "change-layout",
			layout: {
				...frame.presentation.layout,
				revision: nextRevision(
					frame.presentation.layout.revision,
				),
				engineId: selectedId,
				orientation,
				options: {},
			},
			scope: "document",
		});
	};

	private readonly handleLayoutOptionInput = (event: Event): void => {
		const control = getLayoutOptionControl(event.target);
		if (!(control instanceof HTMLInputElement) || control.type !== "number") {
			return;
		}
		const request = this.createLayoutOptionRequest(control);
		if (request === null) {
			return;
		}
		this.dispatch({
			type: "preview-presentation-patch",
			gestureId: request.gestureId,
			patch: request.patch,
			action: request.action,
		});
	};

	private readonly handleLayoutOptionChange = (event: Event): void => {
		const control = getLayoutOptionControl(event.target);
		if (control === null) {
			return;
		}
		const request = this.createLayoutOptionRequest(control);
		if (request === null) {
			return;
		}
		if (control instanceof HTMLInputElement && control.type === "number") {
			this.dispatch({
				type: "preview-presentation-patch",
				gestureId: request.gestureId,
				patch: request.patch,
				action: request.action,
			});
			this.dispatch({
				type: "commit-presentation-preview",
				gestureId: request.gestureId,
			});
			return;
		}
		this.dispatch({
			type: "apply-presentation-patch",
			patch: request.patch,
			scope: "document",
			action: request.action,
		});
	};

	private readonly handleLayoutOptionKeyDown = (
		event: KeyboardEvent,
	): void => {
		if (event.key !== "Escape") {
			return;
		}
		const control = getLayoutOptionControl(event.target);
		const request =
			control === null ? null : this.createLayoutOptionRequest(control);
		if (request === null) {
			return;
		}
		event.preventDefault();
		this.dispatch({
			type: "cancel-presentation-preview",
			gestureId: request.gestureId,
		});
	};

	private createLayoutOptionRequest(
		control: HTMLInputElement | HTMLSelectElement,
	): {
		readonly gestureId: string;
		readonly patch: MindMapPresentationPatch;
		readonly action: MindMapPresentationHistoryAction;
	} | null {
		const frame = this.currentFrame;
		const key = control.dataset.obmindLayoutOptionKey;
		const capability = frame?.capabilities.layouts.find(
			(layout) => layout.engineId === frame.presentation.layout.engineId,
		);
		const definition = capability?.options.find(
			(option) => option.key === key,
		);
		if (
			frame?.document.status !== "ready" ||
			key === undefined ||
			definition === undefined
		) {
			return null;
		}
		const value = readLayoutOptionControlValue(control, definition);
		if (value === null) {
			return null;
		}
		return {
			gestureId: [
				"layout-option",
				frame.document.source.path,
				frame.presentation.layout.engineId,
				key,
			].join(":"),
			patch: {
				layout: {
					...frame.presentation.layout,
					revision: nextRevision(
						frame.presentation.layout.revision,
					),
					options: {
						...frame.presentation.layout.options,
						[key]: value,
					},
				},
			},
			action: createMindMapPresentationHistoryAction(
				"history.change-presentation",
			),
		};
	}

	private readonly handleStylePresetClick = (event: MouseEvent): void => {
		const frame = this.currentFrame;
		const target = event.target;
		const button =
			target instanceof Element
				? target.closest<HTMLButtonElement>(
						"button[data-obmind-style-id]",
					)
				: null;
		const selectedId = button?.dataset.obmindStyleId;
		const selectedStyle = frame?.capabilities.styles.find(
			(style) => style.id === selectedId,
		);
		if (
			button === null ||
			this.elements?.styleGrid.contains(button) !== true ||
			selectedStyle === undefined
		) {
			return;
		}

		this.dispatch({
			type: "change-style",
			styleId: selectedStyle.id,
			scope: "document",
		});
	};

	private readonly handlePalettePresetClick = (event: MouseEvent): void => {
		const frame = this.currentFrame;
		const target = event.target;
		const button =
			target instanceof Element
				? target.closest<HTMLButtonElement>(
						"button[data-obmind-palette-id]",
					)
				: null;
		const selectedId = button?.dataset.obmindPaletteId;
		const selectedPalette = frame?.capabilities.palettes.find(
			(palette) => palette.id === selectedId,
		);
		if (
			button === null ||
			this.elements?.paletteGrid.contains(button) !== true ||
			selectedPalette === undefined
		) {
			return;
		}

		this.dispatch({
			type: "change-palette",
			paletteId: selectedPalette.id,
			scope: "document",
		});
	};

	private readonly handleStyleEditorClick = (event: MouseEvent): void => {
		const conflictAction = getPresentationLibraryDraftConflictAction(
			event.target,
			"style",
		);
		if (conflictAction === "reload") {
			this.reloadStyleLibraryDraft();
			return;
		}
		const action = getLibraryEditorAction(event.target, "style");
		const frame = this.currentFrame;
		const selected = frame?.capabilities.styles.find(
			({ id }) => id === frame.presentation.theme.styleId,
		);
		if (
			action === null ||
			frame === null ||
			selected === undefined ||
			this.styleEditorDraft?.conflict !== null
		) {
			return;
		}
		if (
			action === "duplicate" &&
			frame.capabilities.presentationLibrary.duplicateRegisteredStyles
		) {
			this.dispatch({
				type: "manage-presentation-library",
				command: {
					type: "duplicate-style",
					sourceStyleId: selected.id,
					label: this.t("frontend.library.copyOf", {
						name: selected.label,
					}),
				},
			});
			return;
		}
		if (
			action === "delete" &&
			selected.editable &&
			frame.capabilities.presentationLibrary.deleteUserStyles &&
			!this.isPresentationLibraryEntryMutationInFlight("style", selected.id)
		) {
			this.dispatchPresentationLibraryCommand({
				type: "delete-style",
				styleId: selected.id,
				expectedRevision: selected.style.revision,
			});
		}
	};

	private readonly handleStyleEditorChange = (event: Event): void => {
		const control = getLibraryEditorControl(event.target, "style");
		const frame = this.currentFrame;
		const selected = frame?.capabilities.styles.find(
			({ id }) => id === frame.presentation.theme.styleId,
		);
		const storedDraft = this.styleEditorDraft;
		if (
			control === null ||
			frame === null ||
			selected === undefined ||
			storedDraft === null ||
			storedDraft.styleId !== selected.id ||
			storedDraft.conflict !== null ||
			!selected.editable ||
			!frame.capabilities.presentationLibrary.editUserStyles ||
			this.isPresentationLibraryEntryMutationInFlight("style", selected.id)
		) {
			return;
		}
		const change = createStyleLibraryDraftChange(control, storedDraft.draft);
		if (change === null) {
			return;
		}

		try {
			const draft = applyMindMapPresentationLibraryStyleDraftChange(
				storedDraft.draft,
				change,
			);
			this.styleEditorDraft = {
				...storedDraft,
				draft,
				isDirty: true,
			};
			if (event.type !== "change") {
				return;
			}
			this.dispatchPresentationLibraryCommand({
				type: "update-style",
				styleId: selected.id,
				expectedRevision: storedDraft.revision,
				definition:
					toMindMapPresentationLibraryStyleDefinition(draft),
			});
		} catch (error: unknown) {
			this.showInformationalStatus(
				this.t("frontend.library.updateStyleFailed", {
					error: this.getErrorMessage(error),
				}),
			);
		}
	};

	private readonly handlePaletteEditorClick = (event: MouseEvent): void => {
		const conflictAction = getPresentationLibraryDraftConflictAction(
			event.target,
			"palette",
		);
		if (conflictAction === "reload") {
			this.reloadPaletteLibraryDraft();
			return;
		}
		const action = getLibraryEditorAction(event.target, "palette");
		const frame = this.currentFrame;
		const selected = frame?.capabilities.palettes.find(
			({ id }) => id === frame.presentation.theme.paletteId,
		);
		if (
			action === null ||
			frame === null ||
			selected === undefined ||
			this.paletteEditorDraft?.conflict !== null
		) {
			return;
		}
		if (
			action === "duplicate" &&
			frame.capabilities.presentationLibrary.duplicateRegisteredPalettes
		) {
			this.dispatch({
				type: "manage-presentation-library",
				command: {
					type: "duplicate-palette",
					sourcePaletteId: selected.id,
					label: this.t("frontend.library.copyOf", {
						name: selected.label,
					}),
				},
			});
			return;
		}
		if (
			action === "delete" &&
			selected.editable &&
			frame.capabilities.presentationLibrary.deleteUserPalettes &&
			!this.isPresentationLibraryEntryMutationInFlight("palette", selected.id)
		) {
			this.dispatchPresentationLibraryCommand({
				type: "delete-palette",
				paletteId: selected.id,
				expectedRevision: selected.palette.revision,
			});
		}
	};

	private readonly handlePaletteEditorChange = (event: Event): void => {
		const control = getLibraryEditorControl(event.target, "palette");
		const frame = this.currentFrame;
		const selected = frame?.capabilities.palettes.find(
			({ id }) => id === frame.presentation.theme.paletteId,
		);
		const storedDraft = this.paletteEditorDraft;
		if (
			control === null ||
			frame === null ||
			selected === undefined ||
			storedDraft === null ||
			storedDraft.paletteId !== selected.id ||
			storedDraft.conflict !== null ||
			!selected.editable ||
			!frame.capabilities.presentationLibrary.editUserPalettes ||
			this.isPresentationLibraryEntryMutationInFlight("palette", selected.id)
		) {
			return;
		}
		const change = createPaletteLibraryDraftChange(control);
		if (change === null) {
			return;
		}

		try {
			const draft = applyMindMapPresentationLibraryPaletteDraftChange(
				storedDraft.draft,
				change,
			);
			this.paletteEditorDraft = {
				...storedDraft,
				draft,
				isDirty: true,
			};
			if (event.type !== "change") {
				return;
			}
			this.dispatchPresentationLibraryCommand({
				type: "update-palette",
				paletteId: selected.id,
				expectedRevision: storedDraft.revision,
				definition:
					toMindMapPresentationLibraryPaletteDefinition(draft),
			});
			if (change.type === "set-light-overrides-enabled") {
				const container = this.elements?.paletteEditor;
				if (container !== undefined) {
					delete container.dataset.obmindEditorSignature;
				}
				this.updatePaletteLibraryEditor(frame);
			}
		} catch (error: unknown) {
			this.showInformationalStatus(
				this.t("frontend.library.updatePaletteFailed", {
					error: this.getErrorMessage(error),
				}),
			);
		}
	};

	private readonly handleGlobalFont = (): void => {
		const frame = this.currentFrame;
		const fontFamilyId = this.elements?.fontFamilySelect.value;
		if (
			frame === null ||
			fontFamilyId === undefined ||
			!frame.capabilities.globalFonts.some(
				(font) => font.id === fontFamilyId,
			)
		) {
			return;
		}
		this.dispatch({
			type: "change-global-font",
			fontFamilyId,
			scope: "document",
		});
	};

	private readonly handleConnectorWidth = (): void => {
		const frame = this.currentFrame;
		const connectorWidthId = this.elements?.connectorWidthSelect.value;
		if (
			frame === null ||
			connectorWidthId === undefined ||
			!frame.capabilities.connectorWidths.some(
				(width) => width.id === connectorWidthId,
			)
		) {
			return;
		}
		this.dispatch({
			type: "change-connector-width",
			connectorWidthId,
			scope: "document",
		});
	};

	private readonly handleConnectorProfile = (): void => {
		const frame = this.currentFrame;
		const connectorProfileId =
			this.elements?.connectorProfileSelect.value;
		if (
			frame === null ||
			connectorProfileId === undefined ||
			!frame.capabilities.connectorProfiles.some(
				(profile) => profile.id === connectorProfileId,
			)
		) {
			return;
		}
		this.dispatch({
			type: "change-connector-profile",
			connectorProfileId,
			scope: "document",
		});
	};

	private readonly handleSelectedFormattingInput = (event: Event): void => {
		const control = getSelectedFormattingControl(event.target);
		if (!(control instanceof HTMLInputElement)) {
			return;
		}
		const request = this.createSelectedFormattingRequest(control);
		if (request === null) {
			return;
		}
		this.dispatch({
			type: "preview-presentation-patch",
			gestureId: request.gestureId,
			patch: request.patch,
			action: request.action,
		});
	};

	private readonly handleSelectedFormattingChange = (event: Event): void => {
		const control = getSelectedFormattingControl(event.target);
		if (control === null) {
			return;
		}
		const request = this.createSelectedFormattingRequest(control);
		if (request === null) {
			return;
		}
		if (control instanceof HTMLSelectElement) {
			this.dispatch({
				type: "apply-presentation-patch",
				patch: request.patch,
				scope: "document",
				action: request.action,
			});
			return;
		}
		this.dispatch({
			type: "preview-presentation-patch",
			gestureId: request.gestureId,
			patch: request.patch,
			action: request.action,
		});
		this.dispatch({
			type: "commit-presentation-preview",
			gestureId: request.gestureId,
		});
	};

	private readonly handleSelectedFormattingClick = (event: MouseEvent): void => {
		const target = event.target;
		if (
			!(target instanceof Element) ||
			target.closest<HTMLButtonElement>(
				"button[data-obmind-formatting-reset]",
			) === null
		) {
			return;
		}
		const frame = this.currentFrame;
		if (frame?.document.status !== "ready") {
			return;
		}
		const nodeIds = [...frame.interaction.selectedNodeIds];
		if (nodeIds.length === 0) {
			return;
		}
		this.dispatch({
			type: "apply-presentation-patch",
			patch: {
				nodes: createMindMapNodeFormattingPatch(
					frame.presentation.nodes,
					nodeIds,
					{ type: "reset" },
				),
			},
			scope: "document",
			action: createMindMapPresentationHistoryAction(
				"frontend.format.resetSelected",
			),
		});
	};

	private readonly handleSelectedFormattingKeyDown = (
		event: KeyboardEvent,
	): void => {
		if (event.key !== "Escape") {
			return;
		}
		const control = getSelectedFormattingControl(event.target);
		const request =
			control === null
				? null
				: this.createSelectedFormattingRequest(control);
		if (request === null) {
			return;
		}
		event.preventDefault();
		this.dispatch({
			type: "cancel-presentation-preview",
			gestureId: request.gestureId,
		});
	};

	private createSelectedFormattingRequest(
		control: HTMLInputElement | HTMLSelectElement,
	): {
		readonly gestureId: string;
		readonly patch: MindMapPresentationPatch;
		readonly action: MindMapPresentationHistoryAction;
	} | null {
		const frame = this.currentFrame;
		const field = control.dataset.obmindFormattingField;
		if (
			frame?.document.status !== "ready" ||
			field === undefined
		) {
			return null;
		}
		const nodeIds = [...frame.interaction.selectedNodeIds].sort();
		if (nodeIds.length === 0) {
			return null;
		}
		const command = createSelectedFormattingCommand(
			field,
			control.value,
			frame.capabilities.nodeShapes,
		);
		if (command === null) {
			return null;
		}
		return {
			gestureId: [
				"selected-topics",
				field,
				frame.document.document.sourceRevision,
				...nodeIds,
			].join(":"),
			patch: {
				nodes: createMindMapNodeFormattingPatch(
					frame.presentation.nodes,
					nodeIds,
					command,
				),
			},
			action: createMindMapPresentationHistoryAction(
				"history.change-presentation",
			),
		};
	}

	private readonly handleAppearance = (): void => {
		const appearanceMode = this.elements?.appearanceSelect.value;
		if (!isAppearanceMode(appearanceMode)) {
			return;
		}

		this.dispatch({
			type: "change-appearance",
			appearanceMode,
		});
	};

	private readonly handleLanguage = (): void => {
		const language = this.elements?.languageSelect.value;
		if (!isObMindLanguage(language)) {
			return;
		}
		this.dispatch({ type: "change-language", language });
	};

	private readonly handleSidebarTabClick = (event: MouseEvent): void => {
		const target = event.target;
		if (!(target instanceof Element)) {
			return;
		}
		const tabId = target.closest<HTMLButtonElement>(
			"button[data-obmind-sidebar-tab]",
		)?.dataset.obmindSidebarTab;
		if (!isSidebarTabId(tabId)) {
			return;
		}
		this.activateSidebarTab(tabId, false);
	};

	private readonly handleSidebarTabKeyDown = (
		event: KeyboardEvent,
	): void => {
		const target = event.target;
		if (!(target instanceof Element)) {
			return;
		}
		const current = target.closest<HTMLButtonElement>(
			"button[data-obmind-sidebar-tab]",
		)?.dataset.obmindSidebarTab;
		if (!isSidebarTabId(current)) {
			return;
		}
		const currentIndex = SIDEBAR_TAB_ORDER.indexOf(current);
		let nextIndex: number | null = null;
		switch (event.key) {
			case "ArrowLeft":
			case "ArrowUp":
				nextIndex =
					(currentIndex - 1 + SIDEBAR_TAB_ORDER.length) %
					SIDEBAR_TAB_ORDER.length;
				break;
			case "ArrowRight":
			case "ArrowDown":
				nextIndex = (currentIndex + 1) % SIDEBAR_TAB_ORDER.length;
				break;
			case "Home":
				nextIndex = 0;
				break;
			case "End":
				nextIndex = SIDEBAR_TAB_ORDER.length - 1;
				break;
			default:
				return;
		}
		const next = SIDEBAR_TAB_ORDER[nextIndex];
		if (next === undefined) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		this.activateSidebarTab(next, true);
	};

	private activateSidebarTab(tabId: SidebarTabId, focusTab: boolean): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		const changed = this.activeSidebarTab !== tabId;
		this.activeSidebarTab = tabId;
		applySidebarTabState(
			elements.sidebarTabs,
			elements.sidebarPanels,
			tabId,
		);
		if (changed) {
			elements.sidebarScroll.scrollTop = 0;
		}
		if (focusTab) {
			elements.sidebarTabs[tabId].focus();
		}
	}

	private readonly handleSidebarToggle = (): void => {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		const isOpen = elements.root.classList.toggle("obmind-sidebar-open");
		if (!isOpen && elements.sidebar.contains(elements.sidebar.ownerDocument.activeElement)) {
			elements.sidebarToggle.focus();
		}
		elements.sidebar.inert = !isOpen;
		elements.sidebar.setAttribute("aria-hidden", String(!isOpen));
		elements.sidebarToggle.setAttribute(
			"aria-pressed",
			String(isOpen),
		);
		elements.sidebarToggle.setAttribute("aria-expanded", String(isOpen));
	};

	private readonly handleExportOpen = (): void => {
		const frame = this.currentFrame;
		const elements = this.elements;
		if (
			frame?.document.status !== "ready" ||
			elements === null ||
			!this.isExportAvailable()
		) {
			return;
		}

		if (this.exportModal !== null) {
			this.exportModal.focus();
			return;
		}

		const source = frame.document.source;
		const renderer = this.renderer;
		if (renderer === null) {
			return;
		}
		const capture = getMindMapExportSceneCapturer(renderer);
		const createSession = this.exportServices.createSession;
		if (capture === null) {
			return;
		}
		this.exportSession?.destroy();
		this.exportSession =
			createSession === undefined
				? null
				: createSession({
						capturer: {
							capture: (request, context) =>
								capture(
									request,
									context?.signal,
									(progress) =>
										reportMindMapExportCaptureProgressToUi(
											progress,
											context?.onProgress,
										),
								),
						},
						dependencies: this.exportServices.createDependencies(
							elements.root.ownerDocument,
						),
						getCurrentRevision: () => this.getCurrentExportSceneRevision(),
					});
		const modal = new BasicMindMapExportModal({
			container: elements.root,
			language: this.translator.language,
			defaultFileName: source.basename,
			capabilities: frame.capabilities.export,
			onPreflight: (options) => this.preflightMindMapExport(options),
			onConfirm: (options, onProgress) =>
				this.exportMindMap(options, onProgress),
			onRequestClose: () => {
				this.closeExportModal(modal.isBusy());
			},
		});
		this.exportModal = modal;
		modal.mount();
	};

	private isExportAvailable(): boolean {
		const frame = this.currentFrame;
		return (
			frame?.document.status === "ready" &&
			this.renderer !== null &&
			getMindMapExportSceneCapturer(this.renderer) !== null &&
			frame.capabilities.export.encoders.length > 0 &&
			frame.capabilities.export.scopes.length > 0
		);
	}

	private async preflightMindMapExport(
		options: MindMapExportOptions,
	): Promise<MindMapExportPlan> {
		const renderer = this.renderer;
		const capture =
			renderer === null
				? null
				: getMindMapExportSceneCapturer(renderer);
		const frame = this.currentFrame;
		if (
			capture === null ||
			frame?.document.status !== "ready" ||
			this.destroyed
		) {
			throw new ObMindLocalizedError(
				"frontend.export.preflightUnavailable",
			);
		}

		const controller = new AbortController();
		this.exportPreviewAbortController?.abort();
		this.exportPreviewAbortController = controller;
		try {
			if (this.exportSession !== null) {
				return await this.exportSession.getPlan(options, {
					signal: controller.signal,
				});
			}
			const scene = await this.getOrCaptureExportScene(
				capture,
				options.scope,
				controller.signal,
			);
			if (controller.signal.aborted) {
				throw new ObMindLocalizedError(
					"frontend.export.preflightCancelled",
				);
			}
			const encoder = getMindMapExportEncoderCapability(
				frame.capabilities.export,
				options.format,
			);
			const plan = this.exportServices.plan ?? planMindMapExport;
			return plan(scene, options, {
				limits: frame.capabilities.export.limits,
				encoder,
			});
		} finally {
			if (this.exportPreviewAbortController === controller) {
				this.exportPreviewAbortController = null;
			}
		}
	}

	private async exportMindMap(
		options: MindMapExportOptions,
		onProgress?: MindMapExportProgressListener,
	): Promise<void> {
		const renderer = this.renderer;
		const capture =
			renderer === null
				? null
				: getMindMapExportSceneCapturer(renderer);
		if (capture === null) {
			throw new ObMindLocalizedError(
				"frontend.export.rendererUnavailable",
			);
		}
		const ownerDocument = this.elements?.root.ownerDocument;
		if (ownerDocument === undefined) {
			throw new ObMindLocalizedError(
				"frontend.export.surfaceUnavailable",
			);
		}
		const operationKey = this.getExportSceneCacheKey(this.currentFrame);
		if (operationKey === null) {
			throw new ObMindLocalizedError(
				"frontend.export.mapUnavailable",
			);
		}

		const controller = new AbortController();
		this.exportAbortController?.abort();
		this.exportPreviewAbortController?.abort();
		this.exportAbortController = controller;
		const context: MindMapExportExecutionContext = {
			signal: controller.signal,
			onProgress,
		};
		try {
			const sink = this.exportServices.createArtifactSink(ownerDocument);
			if (this.exportSession !== null) {
				const artifact = await this.exportSession.exportToSink(
					options,
					{
						save: async (candidate) => {
							this.assertExportOperationCurrent(
								operationKey,
								controller.signal,
							);
							await sink.save(candidate);
						},
					},
					context,
				);
				this.assertExportOperationCurrent(operationKey, controller.signal);
				if (!this.destroyed) {
					this.showInformationalStatus(
						this.t("frontend.status.exported", {
							fileName: artifact.fileName,
						}),
					);
				}
				return;
			}

			onProgress?.({ phase: "capture", state: "started" });
			const scene = await this.getOrCaptureExportScene(
				capture,
				options.scope,
				controller.signal,
				(progress) =>
					reportMindMapExportCaptureProgressToUi(progress, onProgress),
			);
			onProgress?.({ phase: "capture", state: "completed", fraction: 1 });
			this.assertExportOperationCurrent(operationKey, controller.signal);
			this.assertExportSceneCurrent(scene);
			const dependencies = this.exportServices.createDependencies(
				ownerDocument,
			);
			const artifact = await this.exportServices.createArtifact(
				scene,
				options,
				dependencies,
				context,
			);
			this.assertExportOperationCurrent(operationKey, controller.signal);
			this.assertExportSceneCurrent(scene);
			onProgress?.({ phase: "save", state: "started" });
			await sink.save(artifact);
			this.assertExportOperationCurrent(operationKey, controller.signal);
			onProgress?.({ phase: "save", state: "completed", fraction: 1 });
			if (!this.destroyed) {
				this.showInformationalStatus(
					this.t("frontend.status.exported", {
						fileName: artifact.fileName,
					}),
				);
			}
		} finally {
			if (this.exportAbortController === controller) {
				this.exportAbortController = null;
			}
		}
	}

	private closeExportModal(cancelExport = false): void {
		if (cancelExport) {
			this.exportAbortController?.abort();
		}
		this.exportPreviewAbortController?.abort();
		this.clearExportSceneCache();
		const session = this.exportSession;
		this.exportSession = null;
		session?.destroy();
		const modal = this.exportModal;
		this.exportModal = null;
		modal?.destroy();
	}

	private async getOrCaptureExportScene(
		capture: (
			request: MindMapExportCaptureRequest,
			signal?: AbortSignal,
			onProgress?: (progress: MindMapExportCaptureProgress) => void,
		) => Promise<MindMapExportScene>,
		scope: MindMapExportScope,
		signal: AbortSignal,
		onProgress?: (progress: MindMapExportCaptureProgress) => void,
	): Promise<MindMapExportScene> {
		const cacheKey = this.getExportSceneCacheKey(this.currentFrame);
		if (cacheKey !== null && this.exportSceneCacheKey === cacheKey) {
			const cached = this.exportSceneCache.get(scope);
			if (cached !== undefined) {
				this.assertExportSceneCurrent(cached);
				return cached;
			}
		}

		const scene = await capture({ scope }, signal, onProgress);
		throwIfMindMapExportAborted(signal);
		this.assertExportSceneCurrent(scene);
		if (cacheKey !== null && cacheKey === this.getExportSceneCacheKey(this.currentFrame)) {
			if (this.exportSceneCacheKey !== cacheKey) {
				this.exportSceneCache.clear();
				this.exportSceneCacheKey = cacheKey;
			}
			this.exportSceneCache.set(scope, scene);
		}
		return scene;
	}

	private getExportSceneCacheKey(
		frame: MindMapFrontendFrame | null,
	): string | null {
		if (frame?.document.status !== "ready") {
			return null;
		}
		return [
			frame.document.source.path,
			frame.document.document.sourceRevision,
			String(frame.presentation.revision),
			frame.colorScheme,
			[...frame.interaction.collapsedNodeIds].sort().join("\u0000"),
		].join("\u0001");
	}

	private clearExportSceneCache(): void {
		this.exportSceneCache.clear();
		this.exportSceneCacheKey = null;
		this.exportSession?.invalidate();
	}

	private assertExportOperationCurrent(
		expectedKey: string,
		signal: AbortSignal,
	): void {
		throwIfMindMapExportAborted(signal);
		if (this.getExportSceneCacheKey(this.currentFrame) !== expectedKey) {
			this.clearExportSceneCache();
			throw new ObMindLocalizedError("frontend.export.changed");
		}
	}

	private assertExportSceneCurrent(scene: MindMapExportScene): void {
		const revision = this.getCurrentExportSceneRevision();
		if (revision === null || !isMindMapExportSceneCurrent(scene, revision)) {
			this.clearExportSceneCache();
			throw new ObMindLocalizedError("frontend.export.changed");
		}
	}

	private getCurrentExportSceneRevision(): MindMapExportSceneRevision | null {
		const frame = this.currentFrame;
		if (frame?.document.status !== "ready") {
			return null;
		}
		return {
			sourcePath: frame.document.source.path,
			sourceRevision: frame.document.document.sourceRevision,
			presentationRevision: frame.presentation.revision,
		};
	}

	private dispatch(
		event: Parameters<MindMapFrontendEventSink>[0],
		onSettled?: () => void,
	): void {
		this.eventTail = this.eventTail
			.then(async () => {
				if (this.destroyed) {
					return;
				}
					await this.eventSink(event);
					onSettled?.();
				})
				.catch((error: unknown) => {
					onSettled?.();
					if (this.destroyed) {
						return;
					}
					if (
						(event.type === "change-appearance" ||
							event.type === "change-language") &&
						this.currentFrame !== null
					) {
						this.updateAppearanceSelect(this.currentFrame);
						this.updateLanguageSelect(this.translator.language);
					}
					const message = this.getErrorMessage(error);
					const editRecovery = getFailedMindMapEditRecovery(event);
					if (editRecovery !== null) {
						this.renderer?.beginNodeEdit(
							editRecovery.nodeId,
							editRecovery.text,
						);
					}
					const isNodeMutation =
						event.type === "edit-node-text" ||
							event.type === "create-node" ||
							event.type === "move-node" ||
							event.type === "execute-topic-command";
					this.showInformationalStatus(
						isNodeMutation
							? this.t("frontend.status.nodeUpdateFailedSummary")
							: this.t("frontend.status.actionFailed"),
						message,
					);
					if (this.elements !== null) {
						this.elements.status.title = message;
					}
				});
	}
}

function getPresentationLibraryDraftConflictSignature(
	conflict: MindMapPresentationLibraryDraftConflict | null,
): string {
	return conflict === null
		? "clean"
		: [
				conflict.entryKind,
				conflict.entryId,
				String(conflict.baseRevision),
				String(conflict.authoritativeRevision),
			].join(":");
}

function getPresentationLibraryMutationTarget(
	command: MindMapPresentationLibraryCommand,
): {
	readonly entryKind: MindMapPresentationLibraryEntryKind;
	readonly entryId: string;
} | null {
	switch (command.type) {
		case "update-style":
		case "delete-style":
			return { entryKind: "style", entryId: command.styleId };
		case "update-palette":
		case "delete-palette":
			return { entryKind: "palette", entryId: command.paletteId };
		case "duplicate-style":
		case "duplicate-palette":
			return null;
	}
}

interface BasicMindMapExportModalOptions {
	readonly container: HTMLElement;
	readonly language: ObMindLanguage;
	readonly defaultFileName: string;
	readonly capabilities: MindMapFrontendFrame["capabilities"]["export"];
	readonly onPreflight: (options: MindMapExportOptions) => Promise<MindMapExportPlan>;
	readonly onConfirm: (
		options: MindMapExportOptions,
		onProgress: MindMapExportProgressListener,
	) => Promise<void>;
	readonly onRequestClose: () => void;
}

interface BasicMindMapExportFormatPanelElements {
	readonly encoder: MindMapExportEncoderCapability;
	readonly panel: HTMLElement;
	readonly backgroundSelect: HTMLSelectElement | null;
	readonly dpiInput: HTMLInputElement | HTMLSelectElement | null;
	readonly safeDpiButton: HTMLButtonElement | null;
	readonly qualityInput: HTMLInputElement | null;
	readonly qualityValue: HTMLElement | null;
	readonly preflight: HTMLElement;
	readonly logicalValue: HTMLElement;
	readonly outputValue: HTMLElement;
	readonly memoryValue: HTMLElement;
	readonly safetyValue: HTMLElement;
	readonly diagnostics: HTMLElement;
}

interface BasicMindMapExportModalElements {
	readonly overlay: HTMLElement;
	readonly dialog: HTMLElement;
	readonly form: HTMLFormElement;
	readonly fileNameInput: HTMLInputElement;
	readonly scopeSelect: HTMLSelectElement;
	readonly tabs: ReadonlyMap<MindMapExportFormat, HTMLButtonElement>;
	readonly panels: ReadonlyMap<
		MindMapExportFormat,
		BasicMindMapExportFormatPanelElements
	>;
	readonly mutableControls: readonly (
		| HTMLInputElement
		| HTMLSelectElement
		| HTMLButtonElement
	)[];
	readonly progress: HTMLElement;
	readonly progressTrack: HTMLProgressElement;
	readonly progressMessage: HTMLElement;
	readonly status: HTMLElement;
	readonly cancelButton: HTMLButtonElement;
	readonly confirmButton: HTMLButtonElement;
}

/**
 * A renderer-independent confirmation surface. It owns only form state and
 * DOM listeners; capture, encoding, and artifact persistence remain injected
 * ports owned by the frontend host.
 */
class BasicMindMapExportModal {
	private readonly options: BasicMindMapExportModalOptions;
	private translator: ObMindTranslator;
	private elements: BasicMindMapExportModalElements | null = null;
	private activeFormat: MindMapExportFormat | null = null;
	private preflightPlan: MindMapExportPlan | null = null;
	private preflightOptionsKey: string | null = null;
	private preflightTimer: number | null = null;
	private preflightTimerWindow: Window | null = null;
	private preflightGeneration = 0;
	private preflightPending = false;
	private busy = false;
	private destroyed = false;

	public constructor(options: BasicMindMapExportModalOptions) {
		this.options = options;
		this.translator = createObMindTranslator(options.language);
	}

	private t(
		key: ObMindTranslationKey,
		values?: ObMindTranslationValues,
	): string {
		return this.translator.t(key, values);
	}

	private getErrorMessage(error: unknown): string {
		if (error instanceof MindMapExportError) {
			return this.t(getMindMapExportErrorTranslationKey(error.code));
		}
		return localizeObMindError(
			error,
			this.translator,
			"frontend.export.error.unknown",
		);
	}

	/** Refresh copy in-place so the export form retains its selected options. */
	public setLanguage(language: ObMindLanguage): void {
		if (this.translator.language === language) {
			return;
		}
		this.translator = createObMindTranslator(language);
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		refreshLocalizedElements(elements.overlay, this.translator);
		for (const option of Array.from(elements.scopeSelect.options)) {
			const scope = option.value as MindMapExportScope;
			if (this.options.capabilities.scopes.includes(scope)) {
				option.textContent = getMindMapExportScopeLabel(scope, this.translator);
			}
		}
		for (const panel of elements.panels.values()) {
			for (const option of Array.from(panel.backgroundSelect?.options ?? [])) {
				option.textContent = this.t(
					option.value === "transparent"
						? "frontend.export.background.transparent"
						: "frontend.export.background.theme",
				);
			}
			if (panel.dpiInput instanceof HTMLSelectElement) {
				for (const option of Array.from(panel.dpiInput.options)) {
					const dpi = Number(option.value);
					if (Number.isFinite(dpi)) {
						option.textContent = this.t("frontend.export.dpi.option", {
							dpi: this.translator.formatNumber(dpi),
						});
					}
				}
			}
			if (panel.qualityInput !== null && panel.qualityValue !== null) {
				panel.qualityValue.textContent = formatMindMapExportPercent(
					Number(panel.qualityInput.value),
					this.translator,
				);
			}
		}
		this.updateActiveFormat(true);
		this.setBusy(this.busy);
	}

	public mount(): void {
		if (this.destroyed || this.elements !== null) {
			return;
		}
		const ownerDocument = this.options.container.ownerDocument;
		const overlay = createElement(
			ownerDocument,
			"div",
			"obmind-export-overlay",
		);
		const dialog = createElement(
			ownerDocument,
			"section",
			"obmind-export-dialog",
		);
		dialog.tabIndex = -1;
		dialog.setAttribute("role", "dialog");
		dialog.setAttribute("aria-modal", "true");
		const titleId = `obmind-export-title-${String(
			++basicFrontendControlSequence,
		)}`;
		dialog.setAttribute("aria-labelledby", titleId);

		const heading = createElement(
			ownerDocument,
			"h2",
			"obmind-export-title",
		);
		heading.id = titleId;
		setLocalizedText(heading, "frontend.export.title", this.translator);
		const description = createElement(
			ownerDocument,
			"p",
			"obmind-export-description",
		);
		setLocalizedText(
			description,
			"frontend.export.description",
			this.translator,
		);
		const form = createElement(
			ownerDocument,
			"form",
			"obmind-export-form",
		);

		const fileNameInput = createExportTextInput(
			ownerDocument,
			"frontend.export.fileName",
			"frontend.export.fileName.aria",
			this.options.defaultFileName,
			this.translator,
		);
		const scopeSelect = createExportSelectInput(
			ownerDocument,
			"frontend.export.content",
			"frontend.export.content.aria",
			this.options.capabilities.scopes.map((scope) => ({
				value: scope,
				label: getMindMapExportScopeLabel(scope, this.translator),
			})),
			this.translator,
		);
		const sharedFields = createElement(
			ownerDocument,
			"div",
			"obmind-export-shared-fields",
		);
		sharedFields.append(fileNameInput.field, scopeSelect.field);

		const encoders = getMindMapExportEncoderCapabilities(
			this.options.capabilities,
		);
		const tablist = createElement(
			ownerDocument,
			"div",
			"obmind-export-tablist",
		);
		tablist.setAttribute("role", "tablist");
		setLocalizedAttribute(
			tablist,
			"aria-label",
			"frontend.export.format.aria",
			this.translator,
		);
		tablist.style.setProperty(
			"--obmind-export-tab-count",
			String(Math.max(1, encoders.length)),
		);

		const tabIdPrefix = `obmind-export-format-${String(
			++basicFrontendControlSequence,
		)}`;
		const tabs = new Map<MindMapExportFormat, HTMLButtonElement>();
		const panels = new Map<
			MindMapExportFormat,
			BasicMindMapExportFormatPanelElements
		>();
		const mutableControls: (
			| HTMLInputElement
			| HTMLSelectElement
			| HTMLButtonElement
		)[] = [fileNameInput.input, scopeSelect.select];
		const panelContainer = createElement(
			ownerDocument,
			"div",
			"obmind-export-panels",
		);
		for (const encoder of encoders) {
			const tab = createElement(
				ownerDocument,
				"button",
				"obmind-export-tab",
			);
			const tabId = `${tabIdPrefix}-tab-${encoder.format}`;
			const panelId = `${tabIdPrefix}-panel-${encoder.format}`;
			tab.type = "button";
			tab.id = tabId;
			tab.dataset.obmindExportFormat = encoder.format;
			tab.setAttribute("role", "tab");
			tab.setAttribute("aria-controls", panelId);
			tab.setAttribute("aria-selected", "false");
			tab.tabIndex = -1;
			tab.textContent = encoder.label;
			tabs.set(encoder.format, tab);
			tablist.append(tab);

			const panel = createMindMapExportFormatPanel(
				ownerDocument,
				encoder,
				tabId,
				panelId,
				this.translator,
			);
			panels.set(encoder.format, panel);
			panelContainer.append(panel.panel);
			mutableControls.push(
				...getMindMapExportPanelControls(panel),
			);
		}
		const status = createElement(
			ownerDocument,
			"p",
			"obmind-export-status",
		);
		status.setAttribute("role", "status");
		status.setAttribute("aria-live", "polite");
		status.hidden = true;
		const progress = createElement(
			ownerDocument,
			"div",
			"obmind-export-progress",
		);
		progress.setAttribute("role", "status");
		progress.setAttribute("aria-live", "polite");
		progress.hidden = true;
		const progressMessage = createElement(
			ownerDocument,
			"span",
			"obmind-export-progress-message",
		);
		setLocalizedText(
			progressMessage,
			"frontend.export.preparing",
			this.translator,
		);
		const progressTrack = createElement(
			ownerDocument,
			"progress",
			"obmind-export-progress-track",
		);
		progressTrack.max = 1;
		progressTrack.value = 0;
		progress.append(progressMessage, progressTrack);

		const actions = createElement(
			ownerDocument,
			"div",
			"obmind-export-actions",
		);
		const cancelButton = createElement(
			ownerDocument,
			"button",
			"obmind-export-button obmind-export-button-secondary",
		);
		cancelButton.type = "button";
		setLocalizedText(
			cancelButton,
			"frontend.export.cancel",
			this.translator,
		);
		const confirmButton = createElement(
			ownerDocument,
			"button",
			"obmind-export-button obmind-export-button-primary",
		);
		confirmButton.type = "submit";
		actions.append(cancelButton, confirmButton);

		form.append(sharedFields, tablist, panelContainer, progress, status, actions);
		dialog.append(heading, description, form);
		overlay.append(dialog);
		this.options.container.append(overlay);

		this.elements = {
			overlay,
			dialog,
			form,
			fileNameInput: fileNameInput.input,
			scopeSelect: scopeSelect.select,
			tabs,
			panels,
			mutableControls,
			progress,
			progressTrack,
			progressMessage,
			status,
			cancelButton,
			confirmButton,
		};
		this.activeFormat = getPreferredExportFormat(encoders);
		scopeSelect.select.value = getPreferredExportScope(
			this.options.capabilities.scopes,
		);
		this.updateActiveFormat();

		form.addEventListener("submit", this.handleSubmit);
		for (const tab of tabs.values()) {
			tab.addEventListener("click", this.handleTabClick);
			tab.addEventListener("keydown", this.handleTabKeyDown);
		}
		scopeSelect.select.addEventListener("change", this.handlePreflightInput);
		for (const panel of panels.values()) {
			panel.backgroundSelect?.addEventListener(
				"change",
				this.handlePreflightInput,
			);
			panel.dpiInput?.addEventListener("input", this.handlePreflightInput);
			panel.dpiInput?.addEventListener("change", this.handlePreflightInput);
			panel.qualityInput?.addEventListener("input", this.handleQualityInput);
			panel.qualityInput?.addEventListener("change", this.handlePreflightInput);
			panel.safeDpiButton?.addEventListener("click", this.handleSafeDpi);
		}
		cancelButton.addEventListener("click", this.handleCancel);
		overlay.addEventListener("click", this.handleOverlayClick);
		overlay.addEventListener("keydown", this.handleKeyDown);
		this.schedulePreflight(0);
		dialog.focus();
	}

	public focus(): void {
		this.elements?.dialog.focus();
	}

	public isBusy(): boolean {
		return this.busy;
	}

	public invalidatePreflight(): void {
		if (this.destroyed) {
			return;
		}
		this.clearPreflightTimer();
		this.preflightGeneration += 1;
		this.preflightPlan = null;
		this.preflightOptionsKey = null;
		this.preflightPending = false;
		if (!this.busy) {
			this.schedulePreflight(0);
		}
	}

	public destroy(): void {
		if (this.destroyed) {
			return;
		}
		this.destroyed = true;
		const elements = this.elements;
		if (elements !== null) {
			elements.form.removeEventListener("submit", this.handleSubmit);
			elements.scopeSelect.removeEventListener("change", this.handlePreflightInput);
			for (const tab of elements.tabs.values()) {
				tab.removeEventListener("click", this.handleTabClick);
				tab.removeEventListener("keydown", this.handleTabKeyDown);
			}
			for (const panel of elements.panels.values()) {
				panel.backgroundSelect?.removeEventListener(
					"change",
					this.handlePreflightInput,
				);
				panel.dpiInput?.removeEventListener(
					"input",
					this.handlePreflightInput,
				);
				panel.dpiInput?.removeEventListener(
					"change",
					this.handlePreflightInput,
				);
				panel.qualityInput?.removeEventListener(
					"input",
					this.handleQualityInput,
				);
				panel.qualityInput?.removeEventListener(
					"change",
					this.handlePreflightInput,
				);
				panel.safeDpiButton?.removeEventListener("click", this.handleSafeDpi);
			}
			elements.cancelButton.removeEventListener(
				"click",
				this.handleCancel,
			);
			elements.overlay.removeEventListener(
				"click",
				this.handleOverlayClick,
			);
			elements.overlay.removeEventListener(
				"keydown",
				this.handleKeyDown,
			);
			elements.overlay.remove();
		}
		this.clearPreflightTimer();
		this.elements = null;
	}

	private readonly handleSubmit = (event: Event): void => {
		event.preventDefault();
		if (this.busy || this.destroyed) {
			return;
		}
		let options: MindMapExportOptions;
		try {
			options = this.readOptions();
		} catch (error: unknown) {
			this.setError(this.getErrorMessage(error));
			return;
		}
		if (!this.isCurrentPlanExportable(options)) {
			this.setError(this.t("frontend.export.waitForEstimate"));
			return;
		}
		this.setBusy(true);
		void this.confirm(options);
	};

	private readonly handleTabClick = (event: Event): void => {
		const tab = event.currentTarget as HTMLButtonElement;
		const format = tab.dataset.obmindExportFormat as MindMapExportFormat;
		if (!this.elements?.tabs.has(format) || this.busy) {
			return;
		}
		this.activeFormat = format;
		this.updateActiveFormat();
		this.schedulePreflight(0);
	};

	private readonly handleTabKeyDown = (event: KeyboardEvent): void => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") {
			return;
		}
		const elements = this.elements;
		if (elements === null || this.busy) {
			return;
		}
		event.preventDefault();
		const formats = [...elements.tabs.keys()];
		const currentIndex = Math.max(0, formats.indexOf(this.activeFormat ?? formats[0]!));
		const nextIndex =
			event.key === "Home"
				? 0
				: event.key === "End"
					? formats.length - 1
					: (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + formats.length) % formats.length;
		const nextFormat = formats[nextIndex];
		if (nextFormat === undefined) {
			return;
		}
		this.activeFormat = nextFormat;
		this.updateActiveFormat();
		elements.tabs.get(nextFormat)?.focus();
		this.schedulePreflight(0);
	};

	private readonly handlePreflightInput = (): void => {
		this.schedulePreflight();
	};

	private readonly handleQualityInput = (): void => {
		const panel = this.getActivePanel();
		if (
			panel === null ||
			panel.qualityInput === null ||
			panel.qualityValue === null
		) {
			return;
		}
		panel.qualityValue.textContent = formatMindMapExportPercent(
			Number(panel.qualityInput.value),
			this.translator,
		);
		this.schedulePreflight();
	};

	private readonly handleSafeDpi = (): void => {
		const panel = this.getActivePanel();
		const safeDpi = getSafeMindMapExportDpi(panel, this.preflightPlan);
		if (
			panel === null ||
			panel.dpiInput === null ||
			typeof safeDpi !== "number" ||
			!Number.isFinite(safeDpi) ||
			this.busy
		) {
			return;
		}
		panel.dpiInput.value = String(Math.floor(safeDpi));
		this.schedulePreflight(0);
	};

	private readonly handleCancel = (): void => {
		this.options.onRequestClose();
	};

	private readonly handleOverlayClick = (event: MouseEvent): void => {
		if (event.target === this.elements?.overlay) {
			this.options.onRequestClose();
		}
	};

	private readonly handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") {
			event.preventDefault();
			this.options.onRequestClose();
		}
	};

	private async confirm(options: MindMapExportOptions): Promise<void> {
		try {
			await this.options.onConfirm(options, this.handleProgress);
			if (!this.destroyed) {
				this.options.onRequestClose();
			}
		} catch (error: unknown) {
			if (!this.destroyed) {
				this.setError(
					this.t("frontend.export.failed", {
						error: this.getErrorMessage(error),
					}),
				);
				this.setBusy(false);
				if (this.preflightPlan === null) {
					this.schedulePreflight(0);
				}
			}
		}
	}

	private readOptions(strict = true): MindMapExportOptions {
		const elements = this.elements;
		const panel = this.getActivePanel();
		if (elements === null || panel === null || this.activeFormat === null) {
			throw new ObMindLocalizedError(
				"frontend.export.dialogUnavailable",
			);
		}
		const format = this.activeFormat;
		const scope = elements.scopeSelect.value as MindMapExportScope;
		if (
			!getMindMapExportEncoderCapabilities(this.options.capabilities).some(
				(encoder) => encoder.format === format,
			) ||
			!this.options.capabilities.scopes.includes(scope)
		) {
			throw new ObMindLocalizedError(
				"frontend.export.optionUnavailable",
			);
		}
		const dpi = panel.dpiInput === null ? null : Number(panel.dpiInput.value);
		if (
			strict &&
			panel.encoder.dpi !== null &&
			(!Number.isFinite(dpi) ||
				dpi === null ||
				dpi < panel.encoder.dpi.minimum ||
				dpi > panel.encoder.dpi.maximum)
		) {
			throw new ObMindLocalizedError("frontend.export.dpiRange", {
				minimum: this.translator.formatNumber(panel.encoder.dpi.minimum),
				maximum: this.translator.formatNumber(panel.encoder.dpi.maximum),
			});
		}
		const jpegQuality =
			panel.qualityInput === null ? null : Number(panel.qualityInput.value);
		if (
			strict &&
			panel.encoder.jpegQuality !== null &&
			(!Number.isFinite(jpegQuality) ||
				jpegQuality === null ||
				jpegQuality < panel.encoder.jpegQuality.minimum ||
				jpegQuality > panel.encoder.jpegQuality.maximum)
		) {
			throw new ObMindLocalizedError("frontend.export.jpegQuality");
		}
		return {
			format,
			fileName: elements.fileNameInput.value,
			scope,
			background:
				panel.backgroundSelect?.value === "transparent" &&
				panel.encoder.backgrounds.includes("transparent")
					? "transparent"
					: "theme",
			padding: 32,
			...(dpi === null ? {} : { dpi }),
			...(jpegQuality === null ? {} : { jpegQuality }),
		};
	}

	private updateActiveFormat(preservePreflight = false): void {
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		for (const [format, tab] of elements.tabs) {
			const active = format === this.activeFormat;
			tab.setAttribute("aria-selected", String(active));
			tab.tabIndex = active ? 0 : -1;
			elements.panels.get(format)!.panel.hidden = !active;
		}
		const panel = this.getActivePanel();
			elements.confirmButton.textContent = panel === null
				? this.t("frontend.export.confirm")
				: this.t("frontend.export.confirmFormat", {
					format: panel.encoder.label,
				});
		if (!preservePreflight) {
			this.preflightPlan = null;
			this.preflightOptionsKey = null;
		}
		this.renderPreflight();
	}

	private setBusy(busy: boolean): void {
		this.busy = busy;
		const elements = this.elements;
		if (elements === null) {
			return;
		}
		for (const input of elements.mutableControls) {
			input.disabled = busy;
		}
		elements.confirmButton.disabled = busy || !this.isCurrentPlanExportable();
			elements.cancelButton.textContent = busy
				? this.t("frontend.export.cancelBusy")
				: this.t("frontend.export.cancel");
		if (busy) {
			elements.status.hidden = true;
			elements.progress.hidden = false;
			elements.progressMessage.textContent = this.t(
				"frontend.export.preparing",
			);
			elements.progressTrack.value = 0;
		} else {
			elements.progress.hidden = true;
			this.renderPreflight();
		}
	}

	private setError(message: string): void {
		const status = this.elements?.status;
		if (status === undefined) {
			return;
		}
		status.hidden = false;
		status.textContent = message;
		status.classList.add("obmind-export-status-error");
	}

	private clearError(): void {
		const status = this.elements?.status;
		if (status === undefined) {
			return;
		}
		status.hidden = true;
		status.textContent = "";
		status.classList.remove("obmind-export-status-error");
	}

	private schedulePreflight(delay = 140): void {
		if (this.destroyed || this.busy) {
			return;
		}
		this.clearPreflightTimer();
		this.preflightPending = true;
		this.preflightPlan = null;
		this.preflightOptionsKey = null;
		this.clearError();
		this.renderPreflight();
		const generation = ++this.preflightGeneration;
		const ownerWindow = this.elements?.dialog.ownerDocument.defaultView ?? window;
		this.preflightTimerWindow = ownerWindow;
		this.preflightTimer = ownerWindow.setTimeout(() => {
			this.preflightTimer = null;
			this.preflightTimerWindow = null;
			void this.runPreflight(generation);
		}, delay);
	}

	private async runPreflight(generation: number): Promise<void> {
		let options: MindMapExportOptions;
		try {
			options = this.readOptions(false);
		} catch (error: unknown) {
			if (!this.destroyed && generation === this.preflightGeneration) {
				this.preflightPending = false;
					this.setError(this.getErrorMessage(error));
				this.renderPreflight();
			}
			return;
		}

		try {
			const plan = await this.options.onPreflight(options);
			if (this.destroyed || generation !== this.preflightGeneration || this.busy) {
				return;
			}
			this.preflightPlan = plan;
			this.preflightOptionsKey = getMindMapExportOptionsKey(options);
			this.preflightPending = false;
			this.clearError();
			this.renderPreflight();
		} catch (error: unknown) {
			if (this.destroyed || generation !== this.preflightGeneration || this.busy) {
				return;
			}
			this.preflightPending = false;
			this.setError(
				this.t("frontend.export.calculateFailed", {
					error: this.getErrorMessage(error),
				}),
			);
			this.renderPreflight();
		}
	}

	private renderPreflight(): void {
		const elements = this.elements;
		const panel = this.getActivePanel();
		if (elements === null || panel === null) {
			return;
		}
		const plan = this.preflightPlan;
		if (plan === null) {
			panel.preflight.dataset.obmindExportable = "pending";
			const calculating = this.t("frontend.export.calculating");
			panel.logicalValue.textContent = calculating;
			panel.outputValue.textContent = calculating;
			panel.memoryValue.textContent = calculating;
			panel.safetyValue.textContent = calculating;
			panel.diagnostics.textContent = this.preflightPending
				? this.t("frontend.export.calculatingDimensions")
				: this.t("frontend.export.setOptions");
			if (panel.safeDpiButton !== null) {
				panel.safeDpiButton.hidden = true;
			}
			elements.confirmButton.disabled = true;
			return;
		}

		panel.preflight.dataset.obmindExportable = String(plan.canExport);
		panel.logicalValue.textContent = formatMindMapExportDimensions(
			plan.logicalDimensions.width,
			plan.logicalDimensions.height,
			this.t("frontend.export.cssPx"),
			this.translator,
		);
		panel.outputValue.textContent =
			plan.rasterDimensions === null
				? panel.encoder.format === "pdf"
					? this.t("frontend.export.singlePagePdf")
					: this.t("frontend.export.vectorOutput")
				: formatMindMapExportDimensions(
						plan.rasterDimensions.pixelWidth,
						plan.rasterDimensions.pixelHeight,
						"px",
						this.translator,
					);
		panel.memoryValue.textContent =
			plan.rasterDimensions === null
				? this.t("frontend.export.noRgbaCanvas")
				: formatMindMapExportBytes(
					plan.estimatedRgbaBytes,
					this.translator,
				);
		panel.safetyValue.textContent =
			plan.maximumSafeDpi === null
				? this.t("frontend.export.notApplicable")
				: this.t("frontend.export.upToDpi", {
					dpi: this.translator.formatNumber(plan.maximumSafeDpi),
				});
		panel.diagnostics.textContent =
			plan.diagnostics.length === 0
				? plan.canExport
					? this.t("frontend.export.ready")
					: this.t("frontend.export.needsSettings")
				: plan.diagnostics
						.map((diagnostic) =>
							this.getExportDiagnosticMessage(diagnostic, plan),
						)
						.join(" ");

		if (panel.safeDpiButton !== null) {
			const requested = plan.requestedDpi;
			const safeDpi = getSafeMindMapExportDpi(panel, plan);
			const shouldOfferSafeDpi =
				safeDpi !== null &&
				requested !== null &&
				safeDpi !== requested;
			panel.safeDpiButton.hidden = !shouldOfferSafeDpi;
			panel.safeDpiButton.disabled = this.busy || !shouldOfferSafeDpi;
			if (shouldOfferSafeDpi) {
					panel.safeDpiButton.textContent = this.t(
						"frontend.export.useSafeDpi",
						{ dpi: this.translator.formatNumber(safeDpi) },
					);
			}
		}
		elements.confirmButton.disabled = this.busy || !this.isCurrentPlanExportable();
	}

	private readonly handleProgress = (progress: MindMapExportProgress): void => {
		const elements = this.elements;
		if (elements === null || this.destroyed) {
			return;
		}
		elements.progress.hidden = false;
		elements.progressTrack.value = advanceMindMapExportProgress(
			elements.progressTrack.value,
			progress,
		);
		elements.progressMessage.textContent = getMindMapExportProgressLabel(
			progress,
			this.translator,
		);
	};

	private getExportDiagnosticMessage(
		diagnostic: MindMapExportDiagnostic,
		plan: MindMapExportPlan,
	): string {
		const keys: Readonly<
			Record<MindMapExportDiagnostic["code"], ObMindTranslationKey>
		> = {
			"invalid-padding": "frontend.export.diagnostic.invalidPadding",
			"invalid-scene": "frontend.export.diagnostic.invalidScene",
			"invalid-dpi": "frontend.export.diagnostic.invalidDpi",
			"dpi-out-of-range": "frontend.export.diagnostic.dpiOutOfRange",
			"unsupported-dpi": "frontend.export.diagnostic.unsupportedDpi",
			"invalid-quality": "frontend.export.diagnostic.invalidQuality",
			"quality-out-of-range": "frontend.export.diagnostic.qualityOutOfRange",
			"unsupported-quality": "frontend.export.diagnostic.unsupportedQuality",
			"raster-too-large": "frontend.export.diagnostic.rasterTooLarge",
			"raster-dpi-reduced": "frontend.export.diagnostic.rasterDpiReduced",
			"unsupported-background": "frontend.export.diagnostic.unsupportedBackground",
			"unsupported-format": "frontend.export.diagnostic.unsupportedFormat",
		};
		const key = keys[diagnostic.code] ?? "frontend.export.diagnostic.unknown";
		return this.t(
			key,
			diagnostic.code === "raster-dpi-reduced" && plan.maximumSafeDpi !== null
				? { dpi: this.translator.formatNumber(plan.maximumSafeDpi) }
				: undefined,
		);
	}

	private isCurrentPlanExportable(options?: MindMapExportOptions): boolean {
		if (this.preflightPending || this.preflightPlan?.canExport !== true) {
			return false;
		}
		try {
			const current = options ?? this.readOptions();
			return this.preflightOptionsKey === getMindMapExportOptionsKey(current);
		} catch {
			return false;
		}
	}

	private getActivePanel(): BasicMindMapExportFormatPanelElements | null {
		if (this.activeFormat === null) {
			return null;
		}
		return this.elements?.panels.get(this.activeFormat) ?? null;
	}

	private clearPreflightTimer(): void {
		if (this.preflightTimer !== null) {
			(this.preflightTimerWindow ?? window).clearTimeout(this.preflightTimer);
			this.preflightTimer = null;
			this.preflightTimerWindow = null;
		}
	}
}

function getMindMapExportSceneCapturer(
	renderer: MindMapRenderer,
): ((
	request: MindMapExportCaptureRequest,
	signal?: AbortSignal,
	onProgress?: (progress: MindMapExportCaptureProgress) => void,
) => Promise<MindMapExportScene>) | null {
	const candidate = renderer as unknown as Partial<MindMapExportSceneCapturer>;
	const captureExportScene = candidate.captureExportScene;
	if (typeof captureExportScene !== "function") {
		return null;
	}
	return (request, signal, onProgress) =>
		Promise.resolve(captureExportScene.call(renderer, request, signal, onProgress));
}

function getMindMapExportEncoderCapabilities(
	capabilities: MindMapFrontendFrame["capabilities"]["export"],
): readonly MindMapExportEncoderCapability[] {
	const rank = new Map<MindMapExportFormat, number>(
		MIND_MAP_EXPORT_FORMATS.map((format, index) => [format, index]),
	);
	return Object.freeze(
		[...capabilities.encoders].sort(
			(left, right) =>
				(rank.get(left.format) ?? Number.MAX_SAFE_INTEGER) -
				(rank.get(right.format) ?? Number.MAX_SAFE_INTEGER),
		),
	);
}

function getMindMapExportEncoderCapability(
	capabilities: MindMapFrontendFrame["capabilities"]["export"],
	format: MindMapExportFormat,
): MindMapExportEncoderCapability | undefined {
	return getMindMapExportEncoderCapabilities(capabilities).find(
		(encoder) => encoder.format === format,
	);
}

function getPreferredExportFormat(
	encoders: readonly MindMapExportEncoderCapability[],
): MindMapExportFormat {
	return encoders.some((encoder) => encoder.format === "svg")
		? "svg"
		: (encoders[0]?.format ?? "svg");
}

function getPreferredExportScope(
	scopes: readonly MindMapExportScope[],
): MindMapExportScope {
	return scopes.includes("visible-map")
		? "visible-map"
		: (scopes[0] ?? "visible-map");
}

function getMindMapExportScopeLabel(
	scope: MindMapExportScope,
	translator: ObMindTranslator,
): string {
	switch (scope) {
		case "visible-map":
			return translator.t("frontend.export.visibleMap");
		case "full-map":
			return translator.t("frontend.export.fullMap");
	}
}

function createMindMapExportFormatPanel(
	ownerDocument: Document,
	encoder: MindMapExportEncoderCapability,
	tabId: string,
	panelId: string,
	translator: ObMindTranslator,
): BasicMindMapExportFormatPanelElements {
	const panel = createElement(
		ownerDocument,
		"section",
		"obmind-export-tabpanel",
	);
	panel.id = panelId;
	panel.hidden = true;
	panel.setAttribute("role", "tabpanel");
	panel.setAttribute("aria-labelledby", tabId);

	const header = createElement(
		ownerDocument,
		"div",
		"obmind-export-panel-header",
	);
	const title = createElement(
		ownerDocument,
		"h3",
		"obmind-export-panel-title",
	);
		setLocalizedText(title, "frontend.export.settings", translator, {
			format: encoder.label,
		});
	const description = createElement(
		ownerDocument,
		"p",
		"obmind-export-panel-description",
	);
		setLocalizedText(
			description,
			getMindMapExportFormatDescriptionKey(encoder),
			translator,
		);
	header.append(title, description);

	const fields = createElement(
		ownerDocument,
		"div",
		"obmind-export-panel-fields",
	);
	let backgroundSelect: HTMLSelectElement | null = null;
	if (encoder.backgrounds.length > 1) {
		const background = createExportSelectInput(
			ownerDocument,
			"frontend.export.background",
			"frontend.export.background.aria",
			encoder.backgrounds.map((background) => ({
				value: background,
				label: translator.t(
					background === "transparent"
						? "frontend.export.background.transparent"
						: "frontend.export.background.theme",
				),
			})),
			translator,
			{ format: encoder.label },
		);
		background.select.value = encoder.backgrounds.includes("theme")
			? "theme"
			: (encoder.backgrounds[0] ?? "theme");
		backgroundSelect = background.select;
		fields.append(background.field);
	} else {
		const note = createElement(
			ownerDocument,
			"p",
			"obmind-export-format-note",
		);
			setLocalizedText(
				note,
				encoder.backgrounds[0] === "theme"
					? "frontend.export.background.usesTheme"
					: "frontend.export.background.usesTransparent",
				translator,
			);
		fields.append(note);
	}

	let dpiInput: HTMLInputElement | HTMLSelectElement | null = null;
	let safeDpiButton: HTMLButtonElement | null = null;
	if (encoder.dpi !== null) {
		const dpi = createExportDpiInput(ownerDocument, encoder, translator);
		dpiInput = dpi.input;
		safeDpiButton = dpi.safeButton;
		fields.append(dpi.field);
	}

	let qualityInput: HTMLInputElement | null = null;
	let qualityValue: HTMLElement | null = null;
	if (encoder.jpegQuality !== null) {
		const quality = createExportQualityInput(ownerDocument, encoder, translator);
		qualityInput = quality.input;
		qualityValue = quality.value;
		fields.append(quality.field);
	}

	const preflight = createElement(
		ownerDocument,
		"div",
		"obmind-export-preflight",
	);
	preflight.dataset.obmindExportable = "pending";
		const logical = createMindMapExportPreflightItem(
			ownerDocument,
			"frontend.export.mapSize",
			translator,
		);
		const output = createMindMapExportPreflightItem(
			ownerDocument,
			"frontend.export.output",
			translator,
		);
		const memory = createMindMapExportPreflightItem(
			ownerDocument,
			"frontend.export.memory",
			translator,
		);
		const safety = createMindMapExportPreflightItem(
			ownerDocument,
			"frontend.export.safeLimit",
			translator,
		);
	const diagnostics = createElement(
		ownerDocument,
		"p",
		"obmind-export-preflight-diagnostics",
	);
		setLocalizedText(
			diagnostics,
			"frontend.export.calculatingDimensions",
			translator,
		);
	preflight.append(
		logical.item,
		output.item,
		memory.item,
		safety.item,
		diagnostics,
	);
	panel.append(header, fields, preflight);
	return {
		encoder,
		panel,
		backgroundSelect,
		dpiInput,
		safeDpiButton,
		qualityInput,
		qualityValue,
		preflight,
		logicalValue: logical.value,
		outputValue: output.value,
		memoryValue: memory.value,
		safetyValue: safety.value,
		diagnostics,
	};
}

function getMindMapExportPanelControls(
	panel: BasicMindMapExportFormatPanelElements,
): readonly (HTMLInputElement | HTMLSelectElement | HTMLButtonElement)[] {
	return [
		...(panel.backgroundSelect === null ? [] : [panel.backgroundSelect]),
		...(panel.dpiInput === null ? [] : [panel.dpiInput]),
		...(panel.safeDpiButton === null ? [] : [panel.safeDpiButton]),
		...(panel.qualityInput === null ? [] : [panel.qualityInput]),
	];
}

function createMindMapExportPreflightItem(
	ownerDocument: Document,
	labelKey: ObMindTranslationKey,
	translator: ObMindTranslator,
): { readonly item: HTMLElement; readonly value: HTMLElement } {
	const item = createElement(
		ownerDocument,
		"div",
		"obmind-export-preflight-item",
	);
	const caption = createElement(
		ownerDocument,
		"span",
		"obmind-export-preflight-label",
	);
	setLocalizedText(caption, labelKey, translator);
	const value = createElement(
		ownerDocument,
		"output",
		"obmind-export-preflight-value",
	);
	setLocalizedText(value, "frontend.export.calculating", translator);
	item.append(caption, value);
	return { item, value };
}

function createExportDpiInput(
	ownerDocument: Document,
	encoder: MindMapExportEncoderCapability,
	translator: ObMindTranslator,
): {
	readonly field: HTMLElement;
	readonly input: HTMLInputElement | HTMLSelectElement;
	readonly safeButton: HTMLButtonElement;
} {
	const dpi = encoder.dpi;
	if (dpi === null) {
		throw new Error("A DPI input requires a raster export capability.");
	}
	const control = createElement(
		ownerDocument,
		"div",
		"obmind-export-dpi-control",
	);
	let input: HTMLInputElement | HTMLSelectElement;
	if (dpi.supportsCustomValue) {
		const numberInput = createElement(
			ownerDocument,
			"input",
			"obmind-export-input",
		);
		const listId = `obmind-export-dpi-presets-${String(
			++basicFrontendControlSequence,
		)}`;
		numberInput.type = "number";
		numberInput.min = String(dpi.minimum);
		numberInput.max = String(dpi.maximum);
		numberInput.step = "1";
		numberInput.value = String(dpi.defaultValue);
		numberInput.placeholder = `${String(dpi.minimum)}–${String(dpi.maximum)}`;
			setLocalizedAttribute(
				numberInput,
				"aria-label",
				"frontend.export.dpi.aria",
				translator,
				{ format: encoder.label },
			);
		numberInput.setAttribute("list", listId);
		const datalist = createElement(
			ownerDocument,
			"datalist",
			"obmind-export-dpi-presets",
		);
		datalist.id = listId;
		for (const preset of dpi.presets) {
			const option = createElement(
				ownerDocument,
				"option",
				"obmind-export-option",
			);
			option.value = String(preset);
			datalist.append(option);
		}
		control.append(numberInput, datalist);
		input = numberInput;
	} else {
		const select = createElement(
			ownerDocument,
			"select",
			"obmind-export-select",
		);
			setLocalizedAttribute(
				select,
				"aria-label",
				"frontend.export.dpi.aria",
				translator,
				{ format: encoder.label },
			);
		for (const preset of dpi.presets) {
			const option = createElement(
				ownerDocument,
				"option",
				"obmind-export-option",
			);
			option.value = String(preset);
				option.textContent = translator.t("frontend.export.dpi.option", {
					dpi: translator.formatNumber(preset),
				});
			select.append(option);
		}
		select.value = String(dpi.defaultValue);
		control.append(select);
		input = select;
	}
	const safeButton = createElement(
		ownerDocument,
		"button",
		"obmind-export-safe-dpi",
	);
	safeButton.type = "button";
	safeButton.hidden = true;
		setLocalizedText(
			safeButton,
			"frontend.export.useSafeResolution",
			translator,
		);
	control.append(safeButton);
	return {
		field: createLocalizedExportField(
			ownerDocument,
			"frontend.export.resolution",
			control,
			translator,
		),
		input,
		safeButton,
	};
}

function getMindMapExportFormatDescriptionKey(
	encoder: MindMapExportEncoderCapability,
): ObMindTranslationKey {
	if (encoder.format === "pdf") {
		return encoder.pdfMode === "vector-single-page"
			? "frontend.export.pdfVector"
			: "frontend.export.pdfRaster";
	}
	if (encoder.dpi !== null) {
		return "frontend.export.rasterDescription";
	}
	return "frontend.export.vectorDescription";
}

function getSafeMindMapExportDpi(
	panel: BasicMindMapExportFormatPanelElements | null,
	plan: MindMapExportPlan | null,
): number | null {
	if (
		panel === null ||
		panel.encoder.dpi === null ||
		plan === null ||
		plan.maximumSafeDpi === null ||
		!Number.isFinite(plan.maximumSafeDpi)
	) {
		return null;
	}
	const capability = panel.encoder.dpi;
	const requested = plan.requestedDpi ?? capability.defaultValue;
	const boundedRequest = Math.min(
		capability.maximum,
		Math.max(capability.minimum, requested),
	);
	const safeDpi = Math.floor(Math.min(boundedRequest, plan.maximumSafeDpi));
	return safeDpi >= capability.minimum ? safeDpi : null;
}

function getMindMapExportOptionsKey(options: MindMapExportOptions): string {
	return JSON.stringify([
		options.format,
		options.scope,
		options.background,
		options.padding,
		options.dpi ?? null,
		options.jpegQuality ?? null,
	]);
}

function formatMindMapExportDimensions(
	width: number,
	height: number,
	unit: string,
	translator: ObMindTranslator,
): string {
	return `${formatMindMapExportNumber(width, translator)} × ${formatMindMapExportNumber(height, translator)} ${unit}`;
}

function formatMindMapExportNumber(
	value: number,
	translator: ObMindTranslator,
): string {
	return translator.formatNumber(value, {
		maximumFractionDigits: 0,
	});
}

function formatMindMapExportBytes(
	bytes: number,
	translator: ObMindTranslator,
): string {
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return "0 B";
	}
	const units = ["B", "KB", "MB", "GB"];
	const exponent = Math.min(
		units.length - 1,
		Math.floor(Math.log(bytes) / Math.log(1024)),
	);
	const scaled = bytes / 1024 ** exponent;
	return `${translator.formatNumber(scaled, {
		maximumFractionDigits: exponent === 0 || scaled >= 10 ? 0 : 1,
	})} ${units[exponent]!}`;
}

function formatMindMapExportPercent(
	value: number,
	translator: ObMindTranslator,
): string {
	return new Intl.NumberFormat(translator.language, {
		style: "percent",
		maximumFractionDigits: 0,
	}).format(value);
}

function getMindMapExportProgressLabel(
	progress: MindMapExportProgress,
	translator: ObMindTranslator,
): string {
	const keys: Readonly<
		Record<MindMapExportProgress["phase"], ObMindTranslationKey>
	> = {
		capture: "frontend.export.progress.capture",
		measure: "frontend.export.progress.measure",
		layout: "frontend.export.progress.layout",
		serialize: "frontend.export.progress.serialize",
		rasterize: "frontend.export.progress.rasterize",
		encode: "frontend.export.progress.encode",
		save: "frontend.export.progress.save",
	};
	const phase = translator.t(keys[progress.phase]);
	return translator.t(
		progress.state === "completed"
			? "frontend.export.progress.complete"
			: "frontend.export.progress.active",
		{ phase },
	);
}

function reportMindMapExportCaptureProgressToUi(
	progress: MindMapExportCaptureProgress,
	listener: MindMapExportProgressListener | undefined,
): void {
	if (listener === undefined) {
		return;
	}
	const phase =
		progress.stage === "measuring"
			? "measure"
			: progress.stage === "layout"
				? "layout"
				: "capture";
	const fraction =
		Number.isFinite(progress.completed) &&
		Number.isFinite(progress.total) &&
		progress.total > 0
			? Math.min(1, Math.max(0, progress.completed / progress.total))
			: undefined;
	listener({
		phase,
		state: progress.stage === "complete" ? "completed" : "started",
		...(fraction === undefined ? {} : { fraction }),
	});
}

export interface FailedMindMapEditRecovery {
	readonly nodeId: string;
	readonly text: string;
}

/**
 * Retain the user's submitted draft when an asynchronous host edit is
 * rejected. The renderer can reopen the in-node editor without knowing
 * anything about Obsidian transactions.
 */
export function getFailedMindMapEditRecovery(
	event: MindMapFrontendEvent,
): FailedMindMapEditRecovery | null {
	return event.type === "edit-node-text"
		? {
				nodeId: event.nodeId,
				text: event.text,
			}
		: null;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
	ownerDocument: Document,
	tagName: K,
	className: string,
): HTMLElementTagNameMap[K] {
	const factory: HtmlElementFactory = ownerDocument;
	const element = factory.createElement(tagName);
	element.className = className;
	return element;
}

function isSidebarTabId(value: string | undefined): value is SidebarTabId {
	return SIDEBAR_TAB_ORDER.some((tabId) => tabId === value);
}

function createSidebarTabPanel(
	ownerDocument: Document,
	sidebarInstanceId: string,
	tabId: SidebarTabId,
): HTMLElement {
	const panel = createElement(
		ownerDocument,
		"div",
		"obmind-sidebar-tabpanel",
	);
	panel.id = `obmind-sidebar-panel-${sidebarInstanceId}-${tabId}`;
	panel.dataset.obmindSidebarPanel = tabId;
	panel.setAttribute("role", "tabpanel");
	return panel;
}

function createSidebarTab(
	container: HTMLElement,
	panel: HTMLElement,
	tabId: SidebarTabId,
	iconId: string,
	labelKey: ObMindTranslationKey,
	renderIcon: MindMapIconRenderer,
	translator: ObMindTranslator,
): HTMLButtonElement {
	const button = createElement(
		container.ownerDocument,
		"button",
		"obmind-sidebar-tab",
	);
	button.type = "button";
	button.id = `${panel.id}-tab`;
	button.dataset.obmindSidebarTab = tabId;
	button.setAttribute("role", "tab");
	button.setAttribute("aria-controls", panel.id);
	panel.setAttribute("aria-labelledby", button.id);
	const icon = createElement(
		container.ownerDocument,
		"span",
		"obmind-sidebar-tab-icon",
	);
	icon.setAttribute("aria-hidden", "true");
	renderIcon(icon, iconId);
	const label = createElement(
		container.ownerDocument,
		"span",
		"obmind-sidebar-tab-label",
	);
	setLocalizedText(label, labelKey, translator);
	button.append(icon, label);
	container.append(button);
	return button;
}

function applySidebarTabState(
	tabs: Readonly<Record<SidebarTabId, HTMLButtonElement>>,
	panels: Readonly<Record<SidebarTabId, HTMLElement>>,
	activeTab: SidebarTabId,
): void {
	for (const tabId of SIDEBAR_TAB_ORDER) {
		const selected = tabId === activeTab;
		const tab = tabs[tabId];
		const panel = panels[tabId];
		tab.setAttribute("aria-selected", String(selected));
		tab.tabIndex = selected ? 0 : -1;
		panel.hidden = !selected;
		panel.inert = !selected;
	}
}



function createToolbarButton(
	container: HTMLElement,
	icon: string,
	label: string,
	renderIcon: MindMapIconRenderer,
): HTMLButtonElement {
	const button = createElement(
		container.ownerDocument,
		"button",
		"obmind-toolbar-button",
	);
	button.type = "button";
	setButtonLabel(button, label);
	renderIcon(button, icon);
	container.append(button);
	return button;
}

function createSidebarExportButton(
	container: HTMLElement,
	renderIcon: MindMapIconRenderer,
	translator: ObMindTranslator,
): HTMLButtonElement {
	const button = createElement(
		container.ownerDocument,
		"button",
		"obmind-sidebar-export-button",
	);
	button.type = "button";
	setLocalizedButtonLabel(button, "frontend.export.button", translator);
	const icon = createElement(
		container.ownerDocument,
		"span",
		"obmind-sidebar-export-button-icon",
	);
	icon.setAttribute("aria-hidden", "true");
	renderIcon(icon, "download");
	const label = createElement(
		container.ownerDocument,
		"span",
		"obmind-sidebar-export-button-label",
	);
	setLocalizedText(label, "frontend.export.button", translator);
	button.append(icon, label);
	container.append(button);
	return button;
}

function createExportTextInput(
	ownerDocument: Document,
	labelKey: ObMindTranslationKey,
	accessibleKey: ObMindTranslationKey,
	defaultValue: string,
	translator: ObMindTranslator,
): {
	readonly field: HTMLElement;
	readonly input: HTMLInputElement;
} {
	const input = createElement(
		ownerDocument,
		"input",
		"obmind-export-input",
	);
	input.type = "text";
	input.value = defaultValue;
	input.autocomplete = "off";
	input.spellcheck = false;
	setLocalizedAttribute(input, "aria-label", accessibleKey, translator);
	return {
		field: createLocalizedExportField(ownerDocument, labelKey, input, translator),
		input,
	};
}

function createExportSelectInput(
	ownerDocument: Document,
	labelKey: ObMindTranslationKey,
	accessibleKey: ObMindTranslationKey,
	options: readonly {
		readonly value: string;
		readonly label: string;
	}[],
	translator: ObMindTranslator,
	values?: ObMindTranslationValues,
): {
	readonly field: HTMLElement;
	readonly select: HTMLSelectElement;
} {
	const select = createElement(
		ownerDocument,
		"select",
		"obmind-export-select",
	);
	setLocalizedAttribute(
		select,
		"aria-label",
		accessibleKey,
		translator,
		values,
	);
	for (const definition of options) {
		const option = createElement(
			ownerDocument,
			"option",
			"obmind-export-option",
		);
		option.value = definition.value;
		option.textContent = definition.label;
		select.append(option);
	}
	return {
		field: createLocalizedExportField(ownerDocument, labelKey, select, translator),
		select,
	};
}

function createExportQualityInput(
	ownerDocument: Document,
	encoder: MindMapExportEncoderCapability,
	translator: ObMindTranslator,
): {
	readonly field: HTMLElement;
	readonly input: HTMLInputElement;
	readonly value: HTMLElement;
} {
	const quality = encoder.jpegQuality;
	if (quality === null) {
		throw new Error("A quality input requires a JPG export capability.");
	}
	const control = createElement(
		ownerDocument,
		"div",
		"obmind-export-quality-control",
	);
	const input = createElement(
		ownerDocument,
		"input",
		"obmind-export-quality-input",
	);
	input.type = "range";
	input.min = String(quality.minimum);
	input.max = String(quality.maximum);
	input.step = String(quality.step);
	input.value = String(quality.defaultValue);
	setLocalizedAttribute(
		input,
		"aria-label",
		"frontend.export.quality.aria",
		translator,
		{ format: encoder.label },
	);
	const value = createElement(
		ownerDocument,
		"output",
		"obmind-export-quality-value",
	);
	value.textContent = formatMindMapExportPercent(
		quality.defaultValue,
		translator,
	);
	control.append(input, value);
	return {
		field: createLocalizedExportField(
			ownerDocument,
			"frontend.export.quality",
			control,
			translator,
			{ format: encoder.label },
		),
		input,
		value,
	};
}

function createExportField(
	ownerDocument: Document,
	label: string,
	control: HTMLElement,
): HTMLElement {
	const field = createElement(
		ownerDocument,
		"div",
		"obmind-export-field",
	);
	const caption = createElement(
		ownerDocument,
		"span",
		"obmind-export-field-label",
	);
	caption.textContent = label;
	field.append(caption, control);
	return field;
}

function createLocalizedExportField(
	ownerDocument: Document,
	labelKey: ObMindTranslationKey,
	control: HTMLElement,
	translator: ObMindTranslator,
	values?: ObMindTranslationValues,
): HTMLElement {
	const field = createExportField(
		ownerDocument,
		translator.t(labelKey, values),
		control,
	);
	const caption = field.querySelector<HTMLElement>(
		".obmind-export-field-label",
	);
	if (caption !== null) {
		setLocalizedText(caption, labelKey, translator, values);
	}
	return field;
}

function createToolbarSearch(
	container: HTMLElement,
	translator: ObMindTranslator,
): {
	readonly input: HTMLInputElement;
	readonly results: HTMLElement;
} {
	const ownerDocument = container.ownerDocument;
	const wrapper = createElement(
		ownerDocument,
		"div",
		"obmind-toolbar-search",
	);
	const input = createElement(
		ownerDocument,
		"input",
		"obmind-toolbar-search-input",
	);
	input.type = "search";
	setLocalizedAttribute(
		input,
		"placeholder",
		"frontend.search.placeholder",
		translator,
	);
	input.autocomplete = "off";
	input.spellcheck = false;
	setLocalizedAttribute(input, "aria-label", "frontend.search.aria", translator);
	input.setAttribute("aria-expanded", "false");
	const results = createElement(
		ownerDocument,
		"div",
		"obmind-search-results",
	);
	results.id = `obmind-search-results-${String(
		++basicFrontendControlSequence,
	)}`;
	input.setAttribute("aria-controls", results.id);
	results.setAttribute("role", "listbox");
	results.hidden = true;
	wrapper.append(input, results);
	container.append(wrapper);
	return { input, results };
}


function createSidebarSection(
	ownerDocument: Document,
	title: string,
): HTMLElement {
	const section = createElement(ownerDocument, "section", "obmind-sidebar-section");
	const heading = createElement(ownerDocument, "p", "obmind-sidebar-section-title");
	heading.textContent = title;
	section.append(heading);
	return section;
}

function createMindMapAssetCapabilityButton(
	ownerDocument: Document,
	asset: MindMapAssetCapability,
): HTMLButtonElement {
	const button = createElement(
		ownerDocument,
		"button",
		"obmind-node-asset-option",
	);
	button.type = "button";
	button.dataset.obmindAssetId = asset.id;
	button.dataset.obmindAssetKind = asset.kind;
	button.title = asset.label;
	button.setAttribute("aria-label", asset.label);
	const svg = createPreviewSvgElement(ownerDocument, "svg");
	svg.classList.add("obmind-node-asset-preview");
	svg.setAttribute(
		"viewBox",
		`0 0 ${String(asset.visual.viewBox.width)} ${String(asset.visual.viewBox.height)}`,
	);
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("focusable", "false");
	for (const primitive of asset.visual.primitives) {
		svg.append(createMindMapAssetPreviewPrimitive(ownerDocument, primitive));
	}
	const label = createElement(
		ownerDocument,
		"span",
		"obmind-node-asset-option-label",
	);
	label.textContent = asset.label;
	button.append(svg, label);
	return button;
}

function createMindMapAssetPreviewPrimitive(
	ownerDocument: Document,
	primitive: MindMapAssetCapability["visual"]["primitives"][number],
): SVGElement {
	const applyPaint = (
		element: SVGElement,
		paint: Extract<
			MindMapAssetCapability["visual"]["primitives"][number],
			{ readonly fill: unknown }
		>["fill"],
	): void => {
		element.setAttribute(
			"fill",
			paint.kind === "none" ? "none" : assetPreviewRoleColor(paint.role),
		);
		if (paint.kind === "role" && paint.opacity !== undefined) {
			element.setAttribute("fill-opacity", String(paint.opacity));
		}
	};
	const applyStroke = (
		element: SVGElement,
		stroke:
			| MindMapAssetCapability["visual"]["primitives"][number]["stroke"]
			| undefined,
	): void => {
		if (stroke === undefined) {
			element.setAttribute("stroke", "none");
			return;
		}
		element.setAttribute("stroke", assetPreviewRoleColor(stroke.role));
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
			const element = createPreviewSvgElement(ownerDocument, "circle");
			element.setAttribute("cx", String(primitive.centerX));
			element.setAttribute("cy", String(primitive.centerY));
			element.setAttribute("r", String(primitive.radius));
			applyPaint(element, primitive.fill);
			applyStroke(element, primitive.stroke);
			return element;
		}
		case "rect": {
			const element = createPreviewSvgElement(ownerDocument, "rect");
			element.setAttribute("x", String(primitive.x));
			element.setAttribute("y", String(primitive.y));
			element.setAttribute("width", String(primitive.width));
			element.setAttribute("height", String(primitive.height));
			if (primitive.radius !== undefined) {
				element.setAttribute("rx", String(primitive.radius));
			}
			applyPaint(element, primitive.fill);
			applyStroke(element, primitive.stroke);
			return element;
		}
		case "line": {
			const element = createPreviewSvgElement(ownerDocument, "line");
			element.setAttribute("x1", String(primitive.start.x));
			element.setAttribute("y1", String(primitive.start.y));
			element.setAttribute("x2", String(primitive.end.x));
			element.setAttribute("y2", String(primitive.end.y));
			applyStroke(element, primitive.stroke);
			return element;
		}
		case "polyline":
		case "polygon": {
			const element = createPreviewSvgElement(ownerDocument, primitive.kind);
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
			const element = createPreviewSvgElement(ownerDocument, "path");
			const start = (primitive.startAngle * Math.PI) / 180;
			const end = (primitive.endAngle * Math.PI) / 180;
			const startX = primitive.centerX + Math.cos(start) * primitive.radius;
			const startY = primitive.centerY + Math.sin(start) * primitive.radius;
			const endX = primitive.centerX + Math.cos(end) * primitive.radius;
			const endY = primitive.centerY + Math.sin(end) * primitive.radius;
			element.setAttribute(
				"d",
				`M ${String(startX)} ${String(startY)} A ${String(primitive.radius)} ${String(primitive.radius)} 0 ${Math.abs(primitive.endAngle - primitive.startAngle) > 180 ? "1" : "0"} 1 ${String(endX)} ${String(endY)}`,
			);
			element.setAttribute("fill", "none");
			applyStroke(element, primitive.stroke);
			return element;
		}
	}
}

function assetPreviewRoleColor(
	role: MindMapAssetColorRole,
): string {
	switch (role) {
		case "foreground":
			return "var(--text-normal)";
		case "muted":
			return "var(--text-muted)";
		case "surface":
			return "var(--background-primary)";
		case "accent":
			return "var(--interactive-accent)";
		case "positive":
			return "var(--color-green)";
		case "warning":
			return "var(--color-orange)";
		case "danger":
			return "var(--color-red)";
	}
}

function createLocalizedSidebarSection(
	ownerDocument: Document,
	key: ObMindTranslationKey,
	translator: ObMindTranslator,
): HTMLElement {
	const section = createSidebarSection(ownerDocument, translator.t(key));
	const heading = section.querySelector<HTMLElement>(
		".obmind-sidebar-section-title",
	);
	if (heading !== null) {
		setLocalizedText(heading, key, translator);
	}
	return section;
}

function createPresetGrid(
	container: HTMLElement,
	accessibleLabel: string,
	className: string,
): HTMLElement {
	const grid = createElement(
		container.ownerDocument,
		"div",
		`obmind-preset-card-grid ${className}`,
	);
	grid.setAttribute("role", "group");
	grid.setAttribute("aria-label", accessibleLabel);
	container.append(grid);
	return grid;
}

function createLocalizedPresetGrid(
	container: HTMLElement,
	key: ObMindTranslationKey,
	className: string,
	translator: ObMindTranslator,
): HTMLElement {
	const grid = createPresetGrid(container, translator.t(key), className);
	setLocalizedAttribute(grid, "aria-label", key, translator);
	return grid;
}

function updateStylePresetGrid(
	container: HTMLElement,
	capabilities: readonly MindMapStyleCapability[],
	effects: MindMapRenderEffectResolver,
	selectedId: string,
	translator: ObMindTranslator,
): void {
	const effectSignature = effects
		.list()
		.map((effect) => `${effect.id}:${effect.kind}`)
		.join(",");
	const existing = new Map(
		Array.from(container.querySelectorAll<HTMLButtonElement>(
			"button[data-obmind-style-id]",
		)).map((button) => [button.dataset.obmindStyleId, button]),
	);
	const ordered = capabilities.map((capability) => {
		const signature =
			`${capability.id}:${String(capability.style.revision)}:` +
				`${capability.label}:${translator.language}:${effectSignature}`;
		const button =
			existing.get(capability.id) ??
			createPresetButton(container.ownerDocument, "style");
		button.dataset.obmindStyleId = capability.id;
		button.title = capability.label;
		button.setAttribute(
			"aria-label",
			translator.t("frontend.preset.style.aria", {
				label: capability.label,
			}),
		);
		button.setAttribute("aria-pressed", String(capability.id === selectedId));
		if (button.dataset.obmindPresetSignature !== signature) {
			button.dataset.obmindPresetSignature = signature;
			button.replaceChildren(
				createStylePresetPreview(container.ownerDocument, capability, effects),
				createPresetLabel(container.ownerDocument, capability.label),
			);
		}
		existing.delete(capability.id);
		return button;
	});
	for (const stale of existing.values()) {
		stale.remove();
	}
	container.append(...ordered);
}

function updatePalettePresetGrid(
	container: HTMLElement,
	capabilities: readonly MindMapPaletteCapability[],
	selectedId: string,
	colorScheme: MindMapColorScheme,
	translator: ObMindTranslator,
): void {
	const existing = new Map(
		Array.from(container.querySelectorAll<HTMLButtonElement>(
			"button[data-obmind-palette-id]",
		)).map((button) => [button.dataset.obmindPaletteId, button]),
	);
	const ordered = capabilities.map((capability) => {
		const signature =
			`${capability.id}:${String(capability.palette.revision)}:` +
				`${colorScheme}:${capability.label}:${translator.language}`;
		const button =
			existing.get(capability.id) ??
			createPresetButton(container.ownerDocument, "palette");
		button.dataset.obmindPaletteId = capability.id;
		button.title = capability.label;
		button.setAttribute(
			"aria-label",
			translator.t("frontend.preset.palette.aria", {
				label: capability.label,
			}),
		);
		button.setAttribute("aria-pressed", String(capability.id === selectedId));
		if (button.dataset.obmindPresetSignature !== signature) {
			button.dataset.obmindPresetSignature = signature;
			button.replaceChildren(
				createPalettePresetPreview(
					container.ownerDocument,
					capability,
					colorScheme,
				),
				createPresetLabel(container.ownerDocument, capability.label),
			);
		}
		existing.delete(capability.id);
		return button;
	});
	for (const stale of existing.values()) {
		stale.remove();
	}
	container.append(...ordered);
}

function createPresetButton(
	ownerDocument: Document,
	kind: "style" | "palette",
): HTMLButtonElement {
	const button = createElement(
		ownerDocument,
		"button",
		`obmind-preset-card obmind-${kind}-card`,
	);
	button.type = "button";
	return button;
}

function createPresetLabel(
	ownerDocument: Document,
	label: string,
): HTMLElement {
	const element = createElement(
		ownerDocument,
		"span",
		"obmind-preset-card-label",
	);
	element.textContent = label;
	return element;
}

function createStylePresetPreview(
	ownerDocument: Document,
	capability: MindMapStyleCapability,
	effects: MindMapRenderEffectResolver,
): HTMLElement {
	const preview = createElement(
		ownerDocument,
		"span",
		"obmind-preset-preview obmind-style-preview",
	);
	const scene = createMindMapStylePreviewScene(capability.style, effects);
	const svg = createPreviewSvg(ownerDocument, scene.width, scene.height);
	const canvasEffect = scene.effects.canvasTexture;
	if (canvasEffect !== null) {
		preview.dataset.obmindCanvasEffect = canvasEffect.profileId;
		preview.dataset.obmindPreviewCanvasTreatment =
			canvasEffect.presentation.canvasTexture;
	}
	for (const edge of scene.edges) {
		appendStylePreviewEdge(svg, edge);
	}
	for (const node of scene.nodes) {
		appendStylePreviewNode(svg, node, scene.effects);
	}
	preview.classList.toggle(
		"obmind-style-preview-textured",
		canvasEffect?.presentation.canvasTexture !== "none",
	);
	preview.append(svg);
	return preview;
}

function appendStylePreviewNode(
	svg: SVGSVGElement,
	node: MindMapStylePreviewNode,
	effects: MindMapStylePreviewEffects,
): void {
	const group = createPreviewSvgElement(svg.ownerDocument, "g");
	group.setAttribute("class", "obmind-style-preview-topic");
	group.dataset.obmindPreviewRole = node.role;
	group.dataset.obmindNodeShape = node.shape;
	group.dataset.obmindPreviewFillSource = node.fillSource;
	const strokeTreatment = effects.nodeStroke?.presentation.nodeStroke ?? "single";
	const fillTreatment = effects.nodeFill?.presentation.nodeFill ?? "none";
	if (strokeTreatment === "double") {
		const echo = createPreviewNodeShape(svg.ownerDocument, node, 0.8, 0.6);
		if (echo !== null) {
			configureStylePreviewNodeShape(
				echo,
				node,
				effects,
				"obmind-style-preview-node obmind-style-preview-node-echo",
			);
			group.append(echo);
		}
	}
	const shape =
		strokeTreatment === "dry"
			? createDryPreviewNodeShape(
					svg.ownerDocument,
					node,
					effects.nodeStroke,
				)
			: createPreviewNodeShape(svg.ownerDocument, node);
	if (shape !== null) {
		configureStylePreviewNodeShape(
			shape,
			node,
			effects,
			"obmind-style-preview-node",
		);
		group.append(shape);
	}
	const text = createPreviewSvgElement(svg.ownerDocument, "text");
	text.setAttribute("class", "obmind-style-preview-node-text");
	text.setAttribute("x", String(node.x + node.width / 2));
	text.setAttribute("y", String(node.y + node.height / 2));
	text.setAttribute("text-anchor", "middle");
	text.setAttribute("dominant-baseline", "central");
	text.setAttribute(
		"font-family",
		`var(--${resolvePreviewFontFamilyToken(node.metrics.typography.fontFamilyToken)})`,
	);
	text.setAttribute(
		"font-size",
		String(
			Math.min(4.6, Math.max(2.35, node.metrics.typography.fontSize * 0.16)),
		),
	);
	text.setAttribute("font-weight", String(node.metrics.typography.fontWeight));
	text.dataset.obmindPreviewRole = node.role;
	text.dataset.obmindPreviewFillTreatment = fillTreatment;
	text.dataset.obmindPreviewFillSource = node.fillSource;
	text.textContent = node.label;
	group.append(text);
	svg.append(group);
}

function createDryPreviewNodeShape(
	ownerDocument: Document,
	node: MindMapStylePreviewNode,
	effect: MindMapStylePreviewEffects["nodeStroke"],
): SVGElement | null {
	const shape = resolvePreviewContourShape(node.shape);
	if (shape === null) {
		return createPreviewNodeShape(ownerDocument, node);
	}
	const configuredRoughness = effect?.options.roughness;
	const roughness =
		typeof configuredRoughness === "number" &&
		Number.isFinite(configuredRoughness)
			? configuredRoughness
			: 1.55;
	const contour = createHandDrawnNodeContour({
		shape,
		width: node.width,
		height: node.height,
		radius:
			node.shape === "rounded-rectangle"
				? Math.min(node.height / 2, node.metrics.radius * 0.25)
				: undefined,
		inset: 0.9,
		stableKey: `style-preview:${node.id}`,
		roughness: roughness * 0.44,
		sampleSpacing: 4,
		maximumPointCount: 48,
	});
	const path = createPreviewSvgElement(ownerDocument, "path");
	path.setAttribute(
		"d",
		contour
			.map((point, index) =>
				`${index === 0 ? "M" : "L"} ${String(node.x + point.x)} ${String(node.y + point.y)}`,
			)
			.join(" ") + " Z",
	);
	return path;
}

function resolvePreviewContourShape(
	shape: MindMapNodeShape,
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
	}
}

function createPreviewNodeShape(
	ownerDocument: Document,
	node: MindMapStylePreviewNode,
	offsetX = 0,
	offsetY = 0,
): SVGElement | null {
	const x = node.x + offsetX;
	const y = node.y + offsetY;
	if (node.shape === "ellipse") {
		const ellipse = createPreviewSvgElement(ownerDocument, "ellipse");
		ellipse.setAttribute("cx", String(x + node.width / 2));
		ellipse.setAttribute("cy", String(y + node.height / 2));
		ellipse.setAttribute("rx", String(node.width / 2));
		ellipse.setAttribute("ry", String(node.height / 2));
		return ellipse;
	}
	if (node.shape === "none") {
		return null;
	}
	if (node.shape === "underline") {
		const line = createPreviewSvgElement(ownerDocument, "line");
		line.setAttribute("x1", String(x));
		line.setAttribute("x2", String(x + node.width));
		line.setAttribute("y1", String(y + node.height));
		line.setAttribute("y2", String(y + node.height));
		return line;
	}
	const rect = createPreviewSvgElement(ownerDocument, "rect");
	rect.setAttribute("x", String(x));
	rect.setAttribute("y", String(y));
	rect.setAttribute("width", String(node.width));
	rect.setAttribute("height", String(node.height));
	rect.setAttribute(
		"rx",
		node.shape === "pill"
			? String(node.height / 2)
			: node.shape === "rounded-rectangle"
				? String(Math.min(node.height / 2, node.metrics.radius * 0.25))
				: "0",
	);
	return rect;
}

function appendStylePreviewEdge(
	svg: SVGSVGElement,
	edge: MindMapStylePreviewEdge,
): void {
	const taperedPathData = createMindMapStylePreviewTaperedEdgePathData(edge);
	const path = createPreviewSvgElement(svg.ownerDocument, "path");
	path.setAttribute(
		"class",
		taperedPathData === null
			? "obmind-style-preview-edge"
			: "obmind-style-preview-edge obmind-style-preview-edge-tapered",
	);
	path.setAttribute(
		"d",
		taperedPathData ?? createMindMapStylePreviewEdgePathData(edge),
	);
	path.dataset.obmindConnectorProfile = edge.connectorProfile.kind;
	path.dataset.obmindPreviewEdgeTreatment =
		edge.edgeEffect?.presentation.edgeStroke ?? "clean";
	if (edge.edgeEffect !== null) {
		path.dataset.obmindEdgeEffect = edge.edgeEffect.profileId;
	}
	if (taperedPathData === null) {
		path.setAttribute("fill", "none");
		path.setAttribute("stroke", "currentColor");
		path.setAttribute("stroke-width", String(edge.strokeWidth));
		if (edge.lineStyle === "dashed") {
			path.setAttribute("stroke-dasharray", "5 3");
		} else if (edge.lineStyle === "dotted") {
			path.setAttribute("stroke-dasharray", "1.5 2.5");
		}
	} else {
		path.setAttribute("fill", "currentColor");
	}
	svg.append(path);
}

function configureStylePreviewNodeShape(
	element: SVGElement,
	node: MindMapStylePreviewNode,
	effects: MindMapStylePreviewEffects,
	className: string,
): void {
	element.setAttribute("class", className);
	element.setAttribute(
		"stroke-width",
		String(Math.min(1.8, Math.max(0.65, node.metrics.borderWidth))),
	);
	element.dataset.obmindPreviewRole = node.role;
	element.dataset.obmindNodeShape = node.shape;
	element.dataset.obmindPreviewFillSource = node.fillSource;
	element.dataset.obmindPreviewStrokeTreatment =
		effects.nodeStroke?.presentation.nodeStroke ?? "single";
	element.dataset.obmindPreviewFillTreatment =
		effects.nodeFill?.presentation.nodeFill ?? "none";
	const strokeDashArray = effects.nodeStroke?.presentation.nodeStrokeDashArray;
	if (strokeDashArray === null || strokeDashArray === undefined) {
		element.removeAttribute("stroke-dasharray");
	} else {
		element.setAttribute("stroke-dasharray", strokeDashArray.join(" "));
	}
	if (effects.nodeStroke !== null) {
		element.dataset.obmindNodeStrokeEffect = effects.nodeStroke.profileId;
	}
	if (effects.nodeFill !== null) {
		element.dataset.obmindNodeFillEffect = effects.nodeFill.profileId;
	}
}

function resolvePreviewFontFamilyToken(token: string): string {
	return /^[A-Za-z][A-Za-z0-9-]*$/.test(token)
		? token
		: "font-interface";
}

function createPalettePresetPreview(
	ownerDocument: Document,
	capability: MindMapPaletteCapability,
	colorScheme: MindMapColorScheme,
): HTMLElement {
	const preview = createElement(
		ownerDocument,
		"span",
		"obmind-preset-preview obmind-palette-preview",
	);
	const colors = {
		...capability.palette.colors,
		...(colorScheme === "light" ? capability.palette.lightColors : undefined),
	};
	const branchColors =
		colors.branchPalette.length > 0
			? colors.branchPalette
			: [colors.accent];
	const rootRole = {
		...capability.palette.roles.root,
		...(colorScheme === "light"
			? capability.palette.lightRoles?.root
			: undefined),
	};
	const svg = createPreviewSvg(ownerDocument);
	const childPositions = [
		[4, 7, 28, 13],
		[4, 42, 28, 13],
		[88, 7, 28, 13],
		[88, 42, 28, 13],
	] as const;
	for (const [index, [x, y, width, height]] of childPositions.entries()) {
		const color = resolvePresetColor(
			branchColors[index % branchColors.length] ?? colors.accent,
		);
		const fromX = x < 40 ? 46 : 74;
		const toX = x < 40 ? x + width : x;
		const path = createPreviewSvgElement(ownerDocument, "path");
		path.setAttribute(
			"d",
			`M ${fromX} 31 C 40 31, ${toX} ${y + height / 2}, ${toX} ${y + height / 2}`,
		);
		path.setAttribute("fill", "none");
		path.setAttribute("stroke", color);
		path.setAttribute("stroke-width", "1.7");
		const rect = createPreviewSvgElement(ownerDocument, "rect");
		rect.setAttribute("x", String(x));
		rect.setAttribute("y", String(y));
		rect.setAttribute("width", String(width));
		rect.setAttribute("height", String(height));
		rect.setAttribute("rx", "4");
		rect.setAttribute("fill", color);
		rect.setAttribute("stroke", color);
		svg.append(path, rect);
	}
	const root = createPreviewSvgElement(ownerDocument, "rect");
	root.setAttribute("x", "46");
	root.setAttribute("y", "21");
	root.setAttribute("width", "28");
	root.setAttribute("height", "20");
	root.setAttribute("rx", "6");
	root.setAttribute(
		"fill",
		resolvePresetColor(
			rootRole.fill ?? colors.surfaceEmphasis,
		),
	);
	root.setAttribute(
		"stroke",
		resolvePresetColor(
			rootRole.stroke ?? colors.accent,
		),
	);
	root.setAttribute("stroke-width", "1.5");
	svg.append(root);
	const swatches = createElement(
		ownerDocument,
		"span",
		"obmind-palette-preview-swatches",
	);
	for (const color of branchColors.slice(0, 6)) {
		const swatch = createElement(
			ownerDocument,
			"span",
			"obmind-palette-preview-swatch",
		);
		swatch.style.backgroundColor = resolvePresetColor(color);
		swatches.append(swatch);
	}
	preview.append(svg, swatches);
	return preview;
}

function createPreviewSvg(
	ownerDocument: Document,
	width = 120,
	height = 62,
): SVGSVGElement {
	const svg = createPreviewSvgElement(ownerDocument, "svg");
	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("focusable", "false");
	return svg;
}

function createPreviewSvgElement<K extends keyof SVGElementTagNameMap>(
	ownerDocument: Document,
	tagName: K,
): SVGElementTagNameMap[K] {
	const factory: HtmlElementFactory = ownerDocument;
	return factory.createElementNS(
		"http://www.w3.org/2000/svg",
		tagName,
	);
}

function resolvePresetColor(color: MindMapThemeColor): string {
	if (color.kind === "host") {
		return isSafeHostColorToken(color.token)
			? `var(--${color.token})`
			: "transparent";
	}
	return isSafeLiteralColor(color.value) ? color.value : "transparent";
}

function createSidebarSelect(
	container: HTMLElement,
	labelText: string,
	accessibleLabel: string,
): HTMLSelectElement {
	const ownerDocument = container.ownerDocument;
	const row = createElement(ownerDocument, "label", "obmind-sidebar-row");
	const caption = createElement(
		ownerDocument,
		"span",
		"obmind-sidebar-row-label",
	);
	caption.textContent = labelText;
	const select = createElement(
		ownerDocument,
		"select",
		"obmind-toolbar-select obmind-sidebar-select",
	);
	select.setAttribute("aria-label", accessibleLabel);
	select.title = accessibleLabel;
	row.append(caption, select);
	container.append(row);
	return select;
}

function createLocalizedSidebarSelect(
	container: HTMLElement,
	labelKey: ObMindTranslationKey,
	accessibleKey: ObMindTranslationKey,
	translator: ObMindTranslator,
): HTMLSelectElement {
	const select = createSidebarSelect(
		container,
		translator.t(labelKey),
		translator.t(accessibleKey),
	);
	const row = select.closest<HTMLElement>(".obmind-sidebar-row");
	const caption = row?.querySelector<HTMLElement>(
		".obmind-sidebar-row-label",
	);
	if (caption !== null && caption !== undefined) {
		setLocalizedText(caption, labelKey, translator);
	}
	setLocalizedAttribute(select, "aria-label", accessibleKey, translator);
	setLocalizedAttribute(select, "title", accessibleKey, translator);
	return select;
}

function createSidebarSpacingControls(
	container: HTMLElement,
	translator: ObMindTranslator,
): {
	readonly inputs: Readonly<
		Record<"level" | "sibling" | "subtree", HTMLInputElement>
	>;
	readonly labels: Readonly<
		Record<"level" | "sibling" | "subtree", HTMLElement>
	>;
} {
	const ownerDocument = container.ownerDocument;
	const inputs = {} as Record<
		"level" | "sibling" | "subtree",
		HTMLInputElement
	>;
	const labels = {} as Record<
		"level" | "sibling" | "subtree",
		HTMLElement
	>;
	for (const key of ["level", "sibling", "subtree"] as const) {
		const row = createElement(ownerDocument, "label", "obmind-sidebar-row");
		const caption = createElement(
			ownerDocument,
			"span",
			"obmind-sidebar-row-label",
		);
		const labelKey = getSpacingLabelKey(key);
		setLocalizedText(caption, labelKey, translator);
		const input = createElement(
			ownerDocument,
			"input",
			"obmind-toolbar-spacing-input",
		);
		input.type = "number";
		setLocalizedAttribute(
			input,
			"aria-label",
			"frontend.layout.spacing.aria",
			translator,
			{ label: translator.t(labelKey) },
		);
		row.append(caption, input);
		container.append(row);
		inputs[key] = input;
		labels[key] = caption;
	}
	return { inputs, labels };
}

function createSelectedFormattingControls(
	container: HTMLElement,
	translator: ObMindTranslator,
): {
	readonly shape: HTMLSelectElement;
	readonly fontSize: HTMLInputElement;
	readonly fontWeight: HTMLInputElement;
	readonly borderWidth: HTMLInputElement;
	readonly radius: HTMLInputElement;
	readonly fill: HTMLInputElement;
	readonly stroke: HTMLInputElement;
	readonly textColor: HTMLInputElement;
	readonly reset: HTMLButtonElement;
} {
	container.hidden = true;
	const shape = createLocalizedSidebarSelect(
		container,
		"frontend.format.shape",
		"frontend.format.shape.aria",
		translator,
	);
	shape.dataset.obmindFormattingField = "shape";
	const fontSize = createSidebarFormattingInput(
		container,
		"frontend.format.fontSize",
		"fontSize",
		"number",
		translator,
		{ minimum: 6, maximum: 160, step: 1 },
	);
	const fontWeight = createSidebarFormattingInput(
		container,
		"frontend.format.fontWeight",
		"fontWeight",
		"number",
		translator,
		{ minimum: 100, maximum: 1000, step: 50 },
	);
	const borderWidth = createSidebarFormattingInput(
		container,
		"frontend.format.borderWidth",
		"borderWidth",
		"number",
		translator,
		{ minimum: 0, maximum: 32, step: 0.5 },
	);
	const radius = createSidebarFormattingInput(
		container,
		"frontend.format.cornerRadius",
		"radius",
		"number",
		translator,
		{ minimum: 0, maximum: 240, step: 1 },
	);
	const fill = createSidebarFormattingInput(
		container,
		"frontend.format.fill",
		"fill",
		"color",
		translator,
	);
	const stroke = createSidebarFormattingInput(
		container,
		"frontend.format.border",
		"stroke",
		"color",
		translator,
	);
	const textColor = createSidebarFormattingInput(
		container,
		"frontend.format.text",
		"textColor",
		"color",
		translator,
	);
	const reset = createElement(
		container.ownerDocument,
		"button",
		"obmind-inspector-reset",
	);
	reset.type = "button";
	reset.dataset.obmindFormattingReset = "true";
	setLocalizedText(reset, "frontend.format.resetTopic", translator);
	container.append(reset);
	return {
		shape,
		fontSize,
		fontWeight,
		borderWidth,
		radius,
		fill,
		stroke,
		textColor,
		reset,
	};
}

function createSidebarFormattingInput(
	container: HTMLElement,
	labelKey: ObMindTranslationKey,
	field: string,
	type: "number" | "color",
	translator: ObMindTranslator,
	range?: {
		readonly minimum: number;
		readonly maximum: number;
		readonly step: number;
	},
): HTMLInputElement {
	const row = createElement(
		container.ownerDocument,
		"label",
		"obmind-sidebar-row",
	);
	const caption = createElement(
		container.ownerDocument,
		"span",
		"obmind-sidebar-row-label",
	);
	setLocalizedText(caption, labelKey, translator);
	const input = createElement(
		container.ownerDocument,
		"input",
		`obmind-inspector-input obmind-inspector-input-${type}`,
	);
	input.type = type;
	input.dataset.obmindFormattingField = field;
	setLocalizedAttribute(
		input,
		"aria-label",
		"frontend.format.field.aria",
		translator,
		{ label: translator.t(labelKey) },
	);
	if (range !== undefined) {
		input.min = String(range.minimum);
		input.max = String(range.maximum);
		input.step = String(range.step);
	}
	row.append(caption, input);
	container.append(row);
	return input;
}

function getSelectedFormattingControl(
	target: EventTarget | null,
): HTMLInputElement | HTMLSelectElement | null {
	return target instanceof HTMLInputElement ||
		target instanceof HTMLSelectElement
		? target.dataset.obmindFormattingField === undefined
			? null
			: target
		: null;
}

function createSelectedFormattingCommand(
	field: string,
	rawValue: string,
	shapes: readonly MindMapNodeShape[],
): MindMapNodeFormattingCommand | null {
	if (field === "shape") {
		if (rawValue === "") {
			return { type: "shape", value: undefined };
		}
		const shape = shapes.find((candidate) => candidate === rawValue);
		return shape === undefined ? null : { type: "shape", value: shape };
	}
	if (field === "fill" || field === "stroke" || field === "textColor") {
		return isSafeLiteralColor(rawValue)
			? { type: "color", field, value: literalColor(rawValue) }
			: null;
	}
	const value = rawValue.trim().length === 0 ? undefined : Number(rawValue);
	if (value !== undefined && !Number.isFinite(value)) {
		return null;
	}
	if (field === "fontSize" || field === "fontWeight") {
		return { type: "typography", field, value };
	}
	if (field === "borderWidth" || field === "radius") {
		return { type: "metric", field, value };
	}
	return null;
}

function commonSelectedValue<T>(
	values: readonly MindMapNodePresentation[],
	read: (value: MindMapNodePresentation) => T | undefined,
): T | undefined {
	const first = values[0] === undefined ? undefined : read(values[0]);
	return values.every((value) => presentationValueEquals(read(value), first))
		? first
		: undefined;
}

function presentationValueEquals(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function setMixedNumberInput(
	input: HTMLInputElement,
	value: number | undefined,
	translator: ObMindTranslator,
): void {
	input.value = value === undefined ? "" : String(value);
	if (value === undefined) {
		setLocalizedAttribute(
			input,
			"placeholder",
			"frontend.inheritMixed",
			translator,
		);
	} else {
		input.placeholder = "";
	}
}

function setMixedColorInput(
	input: HTMLInputElement,
	value: MindMapThemeColor | undefined,
	translator: ObMindTranslator,
): void {
	const literal = value?.kind === "literal" ? value.value : null;
	input.value = literal !== null && isSafeLiteralColor(literal)
		? normalizeColorInputValue(literal)
		: "#ffffff";
	input.dataset.obmindMixed = String(literal === null);
	if (literal === null) {
		setLocalizedAttribute(
			input,
			"title",
			"frontend.format.colorMixed.title",
			translator,
		);
	} else {
		input.title = "";
	}
}

function normalizeColorInputValue(value: string): string {
	if (/^#[0-9a-fA-F]{6}$/.test(value)) {
		return value;
	}
	if (/^#[0-9a-fA-F]{3}$/.test(value)) {
		return `#${value
			.slice(1)
			.split("")
			.map((character) => character + character)
			.join("")}`;
	}
	return "#ffffff";
}

function getNodeShapeLabel(
	shape: MindMapNodeShape,
	translator: ObMindTranslator,
): string {
	const keys: Readonly<Record<MindMapNodeShape, ObMindTranslationKey>> = {
		"rounded-rectangle": "frontend.nodeShape.roundedRectangle",
		rectangle: "frontend.nodeShape.rectangle",
		pill: "frontend.nodeShape.pill",
		ellipse: "frontend.nodeShape.ellipse",
		underline: "frontend.nodeShape.underline",
		none: "frontend.nodeShape.none",
	};
	return translator.t(keys[shape]);
}

function updateLayoutOptionControls(
	container: HTMLElement,
	definitions: readonly MindMapLayoutOptionCapability[],
	values: Readonly<Record<string, unknown>>,
	translator: ObMindTranslator,
): void {
	const signature = JSON.stringify([translator.language, definitions]);
	if (container.dataset.obmindLayoutOptionSignature !== signature) {
		container.dataset.obmindLayoutOptionSignature = signature;
		container.replaceChildren(
			...definitions.map((definition) =>
				createLayoutOptionControl(container.ownerDocument, definition),
			),
		);
	}
	for (const definition of definitions) {
		const control = container.querySelector<
			HTMLInputElement | HTMLSelectElement
		>(`[data-obmind-layout-option-key="${definition.key}"]`);
		if (control === null) {
			continue;
		}
		const value = values[definition.key] ?? definition.defaultValue;
		if (definition.type === "boolean" && control instanceof HTMLInputElement) {
			control.checked = value === true;
		} else if (definition.type === "number") {
			const numericValue =
				typeof value === "number" && Number.isFinite(value)
					? value
					: definition.defaultValue;
			control.value = String(numericValue);
		} else if (definition.type === "select") {
			const selectedValue =
				typeof value === "string" &&
				definition.choices.some((choice) => choice.value === value)
					? value
					: definition.defaultValue;
			control.value = selectedValue;
		}
	}
}

function createLayoutOptionControl(
	ownerDocument: Document,
	definition: MindMapLayoutOptionCapability,
): HTMLElement {
	const row = createElement(ownerDocument, "label", "obmind-sidebar-row");
	const caption = createElement(
		ownerDocument,
		"span",
		"obmind-sidebar-row-label",
	);
	caption.textContent = definition.label;
	let control: HTMLInputElement | HTMLSelectElement;
	if (definition.type === "select") {
		control = createElement(
			ownerDocument,
			"select",
			"obmind-toolbar-select obmind-sidebar-select",
		);
		for (const choice of definition.choices) {
			const option = createElement(ownerDocument, "option", "");
			option.value = choice.value;
			option.textContent = choice.label;
			control.append(option);
		}
	} else {
		control = createElement(
			ownerDocument,
			"input",
			definition.type === "boolean"
				? "obmind-layout-option-checkbox"
				: "obmind-inspector-input obmind-inspector-input-number",
		);
		control.type = definition.type === "boolean" ? "checkbox" : "number";
		if (definition.type === "number") {
			if (definition.minimum !== undefined) {
				control.min = String(definition.minimum);
			}
			if (definition.maximum !== undefined) {
				control.max = String(definition.maximum);
			}
			if (definition.step !== undefined) {
				control.step = String(definition.step);
			}
		}
	}
	control.dataset.obmindLayoutOptionKey = definition.key;
	control.setAttribute("aria-label", definition.label);
	control.title = definition.description ?? definition.label;
	row.append(caption, control);
	return row;
}

function getLayoutOptionControl(
	target: EventTarget | null,
): HTMLInputElement | HTMLSelectElement | null {
	return target instanceof HTMLInputElement ||
		target instanceof HTMLSelectElement
		? target.dataset.obmindLayoutOptionKey === undefined
			? null
			: target
		: null;
}

function readLayoutOptionControlValue(
	control: HTMLInputElement | HTMLSelectElement,
	definition: MindMapLayoutOptionCapability,
): string | number | boolean | null {
	if (definition.type === "boolean") {
		return control instanceof HTMLInputElement ? control.checked : null;
	}
	if (definition.type === "select") {
		return definition.choices.some((choice) => choice.value === control.value)
			? control.value
			: null;
	}
	const value = Number(control.value);
	if (!Number.isFinite(value)) {
		return null;
	}
	return Math.min(
		definition.maximum ?? value,
		Math.max(definition.minimum ?? value, value),
	);
}

function getOrientationLabel(
	orientation: MindMapLayoutOrientation,
	translator: ObMindTranslator,
): string {
	const keys: Readonly<Record<MindMapLayoutOrientation, ObMindTranslationKey>> = {
		"left-to-right": "frontend.layout.orientation.leftToRight",
		"right-to-left": "frontend.layout.orientation.rightToLeft",
		"top-to-bottom": "frontend.layout.orientation.topToBottom",
		"bottom-to-top": "frontend.layout.orientation.bottomToTop",
	};
	return translator.t(keys[orientation]);
}

function getSpacingLabel(
	key: "level" | "sibling" | "subtree",
	translator: ObMindTranslator,
): string {
	return translator.t(getSpacingLabelKey(key));
}

function getSpacingLabelKey(
	key: "level" | "sibling" | "subtree",
): ObMindTranslationKey {
	const keys: Readonly<
		Record<"level" | "sibling" | "subtree", ObMindTranslationKey>
	> = {
		level: "frontend.layout.spacing.level",
		sibling: "frontend.layout.spacing.sibling",
		subtree: "frontend.layout.spacing.subtree",
	};
	return keys[key];
}

function updateToolbarSelect(
	select: HTMLSelectElement,
	options: readonly {
		readonly value: string;
		readonly label: string;
	}[],
	currentValue: string,
	customLabel: string,
): void {
	const hasCurrent = options.some(({ value }) => value === currentValue);
	const displayedOptions = hasCurrent
		? options
		: [
				...options,
				{
					value: currentValue,
					label: customLabel,
				},
			];
	const signature = JSON.stringify(displayedOptions);
	if (select.dataset.obmindOptions !== signature) {
		const optionElements: HTMLOptionElement[] = [];
		for (const optionDefinition of displayedOptions) {
			const option = createElement(
				select.ownerDocument,
				"option",
				"obmind-toolbar-option",
			);
			option.value = optionDefinition.value;
			option.textContent = optionDefinition.label;
			optionElements.push(option);
		}
		select.replaceChildren(...optionElements);
		select.dataset.obmindOptions = signature;
	}
	select.value = currentValue;
	select.disabled = options.length <= 1;
}

function renderTextIcon(element: HTMLElement, iconId: string): void {
	element.textContent = iconId;
}

function setButtonLabel(button: HTMLButtonElement, label: string): void {
	button.title = label;
	button.setAttribute("aria-label", label);
}

function setLocalizedButtonLabel(
	button: HTMLButtonElement,
	key: ObMindTranslationKey,
	translator: ObMindTranslator,
	values?: ObMindTranslationValues,
): void {
	setLocalizedAttribute(button, "title", key, translator, values);
	setLocalizedAttribute(button, "aria-label", key, translator, values);
}

/**
 * Small DOM binding primitive for chrome that survives a locale change. It is
 * deliberately data-only: translated strings never encode behavior and the
 * renderer remains untouched while this tree is refreshed.
 */
function setLocalizedText(
	element: HTMLElement,
	key: ObMindTranslationKey,
	translator: ObMindTranslator,
	values?: ObMindTranslationValues,
): void {
	element.dataset.obmindI18nText = key;
	setLocalizedValues(element, values);
	element.textContent = translator.t(key, values);
}

function setLocalizedAttribute(
	element: HTMLElement,
	attribute: "aria-label" | "placeholder" | "title",
	key: ObMindTranslationKey,
	translator: ObMindTranslator,
	values?: ObMindTranslationValues,
): void {
	const datasetKey =
		attribute === "aria-label"
			? "obmindI18nAria"
			: attribute === "placeholder"
				? "obmindI18nPlaceholder"
				: "obmindI18nTitle";
	element.dataset[datasetKey] = key;
	setLocalizedValues(element, values);
	element.setAttribute(attribute, translator.t(key, values));
}

function setLocalizedValues(
	element: HTMLElement,
	values: ObMindTranslationValues | undefined,
): void {
	if (values === undefined || Object.keys(values).length === 0) {
		delete element.dataset.obmindI18nValues;
		return;
	}
	element.dataset.obmindI18nValues = JSON.stringify(values);
}

function refreshLocalizedElements(
	root: HTMLElement,
	translator: ObMindTranslator,
): void {
	const elements = [
		root,
		...Array.from(root.querySelectorAll<HTMLElement>(
			"[data-obmind-i18n-text], [data-obmind-i18n-aria], [data-obmind-i18n-placeholder], [data-obmind-i18n-title]",
		)),
	];
	for (const element of elements) {
		const values = getLocalizedValues(element);
		const textKey = element.dataset.obmindI18nText;
		if (textKey !== undefined) {
			element.textContent = translator.t(
				textKey as ObMindTranslationKey,
				values,
			);
		}
		const ariaKey = element.dataset.obmindI18nAria;
		if (ariaKey !== undefined) {
			element.setAttribute(
				"aria-label",
				translator.t(ariaKey as ObMindTranslationKey, values),
			);
		}
		const placeholderKey = element.dataset.obmindI18nPlaceholder;
		if (placeholderKey !== undefined) {
			element.setAttribute(
				"placeholder",
				translator.t(placeholderKey as ObMindTranslationKey, values),
			);
		}
		const titleKey = element.dataset.obmindI18nTitle;
		if (titleKey !== undefined) {
			element.setAttribute(
				"title",
				translator.t(titleKey as ObMindTranslationKey, values),
			);
		}
	}
}

function getLocalizedValues(element: HTMLElement): ObMindTranslationValues {
	const serialized = element.dataset.obmindI18nValues;
	if (serialized === undefined) {
		return {};
	}
	try {
		const parsed: unknown = JSON.parse(serialized);
		return parsed !== null && typeof parsed === "object"
			? parsed as ObMindTranslationValues
			: {};
	} catch {
		return {};
	}
}

function getMindMapExportErrorTranslationKey(
	code: MindMapExportError["code"],
): ObMindTranslationKey {
	return `frontend.export.error.${code}` as ObMindTranslationKey;
}

function findMindMapNode(root: MindMapNode, nodeId: string): MindMapNode | null {
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

function collectMindMapNodeIds(root: MindMapNode): ReadonlySet<string> {
	const nodeIds = new Set<string>();
	const pending = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined || nodeIds.has(node.id)) {
			continue;
		}
		nodeIds.add(node.id);
		for (const child of node.children) {
			pending.push(child);
		}
	}
	return nodeIds;
}

function getMindMapDecorationAuthoringKind(
	value: string,
): MindMapDecoration["kind"] | null {
	return value === "marker" ||
		value === "relationship" ||
		value === "boundary" ||
		value === "summary"
		? value
		: null;
}

function normalizeMindMapDecorationText(value: string): string {
	return value.trim();
}

function nextRevision(revision: string | number): string | number {
	return typeof revision === "number"
		? revision + 1
		: `${revision}:next`;
}
