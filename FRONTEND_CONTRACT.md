# ObMind frontend contract

## Purpose

The phase-one UI is intentionally replaceable. `MindMapView` owns Obsidian
lifecycle only; a `MindMapFrontendFactory` creates the complete visual subtree:
toolbar, status UI, canvas, renderer, and future panels.

```text
Markdown source
  -> parser/model                    source facts
  -> controller                     current document state

host defaults + per-tab session
  -> presentation                   layout/style/palette/formatting/element intent
  -> layout engine                  geometry and optional edge routes
  -> frontend/renderer              pixels and input

renderer interaction
  -> semantic node-ID event
  -> frontend intent
  -> ItemView session or Obsidian host
```

The parsed tree, visual presentation, and transient interaction state are
separate immutable inputs. Styles and palettes never mutate `MindMapNode`. Only explicit
`edit-node-text`, `create-node`, completed `move-node`, `toggle-task`, and
authorized `execute-topic-command` intents may reach the host's checked
source-edit path.
Authorized source-changing topic commands are cut, delete, paste,
create-parent, outdent, undo, and redo. Copy, drag previews, selection,
presentation, and navigation never write to Markdown.

## Current support versus extension readiness

The presence of a type is not a claim that its UI is finished.

| Capability | Current implementation | Extension contract |
| --- | --- | --- |
| Complete UI replacement | Basic functional frontend | `MindMapFrontendFactory` replaces toolbar, status and canvas together |
| Horizontal / vertical flow | Implemented and exposed in toolbar/settings | Both built-in engines consume the same orientation contract |
| Right-to-left / bottom-to-top flow | Implemented in toolbar and settings with the other two orientations | Capability catalog advertises all four orientations |
| Balanced bilateral layout | Built-in `bilateral-tree`, default for new views | Register another `LayoutEngine` for another geometry |
| One-sided tree layout | Built-in `tree`, selectable per document or as the default | Uses the same measured-node and typed-path contract |
| Fishbone, radial, org chart, timeline | Not implemented | Register another engine and capability descriptor |
| Layout spacing/options | Spacing plus capability-derived compactness, same-level alignment, and bilateral root-distribution controls | `MindMapLayoutSpec.options` carries primitive-only, engine-owned settings and the engine normalizes them |
| Obsidian light/dark adaptation | Implemented, including fill-aware default topic foregrounds | Host color tokens remain renderer-neutral; adapters resolve their actual colors for alpha composition and contrast scoring |
| Selectable styles | Colorful (default), Pencil sketch, and Cloud with visual sidebar previews | Independent geometry/effect specs in an injectable style registry |
| Selectable color schemes | Graphite, Aurora, Spectrum (default), Morandi Mint, and Retro Autumn with visual sidebar previews | Independent semantic/role/branch color specs and user-facing naming in an injectable palette registry; every style/palette cross-pair is valid |
| Custom Style/Palette library | Duplicate, rename, edit, and delete user-owned entries from the sidebar | Versioned JSON-safe library with generated IDs, injected spec validators, registry rebuild, preview composition, and per-axis fallback |
| Pencil visual effects | Paper grain, deterministic double strokes, hatching and leaf dots | Renderer-neutral effect refs resolved by an adapter-owned registry |
| Role/branch styling | Distinct role metrics plus automatic stable root-subtree colors | Sparse node/edge overrides inherit from role and branch tokens |
| Node shapes and typography | Implemented for the declared shapes and safe rich-text runs | Capability catalog declares supported shapes |
| Adaptive topic content | Role-aware compact width, bounded wrapping, natural display height, and auto-growing inline editor | Injectable `MindMapNodeContentLayoutStrategy`; no DOM measurement fields in `MindMapNode` |
| Branch disclosure | Hover/focus outgoing dot; collapsed dot stays visible with total hidden-descendant count | Pure disclosure description, accessible formatter, and geometry-derived outgoing orientation |
| Edge styles | Bézier, straight, orthogonal and rounded orthogonal implemented | Stable edge IDs, sparse styles and engine-provided typed paths |
| Selection/focus | Replace, Cmd/Ctrl-toggle, Shift visible-range, and Shift-drag marquee selection | Per-tab primary/anchor state plus renderer-neutral selection reducers |
| Topic creation shortcuts | `Tab` child and `Enter` following sibling; root `Enter` creates a main topic; editor `Tab` submits and continues with a child | Checked semantic creation intent, serialized continuation, and pure Markdown insertion planner |
| Delete/promote | Multi-selection branch delete and delete-topic-only with safe child promotion | Pure stale-checked planner reduces overlapping selections to top-level branches |
| Clipboard | Versioned in-memory multi-branch payload; copy/cut also attempt OS plain-Markdown copy | Clipboard planner is browser/Obsidian-independent; external Markdown paste is not claimed |
| Parent/outdent | Context/shortcut parent insertion and primary-topic outdent | Atomic parent planner plus checked move planner |
| Undo/redo | Bounded LRU in-memory history (100 transactions × 20 recent documents) with exact stale checks | Two-phase peek/apply/commit history; no callback or DOM state in entries |
| Structural topic drag | Complete single-branch exact before/after placement across compatible parents, append-child drops, destination topic/connector preview, and edge auto-pan | Pure preview geometry + renderer-local elements, semantic drop intent, moving capability, and pure Markdown move planner |
| Free-positioned topics | Not implemented; dragging always changes tree structure | A future position layer must remain separate from parsed Markdown facts and layout selection |
| Keyboard mind-map navigation | Orientation-aware arrows, Home/End, Alt/Option-Up/Down reorder, Space/F2 edit, and Esc clear | Visible-tree navigation index remains independent of DOM geometry |
| Pan/zoom/fit viewport | Implemented and persisted per Markdown document | Scene-space `{centerX, centerY, scale}` |
| Current-document search | Toolbar search over the parsed document with reveal/center behavior | `node-search` plus semantic `reveal-node`; never scans the Vault |
| Markdown/wikilink navigation | Supported inline destinations render as an explicit topic affordance and open only Vault-local targets through the Obsidian host | Parsed `MindMapInlineLink` source facts plus semantic `open-node-link`; renderer never resolves or opens a destination itself |
| Markdown tasks | In-topic checked state and exact explicit checkbox toggle | Immutable source snapshot, serialized host write, stale-checked `node-task` planner, and one content-history transaction |
| Document formatting | Global font, connector width, and uniform/tapered connector-profile controls | Safe registered IDs; `style-default` inherits the active Style without accepting raw CSS or unchecked geometry |
| Selected-topic formatting | Multi-select shape, fill/stroke/text color, border, radius, font size/weight, mixed values, and reset | Sparse capability-validated node patches; no Markdown read or write |
| Presentation preview | Continuous controls render a view-only preview and commit at most one durable change | Immutable baseline/preview gesture state, stale check, rollback, and at most one history entry per completed gesture |
| Durable presentation | Document layout/style/palette/global-font/connector-width/profile, collapse, viewport, and sparse node/edge state in plugin data | Versioned `AnnotationStore`, conservative locators, field-granular hydration, and orphan records |
| Presentation undo/redo | Bounded per-document core/host path; no phase-one toolbar button | Explicit `presentation-history` event, separate from Markdown history |
| Context menu | Edit/create/copy/cut/paste/delete/source actions | Emits the same semantic intents as keyboard/pointer adapters |
| Icons, markers and labels | Offline priority/progress/status/flag/star/icon assets plus one free-text label per topic; supports multi-selection apply/remove/reset and export | Injectable primitive-only `MindMapAssetRegistry`; semantic palette roles, no URLs/DOM, and node/decoration storage stays outside Markdown |
| Boundaries, summaries, relationships | Sidebar creation/edit/delete, deterministic rendering, annotation persistence/history, selection, and export are implemented | Pure decoration commands and renderer-neutral geometry; future adapters may replace controls and visuals without changing persistence |
| Focus and drill-down | Focus selected branch, breadcrumb navigation, clear focus, and visible-depth limit are implemented per tab | Pure immutable focus projection before layout; no source or document-presentation mutation |
| Minimap | Optional non-exported scene/viewport overview with click-and-drag recentering | Pure scene/minimap transforms plus renderer-owned pointer adapter and cleanup |
| Large-map culling | Above the registered threshold, offscreen nodes/edges are culled with overscan while interaction-owned topics remain pinned | Pure `scene-culling` result; fit/export continue to use the complete layout result |
| Accessibility tree | Canvas exposes tree/treeitem, level, sibling position, expanded state, decoration labels, and keyboard focus; decorative edges are not focusable | Renderer-neutral tree semantics derived from the visible model and projected geometry |
| Editing node text | Selected click, double-click, Space, or F2; visible multiline via `<br>`; conservative inline-wrapper preservation; root rename | Semantic edit event/command, immutable source snapshot, and typed editing capability |

