/**
 * Renderer-neutral, deterministic parameters for a hand-drawn presentation.
 *
 * The stable key must describe the semantic object being drawn (normally a
 * node or edge ID), never its render index. The helpers intentionally avoid
 * `Math.random()` so a hover, resize, or document refresh cannot make strokes
 * jump between frames.
 */

export interface HandDrawnPoint {
  readonly x: number;
  readonly y: number;
}

export interface HandDrawnStroke {
  readonly points: readonly HandDrawnPoint[];
  readonly opacity: number;
  readonly widthScale: number;
}

export interface HandDrawnStrokeOptions {
  /** Maximum perpendicular displacement in scene pixels. */
  readonly roughness?: number;
  /** Approximate distance between generated points in scene pixels. */
  readonly sampleSpacing?: number;
  /** Hard cap that bounds CPU and SVG/Canvas command counts per stroke. */
  readonly maximumPointCount?: number;
  /** A second pass gives the characteristic doubled pencil line. */
  readonly passCount?: 1 | 2;
}

export interface HandDrawnBorderParameters {
  /** Rotation for a non-layout-affecting inner border pseudo-element. */
  readonly rotationDegrees: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly inset: number;
  readonly opacity: number;
}

/**
 * Values map directly to an SVG feTurbulence/feDisplacementMap pair without
 * requiring this module to create or retain DOM nodes.
 */
export interface HandDrawnFilterParameters {
  readonly seed: number;
  readonly baseFrequencyX: number;
  readonly baseFrequencyY: number;
  readonly octaves: 1 | 2;
  readonly displacementScale: number;
  /** Extra user-space padding that prevents a displaced stroke being clipped. */
  readonly padding: number;
}

/**
 * Static CSS-gradient parameters for subtle paper grain. Applying a turbulence
 * filter to the complete viewport is deliberately avoided because it is much
 * more expensive while the canvas is panned or zoomed.
 */
export interface HandDrawnPaperParameters {
  readonly fineCellSize: number;
  readonly coarseCellSize: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly opacity: number;
}

const DEFAULT_ROUGHNESS = 1.15;
const DEFAULT_SAMPLE_SPACING = 16;
const DEFAULT_MAXIMUM_POINT_COUNT = 64;
const MINIMUM_SAMPLE_SPACING = 4;
const MAXIMUM_SAMPLE_SPACING = 64;
const MINIMUM_POINT_COUNT = 3;
const MAXIMUM_POINT_COUNT = 256;
const UINT32_RANGE = 0x1_0000_0000;

/**
 * Create one or two stable pencil strokes around a source polyline.
 *
 * Endpoints remain exact so a line continues to meet its source and target
 * nodes. Intermediate points receive low-pass, perpendicular noise rather than
 * independent x/y noise; this reads as a drawn stroke instead of a sawtooth.
 */
export function createHandDrawnStrokes(
  sourcePoints: readonly HandDrawnPoint[],
  stableKey: string,
  options: HandDrawnStrokeOptions = {},
): readonly HandDrawnStroke[] {
  assertValidPoints(sourcePoints);

  const roughness = finiteInRange(
    options.roughness,
    DEFAULT_ROUGHNESS,
    0,
    4,
  );
  const sampleSpacing = finiteInRange(
    options.sampleSpacing,
    DEFAULT_SAMPLE_SPACING,
    MINIMUM_SAMPLE_SPACING,
    MAXIMUM_SAMPLE_SPACING,
  );
  const maximumPointCount = Math.round(
    finiteInRange(
      options.maximumPointCount,
      DEFAULT_MAXIMUM_POINT_COUNT,
      MINIMUM_POINT_COUNT,
      MAXIMUM_POINT_COUNT,
    ),
  );
  const passCount = options.passCount === 1 ? 1 : 2;
  const sampledPoints = resamplePolyline(
    sourcePoints,
    sampleSpacing,
    maximumPointCount,
  );
  const strokes: HandDrawnStroke[] = [];

  for (let passIndex = 0; passIndex < passCount; passIndex += 1) {
    const random = createStableRandom(`${stableKey}\u0000stroke:${passIndex}`);
    strokes.push({
      points: jitterPoints(sampledPoints, roughness, passIndex, random),
      opacity: roundTo(
        passIndex === 0
          ? 0.72 + random() * 0.08
          : 0.3 + random() * 0.08,
        4,
      ),
      widthScale: roundTo(
        passIndex === 0
          ? 0.94 + random() * 0.12
          : 0.72 + random() * 0.16,
        4,
      ),
    });
  }

  return strokes;
}

/**
 * Sample an existing cubic edge before passing it to createHandDrawnStrokes.
 * Canvas, SVG, and future renderers can share the resulting point geometry.
 */
