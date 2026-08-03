import {
  composeMindMapTheme,
  createDefaultMindMapPaletteSpec,
  createDefaultMindMapStyleSpec,
  type MindMapPaletteSpec,
  type MindMapStyleSpec,
  type MindMapThemeSpec,
} from "./presentation";

/**
 * The persisted shape for reusable, user-authored appearance definitions.
 *
 * This library deliberately contains only definitions owned by the user. It
 * does not copy built-in entries, choose document defaults, or store a
 * document's current style/palette selection. Those concerns stay with the
 * active composition and annotation stores respectively.
 */
export const MIND_MAP_PRESENTATION_LIBRARY_VERSION = 1;

/** Prefixes are stable and never reused after an entry is deleted. */
export const CUSTOM_MIND_MAP_STYLE_ID_PREFIX = "custom-style-";
export const CUSTOM_MIND_MAP_PALETTE_ID_PREFIX = "custom-palette-";

const SAFE_APPEARANCE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const MAX_LABEL_LENGTH = 160;
const MAX_REVISION_STRING_LENGTH = 256;
const MAX_JSON_DEPTH = 32;
const MAX_JSON_COLLECTION_LENGTH = 2_048;
const PALETTE_FORBIDDEN_TREATMENT_KEYS = new Set([
  "tokens",
  "effects",
  "geometry",
  "style",
  "typography",
  "node",
  "branches",
  "shape",
  "routing",
  "lineStyle",
  "connectorProfile",
  "width",
  "radius",
  "borderWidth",
  "maxWidth",
  "minHeight",
  "paddingInline",
  "paddingBlock",
  "fontFamilyToken",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "terminalMarker",
]);
const STYLE_FORBIDDEN_COLOR_KEYS = new Set([
  "colors",
  "lightColors",
  "lightRoles",
  "fill",
  "stroke",
  "textColor",
  "color",
  "branchColorIndex",
  "branchPalette",
]);

export type MindMapPresentationLibraryEntryKind = "style" | "palette";

/**
 * A persisted entry revision is an opaque optimistic-concurrency token. The
 * library compares it exactly and remains its sole authority for advancing it.
 */
export type MindMapPresentationLibraryEntryRevision =
  MindMapStyleSpec["revision"];

/**
 * JSON-safe custom definitions plus monotonic counters used for stable IDs.
 * Counters are retained after deletion so a future item can never silently
 * take over a removed definition's document reference.
 */
export interface MindMapPresentationLibrary {
  readonly version: typeof MIND_MAP_PRESENTATION_LIBRARY_VERSION;
  readonly nextStyleOrdinal: number;
  readonly nextPaletteOrdinal: number;
  readonly styles: readonly MindMapStyleSpec[];
  readonly palettes: readonly MindMapPaletteSpec[];
}

/**
 * The library validates its persistence invariants itself, while the active
 * renderer/composition supplies the domain-specific checks. That lets a
 * future renderer add an effect, shape, or palette-color rule without making
 * this persistence module import DOM/SVG or Obsidian code.
 */
export interface MindMapPresentationLibraryValidators {
  /** Throw when a style cannot be consumed by the currently active frontend. */
  readonly validateStyle: (style: MindMapStyleSpec) => void;
  /** Throw when a palette cannot be consumed by the currently active frontend. */
  readonly validatePalette: (palette: MindMapPaletteSpec) => void;
  /** Built-in or extension IDs that a user library is not allowed to shadow. */
  readonly isStyleIdReserved?: (styleId: string) => boolean;
  /** Built-in or extension IDs that a user library is not allowed to shadow. */
  readonly isPaletteIdReserved?: (paletteId: string) => boolean;
}

export interface MindMapPresentationLibraryIssue {
  readonly collection: "library" | "styles" | "palettes";
  readonly index?: number;
  readonly id?: string;
  readonly reason:
    | "unsupported-version"
    | "invalid-shape"
    | "invalid-entry"
    | "duplicate-id"
    | "reserved-id";
}

/** Result of accepting unknown plugin data without losing valid siblings. */
export interface MindMapPresentationLibraryLoadResult {
  readonly library: MindMapPresentationLibrary;
  readonly migrated: boolean;
  readonly issues: readonly MindMapPresentationLibraryIssue[];
}

export interface CreateMindMapPresentationLibraryStyleOptions {
  readonly label: string;
  /** A built-in or custom style used as the editor's starting point. */
  readonly template?: MindMapStyleSpec;
}

export interface CreateMindMapPresentationLibraryPaletteOptions {
  readonly label: string;
  /** A built-in or custom palette used as the editor's starting point. */
  readonly template?: MindMapPaletteSpec;
}

/** The editable portion of a custom Style; IDs and revisions stay library-owned. */
export type MindMapPresentationLibraryStyleDefinition = Omit<
  MindMapStyleSpec,
  "id" | "revision"
