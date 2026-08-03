import {
  createHandDrawnBorderParameters,
  createHandDrawnPaperParameters,
  createHandDrawnStrokes,
  type HandDrawnPoint,
  type HandDrawnStroke,
} from "../presentation/hand-drawn";
import type {
  MindMapRenderEffectKind,
  MindMapRenderEffectRef,
} from "../presentation/presentation";
import {
  PAPER_GRAIN_EFFECT_ID,
  PENCIL_DOT_EFFECT_ID,
  PENCIL_DOUBLE_STROKE_EFFECT_ID,
  PENCIL_EDGE_EFFECT_ID,
  PENCIL_HATCH_EFFECT_ID,
  createMindMapRenderEffectResolver,
  type MindMapRenderEffectCapability,
  type MindMapRenderEffectResolver,
} from "../presentation/render-effects";

export interface DomSvgCssEffect {
  readonly profileId: string;
  readonly variables: Readonly<Record<string, string>>;
}

export interface DomSvgTerminalMarkerEffect {
  readonly profileId: string;
  readonly shape: "circle";
}

interface BaseDomSvgMindMapEffectDefinition {
  readonly id: string;
  readonly label: string;
}

export type DomSvgMindMapEffectDefinition =
  | (BaseDomSvgMindMapEffectDefinition & {
      readonly kind: "canvas-texture";
      readonly apply: (
        ref: MindMapRenderEffectRef,
        stableKey: string,
      ) => DomSvgCssEffect;
    })
  | (BaseDomSvgMindMapEffectDefinition & {
      readonly kind: "node-stroke";
      readonly apply: (
        ref: MindMapRenderEffectRef,
        stableKey: string,
      ) => DomSvgCssEffect;
    })
  | (BaseDomSvgMindMapEffectDefinition & {
      readonly kind: "node-fill";
      readonly apply: (ref: MindMapRenderEffectRef) => DomSvgCssEffect;
    })
  | (BaseDomSvgMindMapEffectDefinition & {
      readonly kind: "edge-stroke";
      readonly apply: (
        ref: MindMapRenderEffectRef,
        points: readonly HandDrawnPoint[],
        stableKey: string,
      ) => readonly HandDrawnStroke[];
    })
  | (BaseDomSvgMindMapEffectDefinition & {
      readonly kind: "terminal-marker";
      readonly apply: (
        ref: MindMapRenderEffectRef,
      ) => DomSvgTerminalMarkerEffect;
    });

/**
 * Capability discovery and adapter implementation intentionally share this
 * registry. A profile cannot be advertised or accepted by theme validation
 * unless this DOM/SVG adapter also has a typed implementation for its kind.
 */
export interface DomSvgMindMapEffectRegistry
  extends MindMapRenderEffectResolver {
  resolveCanvasTexture(
    ref: MindMapRenderEffectRef | null,
    stableKey: string,
  ): DomSvgCssEffect | null;
  resolveNodeStroke(
    ref: MindMapRenderEffectRef | null,
    stableKey: string,
  ): DomSvgCssEffect | null;
  resolveNodeFill(ref: MindMapRenderEffectRef | null): DomSvgCssEffect | null;
  createEdgeStrokes(
    ref: MindMapRenderEffectRef | null,
    points: readonly HandDrawnPoint[],
    stableKey: string,
  ): readonly HandDrawnStroke[] | null;
  resolveTerminalMarker(
    ref: MindMapRenderEffectRef | null,
  ): DomSvgTerminalMarkerEffect | null;
}

export function createDomSvgMindMapEffectRegistry(
  definitions: readonly DomSvgMindMapEffectDefinition[],
): DomSvgMindMapEffectRegistry {
  const registeredDefinitions = [...definitions];
  const capabilities: MindMapRenderEffectCapability[] =
    registeredDefinitions.map(({ id, label, kind }) => ({ id, label, kind }));
  const resolver = createMindMapRenderEffectResolver(capabilities);
  const definitionsById = new Map(
    registeredDefinitions.map((definition) => [definition.id, definition]),
  );

  return {
    list(): readonly MindMapRenderEffectCapability[] {
      return resolver.list();
    },
    has(profileId, kind): boolean {
      return resolver.has(profileId, kind);
    },
    resolve(profileId, expectedKind): MindMapRenderEffectCapability {
      return resolver.resolve(profileId, expectedKind);
    },
    resolveCanvasTexture(ref, stableKey) {
      if (ref === null) {
        return null;
      }
      return resolveDefinition(
        ref,
        "canvas-texture",
        resolver,
        definitionsById,
      ).apply(ref, stableKey);
    },
    resolveNodeStroke(ref, stableKey) {
      if (ref === null) {
        return null;
      }
      return resolveDefinition(
        ref,
        "node-stroke",
        resolver,
        definitionsById,
      ).apply(ref, stableKey);
    },
    resolveNodeFill(ref) {
      if (ref === null) {
        return null;
      }
      return resolveDefinition(
        ref,
        "node-fill",
        resolver,
        definitionsById,
      ).apply(ref);
    },
    createEdgeStrokes(ref, points, stableKey) {
      if (ref === null) {
        return null;
      }
      return resolveDefinition(
        ref,
        "edge-stroke",
        resolver,
        definitionsById,
      ).apply(ref, points, stableKey);
    },
    resolveTerminalMarker(ref) {
      if (ref === null) {
        return null;
      }
      return resolveDefinition(
        ref,
        "terminal-marker",
        resolver,
        definitionsById,
      ).apply(ref);
    },
  };
}

