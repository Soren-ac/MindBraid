import type { LayoutDirection, MindMapDocument } from "../core/model";
import { parseMarkdown } from "../core/parser";

export interface MindMapSource {
  readonly path: string;
  readonly basename: string;
  readonly name: string;
  readonly extension: string;
}

interface BaseMindMapViewState {
  readonly direction: LayoutDirection;
}

export interface IdleMindMapViewState extends BaseMindMapViewState {
  readonly status: "idle";
}

export interface UnsupportedMindMapViewState extends BaseMindMapViewState {
  readonly status: "unsupported";
  readonly source: MindMapSource;
}

export interface LoadingMindMapViewState extends BaseMindMapViewState {
  readonly status: "loading";
  readonly source: MindMapSource;
}

export interface ReadyMindMapViewState extends BaseMindMapViewState {
  readonly status: "ready";
  readonly source: MindMapSource;
  readonly document: MindMapDocument;
}

export interface ErrorMindMapViewState extends BaseMindMapViewState {
  readonly status: "error";
  readonly source: MindMapSource | null;
  readonly message: string;
}

export type MindMapViewState =
  | IdleMindMapViewState
  | UnsupportedMindMapViewState
  | LoadingMindMapViewState
  | ReadyMindMapViewState
  | ErrorMindMapViewState;

export type MindMapViewStateListener = (state: MindMapViewState) => void;
export type ContentLoader = () => Promise<string>;

const DEFAULT_DEBOUNCE_MS = 250;

export class MindMapController {
  private readonly listeners = new Set<MindMapViewStateListener>();
  private readonly debounceMs: number;
  private state: MindMapViewState;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private disposed = false;

  public constructor(
    direction: LayoutDirection,
    debounceMs = DEFAULT_DEBOUNCE_MS,
  ) {
    this.debounceMs = debounceMs;
    this.state = {
      status: "idle",
      direction,
    };
  }

  public getState(): MindMapViewState {
    return this.state;
  }

  public getCurrentSourcePath(): string | null {
    return "source" in this.state && this.state.source !== null
      ? this.state.source.path
      : null;
  }

  public subscribe(listener: MindMapViewStateListener): () => void {
    if (this.disposed) {
      return () => undefined;
    }

    this.listeners.add(listener);
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public setDirection(direction: LayoutDirection): void {
    if (this.disposed || this.state.direction === direction) {
      return;
    }

    this.updateState({
      ...this.state,
      direction,
    });
  }

  public setIdle(): void {
    if (this.disposed) {
      return;
    }

    this.invalidatePendingWork();
    this.updateState({
      status: "idle",
      direction: this.state.direction,
    });
  }

  public setUnsupported(source: MindMapSource): void {
    if (this.disposed) {
      return;
    }

    this.invalidatePendingWork();
    this.updateState({
      status: "unsupported",
      source,
      direction: this.state.direction,
    });
  }

  public setError(message: string, source: MindMapSource | null = null): void {
    if (this.disposed) {
      return;
    }

    this.invalidatePendingWork();
    this.updateState({
      status: "error",
      source,
      message,
      direction: this.state.direction,
    });
  }

  public activateMarkdown(source: MindMapSource, loader: ContentLoader): void {
    if (this.disposed) {
      return;
    }

    this.clearDebounceTimer();
    const workGeneration = ++this.generation;

    this.updateState({
      status: "loading",
      source,
      direction: this.state.direction,
    });

    void this.loadAndCommit(source, loader, workGeneration);
  }

  public scheduleContent(source: MindMapSource, content: string): void {
    if (this.disposed || !this.isCurrentMarkdownSource(source.path)) {
      return;
    }

    this.clearDebounceTimer();
    const workGeneration = ++this.generation;

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.parseAndCommit(source, content, workGeneration);
    }, this.debounceMs);
  }

  /**
   * Apply an explicit user commit immediately. Unlike editor typing, an inline
   * node edit is already a completed gesture and should not leave the old label
   * visible for another debounce interval.
   */
  public commitContent(source: MindMapSource, content: string): void {
    if (this.disposed || !this.isCurrentMarkdownSource(source.path)) {
      return;
    }

    this.clearDebounceTimer();
    const workGeneration = ++this.generation;
    this.parseAndCommit(source, content, workGeneration);
  }

  public scheduleReload(source: MindMapSource, loader: ContentLoader): void {
    if (this.disposed || !this.isCurrentMarkdownSource(source.path)) {
      return;
    }

    this.clearDebounceTimer();
    const workGeneration = ++this.generation;

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.loadAndCommit(source, loader, workGeneration);
    }, this.debounceMs);
  }

  public refreshCurrent(loader: ContentLoader): void {
    const source = this.getCurrentMarkdownSource();
    if (source === null) {
      return;
    }

    this.activateMarkdown(source, loader);
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.invalidatePendingWork();
    this.listeners.clear();
  }

  private async loadAndCommit(
    source: MindMapSource,
    loader: ContentLoader,
    workGeneration: number,
  ): Promise<void> {
    try {
      const content = await loader();
      this.parseAndCommit(source, content, workGeneration);
    } catch (error: unknown) {
      if (!this.isWorkCurrent(source.path, workGeneration)) {
        return;
      }

      this.updateState({
        status: "error",
        source,
        message: getErrorMessage(error),
        direction: this.state.direction,
      });
    }
  }

  private parseAndCommit(
    source: MindMapSource,
    content: string,
    workGeneration: number,
  ): void {
    if (!this.isWorkCurrent(source.path, workGeneration)) {
      return;
    }

    try {
      const document = parseMarkdown(content, source.path, source.basename);
      if (!this.isWorkCurrent(source.path, workGeneration)) {
        return;
      }

      if (
        this.state.status === "ready" &&
        this.state.source.path === source.path &&
        this.state.document.sourceRevision === document.sourceRevision
      ) {
        return;
      }

      this.updateState({
        status: "ready",
        source,
        document,
        direction: this.state.direction,
      });
    } catch (error: unknown) {
      this.updateState({
        status: "error",
        source,
        message: getErrorMessage(error),
        direction: this.state.direction,
      });
    }
  }

  private getCurrentMarkdownSource(): MindMapSource | null {
    if (
      this.state.status === "loading" ||
      this.state.status === "ready" ||
      (this.state.status === "error" && this.state.source?.extension === "md")
    ) {
      return this.state.source;
    }

    return null;
  }

  private isCurrentMarkdownSource(path: string): boolean {
    return this.getCurrentMarkdownSource()?.path === path;
  }

  private isWorkCurrent(path: string, workGeneration: number): boolean {
    return (
      !this.disposed &&
      this.generation === workGeneration &&
      this.isCurrentMarkdownSource(path)
    );
  }

  private updateState(state: MindMapViewState): void {
    if (this.disposed) {
      return;
    }

    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private invalidatePendingWork(): void {
    this.clearDebounceTimer();
    this.generation += 1;
  }

  private clearDebounceTimer(): void {
    if (this.debounceTimer === null) {
      return;
    }

    clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown error";
}
