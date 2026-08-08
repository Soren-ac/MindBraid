import type {
	ErrorMindMapViewState,
	IdleMindMapViewState,
	LoadingMindMapViewState,
	ReadyMindMapViewState,
	UnsupportedMindMapViewState,
} from "../application/controller";
import type { ObMindAppearanceMode } from "../application/config";
import type { ObMindLanguage } from "../i18n/i18n";
import type { MindMapExportCapabilities } from "../export/types";
import type {
	MindMapInlineLink,
	MindMapNodeEditSnapshot,
	MindMapNodeKind,
	SourceLocation,
} from "../core/model";
import type { NodeMovePlacement } from "../topic/mutation/node-move";
import {
	type MindMapEdgeRouting,
	type MindMapColorScheme,
	type MindMapConnectorProfileSpec,
	type MindMapConnectorWidthSpec,
	type MindMapDecoration,
	type MindMapFontFamilySpec,
	type MindMapInteractionState,
	type MindMapLayoutOrientation,
	type MindMapLayoutSpec,
	type MindMapNodeShape,
	type MindMapPaletteSpec,
	type MindMapPresentation,
	type MindMapStyleSpec,
	type MindMapViewportState,
} from "../presentation/presentation";
import type { MindMapRenderEffectCapability } from "../presentation/render-effects";
import type { MindMapAssetSpec } from "../presentation/assets";
import type { MindMapPresentationPatch } from "../presentation/presentation-patch";
import type { MindMapLargeMapGuardState } from "../layout/large-map-policy";
import type {
	MindMapPresentationHistoryAction,
	MindMapPresentationHistoryAvailability,
} from "../presentation/presentation-history";
import type {
	MindMapPresentationLibraryEntryRevision,
	MindMapPresentationLibraryPaletteDefinition,
	MindMapPresentationLibraryRevisionConflict,
	MindMapPresentationLibraryStyleDefinition,
} from "../presentation/presentation-library";
import type { MindMapKeyGesture } from "../topic/interaction/node-interaction";
import type {
	MindMapTopicCommand,
	MindMapTopicCommandRequest,
} from "../topic/interaction/topic-command";

export type MindMapPresentationScope = "view" | "document" | "default";

/** Resolves a persisted appearance preference against the host scheme. */
export function resolveMindMapColorScheme(
	appearanceMode: ObMindAppearanceMode,
	hostColorScheme: MindMapColorScheme,
): MindMapColorScheme {
	return appearanceMode === "system" ? hostColorScheme : appearanceMode;
}

export type MindMapFrontendDocumentState =
	| Omit<IdleMindMapViewState, "direction">
	| Omit<UnsupportedMindMapViewState, "direction">
	| Omit<LoadingMindMapViewState, "direction">
	| Omit<ReadyMindMapViewState, "direction">
	| Omit<ErrorMindMapViewState, "direction">;

export interface MindMapLayoutCapability {
	readonly engineId: string;
	readonly label: string;
	readonly orientations: readonly MindMapLayoutOrientation[];
	/**
	 * Orientations the host can persist when a frontend requests `default`
	 * scope.
	 */
	readonly defaultOrientations: readonly MindMapLayoutOrientation[];
	readonly supportsSpacing: boolean;
	readonly spacing?: Readonly<
		Record<
			keyof MindMapLayoutSpec["spacing"],
			{
				readonly label: string;
				readonly minimum: number;
				readonly maximum: number;
				readonly step: number;
			}
		>
	>;
	readonly options: readonly MindMapLayoutOptionCapability[];
}

interface BaseMindMapLayoutOptionCapability {
	readonly key: string;
	readonly label: string;
	readonly description?: string;
}

export type MindMapLayoutOptionCapability =
	| (BaseMindMapLayoutOptionCapability & {
			readonly type: "number";
			readonly defaultValue: number;
			readonly minimum?: number;
			readonly maximum?: number;
			readonly step?: number;
	  })
	| (BaseMindMapLayoutOptionCapability & {
			readonly type: "boolean";
			readonly defaultValue: boolean;
	  })
	| (BaseMindMapLayoutOptionCapability & {
			readonly type: "select";
			readonly defaultValue: string;
			readonly choices: readonly {
				readonly value: string;
				readonly label: string;
			}[];
	  });

export interface MindMapStyleCapability {
	readonly id: string;
	readonly label: string;
	readonly style: MindMapStyleSpec;
	readonly requiredEffectIds: readonly string[];
	/** Built-ins are immutable templates; user entries can be edited/deleted. */
	readonly origin: "built-in" | "user";
	readonly editable: boolean;
}

