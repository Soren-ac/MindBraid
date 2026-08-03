import {
  createDefaultMindMapStyleSpec,
  createMindMapRenderEffectRef,
  type MindMapStyleSpec,
} from "./presentation";
import {
  PAPER_GRAIN_EFFECT_ID,
  PENCIL_DOT_EFFECT_ID,
  PENCIL_DOUBLE_STROKE_EFFECT_ID,
  PENCIL_EDGE_EFFECT_ID,
  PENCIL_HATCH_EFFECT_ID,
  type MindMapRenderEffectResolver,
  validateStyleRenderEffects,
} from "./render-effects";

export const PENCIL_SKETCH_STYLE_ID = "pencil-sketch";
export const CLOUD_STYLE_ID = "cloud";
export const COLORFUL_STYLE_ID = "colorful";
export const DEFAULT_MIND_MAP_STYLE_ID = COLORFUL_STYLE_ID;

export interface MindMapStyleRegistry {
  list(): readonly MindMapStyleSpec[];
  has(styleId: string): boolean;
  resolve(styleId: string): MindMapStyleSpec;
  resolveOrDefault(styleId: string | null | undefined): MindMapStyleSpec;
}

export function createPencilSketchStyleSpec(): MindMapStyleSpec {
  return createDefaultMindMapStyleSpec({
    id: PENCIL_SKETCH_STYLE_ID,
    label: "Pencil sketch",
    revision: "pencil-sketch-style-v1",
    tokens: {
      typography: {
        fontFamilyToken: "obmind-font-handwritten",
        fontSize: 15,
        rootFontSize: 23,
        fontWeight: 400,
        rootFontWeight: 600,
        lineHeight: 1.35,
      },
      node: {
        maxWidth: 260,
        minHeight: 38,
        paddingInline: 14,
        paddingBlock: 6,
        borderWidth: 1.5,
        radius: 13,
      },
      edge: {
        width: 1.8,
        routing: "bezier",
        lineStyle: "solid",
      },
      effects: {
        canvasTexture: createMindMapRenderEffectRef(
          PAPER_GRAIN_EFFECT_ID,
          { strength: 1 },
        ),
        nodeStroke: createMindMapRenderEffectRef(
          PENCIL_DOUBLE_STROKE_EFFECT_ID,
          { roughness: 1.2 },
        ),
        nodeFill: createMindMapRenderEffectRef(PENCIL_HATCH_EFFECT_ID, {
          opacity: 0.09,
        }),
        edgeStroke: createMindMapRenderEffectRef(PENCIL_EDGE_EFFECT_ID, {
          roughness: 1.25,
        }),
        terminalMarker: {
          effect: createMindMapRenderEffectRef(PENCIL_DOT_EFFECT_ID),
          placement: "leaf-target",
          size: 5,
        },
      },
      branches: {
        mode: "root-subtree",
        colorNodeFill: false,
        colorNodeStroke: true,
        colorNodeText: false,
        colorEdgeStroke: true,
      },
      roles: {
        root: {
          role: "root",
          shape: "rounded-rectangle",
          maxWidth: 340,
          minHeight: 60,
          paddingInline: 26,
          paddingBlock: 12,
          radius: 16,
          typography: {
            fontSize: 23,
            fontWeight: 600,
            lineHeight: 1.25,
          },
        },
        mainTopic: {
          role: "main-topic",
          shape: "rounded-rectangle",
          minHeight: 48,
          paddingInline: 18,
          paddingBlock: 8,
          radius: 14,
          typography: {
            fontSize: 19,
            fontWeight: 550,
          },
        },
        subtopic: {
          role: "subtopic",
          shape: "rounded-rectangle",
          minHeight: 38,
          paddingInline: 14,
          paddingBlock: 6,
          radius: 12,
          typography: {
            fontSize: 15,
            fontWeight: 400,
          },
        },
      },
    },
  });
}

