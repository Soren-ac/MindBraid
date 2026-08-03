import {
  hostColor,
  literalColor,
  type MindMapConnectorStrokeProfile,
  type MindMapEdgeRouting,
  type MindMapLineStyle,
  type MindMapNodeShape,
  type MindMapNodeStylePresentation,
  type MindMapPaletteNodeColors,
  type MindMapPaletteRoleTokens,
  type MindMapPaletteSpec,
  type MindMapRenderEffectRef,
  type MindMapStyleRoleTokens,
  type MindMapStyleSpec,
  type MindMapStyleTokens,
  type MindMapThemeBranchTokens,
  type MindMapThemeColor,
  type MindMapThemeColorTokens,
  type MindMapThemeEdgeTokens,
  type MindMapThemeEffectTokens,
  type MindMapThemeNodeTokens,
  type MindMapThemeTerminalMarker,
  type MindMapThemeTypographyTokens,
} from "./presentation";
import type {
  MindMapPresentationLibraryEntryKind,
  MindMapPresentationLibraryEntryRevision,
  MindMapPresentationLibraryPaletteDefinition,
  MindMapPresentationLibraryStyleDefinition,
} from "./presentation-library";

const LITERAL_HEX_COLOR = /^#[\da-f]{3,4}(?:[\da-f]{3,4})?$/i;

const STYLE_ROLES = ["root", "mainTopic", "subtopic"] as const;
const PALETTE_CORE_COLORS = [
  "canvas",
  "surface",
  "surfaceEmphasis",
  "surfaceHover",
  "text",
  "textOnAccent",
  "textMuted",
  "border",
  "borderHover",
  "accent",
  "edge",
  "selection",
] as const;
const PALETTE_ROLE_COLOR_CHANNELS = ["fill", "stroke", "textColor"] as const;

/** The three style role slots have property names rather than node-role IDs. */
export type MindMapPresentationLibraryStyleRole =
  (typeof STYLE_ROLES)[number];

/** A palette's base/light semantic colors, excluding its branch-color array. */
export type MindMapPresentationLibraryPaletteCoreColor =
  (typeof PALETTE_CORE_COLORS)[number];

export type MindMapPresentationLibraryPaletteColorTarget = "base" | "light";

export type MindMapPresentationLibraryPaletteRole =
  MindMapPresentationLibraryStyleRole;

export type MindMapPresentationLibraryPaletteRoleColorChannel =
  (typeof PALETTE_ROLE_COLOR_CHANNELS)[number];

/**
 * A detached, renderer-neutral style editing snapshot. It intentionally has
 * no ID or revision: those are owned by the presentation library on save.
 */
export interface MindMapPresentationLibraryStyleDraft {
  readonly label: string;
  readonly tokens: MindMapStyleTokens;
}

/**
 * A detached, color-only palette editing snapshot. `lightOverridesEnabled`
 * records the explicit editor toggle even when it currently has no values.
 */
export interface MindMapPresentationLibraryPaletteDraft {
  readonly label: string;
  readonly colors: MindMapThemeColorTokens;
  readonly roles: MindMapPaletteRoleTokens;
  readonly lightOverridesEnabled: boolean;
  readonly lightColors?: Partial<MindMapThemeColorTokens>;
  readonly lightRoles?: Partial<MindMapPaletteRoleTokens>;
}

/**
 * A dirty draft whose base revision no longer matches the active library.
 * Frontends decide how to present recovery, but the core never overwrites the
 * draft or retries it implicitly.
 */
export interface MindMapPresentationLibraryDraftConflict {
  readonly entryKind: MindMapPresentationLibraryEntryKind;
  readonly entryId: string;
  readonly baseRevision: MindMapPresentationLibraryEntryRevision;
  readonly authoritativeRevision: MindMapPresentationLibraryEntryRevision;
}

export interface MindMapPresentationLibraryStyleDraftState {
  readonly styleId: string;
  readonly revision: MindMapPresentationLibraryEntryRevision;
  readonly draft: MindMapPresentationLibraryStyleDraft;
  readonly isDirty: boolean;
  readonly conflict: MindMapPresentationLibraryDraftConflict | null;
}

export interface MindMapPresentationLibraryPaletteDraftState {
  readonly paletteId: string;
  readonly revision: MindMapPresentationLibraryEntryRevision;
  readonly draft: MindMapPresentationLibraryPaletteDraft;
  readonly isDirty: boolean;
  readonly conflict: MindMapPresentationLibraryDraftConflict | null;
}

