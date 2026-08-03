import {
  BUILT_IN_MIND_MAP_LAYOUT_ENGINE_REGISTRY,
  DEFAULT_MIND_MAP_LAYOUT_ENGINE_ID,
} from "../layout/layouts";
import type { LayoutDirection, LayoutOrientation } from "../core/model";
import {
  DEFAULT_MIND_MAP_PALETTE_ID,
  DEFAULT_MIND_MAP_STYLE_ID,
  migrateLegacyMindMapThemeId,
} from "../presentation/themes";
import { isBuiltInMindMapPaletteId } from "../presentation/palettes";
import { isBuiltInMindMapStyleId } from "../presentation/styles";
import {
  DEFAULT_OBMIND_LANGUAGE,
  isObMindLanguage,
  type ObMindLanguage,
} from "../i18n/i18n";

/** Minimal registry contract needed by persistence normalization. */
export interface ObMindSettingsIdentifierRegistry {
  has(id: string): boolean;
}

/**
 * The active registries—not a hard-coded built-in list—are authoritative for
 * persisted default IDs. A host can compose built-ins with a validated custom
 * library before passing this object to `normalizeObMindSettings`.
 */
export interface ObMindSettingsRegistries {
  readonly layoutEngines: ObMindSettingsIdentifierRegistry;
  readonly styles: ObMindSettingsIdentifierRegistry;
  readonly palettes: ObMindSettingsIdentifierRegistry;
  readonly defaultLayoutEngineId: string;
  readonly defaultStyleId: string;
  readonly defaultPaletteId: string;
}

/**
 * Persisted, renderer-neutral spacing for the built-in tree layouts.
 *
 * These values deliberately mirror `MindMapLayoutSpacing` without importing
 * presentation contracts into settings. They are structural types, so the
 * host can pass a validated value directly to a presentation layout later.
 */
export interface ObMindLayoutSpacing {
  readonly level: number;
  readonly sibling: number;
  readonly subtree: number;
}

export type ObMindAppearanceMode = "system" | "light" | "dark";

/** A zero gap is useful for compact maps, while 400px prevents hostile data
 * from producing impractically large layouts or SVG coordinates. */
export const MIN_LAYOUT_SPACING = 0;
export const MAX_LAYOUT_SPACING = 400;

export const DEFAULT_LAYOUT_SPACING: ObMindLayoutSpacing = Object.freeze({
  level: 72,
  sibling: 24,
  subtree: 24,
});

export interface ObMindSettings {
  /** Global product language; never persisted into a Markdown document. */
  readonly language: ObMindLanguage;
  readonly appearanceMode: ObMindAppearanceMode;
  /**
   * Canonical persisted orientation. Unlike the historical direction field,
   * it can represent mirrored layouts.
   */
  readonly layoutOrientation: LayoutOrientation;
  /**
   * Compatibility projection for integrations that only support the two base
   * axes. New presentation code must use `layoutOrientation`.
   */
  readonly layoutDirection: LayoutDirection;
  readonly layoutSpacing: ObMindLayoutSpacing;
  readonly layoutEngineId: string;
  readonly styleId: string;
  readonly paletteId: string;
}

export const DEFAULT_SETTINGS: ObMindSettings = {
  language: DEFAULT_OBMIND_LANGUAGE,
  appearanceMode: "system",
  layoutOrientation: "left-to-right",
  layoutDirection: "left-to-right",
  layoutSpacing: DEFAULT_LAYOUT_SPACING,
  layoutEngineId: DEFAULT_MIND_MAP_LAYOUT_ENGINE_ID,
  styleId: DEFAULT_MIND_MAP_STYLE_ID,
  paletteId: DEFAULT_MIND_MAP_PALETTE_ID,
};

/**
 * The built-in registry remains the compatibility default for callers that
 * have not assembled an active custom presentation library yet.
 */
export const BUILT_IN_OBMIND_SETTINGS_REGISTRIES: ObMindSettingsRegistries =
  createObMindSettingsRegistries({
    layoutEngines: BUILT_IN_MIND_MAP_LAYOUT_ENGINE_REGISTRY,
    styles: {
      has: (styleId) => isBuiltInMindMapStyleId(styleId),
    },
    palettes: {
      has: (paletteId) => isBuiltInMindMapPaletteId(paletteId),
    },
    defaultLayoutEngineId: DEFAULT_MIND_MAP_LAYOUT_ENGINE_ID,
    defaultStyleId: DEFAULT_MIND_MAP_STYLE_ID,
    defaultPaletteId: DEFAULT_MIND_MAP_PALETTE_ID,
  });