>;

/** The editable portion of a custom Palette; IDs and revisions stay library-owned. */
export type MindMapPresentationLibraryPaletteDefinition = Omit<
  MindMapPaletteSpec,
  "id" | "revision"
>;

/**
 * A caller must submit the revision that was displayed with the editable
 * definition. Keeping this small request object separate from a definition
 * makes future entry metadata additions non-breaking for frontend adapters.
 */
export interface MindMapPresentationLibraryEntryUpdate<TDefinition> {
  readonly expectedRevision: MindMapPresentationLibraryEntryRevision;
  readonly definition: TDefinition;
}

export type MindMapPresentationLibraryStyleUpdate =
  MindMapPresentationLibraryEntryUpdate<MindMapPresentationLibraryStyleDefinition>;

export type MindMapPresentationLibraryPaletteUpdate =
  MindMapPresentationLibraryEntryUpdate<MindMapPresentationLibraryPaletteDefinition>;

/** A structured conflict that a host can return to any replaceable frontend. */
export interface MindMapPresentationLibraryRevisionConflict {
  readonly entryKind: MindMapPresentationLibraryEntryKind;
  readonly entryId: string;
  readonly expectedRevision: MindMapPresentationLibraryEntryRevision;
  readonly actualRevision: MindMapPresentationLibraryEntryRevision | null;
  readonly reason: "revision-mismatch" | "entry-missing";
}

/**
 * Raised before any library snapshot is created when an update/delete was
 * based on an old entry revision. Hosts should handle this as a normal
 * recoverable conflict, not as a persistence failure.
 */
export class MindMapPresentationLibraryRevisionConflictError extends Error {
  public constructor(
    public readonly conflict: MindMapPresentationLibraryRevisionConflict,
  ) {
    super(createRevisionConflictMessage(conflict));
    this.name = "MindMapPresentationLibraryRevisionConflictError";
  }
}

export interface MindMapPresentationLibraryMutation<TEntry> {
  readonly library: MindMapPresentationLibrary;
  readonly entry: TEntry;
}

/**
 * Deletion never rewrites a document. The host receives the explicit fallback
 * it must apply if the now-removed ID had been selected by an open document.
 */
export interface MindMapPresentationLibraryDeletion<TEntry> {
  readonly library: MindMapPresentationLibrary;
  readonly removed: TEntry | null;
  readonly fallback: MindMapPresentationLibraryReferenceResolution | null;
}

export interface MindMapPresentationLibraryReferenceResolution {
  readonly requestedId: string | null;
  readonly resolvedId: string;
  readonly usedFallback: boolean;
}

/** A small renderer-neutral preview payload for a style/palette pair. */
export interface MindMapPresentationLibraryPreview {
  readonly style: MindMapStyleSpec;
  readonly palette: MindMapPaletteSpec;
  readonly theme: MindMapThemeSpec;
}

/** Creates a fresh immutable user-library snapshot. */
export function createMindMapPresentationLibrary(): MindMapPresentationLibrary {
  return createLibrary({
    nextStyleOrdinal: 1,
    nextPaletteOrdinal: 1,
    styles: [],
    palettes: [],
  });
}

/** Returns an ownership-safe snapshot suitable for JSON persistence. */
export function cloneMindMapPresentationLibrary(
  library: MindMapPresentationLibrary,
): MindMapPresentationLibrary {
  return createLibrary({
    nextStyleOrdinal: library.nextStyleOrdinal,
    nextPaletteOrdinal: library.nextPaletteOrdinal,
    styles: library.styles,
    palettes: library.palettes,
  });
}

/**
 * Normalizes persisted data one entry at a time. A broken style never erases
 * a separately valid palette, and an old counter is advanced rather than
 * allowing deleted IDs to be reused.
 */