/** Semantic edits allowed by the custom Style editor. */
export type MindMapPresentationLibraryStyleDraftChange =
  | {
      readonly type: "set-label";
      readonly label: string;
    }
  | {
      readonly type: "set-role-shape";
      readonly role: MindMapPresentationLibraryStyleRole;
      readonly shape: MindMapNodeShape;
    }
  | {
      readonly type: "set-role-radius";
      readonly role: MindMapPresentationLibraryStyleRole;
      readonly radius: number;
    }
  | {
      readonly type: "set-role-max-width";
      readonly role: MindMapPresentationLibraryStyleRole;
      readonly maxWidth: number;
    }
  | {
      readonly type: "set-role-font-size";
      readonly role: MindMapPresentationLibraryStyleRole;
      readonly fontSize: number;
    }
  | {
      readonly type: "set-node-max-width";
      readonly maxWidth: number;
    }
  | {
      readonly type: "set-node-padding";
      readonly paddingInline: number;
      readonly paddingBlock: number;
    }
  | {
      readonly type: "set-edge-routing";
      readonly routing: MindMapEdgeRouting;
    }
  | {
      readonly type: "set-edge-line-style";
      readonly lineStyle: MindMapLineStyle;
    }
  | {
      readonly type: "set-edge-width";
      readonly width: number;
    };

/** Semantic edits allowed by the custom Palette editor. */
export type MindMapPresentationLibraryPaletteDraftChange =
  | {
      readonly type: "set-label";
      readonly label: string;
    }
  | {
      readonly type: "set-core-color";
      readonly target: MindMapPresentationLibraryPaletteColorTarget;
      readonly color: MindMapPresentationLibraryPaletteCoreColor;
      /** A literal hexadecimal color such as `#abc` or `#123456`. */
      readonly value: string;
    }
  | {
      readonly type: "set-role-color";
      readonly target: MindMapPresentationLibraryPaletteColorTarget;
      readonly role: MindMapPresentationLibraryPaletteRole;
      readonly channel: MindMapPresentationLibraryPaletteRoleColorChannel;
      /** A literal hexadecimal color such as `#abc` or `#123456`. */
      readonly value: string;
    }
  | {
      readonly type: "set-branch-color";
      readonly target: MindMapPresentationLibraryPaletteColorTarget;
      readonly index: number;
      /** A literal hexadecimal color such as `#abc` or `#123456`. */
      readonly value: string;
    }
  | {
      readonly type: "set-light-overrides-enabled";
      readonly enabled: boolean;
    };

/** Creates a detached immutable-by-convention draft from one Style spec. */
export function createMindMapPresentationLibraryStyleDraft(
  style: MindMapStyleSpec,
): MindMapPresentationLibraryStyleDraft {
  return {
    label: style.label,
    tokens: cloneStyleTokens(style.tokens),
  };
}

/** Creates a detached immutable-by-convention draft from one Palette spec. */
export function createMindMapPresentationLibraryPaletteDraft(
  palette: MindMapPaletteSpec,
): MindMapPresentationLibraryPaletteDraft {
  const lightColors = cloneLightColors(palette.lightColors);
  const lightRoles = cloneLightRoles(palette.lightRoles);
  return {
    label: palette.label,
    colors: cloneColorTokens(palette.colors),
    roles: clonePaletteRoles(palette.roles),
    lightOverridesEnabled:
      palette.lightColors !== undefined || palette.lightRoles !== undefined,
    ...(lightColors === undefined ? {} : { lightColors }),
    ...(lightRoles === undefined ? {} : { lightRoles }),
  };
}

export function createMindMapPresentationLibraryStyleDraftState(
  style: MindMapStyleSpec,
): MindMapPresentationLibraryStyleDraftState {
  return {
    styleId: style.id,
    revision: style.revision,
    draft: createMindMapPresentationLibraryStyleDraft(style),
    isDirty: false,
    conflict: null,
  };
}

export function createMindMapPresentationLibraryPaletteDraftState(
  palette: MindMapPaletteSpec,
): MindMapPresentationLibraryPaletteDraftState {
  return {
    paletteId: palette.id,
    revision: palette.revision,
    draft: createMindMapPresentationLibraryPaletteDraft(palette),
    isDirty: false,
    conflict: null,
  };
}

/**
 * Reconciles an authoritative Style with one local draft. Matching content at
 * a newer revision acknowledges a completed save; divergent dirty content is
 * retained as an explicit conflict instead of being silently replaced.
 */
export function reconcileMindMapPresentationLibraryStyleDraftState(
  current: MindMapPresentationLibraryStyleDraftState | null,
  style: MindMapStyleSpec,
): MindMapPresentationLibraryStyleDraftState {
  if (current === null || current.styleId !== style.id) {
    return createMindMapPresentationLibraryStyleDraftState(style);
  }
  if (current.revision === style.revision) {
    return current.conflict === null
      ? current
      : { ...current, conflict: null };
  }
  if (
    !current.isDirty ||
    presentationLibraryValuesEqual(
      toMindMapPresentationLibraryStyleDefinition(current.draft),
      toMindMapPresentationLibraryStyleDefinition(
        createMindMapPresentationLibraryStyleDraft(style),
      ),
    )
  ) {
    return createMindMapPresentationLibraryStyleDraftState(style);
  }
  return {
    ...current,
    conflict: createMindMapPresentationLibraryDraftConflict(
      "style",
      style.id,
      current.revision,
      style.revision,
    ),
  };
}

