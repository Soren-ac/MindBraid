import { describe, expect, it } from "vitest";

import {
	MindMapPresentationHistory,
	MindMapPresentationHistoryStore,
} from "../src/presentation/presentation-history";

interface Snapshot {
	readonly value: number;
}

const clone = (snapshot: Snapshot): Snapshot => ({ ...snapshot });

describe("presentation history", () => {
	it("keeps bounded undo/redo snapshots and clears redo on a new edit", () => {
		const history = new MindMapPresentationHistory(clone, 2);
		history.record({ before: { value: 0 }, after: { value: 1 }, label: "one" });
		history.record({ before: { value: 1 }, after: { value: 2 }, label: "two" });
		history.record({ before: { value: 2 }, after: { value: 3 }, label: "three" });

		expect(history.getState().undo.map(({ label }) => label)).toEqual([
			"two",
			"three",
		]);
		expect(history.consume("undo")?.before).toEqual({ value: 2 });
		expect(history.peek("redo")?.after).toEqual({ value: 3 });

		history.record({ before: { value: 2 }, after: { value: 4 }, label: "four" });
		expect(history.peek("redo")).toBeNull();
	});

	it("keeps document histories independent and evicts least-recently-used entries", () => {
		const store = new MindMapPresentationHistoryStore(clone, 10, 2);
		store.getOrCreate("A.md").record({
			before: { value: 0 },
			after: { value: 1 },
			label: "A",
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
			label: "change",
		});

		store.migratePath("Old.md", "New.md");

		expect(store.get("Old.md")).toBeUndefined();
		expect(store.get("New.md")?.peek("undo")?.label).toBe("change");
	});
});
