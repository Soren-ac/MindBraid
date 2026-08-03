import { describe, expect, it } from "vitest";

import { BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION } from "../src/application/composition/built-in-composition";
import {
  BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
  createDomSvgMindMapEffectRegistry,
} from "../src/ui/dom-svg-effects";
import {
  composeMindMapTheme,
  createDefaultMindMapPaletteSpec,
  createDefaultMindMapStyleSpec,
  createMindMapRenderEffectRef,
  literalColor,
  resolveMindMapThemeColors,
  resolveMindMapThemeRoles,
  type MindMapNodePresentation,
  type MindMapThemeSpec,
} from "../src/presentation/presentation";
import {
  createMindMapRenderEffectResolver,
  getStyleRequiredEffectIds,
} from "../src/presentation/render-effects";
import {
  AURORA_PALETTE_LABEL,
  BUILT_IN_MIND_MAP_PALETTE_SPECS,
  GRAPHITE_PALETTE_LABEL,
  MORANDI_MINT_PALETTE_LABEL,
  RETRO_AUTUMN_PALETTE_LABEL,
  SPECTRUM_PALETTE_LABEL,
  createMindMapPaletteRegistry,
  createMorandiMintPaletteSpec,
  createPencilSketchPaletteSpec,
  createRetroAutumnPaletteSpec,
} from "../src/presentation/palettes";
import {
  COLORFUL_STYLE_ID,
  DEFAULT_MIND_MAP_PALETTE_ID,
  DEFAULT_MIND_MAP_STYLE_ID,
  PENCIL_SKETCH_STYLE_ID,
  createMindMapThemeCompositionRegistry,
  createPencilSketchThemeSpec,
} from "../src/presentation/themes";
import {
  BUILT_IN_MIND_MAP_STYLE_SPECS,
  createMindMapStyleRegistry,
  createPencilSketchStyleSpec,
} from "../src/presentation/styles";

const composition =
  BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition;

function literal(value: string): Readonly<{ kind: "literal"; value: string }> {
  return { kind: "literal", value };
}

/**
 * Palette-owned values are deliberately omitted here. A palette may change
 * colors, but it must never smuggle geometry, typography, effects, or branch
 * application behavior into a composed theme.
 */
function getPaletteInvariantStyleTreatment(
  theme: MindMapThemeSpec,
): Readonly<Record<string, unknown>> {
  return {
    typography: theme.tokens.typography,
    node: theme.tokens.node,
    edge: theme.tokens.edge,
    effects: theme.tokens.effects,
    branches: theme.tokens.branches,
    roles: {
      root: removePaletteRoleColors(theme.tokens.roles.root),
      mainTopic: removePaletteRoleColors(theme.tokens.roles.mainTopic),
      subtopic: removePaletteRoleColors(theme.tokens.roles.subtopic),
    },
  };
}

function removePaletteRoleColors(
  role: MindMapNodePresentation,
): Readonly<Record<string, unknown>> {
  const {
    fill: _fill,
    stroke: _stroke,
    textColor: _textColor,
    branchColorIndex: _branchColorIndex,
    ...styleTreatment
  } = role;
  return styleTreatment;
}

