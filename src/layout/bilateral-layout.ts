import {
  BUILT_IN_TREE_LAYOUT_ENGINE,
  calculateLayoutBounds,
  resolveAxisAlignedNodeDropPlacement,
  transformLayoutPath,
  type LayoutEdge,
  type LayoutEngine,
  type LayoutPath,
  type LayoutPoint,
  type LayoutRequest,
  type LayoutResult,
  type PositionedNode,
} from "./layout";
import {
  resolveMindMapBilateralTreeLayoutOptions,
  type MindMapBilateralRootBranchDistribution,
} from "./layout-options";
import type { LayoutOrientation, MindMapNode } from "../core/model";

export const BILATERAL_TREE_LAYOUT_ENGINE_ID = "bilateral-tree";

type BilateralSide = "positive" | "negative";

interface SplitBranches {
  readonly positive: readonly MindMapNode[];
  readonly negative: readonly MindMapNode[];
}

interface DetachedBranch {
  readonly root: MindMapNode;
  readonly branch: MindMapNode | null;
}

/**
 * Places the document root in the center and balances first-level subtrees
 * across both sides. Theme and branch colors are intentionally not involved.
 */
export const BILATERAL_TREE_LAYOUT_ENGINE: LayoutEngine = Object.freeze({
  id: BILATERAL_TREE_LAYOUT_ENGINE_ID,
  resolveNodeDropPlacement: resolveAxisAlignedNodeDropPlacement,
  layout(request: LayoutRequest): LayoutResult {
    const options = resolveMindMapBilateralTreeLayoutOptions(request.options);
    if (request.collapsedIds.has(request.root.id)) {
      return layoutSingleRoot(request, options);
    }

    const split = splitRootBranches(
      request.root.children,
      request.collapsedIds,
      options.rootBranchDistribution,
    );
    const [positiveOrientation, negativeOrientation] =
      sideOrientations(request.orientation);
    const positive = layoutSide(
      request,
      split.positive,
      positiveOrientation,
      "positive",
      options,
    );
    const negative = layoutSide(
      request,
      split.negative,
      negativeOrientation,
      "negative",
      options,
    );
    const positiveRoot = findPositionedRoot(positive, request.root.id);
    const negativeRoot = findPositionedRoot(negative, request.root.id);
    const alignedPositive = translateLayout(
      positive,
      -positiveRoot.x,
      -positiveRoot.y,
    );
    const alignedNegative = translateLayout(
      negative,
      -negativeRoot.x,
      -negativeRoot.y,
    );

    const nodes = restoreCanonicalRootNode(
      [
        ...alignedPositive.nodes,
        ...alignedNegative.nodes.filter(
          ({ node }) => node.id !== request.root.id,
        ),
      ],
      request.root,
    );
    const nodeById = new Map(nodes.map((node) => [node.node.id, node]));
    const sideByNodeId = new Map<string, BilateralSide>();
    for (const { node } of alignedPositive.nodes) {
      if (node.id !== request.root.id) {
        sideByNodeId.set(node.id, "positive");
      }
    }
    for (const { node } of alignedNegative.nodes) {
      if (node.id !== request.root.id) {
        sideByNodeId.set(node.id, "negative");
      }
    }

    const edges = [
      ...alignedPositive.edges,
      ...alignedNegative.edges,
    ].map((edge): LayoutEdge => {
      const from = nodeById.get(edge.fromId);
      const to = nodeById.get(edge.toId);
      if (from === undefined || to === undefined) {
        return edge;
      }
      const side = sideByNodeId.get(edge.toId) ?? "positive";
      const orientation =
        side === "positive" ? positiveOrientation : negativeOrientation;
      return {
        ...edge,
        path: createBilateralEdgePath(from, to, orientation),
      };
    });

    return {
      nodes,
      edges,
      bounds: calculateLayoutBounds(nodes, edges),
    };
  },
});

/**
 * Predicts the side used after moving a visible branch to the document root.
 *
 * Bilateral layout balances whole visible subtrees, so a root child preview
 * cannot safely assume the configured positive orientation. This helper
 * performs the same immutable detach/append operation as the structural move
 * and then reuses the production branch splitter. Renderers can therefore
 * preview the side on which the branch will actually be laid out.
 */
