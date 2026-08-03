import type {
	LayoutBounds,
	LayoutEdge,
	LayoutPath,
	LayoutPoint,
	LayoutResult,
	PositionedNode,
} from "./layout";
import type { MindMapViewportState } from "../presentation/presentation";

export interface MindMapSceneCullingPolicy {
	readonly minimumNodeCount: number;
	readonly overscan: number;
}

export interface MindMapSceneCullingResult {
	readonly active: boolean;
	readonly viewportBounds: LayoutBounds | null;
	readonly mountedNodeIds: ReadonlySet<string>;
	readonly renderedEdgeIds: ReadonlySet<string>;
}

export const DEFAULT_MIND_MAP_SCENE_CULLING_POLICY: MindMapSceneCullingPolicy =
	Object.freeze({
		minimumNodeCount: 400,
		overscan: 240,
	});

export function createMindMapViewportSceneBounds(
	viewport: MindMapViewportState,
	viewportWidth: number,
	viewportHeight: number,
): LayoutBounds | null {
	if (
		!Number.isFinite(viewport.centerX) ||
		!Number.isFinite(viewport.centerY) ||
		!Number.isFinite(viewport.scale) ||
		viewport.scale <= 0 ||
		!Number.isFinite(viewportWidth) ||
		!Number.isFinite(viewportHeight) ||
		viewportWidth <= 0 ||
		viewportHeight <= 0
	) {
		return null;
	}
	const width = viewportWidth / viewport.scale;
	const height = viewportHeight / viewport.scale;
	return {
		x: viewport.centerX - width / 2,
		y: viewport.centerY - height / 2,
		width,
		height,
	};
}

export function resolveMindMapSceneCulling(
	layout: LayoutResult,
	viewportBounds: LayoutBounds | null,
	pinnedNodeIds: ReadonlySet<string> = new Set(),
	policy: MindMapSceneCullingPolicy = DEFAULT_MIND_MAP_SCENE_CULLING_POLICY,
): MindMapSceneCullingResult {
	validatePolicy(policy);
	if (
		viewportBounds === null ||
		layout.nodes.length < policy.minimumNodeCount
	) {
		return {
			active: false,
			viewportBounds,
			mountedNodeIds: new Set(layout.nodes.map(({ node }) => node.id)),
			renderedEdgeIds: new Set(layout.edges.map(({ id }) => id)),
		};
	}

	const overscanBounds = expandBounds(viewportBounds, policy.overscan);
	const mountedNodeIds = new Set<string>();
	const nodesById = new Map<string, PositionedNode>();
	for (const positioned of layout.nodes) {
		nodesById.set(positioned.node.id, positioned);
		if (
			pinnedNodeIds.has(positioned.node.id) ||
			boundsIntersect(overscanBounds, positionedNodeBounds(positioned))
		) {
			mountedNodeIds.add(positioned.node.id);
		}
	}

	const renderedEdgeIds = new Set<string>();
	for (const edge of layout.edges) {
		if (
			mountedNodeIds.has(edge.fromId) ||
			mountedNodeIds.has(edge.toId) ||
			boundsIntersect(
				overscanBounds,
				resolveLayoutEdgeBounds(edge, nodesById),
			)
		) {
			renderedEdgeIds.add(edge.id);
		}
	}

	return {
		active: true,
		viewportBounds: overscanBounds,
		mountedNodeIds,
		renderedEdgeIds,
	};
}

export function boundsIntersect(left: LayoutBounds, right: LayoutBounds): boolean {
	return !(
		left.x + left.width < right.x ||
		right.x + right.width < left.x ||
		left.y + left.height < right.y ||
		right.y + right.height < left.y
	);
}

function validatePolicy(policy: MindMapSceneCullingPolicy): void {
	if (!Number.isSafeInteger(policy.minimumNodeCount) || policy.minimumNodeCount < 1) {
		throw new RangeError("Scene culling node threshold must be a positive integer.");
	}
	if (!Number.isFinite(policy.overscan) || policy.overscan < 0) {
		throw new RangeError("Scene culling overscan must be a non-negative number.");
	}
}

function expandBounds(bounds: LayoutBounds, amount: number): LayoutBounds {
	return {
		x: bounds.x - amount,
		y: bounds.y - amount,
		width: bounds.width + amount * 2,
		height: bounds.height + amount * 2,
	};
}

function positionedNodeBounds(node: PositionedNode): LayoutBounds {
	return {
		x: node.x,
		y: node.y,
		width: node.width,
		height: node.height,
	};
}

function resolveLayoutEdgeBounds(
	edge: LayoutEdge,
	nodesById: ReadonlyMap<string, PositionedNode>,
): LayoutBounds {
	if (edge.path !== undefined) {
		return layoutPathBounds(edge.path);
	}
	const from = nodesById.get(edge.fromId);
	const to = nodesById.get(edge.toId);
	if (from === undefined || to === undefined) {
		return { x: 0, y: 0, width: 0, height: 0 };
	}
	return pointBounds([
		{ x: from.x + from.width / 2, y: from.y + from.height / 2 },
		{ x: to.x + to.width / 2, y: to.y + to.height / 2 },
	]);
}

function layoutPathBounds(path: LayoutPath): LayoutBounds {
	const points: LayoutPoint[] = [path.start];
	for (const segment of path.segments) {
		switch (segment.kind) {
			case "line":
				points.push(segment.to);
				break;
			case "quadratic":
				points.push(segment.control, segment.to);
				break;
			case "cubic":
				points.push(segment.control1, segment.control2, segment.to);
				break;
		}
	}
	return pointBounds(points);
}

function pointBounds(points: readonly LayoutPoint[]): LayoutBounds {
	let minimumX = Number.POSITIVE_INFINITY;
	let minimumY = Number.POSITIVE_INFINITY;
	let maximumX = Number.NEGATIVE_INFINITY;
	let maximumY = Number.NEGATIVE_INFINITY;
	for (const point of points) {
		minimumX = Math.min(minimumX, point.x);
		minimumY = Math.min(minimumY, point.y);
		maximumX = Math.max(maximumX, point.x);
		maximumY = Math.max(maximumY, point.y);
	}
	if (!Number.isFinite(minimumX)) {
		return { x: 0, y: 0, width: 0, height: 0 };
	}
	return {
		x: minimumX,
		y: minimumY,
		width: Math.max(0, maximumX - minimumX),
		height: Math.max(0, maximumY - minimumY),
	};
}
