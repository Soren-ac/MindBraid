import { describe, expect, it, vi } from "vitest";

import {
	countMindMapBranch,
	createMindMapDisclosureDescription,
	resolveMindMapDisclosurePlacement,
	resolveMindMapOutgoingOrientation,
	resolveMindMapPositionedBranchOrientation,
	type MindMapDisclosureAccessibleTextContext,
} from "../src/layout/collapse-indicator";
import type { LayoutOrientation, MindMapNode } from "../src/core/model";
import type { PositionedNode } from "../src/layout/layout";

function makeNode(
	id: string,
	children: readonly MindMapNode[] = [],
	text = id,
): MindMapNode {
	return {
		id,
		kind: "root",
		text,
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
	return makeNode(
		"branch",
		[
			makeNode("first"),
			makeNode("second", [
				makeNode("grandchild", [makeNode("great-grandchild")]),
			]),
		],
		"  Branch\n topic  ",
	);
}

function makeHeading(
	id: string,
	children: readonly MindMapNode[] = [],
): MindMapNode {
	return {
		id,
		kind: "heading",
		level: 1,
		text: id,
		links: [],
		sourceLine: `# ${id}`,
		source: {
			path: "note.md",
			line: 0,
			ch: 0,
		},
		children,
	};
}

function positionNode(
	node: MindMapNode,
	x: number,
	y: number,
): PositionedNode {
	return {
		node,
		x,
		y,
		width: 100,
		height: 40,
		depth: node.kind === "root" ? 0 : 1,
	};
}

describe("mind-map disclosure counts", () => {
	it("distinguishes direct children from every nested descendant", () => {
		expect(countMindMapBranch(makeTree())).toEqual({
			directChildCount: 2,
			totalDescendantCount: 4,
		});
	});

	it("reports zero counts for a leaf", () => {
		expect(countMindMapBranch(makeNode("leaf"))).toEqual({
			directChildCount: 0,
			totalDescendantCount: 0,
		});
	});
});

describe("mind-map disclosure descriptions", () => {
	it("returns no disclosure control for a leaf", () => {
		expect(
			createMindMapDisclosureDescription(
				makeNode("leaf"),
				new Set(["leaf"]),
			),
		).toBeNull();
	});

	it("describes an expanded topic without claiming descendants are hidden", () => {
		expect(
			createMindMapDisclosureDescription(makeTree(), new Set()),
		).toEqual({
			nodeId: "branch",
			nodeText: "Branch topic",
			state: "expanded",
			expanded: true,
			directChildCount: 2,
			totalDescendantCount: 4,
			hiddenDescendantCount: 0,
			accessibleText:
				"Collapse Branch topic; 2 direct children, 4 descendants.",
		});
	});

	it("describes a collapsed topic and counts every hidden descendant", () => {
		expect(
			createMindMapDisclosureDescription(
				makeTree(),
				new Set(["branch"]),
			),
		).toEqual({
			nodeId: "branch",
			nodeText: "Branch topic",
			state: "collapsed",
			expanded: false,
			directChildCount: 2,
			totalDescendantCount: 4,
			hiddenDescendantCount: 4,
			accessibleText: "Expand Branch topic; 4 hidden descendants.",
		});
	});

	it("supports replaceable accessible text and an untitled fallback", () => {
		const formatter = vi.fn(
			(context: MindMapDisclosureAccessibleTextContext) =>
				`${context.state}:${context.nodeText}:${context.directChildCount}`,
		);
		const description = createMindMapDisclosureDescription(
			makeNode("blank", [makeNode("child")], " \n "),
			new Set(["blank"]),
			formatter,
		);

		expect(formatter).toHaveBeenCalledWith({
			nodeId: "blank",
			nodeText: "Untitled topic",
			state: "collapsed",
			expanded: false,
			directChildCount: 1,
			totalDescendantCount: 1,
			hiddenDescendantCount: 1,
		});
		expect(description?.accessibleText).toBe(
			"collapsed:Untitled topic:1",
		);
	});

	it("uses singular accessible labels for one child", () => {
		expect(
			createMindMapDisclosureDescription(
				makeNode("parent", [makeNode("child")]),
				new Set(),
			)?.accessibleText,
		).toBe("Collapse parent; 1 direct child, 1 descendant.");
	});

	it("keeps large collapsed counts exact for expandable badges", () => {
		const branch = makeNode(
			"large",
			Array.from({ length: 100 }, (_, index) =>
				makeNode(`child-${index}`),
			),
		);

		expect(
			createMindMapDisclosureDescription(
				branch,
				new Set(["large"]),
			),
		).toMatchObject({
			directChildCount: 100,
			totalDescendantCount: 100,
			hiddenDescendantCount: 100,
			accessibleText: "Expand large; 100 hidden descendants.",
		});
	});
});

describe("mind-map disclosure placement", () => {
	it.each<{
		readonly orientation: LayoutOrientation;
		readonly connectionSide: "left" | "right" | "top" | "bottom";
		readonly visualDirection: "left" | "right" | "up" | "down";
	}>([
		{
			orientation: "left-to-right",
			connectionSide: "right",
			visualDirection: "right",
		},
		{
			orientation: "right-to-left",
			connectionSide: "left",
			visualDirection: "left",
		},
		{
			orientation: "top-to-bottom",
			connectionSide: "bottom",
			visualDirection: "down",
		},
		{
			orientation: "bottom-to-top",
			connectionSide: "top",
			visualDirection: "up",
		},
	])(
		"maps $orientation to its child-facing side",
		({ orientation, connectionSide, visualDirection }) => {
			expect(resolveMindMapDisclosurePlacement(orientation)).toEqual({
				orientation,
				connectionSide,
				visualDirection,
			});
		},
	);

	it("uses visible child geometry before the configured orientation", () => {
		const child = makeHeading("child");
		const parent = makeNode("parent", [child]);

		expect(
			resolveMindMapOutgoingOrientation({
				node: parent,
				positionedNode: positionNode(parent, 200, 200),
				visibleChildren: [positionNode(child, 40, 200)],
				positionedRoot: positionNode(parent, 200, 200),
				fallback: "left-to-right",
			}),
		).toBe("right-to-left");
	});

	it("keeps a collapsed bilateral branch pointing away from the root", () => {
		const root = makeNode("root");
		const branch = makeHeading("branch");
		const positionedRoot = positionNode(root, 300, 200);
		const positionedBranch = positionNode(branch, 80, 200);

		expect(
			resolveMindMapOutgoingOrientation({
				node: branch,
				positionedNode: positionedBranch,
				visibleChildren: [],
				positionedRoot,
				fallback: "left-to-right",
			}),
		).toBe("right-to-left");
		expect(
			resolveMindMapPositionedBranchOrientation(
				positionedBranch,
				positionedRoot,
				"left-to-right",
			),
		).toBe("right-to-left");
	});

	it("resolves vertical split branches and preserves the root fallback", () => {
		const root = makeNode("root");
		const branch = makeHeading("branch");
		const positionedRoot = positionNode(root, 100, 300);

		expect(
			resolveMindMapPositionedBranchOrientation(
				positionNode(branch, 100, 80),
				positionedRoot,
				"top-to-bottom",
			),
		).toBe("bottom-to-top");
		expect(
			resolveMindMapPositionedBranchOrientation(
				positionedRoot,
				positionedRoot,
				"top-to-bottom",
			),
		).toBe("top-to-bottom");
	});
});
