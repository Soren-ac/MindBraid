import type {
  LayoutDirection,
  LayoutOrientation,
  MindMapNode,
  MindMapNodeKind,
  MindMapNodeEditSnapshot,
} from "../core/model";
import type { NodeMovePlacement } from "../topic/mutation/node-move";
import type { MindMapTopicCommandRequest } from "../topic/interaction/topic-command";
import {
  areMindMapRenderedColorsEqual,
  compositeMindMapColors,
  parseMindMapCssColor,
  selectMindMapTextColorForBackground,
  type MindMapRgbaColor,
  type MindMapThemeColorResolver,
} from "./color-contrast";

/**
 * Renderer-neutral presentation contracts for a future visual frontend.
 *
 * Nothing in this module depends on Obsidian, DOM, SVG, or Canvas. The current
 * MVP renderer may consume only a subset of this snapshot; unsupported fields
 * are explicit extension points rather than claims of implemented UI.
 */

export type MindMapLayoutOrientation = LayoutOrientation;

export interface MindMapLayoutSpacing {
  readonly level: number;
  readonly sibling: number;
  readonly subtree: number;
}

export interface MindMapLayoutSpec {
  /**
   * Increment when geometry-affecting layout configuration changes. Renderers
   * use this to invalidate viewport assumptions and engine caches.
   */
  readonly revision: string | number;
  /**
   * Identifies a registered layout strategy. The MVP ships `tree` and
   * `bilateral-tree`; future engines can register IDs such as `fishbone`.
   */
  readonly engineId: string;
  readonly orientation: MindMapLayoutOrientation;
  readonly spacing: MindMapLayoutSpacing;
  readonly options: Readonly<Record<string, unknown>>;
}

export type MindMapThemeColor =
  | {
      /**
       * A host-provided semantic token. An Obsidian DOM renderer can map this
       * to a CSS variable; a Canvas renderer can resolve it before painting.
       */
      readonly kind: "host";
      readonly token: string;
    }
  | {
      readonly kind: "literal";
      readonly value: string;
    };

export interface MindMapThemeColorTokens {
  readonly canvas: MindMapThemeColor;
  readonly surface: MindMapThemeColor;
  readonly surfaceEmphasis: MindMapThemeColor;
  readonly surfaceHover: MindMapThemeColor;
  readonly text: MindMapThemeColor;
  readonly textOnAccent: MindMapThemeColor;
  readonly textMuted: MindMapThemeColor;
  readonly border: MindMapThemeColor;
  readonly borderHover: MindMapThemeColor;
  readonly accent: MindMapThemeColor;
  readonly edge: MindMapThemeColor;
  readonly selection: MindMapThemeColor;
  /**
   * Optional semantic branch colors. `branchColorIndex` on sparse edge/node
   * presentation selects from this palette without baking colors into layout.
   */
  readonly branchPalette: readonly MindMapThemeColor[];
}

/** Effective color scheme resolved by the host before rendering. */
export type MindMapColorScheme = "light" | "dark";

export interface MindMapThemeTypographyTokens {
  readonly fontFamilyToken: string;
  readonly fontSize: number;
  readonly rootFontSize: number;
  readonly fontWeight: number;
  readonly rootFontWeight: number;
  readonly lineHeight: number;
}

export interface MindMapThemeNodeTokens {
  readonly maxWidth: number;
  readonly minHeight: number;
  readonly paddingInline: number;
  readonly paddingBlock: number;
  readonly borderWidth: number;
  readonly radius: number;
}

/**
 * A renderer-neutral connector width treatment. The selected document
 * formatting profile may inherit this value from the active visual style.
 *
 * The profile intentionally describes geometry only. It never contains a
 * color, routing choice, CSS declaration, or renderer implementation detail,
 * so it remains independent from palettes and can be consumed by SVG, Canvas,
 * or a future native renderer alike.
 */
export type MindMapConnectorStrokeProfile =
  | {
      readonly kind: "uniform";
    }
  | {
      readonly kind: "taper-to-child";
      /** Ratio of the child-side width to the parent-side width. */
      readonly childWidthRatio: number;
    };

/** Creates an ownership-safe copy for composed and persisted presentation. */
export function cloneMindMapConnectorStrokeProfile(
  profile: MindMapConnectorStrokeProfile,
): MindMapConnectorStrokeProfile {
  return profile.kind === "uniform"
    ? { kind: "uniform" }
    : {
        kind: "taper-to-child",
        childWidthRatio: profile.childWidthRatio,
      };
}

export interface MindMapThemeEdgeTokens {
  readonly width: number;
  /** Default connector width treatment supplied by this visual style. */
  readonly connectorProfile: MindMapConnectorStrokeProfile;
  readonly routing: MindMapEdgeRouting;
  readonly lineStyle: MindMapLineStyle;
}

export type MindMapRenderEffectKind =
  | "canvas-texture"
  | "node-stroke"
  | "node-fill"
  | "edge-stroke"
  | "terminal-marker";

export type MindMapRenderEffectOption = string | number | boolean;

/**
 * Renderer-neutral reference to an effect registered by the active frontend.
 *
 * Themes contain only a stable profile ID and primitive options. They never
 * contain CSS, DOM callbacks, URLs, or renderer instances.
 */
export interface MindMapRenderEffectRef {
  readonly profileId: string;
  readonly options: Readonly<Record<string, MindMapRenderEffectOption>>;
}

export interface MindMapThemeTerminalMarker {
  readonly effect: MindMapRenderEffectRef;
  readonly placement: "leaf-target" | "all-targets";
  readonly size: number;
}

export interface MindMapThemeEffectTokens {
  readonly canvasTexture: MindMapRenderEffectRef | null;
  readonly nodeStroke: MindMapRenderEffectRef | null;
  readonly nodeFill: MindMapRenderEffectRef | null;
  readonly edgeStroke: MindMapRenderEffectRef | null;
  readonly terminalMarker: MindMapThemeTerminalMarker | null;
}

/**
 * Automatic palette inheritance is presentation policy, not DOM order.
 * `root-subtree` assigns each root child a stable palette index and propagates
 * that index through the complete child subtree.
 */
