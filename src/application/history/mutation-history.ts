import type { MindMapNodeLocator } from "../../topic/node-identity";
import { createMarkdownSourceRevision } from "../../core/parser";

export type MindMapMutationHistoryDirection = "undo" | "redo";

export type MindMapMutationHistoryErrorCode =
	| "invalid-entry"
	| "invalid-operation"
	| "document-mismatch"
	| "stale-source";

export class MindMapMutationHistoryError extends Error {
	public constructor(
		public readonly code: MindMapMutationHistoryErrorCode,
		message: string,
	) {
		super(message);
		this.name = "MindMapMutationHistoryError";
	}
}

export interface MindMapMutationHistoryState {
	readonly revision: string;
	readonly content: string;
	readonly selection: MindMapNodeLocator | null;
}

export interface MindMapMutationHistoryEntry {
	readonly path: string;
	readonly before: MindMapMutationHistoryState;
	readonly after: MindMapMutationHistoryState;
	readonly label?: string;
}

export interface MindMapMutationHistoryCurrentSource {
	readonly path: string;
	readonly revision: string;
	readonly content: string;
}

/**
 * Immutable two-phase undo/redo request. The host must atomically replace
 * `expected` with `replacement`, then pass the freshly read replacement source
 * to `commit`. Peeking alone never advances either stack.
 */
export interface MindMapMutationHistoryOperation {
	readonly direction: MindMapMutationHistoryDirection;
	readonly path: string;
	readonly expected: MindMapMutationHistoryState;
	readonly replacement: MindMapMutationHistoryState;
	readonly selection: MindMapNodeLocator | null;
	readonly entry: MindMapMutationHistoryEntry;
	/** Opaque optimistic token checked again by `commit`. */
	readonly token: string;
}

interface StoredMutationHistoryEntry {
	readonly sequence: number;
	readonly entry: MindMapMutationHistoryEntry;
}

export const DEFAULT_MIND_MAP_HISTORY_LIMIT = 100;
export const DEFAULT_MIND_MAP_HISTORY_DOCUMENT_LIMIT = 20;

export function createMindMapMutationHistoryState(
	content: string,
	selection: MindMapNodeLocator | null = null,
): MindMapMutationHistoryState {
	return {
		revision: createMarkdownSourceRevision(content),
		content,
		selection: selection === null ? null : cloneLocator(selection),
	};
}

/**
 * Bounded, framework-free command history. `push` records an already completed
 * explicit mutation. Undo and redo are deliberately split into peek/commit so
 * a failed or stale host write cannot move the history cursor.
 */
export class MindMapMutationHistory {
	private readonly limit: number;
	private readonly undoStack: StoredMutationHistoryEntry[] = [];
	private readonly redoStack: StoredMutationHistoryEntry[] = [];
	private historyRevision = 0;
	private nextSequence = 1;

	public constructor(limit = DEFAULT_MIND_MAP_HISTORY_LIMIT) {
		if (!Number.isInteger(limit) || limit <= 0) {
			throw new RangeError("Mind-map mutation history limit must be positive.");
		}
		this.limit = limit;
	}

	public get undoDepth(): number {
		return this.undoStack.length;
	}

	public get redoDepth(): number {
		return this.redoStack.length;
	}

	/**
	 * Cheap UI availability check against a parsed source revision. The
	 * authoritative `peek` still verifies complete content before applying.
	 */
	public hasApplicableEntry(
		direction: MindMapMutationHistoryDirection,
		path: string,
		revision: string,
	): boolean {
		const stack = direction === "undo" ? this.undoStack : this.redoStack;
		const stored = stack.at(-1);
		if (stored === undefined || stored.entry.path !== path) {
			return false;
		}
		const expected =
			direction === "undo" ? stored.entry.after : stored.entry.before;
		return expected.revision === revision;
	}

	/**
	 * Record one mutation only after its forward source write has succeeded.
	 * Recording a new branch clears redo history.
	 */
	public push(entry: MindMapMutationHistoryEntry): void {
		const stored: StoredMutationHistoryEntry = {
			sequence: this.nextSequence,
			entry: normalizeEntry(entry),
		};
		this.nextSequence += 1;
		this.undoStack.push(stored);
		if (this.undoStack.length > this.limit) {
			this.undoStack.splice(0, this.undoStack.length - this.limit);
		}
		this.redoStack.length = 0;
		this.historyRevision += 1;
	}

