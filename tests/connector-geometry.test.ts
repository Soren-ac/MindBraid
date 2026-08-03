import { describe, expect, it } from "vitest";

import {
  createVariableWidthConnectorDashOutlines,
  createVariableWidthConnectorOutline,
  MAX_VARIABLE_WIDTH_CONNECTOR_DASH_OUTLINES,
  resolveMindMapConnectorStrokeWidths,
  sampleConnectorPath,
} from "../src/layout/connector-geometry";
import type { LayoutPath } from "../src/layout/layout";

describe("connector geometry", () => {
  it("resolves uniform and taper-to-child widths independently of colors and routing", () => {
    expect(
      resolveMindMapConnectorStrokeWidths(8, { kind: "uniform" }),
    ).toEqual({ startWidth: 8, endWidth: 8 });
    expect(
      resolveMindMapConnectorStrokeWidths(8, {
        kind: "taper-to-child",
        childWidthRatio: 0.375,
      }),
    ).toEqual({ startWidth: 8, endWidth: 3 });
  });

  it("creates a closed uniform outline for a straight connector", () => {
    const outline = createVariableWidthConnectorOutline(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      {
        profile: { kind: "uniform" },
        startWidth: 8,
        endWidth: 2,
      },
    );

    expect(outline.startWidth).toBe(8);
    expect(outline.endWidth).toBe(8);
    expect(outline.polygon).toEqual([
      { x: 0, y: 4 },
      { x: 100, y: 4 },
      { x: 100, y: -4 },
      { x: 0, y: -4 },
    ]);
    expect(outline.closedPath.start).toEqual({ x: 0, y: 4 });
    expect(
      outline.closedPath.segments[outline.closedPath.segments.length - 1],
    ).toEqual({
      kind: "line",
      to: { x: 0, y: 4 },
    });
  });

  it("tapers to the child-side width along a straight connector", () => {
    const outline = createVariableWidthConnectorOutline(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      {
        profile: { kind: "taper-to-child", childWidthRatio: 0.25 },
        startWidth: 8,
        endWidth: 2,
      },
    );

    expect(outline.startWidth).toBe(8);
    expect(outline.endWidth).toBe(2);
    expect(outline.polygon).toEqual([
      { x: 0, y: 4 },
      { x: 100, y: 1 },
      { x: 100, y: -1 },
      { x: 0, y: -4 },
    ]);
  });

  it("keeps tapering across dashed connector intervals", () => {
    const outlines = createVariableWidthConnectorDashOutlines(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      {
        profile: { kind: "taper-to-child", childWidthRatio: 0.2 },
        startWidth: 10,
        endWidth: 2,
        dashLength: 20,
        gapLength: 10,
      },
    );

    expect(outlines).toHaveLength(4);
    expect(outlines.map(({ centerline }) => centerline)).toEqual([
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
      [
        { x: 30, y: 0 },
        { x: 50, y: 0 },
      ],
      [
        { x: 60, y: 0 },
        { x: 80, y: 0 },
      ],
      [
        { x: 90, y: 0 },
        { x: 100, y: 0 },
      ],
    ]);
    const widths = outlines.map(({ startWidth, endWidth }) => [
      startWidth,
      endWidth,
    ]);
    [
      [10, 8.4],
      [7.6, 6],
      [5.2, 3.6],
      [2.8, 2],
    ].forEach(([expectedStart, expectedEnd], index) => {
      expect(widths[index]?.[0]).toBeCloseTo(expectedStart ?? 0);
      expect(widths[index]?.[1]).toBeCloseTo(expectedEnd ?? 0);
    });
  });

  it("bounds dash geometry for unusually long finite paths", () => {
    const outlines = createVariableWidthConnectorDashOutlines(
      [
        { x: 0, y: 0 },
        { x: 1_000_000, y: 0 },
      ],
      {
        profile: { kind: "taper-to-child", childWidthRatio: 0.2 },
        startWidth: 10,
        endWidth: 2,
        dashLength: 2,
        gapLength: 3,
      },
    );

    expect(outlines).toHaveLength(
      MAX_VARIABLE_WIDTH_CONNECTOR_DASH_OUTLINES,
    );
    expect(outlines[0]?.centerline[0]).toEqual({ x: 0, y: 0 });
    expect(
      outlines.at(-1)?.centerline.at(-1)?.x,
    ).toBeLessThanOrEqual(1_000_000);
  });

  it("omits degenerate dash geometry and rejects overflowing path length", () => {
    expect(
      createVariableWidthConnectorDashOutlines(
        [{ x: 4, y: 7 }],
        {
          profile: { kind: "uniform" },
          startWidth: 2,
          endWidth: 2,
          dashLength: 2,
          gapLength: 3,
        },
      ),
    ).toEqual([]);
    expect(
      createVariableWidthConnectorDashOutlines(
        [
          { x: 4, y: 7 },
          { x: 4, y: 7 },
        ],
        {
          profile: { kind: "uniform" },
          startWidth: 2,
          endWidth: 2,
          dashLength: 2,
          gapLength: 3,
        },
      ),
    ).toEqual([]);
    expect(() =>
      createVariableWidthConnectorDashOutlines(
        [
          { x: -1e308, y: 0 },
          { x: 1e308, y: 0 },
        ],
        {
          profile: { kind: "uniform" },
          startWidth: 2,
          endWidth: 2,
          dashLength: 2,
          gapLength: 3,
        },
      ),
    ).toThrow("centerline length must be finite");
    expect(() =>
      createVariableWidthConnectorOutline(
        [
          { x: -1e308, y: 0 },
          { x: 1e308, y: 0 },
        ],
        {
          profile: { kind: "uniform" },
          startWidth: 2,
          endWidth: 2,
        },
      ),
    ).toThrow("centerline length must be finite");
  });

  it("bounds line sampling and rejects overflowing typed path segments", () => {
    const longPath: LayoutPath = {
      start: { x: 0, y: 0 },
      segments: [{ kind: "line", to: { x: 1_000_000_000, y: 0 } }],
    };
    const samples = sampleConnectorPath(longPath, {
      maximumSegmentLength: 1,
    });

    expect(samples).toHaveLength(1_025);
    expect(samples[0]).toEqual(longPath.start);
    expect(samples.at(-1)).toEqual({ x: 1_000_000_000, y: 0 });

    const overflowingPath: LayoutPath = {
      start: { x: -1e308, y: 0 },
      segments: [{ kind: "line", to: { x: 1e308, y: 0 } }],
    };
    expect(() => sampleConnectorPath(overflowingPath)).toThrow(
      "path segment length must be finite",
    );
    expect(() =>
      createVariableWidthConnectorDashOutlines(overflowingPath, {
        profile: { kind: "uniform" },
        startWidth: 2,
        endWidth: 2,
        dashLength: 2,
        gapLength: 3,
      }),
    ).toThrow("path segment length must be finite");
  });

  it("samples line, quadratic, and cubic typed path segments deterministically", () => {
    const path: LayoutPath = {
      start: { x: 0, y: 0 },
      segments: [
        { kind: "line", to: { x: 20, y: 0 } },
        {
          kind: "quadratic",
          control: { x: 40, y: 60 },
          to: { x: 80, y: 0 },
        },
        {
          kind: "cubic",
          control1: { x: 100, y: -50 },
          control2: { x: 140, y: 50 },
          to: { x: 160, y: 0 },
        },
      ],
    };
    const samples = sampleConnectorPath(path, {
      maximumSegmentLength: 10,
      minimumCurveSegments: 4,
    });
    const outline = createVariableWidthConnectorOutline(path, {
      profile: { kind: "taper-to-child", childWidthRatio: 0.4 },
      startWidth: 6,
      endWidth: 2.4,
      sampling: { maximumSegmentLength: 10, minimumCurveSegments: 4 },
    });

    expect(samples[0]).toEqual({ x: 0, y: 0 });
    expect(samples[samples.length - 1]).toEqual({ x: 160, y: 0 });
    expect(samples.length).toBeGreaterThan(16);
    expect(outline.centerline).toEqual(samples);
    expect(outline.polygon).toHaveLength(samples.length * 2);
    expect(outline.closedPath.segments).toHaveLength(
      outline.polygon.length,
    );
    expect(
      outline.polygon.every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
      ),
    ).toBe(true);
  });

  it("returns a deterministic closed fallback for a degenerate path", () => {
    const outline = createVariableWidthConnectorOutline(
      {
        start: { x: 20, y: 30 },
        segments: [{ kind: "line", to: { x: 20, y: 30 } }],
      },
      {
        profile: { kind: "taper-to-child", childWidthRatio: 0.5 },
        startWidth: 8,
        endWidth: 4,
      },
    );

    expect(outline.centerline).toEqual([{ x: 20, y: 30 }]);
    expect(outline.polygon).toEqual([
      { x: 16, y: 26 },
      { x: 24, y: 26 },
      { x: 24, y: 34 },
      { x: 16, y: 34 },
    ]);
    expect(
      outline.closedPath.segments[outline.closedPath.segments.length - 1],
    ).toEqual({
      kind: "line",
      to: { x: 16, y: 26 },
    });
  });

  it("rejects non-finite geometry and unsupported profile values", () => {
    expect(() =>
      createVariableWidthConnectorOutline(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        {
          profile: { kind: "uniform" },
          startWidth: 0,
          endWidth: 1,
        },
      ),
    ).toThrow("positive finite");
    expect(() =>
      resolveMindMapConnectorStrokeWidths(2, {
        kind: "taper-to-child",
        childWidthRatio: 0,
      }),
    ).toThrow("invalid");
    expect(() =>
      createVariableWidthConnectorOutline(
        [
          { x: 0, y: 0 },
          { x: Number.NaN, y: 0 },
        ],
        {
          profile: { kind: "uniform" },
          startWidth: 2,
          endWidth: 2,
        },
      ),
    ).toThrow("finite coordinates");
    expect(() =>
      createVariableWidthConnectorDashOutlines(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        {
          profile: { kind: "uniform" },
          startWidth: 2,
          endWidth: 2,
          dashLength: 0,
          gapLength: 2,
        },
      ),
    ).toThrow("dash length");
  });
});
