import type { MindMapNodePresentation } from "./presentation";

/**
 * Framework-free, offline node asset definitions.
 *
 * Assets deliberately contain only bounded geometry and semantic paint roles.
 * They never carry URLs, DOM/SVG nodes, callbacks, CSS, or adapter state, so
 * the same definition can be used by a future Canvas renderer and an export
 * adapter without accessing the network or a host API.
 */

const SAFE_ASSET_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const MAX_ASSET_ID_LENGTH = 128;
const MAX_ASSET_LABEL_LENGTH = 160;
const MAX_ASSET_REVISION_LENGTH = 256;
const MAX_VIEW_BOX_SIZE = 1_024;
const MAX_COORDINATE = 10_000;
const MAX_PRIMITIVES_PER_ASSET = 64;
const MAX_POINTS_PER_PRIMITIVE = 64;
const MAX_LABEL_CONTENT_LENGTH = 256;
export const MAX_MIND_MAP_NODE_MARKER_ASSETS = 64;

export const MIND_MAP_ASSET_KINDS = Object.freeze([
  "icon",
  "marker",
  "tag",
] as const);

export type MindMapAssetKind = (typeof MIND_MAP_ASSET_KINDS)[number];

/**
 * Renderer adapters map these semantic roles to the active effective palette.
 * Literal colors are intentionally not accepted here: palette selection stays
 * independent from a node asset's geometry and meaning.
 */
export const MIND_MAP_ASSET_COLOR_ROLES = Object.freeze([
  "foreground",
  "muted",
  "surface",
  "accent",
  "positive",
  "warning",
  "danger",
] as const);

export type MindMapAssetColorRole =
  (typeof MIND_MAP_ASSET_COLOR_ROLES)[number];

export interface MindMapAssetViewBox {
  readonly width: number;
  readonly height: number;
}

export interface MindMapAssetPoint {
  readonly x: number;
  readonly y: number;
}

export type MindMapAssetPaint =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "role";
      readonly role: MindMapAssetColorRole;
      readonly opacity?: number;
    };

export interface MindMapAssetStroke {
  readonly role: MindMapAssetColorRole;
  readonly width: number;
  readonly lineCap?: "butt" | "round" | "square";
  readonly lineJoin?: "bevel" | "miter" | "round";
}

export interface MindMapAssetCirclePrimitive {
  readonly kind: "circle";
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly fill: MindMapAssetPaint;
  readonly stroke?: MindMapAssetStroke;
}

export interface MindMapAssetRectPrimitive {
  readonly kind: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius?: number;
  readonly fill: MindMapAssetPaint;
  readonly stroke?: MindMapAssetStroke;
}

export interface MindMapAssetLinePrimitive {
  readonly kind: "line";
  readonly start: MindMapAssetPoint;
  readonly end: MindMapAssetPoint;
  readonly stroke: MindMapAssetStroke;
}

export interface MindMapAssetPolylinePrimitive {
  readonly kind: "polyline";
  readonly points: readonly MindMapAssetPoint[];
  readonly stroke: MindMapAssetStroke;
}

export interface MindMapAssetPolygonPrimitive {
  readonly kind: "polygon";
  readonly points: readonly MindMapAssetPoint[];
  readonly fill: MindMapAssetPaint;
  readonly stroke?: MindMapAssetStroke;
}

/**
 * A positive-angle sweep, in degrees, used for progress markers. Adapters may
 * turn it into their native arc primitive; no SVG path string is embedded in
 * the asset definition.
 */
export interface MindMapAssetArcPrimitive {
  readonly kind: "arc";
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly stroke: MindMapAssetStroke;
}

export type MindMapAssetPrimitive =
  | MindMapAssetCirclePrimitive
  | MindMapAssetRectPrimitive
  | MindMapAssetLinePrimitive
  | MindMapAssetPolylinePrimitive
  | MindMapAssetPolygonPrimitive
  | MindMapAssetArcPrimitive;

/**
 * A tag asset owns its badge geometry but not a user-authored label. The
 * future annotation/renderer boundary supplies that text separately, keeping
 * content out of the capability registry.
 */
export interface MindMapAssetLabelContent {
  readonly kind: "label";
  readonly placement: "inside";
  readonly maximumLength: number;
  readonly paddingInline: number;
  readonly paddingBlock: number;
}

export interface MindMapAssetVisual {
  readonly viewBox: MindMapAssetViewBox;
  readonly primitives: readonly MindMapAssetPrimitive[];
  readonly labelContent?: MindMapAssetLabelContent;
}

export type MindMapAssetCapabilityLabelKey = `capability.asset.${string}`;

/**
 * Stable display key consumed by the existing capability-localization layer.
 * It remains separate from the asset's executable ID and geometry.
 */
export function getMindMapAssetCapabilityLabelKey(
  assetId: string,
): MindMapAssetCapabilityLabelKey {
  requireSafeAssetId(assetId, "asset");
  return `capability.asset.${assetId}`;
}

