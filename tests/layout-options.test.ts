import { describe, expect, it } from "vitest";

import {
	BILATERAL_TREE_LAYOUT_ENGINE,
	BILATERAL_TREE_LAYOUT_ENGINE_ID,
	resolveBilateralRootChildDropOrientation,
} from "../src/layout/bilateral-layout";
import {
	BUILT_IN_TREE_LAYOUT_ENGINE,
	TREE_LAYOUT_ENGINE_ID,
	type LayoutResult,
	type NodeSize,
	type PositionedNode,
} from "../src/layout/layout";
import {
	BUILT_IN_BILATERAL_TREE_LAYOUT_OPTION_SCHEMA,
	BUILT_IN_TREE_LAYOUT_OPTION_SCHEMA,
	createMindMapLayoutOptionSchema,
	resolveMindMapBilateralTreeLayoutOptions,
	resolveMindMapTreeLayoutOptions,
	type MindMapBilateralRootBranchDistribution,
} from "../src/layout/layout-options";
import type { LayoutOrientation, MindMapNode } from "../src/core/model";
import { BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION } from "../src/application/composition/built-in-composition";
import { createDefaultMindMapPresentation } from "../src/presentation/presentation";
import { applyMindMapPresentationPatch } from "../src/presentation/presentation-patch";

function makeNode(
	id: string,
	children: readonly MindMapNode[] = [],
): MindMapNode {
	return { id, children } as unknown as MindMapNode;
}

function measure(
	root: MindMapNode,
	sizes: Readonly<Record<string, NodeSize>> = {},
): ReadonlyMap<string, NodeSize> {
	const result = new Map<string, NodeSize>();
	const pending = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		result.set(node.id, sizes[node.id] ?? { width: 100, height: 40 });
		pending.push(...node.children);
	}
	return result;
}

function layoutTree(
	root: MindMapNode,
	options: Readonly<Record<string, unknown>> = {},
): LayoutResult {
	return BUILT_IN_TREE_LAYOUT_ENGINE.layout({
		layoutId: "tree-options-test",
		documentId: root.id,
		revision: 1,
		engineId: TREE_LAYOUT_ENGINE_ID,
		root,
		sizes: measure(root, {
			a: { width: 80, height: 40 },
			b: { width: 220, height: 40 },
		}),
		orientation: "left-to-right",
		collapsedIds: new Set(),
		spacing: {
			primaryGap: 80,
			secondaryGap: 20,
			siblingGap: 20,
			subtreeGap: 20,
		},
		options,
	});
}

function layoutBilateral(
	root: MindMapNode,
	options: Readonly<Record<string, unknown>>,
	orientation: LayoutOrientation = "left-to-right",
): LayoutResult {
	return BILATERAL_TREE_LAYOUT_ENGINE.layout({
		layoutId: "bilateral-options-test",
		documentId: root.id,
		revision: 1,
		engineId: BILATERAL_TREE_LAYOUT_ENGINE_ID,
		root,
		sizes: measure(root),
		orientation,
		collapsedIds: new Set(),
		spacing: {
			primaryGap: 80,
			secondaryGap: 20,
			siblingGap: 20,
			subtreeGap: 20,
		},
		options,
	});
}

function byId(nodes: readonly PositionedNode[], id: string): PositionedNode {
	const positioned = nodes.find((candidate) => candidate.node.id === id);
	if (positioned === undefined) {
		throw new Error(`Missing positioned node "${id}".`);
	}
	return positioned;
}

function directChildrenOnPositiveSide(
	result: LayoutResult,
	root: MindMapNode,
): string[] {
	const rootPosition = byId(result.nodes, root.id);
	return root.children
		.filter((child) => {
			const positioned = byId(result.nodes, child.id);
			return positioned.x >= rootPosition.x + rootPosition.width;
		})
		.map((child) => child.id);
}

function rootChildIsOnPositiveSide(
	result: LayoutResult,
	root: MindMapNode,
	childId: string,
	orientation: LayoutOrientation,
): boolean {
	const rootPosition = byId(result.nodes, root.id);
	const childPosition = byId(result.nodes, childId);
	switch (orientation) {
		case "left-to-right":
			return childPosition.x >= rootPosition.x + rootPosition.width;
		case "right-to-left":
			return childPosition.x + childPosition.width <= rootPosition.x;
		case "top-to-bottom":
			return childPosition.y >= rootPosition.y + rootPosition.height;
		case "bottom-to-top":
			return childPosition.y + childPosition.height <= rootPosition.y;
	}
}

function oppositeOrientation(
	orientation: LayoutOrientation,
): LayoutOrientation {
	switch (orientation) {
		case "left-to-right":
			return "right-to-left";
		case "right-to-left":
			return "left-to-right";
		case "top-to-bottom":
			return "bottom-to-top";
		case "bottom-to-top":
			return "top-to-bottom";
	}
}