	public peek(
		direction: MindMapMutationHistoryDirection,
		current: MindMapMutationHistoryCurrentSource,
	): MindMapMutationHistoryOperation | null {
		validateCurrentSource(current);
		const stack = direction === "undo" ? this.undoStack : this.redoStack;
		const stored = stack.at(-1);
		if (stored === undefined) {
			return null;
		}

		const entry = stored.entry;
		if (current.path !== entry.path) {
			throw new MindMapMutationHistoryError(
				"document-mismatch",
				`The ${direction} entry belongs to "${entry.path}", not "${current.path}".`,
			);
		}
		const expected = direction === "undo" ? entry.after : entry.before;
		const replacement = direction === "undo" ? entry.before : entry.after;
		assertSourceMatches(
			current,
			expected,
			`Cannot ${direction}: the Markdown source changed outside this history.`,
		);

		return {
			direction,
			path: entry.path,
			expected: cloneState(expected),
			replacement: cloneState(replacement),
			selection:
				replacement.selection === null
					? null
					: cloneLocator(replacement.selection),
			entry: cloneEntry(entry),
			token: createOperationToken(
				this.historyRevision,
				stored.sequence,
				direction,
			),
		};
	}

	public peekUndo(
		current: MindMapMutationHistoryCurrentSource,
	): MindMapMutationHistoryOperation | null {
		return this.peek("undo", current);
	}

	public peekRedo(
		current: MindMapMutationHistoryCurrentSource,
	): MindMapMutationHistoryOperation | null {
		return this.peek("redo", current);
	}

	/**
	 * Advance the history only after the host confirms that the replacement
	 * content and revision are now authoritative.
	 */
	public commit(
		operation: MindMapMutationHistoryOperation,
		applied: MindMapMutationHistoryCurrentSource,
	): void {
		validateCurrentSource(applied);
		const sourceStack =
			operation.direction === "undo" ? this.undoStack : this.redoStack;
		const destinationStack =
			operation.direction === "undo" ? this.redoStack : this.undoStack;
		const stored = sourceStack.at(-1);
		if (
			stored === undefined ||
			operation.token !==
				createOperationToken(
					this.historyRevision,
					stored.sequence,
					operation.direction,
				)
		) {
			throw new MindMapMutationHistoryError(
				"invalid-operation",
				"The history changed after this operation was prepared.",
			);
		}
		if (applied.path !== stored.entry.path) {
			throw new MindMapMutationHistoryError(
				"document-mismatch",
				`The applied source "${applied.path}" does not match "${stored.entry.path}".`,
			);
		}

		const expectedReplacement =
			operation.direction === "undo"
				? stored.entry.before
				: stored.entry.after;
		if (!statesEqual(operation.replacement, expectedReplacement)) {
			throw new MindMapMutationHistoryError(
				"invalid-operation",
				"The prepared replacement no longer matches the history entry.",
			);
		}
		assertSourceMatches(
			applied,
			expectedReplacement,
			"The host did not apply the prepared history replacement exactly.",
		);

		sourceStack.pop();
		destinationStack.push(stored);
		this.historyRevision += 1;
	}

	public clear(): void {
		this.undoStack.length = 0;
		this.redoStack.length = 0;
		this.historyRevision += 1;
	}
}

/**
 * Globally bounded LRU collection of per-document histories. Individual
 * histories bound their transaction count; this store also prevents editing
 * an unbounded number of notes from retaining full source snapshots forever.
 */
export class MindMapMutationHistoryStore {
	private readonly histories = new Map<string, MindMapMutationHistory>();

	public constructor(
		private readonly documentLimit =
			DEFAULT_MIND_MAP_HISTORY_DOCUMENT_LIMIT,
		private readonly historyLimit = DEFAULT_MIND_MAP_HISTORY_LIMIT,
	) {
		if (!Number.isInteger(documentLimit) || documentLimit <= 0) {
			throw new RangeError(
				"Mind-map history document limit must be positive.",
			);
		}
		if (!Number.isInteger(historyLimit) || historyLimit <= 0) {
			throw new RangeError(
				"Mind-map per-document history limit must be positive.",
			);
		}
	}

