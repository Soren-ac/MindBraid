import {
  DEFAULT_MIND_MAP_CONNECTOR_PROFILE_ID,
  DEFAULT_MIND_MAP_CONNECTOR_WIDTH_ID,
  DEFAULT_MIND_MAP_GLOBAL_FONT_ID,
  cloneMindMapConnectorStrokeProfile,
  type MindMapConnectorProfileSpec,
  type MindMapConnectorStrokeProfile,
  type MindMapConnectorWidthSpec,
  type MindMapFontFamilySpec,
  type MindMapFormattingSpec,
} from "./presentation";

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const SAFE_FONT_TOKEN = /^[a-z0-9][a-z0-9-]{0,127}$/;
const MAX_CONNECTOR_WIDTH = 32;
const MIN_TAPER_TO_CHILD_WIDTH_RATIO = 0.05;
const MAX_TAPER_TO_CHILD_WIDTH_RATIO = 1;

export interface MindMapFormattingRegistry {
  readonly fonts: {
    list(): readonly MindMapFontFamilySpec[];
    has(id: string): boolean;
    resolve(id: string): MindMapFontFamilySpec;
    resolveOrDefault(id: string | null | undefined): MindMapFontFamilySpec;
  };
  readonly connectorWidths: {
    list(): readonly MindMapConnectorWidthSpec[];
    has(id: string): boolean;
    resolve(id: string): MindMapConnectorWidthSpec;
    resolveOrDefault(
      id: string | null | undefined,
    ): MindMapConnectorWidthSpec;
  };
  /**
   * Safe registered connector treatments. The style-default entry has a
   * `null` profile and deliberately inherits the active style's edge profile.
   */
  readonly connectorProfiles: {
    list(): readonly MindMapConnectorProfileSpec[];
    has(id: string): boolean;
    resolve(id: string): MindMapConnectorProfileSpec;
    resolveOrDefault(
      id: string | null | undefined,
    ): MindMapConnectorProfileSpec;
  };
  compose(
    fontFamilyId: string,
    connectorWidthId: string,
    connectorProfileId?: string,
  ): MindMapFormattingSpec;
  composeOrDefault(
    fontFamilyId: string | null | undefined,
    connectorWidthId: string | null | undefined,
    connectorProfileId?: string | null,
  ): MindMapFormattingSpec;
}

export const BUILT_IN_MIND_MAP_FONT_FAMILIES: readonly MindMapFontFamilySpec[] =
  Object.freeze([
    {
      id: DEFAULT_MIND_MAP_GLOBAL_FONT_ID,
      label: "Style default",
      revision: 1,
      fontFamilyToken: null,
    },
    {
      id: "obsidian-interface",
      label: "Obsidian interface",
      revision: 1,
      fontFamilyToken: "font-interface",
    },
    {
      id: "obsidian-text",
      label: "Obsidian text",
      revision: 1,
      fontFamilyToken: "font-text",
    },
    {
      id: "monospace",
      label: "Monospace",
      revision: 1,
      fontFamilyToken: "font-monospace",
    },
    {
      id: "handwritten",
      label: "Handwritten",
      revision: 1,
      fontFamilyToken: "obmind-font-handwritten",
    },
    {
      id: "system-sans",
      label: "System sans-serif",
      revision: 1,
      fontFamilyToken: "obmind-font-system-sans",
    },
    {
      id: "chinese-heiti-simplified",
      label: "黑体 · 简体中文",
      revision: 1,
      fontFamilyToken: "obmind-font-heiti-sc",
    },
    {
      id: "chinese-heiti-traditional",
      label: "黑体 · 繁體中文",
      revision: 1,
      fontFamilyToken: "obmind-font-heiti-tc",
    },
    {
      id: "hiragino-sans-gb",
      label: "冬青黑体简体中文",
      revision: 1,
      fontFamilyToken: "obmind-font-hiragino-gb",
    },
    {
      id: "chinese-songti-simplified",
      label: "宋体 · 简体中文",
      revision: 1,
      fontFamilyToken: "obmind-font-songti-sc",
    },
    {
      id: "chinese-songti-traditional",
      label: "宋體 · 繁體中文",
      revision: 1,
      fontFamilyToken: "obmind-font-songti-tc",
    },
    {
      id: "source-han-sans",
      label: "思源黑体",
      revision: 1,
      fontFamilyToken: "obmind-font-source-han-sans",
    },
    {
      id: "source-han-serif",
      label: "思源宋体",
      revision: 1,
      fontFamilyToken: "obmind-font-source-han-serif",
    },
  ]);

