import type { LayoutOrientation, MindMapNode } from "../core/model";
import type { PositionedNode } from "./layout";

/**
 * Structural counts used by a disclosure indicator.
 *
 * Both values describe the complete source-derived tree, not the currently
 * visible layout. A collapsed topic therefore keeps enough information for a
 * frontend to show either an XMind-style direct-child badge or a total-hidden
 * descendant count without asking the renderer to traverse hidden DOM nodes.
 */
export interface MindMapBranchCounts {
	readonly directChildCount: number;
	readonly totalDescendantCount: number;
}

export type MindMapDisclosureState = "expanded" | "collapsed";
export type MindMapDisclosureConnectionSide =
	| "left"
	| "right"
	| "top"
	| "bottom";
export type MindMapDisclosureVisualDirection =
	| "left"
	| "right"
	| "up"
	| "down";

/**
 * Renderer-neutral placement of a disclosure control on the outgoing
 * (child-facing) connection side of a topic.
 */
export interface MindMapDisclosurePlacement {
	readonly orientation: LayoutOrientation;
	readonly connectionSide: MindMapDisclosureConnectionSide;
	readonly visualDirection: MindMapDisclosureVisualDirection;
}

export interface MindMapOutgoingOrientationRequest {
	readonly node: MindMapNode;
	readonly positionedNode: PositionedNode;
	readonly visibleChildren: readonly PositionedNode[];
	readonly positionedRoot: PositionedNode | undefined;
	readonly fallback: LayoutOrientation;
}

export interface MindMapDisclosureAccessibleTextContext
	extends MindMapBranchCounts {
	readonly nodeId: string;
	readonly nodeText: string;
	readonly state: MindMapDisclosureState;
	readonly expanded: boolean;
	readonly hiddenDescendantCount: number;
}

export type MindMapDisclosureAccessibleTextFormatter = (
	context: MindMapDisclosureAccessibleTextContext,
) => string;

/**
 * Semantic description of one non-leaf topic's disclosure control.
 *
 * `hiddenDescendantCount` is zero while expanded and the complete descendant
 * count while collapsed. `directChildCount` remains available separately for
 * frontends whose compact badge convention counts only immediate children.
 */
export interface MindMapDisclosureDescription
	extends MindMapDisclosureAccessibleTextContext {
	readonly accessibleText: string;
}

/**
 * Count immediate children and all nested descendants in O(descendants).
 */
export function countMindMapBranch(
	node: MindMapNode,
): MindMapBranchCounts {
	const directChildCount = node.children.length;
	let totalDescendantCount = 0;
	const pending = [...node.children];

	while (pending.length > 0) {
		const descendant = pending.pop();
		if (descendant === undefined) {
			continue;
		}
		totalDescendantCount += 1;
		pending.push(...descendant.children);
	}

	return {
		directChildCount,
		totalDescendantCount,
	};
}

/**
 * Build the complete disclosure state for a topic, or `null` for a leaf.
 *
 * The optional formatter is the localization/branding seam for future
 * frontends. It receives only semantic data and cannot affect interaction or
 * source state.
 */
export function createMindMapDisclosureDescription(
	node: MindMapNode,
	collapsedNodeIds: ReadonlySet<string>,
	formatAccessibleText: MindMapDisclosureAccessibleTextFormatter =
		formatDefaultMindMapDisclosureAccessibleText,
): MindMapDisclosureDescription | null {
	const counts = countMindMapBranch(node);
	if (counts.directChildCount === 0) {
		return null;
	}

	const state: MindMapDisclosureState = collapsedNodeIds.has(node.id)
		? "collapsed"
		: "expanded";
	const context: MindMapDisclosureAccessibleTextContext = {
		nodeId: node.id,
		nodeText: normalizeAccessibleTopicText(node.text),
		state,
		expanded: state === "expanded",
		hiddenDescendantCount:
			state === "collapsed" ? counts.totalDescendantCount : 0,
		...counts,
	};

	return {
		...context,
		accessibleText: formatAccessibleText(context),
	};
}

/**
 * Default English aria-label text for the phase-one frontend.
 */
