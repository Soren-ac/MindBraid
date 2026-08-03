# ObMind phase-one MVP plan

## Sidebar settings workbench redesign (2026-08-03)

The settings sidebar is implemented as a replaceable frontend workspace, not
merely reskinned. Its existing settings, events, persistence ownership, and
capability checks remain unchanged.

- The sidebar becomes one floating surface using the same border, radius,
  translucent background, shadow, and light/dark tokens as the top controls.
- A fixed header provides a clear title, short scope description, and close
  action. A three-item accessible tab list separates **Appearance**, **Topic**,
  and **Layout** work instead of presenting one long undifferentiated form.
- Appearance owns language/mode, Style, Palette, and document formatting.
  Topic owns selected-topic formatting, icons/markers/labels, and decorations.
  Layout owns focus/depth/minimap navigation, layout engine/direction, engine
  options, and spacing. Export remains a fixed footer action.
- Tabs are transient per-view UI state in `BasicMindMapFrontend`; they do not
  enter settings, annotations, presentation history, controller state, or
  Markdown. Existing section elements move between tab panels without changing
  their event listeners or semantic data attributes.
- Keyboard arrow/Home/End navigation, tab/tabpanel ARIA relationships, inert
  hidden panels, bilingual labels, teardown, and responsive split-pane sizing
  are part of acceptance.
- No runtime dependency is added. Primary changes are limited to
  `src/ui/basic-frontend.ts`, the frontend i18n catalog, `styles.css`, frontend
  tests, and the generated `main.js`.
- Acceptance was completed in Obsidian 1.12.7 against both light and dark
  ObMind appearance modes. The three panels, fixed footer, disabled and enabled
  topic controls, visible navigation actions, and right-aligned compact layout
  controls were visually verified after a production rebuild and reload.

## Professional mind-map P0 (implemented, 2026-08-03)

This milestone closes the highest-value gaps against mature desktop mind-map
applications without changing ObMind's offline, Markdown-authoritative product
contract. It adds node information affordances, non-tree presentation
decorations, large-map focus/navigation, and measurable performance and
accessibility guarantees. No background note write, hidden Markdown metadata,
network request, telemetry, Node.js/Electron API, or whole-Vault scan is
authorized.

### Data ownership

- Markdown and wikilink destinations are parsed as immutable source facts. A
  renderer emits a semantic navigation intent; only the Obsidian host resolves
  and opens the destination through public APIs. Display and navigation never
  rewrite the note.
- User-applied icons, markers, labels, relationships, boundaries, and summaries
  are explicit presentation annotations stored in versioned plugin data. They
  never enter `MindMapNode` and never mutate Markdown.
- Focus root, visible-depth limit, selected decoration, and minimap visibility
  are per-tab interaction state. They reset or reconcile conservatively across
  source changes and are not persisted as document presentation.
- Layout, Style, Palette, formatting, node/edge overrides, and decorations stay
  independent. P0 must not make an asset or decoration silently select another
  appearance or layout axis.

### Architecture

- Extend `src/core/inline-markdown.ts` and `src/core/model.ts` with a bounded,
  renderer-neutral inline-link projection. The parser preserves visible text,
  source offsets, link kind, target, and label without importing Obsidian.
- Add `src/presentation/assets.ts` for an injectable, JSON-safe local asset
  registry. Built-ins use primitive badge/progress/symbol descriptions rather
  than DOM nodes, URLs, or adapter callbacks.
- Add `src/presentation/decorations.ts` for immutable decoration commands,
  unique-ID allocation, selection-safe updates, and pure geometry inputs.
- Add `src/topic/interaction/node-focus.ts` for focus-root/depth filtering,
  breadcrumbs, and reconciliation. Focus filtering happens before layout and
  DOM/SVG creation, like collapse filtering.
- Extend the existing presentation patch, annotation persistence, frontend
  capability, and history boundaries instead of creating a second store.
- The DOM/SVG renderer owns hit testing and visual adapters for assets,
  decorations, minimap, and viewport culling. Export consumes the same
  renderer-neutral geometry and excludes transient selection/minimap chrome.
- Add a scene-culling policy with a conservative overscan rectangle and a
  threshold below which all visible topics remain mounted. The layout engine
  remains synchronous in P0, but the renderer contract exposes cancellable
  scheduling seams for a later Worker-backed engine.

### P0 feature scope

1. **Node information toolbox**
   - Offline built-in marker assets for priority, progress, status, flag, and
     star categories, with localized labels and deterministic previews.
   - Multi-selection marker add/remove/reset and one free-text node label.
   - Render and export selected node assets without changing topic geometry
     unexpectedly or covering task controls/text.
   - Parse Markdown links and wikilinks in heading/list labels. Expose an
     explicit link affordance and semantic open-link action that does not
     replace normal topic selection/editing.
2. **Decorations**
   - Create, edit, select, and delete relationships, subtree boundaries, and
     summaries from the sidebar. Relationship authoring requires exactly two
     selected nodes; boundaries and summaries require a non-empty selection.
   - Render deterministic relationship paths/labels, padded group boundaries,
     and orientation-aware summary brackets/text. Include them in SVG/PNG/JPG/
     PDF export and presentation undo/redo.
3. **Large-map navigation**
   - Focus the primary branch, drill deeper, return through a breadcrumb, clear
     focus, and limit displayed descendants by depth.
   - Render a non-exported minimap with scene bounds and the live viewport;
     clicking or dragging the minimap recenters the canvas.
4. **Performance and accessibility**
   - Add deterministic 1,000/5,000-topic layout/culling benchmarks and
     non-wall-clock complexity assertions in normal tests.
   - Cull offscreen topics only above the registered threshold while keeping
     selection, search reveal, keyboard focus, editing, drag, fit, and export
     semantics correct.
   - Expose tree/treeitem semantics, levels, expanded state, set position/size,
     decoration labels, and keyboard focus without making SVG edges focusable.

### UI and extension rules

- The basic sidebar gets capability-driven **Markers**, **Decorations**, and
  **Navigation** sections. It must not switch on built-in asset IDs outside the
  registered preview adapter.
- All new visible text, title, placeholder, error, and ARIA content is added to
  both Chinese and English catalogs.
- Every selector remains `.obmind-` scoped and uses Obsidian variables. Asset
  colors derive from semantic palette roles and must remain readable in light
  and dark modes.
- A future Canvas/WebGL frontend can replace the UI and renderer without
  changing parser, annotation, command, focus, or geometry contracts.

### Tests and acceptance

- Pure tests cover link extraction, asset validation/ID resolution, decoration
  commands and geometry, focus/depth filtering, reconciliation, culling, and
  minimap coordinate conversion.
- Frontend/renderer tests cover authoring controls, marker rendering, link
  activation, decoration hit testing and export, breadcrumbs, minimap input,
  tree semantics, and resource cleanup.
- Persistence tests cover decoration/marker round trips, stale locators,
  deletion/orphan behavior, and presentation history.
- Run `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run check`, and `git diff --check`; deploy only `main.js`,
  `manifest.json`, and `styles.css` to the existing smoke-test Vault without
  changing `data.json` or plugin enablement.

### Dependency decision

No new runtime dependency is planned. The existing tree/layout, SVG/DOM,
presentation annotation, and export primitives are sufficient; adding a
general graph/layout/UI library would enlarge the bundle and weaken the current
replaceable boundaries without solving a requirement that cannot be expressed
by the existing contracts.

### Completion record

- Implemented framework-free inline-link, asset, decoration, focus-projection,
  scene-culling, and minimap modules. Their contracts are consumed through the
  existing presentation/session/frontend boundaries rather than through
  renderer-only state.
- Added offline priority, progress, status, flag, star, and label assets;
  multi-topic asset controls; link affordances; relationship, boundary, and
  summary authoring; branch focus/depth navigation; and a per-tab minimap.
  Marker/decorations are persisted as versioned presentation annotations and
  included in SVG, PNG, JPG, and PDF export snapshots.
- Added accessibility semantics for tree topics and decorations, deterministic
  1,000/5,000-topic layout/culling coverage, and culling that keeps active
  interaction nodes mounted while exporting the full requested scene.
- Automated verification passed on 2026-08-03: `npm run test` (85 files,
  842 tests), `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run check`, and `git diff --check`.
- Deployed the generated `main.js`, `manifest.json`, and `styles.css` to the
  existing smoke-test Vault without changing `data.json` or plugin enablement.
  Remaining release check is manual Obsidian UI exercise of markers,
  decorations, link navigation, focus/depth controls, minimap drag, large-map
  culling, and export output.
- UI acceptance on 2026-08-03 found that the first minimap adapter painted only
  scene and viewport bounds, so its visible panel contained no map topology.
  The follow-up adds a renderer-neutral full-layout minimap projection and
  paints all visible nodes/connectors as a bounded set of combined SVG paths.
  The static overview is cached separately from the frequently updated
  viewport outline, preserving navigation responsiveness on large maps. The
  same runtime audit found that Chromium does not visually honor the HTML
  `hidden` attribute on the SVG minimap; explicit display state now prevents a
  disabled minimap from leaving an empty 180×120 panel. No runtime dependency
  was added.

## Source directory organization (2026-08-03)

This iteration is a structure-only refactor. It moves the 70 TypeScript files
currently flattened at `src/` into responsibility-based directories, updates
relative imports and documentation paths, and regenerates the existing plugin
bundle. It must not change exports, runtime behavior, persisted data, Markdown
mutation rules, UI behavior, dependencies, or public Obsidian integration.

### Target structure and dependency intent

```text
src/
  application/
    composition/        # built-in registry/capability assembly
    history/            # bounded source-mutation history
    persistence/        # annotations, plugin data, presentation persistence
    queues/              # serialized host-side work
  core/                 # source model, parser, inline Markdown, source precedence
  export/               # existing renderer-neutral export subsystem
  i18n/                 # translator, catalogs, capability localization
  import/               # existing renderer-neutral import subsystem
  layout/               # layout engines, options, geometry, content layout
  obsidian/              # the only Obsidian UI/integration adapters
  presentation/         # style, palette, theme, formatting, presentation state
  topic/
    interaction/        # selection, navigation, drag, search, commands
    mutation/           # checked Markdown topic mutation planners
  ui/                   # replaceable frontend and DOM/SVG adapters
```

- `src/` will contain no flat TypeScript implementation files. The esbuild
  entry moves to `src/obsidian/main.ts`.
- Existing `src/import/` and `src/export/` boundaries remain unchanged because
  they already isolate cohesive, framework-free features.
