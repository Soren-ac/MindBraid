import type { LayoutPath, LayoutPathSegment, LayoutPoint } from "./layout";
import type { MindMapConnectorStrokeProfile } from "../presentation/presentation";

const EPSILON = 0.000_001;
const DEFAULT_MAXIMUM_SAMPLE_SEGMENT_LENGTH = 12;
const DEFAULT_MINIMUM_CURVE_SEGMENTS = 8;
const MAXIMUM_PATH_SEGMENT_SAMPLES = 1_024;
/** Per stroke pass safety bound for dashed/dotted filled connector segments. */
export const MAX_VARIABLE_WIDTH_CONNECTOR_DASH_OUTLINES = 256;

/** Tuning values for deterministic curve flattening. */
export interface ConnectorPathSamplingOptions {
  /** Preferred distance between samples, subject to the per-segment safety cap. */
  readonly maximumSegmentLength?: number;
  /** Minimum number of samples emitted for each quadratic or cubic segment. */
  readonly minimumCurveSegments?: number;
}

/** Resolved parent-side and child-side connector widths in scene units. */
export interface MindMapConnectorStrokeWidths {
  readonly startWidth: number;
  readonly endWidth: number;
}

/**
 * Input for a renderer-neutral filled connector outline. `endWidth` is still
 * validated for uniform profiles, but uniform intentionally uses
 * `startWidth` at both ends.
 */
export interface VariableWidthConnectorOutlineOptions {
  readonly profile: MindMapConnectorStrokeProfile;
  readonly startWidth: number;
  readonly endWidth: number;
  readonly sampling?: ConnectorPathSamplingOptions;
}

/**
 * A renderer-neutral dash pattern for a variable-width connector. Lengths are
 * expressed in the same scene units as the layout path.
 */
export interface VariableWidthConnectorDashOptions
  extends VariableWidthConnectorOutlineOptions {
  readonly dashLength: number;
  readonly gapLength: number;
}

/**
 * A closed perimeter around a connector centerline. Renderers can fill
 * `closedPath`, draw `polygon` directly, or convert either value to their
 * native geometry without needing SVG or DOM APIs here.
 */
export interface VariableWidthConnectorOutline {
  readonly centerline: readonly LayoutPoint[];
  readonly startWidth: number;
  readonly endWidth: number;
  /** Counter-clockwise-ish perimeter without a duplicated closing point. */
  readonly polygon: readonly LayoutPoint[];
  /** A line-only typed path whose final segment returns to `start`. */
  readonly closedPath: LayoutPath;
}

/**
 * Resolve a semantic profile into concrete widths. Styles can supply the
 * profile through their default edge tokens; the caller supplies the resolved
 * connector width selected for the current document.
 */
export function resolveMindMapConnectorStrokeWidths(
  width: number,
  profile: MindMapConnectorStrokeProfile,
): MindMapConnectorStrokeWidths {
  assertPositiveFinite(width, "Connector width");
  assertValidConnectorStrokeProfile(profile);

  if (profile.kind === "uniform") {
    return { startWidth: width, endWidth: width };
  }

  return {
    startWidth: width,
    endWidth: width * profile.childWidthRatio,
  };
}

/**
 * Flatten an engine-owned typed path into deterministic, duplicate-free scene
 * points. It supports straight, quadratic, and cubic segments and does not
 * require a browser geometry implementation.
 */
export function sampleConnectorPath(
  path: LayoutPath,
  options: ConnectorPathSamplingOptions = {},
): readonly LayoutPoint[] {
  const sampling = resolveSamplingOptions(options);
  assertFinitePoint(path.start, "Path start");

  const samples: LayoutPoint[] = [clonePoint(path.start)];
  let current = path.start;
  for (const segment of path.segments) {
    appendSegmentSamples(samples, current, segment, sampling);
    current = segment.to;
  }
  return samples;
}

/**
 * Builds a filled outline from either an existing layout path or pre-sampled
 * centerline points. The output stays entirely renderer-neutral and is stable
 * for identical inputs.
 */
