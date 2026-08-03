import { describe, expect, it } from "vitest";

import {
  literalColor,
  resolveMindMapNodeTextColor,
} from "../src/presentation/presentation";

const canvas = literalColor("#ffffff");
const normalText = literalColor("#222222");
const roleText = literalColor("#ffffff");
const branchText = literalColor("#f0f0f0");

describe("mind-map node text color resolution", () => {
  it("uses normal palette text for shapes that do not paint a fill", () => {
    for (const shape of ["none", "underline"] as const) {
      expect(
        resolveMindMapNodeTextColor({
          shape,
          effectiveFill: literalColor("#336699"),
          canvas,
          defaultTextColor: normalText,
          roleTextColor: roleText,
          branchTextColor: branchText,
        }),
      ).toEqual(normalText);
    }
  });

  it("treats a fill matching the canvas as visually unfilled", () => {
    expect(
      resolveMindMapNodeTextColor({
        shape: "rounded-rectangle",
        effectiveFill: canvas,
        canvas,
        defaultTextColor: normalText,
        roleTextColor: roleText,
      }),
    ).toEqual(normalText);
  });

  it("uses branch then role text on a visibly filled topic", () => {
    const input = {
      shape: "rounded-rectangle" as const,
      effectiveFill: literalColor("#224466"),
      canvas,
      defaultTextColor: normalText,
      roleTextColor: roleText,
    };

    expect(resolveMindMapNodeTextColor(input)).toEqual(roleText);
    expect(
      resolveMindMapNodeTextColor({ ...input, branchTextColor: branchText }),
    ).toEqual(branchText);
  });

  it("keeps an explicit per-node text override authoritative", () => {
    const explicit = literalColor("#ff00ff");
    expect(
      resolveMindMapNodeTextColor({
        shape: "rounded-rectangle",
        effectiveFill: literalColor("#f2f2f2"),
        canvas,
        defaultTextColor: normalText,
        roleTextColor: roleText,
        branchTextColor: branchText,
        explicitTextColor: explicit,
      }),
    ).toEqual(explicit);
  });

  it("chooses light text for a dark visible fill", () => {
    const lightText = literalColor("#eeeeee");
    expect(
      resolveMindMapNodeTextColor({
        shape: "rounded-rectangle",
        effectiveFill: literalColor("#1a1a1a"),
        canvas,
        defaultTextColor: normalText,
        roleTextColor: lightText,
      }),
    ).toEqual(lightText);
  });

  it("chooses dark text for a light visible fill", () => {
    expect(
      resolveMindMapNodeTextColor({
        shape: "rounded-rectangle",
        effectiveFill: literalColor("#f2f2f2"),
        canvas,
        defaultTextColor: normalText,
        roleTextColor: roleText,
      }),
    ).toEqual(normalText);
  });

  it("evaluates translucent fills after compositing them over the canvas", () => {
    // 12% black over white remains a light gray, so white role text would
    // have inadequate contrast while the normal dark text remains readable.
    expect(
      resolveMindMapNodeTextColor({
        shape: "rounded-rectangle",
        effectiveFill: literalColor("rgba(0, 0, 0, 0.12)"),
        canvas,
        defaultTextColor: normalText,
        roleTextColor: roleText,
      }),
    ).toEqual(normalText);
  });

  it("uses the canvas as the dark inverse for a bright fill in dark mode", () => {
    const darkCanvas = literalColor("#1e1e1e");
    expect(
      resolveMindMapNodeTextColor({
        shape: "rounded-rectangle",
        effectiveFill: literalColor("#60a5fa"),
        canvas: darkCanvas,
        defaultTextColor: literalColor("#e5e7eb"),
        contrastTextColor: literalColor("#ffffff"),
      }),
    ).toEqual(darkCanvas);
  });
});