/** Palette equivalent of Style draft reconciliation; colors remain isolated. */
export function reconcileMindMapPresentationLibraryPaletteDraftState(
  current: MindMapPresentationLibraryPaletteDraftState | null,
  palette: MindMapPaletteSpec,
): MindMapPresentationLibraryPaletteDraftState {
  if (current === null || current.paletteId !== palette.id) {
    return createMindMapPresentationLibraryPaletteDraftState(palette);
  }
  if (current.revision === palette.revision) {
    return current.conflict === null
      ? current
      : { ...current, conflict: null };
  }
  if (
    !current.isDirty ||
    presentationLibraryValuesEqual(
      toMindMapPresentationLibraryPaletteDefinition(current.draft),
      toMindMapPresentationLibraryPaletteDefinition(
        createMindMapPresentationLibraryPaletteDraft(palette),
      ),
    )
  ) {
    return createMindMapPresentationLibraryPaletteDraftState(palette);
  }
  return {
    ...current,
    conflict: createMindMapPresentationLibraryDraftConflict(
      "palette",
      palette.id,
      current.revision,
      palette.revision,
    ),
  };
}

/** Applies one explicit, color-free Style edit without mutating the draft. */
export function applyMindMapPresentationLibraryStyleDraftChange(
  draft: MindMapPresentationLibraryStyleDraft,
  change: MindMapPresentationLibraryStyleDraftChange,
): MindMapPresentationLibraryStyleDraft {
  switch (change.type) {
    case "set-label":
      assertString(change.label, "Style label");
      return {
        label: change.label,
        tokens: cloneStyleTokens(draft.tokens),
      };
    case "set-role-shape": {
      assertStyleRole(change.role);
      assertNodeShape(change.shape);
      const tokens = cloneStyleTokens(draft.tokens);
      return withStyleRole(tokens, draft.label, change.role, {
        ...tokens.roles[change.role],
        shape: change.shape,
      });
    }
    case "set-role-radius": {
      assertStyleRole(change.role);
      assertFiniteNumber(change.radius, "Role radius");
      const tokens = cloneStyleTokens(draft.tokens);
      return withStyleRole(tokens, draft.label, change.role, {
        ...tokens.roles[change.role],
        radius: change.radius,
      });
    }
    case "set-role-max-width": {
      assertStyleRole(change.role);
      assertFiniteNumber(change.maxWidth, "Role maximum width");
      const tokens = cloneStyleTokens(draft.tokens);
      return withStyleRole(tokens, draft.label, change.role, {
        ...tokens.roles[change.role],
        maxWidth: change.maxWidth,
      });
    }
    case "set-role-font-size": {
      assertStyleRole(change.role);
      assertFiniteNumber(change.fontSize, "Role font size");
      const tokens = cloneStyleTokens(draft.tokens);
      const role = tokens.roles[change.role];
      return withStyleRole(tokens, draft.label, change.role, {
        ...role,
        typography: {
          ...role.typography,
          fontSize: change.fontSize,
        },
      });
    }
    case "set-node-max-width": {
      assertFiniteNumber(change.maxWidth, "Node maximum width");
      const tokens = cloneStyleTokens(draft.tokens);
      return {
        label: draft.label,
        tokens: {
          ...tokens,
          node: {
            ...tokens.node,
            maxWidth: change.maxWidth,
          },
        },
      };
    }
    case "set-node-padding": {
      assertFiniteNumber(change.paddingInline, "Node inline padding");
      assertFiniteNumber(change.paddingBlock, "Node block padding");
      const tokens = cloneStyleTokens(draft.tokens);
      return {
        label: draft.label,
        tokens: {
          ...tokens,
          node: {
            ...tokens.node,
            paddingInline: change.paddingInline,
            paddingBlock: change.paddingBlock,
          },
        },
      };
    }
    case "set-edge-routing": {
      assertEdgeRouting(change.routing);
      const tokens = cloneStyleTokens(draft.tokens);
      return {
        label: draft.label,
        tokens: {
          ...tokens,
          edge: {
            ...tokens.edge,
            routing: change.routing,
          },
        },
      };
    }
    case "set-edge-line-style": {
      assertLineStyle(change.lineStyle);
      const tokens = cloneStyleTokens(draft.tokens);
      return {
        label: draft.label,
        tokens: {
          ...tokens,
          edge: {
            ...tokens.edge,
            lineStyle: change.lineStyle,
          },
        },
      };
    }
    case "set-edge-width": {
      assertFiniteNumber(change.width, "Edge width");
      const tokens = cloneStyleTokens(draft.tokens);
      return {
        label: draft.label,
        tokens: {
          ...tokens,
          edge: {
            ...tokens.edge,
            width: change.width,
          },
        },
      };
    }
  }
}

