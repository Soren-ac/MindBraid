# Changelog

All notable user-facing changes are documented here. MindBraid follows
strict `x.y.z` release tags so each GitHub Release matches the plugin metadata
consumed by Obsidian.

## [0.1.5] - 2026-10-16

### Added

- Add a Diamond topic shape for decision-style topics. It is available from
  the per-topic Shape control and the Style library previews, and Diamond
  topics are included in SVG, PNG, JPEG, and PDF exports.

### Changed

- Pan the canvas with mouse wheel and trackpad scrolling. Hold Ctrl or Cmd
  while scrolling, or pinch on a trackpad, to zoom around the pointer, and hold
  Shift while using a mouse wheel to pan horizontally.

## [0.1.4] - 2026-08-08

### Added

- Add independent Presentation undo/redo controls in the settings sidebar,
  including the next visual action label and separate availability from
  Markdown history.
- Protect unusually large maps with a tab-local safe depth projection, a clear
  node-count notice, and an explicit **Show all** action.
- Add deterministic Playwright visual regression coverage for light/dark
  themes, Style/Palette composition, long topics, task controls, selection,
  inline editing, collapsed branches, and settings panels.
- Add Node 22 CI, release-version and artifact checks, and automated attested
  GitHub Release preparation.

### Fixed

- Keep topic text crisp before hover as well as during interactions.
- Keep Topic-panel decorations editable after node selection changes.
- Reset only inherited theme formatting, without clearing independent topic
  icons, markers, or labels.
- Refuse presentation undo/redo when the Markdown source changed while the
  operation was queued, and keep visual-history labels correct after a
  language switch.

### Changed

- Make the Obsidian Community Plugins directory the primary installation path.