export interface MindMapAssetSpec {
  readonly id: string;
  /** English fallback used until the capability snapshot is localized. */
  readonly label: string;
  readonly capabilityLabelKey: MindMapAssetCapabilityLabelKey;
  readonly kind: MindMapAssetKind;
  readonly revision: string | number;
  readonly visual: MindMapAssetVisual;
}

/** Immutable renderer/export-facing snapshot of one registered asset. */
export interface MindMapAssetVisualDescriptor {
  readonly id: string;
  readonly label: string;
  readonly capabilityLabelKey: MindMapAssetCapabilityLabelKey;
  readonly kind: MindMapAssetKind;
  readonly revision: string | number;
  readonly viewBox: MindMapAssetViewBox;
  readonly primitives: readonly MindMapAssetPrimitive[];
  readonly labelContent: MindMapAssetLabelContent | null;
}

export interface MindMapAssetRegistry {
  list(): readonly MindMapAssetSpec[];
  listByKind(kind: MindMapAssetKind): readonly MindMapAssetSpec[];
  has(id: string): boolean;
  resolve(id: string): MindMapAssetSpec;
  resolveByKind(id: string, kind: MindMapAssetKind): MindMapAssetSpec;
}

/** The existing sparse node-presentation fields intentionally remain enough. */
export type MindMapNodeAssetReferences = Pick<
  MindMapNodePresentation,
  "iconId" | "markerIds"
>;

export interface MindMapResolvedNodeAssets {
  readonly icon: MindMapAssetVisualDescriptor | null;
  readonly markers: readonly MindMapAssetVisualDescriptor[];
}

export const PRIORITY_HIGH_ASSET_ID = "priority-high";
export const PRIORITY_MEDIUM_ASSET_ID = "priority-medium";
export const PRIORITY_LOW_ASSET_ID = "priority-low";
export const PROGRESS_0_ASSET_ID = "progress-0";
export const PROGRESS_25_ASSET_ID = "progress-25";
export const PROGRESS_50_ASSET_ID = "progress-50";
export const PROGRESS_75_ASSET_ID = "progress-75";
export const PROGRESS_100_ASSET_ID = "progress-100";
export const DONE_ASSET_ID = "done";
export const BLOCKED_ASSET_ID = "blocked";
export const FLAG_ASSET_ID = "flag";
export const STAR_ASSET_ID = "star";
export const TAG_LABEL_ASSET_ID = "tag-label";

const VIEW_BOX_24: MindMapAssetViewBox = { width: 24, height: 24 };
const NO_FILL: MindMapAssetPaint = { kind: "none" };
const FOREGROUND_STROKE: MindMapAssetStroke = {
  role: "foreground",
  width: 1.8,
  lineCap: "round",
  lineJoin: "round",
};
const MUTED_STROKE: MindMapAssetStroke = {
  role: "muted",
  width: 1.8,
  lineCap: "round",
  lineJoin: "round",
};
const ACCENT_STROKE: MindMapAssetStroke = {
  role: "accent",
  width: 2.2,
  lineCap: "round",
  lineJoin: "round",
};
const WARNING_STROKE: MindMapAssetStroke = {
  role: "warning",
  width: 2.2,
  lineCap: "round",
  lineJoin: "round",
};
const DANGER_STROKE: MindMapAssetStroke = {
  role: "danger",
  width: 2.2,
  lineCap: "round",
  lineJoin: "round",
};

const CHECKMARK_POINTS: readonly MindMapAssetPoint[] = [
  { x: 6.25, y: 12.25 },
  { x: 10.25, y: 16.25 },
  { x: 17.75, y: 7.75 },
];