/**
 * Applies one explicit Palette edit without mutating the draft. Palette input
 * is intentionally restricted to literal hexadecimal colors; host tokens,
 * CSS syntax, and URLs cannot enter through an editor change.
 */
export function applyMindMapPresentationLibraryPaletteDraftChange(
  draft: MindMapPresentationLibraryPaletteDraft,
  change: MindMapPresentationLibraryPaletteDraftChange,
): MindMapPresentationLibraryPaletteDraft {
  switch (change.type) {
    case "set-label":
      assertString(change.label, "Palette label");
      return clonePaletteDraft({ ...draft, label: change.label });
    case "set-light-overrides-enabled": {
      if (typeof change.enabled !== "boolean") {
        throw new TypeError("Light overrides enabled must be a boolean.");
      }
      const next = clonePaletteDraft(draft);
      if (!change.enabled) {
        return {
          label: next.label,
          colors: next.colors,
          roles: next.roles,
          lightOverridesEnabled: false,
        };
      }
      return {
        ...next,
        lightOverridesEnabled: true,
        lightColors: next.lightColors ?? {},
      };
    }
    case "set-core-color": {
      assertPaletteColorTarget(change.target);
      assertPaletteCoreColor(change.color);
      const color = literalHexColor(change.value);
      const next = clonePaletteDraft(draft);
      if (change.target === "base") {
        return {
          ...next,
          colors: replaceCoreColor(next.colors, change.color, color),
        };
      }
      assertLightOverridesEnabled(next);
      return {
        ...next,
        lightColors: replaceLightCoreColor(
          next.lightColors ?? {},
          change.color,
          color,
        ),
      };
    }
    case "set-role-color": {
      assertPaletteColorTarget(change.target);
      assertStyleRole(change.role);
      assertPaletteRoleColorChannel(change.channel);
      const color = literalHexColor(change.value);
      const next = clonePaletteDraft(draft);
      if (change.target === "base") {
        return {
          ...next,
          roles: replacePaletteRoleColor(
            next.roles,
            change.role,
            change.channel,
            color,
          ),
        };
      }
      assertLightOverridesEnabled(next);
      const lightRoles = next.lightRoles ?? {};
      return {
        ...next,
        lightRoles: replaceLightPaletteRoleColor(
          lightRoles,
          change.role,
          change.channel,
          color,
        ),
      };
    }
    case "set-branch-color": {
      assertPaletteColorTarget(change.target);
      assertBranchColorIndex(change.index);
      const color = literalHexColor(change.value);
      const next = clonePaletteDraft(draft);
      if (change.target === "base") {
        return {
          ...next,
          colors: {
            ...next.colors,
            branchPalette: replaceBranchColor(
              next.colors.branchPalette,
              change.index,
              color,
            ),
          },
        };
      }
      assertLightOverridesEnabled(next);
      const branchPalette =
        next.lightColors?.branchPalette ?? next.colors.branchPalette;
      return {
        ...next,
        lightColors: {
          ...(next.lightColors ?? {}),
          branchPalette: replaceBranchColor(branchPalette, change.index, color),
        },
      };
    }
  }
}

/** Produces a fresh library-owned Style definition, without ID or revision. */
export function toMindMapPresentationLibraryStyleDefinition(
  draft: MindMapPresentationLibraryStyleDraft,
): MindMapPresentationLibraryStyleDefinition {
  return {
    label: draft.label,
    tokens: cloneStyleTokens(draft.tokens),
  };
}

/** Produces a fresh library-owned Palette definition, without ID or revision. */
export function toMindMapPresentationLibraryPaletteDefinition(
  draft: MindMapPresentationLibraryPaletteDraft,
): MindMapPresentationLibraryPaletteDefinition {
  const colors = cloneColorTokens(draft.colors);
  const roles = clonePaletteRoles(draft.roles);
  if (!draft.lightOverridesEnabled) {
    return {
      label: draft.label,
      colors,
      roles,
    };
  }

  const lightColors = cloneLightColors(draft.lightColors) ?? {};
  const lightRoles = cloneLightRoles(draft.lightRoles);
  return {
    label: draft.label,
    colors,
    roles,
    lightColors,
    ...(lightRoles === undefined ? {} : { lightRoles }),
  };
}

