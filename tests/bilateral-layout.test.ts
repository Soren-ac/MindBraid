import { describe, expect, it } from "vitest";

import {
  BILATERAL_TREE_LAYOUT_ENGINE,
  BILATERAL_TREE_LAYOUT_ENGINE_ID,
  resolveBilateralRootChildDropOrientation,
} from "../src/layout/bilateral-layout";
import {
  getLayoutPathPoints,
  type LayoutResult,
  type NodeSize,
  type PositionedNode,
} from "../src/layout/layout";
import type { LayoutOrientation, MindMapNode } from "../src/core/model";
import { parseMarkdown } from "../src/core/parser";

const SOURCE = [
  "# A",
  "## A1",
  "# B",
  "## B1",
  "# C",
  "## C1",
  "# D",
  "## D1",
  "# E",
  "## E1",
  "# F",
  "## F1",
].join("\n");

function layout(
  orientation: LayoutOrientation,
  collapsedIds: ReadonlySet<string> = new Set(),
): LayoutResult {
  const root = parseMarkdown(SOURCE, "Map.md", "Map").root;
  return BILATERAL_TREE_LAYOUT_ENGINE.layout({
    layoutId: "bilateral-test",
    documentId: root.id,
    revision: 1,
    engineId: BILATERAL_TREE_LAYOUT_ENGINE_ID,
    root,
    sizes: measure(root),
    orientation,
    collapsedIds,
    spacing: {
      primaryGap: 70,
      secondaryGap: 22,
      siblingGap: 18,
      subtreeGap: 24,
    },
    options: {},
  });
}

function measure(root: MindMapNode): ReadonlyMap<string, NodeSize> {
  const result = new Map<string, NodeSize>();
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      continue;
    }
    result.set(node.id, {
      width: node.kind === "root" ? 180 : 120,
      height: node.kind === "root" ? 64 : 42,
    });
    pending.push(...node.children);
  }
  return result;
}

function byText(
  nodes: readonly PositionedNode[],
  text: string,
): PositionedNode {
  const result = nodes.find(({ node }) => node.text === text);
  if (result === undefined) {
    throw new Error(`Missing layout node "${text}".`);
  }
  return result;
}

function expectNoOverlap(nodes: readonly PositionedNode[]): void {
  for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < nodes.length;
      secondIndex += 1
    ) {
      const first = nodes[firstIndex];
      const second = nodes[secondIndex];
      if (first === undefined || second === undefined) {
        continue;
      }
      const overlaps =
        first.x < second.x + second.width &&
        first.x + first.width > second.x &&
        first.y < second.y + second.height &&
        first.y + first.height > second.y;
      expect(
        overlaps,
        `${first.node.text} overlaps ${second.node.text}`,
      ).toBe(false);
    }
  }
}

