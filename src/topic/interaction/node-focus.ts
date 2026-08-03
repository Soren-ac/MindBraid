import type { MindMapNode } from "../../core/model";

export interface MindMapFocusBreadcrumb {
	readonly nodeId: string;
	readonly text: string;
}

/**
 * A renderer-neutral projection of one document branch.
 *
 * The source tree remains immutable. When a depth limit is active only the
 * projected ancestors are cloned; source locations, IDs, links, and node
 * kinds remain unchanged so every interaction can still be validated against
 * the authoritative parsed document.
 */
export interface MindMapFocusProjection {
	readonly root: MindMapNode;
	readonly focusRootNodeId: string | null;
	readonly visibleDepthLimit: number | null;
	readonly breadcrumbs: readonly MindMapFocusBreadcrumb[];
	readonly visibleNodeIds: ReadonlySet<string>;
}

export function normalizeMindMapVisibleDepthLimit(
	value: number | null,
): number | null {
	if (value === null) {
		return null;
	}
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError("Mind-map visible depth must be a non-negative integer.");
	}
	return value;
}

export function projectMindMapFocus(
	documentRoot: MindMapNode,
	focusRootNodeId: string | null,
	visibleDepthLimit: number | null,
): MindMapFocusProjection {
	const depthLimit = normalizeMindMapVisibleDepthLimit(visibleDepthLimit);
	const index = indexMindMapTree(documentRoot);
	const requestedFocus =
		focusRootNodeId === null ? documentRoot : index.nodes.get(focusRootNodeId);
	const focusRoot = requestedFocus ?? documentRoot;
	const effectiveFocusId =
		focusRoot.id === documentRoot.id ? null : focusRoot.id;
	const breadcrumbs = createBreadcrumbs(
		focusRoot,
		index.nodes,
		index.parents,
	);
	const visibleNodeIds = new Set<string>();

	if (depthLimit === null) {
		collectSubtreeIds(focusRoot, visibleNodeIds);
		return {
			root: focusRoot,
			focusRootNodeId: effectiveFocusId,
			visibleDepthLimit: null,
			breadcrumbs,
			visibleNodeIds,
		};
	}

	const projected = new Map<string, MindMapNode>();
	const pending: Array<{
		readonly node: MindMapNode;
		readonly depth: number;
		readonly visited: boolean;
	}> = [{ node: focusRoot, depth: 0, visited: false }];

	while (pending.length > 0) {
		const current = pending.pop();
		if (current === undefined) {
			continue;
		}
		if (!current.visited) {
			pending.push({ ...current, visited: true });
			if (current.depth < depthLimit) {
				for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
					const child = current.node.children[index];
					if (child !== undefined) {
						pending.push({ node: child, depth: current.depth + 1, visited: false });
					}
				}
			}
			continue;
		}

		visibleNodeIds.add(current.node.id);
		const children =
			current.depth >= depthLimit
				? []
				: current.node.children.map((child) => {
						const projectedChild = projected.get(child.id);
						if (projectedChild === undefined) {
							throw new Error(
								`Missing projected mind-map child "${child.id}".`,
							);
						}
						return projectedChild;
					});
		projected.set(
			current.node.id,
			cloneMindMapNodeWithChildren(current.node, children),
		);
	}

	const projectedRoot = projected.get(focusRoot.id);
	if (projectedRoot === undefined) {
		throw new Error("Mind-map focus projection did not produce a root node.");
	}
	return {
		root: projectedRoot,
		focusRootNodeId: effectiveFocusId,
		visibleDepthLimit: depthLimit,
		breadcrumbs,
		visibleNodeIds,
	};
}

interface MindMapTreeIndex {
	readonly nodes: ReadonlyMap<string, MindMapNode>;
	readonly parents: ReadonlyMap<string, string | null>;
}

function indexMindMapTree(root: MindMapNode): MindMapTreeIndex {
	const nodes = new Map<string, MindMapNode>();
	const parents = new Map<string, string | null>();
	const pending: Array<{
		readonly node: MindMapNode;
		readonly parentId: string | null;
	}> = [{ node: root, parentId: null }];
	while (pending.length > 0) {
		const current = pending.pop();
		if (current === undefined) {
			continue;
		}
		if (nodes.has(current.node.id)) {
			throw new Error(`Duplicate mind-map node id "${current.node.id}".`);
		}
		nodes.set(current.node.id, current.node);
		parents.set(current.node.id, current.parentId);
		for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
			const child = current.node.children[index];
			if (child !== undefined) {
				pending.push({ node: child, parentId: current.node.id });
			}
		}
	}
	return { nodes, parents };
}

function createBreadcrumbs(
	focusRoot: MindMapNode,
	nodes: ReadonlyMap<string, MindMapNode>,
	parents: ReadonlyMap<string, string | null>,
): readonly MindMapFocusBreadcrumb[] {
	const result: MindMapFocusBreadcrumb[] = [];
	let currentId: string | null = focusRoot.id;
	while (currentId !== null) {
		const node = nodes.get(currentId);
		if (node === undefined) {
			break;
		}
		result.push({ nodeId: node.id, text: node.text });
		currentId = parents.get(currentId) ?? null;
	}
	result.reverse();
	return result;
}

function collectSubtreeIds(root: MindMapNode, result: Set<string>): void {
	const pending = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		result.add(node.id);
		for (const child of node.children) {
			pending.push(child);
		}
	}
}

function cloneMindMapNodeWithChildren(
	node: MindMapNode,
	children: readonly MindMapNode[],
): MindMapNode {
	switch (node.kind) {
		case "root":
			return { ...node, children };
		case "heading":
			return { ...node, children };
		case "list":
			return { ...node, children };
	}
}