const BUILT_IN_ASSET_INPUT: readonly MindMapAssetSpec[] = [
  {
    id: PRIORITY_HIGH_ASSET_ID,
    label: "High priority",
    capabilityLabelKey: getMindMapAssetCapabilityLabelKey(PRIORITY_HIGH_ASSET_ID),
    kind: "marker",
    revision: 1,
    visual: {
      viewBox: VIEW_BOX_24,
      primitives: [
        {
          kind: "polyline",
          points: [
            { x: 5.5, y: 12.5 },
            { x: 12, y: 6 },
            { x: 18.5, y: 12.5 },
          ],
          stroke: DANGER_STROKE,
        },
        {
          kind: "polyline",
          points: [
            { x: 5.5, y: 18 },
            { x: 12, y: 11.5 },
            { x: 18.5, y: 18 },
          ],
          stroke: DANGER_STROKE,
        },
      ],
    },
  },
  {
    id: PRIORITY_MEDIUM_ASSET_ID,
    label: "Medium priority",
    capabilityLabelKey: getMindMapAssetCapabilityLabelKey(
      PRIORITY_MEDIUM_ASSET_ID,
    ),
    kind: "marker",
    revision: 1,
    visual: {
      viewBox: VIEW_BOX_24,
      primitives: [
        {
          kind: "line",
          start: { x: 5.5, y: 12 },
          end: { x: 18.5, y: 12 },
          stroke: WARNING_STROKE,
        },
      ],
    },
  },
  {
    id: PRIORITY_LOW_ASSET_ID,
    label: "Low priority",
    capabilityLabelKey: getMindMapAssetCapabilityLabelKey(PRIORITY_LOW_ASSET_ID),
    kind: "marker",
    revision: 1,
    visual: {
      viewBox: VIEW_BOX_24,
      primitives: [
        {
          kind: "polyline",
          points: [
            { x: 5.5, y: 7 },
            { x: 12, y: 13.5 },
            { x: 18.5, y: 7 },
          ],
          stroke: ACCENT_STROKE,
        },
        {
          kind: "polyline",
          points: [
            { x: 5.5, y: 12.5 },
            { x: 12, y: 19 },
            { x: 18.5, y: 12.5 },
          ],
          stroke: ACCENT_STROKE,
        },
      ],
    },
  },
  createProgressAsset(PROGRESS_0_ASSET_ID, "Progress: 0%", 0),
  createProgressAsset(PROGRESS_25_ASSET_ID, "Progress: 25%", 25),
  createProgressAsset(PROGRESS_50_ASSET_ID, "Progress: 50%", 50),
  createProgressAsset(PROGRESS_75_ASSET_ID, "Progress: 75%", 75),
  createProgressAsset(PROGRESS_100_ASSET_ID, "Progress: 100%", 100),
  {
    id: DONE_ASSET_ID,
    label: "Done",
    capabilityLabelKey: getMindMapAssetCapabilityLabelKey(DONE_ASSET_ID),
    kind: "marker",
    revision: 1,
    visual: {
      viewBox: VIEW_BOX_24,
      primitives: [
        {
          kind: "circle",
          centerX: 12,
          centerY: 12,
          radius: 9,
          fill: { kind: "role", role: "positive" },
        },
        {
          kind: "polyline",
          points: CHECKMARK_POINTS,
          stroke: {
            role: "surface",
            width: 2.2,
            lineCap: "round",
            lineJoin: "round",
          },
        },
      ],
    },
  },
  {
    id: BLOCKED_ASSET_ID,
    label: "Blocked",
    capabilityLabelKey: getMindMapAssetCapabilityLabelKey(BLOCKED_ASSET_ID),
    kind: "marker",
    revision: 1,
    visual: {
      viewBox: VIEW_BOX_24,
      primitives: [
        {
          kind: "circle",
          centerX: 12,
          centerY: 12,
          radius: 9,
          fill: { kind: "role", role: "danger" },
        },
        {
          kind: "line",
          start: { x: 8, y: 8 },
          end: { x: 16, y: 16 },
          stroke: {
            role: "surface",
            width: 2.2,
            lineCap: "round",
          },
        },
        {
          kind: "line",
          start: { x: 16, y: 8 },
          end: { x: 8, y: 16 },
          stroke: {
            role: "surface",
            width: 2.2,
            lineCap: "round",
          },
        },
      ],
    },
  },
  {
    id: FLAG_ASSET_ID,
    label: "Flag",
    capabilityLabelKey: getMindMapAssetCapabilityLabelKey(FLAG_ASSET_ID),
    kind: "icon",
    revision: 1,
    visual: {
      viewBox: VIEW_BOX_24,
      primitives: [
        {
          kind: "line",
          start: { x: 6, y: 20 },
          end: { x: 6, y: 4 },
          stroke: FOREGROUND_STROKE,
        },
        {
          kind: "polygon",
          points: [
            { x: 6, y: 5 },
            { x: 18.5, y: 8.5 },
            { x: 6, y: 12 },
          ],
          fill: { kind: "role", role: "accent" },
        },
      ],
    },
  },
  {
    id: STAR_ASSET_ID,
    label: "Star",
    capabilityLabelKey: getMindMapAssetCapabilityLabelKey(STAR_ASSET_ID),
    kind: "icon",
    revision: 1,
    visual: {
      viewBox: VIEW_BOX_24,
      primitives: [
        {
          kind: "polygon",
          points: [
            { x: 12, y: 3.5 },
            { x: 14.65, y: 8.3 },
            { x: 20, y: 9.3 },
            { x: 16.25, y: 13.2 },
            { x: 17.1, y: 18.5 },
            { x: 12, y: 16.1 },
            { x: 6.9, y: 18.5 },
            { x: 7.75, y: 13.2 },
            { x: 4, y: 9.3 },
            { x: 9.35, y: 8.3 },
          ],
          fill: { kind: "role", role: "warning" },
          stroke: WARNING_STROKE,
        },
      ],
    },
  },
  {
    id: TAG_LABEL_ASSET_ID,
    label: "Label",
    capabilityLabelKey: getMindMapAssetCapabilityLabelKey(TAG_LABEL_ASSET_ID),
    kind: "tag",
    revision: 1,
    visual: {
      viewBox: VIEW_BOX_24,
      primitives: [
        {
          kind: "rect",
          x: 2,
          y: 5,
          width: 20,
          height: 14,
          radius: 3,
          fill: { kind: "role", role: "surface" },
          stroke: FOREGROUND_STROKE,
        },
        {
          kind: "circle",
          centerX: 6.5,
          centerY: 12,
          radius: 1.5,
          fill: { kind: "role", role: "muted" },
        },
      ],
      labelContent: {
        kind: "label",
        placement: "inside",
        maximumLength: 64,
        paddingInline: 5.5,
        paddingBlock: 3,
      },
    },
  },
];

