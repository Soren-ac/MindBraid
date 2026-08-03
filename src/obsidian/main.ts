import {
  addIcon,
  FileView,
  MarkdownView,
  Notice,
  normalizePath,
  Plugin,
  removeIcon,
  setIcon,
  TFile,
  type Command,
  type Editor,
  type MarkdownFileInfo,
  type WorkspaceLeaf,
} from "obsidian";

import { BasicMindMapFrontend } from "../ui/basic-frontend";
import { OBMIND_ICON_ID, OBMIND_ICON_SVG } from "../ui/branding";
import {
  applyCollapsedNodeIdDelta,
  captureDocumentAnnotations,
  cloneDocumentPresentationHistorySnapshot,
  createDocumentPresentationHistoryEntrySnapshots,
  createDocumentPresentationOverrideDelta,
  getDocumentAnnotationRecord,
  hydrateDocumentAnnotations,
  mergeDocumentAnnotationRecordFields,
  mergeDocumentAnnotationRecordPresentationOverrideDelta,
  migrateAnnotationStorePath,
  removeDocumentAnnotationRecord,
  replaceDocumentAnnotationAppearanceReferences,
  restoreDocumentPresentationHistorySnapshot,
  serializeAnnotationStore,
  selectDocumentPresentationAnnotationFields,
  upsertDocumentAnnotationRecord,
  type DocumentAnnotationRecord,
  type DocumentPresentationHistorySnapshot,
} from "../application/persistence/annotations";
import {
  DEFAULT_SETTINGS,
  isAppearanceMode,
  layoutDirectionForOrientation,
  normalizeLayoutSpacing,
  requireDefaultLayoutOrientation,
  type ObMindSettings,
  type ObMindAppearanceMode,
} from "../application/config";
import {
  createObMindTranslator,
  isObMindLanguage,
  ObMindLocalizedError,
  type ObMindLanguage,
  type ObMindTranslationKey,
  type ObMindTranslationValues,
} from "../i18n/i18n";
import { localizeMindMapFrontendCapabilities } from "../i18n/capability-i18n";
import {
  BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION,
  createBuiltInMindMapFrontendComposition,
  type BuiltInMindMapFrontendComposition,
} from "../application/composition/built-in-composition";
import {
  MindMapController,
  type MindMapSource,
  type MindMapTimerPort,
  type MindMapViewState,
  type MindMapViewStateListener,
} from "../application/controller";
import {
  type MindMapFrontendCapabilities,
  type MindMapFrontend,
  type MindMapFrontendEventSink,
  type MindMapPresentationLibraryCommand,
  type MindMapPresentationLibraryCommandResult,
  type MindMapTopicCommandAvailability,
  type MindMapTopicCommandAvailabilitySource,
  synchronizeMindMapViewActivity,
} from "../ui/frontend";
import {
  ExclusiveTaskQueue,
  ExclusiveTaskQueueClosedError,
} from "../application/queues/exclusive-task-queue";
import { BUILT_IN_MIND_MAP_LAYOUT_ENGINE_REGISTRY } from "../layout/layouts";
import type {
  LayoutOrientation,
  MindMapDocument,
  MindMapInlineLink,
  MindMapNode,
  MindMapNodeEditSnapshot,
  SourceLocation,
} from "../core/model";
import { isLocalMindMapLinkTarget } from "../core/link-target";
import {
  planNodeInsertionInContent,
  type NodeCreateKind,
  type NodeInsertionPlan,
} from "../topic/mutation/node-insert";
import {
  planNodeMoveInContent,
  type MindMapNodeMoveResult,
  type NodeMovePlacement,
  type NodeMovePlan,
} from "../topic/mutation/node-move";
import {
  createNodeClipboardPayload,
  planNodePasteInContent,
  type MindMapClipboardPayload,
} from "../topic/mutation/node-clipboard";
import { planNodeDeletionInContent } from "../topic/mutation/node-delete";
import {
  normalizeRootNodeName,
  planNodeTextEditInContent,
} from "../topic/mutation/node-edit";
import {
  createMindMapNodeLocator,
  resolveMindMapNodeLocator,
  type MindMapNodeLocator,
} from "../topic/node-identity";
import {
  indexMindMapNodes,
  findMindMapNodeAtLine,
} from "../topic/mutation/node-mutation";
import {
  planNodeParentInsertionInContent,
} from "../topic/mutation/node-parent";
import { planNodeTaskToggleInContent } from "../topic/mutation/node-task";
import { parseMarkdown } from "../core/parser";
import {
  createDefaultMindMapPresentation,
  type MindMapLayoutSpec,
  type MindMapLayoutSpacing,
  type MindMapPresentation,
} from "../presentation/presentation";
import {
  MindMapPresentationHistoryStore,
} from "../presentation/presentation-history";
import {
  applyAvailableMindMapPresentationThemeSelection,
  MindMapPresentationCompositionGeneration,
  reconcileDocumentPresentationPersistence,
  reconcileMindMapPresentationTheme,
} from "../application/persistence/presentation-persistence";
import {
  BUILT_IN_MIND_MAP_PRESENTATION_LIBRARY_VALIDATORS,
  createObMindPluginData,
  normalizeObMindPluginData,
  refreshObMindPluginDocumentAnnotations,
  SerializedObMindPluginDataStore,
  type ObMindPluginData,
} from "../application/persistence/plugin-data";
import {
  deleteMindMapPresentationLibraryPalette,
  deleteMindMapPresentationLibraryStyle,
  duplicateMindMapPresentationLibraryPalette,
  duplicateMindMapPresentationLibraryStyle,
  MindMapPresentationLibraryRevisionConflictError,
  replaceMindMapPresentationLibraryPalette,
  replaceMindMapPresentationLibraryStyle,
} from "../presentation/presentation-library";
import { createDomSvgMindMapRendererFactory } from "../ui/renderer";
import {
  SerialMutationQueue,
  SerialMutationQueueClosedError,
  type SerialStateMutation,
} from "../application/queues/serial-mutation-queue";
import {
  createMindMapMutationHistoryState,
  MindMapMutationHistoryStore,
  type MindMapMutationHistoryDirection,
} from "../application/history/mutation-history";
import { ObMindSettingTab } from "./settings";
import { readAuthoritativeMarkdownContent } from "../core/source-content";
import {
  createMindMapImportFilePicker,
  MindMapImportModal,
  type MindMapImportFilePicker,
} from "./import-modal";
import { BUILT_IN_MIND_MAP_IMPORT_REGISTRY } from "../import/built-in";
import { createImportedMarkdownNote } from "../import/commit";
import {
  createUniqueImportedNotePath,
  type MindMapMarkdownImportPlan,
} from "../import/markdown";
import {
  DEFAULT_MIND_MAP_IMPORT_LIMITS,
  MindMapImportError,
} from "../import/types";
import {
  MindMapView,
  VIEW_TYPE_MIND_MAP,
  type MindMapDocumentStatePersistenceRequest,
  type MindMapPersistedDocumentState,
  type MindMapViewHost,
} from "./view";
import type {
  MindMapNodeCreationResult,
  MindMapNodeEditResult,
} from "../topic/mutation/node-edit-workflow";
import type {
  MindMapTopicCommandRequest,
  MindMapTopicCommandResult,
} from "../topic/interaction/topic-command";

const MARKDOWN_VIEW_TYPE = "markdown";
const EDITOR_TRANSITION_DELAY_MS = 50;
const MIND_MAP_CONTROLLER_TIMER_PORT: MindMapTimerPort = {
  schedule(callback, delayMs) {
    let pending = true;
    const timer = window.setTimeout(() => {
      if (!pending) {
        return;
      }

      pending = false;
      callback();
    }, delayMs);

    return () => {
      if (!pending) {
        return;
      }

      pending = false;
      window.clearTimeout(timer);
    };
  },
};

interface PendingEditorRead {
  readonly timer: number;
  readonly timerWindow: Window;
  readonly resolve: () => void;
}

interface ContiguousSourceMutationPlan {
  readonly updatedContent: string;
  readonly replacementStartOffset: number;
  readonly replacementEndOffset: number;
  readonly replacementText: string;
}

interface AppliedSourceMutation<TPlan extends ContiguousSourceMutationPlan> {
  readonly beforeContent: string;
  readonly document: MindMapDocument;
  readonly plan: TPlan;
  readonly updatedContent: string;
}

interface RecordContentMutationRequest {
  readonly path: string;
  readonly beforeContent: string;
  readonly afterContent: string;
  readonly beforeDocument: MindMapDocument;
  readonly beforeNodeId: string | null;
  readonly afterDocument: MindMapDocument;
  readonly afterNodeId: string | null;
  readonly label: string;
}

