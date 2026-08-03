import type {
	LayoutBounds,
	LayoutPath,
	LayoutPathSegment,
	LayoutPoint,
	LayoutResult,
	PositionedNode,
} from "./layout";

export interface MindMapMinimapSize {
	readonly width: number;
	readonly height: number;
}

export interface MindMapMinimapTransform {
	readonly sceneBounds: LayoutBounds;
	readonly width: number;
	readonly height: number;
	readonly scale: number;
	readonly offsetX: number;
	readonly offsetY: number;
}

/**
 * Renderer-neutral, scaled topic geometry for a navigation minimap.
 *
 * The rectangle is centered on the source topic's scaled center. It can be
 * wider or taller than the source geometry at extreme zoom-out so every
 * source topic remains discoverable in a small minimap.
 */
export interface MindMapMinimapNodeProjection {
	readonly nodeId: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/**
 * Renderer-neutral, scaled connector geometry for a navigation minimap.
 *
 * The path always contains the engine's explicit geometry when available.
 * Layouts without explicit connector paths use a deterministic center-to-
 * center line between their finite endpoint topics.
 */
export interface MindMapMinimapEdgeProjection {
	readonly edgeId: string;
	readonly fromNodeId: string;
	readonly toNodeId: string;
	readonly path: LayoutPath;
}

/**
 * Complete navigation scene derived from the layout result, independently of
 * any main-canvas DOM culling policy.
 */
export interface MindMapMinimapProjection {
	readonly nodes: readonly MindMapMinimapNodeProjection[];
	readonly edges: readonly MindMapMinimapEdgeProjection[];
}

export interface MindMapMinimapProjectionOptions {
	/**
	 * Minimum width and height, in minimap coordinate units, assigned to a
	 * finite source node. The default prevents distant nodes disappearing into
	 * sub-pixel geometry.
	 */
	readonly minimumNodeSize?: number;
}

export const DEFAULT_MIND_MAP_MINIMAP_MINIMUM_NODE_SIZE = 2;

export function createMindMapMinimapTransform(
	sceneBounds: LayoutBounds,
	size: MindMapMinimapSize,
	padding = 8,
): MindMapMinimapTransform | null {
	if (
		!isFiniteBounds(sceneBounds) ||
		!Number.isFinite(size.width) ||
		!Number.isFinite(size.height) ||
		size.width <= 0 ||
		size.height <= 0 ||
		!Number.isFinite(padding) ||
		padding < 0
	) {
		return null;
	}
	const availableWidth = Math.max(1, size.width - padding * 2);
	const availableHeight = Math.max(1, size.height - padding * 2);
	const scale = Math.min(
		availableWidth / Math.max(1, sceneBounds.width),
		availableHeight / Math.max(1, sceneBounds.height),
	);
	const contentWidth = sceneBounds.width * scale;
	const contentHeight = sceneBounds.height * scale;
	return {
		sceneBounds: { ...sceneBounds },
		width: size.width,
		height: size.height,
		scale,
		offsetX: (size.width - contentWidth) / 2 - sceneBounds.x * scale,
		offsetY: (size.height - contentHeight) / 2 - sceneBounds.y * scale,
	};
}

export function mindMapScenePointToMinimap(
	point: LayoutPoint,
	transform: MindMapMinimapTransform,
): LayoutPoint {
	return {
		x: point.x * transform.scale + transform.offsetX,
		y: point.y * transform.scale + transform.offsetY,
	};
}

export function mindMapMinimapPointToScene(
	point: LayoutPoint,
	transform: MindMapMinimapTransform,
): LayoutPoint {
	return {
		x: (point.x - transform.offsetX) / transform.scale,
		y: (point.y - transform.offsetY) / transform.scale,
	};
}

export function mindMapSceneBoundsToMinimap(
	bounds: LayoutBounds,
	transform: MindMapMinimapTransform,
): LayoutBounds {
	const origin = mindMapScenePointToMinimap(bounds, transform);
	return {
		x: origin.x,
		y: origin.y,
		width: Math.max(0, bounds.width * transform.scale),
		height: Math.max(0, bounds.height * transform.scale),
	};
}

/**
 * Projects every finite node and connector in a complete `LayoutResult` into
 * minimap coordinates. It deliberately reads the layout result rather than a
 * mounted-node subset, so navigation remains useful while the main scene is
 * culled for performance.
 *
 * Invalid source geometry is omitted rather than allowed to produce invalid
 * SVG or Canvas coordinates. An invalid transform produces an empty scene.
 */
export function projectMindMapLayoutToMinimap(
	layout: LayoutResult,
	transform: MindMapMinimapTransform,
	options: MindMapMinimapProjectionOptions = {},
): MindMapMinimapProjection {
	if (!isFiniteTransform(transform)) {
		return { nodes: [], edges: [] };
	}

	const minimumNodeSize = resolveMinimumNodeSize(options.minimumNodeSize);
	const sourceNodesById = new Map<string, PositionedNode>();
	const nodes: MindMapMinimapNodeProjection[] = [];

	for (const node of layout.nodes) {
		const projection = projectMindMapNodeToMinimap(
			node,
			transform,
			minimumNodeSize,
		);
		if (projection === null) {
			continue;
		}
		sourceNodesById.set(node.node.id, node);
		nodes.push(projection);
	}

	const edges: MindMapMinimapEdgeProjection[] = [];
	for (const edge of layout.edges) {
		const sourcePath =
			edge.path ??
			createFallbackMindMapMinimapEdgePath(
				sourceNodesById.get(edge.fromId),
				sourceNodesById.get(edge.toId),
			);
		if (sourcePath === null) {
			continue;
		}
		const path = projectMindMapLayoutPathToMinimap(sourcePath, transform);
		if (path === null) {
			continue;
		}
		edges.push({
			edgeId: edge.id,
			fromNodeId: edge.fromId,
			toNodeId: edge.toId,
			path,
		});
	}

	return { nodes, edges };
}

/**
 * Converts engine-owned connector geometry to minimap coordinates without
 * changing its line/quadratic/cubic topology.
 */
export function projectMindMapLayoutPathToMinimap(
	path: LayoutPath,
	transform: MindMapMinimapTransform,
): LayoutPath | null {
	if (!isFiniteTransform(transform)) {
		return null;
	}
	const start = projectFinitePoint(path.start, transform);
	if (start === null) {
		return null;
	}
	const segments: LayoutPathSegment[] = [];
	for (const segment of path.segments) {
		const projected = projectMindMapLayoutPathSegmentToMinimap(
			segment,
			transform,
		);
		if (projected === null) {
			return null;
		}
		segments.push(projected);
	}
	return { start, segments };
}

function projectMindMapNodeToMinimap(
	node: PositionedNode,
	transform: MindMapMinimapTransform,
	minimumNodeSize: number,
): MindMapMinimapNodeProjection | null {
	if (!isFinitePositionedNode(node)) {
		return null;
	}
	const center = projectFinitePoint(
		{
			x: node.x + node.width / 2,
			y: node.y + node.height / 2,
		},
		transform,
	);
	const scaledWidth = node.width * transform.scale;
	const scaledHeight = node.height * transform.scale;
	if (
		center === null ||
		!Number.isFinite(scaledWidth) ||
		!Number.isFinite(scaledHeight)
	) {
		return null;
	}
	const width = Math.max(minimumNodeSize, scaledWidth);
	const height = Math.max(minimumNodeSize, scaledHeight);
	const x = center.x - width / 2;
	const y = center.y - height / 2;
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		return null;
	}
	return { nodeId: node.node.id, x, y, width, height };
}

