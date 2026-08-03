import { describe, expect, it } from "vitest";

import {
  BUILT_IN_MIND_MAP_FORMATTING_REGISTRY,
  createMindMapFormattingRegistry,
  resolveMindMapConnectorStrokeProfile,
} from "../src/presentation/formatting";

describe("mind-map global formatting registry", () => {
  it("publishes independent font, connector-width, and connector-profile catalogs", () => {
    const registry = BUILT_IN_MIND_MAP_FORMATTING_REGISTRY;

    expect(
      registry.fonts.list().map(({ id, label, fontFamilyToken }) => ({
        id,
        label,
        fontFamilyToken,
      })),
    ).toEqual([
      {
        id: "style-default",
        label: "Style default",
        fontFamilyToken: null,
      },
      {
        id: "obsidian-interface",
        label: "Obsidian interface",
        fontFamilyToken: "font-interface",
      },
      {
        id: "obsidian-text",
        label: "Obsidian text",
        fontFamilyToken: "font-text",
      },
      {
        id: "monospace",
        label: "Monospace",
        fontFamilyToken: "font-monospace",
      },
      {
        id: "handwritten",
        label: "Handwritten",
        fontFamilyToken: "obmind-font-handwritten",
      },
      {
        id: "system-sans",
        label: "System sans-serif",
        fontFamilyToken: "obmind-font-system-sans",
      },
      {
        id: "chinese-heiti-simplified",
        label: "黑体 · 简体中文",
        fontFamilyToken: "obmind-font-heiti-sc",
      },
      {
        id: "chinese-heiti-traditional",
        label: "黑体 · 繁體中文",
        fontFamilyToken: "obmind-font-heiti-tc",
      },
      {
        id: "hiragino-sans-gb",
        label: "冬青黑体简体中文",
        fontFamilyToken: "obmind-font-hiragino-gb",
      },
      {
        id: "chinese-songti-simplified",
        label: "宋体 · 简体中文",
        fontFamilyToken: "obmind-font-songti-sc",
      },
      {
        id: "chinese-songti-traditional",
        label: "宋體 · 繁體中文",
        fontFamilyToken: "obmind-font-songti-tc",
      },
      {
        id: "source-han-sans",
        label: "思源黑体",
        fontFamilyToken: "obmind-font-source-han-sans",
      },
      {
        id: "source-han-serif",
        label: "思源宋体",
        fontFamilyToken: "obmind-font-source-han-serif",
      },
    ]);
    expect(registry.connectorWidths.list().map(({ id }) => id)).toEqual([
      "style-default",
      "extra-thin",
      "thin",
      "medium",
      "thick",
      "extra-thick",
    ]);
    expect(registry.connectorProfiles.list().map(({ id }) => id)).toEqual([
      "style-default",
      "uniform",
      "taper-to-child",
    ]);
    expect(
      registry.composeOrDefault(undefined, undefined, undefined),
    ).toMatchObject({
      fontFamily: { id: "style-default", fontFamilyToken: null },
      connectorWidth: { id: "style-default", width: null },
      connectorProfile: { id: "style-default", profile: null },
    });
    expect(
      registry.composeOrDefault(
        "missing-font",
        "missing-width",
        "missing-profile",
      ),
    ).toMatchObject({
      fontFamily: { id: "style-default" },
      connectorWidth: { id: "style-default" },
      connectorProfile: { id: "style-default", profile: null },
    });
  });

  it("combines either formatting axis without changing the other", () => {
    const registry = BUILT_IN_MIND_MAP_FORMATTING_REGISTRY;

    expect(
      registry.compose("handwritten", "thin", "taper-to-child"),
    ).toMatchObject({
      fontFamily: {
        id: "handwritten",
        fontFamilyToken: "obmind-font-handwritten",
      },
      connectorWidth: { id: "thin", width: 1 },
      connectorProfile: {
        id: "taper-to-child",
        profile: { kind: "taper-to-child", childWidthRatio: 0.35 },
      },
    });
    expect(registry.compose("monospace", "extra-thick")).toMatchObject({
      fontFamily: { id: "monospace", fontFamilyToken: "font-monospace" },
      connectorWidth: { id: "extra-thick", width: 3.25 },
      connectorProfile: { id: "style-default", profile: null },
    });
  });

  it("resolves style-default profiles from the current style and clones overrides", () => {
    const registry = BUILT_IN_MIND_MAP_FORMATTING_REGISTRY;
    const styleProfile = {
      kind: "taper-to-child" as const,
      childWidthRatio: 0.5,
    };
    const inherited = resolveMindMapConnectorStrokeProfile(
      registry.connectorProfiles.resolve("style-default"),
      styleProfile,
    );
    const uniform = resolveMindMapConnectorStrokeProfile(
      registry.connectorProfiles.resolve("uniform"),
      styleProfile,
    );

    expect(inherited).toEqual(styleProfile);
    expect(inherited).not.toBe(styleProfile);
    expect(uniform).toEqual({ kind: "uniform" });
    expect(uniform).not.toBe(
      registry.connectorProfiles.resolve("uniform").profile,
    );
  });

  it("rejects unsafe tokens, invalid widths, and invalid connector profiles", () => {
    expect(() =>
      createMindMapFormattingRegistry(
        [
          {
            id: "unsafe",
            label: "Unsafe",
            revision: 1,
            fontFamilyToken: "font-interface);color:red",
          },
        ],
        [
          {
            id: "style-default",
            label: "Style default",
            revision: 1,
            width: null,
          },
        ],
        "unsafe",
        "style-default",
      ),
    ).toThrow("unsafe token");
    expect(() =>
      createMindMapFormattingRegistry(
        [
          {
            id: "uppercase-token",
            label: "Uppercase token",
            revision: 1,
            fontFamilyToken: "Font-Interface",
          },
        ],
        [
          {
            id: "style-default",
            label: "Style default",
            revision: 1,
            width: null,
          },
        ],
        "uppercase-token",
        "style-default",
      ),
    ).toThrow("unsafe token");
    expect(() =>
      createMindMapFormattingRegistry(
        [
          {
            id: "style-default",
            label: "Style default",
            revision: 1,
            fontFamilyToken: null,
          },
        ],
        [
          { id: "wide", label: "Wide", revision: 1, width: -1 },
        ],
        "style-default",
        "wide",
      ),
    ).toThrow("invalid");
    expect(() =>
      createMindMapFormattingRegistry(
        [
          {
            id: "style-default",
            label: "Style default",
            revision: 1,
            fontFamilyToken: null,
          },
        ],
        [
          {
            id: "style-default",
            label: "Style default",
            revision: 1,
            width: null,
          },
        ],
        "style-default",
        "style-default",
        [
          {
            id: "bad-taper",
            label: "Bad taper",
            revision: 1,
            profile: {
              kind: "taper-to-child",
              childWidthRatio: 0,
            },
          },
        ],
        "bad-taper",
      ),
    ).toThrow("invalid child width ratio");
    expect(() =>
      createMindMapFormattingRegistry(
        [
          {
            id: "style-default",
            label: "Style default",
            revision: 1,
            fontFamilyToken: null,
          },
        ],
        [
          {
            id: "style-default",
            label: "Style default",
            revision: 1,
            width: null,
          },
        ],
        "style-default",
        "style-default",
        [
          {
            id: "unknown-profile",
            label: "Unknown profile",
            revision: 1,
            profile: { kind: "wave" } as never,
          },
        ],
        "unknown-profile",
      ),
    ).toThrow("unsupported kind");
  });
});
