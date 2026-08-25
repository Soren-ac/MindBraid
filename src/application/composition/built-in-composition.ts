import {
  BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
  type DomSvgMindMapEffectRegistry,
} from "../../ui/dom-svg-effects";
import { BUILT_IN_MIND_MAP_EXPORT_ENCODER_CAPABILITIES } from "../../export/built-in-encoders";
import {
  DEFAULT_MIND_MAP_EXPORT_LIMITS,
  MIND_MAP_EXPORT_DPI_PRESETS,
} from "../../export/types";
import type { MindMapFrontendCapabilities } from "../../ui/frontend";
import {
  BUILT_IN_MIND_MAP_FORMATTING_REGISTRY,
  type MindMapFormattingRegistry,
} from "../../presentation/formatting";
import {
  BILATERAL_TREE_LAYOUT_ENGINE_ID,
  TREE_LAYOUT_ENGINE_ID,
} from "../../layout/layouts";
import {
  BUILT_IN_BILATERAL_TREE_LAYOUT_OPTION_DEFINITIONS,
  BUILT_IN_TREE_LAYOUT_OPTION_DEFINITIONS,
} from "../../layout/layout-options";
import {
  DEFAULT_MIND_MAP_HISTORY_DOCUMENT_LIMIT,
  DEFAULT_MIND_MAP_HISTORY_LIMIT,
} from "../history/mutation-history";
import { MIND_MAP_CLIPBOARD_VERSION } from "../../topic/mutation/node-clipboard";
import {
  createMindMapNodeContentLayoutStrategy,
  type MindMapNodeContentLayoutStrategy,
} from "../../layout/node-content-layout";
import { getStyleRequiredEffectIds } from "../../presentation/render-effects";
import type { MindMapPaletteSpec, MindMapStyleSpec } from "../../presentation/presentation";
import { MIND_MAP_TOPIC_COMMANDS } from "../../topic/interaction/topic-command";
import {
  DEFAULT_MIND_MAP_PALETTE_ID,
  DEFAULT_MIND_MAP_STYLE_ID,
  BUILT_IN_MIND_MAP_PALETTE_SPECS,
  BUILT_IN_MIND_MAP_STYLE_SPECS,
  createMindMapThemeCompositionRegistry,
  type MindMapThemeCompositionRegistry,
} from "../../presentation/themes";
import { BUILT_IN_MIND_MAP_ASSET_REGISTRY } from "../../presentation/assets";

export interface BuiltInMindMapFrontendComposition {
  readonly effects: DomSvgMindMapEffectRegistry;
  readonly themeComposition: MindMapThemeCompositionRegistry;
  readonly formatting: MindMapFormattingRegistry;
  readonly contentLayoutStrategy: MindMapNodeContentLayoutStrategy;
  readonly capabilities: MindMapFrontendCapabilities;
}

/**
 * The default frontend's only adapter-specific composition point. Style and
 * palette specs stay renderer-neutral; this assembly validates style effects
 * against the active DOM/SVG adapter before exposing capabilities.
 */
const BUILT_IN_MIND_MAP_THEME_COMPOSITION =
  createMindMapThemeCompositionRegistry(
  BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
  );
const BUILT_IN_MIND_MAP_NODE_CONTENT_LAYOUT_STRATEGY =
  createMindMapNodeContentLayoutStrategy();