export interface MindMapPaletteCapability {
	readonly id: string;
	readonly label: string;
	readonly palette: MindMapPaletteSpec;
	/** Built-ins are immutable templates; user entries can be edited/deleted. */
	readonly origin: "built-in" | "user";
	readonly editable: boolean;
}

export type MindMapGlobalFontCapability = MindMapFontFamilySpec;

export type MindMapConnectorWidthCapability = MindMapConnectorWidthSpec;

export type MindMapConnectorProfileCapability = MindMapConnectorProfileSpec;

export type MindMapAssetCapability = MindMapAssetSpec;

export interface MindMapEditingCapabilities {
	readonly nodeKinds: readonly MindMapNodeKind[];
	readonly rootBehavior: "read-only" | "rename-file";
	readonly createChildFor: readonly MindMapNodeKind[];
	readonly createSiblingFor: readonly MindMapNodeKind[];
	readonly multiline: boolean;
	readonly textFormat: "plain-text" | "markdown";
}

export interface MindMapMovingCapabilities {
	/** Node kinds that can initiate an explicit branch move. */
	readonly movableNodeKinds: readonly Exclude<MindMapNodeKind, "root">[];
	/** Semantic destinations understood by the active host and frontend. */
	readonly placements: readonly NodeMovePlacement[];
	/** Whether before/after anchors can also change the source parent. */
	readonly siblingOrdering:
		| "same-parent-same-kind"
		| "cross-parent-same-kind";
	/** Whether a child drop appends or can target an exact child index. */
	readonly childPlacement: "append" | "indexed";
	/** Structural dragging always carries the complete parsed/source subtree. */
	readonly movesSubtree: boolean;
	/** The root is fixed but may accept a supported `child` drop. */
	readonly rootAcceptsChildren: boolean;
	/** Free-positioned topics are separate from structural Markdown moves. */
	readonly freePositioning: boolean;
	readonly dropPreview: {
		readonly states: readonly ["none", "invalid", "valid"];
		readonly destinationTopic: true;
		readonly connector: true;
		readonly siblingInsertionMarker: true;
		readonly geometryResolver: "injectable";
	};
}

export interface MindMapContentLayoutCapabilities {
	readonly strategyId: string;
	readonly strategyRevision: string | number;
	readonly roleAware: true;
	readonly adaptiveInlineSize: true;
	readonly wrapsUnbrokenText: true;
	readonly displayBlockOverflow: "grow";
	readonly editorBlockOverflow: "grow-then-scroll";
}

export interface MindMapDisclosureCapabilities {
	readonly trigger: "hover-focus";
	readonly placement: "outgoing-connection";
	readonly expandedIndicator: "dot";
	readonly collapsedBadge: "total-hidden-descendants";
	readonly orientations: readonly MindMapLayoutOrientation[];
}

export interface MindMapTopicEditingCapabilities {
	readonly commands: readonly MindMapTopicCommand[];
	readonly supportsMultiSelection: boolean;
	readonly supportsRangeSelection: boolean;
	readonly supportsMarqueeSelection: boolean;
	readonly keyboardNavigation: "orientation-aware";
	readonly clipboard: {
		readonly payloadVersion: number;
		readonly internalBranches: true;
		readonly writesPlainMarkdownToSystem: true;
		readonly readsExternalContent: false;
	};
	readonly history: {
		readonly scope: "plugin-session-per-document";
		readonly limit: number;
		readonly documentLimit: number;
		readonly staleSourcePolicy: "reject";
	};
	readonly stableIdentity: "metadata-free-conservative-locator";
}

export interface MindMapTopicCommandAvailability {
	readonly hasInternalClipboard: boolean;
	readonly hasUndoEntry: boolean;
	readonly hasRedoEntry: boolean;
	/**
	 * Host-derived explanations for unavailable commands. A frontend may add
	 * stricter document/selection reasons, but it must not claim a disabled
	 * command is available when the host has rejected it.
	 */
	readonly disabledReasons?: Readonly<
		Partial<Record<MindMapTopicCommand, string>>
	>;
}

export interface MindMapTopicCommandAvailabilitySource {
	readonly path: string;
	readonly sourceRevision: string;
}

/**
 * A discovery catalog for layout/style/palette panels. It prevents rich
 * frontends from hard-coding capabilities that the active host has not
 * registered.
 */