describe("layout option schemas", () => {
	it("strictly validates boolean, number, and select values while preserving sparse input", () => {
		const schema = createMindMapLayoutOptionSchema([
			{
				key: "enabled",
				label: "Enabled",
				type: "boolean",
				defaultValue: true,
			},
			{
				key: "gapScale",
				label: "Gap scale",
				type: "number",
				defaultValue: 1,
				minimum: 0.5,
				maximum: 2,
				step: 0.25,
			},
			{
				key: "strategy",
				label: "Strategy",
				type: "select",
				defaultValue: "balanced",
				choices: [
					{ value: "balanced", label: "Balanced" },
					{ value: "alternating", label: "Alternating" },
				],
			},
		]);

		expect(
			schema.validate({ enabled: false, gapScale: 1.5, strategy: "alternating" }),
		).toEqual({ enabled: false, gapScale: 1.5, strategy: "alternating" });
		expect(schema.normalize({ strategy: "alternating" })).toEqual({
			enabled: true,
			gapScale: 1,
			strategy: "alternating",
		});
		expect(() => schema.validate({ enabled: "false" })).toThrow(
			"must be true or false",
		);
		expect(() => schema.validate({ gapScale: 4 })).toThrow(
			"outside its supported range",
		);
		expect(() => schema.validate({ strategy: "manual" })).toThrow(
			"unsupported value",
		);
		expect(() => schema.validate({ unknown: true })).toThrow(
			"Unsupported layout option",
		);
		expect(() => schema.normalize(null)).toThrow("must be an object");
	});

	it("rejects malformed definition metadata at registration time", () => {
		expect(() =>
			createMindMapLayoutOptionSchema([
				{
					key: "duplicate",
					label: "First",
					type: "boolean",
					defaultValue: true,
				},
				{
					key: "duplicate",
					label: "Second",
					type: "boolean",
					defaultValue: false,
				},
			]),
		).toThrow("Duplicate layout option key");
		expect(() =>
			createMindMapLayoutOptionSchema([
				{
					key: "invalid",
					label: "Invalid",
					type: "select",
					defaultValue: "missing",
					choices: [{ value: "known", label: "Known" }],
				},
			]),
		).toThrow("default is not a registered choice");
	});
});

describe("built-in layout option resolution", () => {
	it("normalizes tree compactness and same-level alignment independently", () => {
		expect(resolveMindMapTreeLayoutOptions({})).toEqual({
			compactness: "comfortable",
			spacingScale: 1,
			alignSameLevel: true,
		});
		expect(
			resolveMindMapTreeLayoutOptions({
				compactness: "compact",
				alignSameLevel: false,
			}),
		).toEqual({
			compactness: "compact",
			spacingScale: 0.72,
			alignSameLevel: false,
		});
		expect(() =>
			BUILT_IN_TREE_LAYOUT_OPTION_SCHEMA.normalize({ compactness: "wide" }),
		).toThrow("unsupported value");
	});

	it("keeps explicit spacing while compactness changes effective geometry", () => {
		const root = makeNode("root", [makeNode("a"), makeNode("b")]);
		const comfortable = layoutTree(root);
		const compact = layoutTree(root, { compactness: "compact" });
		const rootComfortable = byId(comfortable.nodes, "root");
		const rootCompact = byId(compact.nodes, "root");
		const childComfortable = byId(comfortable.nodes, "a");
		const childCompact = byId(compact.nodes, "a");

		expect(childCompact.x - (rootCompact.x + rootCompact.width)).toBeCloseTo(
			0.72 * (childComfortable.x - (rootComfortable.x + rootComfortable.width)),
		);
	});

	it("uses branch-local flow only when same-level alignment is disabled", () => {
		const root = makeNode("root", [
			makeNode("a", [makeNode("a-child")]),
			makeNode("b", [makeNode("b-child")]),
		]);
		const aligned = layoutTree(root, { alignSameLevel: true });
		const branchLocal = layoutTree(root, { alignSameLevel: false });

		expect(byId(aligned.nodes, "a-child").x).toBe(
			byId(aligned.nodes, "b-child").x,
		);
		expect(byId(branchLocal.nodes, "a-child").x).toBeLessThan(
			byId(branchLocal.nodes, "b-child").x,
		);
	});

	it("rejects an option owned by a different layout engine at execution time", () => {
		const root = makeNode("root", [makeNode("a")]);
		expect(() =>
			layoutTree(root, { balanceStrategy: "alternating" }),
		).toThrow("Unsupported layout option");
	});
});