- No barrel `index.ts` files are introduced. Direct module imports keep
  dependency direction visible and avoid adding re-export cycles.
- The existing type-level cycles between presentation/color contrast,
  frontend/presentation patch, and Obsidian main/settings are preserved rather
  than redesigned during a path-only change.
- `src/ui/renderer.ts` remains independent from Obsidian. Only files under
  `src/obsidian/` may import the Obsidian package.

### Migration scope

- Move tracked files with `git mv`; do not rename exported symbols or merge
  modules.
- Rewrite relative imports in source, tests, and benchmarks from one explicit
  old-to-new path map.
- Update `esbuild.config.mjs`, the controller-specific ESLint override,
  `AGENTS.md`, and historical source paths in this plan.
- Leave `manifest.json`, `versions.json`, `styles.css`, package metadata, and
  dependencies unchanged. Regenerate `main.js` only through esbuild.
- Preserve the untracked user file `CLAUDE.md` without reading, modifying, or
  committing it.

### Verification

- Run `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run check`, and `git diff --check`.
- Confirm `main.js`, `manifest.json`, and `styles.css` exist, all tracked source
  imports resolve, and `src/` has no root-level `.ts` files.
- Re-run the repository checks for forbidden source dependencies and deploy the
  generated plugin artifacts to the existing smoke-test Vault without changing
  plugin data or enablement state.

### Completion record

- Moved all 70 formerly flat modules into the directories above and updated
  every affected source, test, benchmark, configuration, and architecture-doc
  path. `src/` now has zero root-level TypeScript files.
- Verified 131 affected TypeScript files against their pre-move versions after
  canonicalizing relative module specifiers; no non-path code difference was
  found.
- Passed `npm run test` (75 files, 782 tests), `npm run typecheck`,
  `npm run lint`, `npm run build`, `npm run check`, and `git diff --check`.
- Confirmed only the four files under `src/obsidian/` import Obsidian, and no
  source file added a Node.js filesystem/path/Electron import, network API, or
  global `app` access.

## Chinese/English product internationalization (implemented)

This iteration makes every ObMind-owned user-facing surface bilingual, with
Simplified Chinese (`zh-CN`) as the fresh-install and migration default and
English (`en`) as an explicit persisted choice. Language is a global plugin
preference: it never enters Markdown, document annotations, presentation
themes, or per-tab interaction state.

### Architecture and data flow

```text
ObMindSettings.language
  -> plugin host / ItemView frame
  -> replaceable frontend and renderer adapters
  -> toolbar, sidebar, canvas interactions, import/export dialogs
```

- Add `src/i18n/i18n.ts` as a framework-free translation boundary with a closed
  locale union, type-checked message catalogs, named interpolation, selected-
  locale number formatting, and a Chinese fallback for invalid persisted data.
- Carry the immutable language through `MindMapFrontendFrame` and
  `MindMapRenderInput`. Frontends continue to have no settings, Vault, or
  Obsidian dependency; they emit a `change-language` intent and the host owns
  persistence.
- Translate built-in layout, Style, Palette, formatting, connector, and export
  capability labels from their stable registered IDs. User-created Style and
  Palette labels are literal user data and must never be translated.
- Localize host commands, Ribbon tooltips, notices, ItemView titles, settings,
  import preview, frontend chrome, export workflow, renderer context menus,
  disclosure labels, titles, placeholders, status text, and ARIA labels.
- Language changes refresh every open mind-map view immediately. The live
  renderer, viewport, selection, collapse state, and inline editor remain
  mounted; localization refreshes adapter-owned text instead of rebuilding the
  parsed tree or mutating the note.
- Unknown lower-level exceptions remain diagnostic detail. User-facing
  summaries are stable translation keys so arbitrary English exception strings
  are not presented as the primary product message.
- Expected cross-adapter failures carry `ObMindLocalizedError` translation keys
  and are rendered in the receiver's current language. Untyped adapter,
  encoder, Vault, and parser error messages never flow into visible status text,
  dialog errors, tooltips, or ARIA labels.

### Expected files

- New: `src/i18n/i18n.ts`, `tests/i18n.test.ts`.
- Core contracts/settings: `src/application/config.ts`, `src/ui/frontend.ts`, `src/ui/renderer.ts`,
  `src/application/persistence/plugin-data.ts` (normalization only), and related tests.
- UI/host adapters: `src/ui/basic-frontend.ts`,
  `src/ui/basic-presentation-library-editor.ts`, `src/obsidian/import-modal.ts`,
  `src/obsidian/settings.ts`, `src/obsidian/view.ts`, and `src/obsidian/main.ts`.
- Documentation: `README.md`, `FRONTEND_CONTRACT.md`, and `AGENTS.md`.

### Verification

- Catalog tests prove both locales have identical keys, named placeholders are
  complete, invalid locales fall back to Chinese, and number formatting uses
  the selected locale.
- Config tests cover fresh installs, legacy data, valid English persistence,
  and invalid-value fallback.
- DOM tests cover default Chinese, English switching without remounting the
  renderer, dynamic interpolation, ARIA/title/placeholder text, built-in label
  localization, and preservation of user-defined labels.
- Run all required repository checks and deploy generated `main.js`,
  `manifest.json`, and `styles.css` to the existing smoke-test Vault.

### Completion record

- Implemented the framework-free translation boundary, split product catalogs,
  persisted global language preference, live host/frontend/renderer refresh,
  localized built-in capability snapshots, settings selector, sidebar selector,
  import/export chrome, accessibility text, and a stable localized-error
  boundary that prevents raw adapter messages from leaking into either locale.
- Verified with `npm run test` (74 files, 770 tests), `npm run typecheck`,
  `npm run lint`, `npm run build`, `npm run check`, and `git diff --check`.
- Desktop visual acceptance remains a manual Obsidian smoke test after
  reloading the plugin; this change does not alter a Markdown note or its
  document-scoped presentation data.

## Mind-map export P0 v2 (implemented milestone)

Status: implemented and automatically verified; desktop native-viewer and UI
acceptance remain release checks.

This iteration keeps the existing read-only export boundary while making the
workflow predictable before allocation, independently extensible by format,
responsive on large maps, and visually consistent with the floating ObMind UI.
The export dialog becomes a translucent, theme-aware surface with one tab per
registered format. Shared filename and content-scope controls remain common;
each tab owns only the options supported by its encoder.

### Architecture and contracts

- Add a pure `MindMapExportPlan` boundary that calculates logical dimensions,
  raster dimensions, maximum safe DPI, estimated RGBA working memory, and
  capability-aware diagnostics without creating a canvas or saving a file.
- Replace central format branching with an injectable encoder registry. Each
  encoder declares its format-specific DPI, background, quality, and PDF-mode
  capabilities; the frontend builds tabs and controls from those declarations.
- Model one cancellable `MindMapExportSession` around a renderer-neutral scene,
  source revision, presentation revision, scope, cached plans, and progress.
  A stale source/presentation revision invalidates the session before save.
- Keep raster execution behind an injected browser port. Prefer a
  feature-detected Blob Worker using `OffscreenCanvas`, `createImageBitmap`, and
  `convertToBlob`; fall back to the existing main-thread canvas adapter without
  changing encoder or UI code.
- Add phase-based progress (`capture`, `measure`, `layout`, `serialize`,
  `rasterize`, `encode`, `save`) and keep AbortSignal propagation through every
  asynchronous boundary.

### Performance decisions

- `visible-map` reuses the live renderer's immutable render input, measured
  node sizes, layout result, and node elements when they still match the
  current revision. It must not rebuild a hidden copy merely to remove
  selection/hover treatments, because export primitives already omit those
  transient decorations.
- `full-map` remains an isolated hidden measurement pass so collapsed
  descendants never need to be inserted into the live map.
- Replace per-character text-range measurement with line/run extraction whose
  DOM range work scales with wrapped lines rather than raw character count.
- Cache immutable scenes and serialized SVG within one dialog session. Format,
  DPI, quality, and background changes must not recapture or relayout the map;
  scope or source/presentation revision changes invalidate the relevant cache.

### UI behavior

- Use four capability-backed tabs: JPG, PNG, PDF, and SVG. The order may be
  supplied by the active encoder registry; no format-specific conditionals are
  allowed outside the export UI adapter.
- Show filename and content scope as shared controls. JPG owns DPI and quality;
  PNG owns DPI and background; PDF shows its current single-page raster mode;
  SVG owns background. Unsupported controls must not be mounted in another
  format's panel.
- DPI supports both presets and a bounded 72–600 numeric value. Preflight shows
  final logical/pixel dimensions, estimated working memory, and the highest
  safe DPI. An explicit `Use safe DPI` action applies the calculated value.
- Use scoped `.obmind-` selectors, Obsidian variables, translucent
  `color-mix(...)` surfaces, subtle blur/border/highlight treatment, and no
  fixed light-only background. Keyboard tab semantics and visible focus states
  are required.
- Progress and cancellation remain inside the modal. Export errors restore the
  selected tab and its capability-correct control state.

### Verification

- Pure tests cover planning, maximum-safe-DPI calculation, diagnostics,
  registry resolution, encoder capability truth, progress ordering, and stale
  session invalidation.
- Raster tests cover worker success, worker failure fallback, cancellation,
  density metadata, and allocation limits. A repeatable Vitest benchmark
  exercises 1,000- and 5,000-topic-equivalent scenes without becoming a flaky
  wall-clock assertion in the normal test suite.
- Renderer tests prove the visible fast path avoids hidden measurement, the
  full-map path still includes collapsed descendants, progress is emitted, and
  destroy cancels both paths.
- Frontend tests prove ARIA tab behavior, format-specific control isolation,
  custom/safe DPI, preflight updates, cached scene reuse, progress display,
  cancellation, and translucent CSS scoping.

## Mind-map export (implemented milestone)

Status: implemented and automatically verified; desktop native-viewer smoke
acceptance remains a release check.

The explicit Export action creates a read-only artifact from the mind-map tab
that owns the action. It supports standalone SVG, PNG, JPEG, and single-page
PDF. Export never changes Markdown, presentation annotations, collapse state,
selection, or viewport, and it never scans the Vault or accesses the network.

### Architecture

```text
per-tab renderer snapshot
  -> renderer-neutral MindMapExportScene
  -> format-independent encoders
       -> SVG
       -> SVG rasterizer -> PNG / JPEG
       -> raster PDF adapter -> PDF
  -> explicit artifact sink
```