export function createVariableWidthConnectorOutline(
  centerline: LayoutPath | readonly LayoutPoint[],
  options: VariableWidthConnectorOutlineOptions,
): VariableWidthConnectorOutline {
  assertPositiveFinite(options.startWidth, "Connector start width");
  assertPositiveFinite(options.endWidth, "Connector end width");
  assertValidConnectorStrokeProfile(options.profile);

  const sampled = isLayoutPath(centerline)
    ? sampleConnectorPath(centerline, options.sampling)
    : normalizeCenterlinePoints(centerline);
  const effectiveEndWidth =
    options.profile.kind === "uniform"
      ? options.startWidth
      : options.endWidth;

  if (sampled.length < 2) {
    return createDegenerateOutline(
      sampled[0] ?? { x: 0, y: 0 },
      options.startWidth,
      effectiveEndWidth,
      sampled,
    );
  }

  const distances = getCumulativeDistances(sampled);
  const totalLength = distances[distances.length - 1];
  assertFinitePolylineLength(totalLength);
  if (totalLength === undefined || totalLength <= EPSILON) {
    return createDegenerateOutline(
      sampled[0] ?? { x: 0, y: 0 },
      options.startWidth,
      effectiveEndWidth,
      sampled,
    );
  }

  const left: LayoutPoint[] = [];
  const right: LayoutPoint[] = [];
  for (let index = 0; index < sampled.length; index += 1) {
    const point = sampled[index];
    const distance = distances[index];
    if (point === undefined || distance === undefined) {
      continue;
    }
    const width = interpolate(
      options.startWidth,
      effectiveEndWidth,
      distance / totalLength,
    );
    const normal = resolveNormal(sampled, index);
    const halfWidth = width / 2;
    left.push({
      x: point.x + normal.x * halfWidth,
      y: point.y + normal.y * halfWidth,
    });
    right.push({
      x: point.x - normal.x * halfWidth,
      y: point.y - normal.y * halfWidth,
    });
  }

  const polygon = [...left, ...right.reverse()];
  return {
    centerline: sampled,
    startWidth: options.startWidth,
    endWidth: effectiveEndWidth,
    polygon,
    closedPath: createClosedPolylinePath(polygon),
  };
}

/**
 * Splits a connector centerline into painted intervals and builds one tapered
 * outline for each interval. This keeps line style and connector profile
 * independent: dashed and dotted styles do not silently downgrade a selected
 * taper-to-child profile to a uniform stroke.
 */
export function createVariableWidthConnectorDashOutlines(
  centerline: LayoutPath | readonly LayoutPoint[],
  options: VariableWidthConnectorDashOptions,
): readonly VariableWidthConnectorOutline[] {
  assertPositiveFinite(options.dashLength, "Connector dash length");
  assertPositiveFinite(options.gapLength, "Connector dash gap");
  assertPositiveFinite(options.startWidth, "Connector start width");
  assertPositiveFinite(options.endWidth, "Connector end width");
  assertValidConnectorStrokeProfile(options.profile);

  const sampled = isLayoutPath(centerline)
    ? sampleConnectorPath(centerline, options.sampling)
    : normalizeCenterlinePoints(centerline);
  if (sampled.length < 2) {
    return [];
  }
  const distances = getCumulativeDistances(sampled);
  const totalLength = distances[distances.length - 1] ?? 0;
  assertFinitePolylineLength(totalLength);
  const effectiveEndWidth =
    options.profile.kind === "uniform"
      ? options.startWidth
      : options.endWidth;
  if (totalLength <= EPSILON) {
    return [];
  }

  const outlines: VariableWidthConnectorOutline[] = [];
  const requestedPatternLength = options.dashLength + options.gapLength;
  assertPositiveFinite(requestedPatternLength, "Connector dash pattern length");
  const patternLength = Math.max(
    requestedPatternLength,
    totalLength / MAX_VARIABLE_WIDTH_CONNECTOR_DASH_OUTLINES,
  );
  const dashLength =
    patternLength * (options.dashLength / requestedPatternLength);
  const intervalCount = Math.min(
    MAX_VARIABLE_WIDTH_CONNECTOR_DASH_OUTLINES,
    Math.ceil(totalLength / patternLength),
  );
  for (let intervalIndex = 0; intervalIndex < intervalCount; intervalIndex += 1) {
    const intervalStart = intervalIndex * patternLength;
    if (intervalStart >= totalLength - EPSILON) {
      break;
    }
    const intervalEnd = Math.min(
      totalLength,
      intervalStart + dashLength,
    );
    if (intervalEnd - intervalStart <= EPSILON) {
      continue;
    }
    const intervalPoints = slicePolylineByDistance(
      sampled,
      distances,
      intervalStart,
      intervalEnd,
    );
    outlines.push(
      createVariableWidthConnectorOutline(intervalPoints, {
        profile: options.profile,
        startWidth: interpolate(
          options.startWidth,
          effectiveEndWidth,
          intervalStart / totalLength,
        ),
        endWidth: interpolate(
          options.startWidth,
          effectiveEndWidth,
          intervalEnd / totalLength,
        ),
      }),
    );
  }
  return outlines;
}