export default class ObMindPlugin
  extends Plugin
  implements MindMapViewHost
{
  public settings: ObMindSettings = DEFAULT_SETTINGS;

  private mindMapController: MindMapController | null = null;
  private readonly liveViews = new Set<MindMapView>();
  private readonly pendingEditorReads = new Set<PendingEditorRead>();
  private defaultPresentation: MindMapPresentation | null = null;
  private defaultPresentationMutations:
    | SerialMutationQueue<MindMapPresentation>
    | null = null;
  private visualRevision = 1;
  private unloading = false;
  private pluginDataStore: SerializedObMindPluginDataStore | null = null;
  private persistenceFailureNotified = false;
  private readonly sourceMutationQueue = new ExclusiveTaskQueue();
  private readonly presentationPersistenceQueue = new ExclusiveTaskQueue();
  private readonly presentationCompositionGeneration =
    new MindMapPresentationCompositionGeneration();
  private readonly mutationHistories = new MindMapMutationHistoryStore();
  private readonly presentationHistories =
    new MindMapPresentationHistoryStore<DocumentPresentationHistorySnapshot>(
      cloneDocumentPresentationHistorySnapshot,
    );
  private nodeClipboard: MindMapClipboardPayload | null = null;
  private importFilePicker: MindMapImportFilePicker | null = null;
  private importModal: MindMapImportModal | null = null;
  private importCommitInFlight = false;
  private ribbonButton: HTMLElement | null = null;
  private openMindMapCommand: Command | null = null;
  private importMindMapCommand: Command | null = null;
  private settingTab: ObMindSettingTab | null = null;
  private frontendComposition: BuiltInMindMapFrontendComposition =
    BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION;
  private readonly localizedFrontendCapabilities = new Map<
    ObMindLanguage,
    MindMapFrontendCapabilities
  >();

  private get controller(): MindMapController {
    if (this.mindMapController === null) {
      throw new Error("MindBraid controller is not loaded");
    }

    return this.mindMapController;
  }

  public async onload(): Promise<void> {
    this.unloading = false;
    await this.loadPluginData();
    if (this.unloading) {
      return;
    }
    this.mindMapController = new MindMapController(
      this.settings.layoutDirection,
      { timerPort: MIND_MAP_CONTROLLER_TIMER_PORT },
    );
    this.resetDefaultPresentationQueue();

    addIcon(OBMIND_ICON_ID, OBMIND_ICON_SVG);
    this.register(() => removeIcon(OBMIND_ICON_ID));

    this.registerView(
      VIEW_TYPE_MIND_MAP,
      (leaf) => new MindMapView(leaf, this),
    );

    this.ribbonButton = this.addRibbonIcon(
      OBMIND_ICON_ID,
      this.t("ribbon.open-current-note"),
      async () => {
        await this.openMindMap();
      },
    );
    this.ribbonButton.classList.add("obmind-ribbon-button");

    this.openMindMapCommand = this.addCommand({
      id: "open-mind-map-for-current-note",
      name: this.t("command.open-current-note"),
      callback: async () => {
        await this.openMindMap();
      },
    });

    this.importMindMapCommand = this.addCommand({
      id: "import-mind-map-file",
      name: this.t("command.import-file"),
      callback: async () => {
        await this.importMindMapFile();
      },
    });

    this.refreshLocalizedPluginChrome();

    this.settingTab = new ObMindSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    this.registerWorkspaceEvents();

    this.app.workspace.onLayoutReady(() => {
      if (this.mindMapController === null) {
        return;
      }

      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile === null) {
        this.mindMapController.setIdle();
      } else {
        this.activateFile(activeFile);
      }
    });
  }

  public onunload(): void {
    this.unloading = true;
    this.sourceMutationQueue.close();
    this.presentationPersistenceQueue.close();
    this.mutationHistories.clear();
    this.presentationHistories.clear();
    this.nodeClipboard = null;
    this.importFilePicker?.cancel();
    this.importFilePicker = null;
    this.importModal?.forceClose();
    this.importModal = null;
    this.defaultPresentationMutations?.close();
    this.defaultPresentationMutations = null;
    this.pluginDataStore?.close();
    for (const pendingRead of this.pendingEditorReads) {
      pendingRead.timerWindow.clearTimeout(pendingRead.timer);
      pendingRead.resolve();
    }
    this.pendingEditorReads.clear();

    for (const view of [...this.liveViews]) {
      view.releaseResources();
    }
    this.mindMapController?.dispose();
    this.liveViews.clear();
    this.defaultPresentation = null;
    this.pluginDataStore = null;
    this.mindMapController = null;
    this.settingTab = null;
  }

  public registerMindMapView(view: MindMapView): void {
    this.liveViews.add(view);
    this.syncMindMapViewActivity(
      this.app.workspace.getActiveViewOfType(MindMapView),
    );
  }

  public unregisterMindMapView(view: MindMapView): void {
    this.liveViews.delete(view);
    if (!this.unloading) {
      this.syncMindMapViewActivity(
        this.app.workspace.getActiveViewOfType(MindMapView),
      );
    }
  }

  private syncMindMapViewActivity(
    activeView: MindMapView | null,
  ): void {
    synchronizeMindMapViewActivity(this.liveViews, activeView);
  }

  public subscribeMindMapState(
    listener: MindMapViewStateListener,
  ): () => void {
    return this.controller.subscribe(listener);
  }

  public createMindMapFrontend(
    eventSink: MindMapFrontendEventSink,
  ): MindMapFrontend {
    return new BasicMindMapFrontend(
      eventSink,
      createDomSvgMindMapRendererFactory({
        layoutEngines: BUILT_IN_MIND_MAP_LAYOUT_ENGINE_REGISTRY,
        effects: this.frontendComposition.effects,
        contentLayoutStrategy:
          this.frontendComposition.contentLayoutStrategy,
      }),
      setIcon,
    );
  }

  public getMindMapFrontendCapabilities(): MindMapFrontendCapabilities {
    const cached = this.localizedFrontendCapabilities.get(
      this.settings.language,
    );
    if (cached !== undefined) {
      return cached;
    }
    const localized = localizeMindMapFrontendCapabilities(
      this.frontendComposition.capabilities,
      this.settings.language,
    );
    this.localizedFrontendCapabilities.set(this.settings.language, localized);
    return localized;
  }

  public getMindMapAppearanceMode(): ObMindAppearanceMode {
    return this.settings.appearanceMode;
  }

  public getMindMapLanguage(): ObMindLanguage {
    return this.settings.language;
  }

  public getMindMapTopicCommandAvailability(
    source: MindMapTopicCommandAvailabilitySource | null,
  ): MindMapTopicCommandAvailability {
    const history =
      source === null
        ? undefined
        : this.mutationHistories.get(source.path);
    const hasInternalClipboard = this.nodeClipboard !== null;
    const hasUndoEntry =
        source !== null &&
        (history?.hasApplicableEntry(
          "undo",
          source.path,
          source.sourceRevision,
        ) ??
          false);
    const hasRedoEntry =
        source !== null &&
        (history?.hasApplicableEntry(
          "redo",
          source.path,
          source.sourceRevision,
        ) ??
          false);
    return {
      hasInternalClipboard,
      hasUndoEntry,
      hasRedoEntry,
      disabledReasons: {
        ...(!hasInternalClipboard
          ? {
              "paste-child": this.t("notice.clipboard-required"),
              "paste-sibling": this.t("notice.clipboard-required"),
            }
          : {}),
        ...(!hasUndoEntry
          ? { undo: this.t("notice.undo-unavailable") }
          : {}),
        ...(!hasRedoEntry
          ? { redo: this.t("notice.redo-unavailable") }
          : {}),
      },
    };
  }

  public createMindMapPresentation(
    state: MindMapViewState,
  ): MindMapPresentation {
    const presentation =
      this.defaultPresentation ??
      this.createConfiguredPresentation(state.direction);
    return {
      ...presentation,
      revision: presentation.revision + this.visualRevision,
    };
  }

  public hydrateMindMapDocumentState(
    document: MindMapDocument,
    basePresentation: MindMapPresentation,
  ): MindMapPersistedDocumentState {
    const pluginData = this.requirePluginDataStore().getSnapshot();
    const hydrated = hydrateDocumentAnnotations(
      pluginData.annotations,
      document,
      basePresentation,
      this.frontendComposition.capabilities,
    );
    if (
      serializeAnnotationStore(hydrated.store) !==
      serializeAnnotationStore(pluginData.annotations)
    ) {
      void this.presentationPersistenceQueue
        .run(async () => {
          await this.persistPluginDataMutation((data) =>
            refreshObMindPluginDocumentAnnotations(
              data,
              document,
              basePresentation,
              this.frontendComposition.capabilities,
            ),
          );
        })
        .catch(() => {
          // The shared persistence helper reports one user-facing notice.
        });
    }
    return {
      presentationOverride: hydrated.hasPresentationOverride
        ? hydrated.presentation
        : null,
      collapsedNodeIds: hydrated.collapsedNodeIds,
      viewport: hydrated.viewport,
    };
  }

  public async persistMindMapDocumentState(
    request: MindMapDocumentStatePersistenceRequest,
  ): Promise<void> {
    if (this.unloading) {
      return;
    }
    await this.presentationPersistenceQueue.run(async () => {
      const path = request.document.root.source.path;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (
        this.unloading ||
        !(file instanceof TFile) ||
        file.extension.toLowerCase() !== "md"
      ) {
        return;
      }

      const outcome: {
        committed:
          | {
              readonly before: DocumentAnnotationRecord | null;
              readonly after: DocumentAnnotationRecord;
            }
          | null;
      } = { committed: null };
      let committedFields = request.fields;
      await this.persistPluginDataMutation((data) => {
        const composition = createBuiltInMindMapFrontendComposition(
          data.presentationLibrary.styles,
          data.presentationLibrary.palettes,
        );
        const reconciled = reconcileDocumentPresentationPersistence(
          {
            basePresentation: request.basePresentation,
            presentation: request.presentation,
            ...(request.previousPresentation === undefined
              ? {}
              : { previousPresentation: request.previousPresentation }),
            fields: request.fields,
          },
          composition.themeComposition,
        );
        committedFields = reconciled.fields;
        const existing = getDocumentAnnotationRecord(
          data.annotations,
          path,
        );
        let collapsedNodeIds = request.interaction.collapsedNodeIds;
        if (
          reconciled.fields.includes("collapsed") &&
          request.previousCollapsedNodeIds !== undefined
        ) {
          const hydrated = hydrateDocumentAnnotations(
            data.annotations,
            request.document,
            reconciled.basePresentation,
            composition.capabilities,
          );
          collapsedNodeIds = applyCollapsedNodeIdDelta(
            hydrated.collapsedNodeIds,
            request.previousCollapsedNodeIds,
            request.interaction.collapsedNodeIds,
          );
        }
        const captured = captureDocumentAnnotations(
          request.document,
          reconciled.basePresentation,
          reconciled.presentation,
          collapsedNodeIds,
          request.interaction.viewport,
          existing,
        );
        const previousPresentation = reconciled.previousPresentation;
        const fineGrainedOverrideMerge =
          previousPresentation !== undefined &&
          (reconciled.fields.includes("nodes") ||
            reconciled.fields.includes("edges"));
        let next = mergeDocumentAnnotationRecordFields(
          existing,
          captured,
          fineGrainedOverrideMerge
            ? reconciled.fields.filter(
                (field) => field !== "nodes" && field !== "edges",
              )
            : reconciled.fields,
        );
        if (fineGrainedOverrideMerge && previousPresentation !== undefined) {
          const delta = createDocumentPresentationOverrideDelta(
            previousPresentation,
            reconciled.presentation,
          );
          next = mergeDocumentAnnotationRecordPresentationOverrideDelta(
            next,
            request.document,
            {
              nodes: reconciled.fields.includes("nodes")
                ? delta.nodes
                : new Map(),
              edges: reconciled.fields.includes("edges")
                ? delta.edges
                : new Map(),
            },
          );
        }
        if (JSON.stringify(existing) === JSON.stringify(next)) {
          return data;
        }
        outcome.committed = { before: existing, after: next };
        return createObMindPluginData(
          data.settings,
          upsertDocumentAnnotationRecord(data.annotations, next),
          data.presentationLibrary,
        );
      });
      if (
        outcome.committed === null ||
        this.unloading ||
        !(this.app.vault.getAbstractFileByPath(path) instanceof TFile)
      ) {
        return;
      }
      const historyFields = selectDocumentPresentationAnnotationFields(
        committedFields,
      );
      if (historyFields.length > 0) {
        const snapshots = createDocumentPresentationHistoryEntrySnapshots(
          request.document,
          outcome.committed.before,
          outcome.committed.after,
          historyFields,
        );
        this.presentationHistories.getOrCreate(path).record({
          before: snapshots.before,
          after: snapshots.after,
          label: request.label,
        });
      }
      for (const view of this.liveViews) {
        view.refreshPersistedState(path);
      }
    });
  }

  public async restoreMindMapDocumentPresentation(
    document: MindMapDocument,
    direction: "undo" | "redo",
  ): Promise<boolean> {
    if (this.unloading) {
      return false;
    }
    const path = document.root.source.path;
    return this.presentationPersistenceQueue.run(async () => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (
        this.unloading ||
        !(file instanceof TFile) ||
        file.extension.toLowerCase() !== "md"
      ) {
        return false;
      }
      const history = this.presentationHistories.get(path);
      const entry = history?.peek(direction) ?? null;
      if (history === undefined || entry === null) {
        return false;
      }
      const snapshot =
        direction === "undo" ? entry.before : entry.after;
      if (snapshot.path !== path) {
        history.clear();
        return false;
      }
      await this.persistPluginDataMutation((data) => {
        const existing = getDocumentAnnotationRecord(data.annotations, path);
        const restored = restoreDocumentPresentationHistorySnapshot(
          document,
          existing,
          snapshot,
        );
        const annotations =
          restored === null
            ? removeDocumentAnnotationRecord(data.annotations, path)
            : upsertDocumentAnnotationRecord(data.annotations, restored);
        return createObMindPluginData(
          data.settings,
          annotations,
          data.presentationLibrary,
        );
      });
      history.consume(direction);
      if (!this.unloading) {
        for (const view of this.liveViews) {
          view.refreshPersistedState(path);
        }
      }
      return true;
    });
  }

  public async setDefaultMindMapLayout(
    layout: MindMapLayoutSpec,
  ): Promise<void> {
    await this.enqueueDefaultPresentationMutation((presentation) => ({
      ...presentation,
      revision: presentation.revision + 1,
      layout,
    }));
  }

  public async setDefaultMindMapStyle(styleId: string): Promise<boolean> {
    if (!this.frontendComposition.themeComposition.styles.has(styleId)) {
      throw new Error(`Unknown mind-map style "${styleId}".`);
    }
    let applied = false;
    await this.enqueueDefaultPresentationMutation((presentation) => {
      const result = applyAvailableMindMapPresentationThemeSelection(
        presentation,
        { axis: "style", id: styleId },
        this.frontendComposition.themeComposition,
      );
      applied = result.applied;
      return result.presentation;
    });
    return applied && !this.unloading;
  }

  public async setDefaultMindMapPalette(paletteId: string): Promise<boolean> {
    if (!this.frontendComposition.themeComposition.palettes.has(paletteId)) {
      throw new Error(`Unknown mind-map palette "${paletteId}".`);
    }
    let applied = false;
    await this.enqueueDefaultPresentationMutation((presentation) => {
      const result = applyAvailableMindMapPresentationThemeSelection(
        presentation,
        { axis: "palette", id: paletteId },
        this.frontendComposition.themeComposition,
      );
      applied = result.applied;
      return result.presentation;
    });
    return applied && !this.unloading;
  }

  public async executeMindMapPresentationLibraryCommand(
    command: MindMapPresentationLibraryCommand,
  ): Promise<MindMapPresentationLibraryCommandResult> {
    return this.presentationPersistenceQueue.run(() =>
      this.executeMindMapPresentationLibraryCommandLocked(command),
    );
  }

  /**
   * Runs while the shared presentation queue is held. Keeping the library
   * transaction in a dedicated method avoids making its domain mutation code
   * depend on queue mechanics or an extra indentation level.
   */
  private async executeMindMapPresentationLibraryCommandLocked(
    command: MindMapPresentationLibraryCommand,
  ): Promise<MindMapPresentationLibraryCommandResult> {
    let result: MindMapPresentationLibraryCommandResult = {
      outcome: "applied",
    };
    let clearedPresentationLibraryEntry = false;
    try {
      await this.persistPluginDataMutation((data) => {
        const composition = createBuiltInMindMapFrontendComposition(
          data.presentationLibrary.styles,
          data.presentationLibrary.palettes,
        );
        switch (command.type) {
          case "duplicate-style": {
            const mutation = duplicateMindMapPresentationLibraryStyle(
              data.presentationLibrary,
              composition.themeComposition.styles.resolve(
                command.sourceStyleId,
              ),
              BUILT_IN_MIND_MAP_PRESENTATION_LIBRARY_VALIDATORS,
              command.label,
            );
            result = {
              outcome: "applied",
              selectedStyleId: mutation.entry.id,
            };
            return createObMindPluginData(
              data.settings,
              data.annotations,
              mutation.library,
            );
          }
          case "update-style": {
            const mutation = replaceMindMapPresentationLibraryStyle(
              data.presentationLibrary,
              command.styleId,
              {
                expectedRevision: command.expectedRevision,
                definition: command.definition,
              },
              BUILT_IN_MIND_MAP_PRESENTATION_LIBRARY_VALIDATORS,
            );
            return createObMindPluginData(
              data.settings,
              data.annotations,
              mutation.library,
            );
          }
          case "delete-style": {
            const deletion = deleteMindMapPresentationLibraryStyle(
              data.presentationLibrary,
              command.styleId,
              command.expectedRevision,
              DEFAULT_SETTINGS.styleId,
            );
            if (deletion.removed === null || deletion.fallback === null) {
              return data;
            }
            clearedPresentationLibraryEntry = true;
            return createObMindPluginData(
              data.settings,
              replaceDocumentAnnotationAppearanceReferences(
                data.annotations,
                {
                  kind: "style",
                  removedId: deletion.removed.id,
                  fallbackId: deletion.fallback.resolvedId,
                },
              ),
              deletion.library,
            );
          }
          case "duplicate-palette": {
            const mutation = duplicateMindMapPresentationLibraryPalette(
              data.presentationLibrary,
              composition.themeComposition.palettes.resolve(
                command.sourcePaletteId,
              ),
              BUILT_IN_MIND_MAP_PRESENTATION_LIBRARY_VALIDATORS,
              command.label,
            );
            result = {
              outcome: "applied",
              selectedPaletteId: mutation.entry.id,
            };
            return createObMindPluginData(
              data.settings,
              data.annotations,
              mutation.library,
            );
          }
          case "update-palette": {
            const mutation = replaceMindMapPresentationLibraryPalette(
              data.presentationLibrary,
              command.paletteId,
              {
                expectedRevision: command.expectedRevision,
                definition: command.definition,
              },
              BUILT_IN_MIND_MAP_PRESENTATION_LIBRARY_VALIDATORS,
            );
            return createObMindPluginData(
              data.settings,
              data.annotations,
              mutation.library,
            );
          }
          case "delete-palette": {
            const deletion = deleteMindMapPresentationLibraryPalette(
              data.presentationLibrary,
              command.paletteId,
              command.expectedRevision,
              DEFAULT_SETTINGS.paletteId,
            );
            if (deletion.removed === null || deletion.fallback === null) {
              return data;
            }
            clearedPresentationLibraryEntry = true;
            return createObMindPluginData(
              data.settings,
              replaceDocumentAnnotationAppearanceReferences(
                data.annotations,
                {
                  kind: "palette",
                  removedId: deletion.removed.id,
                  fallbackId: deletion.fallback.resolvedId,
                },
              ),
              deletion.library,
            );
          }
        }
      });
    } catch (error: unknown) {
      if (!(error instanceof MindMapPresentationLibraryRevisionConflictError)) {
        throw error;
      }
      result = { outcome: "stale", conflict: error.conflict };
    }

    if (this.unloading) {
      return result;
    }
    if (clearedPresentationLibraryEntry) {
      // History snapshots retain appearance IDs. Once a definition is removed,
      // no undo entry may resurrect that deleted reference into annotations.
      this.presentationHistories.clear();
    }
    const snapshot = this.requirePluginDataStore().getSnapshot();
    this.installFrontendComposition(
      snapshot.presentationLibrary.styles,
      snapshot.presentationLibrary.palettes,
    );
    this.settings = snapshot.settings;
    if (result.outcome === "applied") {
      // The shared queue provides the ordering guarantee: a default mutation
      // that was composed before this library revision sees a stale generation
      // and cannot publish its obsolete snapshot afterward.
      this.presentationCompositionGeneration.advance();
      this.resetDefaultPresentationQueue();
      this.visualRevision += 1;
    }
    this.refreshMindMapViews();
    return result;
  }

  public async setLayoutDirection(
    layoutDirection: LayoutOrientation,
  ): Promise<void> {
    await this.enqueueDefaultPresentationMutation((presentation) => ({
      ...presentation,
      revision: presentation.revision + 1,
      layout: {
        ...presentation.layout,
        revision: nextRevision(presentation.layout.revision),
        orientation: layoutDirection,
      },
    }));
  }

  public async setLayoutEngineId(layoutEngineId: string): Promise<void> {
    if (!BUILT_IN_MIND_MAP_LAYOUT_ENGINE_REGISTRY.has(layoutEngineId)) {
      throw new Error(`Unknown layout engine "${layoutEngineId}".`);
    }
    await this.enqueueDefaultPresentationMutation((presentation) => ({
      ...presentation,
      revision: presentation.revision + 1,
      layout: {
        ...presentation.layout,
        revision: nextRevision(presentation.layout.revision),
        engineId: layoutEngineId,
      },
    }));
  }

  public async setLayoutSpacing(
    spacing: MindMapLayoutSpacing,
  ): Promise<void> {
    const normalized = normalizeLayoutSpacing(spacing);
    await this.enqueueDefaultPresentationMutation((presentation) => ({
      ...presentation,
      revision: presentation.revision + 1,
      layout: {
        ...presentation.layout,
        revision: nextRevision(presentation.layout.revision),
        spacing: normalized,
      },
    }));
  }

  public async setStyleId(styleId: string): Promise<void> {
    await this.setDefaultMindMapStyle(styleId);
  }

  public async setPaletteId(paletteId: string): Promise<void> {
    await this.setDefaultMindMapPalette(paletteId);
  }

  public async setAppearanceMode(
    appearanceMode: unknown,
  ): Promise<void> {
    if (!isAppearanceMode(appearanceMode)) {
      throw new Error(
        `Unknown MindBraid appearance mode "${String(appearanceMode)}".`,
      );
    }
    await this.persistPluginDataMutation((data) =>
      createObMindPluginData(
        {
          ...data.settings,
          appearanceMode,
        },
        data.annotations,
        data.presentationLibrary,
      ),
    );
    if (this.unloading || this.mindMapController === null) {
      return;
    }

    this.settings = this.requirePluginDataStore().getSnapshot().settings;
    this.visualRevision += 1;
    this.refreshMindMapViews();
  }

  /**
   * Persists only global product chrome language. It intentionally leaves the
   * current document, presentation annotations, viewport, and interaction
   * state untouched.
   */
  public async setMindMapLanguage(language: ObMindLanguage): Promise<void> {
    if (!isObMindLanguage(language)) {
      throw new Error(`Unknown MindBraid language "${String(language)}".`);
    }
    if (language === this.settings.language) {
      return;
    }

    await this.persistPluginDataMutation((data) =>
      createObMindPluginData(
        {
          ...data.settings,
          language,
        },
        data.annotations,
        data.presentationLibrary,
      ),
    );
    if (this.unloading || this.mindMapController === null) {
      return;
    }

    this.settings = this.requirePluginDataStore().getSnapshot().settings;
    this.refreshLocalizedPluginChrome();
    this.refreshMindMapLanguages();
    this.importModal?.setLanguage(language);
    this.settingTab?.refreshLanguage();
  }

  private createConfiguredPresentation(
    orientation: LayoutOrientation,
  ): MindMapPresentation {
    const presentation = createDefaultMindMapPresentation(
      layoutDirectionForOrientation(orientation),
    );
    return {
      ...presentation,
      layout: {
        ...presentation.layout,
        engineId: this.settings.layoutEngineId,
        orientation,
        spacing: this.settings.layoutSpacing,
      },
      theme: this.frontendComposition.themeComposition.composeOrDefault(
        this.settings.styleId,
        this.settings.paletteId,
      ),
    };
  }

  private installFrontendComposition(
    styles: ObMindPluginData["presentationLibrary"]["styles"],
    palettes: ObMindPluginData["presentationLibrary"]["palettes"],
  ): void {
    this.frontendComposition = createBuiltInMindMapFrontendComposition(
      styles,
      palettes,
    );
    this.localizedFrontendCapabilities.clear();
  }

  private resetDefaultPresentationQueue(): void {
    this.defaultPresentationMutations?.close();
    this.defaultPresentation = this.createConfiguredPresentation(
      this.settings.layoutOrientation,
    );
    const compositionGeneration =
      this.presentationCompositionGeneration.capture();
    this.defaultPresentationMutations = new SerialMutationQueue(
      this.defaultPresentation,
      async (presentation) => {
        await this.persistDefaultPresentation(
          presentation,
          compositionGeneration,
        );
      },
    );
  }

  private async enqueueDefaultPresentationMutation(
    mutation: SerialStateMutation<MindMapPresentation>,
  ): Promise<void> {
    while (!this.unloading) {
      const queue = this.defaultPresentationMutations;
      if (queue === null) {
        return;
      }

      try {
        await queue.enqueue(
          mutation,
          (candidate) => this.normalizeDefaultPresentation(candidate),
        );
        return;
      } catch (error: unknown) {
        if (
          this.unloading &&
          (error instanceof SerialMutationQueueClosedError ||
            error instanceof ExclusiveTaskQueueClosedError)
        ) {
          return;
        }
        // A library update replaces the default queue only after advancing the
        // composition generation. Re-run the user's semantic mutation against
        // that fresh queue instead of surfacing a spurious closed-queue error.
        if (
          error instanceof SerialMutationQueueClosedError &&
          queue !== this.defaultPresentationMutations
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  private normalizeDefaultPresentation(
    presentation: MindMapPresentation,
  ): MindMapPresentation {
    if (
      !BUILT_IN_MIND_MAP_LAYOUT_ENGINE_REGISTRY.has(
        presentation.layout.engineId,
      )
    ) {
      throw new Error(
        `Unknown layout engine "${presentation.layout.engineId}".`,
      );
    }
    const theme = this.frontendComposition.themeComposition.compose(
      presentation.theme.styleId,
      presentation.theme.paletteId,
    );
    const formatting = this.frontendComposition.formatting.composeOrDefault(
      presentation.formatting.fontFamily.id,
      presentation.formatting.connectorWidth.id,
      presentation.formatting.connectorProfile.id,
    );
    const orientation = requireDefaultLayoutOrientation(
      presentation.layout.orientation,
    );

    return {
      ...presentation,
      layout: {
        ...presentation.layout,
        orientation,
        spacing: normalizeLayoutSpacing(presentation.layout.spacing),
      },
      theme,
      formatting,
    };
  }

  private async persistDefaultPresentation(
    presentation: MindMapPresentation,
    compositionGeneration: number,
  ): Promise<void> {
    await this.presentationPersistenceQueue.run(() =>
      this.persistDefaultPresentationLocked(
        presentation,
        compositionGeneration,
      ),
    );
  }

  /** Runs while the shared presentation queue is held. */
  private async persistDefaultPresentationLocked(
    presentation: MindMapPresentation,
    compositionGeneration: number,
  ): Promise<void> {
    if (
      this.unloading ||
      !this.presentationCompositionGeneration.isCurrent(
        compositionGeneration,
      )
    ) {
      return;
    }
    let persistedPresentation: MindMapPresentation | null = null;
    await this.persistPluginDataMutation((data) => {
      if (
        !this.presentationCompositionGeneration.isCurrent(
          compositionGeneration,
        )
      ) {
        return data;
      }
      const composition = createBuiltInMindMapFrontendComposition(
        data.presentationLibrary.styles,
        data.presentationLibrary.palettes,
      );
      const effectivePresentation = reconcileMindMapPresentationTheme(
        presentation,
        composition.themeComposition,
      );
      const orientation = requireDefaultLayoutOrientation(
        effectivePresentation.layout.orientation,
      );
      const direction = layoutDirectionForOrientation(orientation);
      const layoutSpacing = normalizeLayoutSpacing(
        effectivePresentation.layout.spacing,
      );
      persistedPresentation = effectivePresentation;
      return createObMindPluginData(
        {
          ...data.settings,
          layoutOrientation: orientation,
          layoutDirection: direction,
          layoutSpacing,
          layoutEngineId: effectivePresentation.layout.engineId,
          styleId: effectivePresentation.theme.styleId,
          paletteId: effectivePresentation.theme.paletteId,
        },
        data.annotations,
        data.presentationLibrary,
      );
    });
    if (
      persistedPresentation === null ||
      this.unloading ||
      this.mindMapController === null ||
      !this.presentationCompositionGeneration.isCurrent(compositionGeneration)
    ) {
      return;
    }

    const nextSettings =
      this.requirePluginDataStore().getSnapshot().settings;
    const controllerDirectionChanged =
      this.settings.layoutDirection !== nextSettings.layoutDirection;
    this.settings = nextSettings;
    // Recreate from the settings that actually committed, rather than
    // retaining a pre-library-change renderer snapshot held by the caller.
    this.defaultPresentation = this.createConfiguredPresentation(
      nextSettings.layoutOrientation,
    );
    this.visualRevision += 1;

    if (controllerDirectionChanged) {
      this.mindMapController.setDirection(nextSettings.layoutDirection);
    } else {
      this.refreshMindMapViews();
    }
  }

  private persistPluginDataMutation(
    mutation: (current: ObMindPluginData) => ObMindPluginData,
  ): Promise<void> {
    const store = this.pluginDataStore;
    if (this.unloading || store === null) {
      return Promise.resolve();
    }
    return store
      .update(mutation)
      .then(() => {
        this.persistenceFailureNotified = false;
      })
      .catch((error: unknown) => {
        if (error instanceof MindMapPresentationLibraryRevisionConflictError) {
          throw error;
        }
        if (!this.unloading && !this.persistenceFailureNotified) {
          this.persistenceFailureNotified = true;
          new Notice(this.t("notice.persistence-failed"));
        }
        throw error;
      });
  }

  private requirePluginDataStore(): SerializedObMindPluginDataStore {
    if (this.pluginDataStore === null) {
      throw new Error("MindBraid plugin data is not loaded.");
    }
    return this.pluginDataStore;
  }

  private async migratePersistedAnnotationPath(
    previousPath: string,
    nextPath: string,
  ): Promise<void> {
    try {
      await this.presentationPersistenceQueue.run(async () => {
        await this.persistPluginDataMutation((data) => {
          const migration = migrateAnnotationStorePath(
            data.annotations,
            previousPath,
            nextPath,
          );
          return migration.migrated.length === 0
            ? data
            : createObMindPluginData(
                data.settings,
                migration.store,
                data.presentationLibrary,
              );
        });
        if (!this.unloading) {
          for (const view of this.liveViews) {
            view.refreshPersistedState(nextPath);
          }
        }
      });
    } catch {
      // The serialized persistence helper already surfaced a concise notice.
    }
  }

  private async removePersistedDocumentState(path: string): Promise<void> {
    try {
      await this.presentationPersistenceQueue.run(async () => {
        await this.persistPluginDataMutation((data) => {
          const annotations = removeDocumentAnnotationRecord(
            data.annotations,
            path,
          );
          return serializeAnnotationStore(annotations) ===
            serializeAnnotationStore(data.annotations)
            ? data
            : createObMindPluginData(
                data.settings,
                annotations,
                data.presentationLibrary,
              );
        });
      });
    } catch {
      // The serialized persistence helper already surfaced a concise notice.
    }
  }

  private refreshMindMapViews(): void {
    for (const view of this.liveViews) {
      view.refreshVisuals();
    }
  }

  private refreshMindMapLanguages(): void {
    for (const view of this.liveViews) {
      view.refreshLanguage();
    }
  }

  /** Updates only public command and ribbon objects after a language switch. */
  private refreshLocalizedPluginChrome(): void {
    const ribbonLabel = this.t("ribbon.open-current-note");
    if (this.ribbonButton !== null) {
      this.ribbonButton.setAttribute("aria-label", ribbonLabel);
      this.ribbonButton.title = ribbonLabel;
    }
    if (this.openMindMapCommand !== null) {
      this.openMindMapCommand.name = this.t("command.open-current-note");
    }
    if (this.importMindMapCommand !== null) {
      this.importMindMapCommand.name = this.t("command.import-file");
    }
  }

  private t(
    key: ObMindTranslationKey,
    values?: ObMindTranslationValues,
  ): string {
    return createObMindTranslator(this.settings.language).t(key, values);
  }

  private localizeImportReadFailure(error: unknown): string {
    if (error instanceof MindMapImportError) {
      return this.t(
        `import-error.${error.code}` as ObMindTranslationKey,
      );
    }
    return this.t("notice.import-file-read-failed");
  }

  public async navigateToSource(source: SourceLocation): Promise<void> {
    if (this.unloading) {
      return;
    }

    const file = this.app.vault.getFileByPath(source.path);
    if (file === null || file.extension.toLowerCase() !== "md") {
      new Notice(this.t("notice.source-unavailable"));
      return;
    }

    const existingLeaf = this.findOpenMarkdownLeaf(file.path);
    const leaf = existingLeaf ?? this.app.workspace.getLeaf("tab");
    const position = {
      line: source.line,
      ch: source.ch,
    };

    await leaf.openFile(file, {
      active: true,
      eState: {
        line: source.line,
      },
    });
    if (this.unloading) {
      return;
    }
    await this.app.workspace.revealLeaf(leaf);
    if (this.unloading) {
      return;
    }

    if (!(leaf.view instanceof MarkdownView)) {
      new Notice(this.t("notice.source-open-failed"));
      return;
    }

    leaf.view.editor.setCursor(position);
    leaf.view.editor.scrollIntoView(
      {
        from: position,
        to: position,
      },
      true,
    );
    leaf.view.editor.focus();
  }

  public async openMindMapLink(
    sourcePath: string,
    link: MindMapInlineLink,
  ): Promise<void> {
    if (this.unloading) {
      return;
    }
    if (!isLocalMindMapLinkTarget(link.target)) {
      new Notice(this.t("notice.link-unavailable"));
      return;
    }
    await this.app.workspace.openLinkText(link.target, sourcePath, "tab");
  }

  public async editMindMapNode(
    node: MindMapNodeEditSnapshot,
    newText: string,
  ): Promise<MindMapNodeEditResult> {
    return this.runSourceMutation(() =>
      this.editMindMapNodeNow(node, newText),
    );
  }

  public async toggleMindMapTask(
    node: MindMapNodeEditSnapshot,
  ): Promise<MindMapNodeEditResult> {
    return this.runSourceMutation(async () => {
      if (this.unloading) {
        throw new Error("MindBraid is unloading.");
      }
      const file = this.app.vault.getFileByPath(node.source.path);
      if (file === null || file.extension.toLowerCase() !== "md") {
        throw new ObMindLocalizedError("notice.source-unavailable");
      }
      const applied = await this.applyPlannedSourceMutationNow(
        file,
        "obmind-task-toggle",
        (content) =>
          planNodeTaskToggleInContent({
            node,
            content,
          }),
        false,
      );
      const toggled = findMindMapNodeAtLine(
        applied.document.root,
        applied.plan.sourceLine,
      );
      if (toggled === null || toggled.kind !== "list") {
        throw new ObMindLocalizedError("error.verification-failed");
      }
      this.recordContentMutation({
        path: file.path,
        beforeContent: applied.beforeContent,
        afterContent: applied.updatedContent,
        beforeDocument: parseMarkdown(
          applied.beforeContent,
          file.path,
          file.basename,
        ),
        beforeNodeId: node.id,
        afterDocument: applied.document,
        afterNodeId: toggled.id,
        label:
          applied.plan.nextTaskState === "checked"
            ? this.t("history.complete-task")
            : this.t("history.reopen-task"),
      });
      return {
        document: applied.document,
        nodeId: toggled.id,
      };
    });
  }

  private async editMindMapNodeNow(
    node: MindMapNodeEditSnapshot,
    newText: string,
  ): Promise<MindMapNodeEditResult> {
    if (this.unloading) {
      throw new Error("MindBraid is unloading.");
    }

    const file = this.app.vault.getFileByPath(node.source.path);
    if (file === null || file.extension.toLowerCase() !== "md") {
      throw new ObMindLocalizedError("notice.source-unavailable");
    }

    if (node.kind === "root") {
      return this.renameRootNode(file, node, newText);
    }

    const openLeaf = this.findOpenMarkdownLeaf(file.path);
    if (openLeaf?.view instanceof MarkdownView) {
      const editor = openLeaf.view.editor;
      const currentContent = editor.getValue();
      const currentLine = editor.getLine(node.source.line);
      const plan = planNodeTextEditInContent(
        node,
        currentContent,
        newText,
      );
      if (plan.replacementLine === currentLine) {
        return createNodeEditResult(currentContent, file, node);
      }

      editor.replaceRange(
        plan.replacementLine,
        {
          line: node.source.line,
          ch: 0,
        },
        {
          line: node.source.line,
          ch: currentLine.length,
        },
        "obmind-node-edit",
      );
      const updatedContent = editor.getValue();
      if (updatedContent !== plan.updatedContent) {
        throw new ObMindLocalizedError("error.source-update-failed");
      }
      this.controller.commitContent(
        createSourceDescriptor(file),
        updatedContent,
      );
      const result = createNodeEditResult(updatedContent, file, node);
      this.recordContentMutation({
        path: file.path,
        beforeContent: currentContent,
        afterContent: updatedContent,
        beforeDocument: parseMarkdown(
          currentContent,
          file.path,
          file.basename,
        ),
        beforeNodeId: node.id,
        afterDocument: result.document,
        afterNodeId: result.nodeId,
        label: this.t("history.edit-topic"),
      });
      return result;
    }

    let beforeContent: string | null = null;
    const updatedContent = await this.app.vault.process(
      file,
      (currentContent) => {
        const plan = planNodeTextEditInContent(
          node,
          currentContent,
          newText,
        );
        beforeContent = currentContent;
        return plan.updatedContent;
      },
    );
    await this.commitProcessedContentIfCurrent(file, updatedContent);
    if (beforeContent === null) {
      throw new ObMindLocalizedError("error.source-update-failed");
    }
    const result = createNodeEditResult(updatedContent, file, node);
    this.recordContentMutation({
      path: file.path,
      beforeContent,
      afterContent: updatedContent,
      beforeDocument: parseMarkdown(
        beforeContent,
        file.path,
        file.basename,
      ),
      beforeNodeId: node.id,
      afterDocument: result.document,
      afterNodeId: result.nodeId,
      label: this.t("history.edit-topic"),
    });
    return result;
  }

  public async createMindMapNode(
    document: MindMapDocument,
    node: MindMapNodeEditSnapshot,
    createKind: NodeCreateKind,
  ): Promise<MindMapNodeCreationResult> {
    return this.runSourceMutation(() =>
      this.createMindMapNodeNow(document, node, createKind),
    );
  }

  private async createMindMapNodeNow(
    document: MindMapDocument,
    node: MindMapNodeEditSnapshot,
    createKind: NodeCreateKind,
  ): Promise<MindMapNodeCreationResult> {
    if (this.unloading) {
      throw new Error("MindBraid is unloading.");
    }
    if (
      document.root.source.path !== node.source.path ||
      document.sourceRevision !== node.sourceRevision
    ) {
      throw new ObMindLocalizedError("error.stale-source");
    }

    const file = this.app.vault.getFileByPath(node.source.path);
    if (file === null || file.extension.toLowerCase() !== "md") {
      throw new ObMindLocalizedError("notice.source-unavailable");
    }

    let plan: NodeInsertionPlan;
    let updatedContent: string;
    let beforeContent: string | null = null;
    let usedOpenEditor = false;
    const openLeaf = this.findOpenMarkdownLeaf(file.path);
    if (openLeaf?.view instanceof MarkdownView) {
      usedOpenEditor = true;
      const editor = openLeaf.view.editor;
      const currentContent = editor.getValue();
      beforeContent = currentContent;
      plan = planNodeInsertionInContent({
        document,
        content: currentContent,
        targetNodeId: node.id,
        sourceRevision: node.sourceRevision,
        createKind,
      });
      const position = editor.offsetToPos(plan.insertionOffset);
      editor.replaceRange(
        plan.insertionText,
        position,
        position,
        "obmind-node-create",
      );
      updatedContent = editor.getValue();
      if (updatedContent !== plan.updatedContent) {
        throw new ObMindLocalizedError("error.source-update-failed");
      }
      this.prepareMindMapViewsForStructuralSourceChange(file.path);
    } else {
      let processedPlan: NodeInsertionPlan | null = null;
      updatedContent = await this.app.vault.process(
        file,
        (currentContent) => {
          const nextPlan = planNodeInsertionInContent({
            document,
            content: currentContent,
            targetNodeId: node.id,
            sourceRevision: node.sourceRevision,
            createKind,
          });
          processedPlan = nextPlan;
          beforeContent = currentContent;
          return nextPlan.updatedContent;
        },
      );
      if (processedPlan === null) {
        throw new ObMindLocalizedError("error.source-update-failed");
      }
      plan = processedPlan;
      this.prepareMindMapViewsForStructuralSourceChange(file.path);
    }

    const created = findCreatedMindMapNode(
      updatedContent,
      file,
      plan,
    );
    if (!this.unloading && this.mindMapController !== null) {
      if (usedOpenEditor) {
        this.controller.commitContent(
          createSourceDescriptor(file),
          updatedContent,
        );
      } else {
        await this.commitProcessedContentIfCurrent(
          file,
          updatedContent,
        );
      }
    }
    if (beforeContent === null) {
      throw new ObMindLocalizedError("error.source-update-failed");
    }
    const createdDocument = parseMarkdown(
      updatedContent,
      file.path,
      file.basename,
    );
    this.recordContentMutation({
      path: file.path,
      beforeContent,
      afterContent: updatedContent,
      beforeDocument: document,
      beforeNodeId: node.id,
      afterDocument: createdDocument,
      afterNodeId: created.id,
      label:
        createKind === "child"
          ? this.t("history.add-child-topic")
          : this.t("history.add-sibling-topic"),
    });

    return {
      nodeId: created.id,
      source: created.source,
    };
  }

  public async moveMindMapNode(
    document: MindMapDocument,
    sourceNode: MindMapNodeEditSnapshot,
    targetNode: MindMapNodeEditSnapshot,
    placement: NodeMovePlacement,
  ): Promise<MindMapNodeMoveResult> {
    return this.runSourceMutation(() =>
      this.moveMindMapNodeNow(
        document,
        sourceNode,
        targetNode,
        placement,
      ),
    );
  }

  private async moveMindMapNodeNow(
    document: MindMapDocument,
    sourceNode: MindMapNodeEditSnapshot,
    targetNode: MindMapNodeEditSnapshot,
    placement: NodeMovePlacement,
  ): Promise<MindMapNodeMoveResult> {
    if (this.unloading) {
      throw new Error("MindBraid is unloading.");
    }
    if (
      sourceNode.kind === "root" ||
      document.root.source.path !== sourceNode.source.path ||
      sourceNode.source.path !== targetNode.source.path ||
      document.sourceRevision !== sourceNode.sourceRevision ||
      document.sourceRevision !== targetNode.sourceRevision
    ) {
      throw new ObMindLocalizedError("error.stale-source");
    }

    const file = this.app.vault.getFileByPath(sourceNode.source.path);
    if (file === null || file.extension.toLowerCase() !== "md") {
      throw new ObMindLocalizedError("notice.source-unavailable");
    }

    let plan: NodeMovePlan;
    let updatedContent: string;
    let beforeContent: string | null = null;
    let usedOpenEditor = false;
    const openLeaf = this.findOpenMarkdownLeaf(file.path);
    if (openLeaf?.view instanceof MarkdownView) {
      usedOpenEditor = true;
      const editor = openLeaf.view.editor;
      const currentContent = editor.getValue();
      beforeContent = currentContent;
      plan = planNodeMoveInContent({
        document,
        content: currentContent,
        sourceRevision: sourceNode.sourceRevision,
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id,
        placement,
      });
      if (plan.changed) {
        editor.replaceRange(
          plan.replacementText,
          editor.offsetToPos(plan.replacementStartOffset),
          editor.offsetToPos(plan.replacementEndOffset),
          "obmind-node-move",
        );
      }
      updatedContent = editor.getValue();
      if (updatedContent !== plan.updatedContent) {
        throw new ObMindLocalizedError("error.source-update-failed");
      }
      if (plan.changed) {
        this.prepareMindMapViewsForStructuralSourceChange(file.path);
      }
    } else {
      let processedPlan: NodeMovePlan | null = null;
      updatedContent = await this.app.vault.process(
        file,
        (currentContent) => {
          const nextPlan = planNodeMoveInContent({
            document,
            content: currentContent,
            sourceRevision: sourceNode.sourceRevision,
            sourceNodeId: sourceNode.id,
            targetNodeId: targetNode.id,
            placement,
          });
          processedPlan = nextPlan;
          beforeContent = currentContent;
          return nextPlan.updatedContent;
        },
      );
      if (processedPlan === null) {
        throw new ObMindLocalizedError("error.source-update-failed");
      }
      plan = processedPlan;
      if (plan.changed) {
        this.prepareMindMapViewsForStructuralSourceChange(file.path);
      }
    }

    const moved = findMovedMindMapNode(
      updatedContent,
      file,
      sourceNode,
      plan,
    );
    if (!this.unloading && this.mindMapController !== null && plan.changed) {
      if (usedOpenEditor) {
        this.controller.commitContent(
          createSourceDescriptor(file),
          updatedContent,
        );
      } else {
        await this.commitProcessedContentIfCurrent(file, updatedContent);
      }
    }
    if (plan.changed) {
      if (beforeContent === null) {
        throw new ObMindLocalizedError("error.source-update-failed");
      }
      const movedDocument = parseMarkdown(
        updatedContent,
        file.path,
        file.basename,
      );
      this.recordContentMutation({
        path: file.path,
        beforeContent,
        afterContent: updatedContent,
        beforeDocument: document,
        beforeNodeId: sourceNode.id,
        afterDocument: movedDocument,
        afterNodeId: moved.id,
        label: this.t("history.move-topic"),
      });
    }

    return {
      nodeId: moved.id,
      source: moved.source,
      changed: plan.changed,
    };
  }

  public async executeMindMapTopicCommand(
    document: MindMapDocument,
    request: MindMapTopicCommandRequest,
  ): Promise<MindMapTopicCommandResult> {
    return this.runSourceMutation(() =>
      this.executeMindMapTopicCommandNow(document, request),
    );
  }

  private async executeMindMapTopicCommandNow(
    document: MindMapDocument,
    request: MindMapTopicCommandRequest,
  ): Promise<MindMapTopicCommandResult> {
    if (this.unloading) {
      throw new Error("MindBraid is unloading.");
    }
    if (
      document.sourceRevision !== request.sourceRevision ||
      document.root.source.path.length === 0
    ) {
      throw new ObMindLocalizedError("error.stale-source");
    }

    const file = this.app.vault.getFileByPath(document.root.source.path);
    if (file === null || file.extension.toLowerCase() !== "md") {
      throw new ObMindLocalizedError("notice.source-unavailable");
    }

    const selectedNodeIds = uniqueExistingNodeIds(
      document,
      request.nodeIds,
    );
    const primaryNodeId =
      request.primaryNodeId !== null &&
      selectedNodeIds.includes(request.primaryNodeId)
        ? request.primaryNodeId
        : (selectedNodeIds[0] ?? null);

    switch (request.command) {
      case "copy": {
        const currentContent = await this.readCurrentContent(file);
        const payload = createNodeClipboardPayload({
          document,
          content: currentContent,
          sourceRevision: request.sourceRevision,
          nodeIds: selectedNodeIds,
        });
        this.nodeClipboard = payload;
        this.writePlainMarkdownClipboard(payload.markdown);
        this.refreshMindMapViews();
        return createTopicCommandResult(
          document,
          selectedNodeIds,
          primaryNodeId,
          false,
        );
      }
      case "cut": {
        const currentContent = await this.readCurrentContent(file);
        const payload = createNodeClipboardPayload({
          document,
          content: currentContent,
          sourceRevision: request.sourceRevision,
          nodeIds: selectedNodeIds,
        });
        const fallbackLocator = createDeleteFallbackLocator(
          document,
          selectedNodeIds,
          primaryNodeId,
        );
        const applied = await this.applyPlannedSourceMutationNow(
          file,
          "obmind-node-cut",
          (content) =>
            planNodeDeletionInContent({
              document,
              content,
              sourceRevision: request.sourceRevision,
              nodeIds: selectedNodeIds,
              mode: "subtree",
            }),
        );
        this.nodeClipboard = payload;
        this.writePlainMarkdownClipboard(payload.markdown);
        this.refreshMindMapViews();
        return this.finishRecordedTopicMutation({
          file,
          applied,
          beforeDocument: document,
          beforeNodeId: primaryNodeId,
          afterNodeId: resolveLocatorId(
            applied.document,
            fallbackLocator,
          ),
          label: this.t("history.cut-topic"),
        });
      }
      case "delete-branch":
      case "delete-single": {
        const fallbackLocator = createDeleteFallbackLocator(
          document,
          selectedNodeIds,
          primaryNodeId,
        );
        const applied = await this.applyPlannedSourceMutationNow(
          file,
          request.command === "delete-branch"
            ? "obmind-node-delete"
            : "obmind-node-delete-promote",
          (content) =>
            planNodeDeletionInContent({
              document,
              content,
              sourceRevision: request.sourceRevision,
              nodeIds: selectedNodeIds,
              mode:
                request.command === "delete-branch"
                  ? "subtree"
                  : "promote-children",
            }),
        );
        return this.finishRecordedTopicMutation({
          file,
          applied,
          beforeDocument: document,
          beforeNodeId: primaryNodeId,
          afterNodeId: resolveLocatorId(
            applied.document,
            fallbackLocator,
          ),
          label:
            request.command === "delete-branch"
              ? this.t("history.delete-branch")
              : this.t("history.delete-topic"),
        });
      }
      case "paste-child":
      case "paste-sibling": {
        if (this.nodeClipboard === null) {
          throw new ObMindLocalizedError("notice.clipboard-required");
        }
        if (primaryNodeId === null) {
          throw new ObMindLocalizedError("error.paste-target-required");
        }
        const payload = this.nodeClipboard;
        const applied = await this.applyPlannedSourceMutationNow(
          file,
          "obmind-node-paste",
          (content) =>
            planNodePasteInContent({
              document,
              content,
              sourceRevision: request.sourceRevision,
              targetNodeId: primaryNodeId,
              placement:
                request.command === "paste-child"
                  ? "child"
                  : "sibling",
              payload,
            }),
        );
        const pastedNodeIds = applied.plan.insertedRootLines
          .map((line) =>
            findMindMapNodeAtLine(applied.document.root, line),
          )
          .filter(
            (node): node is Exclude<MindMapNode, { readonly kind: "root" }> =>
              node !== null && node.kind !== "root",
          )
          .map((node) => node.id);
        const pastedPrimaryNodeId = pastedNodeIds[0] ?? null;
        this.recordContentMutation({
          path: file.path,
          beforeContent: applied.beforeContent,
          afterContent: applied.updatedContent,
          beforeDocument: document,
          beforeNodeId: primaryNodeId,
          afterDocument: applied.document,
          afterNodeId: pastedPrimaryNodeId,
          label: this.t("history.paste-topic"),
        });
        return {
          changed: true,
          document: applied.document,
          selectedNodeIds:
            pastedNodeIds.length > 0
              ? pastedNodeIds
              : [applied.document.root.id],
          primaryNodeId:
            pastedPrimaryNodeId ?? applied.document.root.id,
          beginEditNodeId: null,
        };
      }
      case "create-parent": {
        if (primaryNodeId === null) {
          throw new ObMindLocalizedError("error.topic-selection-required");
        }
        const applied = await this.applyPlannedSourceMutationNow(
          file,
          "obmind-node-create-parent",
          (content) =>
            planNodeParentInsertionInContent({
              document,
              content,
              sourceRevision: request.sourceRevision,
              targetNodeId: primaryNodeId,
            }),
        );
        const parent = findMindMapNodeAtLine(
          applied.document.root,
          applied.plan.parentSourceLine,
        );
        if (parent === null || parent.kind === "root") {
          throw new ObMindLocalizedError("error.verification-failed");
        }
        this.recordContentMutation({
          path: file.path,
          beforeContent: applied.beforeContent,
          afterContent: applied.updatedContent,
          beforeDocument: document,
          beforeNodeId: primaryNodeId,
          afterDocument: applied.document,
          afterNodeId: parent.id,
          label: this.t("history.insert-parent-topic"),
        });
        return {
          changed: true,
          document: applied.document,
          selectedNodeIds: [parent.id],
          primaryNodeId: parent.id,
          beginEditNodeId: parent.id,
        };
      }
      case "outdent": {
        if (primaryNodeId === null) {
          throw new ObMindLocalizedError("error.topic-selection-required");
        }
        const index = indexMindMapNodes(document.root);
        const source = index.get(primaryNodeId);
        const parent =
          source?.parent === null || source?.parent === undefined
            ? null
            : index.get(source.parent.id);
        if (
          source === undefined ||
          source.node.kind === "root" ||
          parent === undefined ||
          parent === null ||
          parent.node.kind === "root"
        ) {
          throw new ObMindLocalizedError("error.outdent-outermost");
        }
        const applied = await this.applyPlannedSourceMutationNow(
          file,
          "obmind-node-outdent",
          (content) =>
            planNodeMoveInContent({
              document,
              content,
              sourceRevision: request.sourceRevision,
              sourceNodeId: primaryNodeId,
              targetNodeId: parent.node.id,
              placement: "after",
            }),
        );
        const moved = findMindMapNodeAtLine(
          applied.document.root,
          applied.plan.movedSourceLine,
        );
        if (moved === null || moved.kind === "root") {
          throw new ObMindLocalizedError("error.verification-failed");
        }
        this.recordContentMutation({
          path: file.path,
          beforeContent: applied.beforeContent,
          afterContent: applied.updatedContent,
          beforeDocument: document,
          beforeNodeId: primaryNodeId,
          afterDocument: applied.document,
          afterNodeId: moved.id,
          label: this.t("history.outdent-topic"),
        });
        return createTopicCommandResult(
          applied.document,
          [moved.id],
          moved.id,
          true,
        );
      }
      case "undo":
        return this.applyHistoryOperation(file, "undo");
      case "redo":
        return this.applyHistoryOperation(file, "redo");
    }
  }

  private async applyPlannedSourceMutationNow<
    TPlan extends ContiguousSourceMutationPlan,
  >(
    file: TFile,
    origin: string,
    createPlan: (content: string) => TPlan,
    structural = true,
  ): Promise<AppliedSourceMutation<TPlan>> {
    let beforeContent: string;
    let plan: TPlan;
    let updatedContent: string;
    let usedOpenEditor = false;
    const openLeaf = this.findOpenMarkdownLeaf(file.path);
    if (openLeaf?.view instanceof MarkdownView) {
      usedOpenEditor = true;
      const editor = openLeaf.view.editor;
      beforeContent = editor.getValue();
      plan = createPlan(beforeContent);
      if (plan.updatedContent !== beforeContent) {
        editor.replaceRange(
          plan.replacementText,
          editor.offsetToPos(plan.replacementStartOffset),
          editor.offsetToPos(plan.replacementEndOffset),
          origin,
        );
      }
      updatedContent = editor.getValue();
      if (updatedContent !== plan.updatedContent) {
        throw new ObMindLocalizedError("error.source-update-failed");
      }
    } else {
      let processedPlan: TPlan | null = null;
      let processedBeforeContent: string | null = null;
      updatedContent = await this.app.vault.process(
        file,
        (currentContent) => {
          const nextPlan = createPlan(currentContent);
          processedBeforeContent = currentContent;
          processedPlan = nextPlan;
          return nextPlan.updatedContent;
        },
      );
      if (processedPlan === null || processedBeforeContent === null) {
        throw new ObMindLocalizedError("error.source-update-failed");
      }
      plan = processedPlan;
      beforeContent = processedBeforeContent;
    }

    const changed = updatedContent !== beforeContent;
    if (changed) {
      if (structural) {
        this.prepareMindMapViewsForStructuralSourceChange(file.path);
      }
      if (!this.unloading && this.mindMapController !== null) {
        if (usedOpenEditor) {
          this.controller.commitContent(
            createSourceDescriptor(file),
            updatedContent,
          );
        } else {
          await this.commitProcessedContentIfCurrent(
            file,
            updatedContent,
          );
        }
      }
    }

    return {
      beforeContent,
      document: parseMarkdown(
        updatedContent,
        file.path,
        file.basename,
      ),
      plan,
      updatedContent,
    };
  }

  private async applyHistoryOperation(
    file: TFile,
    direction: MindMapMutationHistoryDirection,
  ): Promise<MindMapTopicCommandResult> {
    const currentContent = await this.readCurrentContent(file);
    const history = this.mutationHistories.get(file.path);
    const operation = history?.peek(direction, {
      path: file.path,
      content: currentContent,
      revision: parseMarkdown(
        currentContent,
        file.path,
        file.basename,
      ).sourceRevision,
    });
    if (history === undefined || operation === null || operation === undefined) {
      throw new ObMindLocalizedError(
        direction === "undo"
          ? "notice.undo-unavailable"
          : "notice.redo-unavailable",
      );
    }

    const appliedContent = await this.applyExactSourceReplacementNow(
      file,
      operation.expected.content,
      operation.replacement.content,
      `obmind-${direction}`,
    );
    const document = parseMarkdown(
      appliedContent,
      file.path,
      file.basename,
    );
    history.commit(operation, {
      path: file.path,
      content: appliedContent,
      revision: document.sourceRevision,
    });
    this.refreshMindMapViews();
    const selected =
      operation.selection === null
        ? document.root
        : (resolveMindMapNodeLocator(
            document,
            operation.selection,
          ) ?? document.root);
    return createTopicCommandResult(
      document,
      [selected.id],
      selected.id,
      true,
    );
  }

  private async applyExactSourceReplacementNow(
    file: TFile,
    expectedContent: string,
    replacementContent: string,
    origin: string,
  ): Promise<string> {
    const openLeaf = this.findOpenMarkdownLeaf(file.path);
    let updatedContent: string;
    if (openLeaf?.view instanceof MarkdownView) {
      const editor = openLeaf.view.editor;
      const currentContent = editor.getValue();
      if (currentContent !== expectedContent) {
        throw new ObMindLocalizedError("error.history-stale");
      }
      editor.replaceRange(
        replacementContent,
        { line: 0, ch: 0 },
        editor.offsetToPos(currentContent.length),
        origin,
      );
      updatedContent = editor.getValue();
      if (updatedContent !== replacementContent) {
        throw new ObMindLocalizedError("error.source-update-failed");
      }
      this.prepareMindMapViewsForStructuralSourceChange(file.path);
      if (!this.unloading && this.mindMapController !== null) {
        this.controller.commitContent(
          createSourceDescriptor(file),
          updatedContent,
        );
      }
    } else {
      updatedContent = await this.app.vault.process(
        file,
        (currentContent) => {
          if (currentContent !== expectedContent) {
            throw new ObMindLocalizedError("error.history-stale");
          }
          return replacementContent;
        },
      );
      this.prepareMindMapViewsForStructuralSourceChange(file.path);
      await this.commitProcessedContentIfCurrent(file, updatedContent);
    }
    return updatedContent;
  }

  private finishRecordedTopicMutation<
    TPlan extends ContiguousSourceMutationPlan,
  >(request: {
    readonly file: TFile;
    readonly applied: AppliedSourceMutation<TPlan>;
    readonly beforeDocument: MindMapDocument;
    readonly beforeNodeId: string | null;
    readonly afterNodeId: string | null;
    readonly label: string;
  }): MindMapTopicCommandResult {
    const selectedNodeId =
      request.afterNodeId ?? request.applied.document.root.id;
    this.recordContentMutation({
      path: request.file.path,
      beforeContent: request.applied.beforeContent,
      afterContent: request.applied.updatedContent,
      beforeDocument: request.beforeDocument,
      beforeNodeId: request.beforeNodeId,
      afterDocument: request.applied.document,
      afterNodeId: selectedNodeId,
      label: request.label,
    });
    return createTopicCommandResult(
      request.applied.document,
      [selectedNodeId],
      selectedNodeId,
      true,
    );
  }

  private recordContentMutation(
    request: RecordContentMutationRequest,
  ): void {
    if (request.beforeContent === request.afterContent) {
      return;
    }
    const beforeSelection =
      request.beforeNodeId === null
        ? null
        : createMindMapNodeLocator(
            request.beforeDocument,
            request.beforeNodeId,
          );
    const afterSelection =
      request.afterNodeId === null
        ? null
        : createMindMapNodeLocator(
            request.afterDocument,
            request.afterNodeId,
          );
    const history = this.mutationHistories.getOrCreate(request.path);
    history.push({
      path: request.path,
      before: createMindMapMutationHistoryState(
        request.beforeContent,
        beforeSelection,
      ),
      after: createMindMapMutationHistoryState(
        request.afterContent,
        afterSelection,
      ),
      label: request.label,
    });
    this.refreshMindMapViews();
  }

  private runSourceMutation<T>(task: () => Promise<T>): Promise<T> {
    return this.sourceMutationQueue.run(task).catch((error: unknown) => {
      if (
        this.unloading &&
        error instanceof ExclusiveTaskQueueClosedError
      ) {
        throw new Error("MindBraid is unloading.");
      }
      throw error;
    });
  }

  private writePlainMarkdownClipboard(markdown: string): void {
    const clipboard =
      window.activeWindow.navigator.clipboard;
    if (clipboard === undefined) {
      return;
    }
    void clipboard.writeText(markdown).catch(() => {
      // The versioned in-memory clipboard remains authoritative when the
      // operating system denies browser clipboard access.
    });
  }

  private prepareMindMapViewsForStructuralSourceChange(
    path: string,
  ): void {
    for (const view of this.liveViews) {
      view.prepareForStructuralSourceChange(path);
    }
  }

  private async commitProcessedContentIfCurrent(
    file: TFile,
    updatedContent: string,
  ): Promise<void> {
    if (this.unloading || this.mindMapController === null) {
      return;
    }

    const openLeaf = this.findOpenMarkdownLeaf(file.path);
    const latestContent =
      openLeaf?.view instanceof MarkdownView
        ? openLeaf.view.editor.getValue()
        : await this.app.vault.cachedRead(file);
    if (this.unloading || this.mindMapController === null) {
      return;
    }

    const source = createSourceDescriptor(file);
    if (latestContent !== updatedContent) {
      this.controller.commitContent(source, latestContent);
      // `Vault.process` already committed `updatedContent` atomically. An
      // editor can become authoritative immediately afterwards; publish that
      // newer buffer without converting the completed write into a false
      // failure. Any recorded history entry remains exact and therefore
      // safely rejects if the newer buffer made it stale.
      return;
    }

    this.controller.commitContent(source, updatedContent);
  }

  private async renameRootNode(
    file: TFile,
    node: Extract<MindMapNodeEditSnapshot, { readonly kind: "root" }>,
    newText: string,
  ): Promise<MindMapNodeEditResult> {
    if (file.basename !== node.text) {
      throw new ObMindLocalizedError("error.rename-stale");
    }

    const basename = normalizeRootNodeName(newText);
    if (basename === file.basename) {
      const content = await this.readCurrentContent(file);
      return createNodeEditResult(content, file, node);
    }

    const parentPath = file.parent?.path;
    const newPath = normalizePath(
      parentPath === undefined ||
        parentPath.length === 0 ||
        parentPath === "/"
        ? `${basename}.md`
        : `${parentPath}/${basename}.md`,
    );
    const existing = this.app.vault.getAbstractFileByPath(newPath);
    if (existing !== null && existing !== file) {
      throw new ObMindLocalizedError("error.rename-conflict", { name: basename });
    }

    const oldPath = file.path;
    await this.app.fileManager.renameFile(file, newPath);
    this.mutationHistories.delete(oldPath);
    this.mutationHistories.delete(file.path);
    if (this.unloading || this.mindMapController === null) {
      throw new Error("MindBraid unloaded while the note was being renamed.");
    }
    if (this.controller.getCurrentSourcePath() === oldPath) {
      this.activateFile(file, true);
    }
    const content = await this.readCurrentContent(file);
    return createNodeEditResult(content, file, node);
  }

  private async loadPluginData(): Promise<void> {
    const storedData: unknown = await this.loadData();
    const loaded = normalizeObMindPluginData(storedData, {
      presentationLibraryValidators:
        BUILT_IN_MIND_MAP_PRESENTATION_LIBRARY_VALIDATORS,
    });
    this.installFrontendComposition(
      loaded.data.presentationLibrary.styles,
      loaded.data.presentationLibrary.palettes,
    );
    this.pluginDataStore = new SerializedObMindPluginDataStore(
      loaded.data,
      (data) => this.saveData(data),
    );
    this.settings = loaded.data.settings;
  }

  private async openMindMap(): Promise<void> {
    if (this.unloading) {
      return;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile === null) {
      this.controller.setIdle();
    } else {
      this.activateFile(activeFile);
    }

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: VIEW_TYPE_MIND_MAP,
      active: true,
    });
    if (this.unloading) {
      return;
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  private async importMindMapFile(): Promise<void> {
    if (this.unloading) {
      return;
    }
    if (
      this.importFilePicker !== null ||
      this.importModal !== null ||
      this.importCommitInFlight
    ) {
      new Notice(this.t("notice.import-already-open"));
      return;
    }

    const picker = createMindMapImportFilePicker(
      this.app.workspace.containerEl.ownerDocument,
      this.getMindMapLanguage(),
    );
    this.importFilePicker = picker;
    const file = await picker.result;
    if (this.importFilePicker === picker) {
      this.importFilePicker = null;
    }
    if (file === null || this.unloading) {
      return;
    }
    if (file.size > DEFAULT_MIND_MAP_IMPORT_LIMITS.maximumInputBytes) {
      new Notice(
        this.t("notice.import-file-too-large", {
          limit: createObMindTranslator(this.settings.language).formatNumber(
            DEFAULT_MIND_MAP_IMPORT_LIMITS.maximumInputBytes,
          ),
        }),
      );
      return;
    }

    let workbook;
    try {
      workbook = BUILT_IN_MIND_MAP_IMPORT_REGISTRY.parse({
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
    } catch (error: unknown) {
      // Parsers intentionally retain framework-free diagnostic text. The
      // host maps typed error codes to localized copy instead of exposing
      // arbitrary adapter error text.
      new Notice(this.localizeImportReadFailure(error));
      return;
    }
    if (this.unloading) {
      return;
    }

    const activePath = this.app.workspace.getActiveFile()?.path ?? "";
    const parent = this.app.fileManager.getNewFileParent(
      activePath,
      this.t("import.default-destination-name"),
    );
    const parentPath = parent.isRoot() ? "" : parent.path;
    const resolveDestinationPath = (basename: string): string =>
      normalizePath(
        createUniqueImportedNotePath(parentPath, basename, (path) =>
          this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null,
        ),
      );

    let modal: MindMapImportModal;
    modal = new MindMapImportModal(this.app, {
      workbook,
      language: this.getMindMapLanguage(),
      resolveDestinationPath,
      confirmImport: async (plan, destinationPath) => {
        if (this.importCommitInFlight) {
          throw new ObMindLocalizedError("notice.import-commit-in-progress");
        }
        this.importCommitInFlight = true;
        try {
          await this.createImportedMindMapNote(plan, destinationPath);
        } finally {
          this.importCommitInFlight = false;
        }
      },
      closed: () => {
        if (this.importModal === modal) {
          this.importModal = null;
        }
      },
    });
    this.importModal = modal;
    modal.open();
  }

  private async createImportedMindMapNote(
    plan: MindMapMarkdownImportPlan,
    destinationPath: string,
  ): Promise<void> {
    if (this.unloading) {
      throw new Error("MindBraid is unloading.");
    }
    const normalizedPath = normalizePath(destinationPath);
    const importedFile = await this.runSourceMutation(async () =>
      createImportedMarkdownNote(plan, normalizedPath, {
        exists: (path) =>
          this.app.vault.getAbstractFileByPath(path) !== null,
        create: (path, content) => this.app.vault.create(path, content),
      }),
    );
    if (this.unloading) {
      return;
    }
    this.activateFile(importedFile, true);
    try {
      const markdownLeaf = this.app.workspace.getLeaf("tab");
      await markdownLeaf.openFile(importedFile, { active: true });
      await this.app.workspace.revealLeaf(markdownLeaf);
      await this.openMindMap();
    } catch {
      new Notice(
        this.t("notice.import-open-view-failed", {
          count: createObMindTranslator(this.settings.language).formatNumber(
            plan.topicCount,
          ),
          path: normalizedPath,
        }),
      );
      return;
    }
    new Notice(
      this.t("notice.import-complete", {
        count: createObMindTranslator(this.settings.language).formatNumber(
          plan.topicCount,
        ),
        path: normalizedPath,
      }),
    );
  }

  private registerWorkspaceEvents(): void {
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file !== null) {
          this.activateFile(file);
        }
      }),
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.syncMindMapViewActivity(
          leaf?.view instanceof MindMapView ? leaf.view : null,
        );
        if (leaf?.view instanceof FileView && leaf.view.file !== null) {
          this.activateFile(leaf.view.file);
        }
      }),
    );

    this.registerEvent(
      this.app.workspace.on(
        "editor-change",
        (editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
          const file = info.file;
          if (
            file === null ||
            file.extension.toLowerCase() !== "md" ||
            this.controller.getCurrentSourcePath() !== file.path
          ) {
            return;
          }

          this.controller.scheduleContent(
            createSourceDescriptor(file),
            editor.getValue(),
          );
        },
      ),
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (
          !(file instanceof TFile) ||
          file.extension.toLowerCase() !== "md" ||
          this.controller.getCurrentSourcePath() !== file.path
        ) {
          return;
        }

        const source = createSourceDescriptor(file);
        this.controller.scheduleReload(source, () =>
          this.readCurrentContent(file),
        );
      }),
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.mutationHistories.delete(oldPath);
        this.mutationHistories.delete(file.path);
        if (file instanceof TFile) {
          // History snapshots contain path-bound locators. Clear them
          // conservatively rather than allowing undo to recreate old-path
          // records after a host-confirmed rename.
          this.presentationHistories.delete(oldPath);
          this.presentationHistories.delete(file.path);
          void this.migratePersistedAnnotationPath(
            oldPath,
            file.path,
          );
        }
        if (this.controller.getCurrentSourcePath() !== oldPath) {
          return;
        }

        if (file instanceof TFile) {
          this.activateFile(file, true);
        } else {
          this.controller.setError(this.t("notice.source-unavailable"));
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.mutationHistories.delete(file.path);
        this.presentationHistories.delete(file.path);
        void this.removePersistedDocumentState(file.path);
        if (this.controller.getCurrentSourcePath() !== file.path) {
          return;
        }

        const source =
          file instanceof TFile ? createSourceDescriptor(file) : null;
        this.controller.setError(
          this.t("notice.source-unavailable"),
          source,
        );
      }),
    );

    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        this.visualRevision += 1;
        for (const view of this.liveViews) {
          view.refreshVisuals();
        }
      }),
    );
  }

  private activateFile(file: TFile, force = false): void {
    const source = createSourceDescriptor(file);

    if (file.extension.toLowerCase() !== "md") {
      if (
        force ||
        this.controller.getCurrentSourcePath() !== source.path ||
        this.controller.getState().status !== "unsupported"
      ) {
        this.controller.setUnsupported(source);
      }
      return;
    }

    if (!force && this.controller.getCurrentSourcePath() === source.path) {
      return;
    }

    this.controller.activateMarkdown(source, () =>
      this.readCurrentContent(file),
    );
  }

  private async readCurrentContent(file: TFile): Promise<string> {
    // `file-open` can fire after a MarkdownView changes its file reference but
    // before CodeMirror installs the new document. Allow the view transition
    // to settle so the live editor buffer and its TFile belong to one note.
    const editorWindow =
      this.findOpenMarkdownLeaf(file.path)?.view.containerEl.ownerDocument
        .defaultView ?? window.activeWindow;
    await this.waitForEditorTransition(editorWindow);
    if (this.unloading) {
      throw new Error("MindBraid is unloading");
    }

    const openLeaf = this.findOpenMarkdownLeaf(file.path);
    return readAuthoritativeMarkdownContent(
      () =>
        openLeaf?.view instanceof MarkdownView
          ? openLeaf.view.editor.getValue()
          : null,
      () => this.app.vault.cachedRead(file),
    );
  }

  private waitForEditorTransition(timerWindow: Window): Promise<void> {
    return new Promise((resolve) => {
      let pendingRead: PendingEditorRead | null = null;
      const timer = timerWindow.setTimeout(() => {
        if (pendingRead !== null) {
          this.pendingEditorReads.delete(pendingRead);
        }
        resolve();
      }, EDITOR_TRANSITION_DELAY_MS);
      pendingRead = {
        timer,
        timerWindow,
        resolve,
      };
      this.pendingEditorReads.add(pendingRead);
    });
  }

  private findOpenMarkdownLeaf(path: string): WorkspaceLeaf | null {
    for (const leaf of this.app.workspace.getLeavesOfType(MARKDOWN_VIEW_TYPE)) {
      if (
        leaf.view instanceof MarkdownView &&
        leaf.view.file?.path === path
      ) {
        return leaf;
      }
    }

    return null;
  }
}

