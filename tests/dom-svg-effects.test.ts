import { describe, expect, it } from "vitest";

import { createMindMapRenderEffectRef } from "../src/presentation/presentation";
import {
  CHARCOAL_DOT_EFFECT_ID,
  CHARCOAL_EDGE_EFFECT_ID,
  CHARCOAL_FILL_EFFECT_ID,
  CHARCOAL_PAPER_EFFECT_ID,
  CHARCOAL_STROKE_EFFECT_ID,
  TECHNICAL_GRID_EFFECT_ID,
} from "../src/presentation/render-effects";
import { BUILT_IN_DOM_SVG_EFFECT_REGISTRY } from "../src/ui/dom-svg-effects";

const EDGE_POINTS = [
  { x: 0, y: 0 },
  { x: 48, y: 12 },
  { x: 96, y: 0 },
] as const;

describe("technical and charcoal DOM/SVG effect profiles", () => {
  it("advertises each profile with its required render-effect kind", () => {
    const registry = BUILT_IN_DOM_SVG_EFFECT_REGISTRY;

    expect(registry.resolve(TECHNICAL_GRID_EFFECT_ID)).toMatchObject({
      kind: "canvas-texture",
    });
    expect(registry.resolve(CHARCOAL_PAPER_EFFECT_ID)).toMatchObject({
      kind: "canvas-texture",
    });
    expect(registry.resolve(CHARCOAL_STROKE_EFFECT_ID)).toMatchObject({
      kind: "node-stroke",
    });
    expect(registry.resolve(CHARCOAL_FILL_EFFECT_ID)).toMatchObject({
      kind: "node-fill",
    });
    expect(registry.resolve(CHARCOAL_EDGE_EFFECT_ID)).toMatchObject({
      kind: "edge-stroke",
    });
    expect(registry.resolve(CHARCOAL_DOT_EFFECT_ID)).toMatchObject({
      kind: "terminal-marker",
    });
  });

  it("resolves the coordinated options into bounded live CSS variables", () => {
    const registry = BUILT_IN_DOM_SVG_EFFECT_REGISTRY;
    const technicalGrid = registry.resolveCanvasTexture(
      createMindMapRenderEffectRef(TECHNICAL_GRID_EFFECT_ID, {
        size: 24,
        opacity: 0.18,
      }),
      "style:technical-draft",
    );
    const charcoalPaper = registry.resolveCanvasTexture(
      createMindMapRenderEffectRef(CHARCOAL_PAPER_EFFECT_ID, {
        strength: 0.8,
      }),
      "style:charcoal",
    );
    const noCharcoalPaper = registry.resolveCanvasTexture(
      createMindMapRenderEffectRef(CHARCOAL_PAPER_EFFECT_ID, {
        strength: 0,
      }),
      "style:charcoal",
    );
    const charcoalStroke = registry.resolveNodeStroke(
      createMindMapRenderEffectRef(CHARCOAL_STROKE_EFFECT_ID, {
        roughness: 1.55,
      }),
      "node:charcoal-topic",
    );
    const charcoalFill = registry.resolveNodeFill(
      createMindMapRenderEffectRef(CHARCOAL_FILL_EFFECT_ID, {
        opacity: 0.045,
      }),
    );

    expect(technicalGrid).toMatchObject({
      profileId: TECHNICAL_GRID_EFFECT_ID,
      variables: {
        "--obmind-effect-grid-size": "24px",
        "--obmind-effect-grid-major-size": "120px",
        "--obmind-effect-grid-major-every": "5",
        "--obmind-effect-grid-opacity": "0.18",
      },
    });
    expect(
      technicalGrid?.createExportTexture({
        textMuted: "#778899",
        border: "#445566",
      }),
    ).toEqual({
      kind: "technical-grid",
      minorColor: "#445566",
      majorColor: "#445566",
      cellSize: 24,
      majorEvery: 5,
      opacity: 0.18,
    });
    expect(charcoalPaper?.profileId).toBe(CHARCOAL_PAPER_EFFECT_ID);
    expect(charcoalPaper?.variables).toEqual(
      registry.resolveCanvasTexture(
        createMindMapRenderEffectRef(CHARCOAL_PAPER_EFFECT_ID, {
          strength: 0.8,
        }),
        "style:charcoal",
      )?.variables,
    );
    expect(
      charcoalPaper?.variables["--obmind-effect-charcoal-grain-opacity"],
    ).not.toBe("0");
    expect(
      noCharcoalPaper?.variables["--obmind-effect-charcoal-grain-opacity"],
    ).toBe("0");
    expect(
      charcoalStroke?.variables[
        "--obmind-effect-charcoal-stroke-rotation"
      ],
    ).not.toBe("0deg");
    expect(charcoalStroke?.exportEffect.baseStroke).toBe("replace");
    expect(charcoalStroke?.exportEffect.opacity).toBeTypeOf("number");
    expect(charcoalStroke?.exportEffect.widthScale).toBe(0.92);
    expect(charcoalStroke?.exportEffect.minimumWidth).toBe(0.8);
    expect(charcoalStroke?.contour).toEqual({
      kind: "rough-contour",
      roughness: 1.55,
      sampleSpacing: 7,
      maximumPointCount: 96,
      dashArray: [19, 1.3, 7, 0.7, 29, 1.1],
    });
    expect(charcoalPaper?.createExportTexture({
      textMuted: "#77706a",
      border: "#514c48",
    })).toMatchObject({
      kind: "charcoal-paper",
      fineColor: "#77706a",
      coarseColor: "#514c48",
    });
    expect(charcoalFill).toMatchObject({
      profileId: CHARCOAL_FILL_EFFECT_ID,
      variables: {
        "--obmind-effect-charcoal-fill-opacity": "4.5%",
      },
    });
    expect(
      charcoalFill?.createExportPaint({
        background: "#f8f6f1",
        stroke: "#514c48",
      }),
    ).toEqual({
      kind: "speckle",
      background: "#f8f6f1",
      color: "#514c48",
      gap: 7,
      radius: 0.65,
      opacity: 0.045,
    });
  });

  it("keeps the dry charcoal edge and terminal marker deterministic", () => {
    const registry = BUILT_IN_DOM_SVG_EFFECT_REGISTRY;
    const edge = createMindMapRenderEffectRef(CHARCOAL_EDGE_EFFECT_ID, {
      roughness: 1.45,
    });
    const first = registry.createEdgeStrokes(edge, EDGE_POINTS, "edge:charcoal");
    const repeated = registry.createEdgeStrokes(
      edge,
      EDGE_POINTS,
      "edge:charcoal",
    );
    const different = registry.createEdgeStrokes(
      edge,
      EDGE_POINTS,
      "edge:other",
    );
    const marker = registry.resolveTerminalMarker(
      createMindMapRenderEffectRef(CHARCOAL_DOT_EFFECT_ID),
    );

    expect(first).toHaveLength(1);
    expect(repeated).toEqual(first);
    expect(different).not.toEqual(first);
    expect(first?.[0]?.points[0]).toEqual(EDGE_POINTS[0]);
    expect(first?.[0]?.points.at(-1)).toEqual(EDGE_POINTS.at(-1));
    expect(first?.[0]?.opacity).toBeGreaterThanOrEqual(0.5);
    expect(first?.[0]?.opacity).toBeLessThanOrEqual(0.72);
    expect(marker).toEqual({
      profileId: CHARCOAL_DOT_EFFECT_ID,
      shape: "circle",
      opacity: 0.62,
    });
  });
});
