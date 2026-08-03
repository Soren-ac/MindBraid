import type { MindMapThemeColor } from "./presentation";

/** Renderer-neutral sRGB color with channels normalized to 0..255. */
export interface MindMapRgbaColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

/** Resolves a semantic theme color to the pixels a renderer will paint. */
export type MindMapThemeColorResolver = (
  color: MindMapThemeColor,
) => MindMapRgbaColor | null;

export const MIN_MIND_MAP_TEXT_CONTRAST_RATIO = 4.5;

const WHITE: MindMapRgbaColor = {
  red: 255,
  green: 255,
  blue: 255,
  alpha: 1,
};
const CONTRAST_EPSILON = 0.0001;

/**
 * Parses the stable color forms emitted by browsers and accepted by ObMind's
 * persisted presentation editor. Complex CSS colors are intentionally left to
 * the active renderer, which can resolve them through its native color system.
 */
export function parseMindMapCssColor(
  value: string,
): MindMapRgbaColor | null {
  const color = value.trim().toLowerCase();
  if (color === "transparent") {
    return { red: 0, green: 0, blue: 0, alpha: 0 };
  }
  if (color === "black") {
    return { red: 0, green: 0, blue: 0, alpha: 1 };
  }
  if (color === "white") {
    return WHITE;
  }
  if (color.startsWith("#")) {
    return parseHexColor(color);
  }
  if (color.startsWith("rgb(") || color.startsWith("rgba(")) {
    return parseRgbColor(color);
  }
  if (color.startsWith("hsl(") || color.startsWith("hsla(")) {
    return parseHslColor(color);
  }
  return null;
}

/** Alpha-composites `foreground` over `background`. */
export function compositeMindMapColors(
  foreground: MindMapRgbaColor,
  background: MindMapRgbaColor,
): MindMapRgbaColor {
  const foregroundAlpha = clamp(foreground.alpha, 0, 1);
  const backgroundAlpha = clamp(background.alpha, 0, 1);
  const alpha =
    foregroundAlpha + backgroundAlpha * (1 - foregroundAlpha);
  if (alpha <= 0) {
    return { red: 0, green: 0, blue: 0, alpha: 0 };
  }

  return {
    red:
      (foreground.red * foregroundAlpha +
        background.red * backgroundAlpha * (1 - foregroundAlpha)) /
      alpha,
    green:
      (foreground.green * foregroundAlpha +
        background.green * backgroundAlpha * (1 - foregroundAlpha)) /
      alpha,
    blue:
      (foreground.blue * foregroundAlpha +
        background.blue * backgroundAlpha * (1 - foregroundAlpha)) /
      alpha,
    alpha,
  };
}

