import { describe, expect, it } from "vitest";

import {
  createHandDrawnBorderParameters,
  createHandDrawnFilterParameters,
  createHandDrawnPaperParameters,
  createHandDrawnSeed,
  createHandDrawnStrokes,
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