- `src/export/types.ts` owns immutable requests, capabilities, scene geometry,
  format options, limits, diagnostics, and artifacts.
- `src/ui/renderer.ts` captures a renderer-neutral `MindMapExportScene` from a
  hidden measurement layer. It rebuilds geometry for the requested scope and
  strips interaction-only state before it reaches an encoder.
- `src/export/svg.ts` emits a self-contained SVG with explicit safe colors,
  paths, shapes, and text. It must not depend on Obsidian CSS variables,
  external URLs, event handlers, scripts, or `<foreignObject>`; SVG text keeps
  a system-font family reference rather than embedding a font file.
- `src/export/raster.ts` rasterizes the same SVG snapshot through injected
  browser ports, applies an opaque background for JPEG, and enforces maximum
  dimensions and total pixel count before allocating a canvas.
- `src/export/image-density.ts` writes requested PNG/JPEG density metadata in
  addition to scaling real pixel dimensions by `dpi / 96`.
- `src/export/pdf.ts` embeds a fixed-resolution raster snapshot on one PDF page
  behind a replaceable PDF encoder interface. Vector and multi-page PDF remain
  future adapters rather than leaking PDF rules into the renderer.
- `src/export/exporter.ts` routes one immutable scene to the selected encoder,
  and `src/export/download.ts` owns the browser Blob download and URL cleanup.
- The renderer captures final measured geometry and click-time appearance but
  does not save files. `src/ui/basic-frontend.ts` owns the confirmation dialog and
  option controls; an injected artifact sink owns the user-initiated
  save/download operation.

### UI and behavior

- A sticky footer at the bottom of the right sidebar contains `Export…`; the
  existing settings list remains independently scrollable.
- The options modal provides filename, format, visible/full-map scope,
  background, PNG/JPG DPI presets, and JPG quality. Transparent background is
  available only for SVG and PNG. The current dialog does not offer custom DPI,
  final-dimension estimates, or preflight warning UI.
- PNG/JPG DPI presets are 96, 150, 300, and 600. Rasterization scales real
  output dimensions by `dpi / 96` and writes matching PNG/JPEG density
  metadata; it does not merely relabel a 96-DPI bitmap as high resolution.
- `visible-map` exports the current collapsed tree, rather than a crop of the
  current viewport. `full-map` measures and lays out all descendants without
  expanding or otherwise changing the live tab.
- Exports exclude selection/focus/hover treatments, inline editors, drag
  previews, context menus, disclosure hover controls, toolbar, and sidebar.
- Task state remains part of topic content. PDF always has an opaque
  current-theme background and is a fixed 192-DPI JPEG raster on one page;
  it does not provide selectable text or vector PDF output.
- Safe raster limits are 72–600 DPI, 16,384 pixels per side, and 67,108,864
  total pixels. Exceeding a limit rejects the export before canvas allocation.

### Dependency decision

Add `pdf-lib` as a browser-safe runtime dependency isolated behind the PDF
adapter. Hand-writing PDF cross-reference tables, image objects, page sizing,
and binary streams would create a specialized maintenance burden unrelated to
ObMind's domain. The first PDF is intentionally raster-backed to preserve
Unicode text and all built-in visual effects; a future vector PDF adapter can
replace it without changing scene capture, UI, or artifact saving. No SVG,
Canvas, download, or UI framework dependency is added.

### Verification

- SVG tests cover escaping, paint definitions, backgrounds, cancellation, and
  invalid padding without relying on live Obsidian UI.
- Raster tests use injected image/canvas ports and cover DPI scaling, safe
  allocation limits, transparent PNG, opaque JPG, quality normalization,
  cancellation, and cleanup.
- Density tests parse PNG `pHYs` and JPEG JFIF metadata after rewriting.
- PDF tests cover raster-image encoding and invalid/cancelled requests without
  loading Obsidian.
- Frontend tests cover sticky-footer placement, ready/unsupported disabled
  state, capability-backed modal controls, confirmed export requests,
  in-flight cancellation, and destroy cleanup. Renderer tests cover visible
  versus full-map capture and preservation of the live interaction state.
- Desktop smoke acceptance must verify all four files open in native viewers
  and that light/dark, Colorful/Cloud/Pencil, Chinese, long text, collapsed
  nodes, and oversize-export failure behavior match the current tab.

## External mind-map import (implemented milestone)

Status: implemented and automatically verified; desktop import-dialog smoke
acceptance remains a release check.

This milestone adds explicit, one-time import of XMind `.xmind`, MindMeister
`.mind`, and MindManager `.mmap` files. Import remains separate from the active
Markdown controller and from presentation persistence: adapters inspect
untrusted bytes and produce a renderer-neutral workbook, a pure planner creates
Markdown, and only the Obsidian host can create a new note after the user has
reviewed diagnostics and confirmed the destination.

### Architecture

- `src/import/types.ts`: immutable workbook, sheet, topic, diagnostic, limits,
  inspection, adapter, and registry contracts.
- `src/import/archive.ts`: bounded in-memory ZIP reader with allow-listed
  entries, duplicate/path/encryption checks, and no filesystem extraction.
- `src/import/xml.ts`: XML safety checks and namespace-tolerant helpers.
- `src/import/xmind.ts`: modern `content.json` and legacy `content.xml` adapter.
- `src/import/mindmeister.ts`: version-tolerant `.mind`/`map.json` adapter.
- `src/import/mindmanager.ts`: `.mmap`/`Document.xml` adapter.
- `src/import/markdown.ts`: deterministic imported-tree to Markdown plan and
  filename sanitization. Generated Markdown is reparsed by the existing parser
  in tests to prove hierarchy preservation.
- `src/import/commit.ts`: framework-free, port-based final creation guard that
  rejects invalid or occupied destinations before the Obsidian host performs
  the one explicitly confirmed `Vault.create` call.
- `src/import/registry.ts`: signature-first adapter selection. File extensions
  are hints only and never replace content inspection.
- `src/obsidian/import-modal.ts`: Obsidian-only file selection, sheet choice, loss report,
  destination preview, explicit confirmation, and one `Vault.create` call.
- The host holds an import-commit lock and serializes the confirmed creation
  through the same exclusive source-mutation queue used by explicit topic
  writes. The modal cannot be cancelled after commit starts; plugin unload can
  still force-close its UI while queued work is rejected safely.

### Supported semantic fidelity

- Preserve sheet/root titles, attached topic hierarchy, plain topic text, and
  binary checked/unchecked tasks when the source format exposes them.
- Multiple sheets are inspected and selected explicitly; one confirmation
  creates one note.
- The selected central topic becomes the suggested Markdown filename. Its
  attached topics become nested Markdown list items so arbitrary depth remains
  representable by the current parser.
- Notes, links, markers, attachments, images, relationships, boundaries,
  summaries, floating topics, coordinates, vendor layouts, and vendor styling
  are reported as unsupported rather than silently represented as imported.
- The source archive is never modified and no persistent link or background
  synchronization with it is created.

### Security and resource rules

- Validate magic bytes and required archive entries rather than trusting the
  extension or MIME type.
- Reject encrypted archives, encrypted XMind content, duplicate critical
  entries, absolute paths, backslash paths, traversal segments, unsupported
  compression, malformed UTF-8, and XML containing `DOCTYPE` or `ENTITY`.
- Cross-check ZIP central-directory records with local headers and bounded data
  ranges. Deflated allow-listed entries use caller-sized output buffers and
  must match the declared expanded length before their bytes are retained.
- Apply injected limits for input bytes, selected entry bytes, aggregate
  uncompressed bytes, entry count, sheet count, topic count, topic depth, and
  text length before creating large object graphs. XML is lexically bounded by
  element, attribute, and nesting-depth limits before `DOMParser` constructs a
  document tree.
- Never extract archives to disk, execute HTML, fetch external URLs, import
  remote resources, or use Node.js filesystem/path/Electron APIs.

### Dependency decision

Add `fflate` as the only runtime dependency, behind the archive-reader
interface. The three requested native formats are ZIP containers, while the
browser platform does not provide a sufficiently portable random-access ZIP
API for supported Obsidian desktop versions. `fflate` is small, browser-safe,
has no transitive runtime dependencies, and supplies raw DEFLATE expansion
behind ObMind's validated local-header and bounded-output layer. No vendor SDK
or viewer is embedded.

### Tests

- Per-adapter valid fixtures, multiple roots/sheets, task mapping, missing
  entries, unknown fields, legacy variants, malformed JSON/XML, and diagnostics.
- Archive signature, path traversal, duplicate entry, encrypted entry, entry
  count, uncompressed-size, topic-count, depth, and text-size limits.
- Deterministic Markdown escaping, filename conflicts, and
  parse-after-generate structural equivalence.
- Framework-free commit-boundary tests prove invalid or occupied destinations
  perform zero writes and one confirmed valid commit invokes the supplied host
  creation port exactly once. Desktop smoke acceptance covers picker/modal
  cancellation and the post-create workspace transition.

## Presentation authoring and layout expansion (active milestone)

Status: implemented and verified.

This milestone completes the recently introduced Style/Palette/Formatting
separation before additional visual presets are added. The implementation must
remain renderer-neutral, capability-driven, safe to persist, and replaceable by
a future XMind-like frontend.

### Current workstream status

The requested workstreams are implemented and covered by the repository's
required automated checks.

| Workstream | Status |
| --- | --- |
| P0.1 | implemented and verified |
| P0.3 | implemented and verified |
| P0.4 | implemented and verified |
| P1.1 | implemented and verified |
| P1.2 | implemented and verified |
| P1.3 | implemented and verified |
| P1.4 | implemented and verified |

### Final concurrency and adapter hardening

- All Style/Palette library commands, document-presentation writes, default
  presentation writes, history restoration, and annotation maintenance share
  one host-owned presentation queue. Commit-time reconciliation drops only an
  unavailable Style or Palette field, so delayed tabs cannot resurrect a
  deleted custom-library ID or overwrite the deletion fallback.
- Default-presentation queues carry a composition generation. A library change
  invalidates older composed snapshots; the semantic setting mutation retries
  against the new registry instead of surfacing a queue-close race. If another
  view deleted the requested Style/Palette before that retry, the selection is
  a safe no-op and retains the deletion transaction's current fallback.
- Custom-library editor drafts now retain dirty content and their base revision.
  A divergent cross-tab revision becomes an explicit read-only conflict with a
  user-controlled reload action; a matching newer definition is treated as the
  acknowledgement of the local save.