/**
 * Creates a checked immutable registry bundle. Invalid extension defaults are
 * programmer configuration errors, not user-data failures, so they fail fast
 * instead of silently returning to an unrelated built-in setting.
 */
export function createObMindSettingsRegistries(
  registries: ObMindSettingsRegistries,
): ObMindSettingsRegistries {
  if (!registries.layoutEngines.has(registries.defaultLayoutEngineId)) {
    throw new RangeError(
      `Default layout engine "${registries.defaultLayoutEngineId}" is not registered.`,
    );
  }
  if (!registries.styles.has(registries.defaultStyleId)) {
    throw new RangeError(
      `Default mind-map style "${registries.defaultStyleId}" is not registered.`,
    );
  }
  if (!registries.palettes.has(registries.defaultPaletteId)) {
    throw new RangeError(
      `Default mind-map palette "${registries.defaultPaletteId}" is not registered.`,
    );
  }
  return Object.freeze({
    layoutEngines: registries.layoutEngines,
    styles: registries.styles,
    palettes: registries.palettes,
    defaultLayoutEngineId: registries.defaultLayoutEngineId,
    defaultStyleId: registries.defaultStyleId,
    defaultPaletteId: registries.defaultPaletteId,
  });
}

/** Returns defaults tied to the supplied active registries. */
export function createDefaultObMindSettings(
  registries: ObMindSettingsRegistries = BUILT_IN_OBMIND_SETTINGS_REGISTRIES,
): ObMindSettings {
  return {
    ...DEFAULT_SETTINGS,
    layoutEngineId: registries.defaultLayoutEngineId,
    styleId: registries.defaultStyleId,
    paletteId: registries.defaultPaletteId,
  };
}

export function isAppearanceMode(
  value: unknown,
): value is ObMindAppearanceMode {
  return value === "system" || value === "light" || value === "dark";
}

export function isLayoutOrientation(value: unknown): value is LayoutOrientation {
  return (
    value === "left-to-right" ||
    value === "right-to-left" ||
    value === "top-to-bottom" ||
    value === "bottom-to-top"
  );
}

/**
 * Returns the base axis consumed by the legacy controller and two-direction
 * layout API. It intentionally does not discard the canonical orientation
 * stored in `ObMindSettings.layoutOrientation`.
 */
export function layoutDirectionForOrientation(
  orientation: LayoutOrientation,
): LayoutDirection {
  return orientation === "top-to-bottom" || orientation === "bottom-to-top"
    ? "top-to-bottom"
    : "left-to-right";
}

/**
 * Validates a user-supplied canonical default orientation.
 */
export function requireDefaultLayoutOrientation(
  value: unknown,
): LayoutOrientation {
  if (isLayoutOrientation(value)) {
    return value;
  }

  throw new Error(
    `Layout orientation "${String(value)}" cannot be saved as a MindBraid default. ` +
      "Choose left-to-right, right-to-left, top-to-bottom, or bottom-to-top.",
  );
}

/**
 * Returns whether a value is a finite, persistable layout-spacing value. This
 * is intentionally strict; callers accepting arbitrary input should use
 * `clampLayoutSpacingValue` or `normalizeLayoutSpacing`.
 */
export function isLayoutSpacingValue(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_LAYOUT_SPACING &&
    value <= MAX_LAYOUT_SPACING
  );
}

/**
 * Clamps a finite spacing number to the persisted range. Non-finite input
 * resolves to the caller's already-validated fallback.
 */
export function clampLayoutSpacingValue(
  value: unknown,
  fallback: number,
): number {
  const safeFallback =
    typeof fallback === "number" && Number.isFinite(fallback)
      ? Math.min(MAX_LAYOUT_SPACING, Math.max(MIN_LAYOUT_SPACING, fallback))
      : DEFAULT_LAYOUT_SPACING.level;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return safeFallback;
  }

  return Math.min(MAX_LAYOUT_SPACING, Math.max(MIN_LAYOUT_SPACING, value));
}

/**
 * Strict shape validation for code that needs to reject malformed settings
 * rather than normalize them. Extra JSON fields are ignored by normalization
 * but do not make this core shape invalid.
 */
export function isLayoutSpacing(value: unknown): value is ObMindLayoutSpacing {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isLayoutSpacingValue(value.level) &&
    isLayoutSpacingValue(value.sibling) &&
    isLayoutSpacingValue(value.subtree)
  );
}

