import {
	resolveAxisAlignedNodeDropPlacement,
	type LayoutNodeDropPlacementResolver,
	type LayoutBounds,
	type LayoutPoint,
	type PositionedNode,
} from "../../layout/layout";
import type {
	LayoutOrientation,
	MindMapNode,
} from "../../core/model";
import type { NodeMovePlacement } from "../mutation/node-move";

export const NODE_DRAG_THRESHOLD_PX = 5;

export interface NodeDragPoint {
	readonly x: number;
	readonly y: number;
}

export interface NodeDragViewportTransform {
	readonly x: number;
	readonly y: number;
	readonly scale: number;
}

export interface NodeDragSurfaceOrigin {
	readonly left: number;
	readonly top: number;
}

export interface NodeDragAutoPanBounds extends NodeDragSurfaceOrigin {
	readonly right: number;
	readonly bottom: number;
}

export interface NodeDragAutoPanDelta {
	readonly x: number;
	readonly y: number;
}

/**
 * Apply viewport travel to a scene transform. The scene moves opposite the
 * requested viewport direction (scroll right means translating content left).
 *
 * Keeping this sign convention out of the DOM renderer makes edge dragging
 * independently testable and reusable by future Canvas/SVG frontends.
 */
export function applyNodeDragAutoPan(
	transform: NodeDragViewportTransform,
	delta: NodeDragAutoPanDelta,
): NodeDragViewportTransform {
	if (
		!Number.isFinite(transform.x) ||
		!Number.isFinite(transform.y) ||
		!Number.isFinite(transform.scale) ||
		transform.scale <= 0 ||
		!Number.isFinite(delta.x) ||
		!Number.isFinite(delta.y)
	) {
		return transform;
	}

	return {
		x: transform.x - delta.x,
		y: transform.y - delta.y,
		scale: transform.scale,
	};
}

export interface NodeDragDropTarget {
	readonly nodeId: string;
	readonly placement: NodeMovePlacement;
	readonly positionedNode: PositionedNode;
}

export interface NodeDragPreviewSpacing {
	/** Gap along the parent-to-child axis, in scene units. */
	readonly primaryGap: number;
	/** Gap between sibling placeholders, in scene units. */
	readonly siblingGap: number;
}

export interface NodeDragPreviewSegment {
	readonly start: LayoutPoint;
	readonly end: LayoutPoint;
}

/**
 * Renderer-neutral geometry for a structural drop preview.
 *
 * `placeholderBounds` is the future location of the dragged topic. A child
 * placement has a parent-to-placeholder connector; sibling placements also
 * expose an insertion marker at the target boundary. DOM, SVG and Canvas
 * adapters can therefore render the same semantic preview without sharing
 * elements or CSS.
 */
export interface NodeDragPreviewGeometry {
	readonly targetBounds: LayoutBounds;
	readonly placeholderBounds: LayoutBounds;
	readonly connector: NodeDragPreviewSegment;
	readonly insertionMarker: NodeDragPreviewSegment | null;
}

export interface ResolveNodeDragPreviewGeometryRequest {
	readonly source: PositionedNode;
	readonly target: PositionedNode;
	readonly targetParent: PositionedNode | null;
	readonly placement: NodeMovePlacement;
	readonly orientation: LayoutOrientation;
	readonly spacing: NodeDragPreviewSpacing;
}

export type NodeDragPreviewGeometryResolver = (
	request: ResolveNodeDragPreviewGeometryRequest,
) => NodeDragPreviewGeometry | null;

export type NodeDragPreviewUnavailableReason =
	| "no-positioned-target"
	| "invalid-structural-target"
	| "source-not-positioned"
	| "preview-geometry-unavailable";

/**
 * A preview is deliberately tri-state. `none` means the pointer is over empty
 * canvas, `invalid` preserves a hit candidate so an adapter may draw a
 * rejection affordance, and `valid` carries all geometry needed to preview
 * the exact operation that will be committed on pointer release.
 */