function resolveSamplingOptions(
  options: ConnectorPathSamplingOptions,
): Required<ConnectorPathSamplingOptions> {
  const maximumSegmentLength =
    options.maximumSegmentLength ?? DEFAULT_MAXIMUM_SAMPLE_SEGMENT_LENGTH;
  const minimumCurveSegments =
    options.minimumCurveSegments ?? DEFAULT_MINIMUM_CURVE_SEGMENTS;
  assertPositiveFinite(maximumSegmentLength, "Maximum sample segment length");
  if (
    !Number.isInteger(minimumCurveSegments) ||
    minimumCurveSegments < 1 ||
    minimumCurveSegments > MAXIMUM_PATH_SEGMENT_SAMPLES
  ) {
    throw new RangeError(
      `Minimum curve segments must be an integer between 1 and ${MAXIMUM_PATH_SEGMENT_SAMPLES}.`,
    );
  }
  return { maximumSegmentLength, minimumCurveSegments };
}

function isLayoutPath(
  value: LayoutPath | readonly LayoutPoint[],
): value is LayoutPath {
  return !Array.isArray(value);
}

function appendSegmentSamples(
  samples: LayoutPoint[],
  start: LayoutPoint,
  segment: LayoutPathSegment,
  options: Required<ConnectorPathSamplingOptions>,
): void {
  assertFinitePoint(segment.to, "Path segment end");
  if (segment.kind === "line") {
    appendLinearSamples(samples, start, segment.to, options.maximumSegmentLength);
    return;
  }

  if (segment.kind === "quadratic") {
    assertFinitePoint(segment.control, "Quadratic control point");
    const steps = resolveCurveSteps(
      getDistance(start, segment.control) +
        getDistance(segment.control, segment.to),
      options,
    );
    for (let step = 1; step <= steps; step += 1) {
      appendDistinctPoint(
        samples,
        evaluateQuadratic(start, segment.control, segment.to, step / steps),
      );
    }
    return;
  }

  assertFinitePoint(segment.control1, "Cubic first control point");
  assertFinitePoint(segment.control2, "Cubic second control point");
  const steps = resolveCurveSteps(
    getDistance(start, segment.control1) +
      getDistance(segment.control1, segment.control2) +
      getDistance(segment.control2, segment.to),
    options,
  );
  for (let step = 1; step <= steps; step += 1) {
    appendDistinctPoint(
      samples,
      evaluateCubic(
        start,
        segment.control1,
        segment.control2,
        segment.to,
        step / steps,
      ),
    );
  }
}

function appendLinearSamples(
  samples: LayoutPoint[],
  start: LayoutPoint,
  end: LayoutPoint,
  maximumSegmentLength: number,
): void {
  const distance = getDistance(start, end);
  assertFiniteSegmentLength(distance);
  const steps = Math.min(
    MAXIMUM_PATH_SEGMENT_SAMPLES,
    Math.max(1, Math.ceil(distance / maximumSegmentLength)),
  );
  for (let step = 1; step <= steps; step += 1) {
    appendDistinctPoint(samples, interpolatePoint(start, end, step / steps));
  }
}

function resolveCurveSteps(
  controlPolygonLength: number,
  options: Required<ConnectorPathSamplingOptions>,
): number {
  assertFiniteSegmentLength(controlPolygonLength);
  return Math.min(
    MAXIMUM_PATH_SEGMENT_SAMPLES,
    Math.max(
      options.minimumCurveSegments,
      Math.ceil(controlPolygonLength / options.maximumSegmentLength),
    ),
  );
}

