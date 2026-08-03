import { ItemView, Scope, type WorkspaceLeaf } from "obsidian";

import { OBMIND_ICON_ID } from "../ui/branding";
import type { ObMindAppearanceMode } from "../application/config";
import type {
	DocumentAnnotationField,
} from "../application/persistence/annotations";
import type {
	MindMapViewState,
	MindMapViewStateListener,
} from "../application/controller";
import type {
	MindMapFrontend,
	MindMapFrontendCapabilities,
	MindMapFrontendDocumentState,
	MindMapFrontendEvent,
	MindMapFrontendEventSink,
	MindMapPresentationScope,
	MindMapPresentationLibraryCommand,
	MindMapPresentationLibraryCommandResult,
	MindMapTopicCommandAvailability,
	MindMapTopicCommandAvailabilitySource,
} from "../ui/frontend";
import { resolveMindMapColorScheme } from "../ui/frontend";
import {
	createObMindTranslator,
	ObMindLocalizedError,
	type ObMindLanguage,
	type ObMindTranslationKey,
	type ObMindTranslationValues,
} from "../i18n/i18n";
import { createLayoutEdgeId } from "../layout/layout";
import type {
	MindMapDocument,
	MindMapInlineLink,
	MindMapNode,
	MindMapNodeEditSnapshot,
	SourceLocation,
} from "../core/model";
import {
	runMindMapNodeEditWorkflow,
	type MindMapNodeCreationResult,
	type MindMapNodeEditResult,
} from "../topic/mutation/node-edit-workflow";
import type { NodeCreateKind } from "../topic/mutation/node-insert";
import type {
	MindMapNodeMoveResult,
	NodeMovePlacement,
} from "../topic/mutation/node-move";
import type {
	MindMapColorScheme,
	MindMapLayoutSpec,
	MindMapInteractionState,
	MindMapPresentation,
	MindMapViewportState,
} from "../presentation/presentation";
import {
	applyMindMapPresentationPatch,
	createMindMapPresentationPatch,
	type MindMapPresentationPatch,
} from "../presentation/presentation-patch";
import {
	beginPresentationGesture,
	cancelPresentationGestureState,
	commitPresentationGesture,
	updatePresentationGesture,
	type PresentationGestureAdapter,
	type PresentationGestureState,
} from "../presentation/presentation-gesture";
import { cloneMindMapPresentation } from "../presentation/presentation-snapshot";
import { MindMapViewSession } from "../application/session";
import {
	canActivateMindMapTopicCommandResult,
	type MindMapTopicCommandRequest,
	type MindMapTopicCommandResult,
} from "../topic/interaction/topic-command";

export const VIEW_TYPE_MIND_MAP = "obmind-mind-map";
const VIEWPORT_PERSISTENCE_DEBOUNCE_MS = 250;

export interface MindMapPersistedDocumentState {
	readonly presentationOverride: MindMapPresentation | null;
	readonly collapsedNodeIds: ReadonlySet<string>;
	readonly viewport: MindMapViewportState | null;
}

export interface MindMapDocumentStatePersistenceRequest {
	readonly document: MindMapDocument;
	readonly basePresentation: MindMapPresentation;
	readonly presentation: MindMapPresentation;
	/**
	 * Document-layer snapshot captured immediately before this operation.
	 * The host uses it to derive the exact node/edge IDs owned by a stale-safe
	 * sparse merge instead of replacing another tab's unrelated overrides.
	 */
	readonly previousPresentation?: MindMapPresentation;
	readonly interaction: MindMapInteractionState;
	readonly label: string;
	readonly fields: readonly DocumentAnnotationField[];
	readonly previousCollapsedNodeIds?: ReadonlySet<string>;
}

interface ActivePresentationGesture {
	readonly state: PresentationGestureState<MindMapPresentation>;
	readonly previousViewOverride: MindMapPresentation | null;
	readonly previousViewport: MindMapViewportState | null;
	readonly label: string;
}

interface DocumentPersistenceBaseline {
	readonly previousCollapsedNodeIds?: ReadonlySet<string>;
	readonly previousPresentation?: MindMapPresentation;
}

/**
 * The ItemView consumes this host port instead of the concrete plugin or
 * controller. A future frontend can be selected in the plugin composition root
 * without changing Obsidian lifecycle and navigation code.
 */
export interface MindMapViewHost {
	registerMindMapView(view: MindMapView): void;
	unregisterMindMapView(view: MindMapView): void;
	subscribeMindMapState(listener: MindMapViewStateListener): () => void;
	createMindMapFrontend(eventSink: MindMapFrontendEventSink): MindMapFrontend;
	getMindMapFrontendCapabilities(): MindMapFrontendCapabilities;
	getMindMapAppearanceMode(): ObMindAppearanceMode;
	setAppearanceMode(appearanceMode: ObMindAppearanceMode): Promise<void>;
	getMindMapLanguage(): ObMindLanguage;
	setMindMapLanguage(language: ObMindLanguage): Promise<void>;
	getMindMapTopicCommandAvailability(
		source: MindMapTopicCommandAvailabilitySource | null,
	): MindMapTopicCommandAvailability;
	createMindMapPresentation(state: MindMapViewState): MindMapPresentation;
	hydrateMindMapDocumentState(
		document: MindMapDocument,
		basePresentation: MindMapPresentation,
	): MindMapPersistedDocumentState;
	persistMindMapDocumentState(
		request: MindMapDocumentStatePersistenceRequest,
	): Promise<void>;
	restoreMindMapDocumentPresentation(
		document: MindMapDocument,
		direction: "undo" | "redo",
	): Promise<boolean>;
	setDefaultMindMapLayout(layout: MindMapLayoutSpec): Promise<void>;
	setDefaultMindMapStyle(styleId: string): Promise<boolean>;
	setDefaultMindMapPalette(paletteId: string): Promise<boolean>;
	executeMindMapPresentationLibraryCommand(
		command: MindMapPresentationLibraryCommand,
	): Promise<MindMapPresentationLibraryCommandResult>;
	navigateToSource(source: SourceLocation): Promise<void>;
	openMindMapLink(sourcePath: string, link: MindMapInlineLink): Promise<void>;
	editMindMapNode(
		node: MindMapNodeEditSnapshot,
		newText: string,
	): Promise<MindMapNodeEditResult>;
	toggleMindMapTask(
		node: MindMapNodeEditSnapshot,
	): Promise<MindMapNodeEditResult>;
	createMindMapNode(
		document: MindMapDocument,
		node: MindMapNodeEditSnapshot,
		createKind: NodeCreateKind,
	): Promise<MindMapNodeCreationResult>;
	moveMindMapNode(
		document: MindMapDocument,
		source: MindMapNodeEditSnapshot,
		target: MindMapNodeEditSnapshot,
		placement: NodeMovePlacement,
	): Promise<MindMapNodeMoveResult>;
	executeMindMapTopicCommand(
		document: MindMapDocument,
		request: MindMapTopicCommandRequest,
	): Promise<MindMapTopicCommandResult>;
}