## Stable entry points

Whole-frontend boundary:

- `MindMapFrontend`
- `MindMapFrontendFactory`
- `MindMapFrontendFrame`
- `MindMapFrontendEvent`
- `MindMapFrontendCapabilities`
- `MindMapEditingCapabilities`
- `MindMapMovingCapabilities`
- `MindMapNodeContentLayoutStrategy`
- `MindMapDisclosureDescription`
- `NodeDragDropPreview`
- `NodeDragPreviewGeometryResolver`

Renderer-adapter boundary:

- `MindMapRenderer`
- `MindMapRendererFactory`
- `MindMapRenderInput`
- `MindMapRendererCallbacks`
- `MindMapInteractionEvent`
- `MindMapInlineLink`
- `isLocalMindMapLinkTarget`

Visual data:

- `MindMapPresentation`
- `MindMapLayoutSpec`
- `MindMapThemeSpec`
- `MindMapFormattingSpec`
- `MindMapFontFamilySpec`
- `MindMapConnectorWidthSpec`
- `MindMapFormattingRegistry`
- `MindMapNodePresentation`
- `MindMapEdgePresentation`
- `MindMapDecoration`
- `MindMapAssetRegistry`
- `MindMapAssetSpec`
- `MindMapAssetVisualDescriptor`
- `MindMapDecorationCommand`
- `MindMapDecorationGeometryDescriptor`
- `MindMapPresentationPatch`
- `applyMindMapPresentationPatch`
- `createMindMapPresentationPatch`
- `MindMapPresentationScope`

Persistent presentation:

- `AnnotationStore` (the exported persistent store type)
- `DocumentAnnotationRecord`
- `PersistentNodeRef`
- `hydrateDocumentAnnotations`
- `captureDocumentAnnotations`
- `SerializedObMindPluginDataStore`
- `MindMapPresentationHistoryStore`

Per-tab state:

- `MindMapViewSession`
- `MindMapInteractionState`
- `MindMapViewportState`
- `MindMapSelectionState`
- `MindMapNodeLocator`
- `MindMapFocusProjection`
- `MindMapFocusBreadcrumb`

Topic commands and source transactions:

- `MindMapTopicCommand`
- `MindMapTopicCommandRequest`
- `MindMapTopicCommandResult`
- `MindMapMutationHistory`
- `MindMapClipboardPayload`
- `planNodeDeletionInContent`
- `planNodePasteInContent`
- `planNodeParentInsertionInContent`

Navigation and selection:

- `VisibleMindMapNavigation`
- `createVisibleMindMapNavigation`
- `resolveVisibleMindMapNavigationTarget`
- `resolveMindMapNavigationKeyIntent`
- `applyMindMapSelection`
- `collectMindMapNodesInRectangle`
- `createMindMapNodeLocator`
- `reconcileMindMapNode`
- `createMindMapDocumentSearchIndex`
- `searchMindMapDocument`

Markdown tasks:

- `planNodeTaskToggleInContent`

Layout:

- `LayoutRequest`
- `LayoutEngine`
- `LayoutEngineResolver`
- `MindMapLayoutEngineRegistry`
- `LayoutResult`
- `LayoutEdge`
- `LayoutPath`
- `LayoutPathSegment`
- `LayoutNodeDropPlacementResolver`
- `resolveAxisAlignedNodeDropPlacement`
- `resolveMindMapSceneCulling`
- `createMindMapViewportSceneBounds`
- `createMindMapMinimapTransform`
- `mindMapMinimapPointToScene`

Structural drag and source move:

- `resolveNodeDragDropTarget`
- `calculateNodeDragAutoPan`
- `applyNodeDragAutoPan`
- `NodeDragDropTarget`
- `NODE_DRAG_THRESHOLD_PX`
- `NodeMovePlacement`
- `planNodeMoveInContent`
- `NodeMovePlan`

Themes and effects:

- `MindMapThemeRegistry`
- `MindMapRenderEffectRef`
- `MindMapRenderEffectResolver`
- `MindMapRenderEffectCapability`
- `MindMapThemeEffectTokens`
- `MindMapThemeBranchTokens`

Use the exported default factories instead of duplicating defaults:

```ts
const presentation = createDefaultMindMapPresentation("left-to-right");
const interaction = createDefaultMindMapInteractionState();
```

Collections returned by the factories are fresh, so tabs do not accidentally
share collapse, selection, or sparse style state.

## Frontend frame and capabilities

`MindMapFrontendFrame` has eight explicit inputs:

- `document`: idle/loading/ready/error source state, with no layout direction;
- `language`: the global ObMind product language (`zh-CN` or `en`). It controls
  only plugin-owned UI copy and number formatting; it never changes note text,
  user-created Style/Palette names, presentation, or interaction state;
- `appearanceMode`: the global ObMind light/dark preference (`system`,
  `light`, or `dark`), independent of the current document;
- `colorScheme`: the host-resolved effective scheme (`light` or `dark`) passed
  explicitly to replaceable renderers, including when appearance follows
  Obsidian;
- `presentation`: the sole visual truth for layout and composed appearance;
- `interaction`: per-tab collapse, selection, keyboard focus, hover, focus root,
  visible-depth limit, selected decoration, minimap visibility, and viewport;
- `capabilities`: layouts and their option definitions, styles, palettes,
  global fonts, connector widths/profiles, shapes, edge routings, assets,
  decorations, presentation-library affordances, editing behavior, and feature
  flags actually registered by the host.
- `topicCommandAvailability`: current-document clipboard and undo/redo
  availability, kept separate from presentation and transient interaction.

Keeping legacy controller direction out of the frontend frame prevents two
layout truth sources. A richer frontend must build its menus from
`capabilities`, not hard-code an engine, option, style, palette, font,
connector-width, or connector-profile ID.

Layout, style, and palette events support explicit `view`, `document`, or
`default` scope. Complete presentation replacement supports `view` and
`document`; default changes remain dedicated layout/style/palette events so a
full document-formatting snapshot cannot be mistaken for a durable plugin
default. A `view` change is an ephemeral, higher-priority tab-local layer. It
survives document hydration and visual refresh in that tab; a source switch
clears only source-keyed node, edge, and decoration values while retaining its
layout, style, palette, and formatting. A `document` change is the
lower-priority persisted layer in versioned plugin data and refreshes views of
that Markdown path. A `default` change is delegated to the settings host.
Direct global-font, connector-width, and connector-profile events are
deliberately document-scoped; plugin defaults do not currently expose those
formatting axes. The phase-one sidebar uses document scope for layout engines,
styles, palettes, global font, connector width/profile, all four orientations,
layout options, and spacing; the settings tab persists the corresponding
layout/style/palette defaults.
The stored configuration contains IDs only and migrates older direction-only
settings to the current built-in defaults. Each layout capability separately
declares supported `orientations`; the current host validates and persists all
four built-in orientations. Settings and annotations share one serialized,
versioned data envelope so one save cannot overwrite the other.

Appearance changes use the dedicated `change-appearance` frontend event. They
are global ObMind settings rather than `MindMapPresentation` changes, so the
toolbar control remains available without an active Markdown document and all
open ObMind views refresh after persistence succeeds.

Language changes use the parallel `change-language` event. The host persists
the validated locale, supplies a newly localized capability snapshot, and
refreshes every open mind-map view. A frontend must update its chrome, dialogs,
renderer labels, titles, placeholders, and ARIA text without rebuilding the
parsed document or discarding viewport/selection/collapse state. Built-in
capability labels are localized from stable IDs; user-created Style and Palette
labels remain literal user data.

Expected failures that cross the host/frontend boundary carry an
`ObMindLocalizedError` key and named values. The receiving frontend translates
that key using the language in its current frame. Arbitrary adapter, Vault,
parser, or encoder `Error.message` values are diagnostic-only and must not be
inserted into visible status text, dialog copy, tooltips, or ARIA attributes.

## Assets, decorations, and navigation

Node information uses a registered, renderer-neutral asset boundary. Each
`MindMapAssetSpec` contains a stable ID, kind, revision, bounded view box,
primitive geometry, and semantic color roles. It cannot contain a URL, DOM/SVG
node, CSS declaration, callback, or host object. A frontend builds previews
from the capability snapshot; the live renderer and export adapter resolve the
same descriptor independently. Icons and markers use sparse node presentation;
the single free-text label is a tag-kind marker decoration, allowing its text
to remain presentation data without adding a visual field to `MindMapNode`.

