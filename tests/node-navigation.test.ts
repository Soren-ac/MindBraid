import { describe, expect, it } from "vitest";

import type { MindMapNode } from "../src/core/model";
import {
	createVisibleMindMapNavigation,
	resolveMindMapArrowNavigationTarget,
	resolveMindMapNavigationKeyIntent,
	resolveVisibleMindMapNavigationTarget,
	type MindMapNavigationTarget,
} from "../src/topic/interaction/node-navigation";

function makeNode(
	id: string,
	children: readonly MindMapNode[] = [],
): MindMapNode {
	return {
		id,
		kind: "root",
		text: id,
		links: [],
		source: {
			path: "note.md",
			line: 0,
			ch: 0,
		},
		children,
	};
}

function makeTree(): MindMapNode {
	return makeNode("root", [
		makeNode("a", [
			makeNode("a-1"),
			makeNode("a-2", [makeNode("a-2-i")]),
		]),
		makeNode("b"),
		makeNode("c", [makeNode("c-1")]),
	]);
}

describe("visible mind-map navigation", () => {
	it("indexes visible nodes in depth-first source order", () => {
		const navigation = createVisibleMindMapNavigation(
			makeTree(),
			new Set(),
		);

		expect(navigation.order).toEqual([
			"root",
			"a",
			"a-1",
			"a-2",
			"a-2-i",
			"b",
			"c",
			"c-1",
		]);
		expect(navigation.nodes.get("a-2")).toMatchObject({
			parentId: "a",
			childIds: ["a-2-i"],
			depth: 2,
			siblingIndex: 1,
			visibleIndex: 3,
		});
	});

	it("omits collapsed descendants from the index and navigation targets", () => {
		const navigation = createVisibleMindMapNavigation(
			makeTree(),
			new Set(["a"]),
		);

		expect(navigation.order).toEqual(["root", "a", "b", "c", "c-1"]);
		expect(navigation.nodes.has("a-1")).toBe(false);
		expect(
			resolveVisibleMindMapNavigationTarget(
				navigation,
				"a",
				"first-child",
			),
		).toBeNull();
		expect(
			resolveVisibleMindMapNavigationTarget(
				navigation,
				"a",
				"next-visible",
			),
		).toBe("b");
	});

	it.each<{
		readonly from: string;
		readonly target: MindMapNavigationTarget;
		readonly expected: string | null;
	}>([
		{ from: "a-2", target: "parent", expected: "a" },
		{ from: "a", target: "first-child", expected: "a-1" },
		{
			from: "a-2",
			target: "previous-sibling",
			expected: "a-1",
		},
		{ from: "a-1", target: "next-sibling", expected: "a-2" },
		{ from: "b", target: "first-sibling", expected: "a" },
		{ from: "b", target: "last-sibling", expected: "c" },
		{ from: "a-2", target: "previous-visible", expected: "a-1" },
		{
			from: "a-2",
			target: "next-visible",
			expected: "a-2-i",
		},
		{ from: "root", target: "parent", expected: null },
		{ from: "root", target: "first-sibling", expected: "root" },
		{ from: "root", target: "last-sibling", expected: "root" },
		{ from: "c", target: "next-sibling", expected: null },
		{ from: "missing", target: "next-visible", expected: null },
	])("resolves $target from $from", ({ from, target, expected }) => {
		const navigation = createVisibleMindMapNavigation(
			makeTree(),
			new Set(),
		);
		expect(
			resolveVisibleMindMapNavigationTarget(
				navigation,
				from,
				target,
			),
		).toBe(expected);
	});

	it("rejects duplicate node IDs instead of creating ambiguous links", () => {
		const root = makeNode("root", [
			makeNode("duplicate"),
			makeNode("duplicate"),
		]);

		expect(() =>
			createVisibleMindMapNavigation(root, new Set()),
		).toThrow('Duplicate mind-map node id "duplicate".');
	});
});

describe("mind-map arrow mapping", () => {
	it.each([
		["left-to-right", "ArrowLeft", "parent"],
		["left-to-right", "ArrowRight", "first-child"],
		["left-to-right", "ArrowUp", "previous-sibling"],
		["left-to-right", "ArrowDown", "next-sibling"],
		["right-to-left", "ArrowRight", "parent"],
		["right-to-left", "ArrowLeft", "first-child"],
		["top-to-bottom", "ArrowUp", "parent"],
		["top-to-bottom", "ArrowDown", "first-child"],
		["top-to-bottom", "ArrowLeft", "previous-sibling"],
		["top-to-bottom", "ArrowRight", "next-sibling"],
		["bottom-to-top", "ArrowDown", "parent"],
		["bottom-to-top", "ArrowUp", "first-child"],
	] as const)(
		"maps %s %s to %s",
		(orientation, key, expected) => {
			expect(
				resolveMindMapArrowNavigationTarget(key, orientation),
			).toBe(expected);
		},
	);

	it("offers an orientation-independent depth-first traversal", () => {
		expect(
			resolveMindMapArrowNavigationTarget(
				"ArrowUp",
				"bottom-to-top",
				"depth-first",
			),
		).toBe("previous-visible");
		expect(
			resolveMindMapArrowNavigationTarget(
				"ArrowDown",
				"right-to-left",
				"depth-first",
			),
		).toBe("next-visible");
		expect(
			resolveMindMapArrowNavigationTarget(
				"ArrowLeft",
				"top-to-bottom",
				"depth-first",
			),
		).toBe("parent");
	});
});

describe("resolveMindMapNavigationKeyIntent", () => {
	it("maps plain arrows and Home/End to navigation intents", () => {
		expect(
			resolveMindMapNavigationKeyIntent({
				key: "ArrowRight",
				orientation: "left-to-right",
			}),
		).toEqual({
			type: "navigate",
			target: "first-child",
		});
		expect(
			resolveMindMapNavigationKeyIntent({
				key: "Home",
				orientation: "top-to-bottom",
			}),
		).toEqual({
			type: "navigate",
			target: "first-sibling",
		});
		expect(
			resolveMindMapNavigationKeyIntent({
				key: "End",
				orientation: "top-to-bottom",
			}),
		).toEqual({
			type: "navigate",
			target: "last-sibling",
		});
	});

	it("maps XMind-style Alt/Option + Up/Down to sibling moves", () => {
		expect(
			resolveMindMapNavigationKeyIntent({
				altKey: true,
				key: "ArrowUp",
				orientation: "left-to-right",
			}),
		).toEqual({
			type: "move-sibling",
			direction: "previous",
		});
		expect(
			resolveMindMapNavigationKeyIntent({
				altKey: true,
				key: "ArrowDown",
				orientation: "top-to-bottom",
			}),
		).toEqual({
			type: "move-sibling",
			direction: "next",
		});
	});

	it.each([
		{ key: "ArrowLeft", metaKey: true },
		{ key: "ArrowRight", ctrlKey: true },
		{ key: "Home", shiftKey: true },
		{ key: "ArrowUp", altKey: true, shiftKey: true },
		{ key: "ArrowUp", altKey: true, repeat: true },
		{ key: "ArrowDown", isComposing: true },
		{ key: "Enter" },
	])("leaves reserved or unrelated gestures unhandled: %o", (gesture) => {
		expect(
			resolveMindMapNavigationKeyIntent({
				orientation: "left-to-right",
				...gesture,
			}),
		).toBeNull();
	});
});