describe("bilateral tree layout", () => {
  it("returns the canonical root model before and after root collapse", () => {
    const document = parseMarkdown(SOURCE, "Map.md", "Map");
    const request = {
      layoutId: "canonical-root",
      documentId: document.root.id,
      revision: 1,
      engineId: BILATERAL_TREE_LAYOUT_ENGINE_ID,
      root: document.root,
      sizes: measure(document.root),
      orientation: "left-to-right" as const,
      spacing: {
        primaryGap: 70,
        secondaryGap: 22,
      },
      options: {},
    };

    const expanded = BILATERAL_TREE_LAYOUT_ENGINE.layout({
      ...request,
      collapsedIds: new Set(),
    });
    const collapsed = BILATERAL_TREE_LAYOUT_ENGINE.layout({
      ...request,
      collapsedIds: new Set([document.root.id]),
    });
    const expandedRoot = expanded.nodes.find(
      ({ node }) => node.id === document.root.id,
    );
    const collapsedRoot = collapsed.nodes.find(
      ({ node }) => node.id === document.root.id,
    );

    expect(expandedRoot?.node).toBe(document.root);
    expect(collapsedRoot?.node).toBe(document.root);
    expect(collapsedRoot?.node.children).toHaveLength(
      document.root.children.length,
    );
    expect(collapsed.nodes).toHaveLength(1);
  });

  it("balances six branches three per side around one centered root", () => {
    const result = layout("left-to-right");
    const root = byText(result.nodes, "Map");
    const rootChildren = ["A", "B", "C", "D", "E", "F"].map((text) =>
      byText(result.nodes, text),
    );
    const left = rootChildren.filter(
      (node) => node.x + node.width <= root.x,
    );
    const right = rootChildren.filter(
      (node) => node.x >= root.x + root.width,
    );

    expect(root).toMatchObject({ x: 0, y: 0, depth: 0 });
    expect(left).toHaveLength(3);
    expect(right).toHaveLength(3);
    expectNoOverlap(result.nodes);
  });

  it("supplies cubic paths with correct left and right ports", () => {
    const result = layout("left-to-right");
    const root = byText(result.nodes, "Map");
    const right = byText(result.nodes, "A");
    const left = byText(result.nodes, "B");
    const rightEdge = result.edges.find(
      (edge) => edge.toId === right.node.id,
    );
    const leftEdge = result.edges.find(
      (edge) => edge.toId === left.node.id,
    );

    expect(rightEdge?.path?.start.x).toBe(root.x + root.width);
    expect(rightEdge?.path?.segments[0]).toMatchObject({
      kind: "cubic",
      to: { x: right.x },
    });
    expect(leftEdge?.path?.start.x).toBe(root.x);
    expect(leftEdge?.path?.segments[0]).toMatchObject({
      kind: "cubic",
      to: { x: left.x + left.width },
    });
  });

  it("supports vertical bilateral placement without overlap", () => {
    const result = layout("top-to-bottom");
    const root = byText(result.nodes, "Map");
    const rootChildren = ["A", "B", "C", "D", "E", "F"].map((text) =>
      byText(result.nodes, text),
    );

    expect(
      rootChildren.filter(
        (node) => node.y + node.height <= root.y,
      ),
    ).toHaveLength(3);
    expect(
      rootChildren.filter(
        (node) => node.y >= root.y + root.height,
      ),
    ).toHaveLength(3);
    expectNoOverlap(result.nodes);
  });

  it.each([
    ["left-to-right", "horizontal"],
    ["right-to-left", "horizontal"],
    ["top-to-bottom", "vertical"],
    ["bottom-to-top", "vertical"],
  ] as const)(
    "balances branches and routes ports for %s",
    (orientation, axis) => {
      const result = layout(orientation);
      const root = byText(result.nodes, "Map");
      const rootChildren = ["A", "B", "C", "D", "E", "F"].map(
        (text) => byText(result.nodes, text),
      );
      const before =
        axis === "horizontal"
          ? rootChildren.filter(
              (node) => node.x + node.width <= root.x,
            )
          : rootChildren.filter(
              (node) => node.y + node.height <= root.y,
            );
      const after =
        axis === "horizontal"
          ? rootChildren.filter(
              (node) => node.x >= root.x + root.width,
            )
          : rootChildren.filter(
              (node) => node.y >= root.y + root.height,
            );

      expect(before).toHaveLength(3);
      expect(after).toHaveLength(3);
      expectNoOverlap(result.nodes);

      for (const branch of rootChildren) {
        const edge = result.edges.find(
          (candidate) => candidate.toId === branch.node.id,
        );
        if (edge?.path === undefined) {
          throw new Error(`Missing root edge for ${branch.node.text}.`);
        }
        const end = edge.path.segments.at(-1)?.to;
        if (end === undefined) {
          throw new Error(`Missing edge endpoint for ${branch.node.text}.`);
        }

        if (axis === "horizontal") {
          const branchIsBefore =
            branch.x + branch.width <= root.x;
          expect(edge.path.start.x).toBe(
            branchIsBefore ? root.x : root.x + root.width,
          );
          expect(end.x).toBe(
            branchIsBefore ? branch.x + branch.width : branch.x,
          );
        } else {
          const branchIsBefore =
            branch.y + branch.height <= root.y;
          expect(edge.path.start.y).toBe(
            branchIsBefore ? root.y : root.y + root.height,
          );
          expect(end.y).toBe(
            branchIsBefore ? branch.y + branch.height : branch.y,
          );
        }
      }
    },
  );

  it.each([
    ["left-to-right", "right-to-left"],
    ["right-to-left", "left-to-right"],
    ["top-to-bottom", "bottom-to-top"],
    ["bottom-to-top", "top-to-bottom"],
  ] as const)(
    "predicts the actual root-drop side for %s",
    (orientation, expected) => {
      const document = parseMarkdown(
        [
          "# A",
          "## A1",
          "## A2",
          "## A3",
          "# B",
          "# C",
        ].join("\n"),
        "Map.md",
        "Map",
      );
      const source = document.root.children[0]?.children[0];
      if (source === undefined) {
        throw new Error("Missing nested source branch.");
      }

      expect(
        resolveBilateralRootChildDropOrientation(
          document.root,
          source.id,
          new Set(),
          orientation,
        ),
      ).toBe(expected);
    },
  );

  it("filters collapsed descendants before balancing and routing", () => {
    const document = parseMarkdown(SOURCE, "Map.md", "Map");
    const firstBranch = document.root.children[0];
    if (firstBranch === undefined) {
      throw new Error("Missing first branch.");
    }
    const result = BILATERAL_TREE_LAYOUT_ENGINE.layout({
      layoutId: "collapsed-bilateral",
      documentId: document.root.id,
      revision: 1,
      engineId: BILATERAL_TREE_LAYOUT_ENGINE_ID,
      root: document.root,
      sizes: measure(document.root),
      orientation: "left-to-right",
      collapsedIds: new Set([firstBranch.id]),
      spacing: {
        primaryGap: 70,
        secondaryGap: 22,
      },
      options: {},
    });

    expect(result.nodes.some(({ node }) => node.text === "A")).toBe(true);
    expect(result.nodes.some(({ node }) => node.text === "A1")).toBe(false);
    expect(
      result.edges.some((edge) => edge.toId === firstBranch.children[0]?.id),
    ).toBe(false);
  });

  it("keeps every path control point inside scene bounds", () => {
    const result = layout("left-to-right");
    const maximumX = result.bounds.x + result.bounds.width;
    const maximumY = result.bounds.y + result.bounds.height;

    for (const edge of result.edges) {
      if (edge.path === undefined) {
        throw new Error("Bilateral edge is missing its path.");
      }
      for (const point of getLayoutPathPoints(edge.path)) {
        expect(point.x).toBeGreaterThanOrEqual(result.bounds.x);
        expect(point.x).toBeLessThanOrEqual(maximumX);
        expect(point.y).toBeGreaterThanOrEqual(result.bounds.y);
        expect(point.y).toBeLessThanOrEqual(maximumY);
      }
    }
  });
});