	public get size(): number {
		return this.histories.size;
	}

	public get(path: string): MindMapMutationHistory | undefined {
		const history = this.histories.get(path);
		if (history === undefined) {
			return undefined;
		}
		this.histories.delete(path);
		this.histories.set(path, history);
		return history;
	}

	public getOrCreate(path: string): MindMapMutationHistory {
		const existing = this.get(path);
		if (existing !== undefined) {
			return existing;
		}
		const history = new MindMapMutationHistory(this.historyLimit);
		this.histories.set(path, history);
		while (this.histories.size > this.documentLimit) {
			const oldestPath = this.histories.keys().next().value;
			if (oldestPath === undefined) {
				break;
			}
			this.histories.delete(oldestPath);
		}
		return history;
	}

	public delete(path: string): boolean {
		return this.histories.delete(path);
	}

	public clear(): void {
		this.histories.clear();
	}
}

function normalizeEntry(
	entry: MindMapMutationHistoryEntry,
): MindMapMutationHistoryEntry {
	if (entry.path.trim().length === 0) {
		throw new MindMapMutationHistoryError(
			"invalid-entry",
			"A mutation history entry requires a document path.",
		);
	}
	validateState(entry.before, entry.path);
	validateState(entry.after, entry.path);
	if (
		entry.before.revision === entry.after.revision &&
		entry.before.content === entry.after.content
	) {
		throw new MindMapMutationHistoryError(
			"invalid-entry",
			"A mutation history entry must change the Markdown source.",
		);
	}
	return cloneEntry(entry);
}

function validateState(
	state: MindMapMutationHistoryState,
	path: string,
): void {
	if (state.revision !== createMarkdownSourceRevision(state.content)) {
		throw new MindMapMutationHistoryError(
			"invalid-entry",
			"The mutation history revision does not match its content.",
		);
	}
	if (
		state.selection !== null &&
		state.selection.documentPath !== path
	) {
		throw new MindMapMutationHistoryError(
			"invalid-entry",
			"The mutation history selection belongs to another document.",
		);
	}
}

function validateCurrentSource(
	current: MindMapMutationHistoryCurrentSource,
): void {
	if (
		current.path.trim().length === 0 ||
		current.revision !== createMarkdownSourceRevision(current.content)
	) {
		throw new MindMapMutationHistoryError(
			"stale-source",
			"The current Markdown source snapshot is internally inconsistent.",
		);
	}
}

function assertSourceMatches(
	current: MindMapMutationHistoryCurrentSource,
	expected: MindMapMutationHistoryState,
	message: string,
): void {
	if (
		current.revision !== expected.revision ||
		current.content !== expected.content
	) {
		throw new MindMapMutationHistoryError("stale-source", message);
	}
}

function statesEqual(
	left: MindMapMutationHistoryState,
	right: MindMapMutationHistoryState,
): boolean {
	return (
		left.revision === right.revision &&
		left.content === right.content &&
		locatorsEqual(left.selection, right.selection)
	);
}

function locatorsEqual(
	left: MindMapNodeLocator | null,
	right: MindMapNodeLocator | null,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function cloneEntry(
	entry: MindMapMutationHistoryEntry,
): MindMapMutationHistoryEntry {
	return {
		path: entry.path,
		before: cloneState(entry.before),
		after: cloneState(entry.after),
		...(entry.label === undefined ? {} : { label: entry.label }),
	};
}

function cloneState(
	state: MindMapMutationHistoryState,
): MindMapMutationHistoryState {
	return {
		revision: state.revision,
		content: state.content,
		selection:
			state.selection === null ? null : cloneLocator(state.selection),
	};
}

function cloneLocator(locator: MindMapNodeLocator): MindMapNodeLocator {
	return {
		version: locator.version,
		documentPath: locator.documentPath,
		sourceAnchor: { ...locator.sourceAnchor },
		ancestry: locator.ancestry.map((segment) => ({
			...segment,
			fingerprint: { ...segment.fingerprint },
		})),
		node: {
			...locator.node,
			fingerprint: { ...locator.node.fingerprint },
		},
	};
}

function createOperationToken(
	historyRevision: number,
	sequence: number,
	direction: MindMapMutationHistoryDirection,
): string {
	return `${historyRevision.toString(36)}:${sequence.toString(36)}:${direction}`;
}
