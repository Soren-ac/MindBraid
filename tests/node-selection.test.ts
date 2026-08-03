import { describe, expect, it } from "vitest";

import {
	applyMindMapSelection,
	collectMindMapNodesInRectangle,
	collectMindMapSelectionRange,
	createEmptyMindMapSelectionState,
	type MindMapSelectionState,
} from "../src/topic/interaction/node-selection";

const VISIBLE_ORDER = ["root", "a", "a-1", "a-2", "b", "c"] as const;

function state(
	selectedNodeIds: readonly string[],
	primaryNodeId: string | null,
	anchorNodeId: string | null,
): MindMapSelectionState {
	return {
		selectedNodeIds: new Set(selectedNodeIds),
		primaryNodeId,
		anchorNodeId,
	};
}

function selected(result: MindMapSelectionState): readonly string[] {
	return [...result.selectedNodeIds];
}

describe("applyMindMapSelection", () => {
	it("replaces selection and establishes a new anchor", () => {
		const previous = state(["a", "b"], "b", "a");
		const result = applyMindMapSelection({
			state: previous,
			nodeId: "c",
			mode: "replace",
			orderedNodeIds: VISIBLE_ORDER,
		});

		expect(selected(result)).toEqual(["c"]);
		expect(result.primaryNodeId).toBe("c");
		expect(result.anchorNodeId).toBe("c");
		expect(selected(previous)).toEqual(["a", "b"]);
		expect(result.selectedNodeIds).not.toBe(previous.selectedNodeIds);
	});

	it("adds without mutating the caller's Set", () => {
		const previous = state(["a"], "a", "a");
		const result = applyMindMapSelection({
			state: previous,
			nodeId: "b",
			mode: "add",
		});

		expect(selected(result)).toEqual(["a", "b"]);
		expect(result.primaryNodeId).toBe("b");
		expect(result.anchorNodeId).toBe("b");
		expect(selected(previous)).toEqual(["a"]);
	});

	it("toggles a node on and makes it the primary range anchor", () => {
		const result = applyMindMapSelection({
			state: state(["a"], "a", "a"),
			nodeId: "b",
			mode: "toggle",
		});

		expect(selected(result)).toEqual(["a", "b"]);
		expect(result.primaryNodeId).toBe("b");
		expect(result.anchorNodeId).toBe("b");
	});

	it("toggles a node off and deterministically retains another primary", () => {
		const result = applyMindMapSelection({
			state: state(["a", "b", "c"], "b", "b"),
			nodeId: "b",
			mode: "toggle",
			orderedNodeIds: VISIBLE_ORDER,
		});

		expect(selected(result)).toEqual(["a", "c"]);
		expect(result.primaryNodeId).toBe("c");
		expect(result.anchorNodeId).toBe("c");
	});

	it("clears primary and anchor when the final selected node is toggled off", () => {
		const result = applyMindMapSelection({
			state: state(["a"], "a", "a"),
			nodeId: "a",
			mode: "toggle",
		});

		expect(result).toEqual(createEmptyMindMapSelectionState());
	});

	it("selects an inclusive forward range and preserves its anchor", () => {
		const result = applyMindMapSelection({
			state: state(["a"], "a", "a"),
			nodeId: "b",
			mode: "range",
			orderedNodeIds: VISIBLE_ORDER,
		});

		expect(selected(result)).toEqual(["a", "a-1", "a-2", "b"]);
		expect(result.primaryNodeId).toBe("b");
		expect(result.anchorNodeId).toBe("a");
	});

	it("selects an inclusive reverse range in reading order", () => {
		const result = applyMindMapSelection({
			state: state(["b"], "b", "b"),
			nodeId: "a",
			mode: "range",
			orderedNodeIds: VISIBLE_ORDER,
		});

		expect(selected(result)).toEqual(["a", "a-1", "a-2", "b"]);
		expect(result.primaryNodeId).toBe("a");
		expect(result.anchorNodeId).toBe("b");
	});

	it("uses the previous primary when an older state has no anchor", () => {
		const result = applyMindMapSelection({
			state: state(["a"], "a", null),
			nodeId: "a-2",
			mode: "range",
			orderedNodeIds: VISIBLE_ORDER,
		});

		expect(selected(result)).toEqual(["a", "a-1", "a-2"]);
		expect(result.anchorNodeId).toBe("a");
	});

	it("falls back to replacement when an endpoint is not visible", () => {
		const result = applyMindMapSelection({
			state: state(["hidden"], "hidden", "hidden"),
			nodeId: "b",
			mode: "range",
			orderedNodeIds: VISIBLE_ORDER,
		});

		expect(selected(result)).toEqual(["b"]);
		expect(result.primaryNodeId).toBe("b");
		expect(result.anchorNodeId).toBe("b");
	});
});

describe("collectMindMapSelectionRange", () => {
	it("ignores duplicate layout IDs after their first occurrence", () => {
		expect(
			collectMindMapSelectionRange(
				["a", "b", "b", "c"],
				"a",
				"c",
			),
		).toEqual(["a", "b", "c"]);
	});

	it("returns null for a hidden or unknown endpoint", () => {
		expect(
			collectMindMapSelectionRange(VISIBLE_ORDER, "a", "hidden"),
		).toBeNull();
	});
});

describe("collectMindMapNodesInRectangle", () => {
	it("returns visible nodes intersecting a normalized scene rectangle", () => {
		const nodes = [
			{ id: "a", x: 0, y: 0, width: 20, height: 20 },
			{ id: "b", x: 30, y: 30, width: 20, height: 20 },
			{ id: "c", x: 80, y: 80, width: 10, height: 10 },
		];

		expect(
			collectMindMapNodesInRectangle(nodes, {
				left: 45,
				top: 45,
				right: 10,
				bottom: 10,
			}),
		).toEqual(["a", "b"]);
	});

	it("ignores invalid node geometry", () => {
		expect(
			collectMindMapNodesInRectangle(
				[
					{
						id: "invalid",
						x: Number.NaN,
						y: 0,
						width: 10,
						height: 10,
					},
				],
				{ left: 0, top: 0, right: 20, bottom: 20 },
			),
		).toEqual([]);
	});
});