export interface MindMapThemeBranchTokens {
  readonly mode: "none" | "root-subtree";
  readonly colorNodeFill: boolean;
  readonly colorNodeStroke: boolean;
  readonly colorNodeText: boolean;
  readonly colorEdgeStroke: boolean;
}

/**
 * A color-free source selector for a topic's background. The active Palette
 * supplies every actual color; a Style merely decides which semantic source
 * is appropriate at a given place in the hierarchy.
 *
 * `automatic` preserves the original behavior for existing styles: it first
 * honors a role color from the Palette, then an enabled branch color, then a
 * normal semantic surface. Other values allow a Style to express deliberate
 * visual hierarchy without retaining palette colors or renderer details.
 */
export type MindMapNodeFillSource =
  | "automatic"
  | "branch"
  | "surface"
  | "surface-emphasis"
  | "canvas";

/**
 * Semantic node roles are depth-derived by the renderer: root, first-level
 * topic, and all deeper topics. This keeps the treatment reusable by future
 * layouts without putting depth or DOM state into a Style definition.
 */
export interface MindMapNodeFillSourceByRole {
  readonly root: MindMapNodeFillSource;
  readonly mainTopic: MindMapNodeFillSource;
  readonly subtopic: MindMapNodeFillSource;
}

/**
 * Extensible, renderer-neutral node treatment owned by a Style. The optional
 * nested field is intentional: persisted custom Styles from before this
 * contract resolve through the default migration below instead of failing to
 * load.
 */
export interface MindMapNodeTreatmentTokens {
  readonly fillSourceByRole?: Partial<MindMapNodeFillSourceByRole>;
}

export interface MindMapThemeTokens {
  readonly colors: MindMapThemeColorTokens;
  readonly typography: MindMapThemeTypographyTokens;
  readonly node: MindMapThemeNodeTokens;
  readonly nodeTreatment: MindMapNodeTreatmentTokens;
  readonly edge: MindMapThemeEdgeTokens;
  readonly effects: MindMapThemeEffectTokens;
  readonly branches: MindMapThemeBranchTokens;
  readonly roles: MindMapThemeRoleTokens;
}

/**
 * Geometry and treatment for one visual style. Color-bearing fields are
 * deliberately excluded so a style can be combined with any registered
 * palette without retaining hidden colors from its original preset.
 */
export type MindMapNodeStylePresentation = Omit<
  MindMapNodePresentation,
  "fill" | "stroke" | "textColor" | "branchColorIndex" | "content"
>;

export interface MindMapStyleRoleTokens {
  readonly root: MindMapNodeStylePresentation;
  readonly mainTopic: MindMapNodeStylePresentation;
  readonly subtopic: MindMapNodeStylePresentation;
}

export interface MindMapStyleTokens {
  readonly typography: MindMapThemeTypographyTokens;
  readonly node: MindMapThemeNodeTokens;
  /** Color-free role/depth treatment; values resolve through Palette tokens. */
  readonly nodeTreatment: MindMapNodeTreatmentTokens;
  readonly edge: MindMapThemeEdgeTokens;
  readonly effects: MindMapThemeEffectTokens;
  /**
   * Determines which visual channels receive branch colors. This is style
   * treatment rather than palette data: changing a palette may replace the
   * colors, but must not turn outlined topics into filled topics (or vice
   * versa).
   */
  readonly branches: MindMapThemeBranchTokens;
  readonly roles: MindMapStyleRoleTokens;
}

export interface MindMapStyleSpec {
  readonly id: string;
  readonly label: string;
  readonly revision: string | number;
  readonly tokens: MindMapStyleTokens;
}

export interface MindMapPaletteNodeColors {
  readonly fill?: MindMapThemeColor;
  readonly stroke?: MindMapThemeColor;
  readonly textColor?: MindMapThemeColor;
}

export interface MindMapPaletteRoleTokens {
  readonly root: MindMapPaletteNodeColors;
  readonly mainTopic: MindMapPaletteNodeColors;
  readonly subtopic: MindMapPaletteNodeColors;
}

export interface MindMapPaletteSpec {
  readonly id: string;
  readonly label: string;
  readonly revision: string | number;
  readonly colors: MindMapThemeColorTokens;
  readonly roles: MindMapPaletteRoleTokens;
  /** Color overrides applied when the host is rendering in light mode. */
  readonly lightColors?: Partial<MindMapThemeColorTokens>;
  /** Optional role-color overrides applied only in light mode. */
  readonly lightRoles?: Partial<MindMapPaletteRoleTokens>;
}

export interface MindMapThemeSpec {
  readonly id: string;
  readonly label: string;
  /** Provenance of this effective, composed renderer snapshot. */
  readonly styleId: string;
  readonly paletteId: string;
  /** Geometry/treatment revision used for measurement invalidation. */
  readonly styleRevision: string | number;
  /** Color-only revision used for repaint invalidation. */
  readonly paletteRevision: string | number;
  /**
   * Revision of the complete composed snapshot. Renderers use the separate
   * style and palette revisions when they need geometry-only or color-only
   * invalidation.
   */
  readonly revision: string | number;
  readonly tokens: MindMapThemeTokens;
  /** Color overrides applied when the host is rendering in light mode. */
  readonly lightColors?: Partial<MindMapThemeColorTokens>;
  /** Role-color overrides applied when the host is rendering in light mode. */
  readonly lightRoles?: Partial<MindMapPaletteRoleTokens>;
}

export const DEFAULT_MIND_MAP_GLOBAL_FONT_ID = "style-default";
export const DEFAULT_MIND_MAP_CONNECTOR_WIDTH_ID = "style-default";
export const DEFAULT_MIND_MAP_CONNECTOR_PROFILE_ID = "style-default";

/**
 * Resolved document-wide presentation controls. IDs are persisted and
 * capability-resolved values are supplied to renderers, so a frontend never
 * has to pass arbitrary CSS font families or unchecked numeric widths.
 */
export interface MindMapFontFamilySpec {
  readonly id: string;
  readonly label: string;
  readonly revision: string | number;
  /** Null inherits the selected mind-map style's font family. */
  readonly fontFamilyToken: string | null;
}

