import { describe, expect, it } from "vitest";

import type {
	HeadingMindMapNode,
	MindMapNode,
	RootMindMapNode,
} from "../src/core/model";
import {
	layoutTree,
	type LayoutEdge,
	type LayoutResult,
	type NodeSize,
	type PositionedNode,
} from "../src/layout/layout";
import { resolveMindMapSceneCulling } from "../src/layout/scene-culling";

interface MutableHeadingNode extends Omit<HeadingMindMapNode, "children"> {
	children: MindMapNode[];
}

interface IterationCounter<T> {
	readonly values: readonly T[];
	count(): number;
}

describe("large-map layout and culling baseline", () => {
	it.each([1_000, 5_000])(
		"keeps %i-topic layout/culling output linear, sparse, and deterministic",
		(topicCount) => {
			const root = createBalancedTree(topicCount);
			const sizes = createSizes(root, topicCount);
			const first = layoutTree(root, sizes, "left-to-right", new Set(), {
				spacing: { primaryGap: 48, secondaryGap: 20 },
			});
			const rootPosition = first.nodes.find(
				(positioned) => positioned.node.id === root.id,
			);
			if (rootPosition === undefined) {
				throw new Error("Benchmark layout did not include its root.");
			}

			expect(first.nodes).toHaveLength(topicCount + 1);
			expect(first.edges).toHaveLength(topicCount);
			expect(first.nodes.length + first.edges.length).toBe(
				topicCount * 2 + 1,
			);

			const countedNodes = createIterationCounter(first.nodes);
			const countedEdges = createIterationCounter(first.edges);
			const culling = resolveMindMapSceneCulling(
				{
					...first,
					nodes: countedNodes.values,
					edges: countedEdges.values,
				},
				{
					x: rootPosition.x - 2,
					y: rootPosition.y - 2,
					width: rootPosition.width + 4,
					height: rootPosition.height + 4,
				},
				new Set(),
				{ minimumNodeCount: 1, overscan: 0 },
			);

			expect(culling.active).toBe(true);
			expect(countedNodes.count()).toBe(topicCount + 1);
			expect(countedEdges.count()).toBe(topicCount);
			expect(culling.mountedNodeIds.size * 20).toBeLessThan(
				first.nodes.length,
			);
			expect(culling.renderedEdgeIds.size * 2).toBeLessThan(
				first.edges.length,
			);

			const second = layoutTree(root, sizes, "left-to-right", new Set(), {
				spacing: { primaryGap: 48, secondaryGap: 20 },
			});
			const secondCulling = resolveMindMapSceneCulling(
				second,
				{
					x: rootPosition.x - 2,
					y: rootPosition.y - 2,
					width: rootPosition.width + 4,
					height: rootPosition.height + 4,
				},
				new Set(),
				{ minimumNodeCount: 1, overscan: 0 },
			);
			expect(projectLayout(second)).toEqual(projectLayout(first));
			expect([...secondCulling.mountedNodeIds].sort()).toEqual(
				[...culling.mountedNodeIds].sort(),
			);
			expect([...secondCulling.renderedEdgeIds].sort()).toEqual(
				[...culling.renderedEdgeIds].sort(),
			);
		},
	);
});

function createBalancedTree(topicCount: number): RootMindMapNode {
	const nodes: MutableHeadingNode[] = [];
	for (let index = 0; index < topicCount; index += 1) {
		nodes.push({
			kind: "heading",
			id: `topic-${String(index)}`,
			text: `Topic ${String(index)}`,
			links: [],
			source: { path: "Benchmarks/large-map.md", line: index, ch: 0 },
			sourceLine: `# Topic ${String(index)}`,
			level: 1,
			children: [],
		});
	}

	const rootChildren: MindMapNode[] = [];
	for (let index = 0; index < nodes.length; index += 1) {
		const node = nodes[index];
		if (node === undefined) {
			continue;
		}
		if (index < 2) {
			rootChildren.push(node);
			continue;
		}
		const parent = nodes[Math.floor((index - 2) / 2)];
		if (parent === undefined) {
			throw new Error("Benchmark tree parent was missing.");
		}
		parent.children.push(node);
	}

	return {
		kind: "root",
		id: "root",
		text: "Large map",
		links: [],
		source: { path: "Benchmarks/large-map.md", line: 0, ch: 0 },
		children: rootChildren,
	};
}

function createSizes(
	root: RootMindMapNode,
	topicCount: number,
): ReadonlyMap<string, NodeSize> {
	const sizes = new Map<string, NodeSize>([[root.id, { width: 140, height: 44 }]]);
	for (let index = 0; index < topicCount; index += 1) {
		sizes.set(`topic-${String(index)}`, { width: 112, height: 36 });
	}
	return sizes;
}

function createIterationCounter<T>(values: readonly T[]): IterationCounter<T> {
	let iterations = 0;
	const counted = new Proxy([...values], {
		get(target, property) {
			if (property === Symbol.iterator) {
				return function* (): IterableIterator<T> {
					for (const value of target) {
						iterations += 1;
						yield value;
					}
				};
			}
			if (property === "length") {
				return target.length;
			}
			if (typeof property === "string") {
				const index = Number(property);
				if (Number.isSafeInteger(index) && index >= 0) {
					return target[index];
				}
			}
			return undefined;
		},
	});
	return {
		values: counted,
		count(): number {
			return iterations;
		},
	};
}

function projectLayout(layout: LayoutResult): {
	readonly nodes: readonly Pick<PositionedNode, "x" | "y" | "depth">[];
	readonly edges: readonly Pick<LayoutEdge, "id" | "fromId" | "toId">[];
	readonly bounds: LayoutResult["bounds"];
} {
	return {
		nodes: layout.nodes.map(({ x, y, depth }) => ({ x, y, depth })),
		edges: layout.edges.map(({ id, fromId, toId }) => ({ id, fromId, toId })),
		bounds: layout.bounds,
	};
}