export function createCloudStyleSpec(): MindMapStyleSpec {
  return createDefaultMindMapStyleSpec({
    id: CLOUD_STYLE_ID,
    label: "Cloud",
    revision: "cloud-style-v1",
    tokens: {
      typography: {
        fontFamilyToken: "font-interface",
        fontSize: 13,
        rootFontSize: 17,
        fontWeight: 400,
        rootFontWeight: 700,
        lineHeight: 1.3,
      },
      node: {
        maxWidth: 220,
        minHeight: 30,
        paddingInline: 10,
        paddingBlock: 4,
        borderWidth: 1,
        radius: 6,
      },
      edge: {
        width: 1.2,
        routing: "bezier",
        lineStyle: "solid",
      },
      branches: {
        mode: "root-subtree",
        colorNodeFill: false,
        colorNodeStroke: false,
        colorNodeText: true,
        colorEdgeStroke: true,
      },
      roles: {
        root: {
          role: "root",
          shape: "pill",
          maxWidth: 300,
          minHeight: 44,
          paddingInline: 28,
          paddingBlock: 10,
          typography: {
            fontSize: 17,
            fontWeight: 700,
            lineHeight: 1.2,
          },
        },
        mainTopic: {
          role: "main-topic",
          shape: "underline",
          minHeight: 36,
          paddingInline: 6,
          paddingBlock: 6,
          typography: {
            fontSize: 14,
            fontWeight: 600,
          },
        },
        subtopic: {
          role: "subtopic",
          shape: "none",
          minHeight: 28,
          paddingInline: 6,
          paddingBlock: 3,
          typography: {
            fontSize: 13,
            fontWeight: 400,
          },
        },
      },
    },
  });
}

export function createColorfulStyleSpec(): MindMapStyleSpec {
  return createDefaultMindMapStyleSpec({
    id: COLORFUL_STYLE_ID,
    label: "Colorful",
    revision: "colorful-style-v1",
    tokens: {
      typography: {
        fontFamilyToken: "font-interface",
        fontSize: 13,
        rootFontSize: 30,
        fontWeight: 400,
        rootFontWeight: 800,
        lineHeight: 1.3,
      },
      node: {
        maxWidth: 200,
        minHeight: 34,
        paddingInline: 16,
        paddingBlock: 7,
        borderWidth: 0,
        radius: 12,
      },
      edge: {
        width: 1.5,
        routing: "bezier",
        lineStyle: "solid",
      },
      branches: {
        mode: "root-subtree",
        colorNodeFill: true,
        colorNodeStroke: false,
        colorNodeText: false,
        colorEdgeStroke: true,
      },
      roles: {
        root: {
          role: "root",
          shape: "none",
          maxWidth: 400,
          minHeight: 60,
          paddingInline: 20,
          paddingBlock: 10,
          typography: {
            fontSize: 30,
            fontWeight: 800,
            lineHeight: 1.2,
          },
        },
        mainTopic: {
          role: "main-topic",
          shape: "rounded-rectangle",
          minHeight: 40,
          paddingInline: 18,
          paddingBlock: 8,
          radius: 12,
          borderWidth: 0,
          typography: {
            fontSize: 14,
            fontWeight: 600,
          },
        },
        subtopic: {
          role: "subtopic",
          shape: "none",
          minHeight: 28,
          paddingInline: 6,
          paddingBlock: 3,
          typography: {
            fontSize: 13,
            fontWeight: 400,
          },
        },
      },
    },
  });
}

export function createMindMapStyleRegistry(
  styles: readonly MindMapStyleSpec[],
  effects: MindMapRenderEffectResolver,
  defaultStyleId: string,
): MindMapStyleRegistry {
  const stylesById = new Map<string, MindMapStyleSpec>();
  for (const style of styles) {
	validateMindMapStyleSpec(style, effects);
    if (stylesById.has(style.id)) {
      throw new Error(`Duplicate mind-map style ID "${style.id}".`);
    }
    stylesById.set(style.id, style);
  }

  const defaultStyle = stylesById.get(defaultStyleId);
  if (defaultStyle === undefined) {
    throw new Error(
      `Default mind-map style "${defaultStyleId}" is not registered.`,
    );
  }

  const registeredStyles = [...stylesById.values()];
  return {
    list: () => registeredStyles,
    has: (styleId) => stylesById.has(styleId),
    resolve(styleId) {
      const style = stylesById.get(styleId);
      if (style !== undefined) {
        return style;
      }
      throw new Error(
        `Unknown mind-map style "${styleId}". Registered styles: ${[
          ...stylesById.keys(),
        ].join(", ")}.`,
      );
    },
    resolveOrDefault: (styleId) =>
      styleId === null || styleId === undefined
        ? defaultStyle
        : (stylesById.get(styleId) ?? defaultStyle),
  };
}