export type NodeDragDropPreview =
	| {
			readonly status: "none";
			readonly reason: "no-positioned-target";
	  }
	| {
			readonly status: "invalid";
			readonly reason: Exclude<
				NodeDragPreviewUnavailableReason,
				"no-positioned-target"
			>;
			readonly candidate: NodeDragDropTarget;
	  }
	| {
			readonly status: "valid";
			readonly target: NodeDragDropTarget;
			readonly geometry: NodeDragPreviewGeometry;
	  };

export interface ResolveNodeDragDropTargetRequest {
	readonly root: MindMapNode;
	readonly sourceNodeId: string;
	readonly positionedNodes: readonly PositionedNode[];
	readonly orientation: LayoutOrientation;
	readonly point: NodeDragPoint;
	/**
	 * Optional engine-owned geometry policy. Tree layouts use the default
	 * axis-aligned policy when this is omitted.
	 */
	readonly resolveNodeDropPlacement?: LayoutNodeDropPlacementResolver;
}

export interface ResolveNodeDragDropPreviewRequest
	extends ResolveNodeDragDropTargetRequest {
	/**
	 * Optional layout-owned preview geometry. Custom engines can replace the
	 * built-in axis-aligned placeholder without changing drag semantics.
	 */
	readonly resolvePreviewGeometry?: NodeDragPreviewGeometryResolver;
	readonly previewSpacing?: Partial<NodeDragPreviewSpacing>;
}

export const DEFAULT_NODE_DRAG_PREVIEW_SPACING: Readonly<NodeDragPreviewSpacing> =
	Object.freeze({
		primaryGap: 32,
		siblingGap: 12,
	});

/**
 * Keep the threshold in screen pixels so scene zoom never changes whether a
 * click is interpreted as a drag.
 */
