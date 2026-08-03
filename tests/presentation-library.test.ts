import { describe, expect, it } from "vitest";

import { BUILT_IN_DOM_SVG_EFFECT_REGISTRY } from "../src/ui/dom-svg-effects";
import {
  CUSTOM_MIND_MAP_PALETTE_ID_PREFIX,
  CUSTOM_MIND_MAP_STYLE_ID_PREFIX,
  MindMapPresentationLibraryRevisionConflictError,
  createMindMapPresentationLibrary,
  createMindMapPresentationLibraryPalette,
  createMindMapPresentationLibraryPreview,
  createMindMapPresentationLibraryStyle,
  deleteMindMapPresentationLibraryPalette,
  deleteMindMapPresentationLibraryStyle,
  duplicateMindMapPresentationLibraryPalette,
  duplicateMindMapPresentationLibraryStyle,
  getMindMapPresentationLibraryPalette,
  getMindMapPresentationLibraryStyle,
  normalizeMindMapPresentationLibrary,
  renameMindMapPresentationLibraryPalette,
  renameMindMapPresentationLibraryStyle,
  replaceMindMapPresentationLibraryPalette,
  replaceMindMapPresentationLibraryStyle,
  resolveMindMapPresentationLibraryReference,
  type MindMapPresentationLibraryValidators,
} from "../src/presentation/presentation-library";
import {
  createDefaultMindMapPaletteSpec,
  createDefaultMindMapStyleSpec,
  literalColor,
} from "../src/presentation/presentation";
import { createMindMapPaletteRegistry } from "../src/presentation/palettes";
import { createMindMapStyleRegistry } from "../src/presentation/styles";

const validators: MindMapPresentationLibraryValidators = {
  validateStyle(style) {
    createMindMapStyleRegistry(
      [style],
      BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
      style.id,
    );
  },
  validatePalette(palette) {
    createMindMapPaletteRegistry([palette], palette.id);
  },
  isStyleIdReserved: (id) => id === "colorful",
  isPaletteIdReserved: (id) => id === "colorful",
};

