import type {
  LayoutDirection,
  LayoutOrientation,
  MindMapNode,
} from "../core/model";
import {
  resolveMindMapTreeLayoutOptions,
} from "./layout-options";

export interface NodeSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Axis-independent tree spacing. The primary axis follows the layout
 * direction; the secondary axis separates sibling subtrees.
 */
export interface LayoutSpacing {
  readonly primaryGap: number;
  /**
   * Backward-compatible general secondary-axis gap. More specific tree
   * engines can use `siblingGap` and `subtreeGap`.
   */
  readonly secondaryGap: number;
  readonly siblingGap?: number;
  readonly subtreeGap?: number;
}

export interface LayoutTreeOptions {
  readonly spacing?: Partial<LayoutSpacing>;
  /**
   * Keeps all nodes at a structural depth on one primary-axis lane. Disabling
   * it yields branch-local flow for denser maps with uneven topic dimensions.
   */
  readonly alignSameLevel?: boolean;
  /**
   * A positive multiplier applied to every explicit spacing value. Built-in
   * compactness options use this rather than mutating persisted spacing.
   */
  readonly spacingScale?: number;
}

/**
 * Fully describes one layout operation without depending on DOM or Obsidian.
 * `layoutId` identifies the caller's layout instance while `engineId` selects
 * the implementation that should handle it.
 */
export interface LayoutRequest {
  /** Stable for one mounted renderer/view instance. */
  readonly layoutId: string;
  /** Identifies the current parsed document independently of the view. */
  readonly documentId: string;
  /** Geometry configuration revision supplied by the presentation layer. */
  readonly revision: string | number;
  readonly engineId: string;
  readonly root: MindMapNode;
  readonly sizes: ReadonlyMap<string, NodeSize>;
  readonly orientation: LayoutOrientation;
  readonly collapsedIds: ReadonlySet<string>;
  readonly spacing: LayoutSpacing;
  /**
   * Engine-specific, renderer-neutral configuration. The built-in tree engine
   * strictly validates its registered keys; custom engines own validation for
   * their namespace.
   */
  readonly options: Readonly<Record<string, unknown>>;
}

export type LayoutNodeDropPlacement = "before" | "after" | "child";

export interface LayoutNodeDropPlacementRequest {
  readonly target: PositionedNode;
  readonly point: LayoutPoint;
  readonly orientation: LayoutOrientation;
}

/**
 * Pure, renderer-neutral hit policy supplied by a layout engine.
 *
 * The renderer first resolves which positioned node contains the pointer, then
 * delegates the semantic before/after/child zone to this function. Structural
 * Markdown compatibility remains a separate node-move validation concern.
 */
export type LayoutNodeDropPlacementResolver = (
  request: LayoutNodeDropPlacementRequest,
) => LayoutNodeDropPlacement;

export interface LayoutEngine {
  readonly id: string;
  /**
   * Optional interaction policy for geometries whose sibling ordering cannot
   * be inferred from the global orientation. Omission uses the built-in
   * axis-aligned 25% / 50% / 25% policy.
   */
  readonly resolveNodeDropPlacement?: LayoutNodeDropPlacementResolver;
  layout(request: LayoutRequest): LayoutResult;
}

export interface LayoutEngineResolver {
  resolve(engineId: string): LayoutEngine;
}