export class MindMapView extends ItemView {
	public navigation = false;

	private readonly host: MindMapViewHost;
	private readonly session = new MindMapViewSession();

	private frontend: MindMapFrontend | null = null;
	private unsubscribe: (() => void) | null = null;
	private currentState: MindMapViewState | null = null;
	private currentFilePath: string | null = null;
	private structuralEditInFlight = false;
	private viewActive = false;
	private resourcesReleased = false;
	private activePresentationGesture: ActivePresentationGesture | null = null;
	private pendingViewportPersistence: {
		readonly timer: number;
		readonly timerWindow: Window;
		readonly request: MindMapDocumentStatePersistenceRequest;
	} | null = null;

	public constructor(leaf: WorkspaceLeaf, host: MindMapViewHost) {
		super(leaf);
		this.host = host;
		this.scope = new Scope(this.app.scope);
		for (const key of [
			"Tab",
			"Enter",
			"Escape",
			"F2",
			" ",
			"ArrowLeft",
			"ArrowRight",
			"ArrowUp",
			"ArrowDown",
			"Home",
			"End",
			"Delete",
			"Backspace",
			"c",
			"x",
			"v",
			"z",
			"y",
		]) {
			this.scope.register(
				null,
				key,
				this.handleScopedKeyboardGesture,
			);
		}
	}

	public getViewType(): string {
		return VIEW_TYPE_MIND_MAP;
	}

	public getDisplayText(): string {
		const translator = createObMindTranslator(
			this.host.getMindMapLanguage(),
		);
		const state = this.currentState;
		if (state !== null && "source" in state && state.source !== null) {
			return translator.t("view.title-for-file", {
				name: state.source.basename,
			});
		}

		return translator.t("view.title");
	}

	public getIcon(): string {
		return OBMIND_ICON_ID;
	}

	public refreshVisuals(): void {
		this.applyAppearanceMode();
		this.hydrateCurrentDocument();
		this.renderCurrentFrame();
	}

	/**
	 * Re-publishes chrome copy without rehydrating presentation annotations or
	 * changing the per-tab session. A frontend can preserve an active inline
	 * editor while replacing its static labels.
	 */
	public refreshLanguage(): void {
		this.renderCurrentFrame();
	}

	public refreshPersistedState(path: string): void {
		if (
			this.currentState?.status !== "ready" ||
			this.currentState.source.path !== path
		) {
			return;
		}
		if (this.activePresentationGesture !== null) {
			this.cancelPresentationPreview(
				this.activePresentationGesture.state.id,
			);
		}
		this.hydrateCurrentDocument();
		this.renderCurrentFrame();
	}

	public prepareForStructuralSourceChange(path: string): void {
		if (this.currentFilePath === path) {
			this.session.prepareForStructuralSourceChange();
		}
	}

	public setViewActive(active: boolean): void {
		this.viewActive = active;
		this.frontend?.execute({
			type: "set-view-active",
			active,
		});
	}

	public releaseResources(): void {
		if (this.resourcesReleased) {
			return;
		}

		this.resourcesReleased = true;
		this.setViewActive(false);
		this.flushViewportPersistence();
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.host.unregisterMindMapView(this);
		this.frontend?.destroy();
		this.frontend = null;
		this.currentState = null;
		this.currentFilePath = null;
		this.structuralEditInFlight = false;
		this.activePresentationGesture = null;
		this.session.resetAll();
		this.contentEl.classList.remove(
			"obmind-appearance-light",
			"obmind-appearance-dark",
			"theme-light",
			"theme-dark",
		);
		delete this.contentEl.dataset.obmindAppearance;
		this.contentEl.removeClass("obmind-view");
		this.contentEl.empty();
	}

	protected onOpen(): Promise<void> {
		this.resourcesReleased = false;
		this.contentEl.empty();
		this.contentEl.addClass("obmind-view");
		this.applyAppearanceMode();

		this.frontend = this.host.createMindMapFrontend(
			this.handleFrontendEvent,
		);
		this.frontend.mount(this.contentEl);
		this.frontend.execute({
			type: "set-view-active",
			active: this.viewActive,
		});

		this.host.registerMindMapView(this);
		this.unsubscribe = this.host.subscribeMindMapState((state) => {
			this.renderState(state);
		});

		return Promise.resolve();
	}

	protected onClose(): Promise<void> {
		this.releaseResources();
		return Promise.resolve();
	}

	private applyAppearanceMode(): void {
		const appearanceMode = this.host.getMindMapAppearanceMode();
		const forceLight = appearanceMode === "light";
		const forceDark = appearanceMode === "dark";
		this.contentEl.classList.toggle(
			"obmind-appearance-light",
			forceLight,
		);
		this.contentEl.classList.toggle(
			"obmind-appearance-dark",
			forceDark,
		);
		this.contentEl.classList.toggle("theme-light", forceLight);
		this.contentEl.classList.toggle("theme-dark", forceDark);
		this.contentEl.dataset.obmindAppearance = appearanceMode;
	}

	private renderState(state: MindMapViewState): void {
		const previousState = this.currentState;
		const nextFilePath =
			"source" in state && state.source !== null
				? state.source.path
				: null;
		const fileChanged = this.currentFilePath !== nextFilePath;
		const directionChanged =
			previousState !== null &&
			previousState.direction !== state.direction;
		const sourceRevisionChanged =
			previousState?.status === "ready" &&
			state.status === "ready" &&
			previousState.document.sourceRevision !==
				state.document.sourceRevision;
		if (
			this.activePresentationGesture !== null &&
			(fileChanged || state.status !== "ready" || sourceRevisionChanged)
		) {
			this.restoreActivePresentationPreview();
		}

		this.currentState = state;
		this.currentFilePath = nextFilePath;

		if (state.status !== "ready") {
			if (
				fileChanged ||
				state.status === "idle" ||
				state.status === "unsupported" ||
				state.status === "error"
			) {
				if (fileChanged) {
					this.session.resetForSource();
				} else {
					this.session.resetInteraction();
				}
			}
		} else if (fileChanged) {
			this.flushViewportPersistence();
			this.session.resetForSource();
		} else {
			if (previousState?.status === "ready") {
				this.session.reconcileDocument(
					previousState.document,
					state.document,
				);
			}
			if (
				directionChanged &&
				this.session.getPresentationOverride() === null
			) {
				this.clearViewportForGeometryChange();
			}
		}
		if (
			state.status === "ready" &&
			(fileChanged ||
				previousState?.status !== "ready" ||
				previousState.document.sourceRevision !==
					state.document.sourceRevision)
		) {
			this.hydrateCurrentDocument(state);
		}

		this.renderCurrentFrame();
	}