export function validateMindMapStyleSpec(
  style: MindMapStyleSpec,
  effects: MindMapRenderEffectResolver,
): void {
  if (!isRecord(style)) {
    throw new Error("Mind-map style must be an object.");
  }
  if (typeof style.id !== "string" || !isSafeAppearanceId(style.id)) {
    throw new Error(`Invalid mind-map style ID "${String(style.id)}".`);
  }
  if (
    typeof style.label !== "string" ||
    style.label.trim().length === 0 ||
    style.label.length > 160
  ) {
    throw new Error(`Mind-map style "${style.id}" requires a concise label.`);
  }
  if (!isSafeRevision(style.revision)) {
    throw new Error(`Mind-map style "${style.id}" has an invalid revision.`);
  }
  validateStyleTokens(style.tokens, style.id);
  validateStyleRenderEffects(style, effects);
}

export const BUILT_IN_MIND_MAP_STYLE_SPECS: readonly MindMapStyleSpec[] =
  Object.freeze([
    createPencilSketchStyleSpec(),
    createCloudStyleSpec(),
    createColorfulStyleSpec(),
  ]);

const BUILT_IN_MIND_MAP_STYLE_IDS = new Set(
  BUILT_IN_MIND_MAP_STYLE_SPECS.map(({ id }) => id),
);

export function isBuiltInMindMapStyleId(value: unknown): value is string {
  return (
    typeof value === "string" && BUILT_IN_MIND_MAP_STYLE_IDS.has(value)
  );
}

function isSafeAppearanceId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);
}

function validateStyleTokens(value: unknown, styleId: string): void {
  const tokens = requireRecord(value, `Mind-map style "${styleId}" tokens`);
  validateTypography(tokens.typography, "style typography", true);
  validateNodeMetrics(tokens.node, "style node metrics");

  const edge = requireRecord(tokens.edge, "style edge tokens");
  requireNumber(edge.width, "connector width", 0.1, 1_000);
  if (
    edge.routing !== "bezier" &&
    edge.routing !== "straight" &&
    edge.routing !== "orthogonal" &&
    edge.routing !== "rounded-orthogonal"
  ) {
    throw new Error("Style connector routing is not registered.");
  }
  if (
    edge.lineStyle !== "solid" &&
    edge.lineStyle !== "dashed" &&
    edge.lineStyle !== "dotted"
  ) {
    throw new Error("Style connector line type is not registered.");
  }
  const connectorProfile = requireRecord(
    edge.connectorProfile,
    "style connector profile",
  );
  if (connectorProfile.kind === "taper-to-child") {
    requireNumber(
      connectorProfile.childWidthRatio,
      "connector child width ratio",
      0.01,
      1,
    );
  } else if (connectorProfile.kind !== "uniform") {
    throw new Error("Style connector profile is not registered.");
  }

  const branches = requireRecord(tokens.branches, "style branch treatment");
  if (branches.mode !== "none" && branches.mode !== "root-subtree") {
    throw new Error("Style branch treatment mode is not registered.");
  }
  for (const key of [
    "colorNodeFill",
    "colorNodeStroke",
    "colorNodeText",
    "colorEdgeStroke",
  ]) {
    if (typeof branches[key] !== "boolean") {
      throw new Error(`Style branch treatment ${key} must be boolean.`);
    }
  }

  const roles = requireRecord(tokens.roles, "style role tokens");
  for (const role of ["root", "mainTopic", "subtopic"] as const) {
    validateStyleRole(roles[role], role);
  }
  validateEffectTokens(tokens.effects);
}