export interface PositionedNode {
  /**
   * The canonical node from `LayoutRequest.root`. Engines may use projected
   * trees internally, but those projections must not escape in layout output.
   */
  readonly node: MindMapNode;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export interface LayoutEdge {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  /**
   * Optional engine-owned connection geometry. This is required by layouts
   * whose edges cannot share one global orientation, such as a bilateral map.
   */
  readonly path?: LayoutPath;
}

export interface LayoutPoint {
  readonly x: number;
  readonly y: number;
}

export interface LayoutPath {
  readonly start: LayoutPoint;
  readonly segments: readonly LayoutPathSegment[];
}

export type LayoutPathSegment =
  | {
      readonly kind: "line";
      readonly to: LayoutPoint;
    }
  | {
      readonly kind: "quadratic";
      readonly control: LayoutPoint;
      readonly to: LayoutPoint;
    }
  | {
      readonly kind: "cubic";
      readonly control1: LayoutPoint;
      readonly control2: LayoutPoint;
      readonly to: LayoutPoint;
    };

export interface LayoutBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutResult {
  readonly nodes: readonly PositionedNode[];
  readonly edges: readonly LayoutEdge[];
  /**
   * Must contain every positioned node and explicit edge path control point so
   * fit-to-view works for custom engines.
   */
  readonly bounds: LayoutBounds;
}

const AXIS_ALIGNED_DROP_EDGE_RATIO = 0.25;

/**
 * Default placement policy for horizontal and vertical tree layouts.
 *
 * The leading and trailing quarters of the sibling axis resolve to
 * before/after; the center half resolves to child.
 */
export const resolveAxisAlignedNodeDropPlacement: LayoutNodeDropPlacementResolver =
  ({ target, point, orientation }) => {
    const horizontalSiblingAxis =
      orientation === "top-to-bottom" ||
      orientation === "bottom-to-top";
    const start = horizontalSiblingAxis ? target.x : target.y;
    const size = horizontalSiblingAxis ? target.width : target.height;
    const coordinate = horizontalSiblingAxis ? point.x : point.y;
    if (size <= 0) {
      return "child";
    }

    const ratio = (coordinate - start) / size;
    if (ratio < AXIS_ALIGNED_DROP_EDGE_RATIO) {
      return "before";
    }
    if (ratio > 1 - AXIS_ALIGNED_DROP_EDGE_RATIO) {
      return "after";
    }
    return "child";
  };

export const DEFAULT_LAYOUT_SPACING: Readonly<LayoutSpacing> = Object.freeze({
  primaryGap: 72,
  secondaryGap: 24,
});

export const TREE_LAYOUT_ENGINE_ID = "tree";

const DEFAULT_NODE_SIZE: NodeSize = {
  width: 140,
  height: 40,
};

interface AxisSize {
  primary: number;
  secondary: number;
}

interface VisibleNode {
  node: MindMapNode;
  depth: number;
  size: NodeSize;
  axisSize: AxisSize;
  children: VisibleNode[];
  childGaps: number[];
  span: number;
  nodeCenter: number;
  childrenStart: number;
}

/**
 * Lay out the visible portion of a mind-map tree.
 *
 * The first pass calculates each visible subtree's secondary-axis span and
 * the maximum primary-axis size at every depth. The second pass assigns
 * coordinates. Descendants of collapsed nodes are excluded during the first
 * pass, so they never appear in the nodes, edges, or bounds.
 */
export function layoutTree(
  root: MindMapNode,
  measuredNodes: ReadonlyMap<string, NodeSize>,
  direction: LayoutDirection,
  collapsedIds: ReadonlySet<string>,
  options: LayoutTreeOptions = {},
): LayoutResult {
  const topToBottom = direction === "top-to-bottom";
  const spacing = resolveLayoutSpacing(options.spacing, options.spacingScale);
  const alignSameLevel = options.alignSameLevel !== false;
  const maximumPrimaryByDepth: number[] = [];

  const measure = (node: MindMapNode): NodeSize => {
    const measured = measuredNodes.get(node.id);

    return {
      width: validDimension(measured?.width, DEFAULT_NODE_SIZE.width),
      height: validDimension(measured?.height, DEFAULT_NODE_SIZE.height),
    };
  };

  const calculateSpan = (node: MindMapNode, depth: number): VisibleNode => {
    const size = measure(node);
    const axisSize: AxisSize = topToBottom
      ? { primary: size.height, secondary: size.width }
      : { primary: size.width, secondary: size.height };

    maximumPrimaryByDepth[depth] = Math.max(
      maximumPrimaryByDepth[depth] ?? 0,
      axisSize.primary,
    );

    const children = collapsedIds.has(node.id)
      ? []
      : node.children.map((child) => calculateSpan(child, depth + 1));

    if (children.length === 0) {
      return {
        node,
        depth,
        size,
        axisSize,
        children,
        childGaps: [],
        span: axisSize.secondary,
        nodeCenter: axisSize.secondary / 2,
        childrenStart: 0,
      };
    }

    const childGaps = children
      .slice(0, -1)
      .map((child, index) => {
        const nextChild = children[index + 1];
        return child.children.length > 0 ||
          (nextChild?.children.length ?? 0) > 0
          ? spacing.subtreeGap
          : spacing.siblingGap;
      });
    const childrenSpan =
      children.reduce((total, child) => total + child.span, 0) +
      childGaps.reduce((total, gap) => total + gap, 0);
    const firstChild = children[0];
    const lastChild = children[children.length - 1];

    if (firstChild === undefined || lastChild === undefined) {
      throw new Error("Visible children unexpectedly missing");
    }

    const lastChildStart = childrenSpan - lastChild.span;
    const unshiftedNodeCenter =
      (firstChild.nodeCenter +
        lastChildStart +
        lastChild.nodeCenter) /
      2;
    const childrenStart = Math.max(
      0,
      axisSize.secondary / 2 - unshiftedNodeCenter,
    );
    const nodeCenter = unshiftedNodeCenter + childrenStart;
    const span = Math.max(
      childrenStart + childrenSpan,
      nodeCenter + axisSize.secondary / 2,
    );

    return {
      node,
      depth,
      size,
      axisSize,
      children,
      childGaps,
      span,
      nodeCenter,
      childrenStart,
    };
  };

  const visibleRoot = calculateSpan(root, 0);
  const primaryPositions: number[] = [0];

  for (let depth = 1; depth < maximumPrimaryByDepth.length; depth += 1) {
    primaryPositions[depth] =
      (primaryPositions[depth - 1] ?? 0) +
      (maximumPrimaryByDepth[depth - 1] ?? 0) +
      spacing.primaryGap;
  }

  const nodes: PositionedNode[] = [];
  const edges: LayoutEdge[] = [];

  const place = (
    visibleNode: VisibleNode,
    secondaryStart: number,
    branchPrimaryPosition: number,
  ): void => {
    const secondaryCenter = secondaryStart + visibleNode.nodeCenter;
    const secondaryPosition =
      secondaryCenter - visibleNode.axisSize.secondary / 2;
    const primaryPosition = alignSameLevel
      ? (primaryPositions[visibleNode.depth] ?? 0)
      : branchPrimaryPosition;

    nodes.push({
      node: visibleNode.node,
      x: topToBottom ? secondaryPosition : primaryPosition,
      y: topToBottom ? primaryPosition : secondaryPosition,
      width: visibleNode.size.width,
      height: visibleNode.size.height,
      depth: visibleNode.depth,
    });

    let childStart = secondaryStart + visibleNode.childrenStart;

    for (
      let childIndex = 0;
      childIndex < visibleNode.children.length;
      childIndex += 1
    ) {
      const child = visibleNode.children[childIndex];
      if (child === undefined) {
        continue;
      }
      edges.push({
        id: createLayoutEdgeId(visibleNode.node.id, child.node.id),
        fromId: visibleNode.node.id,
        toId: child.node.id,
      });
      place(
        child,
        childStart,
        primaryPosition + visibleNode.axisSize.primary + spacing.primaryGap,
      );
      childStart +=
        child.span + (visibleNode.childGaps[childIndex] ?? 0);
    }
  };

  place(visibleRoot, 0, 0);

  return {
    nodes,
    edges,
    bounds: calculateLayoutBounds(nodes, edges),
  };
}

/**
 * Creates a deterministic, collision-safe ID for a directed layout edge.
 *
 * The source length prefix makes IDs unambiguous even when node IDs contain
 * separators. An edge keeps the same ID across direction and spacing changes.
 */
export function createLayoutEdgeId(fromId: string, toId: string): string {
  return `edge:${fromId.length}:${fromId}:${toId}`;
}

export function createLayoutEngineResolver(
  engines: readonly LayoutEngine[],
): LayoutEngineResolver {
  const enginesById = new Map<string, LayoutEngine>();

  for (const engine of engines) {
    if (enginesById.has(engine.id)) {
      throw new Error(`Duplicate layout engine ID "${engine.id}".`);
    }
    enginesById.set(engine.id, engine);
  }

  return {
    resolve(engineId: string): LayoutEngine {
      const engine = enginesById.get(engineId);
      if (engine !== undefined) {
        return engine;
      }

      const registeredIds = [...enginesById.keys()].join(", ");
      const suffix =
        registeredIds.length === 0
          ? "No layout engines are registered."
          : `Registered engines: ${registeredIds}.`;
      throw new Error(`Unknown layout engine "${engineId}". ${suffix}`);
    },
  };
}

export const BUILT_IN_TREE_LAYOUT_ENGINE: LayoutEngine = Object.freeze({
  id: TREE_LAYOUT_ENGINE_ID,
  resolveNodeDropPlacement: resolveAxisAlignedNodeDropPlacement,
  layout(request: LayoutRequest): LayoutResult {
    const options = resolveMindMapTreeLayoutOptions(request.options);
    const direction = baseDirectionForOrientation(request.orientation);
    const result = layoutTree(
      request.root,
      request.sizes,
      direction,
      request.collapsedIds,
      {
        spacing: request.spacing,
        spacingScale: options.spacingScale,
        alignSameLevel: options.alignSameLevel,
      },
    );
    return orientLayoutResult(result, request.orientation);
  },
});

export const BUILT_IN_LAYOUT_ENGINE_RESOLVER: LayoutEngineResolver =
  createLayoutEngineResolver([BUILT_IN_TREE_LAYOUT_ENGINE]);

function resolveLayoutSpacing(
  spacing: Partial<LayoutSpacing> | undefined,
  scale: number | undefined,
): Required<LayoutSpacing> {
  const safeScale = validSpacingScale(scale);
  const secondaryGap = validGap(
    spacing?.secondaryGap,
    DEFAULT_LAYOUT_SPACING.secondaryGap,
  );
  return {
    primaryGap:
      validGap(spacing?.primaryGap, DEFAULT_LAYOUT_SPACING.primaryGap) *
      safeScale,
    secondaryGap: secondaryGap * safeScale,
    siblingGap: validGap(spacing?.siblingGap, secondaryGap) * safeScale,
    subtreeGap: validGap(spacing?.subtreeGap, secondaryGap) * safeScale,
  };
}

function validSpacingScale(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : 1;
}

function validDimension(
  value: number | undefined,
  fallback: number,
): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function baseDirectionForOrientation(
  orientation: LayoutOrientation,
): LayoutDirection {
  return orientation === "top-to-bottom" || orientation === "bottom-to-top"
    ? "top-to-bottom"
    : "left-to-right";
}

function orientLayoutResult(
  result: LayoutResult,
  orientation: LayoutOrientation,
): LayoutResult {
  if (
    orientation === "left-to-right" ||
    orientation === "top-to-bottom"
  ) {
    return result;
  }

  const { bounds } = result;
  const nodes = result.nodes.map((positioned): PositionedNode => {
    if (orientation === "right-to-left") {
      return {
        ...positioned,
        x:
          bounds.x +
          bounds.width -
          (positioned.x - bounds.x) -
          positioned.width,
      };
    }

    return {
      ...positioned,
      y:
        bounds.y +
        bounds.height -
        (positioned.y - bounds.y) -
        positioned.height,
    };
  });
  const edges = result.edges.map((edge): LayoutEdge => {
    if (edge.path === undefined) {
      return edge;
    }

    return {
      ...edge,
      path: transformLayoutPath(edge.path, (point): LayoutPoint =>
        orientation === "right-to-left"
          ? {
              x: bounds.x + bounds.width - (point.x - bounds.x),
              y: point.y,
            }
          : {
              x: point.x,
              y: bounds.y + bounds.height - (point.y - bounds.y),
            },
      ),
    };
  });

  return {
    ...result,
    nodes,
    edges,
    bounds: calculateLayoutBounds(nodes, edges),
  };
}

function validGap(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

export function transformLayoutPath(
  path: LayoutPath,
  transform: (point: LayoutPoint) => LayoutPoint,
): LayoutPath {
  return {
    start: transform(path.start),
    segments: path.segments.map((segment): LayoutPathSegment => {
      switch (segment.kind) {
        case "line":
          return {
            kind: "line",
            to: transform(segment.to),
          };
        case "quadratic":
          return {
            kind: "quadratic",
            control: transform(segment.control),
            to: transform(segment.to),
          };
        case "cubic":
          return {
            kind: "cubic",
            control1: transform(segment.control1),
            control2: transform(segment.control2),
            to: transform(segment.to),
          };
      }
    }),
  };
}

export function getLayoutPathPoints(path: LayoutPath): readonly LayoutPoint[] {
  const points: LayoutPoint[] = [path.start];
  for (const segment of path.segments) {
    if (segment.kind === "quadratic") {
      points.push(segment.control);
    } else if (segment.kind === "cubic") {
      points.push(segment.control1, segment.control2);
    }
    points.push(segment.to);
  }
  return points;
}

export function calculateLayoutBounds(
  nodes: readonly PositionedNode[],
  edges: readonly LayoutEdge[] = [],
): LayoutBounds {
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    minimumX = Math.min(minimumX, node.x);
    minimumY = Math.min(minimumY, node.y);
    maximumX = Math.max(maximumX, node.x + node.width);
    maximumY = Math.max(maximumY, node.y + node.height);
  }

  for (const edge of edges) {
    if (edge.path === undefined) {
      continue;
    }
    for (const point of getLayoutPathPoints(edge.path)) {
      minimumX = Math.min(minimumX, point.x);
      minimumY = Math.min(minimumY, point.y);
      maximumX = Math.max(maximumX, point.x);
      maximumY = Math.max(maximumY, point.y);
    }
  }

  if (!Number.isFinite(minimumX)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return {
    x: minimumX,
    y: minimumY,
    width: maximumX - minimumX,
    height: maximumY - minimumY,
  };
}
