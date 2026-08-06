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
  resolveMindMapNodeTextColor,
  resolveMindMapThemeColors,
  resolveMindMapThemeRoles,
  type MindMapThemeColor,
  type MindMapNodePresentation,
  type MindMapThemeSpec,
} from "../src/presentation/presentation";
import {
  calculateMindMapColorContrast,
  MIN_MIND_MAP_TEXT_CONTRAST_RATIO,
  parseMindMapCssColor,
} from "../src/presentation/color-contrast";
import {
	CHARCOAL_DOT_EFFECT_ID,
	CHARCOAL_EDGE_EFFECT_ID,
	CHARCOAL_FILL_EFFECT_ID,
	CHARCOAL_PAPER_EFFECT_ID,
	CHARCOAL_STROKE_EFFECT_ID,
	TECHNICAL_GRID_EFFECT_ID,
  createMindMapRenderEffectResolver,
  getStyleRequiredEffectIds,
} from "../src/presentation/render-effects";
import {
  BUILT_IN_MIND_MAP_PALETTE_SPECS,
  COASTAL_INK_PALETTE_LABEL,
  CORAL_TIDE_PALETTE_LABEL,
  DEEP_LAGOON_PALETTE_LABEL,
  GRAPHITE_PALETTE_LABEL,
  MORANDI_MINT_PALETTE_LABEL,
  RETRO_AUTUMN_PALETTE_LABEL,
  SPECTRUM_PALETTE_LABEL,
  createCoastalInkPaletteSpec,
  createCoralTidePaletteSpec,
  createDeepLagoonPaletteSpec,
  createMindMapPaletteRegistry,
  createMorandiMintPaletteSpec,
  createPencilSketchPaletteSpec,
  createRetroAutumnPaletteSpec,
  validateMindMapPaletteSpec,
} from "../src/presentation/palettes";
import {
  COLORFUL_STYLE_ID,
  DEFAULT_MIND_MAP_PALETTE_ID,
  DEFAULT_MIND_MAP_STYLE_ID,
  PENCIL_SKETCH_STYLE_ID,
  createCloudThemeSpec,
  createMindMapThemeCompositionRegistry,
  createPencilSketchThemeSpec,
} from "../src/presentation/themes";
import {
	ATLAS_CARDS_STYLE_ID,
  BUILT_IN_MIND_MAP_STYLE_SPECS,
	CHARCOAL_STYLE_ID,
	CLOUD_STYLE_ID,
	SWISS_EDITORIAL_STYLE_ID,
	TECHNICAL_DRAFT_STYLE_ID,
	createAtlasCardsStyleSpec,
	createCharcoalStyleSpec,
	createCloudStyleSpec,
  createMindMapStyleRegistry,
  createPencilSketchStyleSpec,
	createSwissEditorialStyleSpec,
	createTechnicalDraftStyleSpec,
} from "../src/presentation/styles";

const composition =
  BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition;

function literal(value: string): Readonly<{ kind: "literal"; value: string }> {
  return { kind: "literal", value };
}

