# MindBraid repository guide

## Product contract

MindBraid is a desktop-only Obsidian plugin that visualizes the active Markdown
note as a mind map. Creating a new Markdown note from an external mind-map
file is allowed only after an explicit `import-mind-map-file` command, successful
read-only preview, and final user confirmation. Existing source changes are
allowed only after an explicit inline node-edit commit, node-creation gesture,
completed structural node drop, or explicit topic command from the user.
Authorized topic commands are cut, delete, paste, create-parent, outdent,
toggle-task, undo, and redo; copy, selection, navigation, presentation, import
inspection/preview, and refresh remain non-mutating. The plugin must
never make implicit note changes, scan the whole vault on load, access the
network, or emit telemetry.

Creating an SVG, PNG, JPEG, or PDF export artifact is allowed only after the
user activates the explicit export control and confirms its options. Export is
read-only with respect to Markdown, presentation annotations, and Vault notes;
it must capture one immutable per-tab scene snapshot and must not change the
live viewport, collapsed state, selection, or active inline edit.

The stable plugin ID, persisted data schema, TypeScript symbols, and CSS prefix
remain `obmind`/`ObMind` for backward compatibility. User-visible product text
uses `MindBraid` and must not be coupled to those technical identifiers.

## Architecture boundaries

- `src/core/model.ts` contains framework-free data contracts.
- `src/core/parser.ts` converts the supported Markdown subset into the tree model.
- `src/core/link-target.ts` owns the pure Vault-local link-target policy used
  before the Obsidian host resolves a Markdown or wikilink destination.
- `src/layout/layout.ts` defines renderer-neutral geometry, typed paths, and the
  one-sided tree engine.
- `src/layout/bilateral-layout.ts` implements the root-centered balanced tree engine.
- `src/layout/layouts.ts` is the injectable layout-engine registry.
- `src/layout/layout-options.ts` defines primitive-only, engine-owned option schemas
  and resolves the built-in compactness, alignment, and bilateral branch
  distribution options.
- `src/layout/scene-culling.ts` resolves thresholded viewport culling with
  overscan and pinned interaction nodes without creating DOM elements.
- `src/layout/minimap.ts` maps full-scene bounds, viewport rectangles, and
  pointer coordinates between scene and minimap space.
- `src/presentation/presentation.ts` contains renderer-neutral layout, independent style,
  palette, and document formatting contracts, effective theme snapshots,
  element-style, effect-reference, branch-color, decoration, capability, and
  interaction contracts.
- `src/presentation/color-contrast.ts` owns framework-free CSS color parsing, alpha
  composition, luminance, contrast scoring, and default topic-foreground
  selection. DOM host-token resolution remains in the renderer adapter.
- `src/presentation/presentation-snapshot.ts` creates ownership-safe presentation snapshots
  for gesture, persistence, and history boundaries.
- `src/presentation/presentation-patch.ts` validates and immutably applies capability-aware
  layout, theme, document formatting, node, edge, and decoration presentation
  commands.
- `src/presentation/assets.ts` owns the injectable, offline, primitive-only
  icon/marker/tag registry shared by frontend previews, rendering, and export.
- `src/presentation/node-assets-edit.ts` builds immutable multi-selection node
  asset patches without reading Markdown or accessing the DOM.
- `src/presentation/decorations.ts` owns validated relationship, boundary,
  summary, and node-label commands, selection reconciliation, and pure geometry.
- `src/presentation/presentation-gesture.ts` owns the framework-free begin/update/commit/
  cancel lifecycle for one coalesced, stale-checked presentation preview.
- `src/presentation/presentation-history.ts` owns bounded, per-document in-memory
  presentation undo/redo independently from Markdown history.
- `src/presentation/presentation-library.ts` owns versioned, JSON-safe user Style/Palette
  definitions, ID allocation, validation hooks, fallback resolution, and
  preview composition without touching document annotations.