/**
 * Validated, deeply frozen built-ins. The registry below creates its own
 * immutable index, so callers can also construct a custom registry safely.
 */
export const BUILT_IN_MIND_MAP_ASSET_SPECS: readonly MindMapAssetSpec[] =
  Object.freeze(BUILT_IN_ASSET_INPUT.map(validateMindMapAssetSpec));

export const BUILT_IN_MIND_MAP_ASSET_REGISTRY = createMindMapAssetRegistry(
  BUILT_IN_MIND_MAP_ASSET_SPECS,
);

/**
 * Creates an immutable registry of only local, validated geometry assets.
 * Asset IDs are global so an icon and marker can never silently alias one
 * another in persisted node data.
 */
export function createMindMapAssetRegistry(
  assets: readonly MindMapAssetSpec[],
): MindMapAssetRegistry {
  if (!Array.isArray(assets)) {
    throw new TypeError("Mind-map assets must be an array.");
  }
  const byId = new Map<string, MindMapAssetSpec>();
  const byKind = new Map<MindMapAssetKind, MindMapAssetSpec[]>();
  for (const input of assets) {
    const asset = validateMindMapAssetSpec(input);
    if (byId.has(asset.id)) {
      throw new Error(`Duplicate mind-map asset ID "${asset.id}".`);
    }
    byId.set(asset.id, asset);
    const assetsForKind = byKind.get(asset.kind) ?? [];
    assetsForKind.push(asset);
    byKind.set(asset.kind, assetsForKind);
  }

  const registered = Object.freeze([...byId.values()]);
  const registeredByKind = new Map<MindMapAssetKind, readonly MindMapAssetSpec[]>(
    MIND_MAP_ASSET_KINDS.map((kind) => [
      kind,
      Object.freeze([...(byKind.get(kind) ?? [])]),
    ]),
  );

  const registry: MindMapAssetRegistry = {
    list: () => registered,
    listByKind: (kind) => {
      requireAssetKind(kind);
      return registeredByKind.get(kind) ?? EMPTY_ASSET_LIST;
    },
    has: (id) => typeof id === "string" && byId.has(id),
    resolve: (id) => {
      requireSafeAssetId(id, "asset");
      const asset = byId.get(id);
      if (asset === undefined) {
        throw new RangeError(`Unknown mind-map asset "${id}".`);
      }
      return asset;
    },
    resolveByKind: (id, kind) => {
      requireAssetKind(kind);
      requireSafeAssetId(id, `${kind} asset`);
      const asset = byId.get(id);
      if (asset === undefined) {
        throw new RangeError(`Unknown mind-map asset "${id}".`);
      }
      if (asset.kind !== kind) {
        throw new RangeError(
          `Mind-map asset "${id}" is a ${asset.kind}, not a ${kind}.`,
        );
      }
      return asset;
    },
  };
  return Object.freeze(registry);
}

/**
 * Strictly validates and deeply freezes one JSON-safe asset definition.
 * Returning a fresh snapshot prevents a caller from mutating registry input
 * after registration and changing a renderer/export result mid-session.
 */
export function validateMindMapAssetSpec(value: unknown): MindMapAssetSpec {
  const asset = requireRecord(value, "Mind-map asset");
  requireOnlyKeys(
    asset,
    ["id", "label", "capabilityLabelKey", "kind", "revision", "visual"],
    "Mind-map asset",
  );
  const id = requireSafeAssetId(asset.id, "asset");
  const label = requireBoundedLabel(asset.label, `Mind-map asset "${id}"`);
  const capabilityLabelKey = requireCapabilityLabelKey(
    asset.capabilityLabelKey,
    id,
  );
  const kind = requireAssetKind(asset.kind);
  const revision = requireRevision(asset.revision, id);
  const visual = normalizeVisual(asset.visual, id, kind);
  return freezeAssetSpec({
    id,
    label,
    capabilityLabelKey,
    kind,
    revision,
    visual,
  });
}

/** Creates an ownership-safe renderer/export snapshot for one registered asset. */
export function createMindMapAssetVisualDescriptor(
  asset: MindMapAssetSpec,
): MindMapAssetVisualDescriptor {
  const normalized = validateMindMapAssetSpec(asset);
  return freezeVisualDescriptor(normalized);
}

/** Resolves one asset into an immutable visual descriptor, optionally by slot. */
export function resolveMindMapAssetVisualDescriptor(
  registry: MindMapAssetRegistry,
  id: string,
  kind?: MindMapAssetKind,
): MindMapAssetVisualDescriptor {
  const asset =
    kind === undefined ? registry.resolve(id) : registry.resolveByKind(id, kind);
  return createMindMapAssetVisualDescriptor(asset);
}

