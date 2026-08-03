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
export const CLOUD_PALETTE_ID = "cloud";
export const COLORFUL_PALETTE_ID = "colorful";
export const MORANDI_MINT_PALETTE_ID = "morandi-mint";
export const RETRO_AUTUMN_PALETTE_ID = "retro-autumn";
export const DEFAULT_MIND_MAP_PALETTE_ID = COLORFUL_PALETTE_ID;

/**
 * User-facing palette names intentionally describe color character rather
 * than repeating the names of the independently selectable visual Styles.
 * The stable IDs above retain compatibility with existing persisted data.
 */
export const GRAPHITE_PALETTE_LABEL = "Graphite";
export const AURORA_PALETTE_LABEL = "Aurora";
export const SPECTRUM_PALETTE_LABEL = "Spectrum";
export const MORANDI_MINT_PALETTE_LABEL = "Morandi Mint";
export const RETRO_AUTUMN_PALETTE_LABEL = "Retro Autumn";

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

export function createCloudPaletteSpec(): MindMapPaletteSpec {
  return createDefaultMindMapPaletteSpec({
    id: CLOUD_PALETTE_ID,
    label: AURORA_PALETTE_LABEL,
    revision: "cloud-palette-v1",
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
        fill: hostColor("interactive-accent"),
        stroke: hostColor("interactive-accent"),
        textColor: hostColor("text-on-accent"),
      },
    },
    lightColors: {
      surface: hostColor("background-secondary"),
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
    createCloudPaletteSpec(),
    createColorfulPaletteSpec(),
    createMorandiMintPaletteSpec(),
    createRetroAutumnPaletteSpec(),
  ]);

const BUILT_IN_MIND_MAP_PALETTE_IDS = new Set(
  BUILT_IN_MIND_MAP_PALETTE_SPECS.map(({ id }) => id),
);

export function isBuiltInMindMapPaletteId(value: unknown): value is string {
  return (
    typeof value === "string" && BUILT_IN_MIND_MAP_PALETTE_IDS.has(value)
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
