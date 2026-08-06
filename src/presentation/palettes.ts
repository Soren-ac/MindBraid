import {
  createDefaultMindMapPaletteSpec,
  hostColor,
  isSafeHostColorToken,
  isSafeLiteralColor,
  literalColor,
  type MindMapPaletteSpec,
  type MindMapThemeColor,
} from "./presentation";

export const PENCIL_SKETCH_PALETTE_ID = "pencil-sketch";
/** Retired palette IDs that stay reserved for persisted-data migration. */
export const LEGACY_MIND_MAP_PALETTE_IDS: readonly string[] = Object.freeze([
  "cloud",
]);
export const COLORFUL_PALETTE_ID = "colorful";
export const MORANDI_MINT_PALETTE_ID = "morandi-mint";
export const RETRO_AUTUMN_PALETTE_ID = "retro-autumn";
export const COASTAL_INK_PALETTE_ID = "coastal-ink";
export const DEEP_LAGOON_PALETTE_ID = "deep-lagoon";
export const CORAL_TIDE_PALETTE_ID = "coral-tide";
export const DEFAULT_MIND_MAP_PALETTE_ID = COLORFUL_PALETTE_ID;

/**
 * User-facing palette names intentionally describe color character rather
 * than repeating the names of the independently selectable visual Styles.
 * The stable IDs above retain compatibility with existing persisted data.
 */
export const GRAPHITE_PALETTE_LABEL = "Graphite";
export const SPECTRUM_PALETTE_LABEL = "Spectrum";
export const MORANDI_MINT_PALETTE_LABEL = "Morandi Mint";
export const RETRO_AUTUMN_PALETTE_LABEL = "Retro Autumn";
export const COASTAL_INK_PALETTE_LABEL = "Coastal Ink";
export const DEEP_LAGOON_PALETTE_LABEL = "Deep Lagoon";
export const CORAL_TIDE_PALETTE_LABEL = "Coral Tide";

export interface MindMapPaletteRegistry {
  list(): readonly MindMapPaletteSpec[];
  has(paletteId: string): boolean;
  resolve(paletteId: string): MindMapPaletteSpec;
  resolveOrDefault(
    paletteId: string | null | undefined,
  ): MindMapPaletteSpec;
}

export function createPencilSketchPaletteSpec(): MindMapPaletteSpec {
  return createDefaultMindMapPaletteSpec({
    id: PENCIL_SKETCH_PALETTE_ID,
    label: GRAPHITE_PALETTE_LABEL,
    revision: "pencil-sketch-palette-v1",
    colors: {
      canvas: hostColor("background-primary"),
      surface: hostColor("background-primary"),
      surfaceEmphasis: hostColor("background-secondary"),
      surfaceHover: hostColor("background-modifier-hover"),
      text: hostColor("text-normal"),
      textOnAccent: hostColor("text-normal"),
      textMuted: hostColor("text-muted"),
      border: hostColor("text-faint"),
      borderHover: hostColor("text-muted"),
      accent: hostColor("text-muted"),
      edge: hostColor("text-faint"),
      selection: hostColor("background-modifier-border-focus"),
      branchPalette: [
        hostColor("color-blue"),
        hostColor("color-green"),
        hostColor("color-orange"),
        hostColor("color-red"),
        hostColor("color-purple"),
        hostColor("color-cyan"),
      ],
    },
    roles: {
      root: {
        fill: hostColor("background-secondary"),
        stroke: hostColor("text-muted"),
        textColor: hostColor("text-normal"),
      },
    },
    lightColors: {
      border: hostColor("text-muted"),
      borderHover: hostColor("text-normal"),
      accent: hostColor("interactive-accent"),
      edge: hostColor("text-muted"),
    },
  });
}