Relationships, boundaries, summaries, and tag labels are immutable
`MindMapDecoration` records in document presentation. Their create/update/
delete rules and geometry are pure modules. `selectedDecorationId` remains
per-tab interaction state, so selecting a decoration never dirties plugin data.
Frontend commands submit a normal capability-validated presentation patch and
therefore share the existing serialization, stale checks, history, annotation
reconciliation, and export snapshot boundaries.

Focus and depth filtering are also interaction-only. `projectMindMapFocus`
returns an immutable tree projection plus breadcrumbs before layout; it
preserves original IDs, source locations, and links. The renderer receives that
projection as its root, while source mutations continue to validate against the
authoritative full document owned by the view. The minimap consumes only full
scene bounds and viewport state and is deliberately absent from export scenes.

Viewport culling is an adapter optimization, not a layout or presentation
choice. The pure culling result lists mounted node IDs and rendered edge IDs;
selection, focus, hover, edit, and drag state can pin required topics. Layout,
fit-to-view, minimap bounds, and export retain the complete projected layout,
so swapping the DOM/SVG adapter for Canvas or WebGL does not change semantics.

## Layout contract

`MindMapLayoutSpec` contains:

- `revision`: geometry configuration revision;
- `engineId`: registered strategy;
- `orientation`: four directional orientations;
- `spacing`: level, sibling, and subtree gaps;
- `options`: engine-owned, renderer-neutral configuration.

Every layout capability publishes its own immutable, primitive-only option
definitions. A frontend may render those definitions as number, boolean, or
select controls, but it must send only supported values and must not invent
engine semantics. The selected engine receives normalized values with defaults;
unknown keys and invalid ranges are rejected before durable persistence.

The built-in tree schema defines `compactness` (which scales explicit spacing)
and `alignSameLevel`. The bilateral schema adds `balanceStrategy` for automatic
root-branch distribution: weighted balancing, alternating sides, or the
selected primary side. These options are layout inputs only—neither Style nor
Palette is allowed to infer or override them.

Every `LayoutRequest` also contains:

- a stable renderer-instance `layoutId`;
- a separate `documentId`;
- the layout revision;
- measured node sizes;
- collapsed IDs and resolved spacing.

This distinction lets stateful engines cache per view without colliding when
two tabs show the same note.

`LayoutEdge.id` is stable across direction and composed-appearance changes. A custom engine
may return a typed `LayoutPath` containing line, quadratic, or cubic segments;
the default renderer uses that path before falling back to its own tree path.
The engine therefore owns connection ports and geometry, which is required for
bilateral branches and future non-tree strategies. `LayoutResult.bounds` must
contain all nodes and every path endpoint/control point so fit-to-view remains
correct.

`LayoutEngine.resolveNodeDropPlacement` is an optional pure geometry policy.
The renderer supplies the containing `PositionedNode`, scene-space pointer, and
current orientation, and receives only `before`, `after`, or `child`. Engines
that omit it use `resolveAxisAlignedNodeDropPlacement`, whose leading/center/
trailing sibling-axis bands are 25% / 50% / 25%. A radial, fishbone, or other
non-axis-aligned engine can register its own hit policy without changing the
renderer, frontend event, or Markdown move planner. Structural compatibility,
cycles, and stale source mappings are still checked separately after geometry
resolution.

`resolveNodeDragDropPreview` builds a tri-state renderer-neutral description:
`none`, `invalid`, or `valid`. A valid preview contains the future topic
bounds, connector segment, and optional sibling insertion marker. The default
axis-aligned resolver covers all four orientations; the DOM/SVG renderer also
derives the effective side of a bilateral branch from positioned root/target
geometry. For a child drop onto the bilateral root, the built-in adapter
immutably simulates the candidate tree and reuses the engine's subtree-weight
split so preview and committed layout choose the same side. A replacement
renderer or non-axis-aligned layout can inject its own
`NodeDragPreviewGeometryResolver` without changing move semantics.

Topic content sizing is similarly strategy-owned. The built-in
`MindMapNodeContentLayoutStrategy` resolves role-aware logical min/max inline
sizes, wrapping and editor block limits from theme/node presentation. DOM maps
that result to CSS logical properties; SVG/Canvas renderers may use the same
contract with their own text measurer. Display topics never gain an internal
scroll surface.

The built-in `bilateral-tree` has a narrower collaboration rule: the engine
owns the side-specific source and target ports, while the renderer may
reconnect those same ports using the presentation's straight, orthogonal,
rounded-orthogonal, or Bezier routing. Paths from other custom engines remain
unchanged so their geometry contract is not silently weakened.

Both built-in engines implement all four orientations, and the phase-one
toolbar and settings expose each explicitly. In horizontal mode,
`bilateral-tree` places the root in the center and balances first-level visible
subtrees to the left and right; vertical mode uses the analogous top/bottom
split.

## Style, palette, formatting, and effective-theme contract

`MindMapStyleSpec` contains no colors. It owns typography, node metrics and
shapes, edge geometry/style, semantic role geometry, renderer-neutral effect
references, and the channels through which branch colors are applied.
`MindMapPaletteSpec` owns only semantic colors, role-specific fill/stroke/text
colors, the branch palette, and light-mode color overrides.

The same separation applies to user-library entries. Custom Styles may change
geometry, typography, routing, connector treatment, branch-color application,
and registered effects, but cannot contain palette colors. Custom Palettes may
change semantic/role/branch/light colors, but cannot contain shape, typography,
routing, connector treatment, or effects. Generated custom IDs are stable and
never silently become built-in IDs; the pure Style + Palette composition remains
the only join point.

