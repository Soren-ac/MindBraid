import {
  composeMindMapTheme,
  type MindMapThemeSpec,
} from "./presentation";
import type { MindMapRenderEffectResolver } from "./render-effects";
import {
  BUILT_IN_MIND_MAP_PALETTE_SPECS,
  COLORFUL_PALETTE_ID,
  DEFAULT_MIND_MAP_PALETTE_ID,
  MORANDI_MINT_PALETTE_ID,
  PENCIL_SKETCH_PALETTE_ID,
  RETRO_AUTUMN_PALETTE_ID,
  createColorfulPaletteSpec,
  createMindMapPaletteRegistry,
  createPencilSketchPaletteSpec,
  type MindMapPaletteRegistry,
} from "./palettes";
import {
  BUILT_IN_MIND_MAP_STYLE_SPECS,
  ATLAS_CARDS_STYLE_ID,
  CHARCOAL_STYLE_ID,
  CLOUD_STYLE_ID,
  COLORFUL_STYLE_ID,
  DEFAULT_MIND_MAP_STYLE_ID,
  PENCIL_SKETCH_STYLE_ID,
  SWISS_EDITORIAL_STYLE_ID,
  TECHNICAL_DRAFT_STYLE_ID,
  createCloudStyleSpec,
  createColorfulStyleSpec,
  createMindMapStyleRegistry,
  createPencilSketchStyleSpec,
  type MindMapStyleRegistry,
} from "./styles";

/** Legacy matching-pair IDs retained only as a migration vocabulary. */
export const PENCIL_SKETCH_THEME_ID = PENCIL_SKETCH_STYLE_ID;
export const CLOUD_THEME_ID = CLOUD_STYLE_ID;
export const COLORFUL_THEME_ID = COLORFUL_STYLE_ID;
export const DEFAULT_MIND_MAP_THEME_ID = DEFAULT_MIND_MAP_STYLE_ID;

export interface LegacyMindMapThemeSelection {
  readonly styleId: string;
  readonly paletteId: string;
}

export {
  BUILT_IN_MIND_MAP_PALETTE_SPECS,
  BUILT_IN_MIND_MAP_STYLE_SPECS,
  ATLAS_CARDS_STYLE_ID,
  CHARCOAL_STYLE_ID,
  CLOUD_STYLE_ID,
  COLORFUL_PALETTE_ID,
  COLORFUL_STYLE_ID,
  DEFAULT_MIND_MAP_PALETTE_ID,
  DEFAULT_MIND_MAP_STYLE_ID,
  MORANDI_MINT_PALETTE_ID,
  PENCIL_SKETCH_PALETTE_ID,
  PENCIL_SKETCH_STYLE_ID,
  RETRO_AUTUMN_PALETTE_ID,
  SWISS_EDITORIAL_STYLE_ID,
  TECHNICAL_DRAFT_STYLE_ID,
};

/**
 * Registry boundary used by the host. Styles and palettes remain independently
 * discoverable and persistable; only `compose` creates a renderer snapshot.
 */
export interface MindMapThemeCompositionRegistry {
  readonly styles: MindMapStyleRegistry;
  readonly palettes: MindMapPaletteRegistry;
  compose(styleId: string, paletteId: string): MindMapThemeSpec;
  composeOrDefault(
    styleId: string | null | undefined,
    paletteId: string | null | undefined,
  ): MindMapThemeSpec;
}

export function createMindMapThemeCompositionRegistry(
  effects: MindMapRenderEffectResolver,
  styles = BUILT_IN_MIND_MAP_STYLE_SPECS,
  palettes = BUILT_IN_MIND_MAP_PALETTE_SPECS,
  defaultStyleId = DEFAULT_MIND_MAP_STYLE_ID,
  defaultPaletteId = DEFAULT_MIND_MAP_PALETTE_ID,
): MindMapThemeCompositionRegistry {
  const styleRegistry = createMindMapStyleRegistry(
    styles,
    effects,
    defaultStyleId,
  );
  const paletteRegistry = createMindMapPaletteRegistry(
    palettes,
    defaultPaletteId,
  );
  return {
    styles: styleRegistry,
    palettes: paletteRegistry,
    compose: (styleId, paletteId) =>
      composeMindMapTheme(
        styleRegistry.resolve(styleId),
        paletteRegistry.resolve(paletteId),
      ),
    composeOrDefault: (styleId, paletteId) =>
      composeMindMapTheme(
        styleRegistry.resolveOrDefault(styleId),
        paletteRegistry.resolveOrDefault(paletteId),
      ),
  };
}

/** Legacy theme helpers preserve maintained styles during split-theme migration. */
export function createPencilSketchThemeSpec(): MindMapThemeSpec {
  return composeMindMapTheme(
    createPencilSketchStyleSpec(),
    createPencilSketchPaletteSpec(),
  );
}

export function createCloudThemeSpec(): MindMapThemeSpec {
  return composeMindMapTheme(
    createCloudStyleSpec(),
    createColorfulPaletteSpec(),
  );
}

export function createColorfulThemeSpec(): MindMapThemeSpec {
  return composeMindMapTheme(
    createColorfulStyleSpec(),
    createColorfulPaletteSpec(),
  );
}

export const BUILT_IN_MIND_MAP_THEME_SPECS: readonly MindMapThemeSpec[] =
  Object.freeze([
    createPencilSketchThemeSpec(),
    createCloudThemeSpec(),
    createColorfulThemeSpec(),
  ]);

export function isBuiltInMindMapThemeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    [PENCIL_SKETCH_THEME_ID, CLOUD_THEME_ID, COLORFUL_THEME_ID].includes(value)
  );
}

/**
 * Converts the pre-split theme vocabulary without losing safe unknown IDs in
 * document annotations. `obsidian-native` was removed before this milestone;
 * its closest maintained clean preset is Organic Classic.
 */
export function migrateLegacyMindMapThemeId(
  themeId: string,
): LegacyMindMapThemeSelection {
  const migratedId = themeId === "obsidian-native" ? CLOUD_STYLE_ID : themeId;
  return {
    styleId: migratedId,
    // Aurora (`cloud`) is retired as a selectable palette. Preserve the
    // independently maintained Organic Classic style while moving legacy matching-theme
    // data onto the active default color scheme.
    paletteId:
      migratedId === CLOUD_STYLE_ID
        ? DEFAULT_MIND_MAP_PALETTE_ID
        : migratedId,
  };
}
