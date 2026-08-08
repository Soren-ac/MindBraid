/**
 * A compact deterministic stand-in for Obsidian's host CSS tokens. It exists
 * only in the browser visual fixture; production styles continue to depend on
 * Obsidian variables at runtime.
 */
export const MIND_BRAID_VISUAL_HOST_CSS = `
:root {
  --background-primary: #ffffff;
  --background-secondary: #f3f4f6;
  --background-modifier-border: rgb(31 41 55 / 14%);
  --background-modifier-border-hover: rgb(31 41 55 / 28%);
  --background-modifier-border-focus: #7c3aed;
  --background-modifier-form-field: #ffffff;
  --background-modifier-form-field-hover: #f8fafc;
  --background-modifier-hover: rgb(31 41 55 / 8%);
  --background-modifier-box-shadow: rgb(31 41 55 / 16%);
  --interactive-accent: #7c3aed;
  --icon-color: #68707c;
  --icon-color-hover: #25272b;
  --text-normal: #25272b;
  --text-muted: #68707c;
  --text-faint: #9299a4;
  --text-on-accent: #ffffff;
  --text-error: #c24141;
  --text-warning: #a16207;
  --color-red: #dc5f5f;
  --color-orange: #e39a4c;
  --color-yellow: #c99725;
  --color-green: #4f9c72;
  --color-cyan: #3e9eab;
  --color-blue: #5b86c9;
  --color-purple: #8c6bc7;
  --color-pink: #bd6d9a;
  --font-interface: Arial, Helvetica, sans-serif;
  --font-text: Arial, Helvetica, sans-serif;
  --font-monospace: "Courier New", monospace;
  --font-ui-smaller: 11px;
  --font-ui-small: 12px;
  --font-ui-medium: 14px;
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --line-height-normal: 1.5;
  --line-height-tight: 1.25;
  --size-2-1: 2px;
  --size-2-2: 4px;
  --size-2-3: 6px;
  --size-4-1: 4px;
  --size-4-2: 8px;
  --size-4-3: 12px;
  --size-4-4: 16px;
  --size-4-5: 24px;
  --size-4-6: 32px;
  --radius-s: 4px;
  --radius-m: 8px;
  --radius-round: 999px;
  --shadow-s: 0 2px 8px rgb(31 41 55 / 14%);
  --icon-s: 16px;
  --cursor: default;
  --cursor-link: pointer;
  --layer-popover: 100;
}

html,
body,
#obmind-visual-root {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
}

html {
  background: #ffffff;
}

body {
  font-family: Arial, Helvetica, sans-serif;
}

#obmind-visual-root {
  position: relative;
}
`;