describe("mind-map style and palette composition", () => {
  it("uses a palette-specific display vocabulary without changing stable IDs", () => {
    expect(
      BUILT_IN_MIND_MAP_PALETTE_SPECS.map(({ id, label }) => ({ id, label })),
    ).toEqual([
      { id: "pencil-sketch", label: GRAPHITE_PALETTE_LABEL },
      { id: "cloud", label: AURORA_PALETTE_LABEL },
      { id: "colorful", label: SPECTRUM_PALETTE_LABEL },
      { id: "morandi-mint", label: MORANDI_MINT_PALETTE_LABEL },
      { id: "retro-autumn", label: RETRO_AUTUMN_PALETTE_LABEL },
    ]);

    const styleLabels = new Set(
      BUILT_IN_MIND_MAP_STYLE_SPECS.map(({ label }) => label),
    );
    for (const { label } of BUILT_IN_MIND_MAP_PALETTE_SPECS) {
      expect(styleLabels.has(label)).toBe(false);
    }

    expect(composition.compose("colorful", "colorful").label).toBe(
      "Colorful / Spectrum",
    );
  });

  it("preserves the supplied Morandi Mint and Retro Autumn light palettes", () => {
    const morandiMint = createMorandiMintPaletteSpec();
    expect(morandiMint.lightColors).toMatchObject({
      canvas: literal("#F9F9F9"),
      surface: literal("#FFFFFF"),
      border: literal("#E5E7EB"),
      text: literal("#4B5563"),
      surfaceEmphasis: literal("#8BA88E"),
      textOnAccent: literal("#FFFFFF"),
    });
    expect(morandiMint.lightColors?.branchPalette).toEqual(
      ["#E3B4B8", "#A3B5C9", "#DDC69B", "#C2A9B9", "#93A8AC"].map(
        literal,
      ),
    );
    expect(morandiMint.lightRoles?.root).toEqual({
      fill: literal("#8BA88E"),
      stroke: literal("#8BA88E"),
      textColor: literal("#2F3A33"),
    });

    const retroAutumn = createRetroAutumnPaletteSpec();
    expect(retroAutumn.lightColors).toMatchObject({
      canvas: literal("#FDFBF7"),
      surface: literal("#F4EFE6"),
      border: literal("#E2D9C8"),
      text: literal("#5C4A3D"),
      surfaceEmphasis: literal("#D46A43"),
      textOnAccent: literal("#FFFFFF"),
    });
    expect(retroAutumn.lightColors?.branchPalette).toEqual(
      ["#E4A757", "#7E8D70", "#B25D4F", "#C29B72", "#6D5A50"].map(
        literal,
      ),
    );
    expect(retroAutumn.lightRoles?.root).toEqual({
      fill: literal("#D46A43"),
      stroke: literal("#D46A43"),
      textColor: literal("#FFFFFF"),
    });

    expect(morandiMint.colors.canvas).toEqual(literal("#1B211E"));
    expect(retroAutumn.colors.canvas).toEqual(literal("#211A16"));
    expect(morandiMint.colors.branchPalette).not.toEqual(
      morandiMint.lightColors?.branchPalette,
    );
    expect(retroAutumn.colors.branchPalette).not.toEqual(
      retroAutumn.lightColors?.branchPalette,
    );
  });

  it("keeps every built-in normal text token safe for an unfilled canvas", () => {
    for (const palette of composition.palettes.list()) {
      const theme = composition.compose("colorful", palette.id);
      for (const colorScheme of ["light", "dark"] as const) {
        const text = resolveMindMapThemeColors(theme, colorScheme).text;
        if (text.kind === "host") {
          expect(text.token, `${palette.id}/${colorScheme}`).not.toBe(
            "text-on-accent",
          );
          continue;
        }
        const normalized = text.value.trim().toLowerCase();
        if (colorScheme === "light") {
          expect(
            ["#fff", "#ffffff", "white"],
            `${palette.id}/${colorScheme}`,
          ).not.toContain(normalized);
        } else {
          expect(
            ["#000", "#000000", "black"],
            `${palette.id}/${colorScheme}`,
          ).not.toContain(normalized);
        }
      }
    }
  });

  it("uses independent colorful defaults", () => {
    const theme = composition.composeOrDefault(undefined, undefined);

    expect(DEFAULT_MIND_MAP_STYLE_ID).toBe(COLORFUL_STYLE_ID);
    expect(DEFAULT_MIND_MAP_PALETTE_ID).toBe("colorful");
    expect(theme.styleId).toBe("colorful");
    expect(theme.paletteId).toBe("colorful");
    expect(theme.tokens.branches).toEqual({
      mode: "root-subtree",
      colorNodeFill: true,
      colorNodeStroke: false,
      colorNodeText: false,
      colorEdgeStroke: true,
    });
    expect(theme.tokens.colors.branchPalette).toHaveLength(8);
    expect(composition.styles.list().map(({ id }) => id)).toEqual([
      "pencil-sketch",
      "cloud",
      "colorful",
    ]);
    expect(composition.palettes.list().map(({ id }) => id)).toEqual([
      "pencil-sketch",
      "cloud",
      "colorful",
      "morandi-mint",
      "retro-autumn",
    ]);
  });

  it("combines pencil geometry and effects with colorful colors", () => {
    const matchingPencil = createPencilSketchThemeSpec();
    const mixed = composition.compose("pencil-sketch", "colorful");

    expect(mixed.styleId).toBe("pencil-sketch");
    expect(mixed.paletteId).toBe("colorful");
    expect(mixed.tokens.typography).toEqual(
      matchingPencil.tokens.typography,
    );
    expect(mixed.tokens.node).toEqual(matchingPencil.tokens.node);
    expect(mixed.tokens.effects).toEqual(matchingPencil.tokens.effects);
    expect(mixed.tokens.roles.root.shape).toBe("rounded-rectangle");
    expect(mixed.tokens.branches).toEqual(
      matchingPencil.tokens.branches,
    );
    expect(mixed.tokens.colors.branchPalette[0]).toEqual({
      kind: "host",
      token: "color-red",
    });
    expect(mixed.lightColors?.canvas).toEqual({
      kind: "literal",
      value: "#ffffff",
    });
  });

  it("keeps every style treatment and branch application policy fixed while palettes vary", () => {
    for (const style of composition.styles.list()) {
      const themes = composition.palettes
        .list()
        .map((palette) => composition.compose(style.id, palette.id));
      const [baseline, ...variants] = themes;

      if (baseline === undefined) {
        throw new Error("Expected at least one registered palette.");
      }

      const expectedTreatment = getPaletteInvariantStyleTreatment(baseline);
      for (const variant of variants) {
        expect(variant.styleId).toBe(style.id);
        expect(getPaletteInvariantStyleTreatment(variant)).toEqual(
          expectedTreatment,
        );
      }
    }
  });

  it("keeps matching legacy pairs visually equivalent", () => {
    const pencil = createPencilSketchThemeSpec();

    expect(pencil.styleId).toBe(PENCIL_SKETCH_STYLE_ID);
    expect(pencil.paletteId).toBe("pencil-sketch");
    expect(pencil.tokens.effects.canvasTexture?.profileId).toBe(
      "paper-grain",
    );
    expect(pencil.tokens.roles.root.fill).toEqual({
      kind: "host",
      token: "background-secondary",
    });
    expect(pencil.tokens.branches.colorNodeStroke).toBe(true);
  });

  it("resolves palette-owned role colors independently for light mode", () => {
    const theme = composeMindMapTheme(
      createDefaultMindMapStyleSpec({ id: "clean" }),
      createDefaultMindMapPaletteSpec({
        id: "adaptive",
        lightRoles: {
          root: { fill: literalColor("#ffffff") },
        },
      }),
    );

    expect(resolveMindMapThemeRoles(theme, "dark").root.fill).toEqual({
      kind: "host",
      token: "interactive-accent",
    });
    expect(resolveMindMapThemeRoles(theme, "light").root.fill).toEqual({
      kind: "literal",
      value: "#ffffff",
    });
  });

  it("validates style effects and falls back each axis independently", () => {
    expect(
      composition.composeOrDefault("removed", "cloud").styleId,
    ).toBe(COLORFUL_STYLE_ID);
    expect(
      composition.composeOrDefault("pencil-sketch", "removed").paletteId,
    ).toBe("colorful");
    expect(() => composition.compose("removed", "cloud")).toThrow(
      'Unknown mind-map style "removed"',
    );

    const pencilStyle = createPencilSketchStyleSpec();
    expect(() =>
      createMindMapStyleRegistry(
        [pencilStyle, pencilStyle],
        BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
        pencilStyle.id,
      ),
    ).toThrow('Duplicate mind-map style ID "pencil-sketch".');

    expect(() =>
      createMindMapStyleRegistry(
        [pencilStyle],
        createMindMapRenderEffectResolver([]),
        pencilStyle.id,
      ),
    ).toThrow('Unknown render-effect profile "paper-grain"');

    const wrongKindStyle = createDefaultMindMapStyleSpec({
      id: "wrong-kind",
      tokens: {
        effects: {
          nodeStroke: createMindMapRenderEffectRef("paper-grain"),
        },
      },
    });
    expect(() =>
      createMindMapStyleRegistry(
        [wrongKindStyle],
        BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
        wrongKindStyle.id,
      ),
    ).toThrow('has kind "canvas-texture", expected "node-stroke"');

    const pencilPalette = createPencilSketchPaletteSpec();
    expect(() =>
      createMindMapPaletteRegistry(
        [pencilPalette, pencilPalette],
        pencilPalette.id,
      ),
    ).toThrow('Duplicate mind-map palette ID "pencil-sketch".');

    expect(() =>
      createMindMapThemeCompositionRegistry(
        BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
        [pencilStyle],
        [pencilPalette],
        "missing",
        pencilPalette.id,
      ),
    ).toThrow('Default mind-map style "missing" is not registered.');
  });

  it("lists every required pencil effect exactly once", () => {
    const ids = getStyleRequiredEffectIds(createPencilSketchStyleSpec());

    expect(ids).toEqual([
      "paper-grain",
      "pencil-double",
      "pencil-hatch",
      "pencil-edge",
      "pencil-dot",
    ]);
    for (const id of ids) {
      expect(BUILT_IN_DOM_SVG_EFFECT_REGISTRY.has(id)).toBe(true);
    }
  });
});