- Variable-width connector geometry supports solid, dashed, and dotted line
  styles without degrading `taper-to-child` to a uniform stroke. Registered
  deterministic edge effects are applied before the variable-width outline is
  built, preserving Style treatment independently from document formatting.
  Dash geometry rejects non-finite path lengths and is capped at 256 filled
  segments per stroke pass; unusually long finite paths scale their dash
  pattern deterministically instead of creating unbounded SVG elements.
- The public `replace-presentation` frontend event is reduced to a semantic
  patch against the current scope. Persistence/history ownership is derived
  from the actual changed fields rather than claiming every presentation axis.

### Requested scope

1. **P0.1 — Global formatting:** extend the safe font catalog and add an independent
   connector stroke profile. Uniform thickness and taper-to-child are modeled
   separately from Style, Palette, routing, and branch color.
2. **P0.3 — Preview transactions:** continuous controls update an
   ephemeral view snapshot, while commit performs one validated document write
   and creates one presentation-history entry. Cancel and persistence failure
   restore the exact previous snapshot.
3. **P0.4 — Registry-safe recovery:** make active registries the authority for
   default validation and hydration.
   Removed or invalid fields are recovered independently so one incompatible
   extension field cannot discard unrelated valid document presentation.
4. **P1.1 — Topic inspector:** add a selection-aware inspector that applies
   capability-validated sparse
   node and edge patches to one or many selected topics without reconstructing
   Markdown or embedding visual metadata in notes.
5. **P1.2 — Layout options:** expose layout-engine options through a generic
   schema. Built-in options for
   branch balance, compactness, and same-level alignment remain layout inputs;
   they are not Style fields and are interpreted only by the selected engine.
6. **P1.3/P1.4 — Custom Palette/Style libraries:** add versioned user Style and
   Palette libraries with safe validation,
   document-independent IDs, light/dark palette values, duplication, rename,
   deletion, preview, and explicit fallback when a referenced definition is
   removed. Style definitions cannot contain colors, and Palette definitions
   cannot contain geometry or effects.

### New and strengthened boundaries

- `formatting` and `connector-geometry`: safe font/width/profile registries and
  deterministic variable-width path geometry shared by SVG and future Canvas
  adapters.
- `presentation-gesture`: immutable begin/update/commit/cancel state machine
  for coalesced visual previews and stale-safe commits.
- `presentation-library`: versioned, JSON-safe custom Style/Palette definitions
  and validation independent from Obsidian storage.
- `presentation-library-editor`: pure, constrained draft updates for the
  editable library fields; it never becomes a source of CSS or DOM data.
- `layout-options`: generic capability validation and normalization. Layout
  engines receive only their own normalized options.
- `node-presentation-edit`: multi-selection sparse topic-formatting patches;
  it neither reads Markdown nor puts visual fields on parsed nodes.
- `presentation-patch`: remains the only capability-aware mutation boundary;
  frontends emit semantic sparse patches instead of complete stale snapshots.
- `plugin-data`: advances through an explicit migration and stores reusable
  custom definitions separately from per-document annotations.

### Persistence and history rules

- Preview updates never persist and never create history entries.
- A completed UI gesture persists once and produces at most one history entry.
- A gesture retains an immutable baseline, previous view layer, and viewport.
  Its updates replace only the ephemeral view preview; cancellation restores all
  three exactly. Commit first validates that the live baseline is unchanged.
- Failed persistence restores the previous document/view presentation and
  viewport; a stale commit leaves the preview available for cancellation or
  retry rather than committing an unrelated snapshot.
- Viewport persistence is coalesced independently and must not evict meaningful
  Style, Palette, Formatting, layout, or element-format history.
- Presentation history stores only the fields owned by the original operation;
  node and edge history also records the exact persistent targets it changed.
  Undo/redo rebases those values onto the latest document record, preserving
  newer viewport, collapse, decoration, and unrelated element state.
- Node and edge presentation writes carry the operation's pre-change document
  snapshot. Persistence derives a sparse ID-owned delta and rebases it onto the
  latest record, so two open tabs editing different topics retain both changes.
- Custom libraries use stable generated IDs and are validated against the
  active effect/shape/color safety rules before registration.
- Custom Style/Palette update and delete commands carry the revision displayed
  by the frontend. A stale or removed entry produces a structured conflict,
  performs no write, reloads the authoritative definition, and never resets an
  unrelated queued default-setting change.
- Plugin-data loading normalizes the user library first, rebuilds the active
  Style/Palette registries, and then validates settings/default IDs. Annotation
  hydration applies registered fields independently, so an unavailable custom
  definition or extension capability cannot discard another valid axis.
- Removing a custom Style or Palette does not modify Markdown. Documents that
  reference it are rebound to the declared fallback on that axis in the same
  serialized plugin-data transaction and retain all other valid axes.

### Dependency decision

No runtime dependency is added. The required registries, gesture state machine,
option normalization, color validation, and tapered connector geometry are
small domain-specific components. General form, graphics, or state-management
libraries would introduce UI coupling without replacing the required
ObMind-specific validation and migration logic.

### Verification additions

- Connector-profile registry, constant/tapered geometry, orientation, and
  deterministic rendering tests.
- Preview transaction coalescing, cancellation, stale commit, persistence
  failure rollback, and history isolation tests.
- Layout-option schema/default/range/unknown-key tests and engine behavior
  tests for balance, compactness, and alignment.
- Single-selection, multi-selection, mixed-value, reset, and sparse node/edge
  presentation patch tests.
- Custom Style/Palette library migration, validation, duplicate-ID, deletion,
  fallback, light/dark, contrast warning, and every-cross-pair composition
  tests.

### Parallel implementation ownership

- `connector_core` owns connector-profile and safe-font registry core changes,
  deterministic tapered SVG-path geometry helpers, and their focused tests. It
  does not modify frontend, Obsidian host, annotations, or plugin-data files.
- `layout_options_core` owns renderer-neutral layout-option validation and
  built-in engine behavior plus focused tests. It does not modify frontend,
  settings, annotations, or plugin-data files.
- `presentation_library_core` owns a new framework-free
  `src/presentation/presentation-library.ts` module and its focused tests. It defines a
  versioned JSON-safe custom Style/Palette library with create/duplicate/rename/
  delete/normalize operations and delegates actual spec safety to injected
  validators. It does not modify existing persistence, frontend, or host files.

## Goal

Build a desktop-only Obsidian `ItemView` that displays the active Markdown note
as an interactive mind map. A built-in Pencil sketch style follows the supplied
reference, while the UI remains intentionally functional and simple. The
model, parser, layout, visual effects, controller, edit planner,
and navigation contracts are kept independent so the renderer or the complete
frontend can be replaced later.

## Style and color-scheme separation (current milestone)

Status: implemented, automatically verified, and deployed to the desktop smoke
Vault for UI acceptance.

This milestone replaces the user-facing monolithic `theme` choice with two
orthogonal, renderer-neutral selections:

- A **mind-map style** owns geometry and treatment: topic shapes, typography,
  sizing, padding, border widths, corner radii, edge routing/width/style, and
  deterministic render-effect references such as the pencil stroke and paper
  texture. It also owns whether branch colors are applied to node fill,
  stroke, text, and edges.
- A **color scheme** owns color semantics only: canvas/surface/text/border/edge
  tokens, role-specific root/main-topic/subtopic colors, branch palettes, and
  light-mode color overrides.

`composeMindMapTheme(style, palette)` is the only assembly boundary. It creates
the immutable effective `MindMapThemeSpec` consumed by the existing renderer,
including stable `styleId` and `paletteId` provenance. The parser, controller,
layout engines, renderer interaction code, source mutation planners, and
Markdown model remain unaware of sidebar DOM and of the two registries.

The built-in `colorful`, `pencil-sketch`, and `cloud` definitions are split into
three style specs and five palette specs. Their stable legacy palette IDs remain
for backward-compatible persistence, while their user-facing names use an
independent color vocabulary: Graphite, Aurora, Spectrum, Morandi Mint, and
Retro Autumn. The final two palettes reproduce the marked literal colors from
the supplied local HTML in light mode and add contrast-safe dark companions;
they do not introduce a Style, layout, glow, or connector-opacity override.
The three legacy matching pairs reproduce the previous complete themes; all
cross-pairs are valid by construction and are validated against the active
render-effect registry at composition time.

Frontend capabilities advertise `styles` and `palettes` independently. The
basic frontend renders accessible preview-card grids in the Appearance sidebar:
style previews depict shape/edge/effect characteristics with neutral colors,
while palette previews depict the actual semantic and branch colors. The
previews are frontend-owned, use safe color tokens from capability snapshots,
and emit semantic `change-style` / `change-palette` events. They do not encode
layout, persistence, or renderer behavior in DOM structure.

Persistence first moved from `themeId` to `styleId` plus `paletteId` in both
default settings and per-document annotations. Legacy `themeId` values migrate
to the matching pair; the removed `obsidian-native` preset maps to the
maintained Cloud pair. That split introduced annotation-store version 3.
Document-wide font and connector-width IDs advanced the store to version 4;
connector-profile IDs advance it to version 5. Older records migrate with no
formatting override, which is equivalent to `style-default`.
Invalid or removed IDs fall back independently, so losing one extension does
not discard another selection.

No runtime dependency is introduced. The split is a small set of immutable
contracts, registries, and a deterministic composition function; adding a UI
framework or general theming library would increase coupling without improving
the renderer-neutral extension seam.

Palette switching is explicitly repaint-only. It preserves the selected
style's geometry, typography, effects, branch-color application channels,
canvas texture seed, measured topic sizes, and viewport. Automated combination
tests lock this invariant for every built-in style/palette cross-pair.

Node text contrast is resolved after Style and Palette composition but before
the DOM adapter writes CSS variables. A pure resolver keeps role defaults,
branch intent, and sparse node overrides separate. Shapes that paint no fill
(`none` and `underline`) and fills equal to the active canvas use the current
Palette's normal text token in both light and dark modes. An explicit node text
override remains authoritative. A full built-in Style × Palette × appearance
matrix test prevents white-on-light or black-on-dark defaults from returning.

## Global formatting controls

Global font, connector width, and connector profile form a fourth,
document-scoped formatting axis, independent from layout, Style, and Palette.
`src/presentation/formatting.ts` owns injectable registries with a real `style-default`
choice plus built-in safe font-token, line-width, and uniform/taper-to-child
profile presets. The sidebar consumes only advertised capabilities and emits
semantic document events; it does not hard-code CSS families or numeric
rendering behavior.