function withStyleRole(
  tokens: MindMapStyleTokens,
  label: string,
  role: MindMapPresentationLibraryStyleRole,
  updatedRole: MindMapNodeStylePresentation,
): MindMapPresentationLibraryStyleDraft {
  return {
    label,
    tokens: {
      ...tokens,
      roles: replaceStyleRole(tokens.roles, role, updatedRole),
    },
  };
}

function replaceStyleRole(
  roles: MindMapStyleRoleTokens,
  role: MindMapPresentationLibraryStyleRole,
  updatedRole: MindMapNodeStylePresentation,
): MindMapStyleRoleTokens {
  switch (role) {
    case "root":
      return { ...roles, root: updatedRole };
    case "mainTopic":
      return { ...roles, mainTopic: updatedRole };
    case "subtopic":
      return { ...roles, subtopic: updatedRole };
  }
}

function replaceCoreColor(
  colors: MindMapThemeColorTokens,
  key: MindMapPresentationLibraryPaletteCoreColor,
  value: MindMapThemeColor,
): MindMapThemeColorTokens {
  switch (key) {
    case "canvas":
      return { ...colors, canvas: value };
    case "surface":
      return { ...colors, surface: value };
    case "surfaceEmphasis":
      return { ...colors, surfaceEmphasis: value };
    case "surfaceHover":
      return { ...colors, surfaceHover: value };
    case "text":
      return { ...colors, text: value };
    case "textOnAccent":
      return { ...colors, textOnAccent: value };
    case "textMuted":
      return { ...colors, textMuted: value };
    case "border":
      return { ...colors, border: value };
    case "borderHover":
      return { ...colors, borderHover: value };
    case "accent":
      return { ...colors, accent: value };
    case "edge":
      return { ...colors, edge: value };
    case "selection":
      return { ...colors, selection: value };
  }
}

function replaceLightCoreColor(
  colors: Partial<MindMapThemeColorTokens>,
  key: MindMapPresentationLibraryPaletteCoreColor,
  value: MindMapThemeColor,
): Partial<MindMapThemeColorTokens> {
  switch (key) {
    case "canvas":
      return { ...colors, canvas: value };
    case "surface":
      return { ...colors, surface: value };
    case "surfaceEmphasis":
      return { ...colors, surfaceEmphasis: value };
    case "surfaceHover":
      return { ...colors, surfaceHover: value };
    case "text":
      return { ...colors, text: value };
    case "textOnAccent":
      return { ...colors, textOnAccent: value };
    case "textMuted":
      return { ...colors, textMuted: value };
    case "border":
      return { ...colors, border: value };
    case "borderHover":
      return { ...colors, borderHover: value };
    case "accent":
      return { ...colors, accent: value };
    case "edge":
      return { ...colors, edge: value };
    case "selection":
      return { ...colors, selection: value };
  }
}

function replacePaletteRoleColor(
  roles: MindMapPaletteRoleTokens,
  role: MindMapPresentationLibraryPaletteRole,
  channel: MindMapPresentationLibraryPaletteRoleColorChannel,
  color: MindMapThemeColor,
): MindMapPaletteRoleTokens {
  const updated = replacePaletteNodeColor(roles[role], channel, color);
  switch (role) {
    case "root":
      return { ...roles, root: updated };
    case "mainTopic":
      return { ...roles, mainTopic: updated };
    case "subtopic":
      return { ...roles, subtopic: updated };
  }
}

function replaceLightPaletteRoleColor(
  roles: Partial<MindMapPaletteRoleTokens>,
  role: MindMapPresentationLibraryPaletteRole,
  channel: MindMapPresentationLibraryPaletteRoleColorChannel,
  color: MindMapThemeColor,
): Partial<MindMapPaletteRoleTokens> {
  const updated = replacePaletteNodeColor(roles[role] ?? {}, channel, color);
  switch (role) {
    case "root":
      return { ...roles, root: updated };
    case "mainTopic":
      return { ...roles, mainTopic: updated };
    case "subtopic":
      return { ...roles, subtopic: updated };
  }
}

function replacePaletteNodeColor(
  colors: MindMapPaletteNodeColors,
  channel: MindMapPresentationLibraryPaletteRoleColorChannel,
  color: MindMapThemeColor,
): MindMapPaletteNodeColors {
  switch (channel) {
    case "fill":
      return { ...colors, fill: color };
    case "stroke":
      return { ...colors, stroke: color };
    case "textColor":
      return { ...colors, textColor: color };
  }
}

function replaceBranchColor(
  colors: readonly MindMapThemeColor[],
  index: number,
  color: MindMapThemeColor,
): readonly MindMapThemeColor[] {
  if (index >= colors.length) {
    throw new RangeError(`Unknown branch color index ${index}.`);
  }
  return colors.map((current, currentIndex) =>
    currentIndex === index ? color : cloneThemeColor(current),
  );
}

