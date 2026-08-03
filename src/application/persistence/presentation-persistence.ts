import type { DocumentAnnotationField } from "./annotations";
import type { MindMapPresentation } from "../../presentation/presentation";

/**
 * The narrow part of a theme registry that persistence needs. Keeping this
 * contract independent from a concrete frontend composition makes stale-save
 * handling testable without loading Obsidian or DOM/SVG adapters.
 */
export interface MindMapPresentationThemeResolver {
  readonly styles: MindMapPresentationIdentifierRegistry;
  readonly palettes: MindMapPresentationIdentifierRegistry;
  composeOrDefault(
    styleId: string | null | undefined,
    paletteId: string | null | undefined,
  ): MindMapPresentation["theme"];
}

export interface MindMapPresentationIdentifierRegistry {
  has(id: string): boolean;
}

export type MindMapPresentationThemeSelection =
  | {
      readonly axis: "style";
      readonly id: string;
    }
  | {
      readonly axis: "palette";
      readonly id: string;
    };

export interface MindMapPresentationThemeSelectionResult {
  readonly presentation: MindMapPresentation;
  readonly applied: boolean;
}

export interface DocumentPresentationPersistenceInput {
  readonly basePresentation: MindMapPresentation;
  readonly presentation: MindMapPresentation;
  readonly previousPresentation?: MindMapPresentation;
  readonly fields: readonly DocumentAnnotationField[];
}

/**
 * A persistence request reconciled against the library that is active at the
 * serialized write boundary. Appearance references are intentionally treated
 * separately from the effective renderer snapshot: a deleted reference must
 * never be written back merely because an earlier tab still holds its old
 * composed theme.
 */
export interface ReconciledDocumentPresentationPersistence {
  readonly basePresentation: MindMapPresentation;
  readonly presentation: MindMapPresentation;
  readonly previousPresentation?: MindMapPresentation;
  readonly fields: readonly DocumentAnnotationField[];
  /** Appearance fields suppressed because their requested ID is no longer active. */
  readonly ignoredAppearanceFields: readonly ("style" | "palette")[];
}

/**
 * Recompose a snapshot from its stable selection IDs using the currently
 * active library. This replaces stale geometry/color payloads after a custom
 * definition is edited, and independently falls back when either selection
 * was removed.
 */
export function reconcileMindMapPresentationTheme(
  presentation: MindMapPresentation,
  resolver: MindMapPresentationThemeResolver,
): MindMapPresentation {
  return {
    ...presentation,
    theme: resolver.composeOrDefault(
      presentation.theme.styleId,
      presentation.theme.paletteId,
    ),
  };
}

/**
 * Applies one semantic default Style/Palette selection against the registry
 * that is current when a queued mutation actually runs. A cross-view delete
 * can invalidate an ID after the initiating UI validated it; that retry is a
 * safe no-op rather than an exception or an implicit fallback selection.
 */
export function applyAvailableMindMapPresentationThemeSelection(
  presentation: MindMapPresentation,
  selection: MindMapPresentationThemeSelection,
  resolver: MindMapPresentationThemeResolver,
): MindMapPresentationThemeSelectionResult {
  const registry =
    selection.axis === "style" ? resolver.styles : resolver.palettes;
  if (!registry.has(selection.id)) {
    return { presentation, applied: false };
  }
  return {
    applied: true,
    presentation: {
      ...presentation,
      revision: presentation.revision + 1,
      theme: resolver.composeOrDefault(
        selection.axis === "style"
          ? selection.id
          : presentation.theme.styleId,
        selection.axis === "palette"
          ? selection.id
          : presentation.theme.paletteId,
      ),
    },
  };
}

/**
 * Resolve a document persistence request at commit time.
 *
 * The request can outlive a library update while it waits behind another tab's
 * write. In that case we still persist unrelated fields, but omit only the
 * stale style/palette ownership field so the deletion's explicit fallback is
 * retained instead of being overwritten by an obsolete selection.
 */
export function reconcileDocumentPresentationPersistence(
  input: DocumentPresentationPersistenceInput,
  resolver: MindMapPresentationThemeResolver,
): ReconciledDocumentPresentationPersistence {
  const ignoredAppearanceFields: ("style" | "palette")[] = [];
  const styleIsActive = resolver.styles.has(input.presentation.theme.styleId);
  const paletteIsActive = resolver.palettes.has(
    input.presentation.theme.paletteId,
  );
  const fields = input.fields.filter((field) => {
    if (field === "style" && !styleIsActive) {
      ignoredAppearanceFields.push(field);
      return false;
    }
    if (field === "palette" && !paletteIsActive) {
      ignoredAppearanceFields.push(field);
      return false;
    }
    return true;
  });

  const reconciled: ReconciledDocumentPresentationPersistence = {
    basePresentation: reconcileMindMapPresentationTheme(
      input.basePresentation,
      resolver,
    ),
    presentation: reconcileMindMapPresentationTheme(
      input.presentation,
      resolver,
    ),
    fields,
    ignoredAppearanceFields,
  };
  return input.previousPresentation === undefined
    ? reconciled
    : {
        ...reconciled,
        previousPresentation: reconcileMindMapPresentationTheme(
          input.previousPresentation,
          resolver,
        ),
      };
}

/**
 * Tracks the library composition against which a default-presentation queue
 * was created. The host advances it inside its serialized persistence queue
 * whenever Style/Palette definitions change; work from an older queue can
 * then be safely dropped and retried against a freshly composed snapshot.
 */
export class MindMapPresentationCompositionGeneration {
  private currentGeneration = 0;

  public capture(): number {
    return this.currentGeneration;
  }

  public advance(): number {
    this.currentGeneration += 1;
    return this.currentGeneration;
  }

  public isCurrent(generation: number): boolean {
    return generation === this.currentGeneration;
  }
}
