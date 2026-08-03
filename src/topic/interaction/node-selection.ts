import type { MindMapSelectionMode } from "../../presentation/presentation";

/**
 * Renderer-neutral selection state.
 *
 * The primary node is the most recent selection target. The anchor remains
 * fixed while extending a range, so repeated Shift-style range gestures do
 * not make the range drift.
 */
export interface MindMapSelectionState {
	readonly selectedNodeIds: ReadonlySet<string>;
	readonly primaryNodeId: string | null;
	readonly anchorNodeId: string | null;
}

export interface ApplyMindMapSelectionRequest {
	readonly state: MindMapSelectionState;
	readonly nodeId: string;
	readonly mode: MindMapSelectionMode;
	/**
	 * Visible reading order from a layout or
	 * `VisibleMindMapNavigation.order`. Hidden descendants should not occur.
	 */
	readonly orderedNodeIds?: readonly string[];
}

export interface MindMapSelectionBounds {
	readonly id: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface MindMapSelectionRectangle {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
}

export function createEmptyMindMapSelectionState(): MindMapSelectionState {
	return {
		selectedNodeIds: new Set(),
		primaryNodeId: null,
		anchorNodeId: null,
	};
}

/**
 * Apply one explicit selection operation without mutating the input Set.
 */
export function applyMindMapSelection(
	request: ApplyMindMapSelectionRequest,
): MindMapSelectionState {
	switch (request.mode) {
		case "replace":
			return selectOnly(request.nodeId);
		case "add":
			return addSelection(request.state, request.nodeId);
		case "toggle":
			return toggleSelection(
				request.state,
				request.nodeId,
				request.orderedNodeIds ?? [],
			);
		case "range":
			return selectRange(request);
	}
}

/**
 * Return the inclusive ordered range, or `null` when either endpoint is not
 * visible. Duplicate IDs in an adapter-provided order are ignored after their
 * first occurrence so range behavior stays deterministic.
 */
export function collectMindMapSelectionRange(
	orderedNodeIds: readonly string[],
	anchorNodeId: string,
	targetNodeId: string,
): readonly string[] | null {
	const uniqueOrder = uniqueNodeOrder(orderedNodeIds);
	const anchorIndex = uniqueOrder.indexOf(anchorNodeId);
	const targetIndex = uniqueOrder.indexOf(targetNodeId);
	if (anchorIndex < 0 || targetIndex < 0) {
		return null;
	}

	const start = Math.min(anchorIndex, targetIndex);
	const end = Math.max(anchorIndex, targetIndex);
	return uniqueOrder.slice(start, end + 1);
}

/**
 * Return visible elements intersecting a scene-space marquee. Geometry stays
 * renderer-neutral so Canvas/SVG frontends can share the same selection rule.
 */
export function collectMindMapNodesInRectangle(
	nodes: readonly MindMapSelectionBounds[],
	rectangle: MindMapSelectionRectangle,
): readonly string[] {
	const left = Math.min(rectangle.left, rectangle.right);
	const right = Math.max(rectangle.left, rectangle.right);
	const top = Math.min(rectangle.top, rectangle.bottom);
	const bottom = Math.max(rectangle.top, rectangle.bottom);
	if (
		![left, right, top, bottom].every(Number.isFinite) ||
		right < left ||
		bottom < top
	) {
		return [];
	}

	return nodes
		.filter(
			(node) =>
				Number.isFinite(node.x) &&
				Number.isFinite(node.y) &&
				Number.isFinite(node.width) &&
				Number.isFinite(node.height) &&
				node.width >= 0 &&
				node.height >= 0 &&
				node.x <= right &&
				node.x + node.width >= left &&
				node.y <= bottom &&
				node.y + node.height >= top,
		)
		.map((node) => node.id);
}

function selectOnly(nodeId: string): MindMapSelectionState {
	return {
		selectedNodeIds: new Set([nodeId]),
		primaryNodeId: nodeId,
		anchorNodeId: nodeId,
	};
}

function addSelection(
	state: MindMapSelectionState,
	nodeId: string,
): MindMapSelectionState {
	const selectedNodeIds = new Set(state.selectedNodeIds);
	selectedNodeIds.add(nodeId);
	return {
		selectedNodeIds,
		primaryNodeId: nodeId,
		anchorNodeId: nodeId,
	};
}

function toggleSelection(
	state: MindMapSelectionState,
	nodeId: string,
	orderedNodeIds: readonly string[],
): MindMapSelectionState {
	const selectedNodeIds = new Set(state.selectedNodeIds);
	if (!selectedNodeIds.has(nodeId)) {
		selectedNodeIds.add(nodeId);
		return {
			selectedNodeIds,
			primaryNodeId: nodeId,
			anchorNodeId: nodeId,
		};
	}

	selectedNodeIds.delete(nodeId);
	if (selectedNodeIds.size === 0) {
		return createEmptyMindMapSelectionState();
	}

	const primaryNodeId = retainOrChooseSelectedNode(
		selectedNodeIds,
		state.primaryNodeId === nodeId ? null : state.primaryNodeId,
		orderedNodeIds,
	);
	const anchorNodeId = retainOrChooseSelectedNode(
		selectedNodeIds,
		state.anchorNodeId === nodeId ? primaryNodeId : state.anchorNodeId,
		orderedNodeIds,
	);
	return {
		selectedNodeIds,
		primaryNodeId,
		anchorNodeId,
	};
}

function selectRange(
	request: ApplyMindMapSelectionRequest,
): MindMapSelectionState {
	const anchorNodeId =
		request.state.anchorNodeId ??
		request.state.primaryNodeId ??
		request.nodeId;
	const range = collectMindMapSelectionRange(
		request.orderedNodeIds ?? [],
		anchorNodeId,
		request.nodeId,
	);
	if (range === null) {
		return selectOnly(request.nodeId);
	}

	return {
		selectedNodeIds: new Set(range),
		primaryNodeId: request.nodeId,
		anchorNodeId,
	};
}

function retainOrChooseSelectedNode(
	selectedNodeIds: ReadonlySet<string>,
	preferredNodeId: string | null,
	orderedNodeIds: readonly string[],
): string {
	if (
		preferredNodeId !== null &&
		selectedNodeIds.has(preferredNodeId)
	) {
		return preferredNodeId;
	}

	const uniqueOrder = uniqueNodeOrder(orderedNodeIds);
	for (let index = uniqueOrder.length - 1; index >= 0; index -= 1) {
		const nodeId = uniqueOrder[index];
		if (nodeId !== undefined && selectedNodeIds.has(nodeId)) {
			return nodeId;
		}
	}

	const firstSelected = selectedNodeIds.values().next();
	if (firstSelected.done) {
		throw new Error("Expected a non-empty mind-map selection.");
	}
	return firstSelected.value;
}

function uniqueNodeOrder(
	orderedNodeIds: readonly string[],
): readonly string[] {
	return [...new Set(orderedNodeIds)];
}