export interface MindMapConnectorWidthSpec {
  readonly id: string;
  readonly label: string;
  readonly revision: string | number;
  /** Null inherits the selected mind-map style's connector width. */
  readonly width: number | null;
}

/**
 * A registered document-wide connector treatment. `null` deliberately means
 * "inherit the active style's connector profile" rather than a missing or
 * unchecked setting.
 */
export interface MindMapConnectorProfileSpec {
  readonly id: string;
  readonly label: string;
  readonly revision: string | number;
  readonly profile: MindMapConnectorStrokeProfile | null;
}

export interface MindMapFormattingSpec {
  readonly fontFamily: MindMapFontFamilySpec;
  readonly connectorWidth: MindMapConnectorWidthSpec;
  readonly connectorProfile: MindMapConnectorProfileSpec;
}

/**
 * Resolves the complete color token set for one render without coupling a
 * renderer to DOM theme classes or a host-specific appearance preference.
 */
export function resolveMindMapThemeColors(
  theme: MindMapThemeSpec,
  colorScheme: MindMapColorScheme,
): MindMapThemeColorTokens {
  if (colorScheme !== "light" || theme.lightColors === undefined) {
    return theme.tokens.colors;
  }

  return {
    ...theme.tokens.colors,
    ...theme.lightColors,
  };
}

export function resolveMindMapThemeRoles(
  theme: MindMapThemeSpec,
  colorScheme: MindMapColorScheme,
): MindMapThemeRoleTokens {
  if (colorScheme !== "light" || theme.lightRoles === undefined) {
    return theme.tokens.roles;
  }
  return {
    root: mergeRoleColorOverrides(
      theme.tokens.roles.root,
      theme.lightRoles.root,
    ),
    mainTopic: mergeRoleColorOverrides(
      theme.tokens.roles.mainTopic,
      theme.lightRoles.mainTopic,
    ),
    subtopic: mergeRoleColorOverrides(
      theme.tokens.roles.subtopic,
      theme.lightRoles.subtopic,
    ),
  };
}

export type MindMapNodeRole = "root" | "main-topic" | "subtopic";

const DEFAULT_MIND_MAP_NODE_FILL_SOURCE_BY_ROLE: MindMapNodeFillSourceByRole =
  Object.freeze({
    root: "automatic",
    mainTopic: "automatic",
    subtopic: "automatic",
  });

/**
 * Resolves a safe complete fill-source map from a possibly legacy or partial
 * treatment. This is the compatibility boundary for custom Style JSON that
 * predates node treatments.
 */
export function resolveMindMapNodeFillSourcesByRole(
  treatment: MindMapNodeTreatmentTokens | null | undefined,
): MindMapNodeFillSourceByRole {
  const sources = treatment?.fillSourceByRole;
  return {
    root: normalizeMindMapNodeFillSource(sources?.root),
    mainTopic: normalizeMindMapNodeFillSource(sources?.mainTopic),
    subtopic: normalizeMindMapNodeFillSource(sources?.subtopic),
  };
}

/** Creates an ownership-safe, complete node-treatment snapshot. */
export function cloneMindMapNodeTreatmentTokens(
  treatment: MindMapNodeTreatmentTokens | null | undefined,
): MindMapNodeTreatmentTokens {
  return {
    fillSourceByRole: resolveMindMapNodeFillSourcesByRole(treatment),
  };
}

/** Resolves one semantic role's Style-owned background source. */
export function resolveMindMapNodeFillSource(
  treatment: MindMapNodeTreatmentTokens | null | undefined,
  role: MindMapNodeRole,
): MindMapNodeFillSource {
  const sources = resolveMindMapNodeFillSourcesByRole(treatment);
  switch (role) {
    case "root":
      return sources.root;
    case "main-topic":
      return sources.mainTopic;
    case "subtopic":
      return sources.subtopic;
  }
}

function normalizeMindMapNodeFillSource(
  value: unknown,
): MindMapNodeFillSource {
  return value === "automatic" ||
    value === "branch" ||
    value === "surface" ||
    value === "surface-emphasis" ||
    value === "canvas"
    ? value
    : DEFAULT_MIND_MAP_NODE_FILL_SOURCE_BY_ROLE.root;
}

export type MindMapNodeShape =
  | "rounded-rectangle"
  | "rectangle"
  | "pill"
  | "ellipse"
  | "underline"
  | "none";

export interface MindMapNodeTextColorResolutionInput {
  readonly shape?: MindMapNodeShape;
  readonly effectiveFill: MindMapThemeColor;
  readonly canvas: MindMapThemeColor;
  readonly defaultTextColor: MindMapThemeColor;
  readonly contrastTextColor?: MindMapThemeColor;
  readonly roleTextColor?: MindMapThemeColor;
  readonly branchTextColor?: MindMapThemeColor;
  readonly explicitTextColor?: MindMapThemeColor;
  readonly resolveColor?: MindMapThemeColorResolver;
}

/**
 * Resolves a topic's text color from the surface it actually paints.
 * Transparent shapes and fills matching the canvas use normal palette text;
 * filled topics choose among palette semantic colors after alpha composition.
 * A user-owned sparse override remains authoritative.
 */
export function resolveMindMapNodeTextColor(
  input: MindMapNodeTextColorResolutionInput,
): MindMapThemeColor {
  if (input.explicitTextColor !== undefined) {
    return input.explicitTextColor;
  }
  if (
    !hasDistinctMindMapNodeFill(
      input.shape,
      input.effectiveFill,
      input.canvas,
      input.resolveColor,
    )
  ) {
    return input.defaultTextColor;
  }
  const fallback =
    input.branchTextColor ??
    input.roleTextColor ??
    input.defaultTextColor;
  const resolveColor = input.resolveColor ?? resolveLiteralThemeColor;
  const fill = resolveColor(input.effectiveFill);
  const canvas = resolveColor(input.canvas);
  if (fill === null || canvas === null) {
    return fallback;
  }
  const background = compositeMindMapColors(fill, canvas);
  return (
    selectMindMapTextColorForBackground(
      background,
      [
        ...(input.branchTextColor === undefined
          ? []
          : [input.branchTextColor]),
        ...(input.roleTextColor === undefined ? [] : [input.roleTextColor]),
        input.defaultTextColor,
        ...(input.contrastTextColor === undefined
          ? []
          : [input.contrastTextColor]),
        input.canvas,
      ],
      resolveColor,
    ) ?? fallback
  );
}

