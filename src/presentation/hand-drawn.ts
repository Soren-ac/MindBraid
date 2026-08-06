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

/**
 * Closed node shapes that can be represented by a single contour. Callers
 * intentionally skip non-closed node treatments such as `none` and
 * `underline` before calling this framework-free helper.
 */
export type HandDrawnNodeContourShape =
  | "rectangle"
  | "rounded-rectangle"
  | "pill"
  | "ellipse";

/**
 * Local node-box geometry for a deterministic, single-pass rough contour.
 *
 * Points are returned in local node coordinates. `inset` moves the regular
 * contour inward from all four edges before roughness is applied. The final
 * point is always an exact copy of the first point so SVG and export callers
 * can serialize it as one closed polyline without inferring closure.
 */
export interface HandDrawnNodeContourOptions {
  readonly shape: HandDrawnNodeContourShape;
  readonly width: number;
  readonly height: number;
  /** Corner radius for `rounded-rectangle`; `pill` resolves its own radius. */
  readonly radius?: number;
  /** Optional inward distance from the node bounds. Defaults to zero. */
  readonly inset?: number;
  /** Semantic node key; never use a render-order index. */
  readonly stableKey: string;
  /** Maximum normal displacement in local scene pixels. */
  readonly roughness?: number;
  /** Approximate regular-contour point spacing in local scene pixels. */
  readonly sampleSpacing?: number;
  /** Hard cap, including the repeated final closure point. */
  readonly maximumPointCount?: number;
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
const DEFAULT_CONTOUR_MAXIMUM_POINT_COUNT = 96;
const MINIMUM_CLOSED_CONTOUR_POINT_COUNT = 9;
const UINT32_RANGE = 0x1_0000_0000;

interface ContourSegment {
  readonly length: number;
  readonly pointAt: (progress: number) => HandDrawnPoint;
}

interface NodeContourBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
}

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
 * Create one deterministic, rough, closed local contour for a node shape.
 *
 * This does not create DOM/SVG objects and intentionally does not share the
 * open-polyline jitter used by `createHandDrawnStrokes`: a node contour has no
 * endpoints to taper, and its seam must remain exact. With zero roughness the
 * returned points lie on the regular shape outline.
 */
export function createHandDrawnNodeContour(
  options: HandDrawnNodeContourOptions,
): readonly HandDrawnPoint[] {
  assertNodeContourShape(options.shape);
  const width = assertNonNegativeFinite(options.width, "width");
  const height = assertNonNegativeFinite(options.height, "height");
  const requestedInset = finiteInRange(
    options.inset,
    0,
    0,
    Math.min(width, height) / 2,
  );
  const bounds: NodeContourBounds = {
    left: requestedInset,
    top: requestedInset,
    width: Math.max(0, width - requestedInset * 2),
    height: Math.max(0, height - requestedInset * 2),
    right: Math.max(requestedInset, width - requestedInset),
    bottom: Math.max(requestedInset, height - requestedInset),
  };
  const radius = finiteInRange(
    options.radius,
    0,
    0,
    Math.min(bounds.width, bounds.height) / 2,
  );
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
      DEFAULT_CONTOUR_MAXIMUM_POINT_COUNT,
      MINIMUM_CLOSED_CONTOUR_POINT_COUNT,
      MAXIMUM_POINT_COUNT,
    ),
  );
  const regularPoints = createRegularNodeContour(
    options.shape,
    bounds,
    radius,
    sampleSpacing,
    maximumPointCount - 1,
  );
  const roughPoints = jitterClosedContour(
    regularPoints,
    roughness,
    `${options.stableKey}\u0000node-contour:${options.shape}:${width}:${height}:${radius}:${requestedInset}`,
  );

  return closeContour(roughPoints);
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

function createRegularNodeContour(
  shape: HandDrawnNodeContourShape,
  bounds: NodeContourBounds,
  radius: number,
  sampleSpacing: number,
  maximumUniquePointCount: number,
): readonly HandDrawnPoint[] {
  const segments = createNodeContourSegments(shape, bounds, radius).filter(
    (segment) => segment.length > 0,
  );
  if (segments.length === 0) {
    return [{ x: bounds.left, y: bounds.top }];
  }

  const totalLength = segments.reduce(
    (sum, segment) => sum + segment.length,
    0,
  );
  const minimumUniquePointCount =
    shape === "rectangle" ? 4 : 8;
  const desiredUniquePointCount = Number.isFinite(totalLength)
    ? Math.max(
        minimumUniquePointCount,
        segments.length,
        Math.ceil(totalLength / sampleSpacing),
      )
    : maximumUniquePointCount;
  const uniquePointCount = Math.min(
    maximumUniquePointCount,
    desiredUniquePointCount,
  );
  const sampleCounts = allocateContourSamples(segments, uniquePointCount);
  const points: HandDrawnPoint[] = [];

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    const sampleCount = sampleCounts[segmentIndex];
    if (segment === undefined || sampleCount === undefined) {
      continue;
    }
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      points.push(
        roundContourPoint(segment.pointAt(sampleIndex / sampleCount)),
      );
    }
  }

  return points;
}

