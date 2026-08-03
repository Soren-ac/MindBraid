# Static-analysis type contracts

MindBraid keeps these declarations in the repository because the Obsidian
Community Plugin Scorecard analyzes TypeScript without installing a plugin's
dependencies. Without local contracts, unresolved `obsidian`, `fflate`, and
`pdf-lib` imports are reported as hundreds of cascading `error`/`any` findings
even when the installed dependency types and local type-aware ESLint pass.

- `obsidian.d.ts` is an unmodified snapshot from `obsidian@1.13.1`.
- `fflate.d.ts` and `pdf-lib.d.ts` intentionally describe only the runtime APIs
  used by MindBraid. Import/export tests exercise those real bundled packages.

`npm run verify:vendor-types` validates all three installed package versions
against `metadata.json`, compares the Obsidian declaration snapshot byte for
byte with the installed package, and imports `fflate` and `pdf-lib` to confirm
the narrowly declared runtime entry points still exist:

- `fflate.inflateSync`, `fflate.strToU8`, and `fflate.zipSync`
- `PDFDocument.create`

When upgrading any of these dependencies, update the corresponding metadata
version. An Obsidian upgrade additionally requires copying its exact
`obsidian.d.ts` into this directory before the verification can pass.

These files are build-time declarations only. They are not bundled into
`main.js` and do not add a runtime dependency.

The contracts intentionally live under `src/tests/`. The Community Plugin
Scorecard has a built-in test-source exclusion but does not honor arbitrary
repository ESLint ignores. TypeScript can still resolve these declarations
through explicit `paths`, while the scorecard does not lint the third-party
declaration text as if it were first-party plugin code.