- `src/presentation/presentation-library-editor.ts` owns framework-free, controlled draft
  transformations plus dirty/base-revision reconciliation for editable Style
  and Palette library fields.
- `src/ui/basic-presentation-library-editor.ts` owns the DOM construction and
  DOM-to-semantic draft-change parsing for the built-in Style/Palette library
  editor, including explicit conflict-recovery controls. It depends only on
  frontend/presentation/draft types, must not import Obsidian, and does not
  apply drafts, persist data, or dispatch frontend events.
- `src/application/persistence/presentation-persistence.ts` owns commit-time Style/Palette reference
  reconciliation and composition generations for stale-safe library,
  document-presentation, and default-presentation persistence.
- `src/application/persistence/annotations.ts` owns versioned plugin-data annotations, metadata-free
  persistent node references, document presentation hydration, orphan policy,
  and path migration.
- `src/presentation/styles.ts` contains renderer-neutral geometry/treatment style specs,
  including branch-color application channels, and the independently
  extensible style registry.
- `src/presentation/palettes.ts` contains renderer-neutral color values, role colors,
  branch palettes, light-mode overrides, and the independently extensible
  palette registry. It must not decide fill/stroke/text treatment.
- `src/presentation/formatting.ts` owns safe, independently extensible registries for
  document-wide font families, connector widths, and connector profiles.
- `src/layout/connector-geometry.ts` turns typed layout paths and registered stroke
  profiles into deterministic variable-width connector outlines.
- `src/presentation/themes.ts` is the pure style/palette composition and legacy-theme
  migration boundary; renderers consume only its effective theme snapshots.
- `src/presentation/render-effects.ts` validates renderer-neutral effect capabilities and
  style requirements.
- `src/application/composition/built-in-composition.ts` is the only
  adapter-specific assembly point for built-in styles, palettes, formatting
  registries, DOM/SVG effects, and truthful frontend capabilities.
- `src/presentation/hand-drawn.ts` contains deterministic, framework-free pencil geometry.
- `src/topic/interaction/node-interaction.ts` resolves framework-free topic click and keyboard
  intents.
- `src/layout/node-content-layout.ts` owns renderer-neutral adaptive topic sizing,
  wrapping, editor bounds, and branch-flow policy.
- `src/layout/collapse-indicator.ts` owns branch counts, disclosure semantics,
  accessible labels, and geometry-derived outgoing orientation.
- `src/topic/interaction/node-drag.ts` resolves framework-free drag thresholds, coordinate
  conversion, valid targets, before/after/child drop semantics, and
  renderer-neutral destination-preview geometry.
- `src/topic/mutation/node-edit-workflow.ts` serializes edit-then-create continuations with a
  fresh source revision.
- `src/core/inline-markdown.ts` maps supported inline Markdown to visible topic text
  and conservatively preserves balanced wrappers during visible-text edits.
- `src/topic/mutation/node-insert.ts` plans checked Markdown structure insertions without
  accessing Obsidian or the DOM.
- `src/topic/mutation/node-mutation.ts` contains shared, framework-free source-line, range,
  tree-index, and source-fact helpers for structural mutation planners.
- `src/topic/mutation/node-move.ts` plans checked, lossless Markdown subtree moves without
  accessing Obsidian or the DOM, including exact compatible before/after
  placement under another parent.
- `src/topic/mutation/node-delete.ts` plans atomic multi-selection branch deletion or
  delete-and-promote operations.
- `src/topic/mutation/node-clipboard.ts` defines the versioned internal branch payload and
  checked child/sibling paste planner. It never accesses the system clipboard.
- `src/topic/mutation/node-parent.ts` atomically inserts a parent and wraps one heading or
  list subtree.
- `src/topic/interaction/node-navigation.ts` indexes the visible tree and resolves
  orientation-aware navigation and sibling-reorder intents.