/** Whether a topic paints a fill visibly distinct from the canvas behind it. */
export function hasDistinctMindMapNodeFill(
  shape: MindMapNodeShape | undefined,
  effectiveFill: MindMapThemeColor,
  canvas: MindMapThemeColor,
  resolveColor: MindMapThemeColorResolver = resolveLiteralThemeColor,
): boolean {
  if (shape === "none" || shape === "underline") {
    return false;
  }
  const fill = resolveColor(effectiveFill);
  const background = resolveColor(canvas);
  if (fill !== null && background !== null) {
    return !areMindMapRenderedColorsEqual(
      compositeMindMapColors(fill, background),
      background,
    );
  }
  return !areMindMapThemeColorsEqual(effectiveFill, canvas);
}

function resolveLiteralThemeColor(
  color: MindMapThemeColor,
): MindMapRgbaColor | null {
  return color.kind === "literal"
    ? parseMindMapCssColor(color.value)
    : null;
}

function areMindMapThemeColorsEqual(
  left: MindMapThemeColor,
  right: MindMapThemeColor,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "host") {
    return right.kind === "host" && left.token === right.token;
  }
  return right.kind === "literal" && left.value === right.value;
}

export interface MindMapNodeTypography {
  readonly fontFamilyToken?: string;
  readonly fontSize?: number;
  readonly fontWeight?: number;
  readonly lineHeight?: number;
  readonly italic?: boolean;
}

export interface MindMapRichTextRun {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly code?: boolean;
  readonly strike?: boolean;
  readonly color?: MindMapThemeColor;
}

/**
 * Safe renderer-neutral rich text. It contains text runs only—never raw HTML,
 * CSS, image URLs, or executable callbacks.
 */
export interface MindMapNodeContent {
  readonly plainText: string;
  readonly runs: readonly MindMapRichTextRun[];
}

/**
 * Sparse overrides for one node. Missing fields inherit from the active theme
 * and semantic role, so a theme does not need to materialize one object per
 * parsed node.
 */
export interface MindMapNodePresentation {
  readonly role?: MindMapNodeRole;
  readonly variant?: string;
  readonly shape?: MindMapNodeShape;
  readonly fill?: MindMapThemeColor;
  readonly stroke?: MindMapThemeColor;
  readonly textColor?: MindMapThemeColor;
  readonly borderWidth?: number;
  readonly radius?: number;
  readonly maxWidth?: number;
  readonly minHeight?: number;
  readonly paddingInline?: number;
  readonly paddingBlock?: number;
  readonly typography?: MindMapNodeTypography;
  readonly iconId?: string;
  readonly markerIds?: readonly string[];
  readonly branchColorIndex?: number;
  readonly content?: MindMapNodeContent;
}

export interface MindMapThemeRoleTokens {
  readonly root: MindMapNodePresentation;
  readonly mainTopic: MindMapNodePresentation;
  readonly subtopic: MindMapNodePresentation;
}

export type MindMapEdgeRouting =
  | "bezier"
  | "straight"
  | "orthogonal"
  | "rounded-orthogonal";
export type MindMapLineStyle = "solid" | "dashed" | "dotted";

/**
 * Sparse overrides for a tree edge. Edge keys are supplied by the scene/layout
 * adapter; the phase-one layout still derives edges from parent/child IDs.
 */
export interface MindMapEdgePresentation {
  readonly variant?: string;
  readonly color?: MindMapThemeColor;
  readonly width?: number;
  readonly routing?: MindMapEdgeRouting;
  readonly lineStyle?: MindMapLineStyle;
  readonly branchColorIndex?: number;
}

export interface MindMapDecorationBase {
  readonly id: string;
  readonly variant?: string;
}

export interface MindMapMarkerDecoration extends MindMapDecorationBase {
  readonly kind: "marker";
  readonly nodeId: string;
  readonly markerId: string;
  readonly label?: string;
}

export interface MindMapBoundaryDecoration extends MindMapDecorationBase {
  readonly kind: "boundary";
  readonly nodeIds: readonly string[];
  readonly label?: string;
}

export interface MindMapSummaryDecoration extends MindMapDecorationBase {
  readonly kind: "summary";
  readonly nodeIds: readonly string[];
  readonly text: string;
}

export interface MindMapRelationshipDecoration extends MindMapDecorationBase {
  readonly kind: "relationship";
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly label?: string;
}

/**
 * These decoration types describe future scene elements. The MVP parser does
 * not create them and the current renderer does not draw them.
 */
export type MindMapDecoration =
  | MindMapMarkerDecoration
  | MindMapBoundaryDecoration
  | MindMapSummaryDecoration
  | MindMapRelationshipDecoration;

/**
 * Immutable presentation snapshot passed alongside the parsed document.
 *
 * `nodes` and `edges` contain only per-element overrides; absence means theme
 * defaults. Keeping this separate from `MindMapNode` prevents visual choices
 * from contaminating Markdown parsing and source navigation.
 */
export interface MindMapPresentation {
  readonly revision: number;
  readonly layout: MindMapLayoutSpec;
  readonly theme: MindMapThemeSpec;
  readonly formatting: MindMapFormattingSpec;
  readonly nodes: ReadonlyMap<string, MindMapNodePresentation>;
  readonly edges: ReadonlyMap<string, MindMapEdgePresentation>;
  readonly decorations: readonly MindMapDecoration[];
}

/**
 * Renderer-independent viewport expressed in scene coordinates.
 *
 * A renderer combines this center point and scale with its current container
 * dimensions. This makes saved viewport state portable across resized tabs and
 * different DOM, SVG, or Canvas implementations.
 */
export interface MindMapViewportState {
  readonly centerX: number;
  readonly centerY: number;
  readonly scale: number;
}