/**
 * Resolves the existing sparse node `iconId` and `markerIds` fields. Duplicate
 * marker IDs and unknown/wrong-slot IDs fail fast rather than producing an
 * ambiguous visual result.
 */
export function resolveMindMapNodeAssets(
  registry: MindMapAssetRegistry,
  node: MindMapNodeAssetReferences,
): MindMapResolvedNodeAssets;
export function resolveMindMapNodeAssets(
  registry: MindMapAssetRegistry,
  node: MindMapNodePresentation,
): MindMapResolvedNodeAssets;
export function resolveMindMapNodeAssets(
  registry: MindMapAssetRegistry,
  node: MindMapNodeAssetReferences | MindMapNodePresentation,
): MindMapResolvedNodeAssets {
  const references = requireRecord(node, "Mind-map node asset references");
  const icon =
    references.iconId === undefined
      ? null
      : resolveMindMapAssetVisualDescriptor(
          registry,
          requireSafeAssetId(references.iconId, "icon asset"),
          "icon",
        );

  if (references.markerIds === undefined) {
    return Object.freeze({ icon, markers: EMPTY_DESCRIPTOR_LIST });
  }
  if (!Array.isArray(references.markerIds)) {
    throw new TypeError("Mind-map node marker IDs must be an array.");
  }
  if (references.markerIds.length > MAX_MIND_MAP_NODE_MARKER_ASSETS) {
    throw new RangeError(
      `Mind-map nodes support at most ${String(MAX_MIND_MAP_NODE_MARKER_ASSETS)} marker assets.`,
    );
  }

  const markerIds = new Set<string>();
  const markers: MindMapAssetVisualDescriptor[] = [];
  for (const value of references.markerIds) {
    const markerId = requireSafeAssetId(value, "marker asset");
    if (markerIds.has(markerId)) {
      throw new RangeError(`Duplicate mind-map marker asset "${markerId}".`);
    }
    markerIds.add(markerId);
    markers.push(
      resolveMindMapAssetVisualDescriptor(registry, markerId, "marker"),
    );
  }
  return Object.freeze({ icon, markers: Object.freeze(markers) });
}

function createProgressAsset(
  id: string,
  label: string,
  progress: 0 | 25 | 50 | 75 | 100,
): MindMapAssetSpec {
  const primitives: MindMapAssetPrimitive[] = [
    {
      kind: "circle",
      centerX: 12,
      centerY: 12,
      radius: 8.5,
      fill: NO_FILL,
      stroke: MUTED_STROKE,
    },
  ];
  if (progress > 0 && progress < 100) {
    primitives.push({
      kind: "arc",
      centerX: 12,
      centerY: 12,
      radius: 8.5,
      startAngle: -90,
      endAngle: -90 + (progress / 100) * 360,
      stroke: ACCENT_STROKE,
    });
  }
  if (progress === 100) {
    primitives.push(
      {
        kind: "circle",
        centerX: 12,
        centerY: 12,
        radius: 8.5,
        fill: { kind: "role", role: "positive" },
      },
      {
        kind: "polyline",
        points: CHECKMARK_POINTS,
        stroke: {
          role: "surface",
          width: 2.2,
          lineCap: "round",
          lineJoin: "round",
        },
      },
    );
  }
  return {
    id,
    label,
    capabilityLabelKey: getMindMapAssetCapabilityLabelKey(id),
    kind: "marker",
    revision: 1,
    visual: {
      viewBox: VIEW_BOX_24,
      primitives,
    },
  };
}

function normalizeVisual(
  value: unknown,
  assetId: string,
  assetKind: MindMapAssetKind,
): MindMapAssetVisual {
  const visual = requireRecord(value, `Mind-map asset "${assetId}" visual`);
  requireOnlyKeys(
    visual,
    ["viewBox", "primitives", "labelContent"],
    `Mind-map asset "${assetId}" visual`,
  );
  const viewBox = normalizeViewBox(visual.viewBox, assetId);
  if (!Array.isArray(visual.primitives) || visual.primitives.length === 0) {
    throw new TypeError(
      `Mind-map asset "${assetId}" requires at least one visual primitive.`,
    );
  }
  if (visual.primitives.length > MAX_PRIMITIVES_PER_ASSET) {
    throw new RangeError(
      `Mind-map asset "${assetId}" exceeds the primitive limit.`,
    );
  }
  const primitives = visual.primitives.map((primitive, index) =>
    normalizePrimitive(primitive, assetId, index),
  );
  const labelContent =
    visual.labelContent === undefined
      ? undefined
      : normalizeLabelContent(visual.labelContent, assetId);
  if (assetKind === "tag" && labelContent === undefined) {
    throw new TypeError(
      `Tag asset "${assetId}" requires a label-content descriptor.`,
    );
  }
  if (assetKind !== "tag" && labelContent !== undefined) {
    throw new TypeError(
      `Only tag assets may define label content ("${assetId}").`,
    );
  }
  return Object.freeze({
    viewBox,
    primitives: Object.freeze(primitives),
    ...(labelContent === undefined ? {} : { labelContent }),
  });
}