function validateStyleRole(value: unknown, label: string): void {
  const role = requireRecord(value, `${label} role`);
  if (
    role.role !== undefined &&
    role.role !== "root" &&
    role.role !== "main-topic" &&
    role.role !== "subtopic"
  ) {
    throw new Error(`${label} role contains an invalid semantic role.`);
  }
  if (
    role.shape !== undefined &&
    role.shape !== "rounded-rectangle" &&
    role.shape !== "rectangle" &&
    role.shape !== "pill" &&
    role.shape !== "ellipse" &&
    role.shape !== "underline" &&
    role.shape !== "none"
  ) {
    throw new Error(`${label} role contains an invalid node shape.`);
  }
  for (const key of [
    "borderWidth",
    "radius",
    "maxWidth",
    "minHeight",
    "paddingInline",
    "paddingBlock",
  ]) {
    if (role[key] !== undefined) {
      requireNumber(role[key], `${label} ${key}`, 0, 10_000);
    }
  }
  if (role.typography !== undefined) {
    validateTypography(role.typography, `${label} typography`, false);
  }
  if (role.variant !== undefined) {
    requireIdentifier(role.variant, `${label} variant`);
  }
  if (role.iconId !== undefined) {
    requireIdentifier(role.iconId, `${label} icon`);
  }
  if (role.markerIds !== undefined) {
    if (
      !Array.isArray(role.markerIds) ||
      role.markerIds.length > 64 ||
      !role.markerIds.every((markerId) => {
        try {
          requireIdentifier(markerId, `${label} marker`);
          return true;
        } catch {
          return false;
        }
      })
    ) {
      throw new Error(`${label} markers are invalid.`);
    }
  }
}

function validateTypography(
  value: unknown,
  label: string,
  complete: boolean,
): void {
  const typography = requireRecord(value, label);
  if (complete || typography.fontFamilyToken !== undefined) {
    requireIdentifier(typography.fontFamilyToken, `${label} font token`);
  }
  for (const [key, minimum, maximum] of [
    ["fontSize", 1, 512],
    ["rootFontSize", 1, 512],
    ["fontWeight", 1, 1_000],
    ["rootFontWeight", 1, 1_000],
    ["lineHeight", 0.5, 5],
  ] as const) {
    if (complete || typography[key] !== undefined) {
      requireNumber(typography[key], `${label} ${key}`, minimum, maximum);
    }
  }
  if (
    typography.italic !== undefined &&
    typeof typography.italic !== "boolean"
  ) {
    throw new Error(`${label} italic must be boolean.`);
  }
}

function validateNodeMetrics(value: unknown, label: string): void {
  const metrics = requireRecord(value, label);
  for (const key of [
    "maxWidth",
    "minHeight",
    "paddingInline",
    "paddingBlock",
    "borderWidth",
    "radius",
  ]) {
    requireNumber(metrics[key], `${label} ${key}`, 0, 10_000);
  }
  if (metrics.maxWidth === 0) {
    throw new Error(`${label} maxWidth must be greater than zero.`);
  }
}

function validateEffectTokens(value: unknown): void {
  const effects = requireRecord(value, "style effect tokens");
  for (const key of [
    "canvasTexture",
    "nodeStroke",
    "nodeFill",
    "edgeStroke",
  ]) {
    if (effects[key] !== null) {
      validateEffectReference(effects[key], key);
    }
  }
  if (effects.terminalMarker !== null) {
    const marker = requireRecord(
      effects.terminalMarker,
      "style terminal marker",
    );
    validateEffectReference(marker.effect, "terminal marker");
    if (
      marker.placement !== "leaf-target" &&
      marker.placement !== "all-targets"
    ) {
      throw new Error("Style terminal marker placement is invalid.");
    }
    requireNumber(marker.size, "terminal marker size", 0.1, 1_000);
  }
}

function validateEffectReference(value: unknown, label: string): void {
  const reference = requireRecord(value, `${label} effect`);
  requireIdentifier(reference.profileId, `${label} effect profile`);
  const options = requireRecord(reference.options, `${label} effect options`);
  if (Object.keys(options).length > 64) {
    throw new Error(`${label} effect has too many options.`);
  }
  for (const [key, option] of Object.entries(options)) {
    requireIdentifier(key, `${label} effect option`);
    if (typeof option === "number") {
      if (!Number.isFinite(option)) {
        throw new Error(`${label} effect option must be finite.`);
      }
      continue;
    }
    if (typeof option === "boolean") {
      continue;
    }
    if (
      typeof option !== "string" ||
      option.length > 256 ||
      /url\s*\(|:\/\/|[;{}]/iu.test(option)
    ) {
      throw new Error(`${label} effect option contains an unsafe value.`);
    }
  }
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !isSafeAppearanceId(value)) {
    throw new Error(`${label} must be a safe identifier.`);
  }
  return value;
}

function isSafeRevision(value: unknown): boolean {
  return (
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.length > 0 && value.length <= 256)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
