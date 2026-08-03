import { describe, expect, it } from "vitest";

import {
  createDefaultMindMapInteractionState,
  createDefaultMindMapLayoutSpec,
  createDefaultMindMapPresentation,
  createDefaultMindMapThemeSpec,
  createDefaultMindMapViewportState,
  createMindMapRenderEffectRef,
  createRootBranchColorIndexMap,
  literalColor,
  resolveMindMapThemeColors,
  type MindMapBoundaryDecoration,
  type MindMapEdgePresentation,
  type MindMapNodePresentation,
} from "../src/presentation/presentation";
import { parseMarkdown } from "../src/core/parser";

describe("frontend presentation defaults", () => {
	it("inherits global font and connector width from the selected style by default", () => {
		const presentation = createDefaultMindMapPresentation("left-to-right");

		expect(presentation.formatting).toMatchObject({
			fontFamily: {
				id: "style-default",
				fontFamilyToken: null,
			},
			connectorWidth: {
				id: "style-default",
				width: null,
			},
		});
	});

	it("adapts current layout directions to the default tree engine", () => {
    expect(createDefaultMindMapLayoutSpec("left-to-right")).toEqual({
      revision: 1,
      engineId: "tree",
      orientation: "left-to-right",
      spacing: {
        level: 72,
        sibling: 24,
        subtree: 24,
      },
      options: {},
    });
    expect(
      createDefaultMindMapLayoutSpec("top-to-bottom").orientation,
    ).toBe("top-to-bottom");
  });

  it("supports future engine options without losing default spacing", () => {
    const spec = createDefaultMindMapLayoutSpec({
      engineId: "balanced",
      orientation: "right-to-left",
      spacing: {
        sibling: 30,
      },
      options: {
        rootPlacement: "center",
      },
    });

    expect(spec).toEqual({
      revision: 1,
      engineId: "balanced",
      orientation: "right-to-left",
      spacing: {
        level: 72,
        sibling: 30,
        subtree: 24,
      },
      options: {
        rootPlacement: "center",
      },
    });
  });

  it("deeply merges sparse theme token overrides", () => {
    const selection = literalColor("#ff00aa");
    const theme = createDefaultMindMapThemeSpec({
      id: "focus",
      label: "Focus",
      revision: "focus-v2",
      tokens: {
        colors: {
          selection,
        },
        node: {
          radius: 12,
        },
        roles: {
          root: {
            shape: "pill",
            typography: {
              fontSize: 18,
            },
          },
        },
      },
    });

    expect(theme.id).toBe("focus");
    expect(theme.revision).toBe("focus-v2");
    expect(theme.tokens.colors.selection).toEqual(selection);
    expect(theme.tokens.colors.canvas).toEqual({
      kind: "host",
      token: "background-primary",
    });
    expect(theme.tokens.node.radius).toBe(12);
    expect(theme.tokens.node.maxWidth).toBe(240);
    expect(theme.tokens.roles.root.shape).toBe("pill");
    expect(theme.tokens.roles.root.typography).toMatchObject({
      fontSize: 18,
      fontWeight: 600,
    });
    expect(theme.tokens.colors.branchPalette.length).toBeGreaterThan(1);
    expect(theme.tokens.effects).toEqual({
      canvasTexture: null,
      nodeStroke: null,
      nodeFill: null,
      edgeStroke: null,
      terminalMarker: null,
    });
    expect(theme.tokens.branches.mode).toBe("none");
  });

  it("resolves light theme colors without changing dark defaults", () => {
    const darkSurface = literalColor("#111111");
    const darkEdge = literalColor("#222222");
    const darkBranch = literalColor("#333333");
    const lightSurface = literalColor("#eeeeee");
    const lightEdge = literalColor("#dddddd");
    const lightBranch = literalColor("#cccccc");
    const theme = {
      ...createDefaultMindMapThemeSpec({
        tokens: {
          colors: {
            surface: darkSurface,
            edge: darkEdge,
            branchPalette: [darkBranch],
          },
        },
      }),
      lightColors: {
        surface: lightSurface,
        edge: lightEdge,
        branchPalette: [lightBranch],
      },
    };

    const dark = resolveMindMapThemeColors(theme, "dark");
    const light = resolveMindMapThemeColors(theme, "light");

    expect(dark).toBe(theme.tokens.colors);
    expect(dark.surface).toBe(darkSurface);
    expect(dark.edge).toBe(darkEdge);
    expect(dark.branchPalette).toEqual([darkBranch]);
    expect(light.surface).toBe(lightSurface);
    expect(light.edge).toBe(lightEdge);
    expect(light.branchPalette).toEqual([lightBranch]);
    expect(light.text).toBe(theme.tokens.colors.text);
  });

  it("creates independent sparse presentation collections for every tab", () => {
    const first = createDefaultMindMapPresentation("left-to-right");
    const second = createDefaultMindMapPresentation("left-to-right");

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.nodes).not.toBe(second.nodes);
    expect(first.edges).not.toBe(second.edges);
    expect(first.decorations).not.toBe(second.decorations);
  });

  it("creates independent interaction state and a scene-space viewport", () => {
    const first = createDefaultMindMapInteractionState();
    const second = createDefaultMindMapInteractionState();

    expect(first).toEqual({
			collapsedNodeIds: new Set(),
			selectedNodeIds: new Set(),
			primarySelectedNodeId: null,
			selectionAnchorNodeId: null,
      focusedNodeId: null,
      hoveredNodeId: null,
      focusRootNodeId: null,
      visibleDepthLimit: null,
      selectedDecorationId: null,
      minimapVisible: false,
      viewport: null,
    });
    expect(first.collapsedNodeIds).not.toBe(second.collapsedNodeIds);
    expect(first.selectedNodeIds).not.toBe(second.selectedNodeIds);
    expect(createDefaultMindMapViewportState()).toEqual({
      centerX: 0,
      centerY: 0,
      scale: 1,
    });
  });

  it("assigns one stable palette index to each complete root subtree", () => {
    const document = parseMarkdown(
      "# A\n## A child\n# B\n## B child",
      "Map.md",
      "Map",
    );
    const [first, second] = document.root.children;
    const indexes = createRootBranchColorIndexMap(document.root);

    expect(indexes.get(first?.id ?? "")).toBe(0);
    expect(indexes.get(first?.children[0]?.id ?? "")).toBe(0);
    expect(indexes.get(second?.id ?? "")).toBe(1);
    expect(indexes.get(second?.children[0]?.id ?? "")).toBe(1);
    expect(indexes.has(document.root.id)).toBe(false);
  });

  it("represents sparse node, edge, and future decoration data", () => {
    const node = {
      shape: "pill",
      iconId: "priority-high",
      content: {
        plainText: "Safe rich text",
        runs: [
          {
            text: "Safe ",
            bold: true,
          },
          {
            text: "rich text",
            italic: true,
          },
        ],
      },
    } satisfies MindMapNodePresentation;
    const edge = {
      routing: "orthogonal",
      lineStyle: "dashed",
    } satisfies MindMapEdgePresentation;
    const boundary = {
      id: "boundary:1",
      kind: "boundary",
      nodeIds: ["heading:1", "heading:2"],
      label: "Future scope",
    } satisfies MindMapBoundaryDecoration;

    expect(node.shape).toBe("pill");
    expect(node.content.runs).toHaveLength(2);
    expect(edge.routing).toBe("orthogonal");
    expect(boundary.kind).toBe("boundary");
  });

  it("rejects CSS values that could load external resources", () => {
    expect(() =>
      literalColor("url(https://example.com/tracker.png)"),
    ).toThrow("Invalid literal theme color");
    expect(literalColor("oklch(70% 0.2 24)")).toEqual({
      kind: "literal",
      value: "oklch(70% 0.2 24)",
    });
  });

  it("keeps render-effect references primitive and injection-safe", () => {
    expect(
      createMindMapRenderEffectRef("pencil-edge", {
        roughness: 1.2,
        enabled: true,
        style: "double-pass",
      }),
    ).toEqual({
      profileId: "pencil-edge",
      options: {
        roughness: 1.2,
        enabled: true,
        style: "double-pass",
      },
    });
    expect(() =>
      createMindMapRenderEffectRef("url(https://example.com)"),
    ).toThrow("Invalid render-effect profile ID");
    expect(() =>
      createMindMapRenderEffectRef("pencil-edge", {
        style: "x; background: red",
      }),
    ).toThrow('Invalid option "style"');
  });
});