export function normalizeMindMapPresentationLibrary(
  value: unknown,
  validators: MindMapPresentationLibraryValidators,
): MindMapPresentationLibraryLoadResult {
  const issues: MindMapPresentationLibraryIssue[] = [];
  const record = isRecord(value) ? value : null;
  let migrated = false;

  if (record === null) {
    issues.push({ collection: "library", reason: "invalid-shape" });
    return {
      library: createMindMapPresentationLibrary(),
      migrated: true,
      issues,
    };
  }

  if (record.version !== MIND_MAP_PRESENTATION_LIBRARY_VERSION) {
    issues.push({ collection: "library", reason: "unsupported-version" });
    migrated = true;
  }

  const styles = normalizeCollection(
    record.styles,
    "styles",
    (candidate) => acceptStyle(candidate, validators),
    validators.isStyleIdReserved,
    issues,
  );
  const palettes = normalizeCollection(
    record.palettes,
    "palettes",
    (candidate) => acceptPalette(candidate, validators),
    validators.isPaletteIdReserved,
    issues,
  );

  const minimumStyleOrdinal = nextOrdinalAfterExisting(
    styles.entries,
    CUSTOM_MIND_MAP_STYLE_ID_PREFIX,
  );
  const minimumPaletteOrdinal = nextOrdinalAfterExisting(
    palettes.entries,
    CUSTOM_MIND_MAP_PALETTE_ID_PREFIX,
  );
  const nextStyleOrdinal = normalizeOrdinal(
    record.nextStyleOrdinal,
    minimumStyleOrdinal,
  );
  const nextPaletteOrdinal = normalizeOrdinal(
    record.nextPaletteOrdinal,
    minimumPaletteOrdinal,
  );

  migrated ||= styles.changed || palettes.changed;
  migrated ||= nextStyleOrdinal !== record.nextStyleOrdinal;
  migrated ||= nextPaletteOrdinal !== record.nextPaletteOrdinal;

  return {
    library: createLibrary({
      nextStyleOrdinal,
      nextPaletteOrdinal,
      styles: styles.entries,
      palettes: palettes.entries,
    }),
    migrated,
    issues,
  };
}

/**
 * Adds a custom Style from a safe template. The template may be built in, but
 * the generated definition always gets its own user-library ID and revision.
 */
export function createMindMapPresentationLibraryStyle(
  library: MindMapPresentationLibrary,
  options: CreateMindMapPresentationLibraryStyleOptions,
  validators: MindMapPresentationLibraryValidators,
): MindMapPresentationLibraryMutation<MindMapStyleSpec> {
  const allocation = allocateIdentifier(
    library.styles,
    library.nextStyleOrdinal,
    CUSTOM_MIND_MAP_STYLE_ID_PREFIX,
    validators.isStyleIdReserved,
  );
  const template = options.template ?? createDefaultMindMapStyleSpec();
  const entry = acceptStyle(
    {
      id: allocation.id,
      label: options.label,
      revision: 1,
      tokens: template.tokens,
    },
    validators,
  );
  return {
    library: createLibrary({
      nextStyleOrdinal: allocation.nextOrdinal,
      nextPaletteOrdinal: library.nextPaletteOrdinal,
      styles: [...library.styles, entry],
      palettes: library.palettes,
    }),
    entry,
  };
}

/** Creates a named copy while preserving the source's treatment only. */
export function duplicateMindMapPresentationLibraryStyle(
  library: MindMapPresentationLibrary,
  source: MindMapStyleSpec,
  validators: MindMapPresentationLibraryValidators,
  label = `Copy of ${source.label}`,
): MindMapPresentationLibraryMutation<MindMapStyleSpec> {
  return createMindMapPresentationLibraryStyle(
    library,
    { label, template: source },
    validators,
  );
}

/**
 * Replaces one user Style's editable definition. IDs cannot move and the
 * library, not the frontend, advances the geometry revision. The displayed
 * `update.expectedRevision` must still match exactly or no snapshot is made.
 */
export function replaceMindMapPresentationLibraryStyle(
  library: MindMapPresentationLibrary,
  styleId: string,
  update: MindMapPresentationLibraryStyleUpdate,
  validators: MindMapPresentationLibraryValidators,
): MindMapPresentationLibraryMutation<MindMapStyleSpec> {
  const index = findStyleIndex(library, styleId);
  const current = index < 0 ? undefined : library.styles[index];
  assertCurrentEntryRevision("style", styleId, update.expectedRevision, current);
  const entry = acceptStyle(
    {
      id: current.id,
      label: update.definition.label,
      revision: nextEntryRevision(current.revision),
      tokens: update.definition.tokens,
    },
    validators,
  );
  const styles = library.styles.slice();
  styles[index] = entry;
  return {
    library: createLibrary({
      nextStyleOrdinal: library.nextStyleOrdinal,
      nextPaletteOrdinal: library.nextPaletteOrdinal,
      styles,
      palettes: library.palettes,
    }),
    entry,
  };
}

/** Renames one user Style without allowing the frontend to change its ID. */
export function renameMindMapPresentationLibraryStyle(
  library: MindMapPresentationLibrary,
  styleId: string,
  expectedRevision: MindMapPresentationLibraryEntryRevision,
  label: string,
  validators: MindMapPresentationLibraryValidators,
): MindMapPresentationLibraryMutation<MindMapStyleSpec> {
  const current = library.styles.find((entry) => entry.id === styleId);
  assertCurrentEntryRevision("style", styleId, expectedRevision, current);
  return replaceMindMapPresentationLibraryStyle(
    library,
    styleId,
    { expectedRevision, definition: { label, tokens: current.tokens } },
    validators,
  );
}