function createNodeContourSegments(
  shape: HandDrawnNodeContourShape,
  bounds: NodeContourBounds,
  requestedRadius: number,
): readonly ContourSegment[] {
  switch (shape) {
    case "rectangle":
      return createRectangleContourSegments(bounds);
    case "rounded-rectangle":
      return createRoundedRectangleContourSegments(bounds, requestedRadius);
    case "pill":
      return createRoundedRectangleContourSegments(
        bounds,
        Math.min(bounds.width, bounds.height) / 2,
      );
    case "ellipse":
      return createEllipseContourSegments(bounds);
  }
}

function createRectangleContourSegments(
  bounds: NodeContourBounds,
): readonly ContourSegment[] {
  const topLeft = { x: bounds.left, y: bounds.top };
  const topRight = { x: bounds.right, y: bounds.top };
  const bottomRight = { x: bounds.right, y: bounds.bottom };
  const bottomLeft = { x: bounds.left, y: bounds.bottom };
  return [
    createLineContourSegment(topLeft, topRight),
    createLineContourSegment(topRight, bottomRight),
    createLineContourSegment(bottomRight, bottomLeft),
    createLineContourSegment(bottomLeft, topLeft),
  ];
}

function createRoundedRectangleContourSegments(
  bounds: NodeContourBounds,
  requestedRadius: number,
): readonly ContourSegment[] {
  const radius = Math.min(
    Math.max(0, requestedRadius),
    bounds.width / 2,
    bounds.height / 2,
  );
  if (radius === 0) {
    return createRectangleContourSegments(bounds);
  }

  const topLeft = { x: bounds.left + radius, y: bounds.top };
  const topRight = { x: bounds.right - radius, y: bounds.top };
  const rightTop = { x: bounds.right, y: bounds.top + radius };
  const rightBottom = { x: bounds.right, y: bounds.bottom - radius };
  const bottomRight = { x: bounds.right - radius, y: bounds.bottom };
  const bottomLeft = { x: bounds.left + radius, y: bounds.bottom };
  const leftBottom = { x: bounds.left, y: bounds.bottom - radius };
  const leftTop = { x: bounds.left, y: bounds.top + radius };

  return [
    createLineContourSegment(topLeft, topRight),
    createArcContourSegment(
      { x: bounds.right - radius, y: bounds.top + radius },
      radius,
      -Math.PI / 2,
      0,
    ),
    createLineContourSegment(rightTop, rightBottom),
    createArcContourSegment(
      { x: bounds.right - radius, y: bounds.bottom - radius },
      radius,
      0,
      Math.PI / 2,
    ),
    createLineContourSegment(bottomRight, bottomLeft),
    createArcContourSegment(
      { x: bounds.left + radius, y: bounds.bottom - radius },
      radius,
      Math.PI / 2,
      Math.PI,
    ),
    createLineContourSegment(leftBottom, leftTop),
    createArcContourSegment(
      { x: bounds.left + radius, y: bounds.top + radius },
      radius,
      Math.PI,
      Math.PI * 1.5,
    ),
  ];
}

function createEllipseContourSegments(
  bounds: NodeContourBounds,
): readonly ContourSegment[] {
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const radiusX = bounds.width / 2;
  const radiusY = bounds.height / 2;
  const quarterLength = estimateEllipsePerimeter(radiusX, radiusY) / 4;
  const segments: ContourSegment[] = [];

  for (let index = 0; index < 4; index += 1) {
    const startAngle = -Math.PI / 2 + (Math.PI * index) / 2;
    segments.push({
      length: quarterLength,
      pointAt(progress): HandDrawnPoint {
        const angle = startAngle + (Math.PI * progress) / 2;
        return {
          x: centerX + Math.cos(angle) * radiusX,
          y: centerY + Math.sin(angle) * radiusY,
        };
      },
    });
  }

  return segments;
}

function createLineContourSegment(
  start: HandDrawnPoint,
  end: HandDrawnPoint,
): ContourSegment {
  return {
    length: Math.hypot(end.x - start.x, end.y - start.y),
    pointAt(progress): HandDrawnPoint {
      return interpolate(start, end, progress);
    },
  };
}

function createArcContourSegment(
  center: HandDrawnPoint,
  radius: number,
  startAngle: number,
  endAngle: number,
): ContourSegment {
  return {
    length: Math.abs(endAngle - startAngle) * radius,
    pointAt(progress): HandDrawnPoint {
      const angle = startAngle + (endAngle - startAngle) * progress;
      return {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };
    },
  };
}