export interface MindMapInteractionState {
  readonly collapsedNodeIds: ReadonlySet<string>;
  readonly selectedNodeIds: ReadonlySet<string>;
  readonly primarySelectedNodeId: string | null;
  readonly selectionAnchorNodeId: string | null;
  readonly focusedNodeId: string | null;
  readonly hoveredNodeId: string | null;
  /** Per-tab branch root used for drill-down; never persisted to Markdown. */
  readonly focusRootNodeId: string | null;
  /** Maximum descendant depth relative to the effective focus root. */
  readonly visibleDepthLimit: number | null;
  /** One transiently selected non-tree presentation element. */
  readonly selectedDecorationId: string | null;
  /** Whether the renderer-owned navigation minimap is visible for this tab. */
  readonly minimapVisible: boolean;
  readonly viewport: MindMapViewportState | null;
}

export type MindMapSelectionMode = "replace" | "add" | "toggle" | "range";

/**
 * Semantic renderer events contain no browser Event objects, keeping the
 * interaction contract usable by DOM, SVG, Canvas, and test renderers.
 */
export type MindMapInteractionEvent =
  | {
      readonly type: "node-select";
      readonly nodeId: string;
      readonly mode: MindMapSelectionMode;
    }
  | {
      readonly type: "nodes-select";
      readonly nodeIds: readonly string[];
      readonly mode: "replace" | "add";
      readonly primaryNodeId: string | null;
    }
  | ({
      readonly type: "topic-command-request";
    } & MindMapTopicCommandRequest)
  | {
      readonly type: "node-activate";
      readonly nodeId: string;
    }
  | {
      readonly type: "node-link-activate";
      readonly nodeId: string;
      readonly linkIndex: number;
    }
  | {
      readonly type: "node-toggle";
      readonly nodeId: string;
    }
  | {
      /** Explicit source mutation requested by a rendered task checkbox. */
      readonly type: "node-task-toggle";
      readonly nodeId: string;
      readonly sourceSnapshot: MindMapNodeEditSnapshot;
    }
  | {
      /**
       * One explicit structural source edit requested from a selected topic.
       * The host validates the immutable source snapshot before inserting.
       */
      readonly type: "node-create-request";
      readonly nodeId: string;
      readonly relation: "child" | "sibling";
      readonly sourceSnapshot: MindMapNodeEditSnapshot;
    }
  | {
      /**
       * One explicit branch move emitted only after pointer-up. Both source
       * anchors are immutable so duplicate labels and stale drags cannot be
       * rebound to whichever node currently occupies the same line.
       */
      readonly type: "node-move-request";
      readonly nodeId: string;
      readonly targetNodeId: string;
      readonly placement: NodeMovePlacement;
      readonly sourceSnapshot: MindMapNodeEditSnapshot;
      readonly targetSnapshot: MindMapNodeEditSnapshot;
    }
  | {
      readonly type: "node-focus";
      readonly nodeId: string | null;
    }
  | {
      readonly type: "node-hover";
      readonly nodeId: string | null;
    }
  | {
      /**
       * One explicit inline-edit commit. The host validates `expectedText`
       * and the captured source snapshot before changing the Markdown file.
       * A continuation is one compound user gesture: the host must await the
       * edit, obtain a fresh source snapshot, and only then create the node.
       */
      readonly type: "node-edit-commit";
      readonly nodeId: string;
      readonly expectedText: string;
      readonly sourceSnapshot: MindMapNodeEditSnapshot;
      readonly text: string;
      readonly continuation?: {
        readonly type: "create-node";
        readonly relation: "child" | "sibling";
      };
    }
  | {
      readonly type: "canvas-clear-selection";
    }
  | {
      /** Select one presentation decoration without mutating Markdown. */
      readonly type: "decoration-select";
      readonly decorationId: string;
    }
  | {
      readonly type: "viewport-change";
      readonly viewport: MindMapViewportState;
      readonly reason: "pan" | "zoom" | "fit" | "restore";
    };

export interface MindMapNodeVisualContext {
  readonly nodeId: string;
  readonly kind: MindMapNodeKind;
  readonly depth: number;
  readonly siblingIndex: number;
  readonly branchIndex: number;
  readonly hasChildren: boolean;
  readonly collapsed: boolean;
  readonly selected: boolean;
  readonly focused: boolean;
}

export interface MindMapThemeTokenOverrides {
  readonly colors?: Partial<MindMapThemeColorTokens>;
  readonly typography?: Partial<MindMapThemeTypographyTokens>;
  readonly node?: Partial<MindMapThemeNodeTokens>;
  readonly nodeTreatment?: MindMapNodeTreatmentTokens;
  readonly edge?: Partial<MindMapThemeEdgeTokens>;
  readonly effects?: Partial<MindMapThemeEffectTokens>;
  readonly branches?: Partial<MindMapThemeBranchTokens>;
  readonly roles?: Partial<MindMapThemeRoleTokens>;
}

export interface MindMapStyleTokenOverrides {
  readonly typography?: Partial<MindMapThemeTypographyTokens>;
  readonly node?: Partial<MindMapThemeNodeTokens>;
  readonly nodeTreatment?: MindMapNodeTreatmentTokens;
  readonly edge?: Partial<MindMapThemeEdgeTokens>;
  readonly effects?: Partial<MindMapThemeEffectTokens>;
  readonly branches?: Partial<MindMapThemeBranchTokens>;
  readonly roles?: Partial<MindMapStyleRoleTokens>;
}

export interface MindMapStyleSpecOptions {
  readonly id?: string;
  readonly label?: string;
  readonly revision?: string | number;
  readonly tokens?: MindMapStyleTokenOverrides;
}

export interface MindMapPaletteSpecOptions {
  readonly id?: string;
  readonly label?: string;
  readonly revision?: string | number;
  readonly colors?: Partial<MindMapThemeColorTokens>;
  readonly roles?: Partial<MindMapPaletteRoleTokens>;
  readonly lightColors?: Partial<MindMapThemeColorTokens>;
  readonly lightRoles?: Partial<MindMapPaletteRoleTokens>;
}