export function createColorfulPaletteSpec(): MindMapPaletteSpec {
  return createDefaultMindMapPaletteSpec({
    id: COLORFUL_PALETTE_ID,
    label: SPECTRUM_PALETTE_LABEL,
    revision: "colorful-palette-v1",
    colors: {
      canvas: hostColor("background-primary"),
      surface: hostColor("background-primary"),
      surfaceEmphasis: hostColor("background-secondary"),
      surfaceHover: hostColor("background-modifier-hover"),
      text: hostColor("text-normal"),
      textOnAccent: hostColor("text-on-accent"),
      textMuted: hostColor("text-muted"),
      border: hostColor("background-modifier-border"),
      borderHover: hostColor("text-muted"),
      accent: hostColor("interactive-accent"),
      edge: hostColor("text-faint"),
      selection: hostColor("background-modifier-border-focus"),
      branchPalette: [
        hostColor("color-red"),
        hostColor("color-orange"),
        hostColor("color-green"),
        hostColor("color-cyan"),
        hostColor("color-purple"),
        hostColor("color-blue"),
        hostColor("color-pink"),
        hostColor("color-yellow"),
      ],
    },
    roles: {
      root: {
        textColor: hostColor("text-normal"),
      },
      mainTopic: {
        textColor: hostColor("text-on-accent"),
      },
    },
    lightColors: {
      canvas: literalColor("#ffffff"),
      surface: literalColor("#ffffff"),
      surfaceEmphasis: literalColor("#f5f5f5"),
      edge: hostColor("text-muted"),
    },
  });
}

/**
 * Muted mint and dusty pastel colors from the supplied Morandi Mint reference.
 * Light mode preserves the source palette exactly; the base colors form a
 * contrast-safe dark companion without changing Style-owned geometry.
 */
export function createMorandiMintPaletteSpec(): MindMapPaletteSpec {
  return createDefaultMindMapPaletteSpec({
    id: MORANDI_MINT_PALETTE_ID,
    label: MORANDI_MINT_PALETTE_LABEL,
    revision: "morandi-mint-palette-v1",
    colors: {
      canvas: literalColor("#1B211E"),
      surface: literalColor("#252C28"),
      surfaceEmphasis: literalColor("#607A64"),
      surfaceHover: literalColor("#303A34"),
      text: literalColor("#E4EAE5"),
      textOnAccent: literalColor("#FFFFFF"),
      textMuted: literalColor("#AAB6AD"),
      border: literalColor("#465249"),
      borderHover: literalColor("#718178"),
      accent: literalColor("#8BA88E"),
      edge: literalColor("#71898A"),
      selection: literalColor("#7F98AD"),
      branchPalette: literalPaletteColors([
        "#875E64",
        "#53677B",
        "#75613A",
        "#765E72",
        "#506B70",
      ]),
    },
    roles: {
      root: {
        fill: literalColor("#607A64"),
        stroke: literalColor("#8BA88E"),
        textColor: literalColor("#FFFFFF"),
      },
    },
    lightColors: {
      canvas: literalColor("#F9F9F9"),
      surface: literalColor("#FFFFFF"),
      surfaceEmphasis: literalColor("#8BA88E"),
      surfaceHover: literalColor("#F0F3F0"),
      text: literalColor("#4B5563"),
      textOnAccent: literalColor("#FFFFFF"),
      textMuted: literalColor("#7B8490"),
      border: literalColor("#E5E7EB"),
      borderHover: literalColor("#93A8AC"),
      accent: literalColor("#8BA88E"),
      edge: literalColor("#93A8AC"),
      selection: literalColor("#A3B5C9"),
      branchPalette: literalPaletteColors([
        "#E3B4B8",
        "#A3B5C9",
        "#DDC69B",
        "#C2A9B9",
        "#93A8AC",
      ]),
    },
    lightRoles: {
      root: {
        fill: literalColor("#8BA88E"),
        stroke: literalColor("#8BA88E"),
        textColor: literalColor("#2F3A33"),
      },
    },
  });
}

/**
 * Warm terracotta, ochre, olive, and walnut colors from the supplied Retro
 * Autumn reference, with an explicit dark companion for ObMind dark mode.
 */