/**
 * Removes one user Style. `fallbackStyleId` is returned rather than applied:
 * changing document selections belongs to the persistence host, never to a
 * reusable definition library. Deletion is also revision-checked so an old UI
 * cannot remove a Style that another tab has since edited.
 */
export function deleteMindMapPresentationLibraryStyle(
  library: MindMapPresentationLibrary,
  styleId: string,
  expectedRevision: MindMapPresentationLibraryEntryRevision,
  fallbackStyleId: string,
): MindMapPresentationLibraryDeletion<MindMapStyleSpec> {
  return deleteEntry(
    library,
    styleId,
    expectedRevision,
    fallbackStyleId,
    "style",
  );
}

/** Adds a custom Palette from a safe template, including light-mode values. */
export function createMindMapPresentationLibraryPalette(
  library: MindMapPresentationLibrary,
  options: CreateMindMapPresentationLibraryPaletteOptions,
  validators: MindMapPresentationLibraryValidators,
): MindMapPresentationLibraryMutation<MindMapPaletteSpec> {
  const allocation = allocateIdentifier(
    library.palettes,
    library.nextPaletteOrdinal,
    CUSTOM_MIND_MAP_PALETTE_ID_PREFIX,
    validators.isPaletteIdReserved,
  );
  const template = options.template ?? createDefaultMindMapPaletteSpec();
  const entry = acceptPalette(
    {
      id: allocation.id,
      label: options.label,
      revision: 1,
      colors: template.colors,
      roles: template.roles,
      ...(template.lightColors === undefined
        ? {}
        : { lightColors: template.lightColors }),
      ...(template.lightRoles === undefined
        ? {}
        : { lightRoles: template.lightRoles }),
    },
    validators,
  );
  return {
    library: createLibrary({
      nextStyleOrdinal: library.nextStyleOrdinal,
      nextPaletteOrdinal: allocation.nextOrdinal,
      styles: library.styles,
      palettes: [...library.palettes, entry],
    }),
    entry,
  };
}

/** Creates a named copy, preserving color data (including light-mode overrides). */
export function duplicateMindMapPresentationLibraryPalette(
  library: MindMapPresentationLibrary,
  source: MindMapPaletteSpec,
  validators: MindMapPresentationLibraryValidators,
  label = `Copy of ${source.label}`,
): MindMapPresentationLibraryMutation<MindMapPaletteSpec> {
  return createMindMapPresentationLibraryPalette(
    library,
    { label, template: source },
    validators,
  );
}

/**
 * Replaces one custom Palette's color-only definition and bumps its revision.
 * The displayed `update.expectedRevision` must still match exactly.
 */
export function replaceMindMapPresentationLibraryPalette(
  library: MindMapPresentationLibrary,
  paletteId: string,
  update: MindMapPresentationLibraryPaletteUpdate,
  validators: MindMapPresentationLibraryValidators,
): MindMapPresentationLibraryMutation<MindMapPaletteSpec> {
  const index = findPaletteIndex(library, paletteId);
  const current = index < 0 ? undefined : library.palettes[index];
  assertCurrentEntryRevision("palette", paletteId, update.expectedRevision, current);
  const entry = acceptPalette(
    {
      id: current.id,
      label: update.definition.label,
      revision: nextEntryRevision(current.revision),
      colors: update.definition.colors,
      roles: update.definition.roles,
      ...(update.definition.lightColors === undefined
        ? {}
        : { lightColors: update.definition.lightColors }),
      ...(update.definition.lightRoles === undefined
        ? {}
        : { lightRoles: update.definition.lightRoles }),
    },
    validators,
  );
  const palettes = library.palettes.slice();
  palettes[index] = entry;
  return {
    library: createLibrary({
      nextStyleOrdinal: library.nextStyleOrdinal,
      nextPaletteOrdinal: library.nextPaletteOrdinal,
      styles: library.styles,
      palettes,
    }),
    entry,
  };
}

/** Renames one user Palette while leaving its color treatment intact. */
export function renameMindMapPresentationLibraryPalette(
  library: MindMapPresentationLibrary,
  paletteId: string,
  expectedRevision: MindMapPresentationLibraryEntryRevision,
  label: string,
  validators: MindMapPresentationLibraryValidators,
): MindMapPresentationLibraryMutation<MindMapPaletteSpec> {
  const current = library.palettes.find((entry) => entry.id === paletteId);
  assertCurrentEntryRevision("palette", paletteId, expectedRevision, current);
  return replaceMindMapPresentationLibraryPalette(
    library,
    paletteId,
    {
      expectedRevision,
      definition: {
        label,
        colors: current.colors,
        roles: current.roles,
        ...(current.lightColors === undefined
          ? {}
          : { lightColors: current.lightColors }),
        ...(current.lightRoles === undefined
          ? {}
          : { lightRoles: current.lightRoles }),
      },
    },
    validators,
  );
}

