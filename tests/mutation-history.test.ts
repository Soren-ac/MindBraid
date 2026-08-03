import { describe, expect, it } from "vitest";

import {
	createMindMapMutationHistoryState,
	MindMapMutationHistory,
	MindMapMutationHistoryError,
	MindMapMutationHistoryStore,
	type MindMapMutationHistoryCurrentSource,
	type MindMapMutationHistoryEntry,
	type MindMapMutationHistoryState,
} from "../src/application/history/mutation-history";
import { createMindMapNodeLocator } from "../src/topic/node-identity";
import { createMarkdownSourceRevision, parseMarkdown } from "../src/core/parser";

const NOTE_PATH = "History.md";

describe("MindMapMutationHistory", () => {
	it("peeks without advancing and commits undo/redo after a verified write", () => {
		const before = state("# Before", "Before");
		const after = state("# After", "After");
		const history = new MindMapMutationHistory();
		history.push(entry(before, after, "Rename topic"));

		const undo = history.peekUndo(current(after));

		expect(undo?.replacement.content).toBe("# Before");
		expect(undo?.selection?.documentPath).toBe(NOTE_PATH);
		expect(history.undoDepth).toBe(1);
		expect(history.redoDepth).toBe(0);
		if (undo === null) {
			throw new Error("Expected an undo operation.");
		}

		history.commit(undo, current(before));
		expect(history.undoDepth).toBe(0);
		expect(history.redoDepth).toBe(1);

		const redo = history.peekRedo(current(before));
		expect(redo?.replacement.content).toBe("# After");
		if (redo === null) {
			throw new Error("Expected a redo operation.");
		}
			history.commit(redo, current(after));
			expect(history.undoDepth).toBe(1);
			expect(history.redoDepth).toBe(0);
		});

	it("undoes multiple commands in reverse and redoes them forward", () => {
		const first = state("# One", "One");
		const second = state("# Two", "Two");
		const third = state("# Three", "Three");
		const history = new MindMapMutationHistory();
		history.push(entry(first, second));
		history.push(entry(second, third));

		const undoThird = requireOperation(
			history.peek("undo", current(third)),
		);
		history.commit(undoThird, current(second));
		const undoSecond = requireOperation(
			history.peek("undo", current(second)),
		);
		history.commit(undoSecond, current(first));

		const redoSecond = requireOperation(
			history.peek("redo", current(first)),
		);
		expect(redoSecond.replacement.content).toBe("# Two");
		history.commit(redoSecond, current(second));
		const redoThird = requireOperation(
			history.peek("redo", current(second)),
		);
		expect(redoThird.replacement.content).toBe("# Three");
	});

	it("rejects external content changes without consuming history", () => {
		const before = state("# Before", "Before");
		const after = state("# After", "After");
		const history = new MindMapMutationHistory();
		history.push(entry(before, after));
		const external = source("# External");

		expect(() => history.peekUndo(external)).toThrow(
			expect.objectContaining({
				code: "stale-source",
			}),
		);
			expect(history.undoDepth).toBe(1);
			expect(history.redoDepth).toBe(0);
			expect(
				history.hasApplicableEntry(
					"undo",
					NOTE_PATH,
					external.revision,
				),
			).toBe(false);
			expect(
				history.hasApplicableEntry(
					"undo",
					NOTE_PATH,
					after.revision,
				),
			).toBe(true);
		});

	it("does not advance when the host did not apply the replacement exactly", () => {
		const before = state("# Before", "Before");
		const after = state("# After", "After");
		const history = new MindMapMutationHistory();
		history.push(entry(before, after));
		const operation = requireOperation(
			history.peekUndo(current(after)),
		);

		expect(() =>
			history.commit(operation, source("# Different")),
		).toThrow(
			expect.objectContaining({
				code: "stale-source",
			}),
		);
		expect(history.undoDepth).toBe(1);
		expect(history.redoDepth).toBe(0);
	});

	it("invalidates a prepared operation when history changes", () => {
		const first = state("# One", "One");
		const second = state("# Two", "Two");
		const third = state("# Three", "Three");
		const history = new MindMapMutationHistory();
		history.push(entry(first, second));
		const prepared = requireOperation(
			history.peekUndo(current(second)),
		);
		history.push(entry(second, third));

		expect(() =>
			history.commit(prepared, current(first)),
		).toThrow(
			expect.objectContaining({
				code: "invalid-operation",
			}),
		);
		expect(history.undoDepth).toBe(2);
	});

	it("clears redo when a new completed mutation is pushed", () => {
		const first = state("# One", "One");
		const second = state("# Two", "Two");
		const alternate = state("# Alternate", "Alternate");
		const history = new MindMapMutationHistory();
		history.push(entry(first, second));
		const undo = requireOperation(
			history.peekUndo(current(second)),
		);
		history.commit(undo, current(first));
		expect(history.redoDepth).toBe(1);

		history.push(entry(first, alternate));

		expect(history.redoDepth).toBe(0);
		expect(history.peekRedo(current(alternate))).toBeNull();
	});

	it("bounds the undo stack and drops the oldest entries", () => {
		const one = state("# One", "One");
		const two = state("# Two", "Two");
		const three = state("# Three", "Three");
		const four = state("# Four", "Four");
		const history = new MindMapMutationHistory(2);

		history.push(entry(one, two));
		history.push(entry(two, three));
		history.push(entry(three, four));

		expect(history.undoDepth).toBe(2);
		const undoFour = requireOperation(
			history.peekUndo(current(four)),
		);
		history.commit(undoFour, current(three));
		const undoThree = requireOperation(
			history.peekUndo(current(three)),
		);
		history.commit(undoThree, current(two));
		expect(history.peekUndo(current(two))).toBeNull();
	});

	it("clears both stacks and invalidates old operations", () => {
		const before = state("# Before", "Before");
		const after = state("# After", "After");
		const history = new MindMapMutationHistory();
		history.push(entry(before, after));
		const prepared = requireOperation(
			history.peekUndo(current(after)),
		);

		history.clear();

		expect(history.undoDepth).toBe(0);
		expect(history.redoDepth).toBe(0);
		expect(() =>
			history.commit(prepared, current(before)),
		).toThrow(
			expect.objectContaining({
				code: "invalid-operation",
			}),
		);
	});

	it("rejects a history operation for another document", () => {
		const before = state("# Before", "Before");
		const after = state("# After", "After");
		const history = new MindMapMutationHistory();
		history.push(entry(before, after));

		expect(() =>
			history.peekUndo({
				...current(after),
				path: "Other.md",
			}),
		).toThrow(
			expect.objectContaining({
				code: "document-mismatch",
			}),
		);
		expect(history.undoDepth).toBe(1);
	});

	it("rejects inconsistent revisions, no-ops, and cross-document selections", () => {
		const before = state("# Before", "Before");
		const after = state("# After", "After");
		const history = new MindMapMutationHistory();
		const inconsistent: MindMapMutationHistoryState = {
			...after,
			revision: "forged",
		};
		const otherDocument = parseMarkdown(
			"# Other",
			"Other.md",
			"Other",
		);
		const otherSelection = createMindMapNodeLocator(
			otherDocument,
			otherDocument.root.children[0]?.id ?? "",
		);

		expect(() =>
			history.push(entry(before, inconsistent)),
		).toThrow(MindMapMutationHistoryError);
		expect(() =>
			history.push(entry(before, before)),
		).toThrow(
			expect.objectContaining({
				code: "invalid-entry",
			}),
		);
		expect(() =>
			history.push({
				path: NOTE_PATH,
				before,
				after: {
					...after,
					selection: otherSelection,
				},
			}),
		).toThrow(
			expect.objectContaining({
				code: "invalid-entry",
			}),
		);
	});

	it("rejects invalid limits and internally inconsistent current snapshots", () => {
		expect(() => new MindMapMutationHistory(0)).toThrow(RangeError);
		const history = new MindMapMutationHistory();
		const before = state("# Before", "Before");
		const after = state("# After", "After");
		history.push(entry(before, after));

		expect(() =>
			history.peekUndo({
				path: NOTE_PATH,
				content: after.content,
				revision: "forged",
			}),
		).toThrow(
			expect.objectContaining({
				code: "stale-source",
			}),
		);
	});
});