function normalizeViewBox(value: unknown, assetId: string): MindMapAssetViewBox {
  const viewBox = requireRecord(value, `Mind-map asset "${assetId}" view box`);
  requireOnlyKeys(viewBox, ["width", "height"], `Mind-map asset "${assetId}" view box`);
  return Object.freeze({
    width: requirePositiveNumber(viewBox.width, "view-box width"),
    height: requirePositiveNumber(viewBox.height, "view-box height"),
  });
}

function normalizePrimitive(
  value: unknown,
  assetId: string,
  index: number,
): MindMapAssetPrimitive {
  const primitive = requireRecord(
    value,
    `Mind-map asset "${assetId}" primitive ${String(index)}`,
  );
  const label = `Mind-map asset "${assetId}" primitive ${String(index)}`;
  switch (primitive.kind) {
    case "circle":
      requireOnlyKeys(
        primitive,
        ["kind", "centerX", "centerY", "radius", "fill", "stroke"],
        label,
      );
      return Object.freeze({
        kind: "circle" as const,
        centerX: requireCoordinate(primitive.centerX, `${label} centerX`),
        centerY: requireCoordinate(primitive.centerY, `${label} centerY`),
        radius: requirePositiveNumber(primitive.radius, `${label} radius`),
        fill: normalizePaint(primitive.fill, `${label} fill`),
        ...(primitive.stroke === undefined
          ? {}
          : { stroke: normalizeStroke(primitive.stroke, `${label} stroke`) }),
      });
    case "rect": {
      requireOnlyKeys(
        primitive,
        ["kind", "x", "y", "width", "height", "radius", "fill", "stroke"],
        label,
      );
      const width = requirePositiveNumber(primitive.width, `${label} width`);
      const height = requirePositiveNumber(primitive.height, `${label} height`);
      const radius =
        primitive.radius === undefined
          ? undefined
          : requireNonNegativeNumber(primitive.radius, `${label} radius`);
      if (radius !== undefined && radius > Math.min(width, height) / 2) {
        throw new RangeError(`${label} radius exceeds its bounds.`);
      }
      return Object.freeze({
        kind: "rect" as const,
        x: requireCoordinate(primitive.x, `${label} x`),
        y: requireCoordinate(primitive.y, `${label} y`),
        width,
        height,
        ...(radius === undefined ? {} : { radius }),
        fill: normalizePaint(primitive.fill, `${label} fill`),
        ...(primitive.stroke === undefined
          ? {}
          : { stroke: normalizeStroke(primitive.stroke, `${label} stroke`) }),
      });
    }
    case "line":
      requireOnlyKeys(primitive, ["kind", "start", "end", "stroke"], label);
      return Object.freeze({
        kind: "line" as const,
        start: normalizePoint(primitive.start, `${label} start`),
        end: normalizePoint(primitive.end, `${label} end`),
        stroke: normalizeStroke(primitive.stroke, `${label} stroke`),
      });
    case "polyline":
      requireOnlyKeys(primitive, ["kind", "points", "stroke"], label);
      return Object.freeze({
        kind: "polyline" as const,
        points: normalizePoints(primitive.points, 2, label),
        stroke: normalizeStroke(primitive.stroke, `${label} stroke`),
      });
    case "polygon":
      requireOnlyKeys(
        primitive,
        ["kind", "points", "fill", "stroke"],
        label,
      );
      return Object.freeze({
        kind: "polygon" as const,
        points: normalizePoints(primitive.points, 3, label),
        fill: normalizePaint(primitive.fill, `${label} fill`),
        ...(primitive.stroke === undefined
          ? {}
          : { stroke: normalizeStroke(primitive.stroke, `${label} stroke`) }),
      });
    case "arc": {
      requireOnlyKeys(
        primitive,
        [
          "kind",
          "centerX",
          "centerY",
          "radius",
          "startAngle",
          "endAngle",
          "stroke",
        ],
        label,
      );
      const startAngle = requireFiniteNumber(
        primitive.startAngle,
        `${label} start angle`,
      );
      const endAngle = requireFiniteNumber(
        primitive.endAngle,
        `${label} end angle`,
      );
      if (
        endAngle <= startAngle ||
        endAngle - startAngle > 360 ||
        Math.abs(startAngle) > 3_600 ||
        Math.abs(endAngle) > 3_600
      ) {
        throw new RangeError(`${label} has an invalid arc sweep.`);
      }
      return Object.freeze({
        kind: "arc" as const,
        centerX: requireCoordinate(primitive.centerX, `${label} centerX`),
        centerY: requireCoordinate(primitive.centerY, `${label} centerY`),
        radius: requirePositiveNumber(primitive.radius, `${label} radius`),
        startAngle,
        endAngle,
        stroke: normalizeStroke(primitive.stroke, `${label} stroke`),
      });
    }
    default:
      throw new RangeError(`${label} has an unsupported kind.`);
  }
}