`MindMapFormattingSpec` is a separate document-wide override layer. It selects
a registered font-family token, connector width, and connector profile without
changing Style or Palette. A `style-default` selection explicitly inherits the
active Style; concrete connector profiles are `uniform` or `taper-to-child`
with a validated child-side ratio. Arbitrary CSS font-family strings, unchecked
widths, routing, and colors are never persisted through Formatting.

Formatting resolution is:

```text
per-node/per-edge override
  -> document formatting
  -> Style default
```

`composeMindMapTheme(style, palette)` is the only join point. It produces the
complete immutable `MindMapThemeSpec` consumed by renderers, records both
`styleId` and `paletteId`, and retains their revisions separately. Measurement
invalidation follows the style revision, global-font selection/revision, and
geometry-bearing node overrides. Connector-width revisions repaint edges and
recalculate SVG bleed without invalidating topic measurement; connector-profile
revisions use the same edge-only invalidation. Palette revisions repaint without
changing measured geometry or the viewport. A frontend selects registered IDs;
it never assembles an unvalidated theme or formatting object.

The effective snapshot includes:

- semantic colors, including text-on-accent and a branch palette;
- typography and node metrics;
- edge routing, width, and line style;
- root, main-topic, and subtopic role defaults.
- renderer-neutral visual-effect references and required effect kinds;
- a style-owned branch-color policy such as stable `root-subtree` inheritance
  and fill/stroke/text/edge application channels.

Resolution order is:

```text
theme tokens
  -> style role geometry + palette role colors
  -> branch palette
  -> sparse node/edge override
  -> transient hover/focus/selection styling
```

Text contrast adds one surface-aware rule before rendering: `none`,
`underline`, and fills equal to the active canvas are visually unfilled. Unless
a sparse node override explicitly chooses a text color, those topics use the
active palette's normal `text` token rather than an on-fill role or branch
foreground. This rule is resolved against the active light/dark color snapshot
and is independent of Style and Palette IDs.

Node presentation supports shapes, colors, border metrics, typography,
branch color, icon/marker IDs, and safe rich-text runs. Rich text contains text
and formatting flags only—never raw HTML, scripts, CSS, or URLs.

The built-in selected-topic inspector is deliberately narrow. Given one or more
selected node IDs, it creates one sparse node-patch map for shape, fill, stroke,
text color, border width, radius, font size, font weight, or reset. Mixed values
are display state, not a value written back to every node; reset removes only
the selected nodes' overrides. The frontend emits an
`apply-presentation-patch` event and the capability-aware patch boundary owns
validation, so the inspector never reads or changes Markdown.

Colors are either semantic host tokens or literal CSS color syntax. Literal
values that could contain `url(...)` or declaration injection are rejected, so
loading a theme cannot introduce network access through CSS.

Effect references contain a safe registered profile ID and primitive options
only. Style registration verifies that every required effect exists with the
expected kind. The default DOM/SVG adapter resolves `paper-grain`,
`pencil-double`, `pencil-hatch`, `pencil-edge`, and `pencil-dot`; it never
checks for the `pencil-sketch` style ID. Switching away from the Pencil style
clears effect data and CSS variables instead of leaving adapter state behind.
The built-in composition derives effect capabilities and implementations from
the same typed definitions, so a theme cannot advertise an effect that the
active adapter would silently ignore.

Hand-drawn variation is deterministic from stable node/edge IDs. It does not
use render-time randomness, so a refresh, zoom, hover, or collapse operation
does not make the lines visibly jump.

Change `style.revision`, `palette.revision`, a formatting capability revision,
or `presentation.revision` whenever a relevant token or sparse override changes.
The default renderer includes the selected global-font ID, token, and revision
in its measurement key; connector-width changes invalidate edge rendering and
bleed only. It also observes node resizes for late font changes.

## Viewport and interaction

`MindMapViewportState` stores a center in scene coordinates plus scale:

```text
{ centerX, centerY, scale }
```

It intentionally does not store screen-pixel translation. A renderer derives
translation from its current container size, so the center survives pane
resizing or a renderer swap.

`MindMapViewSession` is owned by one open ItemView. It retains:

- collapsed node IDs;
- selected, focused, and hovered node IDs;
- viewport;
- a document-scoped presentation layer hydrated from plugin data;
- an optional higher-priority, ephemeral `view` presentation layer.

On document hydration, the host supplies the current document-scoped
presentation, collapsed locator set, and viewport from plugin data. The session
updates that lower-priority document layer without replacing a view layer.
On a source switch, the view layer keeps layout/style/palette/formatting while
clearing source-keyed node/edge/decoration data. Selection, focus, hover, and the
clipboard remain session-only.

When the source changes, the session uses metadata-free structural locators to
reconcile collapsed, selected, primary, anchor, focused, and hovered IDs to the
new snapshot. The annotation codec separately rehydrates node/edge overrides
and resolves stored decoration records; it applies a decoration only when the
active capability declares that kind rendered. A match is kept only when
source/ancestry/fingerprint evidence selects one candidate; ambiguous transient
references are dropped and persistent references become non-rendered orphans.

After an explicit structural mutation, the initiating view selects the
verified result and only newly created/parent topics start their inline editor.
Other open views reconcile their transient state on the next immutable
document frame and rehydrate durable presentation references.

Transient selection/focus/hover state and the view-scoped presentation layer
clear with the tab. Document-scoped presentation, collapse, and viewport
survive reload through plugin data.

## Presentation-preview transaction

Continuous presentation controls use a gesture ID and the framework-free
`presentation-gesture` state machine. On the first preview patch, the host
captures immutable presentation baseline, existing view override, and viewport.
Every subsequent patch is capability-validated against the prior preview and
renders only through the ephemeral view layer; preview updates neither save nor
create presentation history.