function clonePaletteDraft(
  draft: MindMapPresentationLibraryPaletteDraft,
): MindMapPresentationLibraryPaletteDraft {
  const lightColors = cloneLightColors(draft.lightColors);
  const lightRoles = cloneLightRoles(draft.lightRoles);
  return {
    label: draft.label,
    colors: cloneColorTokens(draft.colors),
    roles: clonePaletteRoles(draft.roles),
    lightOverridesEnabled: draft.lightOverridesEnabled,
    ...(lightColors === undefined ? {} : { lightColors }),
    ...(lightRoles === undefined ? {} : { lightRoles }),
  };
}

function cloneStyleTokens(tokens: MindMapStyleTokens): MindMapStyleTokens {
  return {
    typography: cloneTypography(tokens.typography),
    node: cloneNodeTokens(tokens.node),
    edge: cloneEdgeTokens(tokens.edge),
    effects: cloneEffectTokens(tokens.effects),
    branches: cloneBranchTokens(tokens.branches),
    roles: {
      root: cloneStyleRole(tokens.roles.root),
      mainTopic: cloneStyleRole(tokens.roles.mainTopic),
      subtopic: cloneStyleRole(tokens.roles.subtopic),
    },
  };
}

function cloneTypography(
  typography: MindMapThemeTypographyTokens,
): MindMapThemeTypographyTokens {
  return {
    fontFamilyToken: typography.fontFamilyToken,
    fontSize: typography.fontSize,
    rootFontSize: typography.rootFontSize,
    fontWeight: typography.fontWeight,
    rootFontWeight: typography.rootFontWeight,
    lineHeight: typography.lineHeight,
  };
}

function cloneNodeTokens(tokens: MindMapThemeNodeTokens): MindMapThemeNodeTokens {
  return {
    maxWidth: tokens.maxWidth,
    minHeight: tokens.minHeight,
    paddingInline: tokens.paddingInline,
    paddingBlock: tokens.paddingBlock,
    borderWidth: tokens.borderWidth,
    radius: tokens.radius,
  };
}

function cloneEdgeTokens(tokens: MindMapThemeEdgeTokens): MindMapThemeEdgeTokens {
  return {
    width: tokens.width,
    connectorProfile: cloneConnectorProfile(tokens.connectorProfile),
    routing: tokens.routing,
    lineStyle: tokens.lineStyle,
  };
}

function cloneConnectorProfile(
  profile: MindMapConnectorStrokeProfile,
): MindMapConnectorStrokeProfile {
  return profile.kind === "uniform"
    ? { kind: "uniform" }
    : {
        kind: "taper-to-child",
        childWidthRatio: profile.childWidthRatio,
      };
}

function cloneEffectTokens(
  effects: MindMapThemeEffectTokens,
): MindMapThemeEffectTokens {
  return {
    canvasTexture:
      effects.canvasTexture === null
        ? null
        : cloneRenderEffectRef(effects.canvasTexture),
    nodeStroke:
      effects.nodeStroke === null ? null : cloneRenderEffectRef(effects.nodeStroke),
    nodeFill:
      effects.nodeFill === null ? null : cloneRenderEffectRef(effects.nodeFill),
    edgeStroke:
      effects.edgeStroke === null ? null : cloneRenderEffectRef(effects.edgeStroke),
    terminalMarker:
      effects.terminalMarker === null
        ? null
        : cloneTerminalMarker(effects.terminalMarker),
  };
}

function cloneRenderEffectRef(
  effect: MindMapRenderEffectRef,
): MindMapRenderEffectRef {
  return {
    profileId: effect.profileId,
    options: { ...effect.options },
  };
}

function cloneTerminalMarker(
  marker: MindMapThemeTerminalMarker,
): MindMapThemeTerminalMarker {
  return {
    effect: cloneRenderEffectRef(marker.effect),
    placement: marker.placement,
    size: marker.size,
  };
}

function cloneBranchTokens(
  branches: MindMapThemeBranchTokens,
): MindMapThemeBranchTokens {
  return {
    mode: branches.mode,
    colorNodeFill: branches.colorNodeFill,
    colorNodeStroke: branches.colorNodeStroke,
    colorNodeText: branches.colorNodeText,
    colorEdgeStroke: branches.colorEdgeStroke,
  };
}

