import { describe, expect, it } from "vitest";

import {
  applyMindMapPresentationLibraryPaletteDraftChange,
  applyMindMapPresentationLibraryStyleDraftChange,
  createMindMapPresentationLibraryPaletteDraft,
  createMindMapPresentationLibraryPaletteDraftState,
  createMindMapPresentationLibraryStyleDraft,
  createMindMapPresentationLibraryStyleDraftState,
  reconcileMindMapPresentationLibraryPaletteDraftState,
  reconcileMindMapPresentationLibraryStyleDraftState,
  toMindMapPresentationLibraryPaletteDefinition,
  toMindMapPresentationLibraryStyleDefinition,
} from "../src/presentation/presentation-library-editor";
import {
  createDefaultMindMapPaletteSpec,
  createDefaultMindMapStyleSpec,
  literalColor,
  type MindMapPaletteSpec,
  type MindMapStyleSpec,
} from "../src/presentation/presentation";

describe("presentation library editor drafts", () => {
	it("preserves a dirty Style draft when a divergent authoritative revision arrives", () => {
		const original = createDefaultMindMapStyleSpec({
			id: "custom-style-1",
			label: "Original",
			revision: 1,
		});
		const initial = createMindMapPresentationLibraryStyleDraftState(original);
		const dirty = {
			...initial,
			isDirty: true,
			draft: applyMindMapPresentationLibraryStyleDraftChange(initial.draft, {
				type: "set-label",
				label: "Local draft",
			}),
		};
		const reconciled = reconcileMindMapPresentationLibraryStyleDraftState(
			dirty,
			createDefaultMindMapStyleSpec({
				id: original.id,
				label: "Remote edit",
				revision: 2,
			}),
		);

		expect(reconciled.draft.label).toBe("Local draft");
		expect(reconciled.revision).toBe(1);
		expect(reconciled.conflict).toEqual({
			entryKind: "style",
			entryId: original.id,
			baseRevision: 1,
			authoritativeRevision: 2,
		});
	});

	it("recognizes matching newer Style and Palette revisions as save acknowledgements", () => {
		const style = createDefaultMindMapStyleSpec({
			id: "custom-style-1",
			label: "Original",
			revision: 1,
		});
		const styleState = createMindMapPresentationLibraryStyleDraftState(style);
		const dirtyStyle = {
			...styleState,
			isDirty: true,
			draft: applyMindMapPresentationLibraryStyleDraftChange(
				styleState.draft,
				{ type: "set-label", label: "Saved style" },
			),
		};
		const palette = createDefaultMindMapPaletteSpec({
			id: "custom-palette-1",
			label: "Original",
			revision: 1,
		});
		const paletteState =
			createMindMapPresentationLibraryPaletteDraftState(palette);
		const dirtyPalette = {
			...paletteState,
			isDirty: true,
			draft: applyMindMapPresentationLibraryPaletteDraftChange(
				paletteState.draft,
				{ type: "set-label", label: "Saved palette" },
			),
		};

		expect(
			reconcileMindMapPresentationLibraryStyleDraftState(
				dirtyStyle,
				createDefaultMindMapStyleSpec({
					id: style.id,
					label: "Saved style",
					revision: 2,
				}),
			),
		).toMatchObject({ revision: 2, isDirty: false, conflict: null });
		expect(
			reconcileMindMapPresentationLibraryPaletteDraftState(
				dirtyPalette,
				createDefaultMindMapPaletteSpec({
					id: palette.id,
					label: "Saved palette",
					revision: 2,
				}),
			),
		).toMatchObject({ revision: 2, isDirty: false, conflict: null });
	});

  it("updates every supported Style control without mutating its source or prior draft", () => {
    const source = createDefaultMindMapStyleSpec({
      id: "custom-style-1",
      label: "Source style",
      revision: 4,
      tokens: {
        node: { maxWidth: 240, paddingInline: 8, paddingBlock: 4 },
        edge: { routing: "bezier", lineStyle: "solid", width: 1.5 },
      },
    });
    const initial = createMindMapPresentationLibraryStyleDraft(source);
    const changed = [
      {
        type: "set-label" as const,
        label: "Edited geometry",
      },
      {
        type: "set-role-shape" as const,
        role: "root" as const,
        shape: "ellipse" as const,
      },
      {
        type: "set-role-radius" as const,
        role: "mainTopic" as const,
        radius: 18,
      },
      {
        type: "set-role-max-width" as const,
        role: "subtopic" as const,
        maxWidth: 168,
      },
      {
        type: "set-role-font-size" as const,
        role: "root" as const,
        fontSize: 31,
      },
      {
        type: "set-node-max-width" as const,
        maxWidth: 320,
      },
      {
        type: "set-node-padding" as const,
        paddingInline: 20,
        paddingBlock: 10,
      },
      {
        type: "set-edge-routing" as const,
        routing: "rounded-orthogonal" as const,
      },
      {
        type: "set-edge-line-style" as const,
        lineStyle: "dotted" as const,
      },
      {
        type: "set-edge-width" as const,
        width: 2.75,
      },
    ].reduce(
      (draft, change) =>
        applyMindMapPresentationLibraryStyleDraftChange(draft, change),
      initial,
    );

    expect(changed).not.toBe(initial);
    expect(changed.tokens).not.toBe(initial.tokens);
    expect(changed.label).toBe("Edited geometry");
    expect(changed.tokens.roles.root).toMatchObject({
      shape: "ellipse",
      typography: { fontSize: 31 },
    });
    expect(changed.tokens.roles.mainTopic.radius).toBe(18);
    expect(changed.tokens.roles.subtopic.maxWidth).toBe(168);
    expect(changed.tokens.node).toMatchObject({
      maxWidth: 320,
      paddingInline: 20,
      paddingBlock: 10,
    });
    expect(changed.tokens.edge).toMatchObject({
      routing: "rounded-orthogonal",
      lineStyle: "dotted",
      width: 2.75,
    });

    expect(source.label).toBe("Source style");
    expect(source.tokens.node).toMatchObject({
      maxWidth: 240,
      paddingInline: 8,
      paddingBlock: 4,
    });
    expect(initial.tokens.edge).toMatchObject({
      routing: "bezier",
      lineStyle: "solid",
      width: 1.5,
    });

    const definition = toMindMapPresentationLibraryStyleDefinition(changed);
    expect(definition).toMatchObject({
      label: "Edited geometry",
      tokens: {
        node: { maxWidth: 320 },
        edge: { width: 2.75 },
      },
    });
    expect(definition).not.toHaveProperty("id");
    expect(definition).not.toHaveProperty("revision");
    expect(definition.tokens).not.toHaveProperty("colors");
  });

  it("keeps Style color-free and Palette geometry-free when cloning untrusted runtime objects", () => {
    const style = {
      ...createDefaultMindMapStyleSpec(),
      tokens: {
        ...createDefaultMindMapStyleSpec().tokens,
        roles: {
          ...createDefaultMindMapStyleSpec().tokens.roles,
          root: {
            ...createDefaultMindMapStyleSpec().tokens.roles.root,
            fill: literalColor("#112233"),
          },
        },
      },
    } as unknown as MindMapStyleSpec;
    const palette = {
      ...createDefaultMindMapPaletteSpec(),
      roles: {
        ...createDefaultMindMapPaletteSpec().roles,
        root: {
          ...createDefaultMindMapPaletteSpec().roles.root,
          shape: "pill",
          radius: 22,
        },
      },
    } as unknown as MindMapPaletteSpec;

    const styleDefinition = toMindMapPresentationLibraryStyleDefinition(
      createMindMapPresentationLibraryStyleDraft(style),
    );
    const paletteDefinition = toMindMapPresentationLibraryPaletteDefinition(
      createMindMapPresentationLibraryPaletteDraft(palette),
    );

    expect(styleDefinition.tokens.roles.root).not.toHaveProperty("fill");
    expect(styleDefinition.tokens.roles.root).not.toHaveProperty("textColor");
    expect(paletteDefinition.roles.root).not.toHaveProperty("shape");
    expect(paletteDefinition.roles.root).not.toHaveProperty("radius");
    expect(paletteDefinition).not.toHaveProperty("tokens");
  });

  it("updates base and light Palette colors, role colors, and branches immutably", () => {
    const source = createDefaultMindMapPaletteSpec({
      id: "custom-palette-1",
      label: "Source palette",
      revision: 3,
      lightColors: { canvas: literalColor("#eeeeee") },
      lightRoles: { root: { fill: literalColor("#dddddd") } },
    });
    const initial = createMindMapPresentationLibraryPaletteDraft(source);
    const changed = [
      {
        type: "set-label" as const,
        label: "Edited colors",
      },
      {
        type: "set-core-color" as const,
        target: "base" as const,
        color: "canvas" as const,
        value: "#112233",
      },
      {
        type: "set-core-color" as const,
        target: "light" as const,
        color: "surface" as const,
        value: "#f4f5f6",
      },
      {
        type: "set-role-color" as const,
        target: "base" as const,
        role: "mainTopic" as const,
        channel: "stroke" as const,
        value: "#445566",
      },
      {
        type: "set-role-color" as const,
        target: "light" as const,
        role: "subtopic" as const,
        channel: "textColor" as const,
        value: "#778899",
      },
      {
        type: "set-branch-color" as const,
        target: "base" as const,
        index: 0,
        value: "#aabbcc",
      },
      {
        type: "set-branch-color" as const,
        target: "light" as const,
        index: 1,
        value: "#ddeeff",
      },
    ].reduce(
      (draft, change) =>
        applyMindMapPresentationLibraryPaletteDraftChange(draft, change),
      initial,
    );

    expect(changed).not.toBe(initial);
    expect(changed.colors).not.toBe(initial.colors);
    expect(changed.label).toBe("Edited colors");
    expect(changed.colors.canvas).toEqual(literalColor("#112233"));
    expect(changed.roles.mainTopic.stroke).toEqual(literalColor("#445566"));
    expect(changed.colors.branchPalette[0]).toEqual(literalColor("#aabbcc"));
    expect(changed.lightColors?.canvas).toEqual(literalColor("#eeeeee"));
    expect(changed.lightColors?.surface).toEqual(literalColor("#f4f5f6"));
    expect(changed.lightColors?.branchPalette?.[1]).toEqual(
      literalColor("#ddeeff"),
    );
    expect(changed.lightRoles?.root?.fill).toEqual(literalColor("#dddddd"));
    expect(changed.lightRoles?.subtopic?.textColor).toEqual(
      literalColor("#778899"),
    );

    expect(source.label).toBe("Source palette");
    expect(source.colors.canvas).not.toEqual(literalColor("#112233"));
    expect(source.lightColors?.surface).toBeUndefined();
    expect(initial.roles.mainTopic.stroke).toBeUndefined();

    const definition = toMindMapPresentationLibraryPaletteDefinition(changed);
    expect(definition).toMatchObject({
      label: "Edited colors",
      colors: { canvas: literalColor("#112233") },
      roles: { mainTopic: { stroke: literalColor("#445566") } },
      lightColors: { surface: literalColor("#f4f5f6") },
      lightRoles: { subtopic: { textColor: literalColor("#778899") } },
    });
    expect(definition).not.toHaveProperty("id");
    expect(definition).not.toHaveProperty("revision");
  });

  it("requires explicit light override enablement and rejects CSS-like color input", () => {
    const initial = createMindMapPresentationLibraryPaletteDraft(
      createDefaultMindMapPaletteSpec(),
    );

    expect(initial.lightOverridesEnabled).toBe(false);
    expect(() =>
      applyMindMapPresentationLibraryPaletteDraftChange(initial, {
        type: "set-core-color",
        target: "light",
        color: "canvas",
        value: "#ffffff",
      }),
    ).toThrow("Enable light overrides");
    expect(() =>
      applyMindMapPresentationLibraryPaletteDraftChange(initial, {
        type: "set-core-color",
        target: "base",
        color: "canvas",
        value: "url(https://example.com/color)",
      }),
    ).toThrow("literal hexadecimal");
    expect(() =>
      applyMindMapPresentationLibraryPaletteDraftChange(initial, {
        type: "set-role-color",
        target: "base",
        role: "root",
        channel: "fill",
        value: "rgb(1 2 3)",
      }),
    ).toThrow("literal hexadecimal");

    const enabled = applyMindMapPresentationLibraryPaletteDraftChange(initial, {
      type: "set-light-overrides-enabled",
      enabled: true,
    });
    const lightEdited = applyMindMapPresentationLibraryPaletteDraftChange(
      enabled,
      {
        type: "set-core-color",
        target: "light",
        color: "canvas",
        value: "#ffffff",
      },
    );
    const disabled = applyMindMapPresentationLibraryPaletteDraftChange(
      lightEdited,
      {
        type: "set-light-overrides-enabled",
        enabled: false,
      },
    );

    expect(enabled.lightOverridesEnabled).toBe(true);
    expect(lightEdited.lightColors?.canvas).toEqual(literalColor("#ffffff"));
    expect(disabled.lightOverridesEnabled).toBe(false);
    expect(disabled.lightColors).toBeUndefined();
    expect(disabled.lightRoles).toBeUndefined();
    expect(toMindMapPresentationLibraryPaletteDefinition(disabled)).not.toHaveProperty(
      "lightColors",
    );
  });
});