describe("DOM/SVG effect adapters", () => {
  it("derives advertised capabilities from implemented definitions", () => {
    const registry = createDomSvgMindMapEffectRegistry([
      {
        id: "custom-fill",
        label: "Custom fill",
        kind: "node-fill",
        apply(ref) {
          return {
            profileId: ref.profileId,
            variables: { "--obmind-effect-custom-fill": "1" },
          };
        },
      },
    ]);
    const ref = createMindMapRenderEffectRef("custom-fill");

    expect(registry.list()).toEqual([
      {
        id: "custom-fill",
        label: "Custom fill",
        kind: "node-fill",
      },
    ]);
    expect(registry.has("custom-fill", "node-fill")).toBe(true);
    expect(registry.resolveNodeFill(ref)).toEqual({
      profileId: "custom-fill",
      variables: { "--obmind-effect-custom-fill": "1" },
    });
    expect(() =>
      registry.resolveNodeFill(createMindMapRenderEffectRef("missing-effect")),
    ).toThrow('Unknown render-effect profile "missing-effect"');
    expect(() => registry.resolveCanvasTexture(ref, "style:test")).toThrow(
      'has kind "node-fill", expected "canvas-texture"',
    );
  });

  it("produces stable paper, border, fill, edge, and marker adapters", () => {
    const style = createPencilSketchStyleSpec();
    const { effects } = style.tokens;
    const paper = BUILT_IN_DOM_SVG_EFFECT_REGISTRY.resolveCanvasTexture(
      effects.canvasTexture,
      "style:pencil-sketch",
    );
    const border = BUILT_IN_DOM_SVG_EFFECT_REGISTRY.resolveNodeStroke(
      effects.nodeStroke,
      "node:topic",
    );
    const fill = BUILT_IN_DOM_SVG_EFFECT_REGISTRY.resolveNodeFill(
      effects.nodeFill,
    );
    const strokes = BUILT_IN_DOM_SVG_EFFECT_REGISTRY.createEdgeStrokes(
      effects.edgeStroke,
      [
        { x: 0, y: 0 },
        { x: 80, y: 20 },
      ],
      "edge:topic",
    );
    const marker =
      BUILT_IN_DOM_SVG_EFFECT_REGISTRY.resolveTerminalMarker(
        effects.terminalMarker?.effect ?? null,
      );

    expect(
      BUILT_IN_DOM_SVG_EFFECT_REGISTRY.resolveCanvasTexture(
        effects.canvasTexture,
        "style:pencil-sketch",
      ),
    ).toEqual(paper);
    expect(paper?.profileId).toBe("paper-grain");
    expect(border?.profileId).toBe("pencil-double");
    expect(fill?.variables["--obmind-effect-hatch-opacity"]).toBe("9%");
    expect(strokes).toHaveLength(2);
    expect(marker).toEqual({
      profileId: "pencil-dot",
      shape: "circle",
    });
  });
});