Commit temporarily restores the prior layers, verifies that the live baseline
revision has not changed, then derives one sparse patch from baseline to preview
and persists it as at most one document change/history entry. Cancel restores the exact
captured presentation layers and viewport. If the document save fails, the host
rolls back the same state; if baseline validation fails, it re-shows the preview
and rejects the stale commit rather than applying it to newer presentation.
Starting a different gesture cancels the previous one. A frontend must emit
explicit preview, commit, and cancel events and must not save intermediate
slider, color-picker, or numeric-input values itself.

## Events and commands

The renderer emits one canonical `MindMapInteractionEvent` union containing
node IDs and scene-space data—never browser `MouseEvent` objects. The basic
frontend adapts those events into `MindMapFrontendEvent` host intents.

Frontend events cover:

- source navigation;
- explicit node-text commits with the rendered snapshot's expected text;
- explicit checked child/sibling creation requests;
- one checked structural move request after a valid pointer-up;
- checked topic commands for copy/cut/paste/delete/create-parent/outdent/history;
- exact task-checkbox toggles;
- current-document search reveal;
- collapse/expand and replace/toggle/range/marquee selection/focus/hover;
- viewport changes;
- view/document/default layout, style, or palette changes;
- view/document complete presentation replacement;
- document-wide global-font, connector-width, and connector-profile changes;
- capability-validated sparse selected-topic formatting patches;
- begin/update preview patches plus explicit presentation-preview commit/cancel;
- custom Style/Palette library duplicate, update, and delete commands;
- explicit presentation-history undo/redo, separate from source history.

Frontend commands cover fit, focus-node, viewport restore, beginning a node
edit, and a renderer-agnostic keyboard gesture routed from the active
Obsidian `ItemView` scope. `focus-node` focuses the actual node control and
centers it, which is suitable for future search and keyboard navigation.
`begin-node-edit` starts the renderer-owned editor without exposing its DOM
input.

The default DOM renderer uses topic-first interaction:

- a first plain click selects and focuses without leaving the map;
- Cmd/Ctrl-click toggles selection, Shift-click extends an inclusive visible
  range, and Shift-drag on empty canvas creates a scene-space marquee;
- a later click on that selected topic, a direct double-click, Space, or F2
  begins editing;
- `Tab` creates a child, while `Enter` creates a following sibling; because the
  document root has no sibling, root `Enter` creates a main-topic child;
- editing input owns its keyboard events, so editor `Enter` commits,
  Shift-Enter inserts a visible line break, `Esc` cancels, and `Tab` commits
  then creates/edits a child from a refreshed source snapshot;
- a rejected asynchronous edit reopens the same in-node editor with its
  submitted draft, while a committed result for a no-longer-active file is
  treated as successful without replacing the newer frame;
- orientation-aware arrows traverse parent/child/siblings, Home/End select the
  first/last sibling, and Alt/Option-Up/Down requests an adjacent sibling move;
- Delete/Backspace, copy/cut/paste, create-parent, outdent, undo, and redo are
  renderer-neutral topic commands; a context menu exposes commands without
  inventing a second source-edit path;
- a five-pixel drag threshold separates clicks from structural movement;
- with the built-in axis-aligned resolver, dragging a non-root topic's center
  over a compatible target previews a translucent child topic and connector,
  while the leading/trailing quarters of a same-kind topic preview exact
  before/after placement with a future topic box and insertion marker,
  including a parent change;
- an animation-frame auto-pan loop moves the viewport while a started drag is
  within the canvas edge zone and stops on completion/cancellation;
- the renderer keeps its ghost and destination indicator local. Pointer cancel,
  lost capture, `Escape`, source refresh, or destruction cancels without a
  source event, and a completed drag suppresses the trailing click/double-click;
- Alt-click or the context-menu source action is explicit source navigation.

XMind and EdrawMind officially document double-click editing plus Tab/Enter
creation. XMind's Topic guide also documents drag-based Main Topic/Subtopic
hierarchy changes, while EdrawMind's Move Topics guide documents moving a
topic and its branch among levels with a visual destination mark. ObMind's
separate “selected topic clicked again” behavior and exact 25%/center drop
zones are product choices, not claims about either product's private hit
testing.

## Source-edit contract

Source mutation is an explicit, separate path from presentation persistence:

```text
node-edit-commit
  -> edit-node-text { nodeId, expectedText, sourceSnapshot, text, continuation? }
  -> snapshot identity and original source-file resolution
  -> current source-line structural/stale validation
  -> Obsidian public write API

task checkbox activation
  -> toggle-task { nodeId, sourceSnapshot }
  -> MindMapView rejects an in-flight or stale frame snapshot
  -> host toggleMindMapTask through the serialized source-mutation queue
  -> exact current task marker and source-revision validation
  -> one Editor.replaceRange or pure Vault.process replacement of [ ] / [x]
  -> reparse the result, record one source-history transaction, select/focus
     the verified task

editor Tab continuation
  -> await checked node edit
  -> resolve edited node from returned document + fresh sourceRevision
  -> await checked child creation
  -> refreshed document + select/edit the verified child

selected topic + Tab/Enter
  -> create-node { nodeId, relation, sourceSnapshot }
  -> complete-buffer revision and structural-anchor validation
  -> pure Markdown insertion plan
  -> Obsidian public write API
  -> refreshed document + select/edit the verified created node

completed valid node drag
  -> move-node { sourceSnapshot, targetSnapshot, placement }
  -> complete-buffer revision, endpoint, parent, and cycle validation
  -> pure Markdown subtree-move plan and final reparse verification
  -> one contiguous Editor replacement or one Vault.process result
  -> refreshed document + select/focus the verified moved node

explicit topic command
  -> execute-topic-command { command, selected node IDs, primary ID, revision }
  -> host validates the immutable frame and serializes source work
  -> pure delete/clipboard/paste/parent/move planner as applicable
  -> one contiguous Editor replacement or one pure Vault.process result
  -> record a bounded content transaction after successful mutation

undo / redo
  -> history peek verifies exact document path, content, and revision
  -> host applies the exact prepared replacement
  -> history commit only after authoritative content matches
  -> restore selection through a conservative structural locator
```