export function createRetroAutumnPaletteSpec(): MindMapPaletteSpec {
  return createDefaultMindMapPaletteSpec({
    id: RETRO_AUTUMN_PALETTE_ID,
    label: RETRO_AUTUMN_PALETTE_LABEL,
    revision: "retro-autumn-palette-v1",
    colors: {
      canvas: literalColor("#211A16"),
      surface: literalColor("#2B231E"),
      surfaceEmphasis: literalColor("#A94E2F"),
      surfaceHover: literalColor("#392D25"),
      text: literalColor("#F0E7DE"),
      textOnAccent: literalColor("#FFFFFF"),
      textMuted: literalColor("#BCA99A"),
      border: literalColor("#59473B"),
      borderHover: literalColor("#8E6A52"),
      accent: literalColor("#D46A43"),
      edge: literalColor("#A37B58"),
      selection: literalColor("#C4883B"),
      branchPalette: literalPaletteColors([
        "#845724",
        "#536249",
        "#7E3F36",
        "#806044",
        "#544038",
      ]),
    },
    roles: {
      root: {
        fill: literalColor("#A94E2F"),
        stroke: literalColor("#D46A43"),
        textColor: literalColor("#FFFFFF"),
      },
    },
    lightColors: {
      canvas: literalColor("#FDFBF7"),
      surface: literalColor("#F4EFE6"),
      surfaceEmphasis: literalColor("#D46A43"),
      surfaceHover: literalColor("#F8F2E9"),
      text: literalColor("#5C4A3D"),
      textOnAccent: literalColor("#FFFFFF"),
      textMuted: literalColor("#8B7767"),
      border: literalColor("#E2D9C8"),
      borderHover: literalColor("#C29B72"),
      accent: literalColor("#D46A43"),
      edge: literalColor("#C29B72"),
      selection: literalColor("#E4A757"),
      branchPalette: literalPaletteColors([
        "#E4A757",
        "#7E8D70",
        "#B25D4F",
        "#C29B72",
        "#6D5A50",
      ]),
    },
    lightRoles: {
      root: {
        fill: literalColor("#D46A43"),
        stroke: literalColor("#D46A43"),
        textColor: literalColor("#FFFFFF"),
      },
    },
  });
}

/**
 * Cool marine ink colors with a deliberately dark companion. The palette
 * keeps the color-only contract: node treatments remain owned by the selected
 * Style, while the palette supplies readable surfaces, roles, and branches.
 */
export function createCoastalInkPaletteSpec(): MindMapPaletteSpec {
  return createDefaultMindMapPaletteSpec({
    id: COASTAL_INK_PALETTE_ID,
    label: COASTAL_INK_PALETTE_LABEL,
    revision: "coastal-ink-palette-v1",
    colors: {
      canvas: literalColor("#171C22"),
      surface: literalColor("#222831"),
      surfaceEmphasis: literalColor("#00ADB5"),
      surfaceHover: literalColor("#303B47"),
      text: literalColor("#F1F5F9"),
      textOnAccent: literalColor("#10262A"),
      textMuted: literalColor("#B7C5D1"),
      border: literalColor("#4C5A67"),
      borderHover: literalColor("#7C90A2"),
      accent: literalColor("#00ADB5"),
      edge: literalColor("#7B97A6"),
      selection: literalColor("#6ADBE0"),
      branchPalette: literalPaletteColors([
        "#00ADB5",
        "#4AA3DF",
        "#A78BFA",
        "#F0A35E",
        "#E879A7",
        "#79C99E",
        "#D5B66F",
        "#78B7B9",
      ]),
    },
    roles: {
      root: {
        fill: literalColor("#00ADB5"),
        stroke: literalColor("#6ADBE0"),
        textColor: literalColor("#10262A"),
      },
    },
    lightColors: {
      canvas: literalColor("#F9FBFC"),
      surface: literalColor("#FFFFFF"),
      surfaceEmphasis: literalColor("#3F72AF"),
      surfaceHover: literalColor("#EEF4F8"),
      text: literalColor("#112D4E"),
      textOnAccent: literalColor("#FFFFFF"),
      textMuted: literalColor("#526779"),
      border: literalColor("#DBE2EF"),
      borderHover: literalColor("#8AA8C6"),
      accent: literalColor("#3F72AF"),
      edge: literalColor("#5E7F9F"),
      selection: literalColor("#6EA8D5"),
      branchPalette: literalPaletteColors([
        "#3F72AF",
        "#277DA1",
        "#19766F",
        "#B05A79",
        "#A85E22",
        "#7868B5",
        "#537A3F",
        "#3C7897",
      ]),
    },
    lightRoles: {
      root: {
        fill: literalColor("#3F72AF"),
        stroke: literalColor("#3F72AF"),
        textColor: literalColor("#FFFFFF"),
      },
    },
  });
}