export interface MindMapThemeSpecOptions {
  readonly id?: string;
  readonly label?: string;
  readonly styleId?: string;
  readonly paletteId?: string;
  readonly styleRevision?: string | number;
  readonly paletteRevision?: string | number;
  readonly revision?: string | number;
  readonly tokens?: MindMapThemeTokenOverrides;
}

export interface MindMapLayoutSpecOptions {
  readonly revision?: string | number;
  readonly engineId?: string;
  readonly orientation?: MindMapLayoutOrientation;
  readonly spacing?: Partial<MindMapLayoutSpacing>;
  readonly options?: Readonly<Record<string, unknown>>;
}

const DEFAULT_LAYOUT_SPACING: MindMapLayoutSpacing = {
  level: 72,
  sibling: 24,
  subtree: 24,
};

const DEFAULT_THEME_COLORS: MindMapThemeColorTokens = {
  canvas: hostColor("background-primary"),
  surface: hostColor("background-secondary"),
  surfaceEmphasis: hostColor("interactive-accent"),
  surfaceHover: hostColor("background-modifier-hover"),
  text: hostColor("text-normal"),
  textOnAccent: hostColor("text-on-accent"),
  textMuted: hostColor("text-muted"),
  border: hostColor("background-modifier-border"),
  borderHover: hostColor("background-modifier-border-hover"),
  accent: hostColor("interactive-accent"),
  edge: hostColor("text-faint"),
  selection: hostColor("background-modifier-border-focus"),
  branchPalette: [
    hostColor("color-blue"),
    hostColor("color-green"),
    hostColor("color-orange"),
    hostColor("color-purple"),
    hostColor("color-red"),
  ],
};

const DEFAULT_THEME_TYPOGRAPHY: MindMapThemeTypographyTokens = {
  fontFamilyToken: "font-interface",
  fontSize: 13,
  rootFontSize: 13,
  fontWeight: 400,
  rootFontWeight: 600,
  lineHeight: 1.3,
};

const DEFAULT_THEME_NODE: MindMapThemeNodeTokens = {
  maxWidth: 240,
  minHeight: 34,
  paddingInline: 8,
  paddingBlock: 4,
  borderWidth: 1,
  radius: 4,
};

const DEFAULT_THEME_EDGE: MindMapThemeEdgeTokens = {
  width: 1.5,
  connectorProfile: { kind: "uniform" },
  routing: "bezier",
  lineStyle: "solid",
};

const DEFAULT_THEME_EFFECTS: MindMapThemeEffectTokens = {
  canvasTexture: null,
  nodeStroke: null,
  nodeFill: null,
  edgeStroke: null,
  terminalMarker: null,
};

const DEFAULT_THEME_BRANCHES: MindMapThemeBranchTokens = {
  mode: "none",
  colorNodeFill: false,
  colorNodeStroke: false,
  colorNodeText: false,
  colorEdgeStroke: false,
};

const DEFAULT_THEME_ROLES: MindMapThemeRoleTokens = {
  root: {
    role: "root",
    fill: hostColor("interactive-accent"),
    stroke: hostColor("interactive-accent"),
    textColor: hostColor("text-on-accent"),
    typography: {
      fontWeight: 600,
    },
  },
  mainTopic: {
    role: "main-topic",
    typography: {
      fontWeight: 500,
    },
  },
  subtopic: {
    role: "subtopic",
  },
};

const DEFAULT_STYLE_ROLES: MindMapStyleRoleTokens = {
  root: {
    role: "root",
    typography: {
      fontWeight: 600,
    },
  },
  mainTopic: {
    role: "main-topic",
    typography: {
      fontWeight: 500,
    },
  },
  subtopic: {
    role: "subtopic",
  },
};

const DEFAULT_PALETTE_ROLES: MindMapPaletteRoleTokens = {
  root: {
    fill: hostColor("interactive-accent"),
    stroke: hostColor("interactive-accent"),
    textColor: hostColor("text-on-accent"),
  },
  mainTopic: {},
  subtopic: {},
};

export function hostColor(token: string): MindMapThemeColor {
  if (!isSafeHostColorToken(token)) {
    throw new Error(`Invalid host color token "${token}".`);
  }
  return {
    kind: "host",
    token,
  };
}

export function literalColor(value: string): MindMapThemeColor {
  if (!isSafeLiteralColor(value)) {
    throw new Error(`Invalid literal theme color "${value}".`);
  }
  return {
    kind: "literal",
    value,
  };
}

/**
 * Theme colors are deliberately limited to color syntax. In particular,
 * `url(...)` is rejected so loading a local theme cannot introduce network
 * access through CSS.
 */
export function isSafeLiteralColor(value: string): boolean {
  const color = value.trim();
  if (color.length === 0 || /[;{}@\\]/.test(color) || /url\s*\(/i.test(color)) {
    return false;
  }

  return (
    /^#[\da-f]{3,8}$/i.test(color) ||
    /^[a-z]+$/i.test(color) ||
    /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\([^{};]*\)$/i.test(
      color,
    )
  );
}

export function isSafeHostColorToken(token: string): boolean {
  return /^[a-z][a-z0-9-]*$/i.test(token);
}

export function createMindMapRenderEffectRef(
  profileId: string,
  options: Readonly<Record<string, MindMapRenderEffectOption>> = {},
): MindMapRenderEffectRef {
  if (!isSafeRenderEffectProfileId(profileId)) {
    throw new Error(`Invalid render-effect profile ID "${profileId}".`);
  }

  const safeOptions: Record<string, MindMapRenderEffectOption> = {};
  for (const [key, value] of Object.entries(options)) {
    if (!isSafeRenderEffectOptionKey(key) || !isSafeRenderEffectOption(value)) {
      throw new Error(`Invalid option "${key}" for render effect "${profileId}".`);
    }
    safeOptions[key] = value;
  }

  return {
    profileId,
    options: safeOptions,
  };
}

export function isSafeRenderEffectProfileId(profileId: string): boolean {
  return /^[a-z][a-z0-9-]*$/i.test(profileId);
}

function isSafeRenderEffectOptionKey(key: string): boolean {
  return /^[a-z][a-z0-9-]*$/i.test(key);
}

function isSafeRenderEffectOption(value: MindMapRenderEffectOption): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "boolean") {
    return true;
  }

  return /^[a-z0-9][a-z0-9._-]*$/i.test(value);
}