The default capability declares root, heading, and list editing; root behavior
is `rename-file`, and input format is reader-visible `plain-text`, not raw
Markdown. The built-in textarea can insert visible newlines with Shift-Enter;
the source mapper encodes them as `<br>` on one physical structural line. It
separately declares which node kinds accept child and sibling creation. A
replacement frontend should derive its controls from this capability.
`MindMapMovingCapabilities` separately advertises movable kinds, supported
semantic placements, cross-parent same-kind ordering, exact before/after
placement, root child acceptance, subtree behavior, and the absence of free
positioning. A center `child` drop still appends; exact child positions use a
before/after target anchor.

List structure commands reject a source or destination branch containing
non-blank continuation/body lines outside the parsed list tree. This is a
deliberate safety boundary until the parser and source-range model own those
CommonMark constructs.

For headings and lists, the host preserves structural indentation, markers,
ordered-list numbers, task boxes, and optional closing heading markers. The
inline source mapper conservatively retains balanced emphasis, strike,
code-span, Markdown-link, and wikilink wrappers when the visible edit has one
unambiguous mapping. It falls back to escaped plain inline Markdown for that
topic when a change crosses an ambiguous wrapper boundary. An unchanged value
is a byte-for-byte no-op, including during a Tab continuation. An open editor
buffer is changed with `Editor.replaceRange`; otherwise `Vault.process`
performs an atomic checked edit.
Root edits use `FileManager.renameFile`, preserving the folder and `.md`
extension. Obsidian may update incoming links according to the user's own rename
link setting.

The `Vault.process` callback is calculation-only. After the awaited write, the
host re-reads a newly opened editor buffer or the latest Vault content before
publishing controller state. If newer content won the race, ObMind publishes
that content and reports a retryable stale conflict instead of cancelling the
newer refresh with the process result.

`expectedText` is not sufficient on its own. The renderer captures a minimal
immutable `MindMapNodeEditSnapshot` when editing begins; it includes the exact
source line, complete-buffer source revision, and structural fields but no
child tree. The pure edit planner first rejects a changed source revision, then
checks the current line's node kind, heading level/list marker/task state, raw
source, and visible text. This also prevents an inserted identical duplicate
from stealing a line-based edit target. Missing or stale mappings fail without
a write.

An equivalent controller refresh may rebuild immutable node objects without
changing the target. The renderer compares semantic source facts rather than
object identity so an identical-revision reparse can retain the input, but it
never advances the captured whole-buffer revision. A later commit therefore
stale-rejects instead of rebinding a line-based ID to an inserted identical
duplicate. The controller also suppresses publication when the deterministic
whole-buffer revision is unchanged, so editor-change and Vault-save echoes do
not restart layout or dismiss a newly created topic editor.

A blur commit retains the original source path in that snapshot. If clicking a
different note changes the active controller frame before the asynchronous
frontend intent is handled, the host still validates and applies the explicit
commit to the original note. Controller refresh is skipped automatically when
that note is no longer the displayed source.

## Decorations and persistent annotations

Markers, boundaries, summaries, and relationships are presentation
decorations, not fake tree children. The phase-one parser does not infer these
concepts. `MindMapDecoration` is a typed extension union, not a claim that a
decoration feature is available: the built-in capability catalog declares
`renderedDecorations: []`, so its frontend neither authors nor renders any of
them.

Source-derived node IDs intentionally identify a node in the current document
snapshot using its source line. Edits above a node can therefore change its ID.
The current locator layer combines path, source anchor, semantic ancestry,
sibling occurrences, structural position, and subtree fingerprints to
reconcile interaction/history and persisted presentation references
conservatively. The versioned `AnnotationStore` keeps document
layout/style/palette/global-font/connector-width/connector-profile, node and
edge overrides, collapsed references, and scene-space viewport in
`Plugin.saveData`; it never writes hidden Markdown metadata. Its annotation
codec can preserve valid decoration records for a future rendering adapter, but
they are not part of the built-in runtime presentation. Missing or ambiguous
targets become explicit orphan records and are not rendered. File rename events
migrate exact document paths and every nested locator through the same
serialized save boundary.

Plugin data normalizes the custom presentation library before it constructs the
active Style/Palette registries and validates persisted settings/default IDs.
Document hydration then applies each compatible layout, Style, Palette, font,
width, profile, node, edge, and decoration field independently. A temporarily
unavailable custom definition, effect, shape, route, or layout option therefore
does not erase an unrelated valid field, and the durable record remains intact
for a future session that restores the missing capability.

Custom Style/Palette update and delete commands use optimistic concurrency.
They must include the revision shown when the frontend created its draft or
delete action. The host compares that revision inside the serialized plugin-data
transaction; a mismatch or removed entry returns a structured stale result and
performs no write. The frontend then discards the old draft and rebuilds it from
the refreshed capability frame instead of replaying stale values.

## Starting a new frontend

1. Implement `MindMapFrontend`.
2. Select it in the plugin composition root by replacing the factory returned
   by `createMindMapFrontend`.
3. Consume only `MindMapFrontendFrame`; do not import the concrete controller,
   ItemView, or default DOM renderer.
4. Register new layout engines in `MindMapLayoutEngineRegistry` together with
   matching capability descriptors and an immutable option schema. If sibling
   order is not represented by the global horizontal/vertical axis, also provide
   the engine's pure `resolveNodeDropPlacement` policy.