	private hydrateCurrentDocument(
		state: MindMapViewState | null = this.currentState,
	): void {
		if (state?.status !== "ready") {
			return;
		}
		const basePresentation = this.host.createMindMapPresentation(state);
		const hydrated = this.host.hydrateMindMapDocumentState(
			state.document,
			basePresentation,
		);
		this.session.hydrateDocumentState(
			hydrated.presentationOverride,
			hydrated.collapsedNodeIds,
			hydrated.viewport,
		);
	}

	private renderCurrentFrame(): void {
		const state = this.currentState;
		if (state === null || this.frontend === null) {
			return;
		}

		this.frontend.update({
			document: toFrontendDocumentState(state),
			language: this.host.getMindMapLanguage(),
			appearanceMode: this.host.getMindMapAppearanceMode(),
			colorScheme: this.resolveColorScheme(),
			presentation: this.getEffectivePresentation(state),
			interaction: this.session.getInteractionState(),
			capabilities: this.host.getMindMapFrontendCapabilities(),
			topicCommandAvailability:
					this.host.getMindMapTopicCommandAvailability(
						state.status === "ready"
							? {
									path: state.source.path,
									sourceRevision:
										state.document.sourceRevision,
								}
							: null,
				),
		});
	}

	private resolveColorScheme(): MindMapColorScheme {
		const appearanceMode = this.host.getMindMapAppearanceMode();
		const themeHost = this.contentEl.closest<HTMLElement>(
			".theme-light, .theme-dark",
		);
		const hostColorScheme =
			themeHost?.classList.contains("theme-light") === true
				? "light"
				: "dark";
		return resolveMindMapColorScheme(
			appearanceMode,
			hostColorScheme,
		);
	}

	private t(
		key: ObMindTranslationKey,
		values?: ObMindTranslationValues,
	): string {
		return createObMindTranslator(this.host.getMindMapLanguage()).t(
			key,
			values,
		);
	}

	private getEffectivePresentation(
		state: MindMapViewState,
	): MindMapPresentation {
		return (
			this.session.getViewPresentationOverride() ??
			this.session.getDocumentPresentationOverride() ??
			this.host.createMindMapPresentation(state)
		);
	}

	private readonly handleScopedKeyboardGesture = (
		event: KeyboardEvent,
	): false | void => {
		const target = event.target;
		if (
			this.frontend === null ||
			target === null ||
			!this.contentEl.contains(target as Node)
		) {
			return;
		}

		const handled = this.frontend.execute({
			type: "keyboard-gesture",
			gesture: {
				altKey: event.altKey,
				ctrlKey: event.ctrlKey,
				isComposing: event.isComposing,
				key: event.key,
				metaKey: event.metaKey,
				repeat: event.repeat,
				shiftKey: event.shiftKey,
			},
		});
		if (!handled) {
			return;
		}

		event.stopImmediatePropagation();
		return false;
	};