/**
 * Violet water and turquoise highlights. The light and dark definitions are
 * separate semantic palettes rather than CSS inversion, so their text and
 * primary-topic combinations remain readable in both host schemes.
 */
export function createDeepLagoonPaletteSpec(): MindMapPaletteSpec {
  return createDefaultMindMapPaletteSpec({
    id: DEEP_LAGOON_PALETTE_ID,
    label: DEEP_LAGOON_PALETTE_LABEL,
    revision: "deep-lagoon-palette-v1",
    colors: {
      canvas: literalColor("#241A33"),
      surface: literalColor("#321E48"),
      surfaceEmphasis: literalColor("#65DCD5"),
      surfaceHover: literalColor("#3B2B54"),
      text: literalColor("#D9FFF4"),
      textOnAccent: literalColor("#153A3A"),
      textMuted: literalColor("#B8D6D1"),
      border: literalColor("#5C4D70"),
      borderHover: literalColor("#8879A2"),
      accent: literalColor("#65DCD5"),
      edge: literalColor("#83B6B5"),
      selection: literalColor("#9E8BE0"),
      branchPalette: literalPaletteColors([
        "#65DCD5",
        "#9A7ED2",
        "#6EA6D1",
        "#D796B8",
        "#E6AD63",
        "#82BE9A",
        "#C891D5",
        "#7FC5C1",
      ]),
    },
    roles: {
      root: {
        fill: literalColor("#65DCD5"),
        stroke: literalColor("#65DCD5"),
        textColor: literalColor("#153A3A"),
      },
    },
    lightColors: {
      canvas: literalColor("#F7FFFC"),
      surface: literalColor("#FFFFFF"),
      surfaceEmphasis: literalColor("#43637E"),
      surfaceHover: literalColor("#E9F7F3"),
      text: literalColor("#21354A"),
      textOnAccent: literalColor("#FFFFFF"),
      textMuted: literalColor("#5D7284"),
      border: literalColor("#C7E6DE"),
      borderHover: literalColor("#78A8A3"),
      accent: literalColor("#43637E"),
      edge: literalColor("#5A8587"),
      selection: literalColor("#8470BD"),
      branchPalette: literalPaletteColors([
        "#43637E",
        "#216F70",
        "#7764AE",
        "#A8557C",
        "#9E5B2A",
        "#41765B",
        "#83569C",
        "#2C6E90",
      ]),
    },
    lightRoles: {
      root: {
        fill: literalColor("#43637E"),
        stroke: literalColor("#43637E"),
        textColor: literalColor("#FFFFFF"),
      },
    },
  });
}

/**
 * A warm peach, sea-glass, and blue palette. Its dark companion preserves the
 * source palette's soft character while using a deliberately dark foreground
 * for the peach root and sea-glass primary topics.
 */