5. Register styles, palettes, global fonts, connector widths, and connector
   profiles independently. Verify style effect IDs against the renderer adapter's
   effect resolver, then compose an effective theme and formatting snapshot.
   Normalize custom Style/Palette entries before rebuilding active registries;
   do not let a frontend choose IDs that capabilities do not advertise.
6. Add any adapter-specific implementation behind the same effect profile ID;
   do not branch on style or palette IDs in a renderer.
7. Emit semantic events for state changes and choose `view`, `document`, or
   `default` scope explicitly where supported. `view` is ephemeral, `document`
   is durable for the current Markdown path, and `default` belongs to settings.
   Direct global-font, connector-width, and connector-profile events use
   `document`. Continuous controls must use preview/commit/cancel gesture
   events; do not write plugin data or history from the frontend.
8. Emit `edit-node-text` only after an explicit commit, include the frame's
   original text and `MindMapNodeEditSnapshot`, and display rejected commits
   without optimistic source mutation. Use `createMindMapNodeEditSnapshot`
   instead of constructing structural anchors in UI code.
9. Emit `create-node` only from an explicit topic gesture, carrying the same
   immutable snapshot. Let the host plan, validate, and perform the Markdown
   insertion, then focus the verified created node.
10. Keep preview elements adapter-local but consume
    `resolveNodeDragDropPreview` (or an equivalent registered resolver). Emit
    exactly one `move-node` only after a valid completed drop, with both
    immutable endpoint snapshots and a semantic `before`, `after`, or `child`
    placement.
11. Model selection with replace/toggle/range/marquee semantic events. Use a
    sparse `apply-presentation-patch` map for selected-topic formatting, retain
    mixed values as UI state, and do not infer source mutations from the number
    of selected nodes.
12. Emit `execute-topic-command` for copy/cut/paste/delete/create-parent/
    outdent/history. The Obsidian host owns the internal clipboard, source
    queue, history, authoritative buffer, and planner invocation.
13. Emit `toggle-task` only from an explicit rendered task checkbox with the
    immutable `MindMapNodeEditSnapshot`. The host owns stale checks, the single
    source write, reparse, and content-history record.
14. Keep unsupported decorations out of the rendered capability list.

Parser behavior, source-line navigation, debounce/race handling, and Vault
synchronization do not need to change during this UI replacement.

## Deliberate extension semantics

- Asset capabilities are stable IDs and labels, not URLs or renderer-specific
  payloads. A replacement frontend can own its icon/marker library directly, or
  its factory can receive a resolver from the composition root. If assets later
  become independently installable theme packages, add a typed resolver at
  that boundary instead of placing DOM, filesystem, or network handles in the
  presentation snapshot.
- A view-scoped presentation is a complete, ephemeral per-tab layer with higher
  priority than document hydration. It survives document hydration and visual
  refresh. A source switch clears only source-keyed node/edge/decoration data,
  retaining layout/style/palette/formatting. If a future product needs
  field-level inheritance, represent provenance in `MindMapViewSession`; no
  parser, controller, layout engine, renderer, or navigation contract needs to
  change.
- A document-scoped presentation is a validated sparse annotation snapshot.
  Persist node references through `AnnotationStore`, never renderer node IDs or
  hidden Markdown metadata. Style, palette, formatting, and layout remain
  independently selectable.
- Styles, palettes, formatting, and layouts are intentionally independent. A
  future XMind-like “template” that chooses several axes should be a separate
  preset layer that emits one `replace-presentation` event; the host reduces
  that snapshot to a semantic patch and assigns persistence/history ownership
  only to fields that actually changed. It must not make one axis silently
  replace another.
- Custom-library editors retain their local dirty draft and base revision when
  another view publishes a divergent revision. A `presentation-library-conflict`
  command must never trigger an automatic retry; frontends expose an explicit
  recovery action before discarding local values. Missing entries may fall back
  immediately because there is no remaining target to update.
- Layout engines are synchronous today. A future worker/ELK engine needs a
  cancellable asynchronous resolver with generation handling at the layout
  boundary, not asynchronous DOM mutations inside the renderer.
- The current `targetNodeId + before/after/child` anchor is renderer-neutral.
  `before` and `after` identify an exact same-kind target and may move the
  source under that target's parent; `child` appends to a compatible target.
  Multi-node dragging and a free destination index with no target child are
  not implemented. If added, they belong in the drag resolver, command model,
  and Markdown planner rather than parser/theme/controller code.

## Presentation-extension test boundary

Keep framework-free tests focused on registry validation and ID allocation,
Style/Palette axis separation, layout-option schemas and engine normalization,
safe font/profile resolution, sampled tapered-connector geometry, snapshot
cloning, preview lifecycle conflicts/cancellation, library-draft reconciliation,
and sparse multi-selection formatting patches. Keep host/frontend tests focused
on capability advertising, library-first settings normalization, commit-time
appearance reconciliation, field-granular annotation hydration,
one-save/one-history gesture commits, persistence rollback, and semantic DOM
event routing. No test should require Markdown mutation to verify presentation
behavior, and no renderer test should make a style or palette ID its control
flow.

## Non-goals

These contracts authorize only explicit checked node-text commits, topic
creation gestures, completed valid structural drops, and the source-changing
topic commands listed above. Copy/selection/navigation remain non-mutating.
They do not authorize implicit/background note edits, hidden metadata,
free-position persistence, network access, telemetry, whole-Vault scanning, or
mobile compatibility claims. The internal clipboard/history are not
cross-session persistence, arbitrary external clipboard import, or root-rename
undo. These contracts are not an XMind or MindMaster file-format
implementation; they provide stable seams for richer layout engines, styles, palettes,
effect adapters, and a future preset/editor frontend.
