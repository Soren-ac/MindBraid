import { describe, expect, it } from "vitest";

import {
	PresentationGestureConflictError,
	PresentationGestureLifecycleError,
	assertPresentationGestureBaseline,
	beginPresentationGesture,
	cancelPresentationGesture,
	cancelPresentationGestureState,
	commitPresentationGesture,
	completePresentationGesture,
	updatePresentationGesture,
	type PresentationGestureAdapter,
	type PresentationGestureState,
} from "../src/presentation/presentation-gesture";

interface Snapshot {
	readonly revision: number;
	readonly value: number;
	readonly nested: {
		readonly labels: readonly string[];
	};
}

const adapter: PresentationGestureAdapter<Snapshot, number> = {
	clone: (snapshot) => ({
		...snapshot,
		nested: { labels: [...snapshot.nested.labels] },
	}),
	revision: (snapshot) => snapshot.revision,
	apply: (snapshot, value) => ({
		revision: snapshot.revision + 1,
		value,
		nested: { labels: [...snapshot.nested.labels, `value:${value}`] },
	}),
};

function createSnapshot(
	revision = 4,
	value = 20,
): Snapshot {
	return {
		revision,
		value,
		nested: { labels: ["baseline"] },
	};
}

describe("presentation gesture lifecycle", () => {
	it("begins and updates an immutable active preview while preserving its baseline", () => {
		const baseline = createSnapshot();
		const started = beginPresentationGesture(" spacing-level ", baseline, adapter);
		const updated = updatePresentationGesture(
			started,
			"spacing-level",
			30,
			adapter,
		);
		const updatedAgain = updatePresentationGesture(
			updated,
			" spacing-level ",
			42,
			adapter,
		);

		expect(started).toMatchObject({
			id: "spacing-level",
			lifecycle: "active",
			baseRevision: 4,
			before: createSnapshot(),
		});
		expect(updated.preview).toEqual({
			revision: 5,
			value: 30,
			nested: { labels: ["baseline", "value:30"] },
		});
		expect(updatedAgain.preview).toEqual({
			revision: 6,
			value: 42,
			nested: {
				labels: ["baseline", "value:30", "value:42"],
			},
		});
		expect(started.before).toEqual(createSnapshot());
		expect(started.preview).toEqual(createSnapshot());
		expect(updated.before).not.toBe(started.before);
		expect(updated.preview).not.toBe(started.preview);

		(baseline.nested.labels as string[]).push("external mutation");
		expect(started.before.nested.labels).toEqual(["baseline"]);
		expect(updatedAgain.before.nested.labels).toEqual(["baseline"]);
	});

	it("commits exactly once through a terminal state and keeps completion snapshots owned", () => {
		const active = updatePresentationGesture(
			beginPresentationGesture("font-size", createSnapshot(), adapter),
			"font-size",
			18,
			adapter,
		);
		const committed = commitPresentationGesture(
			active,
			"font-size",
			createSnapshot(),
			adapter,
		);
		const lifecycle: PresentationGestureState<Snapshot> = committed;

		expect(committed).toMatchObject({
			lifecycle: "committed",
			before: createSnapshot(),
			after: {
				revision: 5,
				value: 18,
			},
		});
		expect(committed.after).not.toBe(committed.preview);
		(committed.after.nested.labels as string[]).push("consumer mutation");
		expect(committed.preview.nested.labels).toEqual([
			"baseline",
			"value:18",
		]);

		expect(() =>
			updatePresentationGesture(lifecycle, "font-size", 20, adapter),
		).toThrow(PresentationGestureLifecycleError);
		expect(() =>
			commitPresentationGesture(
				lifecycle,
				"font-size",
				createSnapshot(),
				adapter,
			),
		).toThrow(PresentationGestureLifecycleError);
		expect(() =>
			assertPresentationGestureBaseline(
				lifecycle,
				createSnapshot(),
				adapter.revision,
			),
		).toThrow(PresentationGestureLifecycleError);
	});

	it("checks the live baseline before strong completion and leaves a rejected gesture active", () => {
		const active = updatePresentationGesture(
			beginPresentationGesture("radius", createSnapshot(7, 12), adapter),
			"radius",
			16,
			adapter,
		);

		expect(() =>
			completePresentationGesture(
				active,
				"radius",
				createSnapshot(8, 12),
				adapter,
			),
		).toThrow(PresentationGestureConflictError);
		expect(active.lifecycle).toBe("active");
		expect(() =>
			assertPresentationGestureBaseline(
				active,
				createSnapshot(8, 12),
				adapter.revision,
			),
		).toThrow(PresentationGestureConflictError);

		const committed = completePresentationGesture(
			active,
			"radius",
			createSnapshot(7, 12),
			adapter,
		);
		expect(committed.lifecycle).toBe("committed");
	});

	it("cancels to an owned baseline and rejects later updates or commits", () => {
		const active = updatePresentationGesture(
			beginPresentationGesture("padding", createSnapshot(), adapter),
			"padding",
			28,
			adapter,
		);
		const cancelled = cancelPresentationGestureState(
			active,
			"padding",
			adapter.clone,
		);

		expect(cancelled).toMatchObject({
			lifecycle: "cancelled",
			restored: createSnapshot(),
		});
		expect(cancelled.restored).not.toBe(cancelled.before);
		expect(() =>
			updatePresentationGesture(cancelled, "padding", 30, adapter),
		).toThrow(PresentationGestureLifecycleError);
		expect(() =>
			completePresentationGesture(
				cancelled,
				"padding",
				createSnapshot(),
				adapter,
			),
		).toThrow(PresentationGestureLifecycleError);
		expect(() =>
			cancelPresentationGestureState(
				cancelled,
				"padding",
				adapter.clone,
			),
		).toThrow(PresentationGestureLifecycleError);

		const restored = cancelPresentationGesture(active, "padding", adapter.clone);
		expect(restored).toEqual(createSnapshot());
		expect(restored).not.toBe(active.before);
	});

	it("keeps the legacy completion call source-compatible while returning a terminal state", () => {
		const active = beginPresentationGesture("legacy", createSnapshot(), adapter);
		const completed = completePresentationGesture(
			active,
			"legacy",
			adapter.clone,
		);

		expect(completed).toMatchObject({
			lifecycle: "committed",
			before: createSnapshot(),
			after: createSnapshot(),
		});
		expect(() =>
			updatePresentationGesture(completed, "legacy", 24, adapter),
		).toThrow(PresentationGestureLifecycleError);
	});

	it("enforces gesture ownership and rejects invalid lifecycle or revision transitions", () => {
		const active = beginPresentationGesture("width", createSnapshot(3, 1), adapter);

		expect(() =>
			updatePresentationGesture(active, "other-width", 2, adapter),
		).toThrow(PresentationGestureConflictError);
		expect(() =>
			cancelPresentationGestureState(active, "other-width", adapter.clone),
		).toThrow(PresentationGestureConflictError);
		expect(() =>
			completePresentationGesture(
				active,
				"other-width",
				createSnapshot(3, 1),
				adapter,
			),
		).toThrow(PresentationGestureConflictError);
		expect(() =>
			updatePresentationGesture(active, "width", 2, {
				...adapter,
				apply: (snapshot) => ({
					...snapshot,
					revision: 2,
				}),
			}),
		).toThrow("previous revision");
		expect(() =>
			beginPresentationGesture(" ", createSnapshot(), adapter),
		).toThrow(TypeError);
		expect(() =>
			beginPresentationGesture("broken", createSnapshot(Number.NaN), adapter),
		).toThrow("non-negative safe integer");
	});

	it("detects a state whose nominally readonly baseline was mutated at runtime", () => {
		const active = beginPresentationGesture("line-width", createSnapshot(), adapter);
		(active.before as { revision: number }).revision = 9;

		expect(() =>
			updatePresentationGesture(active, "line-width", 3, adapter),
		).toThrow("baseline was mutated");
	});
});