export function createCoralTidePaletteSpec(): MindMapPaletteSpec {
  return createDefaultMindMapPaletteSpec({
    id: CORAL_TIDE_PALETTE_ID,
    label: CORAL_TIDE_PALETTE_LABEL,
    revision: "coral-tide-palette-v1",
    colors: {
      canvas: literalColor("#211A22"),
      surface: literalColor("#302634"),
      surfaceEmphasis: literalColor("#FFB6A6"),
      surfaceHover: literalColor("#40313F"),
      text: literalColor("#FFF3ED"),
      textOnAccent: literalColor("#2C1E28"),
      textMuted: literalColor("#D3BBC4"),
      border: literalColor("#5B4855"),
      borderHover: literalColor("#937583"),
      accent: literalColor("#FFB6A6"),
      edge: literalColor("#C496A9"),
      selection: literalColor("#67A2C5"),
      branchPalette: literalPaletteColors([
        "#FFB6A6",
        "#9BCEC1",
        "#67A2C5",
        "#D7A4DF",
        "#E9C46A",
        "#E5989B",
        "#A7C7E7",
        "#D6B18A",
      ]),
    },
    roles: {
      root: {
        fill: literalColor("#FFB6A6"),
        stroke: literalColor("#FFCFBF"),
        textColor: literalColor("#2C1E28"),
      },
    },
    lightColors: {
      canvas: literalColor("#FFFCF8"),
      surface: literalColor("#FFF7F0"),
      surfaceEmphasis: literalColor("#336A91"),
      surfaceHover: literalColor("#FFF0E5"),
      text: literalColor("#3D2B35"),
      textOnAccent: literalColor("#FFFFFF"),
      textMuted: literalColor("#7C6670"),
      border: literalColor("#F0D9CB"),
      borderHover: literalColor("#D7A3A0"),
      accent: literalColor("#336A91"),
      edge: literalColor("#9D7286"),
      selection: literalColor("#67A2C5"),
      branchPalette: literalPaletteColors([
        "#336A91",
        "#2E716B",
        "#A04663",
        "#7B4E94",
        "#965C22",
        "#4B744F",
        "#9F4F43",
        "#3D6988",
      ]),
    },
    lightRoles: {
      root: {
        fill: literalColor("#336A91"),
        stroke: literalColor("#336A91"),
        textColor: literalColor("#FFFFFF"),
      },
    },
  });
}

export function createMindMapPaletteRegistry(
  palettes: readonly MindMapPaletteSpec[],
  defaultPaletteId: string,
): MindMapPaletteRegistry {
  const palettesById = new Map<string, MindMapPaletteSpec>();
  for (const palette of palettes) {
    validateMindMapPaletteSpec(palette);
    if (palettesById.has(palette.id)) {
      throw new Error(`Duplicate mind-map palette ID "${palette.id}".`);
    }
    palettesById.set(palette.id, palette);
  }

  const defaultPalette = palettesById.get(defaultPaletteId);
  if (defaultPalette === undefined) {
    throw new Error(
      `Default mind-map palette "${defaultPaletteId}" is not registered.`,
    );
  }

  const registeredPalettes = [...palettesById.values()];
  return {
    list: () => registeredPalettes,
    has: (paletteId) => palettesById.has(paletteId),
    resolve(paletteId) {
      const palette = palettesById.get(paletteId);
      if (palette !== undefined) {
        return palette;
      }
      throw new Error(
        `Unknown mind-map palette "${paletteId}". Registered palettes: ${[
          ...palettesById.keys(),
        ].join(", ")}.`,
      );
    },
    resolveOrDefault: (paletteId) =>
      paletteId === null || paletteId === undefined
        ? defaultPalette
        : (palettesById.get(paletteId) ?? defaultPalette),
  };
}

export const BUILT_IN_MIND_MAP_PALETTE_SPECS: readonly MindMapPaletteSpec[] =
  Object.freeze([
    createPencilSketchPaletteSpec(),
    createColorfulPaletteSpec(),
    createMorandiMintPaletteSpec(),
    createRetroAutumnPaletteSpec(),
    createCoastalInkPaletteSpec(),
    createDeepLagoonPaletteSpec(),
    createCoralTidePaletteSpec(),
  ]);