- `src/topic/interaction/node-focus.ts` creates immutable focus-root/depth
  projections and breadcrumbs for per-tab drill-down navigation.
- `src/topic/interaction/node-selection.ts` owns immutable replace/add/toggle/range selection and
  renderer-neutral marquee intersection.
- `src/presentation/node-presentation-edit.ts` builds checked sparse node-formatting patches
  for one or many selected topics without reading or writing Markdown.
- `src/topic/node-identity.ts` creates metadata-free structural locators and performs
  conservative transient-state reconciliation across source revisions.
- `src/topic/interaction/node-search.ts` indexes and searches only the current parsed document.
- `src/topic/mutation/node-task.ts` plans an exact stale-checked task marker toggle.
- `src/presentation/task-control.ts` owns deterministic, renderer-neutral task checkbox
  geometry shared by the live canvas and export adapters.
- `src/topic/interaction/topic-command.ts` defines renderer-neutral topic commands and their
  keyboard shortcut resolver.
- `src/application/history/mutation-history.ts` owns bounded, LRU, in-memory, stale-safe source
  transactions for undo and redo.
- `src/application/queues/exclusive-task-queue.ts` serializes explicit source mutations at the
  Obsidian host boundary.
- `src/core/source-content.ts` defines live-editor-over-stored-content precedence.
- `src/ui/branding.ts` owns the renderer-neutral ObMind icon ID and SVG geometry.
- `src/import/` contains the framework-free, bounded external mind-map import
  contracts, archive/XML readers, vendor adapters, registry, and Markdown
  conversion planner.
- `src/export/` contains renderer-neutral export contracts, scene data, SVG,
  raster image, density-metadata, PDF, and artifact-sink ports. Encoders must
  never read the Vault, DOM, Obsidian globals, Node.js, Electron, or network.
- `src/export/presentation-primitives.ts` converts registered asset primitives
  and resolved decoration geometry into deterministic export-scene primitives.
- `src/export/session.ts` owns one cancellable dialog session, scene/plan/SVG
  caches, generation invalidation, and stale-before-save checks.
- `src/application/session.ts` owns transient state for one open mind-map tab.
- `src/i18n/i18n.ts` owns the framework-free locale, translator, named
  interpolation, and number-formatting contract. Namespaced i18n catalog files
  contain product copy only; they must not import Obsidian or mutate state.
  Cross-adapter expected failures use `ObMindLocalizedError` so the receiving
  UI translates a stable key in its current language; arbitrary lower-level
  `Error.message` values are diagnostics and must not become visible UI copy.
- `src/i18n/capability-i18n.ts` creates display-only localized capability snapshots
  from stable registered IDs. It must preserve user-authored Style and Palette
  labels literally and must never change executable capability IDs or specs.
- `src/ui/frontend.ts` is the complete replaceable UI boundary.
- `src/ui/basic-frontend.ts` is the phase-one toolbar/status/canvas implementation;
  it owns library-editor state and event dispatch while delegating library DOM
  controls and control-to-draft parsing to `basic-presentation-library-editor`,
  and owns the replaceable capability-driven export dialog adapter.
- `src/ui/dom-svg-effects.ts` maps registered effects to the DOM/SVG adapter.
- `src/ui/renderer.ts` owns DOM/SVG rendering and canvas interactions. It must
  consume composed snapshots rather than switch on style/palette IDs, and it must not import
  from `obsidian`.
- `src/application/controller.ts` owns source selection, debouncing, parsing, and immutable
  view state.
- `src/application/config.ts` owns settings defaults, validation, and migration.
- `src/tests/vendor-types/` contains build-time-only static-analysis contracts
  for dependency-less Community Plugin Scorecard runs. It lives under the
  test-only boundary so upstream declarations are not themselves treated as
  plugin source by the scorecard. The Obsidian declaration must remain
  byte-identical to the installed package and is verified by
  `scripts/verify-vendor-types.mjs`; these files must never enter `main.js`.
