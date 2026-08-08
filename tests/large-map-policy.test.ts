import { describe, expect, it } from "vitest";

import type { MindMapNode } from "../src/core/model";
import {
	DEFAULT_MIND_MAP_LARGE_MAP_POLICY,
	countMindMapNodes,
	resolveMindMapLargeMapProtection,
	resolveMindMapLargeMapProtectionLevel,
} from "../src/layout/large-map-policy";


interface MutableNode {
	readonly id: string;
	children: MindMapNode[];
}

describe("large-map protection policy", () => {
	it.each([
		[1_000, "normal"],
		[5_000, "warning"],
		[10_000, "guarded"],
	] as const)(
		"classifies a %i-topic tree as %s without recursive traversal",
		(topicCount, expectedLevel) => {
			const root = createBreadthFirstTree(topicCount, 3);
			const protection = resolveMindMapLargeMapProtection(root);

			expect(countMindMapNodes(root)).toBe(topicCount + 1);
			expect(protection.nodeCount).toBe(topicCount + 1);
			expect(protection.level).toBe(expectedLevel);
			expect(
				resolveMindMapLargeMapProtectionLevel(topicCount + 1),
			).toBe(expectedLevel);
			if (expectedLevel === "normal") {
				expect(protection).toMatchObject({
					initialVisibleDepthLimit: null,
					initialVisibleNodeCount: topicCount + 1,
					hiddenNodeCount: 0,
					requiresExplicitFullRender: false,
				});
				return;
			}

			const budget =
				expectedLevel === "warning"
					? DEFAULT_MIND_MAP_LARGE_MAP_POLICY.warningVisibleNodeBudget
					: DEFAULT_MIND_MAP_LARGE_MAP_POLICY.guardedVisibleNodeBudget;
			const maximumDepth =
				expectedLevel === "warning"
					? DEFAULT_MIND_MAP_LARGE_MAP_POLICY.warningMaximumVisibleDepth
					: DEFAULT_MIND_MAP_LARGE_MAP_POLICY.guardedMaximumVisibleDepth;
			expect(protection.initialVisibleNodeCount).toBeLessThanOrEqual(
				budget,
			);
			expect(protection.initialVisibleDepthLimit).toBeLessThanOrEqual(
				maximumDepth,
			);
			expect(protection.hiddenNodeCount).toBeGreaterThan(0);
			expect(protection.requiresExplicitFullRender).toBe(true);
		},
	);

	it("uses actual breadth to avoid a large wide root defeating a depth limit", () => {
		const root = createBreadthFirstTree(10_000, 10_000);
		const protection = resolveMindMapLargeMapProtection(root);

		expect(protection).toMatchObject({
			level: "guarded",
			initialVisibleDepthLimit: 0,
			initialVisibleNodeCount: 1,
			hiddenNodeCount: 10_000,
			requiresExplicitFullRender: true,
		});
	});

	it("rejects invalid threshold and budget configurations", () => {
		const root = createBreadthFirstTree(1);
		expect(() =>
			resolveMindMapLargeMapProtection(root, {
				...DEFAULT_MIND_MAP_LARGE_MAP_POLICY,
				guardedNodeCount: 1,
				warningNodeCount: 2,
			}),
		).toThrow(RangeError);
		expect(() =>
			resolveMindMapLargeMapProtection(root, {
				...DEFAULT_MIND_MAP_LARGE_MAP_POLICY,
				guardedVisibleNodeBudget: 0,
			}),
		).toThrow(RangeError);
		expect(() => resolveMindMapLargeMapProtectionLevel(0)).toThrow(
			RangeError,
		);
	});
});

function createBreadthFirstTree(
	topicCount: number,
	branchingFactor = 3,
): MindMapNode {
	const root = createNode("root");
	const nodes: MutableNode[] = [root];
	for (let index = 0; index < topicCount; index += 1) {
		const node = createNode(`topic-${String(index)}`);
		const parentIndex = Math.floor(index / branchingFactor);
		const parent = nodes[parentIndex];
		if (parent === undefined) {
			throw new Error("Expected breadth-first parent.");
		}
		parent.children.push(node as unknown as MindMapNode);
		nodes.push(node);
	}
	return root as unknown as MindMapNode;
}

function createNode(id: string): MutableNode {
	return {
		id,
		children: [],
	};
}