function uniqueExistingNodeIds(
  document: MindMapDocument,
  nodeIds: readonly string[],
): string[] {
  const index = indexMindMapNodes(document.root);
  return [...new Set(nodeIds)].filter((nodeId) => index.has(nodeId));
}

function createDeleteFallbackLocator(
  document: MindMapDocument,
  selectedNodeIds: readonly string[],
  primaryNodeId: string | null,
): MindMapNodeLocator | null {
  const index = indexMindMapNodes(document.root);
  const selected = new Set(selectedNodeIds);
  let entry =
    primaryNodeId === null ? undefined : index.get(primaryNodeId);
  while (entry?.parent !== null && entry?.parent !== undefined) {
    const parent = entry.parent;
    if (!selected.has(parent.id)) {
      return createMindMapNodeLocator(document, parent.id);
    }
    entry = index.get(parent.id);
  }
  return createMindMapNodeLocator(document, document.root.id);
}

function resolveLocatorId(
  document: MindMapDocument,
  locator: MindMapNodeLocator | null,
): string | null {
  return locator === null
    ? null
    : resolveMindMapNodeLocator(document, locator)?.id ?? null;
}

function createTopicCommandResult(
  document: MindMapDocument,
  selectedNodeIds: readonly string[],
  primaryNodeId: string | null,
  changed: boolean,
  beginEditNodeId: string | null = null,
): MindMapTopicCommandResult {
  return {
    changed,
    document,
    selectedNodeIds: [...selectedNodeIds],
    primaryNodeId,
    beginEditNodeId,
  };
}