The renderer resolves formatting in this order: sparse per-node/per-edge
override, document formatting, then current Style defaults. Font changes
invalidate node measurement and may refit the view; connector-width and
connector-profile changes repaint edges and recalculate SVG bleed without
changing topic geometry. Annotations at version 5 persist the font, width, and
profile IDs as independently merged fields, so simultaneous tabs cannot
overwrite one another. Palette, width, and profile changes preserve the
viewport, while geometry-affecting font changes clear the saved viewport before
fitting.

No runtime dependency is introduced.

## P0 editor-completeness extension (implemented)

This completed implementation milestone extends the create/edit/move MVP into
a recoverable topic editor without coupling those operations to the current
DOM/SVG frontend.

The implemented sequence was:

1. Added pure, source-revision-checked planners for delete, promote-on-delete,
   branch clipboard serialization/paste, parent creation, and indexed
   cross-parent placement.
2. Placed every explicit source mutation behind a host command transaction that
   records exact before/after revisions. A bounded per-document history allows
   explicit undo/redo only when the authoritative buffer still matches the
   expected revision; stale history never overwrites newer Markdown.
3. Added renderer-neutral navigation, selection, clipboard, deletion,
   parent-creation, reorder, undo, and redo intents. The DOM renderer adapts
   keyboard, pointer, marquee, and context-menu gestures to those intents.
4. Reconciled transient node state with source-independent structural locators
   built from kind, semantic ancestry, sibling occurrence, and nearby source
   facts. Locators are plugin state only: ObMind will not insert hidden IDs or
   metadata into Markdown.
5. Preserved supported inline Markdown during text edits by applying visible
   text changes through a source mapping. Unsupported or ambiguous edits are
   rejected or safely downgraded rather than silently destroying unrelated
   markup.

Implemented core boundaries:

- `inline-markdown`: visible-text projection plus conservative balanced-wrapper
  preservation and escaped fallback.
- `node-delete`: lossless whole-branch and promote-children deletion planner.
- `node-clipboard`: renderer/Obsidian-independent branch payload and checked
  paste planner.
- `node-parent`: atomic heading/list parent insertion and subtree wrapping.
- `node-navigation`: visible-tree indexes and orientation-aware keyboard
  destinations.
- `node-selection`: immutable replace/add/toggle/range selection reducer.
- `node-identity`: structural locators and conservative document
  reconciliation without source metadata.
- `mutation-history`: bounded, stale-safe undo/redo transaction state.
- `topic-command`: renderer-neutral topic command vocabulary and shortcut
  resolver.
- `exclusive-task-queue`: one-at-a-time host source mutation execution.

The host remains the only layer that reads or writes Obsidian buffers. Copying
and selecting never mutate a note. Delete, cut, paste, create-parent, reorder,
undo, redo, and an explicit task-checkbox toggle are authorized source
mutations. Task toggling is a dedicated `toggle-task` event, not a generic
topic command. Each operation produces at most one contiguous editor replacement
where practical, or one pure `Vault.process` calculation when no editor is
open.

### P0 extensibility decisions

- History stores immutable source transactions, not callbacks or DOM commands.
  Another frontend can issue the same semantic intent, and a future persistence
  adapter can store history elsewhere without changing planners.
- The internal clipboard carries a versioned semantic branch payload plus a
  plain Markdown representation. System clipboard integration is an adapter;
  planners never access browser clipboard APIs.
- Selection and keyboard navigation use node IDs only within one rendered
  frame. Cross-refresh restoration uses locators and never assumes a line-based
  ID remains stable.
- Indexed placement is expressed as a destination parent plus an optional
  before-child anchor. Layout engines remain responsible only for geometry and
  hit testing; Markdown compatibility stays in the planner.
- Multi-selection is represented independently from multi-node source
  commands. Batch commands first reduce selected nodes to non-overlapping
  top-level branches and execute one checked transaction, avoiding accidental
  double deletion of descendants.
- No runtime dependency is added. The supported Markdown structure is small
  enough for local planners, a local visible-text/source mapper, and bounded
  history state; adding a general AST editor or diff library would increase
  bundle size without removing the need for ObMind-specific structural
  validation.

## Architecture

Data flows in one direction:

```text
Obsidian events
  -> MindMapController
  -> immutable MindMapViewState
  -> MindMapView
  -> MindMapViewSession + MindMapPresentation
  -> replaceable MindMapFrontend
  -> layout registry + effect registry + renderer adapter
```

Renderer callbacks send selection, editing, topic creation, structural moving,
topic commands, source navigation, collapse, fit, and direction actions back
to the view/controller. The renderer never reads the Vault or imports Obsidian.

Modules:

- `model`: tree, source location, direction, and view-state contracts.
- `parser`: line-oriented Markdown subset parser with exact source lines.
- `layout`: visible-tree geometry, typed paths, bounds, and an optional pure
  engine-owned drop-placement policy independent of DOM and Obsidian.
- `layouts/bilateral-layout/layout-options`: injectable engine registry,
  root-centered bilateral tree strategy, and registered engine-owned option
  schemas.
- `presentation`: renderer-neutral layout, style, palette, document formatting,
  effective-theme, sparse element style, effect references, branch colors,
  decoration, capability, and interaction contracts.
- `styles/palettes/formatting/themes/render-effects`: independent registries,
  pure effective-theme composition, safe document font/width/profile formatting,
  and a validated effect-capability registry.
- `presentation-gesture/presentation-snapshot/presentation-library/
  presentation-library-editor`: immutable preview transactions, safe snapshot
  cloning, versioned user appearances, and pure library authoring drafts.
- `connector-geometry/node-presentation-edit`: deterministic variable-width
  outlines and sparse multi-topic formatting patch construction.
- `hand-drawn/dom-svg-effects`: deterministic pencil geometry and the DOM/SVG
  adapter for registered visual effects.
- `built-in-composition`: the sole adapter-specific assembly point that
  validates themes against actually implemented effects and derives style,
  palette, formatting, and renderer capabilities from registered sources.
- `config`: persistent default layout, direction, style, and palette IDs with
  migration from older settings.
- `serial-mutation-queue`: ordered whole-state default-setting updates, so
  rapid layout/style/palette changes cannot overwrite one another.
- `node-edit-workflow`: framework-free edit-then-create continuation that
  always awaits a fresh document revision before structural insertion.
- `inline-markdown`: framework-free reader-visible projection and conservative
  balanced inline-source edits, including `<br>`-encoded visible line breaks.
- `node-drag`: framework-free drag threshold, scene-coordinate, target-zone,
  cycle, compatibility, auto-pan, and semantic drop resolution.
- `node-move`: framework-free checked Markdown subtree movement with source
  range preservation, heading releveling, list reindentation, exact compatible
  cross-parent before/after placement, and final parse verification.
- `node-mutation`: shared framework-free source-line/range/tree helpers.
- `node-delete`: atomic multi-selection subtree deletion and safe
  delete-and-promote planning.
- `node-clipboard`: versioned multi-branch payload plus checked child/sibling
  paste; no browser clipboard access.
- `node-parent`: atomic parent insertion around one heading/list subtree.
- `node-navigation/node-selection`: visible-tree keyboard destinations and
  immutable modifier/range/marquee selection.
- `node-identity`: conservative metadata-free reconciliation of transient IDs.
- `node-task`: stale-safe task-marker toggle planning for parsed task list
  items.
- `topic-command/mutation-history/exclusive-task-queue`: semantic editor
  commands, bounded stale-safe history, and serialized host mutations.
- `annotations/plugin-data/presentation-patch/presentation-history`: versioned
  plugin-data records, capability-validated visual changes, and document-bound
  presentation history that never writes Markdown.
- `node-search`: current-document topic indexing and reveal paths.
- `source-content`: live-editor-over-stored-buffer precedence for delayed Vault
  refreshes.
- `session`: per-tab interaction state plus separate document and higher-
  priority ephemeral view presentation layers.
- `frontend`: whole-UI factory/frame/event/command boundary.
- `basic-frontend`: deliberately simple phase-one toolbar/status/canvas.
- `renderer`: replaceable DOM/SVG adapter with pan, zoom, and disclosure UI.
- `controller`: current source, 250 ms debounce, race protection, parsing, and
  subscriber snapshots.
- `view/main/settings`: Obsidian command, `ItemView`, navigation, settings, and
  lifecycle integration.

## Key decisions

- Implement the tree layout locally instead of adding D3, dagre, or ELK. The
  input is a tree, both directions share the same axis-transposed algorithm,
  and a small local implementation makes collapsed-node filtering and a future
  renderer replacement straightforward. This avoids all runtime dependencies.
- Implement the pencil effect locally instead of adding Rough.js. The required
  result is a small set of deterministic double strokes, hatching, paper grain,
  and endpoint dots. Stable seeded geometry is smaller, avoids render-time
  flicker, has no runtime dependency, and remains usable by another adapter.
- Keep visual style, color scheme, and layout geometry independent.
  `pencil-sketch` is a style, while `bilateral-tree` is a separate layout
  engine and every registered palette is a separate color choice.
- Use renderer-neutral effect profile IDs and validate every style's required
  capabilities at registration. The DOM/SVG renderer receives an injected
  effect resolver and never branches on a theme ID, so future Canvas/WebGL
  adapters can implement the same profiles or register their own.
- Use typed line/quadratic/cubic layout paths rather than renderer-owned point
  arrays. Engines own their ports and route geometry, which supports left and
  right branches today and provides a clean seam for fishbone, organization,
  timeline, or radial engines later.
- Assign branch colors by stable root-subtree identity, not DOM order. Folding
  and relayout therefore do not recolor a topic.
- Use esbuild for the single Obsidian bundle, Vitest for lightweight
  TypeScript-first core tests, and the official Obsidian ESLint rules for API
  and lifecycle checks. These are development-only dependencies; the produced
  plugin has no runtime package dependency.
- Use `happy-dom` only as a Vitest development environment for replaceable
  frontend adapter tests. This verifies real toolbar DOM events and cleanup
  without coupling production code to a UI framework or adding a runtime
  dependency.
- Implement the requested Markdown subset with a line scanner instead of a full
  CommonMark AST. The scanner is smaller, retains exact 0-based lines, and makes
  the deliberately limited phase-one rules explicit.
- Use DOM nodes for natural text measurement and SVG only for edges. Geometry is
  still produced by the pure layout module, so a later SVG-only or Canvas UI can
  reuse the same model and controller.
- All open mind-map tabs follow the same currently active file. Activating a
  non-file view retains the most recent file; activating a non-Markdown file
  produces an unsupported state.