function expectLiteralColorContrast(
  foreground: MindMapThemeColor | undefined,
  background: MindMapThemeColor | undefined,
  description: string,
): void {
  if (foreground?.kind !== "literal" || background?.kind !== "literal") {
    throw new Error(`${description} must use literal colors.`);
  }
  const foregroundRgba = parseMindMapCssColor(foreground.value);
  const backgroundRgba = parseMindMapCssColor(background.value);
  if (foregroundRgba === null || backgroundRgba === null) {
    throw new Error(`${description} must parse as CSS colors.`);
  }

  expect(
    calculateMindMapColorContrast(foregroundRgba, backgroundRgba),
    description,
  ).toBeGreaterThanOrEqual(MIN_MIND_MAP_TEXT_CONTRAST_RATIO);
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

function findColorBearingStyleFields(
	value: unknown,
	path = "style",
): readonly string[] {
	if (Array.isArray(value)) {
		return value.flatMap((entry, index) =>
			findColorBearingStyleFields(entry, `${path}[${index}]`),
		);
	}
	if (typeof value !== "object" || value === null) {
		return [];
	}

	const fields: string[] = [];
	for (const [key, entry] of Object.entries(value)) {
		const entryPath = `${path}.${key}`;
		if (
			key === "fill" ||
			key === "stroke" ||
			key === "textColor" ||
			key === "branchColorIndex"
		) {
			fields.push(entryPath);
		}
		fields.push(...findColorBearingStyleFields(entry, entryPath));
	}
	return fields;
}

describe("mind-map style and palette composition", () => {
	it("registers the new visual-style family with stable IDs and color-free treatments", () => {
		const organic = createCloudStyleSpec();
		const swissEditorial = createSwissEditorialStyleSpec();
		const atlasCards = createAtlasCardsStyleSpec();
		const technicalDraft = createTechnicalDraftStyleSpec();
		const charcoal = createCharcoalStyleSpec();

		expect(
			BUILT_IN_MIND_MAP_STYLE_SPECS.map(({ id, label, revision }) => ({
				id,
				label,
				revision,
			})),
		).toEqual([
			{ id: "pencil-sketch", label: "Pencil sketch", revision: "pencil-sketch-style-v1" },
			{ id: CLOUD_STYLE_ID, label: "Organic Classic", revision: "cloud-style-v3" },
			{ id: "colorful", label: "Colorful", revision: "colorful-style-v1" },
			{ id: SWISS_EDITORIAL_STYLE_ID, label: "Swiss Editorial", revision: "swiss-editorial-style-v1" },
			{ id: ATLAS_CARDS_STYLE_ID, label: "Atlas Cards", revision: "atlas-cards-style-v2" },
			{ id: TECHNICAL_DRAFT_STYLE_ID, label: "Technical Draft", revision: "technical-draft-style-v1" },
			{ id: CHARCOAL_STYLE_ID, label: "Charcoal", revision: "charcoal-style-v1" },
		]);

		expect(organic.tokens.edge).toMatchObject({
		routing: "bezier",
		connectorProfile: { kind: "taper-to-child", childWidthRatio: 0.42 },
	});
		expect(organic.tokens.roles.mainTopic.shape).toBe("none");
		expect(organic.tokens.roles.subtopic.shape).toBe("none");
		expect(swissEditorial.tokens.edge.routing).toBe("rounded-orthogonal");
		expect(swissEditorial.tokens.roles.mainTopic.shape).toBe("underline");
		expect(atlasCards.tokens.branches.colorNodeFill).toBe(true);
		expect(atlasCards.tokens.edge).toMatchObject({
			routing: "straight",
			width: 1.15,
		});
		expect(atlasCards.tokens.nodeTreatment.fillSourceByRole).toEqual({
			root: "automatic",
			mainTopic: "branch",
			subtopic: "surface",
		});
		expect(atlasCards.tokens.roles.subtopic.shape).toBe("rounded-rectangle");
		expect(technicalDraft.tokens.typography.fontFamilyToken).toBe(
			"font-monospace",
		);
		expect(technicalDraft.tokens.effects.canvasTexture).toEqual({
			profileId: TECHNICAL_GRID_EFFECT_ID,
			options: { size: 24, majorEvery: 5, opacity: 0.18 },
		});
		expect(technicalDraft.tokens.edge.routing).toBe("orthogonal");
		expect(charcoal.tokens.effects).toMatchObject({
			canvasTexture: {
				profileId: CHARCOAL_PAPER_EFFECT_ID,
				options: { strength: 0.8 },
			},
			nodeStroke: {
				profileId: CHARCOAL_STROKE_EFFECT_ID,
				options: { roughness: 1.55 },
			},
			nodeFill: {
				profileId: CHARCOAL_FILL_EFFECT_ID,
				options: { opacity: 0.07 },
			},
			edgeStroke: {
				profileId: CHARCOAL_EDGE_EFFECT_ID,
				options: { roughness: 1.45 },
			},
			terminalMarker: { effect: { profileId: CHARCOAL_DOT_EFFECT_ID } },
		});
		expect(getStyleRequiredEffectIds(technicalDraft)).toEqual([
			TECHNICAL_GRID_EFFECT_ID,
		]);
		expect(getStyleRequiredEffectIds(charcoal)).toEqual([
			CHARCOAL_PAPER_EFFECT_ID,
			CHARCOAL_STROKE_EFFECT_ID,
			CHARCOAL_FILL_EFFECT_ID,
			CHARCOAL_EDGE_EFFECT_ID,
			CHARCOAL_DOT_EFFECT_ID,
		]);

		for (const style of [
			organic,
			swissEditorial,
			atlasCards,
			technicalDraft,
			charcoal,
		]) {
			expect(findColorBearingStyleFields(style), style.id).toEqual([]);
		}
	});

	it("uses a palette-specific display vocabulary without changing stable IDs", () => {
    expect(
      BUILT_IN_MIND_MAP_PALETTE_SPECS.map(({ id, label }) => ({ id, label })),
    ).toEqual([
      { id: "pencil-sketch", label: GRAPHITE_PALETTE_LABEL },
      { id: "colorful", label: SPECTRUM_PALETTE_LABEL },
      { id: "morandi-mint", label: MORANDI_MINT_PALETTE_LABEL },
      { id: "retro-autumn", label: RETRO_AUTUMN_PALETTE_LABEL },
      { id: "coastal-ink", label: COASTAL_INK_PALETTE_LABEL },
      { id: "deep-lagoon", label: DEEP_LAGOON_PALETTE_LABEL },
      { id: "coral-tide", label: CORAL_TIDE_PALETTE_LABEL },
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

	it("keeps pre-treatment styles compatible while rejecting unknown fill sources", () => {
		const current = createDefaultMindMapStyleSpec({
			id: "legacy-fill-style",
			label: "Legacy fill style",
		});
		const { nodeTreatment: _nodeTreatment, ...legacyTokens } =
			current.tokens;
		const legacy = {
			...current,
			tokens: legacyTokens,
		} as typeof current;
		const palette = createDefaultMindMapPaletteSpec({ id: "legacy-fill-palette" });

		expect(() =>
			createMindMapStyleRegistry(
				[legacy],
				BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
				legacy.id,
			),
		).not.toThrow();
		expect(
			composeMindMapTheme(legacy, palette).tokens.nodeTreatment
				.fillSourceByRole,
		).toEqual({
			root: "automatic",
			mainTopic: "automatic",
			subtopic: "automatic",
		});

		const invalid = {
			...current,
			id: "invalid-fill-source",
			tokens: {
				...current.tokens,
				nodeTreatment: {
					fillSourceByRole: { mainTopic: "not-a-fill-source" },
				},
			},
		} as unknown as typeof current;
		expect(() =>
			createMindMapStyleRegistry(
				[invalid],
				BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
				invalid.id,
			),
		).toThrow("Style node fill source for mainTopic is not registered.");
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

  it("registers the Color Hunt palettes with independent dark and light color data", () => {
    const coastalInk = createCoastalInkPaletteSpec();
    const deepLagoon = createDeepLagoonPaletteSpec();
    const coralTide = createCoralTidePaletteSpec();

    expect(coastalInk).toMatchObject({
      id: "coastal-ink",
      label: COASTAL_INK_PALETTE_LABEL,
      colors: {
        canvas: literal("#171C22"),
        surface: literal("#222831"),
        accent: literal("#00ADB5"),
        text: literal("#F1F5F9"),
      },
      lightColors: {
        canvas: literal("#F9FBFC"),
        surface: literal("#FFFFFF"),
        accent: literal("#3F72AF"),
        text: literal("#112D4E"),
      },
      lightRoles: {
        root: {
          fill: literal("#3F72AF"),
          textColor: literal("#FFFFFF"),
        },
      },
    });
    expect(deepLagoon).toMatchObject({
      id: "deep-lagoon",
      label: DEEP_LAGOON_PALETTE_LABEL,
      colors: {
        canvas: literal("#241A33"),
        surface: literal("#321E48"),
        accent: literal("#65DCD5"),
        text: literal("#D9FFF4"),
      },
      lightColors: {
        canvas: literal("#F7FFFC"),
        surface: literal("#FFFFFF"),
        accent: literal("#43637E"),
        text: literal("#21354A"),
      },
      lightRoles: {
        root: {
          fill: literal("#43637E"),
          textColor: literal("#FFFFFF"),
        },
      },
    });
    expect(coralTide).toMatchObject({
      id: "coral-tide",
      label: CORAL_TIDE_PALETTE_LABEL,
      colors: {
        canvas: literal("#211A22"),
        surface: literal("#302634"),
        accent: literal("#FFB6A6"),
        text: literal("#FFF3ED"),
      },
      lightColors: {
        canvas: literal("#FFFCF8"),
        surface: literal("#FFF7F0"),
        accent: literal("#336A91"),
        text: literal("#3D2B35"),
      },
      lightRoles: {
        root: {
          fill: literal("#336A91"),
          textColor: literal("#FFFFFF"),
        },
      },
    });

    for (const palette of [coastalInk, deepLagoon, coralTide]) {
      expect(palette.colors.branchPalette, palette.id).toHaveLength(8);
      expect(palette.lightColors?.branchPalette, palette.id).toHaveLength(8);
      expect(palette.roles.root.fill, palette.id).toBeDefined();
      expect(palette.lightRoles?.root?.fill, palette.id).toBeDefined();
    }
  });

  it("validates Color Hunt palettes and keeps their critical text pairs readable", () => {
    const palettes = [
      createCoastalInkPaletteSpec(),
      createDeepLagoonPaletteSpec(),
      createCoralTidePaletteSpec(),
    ];

    for (const palette of palettes) {
      expect(() => validateMindMapPaletteSpec(palette)).not.toThrow();
      expect(() =>
        createMindMapPaletteRegistry([palette], palette.id),
      ).not.toThrow();

      const theme = composition.compose("colorful", palette.id);
      for (const colorScheme of ["dark", "light"] as const) {
        const colors = resolveMindMapThemeColors(theme, colorScheme);
        const roles = resolveMindMapThemeRoles(theme, colorScheme);
        expectLiteralColorContrast(
          colors.text,
          colors.canvas,
          `${palette.id}/${colorScheme}/canvas`,
        );
        expectLiteralColorContrast(
          colors.textOnAccent,
          colors.accent,
          `${palette.id}/${colorScheme}/accent`,
        );
        expectLiteralColorContrast(
          roles.root.textColor,
          roles.root.fill,
          `${palette.id}/${colorScheme}/root`,
        );
        for (const [index, fill] of colors.branchPalette.entries()) {
          const text = resolveMindMapNodeTextColor({
            shape: "rounded-rectangle",
            effectiveFill: fill,
            canvas: colors.canvas,
            defaultTextColor: colors.text,
            contrastTextColor: colors.textOnAccent,
          });
          expectLiteralColorContrast(
            text,
            fill,
            `${palette.id}/${colorScheme}/branch-${index + 1}`,
          );
        }
      }
    }
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
      "swiss-editorial",
      "atlas-cards",
      "technical-draft",
      "charcoal",
    ]);
    expect(composition.palettes.list().map(({ id }) => id)).toEqual([
      "pencil-sketch",
      "colorful",
      "morandi-mint",
      "retro-autumn",
      "coastal-ink",
      "deep-lagoon",
      "coral-tide",
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

  it("does not let Color Hunt palettes change Colorful geometry or treatment", () => {
    const baseline = composition.compose("colorful", "colorful");
    const expectedTreatment = getPaletteInvariantStyleTreatment(baseline);

    for (const paletteId of [
      "coastal-ink",
      "deep-lagoon",
      "coral-tide",
    ]) {
      const composed = composition.compose("colorful", paletteId);
      expect(composed.styleId).toBe("colorful");
      expect(getPaletteInvariantStyleTreatment(composed)).toEqual(
        expectedTreatment,
      );
    }
  });

  it("keeps maintained legacy theme helpers visually valid", () => {
    const pencil = createPencilSketchThemeSpec();
    const cloud = createCloudThemeSpec();

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
    expect(cloud.styleId).toBe("cloud");
    expect(cloud.paletteId).toBe("colorful");
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
      composition.composeOrDefault("removed", "colorful").styleId,
    ).toBe(COLORFUL_STYLE_ID);
    expect(
      composition.composeOrDefault("pencil-sketch", "removed").paletteId,
    ).toBe("colorful");
    expect(() => composition.compose("removed", "colorful")).toThrow(
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
            createExportPaint(colors) {
              return { kind: "color", value: colors.background };
            },
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
    expect(registry.resolveNodeFill(ref)).toMatchObject({
      profileId: "custom-fill",
      variables: { "--obmind-effect-custom-fill": "1" },
    });
    expect(
      registry.resolveNodeFill(ref)?.createExportPaint({
        background: "#f4f4f4",
        stroke: "#222222",
      }),
    ).toEqual({ kind: "color", value: "#f4f4f4" });
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
    ).toMatchObject({
      profileId: paper?.profileId,
      variables: paper?.variables,
    });
    expect(paper?.profileId).toBe("paper-grain");
    expect(border?.profileId).toBe("pencil-double");
    expect(fill?.variables["--obmind-effect-hatch-opacity"]).toBe("9%");
    expect(strokes).toHaveLength(2);
		expect(marker).toEqual({
			profileId: "pencil-dot",
			shape: "circle",
			opacity: 1,
		});
  });
});
