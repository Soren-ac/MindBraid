import type { LayoutOrientation, MindMapNode } from "../../core/model";

/**
 * One node in the visible source tree.
 *
 * `childIds` excludes descendants hidden by a collapsed parent. Keeping this
 * index independent from rendered geometry makes it suitable for DOM, Canvas,
 * outline, and accessibility adapters.
 */
export interface VisibleMindMapNavigationNode {
	readonly node: MindMapNode;
	readonly parentId: string | null;
	readonly childIds: readonly string[];
	readonly depth: number;
	readonly siblingIndex: number;
	readonly visibleIndex: number;
}

/**
 * Immutable navigation snapshot for one visible document frame.
 *
 * `order` is pre-order depth-first order. A layout adapter may provide a
 * different visible order to the selection reducer when its visual reading
 * order differs from the source tree.
 */
export interface VisibleMindMapNavigation {
	readonly rootId: string;
	readonly order: readonly string[];
	readonly nodes: ReadonlyMap<string, VisibleMindMapNavigationNode>;
}

export type MindMapNavigationTarget =
	| "parent"
	| "first-child"
	| "previous-sibling"
	| "next-sibling"
	| "first-sibling"
	| "last-sibling"
	| "previous-visible"
	| "next-visible";

export type MindMapNavigationTraversal = "visual" | "depth-first";
export type MindMapNavigationArrowKey =
	| "ArrowLeft"
	| "ArrowRight"
	| "ArrowUp"
	| "ArrowDown";

export type MindMapNavigationKeyIntent =
	| {
			readonly type: "navigate";
			readonly target: MindMapNavigationTarget;
	  }
	| {
			readonly type: "move-sibling";
			readonly direction: "previous" | "next";
	  };

export interface MindMapNavigationKeyGesture {
	readonly altKey?: boolean;
	readonly ctrlKey?: boolean;
	readonly isComposing?: boolean;
	readonly key: string;
	readonly metaKey?: boolean;
	readonly repeat?: boolean;
	readonly shiftKey?: boolean;
}

export interface ResolveMindMapNavigationKeyIntentRequest
	extends MindMapNavigationKeyGesture {
	readonly orientation: LayoutOrientation;
	/**
	 * Visual traversal maps every arrow to the tree relation that appears in
	 * that direction for the selected orientation. Depth-first traversal keeps
	 * Left/Right structural and uses Up/Down as previous/next reading order.
	 */
	readonly traversal?: MindMapNavigationTraversal;
}

/**
 * Build a source-order index containing only nodes currently visible.
 *
 * The function is iterative so very deep imported documents do not consume
 * the JavaScript call stack. Duplicate IDs violate the model contract and are
 * rejected instead of silently producing ambiguous navigation.
 */
export function createVisibleMindMapNavigation(
	root: MindMapNode,
	collapsedIds: ReadonlySet<string>,
): VisibleMindMapNavigation {
	const nodes = new Map<string, VisibleMindMapNavigationNode>();
	const order: string[] = [];
	const pending: Array<{
		readonly node: MindMapNode;
		readonly parentId: string | null;
		readonly depth: number;
		readonly siblingIndex: number;
	}> = [
		{
			node: root,
			parentId: null,
			depth: 0,
			siblingIndex: 0,
		},
	];

	while (pending.length > 0) {
		const current = pending.pop();
		if (current === undefined) {
			continue;
		}
		if (nodes.has(current.node.id)) {
			throw new Error(
				`Duplicate mind-map node id "${current.node.id}".`,
			);
		}

		const visibleChildren = collapsedIds.has(current.node.id)
			? []
			: current.node.children;
		const childIds = visibleChildren.map((child) => child.id);
		nodes.set(current.node.id, {
			node: current.node,
			parentId: current.parentId,
			childIds,
			depth: current.depth,
			siblingIndex: current.siblingIndex,
			visibleIndex: order.length,
		});
		order.push(current.node.id);

		for (
			let childIndex = visibleChildren.length - 1;
			childIndex >= 0;
			childIndex -= 1
		) {
			const child = visibleChildren[childIndex];
			if (child !== undefined) {
				pending.push({
					node: child,
					parentId: current.node.id,
					depth: current.depth + 1,
					siblingIndex: childIndex,
				});
			}
		}
	}

	return {
		rootId: root.id,
		order,
		nodes,
	};
}

/**
 * Resolve a semantic navigation relation against one visible tree snapshot.
 */
export function resolveVisibleMindMapNavigationTarget(
	navigation: VisibleMindMapNavigation,
	fromNodeId: string,
	target: MindMapNavigationTarget,
): string | null {
	const current = navigation.nodes.get(fromNodeId);
	if (current === undefined) {
		return null;
	}

	switch (target) {
		case "parent":
			return current.parentId;
		case "first-child":
			return current.childIds[0] ?? null;
		case "previous-sibling":
			return resolveSiblingAtOffset(
				navigation,
				current,
				current.siblingIndex - 1,
			);
		case "next-sibling":
			return resolveSiblingAtOffset(
				navigation,
				current,
				current.siblingIndex + 1,
			);
		case "first-sibling":
			return resolveSiblingAtOffset(navigation, current, 0);
		case "last-sibling":
			return resolveLastSibling(navigation, current);
		case "previous-visible":
			return resolveVisibleOrderOffset(
				navigation.order,
				current.visibleIndex,
				-1,
			);
		case "next-visible":
			return resolveVisibleOrderOffset(
				navigation.order,
				current.visibleIndex,
				1,
			);
	}
}

