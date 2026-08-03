import { describe, expect, it } from "vitest";

import {
  mergeDocumentAnnotationRecordFields,
  type DocumentAnnotationRecord,
} from "../src/application/persistence/annotations";
import {
  applyAvailableMindMapPresentationThemeSelection,
  MindMapPresentationCompositionGeneration,
  reconcileDocumentPresentationPersistence,
  type MindMapPresentationThemeResolver,
} from "../src/application/persistence/presentation-persistence";
import { ExclusiveTaskQueue } from "../src/application/queues/exclusive-task-queue";
import { createDefaultMindMapPresentation } from "../src/presentation/presentation";

const basePresentation = createDefaultMindMapPresentation("left-to-right");
const fallbackTheme = {
  ...basePresentation.theme,
  id: "fallback-style:fallback-palette",
  styleId: "fallback-style",
  paletteId: "fallback-palette",
};
const activeTheme = {
  ...fallbackTheme,
  id: "active-style:active-palette",
  styleId: "active-style",
  paletteId: "active-palette",
};
const activeStyleFallbackPaletteTheme = {
  ...fallbackTheme,
  id: "active-style:fallback-palette",
  styleId: "active-style",
};
const fallbackStyleActivePaletteTheme = {
  ...fallbackTheme,
  id: "fallback-style:active-palette",
  paletteId: "active-palette",
};
const activePresentation = {
  ...basePresentation,
  theme: fallbackTheme,
};

const resolver: MindMapPresentationThemeResolver = {
  styles: {
    has: (id) => id === "active-style" || id === "fallback-style",
  },
  palettes: {
    has: (id) => id === "active-palette" || id === "fallback-palette",
  },
  composeOrDefault(styleId, paletteId) {
    const style = this.styles.has(styleId ?? "")
      ? styleId
      : "fallback-style";
    const palette = this.palettes.has(paletteId ?? "")
      ? paletteId
      : "fallback-palette";
    if (style === "active-style" && palette === "active-palette") {
      return activeTheme;
    }
    if (style === "active-style") {
      return activeStyleFallbackPaletteTheme;
    }
    if (palette === "active-palette") {
      return fallbackStyleActivePaletteTheme;
    }
    return fallbackTheme;
  },
};

function withThemeSelection(
  styleId: string,
  paletteId: string,
) {
  return {
    ...activePresentation,
    theme: {
      ...activePresentation.theme,
      id: `${styleId}:${paletteId}`,
      styleId,
      paletteId,
    },
  };
}

function createDocumentRecord(
  overrides: Partial<DocumentAnnotationRecord> = {},
): DocumentAnnotationRecord {
  return {
    path: "Map.md",
    layout: null,
    styleId: null,
    paletteId: null,
    fontFamilyId: null,
    connectorWidthId: null,
    connectorProfileId: null,
    nodes: [],
    edges: [],
    decorations: [],
    collapsed: [],
    viewport: null,
    ...overrides,
  };
}