	private readonly handleFrontendEvent: MindMapFrontendEventSink = async (
		event: MindMapFrontendEvent,
	): Promise<void> => {
		switch (event.type) {
			case "change-appearance":
				await this.host.setAppearanceMode(event.appearanceMode);
				return;
			case "change-language":
				await this.host.setMindMapLanguage(event.language);
				return;
			case "navigate-to-source":
				await this.host.navigateToSource(event.source);
				return;
			case "toggle-node":
				await this.toggleNode(event.nodeId);
				return;
			case "toggle-task":
				await this.toggleTask(event.nodeId, event.sourceSnapshot);
				return;
			case "reveal-node":
				await this.revealNode(event.nodeId);
				return;
			case "open-node-link":
				await this.host.openMindMapLink(event.sourcePath, event.link);
				return;
			case "edit-node-text":
				await this.editNodeText(
					event.nodeId,
					event.expectedText,
					event.sourceSnapshot,
					event.text,
					event.continuation,
				);
				return;
			case "create-node":
				await this.createNode(
					event.nodeId,
					event.relation,
					event.sourceSnapshot,
				);
				return;
			case "move-node":
				await this.moveNode(
					event.sourceNodeId,
					event.targetNodeId,
					event.placement,
					event.sourceSnapshot,
					event.targetSnapshot,
				);
				return;
			case "execute-topic-command":
				await this.executeTopicCommand(event);
				return;
			case "expand-all":
				await this.expandAll();
				return;
			case "collapse-all":
				await this.collapseAll();
				return;
			case "change-layout": {
				if (event.scope === "default") {
					await this.applyDefaultLayoutChange(event.layout);
					return;
				}
				const current = this.getPresentationForScope(event.scope);
				await this.applyPresentationChange(
					{
						...current,
						revision: current.revision + 1,
						layout: event.layout,
					},
					event.scope,
					["layout", "viewport"],
				);
				return;
			}
			case "change-style": {
				if (event.scope === "default") {
					await this.applyDefaultStyleChange(event.styleId);
					return;
				}
				const current = this.getPresentationForScope(event.scope);
				const changed = applyMindMapPresentationPatch(
					current,
					{ styleId: event.styleId },
					{ capabilities: this.host.getMindMapFrontendCapabilities() },
				);
				await this.applyPresentationChange(
					changed,
					event.scope,
					["style", "viewport"],
				);
				return;
			}
			case "change-palette": {
				if (event.scope === "default") {
					await this.applyDefaultPaletteChange(event.paletteId);
					return;
				}
				const current = this.getPresentationForScope(event.scope);
				const changed = applyMindMapPresentationPatch(
					current,
					{ paletteId: event.paletteId },
					{ capabilities: this.host.getMindMapFrontendCapabilities() },
				);
				await this.applyPresentationChange(
					changed,
					event.scope,
					["palette"],
					"preserve",
				);
				return;
			}
			case "change-global-font": {
				const current = this.getPresentationForScope(event.scope);
				const changed = applyMindMapPresentationPatch(
					current,
					{ fontFamilyId: event.fontFamilyId },
					{ capabilities: this.host.getMindMapFrontendCapabilities() },
				);
				await this.applyPresentationChange(
					changed,
					event.scope,
					["font-family", "viewport"],
					"clear",
				);
				return;
			}
			case "change-connector-width": {
				const current = this.getPresentationForScope(event.scope);
				const changed = applyMindMapPresentationPatch(
					current,
					{ connectorWidthId: event.connectorWidthId },
					{ capabilities: this.host.getMindMapFrontendCapabilities() },
				);
				await this.applyPresentationChange(
					changed,
					event.scope,
					["connector-width"],
					"preserve",
				);
				return;
			}
			case "change-connector-profile": {
				const current = this.getPresentationForScope(event.scope);
				const changed = applyMindMapPresentationPatch(
					current,
					{ connectorProfileId: event.connectorProfileId },
					{ capabilities: this.host.getMindMapFrontendCapabilities() },
				);
				await this.applyPresentationChange(
					changed,
					event.scope,
					["connector-profile"],
					"preserve",
				);
				return;
			}
			case "replace-presentation": {
				const current = this.getPresentationForScope(event.scope);
				await this.applySemanticPresentationPatch(
					createMindMapPresentationPatch(current, event.presentation),
					event.scope,
					this.t("history.replace-presentation"),
				);
				return;
			}
			case "apply-presentation-patch":
				await this.applySemanticPresentationPatch(
					event.patch,
					event.scope,
					event.label,
				);
				return;
			case "preview-presentation-patch":
				this.previewPresentationPatch(
					event.gestureId,
					event.patch,
					event.label,
				);
				return;
			case "commit-presentation-preview":
				await this.commitPresentationPreview(event.gestureId);
				return;
			case "cancel-presentation-preview":
				this.cancelPresentationPreview(event.gestureId);
				return;
			case "manage-presentation-library": {
				const result =
					await this.host.executeMindMapPresentationLibraryCommand(
						event.command,
					);
				if (result.outcome === "stale") {
					// The host has left the library untouched. Rebuild this frame from
					// its authoritative registry before asking the frontend to discard
					// the old draft and explain the recoverable conflict.
					this.renderCurrentFrame();
					this.frontend?.execute({
						type: "presentation-library-conflict",
						conflict: result.conflict,
					});
					return;
				}
				if (result.selectedStyleId !== undefined) {
					await this.applySemanticPresentationPatch(
						{ styleId: result.selectedStyleId },
						"document",
						this.t("history.create-custom-style"),
					);
				}
				if (result.selectedPaletteId !== undefined) {
					await this.applySemanticPresentationPatch(
						{ paletteId: result.selectedPaletteId },
						"document",
						this.t("history.create-custom-palette"),
					);
				}
				return;
			}
			case "presentation-history":
				await this.restorePresentationHistory(event.direction);
				return;
			case "fit-view":
				this.frontend?.execute({ type: "fit-view" });
				return;
			case "change-focus-root": {
				const state = this.currentState;
				if (
					state?.status === "ready" &&
					this.session.setFocusRoot(
						state.document.root,
						event.nodeId,
					)
				) {
					this.renderCurrentFrame();
				}
				return;
			}
			case "change-visible-depth":
				if (this.session.setVisibleDepthLimit(event.depth)) {
					this.renderCurrentFrame();
				}
				return;
			case "change-minimap-visibility":
				if (this.session.setMinimapVisible(event.visible)) {
					this.renderCurrentFrame();
				}
				return;
			case "select-decoration":
				if (this.session.setSelectedDecoration(event.decorationId)) {
					this.renderCurrentFrame();
				}
				return;
			case "selection-change":
				this.session.setSelection(
					event.selectedNodeIds,
					event.primaryNodeId,
					event.anchorNodeId,
				);
				this.renderCurrentFrame();
				return;
			case "viewport-change":
				this.session.setViewport(event.viewport);
				this.scheduleViewportPersistence();
				return;
			case "focus-change":
				this.session.setFocusedNode(event.nodeId);
				this.renderCurrentFrame();
				return;
			case "hover-change":
				this.session.setHoveredNode(event.nodeId);
				this.renderCurrentFrame();
				return;
		}
	};

	private getCurrentPresentation(): MindMapPresentation {
		const state = this.currentState;
		if (state === null) {
			throw new Error("Mind map state is not available.");
		}
		return this.getEffectivePresentation(state);
	}

	private getCurrentDocumentPresentation(): MindMapPresentation {
		const state = this.currentState;
		if (state === null) {
			throw new Error("Mind map state is not available.");
		}
		return (
			this.session.getDocumentPresentationOverride() ??
			this.host.createMindMapPresentation(state)
		);
	}

	private getPresentationForScope(
		scope: Exclude<MindMapPresentationScope, "default">,
	): MindMapPresentation {
		return scope === "document"
			? this.getCurrentDocumentPresentation()
			: this.getCurrentPresentation();
	}

	private async applyDefaultLayoutChange(
		layout: MindMapLayoutSpec,
	): Promise<void> {
		await this.host.setDefaultMindMapLayout(layout);
		if (this.resourcesReleased) {
			return;
		}

		this.clearViewportForGeometryChange();
		this.session.updateEffectivePresentationOverride((override) => ({
			...override,
			revision: override.revision + 1,
			layout,
		}));
		this.renderCurrentFrame();
	}

	private async applyDefaultStyleChange(styleId: string): Promise<void> {
		const applied = await this.host.setDefaultMindMapStyle(styleId);
		const capabilities = this.host.getMindMapFrontendCapabilities();
		if (
			!applied ||
			this.resourcesReleased ||
			!capabilities.styles.some((style) => style.id === styleId)
		) {
			return;
		}

		const current = this.getCurrentPresentation();
		const changed = applyMindMapPresentationPatch(
			current,
			{ styleId },
			{ capabilities },
		);
		this.clearViewportForGeometryChange();
		this.session.updateEffectivePresentationOverride((override) => ({
			...override,
			revision: override.revision + 1,
			theme: changed.theme,
		}));
		this.renderCurrentFrame();
	}