export interface MindMapFrontendCapabilities {
	readonly layouts: readonly MindMapLayoutCapability[];
	readonly defaultStyleId: string;
	readonly defaultPaletteId: string;
	readonly styles: readonly MindMapStyleCapability[];
	readonly palettes: readonly MindMapPaletteCapability[];
	readonly defaultGlobalFontId: string;
	readonly globalFonts: readonly MindMapGlobalFontCapability[];
	readonly defaultConnectorWidthId: string;
	readonly connectorWidths: readonly MindMapConnectorWidthCapability[];
	readonly defaultConnectorProfileId: string;
	readonly connectorProfiles: readonly MindMapConnectorProfileCapability[];
	readonly renderEffects: readonly MindMapRenderEffectCapability[];
	readonly nodeShapes: readonly MindMapNodeShape[];
	readonly edgeRoutings: readonly MindMapEdgeRouting[];
	readonly assets: readonly MindMapAssetCapability[];
	readonly renderedDecorations: readonly MindMapDecoration["kind"][];
	readonly supportsRichTextRuns: boolean;
	readonly supportsPerElementPresentation: boolean;
	readonly supportsViewportState: boolean;
	/** Read-only artifact formats and capture scopes exposed by this frontend. */
	readonly export: MindMapExportCapabilities;
	readonly contentLayout: MindMapContentLayoutCapabilities;
	readonly disclosure: MindMapDisclosureCapabilities;
	readonly editing: MindMapEditingCapabilities;
	readonly moving: MindMapMovingCapabilities;
	readonly topicEditing: MindMapTopicEditingCapabilities;
	readonly presentationLibrary: {
		readonly duplicateRegisteredStyles: true;
		readonly editUserStyles: true;
		readonly deleteUserStyles: true;
		readonly duplicateRegisteredPalettes: true;
		readonly editUserPalettes: true;
		readonly deleteUserPalettes: true;
	};
}

/**
 * Semantic authoring commands emitted by any replaceable frontend. Definitions
 * remain renderer-neutral, and the host/library boundary owns IDs, revisions,
 * validation, persistence, registry rebuilding, and fallback behavior.
 */
export type MindMapPresentationLibraryCommand =
	| {
			/** Creates a new entry from the source resolved by the serialized host. */
			readonly type: "duplicate-style";
			readonly sourceStyleId: string;
			readonly label: string;
	  }
	| {
			readonly type: "update-style";
			readonly styleId: string;
			/** Revision captured when the editable Style draft was created. */
			readonly expectedRevision: MindMapPresentationLibraryEntryRevision;
			readonly definition: MindMapPresentationLibraryStyleDefinition;
	  }
	| {
			readonly type: "delete-style";
			readonly styleId: string;
			/** Revision displayed when the destructive action was requested. */
			readonly expectedRevision: MindMapPresentationLibraryEntryRevision;
	  }
	| {
			/** Creates a new entry from the source resolved by the serialized host. */
			readonly type: "duplicate-palette";
			readonly sourcePaletteId: string;
			readonly label: string;
	  }
	| {
			readonly type: "update-palette";
			readonly paletteId: string;
			/** Revision captured when the editable Palette draft was created. */
			readonly expectedRevision: MindMapPresentationLibraryEntryRevision;
			readonly definition: MindMapPresentationLibraryPaletteDefinition;
	  }
	| {
			readonly type: "delete-palette";
			readonly paletteId: string;
			/** Revision displayed when the destructive action was requested. */
			readonly expectedRevision: MindMapPresentationLibraryEntryRevision;
	  };

/**
 * The host either applies one command or rejects an old draft without a
 * write. A conflict is normal optimistic-concurrency control, not a failed
 * persistence operation.
 */
export type MindMapPresentationLibraryCommandResult =
	| {
			readonly outcome: "applied";
			readonly selectedStyleId?: string;
			readonly selectedPaletteId?: string;
	  }
	| {
			readonly outcome: "stale";
			readonly conflict: MindMapPresentationLibraryRevisionConflict;
	  };

/**
 * One immutable frame supplied by the Obsidian ItemView to a frontend.
 *
 * Source-derived data (`document`), visual choices (`presentation`), and
 * per-tab interaction state (`interaction`) stay separate so appearance and UI
 * implementations never need to mutate the parsed Markdown tree.
 */
export interface MindMapFrontendFrame {
	readonly document: MindMapFrontendDocumentState;
	/** Global ObMind product language, independent of note contents. */
	readonly language: ObMindLanguage;
	/** Global ObMind chrome/canvas mode, independent of document style/palette. */
	readonly appearanceMode: ObMindAppearanceMode;
	/** Host-resolved scheme consumed by any replaceable renderer. */
	readonly colorScheme: MindMapColorScheme;
	readonly presentation: MindMapPresentation;
	readonly interaction: MindMapInteractionState;
	/**
	 * Optional during adapter upgrades. A current host supplies this only for a
	 * large source tree; a frontend must treat an omitted value as unguarded.
	 * The acknowledgement is per-tab session state, never persisted visual data.
	 */
	readonly largeMapGuard?: MindMapLargeMapGuardState | null;
	readonly capabilities: MindMapFrontendCapabilities;
	readonly topicCommandAvailability: MindMapTopicCommandAvailability;
	/**
	 * Document-local visual history. This is intentionally separate from topic
	 * command history, which changes Markdown source.
	 */
	readonly presentationHistoryAvailability: MindMapPresentationHistoryAvailability;
}

