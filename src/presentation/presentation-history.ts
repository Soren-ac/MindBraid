export const DEFAULT_PRESENTATION_HISTORY_LIMIT = 50;
export const DEFAULT_PRESENTATION_HISTORY_DOCUMENT_LIMIT = 20;

export type MindMapPresentationHistoryDirection = "undo" | "redo";

export interface MindMapPresentationHistoryEntry<TSnapshot> {
	readonly before: TSnapshot;
	readonly after: TSnapshot;
	readonly label: string;
}

export interface MindMapPresentationHistoryState<TSnapshot> {
	readonly undo: readonly MindMapPresentationHistoryEntry<TSnapshot>[];
	readonly redo: readonly MindMapPresentationHistoryEntry<TSnapshot>[];
}

export function createMindMapPresentationHistoryState<
	TSnapshot,
>(): MindMapPresentationHistoryState<TSnapshot> {
	return { undo: [], redo: [] };
}

export class MindMapPresentationHistory<TSnapshot> {
	private undoEntries: MindMapPresentationHistoryEntry<TSnapshot>[] = [];
	private redoEntries: MindMapPresentationHistoryEntry<TSnapshot>[] = [];

	public constructor(
		private readonly clone: (snapshot: TSnapshot) => TSnapshot,
		private readonly limit = DEFAULT_PRESENTATION_HISTORY_LIMIT,
	) {
		if (!Number.isInteger(limit) || limit < 1) {
			throw new RangeError("Presentation history limit must be positive.");
		}
	}

	public record(
		entry: MindMapPresentationHistoryEntry<TSnapshot>,
	): void {
		this.undoEntries.push(this.cloneEntry(entry));
		if (this.undoEntries.length > this.limit) {
			this.undoEntries.splice(0, this.undoEntries.length - this.limit);
		}
		this.redoEntries = [];
	}

	public peek(
		direction: MindMapPresentationHistoryDirection,
	): MindMapPresentationHistoryEntry<TSnapshot> | null {
		const entries =
			direction === "undo" ? this.undoEntries : this.redoEntries;
		const entry = entries.at(-1);
		return entry === undefined ? null : this.cloneEntry(entry);
	}

	public consume(
		direction: MindMapPresentationHistoryDirection,
	): MindMapPresentationHistoryEntry<TSnapshot> | null {
		const source =
			direction === "undo" ? this.undoEntries : this.redoEntries;
		const destination =
			direction === "undo" ? this.redoEntries : this.undoEntries;
		const entry = source.pop();
		if (entry === undefined) {
			return null;
		}
		destination.push(entry);
		return this.cloneEntry(entry);
	}

	public getState(): MindMapPresentationHistoryState<TSnapshot> {
		return {
			undo: this.undoEntries.map((entry) => this.cloneEntry(entry)),
			redo: this.redoEntries.map((entry) => this.cloneEntry(entry)),
		};
	}

	public clear(): void {
		this.undoEntries = [];
		this.redoEntries = [];
	}

	private cloneEntry(
		entry: MindMapPresentationHistoryEntry<TSnapshot>,
	): MindMapPresentationHistoryEntry<TSnapshot> {
		if (entry.label.trim().length === 0) {
			throw new TypeError("Presentation history entries require a label.");
		}
		return {
			before: this.clone(entry.before),
			after: this.clone(entry.after),
			label: entry.label,
		};
	}
}

/**
 * Bounded LRU container for document-local presentation histories.
 */
export class MindMapPresentationHistoryStore<TSnapshot> {
	private readonly histories = new Map<
		string,
		MindMapPresentationHistory<TSnapshot>
	>();

	public constructor(
		private readonly clone: (snapshot: TSnapshot) => TSnapshot,
		private readonly historyLimit = DEFAULT_PRESENTATION_HISTORY_LIMIT,
		private readonly documentLimit = DEFAULT_PRESENTATION_HISTORY_DOCUMENT_LIMIT,
	) {
		if (!Number.isInteger(documentLimit) || documentLimit < 1) {
			throw new RangeError(
				"Presentation history document limit must be positive.",
			);
		}
	}

	public get(path: string): MindMapPresentationHistory<TSnapshot> | undefined {
		const history = this.histories.get(path);
		if (history === undefined) {
			return undefined;
		}
		this.histories.delete(path);
		this.histories.set(path, history);
		return history;
	}

	public getOrCreate(path: string): MindMapPresentationHistory<TSnapshot> {
		const existing = this.get(path);
		if (existing !== undefined) {
			return existing;
		}
		const history = new MindMapPresentationHistory(
			this.clone,
			this.historyLimit,
		);
		this.histories.set(path, history);
		while (this.histories.size > this.documentLimit) {
			const oldest = this.histories.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			this.histories.delete(oldest);
		}
		return history;
	}

	public migratePath(previousPath: string, nextPath: string): void {
		if (previousPath === nextPath) {
			return;
		}
		const history = this.histories.get(previousPath);
		if (history === undefined) {
			return;
		}
		this.histories.delete(previousPath);
		this.histories.delete(nextPath);
		this.histories.set(nextPath, history);
	}

	public delete(path: string): void {
		this.histories.delete(path);
	}

	public clear(): void {
		for (const history of this.histories.values()) {
			history.clear();
		}
		this.histories.clear();
	}
}