	private async applyDefaultPaletteChange(paletteId: string): Promise<void> {
		const applied = await this.host.setDefaultMindMapPalette(paletteId);
		const capabilities = this.host.getMindMapFrontendCapabilities();
		if (
			!applied ||
			this.resourcesReleased ||
			!capabilities.palettes.some((palette) => palette.id === paletteId)
		) {
			return;
		}

		const current = this.getCurrentPresentation();
		const changed = applyMindMapPresentationPatch(
			current,
			{ paletteId },
			{ capabilities },
		);
		this.session.updateEffectivePresentationOverride((override) => ({
			...override,
			revision: override.revision + 1,
			theme: changed.theme,
		}));
		this.renderCurrentFrame();
	}

	private async applyPresentationChange(
		presentation: MindMapPresentation,
		scope: Exclude<MindMapPresentationScope, "default">,
		fields: readonly DocumentAnnotationField[],
		viewportPolicy: "clear" | "preserve" = "clear",
		label = this.t("history.change-presentation"),
	): Promise<void> {
		const validated = this.validatePresentationChange(
			presentation,
			this.getPresentationForScope(scope),
		);
		const previousDocumentOverride =
			this.session.getDocumentPresentationOverride();
		const previousDocumentPresentation =
			this.getCurrentDocumentPresentation();
		const previousViewOverride = this.session.getViewPresentationOverride();
		const previousViewport =
			this.session.getInteractionState().viewport;
		if (viewportPolicy === "clear") {
			this.clearViewportForGeometryChange();
		}
		if (scope === "view") {
			this.session.setViewPresentationOverride(validated);
		} else {
			this.session.setDocumentPresentationOverride(validated);
		}
		this.renderCurrentFrame();
		if (scope === "document") {
			try {
				await this.persistCurrentDocumentState(
					label,
					fields,
					{ previousPresentation: previousDocumentPresentation },
				);
			} catch (error: unknown) {
				this.session.setDocumentPresentationOverride(
					previousDocumentOverride,
				);
				this.session.setViewPresentationOverride(previousViewOverride);
				this.session.restoreViewport(previousViewport);
				this.renderCurrentFrame();
				throw error;
			}
		}
	}

	private async applySemanticPresentationPatch(
		patch: MindMapPresentationPatch,
		scope: Exclude<MindMapPresentationScope, "default">,
		label: string,
	): Promise<void> {
		const changed = applyMindMapPresentationPatch(
			this.getPresentationForScope(scope),
			patch,
			this.createPresentationPatchContext(),
		);
		const persistence = describePresentationPatchPersistence(patch);
		await this.applyPresentationChange(
			changed,
			scope,
			persistence.fields,
			persistence.viewportPolicy,
			label,
		);
	}

	private previewPresentationPatch(
		gestureId: string,
		patch: MindMapPresentationPatch,
		label: string,
	): void {
		if (
			this.activePresentationGesture !== null &&
			this.activePresentationGesture.state.id !== gestureId
		) {
			this.cancelPresentationPreview(
				this.activePresentationGesture.state.id,
			);
		}
		const adapter = this.createPresentationGestureAdapter();
		const active =
			this.activePresentationGesture ??
			{
				state: beginPresentationGesture(
					gestureId,
					this.getCurrentPresentation(),
					adapter,
				),
				previousViewOverride:
					this.session.getViewPresentationOverride(),
				previousViewport:
					this.session.getInteractionState().viewport,
				label,
			};
		const state = updatePresentationGesture(
			active.state,
			gestureId,
			patch,
			adapter,
		);
		this.activePresentationGesture = { ...active, state, label };
		if (
			describePresentationPatchPersistence(patch).viewportPolicy ===
			"clear"
		) {
			this.clearViewportForGeometryChange();
		}
		this.session.setViewPresentationOverride(state.preview);
		this.renderCurrentFrame();
	}

	private async commitPresentationPreview(gestureId: string): Promise<void> {
		const active = this.activePresentationGesture;
		if (active === null || active.state.id !== gestureId) {
			return;
		}
		const previewViewport = this.session.getInteractionState().viewport;
		this.session.restorePresentationPreviewBaseline(
			active.previousViewOverride,
			active.previousViewport,
		);
		const completed = (() => {
			try {
				return commitPresentationGesture(
					active.state,
					gestureId,
					this.getCurrentPresentation(),
					this.createPresentationGestureAdapter(),
				);
			} catch (error: unknown) {
				this.session.setViewPresentationOverride(active.state.preview);
				this.session.restoreViewport(previewViewport);
				this.renderCurrentFrame();
				throw error;
			}
		})();
		this.activePresentationGesture = null;
		const patch = createMindMapPresentationPatch(
			completed.before,
			completed.after,
		);
		const documentAfter = applyMindMapPresentationPatch(
			this.getCurrentDocumentPresentation(),
			patch,
			this.createPresentationPatchContext(),
		);
		const persistence = describePresentationPatchPersistence(patch);
		await this.applyPresentationChange(
			documentAfter,
			"document",
			persistence.fields,
			persistence.viewportPolicy,
			active.label,
		);
	}

	private cancelPresentationPreview(gestureId: string): void {
		if (this.restoreActivePresentationPreview(gestureId)) {
			this.renderCurrentFrame();
		}
	}

	private restoreActivePresentationPreview(
		expectedGestureId?: string,
	): boolean {
		const active = this.activePresentationGesture;
		if (
			active === null ||
			(expectedGestureId !== undefined &&
				active.state.id !== expectedGestureId)
		) {
			return false;
		}
		const cancelled = cancelPresentationGestureState(
			active.state,
			active.state.id,
			cloneMindMapPresentation,
		);
		void cancelled;
		this.activePresentationGesture = null;
		this.session.restorePresentationPreviewBaseline(
			active.previousViewOverride,
			active.previousViewport,
		);
		return true;
	}

	private createPresentationGestureAdapter(): PresentationGestureAdapter<
		MindMapPresentation,
		MindMapPresentationPatch
	> {
		const context = this.createPresentationPatchContext();
		return {
			clone: cloneMindMapPresentation,
			revision: (snapshot) => snapshot.revision,
			apply: (snapshot, patch) =>
				applyMindMapPresentationPatch(snapshot, patch, context),
		};
	}

	private validatePresentationChange(
		presentation: MindMapPresentation,
		baseline: MindMapPresentation,
	): MindMapPresentation {
		const state = this.currentState;
		if (state?.status !== "ready") {
			throw new Error("A Markdown document is required to change presentation.");
		}
		return applyMindMapPresentationPatch(
			baseline,
			createMindMapPresentationPatch(baseline, presentation),
			this.createPresentationPatchContext(),
		);
	}

