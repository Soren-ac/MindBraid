import { describe, expect, it } from "vitest";

import {
  createHandDrawnBorderParameters,
  createHandDrawnFilterParameters,
  createHandDrawnNodeContour,
  createHandDrawnPaperParameters,
  createHandDrawnSeed,
  createHandDrawnStrokes,
  type HandDrawnNodeContourShape,
  sampleCubicBezier,
  type HandDrawnPoint,
} from "../src/presentation/hand-drawn";

const EDGE_POINTS: readonly HandDrawnPoint[] = [
  { x: 12, y: 20 },
  { x: 72, y: 20 },
  { x: 72, y: 84 },
  { x: 132, y: 84 },
];

describe("createHandDrawnStrokes", () => {
  it("is stable for one semantic key and differs for another key", () => {
    const first = createHandDrawnStrokes(EDGE_POINTS, "edge:root->topic");
    const repeated = createHandDrawnStrokes(
      EDGE_POINTS,
      "edge:root->topic",
    );
    const different = createHandDrawnStrokes(
      EDGE_POINTS,
      "edge:root->other",
    );

    expect(repeated).toEqual(first);
    expect(different).not.toEqual(first);
  });

  it("keeps endpoints exact, does not mutate input, and bounds work", () => {
    const input = EDGE_POINTS.map((point) => ({ ...point }));
    const snapshot = input.map((point) => ({ ...point }));
    const strokes = createHandDrawnStrokes(input, "edge:test", {
      maximumPointCount: 9,
      roughness: 1.5,
    });

    expect(strokes).toHaveLength(2);
    expect(input).toEqual(snapshot);
    for (const stroke of strokes) {
      expect(stroke.points.length).toBeGreaterThanOrEqual(3);
      expect(stroke.points.length).toBeLessThanOrEqual(9);
      expect(stroke.points[0]).toEqual(EDGE_POINTS[0]);
      expect(stroke.points.at(-1)).toEqual(EDGE_POINTS.at(-1));
      for (const point of stroke.points) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      }
    }
  });

  it("supports a single clean pass and clamps unsafe options", () => {
    const [stroke] = createHandDrawnStrokes(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      "edge:clean",
      {
        maximumPointCount: Number.POSITIVE_INFINITY,
        passCount: 1,
        roughness: -10,
        sampleSpacing: Number.NaN,
      },
    );

    expect(stroke).toBeDefined();
    expect(stroke?.points).toHaveLength(8);
    expect(stroke?.points.every((point) => point.y === 0)).toBe(true);
  });

  it("rejects paths that cannot produce finite geometry", () => {
    expect(() => createHandDrawnStrokes([], "empty")).toThrow(
      "at least two points",
    );
    expect(() =>
      createHandDrawnStrokes(
        [
          { x: 0, y: 0 },
          { x: Number.NaN, y: 1 },
        ],
        "invalid",
      ),
    ).toThrow("must be finite");
  });
});

