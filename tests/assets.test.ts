import { describe, expect, it } from "vitest";

import {
  BLOCKED_ASSET_ID,
  BUILT_IN_MIND_MAP_ASSET_REGISTRY,
  DONE_ASSET_ID,
  FLAG_ASSET_ID,
  PRIORITY_HIGH_ASSET_ID,
  PROGRESS_50_ASSET_ID,
  STAR_ASSET_ID,
  TAG_LABEL_ASSET_ID,
  createMindMapAssetRegistry,
  getMindMapAssetCapabilityLabelKey,
  resolveMindMapAssetVisualDescriptor,
  resolveMindMapNodeAssets,
  validateMindMapAssetSpec,
  type MindMapAssetSpec,
} from "../src/presentation/assets";

describe("mind-map node assets", () => {
  it("ships the offline priority, progress, status, icon, and tag catalog", () => {
    const assets = BUILT_IN_MIND_MAP_ASSET_REGISTRY.list();

    expect(assets.map(({ id }) => id)).toEqual([
      "priority-high",
      "priority-medium",
      "priority-low",
      "progress-0",
      "progress-25",
      "progress-50",
      "progress-75",
      "progress-100",
      "done",
      "blocked",
      "flag",
      "star",
      "tag-label",
    ]);
    expect(
      BUILT_IN_MIND_MAP_ASSET_REGISTRY.listByKind("marker").map(({ id }) => id),
    ).toEqual([
      "priority-high",
      "priority-medium",
      "priority-low",
      "progress-0",
      "progress-25",
      "progress-50",
      "progress-75",
      "progress-100",
      "done",
      "blocked",
    ]);
    expect(BUILT_IN_MIND_MAP_ASSET_REGISTRY.listByKind("icon").map(({ id }) => id)).toEqual([
      "flag",
      "star",
    ]);
    expect(BUILT_IN_MIND_MAP_ASSET_REGISTRY.resolve(TAG_LABEL_ASSET_ID)).toMatchObject({
      kind: "tag",
      visual: {
        labelContent: {
          kind: "label",
          placement: "inside",
          maximumLength: 64,
        },
      },
    });
    expect(
      BUILT_IN_MIND_MAP_ASSET_REGISTRY.resolve(PROGRESS_50_ASSET_ID).visual
        .primitives,
    ).toContainEqual(
      expect.objectContaining({ kind: "arc", startAngle: -90, endAngle: 90 }),
    );
  });

  it("uses stable capability keys for the existing bilingual capability-localization path", () => {
    const asset = BUILT_IN_MIND_MAP_ASSET_REGISTRY.resolve(PRIORITY_HIGH_ASSET_ID);

    expect(asset.capabilityLabelKey).toBe("capability.asset.priority-high");
    expect(getMindMapAssetCapabilityLabelKey(STAR_ASSET_ID)).toBe(
      "capability.asset.star",
    );
  });

  it("resolves sparse node references into independent immutable visual descriptors", () => {
    const resolved = resolveMindMapNodeAssets(BUILT_IN_MIND_MAP_ASSET_REGISTRY, {
      shape: "pill",
      iconId: FLAG_ASSET_ID,
      markerIds: [PRIORITY_HIGH_ASSET_ID, PROGRESS_50_ASSET_ID, DONE_ASSET_ID],
    });
    const second = resolveMindMapNodeAssets(BUILT_IN_MIND_MAP_ASSET_REGISTRY, {
      iconId: FLAG_ASSET_ID,
      markerIds: [PRIORITY_HIGH_ASSET_ID],
    });

    expect(resolved.icon).toMatchObject({ id: "flag", kind: "icon" });
    expect(resolved.markers.map(({ id }) => id)).toEqual([
      "priority-high",
      "progress-50",
      "done",
    ]);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.markers)).toBe(true);
    expect(Object.isFrozen(resolved.icon)).toBe(true);
    expect(Object.isFrozen(resolved.icon?.primitives)).toBe(true);
    expect(resolved.icon).not.toBe(second.icon);
    expect(resolved.icon?.primitives).not.toBe(second.icon?.primitives);

    const tag = resolveMindMapAssetVisualDescriptor(
      BUILT_IN_MIND_MAP_ASSET_REGISTRY,
      TAG_LABEL_ASSET_ID,
      "tag",
    );
    expect(tag.labelContent).toEqual({
      kind: "label",
      placement: "inside",
      maximumLength: 64,
      paddingInline: 5.5,
      paddingBlock: 3,
    });
    expect(Object.isFrozen(tag.labelContent)).toBe(true);
  });

  it("rejects duplicate, unknown, and wrong-slot node asset references", () => {
    expect(() =>
      resolveMindMapNodeAssets(BUILT_IN_MIND_MAP_ASSET_REGISTRY, {
        markerIds: [DONE_ASSET_ID, DONE_ASSET_ID],
      }),
    ).toThrow(`Duplicate mind-map marker asset "${DONE_ASSET_ID}"`);
    expect(() =>
      resolveMindMapNodeAssets(BUILT_IN_MIND_MAP_ASSET_REGISTRY, {
        markerIds: ["not-registered"],
      }),
    ).toThrow('Unknown mind-map asset "not-registered"');
    expect(() =>
      resolveMindMapNodeAssets(BUILT_IN_MIND_MAP_ASSET_REGISTRY, {
        iconId: DONE_ASSET_ID,
      }),
    ).toThrow(`Mind-map asset "${DONE_ASSET_ID}" is a marker, not a icon`);
    expect(() =>
      resolveMindMapNodeAssets(BUILT_IN_MIND_MAP_ASSET_REGISTRY, {
        markerIds: [FLAG_ASSET_ID],
      }),
    ).toThrow(`Mind-map asset "${FLAG_ASSET_ID}" is a icon, not a marker`);
    expect(() =>
      resolveMindMapNodeAssets(BUILT_IN_MIND_MAP_ASSET_REGISTRY, {
        markerIds: [BLOCKED_ASSET_ID, "bad/id"],
      }),
    ).toThrow("marker asset ID must be a safe stable identifier");
  });

  it("validates strict primitive-only assets and copies registry input", () => {
    const source = createCustomMarker();
    const registry = createMindMapAssetRegistry([source]);
    const primitive = source.visual.primitives[0];
    if (primitive === undefined || primitive.kind !== "circle") {
      throw new Error("Fixture should contain one circle.");
    }
    primitive.radius = 8;

    expect(registry.resolve("custom-marker").visual.primitives[0]).toMatchObject({
      kind: "circle",
      radius: 4,
    });
    expect(Object.isFrozen(registry.resolve("custom-marker"))).toBe(true);
    expect(() =>
      createMindMapAssetRegistry([
        createCustomMarker(),
        createCustomMarker(),
      ]),
    ).toThrow('Duplicate mind-map asset ID "custom-marker"');
    expect(() =>
      validateMindMapAssetSpec({
        ...createCustomMarker(),
        url: "https://example.test/asset.svg",
      }),
    ).toThrow('contains unsupported field "url"');
    expect(() =>
      validateMindMapAssetSpec({
        ...createCustomMarker(),
        id: "unsafe/url",
        capabilityLabelKey: "capability.asset.unsafe/url",
      }),
    ).toThrow("safe stable identifier");
    expect(() =>
      validateMindMapAssetSpec({
        ...createCustomMarker(),
        visual: {
          ...createCustomMarker().visual,
          primitives: [
            {
              kind: "circle",
              centerX: 12,
              centerY: 12,
              radius: 4,
              fill: { kind: "role", role: "accent" },
              render: () => undefined,
            },
          ],
        },
      }),
    ).toThrow('contains unsupported field "render"');
  });
});

function createCustomMarker() {
  return {
    id: "custom-marker",
    label: "Custom marker",
    capabilityLabelKey: "capability.asset.custom-marker",
    kind: "marker",
    revision: 1,
    visual: {
      viewBox: { width: 24, height: 24 },
      primitives: [
        {
          kind: "circle" as const,
          centerX: 12,
          centerY: 12,
          radius: 4,
          fill: { kind: "role" as const, role: "accent" as const },
        },
      ],
    },
  } satisfies MindMapAssetSpec;
}