	private createPresentationPatchContext(): {
		readonly capabilities: MindMapFrontendCapabilities;
		readonly nodeIds: ReadonlySet<string>;
		readonly edgeIds: ReadonlySet<string>;
	} {
		const state = this.currentState;
		if (state?.status !== "ready") {
			throw new Error("A Markdown document is required to change presentation.");
		}
		const nodeIds = new Set<string>();
		const edgeIds = new Set<string>();
		const pending: MindMapNode[] = [state.document.root];
		while (pending.length > 0) {
			const node = pending.pop();
			if (node === undefined) {
				continue;
			}
			nodeIds.add(node.id);
			for (const child of node.children) {
				edgeIds.add(createLayoutEdgeId(node.id, child.id));
				pending.push(child);
			}
		}
		return {
			capabilities: this.host.getMindMapFrontendCapabilities(),
			nodeIds,
			edgeIds,
		};
	}

	private async toggleNode(nodeId: string): Promise<void> {
		const root =
			this.currentState?.status === "ready"
				? this.currentState.document.root
				: null;
		const previousCollapsedNodeIds =
			this.session.getInteractionState().collapsedNodeIds;
		if (root === null || !this.session.toggleNode(root, nodeId)) {
			return;
		}
		this.renderCurrentFrame();
		await this.persistCurrentDocumentState(
			this.t("history.toggle-branch"),
			["collapsed"],
			{ previousCollapsedNodeIds },
		);
	}

	private async revealNode(nodeId: string): Promise<void> {
		const root =
			this.currentState?.status === "ready"
				? this.currentState.document.root
				: null;
		const previousCollapsedNodeIds =
			this.session.getInteractionState().collapsedNodeIds;
		if (root === null || !this.session.revealNode(root, nodeId)) {
			return;
		}
		this.renderCurrentFrame();
		this.frontend?.execute({
			type: "reveal-node",
			nodeId,
		});
		await this.persistCurrentDocumentState(
			this.t("history.reveal-topic"),
			["collapsed"],
			{ previousCollapsedNodeIds },
		);
	}

	private async toggleTask(
		nodeId: string,
		sourceSnapshot: MindMapNodeEditSnapshot,
	): Promise<void> {
		if (this.structuralEditInFlight) {
			throw new ObMindLocalizedError("error.operation-in-progress");
		}
		const state = this.currentState;
		if (
			state?.status !== "ready" ||
			sourceSnapshot.id !== nodeId ||
			sourceSnapshot.sourceRevision !== state.document.sourceRevision ||
			sourceSnapshot.source.path !== state.source.path
		) {
			throw new ObMindLocalizedError("error.stale-source");
		}

		this.structuralEditInFlight = true;
		try {
			const result = await this.host.toggleMindMapTask(sourceSnapshot);
			const latest = this.currentState;
			if (
				this.resourcesReleased ||
				latest?.status !== "ready" ||
				latest.document.sourceRevision !== result.document.sourceRevision ||
				latest.source.path !== result.document.root.source.path
			) {
				return;
			}
			this.session.setSelection(new Set([result.nodeId]), result.nodeId);
			this.renderCurrentFrame();
			this.frontend?.execute({
				type: "focus-node",
				nodeId: result.nodeId,
			});
		} finally {
			this.structuralEditInFlight = false;
		}
	}

	private async editNodeText(
		nodeId: string,
		expectedText: string,
		sourceSnapshot: MindMapNodeEditSnapshot,
		newText: string,
		continuation?: {
			readonly type: "create-node";
			readonly relation: "child" | "sibling";
		},
	): Promise<void> {
		if (
			sourceSnapshot.id !== nodeId ||
			sourceSnapshot.text !== expectedText
		) {
			throw new ObMindLocalizedError("error.stale-source");
		}

		const state = this.currentState;
		if (
			state?.status === "ready" &&
			state.source.path === sourceSnapshot.source.path
		) {
			const currentNode = findMindMapNode(
				state.document.root,
				nodeId,
			);
			if (
				currentNode === null ||
				currentNode.text !== expectedText
			) {
				throw new ObMindLocalizedError("error.stale-source");
			}
		}

		// A blur commit may arrive after the user has activated another file.
		// The immutable snapshot still identifies the original source, and the
		// host performs the authoritative current-content stale check there.
		if (continuation?.type !== "create-node") {
			await this.host.editMindMapNode(sourceSnapshot, newText);
			return;
		}

		if (this.structuralEditInFlight) {
			return;
		}

		this.structuralEditInFlight = true;
		try {
			const result = await runMindMapNodeEditWorkflow(
				{
					sourceSnapshot,
					newText,
					continuation,
				},
				{
					editNode: (snapshot, text) =>
						this.host.editMindMapNode(snapshot, text),
					createNode: (document, snapshot, createKind) =>
						this.host.createMindMapNode(
							document,
							snapshot,
							createKind,
						),
				},
			);
			if (
				result.creation !== null &&
				!this.resourcesReleased
			) {
				this.activateCreatedNode(result.creation);
			}
		} finally {
			this.structuralEditInFlight = false;
		}
	}

	private async createNode(
		nodeId: string,
		createKind: NodeCreateKind,
		sourceSnapshot: MindMapNodeEditSnapshot,
	): Promise<void> {
		if (this.structuralEditInFlight) {
			return;
		}

		const state = this.currentState;
		if (
			state?.status !== "ready" ||
			sourceSnapshot.id !== nodeId ||
			sourceSnapshot.sourceRevision !==
				state.document.sourceRevision ||
			sourceSnapshot.source.path !== state.source.path
		) {
			throw new ObMindLocalizedError("error.stale-source");
		}

		const currentNode = findMindMapNode(state.document.root, nodeId);
		if (
			currentNode === null ||
			currentNode.kind !== sourceSnapshot.kind ||
			currentNode.text !== sourceSnapshot.text ||
			currentNode.source.line !== sourceSnapshot.source.line ||
			currentNode.source.ch !== sourceSnapshot.source.ch
		) {
			throw new ObMindLocalizedError("error.stale-source");
		}

		await this.createNodeFromDocument(
			state.document,
			nodeId,
			createKind,
			sourceSnapshot,
		);
	}