/**
 * Produces a safe complete spacing object from current or legacy persisted
 * data. Each field is independent so one malformed value cannot discard a
 * user's other valid spacing choices.
 */
export function normalizeLayoutSpacing(value: unknown): ObMindLayoutSpacing {
  const record = isRecord(value) ? value : {};
  return {
    level: clampLayoutSpacingValue(record.level, DEFAULT_LAYOUT_SPACING.level),
    sibling: clampLayoutSpacingValue(
      record.sibling,
      DEFAULT_LAYOUT_SPACING.sibling,
    ),
    subtree: clampLayoutSpacingValue(
      record.subtree,
      DEFAULT_LAYOUT_SPACING.subtree,
    ),
  };
}

export function isLayoutDirection(value: unknown): value is LayoutDirection {
  return value === "left-to-right" || value === "top-to-bottom";
}

/**
 * Compatibility validator for integrations that still use the axis-only
 * `LayoutDirection` contract. Persisted defaults should use
 * `requireDefaultLayoutOrientation` instead.
 */
export function requireDefaultLayoutDirection(value: unknown): LayoutDirection {
  if (isLayoutDirection(value)) {
    return value;
  }

  throw new Error(
    `Layout orientation "${String(value)}" cannot be saved as a MindBraid default. ` +
      "Choose left-to-right or top-to-bottom.",
  );
}

export function isLayoutEngineId(
  value: unknown,
  registries: ObMindSettingsRegistries = BUILT_IN_OBMIND_SETTINGS_REGISTRIES,
): value is string {
  return (
    typeof value === "string" &&
    registries.layoutEngines.has(value)
  );
}

export function isMindMapStyleId(
  value: unknown,
  registries: ObMindSettingsRegistries = BUILT_IN_OBMIND_SETTINGS_REGISTRIES,
): value is string {
  return typeof value === "string" && registries.styles.has(value);
}

export function isMindMapPaletteId(
  value: unknown,
  registries: ObMindSettingsRegistries = BUILT_IN_OBMIND_SETTINGS_REGISTRIES,
): value is string {
  return typeof value === "string" && registries.palettes.has(value);
}

export function normalizeObMindSettings(
  value: unknown,
  registries: ObMindSettingsRegistries = BUILT_IN_OBMIND_SETTINGS_REGISTRIES,
): ObMindSettings {
  const record = isRecord(value) ? value : {};
  const defaults = createDefaultObMindSettings(registries);
  const layoutOrientation = normalizeLayoutOrientation(record);
  const legacyThemeId =
    typeof record.themeId === "string" ? record.themeId : undefined;
  const legacySelection =
    legacyThemeId === undefined
      ? undefined
      : migrateLegacyMindMapThemeId(legacyThemeId);
  return {
    language: isObMindLanguage(record.language)
      ? record.language
      : defaults.language,
    appearanceMode: isAppearanceMode(record.appearanceMode)
      ? record.appearanceMode
      : defaults.appearanceMode,
    layoutOrientation,
    // Keep the legacy field coherent when a future-facing orientation is
    // loaded before the remaining host integration moves to the new field.
    layoutDirection: layoutDirectionForOrientation(layoutOrientation),
    layoutSpacing: normalizeLayoutSpacing(record.layoutSpacing),
    layoutEngineId: isLayoutEngineId(record.layoutEngineId, registries)
      ? record.layoutEngineId
      : defaults.layoutEngineId,
    styleId: isMindMapStyleId(record.styleId, registries)
      ? record.styleId
      : isMindMapStyleId(legacySelection?.styleId, registries)
        ? legacySelection.styleId
        : defaults.styleId,
    paletteId: isMindMapPaletteId(record.paletteId, registries)
      ? record.paletteId
      : isMindMapPaletteId(legacySelection?.paletteId, registries)
        ? legacySelection.paletteId
        : defaults.paletteId,
  };
}

/**
 * New schema wins. The legacy field is still accepted as a migration source,
 * including mirrored values written by early development builds, so a valid
 * persisted orientation is never silently downgraded.
 */
function normalizeLayoutOrientation(
  record: Record<string, unknown>,
): LayoutOrientation {
  if (isLayoutOrientation(record.layoutOrientation)) {
    return record.layoutOrientation;
  }
  if (isLayoutOrientation(record.layoutDirection)) {
    return record.layoutDirection;
  }

  return DEFAULT_SETTINGS.layoutOrientation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