export function hasCrossedNodeDragThreshold(
	start: NodeDragPoint,
	current: NodeDragPoint,
	threshold = NODE_DRAG_THRESHOLD_PX,
): boolean {
	if (!Number.isFinite(threshold) || threshold < 0) {
		return false;
	}
	return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function clientPointToNodeDragScene(
	clientPoint: NodeDragPoint,
	surfaceOrigin: NodeDragSurfaceOrigin,
	transform: NodeDragViewportTransform,
): NodeDragPoint | null {
	if (
		!Number.isFinite(clientPoint.x) ||
		!Number.isFinite(clientPoint.y) ||
		!Number.isFinite(surfaceOrigin.left) ||
		!Number.isFinite(surfaceOrigin.top) ||
		!Number.isFinite(transform.x) ||
		!Number.isFinite(transform.y) ||
		!Number.isFinite(transform.scale) ||
		transform.scale <= 0
	) {
		return null;
	}

	return {
		x:
			(clientPoint.x - surfaceOrigin.left - transform.x) /
			transform.scale,
		y:
			(clientPoint.y - surfaceOrigin.top - transform.y) /
			transform.scale,
	};
}

/**
 * Resolve one animation-frame of viewport movement while a structural drag is
 * near a canvas edge. The result is expressed in screen pixels because the
 * renderer transform is also screen-pixel based; zoom therefore does not make
 * edge scrolling unexpectedly faster or slower.
 */
export function calculateNodeDragAutoPan(
	point: NodeDragPoint,
	bounds: NodeDragAutoPanBounds,
	edgeSize = 48,
	maximumDelta = 18,
): NodeDragAutoPanDelta {
	if (
		!Number.isFinite(point.x) ||
		!Number.isFinite(point.y) ||
		!Number.isFinite(bounds.left) ||
		!Number.isFinite(bounds.top) ||
		!Number.isFinite(bounds.right) ||
		!Number.isFinite(bounds.bottom) ||
		bounds.right <= bounds.left ||
		bounds.bottom <= bounds.top ||
		!Number.isFinite(edgeSize) ||
		edgeSize <= 0 ||
		!Number.isFinite(maximumDelta) ||
		maximumDelta <= 0
	) {
		return { x: 0, y: 0 };
	}

	return {
		x: calculateAxisAutoPan(
			point.x,
			bounds.left,
			bounds.right,
			edgeSize,
			maximumDelta,
		),
		y: calculateAxisAutoPan(
			point.y,
			bounds.top,
			bounds.bottom,
			edgeSize,
			maximumDelta,
		),
	};
}

/**
 * Resolve both the visual drop zone and the rules known from the rendered
 * source tree. The source mutation planner repeats authoritative validation.
 */
export function resolveNodeDragDropTarget(
	request: ResolveNodeDragDropTargetRequest,
): NodeDragDropTarget | null {
	const candidate = resolveNodeDragDropCandidate(request);
	if (
		candidate === null ||
		!isValidNodeDragDrop(
			request.root,
			request.sourceNodeId,
			candidate.nodeId,
			candidate.placement,
		)
	) {
		return null;
	}
	return candidate;
}

/**
 * Resolve the semantic target and geometry shown before pointer release.
 *
 * This function does not mutate source and intentionally repeats no source
 * planning. The eventual move planner remains authoritative and stale-safe.
 */
export function resolveNodeDragDropPreview(
	request: ResolveNodeDragDropPreviewRequest,
): NodeDragDropPreview {
	const candidate = resolveNodeDragDropCandidate(request);
	if (candidate === null) {
		return {
			status: "none",
			reason: "no-positioned-target",
		};
	}

	const treeIndex = indexNodeTree(request.root);
	if (
		!isValidNodeDragDropInIndex(
			treeIndex,
			request.sourceNodeId,
			candidate.nodeId,
			candidate.placement,
		)
	) {
		return {
			status: "invalid",
			reason: "invalid-structural-target",
			candidate,
		};
	}

	const source = request.positionedNodes.find(
		(positioned) => positioned.node.id === request.sourceNodeId,
	);
	if (source === undefined) {
		return {
			status: "invalid",
			reason: "source-not-positioned",
			candidate,
		};
	}

	const targetParentId = treeIndex.get(candidate.nodeId)?.parentId;
	const targetParent =
		targetParentId === null || targetParentId === undefined
			? null
			: (request.positionedNodes.find(
					(positioned) => positioned.node.id === targetParentId,
				) ?? null);
	const geometry = (
		request.resolvePreviewGeometry ??
		resolveAxisAlignedNodeDragPreviewGeometry
	)({
		source,
		target: candidate.positionedNode,
		targetParent,
		placement: candidate.placement,
		orientation: request.orientation,
		spacing: resolveNodeDragPreviewSpacing(request.previewSpacing),
	});
	if (geometry === null || !isValidNodeDragPreviewGeometry(geometry)) {
		return {
			status: "invalid",
			reason: "preview-geometry-unavailable",
			candidate,
		};
	}

	return {
		status: "valid",
		target: candidate,
		geometry,
	};
}

/**
 * Built-in geometry policy for the four axis-aligned tree orientations.
 *
 * Sibling placeholders follow the secondary axis regardless of whether the
 * parent-child direction is reversed. Child placeholders follow the signed
 * primary direction. The dragged node's measured size is preserved.
 */
export const resolveAxisAlignedNodeDragPreviewGeometry: NodeDragPreviewGeometryResolver =
	({
		source,
		target,
		targetParent,
		placement,
		orientation,
		spacing,
	}) => {
		if (
			!isValidPositionedNodeGeometry(source) ||
			!isValidPositionedNodeGeometry(target) ||
			!isValidNodeDragPreviewSpacing(spacing)
		) {
			return null;
		}

		const placeholderBounds = resolveAxisAlignedPlaceholderBounds(
			source,
			target,
			placement,
			orientation,
			spacing,
		);
		const connectorSource =
			placement === "child" ? target : targetParent;
		if (
			connectorSource === null ||
			!isValidPositionedNodeGeometry(connectorSource)
		) {
			return null;
		}

		return {
			targetBounds: toLayoutBounds(target),
			placeholderBounds,
			connector: {
				start: outgoingAnchor(connectorSource, orientation),
				end: incomingAnchor(placeholderBounds, orientation),
			},
			insertionMarker:
				placement === "child"
					? null
					: resolveAxisAlignedInsertionMarker(
							target,
							placement,
							orientation,
						),
		};
	};

function resolveNodeDragDropCandidate(
	request: ResolveNodeDragDropTargetRequest,
): NodeDragDropTarget | null {
	const containing = request.positionedNodes
		.filter((positioned) => containsPoint(positioned, request.point))
		.sort((left, right) => {
			const areaDifference =
				left.width * left.height - right.width * right.height;
			if (areaDifference !== 0) {
				return areaDifference;
			}
			return (
				distanceSquaredFromCenter(left, request.point) -
				distanceSquaredFromCenter(right, request.point)
			);
		});
	const positionedNode = containing[0];
	if (positionedNode === undefined) {
		return null;
	}

	const placement = (
		request.resolveNodeDropPlacement ??
		resolveAxisAlignedNodeDropPlacement
	)({
		target: positionedNode,
		orientation: request.orientation,
		point: request.point,
	});

	return {
		nodeId: positionedNode.node.id,
		placement,
		positionedNode,
	};
}

export function isValidNodeDragDrop(
	root: MindMapNode,
	sourceNodeId: string,
	targetNodeId: string,
	placement: NodeMovePlacement,
): boolean {
	return isValidNodeDragDropInIndex(
		indexNodeTree(root),
		sourceNodeId,
		targetNodeId,
		placement,
	);
}

function isValidNodeDragDropInIndex(
	index: ReadonlyMap<string, IndexedNode>,
	sourceNodeId: string,
	targetNodeId: string,
	placement: NodeMovePlacement,
): boolean {
	const source = index.get(sourceNodeId);
	const target = index.get(targetNodeId);
	if (
		source === undefined ||
		target === undefined ||
		source.node.kind === "root" ||
		sourceNodeId === targetNodeId ||
		isDescendant(source.node, targetNodeId)
	) {
		return false;
	}

	if (placement === "child") {
		return isRepresentableChildMove(source.node, target.node);
	}

	if (
		target.node.kind === "root" ||
		source.node.kind !== target.node.kind ||
		source.parentId === null ||
		target.parentId === null
	) {
		return false;
	}

	if (
		source.node.kind === "heading" &&
		target.node.kind === "heading"
	) {
		return canRelevelHeadingSubtree(
			source.node,
			target.node.level,
		);
	}

	return true;
}

/**
 * A drag is anchored to one exact source frame. Any source refresh invalidates
 * its snapshots, even when an ID happens to remain visible.
 */
export function canContinueNodeDragAfterRender(
	root: MindMapNode,
	sourceNodeId: string,
	capturedSourceRevision: string,
	nextSourceRevision: string,
): boolean {
	if (capturedSourceRevision !== nextSourceRevision) {
		return false;
	}
	const source = indexNodeTree(root).get(sourceNodeId);
	return source !== undefined && source.node.kind !== "root";
}

interface IndexedNode {
	readonly node: MindMapNode;
	readonly parentId: string | null;
}

function indexNodeTree(root: MindMapNode): ReadonlyMap<string, IndexedNode> {
	const index = new Map<string, IndexedNode>();
	const pending: Array<{
		readonly node: MindMapNode;
		readonly parentId: string | null;
	}> = [{ node: root, parentId: null }];
	while (pending.length > 0) {
		const current = pending.pop();
		if (current === undefined) {
			continue;
		}
		index.set(current.node.id, current);
		for (
			let childIndex = current.node.children.length - 1;
			childIndex >= 0;
			childIndex -= 1
		) {
			const child = current.node.children[childIndex];
			if (child !== undefined) {
				pending.push({
					node: child,
					parentId: current.node.id,
				});
			}
		}
	}
	return index;
}

function isDescendant(source: MindMapNode, targetNodeId: string): boolean {
	const pending = [...source.children];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		if (node.id === targetNodeId) {
			return true;
		}
		for (const child of node.children) {
			pending.push(child);
		}
	}
	return false;
}