	private async moveNode(
		sourceNodeId: string,
		targetNodeId: string,
		placement: NodeMovePlacement,
		sourceSnapshot: MindMapNodeEditSnapshot,
		targetSnapshot: MindMapNodeEditSnapshot,
	): Promise<void> {
		if (this.structuralEditInFlight) {
			throw new ObMindLocalizedError("error.operation-in-progress");
		}

		const state = this.currentState;
		if (
			state?.status !== "ready" ||
			sourceSnapshot.id !== sourceNodeId ||
			targetSnapshot.id !== targetNodeId ||
			sourceSnapshot.sourceRevision !==
				state.document.sourceRevision ||
			targetSnapshot.sourceRevision !==
				state.document.sourceRevision ||
			sourceSnapshot.source.path !== state.source.path ||
			targetSnapshot.source.path !== state.source.path
		) {
			throw new ObMindLocalizedError("error.stale-source");
		}

		const sourceNode = findMindMapNode(
			state.document.root,
			sourceNodeId,
		);
		const targetNode = findMindMapNode(
			state.document.root,
			targetNodeId,
		);
		if (
			sourceNode === null ||
			targetNode === null ||
			!nodeMatchesSourceSnapshot(sourceNode, sourceSnapshot) ||
			!nodeMatchesSourceSnapshot(targetNode, targetSnapshot)
		) {
			throw new ObMindLocalizedError("error.stale-source");
		}

		this.structuralEditInFlight = true;
		try {
			const moved = await this.host.moveMindMapNode(
				state.document,
				sourceSnapshot,
				targetSnapshot,
				placement,
			);
			if (!this.resourcesReleased) {
				this.activateMovedNode(moved);
			}
		} finally {
			this.structuralEditInFlight = false;
		}
	}

	private async executeTopicCommand(
		request: MindMapTopicCommandRequest,
	): Promise<void> {
		if (this.structuralEditInFlight) {
			throw new ObMindLocalizedError("error.operation-in-progress");
		}

		const state = this.currentState;
		if (
			state?.status !== "ready" ||
			state.document.sourceRevision !== request.sourceRevision
		) {
			throw new ObMindLocalizedError("error.stale-source");
		}

		this.structuralEditInFlight = true;
		try {
			const result = await this.host.executeMindMapTopicCommand(
				state.document,
				request,
			);
			if (this.resourcesReleased) {
				return;
			}
			this.applyTopicCommandResult(result);
		} finally {
			this.structuralEditInFlight = false;
		}
	}

	private applyTopicCommandResult(
		result: MindMapTopicCommandResult,
	): void {
		const latest = this.currentState;
		if (
			latest?.status !== "ready" ||
			!canActivateMindMapTopicCommandResult(
				latest.document,
				result,
			)
		) {
			// The host transaction already completed successfully. If another
			// file/source revision became active meanwhile, do not misreport
			// that committed write as a command failure; the controller owns
			// the newer frame and the result is simply no longer activatable.
			return;
		}

		const existingIds = new Set<string>();
		for (const nodeId of result.selectedNodeIds) {
			if (findMindMapNode(latest.document.root, nodeId) !== null) {
				existingIds.add(nodeId);
			}
		}
		const primaryNodeId =
			result.primaryNodeId !== null &&
			existingIds.has(result.primaryNodeId)
				? result.primaryNodeId
				: (existingIds.values().next().value ?? null);
		this.session.setSelection(
			existingIds,
			primaryNodeId,
			primaryNodeId,
		);
		this.renderCurrentFrame();

		if (
			result.beginEditNodeId !== null &&
			existingIds.has(result.beginEditNodeId)
		) {
			this.frontend?.execute({
				type: "begin-node-edit",
				nodeId: result.beginEditNodeId,
			});
		} else if (primaryNodeId !== null) {
			this.frontend?.execute({
				type: "focus-node",
				nodeId: primaryNodeId,
			});
		}
	}

	private async createNodeFromDocument(
		document: MindMapDocument,
		nodeId: string,
		createKind: NodeCreateKind,
		sourceSnapshot: MindMapNodeEditSnapshot,
	): Promise<void> {
		if (this.structuralEditInFlight) {
			return;
		}

		this.structuralEditInFlight = true;
		try {
			const created = await this.host.createMindMapNode(
				document,
				sourceSnapshot,
				createKind,
			);
			if (!this.resourcesReleased) {
				this.activateCreatedNode(created);
			}
		} finally {
			this.structuralEditInFlight = false;
		}
	}

	private activateCreatedNode(created: MindMapNodeCreationResult): void {
		const latest = this.currentState;
		if (
			latest?.status !== "ready" ||
			latest.source.path !== created.source.path
		) {
			return;
		}
		const createdNode = findMindMapNode(
			latest.document.root,
			created.nodeId,
		);
		if (
			createdNode === null ||
			createdNode.source.line !== created.source.line
		) {
			throw new ObMindLocalizedError("error.verification-failed");
		}

		this.session.setSelection(
			new Set([created.nodeId]),
			created.nodeId,
		);
		this.renderCurrentFrame();
		this.frontend?.execute({
			type: "begin-node-edit",
			nodeId: created.nodeId,
		});
	}

	private activateMovedNode(moved: MindMapNodeMoveResult): void {
		const latest = this.currentState;
		if (
			latest?.status !== "ready" ||
			latest.source.path !== moved.source.path
		) {
			return;
		}
		const movedNode = findMindMapNode(
			latest.document.root,
			moved.nodeId,
		);
		if (
			movedNode === null ||
			movedNode.source.line !== moved.source.line
		) {
			throw new ObMindLocalizedError("error.verification-failed");
		}

		this.session.setSelection(
			new Set([moved.nodeId]),
			moved.nodeId,
		);
		this.renderCurrentFrame();
		this.frontend?.execute({
			type: "focus-node",
			nodeId: moved.nodeId,
		});
	}

	private async expandAll(): Promise<void> {
		if (this.currentState?.status !== "ready") {
			return;
		}

		this.session.expandAll();
		this.renderCurrentFrame();
		this.frontend?.execute({ type: "fit-view" });
		await this.persistCurrentDocumentState(this.t("history.expand-all"), [
			"collapsed",
		]);
	}

	private async collapseAll(): Promise<void> {
		if (this.currentState?.status !== "ready") {
			return;
		}

		this.session.collapseAll(this.currentState.document.root);
		this.renderCurrentFrame();
		this.frontend?.execute({ type: "fit-view" });
		await this.persistCurrentDocumentState(this.t("history.collapse-all"), [
			"collapsed",
		]);
	}

	private async persistCurrentDocumentState(
		label: string,
		fields: readonly DocumentAnnotationField[],
		baseline: DocumentPersistenceBaseline = {},
	): Promise<void> {
		const state = this.currentState;
		if (state?.status !== "ready") {
			return;
		}
		await this.host.persistMindMapDocumentState(
			this.createDocumentPersistenceRequest(
				state,
				label,
				fields,
				baseline,
			),
		);
	}