export function formatDefaultMindMapDisclosureAccessibleText(
	context: MindMapDisclosureAccessibleTextContext,
): string {
	if (context.state === "collapsed") {
		return `Expand ${context.nodeText}; ${formatCount(
			context.hiddenDescendantCount,
			"hidden descendant",
		)}.`;
	}

	return `Collapse ${context.nodeText}; ${formatCount(
		context.directChildCount,
		"direct child",
		"direct children",
	)}, ${formatCount(context.totalDescendantCount, "descendant")}.`;
}

/**
 * Map every supported orientation to the side where child edges leave a node
 * and the corresponding visual expansion direction.
 */
export function resolveMindMapDisclosurePlacement(
	orientation: LayoutOrientation,
): MindMapDisclosurePlacement {
	switch (orientation) {
		case "left-to-right":
			return {
				orientation,
				connectionSide: "right",
				visualDirection: "right",
			};
		case "right-to-left":
			return {
				orientation,
				connectionSide: "left",
				visualDirection: "left",
			};
		case "top-to-bottom":
			return {
				orientation,
				connectionSide: "bottom",
				visualDirection: "down",
			};
		case "bottom-to-top":
			return {
				orientation,
				connectionSide: "top",
				visualDirection: "up",
			};
	}
}

/**
 * Resolve a branch's effective direction from renderer-neutral layout
 * geometry. Visible child positions are authoritative; a collapsed bilateral
 * branch falls back to its side of the root, and the configured orientation is
 * used only when geometry is ambiguous.
 */
export function resolveMindMapOutgoingOrientation(
	request: MindMapOutgoingOrientationRequest,
): LayoutOrientation {
	const nodeCenter = centerOf(request.positionedNode);
	if (request.visibleChildren.length > 0) {
		const childCenter = request.visibleChildren.reduce(
			(sum, child) => {
				const center = centerOf(child);
				return {
					x: sum.x + center.x / request.visibleChildren.length,
					y: sum.y + center.y / request.visibleChildren.length,
				};
			},
			{ x: 0, y: 0 },
		);
		const orientation = orientationForVector(
			childCenter.x - nodeCenter.x,
			childCenter.y - nodeCenter.y,
		);
		if (orientation !== null) {
			return orientation;
		}
	}

	if (
		request.node.kind !== "root" &&
		request.positionedRoot !== undefined
	) {
		const rootCenter = centerOf(request.positionedRoot);
		const orientation = orientationForVector(
			nodeCenter.x - rootCenter.x,
			nodeCenter.y - rootCenter.y,
		);
		if (orientation !== null) {
			return orientation;
		}
	}

	return request.fallback;
}

/**
 * Resolve the effective branch side for a positioned target. This is the
 * shared bilateral-layout seam used by drag previews whose target children may
 * currently be collapsed.
 */
export function resolveMindMapPositionedBranchOrientation(
	target: PositionedNode,
	positionedRoot: PositionedNode | undefined,
	fallback: LayoutOrientation,
): LayoutOrientation {
	if (positionedRoot === undefined || target.node.kind === "root") {
		return fallback;
	}
	const targetCenter = centerOf(target);
	const rootCenter = centerOf(positionedRoot);
	if (fallback === "left-to-right" || fallback === "right-to-left") {
		return targetCenter.x < rootCenter.x
			? "right-to-left"
			: "left-to-right";
	}
	return targetCenter.y < rootCenter.y
		? "bottom-to-top"
		: "top-to-bottom";
}

function normalizeAccessibleTopicText(text: string): string {
	const normalized = text.trim().replace(/\s+/gu, " ");
	return normalized.length > 0 ? normalized : "Untitled topic";
}

function centerOf(node: PositionedNode): { readonly x: number; readonly y: number } {
	return {
		x: node.x + node.width / 2,
		y: node.y + node.height / 2,
	};
}

function orientationForVector(
	x: number,
	y: number,
): LayoutOrientation | null {
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		return null;
	}
	if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) {
		return null;
	}
	if (Math.abs(x) >= Math.abs(y)) {
		return x >= 0 ? "left-to-right" : "right-to-left";
	}
	return y >= 0 ? "top-to-bottom" : "bottom-to-top";
}

function formatCount(
	count: number,
	singularLabel: string,
	pluralLabel = `${singularLabel}s`,
): string {
	return `${count} ${count === 1 ? singularLabel : pluralLabel}`;
}