export const BUILT_IN_MIND_MAP_CONNECTOR_WIDTHS: readonly MindMapConnectorWidthSpec[] =
  Object.freeze([
    {
      id: DEFAULT_MIND_MAP_CONNECTOR_WIDTH_ID,
      label: "Style default",
      revision: 1,
      width: null,
    },
    { id: "extra-thin", label: "Extra thin", revision: 1, width: 0.75 },
    { id: "thin", label: "Thin", revision: 1, width: 1 },
    { id: "medium", label: "Medium", revision: 1, width: 1.5 },
    { id: "thick", label: "Thick", revision: 1, width: 2.25 },
    { id: "extra-thick", label: "Extra thick", revision: 1, width: 3.25 },
  ]);

/**
 * Connector geometry is a third formatting axis, separate from both styles
 * and palettes. Only the `style-default` profile inherits treatment from a
 * style; choosing a concrete entry never changes a palette, layout, or node
 * shape.
 */
export const BUILT_IN_MIND_MAP_CONNECTOR_PROFILES: readonly MindMapConnectorProfileSpec[] =
  Object.freeze([
    {
      id: DEFAULT_MIND_MAP_CONNECTOR_PROFILE_ID,
      label: "Style default",
      revision: 1,
      profile: null,
    },
    {
      id: "uniform",
      label: "Uniform",
      revision: 1,
      profile: { kind: "uniform" },
    },
    {
      id: "taper-to-child",
      label: "Taper to child",
      revision: 1,
      profile: {
        kind: "taper-to-child",
        childWidthRatio: 0.35,
      },
    },
  ]);

export function createMindMapFormattingRegistry(
  fonts: readonly MindMapFontFamilySpec[],
  connectorWidths: readonly MindMapConnectorWidthSpec[],
  defaultFontId: string,
  defaultConnectorWidthId: string,
  connectorProfiles = BUILT_IN_MIND_MAP_CONNECTOR_PROFILES,
  defaultConnectorProfileId = DEFAULT_MIND_MAP_CONNECTOR_PROFILE_ID,
): MindMapFormattingRegistry {
  const fontRegistry = createSpecRegistry(
    fonts,
    defaultFontId,
    validateFontSpec,
    "global font",
  );
  const connectorWidthRegistry = createSpecRegistry(
    connectorWidths,
    defaultConnectorWidthId,
    validateConnectorWidthSpec,
    "connector width",
  );
  const connectorProfileRegistry = createSpecRegistry(
    connectorProfiles,
    defaultConnectorProfileId,
    validateConnectorProfileSpec,
    "connector profile",
  );

  const compose = (
    fontFamilyId: string,
    connectorWidthId: string,
    connectorProfileId = defaultConnectorProfileId,
  ): MindMapFormattingSpec => ({
    fontFamily: cloneFontSpec(fontRegistry.resolve(fontFamilyId)),
    connectorWidth: cloneConnectorWidthSpec(
      connectorWidthRegistry.resolve(connectorWidthId),
    ),
    connectorProfile: cloneConnectorProfileSpec(
      connectorProfileRegistry.resolve(connectorProfileId),
    ),
  });

  return {
    fonts: fontRegistry,
    connectorWidths: connectorWidthRegistry,
    connectorProfiles: connectorProfileRegistry,
    compose,
    composeOrDefault: (fontFamilyId, connectorWidthId, connectorProfileId) => ({
      fontFamily: cloneFontSpec(
        fontRegistry.resolveOrDefault(fontFamilyId),
      ),
      connectorWidth: cloneConnectorWidthSpec(
        connectorWidthRegistry.resolveOrDefault(connectorWidthId),
      ),
      connectorProfile: cloneConnectorProfileSpec(
        connectorProfileRegistry.resolveOrDefault(connectorProfileId),
      ),
    }),
  };
}

export const BUILT_IN_MIND_MAP_FORMATTING_REGISTRY =
  createMindMapFormattingRegistry(
    BUILT_IN_MIND_MAP_FONT_FAMILIES,
    BUILT_IN_MIND_MAP_CONNECTOR_WIDTHS,
    DEFAULT_MIND_MAP_GLOBAL_FONT_ID,
    DEFAULT_MIND_MAP_CONNECTOR_WIDTH_ID,
    BUILT_IN_MIND_MAP_CONNECTOR_PROFILES,
    DEFAULT_MIND_MAP_CONNECTOR_PROFILE_ID,
  );