function cloneStyleRole(
  role: MindMapNodeStylePresentation,
): MindMapNodeStylePresentation {
  const typography = role.typography;
  return {
    ...(role.role === undefined ? {} : { role: role.role }),
    ...(role.variant === undefined ? {} : { variant: role.variant }),
    ...(role.shape === undefined ? {} : { shape: role.shape }),
    ...(role.borderWidth === undefined
      ? {}
      : { borderWidth: role.borderWidth }),
    ...(role.radius === undefined ? {} : { radius: role.radius }),
    ...(role.maxWidth === undefined ? {} : { maxWidth: role.maxWidth }),
    ...(role.minHeight === undefined ? {} : { minHeight: role.minHeight }),
    ...(role.paddingInline === undefined
      ? {}
      : { paddingInline: role.paddingInline }),
    ...(role.paddingBlock === undefined
      ? {}
      : { paddingBlock: role.paddingBlock }),
    ...(typography === undefined
      ? {}
      : {
          typography: {
            ...(typography.fontFamilyToken === undefined
              ? {}
              : { fontFamilyToken: typography.fontFamilyToken }),
            ...(typography.fontSize === undefined
              ? {}
              : { fontSize: typography.fontSize }),
            ...(typography.fontWeight === undefined
              ? {}
              : { fontWeight: typography.fontWeight }),
            ...(typography.lineHeight === undefined
              ? {}
              : { lineHeight: typography.lineHeight }),
            ...(typography.italic === undefined
              ? {}
              : { italic: typography.italic }),
          },
        }),
    ...(role.iconId === undefined ? {} : { iconId: role.iconId }),
    ...(role.markerIds === undefined
      ? {}
      : { markerIds: [...role.markerIds] }),
  };
}

function cloneColorTokens(
  colors: MindMapThemeColorTokens,
): MindMapThemeColorTokens {
  return {
    canvas: cloneThemeColor(colors.canvas),
    surface: cloneThemeColor(colors.surface),
    surfaceEmphasis: cloneThemeColor(colors.surfaceEmphasis),
    surfaceHover: cloneThemeColor(colors.surfaceHover),
    text: cloneThemeColor(colors.text),
    textOnAccent: cloneThemeColor(colors.textOnAccent),
    textMuted: cloneThemeColor(colors.textMuted),
    border: cloneThemeColor(colors.border),
    borderHover: cloneThemeColor(colors.borderHover),
    accent: cloneThemeColor(colors.accent),
    edge: cloneThemeColor(colors.edge),
    selection: cloneThemeColor(colors.selection),
    branchPalette: colors.branchPalette.map(cloneThemeColor),
  };
}

function cloneLightColors(
  colors: Partial<MindMapThemeColorTokens> | undefined,
): Partial<MindMapThemeColorTokens> | undefined {
  if (colors === undefined) {
    return undefined;
  }
  return {
    ...(colors.canvas === undefined ? {} : { canvas: cloneThemeColor(colors.canvas) }),
    ...(colors.surface === undefined
      ? {}
      : { surface: cloneThemeColor(colors.surface) }),
    ...(colors.surfaceEmphasis === undefined
      ? {}
      : { surfaceEmphasis: cloneThemeColor(colors.surfaceEmphasis) }),
    ...(colors.surfaceHover === undefined
      ? {}
      : { surfaceHover: cloneThemeColor(colors.surfaceHover) }),
    ...(colors.text === undefined ? {} : { text: cloneThemeColor(colors.text) }),
    ...(colors.textOnAccent === undefined
      ? {}
      : { textOnAccent: cloneThemeColor(colors.textOnAccent) }),
    ...(colors.textMuted === undefined
      ? {}
      : { textMuted: cloneThemeColor(colors.textMuted) }),
    ...(colors.border === undefined
      ? {}
      : { border: cloneThemeColor(colors.border) }),
    ...(colors.borderHover === undefined
      ? {}
      : { borderHover: cloneThemeColor(colors.borderHover) }),
    ...(colors.accent === undefined
      ? {}
      : { accent: cloneThemeColor(colors.accent) }),
    ...(colors.edge === undefined ? {} : { edge: cloneThemeColor(colors.edge) }),
    ...(colors.selection === undefined
      ? {}
      : { selection: cloneThemeColor(colors.selection) }),
    ...(colors.branchPalette === undefined
      ? {}
      : { branchPalette: colors.branchPalette.map(cloneThemeColor) }),
  };
}

function clonePaletteRoles(
  roles: MindMapPaletteRoleTokens,
): MindMapPaletteRoleTokens {
  return {
    root: clonePaletteRole(roles.root),
    mainTopic: clonePaletteRole(roles.mainTopic),
    subtopic: clonePaletteRole(roles.subtopic),
  };
}

function cloneLightRoles(
  roles: Partial<MindMapPaletteRoleTokens> | undefined,
): Partial<MindMapPaletteRoleTokens> | undefined {
  if (roles === undefined) {
    return undefined;
  }
  return {
    ...(roles.root === undefined ? {} : { root: clonePaletteRole(roles.root) }),
    ...(roles.mainTopic === undefined
      ? {}
      : { mainTopic: clonePaletteRole(roles.mainTopic) }),
    ...(roles.subtopic === undefined
      ? {}
      : { subtopic: clonePaletteRole(roles.subtopic) }),
  };
}