function normalizePaint(value: unknown, label: string): MindMapAssetPaint {
  const paint = requireRecord(value, label);
  switch (paint.kind) {
    case "none":
      requireOnlyKeys(paint, ["kind"], label);
      return Object.freeze({ kind: "none" as const });
    case "role": {
      requireOnlyKeys(paint, ["kind", "role", "opacity"], label);
      const opacity =
        paint.opacity === undefined
          ? undefined
          : requireUnitInterval(paint.opacity, `${label} opacity`);
      return Object.freeze({
        kind: "role" as const,
        role: requireAssetColorRole(paint.role),
        ...(opacity === undefined ? {} : { opacity }),
      });
    }
    default:
      throw new RangeError(`${label} has an unsupported paint kind.`);
  }
}

function normalizeStroke(value: unknown, label: string): MindMapAssetStroke {
  const stroke = requireRecord(value, label);
  requireOnlyKeys(
    stroke,
    ["role", "width", "lineCap", "lineJoin"],
    label,
  );
  const lineCap = optionalEnum(stroke.lineCap, ["butt", "round", "square"] as const, label);
  const lineJoin = optionalEnum(
    stroke.lineJoin,
    ["bevel", "miter", "round"] as const,
    label,
  );
  return Object.freeze({
    role: requireAssetColorRole(stroke.role),
    width: requirePositiveNumber(stroke.width, `${label} width`),
    ...(lineCap === undefined ? {} : { lineCap }),
    ...(lineJoin === undefined ? {} : { lineJoin }),
  });
}

function normalizePoint(value: unknown, label: string): MindMapAssetPoint {
  const point = requireRecord(value, label);
  requireOnlyKeys(point, ["x", "y"], label);
  return Object.freeze({
    x: requireCoordinate(point.x, `${label} x`),
    y: requireCoordinate(point.y, `${label} y`),
  });
}

function normalizePoints(
  value: unknown,
  minimum: number,
  label: string,
): readonly MindMapAssetPoint[] {
  if (!Array.isArray(value) || value.length < minimum) {
    throw new TypeError(`${label} requires at least ${String(minimum)} points.`);
  }
  if (value.length > MAX_POINTS_PER_PRIMITIVE) {
    throw new RangeError(`${label} exceeds the point limit.`);
  }
  return Object.freeze(value.map((point, index) => normalizePoint(point, `${label} point ${String(index)}`)));
}

function normalizeLabelContent(
  value: unknown,
  assetId: string,
): MindMapAssetLabelContent {
  const content = requireRecord(
    value,
    `Mind-map tag asset "${assetId}" label content`,
  );
  requireOnlyKeys(
    content,
    ["kind", "placement", "maximumLength", "paddingInline", "paddingBlock"],
    `Mind-map tag asset "${assetId}" label content`,
  );
  if (content.kind !== "label" || content.placement !== "inside") {
    throw new RangeError(
      `Mind-map tag asset "${assetId}" has an unsupported label-content kind.`,
    );
  }
  const maximumLength = requireInteger(
    content.maximumLength,
    `Mind-map tag asset "${assetId}" maximum label length`,
  );
  if (maximumLength < 1 || maximumLength > MAX_LABEL_CONTENT_LENGTH) {
    throw new RangeError(
      `Mind-map tag asset "${assetId}" has an invalid maximum label length.`,
    );
  }
  return Object.freeze({
    kind: "label",
    placement: "inside",
    maximumLength,
    paddingInline: requireNonNegativeNumber(
      content.paddingInline,
      `Mind-map tag asset "${assetId}" inline padding`,
    ),
    paddingBlock: requireNonNegativeNumber(
      content.paddingBlock,
      `Mind-map tag asset "${assetId}" block padding`,
    ),
  });
}

function freezeAssetSpec(asset: MindMapAssetSpec): MindMapAssetSpec {
  return Object.freeze({
    id: asset.id,
    label: asset.label,
    capabilityLabelKey: asset.capabilityLabelKey,
    kind: asset.kind,
    revision: asset.revision,
    visual: asset.visual,
  });
}

function freezeVisualDescriptor(
  asset: MindMapAssetSpec,
): MindMapAssetVisualDescriptor {
  return Object.freeze({
    id: asset.id,
    label: asset.label,
    capabilityLabelKey: asset.capabilityLabelKey,
    kind: asset.kind,
    revision: asset.revision,
    viewBox: Object.freeze({ ...asset.visual.viewBox }),
    primitives: Object.freeze(
      asset.visual.primitives.map((primitive) => clonePrimitive(primitive)),
    ),
    labelContent:
      asset.visual.labelContent === undefined
        ? null
        : Object.freeze({ ...asset.visual.labelContent }),
  });
}