/**
 * Removes one user Palette and returns the caller-supplied fallback choice.
 * The revision check prevents an old UI from deleting a newer Palette edit.
 */
export function deleteMindMapPresentationLibraryPalette(
  library: MindMapPresentationLibrary,
  paletteId: string,
  expectedRevision: MindMapPresentationLibraryEntryRevision,
  fallbackPaletteId: string,
): MindMapPresentationLibraryDeletion<MindMapPaletteSpec> {
  return deleteEntry(
    library,
    paletteId,
    expectedRevision,
    fallbackPaletteId,
    "palette",
  );
}

/** Returns a cloned custom Style, never a mutable reference owned by the library. */
export function getMindMapPresentationLibraryStyle(
  library: MindMapPresentationLibrary,
  styleId: string,
): MindMapStyleSpec | undefined {
  const style = library.styles.find((entry) => entry.id === styleId);
  return style === undefined ? undefined : cloneStyle(style);
}

/** Returns a cloned custom Palette, never a mutable reference owned by the library. */
export function getMindMapPresentationLibraryPalette(
  library: MindMapPresentationLibrary,
  paletteId: string,
): MindMapPaletteSpec | undefined {
  const palette = library.palettes.find((entry) => entry.id === paletteId);
  return palette === undefined ? undefined : clonePalette(palette);
}

/**
 * Resolves an ID against any active registry. It is intentionally generic so
 * it works for built-ins, custom libraries, and future extension registries.
 */
export function resolveMindMapPresentationLibraryReference(
  requestedId: string | null | undefined,
  availableIds: Iterable<string>,
  fallbackId: string,
): MindMapPresentationLibraryReferenceResolution {
  if (!isSafeAppearanceId(fallbackId)) {
    throw new TypeError(
      `Invalid fallback appearance ID "${String(fallbackId)}".`,
    );
  }
  const available = new Set(availableIds);
  if (!available.has(fallbackId)) {
    throw new RangeError(
      `Fallback appearance ID "${fallbackId}" is not active in this registry.`,
    );
  }
  if (
    requestedId !== null &&
    requestedId !== undefined &&
    isSafeAppearanceId(requestedId) &&
    available.has(requestedId)
  ) {
    return {
      requestedId,
      resolvedId: requestedId,
      usedFallback: false,
    };
  }
  return {
    requestedId:
      requestedId !== null && requestedId !== undefined ? requestedId : null,
    resolvedId: fallbackId,
    usedFallback: true,
  };
}

/**
 * Creates a composed snapshot for preview cards. The composition is the same
 * pure style/palette boundary used for the actual renderer, so cards cannot
 * accidentally advertise a combination that the map draws differently.
 */
export function createMindMapPresentationLibraryPreview(
  style: MindMapStyleSpec,
  palette: MindMapPaletteSpec,
): MindMapPresentationLibraryPreview {
  const safeStyle = cloneStyle(style);
  const safePalette = clonePalette(palette);
  return {
    style: safeStyle,
    palette: safePalette,
    theme: composeMindMapTheme(safeStyle, safePalette),
  };
}

function normalizeCollection<TEntry extends { readonly id: string }>(
  value: unknown,
  collection: "styles" | "palettes",
  accept: (candidate: unknown) => TEntry,
  isReserved: ((id: string) => boolean) | undefined,
  issues: MindMapPresentationLibraryIssue[],
): { readonly entries: readonly TEntry[]; readonly changed: boolean } {
  if (!Array.isArray(value)) {
    if (value !== undefined) {
      issues.push({ collection, reason: "invalid-shape" });
    }
    return { entries: [], changed: value !== undefined };
  }
  if (value.length > MAX_JSON_COLLECTION_LENGTH) {
    issues.push({ collection, reason: "invalid-shape" });
    return { entries: [], changed: true };
  }

  const entries: TEntry[] = [];
  const ids = new Set<string>();
  let changed = false;
  for (const [index, candidate] of value.entries()) {
    try {
      const entry = accept(candidate);
      if (ids.has(entry.id)) {
        issues.push({
          collection,
          index,
          id: entry.id,
          reason: "duplicate-id",
        });
        changed = true;
        continue;
      }
      const reserved = isReserved?.(entry.id);
      if (reserved === true) {
        issues.push({
          collection,
          index,
          id: entry.id,
          reason: "reserved-id",
        });
        changed = true;
        continue;
      }
      ids.add(entry.id);
      entries.push(entry);
    } catch {
      issues.push({ collection, index, reason: "invalid-entry" });
      changed = true;
    }
  }
  return { entries, changed };
}