/**
 * Map an arrow to a renderer-neutral navigation relation.
 *
 * The visual strategy follows the selected layout orientation. The
 * depth-first strategy provides an orientation-independent reading sequence,
 * which is useful for outline-like UIs and accessibility adapters.
 */
export function resolveMindMapArrowNavigationTarget(
	key: MindMapNavigationArrowKey,
	orientation: LayoutOrientation,
	traversal: MindMapNavigationTraversal = "visual",
): MindMapNavigationTarget {
	if (traversal === "depth-first") {
		switch (key) {
			case "ArrowLeft":
				return "parent";
			case "ArrowRight":
				return "first-child";
			case "ArrowUp":
				return "previous-visible";
			case "ArrowDown":
				return "next-visible";
		}
	}

	switch (orientation) {
		case "left-to-right":
			return resolveHorizontalTreeArrow(key, false);
		case "right-to-left":
			return resolveHorizontalTreeArrow(key, true);
		case "top-to-bottom":
			return resolveVerticalTreeArrow(key, false);
		case "bottom-to-top":
			return resolveVerticalTreeArrow(key, true);
	}
}

/**
 * Resolve navigation and sibling-reorder shortcuts without browser events.
 *
 * XMind-compatible Alt/Option + Up/Down emits a move intent rather than
 * mutating a tree. Home/End target the first/last visible sibling. The host
 * remains responsible for checking whether a requested structural move can be
 * represented losslessly in Markdown.
 */
export function resolveMindMapNavigationKeyIntent(
	request: ResolveMindMapNavigationKeyIntentRequest,
): MindMapNavigationKeyIntent | null {
	if (request.isComposing === true) {
		return null;
	}

	const hasPrimaryModifier =
		request.ctrlKey === true || request.metaKey === true;
	if (
		request.altKey === true &&
		request.shiftKey !== true &&
		!hasPrimaryModifier &&
		request.repeat !== true
	) {
		if (request.key === "ArrowUp") {
			return {
				type: "move-sibling",
				direction: "previous",
			};
		}
		if (request.key === "ArrowDown") {
			return {
				type: "move-sibling",
				direction: "next",
			};
		}
		return null;
	}

	if (
		request.altKey === true ||
		request.shiftKey === true ||
		hasPrimaryModifier
	) {
		return null;
	}

	if (request.key === "Home") {
		return {
			type: "navigate",
			target: "first-sibling",
		};
	}
	if (request.key === "End") {
		return {
			type: "navigate",
			target: "last-sibling",
		};
	}
	if (!isNavigationArrowKey(request.key)) {
		return null;
	}

	return {
		type: "navigate",
		target: resolveMindMapArrowNavigationTarget(
			request.key,
			request.orientation,
			request.traversal,
		),
	};
}

function resolveSiblingAtOffset(
	navigation: VisibleMindMapNavigation,
	current: VisibleMindMapNavigationNode,
	index: number,
): string | null {
	if (current.parentId === null) {
		return index === 0 ? current.node.id : null;
	}
	const parent = navigation.nodes.get(current.parentId);
	return parent?.childIds[index] ?? null;
}

function resolveLastSibling(
	navigation: VisibleMindMapNavigation,
	current: VisibleMindMapNavigationNode,
): string | null {
	if (current.parentId === null) {
		return current.node.id;
	}
	const siblings = navigation.nodes.get(current.parentId)?.childIds;
	return siblings?.[siblings.length - 1] ?? null;
}

function resolveVisibleOrderOffset(
	order: readonly string[],
	currentIndex: number,
	offset: -1 | 1,
): string | null {
	return order[currentIndex + offset] ?? null;
}

function resolveHorizontalTreeArrow(
	key: MindMapNavigationArrowKey,
	reversed: boolean,
): MindMapNavigationTarget {
	switch (key) {
		case "ArrowLeft":
			return reversed ? "first-child" : "parent";
		case "ArrowRight":
			return reversed ? "parent" : "first-child";
		case "ArrowUp":
			return "previous-sibling";
		case "ArrowDown":
			return "next-sibling";
	}
}

function resolveVerticalTreeArrow(
	key: MindMapNavigationArrowKey,
	reversed: boolean,
): MindMapNavigationTarget {
	switch (key) {
		case "ArrowLeft":
			return "previous-sibling";
		case "ArrowRight":
			return "next-sibling";
		case "ArrowUp":
			return reversed ? "first-child" : "parent";
		case "ArrowDown":
			return reversed ? "parent" : "first-child";
	}
}

function isNavigationArrowKey(
	key: string,
): key is MindMapNavigationArrowKey {
	return (
		key === "ArrowLeft" ||
		key === "ArrowRight" ||
		key === "ArrowUp" ||
		key === "ArrowDown"
	);
}
