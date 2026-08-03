import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
  globalIgnores([
    "node_modules",
    "coverage",
    "main.js",
    "package-lock.json",
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
            "manifest.json"
          ]
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".json"]
      }
    }
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/application/controller.ts"],
    rules: {
      // The controller is deliberately browser-framework-free and runs in
      // Vitest's Node environment, so it uses the platform timer globals.
      "obsidianmd/prefer-window-timers": "off"
    }
  }
);