describe("bilateral root distribution", () => {
	it("offers automatic balancing, alternating symmetry, and primary-side placement", () => {
		const root = makeNode("root", [
			makeNode("a", [makeNode("a-1", [makeNode("a-2")])]),
			makeNode("b"),
			makeNode("c"),
			makeNode("d"),
		]);

		const balanced = layoutBilateral(root, {
			balanceStrategy: "balanced-by-weight",
		});
		const alternating = layoutBilateral(root, {
			balanceStrategy: "alternating",
		});
		const primarySide = layoutBilateral(root, {
			balanceStrategy: "primary-side",
		});

		expect(directChildrenOnPositiveSide(balanced, root)).toEqual(["a"]);
		expect(directChildrenOnPositiveSide(alternating, root)).toEqual([
			"a",
			"c",
		]);
		expect(directChildrenOnPositiveSide(primarySide, root)).toEqual([
			"a",
			"b",
			"c",
			"d",
		]);
	});

	it.each([
		"balanced-by-weight",
		"alternating",
		"primary-side",
	] as const)(
		"keeps %s drag preview and committed root allocation consistent in every orientation",
		(strategy) => {
			const source = makeNode("a-child", [makeNode("a-grandchild")]);
			const root = makeNode("root", [
				makeNode("a", [source]),
				makeNode("b"),
				makeNode("c"),
			]);
			// This is the checked structural result of moving a-child to the root:
			// it is detached from a and appended after the existing root branches.
			const committedRoot = makeNode("root", [
				makeNode("a"),
				makeNode("b"),
				makeNode("c"),
				source,
			]);
			const options = {
				balanceStrategy: strategy satisfies MindMapBilateralRootBranchDistribution,
			};

			for (const orientation of [
				"left-to-right",
				"right-to-left",
				"top-to-bottom",
				"bottom-to-top",
			] as const) {
				const previewOrientation = resolveBilateralRootChildDropOrientation(
					root,
					source.id,
					new Set(),
					orientation,
					options,
				);
				const committed = layoutBilateral(
					committedRoot,
					options,
					orientation,
				);
				const expectedOrientation = rootChildIsOnPositiveSide(
					committed,
					committedRoot,
					source.id,
					orientation,
				)
					? orientation
					: oppositeOrientation(orientation);

				expect(previewOrientation).toBe(expectedOrientation);
			}
		},
	);

	it("retains only registered options when a presentation changes engine", () => {
		const capabilities = BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities;
		const initial = createDefaultMindMapPresentation("left-to-right");
		const bilateral = applyMindMapPresentationPatch(
			initial,
			{
				layout: {
					...initial.layout,
					engineId: BILATERAL_TREE_LAYOUT_ENGINE_ID,
					options: {
						compactness: "compact",
						alignSameLevel: false,
						balanceStrategy: "alternating",
					},
				},
			},
			{ capabilities },
		);

		expect(() =>
			applyMindMapPresentationPatch(
				bilateral,
				{
					layout: {
						...bilateral.layout,
						engineId: TREE_LAYOUT_ENGINE_ID,
					},
				},
				{ capabilities },
			),
		).toThrow('Unsupported layout option "balanceStrategy"');

		const switched = applyMindMapPresentationPatch(
			bilateral,
			{
				layout: {
					...bilateral.layout,
					engineId: TREE_LAYOUT_ENGINE_ID,
					options: {
						compactness: "spacious",
						alignSameLevel: true,
					},
				},
			},
			{ capabilities },
		);
		expect(switched.layout.options).toEqual({
			compactness: "spacious",
			alignSameLevel: true,
		});
	});

	it("applies strict layout option validation through presentation patches", () => {
		const capabilities = BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities;
		const current = createDefaultMindMapPresentation("left-to-right");
		const makePatch = (options: Readonly<Record<string, unknown>>) =>
			applyMindMapPresentationPatch(
				current,
				{
					layout: {
						...current.layout,
						options,
					},
				},
				{ capabilities },
			);

		expect(makePatch({ compactness: "compact", alignSameLevel: false }))
			.toMatchObject({
				layout: {
					options: { compactness: "compact", alignSameLevel: false },
				},
			});
		expect(() => makePatch({ compactness: "invalid" })).toThrow(
			"unsupported value",
		);
		expect(() => makePatch({ alignSameLevel: "false" })).toThrow(
			"must be true or false",
		);
		expect(() => makePatch({ balanceStrategy: "alternating" })).toThrow(
			"Unsupported layout option",
		);
	});

	it("strictly validates bilateral-only strategy values", () => {
		expect(
			resolveMindMapBilateralTreeLayoutOptions({
				balanceStrategy: "primary-side",
			}).rootBranchDistribution,
		).toBe("primary-side");
		expect(() =>
			BUILT_IN_BILATERAL_TREE_LAYOUT_OPTION_SCHEMA.validate({
				balanceStrategy: "manual",
			}),
		).toThrow("unsupported value");
	});
});