const BUILT_IN_MIND_MAP_PALETTE_IDS = new Set(
  BUILT_IN_MIND_MAP_PALETTE_SPECS.map(({ id }) => id),
);

export function isBuiltInMindMapPaletteId(value: unknown): value is string {
  return (
    typeof value === "string" && BUILT_IN_MIND_MAP_PALETTE_IDS.has(value)
  );
}

/**
 * Legacy palette IDs are never selectable again, so custom libraries cannot
 * repurpose a persisted ID whose historical meaning is still migrated.
 */
export function isLegacyMindMapPaletteId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    LEGACY_MIND_MAP_PALETTE_IDS.includes(value)
  );
}

export function validateMindMapPaletteSpec(palette: MindMapPaletteSpec): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(palette.id)) {
    throw new Error(`Invalid mind-map palette ID "${palette.id}".`);
  }
  if (palette.label.trim().length === 0) {
    throw new Error(`Mind-map palette "${palette.id}" requires a label.`);
  }
  const colors: readonly MindMapThemeColor[] = [
    palette.colors.canvas,
    palette.colors.surface,
    palette.colors.surfaceEmphasis,
    palette.colors.surfaceHover,
    palette.colors.text,
    palette.colors.textOnAccent,
    palette.colors.textMuted,
    palette.colors.border,
    palette.colors.borderHover,
    palette.colors.accent,
    palette.colors.edge,
    palette.colors.selection,
    ...palette.colors.branchPalette,
  ];
  const roleColors: readonly (MindMapThemeColor | undefined)[] = [
    palette.roles.root.fill,
    palette.roles.root.stroke,
    palette.roles.root.textColor,
    palette.roles.mainTopic.fill,
    palette.roles.mainTopic.stroke,
    palette.roles.mainTopic.textColor,
    palette.roles.subtopic.fill,
    palette.roles.subtopic.stroke,
    palette.roles.subtopic.textColor,
  ];
  const lightColors: readonly (MindMapThemeColor | undefined)[] =
    palette.lightColors === undefined
      ? []
      : [
          palette.lightColors.canvas,
          palette.lightColors.surface,
          palette.lightColors.surfaceEmphasis,
          palette.lightColors.surfaceHover,
          palette.lightColors.text,
          palette.lightColors.textOnAccent,
          palette.lightColors.textMuted,
          palette.lightColors.border,
          palette.lightColors.borderHover,
          palette.lightColors.accent,
          palette.lightColors.edge,
          palette.lightColors.selection,
          ...(palette.lightColors.branchPalette ?? []),
        ];
  const lightRoleColors: readonly (MindMapThemeColor | undefined)[] = [
    palette.lightRoles?.root?.fill,
    palette.lightRoles?.root?.stroke,
    palette.lightRoles?.root?.textColor,
    palette.lightRoles?.mainTopic?.fill,
    palette.lightRoles?.mainTopic?.stroke,
    palette.lightRoles?.mainTopic?.textColor,
    palette.lightRoles?.subtopic?.fill,
    palette.lightRoles?.subtopic?.stroke,
    palette.lightRoles?.subtopic?.textColor,
  ];
  for (const color of [
    ...colors,
    ...roleColors,
    ...lightColors,
    ...lightRoleColors,
  ]) {
    if (color !== undefined && !isSafePaletteColor(color)) {
      throw new Error(
        `Mind-map palette "${palette.id}" contains an unsafe color.`,
      );
    }
  }
}

function isSafePaletteColor(value: unknown): value is MindMapThemeColor {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }
  if (value.kind === "host") {
    return (
      "token" in value &&
      typeof value.token === "string" &&
      isSafeHostColorToken(value.token)
    );
  }
  return (
    value.kind === "literal" &&
    "value" in value &&
    typeof value.value === "string" &&
    isSafeLiteralColor(value.value)
  );
}

function literalPaletteColors(
  values: readonly string[],
): readonly MindMapThemeColor[] {
  return values.map((value) => literalColor(value));
}