describe("document presentation persistence reconciliation", () => {
  it("keeps active Style and Palette ownership while recomposing the snapshot", () => {
    const selected = withThemeSelection("active-style", "active-palette");
    const reconciled = reconcileDocumentPresentationPersistence(
      {
        basePresentation: activePresentation,
        presentation: selected,
        fields: ["style", "palette", "nodes"],
      },
      resolver,
    );

    expect(reconciled.fields).toEqual(["style", "palette", "nodes"]);
    expect(reconciled.ignoredAppearanceFields).toEqual([]);
    expect(reconciled.presentation.theme).toBe(activeTheme);
  });

  it("does not let a delayed save restore deleted Style or Palette IDs", () => {
    const stale = withThemeSelection("removed-style", "removed-palette");
    const reconciled = reconcileDocumentPresentationPersistence(
      {
        basePresentation: stale,
        presentation: stale,
        previousPresentation: stale,
        fields: ["style", "palette", "nodes", "viewport"],
      },
      resolver,
    );

    expect(reconciled.fields).toEqual(["nodes", "viewport"]);
    expect(reconciled.ignoredAppearanceFields).toEqual(["style", "palette"]);
    expect(reconciled.basePresentation.theme).toBe(fallbackTheme);
    expect(reconciled.presentation.theme).toBe(fallbackTheme);
    expect(reconciled.previousPresentation?.theme).toBe(fallbackTheme);

    const deletionFallback = createDocumentRecord({
      styleId: "fallback-style",
      paletteId: "fallback-palette",
    });
    const merged = mergeDocumentAnnotationRecordFields(
      deletionFallback,
      createDocumentRecord(),
      reconciled.fields,
    );
    expect(merged.styleId).toBe("fallback-style");
    expect(merged.paletteId).toBe("fallback-palette");
  });

  it("suppresses only the unavailable appearance axis", () => {
    const selected = withThemeSelection("active-style", "removed-palette");
    const reconciled = reconcileDocumentPresentationPersistence(
      {
        basePresentation: activePresentation,
        presentation: selected,
        fields: ["style", "palette"],
      },
      resolver,
    );

    expect(reconciled.fields).toEqual(["style"]);
    expect(reconciled.ignoredAppearanceFields).toEqual(["palette"]);
    expect(reconciled.presentation.theme).toBe(activeStyleFallbackPaletteTheme);
    expect(reconciled.presentation.theme.styleId).toBe("active-style");
    expect(reconciled.presentation.theme.paletteId).toBe("fallback-palette");
  });
});

describe("queued default appearance selection", () => {
  it("applies a selection that remains available in the current registry", () => {
    const result = applyAvailableMindMapPresentationThemeSelection(
      activePresentation,
      { axis: "style", id: "active-style" },
      resolver,
    );

    expect(result.applied).toBe(true);
    expect(result.presentation).not.toBe(activePresentation);
    expect(result.presentation.revision).toBe(activePresentation.revision + 1);
    expect(result.presentation.theme).toBe(activeStyleFallbackPaletteTheme);
  });

  it("becomes a safe no-op when another view removed the requested entry", () => {
    const missingStyle = applyAvailableMindMapPresentationThemeSelection(
      activePresentation,
      { axis: "style", id: "removed-style" },
      resolver,
    );
    const missingPalette = applyAvailableMindMapPresentationThemeSelection(
      activePresentation,
      { axis: "palette", id: "removed-palette" },
      resolver,
    );

    expect(missingStyle).toEqual({
      presentation: activePresentation,
      applied: false,
    });
    expect(missingPalette).toEqual({
      presentation: activePresentation,
      applied: false,
    });
  });
});

describe("presentation composition generations", () => {
  it("invalidates default-presentation work captured before a library change", () => {
    const generation = new MindMapPresentationCompositionGeneration();
    const beforeLibraryChange = generation.capture();

    expect(generation.isCurrent(beforeLibraryChange)).toBe(true);
    expect(generation.advance()).toBe(beforeLibraryChange + 1);
    expect(generation.isCurrent(beforeLibraryChange)).toBe(false);
    expect(generation.isCurrent(generation.capture())).toBe(true);
  });

  it("blocks default work captured before a queued library transaction", async () => {
    const queue = new ExclusiveTaskQueue();
    const generation = new MindMapPresentationCompositionGeneration();
    const staleDefaultGeneration = generation.capture();
    const committed: string[] = [];

    const libraryChange = queue.run(async () => {
      generation.advance();
      committed.push("library");
    });
    const delayedDefaultSave = queue.run(async () => {
      if (!generation.isCurrent(staleDefaultGeneration)) {
        return false;
      }
      committed.push("stale-default");
      return true;
    });

    await expect(Promise.all([libraryChange, delayedDefaultSave])).resolves.toEqual([
      undefined,
      false,
    ]);
    expect(committed).toEqual(["library"]);
  });
});