export function sampleCubicBezier(
  start: HandDrawnPoint,
  controlOne: HandDrawnPoint,
  controlTwo: HandDrawnPoint,
  end: HandDrawnPoint,
  pointCount = 12,
): readonly HandDrawnPoint[] {
  assertValidPoints([start, controlOne, controlTwo, end]);
  const count = Math.round(
    finiteInRange(
      pointCount,
      12,
      MINIMUM_POINT_COUNT,
      MAXIMUM_POINT_COUNT,
    ),
  );
  const points: HandDrawnPoint[] = [];

  for (let index = 0; index < count; index += 1) {
    const progress = index / (count - 1);
    const inverse = 1 - progress;
    points.push({
      x:
        inverse * inverse * inverse * start.x +
        3 * inverse * inverse * progress * controlOne.x +
        3 * inverse * progress * progress * controlTwo.x +
        progress * progress * progress * end.x,
      y:
        inverse * inverse * inverse * start.y +
        3 * inverse * inverse * progress * controlOne.y +
        3 * inverse * progress * progress * controlTwo.y +
        progress * progress * progress * end.y,
    });
  }

  return points;
}

export function createHandDrawnBorderParameters(
  stableKey: string,
  roughness = DEFAULT_ROUGHNESS,
): HandDrawnBorderParameters {
  const strength = finiteInRange(roughness, DEFAULT_ROUGHNESS, 0, 4);
  const random = createStableRandom(`${stableKey}\u0000border`);

  return {
    rotationDegrees: roundTo(centered(random) * 0.34 * strength, 4),
    offsetX: roundTo(centered(random) * 0.7 * strength, 4),
    offsetY: roundTo(centered(random) * 0.7 * strength, 4),
    inset: roundTo(1.15 + random() * 0.9, 4),
    opacity: roundTo(0.28 + random() * 0.14, 4),
  };
}

export function createHandDrawnFilterParameters(
  stableKey: string,
  roughness = DEFAULT_ROUGHNESS,
): HandDrawnFilterParameters {
  const strength = finiteInRange(roughness, DEFAULT_ROUGHNESS, 0, 4);
  const seed = createHandDrawnSeed(`${stableKey}\u0000filter`);
  const random = createStableRandom(seed);
  const displacementScale = roundTo(
    Math.max(0, 0.45 + strength * 0.62 + centered(random) * 0.16),
    4,
  );

  return {
    seed: 1 + (seed % 2_147_483_646),
    baseFrequencyX: roundTo(0.009 + random() * 0.005, 6),
    baseFrequencyY: roundTo(0.012 + random() * 0.006, 6),
    octaves: strength >= 1.6 ? 2 : 1,
    displacementScale,
    padding: Math.ceil(displacementScale * 3 + 2),
  };
}

export function createHandDrawnPaperParameters(
  stableKey: string,
  strength = 1,
): HandDrawnPaperParameters {
  const opacityStrength = finiteInRange(strength, 1, 0, 2);
  const random = createStableRandom(`${stableKey}\u0000paper`);

  return {
    fineCellSize: roundTo(3.5 + random() * 1.5, 3),
    coarseCellSize: roundTo(17 + random() * 6, 3),
    offsetX: roundTo(random() * 5, 3),
    offsetY: roundTo(random() * 5, 3),
    opacity: roundTo((0.025 + random() * 0.02) * opacityStrength, 4),
  };
}

/**
 * FNV-1a over UTF-16 code units. The exact algorithm is part of the stability
 * contract: the same semantic key produces the same drawing across sessions.
 */
export function createHandDrawnSeed(stableKey: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < stableKey.length; index += 1) {
    hash ^= stableKey.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function jitterPoints(
  points: readonly HandDrawnPoint[],
  roughness: number,
  passIndex: number,
  random: () => number,
): readonly HandDrawnPoint[] {
  if (roughness === 0 || points.length <= 2) {
    return points.map(copyPoint);
  }

  let previousNoise = 0;
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) {
      return copyPoint(point);
    }

    const previous = points[index - 1];
    const next = points[index + 1];
    if (previous === undefined || next === undefined) {
      return copyPoint(point);
    }

    const tangentX = next.x - previous.x;
    const tangentY = next.y - previous.y;
    const tangentLength = Math.hypot(tangentX, tangentY);
    if (tangentLength === 0) {
      return copyPoint(point);
    }

    const rawNoise = centered(random);
    const smoothedNoise = previousNoise * 0.42 + rawNoise * 0.58;
    previousNoise = smoothedNoise;
    const endpointTaper = Math.min(index, points.length - 1 - index, 2) / 2;
    const passBias = passIndex === 0 ? -0.12 : 0.12;
    const perpendicularOffset =
      (smoothedNoise + passBias) * roughness * endpointTaper;
    const alongOffset =
      centered(random) * roughness * 0.16 * endpointTaper;
    const unitTangentX = tangentX / tangentLength;
    const unitTangentY = tangentY / tangentLength;
    const unitNormalX = -unitTangentY;
    const unitNormalY = unitTangentX;

    return {
      x:
        point.x +
        unitNormalX * perpendicularOffset +
        unitTangentX * alongOffset,
      y:
        point.y +
        unitNormalY * perpendicularOffset +
        unitTangentY * alongOffset,
    };
  });
}