- `src/application/persistence/plugin-data.ts` owns the shared settings/annotation envelope and its
  transactional serialized persistence boundary, including custom-library
  normalization before active registries validate settings.
- `src/application/queues/serial-mutation-queue.ts` prevents concurrent default-setting changes
  from overwriting one another.
- `src/obsidian/view.ts`, `src/obsidian/settings.ts`,
  `src/obsidian/import-modal.ts`, and `src/obsidian/main.ts` are the only
  Obsidian UI/integration layers.
- UI code consumes stable model, controller, and layout interfaces. A future UI
  rewrite must not require parser or controller changes.

Dependencies must flow toward the framework-free core. Do not import Obsidian,
Node.js `fs`/`path`, or Electron APIs into model, parser, layout, or renderer.

## Non-negotiable implementation rules

- Do not create a new development branch unless the user has explicitly
  approved creating that branch for the current task. Ask first.
- Use only the public Obsidian API and the plugin instance's `this.app`; never
  use a global `app`.
- Read and edit note content only with Obsidian's public Vault, FileManager, or
  Editor APIs. Never use filesystem/Electron APIs.
- A note write, note creation, or file rename must correspond to one explicit
  user node-edit commit, node-creation gesture, completed valid node drop,
  delete, cut, paste, create-parent, outdent, toggle-task, undo, redo, or
  confirmed `import-mind-map-file` command. Preserve Markdown structure, reject
  stale source mappings, and never create hidden metadata or background edits.
- Copy may update the plugin's in-memory structured clipboard and attempt a
  plain-Markdown system clipboard write, but it must never modify a note.
  Paste reads only the validated internal payload; do not imply that arbitrary
  external clipboard Markdown is accepted.
- Keep source history bounded and in memory. Undo/redo must verify the exact
  path, content, and revision before replacing source, and must not include
  root file renames unless a separate checked rename-history design is added.
- Serialize presentation save/history operations, merge only gesture-owned
  annotation fields, and clear path-bound presentation history after rename.
  A delayed viewport or another tab must not replace newer unrelated state.
- Serialize library changes, document presentation writes, default presentation
  writes, and annotation maintenance through one host-owned presentation queue.
  Revalidate Style/Palette references at the actual write boundary; an old tab
  must never restore a removed library ID.
- Custom Style/Palette update and delete commands must carry and validate the
  displayed entry revision. Treat stale revisions as recoverable conflicts with
  no plugin-data write; never silently overwrite a newer library definition.
- Preserve dirty Style/Palette drafts when another tab advances the entry
  revision. Require an explicit conflict action before discarding local input;
  never retry a stale draft automatically.
- Reject structural list mutations when non-blank continuation/body lines are
  not represented by the parsed subtree; unsupported syntax must never be
  orphaned or silently reassigned.
- Reconcile line-derived node IDs only through conservative structural
  locators. Ambiguous reconciliation must drop transient state instead of
  attaching it to a different duplicate node. Never persist locators as hidden
  Markdown metadata.
- Keep `Vault.process` callbacks pure: calculate and return source content
  inside the callback, then update view/controller state only after the
  process succeeds. Re-read the current editor or Vault content before
  publishing an awaited off-editor mutation.
- Do not append, delete notes, or change content for presentation/settings
  operations.
- Import adapters are framework-free, read-only parsers. Only the Obsidian host
  may create one new Markdown note after explicit preview confirmation; an
  import must never overwrite or mutate an existing note.
- Export encoders operate only on a click-time immutable scene snapshot. They
  must exclude transient selection, hover, editor, drag, menu, toolbar, and
  sidebar UI; any Blob URL, bitmap, canvas, timer, and abort task must be
  released on success, failure, cancellation, view close, and plugin unload.
