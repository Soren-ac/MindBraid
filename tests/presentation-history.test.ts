import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../src/core/parser";
import {
	createMindMapPresentationHistoryAction,
	createMindMapPresentationHistoryAvailability,
	isMindMapPresentationHistorySourceCurrent,
	MindMapPresentationHistory,
	MindMapPresentationHistoryStore,
} from "../src/presentation/presentation-history";

interface Snapshot {
	readonly value: number;
}

const clone = (snapshot: Snapshot): Snapshot => ({ ...snapshot });
const action = () =>
	createMindMapPresentationHistoryAction("history.change-presentation");

describe("presentation history", () => {
	it("exposes snapshot-free availability with locale-independent actions", () => {
		const history = new MindMapPresentationHistory(clone);

		expect(history.getAvailability()).toEqual(
			createMindMapPresentationHistoryAvailability(),
		);
		history.record({
			before: { value: 1 },
			after: { value: 2 },
			action: action(),
		});
		expect(history.getAvailability()).toEqual({
			hasUndoEntry: true,
			hasRedoEntry: false,
			undoAction: action(),
			redoAction: null,
		});
		history.consume("undo");
		expect(history.getAvailability()).toEqual({
			hasUndoEntry: false,
			hasRedoEntry: true,
			undoAction: null,
			redoAction: action(),
		});
	});

	it("keeps bounded undo/redo snapshots and clears redo on a new edit", () => {
		const history = new MindMapPresentationHistory(clone, 2);
		history.record({ before: { value: 0 }, after: { value: 1 }, action: action() });
		history.record({ before: { value: 1 }, after: { value: 2 }, action: action() });
		history.record({ before: { value: 2 }, after: { value: 3 }, action: action() });

		expect(
			history.getState().undo.map(({ action: entryAction }) =>
				entryAction.translationKey,
			),
		).toEqual(["history.change-presentation", "history.change-presentation"]);
		expect(history.consume("undo")?.before).toEqual({ value: 2 });
		expect(history.peek("redo")?.after).toEqual({ value: 3 });

		history.record({ before: { value: 2 }, after: { value: 4 }, action: action() });
		expect(history.peek("redo")).toBeNull();
	});

	it("clones action interpolation values at history boundaries", () => {
		const history = new MindMapPresentationHistory(clone);
		const values: Record<string, string | number> = { count: 1 };
		history.record({
			before: { value: 0 },
			after: { value: 1 },
			action: createMindMapPresentationHistoryAction(
				"frontend.largeMap.showAll.aria",
				values,
			),
		});
		values.count = 2;

		expect(history.peek("undo")?.action.values).toEqual({ count: 1 });
	});

	it("rejects a queued restore after the authoritative Markdown revision changes", () => {
		const history = new MindMapPresentationHistory(clone);
		history.record({
			before: { value: 0 },
			after: { value: 1 },
			action: action(),
		});
		const expected = parseMarkdown("# Topic", "Map.md", "Map");
		const authoritative = parseMarkdown(
			"# Topic\n- Changed while restore was queued",
			"Map.md",
			"Map",
		);

		expect(
			isMindMapPresentationHistorySourceCurrent(expected, authoritative),
		).toBe(false);
		expect(history.getAvailability().hasUndoEntry).toBe(true);
		expect(history.getAvailability().hasRedoEntry).toBe(false);
	});

	it("keeps document histories independent and evicts least-recently-used entries", () => {
		const store = new MindMapPresentationHistoryStore(clone, 10, 2);
		store.getOrCreate("A.md").record({
			before: { value: 0 },
			after: { value: 1 },
			action: action(),
		});
		store.getOrCreate("B.md");
		store.get("A.md");
		store.getOrCreate("C.md");

		expect(store.get("A.md")).toBeDefined();
		expect(store.get("B.md")).toBeUndefined();
		expect(store.get("C.md")).toBeDefined();
	});

	it("migrates history after a host-confirmed path rename", () => {
		const store = new MindMapPresentationHistoryStore(clone);
		store.getOrCreate("Old.md").record({
			before: { value: 0 },
			after: { value: 1 },
			action: action(),
		});

		store.migratePath("Old.md", "New.md");

		expect(store.get("Old.md")).toBeUndefined();
		expect(
			store.get("New.md")?.peek("undo")?.action.translationKey,
		).toBe("history.change-presentation");
	});
});