describe("createHandDrawnNodeContour", () => {
  it("is stable for one node key and varies for another key", () => {
    const options = {
      shape: "rounded-rectangle" as const,
      width: 156,
      height: 72,
      radius: 14,
      inset: 3,
      stableKey: "node:topic",
      roughness: 1.5,
      sampleSpacing: 8,
      maximumPointCount: 48,
    };

    const first = createHandDrawnNodeContour(options);
    const repeated = createHandDrawnNodeContour(options);
    const different = createHandDrawnNodeContour({
      ...options,
      stableKey: "node:other-topic",
    });

    expect(repeated).toEqual(first);
    expect(different).not.toEqual(first);
  });

  it("creates finite, exact-seam contours for every closed node shape", () => {
    const shapes: readonly HandDrawnNodeContourShape[] = [
      "rectangle",
      "rounded-rectangle",
      "pill",
      "ellipse",
    ];

    for (const shape of shapes) {
      const contour = createHandDrawnNodeContour({
        shape,
        width: 180,
        height: 86,
        radius: 18,
        inset: 5,
        stableKey: `node:${shape}`,
        roughness: 1.8,
        sampleSpacing: 4,
        maximumPointCount: 31,
      });

      expect(contour.length).toBeGreaterThanOrEqual(2);
      expect(contour.length).toBeLessThanOrEqual(31);
      expect(contour[0]).toEqual(contour.at(-1));
      for (const point of contour) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      }
    }
  });

  it("keeps a zero-roughness rectangle regular and honors its inset", () => {
    const contour = createHandDrawnNodeContour({
      shape: "rectangle",
      width: 12,
      height: 8,
      radius: 99,
      inset: 2,
      stableKey: "node:clean-rectangle",
      roughness: 0,
      sampleSpacing: 64,
      maximumPointCount: 9,
    });

    expect(contour).toEqual([
      { x: 2, y: 2 },
      { x: 10, y: 2 },
      { x: 10, y: 6 },
      { x: 2, y: 6 },
      { x: 2, y: 2 },
    ]);
    expect(
      createHandDrawnNodeContour({
        shape: "rectangle",
        width: 12,
        height: 8,
        radius: 0,
        inset: 2,
        stableKey: "node:another-clean-rectangle",
        roughness: 0,
        sampleSpacing: 64,
        maximumPointCount: 9,
      }),
    ).toEqual(contour);
  });

  it("resolves rounded, pill, and ellipse geometry without roughness", () => {
    const rounded = createHandDrawnNodeContour({
      shape: "rounded-rectangle",
      width: 100,
      height: 60,
      radius: 15,
      inset: 5,
      stableKey: "node:rounded",
      roughness: 0,
      sampleSpacing: 64,
      maximumPointCount: 9,
    });
    const pill = createHandDrawnNodeContour({
      shape: "pill",
      width: 100,
      height: 40,
      radius: 1,
      stableKey: "node:pill",
      roughness: 0,
      sampleSpacing: 64,
      maximumPointCount: 9,
    });
    const ellipse = createHandDrawnNodeContour({
      shape: "ellipse",
      width: 100,
      height: 50,
      radius: 0,
      stableKey: "node:ellipse",
      roughness: 0,
      sampleSpacing: 64,
      maximumPointCount: 9,
    });

    expect(rounded).toContainEqual({ x: 20, y: 5 });
    expect(rounded).toContainEqual({ x: 95, y: 20 });
    expect(pill).toContainEqual({ x: 20, y: 0 });
    expect(pill).toContainEqual({ x: 100, y: 20 });
    expect(ellipse).toContainEqual({ x: 50, y: 0 });
    expect(ellipse).toContainEqual({ x: 100, y: 25 });
    expect(ellipse).toContainEqual({ x: 50, y: 50 });
    expect(ellipse).toContainEqual({ x: 0, y: 25 });
  });

  it("enforces point caps and recovers from unsafe optional settings", () => {
    const capped = createHandDrawnNodeContour({
      shape: "ellipse",
      width: 2_000,
      height: 1_000,
      radius: 0,
      stableKey: "node:capped",
      roughness: 2,
      sampleSpacing: 4,
      maximumPointCount: 13,
    });
    const recovered = createHandDrawnNodeContour({
      shape: "pill",
      width: 160,
      height: 80,
      radius: Number.NaN,
      inset: Number.NEGATIVE_INFINITY,
      stableKey: "node:recovered",
      roughness: Number.POSITIVE_INFINITY,
      sampleSpacing: Number.NaN,
      maximumPointCount: Number.POSITIVE_INFINITY,
    });

    expect(capped).toHaveLength(13);
    expect(recovered.length).toBeLessThanOrEqual(96);
    expect(recovered[0]).toEqual(recovered.at(-1));
    expect(
      recovered.every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
      ),
    ).toBe(true);
  });

  it("rejects invalid node-box geometry and unsupported shapes", () => {
    expect(() =>
      createHandDrawnNodeContour({
        shape: "rectangle",
        width: -1,
        height: 20,
        stableKey: "node:invalid-width",
      }),
    ).toThrow("width must be finite and non-negative");
    expect(() =>
      createHandDrawnNodeContour({
        shape: "ellipse",
        width: 20,
        height: Number.NaN,
        stableKey: "node:invalid-height",
      }),
    ).toThrow("height must be finite and non-negative");
    expect(() =>
      createHandDrawnNodeContour({
        shape: "none" as HandDrawnNodeContourShape,
        width: 20,
        height: 20,
        stableKey: "node:invalid-shape",
      }),
    ).toThrow("Unknown hand-drawn node contour shape");
  });
});

describe("sampleCubicBezier", () => {
  it("samples a cubic without moving its endpoints", () => {
    const start = { x: 0, y: 10 };
    const end = { x: 100, y: 50 };
    const points = sampleCubicBezier(
      start,
      { x: 40, y: 10 },
      { x: 60, y: 50 },
      end,
      7,
    );

    expect(points).toHaveLength(7);
    expect(points[0]).toEqual(start);
    expect(points.at(-1)).toEqual(end);
    expect(points[3]).toEqual({ x: 50, y: 30 });
  });
});

describe("stable hand-drawn parameters", () => {
  it("keeps the hashing algorithm stable across sessions", () => {
    expect(createHandDrawnSeed("edge:root->topic")).toBe(859_364_140);
    expect(createHandDrawnSeed("节点")).toBe(3_675_744_052);
  });

  it("produces deterministic bounded border, filter, and paper values", () => {
    const border = createHandDrawnBorderParameters("node:topic");
    const filter = createHandDrawnFilterParameters("document:note");
    const paper = createHandDrawnPaperParameters("theme:pencil");

    expect(createHandDrawnBorderParameters("node:topic")).toEqual(border);
    expect(createHandDrawnFilterParameters("document:note")).toEqual(filter);
    expect(createHandDrawnPaperParameters("theme:pencil")).toEqual(paper);

    expect(Math.abs(border.rotationDegrees)).toBeLessThanOrEqual(0.4);
    expect(Math.abs(border.offsetX)).toBeLessThanOrEqual(0.81);
    expect(Math.abs(border.offsetY)).toBeLessThanOrEqual(0.81);
    expect(border.opacity).toBeGreaterThanOrEqual(0.28);
    expect(border.opacity).toBeLessThanOrEqual(0.42);

    expect(filter.seed).toBeGreaterThan(0);
    expect(filter.baseFrequencyX).toBeGreaterThanOrEqual(0.009);
    expect(filter.baseFrequencyX).toBeLessThanOrEqual(0.014);
    expect(filter.padding).toBeGreaterThanOrEqual(2);

    expect(paper.fineCellSize).toBeGreaterThanOrEqual(3.5);
    expect(paper.coarseCellSize).toBeGreaterThanOrEqual(17);
    expect(paper.opacity).toBeGreaterThanOrEqual(0.025);
    expect(paper.opacity).toBeLessThanOrEqual(0.045);
  });
});