describe("custom presentation library", () => {
  it("creates document-independent, non-reused IDs for independent style and palette definitions", () => {
    const initial = createMindMapPresentationLibrary();
    const firstStyle = createMindMapPresentationLibraryStyle(
      initial,
      { label: "Diagram", template: createDefaultMindMapStyleSpec() },
      validators,
    );
    const firstPalette = createMindMapPresentationLibraryPalette(
      firstStyle.library,
      { label: "Ink", template: createDefaultMindMapPaletteSpec() },
      validators,
    );

    expect(firstStyle.entry.id).toBe(`${CUSTOM_MIND_MAP_STYLE_ID_PREFIX}1`);
    expect(firstPalette.entry.id).toBe(`${CUSTOM_MIND_MAP_PALETTE_ID_PREFIX}1`);
    expect(firstPalette.library.styles).toHaveLength(1);
    expect(firstPalette.library.palettes).toHaveLength(1);

    const deleted = deleteMindMapPresentationLibraryStyle(
      firstPalette.library,
      firstStyle.entry.id,
      firstStyle.entry.revision,
      "colorful",
    );
    const replacement = createMindMapPresentationLibraryStyle(
      deleted.library,
      { label: "Diagram two" },
      validators,
    );

    expect(deleted.removed?.id).toBe(firstStyle.entry.id);
    expect(deleted.fallback).toEqual({
      requestedId: firstStyle.entry.id,
      resolvedId: "colorful",
      usedFallback: true,
    });
    expect(replacement.entry.id).toBe(`${CUSTOM_MIND_MAP_STYLE_ID_PREFIX}2`);
    expect(replacement.library.palettes[0]?.id).toBe(firstPalette.entry.id);
  });

  it("duplicates, renames, and replaces entries without coupling Style to Palette", () => {
    const style = createMindMapPresentationLibraryStyle(
      createMindMapPresentationLibrary(),
      { label: "Geometric" },
      validators,
    );
    const palette = createMindMapPresentationLibraryPalette(
      style.library,
      {
        label: "Day and night",
        template: createDefaultMindMapPaletteSpec({
          lightColors: { canvas: literalColor("#ffffff") },
          lightRoles: { root: { fill: literalColor("#eeeeee") } },
        }),
      },
      validators,
    );

    const copiedStyle = duplicateMindMapPresentationLibraryStyle(
      palette.library,
      style.entry,
      validators,
    );
    const renamedStyle = renameMindMapPresentationLibraryStyle(
      copiedStyle.library,
      copiedStyle.entry.id,
      copiedStyle.entry.revision,
      "Renamed geometry",
      validators,
    );
    const replacedStyle = replaceMindMapPresentationLibraryStyle(
      renamedStyle.library,
      renamedStyle.entry.id,
      {
        expectedRevision: renamedStyle.entry.revision,
        definition: {
          label: renamedStyle.entry.label,
          tokens: {
            ...renamedStyle.entry.tokens,
            node: { ...renamedStyle.entry.tokens.node, radius: 28 },
          },
        },
      },
      validators,
    );

    expect(copiedStyle.entry.id).toBe(`${CUSTOM_MIND_MAP_STYLE_ID_PREFIX}2`);
    expect(renamedStyle.entry.revision).toBe(2);
    expect(replacedStyle.entry.revision).toBe(3);
    expect(replacedStyle.entry.tokens.node.radius).toBe(28);
    expect(replacedStyle.library.palettes[0]).toEqual(palette.entry);

    const copiedPalette = duplicateMindMapPresentationLibraryPalette(
      replacedStyle.library,
      palette.entry,
      validators,
      "Copied colors",
    );
    const renamedPalette = renameMindMapPresentationLibraryPalette(
      copiedPalette.library,
      copiedPalette.entry.id,
      copiedPalette.entry.revision,
      "Recolored",
      validators,
    );
    const replacedPalette = replaceMindMapPresentationLibraryPalette(
      renamedPalette.library,
      renamedPalette.entry.id,
      {
        expectedRevision: renamedPalette.entry.revision,
        definition: {
          label: renamedPalette.entry.label,
          colors: {
            ...renamedPalette.entry.colors,
            canvas: literalColor("#234567"),
          },
          roles: renamedPalette.entry.roles,
          lightColors: renamedPalette.entry.lightColors,
          lightRoles: renamedPalette.entry.lightRoles,
        },
      },
      validators,
    );

    expect(replacedPalette.entry.revision).toBe(3);
    expect(replacedPalette.entry.colors.canvas).toEqual(
      literalColor("#234567"),
    );
    expect(replacedPalette.entry.lightColors?.canvas).toEqual(
      literalColor("#ffffff"),
    );
    expect(replacedPalette.library.styles).toEqual(replacedStyle.library.styles);

    const preview = createMindMapPresentationLibraryPreview(
      replacedStyle.entry,
      replacedPalette.entry,
    );
    expect(preview.theme.styleId).toBe(replacedStyle.entry.id);
    expect(preview.theme.paletteId).toBe(replacedPalette.entry.id);
    expect(preview.theme.tokens.node.radius).toBe(28);
    expect(preview.theme.tokens.colors.canvas).toEqual(literalColor("#234567"));
    expect(preview.theme.lightColors?.canvas).toEqual(literalColor("#ffffff"));
  });

  it("rejects stale Style and Palette updates before creating a replacement snapshot", () => {
    const style = createMindMapPresentationLibraryStyle(
      createMindMapPresentationLibrary(),
      { label: "First style" },
      validators,
    );
    const palette = createMindMapPresentationLibraryPalette(
      style.library,
      { label: "First palette" },
      validators,
    );
    const updatedStyle = replaceMindMapPresentationLibraryStyle(
      palette.library,
      style.entry.id,
      {
        expectedRevision: style.entry.revision,
        definition: {
          label: "Saved in another view",
          tokens: style.entry.tokens,
        },
      },
      validators,
    );
    const updatedPalette = replaceMindMapPresentationLibraryPalette(
      updatedStyle.library,
      palette.entry.id,
      {
        expectedRevision: palette.entry.revision,
        definition: {
          label: "Saved colors in another view",
          colors: palette.entry.colors,
          roles: palette.entry.roles,
        },
      },
      validators,
    );

    const styleConflict = captureRevisionConflict(() =>
      replaceMindMapPresentationLibraryStyle(
        updatedPalette.library,
        style.entry.id,
        {
          expectedRevision: style.entry.revision,
          definition: {
            label: "Old draft must not overwrite",
            tokens: style.entry.tokens,
          },
        },
        validators,
      ),
    );
    expect(styleConflict.conflict).toEqual({
      entryKind: "style",
      entryId: style.entry.id,
      expectedRevision: style.entry.revision,
      actualRevision: updatedStyle.entry.revision,
      reason: "revision-mismatch",
    });
    expect(
      getMindMapPresentationLibraryStyle(
        updatedPalette.library,
        style.entry.id,
      )?.label,
    ).toBe("Saved in another view");

    const paletteConflict = captureRevisionConflict(() =>
      replaceMindMapPresentationLibraryPalette(
        updatedPalette.library,
        palette.entry.id,
        {
          expectedRevision: palette.entry.revision,
          definition: {
            label: "Old colors must not overwrite",
            colors: palette.entry.colors,
            roles: palette.entry.roles,
          },
        },
        validators,
      ),
    );
    expect(paletteConflict.conflict).toEqual({
      entryKind: "palette",
      entryId: palette.entry.id,
      expectedRevision: palette.entry.revision,
      actualRevision: updatedPalette.entry.revision,
      reason: "revision-mismatch",
    });
    expect(
      getMindMapPresentationLibraryPalette(
        updatedPalette.library,
        palette.entry.id,
      )?.label,
    ).toBe("Saved colors in another view");

    const staleDeleteConflict = captureRevisionConflict(() =>
      deleteMindMapPresentationLibraryPalette(
        updatedPalette.library,
        palette.entry.id,
        palette.entry.revision,
        "colorful",
      ),
    );
    expect(staleDeleteConflict.conflict).toEqual({
      entryKind: "palette",
      entryId: palette.entry.id,
      expectedRevision: palette.entry.revision,
      actualRevision: updatedPalette.entry.revision,
      reason: "revision-mismatch",
    });

    const deletedStyle = deleteMindMapPresentationLibraryStyle(
      updatedPalette.library,
      style.entry.id,
      updatedStyle.entry.revision,
      "colorful",
    );
    const missingConflict = captureRevisionConflict(() =>
      deleteMindMapPresentationLibraryStyle(
        deletedStyle.library,
        style.entry.id,
        updatedStyle.entry.revision,
        "colorful",
      ),
    );
    expect(missingConflict.conflict).toEqual({
      entryKind: "style",
      entryId: style.entry.id,
      expectedRevision: updatedStyle.entry.revision,
      actualRevision: null,
      reason: "entry-missing",
    });
  });

  it("normalizes entries independently, protects axes from forbidden data, and advances IDs past imported definitions", () => {
    const validStyle = {
      ...createDefaultMindMapStyleSpec({ id: "custom-style-4", label: "Valid style" }),
      revision: 1,
    };
    const validPalette = {
      ...createDefaultMindMapPaletteSpec({
        id: "custom-palette-7",
        label: "Valid palette",
        lightColors: { canvas: literalColor("#fafafa") },
      }),
      revision: 1,
    };
    const invalidStyleWithColor = {
      ...validStyle,
      id: "custom-style-5",
      tokens: {
        ...validStyle.tokens,
        roles: {
          ...validStyle.tokens.roles,
          root: { ...validStyle.tokens.roles.root, fill: literalColor("#000") },
        },
      },
    };
    const invalidStyleWithHiddenEdgeColor = {
      ...validStyle,
      id: "custom-style-6",
      tokens: {
        ...validStyle.tokens,
        edge: {
          ...validStyle.tokens.edge,
          color: literalColor("#111111"),
        },
      },
    };
    const invalidPaletteWithGeometry = {
      ...validPalette,
      id: "custom-palette-8",
      roles: {
        ...validPalette.roles,
        root: { ...validPalette.roles.root, shape: "pill" },
      },
    };
    const unsafePalette = {
      ...validPalette,
      id: "custom-palette-9",
      colors: {
        ...validPalette.colors,
        canvas: { kind: "literal", value: "url(https://example.com)" },
      },
    };
    const invalidPaletteWithHiddenGeometry = {
      ...validPalette,
      id: "custom-palette-10",
      colors: { ...validPalette.colors, routing: "bezier" },
    };

    const normalized = normalizeMindMapPresentationLibrary(
      {
        version: 1,
        nextStyleOrdinal: 1,
        nextPaletteOrdinal: 1,
        styles: [
          validStyle,
          invalidStyleWithColor,
          invalidStyleWithHiddenEdgeColor,
          { ...validStyle, id: "colorful" },
        ],
        palettes: [
          validPalette,
          invalidPaletteWithGeometry,
          unsafePalette,
          invalidPaletteWithHiddenGeometry,
        ],
      },
      validators,
    );

    expect(normalized.library.styles.map(({ id }) => id)).toEqual([
      "custom-style-4",
    ]);
    expect(normalized.library.palettes.map(({ id }) => id)).toEqual([
      "custom-palette-7",
    ]);
    expect(normalized.library.nextStyleOrdinal).toBe(5);
    expect(normalized.library.nextPaletteOrdinal).toBe(8);
    expect(normalized.migrated).toBe(true);
    expect(normalized.issues.map(({ reason }) => reason)).toEqual([
      "invalid-entry",
      "invalid-entry",
      "reserved-id",
      "invalid-entry",
      "invalid-entry",
      "invalid-entry",
    ]);
  });

  it("safely rejects malformed numeric and effect-option records without losing later valid siblings", () => {
    const validStyle = {
      ...createDefaultMindMapStyleSpec({
        id: "custom-style-20",
        label: "Preserved geometry",
      }),
      revision: 1,
    };
    const validPalette = {
      ...createDefaultMindMapPaletteSpec({
        id: "custom-palette-20",
        label: "Preserved colors",
      }),
      revision: 1,
    };
    const invalidMetric = {
      ...validStyle,
      id: "custom-style-18",
      tokens: {
        ...validStyle.tokens,
        node: { ...validStyle.tokens.node, maxWidth: Number.NaN },
      },
    };
    const invalidEffectOption = {
      ...validStyle,
      id: "custom-style-19",
      tokens: {
        ...validStyle.tokens,
        effects: {
          ...validStyle.tokens.effects,
          nodeStroke: {
            profileId: "pencil-double",
            options: { roughness: Number.POSITIVE_INFINITY },
          },
        },
      },
    };
    const invalidEffectString = {
      ...validStyle,
      id: "custom-style-21",
      tokens: {
        ...validStyle.tokens,
        effects: {
          ...validStyle.tokens.effects,
          nodeStroke: {
            profileId: "pencil-double",
            options: { variant: "url(https://example.com/effect)" },
          },
        },
      },
    };
    const invalidPaletteGeometry = {
      ...validPalette,
      id: "custom-palette-19",
      colors: { ...validPalette.colors, radius: 18 },
    };

    const normalized = normalizeMindMapPresentationLibrary(
      {
        // An older payload may contain a mixture of unusable and valid
        // records. Every valid record must survive migration independently.
        version: 0,
        nextStyleOrdinal: 1,
        nextPaletteOrdinal: 1,
        styles: [
          invalidMetric,
          invalidEffectOption,
          validStyle,
          invalidEffectString,
        ],
        palettes: [invalidPaletteGeometry, validPalette],
      },
      validators,
    );

    expect(normalized.migrated).toBe(true);
    expect(normalized.library.styles.map(({ id }) => id)).toEqual([
      "custom-style-20",
    ]);
    expect(normalized.library.palettes.map(({ id }) => id)).toEqual([
      "custom-palette-20",
    ]);
    expect(normalized.library.nextStyleOrdinal).toBe(21);
    expect(normalized.library.nextPaletteOrdinal).toBe(21);
    expect(normalized.issues).toEqual(
      expect.arrayContaining([
        { collection: "library", reason: "unsupported-version" },
        { collection: "styles", index: 0, reason: "invalid-entry" },
        { collection: "styles", index: 1, reason: "invalid-entry" },
        { collection: "styles", index: 3, reason: "invalid-entry" },
        { collection: "palettes", index: 0, reason: "invalid-entry" },
      ]),
    );
  });

  it("returns explicit reference fallback without assuming built-in or custom ownership", () => {
    expect(
      resolveMindMapPresentationLibraryReference(
        "custom-style-1",
        ["colorful", "custom-style-1"],
        "colorful",
      ),
    ).toEqual({
      requestedId: "custom-style-1",
      resolvedId: "custom-style-1",
      usedFallback: false,
    });
    expect(
      resolveMindMapPresentationLibraryReference(
        "removed-custom-style",
        ["colorful"],
        "colorful",
      ),
    ).toEqual({
      requestedId: "removed-custom-style",
      resolvedId: "colorful",
      usedFallback: true,
    });
    expect(() =>
      resolveMindMapPresentationLibraryReference(
        "custom-style-1",
        ["colorful"],
        "missing",
      ),
    ).toThrow("not active");
  });

  it("does not let a deleted palette ID be reused or silently replace its document references", () => {
    const created = createMindMapPresentationLibraryPalette(
      createMindMapPresentationLibrary(),
      { label: "First" },
      validators,
    );
    const removed = deleteMindMapPresentationLibraryPalette(
      created.library,
      created.entry.id,
      created.entry.revision,
      "colorful",
    );
    const replacement = createMindMapPresentationLibraryPalette(
      removed.library,
      { label: "Second" },
      validators,
    );

    expect(removed.fallback).toMatchObject({
      requestedId: `${CUSTOM_MIND_MAP_PALETTE_ID_PREFIX}1`,
      resolvedId: "colorful",
      usedFallback: true,
    });
    expect(replacement.entry.id).toBe(`${CUSTOM_MIND_MAP_PALETTE_ID_PREFIX}2`);
  });
});

function captureRevisionConflict(
  action: () => unknown,
): MindMapPresentationLibraryRevisionConflictError {
  try {
    action();
  } catch (error: unknown) {
    if (error instanceof MindMapPresentationLibraryRevisionConflictError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected a presentation-library revision conflict.");
}