function clonePaletteRole(
  role: MindMapPaletteNodeColors,
): MindMapPaletteNodeColors {
  return {
    ...(role.fill === undefined ? {} : { fill: cloneThemeColor(role.fill) }),
    ...(role.stroke === undefined
      ? {}
      : { stroke: cloneThemeColor(role.stroke) }),
    ...(role.textColor === undefined
      ? {}
      : { textColor: cloneThemeColor(role.textColor) }),
  };
}

function cloneThemeColor(color: MindMapThemeColor): MindMapThemeColor {
  return color.kind === "host"
    ? hostColor(color.token)
    : literalColor(color.value);
}

export function createMindMapPresentationLibraryDraftConflict(
  entryKind: MindMapPresentationLibraryEntryKind,
  entryId: string,
  baseRevision: MindMapPresentationLibraryEntryRevision,
  authoritativeRevision: MindMapPresentationLibraryEntryRevision,
): MindMapPresentationLibraryDraftConflict {
  return {
    entryKind,
    entryId,
    baseRevision,
    authoritativeRevision,
  };
}

/** JSON-safe structural equality that is insensitive to object key order. */
function presentationLibraryValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    ) {
      return false;
    }
    return left.every((value, index) =>
      presentationLibraryValuesEqual(value, right[index]),
    );
  }
  if (!isPresentationLibraryRecord(left) || !isPresentationLibraryRecord(right)) {
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        presentationLibraryValuesEqual(left[key], right[key]),
    )
  );
}

function isPresentationLibraryRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function literalHexColor(value: string): MindMapThemeColor {
  if (typeof value !== "string") {
    throw new TypeError("Palette colors must be literal hexadecimal strings.");
  }
  const normalized = value.trim();
  if (!LITERAL_HEX_COLOR.test(normalized)) {
    throw new TypeError(
      `Palette colors must be literal hexadecimal strings, received ${JSON.stringify(value)}.`,
    );
  }
  return literalColor(normalized);
}

function assertLightOverridesEnabled(
  draft: MindMapPresentationLibraryPaletteDraft,
): void {
  if (!draft.lightOverridesEnabled) {
    throw new Error("Enable light overrides before editing light-mode colors.");
  }
}

function assertStyleRole(
  value: unknown,
): asserts value is MindMapPresentationLibraryStyleRole {
  if (!STYLE_ROLES.includes(value as MindMapPresentationLibraryStyleRole)) {
    throw new RangeError(`Unknown style role ${JSON.stringify(value)}.`);
  }
}

function assertPaletteCoreColor(
  value: unknown,
): asserts value is MindMapPresentationLibraryPaletteCoreColor {
  if (
    !PALETTE_CORE_COLORS.includes(
      value as MindMapPresentationLibraryPaletteCoreColor,
    )
  ) {
    throw new RangeError(`Unknown palette core color ${JSON.stringify(value)}.`);
  }
}

function assertPaletteColorTarget(
  value: unknown,
): asserts value is MindMapPresentationLibraryPaletteColorTarget {
  if (value !== "base" && value !== "light") {
    throw new RangeError(`Unknown palette color target ${JSON.stringify(value)}.`);
  }
}

function assertPaletteRoleColorChannel(
  value: unknown,
): asserts value is MindMapPresentationLibraryPaletteRoleColorChannel {
  if (
    !PALETTE_ROLE_COLOR_CHANNELS.includes(
      value as MindMapPresentationLibraryPaletteRoleColorChannel,
    )
  ) {
    throw new RangeError(`Unknown palette role color channel ${JSON.stringify(value)}.`);
  }
}

function assertNodeShape(value: unknown): asserts value is MindMapNodeShape {
  if (
    value !== "rounded-rectangle" &&
    value !== "rectangle" &&
    value !== "pill" &&
    value !== "ellipse" &&
    value !== "underline" &&
    value !== "none"
  ) {
    throw new RangeError(`Unknown node shape ${JSON.stringify(value)}.`);
  }
}

function assertEdgeRouting(value: unknown): asserts value is MindMapEdgeRouting {
  if (
    value !== "bezier" &&
    value !== "straight" &&
    value !== "orthogonal" &&
    value !== "rounded-orthogonal"
  ) {
    throw new RangeError(`Unknown edge routing ${JSON.stringify(value)}.`);
  }
}

function assertLineStyle(value: unknown): asserts value is MindMapLineStyle {
  if (value !== "solid" && value !== "dashed" && value !== "dotted") {
    throw new RangeError(`Unknown line style ${JSON.stringify(value)}.`);
  }
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
}

function assertBranchColorIndex(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new RangeError("Branch color index must be a non-negative integer.");
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string.`);
  }
}
