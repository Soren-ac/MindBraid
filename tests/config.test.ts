import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYOUT_SPACING,
  DEFAULT_SETTINGS,
  MAX_LAYOUT_SPACING,
  MIN_LAYOUT_SPACING,
  clampLayoutSpacingValue,
  createDefaultObMindSettings,
  createObMindSettingsRegistries,
  isAppearanceMode,
  isLayoutOrientation,
  isLayoutSpacing,
  isLayoutSpacingValue,
  layoutDirectionForOrientation,
  normalizeLayoutSpacing,
  normalizeObMindSettings,
  requireDefaultLayoutDirection,
  requireDefaultLayoutOrientation,
} from "../src/application/config";

describe("ObMind settings normalization", () => {
  it("uses colorful style, colorful palette, and bilateral defaults for a fresh install", () => {
    expect(normalizeObMindSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("migrates the legacy two-direction schema without losing its axis", () => {
    expect(
      normalizeObMindSettings({
        layoutDirection: "top-to-bottom",
      }),
    ).toEqual({
      language: "zh-CN",
      appearanceMode: "system",
      layoutOrientation: "top-to-bottom",
      layoutDirection: "top-to-bottom",
      layoutSpacing: DEFAULT_LAYOUT_SPACING,
      layoutEngineId: "bilateral-tree",
      styleId: "colorful",
      paletteId: "colorful",
    });
  });

  it("restores registered style, palette, and layout IDs", () => {
    expect(
      normalizeObMindSettings({
        layoutOrientation: "right-to-left",
        // The deprecated value must be derived from the canonical orientation
        // rather than trusted when the two fields conflict.
        layoutDirection: "top-to-bottom",
        layoutSpacing: {
          level: 80,
          sibling: 36,
          subtree: 48,
        },
        layoutEngineId: "tree",
        styleId: "pencil-sketch",
        paletteId: "cloud",
      }),
    ).toEqual({
      language: "zh-CN",
      appearanceMode: "system",
      layoutOrientation: "right-to-left",
      layoutDirection: "left-to-right",
      layoutSpacing: {
        level: 80,
        sibling: 36,
        subtree: 48,
      },
      layoutEngineId: "tree",
      styleId: "pencil-sketch",
      paletteId: "cloud",
    });
  });

  it("preserves both added built-in palette selections", () => {
    expect(
      normalizeObMindSettings({ paletteId: "morandi-mint" }).paletteId,
    ).toBe("morandi-mint");
    expect(
      normalizeObMindSettings({ paletteId: "retro-autumn" }).paletteId,
    ).toBe("retro-autumn");
    expect(DEFAULT_SETTINGS.paletteId).toBe("colorful");
  });

  it("migrates a legacy theme ID to a matching style and palette pair", () => {
    expect(
      normalizeObMindSettings({ themeId: "pencil-sketch" }),
    ).toMatchObject({
      styleId: "pencil-sketch",
      paletteId: "pencil-sketch",
    });

    expect(
      normalizeObMindSettings({ themeId: "obsidian-native" }),
    ).toMatchObject({
      styleId: "cloud",
      paletteId: "cloud",
    });
  });

  it("normalizes system, light, and dark appearance modes", () => {
    for (const appearanceMode of ["system", "light", "dark"] as const) {
      expect(isAppearanceMode(appearanceMode)).toBe(true);
      expect(normalizeObMindSettings({ appearanceMode }).appearanceMode).toBe(
        appearanceMode,
      );
    }

    expect(isAppearanceMode("sepia")).toBe(false);
    expect(
      normalizeObMindSettings({ appearanceMode: "sepia" }).appearanceMode,
    ).toBe("system");
  });

  it("defaults legacy and malformed language data to Chinese", () => {
    expect(normalizeObMindSettings({}).language).toBe("zh-CN");
    expect(normalizeObMindSettings({ language: "fr" }).language).toBe(
      "zh-CN",
    );
  });

  it("preserves an explicit supported language", () => {
    expect(normalizeObMindSettings({ language: "en" }).language).toBe("en");
    expect(normalizeObMindSettings({ language: "zh-CN" }).language).toBe(
      "zh-CN",
    );
  });

  it("falls back independently for malformed or removed values", () => {
    expect(
      normalizeObMindSettings({
        layoutDirection: "sideways",
        layoutEngineId: "removed-layout",
        styleId: "removed-style",
        paletteId: "removed-palette",
      }),
    ).toEqual(DEFAULT_SETTINGS);
  });

  it("uses injected active registries instead of a fixed built-in ID list", () => {
    const registries = createObMindSettingsRegistries({
      layoutEngines: {
        has: (id) => id === "extension-layout" || id === "tree",
      },
      styles: {
        has: (id) => id === "custom-style-3" || id === "cloud",
      },
      palettes: {
        has: (id) => id === "custom-palette-4" || id === "colorful",
      },
      defaultLayoutEngineId: "extension-layout",
      defaultStyleId: "custom-style-3",
      defaultPaletteId: "custom-palette-4",
    });

    expect(createDefaultObMindSettings(registries)).toMatchObject({
      layoutEngineId: "extension-layout",
      styleId: "custom-style-3",
      paletteId: "custom-palette-4",
    });
    expect(
      normalizeObMindSettings(
        {
          layoutEngineId: "tree",
          styleId: "cloud",
          paletteId: "colorful",
        },
        registries,
      ),
    ).toMatchObject({
      layoutEngineId: "tree",
      styleId: "cloud",
      paletteId: "colorful",
    });
    expect(
      normalizeObMindSettings(
        {
          layoutEngineId: "removed-layout",
          styleId: "removed-style",
          paletteId: "removed-palette",
        },
        registries,
      ),
    ).toMatchObject({
      layoutEngineId: "extension-layout",
      styleId: "custom-style-3",
      paletteId: "custom-palette-4",
    });
    expect(
      normalizeObMindSettings(
        {
          layoutEngineId: "tree",
          styleId: "custom-style-3",
          paletteId: "removed-palette",
        },
        registries,
      ),
    ).toMatchObject({
      layoutEngineId: "tree",
      styleId: "custom-style-3",
      paletteId: "custom-palette-4",
    });
  });

  it("rejects a registry bundle whose declared default is not registered", () => {
    expect(() =>
      createObMindSettingsRegistries({
        layoutEngines: { has: () => true },
        styles: { has: () => false },
        palettes: { has: () => true },
        defaultLayoutEngineId: "tree",
        defaultStyleId: "missing",
        defaultPaletteId: "colorful",
      }),
    ).toThrow("Default mind-map style");
  });

  it("accepts every supported orientation, including migrated mirrored values", () => {
    for (const orientation of [
      "left-to-right",
      "right-to-left",
      "top-to-bottom",
      "bottom-to-top",
    ] as const) {
      expect(isLayoutOrientation(orientation)).toBe(true);
      expect(requireDefaultLayoutOrientation(orientation)).toBe(orientation);
      expect(
        normalizeObMindSettings({ layoutDirection: orientation })
          .layoutOrientation,
      ).toBe(orientation);
    }

    expect(isLayoutOrientation("sideways")).toBe(false);
    expect(() => requireDefaultLayoutOrientation("sideways")).toThrow(
      "cannot be saved as an ObMind default",
    );
  });

  it("projects canonical orientations to the legacy two-axis direction", () => {
    expect(layoutDirectionForOrientation("left-to-right")).toBe(
      "left-to-right",
    );
    expect(layoutDirectionForOrientation("right-to-left")).toBe(
      "left-to-right",
    );
    expect(layoutDirectionForOrientation("top-to-bottom")).toBe(
      "top-to-bottom",
    );
    expect(layoutDirectionForOrientation("bottom-to-top")).toBe(
      "top-to-bottom",
    );
  });

  it("rejects view-only orientations when saving a default", () => {
    expect(requireDefaultLayoutDirection("left-to-right")).toBe(
      "left-to-right",
    );
    expect(requireDefaultLayoutDirection("top-to-bottom")).toBe(
      "top-to-bottom",
    );
    expect(() => requireDefaultLayoutDirection("right-to-left")).toThrow(
      "cannot be saved as an ObMind default",
    );
    expect(() => requireDefaultLayoutDirection("bottom-to-top")).toThrow(
      "cannot be saved as an ObMind default",
    );
  });
});

describe("layout spacing normalization", () => {
  it("exports strict validators for complete persisted spacing", () => {
    expect(isLayoutSpacing(DEFAULT_LAYOUT_SPACING)).toBe(true);
    expect(
      isLayoutSpacing({
        level: DEFAULT_LAYOUT_SPACING.level,
        sibling: DEFAULT_LAYOUT_SPACING.sibling,
      }),
    ).toBe(false);
    expect(isLayoutSpacingValue(MIN_LAYOUT_SPACING)).toBe(true);
    expect(isLayoutSpacingValue(MAX_LAYOUT_SPACING)).toBe(true);
    expect(isLayoutSpacingValue(Number.NaN)).toBe(false);
    expect(isLayoutSpacingValue(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isLayoutSpacingValue(-1)).toBe(false);
    expect(isLayoutSpacingValue(MAX_LAYOUT_SPACING + 1)).toBe(false);
  });

  it("clamps finite values and falls back for malformed values", () => {
    expect(clampLayoutSpacingValue(-20, 50)).toBe(MIN_LAYOUT_SPACING);
    expect(clampLayoutSpacingValue(MAX_LAYOUT_SPACING + 20, 50)).toBe(
      MAX_LAYOUT_SPACING,
    );
    expect(clampLayoutSpacingValue(37.5, 50)).toBe(37.5);
    expect(clampLayoutSpacingValue("37.5", 50)).toBe(50);
    expect(clampLayoutSpacingValue(Number.NaN, 50)).toBe(50);
    expect(clampLayoutSpacingValue("invalid", -1)).toBe(MIN_LAYOUT_SPACING);
  });

  it("normalizes each spacing field independently", () => {
    expect(
      normalizeLayoutSpacing({
        level: MAX_LAYOUT_SPACING + 1,
        sibling: -1,
        subtree: 31.5,
      }),
    ).toEqual({
      level: MAX_LAYOUT_SPACING,
      sibling: MIN_LAYOUT_SPACING,
      subtree: 31.5,
    });
    expect(
      normalizeLayoutSpacing({
        level: "invalid",
        sibling: Number.POSITIVE_INFINITY,
      }),
    ).toEqual(DEFAULT_LAYOUT_SPACING);
  });

  it("includes normalized spacing in persisted settings", () => {
    expect(
      normalizeObMindSettings({
        layoutSpacing: {
          level: 64,
          sibling: -50,
          subtree: 999,
        },
      }).layoutSpacing,
    ).toEqual({
      level: 64,
      sibling: MIN_LAYOUT_SPACING,
      subtree: MAX_LAYOUT_SPACING,
    });
  });
});
