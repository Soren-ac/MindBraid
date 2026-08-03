import { describe, expect, it } from "vitest";

import {
  BUILT_IN_LAYOUT_ENGINE_RESOLVER,
  BUILT_IN_TREE_LAYOUT_ENGINE,
  createLayoutEdgeId,
  createLayoutEngineResolver,
  layoutTree,
  resolveAxisAlignedNodeDropPlacement,
  TREE_LAYOUT_ENGINE_ID,
  type LayoutEngine,
  type NodeSize,
  type PositionedNode,
} from "../src/layout/layout";
import type { LayoutDirection, MindMapNode } from "../src/core/model";

const STANDARD_SIZE: NodeSize = { width: 100, height: 40 };

function makeNode(
  id: string,
  children: MindMapNode[] = [],
): MindMapNode {
  return { id, children } as unknown as MindMapNode;
}

function measured(
  root: MindMapNode,
  size: NodeSize = STANDARD_SIZE,
): ReadonlyMap<string, NodeSize> {
  const sizes = new Map<string, NodeSize>();
  const visit = (node: MindMapNode): void => {
    sizes.set(node.id, size);
    node.children.forEach(visit);
  };

  visit(root);
  return sizes;
}

function byId(nodes: readonly PositionedNode[], id: string): PositionedNode {
  const result = nodes.find((node) => node.node.id === id);
  expect(result, `Expected layout node "${id}"`).toBeDefined();
  return result as PositionedNode;
}

function expectNoOverlap(nodes: readonly PositionedNode[]): void {
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < nodes.length;
      rightIndex += 1
    ) {
      const left = nodes[leftIndex];
      const right = nodes[rightIndex];

      if (left === undefined || right === undefined) {
        throw new Error("Layout node index unexpectedly missing");
      }

      const separated =
        left.x + left.width <= right.x ||
        right.x + right.width <= left.x ||
        left.y + left.height <= right.y ||
        right.y + right.height <= left.y;

      expect(
        separated,
        `Expected "${left.node.id}" and "${right.node.id}" not to overlap`,
      ).toBe(true);
    }
  }
}

describe("layout-owned node drop placement", () => {
  it("uses leading/center/trailing bands on the orientation's sibling axis", () => {
    const target: PositionedNode = {
      node: makeNode("target"),
      x: 100,
      y: 200,
      width: 120,
      height: 40,
      depth: 1,
    };

    expect(
      resolveAxisAlignedNodeDropPlacement({
        target,
        point: { x: 160, y: 205 },
        orientation: "left-to-right",
      }),
    ).toBe("before");
    expect(
      resolveAxisAlignedNodeDropPlacement({
        target,
        point: { x: 160, y: 220 },
        orientation: "left-to-right",
      }),
    ).toBe("child");
    expect(
      resolveAxisAlignedNodeDropPlacement({
        target,
        point: { x: 215, y: 220 },
        orientation: "top-to-bottom",
      }),
    ).toBe("after");
  });
});

describe.each<LayoutDirection>(["left-to-right", "top-to-bottom"])(
  "layoutTree (%s)",
  (direction) => {
    it("lays out every node without overlap and emits one edge per relationship", () => {
      const root = makeNode("root", [
        makeNode("a", [makeNode("a-1"), makeNode("a-2")]),
        makeNode("b", [makeNode("b-1")]),
      ]);

      const result = layoutTree(
        root,
        measured(root),
        direction,
        new Set(),
      );

      expect(result.nodes.map(({ node }) => node.id)).toEqual([
        "root",
        "a",
        "a-1",
        "a-2",
        "b",
        "b-1",
      ]);
      expect(result.edges).toEqual([
        {
          id: createLayoutEdgeId("root", "a"),
          fromId: "root",
          toId: "a",
        },
        {
          id: createLayoutEdgeId("a", "a-1"),
          fromId: "a",
          toId: "a-1",
        },
        {
          id: createLayoutEdgeId("a", "a-2"),
          fromId: "a",
          toId: "a-2",
        },
        {
          id: createLayoutEdgeId("root", "b"),
          fromId: "root",
          toId: "b",
        },
        {
          id: createLayoutEdgeId("b", "b-1"),
          fromId: "b",
          toId: "b-1",
        },
      ]);
      expectNoOverlap(result.nodes);
      expect(result.bounds.width).toBeGreaterThan(0);
      expect(result.bounds.height).toBeGreaterThan(0);
    });

    it("centers a parent between equally sized children", () => {
      const root = makeNode("root", [
        makeNode("first"),
        makeNode("second"),
      ]);
      const result = layoutTree(
        root,
        measured(root),
        direction,
        new Set(),
      );
      const parent = byId(result.nodes, "root");
      const first = byId(result.nodes, "first");
      const second = byId(result.nodes, "second");

      if (direction === "left-to-right") {
        const parentCenter = parent.y + parent.height / 2;
        const childMidpoint =
          (first.y + first.height / 2 + second.y + second.height / 2) / 2;
        expect(parentCenter).toBe(childMidpoint);
        expect(first.x).toBeGreaterThanOrEqual(parent.x + parent.width);
      } else {
        const parentCenter = parent.x + parent.width / 2;
        const childMidpoint =
          (first.x + first.width / 2 + second.x + second.width / 2) / 2;
        expect(parentCenter).toBe(childMidpoint);
        expect(first.y).toBeGreaterThanOrEqual(parent.y + parent.height);
      }
    });
  },
);

