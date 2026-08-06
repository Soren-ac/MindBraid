import {
  createHandDrawnBorderParameters,
  createHandDrawnPaperParameters,
  createHandDrawnStrokes,
  type HandDrawnPoint,
  type HandDrawnStroke,
} from "../presentation/hand-drawn";
import type {
  MindMapExportCanvasTexture,
  MindMapExportPaint,
} from "../export/types";
import type {
  MindMapRenderEffectKind,
  MindMapRenderEffectRef,
} from "../presentation/presentation";
import {
  CHARCOAL_DOT_EFFECT_ID,
  CHARCOAL_CONTOUR_DASH_ARRAY,
  CHARCOAL_EDGE_EFFECT_ID,
  CHARCOAL_FILL_EFFECT_ID,
  CHARCOAL_PAPER_EFFECT_ID,
  CHARCOAL_STROKE_EFFECT_ID,
  PAPER_GRAIN_EFFECT_ID,
  PENCIL_DOT_EFFECT_ID,
  PENCIL_DOUBLE_STROKE_EFFECT_ID,
  PENCIL_EDGE_EFFECT_ID,
  PENCIL_HATCH_EFFECT_ID,
  TECHNICAL_GRID_EFFECT_ID,
  createMindMapRenderEffectResolver,
  type MindMapRenderEffectCapability,
  type MindMapRenderEffectResolver,
} from "../presentation/render-effects";

export interface DomSvgCssEffect {
  readonly profileId: string;
  readonly variables: Readonly<Record<string, string>>;
}

export interface DomSvgCanvasTextureExportColors {
  readonly textMuted: string;
  readonly border: string;
}

export interface DomSvgNodeFillExportColors {
  readonly background: string;
  readonly stroke: string;
}

export interface DomSvgCanvasTextureEffect extends DomSvgCssEffect {
  /**
   * Materializes the immutable renderer-neutral export descriptor from the
   * same resolved effect parameters used by the live CSS adapter.
   */
  readonly createExportTexture: (
    colors: DomSvgCanvasTextureExportColors,
  ) => MindMapExportCanvasTexture;
}

export interface DomSvgNodeFillEffect extends DomSvgCssEffect {
  /** Builds the export paint without asking the renderer to inspect an ID. */
  readonly createExportPaint: (
    colors: DomSvgNodeFillExportColors,
  ) => MindMapExportPaint;
}

export interface DomSvgNodeStrokeExportEffect {
  readonly baseStroke: "preserve" | "replace";
  readonly inset: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rotationDegrees: number;
  readonly opacity: number;
  readonly widthScale: number;
  readonly minimumWidth: number;
}

export interface DomSvgNodeStrokeContourEffect {
  readonly kind: "rough-contour";
  /** Maximum perpendicular displacement in logical scene pixels. */
  readonly roughness: number;
  /** Approximate distance between deterministic contour samples. */
  readonly sampleSpacing: number;
  /** Hard cap shared by live SVG and export capture. */
  readonly maximumPointCount: number;
  /** Optional dry-material gaps, expressed in logical scene pixels. */
  readonly dashArray: readonly number[] | null;
}

export interface DomSvgNodeStrokeEffect extends DomSvgCssEffect {
  /**
   * Renderer-neutral geometry captured from the same deterministic parameters
   * as the live CSS treatment. Export adapters consume this instead of
   * inferring a profile from a Style ID or rebuilding values from CSS text.
   */
  readonly exportEffect: DomSvgNodeStrokeExportEffect;
  /**
   * Optional path geometry used instead of a CSS-perfect border. Keeping this
   * capability on the resolved effect lets renderers stay independent from a
   * Style or effect-profile ID while live SVG and export share one contour.
   */
  readonly contour: DomSvgNodeStrokeContourEffect | null;
}