/**
 * User intents emitted by a frontend. The frontend has no Vault or settings
 * access; the host decides how navigation, persistence, and state changes are
 * performed.
 */
export type MindMapFrontendEvent =
	| {
			readonly type: "navigate-to-source";
			readonly source: SourceLocation;
	  }
	| {
			/** Changes the global ObMind appearance without mutating Markdown. */
			readonly type: "change-appearance";
			readonly appearanceMode: ObMindAppearanceMode;
	  }
	| {
			/** Changes product chrome language without mutating Markdown. */
			readonly type: "change-language";
			readonly language: ObMindLanguage;
	  }
	| {
			readonly type: "toggle-node";
			readonly nodeId: string;
	  }
	| {
			readonly type: "toggle-task";
			readonly nodeId: string;
			readonly sourceSnapshot: MindMapNodeEditSnapshot;
	  }
	| {
			readonly type: "reveal-node";
			readonly nodeId: string;
	  }
	| {
			/** Opens one source-derived local Markdown or wikilink through the host. */
			readonly type: "open-node-link";
			readonly sourcePath: string;
			readonly link: MindMapInlineLink;
	  }
	| {
			readonly type: "expand-all";
	  }
	| {
			readonly type: "collapse-all";
	  }
	| {
			/**
			 * Requests one explicit source edit. `expectedText` is the text
			 * from the immutable frame that opened the inline editor; the
			 * source snapshot contains the exact structural anchor that the
			 * host must validate before writing.
			 */
			readonly type: "edit-node-text";
			readonly nodeId: string;
			readonly expectedText: string;
			readonly sourceSnapshot: MindMapNodeEditSnapshot;
			readonly text: string;
			readonly continuation?: {
				readonly type: "create-node";
				readonly relation: "child" | "sibling";
			};
	  }
	| {
			readonly type: "create-node";
			readonly nodeId: string;
			readonly relation: "child" | "sibling";
			readonly sourceSnapshot: MindMapNodeEditSnapshot;
	  }
	| {
			/**
			 * Requests one structural Markdown move after a completed drop.
			 * Both immutable anchors come from the same rendered source
			 * revision; the host remains responsible for authoritative
			 * validation before writing.
			 */
			readonly type: "move-node";
			readonly sourceNodeId: string;
			readonly targetNodeId: string;
			readonly placement: NodeMovePlacement;
			readonly sourceSnapshot: MindMapNodeEditSnapshot;
			readonly targetSnapshot: MindMapNodeEditSnapshot;
	  }
	| ({
			readonly type: "execute-topic-command";
	  } & MindMapTopicCommandRequest)
	| {
			readonly type: "change-layout";
			readonly layout: MindMapLayoutSpec;
			readonly scope: MindMapPresentationScope;
	  }
	| {
			readonly type: "change-style";
			readonly styleId: string;
			readonly scope: MindMapPresentationScope;
	  }
	| {
			readonly type: "change-palette";
			readonly paletteId: string;
			readonly scope: MindMapPresentationScope;
	  }
	| {
			readonly type: "change-global-font";
			readonly fontFamilyId: string;
			/** Map-wide formatting is persisted for the current document. */
			readonly scope: "document";
	  }
	| {
			readonly type: "change-connector-width";
			readonly connectorWidthId: string;
			/** Map-wide formatting is persisted for the current document. */
			readonly scope: "document";
	  }
	| {
			readonly type: "change-connector-profile";
			readonly connectorProfileId: string;
			/** Map-wide connector geometry is persisted for the document. */
			readonly scope: "document";
	  }
	| {
			/**
			 * Replaces a view- or document-scoped snapshot, including sparse
			 * node/edge overrides and decorations. Plugin defaults use the
			 * dedicated layout/style/palette events because document formatting
			 * is intentionally not a default-setting axis.
			 */
			readonly type: "replace-presentation";
			readonly presentation: MindMapPresentation;
			readonly scope: Exclude<MindMapPresentationScope, "default">;
	  }
	| {
			/** Applies one capability-validated sparse visual change. */
			readonly type: "apply-presentation-patch";
			readonly patch: MindMapPresentationPatch;
			readonly scope: Exclude<MindMapPresentationScope, "default">;
			/** Locale-independent history metadata, translated by the active UI. */
			readonly action: MindMapPresentationHistoryAction;
	  }
	| {
			/** Begins or updates an ephemeral continuous-control preview. */
			readonly type: "preview-presentation-patch";
			readonly gestureId: string;
			readonly patch: MindMapPresentationPatch;
			/** Locale-independent history metadata committed with this gesture. */
			readonly action: MindMapPresentationHistoryAction;
	  }
	| {
			readonly type: "commit-presentation-preview";
			readonly gestureId: string;
	  }
	| {
			readonly type: "cancel-presentation-preview";
			readonly gestureId: string;
	  }
	| {
			readonly type: "manage-presentation-library";
			readonly command: MindMapPresentationLibraryCommand;
	  }
	| {
			/**
			 * Presentation history is independent from Markdown source history.
			 * A frontend must request it explicitly rather than reuse topic undo.
			 */
			readonly type: "presentation-history";
			readonly direction: "undo" | "redo";
	  }
	| {
			readonly type: "fit-view";
	  }
	| {
			readonly type: "change-focus-root";
			readonly nodeId: string | null;
	  }
	| {
		readonly type: "change-visible-depth";
		readonly depth: number | null;
	  }
	| {
		/** Explicitly opts the current tab into rendering every large-map node. */
		readonly type: "show-full-large-map";
	  }
	| {
			readonly type: "change-minimap-visibility";
			readonly visible: boolean;
	  }
	| {
			readonly type: "select-decoration";
			readonly decorationId: string | null;
	  }
	| {
			readonly type: "selection-change";
			readonly selectedNodeIds: ReadonlySet<string>;
			readonly primaryNodeId: string | null;
			readonly anchorNodeId: string | null;
	  }
	| {
			readonly type: "viewport-change";
			readonly viewport: MindMapViewportState;
	  }
	| {
			readonly type: "focus-change";
			readonly nodeId: string | null;
	  }
	| {
			readonly type: "hover-change";
			readonly nodeId: string | null;
	  };