export function createDefaultMindMapLayoutSpec(
  directionOrOptions: LayoutDirection | MindMapLayoutSpecOptions =
    "left-to-right",
): MindMapLayoutSpec {
  const options =
    typeof directionOrOptions === "string"
      ? { orientation: directionOrOptions }
      : directionOrOptions;

  return {
    revision: options.revision ?? 1,
    engineId: options.engineId ?? "tree",
    orientation: options.orientation ?? "left-to-right",
    spacing: {
      ...DEFAULT_LAYOUT_SPACING,
      ...options.spacing,
    },
    options: {
      ...options.options,
    },
  };
}

export function createDefaultMindMapThemeSpec(
  options: MindMapThemeSpecOptions = {},
): MindMapThemeSpec {
  const id = options.id ?? "obsidian-native";
  return {
    id,
    label: options.label ?? "Obsidian native",
    styleId: options.styleId ?? id,
    paletteId: options.paletteId ?? id,
    styleRevision: options.styleRevision ?? options.revision ?? 1,
    paletteRevision: options.paletteRevision ?? options.revision ?? 1,
    revision: options.revision ?? 1,
    tokens: {
      colors: {
        ...DEFAULT_THEME_COLORS,
        ...options.tokens?.colors,
      },
      typography: {
        ...DEFAULT_THEME_TYPOGRAPHY,
        ...options.tokens?.typography,
      },
      node: {
        ...DEFAULT_THEME_NODE,
        ...options.tokens?.node,
      },
      nodeTreatment: cloneMindMapNodeTreatmentTokens(
        options.tokens?.nodeTreatment,
      ),
      edge: {
        ...DEFAULT_THEME_EDGE,
        ...options.tokens?.edge,
        connectorProfile: cloneMindMapConnectorStrokeProfile(
          options.tokens?.edge?.connectorProfile ??
            DEFAULT_THEME_EDGE.connectorProfile,
        ),
      },
      effects: {
        ...DEFAULT_THEME_EFFECTS,
        ...options.tokens?.effects,
      },
      branches: {
        ...DEFAULT_THEME_BRANCHES,
        ...options.tokens?.branches,
      },
      roles: {
        root: mergeNodePresentation(
          DEFAULT_THEME_ROLES.root,
          options.tokens?.roles?.root,
        ),
        mainTopic: mergeNodePresentation(
          DEFAULT_THEME_ROLES.mainTopic,
          options.tokens?.roles?.mainTopic,
        ),
        subtopic: mergeNodePresentation(
          DEFAULT_THEME_ROLES.subtopic,
          options.tokens?.roles?.subtopic,
        ),
      },
    },
  };
}

export function createDefaultMindMapStyleSpec(
  options: MindMapStyleSpecOptions = {},
): MindMapStyleSpec {
  return {
    id: options.id ?? "obsidian-native",
    label: options.label ?? "Obsidian native",
    revision: options.revision ?? 1,
    tokens: {
      typography: {
        ...DEFAULT_THEME_TYPOGRAPHY,
        ...options.tokens?.typography,
      },
      node: {
        ...DEFAULT_THEME_NODE,
        ...options.tokens?.node,
      },
      nodeTreatment: cloneMindMapNodeTreatmentTokens(
        options.tokens?.nodeTreatment,
      ),
      edge: {
        ...DEFAULT_THEME_EDGE,
        ...options.tokens?.edge,
        connectorProfile: cloneMindMapConnectorStrokeProfile(
          options.tokens?.edge?.connectorProfile ??
            DEFAULT_THEME_EDGE.connectorProfile,
        ),
      },
      effects: {
        ...DEFAULT_THEME_EFFECTS,
        ...options.tokens?.effects,
      },
      branches: {
        ...DEFAULT_THEME_BRANCHES,
        ...options.tokens?.branches,
      },
      roles: {
        root: mergeNodeStylePresentation(
          DEFAULT_STYLE_ROLES.root,
          options.tokens?.roles?.root,
        ),
        mainTopic: mergeNodeStylePresentation(
          DEFAULT_STYLE_ROLES.mainTopic,
          options.tokens?.roles?.mainTopic,
        ),
        subtopic: mergeNodeStylePresentation(
          DEFAULT_STYLE_ROLES.subtopic,
          options.tokens?.roles?.subtopic,
        ),
      },
    },
  };
}

export function createDefaultMindMapPaletteSpec(
  options: MindMapPaletteSpecOptions = {},
): MindMapPaletteSpec {
  return {
    id: options.id ?? "obsidian-native",
    label: options.label ?? "Obsidian native",
    revision: options.revision ?? 1,
    colors: {
      ...DEFAULT_THEME_COLORS,
      ...options.colors,
      branchPalette:
        options.colors?.branchPalette === undefined
          ? [...DEFAULT_THEME_COLORS.branchPalette]
          : [...options.colors.branchPalette],
    },
    roles: {
      root: {
        ...DEFAULT_PALETTE_ROLES.root,
        ...options.roles?.root,
      },
      mainTopic: {
        ...DEFAULT_PALETTE_ROLES.mainTopic,
        ...options.roles?.mainTopic,
      },
      subtopic: {
        ...DEFAULT_PALETTE_ROLES.subtopic,
        ...options.roles?.subtopic,
      },
    },
    ...(options.lightColors === undefined
      ? {}
      : { lightColors: { ...options.lightColors } }),
    ...(options.lightRoles === undefined
      ? {}
      : {
          lightRoles: {
            ...(options.lightRoles.root === undefined
              ? {}
              : { root: { ...options.lightRoles.root } }),
            ...(options.lightRoles.mainTopic === undefined
              ? {}
              : { mainTopic: { ...options.lightRoles.mainTopic } }),
            ...(options.lightRoles.subtopic === undefined
              ? {}
              : { subtopic: { ...options.lightRoles.subtopic } }),
          },
        }),
  };
}