export function resolveBilateralRootChildDropOrientation(
  root: MindMapNode,
  sourceNodeId: string,
  collapsedIds: ReadonlySet<string>,
  orientation: LayoutOrientation,
  options: Readonly<Record<string, unknown>> = {},
): LayoutOrientation | null {
  if (sourceNodeId === root.id || collapsedIds.has(root.id)) {
    return null;
  }

  const detached = detachBranch(root, sourceNodeId);
  if (detached.branch === null) {
    return null;
  }

  const prospectiveRoot: MindMapNode = {
    ...detached.root,
    children: [...detached.root.children, detached.branch],
  };
  const split = splitRootBranches(
    prospectiveRoot.children,
    collapsedIds,
    resolveMindMapBilateralTreeLayoutOptions(options).rootBranchDistribution,
  );
  const [positiveOrientation, negativeOrientation] =
    sideOrientations(orientation);

  if (
    split.positive.some((branch) => branch.id === sourceNodeId)
  ) {
    return positiveOrientation;
  }
  if (
    split.negative.some((branch) => branch.id === sourceNodeId)
  ) {
    return negativeOrientation;
  }
  return null;
}

function layoutSingleRoot(
  request: LayoutRequest,
  options: ReturnType<typeof resolveMindMapBilateralTreeLayoutOptions>,
): LayoutResult {
  const result = BUILT_IN_TREE_LAYOUT_ENGINE.layout({
    ...request,
    engineId: "tree",
    options: toTreeLayoutOptions(options),
    root: {
      ...request.root,
      children: [],
    },
  });
  const nodes = restoreCanonicalRootNode(result.nodes, request.root);
  return {
    ...result,
    nodes,
    bounds: calculateLayoutBounds(nodes, result.edges),
  };
}

/**
 * Bilateral geometry is calculated with temporary root projections. Restore
 * the complete source-model root before returning layout data so disclosure,
 * navigation, and mutation consumers never mistake it for a leaf.
 */
function restoreCanonicalRootNode(
  nodes: readonly PositionedNode[],
  root: MindMapNode,
): readonly PositionedNode[] {
  return nodes.map((positioned) =>
    positioned.node.id === root.id
      ? { ...positioned, node: root }
      : positioned,
  );
}

function layoutSide(
  request: LayoutRequest,
  children: readonly MindMapNode[],
  orientation: LayoutOrientation,
  side: BilateralSide,
  options: ReturnType<typeof resolveMindMapBilateralTreeLayoutOptions>,
): LayoutResult {
  return BUILT_IN_TREE_LAYOUT_ENGINE.layout({
    ...request,
    layoutId: `${request.layoutId}:${side}`,
    engineId: "tree",
    root: {
      ...request.root,
      children,
    },
    orientation,
    options: toTreeLayoutOptions(options),
  });
}

function toTreeLayoutOptions(
  options: ReturnType<typeof resolveMindMapBilateralTreeLayoutOptions>,
): Readonly<Record<string, unknown>> {
  return {
    compactness: options.compactness,
    alignSameLevel: options.alignSameLevel,
  };
}

function splitRootBranches(
  children: readonly MindMapNode[],
  collapsedIds: ReadonlySet<string>,
  distribution: MindMapBilateralRootBranchDistribution,
): SplitBranches {
  const positive: MindMapNode[] = [];
  const negative: MindMapNode[] = [];
  let positiveWeight = 0;
  let negativeWeight = 0;

  for (const [index, child] of children.entries()) {
    if (distribution === "primary-side") {
      positive.push(child);
      continue;
    }
    if (distribution === "alternating") {
      (index % 2 === 0 ? positive : negative).push(child);
      continue;
    }

    const weight = visibleSubtreeWeight(child, collapsedIds);
    if (positiveWeight <= negativeWeight) {
      positive.push(child);
      positiveWeight += weight;
    } else {
      negative.push(child);
      negativeWeight += weight;
    }
  }

  return { positive, negative };
}