/**
 * Resolve a document profile against the active visual style. `null` is an
 * intentional inheritance sentinel, while `undefined` preserves compatibility
 * with documents persisted before connector profiles existed.
 */
export function resolveMindMapConnectorStrokeProfile(
  connectorProfile: MindMapConnectorProfileSpec | null | undefined,
  styleProfile: MindMapConnectorStrokeProfile,
): MindMapConnectorStrokeProfile {
  return cloneMindMapConnectorStrokeProfile(
    connectorProfile?.profile ?? styleProfile,
  );
}

function createSpecRegistry<T extends { readonly id: string }>(
  specs: readonly T[],
  defaultId: string,
  validate: (spec: T) => void,
  label: string,
): {
  list(): readonly T[];
  has(id: string): boolean;
  resolve(id: string): T;
  resolveOrDefault(id: string | null | undefined): T;
} {
  const byId = new Map<string, T>();
  for (const spec of specs) {
    validate(spec);
    if (byId.has(spec.id)) {
      throw new Error(`Duplicate ${label} ID "${spec.id}".`);
    }
    byId.set(spec.id, spec);
  }
  const defaultSpec = byId.get(defaultId);
  if (defaultSpec === undefined) {
    throw new Error(`Default ${label} "${defaultId}" is not registered.`);
  }
  const registered = [...byId.values()];
  return {
    list: () => registered,
    has: (id) => byId.has(id),
    resolve(id) {
      const spec = byId.get(id);
      if (spec === undefined) {
        throw new Error(`Unknown ${label} "${id}".`);
      }
      return spec;
    },
    resolveOrDefault: (id) =>
      id === null || id === undefined ? defaultSpec : (byId.get(id) ?? defaultSpec),
  };
}

function validateFontSpec(spec: MindMapFontFamilySpec): void {
  validateBaseSpec(spec.id, spec.label, "global font");
  if (
    spec.fontFamilyToken !== null &&
    !SAFE_FONT_TOKEN.test(spec.fontFamilyToken)
  ) {
    throw new Error(`Global font "${spec.id}" has an unsafe token.`);
  }
}

function validateConnectorWidthSpec(spec: MindMapConnectorWidthSpec): void {
  validateBaseSpec(spec.id, spec.label, "connector width");
  if (
    spec.width !== null &&
    (!Number.isFinite(spec.width) ||
      spec.width <= 0 ||
      spec.width > MAX_CONNECTOR_WIDTH)
  ) {
    throw new Error(`Connector width "${spec.id}" is invalid.`);
  }
}

function validateConnectorProfileSpec(
  spec: MindMapConnectorProfileSpec,
): void {
  validateBaseSpec(spec.id, spec.label, "connector profile");
  if (spec.profile === null) {
    return;
  }
  validateConnectorStrokeProfile(spec.profile, spec.id);
}

function validateConnectorStrokeProfile(
  profile: MindMapConnectorStrokeProfile,
  id: string,
): void {
  const candidate = profile as {
    readonly kind?: unknown;
    readonly childWidthRatio?: unknown;
  };
  if (candidate.kind === "uniform") {
    return;
  }
  if (candidate.kind !== "taper-to-child") {
    throw new Error(`Connector profile "${id}" has an unsupported kind.`);
  }
  if (
    typeof candidate.childWidthRatio !== "number" ||
    !Number.isFinite(candidate.childWidthRatio) ||
    candidate.childWidthRatio < MIN_TAPER_TO_CHILD_WIDTH_RATIO ||
    candidate.childWidthRatio > MAX_TAPER_TO_CHILD_WIDTH_RATIO
  ) {
    throw new Error(`Connector profile "${id}" has an invalid child width ratio.`);
  }
}

function validateBaseSpec(id: string, label: string, kind: string): void {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Invalid ${kind} ID "${id}".`);
  }
  if (label.trim().length === 0) {
    throw new Error(`${kind} "${id}" requires a label.`);
  }
}

function cloneFontSpec(spec: MindMapFontFamilySpec): MindMapFontFamilySpec {
  return { ...spec };
}

function cloneConnectorWidthSpec(
  spec: MindMapConnectorWidthSpec,
): MindMapConnectorWidthSpec {
  return { ...spec };
}

function cloneConnectorProfileSpec(
  spec: MindMapConnectorProfileSpec,
): MindMapConnectorProfileSpec {
  return {
    ...spec,
    profile:
      spec.profile === null
        ? null
        : cloneMindMapConnectorStrokeProfile(spec.profile),
  };
}