function estimateEllipsePerimeter(radiusX: number, radiusY: number): number {
  const sum = radiusX + radiusY;
  if (sum === 0) {
    return 0;
  }
  const difference = radiusX - radiusY;
  const ratio = (difference * difference) / (sum * sum);
  return Math.PI * sum * (1 + (3 * ratio) / (10 + Math.sqrt(4 - 3 * ratio)));
}

function allocateContourSamples(
  segments: readonly ContourSegment[],
  pointCount: number,
): readonly number[] {
  const sampleCounts = segments.map(() => 1);
  let remaining = pointCount - sampleCounts.length;
  if (remaining <= 0) {
    return sampleCounts;
  }

  const totalLength = segments.reduce(
    (sum, segment) => sum + segment.length,
    0,
  );
  if (!Number.isFinite(totalLength)) {
    for (let index = 0; remaining > 0; index = (index + 1) % sampleCounts.length) {
      sampleCounts[index] = (sampleCounts[index] ?? 0) + 1;
      remaining -= 1;
    }
    return sampleCounts;
  }

  while (remaining > 0) {
    let selectedIndex = 0;
    let selectedScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const sampleCount = sampleCounts[index];
      if (segment === undefined || sampleCount === undefined) {
        continue;
      }
      const score = segment.length / (sampleCount + 1);
      if (score > selectedScore) {
        selectedIndex = index;
        selectedScore = score;
      }
    }
    sampleCounts[selectedIndex] = (sampleCounts[selectedIndex] ?? 0) + 1;
    remaining -= 1;
  }

  return sampleCounts;
}

function jitterClosedContour(
  points: readonly HandDrawnPoint[],
  roughness: number,
  stableKey: string,
): readonly HandDrawnPoint[] {
  if (roughness === 0 || points.length < 2) {
    return points.map(copyPoint);
  }

  const random = createStableRandom(stableKey);
  const normalNoise = points.map(() => centered(random));
  const tangentNoise = points.map(() => centered(random));
  const count = points.length;

  return points.map((point, index) => {
    const previous = points[(index - 1 + count) % count];
    const next = points[(index + 1) % count];
    if (previous === undefined || next === undefined) {
      return copyPoint(point);
    }
    const tangent = normalizeVector(next.x - previous.x, next.y - previous.y);
    if (tangent === null) {
      return copyPoint(point);
    }
    const previousIndex = (index - 1 + count) % count;
    const nextIndex = (index + 1) % count;
    const smoothedNormalNoise =
      ((normalNoise[previousIndex] ?? 0) +
        (normalNoise[index] ?? 0) * 2 +
        (normalNoise[nextIndex] ?? 0)) /
      4;
    const smoothedTangentNoise =
      ((tangentNoise[previousIndex] ?? 0) +
        (tangentNoise[index] ?? 0) * 2 +
        (tangentNoise[nextIndex] ?? 0)) /
      4;
    const normalOffset = smoothedNormalNoise * roughness;
    const tangentOffset = smoothedTangentNoise * roughness * 0.16;
    const normalX = -tangent.y;
    const normalY = tangent.x;

    return roundContourPoint({
      x:
        point.x +
        normalX * normalOffset +
        tangent.x * tangentOffset,
      y:
        point.y +
        normalY * normalOffset +
        tangent.y * tangentOffset,
    });
  });
}

function normalizeVector(
  x: number,
  y: number,
): HandDrawnPoint | null {
  const scale = Math.max(Math.abs(x), Math.abs(y));
  if (scale === 0 || !Number.isFinite(scale)) {
    return null;
  }
  const scaledX = x / scale;
  const scaledY = y / scale;
  const length = Math.hypot(scaledX, scaledY);
  if (length === 0 || !Number.isFinite(length)) {
    return null;
  }
  return { x: scaledX / length, y: scaledY / length };
}

function closeContour(
  points: readonly HandDrawnPoint[],
): readonly HandDrawnPoint[] {
  const first = points[0];
  if (first === undefined) {
    return [];
  }
  return [...points.map(copyPoint), copyPoint(first)];
}

function roundContourPoint(point: HandDrawnPoint): HandDrawnPoint {
  return {
    x: roundContourCoordinate(point.x),
    y: roundContourCoordinate(point.y),
  };
}

function roundContourCoordinate(value: number): number {
  if (value === 0) {
    return 0;
  }
  const multiplier = 1_000_000;
  if (Math.abs(value) > Number.MAX_VALUE / multiplier) {
    return value;
  }
  return roundTo(value, 6);
}

function assertNodeContourShape(
  shape: HandDrawnNodeContourShape,
): void {
  if (
    shape !== "rectangle" &&
    shape !== "rounded-rectangle" &&
    shape !== "pill" &&
    shape !== "ellipse"
  ) {
    throw new RangeError("Unknown hand-drawn node contour shape.");
  }
}

function assertNonNegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Hand-drawn node contour ${name} must be finite and non-negative.`);
  }
  return value;
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