function createSourceDescriptor(file: TFile): MindMapSource {
  return {
    path: file.path,
    basename: file.basename,
    name: file.name,
    extension: file.extension.toLowerCase(),
  };
}

function createNodeEditResult(
  content: string,
  file: TFile,
  original: MindMapNodeEditSnapshot,
): MindMapNodeEditResult {
  const document = parseMarkdown(content, file.path, file.basename);
  if (original.kind === "root") {
    return {
      document,
      nodeId: document.root.id,
    };
  }

  const pending = [...document.root.children];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      continue;
    }
    if (
      node.kind === original.kind &&
      node.source.line === original.source.line &&
      node.source.ch === original.source.ch
    ) {
      return {
        document,
        nodeId: node.id,
      };
    }
    for (const child of node.children) {
      pending.push(child);
    }
  }

  throw new ObMindLocalizedError("error.verification-failed");
}

function findCreatedMindMapNode(
  content: string,
  file: TFile,
  plan: NodeInsertionPlan,
): Exclude<MindMapNode, { readonly kind: "root" }> {
  const document = parseMarkdown(content, file.path, file.basename);
  const pending = [...document.root.children];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      continue;
    }
    if (
      node.source.line === plan.sourceLine &&
      node.kind === plan.createdNodeKind
    ) {
      return node;
    }
    for (const child of node.children) {
      pending.push(child);
    }
  }

  throw new ObMindLocalizedError("error.verification-failed");
}

function findMovedMindMapNode(
  content: string,
  file: TFile,
  sourceNode: MindMapNodeEditSnapshot,
  plan: NodeMovePlan,
): Exclude<MindMapNode, { readonly kind: "root" }> {
  if (sourceNode.kind === "root") {
    throw new ObMindLocalizedError("error.root-protected");
  }
  const document = parseMarkdown(content, file.path, file.basename);
  const pending = [...document.root.children];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      continue;
    }
    if (
      node.source.line === plan.movedSourceLine &&
      node.kind === sourceNode.kind
    ) {
      return node;
    }
    pending.push(...node.children);
  }

  throw new ObMindLocalizedError("error.verification-failed");
}

function nextRevision(revision: string | number): string | number {
  return typeof revision === "number"
    ? revision + 1
    : `${revision}:next`;
}