/** WCAG contrast for the visible foreground after alpha composition. */
export function calculateMindMapColorContrast(
  foreground: MindMapRgbaColor,
  background: MindMapRgbaColor,
): number {
  const opaqueBackground = makeOpaque(background);
  const visibleForeground = makeOpaque(
    compositeMindMapColors(foreground, opaqueBackground),
  );
  const foregroundLuminance = relativeLuminance(visibleForeground);
  const backgroundLuminance = relativeLuminance(opaqueBackground);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Keeps the preferred candidate when it is already readable; otherwise picks
 * the highest-contrast resolvable candidate while preserving order on ties.
 */
export function selectMindMapTextColorForBackground<T>(
  background: MindMapRgbaColor,
  candidates: readonly T[],
  resolve: (candidate: T) => MindMapRgbaColor | null,
  minimumContrast = MIN_MIND_MAP_TEXT_CONTRAST_RATIO,
): T | null {
  const uniqueCandidates = deduplicateByIdentity(candidates);
  const preferred = uniqueCandidates[0];
  if (preferred === undefined) {
    return null;
  }

  const preferredColor = resolve(preferred);
  if (
    preferredColor !== null &&
    calculateMindMapColorContrast(preferredColor, background) >=
      minimumContrast
  ) {
    return preferred;
  }

  let bestCandidate: T | null = null;
  let bestContrast = -1;
  for (const candidate of uniqueCandidates) {
    const color = resolve(candidate);
    if (color === null) {
      continue;
    }
    const contrast = calculateMindMapColorContrast(color, background);
    if (contrast > bestContrast + CONTRAST_EPSILON) {
      bestCandidate = candidate;
      bestContrast = contrast;
    }
  }
  return bestCandidate;
}

export function areMindMapRenderedColorsEqual(
  left: MindMapRgbaColor,
  right: MindMapRgbaColor,
): boolean {
  const opaqueLeft = makeOpaque(left);
  const opaqueRight = makeOpaque(right);
  return (
    Math.abs(opaqueLeft.red - opaqueRight.red) < 0.5 &&
    Math.abs(opaqueLeft.green - opaqueRight.green) < 0.5 &&
    Math.abs(opaqueLeft.blue - opaqueRight.blue) < 0.5
  );
}

function parseHexColor(value: string): MindMapRgbaColor | null {
  const hex = value.slice(1);
  if (![3, 4, 6, 8].includes(hex.length) || !/^[\da-f]+$/i.test(hex)) {
    return null;
  }
  const expanded =
    hex.length <= 4
      ? [...hex].map((character) => `${character}${character}`).join("")
      : hex;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  const alpha =
    expanded.length === 8
      ? Number.parseInt(expanded.slice(6, 8), 16) / 255
      : 1;
  return { red, green, blue, alpha };
}

function parseRgbColor(value: string): MindMapRgbaColor | null {
  const body = value.slice(value.indexOf("(") + 1, -1).trim();
  const slashParts = body.split("/").map((part) => part.trim());
  if (slashParts.length > 2) {
    return null;
  }
  const componentPart = slashParts[0];
  if (componentPart === undefined) {
    return null;
  }
  const commaSeparated = componentPart.includes(",");
  const components = componentPart
    .split(commaSeparated ? "," : /\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  let alphaPart = slashParts[1];
  if (commaSeparated && components.length === 4) {
    alphaPart = components.pop();
  }
  if (components.length !== 3) {
    return null;
  }
  const channels = components.map(parseRgbChannel);
  if (channels.some((channel) => channel === null)) {
    return null;
  }
  const alpha = alphaPart === undefined ? 1 : parseAlpha(alphaPart);
  if (alpha === null) {
    return null;
  }
  return {
    red: channels[0] ?? 0,
    green: channels[1] ?? 0,
    blue: channels[2] ?? 0,
    alpha,
  };
}

function parseHslColor(value: string): MindMapRgbaColor | null {
  const body = value.slice(value.indexOf("(") + 1, -1).trim();
  const slashParts = body.split("/").map((part) => part.trim());
  if (slashParts.length > 2) {
    return null;
  }
  const componentPart = slashParts[0];
  if (componentPart === undefined) {
    return null;
  }
  const commaSeparated = componentPart.includes(",");
  const components = componentPart
    .split(commaSeparated ? "," : /\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  let alphaPart = slashParts[1];
  if (commaSeparated && components.length === 4) {
    alphaPart = components.pop();
  }
  if (components.length !== 3) {
    return null;
  }
  const hue = parseHue(components[0] ?? "");
  const saturation = parsePercentage(components[1] ?? "");
  const lightness = parsePercentage(components[2] ?? "");
  const alpha = alphaPart === undefined ? 1 : parseAlpha(alphaPart);
  if (
    hue === null ||
    saturation === null ||
    lightness === null ||
    alpha === null
  ) {
    return null;
  }

  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hueSection = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (hueSection < 1) {
    red = chroma;
    green = secondary;
  } else if (hueSection < 2) {
    red = secondary;
    green = chroma;
  } else if (hueSection < 3) {
    green = chroma;
    blue = secondary;
  } else if (hueSection < 4) {
    green = secondary;
    blue = chroma;
  } else if (hueSection < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }
  const match = lightness - chroma / 2;
  return {
    red: (red + match) * 255,
    green: (green + match) * 255,
    blue: (blue + match) * 255,
    alpha,
  };
}

function parseRgbChannel(value: string): number | null {
  if (value.endsWith("%")) {
    const percentage = Number.parseFloat(value.slice(0, -1));
    return Number.isFinite(percentage)
      ? clamp((percentage / 100) * 255, 0, 255)
      : null;
  }
  const channel = Number.parseFloat(value);
  return Number.isFinite(channel) ? clamp(channel, 0, 255) : null;
}

function parseAlpha(value: string): number | null {
  if (value.endsWith("%")) {
    const percentage = Number.parseFloat(value.slice(0, -1));
    return Number.isFinite(percentage)
      ? clamp(percentage / 100, 0, 1)
      : null;
  }
  const alpha = Number.parseFloat(value);
  return Number.isFinite(alpha) ? clamp(alpha, 0, 1) : null;
}

function parseHue(value: string): number | null {
  const match = /^(-?(?:\d+|\d*\.\d+))(deg|grad|rad|turn)?$/.exec(value);
  if (match === null) {
    return null;
  }
  const numeric = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const unit = match[2] ?? "deg";
  const degrees =
    unit === "grad"
      ? numeric * 0.9
      : unit === "rad"
        ? (numeric * 180) / Math.PI
        : unit === "turn"
          ? numeric * 360
          : numeric;
  return ((degrees % 360) + 360) % 360;
}

function parsePercentage(value: string): number | null {
  if (!value.endsWith("%")) {
    return null;
  }
  const percentage = Number.parseFloat(value.slice(0, -1));
  return Number.isFinite(percentage)
    ? clamp(percentage / 100, 0, 1)
    : null;
}

function makeOpaque(color: MindMapRgbaColor): MindMapRgbaColor {
  return color.alpha >= 1
    ? color
    : compositeMindMapColors(color, WHITE);
}

function relativeLuminance(color: MindMapRgbaColor): number {
  const red = linearizeSrgb(color.red / 255);
  const green = linearizeSrgb(color.green / 255);
  const blue = linearizeSrgb(color.blue / 255);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function linearizeSrgb(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function deduplicateByIdentity<T>(values: readonly T[]): readonly T[] {
  const seen = new Set<T>();
  const unique: T[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
