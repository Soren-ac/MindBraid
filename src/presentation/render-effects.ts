import type {
  MindMapRenderEffectKind,
  MindMapRenderEffectRef,
  MindMapStyleSpec,
  MindMapThemeEffectTokens,
  MindMapThemeSpec,
} from "./presentation";

export const PAPER_GRAIN_EFFECT_ID = "paper-grain";
export const PENCIL_DOUBLE_STROKE_EFFECT_ID = "pencil-double";
export const PENCIL_HATCH_EFFECT_ID = "pencil-hatch";
export const PENCIL_EDGE_EFFECT_ID = "pencil-edge";
export const PENCIL_DOT_EFFECT_ID = "pencil-dot";
/** Precise graph-paper texture used by the Technical Draft style. */
export const TECHNICAL_GRID_EFFECT_ID = "technical-grid";
/** Dry paper grain used by the Charcoal style. */
export const CHARCOAL_PAPER_EFFECT_ID = "charcoal-paper";
/** Deterministic single-pass charcoal contour. */
export const CHARCOAL_STROKE_EFFECT_ID = "charcoal-stroke";
/** Shared live, preview, and export cadence for the dry charcoal contour. */
export const CHARCOAL_CONTOUR_DASH_ARRAY = Object.freeze([
  19,
  1.3,
  7,
  0.7,
  29,
  1.1,
] as const);
/** Subtle charcoal dust/shading inside topics. */
export const CHARCOAL_FILL_EFFECT_ID = "charcoal-fill";
/** Deterministic charcoal branch stroke. */
export const CHARCOAL_EDGE_EFFECT_ID = "charcoal-edge";
/** Terminal dot treatment shared by Charcoal leaf connectors. */
export const CHARCOAL_DOT_EFFECT_ID = "charcoal-dot";

export interface MindMapRenderEffectCapability {
  readonly id: string;
  readonly label: string;
  readonly kind: MindMapRenderEffectKind;
}

export interface MindMapRenderEffectResolver {
  list(): readonly MindMapRenderEffectCapability[];
  has(profileId: string, kind?: MindMapRenderEffectKind): boolean;
  resolve(
    profileId: string,
    expectedKind?: MindMapRenderEffectKind,
  ): MindMapRenderEffectCapability;
}

export function createMindMapRenderEffectResolver(
  effects: readonly MindMapRenderEffectCapability[],
): MindMapRenderEffectResolver {
  const effectsById = new Map<string, MindMapRenderEffectCapability>();

  for (const effect of effects) {
    if (effectsById.has(effect.id)) {
      throw new Error(`Duplicate render-effect ID "${effect.id}".`);
    }
    effectsById.set(effect.id, effect);
  }

  const registered = [...effectsById.values()];
  return {
    list(): readonly MindMapRenderEffectCapability[] {
      return registered;
    },
    has(profileId: string, kind?: MindMapRenderEffectKind): boolean {
      const effect = effectsById.get(profileId);
      return effect !== undefined && (kind === undefined || effect.kind === kind);
    },
    resolve(
      profileId: string,
      expectedKind?: MindMapRenderEffectKind,
    ): MindMapRenderEffectCapability {
      const effect = effectsById.get(profileId);
      if (effect === undefined) {
        const registeredIds = [...effectsById.keys()].join(", ");
        throw new Error(
          `Unknown render-effect profile "${profileId}". Registered profiles: ${registeredIds}.`,
        );
      }
      if (expectedKind !== undefined && effect.kind !== expectedKind) {
        throw new Error(
          `Render-effect profile "${profileId}" has kind "${effect.kind}", expected "${expectedKind}".`,
        );
      }
      return effect;
    },
  };
}

export function getThemeRenderEffectRefs(
  theme: MindMapThemeSpec,
): readonly {
  readonly kind: MindMapRenderEffectKind;
  readonly ref: MindMapRenderEffectRef;
}[] {
  return getRenderEffectRefs(theme.tokens.effects);
}

export function getStyleRenderEffectRefs(
  style: MindMapStyleSpec,
): readonly {
  readonly kind: MindMapRenderEffectKind;
  readonly ref: MindMapRenderEffectRef;
}[] {
  return getRenderEffectRefs(style.tokens.effects);
}

function getRenderEffectRefs(
  effects: MindMapThemeEffectTokens,
): readonly {
  readonly kind: MindMapRenderEffectKind;
  readonly ref: MindMapRenderEffectRef;
}[] {
  const refs: {
    kind: MindMapRenderEffectKind;
    ref: MindMapRenderEffectRef;
  }[] = [];

  if (effects.canvasTexture !== null) {
    refs.push({ kind: "canvas-texture", ref: effects.canvasTexture });
  }
  if (effects.nodeStroke !== null) {
    refs.push({ kind: "node-stroke", ref: effects.nodeStroke });
  }
  if (effects.nodeFill !== null) {
    refs.push({ kind: "node-fill", ref: effects.nodeFill });
  }
  if (effects.edgeStroke !== null) {
    refs.push({ kind: "edge-stroke", ref: effects.edgeStroke });
  }
  if (effects.terminalMarker !== null) {
    refs.push({
      kind: "terminal-marker",
      ref: effects.terminalMarker.effect,
    });
  }

  return refs;
}

export function getThemeRequiredEffectIds(
  theme: MindMapThemeSpec,
): readonly string[] {
  return [
    ...new Set(
      getThemeRenderEffectRefs(theme).map(({ ref }) => ref.profileId),
    ),
  ];
}

export function getStyleRequiredEffectIds(
  style: MindMapStyleSpec,
): readonly string[] {
  return [
    ...new Set(
      getStyleRenderEffectRefs(style).map(({ ref }) => ref.profileId),
    ),
  ];
}

export function validateThemeRenderEffects(
  theme: MindMapThemeSpec,
  resolver: MindMapRenderEffectResolver,
): void {
  for (const { kind, ref } of getThemeRenderEffectRefs(theme)) {
    resolver.resolve(ref.profileId, kind);
  }
}

export function validateStyleRenderEffects(
  style: MindMapStyleSpec,
  resolver: MindMapRenderEffectResolver,
): void {
  for (const { kind, ref } of getStyleRenderEffectRefs(style)) {
    resolver.resolve(ref.profileId, kind);
  }
}