type DomSvgDefinitionFor<Kind extends MindMapRenderEffectKind> = Extract<
  DomSvgMindMapEffectDefinition,
  { readonly kind: Kind }
>;

function resolveDefinition<Kind extends MindMapRenderEffectKind>(
  ref: MindMapRenderEffectRef,
  expectedKind: Kind,
  resolver: MindMapRenderEffectResolver,
  definitionsById: ReadonlyMap<string, DomSvgMindMapEffectDefinition>,
): DomSvgDefinitionFor<Kind> {
  resolver.resolve(ref.profileId, expectedKind);
  const definition = definitionsById.get(ref.profileId);
  if (definition === undefined || definition.kind !== expectedKind) {
    throw new Error(
      `Render-effect profile "${ref.profileId}" has no DOM/SVG implementation for "${expectedKind}".`,
    );
  }
  return definition as DomSvgDefinitionFor<Kind>;
}

function numberOption(
  ref: MindMapRenderEffectRef,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = ref.options[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

export const BUILT_IN_DOM_SVG_EFFECT_DEFINITIONS: readonly DomSvgMindMapEffectDefinition[] =
  [
    {
      id: PAPER_GRAIN_EFFECT_ID,
      label: "Paper grain",
      kind: "canvas-texture",
      apply(ref, stableKey): DomSvgCssEffect {
        const parameters = createHandDrawnPaperParameters(
          stableKey,
          numberOption(ref, "strength", 1, 0, 2),
        );
        return {
          profileId: ref.profileId,
          variables: {
            "--obmind-effect-paper-fine-cell": `${parameters.fineCellSize}px`,
            "--obmind-effect-paper-coarse-cell":
              `${parameters.coarseCellSize}px`,
            "--obmind-effect-paper-offset-x": `${parameters.offsetX}px`,
            "--obmind-effect-paper-offset-y": `${parameters.offsetY}px`,
            "--obmind-effect-paper-opacity": String(parameters.opacity),
          },
        };
      },
    },
    {
      id: PENCIL_DOUBLE_STROKE_EFFECT_ID,
      label: "Pencil double outline",
      kind: "node-stroke",
      apply(ref, stableKey): DomSvgCssEffect {
        const parameters = createHandDrawnBorderParameters(
          stableKey,
          numberOption(ref, "roughness", 1.15, 0, 4),
        );
        return {
          profileId: ref.profileId,
          variables: {
            "--obmind-effect-border-rotation":
              `${parameters.rotationDegrees}deg`,
            "--obmind-effect-border-offset-x": `${parameters.offsetX}px`,
            "--obmind-effect-border-offset-y": `${parameters.offsetY}px`,
            "--obmind-effect-border-inset": `${parameters.inset}px`,
            "--obmind-effect-border-opacity": String(parameters.opacity),
          },
        };
      },
    },
    {
      id: PENCIL_HATCH_EFFECT_ID,
      label: "Pencil hatching",
      kind: "node-fill",
      apply(ref): DomSvgCssEffect {
        return {
          profileId: ref.profileId,
          variables: {
            "--obmind-effect-hatch-opacity":
              `${numberOption(ref, "opacity", 0.08, 0, 0.3) * 100}%`,
            "--obmind-effect-hatch-gap": `${numberOption(
              ref,
              "gap",
              7,
              3,
              20,
            )}px`,
          },
        };
      },
    },
    {
      id: PENCIL_EDGE_EFFECT_ID,
      label: "Pencil edge",
      kind: "edge-stroke",
      apply(ref, points, stableKey): readonly HandDrawnStroke[] {
        return createHandDrawnStrokes(points, stableKey, {
          roughness: numberOption(ref, "roughness", 1.15, 0, 4),
          passCount: 2,
        });
      },
    },
    {
      id: PENCIL_DOT_EFFECT_ID,
      label: "Pencil endpoint dot",
      kind: "terminal-marker",
      apply(ref): DomSvgTerminalMarkerEffect {
        return {
          profileId: ref.profileId,
          shape: "circle",
        };
      },
    },
  ];

export const BUILT_IN_DOM_SVG_EFFECT_REGISTRY =
  createDomSvgMindMapEffectRegistry(BUILT_IN_DOM_SVG_EFFECT_DEFINITIONS);