function clonePrimitive(
  primitive: MindMapAssetPrimitive,
): MindMapAssetPrimitive {
  switch (primitive.kind) {
    case "circle":
      return Object.freeze({
        ...primitive,
        fill: clonePaint(primitive.fill),
        ...(primitive.stroke === undefined
          ? {}
          : { stroke: cloneStroke(primitive.stroke) }),
      });
    case "rect":
      return Object.freeze({
        ...primitive,
        fill: clonePaint(primitive.fill),
        ...(primitive.stroke === undefined
          ? {}
          : { stroke: cloneStroke(primitive.stroke) }),
      });
    case "line":
      return Object.freeze({
        ...primitive,
        start: Object.freeze({ ...primitive.start }),
        end: Object.freeze({ ...primitive.end }),
        stroke: cloneStroke(primitive.stroke),
      });
    case "polyline":
      return Object.freeze({
        ...primitive,
        points: Object.freeze(
          primitive.points.map((point) => Object.freeze({ ...point })),
        ),
        stroke: cloneStroke(primitive.stroke),
      });
    case "polygon":
      return Object.freeze({
        ...primitive,
        points: Object.freeze(
          primitive.points.map((point) => Object.freeze({ ...point })),
        ),
        fill: clonePaint(primitive.fill),
        ...(primitive.stroke === undefined
          ? {}
          : { stroke: cloneStroke(primitive.stroke) }),
      });
    case "arc":
      return Object.freeze({ ...primitive, stroke: cloneStroke(primitive.stroke) });
  }
}

function clonePaint(paint: MindMapAssetPaint): MindMapAssetPaint {
  return paint.kind === "none"
    ? Object.freeze({ kind: "none" as const })
    : Object.freeze({ ...paint });
}

function cloneStroke(stroke: MindMapAssetStroke): MindMapAssetStroke {
  return Object.freeze({ ...stroke });
}

function requireSafeAssetId(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_ASSET_ID_LENGTH ||
    !SAFE_ASSET_ID.test(value)
  ) {
    throw new TypeError(`${label} ID must be a safe stable identifier.`);
  }
  return value;
}

function requireBoundedLabel(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > MAX_ASSET_LABEL_LENGTH ||
    containsControlCharacter(value)
  ) {
    throw new TypeError(`${label} requires a bounded visible label.`);
  }
  return value;
}

function requireCapabilityLabelKey(
  value: unknown,
  assetId: string,
): MindMapAssetCapabilityLabelKey {
  const expected = getMindMapAssetCapabilityLabelKey(assetId);
  if (value !== expected) {
    throw new TypeError(
      `Mind-map asset "${assetId}" must use capability key "${expected}".`,
    );
  }
  return expected;
}

function requireRevision(value: unknown, assetId: string): string | number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_ASSET_REVISION_LENGTH
  ) {
    return value;
  }
  throw new TypeError(`Mind-map asset "${assetId}" has an invalid revision.`);
}

function requireAssetKind(value: unknown): MindMapAssetKind {
  if (
    typeof value !== "string" ||
    !MIND_MAP_ASSET_KINDS.includes(value as MindMapAssetKind)
  ) {
    throw new RangeError("Unsupported mind-map asset kind.");
  }
  return value as MindMapAssetKind;
}

function requireAssetColorRole(value: unknown): MindMapAssetColorRole {
  if (
    typeof value !== "string" ||
    !MIND_MAP_ASSET_COLOR_ROLES.includes(value as MindMapAssetColorRole)
  ) {
    throw new RangeError("Unsupported mind-map asset color role.");
  }
  return value as MindMapAssetColorRole;
}

function requireCoordinate(value: unknown, label: string): number {
  const coordinate = requireFiniteNumber(value, label);
  if (Math.abs(coordinate) > MAX_COORDINATE) {
    throw new RangeError(`${label} exceeds the coordinate limit.`);
  }
  return coordinate;
}

function requirePositiveNumber(value: unknown, label: string): number {
  const number = requireFiniteNumber(value, label);
  if (number <= 0 || number > MAX_VIEW_BOX_SIZE) {
    throw new RangeError(`${label} must be positive and bounded.`);
  }
  return number;
}

function requireNonNegativeNumber(value: unknown, label: string): number {
  const number = requireFiniteNumber(value, label);
  if (number < 0 || number > MAX_COORDINATE) {
    throw new RangeError(`${label} must be non-negative and bounded.`);
  }
  return number;
}

function requireUnitInterval(value: unknown, label: string): number {
  const number = requireFiniteNumber(value, label);
  if (number < 0 || number > 1) {
    throw new RangeError(`${label} must be between 0 and 1.`);
  }
  return number;
}

function requireInteger(value: unknown, label: string): number {
  const number = requireFiniteNumber(value, label);
  if (!Number.isInteger(number)) {
    throw new TypeError(`${label} must be an integer.`);
  }
  return number;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }
  return value;
}

function optionalEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new RangeError(`${label} has an unsupported value.`);
  }
  return value as T;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new TypeError(`${label} contains unsupported field "${key}".`);
    }
  }
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

const EMPTY_ASSET_LIST: readonly MindMapAssetSpec[] = Object.freeze([]);
const EMPTY_DESCRIPTOR_LIST: readonly MindMapAssetVisualDescriptor[] =
  Object.freeze([]);