describe("layoutTree behavior", () => {
  it("uses the measured root size as the bounds for a single-node tree", () => {
    const root = makeNode("root");
    const result = layoutTree(
      root,
      new Map([["root", { width: 173, height: 51 }]]),
      "left-to-right",
      new Set(),
    );

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      x: 0,
      y: 0,
      width: 173,
      height: 51,
      depth: 0,
    });
    expect(result.edges).toEqual([]);
    expect(result.bounds).toEqual({
      x: 0,
      y: 0,
      width: 173,
      height: 51,
    });
  });

  it("omits every hidden descendant and its edges when a node is collapsed", () => {
    const root = makeNode("root", [
      makeNode("visible"),
      makeNode("collapsed", [
        makeNode("hidden-child", [makeNode("hidden-grandchild")]),
      ]),
    ]);
    const result = layoutTree(
      root,
      measured(root),
      "left-to-right",
      new Set(["collapsed"]),
    );

    expect(result.nodes.map(({ node }) => node.id)).toEqual([
      "root",
      "visible",
      "collapsed",
    ]);
    expect(result.edges).toEqual([
      {
        id: createLayoutEdgeId("root", "visible"),
        fromId: "root",
        toId: "visible",
      },
      {
        id: createLayoutEdgeId("root", "collapsed"),
        fromId: "root",
        toId: "collapsed",
      },
    ]);
  });

  it("shows only the root when the root itself is collapsed", () => {
    const root = makeNode("root", [makeNode("child")]);
    const result = layoutTree(
      root,
      measured(root),
      "top-to-bottom",
      new Set(["root"]),
    );

    expect(result.nodes.map(({ node }) => node.id)).toEqual(["root"]);
    expect(result.edges).toEqual([]);
  });

  it("falls back to safe dimensions for missing or invalid measurements", () => {
    const root = makeNode("root", [makeNode("child")]);
    const result = layoutTree(
      root,
      new Map([["root", { width: Number.NaN, height: -1 }]]),
      "left-to-right",
      new Set(),
    );

    expect(byId(result.nodes, "root")).toMatchObject({
      width: 140,
      height: 40,
    });
    expect(byId(result.nodes, "child")).toMatchObject({
      width: 140,
      height: 40,
    });
    expectNoOverlap(result.nodes);
  });
});

describe.each<LayoutDirection>(["left-to-right", "top-to-bottom"])(
  "layout spacing (%s)",
  (direction) => {
    it("applies primary and secondary gaps on the active axes", () => {
      const root = makeNode("root", [
        makeNode("first"),
        makeNode("second"),
      ]);
      const result = layoutTree(
        root,
        measured(root),
        direction,
        new Set(),
        {
          spacing: {
            primaryGap: 13,
            secondaryGap: 7,
          },
        },
      );
      const parent = byId(result.nodes, "root");
      const first = byId(result.nodes, "first");
      const second = byId(result.nodes, "second");

      if (direction === "left-to-right") {
        expect(first.x - (parent.x + parent.width)).toBe(13);
        expect(second.y - (first.y + first.height)).toBe(7);
      } else {
        expect(first.y - (parent.y + parent.height)).toBe(13);
        expect(second.x - (first.x + first.width)).toBe(7);
      }
    });
  },
);