- Editor changes use the live editor buffer. External Vault changes use
  `cachedRead`. A generation token prevents stale asynchronous reads from
  replacing a newer file.
- Obsidian can announce `file-open` before CodeMirror has installed the new
  document in a reused Markdown leaf. Initial live-buffer reads therefore wait
  50 ms for that view transition, and those pending timers are tracked and
  released during unload. This prevents combining a new filename with the
  previous note's buffer while still preserving unsaved editor content.
- Plugin unload explicitly releases renderer/view resources and detaches every
  live `obmind-mind-map` leaf, as required by the phase-one lifecycle contract.
- A frontend-extensibility audit was completed before handoff. The complete
  toolbar/status/canvas subtree is now factory-created, so a visual rewrite
  does not edit the ItemView, parser, controller, or navigation integration.
- Presentation is separate from parsed source facts. It provides revisioned
  layout/effective-theme snapshots, document-wide font/connector-width/profile
  selections, semantic role defaults, branch palettes, safe rich text, sparse
  node/edge overrides, and a typed decoration union reserved for adapters that
  explicitly declare decoration rendering.
- Layout engines are registered by ID and receive an instance layout ID,
  document ID, revision, four-way orientation, measured sizes, collapse state,
  separate level/sibling/subtree spacing, and engine options. Stable edge IDs
  and optional typed paths let another engine reuse the default renderer. An
  optional renderer-neutral drop-placement resolver lets radial, fishbone, or
  other non-axis geometries own their before/after/child hit policy; omission
  uses the built-in axis-aligned 25% / 50% / 25% resolver.
- The default renderer consumes theme tokens, document formatting, and sparse
  styles, supports four edge routing styles, and preserves custom engine routes.
  The built-in bilateral engine is the explicit exception: its engine-selected
  ports are retained while a non-Bezier presentation route reconnects those
  ports.
  Measurements invalidate on presentation/theme/font revisions or observed
  resize; connector width/profile repaint edges and update SVG bleed without
  invalidating node measurement. Selection, focus, hover, and viewport-only
  frames update interaction classes without rebuilding layout or SVG edges.
- Theme literal colors are validated as color syntax and reject `url(...)` or
  declaration injection, preserving the no-network product contract.
- The capability catalog is intentionally truthful: it lists only registered
  engines and option schemas, styles, palettes, global fonts, connector
  widths/profiles, shapes, routes, assets, and rendered decoration kinds.
- No runtime layout dependency was introduced. A small tree engine plus a
  resolver is still lower complexity than D3, dagre, or ELK for the MVP, while
  the engine contract allows adding one later without changing the frontend.
- The default presentation is Colorful Style + Spectrum Palette with
  `bilateral-tree`; Pencil sketch, Cloud, and Colorful remain the Style
  vocabulary, while Graphite, Aurora, and Spectrum form the independent
  baseline Palette vocabulary. Morandi Mint and Retro Autumn are additional
  color-only presets. The original one-sided `tree` remains available.
- The phase-one sidebar emits document-scoped layout, Style, Palette, global
  font, connector width/profile, orientation, engine options, spacing, and
  selected-topic formatting changes. Those values are persisted for the current
  Markdown path;
  the settings tab persists layout/style/palette defaults used when that
  document has no override. Global font, connector width, and connector profile
  remain document-scoped and inherit the active Style when unset. The frontend
  contract also permits an ephemeral, tab-local `view` scope; the basic toolbar
  uses it only for in-progress presentation previews. The view layer survives
  document hydration and visual refresh; a source switch clears only its
  source-keyed node/edge/decoration data while retaining layout, formatting,
  and composed appearance.
  Persisted data stores stable IDs only, never renderer objects or CSS.
- Default presentation writes run through a serial mutation queue and publish
  only after `saveData` succeeds. Failed or overlapping changes therefore do
  not corrupt another setting or prematurely clear a tab override.
- Use an explicit node interaction state machine. A first plain click selects
  without leaving the map; another click on that selected node edits it, and a
  double-click, `Space`, or `F2` edits directly. Cmd/Ctrl-click toggles a
  selection, Shift-click selects a visible range, and Shift-drag on empty
  canvas replaces the selection from a scene-space marquee. `Tab` creates a
  child, `Enter` creates a following sibling, and `Enter` on the document root
  creates a main topic. Alt-click or the context-menu action deliberately
  opens the source line. In edit mode, `Enter` commits, Shift-Enter inserts a
  visible `<br>` line break, `Escape` cancels, and `Tab` performs a serialized
  edit-then-create-child continuation using the refreshed source revision.
- Keep pointer, keyboard, context-menu, and future command-palette adapters on
  one renderer-neutral topic-command vocabulary. Delete, promote, copy, cut,
  paste, create-parent, outdent, undo, and redo therefore do not create
  adapter-specific write paths.
- Keep inline Markdown mapping outside the renderer. The editor works with
  visible text; the pure mapper conservatively retains supported balanced
  wrappers and falls back to escaped inline Markdown for an ambiguous topic
  boundary. An unchanged submission remains byte-for-byte identical.