function deleteEntry(
  library: MindMapPresentationLibrary,
  id: string,
  expectedRevision: MindMapPresentationLibraryEntryRevision,
  fallbackId: string,
  kind: "style",
): MindMapPresentationLibraryDeletion<MindMapStyleSpec>;
function deleteEntry(
  library: MindMapPresentationLibrary,
  id: string,
  expectedRevision: MindMapPresentationLibraryEntryRevision,
  fallbackId: string,
  kind: "palette",
): MindMapPresentationLibraryDeletion<MindMapPaletteSpec>;
function deleteEntry(
  library: MindMapPresentationLibrary,
  id: string,
  expectedRevision: MindMapPresentationLibraryEntryRevision,
  fallbackId: string,
  kind: MindMapPresentationLibraryEntryKind,
): MindMapPresentationLibraryDeletion<MindMapStyleSpec | MindMapPaletteSpec> {
  if (!isSafeAppearanceId(id)) {
    throw new TypeError(`Invalid custom ${String(kind)} ID "${String(id)}".`);
  }
  if (!isSafeAppearanceId(fallbackId) || fallbackId === id) {
    throw new TypeError(`Invalid fallback ${kind} ID "${fallbackId}".`);
  }
  const source = kind === "style" ? library.styles : library.palettes;
  const index = source.findIndex((entry) => entry.id === id);
  const entry = index < 0 ? undefined : source[index];
  assertCurrentEntryRevision(kind, id, expectedRevision, entry);
  const next = source.slice();
  next.splice(index, 1);
  const nextLibrary =
    kind === "style"
      ? createLibrary({
          nextStyleOrdinal: library.nextStyleOrdinal,
          nextPaletteOrdinal: library.nextPaletteOrdinal,
          styles: next as readonly MindMapStyleSpec[],
          palettes: library.palettes,
        })
      : createLibrary({
          nextStyleOrdinal: library.nextStyleOrdinal,
          nextPaletteOrdinal: library.nextPaletteOrdinal,
          styles: library.styles,
          palettes: next as readonly MindMapPaletteSpec[],
        });
  return {
    library: nextLibrary,
    removed: kind === "style" ? cloneStyle(entry as MindMapStyleSpec) : clonePalette(entry as MindMapPaletteSpec),
    fallback: {
      requestedId: id,
      resolvedId: fallbackId,
      usedFallback: true,
    },
  };
}

function acceptStyle(
  value: unknown,
  validators: MindMapPresentationLibraryValidators,
): MindMapStyleSpec {
  assertJsonSafe(value);
  assertStyleColorSeparation(value);
  const candidate = cloneJson(value) as MindMapStyleSpec;
  assertAppearanceEnvelope(candidate, "style");
  validators.validateStyle(candidate);
  assertStyleColorSeparation(candidate);
  return cloneStyle(candidate);
}

function acceptPalette(
  value: unknown,
  validators: MindMapPresentationLibraryValidators,
): MindMapPaletteSpec {
  assertJsonSafe(value);
  assertPaletteTreatmentSeparation(value);
  const candidate = cloneJson(value) as MindMapPaletteSpec;
  assertAppearanceEnvelope(candidate, "palette");
  validators.validatePalette(candidate);
  assertPaletteTreatmentSeparation(candidate);
  return clonePalette(candidate);
}

function assertAppearanceEnvelope(
  value: MindMapStyleSpec | MindMapPaletteSpec,
  kind: MindMapPresentationLibraryEntryKind,
): void {
  if (!isSafeAppearanceId(value.id)) {
    throw new TypeError(`Invalid custom ${kind} ID "${String(value.id)}".`);
  }
  if (
    typeof value.label !== "string" ||
    value.label.trim().length === 0 ||
    value.label.length > MAX_LABEL_LENGTH
  ) {
    throw new TypeError(`Custom ${kind} labels must be non-empty and concise.`);
  }
  if (!isSafeRevision(value.revision)) {
    throw new TypeError(`Invalid custom ${kind} revision.`);
  }
  if (kind === "style") {
    const style = value as MindMapStyleSpec;
    if (!isRecord(style.tokens)) {
      throw new TypeError("Custom styles require a token record.");
    }
  } else {
    const palette = value as MindMapPaletteSpec;
    if (!isRecord(palette.colors)) {
      throw new TypeError("Custom palettes require a color record.");
    }
  }
}

function assertStyleColorSeparation(value: unknown): void {
  const style = requireRecord(value, "Custom styles must be records.");
  assertNoStyleColorFields(style, "style");
  const tokens = requireRecord(style.tokens, "Custom styles require tokens.");
  const roles = requireRecord(tokens.roles, "Custom styles require role tokens.");
  for (const roleName of ["root", "mainTopic", "subtopic"] as const) {
    const role = requireRecord(
      roles[roleName],
      `Custom styles require a ${roleName} role.`,
    );
    if ("content" in role) {
      throw new TypeError("Custom styles cannot contain role content.");
    }
  }
}