	private async restorePresentationHistory(
		direction: "undo" | "redo",
	): Promise<void> {
		const state = this.currentState;
		if (state?.status !== "ready") {
			return;
		}
		await this.host.restoreMindMapDocumentPresentation(
			state.document,
			direction,
		);
	}

	private createDocumentPersistenceRequest(
		state: Extract<MindMapViewState, { readonly status: "ready" }>,
		label: string,
		fields: readonly DocumentAnnotationField[],
		baseline: DocumentPersistenceBaseline = {},
	): MindMapDocumentStatePersistenceRequest {
		const basePresentation = this.host.createMindMapPresentation(state);
		return {
			document: state.document,
			basePresentation,
			presentation:
				this.session.getDocumentPresentationOverride() ??
				basePresentation,
			interaction: this.session.getInteractionState(),
			label,
			fields: [...fields],
			...(baseline.previousPresentation === undefined
				? {}
				: {
						previousPresentation:
							cloneMindMapPresentation(
								baseline.previousPresentation,
							),
					}),
			...(baseline.previousCollapsedNodeIds === undefined
				? {}
				: {
						previousCollapsedNodeIds: new Set(
							baseline.previousCollapsedNodeIds,
						),
					}),
		};
	}

	private scheduleViewportPersistence(): void {
		const state = this.currentState;
		const timerWindow = this.contentEl.ownerDocument.defaultView;
		if (state?.status !== "ready" || timerWindow === null) {
			return;
		}
		if (this.pendingViewportPersistence !== null) {
			this.pendingViewportPersistence.timerWindow.clearTimeout(
				this.pendingViewportPersistence.timer,
			);
		}
		const request = this.createDocumentPersistenceRequest(
			state,
			this.t("history.change-viewport"),
			["viewport"],
		);
		const timer = timerWindow.setTimeout(() => {
			if (this.pendingViewportPersistence?.timer !== timer) {
				return;
			}
			this.pendingViewportPersistence = null;
			void this.host.persistMindMapDocumentState(request).catch(() => {
				// The host owns persistence notices and recovery.
			});
		}, VIEWPORT_PERSISTENCE_DEBOUNCE_MS);
		this.pendingViewportPersistence = {
			timer,
			timerWindow,
			request,
		};
	}

	private flushViewportPersistence(): void {
		const pending = this.pendingViewportPersistence;
		if (pending === null) {
			return;
		}
		pending.timerWindow.clearTimeout(pending.timer);
		this.pendingViewportPersistence = null;
		void this.host
			.persistMindMapDocumentState(pending.request)
			.catch(() => {
				// The host owns persistence notices and recovery.
			});
	}

	private clearViewportForGeometryChange(): void {
		const pending = this.pendingViewportPersistence;
		if (pending !== null) {
			// Do not flush an old pan/zoom snapshot after a font, style, or
			// layout change has deliberately invalidated that geometry.
			pending.timerWindow.clearTimeout(pending.timer);
			this.pendingViewportPersistence = null;
		}
		this.session.clearViewport();
	}
}

function describePresentationPatchPersistence(
	patch: MindMapPresentationPatch,
): {
	readonly fields: readonly DocumentAnnotationField[];
	readonly viewportPolicy: "clear" | "preserve";
} {
	const fields = new Set<DocumentAnnotationField>();
	let clearsViewport = false;
	if (patch.layout !== undefined) {
		fields.add("layout");
		clearsViewport = true;
	}
	if (patch.styleId !== undefined) {
		fields.add("style");
		clearsViewport = true;
	}
	if (patch.paletteId !== undefined) {
		fields.add("palette");
	}
	if (patch.fontFamilyId !== undefined) {
		fields.add("font-family");
		clearsViewport = true;
	}
	if (patch.connectorWidthId !== undefined) {
		fields.add("connector-width");
	}
	if (patch.connectorProfileId !== undefined) {
		fields.add("connector-profile");
	}
	if (patch.nodes !== undefined) {
		fields.add("nodes");
		clearsViewport ||= nodePresentationPatchAffectsGeometry(patch.nodes);
	}
	if (patch.edges !== undefined) {
		fields.add("edges");
	}
	if (patch.decorations !== undefined) {
		fields.add("decorations");
	}
	if (clearsViewport) {
		fields.add("viewport");
	}
	return {
		fields: [...fields],
		viewportPolicy: clearsViewport ? "clear" : "preserve",
	};
}

function nodePresentationPatchAffectsGeometry(
	nodes: NonNullable<MindMapPresentationPatch["nodes"]>,
): boolean {
	const colorOnlyKeys = new Set([
		"fill",
		"stroke",
		"textColor",
		"branchColorIndex",
	]);
	for (const presentation of nodes.values()) {
		if (presentation === null) {
			return true;
		}
		if (
			Object.keys(presentation).some((key) => !colorOnlyKeys.has(key))
		) {
			return true;
		}
	}
	return false;
}

function findMindMapNode(
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

function nodeMatchesSourceSnapshot(
	node: MindMapNode,
	snapshot: MindMapNodeEditSnapshot,
): boolean {
	if (
		node.id !== snapshot.id ||
		node.kind !== snapshot.kind ||
		node.text !== snapshot.text ||
		node.source.path !== snapshot.source.path ||
		node.source.line !== snapshot.source.line ||
		node.source.ch !== snapshot.source.ch
	) {
		return false;
	}
	if (node.kind === "heading" && snapshot.kind === "heading") {
		return (
			node.level === snapshot.level &&
			node.sourceLine === snapshot.sourceLine
		);
	}
	if (node.kind === "list" && snapshot.kind === "list") {
		return (
			node.marker === snapshot.marker &&
			node.ordered === snapshot.ordered &&
			node.ordinal === snapshot.ordinal &&
			node.taskState === snapshot.taskState &&
			node.sourceLine === snapshot.sourceLine
		);
	}
	return node.kind === "root" && snapshot.kind === "root";
}

function toFrontendDocumentState(
	state: MindMapViewState,
): MindMapFrontendDocumentState {
	switch (state.status) {
		case "idle":
			return { status: "idle" };
		case "unsupported":
			return {
				status: "unsupported",
				source: state.source,
			};
		case "loading":
			return {
				status: "loading",
				source: state.source,
			};
		case "ready":
			return {
				status: "ready",
				source: state.source,
				document: state.document,
			};
		case "error":
			return {
				status: "error",
				source: state.source,
				message: state.message,
			};
	}
}
