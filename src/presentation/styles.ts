import {
  createDefaultMindMapStyleSpec,
  createMindMapRenderEffectRef,
  type MindMapStyleSpec,
} from "./presentation";
import {
  CHARCOAL_DOT_EFFECT_ID,
  CHARCOAL_EDGE_EFFECT_ID,
  CHARCOAL_FILL_EFFECT_ID,
  CHARCOAL_PAPER_EFFECT_ID,
  CHARCOAL_STROKE_EFFECT_ID,
  PAPER_GRAIN_EFFECT_ID,
  PENCIL_DOT_EFFECT_ID,
  PENCIL_DOUBLE_STROKE_EFFECT_ID,
  PENCIL_EDGE_EFFECT_ID,
  PENCIL_HATCH_EFFECT_ID,
  TECHNICAL_GRID_EFFECT_ID,
  type MindMapRenderEffectResolver,
  validateStyleRenderEffects,
} from "./render-effects";

export const PENCIL_SKETCH_STYLE_ID = "pencil-sketch";
/**
 * Compatibility ID retained for documents which previously selected Cloud.
 * Its visual specification is now the classic organic mind-map treatment.
 */
export const CLOUD_STYLE_ID = "cloud";
export const COLORFUL_STYLE_ID = "colorful";
export const SWISS_EDITORIAL_STYLE_ID = "swiss-editorial";
export const ATLAS_CARDS_STYLE_ID = "atlas-cards";
export const TECHNICAL_DRAFT_STYLE_ID = "technical-draft";
export const CHARCOAL_STYLE_ID = "charcoal";
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
    label: "Organic Classic",
    revision: "cloud-style-v3",
    tokens: {
      typography: {
        fontFamilyToken: "font-interface",
        fontSize: 14,
        rootFontSize: 23,
        fontWeight: 400,
        rootFontWeight: 750,
        lineHeight: 1.28,
      },
      node: {
        maxWidth: 240,
        minHeight: 28,
        paddingInline: 6,
        paddingBlock: 3,
        borderWidth: 0,
        radius: 0,
      },
      edge: {
        width: 2.2,
        connectorProfile: {
          kind: "taper-to-child",
          childWidthRatio: 0.42,
        },
        routing: "bezier",
        lineStyle: "solid",
      },
      // Organic maps use the branch itself as the visual container. Topic
      // labels stay unfilled so changing a Palette only changes color.
      branches: {
        mode: "root-subtree",
        colorNodeFill: false,
        colorNodeStroke: false,
        colorNodeText: false,
        colorEdgeStroke: true,
      },
      roles: {
        root: {
          role: "root",
          shape: "ellipse",
          maxWidth: 340,
          minHeight: 62,
          paddingInline: 30,
          paddingBlock: 14,
          borderWidth: 1.5,
          radius: 30,
          typography: {
            fontSize: 23,
            fontWeight: 750,
            lineHeight: 1.2,
          },
        },
        mainTopic: {
          role: "main-topic",
          shape: "none",
          minHeight: 34,
          paddingInline: 8,
          paddingBlock: 4,
          typography: {
            fontSize: 16,
            fontWeight: 650,
          },
        },
        subtopic: {
          role: "subtopic",
          shape: "none",
          minHeight: 28,
          paddingInline: 6,
          paddingBlock: 3,
          typography: {
            fontSize: 14,
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

/**
 * A restrained editorial outline: hierarchy comes from typography, underlines,
 * orthogonal rules, and whitespace rather than filled topic containers.
 */
export function createSwissEditorialStyleSpec(): MindMapStyleSpec {
  return createDefaultMindMapStyleSpec({
    id: SWISS_EDITORIAL_STYLE_ID,
    label: "Swiss Editorial",
    revision: "swiss-editorial-style-v1",
    tokens: {
      typography: {
        fontFamilyToken: "font-interface",
        fontSize: 14,
        rootFontSize: 30,
        fontWeight: 400,
        rootFontWeight: 750,
        lineHeight: 1.25,
      },
      node: {
        maxWidth: 300,
        minHeight: 28,
        paddingInline: 6,
        paddingBlock: 3,
        borderWidth: 0,
        radius: 0,
      },
      edge: {
        width: 1.1,
        routing: "rounded-orthogonal",
        lineStyle: "solid",
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
          shape: "none",
          maxWidth: 440,
          minHeight: 56,
          paddingInline: 12,
          paddingBlock: 8,
          typography: {
            fontSize: 30,
            fontWeight: 750,
            lineHeight: 1.15,
          },
        },
        mainTopic: {
          role: "main-topic",
          shape: "underline",
          minHeight: 38,
          paddingInline: 6,
          paddingBlock: 6,
          borderWidth: 1.5,
          typography: {
            fontSize: 16,
            fontWeight: 650,
          },
        },
        subtopic: {
          role: "subtopic",
          shape: "none",
          minHeight: 28,
          paddingInline: 6,
          paddingBlock: 3,
          typography: {
            fontSize: 14,
            fontWeight: 400,
          },
        },
      },
    },
  });
}

/**
 * A hierarchy of generous cards. It deliberately uses no elevation effect so
 * the same renderer-neutral specification works in every live/export adapter.
 */
export function createAtlasCardsStyleSpec(): MindMapStyleSpec {
  return createDefaultMindMapStyleSpec({
    id: ATLAS_CARDS_STYLE_ID,
    label: "Atlas Cards",
    revision: "atlas-cards-style-v2",
    tokens: {
      typography: {
        fontFamilyToken: "font-interface",
        fontSize: 14,
        rootFontSize: 25,
        fontWeight: 400,
        rootFontWeight: 700,
        lineHeight: 1.3,
      },
      node: {
        maxWidth: 280,
        minHeight: 36,
        paddingInline: 16,
        paddingBlock: 8,
        borderWidth: 1,
        radius: 14,
      },
      edge: {
        // Atlas is a restrained card hierarchy: direct, low-emphasis rules
        // keep the eye on card depth rather than on connector routing.
        width: 1.15,
        routing: "straight",
        lineStyle: "solid",
      },
      // First-level cards use their root-subtree Palette branch. Deeper cards
      // deliberately retreat to the Palette surface and outline, so a palette
      // change remains color-only while hierarchy stays Style-owned.
      nodeTreatment: {
        fillSourceByRole: {
          root: "automatic",
          mainTopic: "branch",
          subtopic: "surface",
        },
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
          shape: "rounded-rectangle",
          maxWidth: 380,
          minHeight: 68,
          paddingInline: 30,
          paddingBlock: 16,
          borderWidth: 1.5,
          radius: 22,
          typography: {
            fontSize: 25,
            fontWeight: 700,
            lineHeight: 1.2,
          },
        },
        mainTopic: {
          role: "main-topic",
          shape: "rounded-rectangle",
          minHeight: 48,
          paddingInline: 20,
          paddingBlock: 10,
          borderWidth: 1,
          radius: 16,
          typography: {
            fontSize: 16,
            fontWeight: 650,
          },
        },
        subtopic: {
          role: "subtopic",
          shape: "rounded-rectangle",
          minHeight: 34,
          paddingInline: 14,
          paddingBlock: 6,
          borderWidth: 1,
          radius: 10,
          typography: {
            fontSize: 14,
            fontWeight: 450,
          },
        },
      },
    },
  });
}

/**
 * Blueprint-like drafting treatment. The grid is a renderer capability, while
 * all visible colors continue to come solely from the active Palette.
 */
export function createTechnicalDraftStyleSpec(): MindMapStyleSpec {
  return createDefaultMindMapStyleSpec({
    id: TECHNICAL_DRAFT_STYLE_ID,
    label: "Technical Draft",
    revision: "technical-draft-style-v1",
    tokens: {
      typography: {
        fontFamilyToken: "font-monospace",
        fontSize: 13,
        rootFontSize: 21,
        fontWeight: 450,
        rootFontWeight: 700,
        lineHeight: 1.3,
      },
      node: {
        maxWidth: 280,
        minHeight: 32,
        paddingInline: 12,
        paddingBlock: 6,
        borderWidth: 1,
        radius: 0,
      },
      edge: {
        width: 1.1,
        routing: "orthogonal",
        lineStyle: "solid",
      },
      effects: {
        canvasTexture: createMindMapRenderEffectRef(TECHNICAL_GRID_EFFECT_ID, {
          size: 24,
          majorEvery: 5,
          opacity: 0.18,
        }),
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
          shape: "rectangle",
          maxWidth: 360,
          minHeight: 58,
          paddingInline: 24,
          paddingBlock: 12,
          borderWidth: 2,
          radius: 0,
          typography: {
            fontSize: 21,
            fontWeight: 700,
            lineHeight: 1.2,
          },
        },
        mainTopic: {
          role: "main-topic",
          shape: "rectangle",
          minHeight: 40,
          paddingInline: 14,
          paddingBlock: 7,
          borderWidth: 1.5,
          radius: 0,
          typography: {
            fontSize: 14,
            fontWeight: 650,
          },
        },
        subtopic: {
          role: "subtopic",
          shape: "rectangle",
          minHeight: 30,
          paddingInline: 10,
          paddingBlock: 5,
          borderWidth: 1,
          radius: 0,
          typography: {
            fontSize: 13,
            fontWeight: 450,
          },
        },
      },
    },
  });
}

/**
 * Dry charcoal material: one rough contour and dusty fill rather than Pencil
 * Sketch's handwritten type, double outline, and cross-hatched treatment.
 */
export function createCharcoalStyleSpec(): MindMapStyleSpec {
  return createDefaultMindMapStyleSpec({
    id: CHARCOAL_STYLE_ID,
    label: "Charcoal",
    revision: "charcoal-style-v1",
    tokens: {
      typography: {
        fontFamilyToken: "font-text",
        fontSize: 15,
        rootFontSize: 24,
        fontWeight: 450,
        rootFontWeight: 700,
        lineHeight: 1.32,
      },
      node: {
        maxWidth: 280,
        minHeight: 38,
        paddingInline: 15,
        paddingBlock: 7,
        borderWidth: 1.7,
        radius: 8,
      },
      edge: {
        width: 2,
        connectorProfile: {
          kind: "taper-to-child",
          childWidthRatio: 0.5,
        },
        routing: "bezier",
        lineStyle: "solid",
      },
      effects: {
        canvasTexture: createMindMapRenderEffectRef(CHARCOAL_PAPER_EFFECT_ID, {
          strength: 0.8,
        }),
        nodeStroke: createMindMapRenderEffectRef(CHARCOAL_STROKE_EFFECT_ID, {
          roughness: 1.55,
        }),
        nodeFill: createMindMapRenderEffectRef(CHARCOAL_FILL_EFFECT_ID, {
          opacity: 0.07,
        }),
        edgeStroke: createMindMapRenderEffectRef(CHARCOAL_EDGE_EFFECT_ID, {
          roughness: 1.45,
        }),
        terminalMarker: {
          effect: createMindMapRenderEffectRef(CHARCOAL_DOT_EFFECT_ID),
          placement: "leaf-target",
          size: 4.5,
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
          maxWidth: 360,
          minHeight: 64,
          paddingInline: 28,
          paddingBlock: 14,
          borderWidth: 2,
          radius: 12,
          typography: {
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1.2,
          },
        },
        mainTopic: {
          role: "main-topic",
          shape: "rounded-rectangle",
          minHeight: 46,
          paddingInline: 19,
          paddingBlock: 8,
          borderWidth: 1.8,
          radius: 9,
          typography: {
            fontSize: 17,
            fontWeight: 650,
          },
        },
        subtopic: {
          role: "subtopic",
          shape: "rounded-rectangle",
          minHeight: 36,
          paddingInline: 14,
          paddingBlock: 6,
          borderWidth: 1.5,
          radius: 7,
          typography: {
            fontSize: 15,
            fontWeight: 450,
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
    createSwissEditorialStyleSpec(),
    createAtlasCardsStyleSpec(),
    createTechnicalDraftStyleSpec(),
    createCharcoalStyleSpec(),
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

  // This optional treatment was introduced after custom Style persistence.
  // Omitting it remains a supported legacy shape and resolves to `automatic`
  // at composition/render time; supplied values are validated strictly.
  if (tokens.nodeTreatment !== undefined) {
    validateNodeTreatment(tokens.nodeTreatment);
  }

  const roles = requireRecord(tokens.roles, "style role tokens");
  for (const role of ["root", "mainTopic", "subtopic"] as const) {
    validateStyleRole(roles[role], role);
  }
  validateEffectTokens(tokens.effects);
}

function validateNodeTreatment(value: unknown): void {
  const treatment = requireRecord(value, "style node treatment");
  if (treatment.fillSourceByRole === undefined) {
    return;
  }
  const sources = requireRecord(
    treatment.fillSourceByRole,
    "style node fill-source treatment",
  );
  for (const role of ["root", "mainTopic", "subtopic"] as const) {
    const source = sources[role];
    if (source === undefined) {
      continue;
    }
    if (
      source !== "automatic" &&
      source !== "branch" &&
      source !== "surface" &&
      source !== "surface-emphasis" &&
      source !== "canvas"
    ) {
      throw new Error(
        `Style node fill source for ${role} is not registered.`,
      );
    }
  }
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