const BUILT_IN_MIND_MAP_FRONTEND_CAPABILITIES: MindMapFrontendCapabilities = {
  defaultStyleId: DEFAULT_MIND_MAP_STYLE_ID,
  defaultPaletteId: DEFAULT_MIND_MAP_PALETTE_ID,
  layouts: [
    {
      engineId: BILATERAL_TREE_LAYOUT_ENGINE_ID,
      label: "Balanced mind map",
      orientations: [
        "left-to-right",
        "right-to-left",
        "top-to-bottom",
        "bottom-to-top",
      ],
      defaultOrientations: [
        "left-to-right",
        "right-to-left",
        "top-to-bottom",
        "bottom-to-top",
      ],
      supportsSpacing: true,
      spacing: {
        level: { label: "Level", minimum: 0, maximum: 400, step: 4 },
        sibling: { label: "Sibling", minimum: 0, maximum: 400, step: 4 },
        subtree: { label: "Subtree", minimum: 0, maximum: 400, step: 4 },
      },
      options: BUILT_IN_BILATERAL_TREE_LAYOUT_OPTION_DEFINITIONS,
    },
    {
      engineId: TREE_LAYOUT_ENGINE_ID,
      label: "Tree",
      orientations: [
        "left-to-right",
        "right-to-left",
        "top-to-bottom",
        "bottom-to-top",
      ],
      defaultOrientations: [
        "left-to-right",
        "right-to-left",
        "top-to-bottom",
        "bottom-to-top",
      ],
      supportsSpacing: true,
      spacing: {
        level: { label: "Level", minimum: 0, maximum: 400, step: 4 },
        sibling: { label: "Sibling", minimum: 0, maximum: 400, step: 4 },
        subtree: { label: "Subtree", minimum: 0, maximum: 400, step: 4 },
      },
      options: BUILT_IN_TREE_LAYOUT_OPTION_DEFINITIONS,
    },
  ],
  styles: BUILT_IN_MIND_MAP_THEME_COMPOSITION.styles.list().map((style) => ({
    id: style.id,
    label: style.label,
    style,
    requiredEffectIds: getStyleRequiredEffectIds(style),
	origin: "built-in",
	editable: false,
  })),
  palettes: BUILT_IN_MIND_MAP_THEME_COMPOSITION.palettes.list().map((palette) => ({
    id: palette.id,
    label: palette.label,
    palette,
	origin: "built-in",
	editable: false,
  })),
  defaultGlobalFontId:
    BUILT_IN_MIND_MAP_FORMATTING_REGISTRY.fonts.resolveOrDefault(undefined).id,
  globalFonts: BUILT_IN_MIND_MAP_FORMATTING_REGISTRY.fonts.list(),
  defaultConnectorWidthId:
    BUILT_IN_MIND_MAP_FORMATTING_REGISTRY.connectorWidths.resolveOrDefault(
      undefined,
    ).id,
  connectorWidths:
    BUILT_IN_MIND_MAP_FORMATTING_REGISTRY.connectorWidths.list(),
  defaultConnectorProfileId:
    BUILT_IN_MIND_MAP_FORMATTING_REGISTRY.connectorProfiles.resolveOrDefault(
      undefined,
    ).id,
  connectorProfiles:
    BUILT_IN_MIND_MAP_FORMATTING_REGISTRY.connectorProfiles.list(),
  renderEffects: BUILT_IN_DOM_SVG_EFFECT_REGISTRY.list(),
  nodeShapes: [
    "rounded-rectangle",
    "rectangle",
    "pill",
    "ellipse",
    "diamond",
    "underline",
    "none",
  ],
  edgeRoutings: [
    "bezier",
    "straight",
    "orthogonal",
    "rounded-orthogonal",
  ],
  assets: BUILT_IN_MIND_MAP_ASSET_REGISTRY.list(),
  renderedDecorations: ["marker", "boundary", "summary", "relationship"],
  supportsRichTextRuns: true,
  supportsPerElementPresentation: true,
  supportsViewportState: true,
  export: {
    encoders: BUILT_IN_MIND_MAP_EXPORT_ENCODER_CAPABILITIES,
    formats: ["svg", "png", "jpeg", "pdf"],
    scopes: ["visible-map", "full-map"],
    rasterDpiPresets: MIND_MAP_EXPORT_DPI_PRESETS,
    limits: DEFAULT_MIND_MAP_EXPORT_LIMITS,
    pdfMode: "raster-single-page",
  },
  contentLayout: {
    strategyId: BUILT_IN_MIND_MAP_NODE_CONTENT_LAYOUT_STRATEGY.id,
    strategyRevision:
      BUILT_IN_MIND_MAP_NODE_CONTENT_LAYOUT_STRATEGY.revision,
    roleAware: true,
    adaptiveInlineSize: true,
    wrapsUnbrokenText: true,
    displayBlockOverflow: "grow",
    editorBlockOverflow: "grow-then-scroll",
  },
  disclosure: {
    trigger: "hover-focus",
    placement: "outgoing-connection",
    expandedIndicator: "dot",
    collapsedBadge: "total-hidden-descendants",
    orientations: [
      "left-to-right",
      "right-to-left",
      "top-to-bottom",
      "bottom-to-top",
    ],
  },
  editing: {
    nodeKinds: ["root", "heading", "list"],
    rootBehavior: "rename-file",
    createChildFor: ["root", "heading", "list"],
    createSiblingFor: ["heading", "list"],
    multiline: true,
    textFormat: "plain-text",
  },
  moving: {
    movableNodeKinds: ["heading", "list"],
    placements: ["before", "after", "child"],
    siblingOrdering: "cross-parent-same-kind",
    childPlacement: "append",
    movesSubtree: true,
    rootAcceptsChildren: true,
    freePositioning: false,
    dropPreview: {
      states: ["none", "invalid", "valid"],
      destinationTopic: true,
      connector: true,
      siblingInsertionMarker: true,
      geometryResolver: "injectable",
    },
  },
  topicEditing: {
    commands: MIND_MAP_TOPIC_COMMANDS,
    supportsMultiSelection: true,
    supportsRangeSelection: true,
    supportsMarqueeSelection: true,
    keyboardNavigation: "orientation-aware",
    clipboard: {
      payloadVersion: MIND_MAP_CLIPBOARD_VERSION,
      internalBranches: true,
      writesPlainMarkdownToSystem: true,
      readsExternalContent: false,
    },
    history: {
      scope: "plugin-session-per-document",
      limit: DEFAULT_MIND_MAP_HISTORY_LIMIT,
      documentLimit: DEFAULT_MIND_MAP_HISTORY_DOCUMENT_LIMIT,
      staleSourcePolicy: "reject",
    },
    stableIdentity: "metadata-free-conservative-locator",
  },
	presentationLibrary: {
		duplicateRegisteredStyles: true,
		editUserStyles: true,
		deleteUserStyles: true,
		duplicateRegisteredPalettes: true,
		editUserPalettes: true,
		deleteUserPalettes: true,
	},
};