export interface DomSvgTerminalMarkerEffect {
  readonly profileId: string;
  readonly shape: "circle";
  readonly opacity: number;
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
      ) => DomSvgCanvasTextureEffect;
    })
  | (BaseDomSvgMindMapEffectDefinition & {
      readonly kind: "node-stroke";
      readonly apply: (
        ref: MindMapRenderEffectRef,
        stableKey: string,
      ) => DomSvgNodeStrokeEffect;
    })
  | (BaseDomSvgMindMapEffectDefinition & {
      readonly kind: "node-fill";
      readonly apply: (ref: MindMapRenderEffectRef) => DomSvgNodeFillEffect;
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
  ): DomSvgCanvasTextureEffect | null;
  resolveNodeStroke(
    ref: MindMapRenderEffectRef | null,
    stableKey: string,
  ): DomSvgNodeStrokeEffect | null;
  resolveNodeFill(ref: MindMapRenderEffectRef | null): DomSvgNodeFillEffect | null;
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

function createDryCharcoalStrokes(
  points: readonly HandDrawnPoint[],
  stableKey: string,
  roughness: number,
): readonly HandDrawnStroke[] {
  const [stroke] = createHandDrawnStrokes(points, stableKey, {
    roughness,
    sampleSpacing: 12,
    passCount: 1,
  });
  if (stroke === undefined) {
    return [];
  }

  return [
    {
      points: stroke.points,
      opacity: roundTo(Math.min(0.72, Math.max(0.5, stroke.opacity * 0.84))),
      widthScale: roundTo(
        Math.min(0.98, Math.max(0.78, stroke.widthScale * 0.9)),
      ),
    },
  ];
}

function roundTo(value: number, precision = 4): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

export const BUILT_IN_DOM_SVG_EFFECT_DEFINITIONS: readonly DomSvgMindMapEffectDefinition[] =
  [
    {
      id: PAPER_GRAIN_EFFECT_ID,
      label: "Paper grain",
      kind: "canvas-texture",
      apply(ref, stableKey): DomSvgCanvasTextureEffect {
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
          createExportTexture(colors) {
            return {
              kind: "paper-grain",
              fineColor: colors.textMuted,
              coarseColor: colors.border,
              fineCellSize: parameters.fineCellSize,
              coarseCellSize: parameters.coarseCellSize,
              offsetX: parameters.offsetX,
              offsetY: parameters.offsetY,
              opacity: parameters.opacity,
            };
          },
        };
      },
    },
    {
      id: PENCIL_DOUBLE_STROKE_EFFECT_ID,
      label: "Pencil double outline",
      kind: "node-stroke",
      apply(ref, stableKey): DomSvgNodeStrokeEffect {
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
          exportEffect: {
            baseStroke: "preserve",
            inset: parameters.inset,
            offsetX: parameters.offsetX,
            offsetY: parameters.offsetY,
            rotationDegrees: parameters.rotationDegrees,
            opacity: parameters.opacity,
            widthScale: 0.62,
            minimumWidth: 0.7,
          },
          contour: null,
        };
      },
    },
    {
      id: PENCIL_HATCH_EFFECT_ID,
      label: "Pencil hatching",
      kind: "node-fill",
      apply(ref): DomSvgNodeFillEffect {
        const opacity = numberOption(ref, "opacity", 0.08, 0, 0.3);
        const gap = numberOption(ref, "gap", 7, 3, 20);
        return {
          profileId: ref.profileId,
          variables: {
            "--obmind-effect-hatch-opacity": `${opacity * 100}%`,
            "--obmind-effect-hatch-gap": `${gap}px`,
          },
          createExportPaint(colors) {
            return {
              kind: "hatch",
              background: colors.background,
              color: colors.stroke,
              gap,
              opacity,
              angle: 112,
            };
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
          opacity: 1,
        };
      },
    },
    {
      id: TECHNICAL_GRID_EFFECT_ID,
      label: "Technical grid",
      kind: "canvas-texture",
      apply(ref): DomSvgCanvasTextureEffect {
        const size = numberOption(ref, "size", 24, 8, 96);
        const majorEvery = Math.round(
          numberOption(ref, "majorEvery", 5, 2, 12),
        );
        const opacity = numberOption(ref, "opacity", 0.18, 0, 0.5);
        return {
          profileId: ref.profileId,
          variables: {
            "--obmind-effect-grid-size": `${size}px`,
            "--obmind-effect-grid-major-size": `${size * majorEvery}px`,
            "--obmind-effect-grid-major-every": String(majorEvery),
            "--obmind-effect-grid-opacity": String(opacity),
          },
          createExportTexture(colors) {
            return {
              kind: "technical-grid",
              minorColor: colors.border,
              majorColor: colors.border,
              cellSize: size,
              majorEvery,
              opacity,
            };
          },
        };
      },
    },
    {
      id: CHARCOAL_PAPER_EFFECT_ID,
      label: "Charcoal paper",
      kind: "canvas-texture",
      apply(ref, stableKey): DomSvgCanvasTextureEffect {
        const parameters = createHandDrawnPaperParameters(
          stableKey,
          numberOption(ref, "strength", 0.8, 0, 2),
        );
        return {
          profileId: ref.profileId,
          variables: {
            "--obmind-effect-charcoal-grain-fine-cell":
              `${parameters.fineCellSize}px`,
            "--obmind-effect-charcoal-grain-coarse-cell":
              `${parameters.coarseCellSize}px`,
            "--obmind-effect-charcoal-grain-offset-x":
              `${parameters.offsetX}px`,
            "--obmind-effect-charcoal-grain-offset-y":
              `${parameters.offsetY}px`,
            "--obmind-effect-charcoal-grain-opacity": String(
              parameters.opacity,
            ),
          },
          createExportTexture(colors) {
            return {
              kind: "charcoal-paper",
              fineColor: colors.textMuted,
              coarseColor: colors.border,
              fineCellSize: parameters.fineCellSize,
              coarseCellSize: parameters.coarseCellSize,
              offsetX: parameters.offsetX,
              offsetY: parameters.offsetY,
              opacity: parameters.opacity,
            };
          },
        };
      },
    },
    {
      id: CHARCOAL_STROKE_EFFECT_ID,
      label: "Charcoal dry outline",
      kind: "node-stroke",
      apply(ref, stableKey): DomSvgNodeStrokeEffect {
        const roughness = numberOption(ref, "roughness", 1.55, 0, 4);
        const parameters = createHandDrawnBorderParameters(
          stableKey,
          roughness,
        );
        const inset = roundTo(parameters.inset - 1.55);
        const opacity = roundTo(
          Math.min(0.94, 0.74 + parameters.opacity * 0.42),
        );
        return {
          profileId: ref.profileId,
          variables: {
            "--obmind-effect-charcoal-stroke-rotation":
              `${parameters.rotationDegrees}deg`,
            "--obmind-effect-charcoal-stroke-offset-x":
              `${parameters.offsetX}px`,
            "--obmind-effect-charcoal-stroke-offset-y":
              `${parameters.offsetY}px`,
            "--obmind-effect-charcoal-stroke-inset": `${inset}px`,
            "--obmind-effect-charcoal-stroke-opacity": String(opacity),
          },
          exportEffect: {
            baseStroke: "replace",
            inset,
            offsetX: parameters.offsetX,
            offsetY: parameters.offsetY,
            rotationDegrees: parameters.rotationDegrees,
            opacity,
            widthScale: 0.92,
            minimumWidth: 0.8,
          },
          contour: {
            kind: "rough-contour",
            roughness,
            sampleSpacing: 7,
            maximumPointCount: 96,
            dashArray: CHARCOAL_CONTOUR_DASH_ARRAY,
          },
        };
      },
    },
    {
      id: CHARCOAL_FILL_EFFECT_ID,
      label: "Charcoal powder",
      kind: "node-fill",
      apply(ref): DomSvgNodeFillEffect {
        const opacity = numberOption(ref, "opacity", 0.045, 0, 0.2);
        return {
          profileId: ref.profileId,
          variables: {
            "--obmind-effect-charcoal-fill-opacity": `${opacity * 100}%`,
          },
          createExportPaint(colors) {
            return {
              kind: "speckle",
              background: colors.background,
              color: colors.stroke,
              gap: 7,
              radius: 0.65,
              opacity,
            };
          },
        };
      },
    },
    {
      id: CHARCOAL_EDGE_EFFECT_ID,
      label: "Charcoal dry edge",
      kind: "edge-stroke",
      apply(ref, points, stableKey): readonly HandDrawnStroke[] {
        return createDryCharcoalStrokes(
          points,
          stableKey,
          numberOption(ref, "roughness", 1.45, 0, 4),
        );
      },
    },
    {
      id: CHARCOAL_DOT_EFFECT_ID,
      label: "Charcoal endpoint dot",
      kind: "terminal-marker",
      apply(ref): DomSvgTerminalMarkerEffect {
        return {
          profileId: ref.profileId,
          shape: "circle",
          opacity: 0.62,
        };
      },
    },
  ];

export const BUILT_IN_DOM_SVG_EFFECT_REGISTRY =
  createDomSvgMindMapEffectRegistry(BUILT_IN_DOM_SVG_EFFECT_DEFINITIONS);