function visibleSubtreeWeight(
  node: MindMapNode,
  collapsedIds: ReadonlySet<string>,
): number {
  if (collapsedIds.has(node.id)) {
    return 1;
  }
  return (
    1 +
    node.children.reduce(
      (total, child) => total + visibleSubtreeWeight(child, collapsedIds),
      0,
    )
  );
}

function detachBranch(
  node: MindMapNode,
  sourceNodeId: string,
): DetachedBranch {
  let detachedBranch: MindMapNode | null = null;
  let childrenChanged = false;
  const children: MindMapNode[] = [];

  for (const child of node.children) {
    if (detachedBranch === null && child.id === sourceNodeId) {
      detachedBranch = child;
      childrenChanged = true;
      continue;
    }

    if (detachedBranch === null) {
      const nested = detachBranch(child, sourceNodeId);
      if (nested.branch !== null) {
        detachedBranch = nested.branch;
        childrenChanged = true;
        children.push(nested.root);
        continue;
      }
    }

    children.push(child);
  }

  return {
    root: childrenChanged ? { ...node, children } : node,
    branch: detachedBranch,
  };
}

function sideOrientations(
  orientation: LayoutOrientation,
): readonly [LayoutOrientation, LayoutOrientation] {
  switch (orientation) {
    case "left-to-right":
      return ["left-to-right", "right-to-left"];
    case "right-to-left":
      return ["right-to-left", "left-to-right"];
    case "top-to-bottom":
      return ["top-to-bottom", "bottom-to-top"];
    case "bottom-to-top":
      return ["bottom-to-top", "top-to-bottom"];
  }
}

function findPositionedRoot(
  result: LayoutResult,
  rootId: string,
): PositionedNode {
  const root = result.nodes.find(({ node }) => node.id === rootId);
  if (root === undefined) {
    throw new Error("Bilateral layout did not return its root node.");
  }
  return root;
}

function translateLayout(
  result: LayoutResult,
  deltaX: number,
  deltaY: number,
): LayoutResult {
  const translatePoint = (point: LayoutPoint): LayoutPoint => ({
    x: point.x + deltaX,
    y: point.y + deltaY,
  });
  const nodes = result.nodes.map(
    (positioned): PositionedNode => ({
      ...positioned,
      x: positioned.x + deltaX,
      y: positioned.y + deltaY,
    }),
  );
  const edges = result.edges.map(
    (edge): LayoutEdge =>
      edge.path === undefined
        ? edge
        : {
            ...edge,
            path: transformLayoutPath(edge.path, translatePoint),
          },
  );
  return {
    nodes,
    edges,
    bounds: calculateLayoutBounds(nodes, edges),
  };
}

function createBilateralEdgePath(
  from: PositionedNode,
  to: PositionedNode,
  orientation: LayoutOrientation,
): LayoutPath {
  const horizontal =
    orientation === "left-to-right" || orientation === "right-to-left";
  if (horizontal) {
    const start = {
      x: orientation === "left-to-right" ? from.x + from.width : from.x,
      y: from.y + from.height / 2,
    };
    const end = {
      x: orientation === "left-to-right" ? to.x : to.x + to.width,
      y: to.y + to.height / 2,
    };
    const controlX = (start.x + end.x) / 2;
    return {
      start,
      segments: [
        {
          kind: "cubic",
          control1: { x: controlX, y: start.y },
          control2: { x: controlX, y: end.y },
          to: end,
        },
      ],
    };
  }

  const start = {
    x: from.x + from.width / 2,
    y: orientation === "top-to-bottom" ? from.y + from.height : from.y,
  };
  const end = {
    x: to.x + to.width / 2,
    y: orientation === "top-to-bottom" ? to.y : to.y + to.height,
  };
  const controlY = (start.y + end.y) / 2;
  return {
    start,
    segments: [
      {
        kind: "cubic",
        control1: { x: start.x, y: controlY },
        control2: { x: end.x, y: controlY },
        to: end,
      },
    ],
  };
}