/**
 * Imperative commands are deliberately small and renderer-agnostic. They are
 * useful for toolbar actions, search results, outline navigation, and future
 * accessibility controls without exposing DOM elements.
 */
export type MindMapFrontendCommand =
	| {
			readonly type: "fit-view";
	  }
	| {
			/** Grants one host view ownership of transient renderer interactions. */
			readonly type: "set-view-active";
			readonly active: boolean;
	  }
	| {
			readonly type: "focus-node";
			readonly nodeId: string;
	  }
	| {
			readonly type: "reveal-node";
			readonly nodeId: string;
	  }
	| {
			readonly type: "begin-node-edit";
			readonly nodeId: string;
	  }
	| {
			/**
			 * Routes an Obsidian-scoped key gesture into the active frontend.
			 * The frontend decides whether its canvas/editor currently owns
			 * the gesture, preserving the UI replacement boundary.
			 */
			readonly type: "keyboard-gesture";
			readonly gesture: MindMapKeyGesture;
	  }
	| {
			readonly type: "restore-viewport";
			readonly viewport: MindMapViewportState;
	  }
	| {
			/**
			 * A host rejected an old custom-style/palette draft and has refreshed the
			 * current capability frame. A frontend must not reapply it automatically;
			 * it may preserve a dirty local draft behind an explicit conflict action or
			 * reload the authoritative entry when no safe local target remains.
			 */
			readonly type: "presentation-library-conflict";
			readonly conflict: MindMapPresentationLibraryRevisionConflict;
	  };

export type MindMapFrontendEventSink = (
	event: MindMapFrontendEvent,
) => void | Promise<void>;

/**
 * Replace this interface to rebuild the complete functional UI, including the
 * toolbar, status messages, and canvas. The ItemView remains only a lifecycle
 * and state adapter.
 */
export interface MindMapFrontend {
	mount(container: HTMLElement): void;
	update(frame: MindMapFrontendFrame): void;
	execute(command: MindMapFrontendCommand): boolean;
	destroy(): void;
}

export interface MindMapViewActivityTarget {
	setViewActive(active: boolean): void;
}

/** Assigns transient interaction ownership to at most one host view. */
export function synchronizeMindMapViewActivity<
	T extends MindMapViewActivityTarget,
>(views: Iterable<T>, activeView: T | null): void {
	for (const view of views) {
		view.setViewActive(view === activeView);
	}
}

export interface MindMapFrontendFactory {
	create(eventSink: MindMapFrontendEventSink): MindMapFrontend;
}