function evaluateQuadratic(
  start: LayoutPoint,
  control: LayoutPoint,
  end: LayoutPoint,
  progress: number,
): LayoutPoint {
  const inverse = 1 - progress;
  return {
    x:
      inverse * inverse * start.x +
      2 * inverse * progress * control.x +
      progress * progress * end.x,
    y:
      inverse * inverse * start.y +
      2 * inverse * progress * control.y +
      progress * progress * end.y,
  };
}

function evaluateCubic(
  start: LayoutPoint,
  control1: LayoutPoint,
  control2: LayoutPoint,
  end: LayoutPoint,
  progress: number,
): LayoutPoint {
  const inverse = 1 - progress;
  return {
    x:
      inverse * inverse * inverse * start.x +
      3 * inverse * inverse * progress * control1.x +
      3 * inverse * progress * progress * control2.x +
      progress * progress * progress * end.x,
    y:
      inverse * inverse * inverse * start.y +
      3 * inverse * inverse * progress * control1.y +
      3 * inverse * progress * progress * control2.y +
      progress * progress * progress * end.y,
  };
}

function slicePolylineByDistance(
  points: readonly LayoutPoint[],
  distances: readonly number[],
  startDistance: number,
  endDistance: number,
): readonly LayoutPoint[] {
  const startIndex = findDistanceSegmentIndex(distances, startDistance);
  const endIndex = findDistanceSegmentIndex(distances, endDistance);
  const result: LayoutPoint[] = [
    interpolatePolylinePoint(points, distances, startIndex, startDistance),
  ];
  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    const distance = distances[index];
    const point = points[index];
    if (
      distance !== undefined &&
      point !== undefined &&
      distance > startDistance + EPSILON &&
      distance < endDistance - EPSILON
    ) {
      appendDistinctPoint(result, point);
    }
  }
  appendDistinctPoint(
    result,
    interpolatePolylinePoint(points, distances, endIndex, endDistance),
  );
  return result;
}

function findDistanceSegmentIndex(
  distances: readonly number[],
  target: number,
): number {
  let low = 0;
  let high = Math.max(0, distances.length - 2);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const nextDistance = distances[middle + 1] ?? Number.POSITIVE_INFINITY;
    if (nextDistance < target - EPSILON) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function interpolatePolylinePoint(
  points: readonly LayoutPoint[],
  distances: readonly number[],
  segmentIndex: number,
  target: number,
): LayoutPoint {
  const start = points[segmentIndex] ?? points[0] ?? { x: 0, y: 0 };
  const end = points[segmentIndex + 1] ?? start;
  const startDistance = distances[segmentIndex] ?? 0;
  const endDistance = distances[segmentIndex + 1] ?? startDistance;
  const segmentLength = endDistance - startDistance;
  return segmentLength <= EPSILON
    ? clonePoint(start)
    : interpolatePoint(
        start,
        end,
        Math.min(1, Math.max(0, (target - startDistance) / segmentLength)),
      );
}

function normalizeCenterlinePoints(
  points: readonly LayoutPoint[],
): readonly LayoutPoint[] {
  const normalized: LayoutPoint[] = [];
  for (const point of points) {
    assertFinitePoint(point, "Connector centerline point");
    appendDistinctPoint(normalized, point);
  }
  return normalized;
}

function appendDistinctPoint(points: LayoutPoint[], point: LayoutPoint): void {
  const previous = points[points.length - 1];
  if (previous !== undefined && getDistance(previous, point) <= EPSILON) {
    return;
  }
  points.push(clonePoint(point));
}

function getCumulativeDistances(points: readonly LayoutPoint[]): readonly number[] {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const priorDistance = distances[index - 1];
    if (
      previous === undefined ||
      current === undefined ||
      priorDistance === undefined
    ) {
      continue;
    }
    distances.push(priorDistance + getDistance(previous, current));
  }
  return distances;
}

function assertFinitePolylineLength(length: number | undefined): void {
  if (length === undefined || !Number.isFinite(length)) {
    throw new RangeError("Connector centerline length must be finite.");
  }
}

function assertFiniteSegmentLength(length: number): void {
  if (!Number.isFinite(length)) {
    throw new RangeError("Connector path segment length must be finite.");
  }
}