- Parse only the file currently displayed by the mind-map controller.
- Debounce repeated content changes at approximately 250 ms.
- Preserve 0-based source line mappings and never use node text as an ID.
- Filter collapsed descendants before creating their DOM or SVG elements.
- Long topic text must remain inside its shape. Apply an injectable logical
  sizing policy, allow display nodes to grow naturally, and reserve nested
  editor scrolling for content beyond the strategy's explicit maximum block
  size.
- Treat `none`, `underline`, and a fill equal to the active canvas as visually
  unfilled topics. Their default text must use the active palette's normal text
  color for the current light/dark scheme; only an explicit sparse node text
  override may replace that contrast-safe fallback.
- Filled default topics must choose a foreground that remains distinct from
  the effective fill after alpha composition over the canvas. Use Palette
  semantic candidates and actual resolved colors without Style/Palette ID
  conditionals; explicit sparse node text overrides remain authoritative.
- Expanded disclosure controls appear only on hover/focus; collapsed controls
  remain visible and report the total hidden descendants. Resolve the outgoing
  side from layout geometry rather than a theme ID.
- Structural drag feedback must consume a pure preview descriptor. Never infer
  or commit a different target from visual-only CSS/DOM placement.
- Layouts whose future placement depends on the candidate tree (including
  bilateral root balancing) must predict preview geometry with the same
  immutable layout rule used after commit.
- Keep source facts, presentation choices, and per-tab interaction state in
  their separate contracts. Do not add visual fields to `MindMapNode`.
- Keep language as a global plugin setting and immutable frontend/render input.
  Never persist language into Markdown, annotations, presentation themes, or
  per-tab interaction state. Chinese is the fallback for missing/invalid data.
- Localize ObMind-owned visible text, title, placeholder, status, tooltip, and
  ARIA strings through the injected language contract. Translate built-in
  capabilities from stable IDs; never translate user-authored labels or note
  content.
- Treat `presentation.layout` as the only frontend layout truth. Controller
  direction is a legacy persisted default.
- Keep styles, palettes, document formatting, and layout engines independently
  selectable. One axis must never silently choose another appearance axis or a
  layout engine.
- Keep document-wide formatting independent from styles and palettes. Its
  priority is per-element override, then document formatting, then the current
  style default. Persist registered IDs only, never arbitrary font-family CSS.
- Palette changes must be color-only: they may replace semantic, role, and
  branch colors, but must not change shapes, typography, effects, branch-color
  application channels, viewport, or measured geometry.
- Resolve visual effects through the injected effect registry. Do not add
  `theme.id` conditionals to the renderer or CSS selectors.
- Any hand-drawn variation must be deterministic from stable node/edge IDs;
  never use `Math.random()` during rendering.
- Variable-width dashed/dotted connector geometry must reject non-finite path
  lengths and keep deterministic path-sampling and per-stroke-pass segment
  bounds; visual line styles must never create unbounded DOM/SVG output.
- Reject palette values capable of loading URLs or injecting CSS declarations.
- Every CSS class and selector must use the `obmind-` prefix and Obsidian CSS
  variables.
- Register Obsidian events with `registerEvent` and explicitly release timers,
  observers, animation frames, DOM listeners, and renderer resources.
- Do not add runtime dependencies without documenting the reason in `PLAN.md`.
- Keep scorecard dependency contracts synchronized. Do not replace
  `src/tests/vendor-types/obsidian.d.ts` with a hand-edited or weakened
  declaration, and do not suppress first-party type-safety rules to hide
  unresolved imports.
- `main.js` is generated by esbuild; never edit it by hand.

## Required checks

Run these before considering work complete:

```sh
npm run test
npm run verify:vendor-types
npm run typecheck
npm run lint
npm run build
npm run check
git diff --check
```

Confirm that `main.js`, `manifest.json`, and `styles.css` exist and that source
code contains no note-writing path outside the explicit source-mutation host
for edit/create/move/topic commands, no network request, telemetry, global
`app`, Node.js `fs`/`path`, or Electron usage.