function resamplePolyline(
  sourcePoints: readonly HandDrawnPoint[],
  spacing: number,
  maximumPointCount: number,
): readonly HandDrawnPoint[] {
  const segmentLengths: number[] = [];
  let totalLength = 0;
  let desiredPointCount = 1;

  for (let index = 1; index < sourcePoints.length; index += 1) {
    const start = sourcePoints[index - 1];
    const end = sourcePoints[index];
    if (start === undefined || end === undefined) {
      continue;
    }
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    segmentLengths.push(length);
    totalLength += length;
    if (length > 0) {
      desiredPointCount += Math.max(1, Math.ceil(length / spacing));
    }
  }

  if (totalLength === 0) {
    const first = sourcePoints[0];
    const last = sourcePoints[sourcePoints.length - 1];
    if (first === undefined || last === undefined) {
      return [];
    }
    return [copyPoint(first), copyPoint(last)];
  }

  if (desiredPointCount <= maximumPointCount) {
    const points: HandDrawnPoint[] = [];
    const first = sourcePoints[0];
    if (first !== undefined) {
      points.push(copyPoint(first));
    }

    for (let index = 1; index < sourcePoints.length; index += 1) {
      const start = sourcePoints[index - 1];
      const end = sourcePoints[index];
      const length = segmentLengths[index - 1];
      if (
        start === undefined ||
        end === undefined ||
        length === undefined ||
        length === 0
      ) {
        continue;
      }
      const subdivisions = Math.max(1, Math.ceil(length / spacing));
      for (let step = 1; step <= subdivisions; step += 1) {
        const progress = step / subdivisions;
        points.push(interpolate(start, end, progress));
      }
    }
    return ensureMinimumPoints(points);
  }

  return resampleUniformly(
    sourcePoints,
    segmentLengths,
    totalLength,
    maximumPointCount,
  );
}

function resampleUniformly(
  sourcePoints: readonly HandDrawnPoint[],
  segmentLengths: readonly number[],
  totalLength: number,
  pointCount: number,
): readonly HandDrawnPoint[] {
  const result: HandDrawnPoint[] = [];
  let segmentIndex = 0;
  let segmentStartDistance = 0;

  for (let index = 0; index < pointCount; index += 1) {
    const targetDistance = (totalLength * index) / (pointCount - 1);
    while (
      segmentIndex < segmentLengths.length - 1 &&
      segmentStartDistance + (segmentLengths[segmentIndex] ?? 0) <
        targetDistance
    ) {
      segmentStartDistance += segmentLengths[segmentIndex] ?? 0;
      segmentIndex += 1;
    }

    const start = sourcePoints[segmentIndex];
    const end = sourcePoints[segmentIndex + 1];
    const segmentLength = segmentLengths[segmentIndex] ?? 0;
    if (start === undefined || end === undefined) {
      continue;
    }
    const progress =
      segmentLength === 0
        ? 0
        : (targetDistance - segmentStartDistance) / segmentLength;
    result.push(interpolate(start, end, progress));
  }

  return ensureMinimumPoints(result);
}

function ensureMinimumPoints(
  points: readonly HandDrawnPoint[],
): readonly HandDrawnPoint[] {
  if (points.length !== 2) {
    return points;
  }
  const first = points[0];
  const last = points[1];
  if (first === undefined || last === undefined) {
    return points;
  }
  return [copyPoint(first), interpolate(first, last, 0.5), copyPoint(last)];
}

function createStableRandom(seedOrKey: number | string): () => number {
  let state =
    typeof seedOrKey === "number"
      ? seedOrKey >>> 0
      : createHandDrawnSeed(seedOrKey);

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

function assertValidPoints(points: readonly HandDrawnPoint[]): void {
  if (points.length < 2) {
    throw new Error("A hand-drawn path requires at least two points.");
  }
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error("Hand-drawn path points must be finite.");
    }
  }
}

function finiteInRange(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const finiteValue = value !== undefined && Number.isFinite(value)
    ? value
    : fallback;
  return Math.min(maximum, Math.max(minimum, finiteValue));
}

function centered(random: () => number): number {
  return random() * 2 - 1;
}

function copyPoint(point: HandDrawnPoint): HandDrawnPoint {
  return { x: point.x, y: point.y };
}

function interpolate(
  start: HandDrawnPoint,
  end: HandDrawnPoint,
  progress: number,
): HandDrawnPoint {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
}

function roundTo(value: number, precision: number): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}