function isRepresentableChildMove(
	source: Exclude<MindMapNode, { readonly kind: "root" }>,
	target: MindMapNode,
): boolean {
	if (source.kind === "heading") {
		if (target.kind === "list") {
			return false;
		}
		const targetLevel =
			target.kind === "root" ? 1 : target.level + 1;
		return canRelevelHeadingSubtree(source, targetLevel);
	}

	if (target.kind === "list") {
		return true;
	}

	// The line-oriented phase-one model cannot place a list as the final
	// child after a heading child: reparsing would attach that list to the
	// nearest heading instead of the requested root/heading target.
	return !target.children.some((child) => child.kind === "heading");
}

function canRelevelHeadingSubtree(
	source: Extract<MindMapNode, { readonly kind: "heading" }>,
	targetLevel: number,
): boolean {
	const levelDelta = targetLevel - source.level;
	const pending: MindMapNode[] = [source];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		if (node.kind === "heading") {
			const nextLevel = node.level + levelDelta;
			if (nextLevel < 1 || nextLevel > 6) {
				return false;
			}
		}
		pending.push(...node.children);
	}
	return true;
}

function resolveNodeDragPreviewSpacing(
	spacing: Partial<NodeDragPreviewSpacing> | undefined,
): NodeDragPreviewSpacing {
	return {
		primaryGap: validPreviewGap(
			spacing?.primaryGap,
			DEFAULT_NODE_DRAG_PREVIEW_SPACING.primaryGap,
		),
		siblingGap: validPreviewGap(
			spacing?.siblingGap,
			DEFAULT_NODE_DRAG_PREVIEW_SPACING.siblingGap,
		),
	};
}

