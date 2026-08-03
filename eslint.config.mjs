import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
  globalIgnores([
    "node_modules",
    "coverage",
    "main.js",
    "package-lock.json",
    // Immutable upstream API declaration snapshot. First-party code is still
    // checked against it through tsconfig paths, but we do not lint the
    // generated declaration text as though it were MindBraid source.
    "src/tests/vendor-types",
    "versions.json"
  ]),
  {
    languageOptions: {
      globals: {
        ...globals.browser
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.mjs",
            "esbuild.config.mjs",
            "manifest.json",
            "scripts/verify-vendor-types.mjs"
          ]
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".json"]
      }
    }
  },
  ...obsidianmd.configs.recommended
);