export const BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION: BuiltInMindMapFrontendComposition =
  createBuiltInMindMapFrontendComposition();

export function createBuiltInMindMapFrontendComposition(
  customStyles: readonly MindMapStyleSpec[] = [],
  customPalettes: readonly MindMapPaletteSpec[] = [],
): BuiltInMindMapFrontendComposition {
	const customStyleIds = new Set(customStyles.map(({ id }) => id));
	const customPaletteIds = new Set(customPalettes.map(({ id }) => id));
  const themeComposition = createMindMapThemeCompositionRegistry(
    BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
    [...BUILT_IN_MIND_MAP_STYLE_SPECS, ...customStyles],
    [...BUILT_IN_MIND_MAP_PALETTE_SPECS, ...customPalettes],
  );
  const capabilities: MindMapFrontendCapabilities = {
    ...BUILT_IN_MIND_MAP_FRONTEND_CAPABILITIES,
    styles: themeComposition.styles.list().map((style) => ({
      id: style.id,
      label: style.label,
      style,
      requiredEffectIds: getStyleRequiredEffectIds(style),
	  origin: customStyleIds.has(style.id) ? "user" : "built-in",
	  editable: customStyleIds.has(style.id),
    })),
    palettes: themeComposition.palettes.list().map((palette) => ({
      id: palette.id,
      label: palette.label,
      palette,
	  origin: customPaletteIds.has(palette.id) ? "user" : "built-in",
	  editable: customPaletteIds.has(palette.id),
    })),
  };
  return Object.freeze({
    effects: BUILT_IN_DOM_SVG_EFFECT_REGISTRY,
    themeComposition,
    formatting: BUILT_IN_MIND_MAP_FORMATTING_REGISTRY,
    contentLayoutStrategy:
      BUILT_IN_MIND_MAP_NODE_CONTENT_LAYOUT_STRATEGY,
    capabilities,
  });
}
