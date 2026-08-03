import { describe, expect, it } from "vitest";

import {
  calculateMindMapColorContrast,
  compositeMindMapColors,
  parseMindMapCssColor,
  selectMindMapTextColorForBackground,
} from "../src/presentation/color-contrast";

describe("mind-map color contrast primitives", () => {
  it("parses browser and persisted color forms", () => {
    expect(parseMindMapCssColor("#369c")).toEqual({
      red: 51,
      green: 102,
      blue: 153,
      alpha: 0.8,
    });
    expect(parseMindMapCssColor("rgb(20% 40% 60% / 50%)")).toEqual({
      red: 51,
      green: 102,
      blue: 153,
      alpha: 0.5,
    });
    const hsl = parseMindMapCssColor("hsl(210 50% 40% / 0.5)");
    expect(hsl?.red).toBeCloseTo(51);
    expect(hsl?.green).toBeCloseTo(102);
    expect(hsl?.blue).toBeCloseTo(153);
    expect(hsl?.alpha).toBe(0.5);
  });

  it("composites translucent fills over the active canvas", () => {
    expect(
      compositeMindMapColors(
        { red: 0, green: 0, blue: 0, alpha: 0.25 },
        { red: 240, green: 240, blue: 240, alpha: 1 },
      ),
    ).toEqual({ red: 180, green: 180, blue: 180, alpha: 1 });
  });

  it("calculates the WCAG black-on-white contrast ratio", () => {
    expect(
      calculateMindMapColorContrast(
        { red: 0, green: 0, blue: 0, alpha: 1 },
        { red: 255, green: 255, blue: 255, alpha: 1 },
      ),
    ).toBeCloseTo(21);
  });

  it("keeps a readable preferred token and replaces an unreadable one", () => {
    const colors = {
      preferred: { red: 245, green: 245, blue: 245, alpha: 1 },
      dark: { red: 32, green: 32, blue: 32, alpha: 1 },
    } as const;

    expect(
      selectMindMapTextColorForBackground(
        { red: 20, green: 20, blue: 20, alpha: 1 },
        ["preferred", "dark"] as const,
        (candidate) => colors[candidate],
      ),
    ).toBe("preferred");
    expect(
      selectMindMapTextColorForBackground(
        { red: 245, green: 245, blue: 245, alpha: 1 },
        ["preferred", "dark"] as const,
        (candidate) => colors[candidate],
      ),
    ).toBe("dark");
  });
});