- XMind's official [Topic](https://xmind.com/user-guide/topic-editing-new) and
  [Text](https://xmind.com/user-guide/text-new) guides and EdrawMind's official
  [Add Topics](https://edrawmind.wondershare.com/guide/add-topics.html) and
  [Select and Edit Topic](https://edrawmind.wondershare.com/guide/select-edit-file.html)
  guides explicitly document double-click editing, `Tab` for child creation,
  and `Enter` for following-sibling creation. They do not explicitly state
  that a separate second click on an already selected node edits it; that
  behavior is an intentional ObMind product decision.
- Editing, task-checkbox toggling, topic creation, completed valid drops, cut,
  delete, paste, create-parent, outdent, undo, and redo are explicit user
  source mutations. Each commit goes through source validation and the
  serialized Obsidian mutation host. Copy, selection, navigation, drag preview,
  refresh, layout, theme, and lifecycle work remain non-mutating.
- Treat a node drag as one explicit structural source mutation. A renderer
  emits only stable `before`, `after`, or `child` anchors after pointer-up; a
  framework-free drop resolver owns target lookup and cycle checks, while the
  active layout engine may supply a pure placement hit policy. A separate
  Markdown planner owns source ranges, heading releveling, list reindentation,
  stale-revision checks, and final parse verification.
- Follow the documented XMind/EdrawMind topic-moving model: the document root
  cannot be dragged, moving a topic carries its complete branch, and the
  destination is previewed before release. XMind's official
  [Topic guide](https://xmind.com/user-guide/topic-editing-new) documents
  drag-based Main Topic/Subtopic hierarchy changes; EdrawMind's official
  [Move Topics guide](https://edrawmind.wondershare.com/guide/move-topics.html)
  documents moving an entire branch among levels with a visual destination
  mark. The exact center/edge hit zones remain an ObMind product rule. The
  first DOM/SVG adapter uses an insertion indicator for sibling order and a
  highlighted topic for a child drop. A five-pixel movement threshold keeps
  click-to-select/edit behavior intact. Leading/trailing targets provide exact
  compatible placement under the target's parent, including a parent change;
  center drops append under a compatible target. An animation-frame edge
  auto-pan loop adjusts only the viewport while a drag is active.
- Structural drag intentionally moves one branch even when several topics are
  selected. Batch delete/cut/copy work on reduced non-overlapping selections;
  multi-branch dragging requires a separate destination and transaction design.
- Apply a move to an open Markdown editor as one contiguous replacement so it
  has no observable delete/insert intermediate state and participates in one
  editor undo step. The off-editor path calculates only inside `Vault.process`
  and publishes controller/session state after the awaited write succeeds.
- Keep Markdown moves conservative and lossless. Heading sections include
  their unrendered body content and relevel their entire heading subtree.
  List moves retain their nested list subtree and adjust indentation. Drops
  whose requested relationship cannot be represented by the supported
  Markdown subset are rejected instead of silently converting node kinds.

## Expected files

Root project files include `AGENTS.md`, `manifest.json`, `versions.json`,
`package.json`, TypeScript/esbuild/ESLint/Vitest configs, `styles.css`,
`README.md`, and the production `main.js`.

Source files include the model, parser, layout engines and registry,
presentation, theme and effect registries, deterministic hand-drawn helpers,
session, frontend, basic frontend, DOM/SVG adapter, renderer, controller,
configuration, view, settings, and plugin entry point. P0 editor modules include
inline Markdown mapping; shared mutation helpers; delete, clipboard, parent,
insert, and move planners; navigation and selection reducers; structural
locators; semantic topic commands; bounded history; and an exclusive source
mutation queue. Tests cover parser, editing and every mutation planner,
navigation/selection/identity/history/shortcut behavior, both layouts, typed
geometry, drag placement and auto-pan, themes/effects, settings migration,
presentation, session, frontend contracts, and framework-free controller
utilities.

## Acceptance

The plugin must open a new mind-map tab from the command palette, follow active
Markdown files, update after debounced edits, pan, zoom, collapse, select and
edit nodes, preserve supported inline Markdown, and create child and sibling
topics from the keyboard. It must provide modifier/range/marquee selection,
orientation-aware keyboard navigation, exact compatible cross-parent branch
placement with edge auto-pan, delete/promote, copy/cut/internal-paste,
create-parent, outdent, a context menu, and bounded stale-safe undo/redo.
Source-line navigation must remain a deliberate Alt-click or menu action.
Transient selection/collapse/focus state must reconcile only on an unambiguous
metadata-free locator match. The plugin must also switch layout engine,
direction, and theme; render the pencil-sketch theme in both Obsidian
appearances; and release all resources. Automated tests, type checking, lint,
production build, artifact checks, and a final diff review must all pass.

Known phase-one exclusions are Setext headings, full CommonMark semantics,
complex list continuations, lazy block quotes, HTML block parsing, and mobile
adaptation. Rich layout/appearance contracts do not mean the phase-one UI already
contains a visual theme editor, preset/template editor, fishbone/radial/org
chart/timeline algorithms, asset catalog, boundaries, summaries,
relationships, free-positioned/floating topics, multi-branch dragging,
arbitrary external-clipboard Markdown paste, cross-session clipboard/history/
interaction state, built-in per-node annotation authoring, root-rename undo, or an
XMind/MindMaster file-format implementation.

## Completion and release verification

Implementation status: complete. The checks and desktop smoke coverage below
remain release verification, not unimplemented P0 scope.

- The original phase-one view, parser, layouts, appearance registries, replaceable frontend,
  checked edit/create workflow, and structural drag boundaries remain the
  foundation for the P0 editor-completeness extension.
- P0 implementation now includes pure delete/promote, versioned clipboard and
  paste, parent insertion, indexed cross-parent movement, visible navigation,
  immutable selection, structural locators, bounded mutation history, inline
  Markdown mapping, semantic topic commands, and serialized host mutations.
- The built-in frontend wires those contracts to modifier/range/marquee
  selection, keyboard navigation and reorder, inline editing, context-menu
  actions, exact drag placement, and drag-edge auto-pan. A replacement
  frontend can emit the same semantic events without importing a planner or
  Obsidian API.
- Unit and integration coverage must continue to exercise each pure planner,
  stale-revision rejection, overlapping multi-selection reduction, history
  two-phase semantics, ambiguous locator rejection, shortcut resolution,
  cross-parent placement, and adapter-to-host event routing.
- Final integrated verification is the required-check list in `AGENTS.md`:
  `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run check`, and `git diff --check`. This plan intentionally does not
  predeclare those final command results; they are recorded in the delivery
  report after running against the integrated worktree.
- Desktop smoke verification for this milestone must cover selection modes,
  inline edit persistence, repeated Tab creation, all context/keyboard
  commands, same-parent and cross-parent placement, drag auto-pan, stale
  undo/redo refusal, light/dark appearances, hot reload, and resource cleanup.
  It must not change the user's plugin enablement checkbox or restore/switch
  Vault state unless explicitly requested.

## Node interaction and explicit source mutations

- A first click selects a rendered node and keeps focus in the mind map. A
  separate click on the selected node edits it; double-click, `Space`, and `F2`
  are direct edit gestures. Cmd/Ctrl-click toggles a topic, Shift-click selects
  an inclusive visible range, and Shift-drag on empty canvas replaces the
  selection with nodes intersecting the marquee.
- In selection mode, `Tab` creates a child and `Enter` creates a following
  sibling. Because the document root has no sibling, `Enter` on it creates a
  main topic. Newly created topics enter editing immediately. While that input
  is active, another `Tab` commits its draft, waits for the checked edit, then
  creates a child from a fresh parsed snapshot; edit and create are never sent
  concurrently with the old revision.
- In edit mode, `Enter` commits, Shift-Enter inserts a visible line break,
  `Escape` cancels, and `Tab` commits then creates/edits a child. Visible line
  breaks are encoded as `<br>` on the same physical heading/list line.
- Orientation-aware arrows move focus through the visible tree. Home/End
  select the first/last sibling, and Alt/Option-Up/Down requests exact movement
  before/after the adjacent sibling.
- Delete/Backspace deletes the selected top-level branch set. Cmd/Ctrl-C/X/V
  copies, cuts, or pastes the versioned internal branch payload as children;
  paste-as-sibling, delete-topic-only with safe child promotion, editing,
  creation, parent insertion, outdent, and source navigation are also
  available from the context menu. Cmd/Ctrl-Enter creates a parent, Shift-Tab
  outdents the primary topic, and the standard Cmd/Ctrl-Z,
  Cmd/Ctrl-Shift-Z, or Ctrl-Y variants request ObMind history.
- Alt-click or the context-menu source action opens Markdown at the selected
  node's source line. Ordinary selection gestures never navigate away from the
  mind-map view.
- XMind and EdrawMind official documentation confirms double-click editing,
  `Tab` child creation, and `Enter` following-sibling creation. It does not
  explicitly describe editing via a separate second click on an already
  selected node; that is an ObMind product decision.
- Heading and list edits preserve indentation, heading/list markers, task
  checkboxes, and optional closing heading markers. A visible-text/source
  mapper conservatively preserves supported balanced emphasis, strike,
  code-span, Markdown-link, and wikilink wrappers. If a changed selection
  crosses an ambiguous wrapper boundary, that topic falls back to escaped
  plain inline Markdown rather than producing malformed source. Root filename
  editing remains single-line.
- Before writing, a framework-free edit planner verifies that the current
  source line still has the same node kind, structural metadata, and visible
  text as the rendered snapshot. A stale mapping is rejected instead of
  overwriting newer content.
- The renderer captures a minimal immutable `MindMapNodeEditSnapshot` when the
  editor opens and carries it through semantic renderer/frontend events.
  Equivalent object-only reparses can keep the input visible, but a changed
  whole-buffer revision never advances the snapshot: commit must pass the
  planner's original revision check instead of silently rebinding a line-based
  ID to a newly inserted duplicate.
- The snapshot also carries a compact revision of the complete source buffer.
  Full-content edits reject any revision mismatch before using the line anchor,
  preventing adjacent identical lines from becoming an ambiguous target.
- The controller does not republish an identical deterministic source
  revision. This avoids redundant layout work and prevents the editor-change /
  Vault-save echo after an explicit commit from interrupting the new topic's
  inline editor.
- A delayed `vault.modify` refresh also rechecks for an open Markdown editor
  and treats its live buffer as authoritative. An older stored snapshot can no
  longer temporarily remove the new line-based node ID and cancel editing.
- An open Markdown editor is updated with `Editor.replaceRange`, preserving its
  live unsaved buffer. When no editor is open, `Vault.process` performs an
  atomic checked edit.
- `Vault.process` callbacks have no view/controller side effects. Structural
  session state resets only after a successful write, and an awaited
  off-editor mutation re-reads the current editor or Vault buffer before
  publishing. A concurrent newer buffer is published instead and the stale
  operation reports a retryable conflict.
- Editing the root node renames the current Markdown file through Obsidian's
  public `FileManager.renameFile` API while preserving its folder and `.md`
  extension. Invalid or colliding names are rejected. Root renames are not
  stored in the content undo/redo history.
- Delete/cut/paste/create-parent/outdent planners share source-range and
  structural-validation helpers with insertion and movement. Batch commands
  reduce a selection to non-overlapping top-level branches and apply one
  checked source transaction. Mixed heading/list clipboard groups and
  unrepresentable promotion or placement are rejected.
- Copy/cut stores a versioned semantic payload in plugin memory and attempts a
  plain-Markdown operating-system clipboard write. Paste intentionally reads
  only that internal payload; arbitrary external Markdown import and
  cross-session clipboard persistence are not P0 features.
- Successful content mutations record exact before/after source transactions
  in a bounded per-document in-memory history. The LRU store retains at most 20
  document histories, each with at most 100 transactions. Undo/redo uses a two-phase
  peek/apply/commit flow and refuses to replace a path, content buffer, or
  revision that no longer exactly matches. History is not persisted across a
  plugin reload.
- Source-line IDs remain snapshot-local. The session captures metadata-free
  locators from semantic ancestry, sibling occurrence, source proximity, and
  structural fingerprints, then restores selection/collapse/focus/hover only
  when one candidate wins. Ambiguous duplicate topics lose transient state;
  no hidden ID is written to Markdown.
- List structural planners conservatively reject non-blank continuation/body
  lines not represented by the parser. This keeps the explicitly unsupported
  CommonMark continuation subset from being orphaned or silently re-parented.
- A structural drag moves one complete branch. Leading/trailing target zones
  support exact compatible before/after placement, including under another
  parent; center drops append under a compatible node. Edge auto-pan affects
  only the viewport until pointer-up. Multi-branch drag and free-positioned
  topics are deliberately outside P0.
- Source writes are limited to explicit edit commits, task-checkbox toggles,
  topic-creation gestures, completed valid node drops, and explicit
  cut/delete/paste/create-parent/outdent/undo/redo commands. Drag previews,
  copy, presentation, selection, layout, navigation, refresh, and background
  lifecycle paths remain non-mutating.

## P0 visual-feedback completion: adaptive topics, disclosure, and drop preview

Status: implemented.

This completed follow-up keeps the P0 mutation model unchanged and improves the
three places where the basic DOM/SVG adapter did not yet communicate that model
clearly enough. The implementation remains replaceable:

- `node-content-layout` owns renderer-neutral content sizing policy. It
  resolves a role-aware maximum inline size, natural block growth, and editor
  overflow behavior without measuring DOM. The DOM adapter applies the policy
  through scoped CSS variables; a future SVG/Canvas renderer can use the same
  policy as input to its own text measurement.
- Display topics use a bounded inline size and unrestricted natural block
  growth. Long words and CJK strings may break at any character when needed,
  so text stays inside the topic shape. The inline editor uses the same width
  contract and grows to its `scrollHeight`; it does not introduce a nested
  vertical scrollbar for ordinary topic editing.
- `collapse-indicator` owns descendant counting, accessible labels, and the
  four-orientation outgoing-side mapping. The DOM adapter renders a small
  circular disclosure control on the outgoing branch connection. Expanded
  controls appear on node hover/focus; collapsed controls stay visible and
  show the total number of hidden descendants.
- Bilateral layout remains an adapter/layout concern: a node's effective
  outgoing side is derived from visible child geometry, or from its position
  relative to the root when its children are collapsed. Theme code does not
  choose the disclosure side.
- `node-drag` exposes a renderer-neutral drop-preview descriptor containing
  the future topic bounds, placement, orientation, and optional connector
  segment. The current adapter renders a translucent destination topic plus
  the existing exact insertion line/child highlight. This is preview-only and
  never mutates source before pointer-up.
- Before/after previews occupy the future sibling slot on the secondary axis.
  Child previews occupy the next level on the effective branch side and show
  a connector back to the target. Invalid targets remove the destination
  preview and retain only the invalid pointer ghost.
- A drop onto the root of `bilateral-tree` first simulates the immutable
  detach/append candidate and runs the same visible-subtree balancing rule as
  the production layout. Its preview therefore uses the side that the branch
  will actually occupy after release, including unbalanced roots and all four
  layout orientations.
- No layout or runtime dependency is added. These calculations are small,
  deterministic geometry operations and belong beside the existing tree
  layout and drag resolver; adding a diagram dependency would not improve the
  contract and would make a future renderer replacement harder.

The automated acceptance coverage includes long-text policy,
hidden-descendant counts, four-orientation disclosure placement, and all
before/after/child preview geometries. Manual desktop release verification
still checks that long display and edit text stays inside a growing topic,
expanded disclosure appears on hover, collapsed disclosure shows its hidden
count, and a valid structural drag displays its release destination before
pointer-up.

## P0 durable presentation and navigation completion

Status: implemented.

This completed P0 milestone closes the implementation gap between the
source-backed topic editor and the richer, replaceable frontend planned for
later iterations. It does not attempt to implement an XMind-style inspector,
asset catalog,
boundaries, summaries, relationships, advanced layout families, presentation
mode, or third-party file formats. Instead, it provides the durable contracts
those features require and exposes the highest-value Markdown-native controls
without weakening the source-write policy.

### Implemented persistent annotations and stable references

- `src/application/persistence/annotations.ts` exports the framework-free, versioned
  `AnnotationStore` contract. The persisted adapter uses
  `Plugin.loadData`/`saveData`; it never writes hidden identifiers or
  presentation data into a Markdown note.
- A `DocumentAnnotationRecord` is keyed by normalized Vault path and stores
  validated JSON-safe layout/style/palette/font/connector-width/connector-
  profile selections,
  sparse node/edge, collapse, and viewport data, plus schema-only decoration
  records for a future adapter. File rename
  events migrate the record through one serialized save.
- Node references contain a conservative metadata-free structural locator,
  not a source-line ID. Hydration resolves every reference against the current
  `MindMapDocument`; ambiguous or missing matches become explicit orphan
  records and are never attached to another duplicate topic.
- Persistence is revisioned and normalized on load. Unknown versions,
  malformed colors, unsupported asset/effect IDs, CSS-like strings, URLs, and
  non-finite geometry values are rejected or reduced to safe defaults.
- Annotation writes are presentation operations. They may update plugin data
  only and must never enter the Markdown mutation queue or content history.

### Implemented presentation patches and history

- `MindMapPresentationPatch` immutably validates layout, theme, document
  formatting, node, edge, and decoration fields against the active frontend
  capability catalog.
  Viewport and collapsed state are persisted separately in
  `DocumentAnnotationRecord`; they are not patch fields.
- Presentation history is bounded, per document, and separate from source
  mutation history. Undo/redo stores exact before/after annotation snapshots;
  it never replaces Markdown content or participates in stale source history.
- The P0 baseline exposed current-note search plus layout engine, style,
  palette, global font, connector width, orientation, and spacing controls.
  The active authoring follow-on adds connector profiles, capability-derived
  layout options, a selected-topic formatting inspector, and custom
  Style/Palette editing. Presentation-history and decoration-authoring UI
  remain separate extension work; all UI still emits patches/events rather
  than importing Obsidian APIs.
- Theme and layout remain independent. A future preset composes them by
  emitting multiple fields in one presentation patch rather than making a
  theme select a layout engine.
- The decoration union and annotation codec are extension contracts only in
  P0. Built-in capabilities publish `renderedDecorations: []`, so the basic
  frontend neither authors nor renders markers, boundaries, summaries, or
  relationships.

### Implemented Markdown-native search and tasks

- The current-document-only search index returns deterministic node IDs in
  document order and never scans the Vault. `reveal-node` expands a result's
  ancestors, selects/focuses it, centers the viewport, and leaves Markdown
  unchanged.
- Parsed task-list state renders as a semantic checkbox. A checkbox activation
  emits a checked `toggle-task` frontend event carrying the original source
  revision and node snapshot.
- `toggle-task` is an explicitly authorized Markdown mutation, separate from
  the generic topic-command union. `MindMapView` rejects an in-flight or stale
  snapshot, then calls the host's `toggleMindMapTask`. That host work is
  serialized, plans the exact marker replacement, applies it through one
  `Editor.replaceRange` or pure `Vault.process` result, reparses the result,
  records one content-history transaction, and focuses the verified task.
  The pure planner accepts only a task-list node, verifies the exact revision,
  structural line, marker, indentation, task marker, and visible text, then
  changes only `[ ]`/`[x]`.

### Implemented layout controls and topic commands

- `LayoutOrientation` is part of the persisted default contract and migrates
  the previous two-direction setting. The toolbar and settings expose
  left-to-right, right-to-left, top-to-bottom, and bottom-to-top without adding
  layout-engine conditionals to the frontend.
- Level, sibling, and subtree spacing use capability-derived numeric controls.
  Framework-free configuration helpers clamp and validate them; presentation
  layout remains the only renderer truth.
- Built-in option schemas add compactness and same-level alignment to both tree
  engines, plus automatic root-branch distribution for the bilateral engine.
  They are normalized by the selected engine rather than interpreted as Style
  or Palette fields.
- The `Outdent topic` context-menu action and renderer-neutral command
  availability descriptions are implemented.

### Remaining release verification

- Before a desktop release, run the smoke matrix for every context/keyboard
  command, current-note search and reveal, task toggling, four orientations,
  spacing, persisted annotation reload/rename/reconciliation, light/dark
  appearances, hot reload, stale write refusal, and resource cleanup. This is
  release validation, not an unimplemented P0 feature. It must not change the
  user's plugin enablement state or unrelated Vault state.

### P0 module boundaries

- `annotations`: JSON-safe `AnnotationStore` schema, normalization, migration,
  orphan policy, immutable document-record updates, and storage-port helpers.
- `presentation-patch`: validation and immutable application of
  layout/style/palette/font/connector-width/connector-profile and
  node/edge/decorations. Viewport and collapse belong to document annotation
  records rather than the patch type.
- `presentation-history`: bounded in-memory undo/redo for annotation snapshots.
- `presentation-gesture`: coalesced view-only preview state and stale-safe
  commit/cancel semantics.
- `node-presentation-edit`: multi-topic sparse node-formatting patch builder.
- `layout-options`: registered engine options and built-in normalization.
- `presentation-library` / `presentation-library-editor`: safe custom
  Style/Palette storage plus pure authoring drafts; `plugin-data` normalizes
  those definitions before rebuilding active settings registries.
- `node-search`: current-document indexing and ancestor paths.
- `node-task`: checked task-marker mutation planning.
- Obsidian persistence remains in `main`; per-tab hydration and reveal remain
  in `view`/`session`; the basic frontend renders controls and emits semantic
  events; the renderer never imports Obsidian.

No runtime dependency is added. The new behavior consists of small immutable
tree indexes, validation, JSON normalization, and source-line replacement
logic already aligned with the existing parser and mutation planners.

### Appearance rendering correction

- Keep the persisted `system | light | dark` preference separate from the
  effective `light | dark` renderer input. `MindMapView` resolves the latter at
  the Obsidian/DOM boundary, and every replaceable frontend receives it as an
  explicit frame field.
- Theme light-color overrides are resolved by one framework-free presentation
  helper. The DOM/SVG adapter consumes the resolved colors for canvas tokens,
  node surfaces and borders, branch palettes, edges, and terminal markers.
- Forced light/dark modes scope the semantic Obsidian color variables used by
  the basic frontend to the ObMind view. This prevents the surrounding
  workspace scheme from leaking into the opposite forced mode while keeping
  `system` mode fully inherited from Obsidian.
- Effective color scheme is part of renderer scene invalidation, while node
  measurement caches remain reusable because color changes do not affect
  geometry. The renderer no longer infers appearance from ancestor CSS
  classes.
- No runtime dependency is added for this correction.

### Filled-topic foreground contrast correction

- Default node text is resolved from the effective fill painted over the
  active canvas rather than from a Palette role alone. Transparent and
  shape-less topics keep the normal Palette text token; explicit per-topic
  text overrides remain authoritative.
- `src/presentation/color-contrast.ts` is a renderer-neutral boundary for safe color
  parsing, alpha composition, WCAG luminance/contrast scoring, and stable
  candidate selection. The DOM/SVG renderer owns only the hidden probe that
  resolves Obsidian CSS variables to RGB and caches them for one render.
- Candidate colors remain Palette-derived: branch/role foreground, normal
  text, text-on-accent, and the canvas color used as the scheme-appropriate
  inverse. No Style or Palette ID conditional is introduced, so custom and
  future palettes receive the same behavior.
- Automated coverage spans every branch color in all 3 built-in Styles × 5
  Palettes × light/dark, plus exact Retro Autumn expectations, alpha fills,
  explicit overrides, and runtime host-token resolution.
- No runtime dependency is added.

### P0 automated acceptance

- Pure tests cover annotation version migration, invalid-data rejection,
  unique and ambiguous locator hydration, rename migration, patch validation,
  presentation history bounds, search order/ancestor expansion, task-marker
  toggling and stale rejection, four-direction configuration migration, and
  spacing clamps.
- Core boundary tests cover frontend contracts, persistence queue ordering and
  failure recovery, per-field document-state rebasing, exact task source
  planning, and lifecycle-owned resource cleanup helpers. Desktop host behavior
  remains subject to the release smoke matrix above.
- The required repository checks remain `npm run test`, `npm run typecheck`,
  `npm run lint`, `npm run build`, `npm run check`, and `git diff --check`.
  Generated `main.js`, `manifest.json`, and `styles.css` must remain directly
  installable, and static inspection must find no network, telemetry, global
  `app`, Node.js filesystem/path, Electron, or implicit note-write path.

## Community Plugin release preparation (2026-08-03)

- The initial Community Plugin submission uses the public
  `Soren-ac/obmind` repository and the existing strict-SemVer version `0.1.0`.
  The release tag must be exactly `0.1.0`, without a `v` prefix.
- The repository adopts the MIT License. `THIRD_PARTY_NOTICES.md` records the
  complete production dependency graph: `fflate`, `pdf-lib`, its
  `@pdf-lib/standard-fonts` and `@pdf-lib/upng` packages, `pako` with its zlib
  components, and `tslib`. The production bundle embeds the same notices so
  installed release artifacts retain them.
- Package and manifest metadata point to the public repository, issue tracker,
  and author profile. No funding URL is added because the project does not
  currently solicit financial support.
- Before tagging, regenerate `main.js`, run the complete required check suite,
  verify that the generated bundle and committed source agree, and confirm
  that `manifest.json`, `package.json`, `package-lock.json`, and
  `versions.json` all describe `0.1.0` with minimum Obsidian `1.7.2`.
- Publish a non-draft GitHub Release with binary assets named exactly
  `main.js`, `manifest.json`, and `styles.css`. The Community directory reads
  the default-branch manifest while installation downloads those assets from
  the matching release tag.
- Initial submission is performed through `community.obsidian.md` after the
  Obsidian account is linked to the owning GitHub account. Submission includes
  an explicit agreement to the developer policies and ongoing-support
  commitment; that external attestation remains a user-authorized boundary.
- No runtime dependency is added for release preparation. Automated GitHub
  release workflows are optional and are deferred until the repository token
  is deliberately granted workflow-management scope; the first release uses a
  checked manual GitHub release to avoid broadening credentials unnecessarily.