function resolveAxisAlignedPlaceholderBounds(
	source: PositionedNode,
	target: PositionedNode,
	placement: NodeMovePlacement,
	orientation: LayoutOrientation,
	spacing: NodeDragPreviewSpacing,
): LayoutBounds {
	if (placement === "child") {
		switch (orientation) {
			case "left-to-right":
				return {
					x: target.x + target.width + spacing.primaryGap,
					y: target.y + (target.height - source.height) / 2,
					width: source.width,
					height: source.height,
				};
			case "right-to-left":
				return {
					x: target.x - spacing.primaryGap - source.width,
					y: target.y + (target.height - source.height) / 2,
					width: source.width,
					height: source.height,
				};
			case "top-to-bottom":
				return {
					x: target.x + (target.width - source.width) / 2,
					y: target.y + target.height + spacing.primaryGap,
					width: source.width,
					height: source.height,
				};
			case "bottom-to-top":
				return {
					x: target.x + (target.width - source.width) / 2,
					y: target.y - spacing.primaryGap - source.height,
					width: source.width,
					height: source.height,
				};
		}
	}

	const before = placement === "before";
	if (
		orientation === "left-to-right" ||
		orientation === "right-to-left"
	) {
		return {
			x: target.x + (target.width - source.width) / 2,
			y: before
				? target.y - spacing.siblingGap - source.height
				: target.y + target.height + spacing.siblingGap,
			width: source.width,
			height: source.height,
		};
	}

	return {
		x: before
			? target.x - spacing.siblingGap - source.width
			: target.x + target.width + spacing.siblingGap,
		y: target.y + (target.height - source.height) / 2,
		width: source.width,
		height: source.height,
	};
}

function resolveAxisAlignedInsertionMarker(
	target: PositionedNode,
	placement: Exclude<NodeMovePlacement, "child">,
	orientation: LayoutOrientation,
): NodeDragPreviewSegment {
	if (
		orientation === "left-to-right" ||
		orientation === "right-to-left"
	) {
		const y =
			placement === "before" ? target.y : target.y + target.height;
		return {
			start: { x: target.x, y },
			end: { x: target.x + target.width, y },
		};
	}

	const x =
		placement === "before" ? target.x : target.x + target.width;
	return {
		start: { x, y: target.y },
		end: { x, y: target.y + target.height },
	};
}