function createFallbackMindMapMinimapEdgePath(
	from: PositionedNode | undefined,
	to: PositionedNode | undefined,
): LayoutPath | null {
	if (from === undefined || to === undefined) {
		return null;
	}
	const start = positionedNodeCenter(from);
	const end = positionedNodeCenter(to);
	if (start === null || end === null) {
		return null;
	}
	return {
		start,
		segments: [{ kind: "line", to: end }],
	};
}

function positionedNodeCenter(node: PositionedNode): LayoutPoint | null {
	if (!isFinitePositionedNode(node)) {
		return null;
	}
	const point = {
		x: node.x + node.width / 2,
		y: node.y + node.height / 2,
	};
	return isFinitePoint(point) ? point : null;
}

function projectMindMapLayoutPathSegmentToMinimap(
	segment: LayoutPathSegment,
	transform: MindMapMinimapTransform,
): LayoutPathSegment | null {
	switch (segment.kind) {
		case "line": {
			const to = projectFinitePoint(segment.to, transform);
			return to === null ? null : { kind: "line", to };
		}
		case "quadratic": {
			const control = projectFinitePoint(segment.control, transform);
			const to = projectFinitePoint(segment.to, transform);
			return control === null || to === null
				? null
				: { kind: "quadratic", control, to };
		}
		case "cubic": {
			const control1 = projectFinitePoint(segment.control1, transform);
			const control2 = projectFinitePoint(segment.control2, transform);
			const to = projectFinitePoint(segment.to, transform);
			return control1 === null || control2 === null || to === null
				? null
				: { kind: "cubic", control1, control2, to };
		}
	}
}

function projectFinitePoint(
	point: LayoutPoint,
	transform: MindMapMinimapTransform,
): LayoutPoint | null {
	if (!isFinitePoint(point)) {
		return null;
	}
	const projected = mindMapScenePointToMinimap(point, transform);
	return isFinitePoint(projected) ? projected : null;
}

function isFinitePositionedNode(node: PositionedNode): boolean {
	return (
		Number.isFinite(node.x) &&
		Number.isFinite(node.y) &&
		Number.isFinite(node.width) &&
		Number.isFinite(node.height) &&
		node.width >= 0 &&
		node.height >= 0
	);
}

function isFinitePoint(point: LayoutPoint): boolean {
	return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isFiniteTransform(transform: MindMapMinimapTransform): boolean {
	return (
		isFiniteBounds(transform.sceneBounds) &&
		Number.isFinite(transform.width) &&
		Number.isFinite(transform.height) &&
		transform.width > 0 &&
		transform.height > 0 &&
		Number.isFinite(transform.scale) &&
		transform.scale > 0 &&
		Number.isFinite(transform.offsetX) &&
		Number.isFinite(transform.offsetY)
	);
}

function resolveMinimumNodeSize(value: number | undefined): number {
	return value !== undefined && Number.isFinite(value) && value >= 0
		? value
		: DEFAULT_MIND_MAP_MINIMAP_MINIMUM_NODE_SIZE;
}

function isFiniteBounds(bounds: LayoutBounds): boolean {
	return (
		Number.isFinite(bounds.x) &&
		Number.isFinite(bounds.y) &&
		Number.isFinite(bounds.width) &&
		Number.isFinite(bounds.height) &&
		bounds.width >= 0 &&
		bounds.height >= 0
	);
}