describe("tree-specific spacing", () => {
  it("can separate sibling topics and sibling subtrees differently", () => {
    const leafRoot = makeNode("leaf-root", [
      makeNode("leaf-a"),
      makeNode("leaf-b"),
    ]);
    const branchRoot = makeNode("branch-root", [
      makeNode("branch-a", [makeNode("branch-a-child")]),
      makeNode("branch-b", [makeNode("branch-b-child")]),
    ]);
    const options = {
      spacing: {
        primaryGap: 20,
        secondaryGap: 10,
        siblingGap: 3,
        subtreeGap: 31,
      },
    };
    const leafResult = layoutTree(
      leafRoot,
      measured(leafRoot),
      "left-to-right",
      new Set(),
      options,
    );
    const branchResult = layoutTree(
      branchRoot,
      measured(branchRoot),
      "left-to-right",
      new Set(),
      options,
    );

    const leafA = byId(leafResult.nodes, "leaf-a");
    const leafB = byId(leafResult.nodes, "leaf-b");
    const branchA = byId(branchResult.nodes, "branch-a");
    const branchB = byId(branchResult.nodes, "branch-b");

    expect(leafB.y - (leafA.y + leafA.height)).toBe(3);
    expect(branchB.y - (branchA.y + branchA.height)).toBe(31);
  });
});

describe("layout engine contract", () => {
  it("resolves and runs the built-in tree engine with folded descendants", () => {
    const root = makeNode("root", [
      makeNode("branch", [makeNode("hidden")]),
      makeNode("visible"),
    ]);
    const engine =
      BUILT_IN_LAYOUT_ENGINE_RESOLVER.resolve(TREE_LAYOUT_ENGINE_ID);
    const result = engine.layout({
      layoutId: "test-layout",
      documentId: root.id,
      revision: 1,
      engineId: TREE_LAYOUT_ENGINE_ID,
      root,
      sizes: measured(root),
      orientation: "left-to-right",
      collapsedIds: new Set(["branch"]),
      spacing: {
        primaryGap: 20,
        secondaryGap: 10,
      },
      options: {},
    });

    expect(engine).toBe(BUILT_IN_TREE_LAYOUT_ENGINE);
    expect(result.nodes.map(({ node }) => node.id)).toEqual([
      "root",
      "branch",
      "visible",
    ]);
    expect(result.edges).toEqual([
      {
        id: createLayoutEdgeId("root", "branch"),
        fromId: "root",
        toId: "branch",
      },
      {
        id: createLayoutEdgeId("root", "visible"),
        fromId: "root",
        toId: "visible",
      },
    ]);
  });

  it.each([
    ["right-to-left", "x"],
    ["bottom-to-top", "y"],
  ] as const)(
    "supports the future-facing %s orientation through the engine contract",
    (orientation, primaryAxis) => {
      const root = makeNode("root", [makeNode("child")]);
      const result = BUILT_IN_TREE_LAYOUT_ENGINE.layout({
        layoutId: "mirrored-layout",
        documentId: root.id,
        revision: 1,
        engineId: TREE_LAYOUT_ENGINE_ID,
        root,
        sizes: measured(root),
        orientation,
        collapsedIds: new Set(),
        spacing: {
          primaryGap: 20,
          secondaryGap: 10,
        },
        options: {},
      });
      const parent = byId(result.nodes, "root");
      const child = byId(result.nodes, "child");

      expect(parent[primaryAxis]).toBeGreaterThan(child[primaryAxis]);
      expectNoOverlap(result.nodes);
    },
  );

  it("reports an unknown engine ID clearly", () => {
    expect(() =>
      BUILT_IN_LAYOUT_ENGINE_RESOLVER.resolve("radial"),
    ).toThrow(
      'Unknown layout engine "radial". Registered engines: tree.',
    );
  });

  it("can resolve an injected engine and rejects duplicate IDs", () => {
    const customEngine: LayoutEngine = {
      id: "custom",
      layout(request) {
        return layoutTree(
          request.root,
          request.sizes,
          request.orientation === "top-to-bottom" ||
            request.orientation === "bottom-to-top"
            ? "top-to-bottom"
            : "left-to-right",
          request.collapsedIds,
          { spacing: request.spacing },
        );
      },
    };

    expect(createLayoutEngineResolver([customEngine]).resolve("custom")).toBe(
      customEngine,
    );
    expect(() =>
      createLayoutEngineResolver([customEngine, customEngine]),
    ).toThrow('Duplicate layout engine ID "custom".');
  });
});

describe("layout edge identity", () => {
  it("is deterministic and collision-safe for IDs containing separators", () => {
    expect(createLayoutEdgeId("root", "child")).toBe(
      createLayoutEdgeId("root", "child"),
    );
    expect(createLayoutEdgeId("a:b", "c")).not.toBe(
      createLayoutEdgeId("a", "b:c"),
    );
  });

  it("leaves engine-specific paths optional", () => {
    const root = makeNode("root", [makeNode("child")]);
    const result = layoutTree(
      root,
      measured(root),
      "left-to-right",
      new Set(),
    );

    expect(result.edges[0]).toMatchObject({
      id: createLayoutEdgeId("root", "child"),
      fromId: "root",
      toId: "child",
    });
    expect(result.edges[0]).not.toHaveProperty("path");
  });
});