describe("MindMapMutationHistoryStore", () => {
	it("evicts the least recently used document history", () => {
		const store = new MindMapMutationHistoryStore(2, 3);
		const first = store.getOrCreate("First.md");
		store.getOrCreate("Second.md");
		expect(store.get("First.md")).toBe(first);

		store.getOrCreate("Third.md");

		expect(store.size).toBe(2);
		expect(store.get("First.md")).toBe(first);
		expect(store.get("Second.md")).toBeUndefined();
		expect(store.get("Third.md")).toBeDefined();
	});

	it("validates limits and supports deletion and clearing", () => {
		expect(() => new MindMapMutationHistoryStore(0)).toThrow(RangeError);
		expect(() => new MindMapMutationHistoryStore(1, 0)).toThrow(RangeError);
		const store = new MindMapMutationHistoryStore(2, 2);
		store.getOrCreate("One.md");
		expect(store.delete("One.md")).toBe(true);
		store.getOrCreate("Two.md");
		store.clear();
		expect(store.size).toBe(0);
	});
});

function state(
	content: string,
	selectedText: string,
): MindMapMutationHistoryState {
	const document = parseMarkdown(content, NOTE_PATH, "History");
	const selected = document.root.children.find(
		(node) => node.text === selectedText,
	);
	const locator =
		selected === undefined
			? null
			: createMindMapNodeLocator(document, selected.id);
	return createMindMapMutationHistoryState(content, locator);
}

function current(
	stateSnapshot: MindMapMutationHistoryState,
): MindMapMutationHistoryCurrentSource {
	return {
		path: NOTE_PATH,
		revision: stateSnapshot.revision,
		content: stateSnapshot.content,
	};
}

function source(content: string): MindMapMutationHistoryCurrentSource {
	return {
		path: NOTE_PATH,
		revision: createMarkdownSourceRevision(content),
		content,
	};
}

function entry(
	before: MindMapMutationHistoryState,
	after: MindMapMutationHistoryState,
	label?: string,
): MindMapMutationHistoryEntry {
	return {
		path: NOTE_PATH,
		before,
		after,
		...(label === undefined ? {} : { label }),
	};
}

function requireOperation<Operation>(
	operation: Operation | null,
): Operation {
	if (operation === null) {
		throw new Error("Expected a history operation.");
	}
	return operation;
}