function resolveNormal(
  points: readonly LayoutPoint[],
  index: number,
): LayoutPoint {
  const point = points[index];
  if (point === undefined) {
    return { x: 0, y: 1 };
  }
  const incoming = findIncomingUnitVector(points, index);
  const outgoing = findOutgoingUnitVector(points, index);
  const tangent =
    incoming === null
      ? outgoing
      : outgoing === null
        ? incoming
        : normalizeVector({
            x: incoming.x + outgoing.x,
            y: incoming.y + outgoing.y,
          }) ?? outgoing;
  if (tangent === null) {
    return { x: 0, y: 1 };
  }
  return { x: -tangent.y, y: tangent.x };
}

function findIncomingUnitVector(
  points: readonly LayoutPoint[],
  index: number,
): LayoutPoint | null {
  const point = points[index];
  if (point === undefined) {
    return null;
  }
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const previous = points[previousIndex];
    if (previous === undefined) {
      continue;
    }
    const vector = normalizeVector({
      x: point.x - previous.x,
      y: point.y - previous.y,
    });
    if (vector !== null) {
      return vector;
    }
  }
  return null;
}

function findOutgoingUnitVector(
  points: readonly LayoutPoint[],
  index: number,
): LayoutPoint | null {
  const point = points[index];
  if (point === undefined) {
    return null;
  }
  for (let nextIndex = index + 1; nextIndex < points.length; nextIndex += 1) {
    const next = points[nextIndex];
    if (next === undefined) {
      continue;
    }
    const vector = normalizeVector({
      x: next.x - point.x,
      y: next.y - point.y,
    });
    if (vector !== null) {
      return vector;
    }
  }
  return null;
}

function normalizeVector(vector: LayoutPoint): LayoutPoint | null {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= EPSILON) {
    return null;
  }
  return { x: vector.x / length, y: vector.y / length };
}

function createDegenerateOutline(
  point: LayoutPoint,
  startWidth: number,
  endWidth: number,
  centerline: readonly LayoutPoint[],
): VariableWidthConnectorOutline {
  const halfWidth = Math.max(startWidth, endWidth) / 2;
  const polygon: readonly LayoutPoint[] = [
    { x: point.x - halfWidth, y: point.y - halfWidth },
    { x: point.x + halfWidth, y: point.y - halfWidth },
    { x: point.x + halfWidth, y: point.y + halfWidth },
    { x: point.x - halfWidth, y: point.y + halfWidth },
  ];
  return {
    centerline:
      centerline.length === 0 ? [clonePoint(point)] : centerline,
    startWidth,
    endWidth,
    polygon,
    closedPath: createClosedPolylinePath(polygon),
  };
}

function createClosedPolylinePath(points: readonly LayoutPoint[]): LayoutPath {
  const start = points[0] ?? { x: 0, y: 0 };
  return {
    start: clonePoint(start),
    segments: [
      ...points.slice(1).map((point) => ({
        kind: "line" as const,
        to: clonePoint(point),
      })),
      { kind: "line", to: clonePoint(start) },
    ],
  };
}

function interpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function interpolatePoint(
  start: LayoutPoint,
  end: LayoutPoint,
  progress: number,
): LayoutPoint {
  return {
    x: interpolate(start.x, end.x, progress),
    y: interpolate(start.y, end.y, progress),
  };
}

function getDistance(first: LayoutPoint, second: LayoutPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function clonePoint(point: LayoutPoint): LayoutPoint {
  return { x: point.x, y: point.y };
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

function assertFinitePoint(point: LayoutPoint, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} must contain finite coordinates.`);
  }
}

function assertValidConnectorStrokeProfile(
  profile: MindMapConnectorStrokeProfile,
): void {
  const candidate = profile as {
    readonly kind?: unknown;
    readonly childWidthRatio?: unknown;
  };
  if (candidate.kind === "uniform") {
    return;
  }
  if (
    candidate.kind !== "taper-to-child" ||
    typeof candidate.childWidthRatio !== "number" ||
    !Number.isFinite(candidate.childWidthRatio) ||
    candidate.childWidthRatio <= 0 ||
    candidate.childWidthRatio > 1
  ) {
    throw new RangeError("Connector stroke profile is invalid.");
  }
}