/**
 * Keep the style axis color-free without making its otherwise extensible
 * nested objects a closed schema. Only field names that are explicit color
 * semantics in the presentation contracts are rejected; unknown extension
 * fields remain the renderer validator's responsibility.
 */
function assertNoStyleColorFields(
  value: Record<string, unknown>,
  location: string,
): void {
  for (const [key, child] of Object.entries(value)) {
    if (STYLE_FORBIDDEN_COLOR_KEYS.has(key)) {
      throw new TypeError(`Custom styles cannot contain ${location}.${key}.`);
    }
    if (Array.isArray(child)) {
      for (const [index, item] of child.entries()) {
        if (isRecord(item)) {
          assertNoStyleColorFields(item, `${location}.${key}[${index}]`);
        }
      }
    } else if (isRecord(child)) {
      assertNoStyleColorFields(child, `${location}.${key}`);
    }
  }
}

function assertPaletteTreatmentSeparation(value: unknown): void {
  const palette = requireRecord(value, "Custom palettes must be records.");
  assertNoPaletteTreatmentFields(palette, "palette");
  requireRecord(palette.colors, "Custom palettes require colors.");
  assertPaletteRoleColors(palette.roles, "roles");
  if (palette.lightRoles !== undefined) {
    assertPaletteRoleColors(palette.lightRoles, "lightRoles", true);
  }
}

function assertNoPaletteTreatmentFields(
  value: Record<string, unknown>,
  location: string,
): void {
  for (const [key, child] of Object.entries(value)) {
    if (PALETTE_FORBIDDEN_TREATMENT_KEYS.has(key)) {
      throw new TypeError(`Custom palettes cannot contain ${location}.${key}.`);
    }
    if (Array.isArray(child)) {
      for (const [index, item] of child.entries()) {
        if (isRecord(item)) {
          assertNoPaletteTreatmentFields(item, `${location}.${key}[${index}]`);
        }
      }
    } else if (isRecord(child)) {
      assertNoPaletteTreatmentFields(child, `${location}.${key}`);
    }
  }
}

function assertPaletteRoleColors(
  value: unknown,
  label: string,
  partial = false,
): void {
  const roles = requireRecord(value, `Custom palettes require ${label}.`);
  for (const roleName of ["root", "mainTopic", "subtopic"] as const) {
    const role = roles[roleName];
    if (role === undefined && partial) {
      continue;
    }
    const roleRecord = requireRecord(
      role,
      `Custom palettes require a ${label}.${roleName} record.`,
    );
    for (const key of Object.keys(roleRecord)) {
      if (key !== "fill" && key !== "stroke" && key !== "textColor") {
        throw new TypeError(
          `Custom palettes cannot contain ${label}.${roleName}.${key}.`,
        );
      }
    }
  }
}

function allocateIdentifier(
  entries: readonly { readonly id: string }[],
  initialOrdinal: number,
  prefix: string,
  isReserved: ((id: string) => boolean) | undefined,
): { readonly id: string; readonly nextOrdinal: number } {
  const ids = new Set(entries.map((entry) => entry.id));
  let ordinal = initialOrdinal;
  // The next ordinal itself is persisted, so the final safe integer cannot
  // be allocated: there would be no JSON-safe successor to retain.
  while (ordinal < Number.MAX_SAFE_INTEGER) {
    const id = `${prefix}${ordinal}`;
    ordinal += 1;
    if (!ids.has(id) && isReserved?.(id) !== true) {
      return { id, nextOrdinal: ordinal };
    }
  }
  throw new RangeError("The custom presentation ID space is exhausted.");
}

function createLibrary(options: {
  readonly nextStyleOrdinal: number;
  readonly nextPaletteOrdinal: number;
  readonly styles: readonly MindMapStyleSpec[];
  readonly palettes: readonly MindMapPaletteSpec[];
}): MindMapPresentationLibrary {
  return Object.freeze({
    version: MIND_MAP_PRESENTATION_LIBRARY_VERSION,
    nextStyleOrdinal: normalizeOrdinal(options.nextStyleOrdinal, 1),
    nextPaletteOrdinal: normalizeOrdinal(options.nextPaletteOrdinal, 1),
    styles: Object.freeze(options.styles.map(cloneStyle)),
    palettes: Object.freeze(options.palettes.map(clonePalette)),
  });
}

function cloneStyle(style: MindMapStyleSpec): MindMapStyleSpec {
  return cloneJson(style) as MindMapStyleSpec;
}

function clonePalette(palette: MindMapPaletteSpec): MindMapPaletteSpec {
  return cloneJson(palette) as MindMapPaletteSpec;
}