/**
 * Compose one registered style and one registered palette into the immutable
 * effective snapshot consumed by renderers. This is the only place where the
 * two independent extension axes are joined.
 */
export function composeMindMapTheme(
  style: MindMapStyleSpec,
  palette: MindMapPaletteSpec,
): MindMapThemeSpec {
  return {
    id: `${style.id}--${palette.id}`,
    label:
      style.label === palette.label
        ? style.label
        : `${style.label} / ${palette.label}`,
    styleId: style.id,
    paletteId: palette.id,
    styleRevision: style.revision,
    paletteRevision: palette.revision,
    revision: `${String(style.revision)}|${String(palette.revision)}`,
    tokens: {
      colors: {
        ...palette.colors,
        branchPalette: [...palette.colors.branchPalette],
      },
      typography: { ...style.tokens.typography },
      node: { ...style.tokens.node },
      nodeTreatment: cloneMindMapNodeTreatmentTokens(
        style.tokens.nodeTreatment,
      ),
      edge: {
        ...style.tokens.edge,
        connectorProfile: cloneMindMapConnectorStrokeProfile(
          style.tokens.edge.connectorProfile,
        ),
      },
      effects: {
        ...style.tokens.effects,
        terminalMarker:
          style.tokens.effects.terminalMarker === null
            ? null
            : {
                ...style.tokens.effects.terminalMarker,
                effect: {
                  ...style.tokens.effects.terminalMarker.effect,
                  options: {
                    ...style.tokens.effects.terminalMarker.effect.options,
                  },
                },
              },
      },
      branches: { ...style.tokens.branches },
      roles: {
        root: mergeStyleAndPaletteRole(
          style.tokens.roles.root,
          palette.roles.root,
        ),
        mainTopic: mergeStyleAndPaletteRole(
          style.tokens.roles.mainTopic,
          palette.roles.mainTopic,
        ),
        subtopic: mergeStyleAndPaletteRole(
          style.tokens.roles.subtopic,
          palette.roles.subtopic,
        ),
      },
    },
    ...(palette.lightColors === undefined
      ? {}
      : { lightColors: { ...palette.lightColors } }),
    ...(palette.lightRoles === undefined
      ? {}
      : {
          lightRoles: {
            ...(palette.lightRoles.root === undefined
              ? {}
              : { root: { ...palette.lightRoles.root } }),
            ...(palette.lightRoles.mainTopic === undefined
              ? {}
              : { mainTopic: { ...palette.lightRoles.mainTopic } }),
            ...(palette.lightRoles.subtopic === undefined
              ? {}
              : { subtopic: { ...palette.lightRoles.subtopic } }),
          },
        }),
  };
}

function mergeStyleAndPaletteRole(
  style: MindMapNodeStylePresentation,
  colors: MindMapPaletteNodeColors,
): MindMapNodePresentation {
  return {
    ...style,
    ...colors,
    typography:
      style.typography === undefined
        ? undefined
        : { ...style.typography },
    markerIds:
      style.markerIds === undefined ? undefined : [...style.markerIds],
  };
}

function mergeRoleColorOverrides(
  role: MindMapNodePresentation,
  colors: MindMapPaletteNodeColors | undefined,
): MindMapNodePresentation {
  return colors === undefined ? role : { ...role, ...colors };
}

function mergeNodePresentation(
  base: MindMapNodePresentation,
  override: MindMapNodePresentation | undefined,
): MindMapNodePresentation {
  return {
    ...base,
    ...override,
    typography:
      base.typography === undefined && override?.typography === undefined
        ? undefined
        : {
            ...base.typography,
            ...override?.typography,
          },
  };
}

function mergeNodeStylePresentation(
  base: MindMapNodeStylePresentation,
  override: MindMapNodeStylePresentation | undefined,
): MindMapNodeStylePresentation {
  return {
    ...base,
    ...override,
    typography:
      base.typography === undefined && override?.typography === undefined
        ? undefined
        : {
            ...base.typography,
            ...override?.typography,
          },
    markerIds:
      override?.markerIds === undefined
        ? base.markerIds === undefined
          ? undefined
          : [...base.markerIds]
        : [...override.markerIds],
  };
}

export function createDefaultMindMapPresentation(
  direction: LayoutDirection,
): MindMapPresentation {
  return {
    revision: 1,
    layout: createDefaultMindMapLayoutSpec(direction),
    theme: createDefaultMindMapThemeSpec(),
    formatting: {
      fontFamily: {
        id: DEFAULT_MIND_MAP_GLOBAL_FONT_ID,
        label: "Style default",
        revision: 1,
        fontFamilyToken: null,
      },
      connectorWidth: {
        id: DEFAULT_MIND_MAP_CONNECTOR_WIDTH_ID,
        label: "Style default",
        revision: 1,
        width: null,
      },
      connectorProfile: {
        id: DEFAULT_MIND_MAP_CONNECTOR_PROFILE_ID,
        label: "Style default",
        revision: 1,
        profile: null,
      },
    },
    nodes: new Map(),
    edges: new Map(),
    decorations: [],
  };
}

export function createDefaultMindMapViewportState(): MindMapViewportState {
  return {
    centerX: 0,
    centerY: 0,
    scale: 1,
  };
}

export function createDefaultMindMapInteractionState(): MindMapInteractionState {
  return {
    collapsedNodeIds: new Set(),
    selectedNodeIds: new Set(),
    primarySelectedNodeId: null,
    selectionAnchorNodeId: null,
    focusedNodeId: null,
    hoveredNodeId: null,
    focusRootNodeId: null,
    visibleDepthLimit: null,
    selectedDecorationId: null,
    minimapVisible: false,
    viewport: null,
  };
}

export function createRootBranchColorIndexMap(
  root: MindMapNode,
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  const assign = (node: MindMapNode, branchIndex: number): void => {
    result.set(node.id, branchIndex);
    for (const child of node.children) {
      assign(child, branchIndex);
    }
  };

  root.children.forEach((child, branchIndex) => {
    assign(child, branchIndex);
  });
  return result;
}