function outgoingAnchor(
	bounds: PositionedNode,
	orientation: LayoutOrientation,
): LayoutPoint {
	switch (orientation) {
		case "left-to-right":
			return {
				x: bounds.x + bounds.width,
				y: bounds.y + bounds.height / 2,
			};
		case "right-to-left":
			return {
				x: bounds.x,
				y: bounds.y + bounds.height / 2,
			};
		case "top-to-bottom":
			return {
				x: bounds.x + bounds.width / 2,
				y: bounds.y + bounds.height,
			};
		case "bottom-to-top":
			return {
				x: bounds.x + bounds.width / 2,
				y: bounds.y,
			};
	}
}

function incomingAnchor(
	bounds: LayoutBounds,
	orientation: LayoutOrientation,
): LayoutPoint {
	switch (orientation) {
		case "left-to-right":
			return {
				x: bounds.x,
				y: bounds.y + bounds.height / 2,
			};
		case "right-to-left":
			return {
				x: bounds.x + bounds.width,
				y: bounds.y + bounds.height / 2,
			};
		case "top-to-bottom":
			return {
				x: bounds.x + bounds.width / 2,
				y: bounds.y,
			};
		case "bottom-to-top":
			return {
				x: bounds.x + bounds.width / 2,
				y: bounds.y + bounds.height,
			};
	}
}

function toLayoutBounds(positioned: PositionedNode): LayoutBounds {
	return {
		x: positioned.x,
		y: positioned.y,
		width: positioned.width,
		height: positioned.height,
	};
}

function isValidNodeDragPreviewGeometry(
	geometry: NodeDragPreviewGeometry,
): boolean {
	return (
		isValidLayoutBounds(geometry.targetBounds) &&
		isValidLayoutBounds(geometry.placeholderBounds) &&
		isValidLayoutPoint(geometry.connector.start) &&
		isValidLayoutPoint(geometry.connector.end) &&
		(geometry.insertionMarker === null ||
			(isValidLayoutPoint(geometry.insertionMarker.start) &&
				isValidLayoutPoint(geometry.insertionMarker.end)))
	);
}

function isValidPositionedNodeGeometry(
	positioned: PositionedNode,
): boolean {
	return isValidLayoutBounds(positioned);
}

function isValidLayoutBounds(bounds: LayoutBounds): boolean {
	return (
		Number.isFinite(bounds.x) &&
		Number.isFinite(bounds.y) &&
		Number.isFinite(bounds.width) &&
		Number.isFinite(bounds.height) &&
		bounds.width > 0 &&
		bounds.height > 0
	);
}

function isValidLayoutPoint(point: LayoutPoint): boolean {
	return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isValidNodeDragPreviewSpacing(
	spacing: NodeDragPreviewSpacing,
): boolean {
	return (
		Number.isFinite(spacing.primaryGap) &&
		spacing.primaryGap >= 0 &&
		Number.isFinite(spacing.siblingGap) &&
		spacing.siblingGap >= 0
	);
}

function validPreviewGap(value: number | undefined, fallback: number): number {
	return value !== undefined && Number.isFinite(value) && value >= 0
		? value
		: fallback;
}

function containsPoint(
	positioned: PositionedNode,
	point: NodeDragPoint,
): boolean {
	return (
		point.x >= positioned.x &&
		point.x <= positioned.x + positioned.width &&
		point.y >= positioned.y &&
		point.y <= positioned.y + positioned.height
	);
}

function distanceSquaredFromCenter(
	positioned: PositionedNode,
	point: NodeDragPoint,
): number {
	const deltaX = point.x - (positioned.x + positioned.width / 2);
	const deltaY = point.y - (positioned.y + positioned.height / 2);
	return deltaX * deltaX + deltaY * deltaY;
}

function calculateAxisAutoPan(
	position: number,
	minimum: number,
	maximum: number,
	edgeSize: number,
	maximumDelta: number,
): number {
	const leadingDistance = position - minimum;
	if (leadingDistance < edgeSize) {
		const strength = 1 - Math.max(0, leadingDistance) / edgeSize;
		return -maximumDelta * strength;
	}

	const trailingDistance = maximum - position;
	if (trailingDistance < edgeSize) {
		const strength = 1 - Math.max(0, trailingDistance) / edgeSize;
		return maximumDelta * strength;
	}

	return 0;
}