function cloneJson(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item === undefined) {
        throw new TypeError("Custom presentation arrays cannot contain undefined values.");
      }
      return cloneJson(item);
    });
  }
  const source = value as Record<string, unknown>;
  const target: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    // Optional TypeScript properties are frequently materialized as
    // `undefined` by object spreads. Omit them to create JSON-safe storage.
    if (item !== undefined) {
      target[key] = cloneJson(item);
    }
  }
  return target;
}

function assertJsonSafe(value: unknown): void {
  const ancestors = new WeakSet<object>();
  assertJsonSafeAt(value, ancestors, 0);
}

function assertJsonSafeAt(
  value: unknown,
  ancestors: WeakSet<object>,
  depth: number,
): void {
  if (depth > MAX_JSON_DEPTH) {
    throw new TypeError("Custom presentation data is nested too deeply.");
  }
  if (value === undefined) {
    return;
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return;
    }
    throw new TypeError("Custom presentation data must use finite numbers.");
  }
  if (typeof value !== "object") {
    throw new TypeError("Custom presentation data must be JSON-safe.");
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    throw new TypeError("Custom presentation data must use plain objects.");
  }
  if (ancestors.has(value)) {
    throw new TypeError("Custom presentation data cannot contain cycles.");
  }
  ancestors.add(value);
  const values = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  if (values.length > MAX_JSON_COLLECTION_LENGTH) {
    throw new TypeError("Custom presentation data is too large.");
  }
  for (const item of values) {
    assertJsonSafeAt(item, ancestors, depth + 1);
  }
  ancestors.delete(value);
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(message);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    isPlainObject(value)
  );
}

function isPlainObject(value: object): boolean {
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSafeAppearanceId(value: unknown): value is string {
  return typeof value === "string" && SAFE_APPEARANCE_ID.test(value);
}

function isSafeRevision(value: unknown): value is string | number {
  return (
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= MAX_REVISION_STRING_LENGTH)
  );
}

function normalizeOrdinal(value: unknown, minimum: number): number {
  const fallback = Math.max(1, minimum);
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < fallback
  ) {
    return fallback;
  }
  return value;
}

function nextOrdinalAfterExisting(
  entries: readonly { readonly id: string }[],
  prefix: string,
): number {
  let maximum = 0;
  for (const entry of entries) {
    const suffix = entry.id.slice(prefix.length);
    if (!entry.id.startsWith(prefix) || !/^\d+$/.test(suffix)) {
      continue;
    }
    const ordinal = Number(suffix);
    if (Number.isSafeInteger(ordinal) && ordinal > maximum) {
      maximum = ordinal;
    }
  }
  return maximum >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : maximum + 1;
}

function nextEntryRevision(revision: string | number): number {
  if (typeof revision !== "number" || !Number.isFinite(revision)) {
    return 1;
  }
  const next = Math.floor(revision) + 1;
  return next > 0 && next <= Number.MAX_SAFE_INTEGER ? next : 1;
}

function assertCurrentEntryRevision<
  TEntry extends { readonly revision: MindMapPresentationLibraryEntryRevision },
>(
  entryKind: MindMapPresentationLibraryEntryKind,
  entryId: string,
  expectedRevision: MindMapPresentationLibraryEntryRevision,
  current: TEntry | undefined,
): asserts current is TEntry {
  if (!isSafeAppearanceId(entryId)) {
    throw new TypeError(
      `Invalid custom ${entryKind} ID "${String(entryId)}".`,
    );
  }
  if (!isSafeRevision(expectedRevision)) {
    throw new TypeError(`Invalid expected custom ${entryKind} revision.`);
  }
  if (current === undefined) {
    throw new MindMapPresentationLibraryRevisionConflictError({
      entryKind,
      entryId,
      expectedRevision,
      actualRevision: null,
      reason: "entry-missing",
    });
  }
  if (!Object.is(current.revision, expectedRevision)) {
    throw new MindMapPresentationLibraryRevisionConflictError({
      entryKind,
      entryId,
      expectedRevision,
      actualRevision: current.revision,
      reason: "revision-mismatch",
    });
  }
}

function createRevisionConflictMessage(
  conflict: MindMapPresentationLibraryRevisionConflict,
): string {
  const entryLabel =
    conflict.entryKind === "style" ? "custom style" : "custom palette";
  return conflict.reason === "entry-missing"
    ? `The ${entryLabel} "${conflict.entryId}" was removed before this change could be saved.`
    : `The ${entryLabel} "${conflict.entryId}" changed before this edit could be saved.`;
}

function findStyleIndex(library: MindMapPresentationLibrary, styleId: string): number {
  return library.styles.findIndex((entry) => entry.id === styleId);
}

function findPaletteIndex(
  library: MindMapPresentationLibrary,
  paletteId: string,
): number {
  return library.palettes.findIndex((entry) => entry.id === paletteId);
}
