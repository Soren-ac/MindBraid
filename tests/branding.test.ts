import { describe, expect, it } from "vitest";

import { OBMIND_ICON_ID, OBMIND_ICON_SVG } from "../src/ui/branding";

describe("MindBraid branding", () => {
  it("provides a scoped, theme-aware, self-contained icon fragment", () => {
    expect(OBMIND_ICON_ID).toBe("obmind-logo");
    expect(OBMIND_ICON_SVG).toContain('stroke="currentColor"');
    expect(OBMIND_ICON_SVG).toContain('fill="currentColor"');
    expect(OBMIND_ICON_SVG).not.toMatch(
      /<svg|<script|<style|\b(?:href|src|on\w+)\s*=|url\s*\(/iu,
    );
  });
});
