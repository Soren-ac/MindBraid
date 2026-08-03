import { createLayoutEdgeId } from "../../layout/layout";
import type { MindMapDocument, MindMapNode } from "../../core/model";
import {
	createMindMapNodeLocator,
	isMindMapNodeLocator,
	resolveMindMapNodeLocatorDetailed,
	type MindMapNodeLocator,
	type MindMapNodeLocatorMatchStrategy,
} from "../../topic/node-identity";
import type {
	MindMapFrontendCapabilities,
} from "../../ui/frontend";
import type {
	MindMapDecoration,
	MindMapEdgePresentation,
	MindMapLayoutSpec,
	MindMapNodePresentation,
	MindMapPresentation,
	MindMapViewportState,
} from "../../presentation/presentation";
import {
	applyMindMapPresentationPatch,
	createMindMapPresentationPatch,
	isSafePresentationIdentifier,
	validateMindMapEdgePresentation,
	validateMindMapNodePresentation,
	type MindMapPresentationPatch,
} from "../../presentation/presentation-patch";
import { migrateLegacyMindMapThemeId } from "../../presentation/themes";

export const ANNOTATION_STORE_VERSION = 5;
export const PERSISTENT_NODE_REF_VERSION = 1;

export type AnnotationRecordStatus = "attached" | "orphaned";

/**
 * A metadata-free persistent target. The embedded locator is deliberately a
 * reconciliation hint, never a node ID or a source mutation mechanism.
 */
export interface PersistentNodeRef {
	readonly version: typeof PERSISTENT_NODE_REF_VERSION;
	readonly locator: MindMapNodeLocator;
}

export interface AnnotationRecord {
	readonly id: string;
	readonly target: PersistentNodeRef;
	readonly text: string;
	readonly status: AnnotationRecordStatus;
}

export interface PersistentLayoutAnnotation {
	readonly engineId: string;
	readonly orientation: MindMapLayoutSpec["orientation"];
	readonly spacing: MindMapLayoutSpec["spacing"];
	readonly options: Readonly<Record<string, string | number | boolean>>;
}

export interface PersistentNodePresentationAnnotation {
	readonly target: PersistentNodeRef;
	readonly status: AnnotationRecordStatus;
	readonly presentation: MindMapNodePresentation;
}

export interface PersistentEdgePresentationAnnotation {
	readonly from: PersistentNodeRef;
	readonly to: PersistentNodeRef;
	readonly status: AnnotationRecordStatus;
	readonly presentation: MindMapEdgePresentation;
}

export interface PersistentCollapsedNodeAnnotation {
	readonly target: PersistentNodeRef;
	readonly status: AnnotationRecordStatus;
}

interface PersistentDecorationBase {
	readonly id: string;
	readonly variant?: string;
	readonly status: AnnotationRecordStatus;
}

export interface PersistentMarkerDecoration extends PersistentDecorationBase {
	readonly kind: "marker";
	readonly target: PersistentNodeRef;
	readonly markerId: string;
	readonly label?: string;
}

export interface PersistentBoundaryDecoration extends PersistentDecorationBase {
	readonly kind: "boundary";
	readonly targets: readonly PersistentNodeRef[];
	readonly label?: string;
}

export interface PersistentSummaryDecoration extends PersistentDecorationBase {
	readonly kind: "summary";
	readonly targets: readonly PersistentNodeRef[];
	readonly text: string;
}

export interface PersistentRelationshipDecoration
	extends PersistentDecorationBase {
	readonly kind: "relationship";
	readonly from: PersistentNodeRef;
	readonly to: PersistentNodeRef;
	readonly label?: string;
}

export type PersistentDecorationAnnotation =
	| PersistentMarkerDecoration
	| PersistentBoundaryDecoration
	| PersistentSummaryDecoration
	| PersistentRelationshipDecoration;

export interface DocumentAnnotationRecord {
	readonly path: string;
	readonly layout: PersistentLayoutAnnotation | null;
	readonly styleId: string | null;
	readonly paletteId: string | null;
	readonly fontFamilyId: string | null;
	readonly connectorWidthId: string | null;
	readonly connectorProfileId: string | null;
	readonly nodes: readonly PersistentNodePresentationAnnotation[];
	readonly edges: readonly PersistentEdgePresentationAnnotation[];
	readonly decorations: readonly PersistentDecorationAnnotation[];
	readonly collapsed: readonly PersistentCollapsedNodeAnnotation[];
	readonly viewport: MindMapViewportState | null;
}

export type DocumentAnnotationField =
	| "layout"
	| "style"
	| "palette"
	| "font-family"
	| "connector-width"
	| "connector-profile"
	| "nodes"
	| "edges"
	| "decorations"
	| "collapsed"
	| "viewport";

/**
 * Document annotation fields that describe the presentation itself. These are
 * the only fields presentation undo/redo is allowed to restore. Interaction
 * state (collapsed branches and viewport) is independently persisted and must
 * always remain owned by the latest interaction save.
 */
export const DOCUMENT_PRESENTATION_ANNOTATION_FIELDS = [
	"layout",
	"style",
	"palette",
	"font-family",
	"connector-width",
	"connector-profile",
	"nodes",
	"edges",
	"decorations",
] as const satisfies readonly DocumentAnnotationField[];

export type DocumentPresentationAnnotationField =
	(typeof DOCUMENT_PRESENTATION_ANNOTATION_FIELDS)[number];

/**
 * Document annotation fields that describe transient, user-controlled canvas
 * interaction rather than presentation. They are intentionally excluded from
 * presentation history snapshots.
 */
export const DOCUMENT_INTERACTION_ANNOTATION_FIELDS = [
	"collapsed",
	"viewport",
] as const satisfies readonly DocumentAnnotationField[];

export type DocumentInteractionAnnotationField =
	(typeof DOCUMENT_INTERACTION_ANNOTATION_FIELDS)[number];

/** Persistent identity for one edge owned by a history operation. */
export interface PersistentPresentationHistoryEdgeTarget {
	readonly from: PersistentNodeRef;
	readonly to: PersistentNodeRef;
}

/**
 * A history target deliberately carries both the source path and the exact
 * presentation fields owned by the original gesture. `record` is a complete
 * cloned record for safe storage, but only `fields` may be restored from it.
 * Node and edge target sets refine those two collection fields to the exact
 * persistent targets changed by the original gesture. This makes an old
 * history entry unable to replay stale interaction state or unrelated topic
 * formatting from another tab.
 */
export interface DocumentPresentationHistorySnapshot {
	readonly path: string;
	readonly fields: readonly DocumentPresentationAnnotationField[];
	readonly record: DocumentAnnotationRecord | null;
	readonly nodeTargets: readonly PersistentNodeRef[];
	readonly edgeTargets: readonly PersistentPresentationHistoryEdgeTarget[];
}

export interface DocumentPresentationHistoryEntrySnapshots {
	readonly before: DocumentPresentationHistorySnapshot;
	readonly after: DocumentPresentationHistorySnapshot;
}

/**
 * The node/edge overrides explicitly changed by one document presentation
 * operation. IDs are transient runtime IDs: the merge converts them back to
 * persistent locators only after resolving them against the current document.
 */
export interface DocumentPresentationOverrideDelta {
	readonly nodes: ReadonlyMap<string, MindMapNodePresentation | null>;
	readonly edges: ReadonlyMap<string, MindMapEdgePresentation | null>;
}

export interface DocumentAppearanceReferenceReplacement {
	readonly kind: "style" | "palette";
	readonly removedId: string;
	readonly fallbackId: string;
}

export interface AnnotationStore {
	readonly version: typeof ANNOTATION_STORE_VERSION;
	readonly annotations: readonly AnnotationRecord[];
	readonly documents: readonly DocumentAnnotationRecord[];
}

interface LegacyAnnotationStoreV1 {
	readonly version: 1;
	readonly annotations: readonly AnnotationRecord[];
}

interface LegacyAnnotationStoreV2 {
	readonly version: 2;
	readonly annotations: readonly AnnotationRecord[];
	readonly documents: readonly unknown[];
}

interface LegacyAnnotationStoreV3 {
	readonly version: 3;
	readonly annotations: readonly AnnotationRecord[];
	readonly documents: readonly unknown[];
}

interface LegacyAnnotationStoreV4 {
	readonly version: 4;
	readonly annotations: readonly AnnotationRecord[];
	readonly documents: readonly unknown[];
}

/** Early persisted shape, before explicit reference and lifecycle versions. */
interface LegacyAnnotationStoreV0 {
	readonly version?: 0;
	readonly annotations: readonly LegacyAnnotationRecordV0[];
}

interface LegacyAnnotationRecordV0 {
	readonly id: string;
	readonly locator: MindMapNodeLocator;
	readonly text: string;
}

export interface AnnotationStoreLoadResult {
	readonly store: AnnotationStore;
	readonly migrated: boolean;
}

export interface AnnotationRebinding {
	readonly annotationId: string;
	readonly node: MindMapNode;
	readonly strategy: MindMapNodeLocatorMatchStrategy;
}

export interface AnnotationStoreRebindResult {
	readonly store: AnnotationStore;
	readonly rebound: readonly AnnotationRebinding[];
	readonly orphaned: readonly string[];
}

export interface AnnotationPathMigrationResult {
	readonly store: AnnotationStore;
	readonly migrated: readonly string[];
}

export interface HydratedDocumentAnnotations {
	readonly store: AnnotationStore;
	readonly presentation: MindMapPresentation;
	readonly hasPresentationOverride: boolean;
	readonly collapsedNodeIds: ReadonlySet<string>;
	readonly viewport: MindMapViewportState | null;
	readonly orphanedCount: number;
	readonly found: boolean;
}

export function createPersistentNodeRef(
	locator: MindMapNodeLocator,
): PersistentNodeRef {
	if (!isMindMapNodeLocator(locator)) {
		throw new TypeError("Persistent node references require a valid locator.");
	}
	return {
		version: PERSISTENT_NODE_REF_VERSION,
		locator: cloneLocator(locator),
	};
}

export function createAnnotationStore(
	annotations: readonly AnnotationRecord[] = [],
	documents: readonly DocumentAnnotationRecord[] = [],
): AnnotationStore {
	const store = {
		version: ANNOTATION_STORE_VERSION,
		annotations: [...annotations]
			.map(cloneAnnotation)
			.sort((left, right) => left.id.localeCompare(right.id)),
		documents: [...documents]
			.map(cloneDocumentAnnotationRecord)
			.sort((left, right) => left.path.localeCompare(right.path)),
	};
	if (!isAnnotationStore(store)) {
		throw new TypeError("Annotation store contains an invalid record.");
	}
	return store;
}

/**
 * Decode data returned by the host persistence API. Invalid content is
 * rejected as null rather than partially loaded, so corrupt data cannot
 * silently retarget another topic.
 */
export function deserializeAnnotationStore(
	value: unknown,
): AnnotationStoreLoadResult | null {
	const parsed = parseSerializedValue(value);
	if (!isRecord(parsed) || !Array.isArray(parsed.annotations)) {
		return null;
	}
	if (parsed.version === ANNOTATION_STORE_VERSION) {
		return isAnnotationStore(parsed)
			? { store: cloneStore(parsed), migrated: false }
			: null;
	}
	if (parsed.version === 4 && Array.isArray(parsed.documents)) {
		const legacy = parsed as unknown as LegacyAnnotationStoreV4;
		if (!legacy.annotations.every(isAnnotationRecord)) {
			return null;
		}
		const documents = legacy.documents.map(
			migrateLegacyDocumentAnnotationRecordV4,
		);
		if (documents.some((record) => record === null)) {
			return null;
		}
		return {
			store: createAnnotationStore(
				legacy.annotations,
				documents.filter(
					(record): record is DocumentAnnotationRecord => record !== null,
				),
			),
			migrated: true,
		};
	}
	if (parsed.version === 3 && Array.isArray(parsed.documents)) {
		const legacy = parsed as unknown as LegacyAnnotationStoreV3;
		if (!legacy.annotations.every(isAnnotationRecord)) {
			return null;
		}
		const documents = legacy.documents.map(
			migrateLegacyDocumentAnnotationRecordV3,
		);
		if (documents.some((record) => record === null)) {
			return null;
		}
		return {
			store: createAnnotationStore(
				legacy.annotations,
				documents.filter(
					(record): record is DocumentAnnotationRecord => record !== null,
				),
			),
			migrated: true,
		};
	}
	if (parsed.version === 2 && Array.isArray(parsed.documents)) {
		const legacy = parsed as unknown as LegacyAnnotationStoreV2;
		if (!legacy.annotations.every(isAnnotationRecord)) {
			return null;
		}
		const documents = legacy.documents.map(
			migrateLegacyDocumentAnnotationRecordV2,
		);
		if (documents.some((record) => record === null)) {
			return null;
		}
		return {
			store: createAnnotationStore(
				legacy.annotations,
				documents.filter(
					(record): record is DocumentAnnotationRecord => record !== null,
				),
			),
			migrated: true,
		};
	}
	if (parsed.version === 1) {
		const legacy = parsed as unknown as LegacyAnnotationStoreV1;
		if (!legacy.annotations.every(isAnnotationRecord)) {
			return null;
		}
		return {
			store: createAnnotationStore(legacy.annotations),
			migrated: true,
		};
	}
	if (parsed.version === undefined || parsed.version === 0) {
		const legacy = parsed as unknown as LegacyAnnotationStoreV0;
		if (!legacy.annotations.every(isLegacyAnnotationRecordV0)) {
			return null;
		}
		return {
			store: createAnnotationStore(
				legacy.annotations.map((annotation) => ({
					id: annotation.id,
					target: createPersistentNodeRef(annotation.locator),
					text: annotation.text,
					status: "attached",
				})),
			),
			migrated: true,
		};
	}
	return null;
}

export function serializeAnnotationStore(store: AnnotationStore): string {
	if (!isAnnotationStore(store)) {
		throw new TypeError("Cannot serialize an invalid annotation store.");
	}
	return JSON.stringify(cloneStore(store));
}

export function isAnnotationStore(value: unknown): value is AnnotationStore {
	if (
		!(
			isRecord(value) &&
			value.version === ANNOTATION_STORE_VERSION &&
			Array.isArray(value.annotations) &&
			value.annotations.every(isAnnotationRecord) &&
			Array.isArray(value.documents) &&
			value.documents.every(isDocumentAnnotationRecord)
		)
	) {
		return false;
	}
	return (
		new Set(value.annotations.map(({ id }) => id)).size ===
			value.annotations.length &&
		new Set(value.documents.map(({ path }) => path)).size ===
			value.documents.length
	);
}

/**
 * Refresh generic annotation targets for one current document. Missing or
 * ambiguous targets remain in the store and are marked orphaned.
 */
export function rebindAnnotationStore(
	store: AnnotationStore,
	document: MindMapDocument,
): AnnotationStoreRebindResult {
	requireValidStore(store);
	const rebound: AnnotationRebinding[] = [];
	const orphaned: string[] = [];
	const annotations: AnnotationRecord[] = store.annotations.map((annotation) => {
		if (annotation.target.locator.documentPath !== document.root.source.path) {
			return cloneAnnotation(annotation);
		}
		const resolution = resolveMindMapNodeLocatorDetailed(
			document,
			annotation.target.locator,
		);
		if (resolution === null) {
			orphaned.push(annotation.id);
			return { ...cloneAnnotation(annotation), status: "orphaned" as const };
		}
		rebound.push({
			annotationId: annotation.id,
			node: resolution.node,
			strategy: resolution.strategy,
		});
		return {
			...cloneAnnotation(annotation),
			target: createPersistentNodeRef(resolution.locator),
			status: "attached" as const,
		};
	});
	return {
		store: createAnnotationStore(annotations, store.documents),
		rebound,
		orphaned,
	};
}

/** Exact path migration for a host-confirmed file rename; no source is read. */
export function migrateAnnotationStorePath(
	store: AnnotationStore,
	previousPath: string,
	nextPath: string,
): AnnotationPathMigrationResult {
	requireValidStore(store);
	const previous = normalizeVaultPath(previousPath);
	const next = normalizeVaultPath(nextPath);
	const migrated: string[] = [];
	const annotations = store.annotations.map((annotation) => {
		if (annotation.target.locator.documentPath !== previous) {
			return cloneAnnotation(annotation);
		}
		migrated.push(annotation.id);
		return {
			...cloneAnnotation(annotation),
			target: migratePersistentNodeRef(annotation.target, next),
		};
	});
	const documents = store.documents.map((record) => {
		if (record.path !== previous) {
			return cloneDocumentAnnotationRecord(record);
		}
		migrated.push(`document:${previous}`);
		return migrateDocumentRecord(record, next);
	});
	return {
		store: createAnnotationStore(annotations, documents),
		migrated,
	};
}

export function getDocumentAnnotationRecord(
	store: AnnotationStore,
	path: string,
): DocumentAnnotationRecord | null {
	requireValidStore(store);
	const normalized = normalizeVaultPath(path);
	const record = store.documents.find((candidate) => candidate.path === normalized);
	return record === undefined ? null : cloneDocumentAnnotationRecord(record);
}

export function upsertDocumentAnnotationRecord(
	store: AnnotationStore,
	record: DocumentAnnotationRecord,
): AnnotationStore {
	requireValidStore(store);
	if (!isDocumentAnnotationRecord(record)) {
		throw new TypeError("Document annotation record is invalid.");
	}
	const documents = store.documents.filter(
		(candidate) => candidate.path !== record.path,
	);
	documents.push(record);
	return createAnnotationStore(store.annotations, documents);
}

export function removeDocumentAnnotationRecord(
	store: AnnotationStore,
	path: string,
): AnnotationStore {
	requireValidStore(store);
	const normalized = normalizeVaultPath(path);
	return createAnnotationStore(
		store.annotations,
		store.documents.filter((record) => record.path !== normalized),
	);
}

/**
 * Rebase one captured document state onto the latest persisted record.
 *
 * Each UI gesture declares the fields it owns, so a delayed viewport save or
 * another open mind-map tab cannot overwrite a newer presentation/collapse
 * change with an older whole-record snapshot.
 */
export function mergeDocumentAnnotationRecordFields(
	existing: DocumentAnnotationRecord | null,
	captured: DocumentAnnotationRecord,
	fields: readonly DocumentAnnotationField[],
): DocumentAnnotationRecord {
	if (existing !== null && existing.path !== captured.path) {
		throw new TypeError(
			"Document annotation records must share a path before merging.",
		);
	}
	const selected = new Set(fields);
	const base: DocumentAnnotationRecord =
		existing ??
		createEmptyDocumentAnnotationRecord(captured.path);
	return cloneDocumentAnnotationRecord({
		path: captured.path,
		layout: selected.has("layout") ? captured.layout : base.layout,
		styleId: selected.has("style") ? captured.styleId : base.styleId,
		paletteId: selected.has("palette")
			? captured.paletteId
			: base.paletteId,
		fontFamilyId: selected.has("font-family")
			? captured.fontFamilyId
			: base.fontFamilyId,
		connectorWidthId: selected.has("connector-width")
			? captured.connectorWidthId
			: base.connectorWidthId,
		connectorProfileId: selected.has("connector-profile")
			? captured.connectorProfileId
			: base.connectorProfileId,
		nodes: selected.has("nodes") ? captured.nodes : base.nodes,
		edges: selected.has("edges") ? captured.edges : base.edges,
		decorations: selected.has("decorations")
			? captured.decorations
			: base.decorations,
		collapsed: selected.has("collapsed")
			? captured.collapsed
			: base.collapsed,
		viewport: selected.has("viewport")
			? captured.viewport
			: base.viewport,
	});
}

/**
 * Select and canonicalize the presentation fields owned by an operation.
 * Callers may pass a broader persistence field list because geometry-changing
 * operations also clear the viewport; that interaction side effect must not
 * become part of presentation undo/redo.
 */
export function selectDocumentPresentationAnnotationFields(
	fields: readonly DocumentAnnotationField[],
): readonly DocumentPresentationAnnotationField[] {
	const selected = new Set(fields);
	return DOCUMENT_PRESENTATION_ANNOTATION_FIELDS.filter((field) =>
		selected.has(field),
	);
}

/**
 * Create an immutable, field-owned presentation history snapshot. The
 * explicit canonical field list is part of the snapshot contract, so restore
 * cannot accidentally begin owning a newly added annotation field later.
 */
export function createDocumentPresentationHistorySnapshot(
	path: string,
	record: DocumentAnnotationRecord | null,
	fields: readonly DocumentPresentationAnnotationField[],
): DocumentPresentationHistorySnapshot {
	return createDocumentPresentationHistorySnapshotWithTargets(
		path,
		record,
		fields,
		[],
		[],
	);
}

/**
 * Build the before/after snapshots for one committed history operation.
 * Node and edge ownership is calculated from the actual persistent records,
 * rather than trusting a whole-record snapshot to describe the user's
 * gesture. This lets an undo of topic A leave a later topic B edit intact.
 */
export function createDocumentPresentationHistoryEntrySnapshots(
	document: MindMapDocument,
	before: DocumentAnnotationRecord | null,
	after: DocumentAnnotationRecord | null,
	fields: readonly DocumentPresentationAnnotationField[],
): DocumentPresentationHistoryEntrySnapshots {
	const canonicalFields = selectDocumentPresentationAnnotationFields(fields);
	if (
		canonicalFields.length === 0 ||
		canonicalFields.length !== fields.length ||
		canonicalFields.some((field, index) => field !== fields[index])
	) {
		throw new TypeError(
			"Presentation history entries require a non-empty canonical presentation field list.",
		);
	}
	const path = normalizeVaultPath(document.root.source.path);
	const nodeTargets = canonicalFields.includes("nodes")
		? collectChangedNodePresentationHistoryTargets(document, before, after)
		: [];
	const edgeTargets = canonicalFields.includes("edges")
		? collectChangedEdgePresentationHistoryTargets(document, before, after)
		: [];
	return {
		before: createDocumentPresentationHistorySnapshotWithTargets(
			path,
			before,
			canonicalFields,
			nodeTargets,
			edgeTargets,
		),
		after: createDocumentPresentationHistorySnapshotWithTargets(
			path,
			after,
			canonicalFields,
			nodeTargets,
			edgeTargets,
		),
	};
}

function createDocumentPresentationHistorySnapshotWithTargets(
	path: string,
	record: DocumentAnnotationRecord | null,
	fields: readonly DocumentPresentationAnnotationField[],
	nodeTargets: readonly PersistentNodeRef[],
	edgeTargets: readonly PersistentPresentationHistoryEdgeTarget[],
): DocumentPresentationHistorySnapshot {
	const normalizedPath = normalizeVaultPath(path);
	const canonicalFields = selectDocumentPresentationAnnotationFields(fields);
	if (
		canonicalFields.length === 0 ||
		canonicalFields.length !== fields.length ||
		canonicalFields.some((field, index) => field !== fields[index])
	) {
		throw new TypeError(
			"Presentation history snapshots require a non-empty canonical presentation field list.",
		);
	}
	if (
		record !== null &&
		(!isDocumentAnnotationRecord(record) || record.path !== normalizedPath)
	) {
		throw new TypeError(
			"Presentation history records must be valid and match the snapshot path.",
		);
	}
	if (
		(!canonicalFields.includes("nodes") && nodeTargets.length > 0) ||
		(!canonicalFields.includes("edges") && edgeTargets.length > 0)
	) {
		throw new TypeError(
			"Presentation history targets require their corresponding annotation field.",
		);
	}
	if (
		!nodeTargets.every(isPersistentNodeRef) ||
		!edgeTargets.every(isPersistentPresentationHistoryEdgeTarget)
	) {
		throw new TypeError("Presentation history targets are invalid.");
	}
	return {
		path: normalizedPath,
		fields: [...canonicalFields],
		record: record === null ? null : cloneDocumentAnnotationRecord(record),
		nodeTargets: clonePersistentNodeRefs(nodeTargets),
		edgeTargets: clonePersistentPresentationHistoryEdgeTargets(edgeTargets),
	};
}

export function cloneDocumentPresentationHistorySnapshot(
	snapshot: DocumentPresentationHistorySnapshot,
): DocumentPresentationHistorySnapshot {
	return createDocumentPresentationHistorySnapshotWithTargets(
		snapshot.path,
		snapshot.record,
		snapshot.fields,
		snapshot.nodeTargets,
		snapshot.edgeTargets,
	);
}

/**
 * Rebase a history target onto the latest persisted document record.
 *
 * Snapshot fields are the only values restored. Every other field stays on
 * the current record, including later viewport and collapsed-branch saves.
 * Returning null removes an entirely empty record while still retaining a
 * record whenever any current interaction or unrelated presentation state is
 * present.
 */
export function restoreDocumentPresentationHistorySnapshot(
	document: MindMapDocument,
	existing: DocumentAnnotationRecord | null,
	snapshot: DocumentPresentationHistorySnapshot,
): DocumentAnnotationRecord | null {
	const target = cloneDocumentPresentationHistorySnapshot(snapshot);
	if (normalizeVaultPath(document.root.source.path) !== target.path) {
		throw new TypeError(
			"Presentation history can only restore into its source document.",
		);
	}
	if (
		existing !== null &&
		(!isDocumentAnnotationRecord(existing) || existing.path !== target.path)
	) {
		throw new TypeError(
			"Presentation history can only restore into a matching document record.",
		);
	}
	const captured =
		target.record ?? createEmptyDocumentAnnotationRecord(target.path);
	const wholeFields = target.fields.filter(
		(field) => field !== "nodes" && field !== "edges",
	);
	let merged = mergeDocumentAnnotationRecordFields(
		existing,
		captured,
		wholeFields,
	);
	if (target.fields.includes("nodes")) {
		merged = cloneDocumentAnnotationRecord({
			...merged,
			nodes: mergeDocumentPresentationHistoryNodes(
				merged.nodes,
				captured.nodes,
				target.nodeTargets,
				document,
			),
		});
	}
	if (target.fields.includes("edges")) {
		merged = cloneDocumentAnnotationRecord({
			...merged,
			edges: mergeDocumentPresentationHistoryEdges(
				merged.edges,
				captured.edges,
				target.edgeTargets,
				document,
			),
		});
	}
	return isEmptyDocumentAnnotationRecord(merged) ? null : merged;
}

/**
 * Derive the exact node and edge IDs owned by one presentation operation.
 * Unchanged overrides are deliberately omitted: a stale tab must not claim a
 * value merely because that value appeared in its old full snapshot.
 */
export function createDocumentPresentationOverrideDelta(
	previous: MindMapPresentation,
	next: MindMapPresentation,
): DocumentPresentationOverrideDelta {
	const patch = createMindMapPresentationPatch(previous, next);
	return {
		nodes: new Map(
			[...(patch.nodes ?? [])].map(([nodeId, presentation]) => [
				nodeId,
				presentation === null
					? null
					: validateMindMapNodePresentation(presentation),
			]),
		),
		edges: new Map(
			[...(patch.edges ?? [])].map(([edgeId, presentation]) => [
				edgeId,
				presentation === null
					? null
					: validateMindMapEdgePresentation(presentation),
			]),
		),
	};
}

/**
 * Apply one operation's owned node/edge delta to the latest persistent
 * document record. Entries outside the delta are retained verbatim, including
 * unresolved or temporarily unsupported annotations from another tab.
 */
export function mergeDocumentAnnotationRecordPresentationOverrideDelta(
	existing: DocumentAnnotationRecord | null,
	document: MindMapDocument,
	delta: DocumentPresentationOverrideDelta,
): DocumentAnnotationRecord {
	const path = normalizeVaultPath(document.root.source.path);
	if (existing !== null && existing.path !== path) {
		throw new TypeError(
			"Document annotation records must share a path before merging.",
		);
	}
	const base = existing ?? createEmptyDocumentAnnotationRecord(path);
	return cloneDocumentAnnotationRecord({
		...base,
		nodes: mergePersistentNodePresentationDelta(
			base.nodes,
			document,
			delta.nodes,
		),
		edges: mergePersistentEdgePresentationDelta(
			base.edges,
			document,
			delta.edges,
		),
	});
}

/**
 * Rebind every durable document selection that names a deleted custom
 * appearance. The reusable library decides the explicit fallback ID; this
 * annotation boundary applies it without touching Markdown or unrelated
 * document fields.
 */
export function replaceDocumentAnnotationAppearanceReferences(
	store: AnnotationStore,
	replacement: DocumentAppearanceReferenceReplacement,
): AnnotationStore {
	requireValidStore(store);
	if (
		!isSafePresentationIdentifier(replacement.removedId) ||
		!isSafePresentationIdentifier(replacement.fallbackId) ||
		replacement.removedId === replacement.fallbackId
	) {
		throw new TypeError("Document appearance replacement IDs are invalid.");
	}
	const field = replacement.kind === "style" ? "styleId" : "paletteId";
	return createAnnotationStore(
		store.annotations,
		store.documents.map((record) =>
			record[field] === replacement.removedId
				? cloneDocumentAnnotationRecord({
						...record,
						[field]: replacement.fallbackId,
					})
				: cloneDocumentAnnotationRecord(record),
		),
	);
}

export function applyCollapsedNodeIdDelta(
	current: ReadonlySet<string>,
	previous: ReadonlySet<string>,
	next: ReadonlySet<string>,
): ReadonlySet<string> {
	const rebased = new Set(current);
	for (const nodeId of previous) {
		if (!next.has(nodeId)) {
			rebased.delete(nodeId);
		}
	}
	for (const nodeId of next) {
		if (!previous.has(nodeId)) {
			rebased.add(nodeId);
		}
	}
	return rebased;
}

/**
 * Resolve one document record into current runtime IDs. Any target that cannot
 * be selected uniquely remains in the returned store with `orphaned` status.
 * Unsupported registered capabilities are preserved but not rendered.
 */
export function hydrateDocumentAnnotations(
	store: AnnotationStore,
	document: MindMapDocument,
	basePresentation: MindMapPresentation,
	capabilities: MindMapFrontendCapabilities,
): HydratedDocumentAnnotations {
	requireValidStore(store);
	const path = normalizeVaultPath(document.root.source.path);
	const record = store.documents.find((candidate) => candidate.path === path);
	if (record === undefined) {
		return {
			store: cloneStore(store),
			presentation: basePresentation,
			hasPresentationOverride: false,
			collapsedNodeIds: new Set(),
			viewport: null,
			orphanedCount: 0,
			found: false,
		};
	}

	let orphanedCount = 0;
	const nodeIds = collectNodeIds(document.root);
	const edgeIds = collectEdgeIds(document.root);
	const nodeChanges = new Map<string, MindMapNodePresentation | null>();
	const reboundNodes = record.nodes.map((entry) => {
		const resolution = resolvePersistentNodeRef(document, entry.target);
		if (resolution === null) {
			orphanedCount += 1;
			return { ...cloneNodeEntry(entry), status: "orphaned" as const };
		}
		nodeChanges.set(resolution.node.id, entry.presentation);
		return {
			...cloneNodeEntry(entry),
			target: createPersistentNodeRef(resolution.locator),
			status: "attached" as const,
		};
	});

	const edgeChanges = new Map<string, MindMapEdgePresentation | null>();
	const reboundEdges = record.edges.map((entry) => {
		const from = resolvePersistentNodeRef(document, entry.from);
		const to = resolvePersistentNodeRef(document, entry.to);
		const expectedParent =
			from === null || to === null
				? false
				: from.node.children.some((child) => child.id === to.node.id);
		if (from === null || to === null || !expectedParent) {
			orphanedCount += 1;
			return { ...cloneEdgeEntry(entry), status: "orphaned" as const };
		}
		edgeChanges.set(
			createLayoutEdgeId(from.node.id, to.node.id),
			entry.presentation,
		);
		return {
			...cloneEdgeEntry(entry),
			from: createPersistentNodeRef(from.locator),
			to: createPersistentNodeRef(to.locator),
			status: "attached" as const,
		};
	});

	const runtimeDecorations: MindMapDecoration[] = [];
	const reboundDecorations = record.decorations.map((entry) => {
		const rebound = hydrateDecoration(entry, document);
		if (rebound === null) {
			orphanedCount += 1;
			return { ...cloneDecoration(entry), status: "orphaned" as const };
		}
		if (
			capabilities.renderedDecorations.includes(rebound.runtime.kind)
		) {
			runtimeDecorations.push(rebound.runtime);
		}
		return rebound.persistent;
	});

	const collapsedNodeIds = new Set<string>();
	const reboundCollapsed = record.collapsed.map((entry) => {
		const resolution = resolvePersistentNodeRef(document, entry.target);
		if (resolution === null || resolution.node.children.length === 0) {
			orphanedCount += 1;
			return {
				target: createPersistentNodeRef(entry.target.locator),
				status: "orphaned" as const,
			};
		}
		collapsedNodeIds.add(resolution.node.id);
		return {
			target: createPersistentNodeRef(resolution.locator),
			status: "attached" as const,
		};
	});

	const refreshedRecord: DocumentAnnotationRecord = {
		...cloneDocumentAnnotationRecord(record),
		nodes: reboundNodes,
		edges: reboundEdges,
		decorations: reboundDecorations,
		collapsed: reboundCollapsed,
	};
	const refreshedStore = upsertDocumentAnnotationRecord(store, refreshedRecord);
	let presentation = basePresentation;
	let patch: MindMapPresentationPatch = {};

	if (
		record.layout !== null &&
		capabilities.layouts.some(
			(layout) =>
				layout.engineId === record.layout?.engineId &&
				layout.orientations.includes(record.layout.orientation),
		)
	) {
		patch = {
			...patch,
			layout: {
				revision: nextRevision(basePresentation.layout.revision),
				engineId: record.layout.engineId,
				orientation: record.layout.orientation,
				spacing: { ...record.layout.spacing },
				options: { ...record.layout.options },
			},
		};
	}
	if (
		record.styleId !== null &&
		capabilities.styles.some((style) => style.id === record.styleId)
	) {
		patch = { ...patch, styleId: record.styleId };
	}
	if (
		record.paletteId !== null &&
		capabilities.palettes.some(
			(palette) => palette.id === record.paletteId,
		)
	) {
		patch = { ...patch, paletteId: record.paletteId };
	}
	if (
		record.fontFamilyId !== null &&
		capabilities.globalFonts.some(
			(font) => font.id === record.fontFamilyId,
		)
	) {
		patch = { ...patch, fontFamilyId: record.fontFamilyId };
	}
	if (
		record.connectorWidthId !== null &&
		capabilities.connectorWidths.some(
			(width) => width.id === record.connectorWidthId,
		)
	) {
		patch = {
			...patch,
			connectorWidthId: record.connectorWidthId,
		};
	}
	if (
		record.connectorProfileId !== null &&
		capabilities.connectorProfiles.some(
			(profile) => profile.id === record.connectorProfileId,
		)
	) {
		patch = {
			...patch,
			connectorProfileId: record.connectorProfileId,
		};
	}
	if (nodeChanges.size > 0) {
		patch = { ...patch, nodes: nodeChanges };
	}
	if (edgeChanges.size > 0) {
		patch = { ...patch, edges: edgeChanges };
	}
	if (runtimeDecorations.length > 0) {
		patch = { ...patch, decorations: runtimeDecorations };
	}
	let hasPresentationOverride = false;
	const applyHydratedPatch = (candidate: MindMapPresentationPatch): void => {
		try {
			presentation = applyMindMapPresentationPatch(presentation, candidate, {
				capabilities,
				nodeIds,
				edgeIds,
			});
			hasPresentationOverride = true;
		} catch {
			// Keep unrelated compatible axes. The durable record remains intact so
			// a temporarily unavailable extension can recover in a later session.
		}
	};
	for (const candidate of splitHydrationPatch(patch)) {
		applyHydratedPatch(candidate);
	}

	return {
		store: refreshedStore,
		presentation,
		hasPresentationOverride,
		collapsedNodeIds,
		viewport: record.viewport === null ? null : { ...record.viewport },
		orphanedCount,
		found: true,
	};
}

/**
 * Hydration is intentionally field-granular. A removed custom effect, shape,
 * route, or option must not discard unrelated valid layout/color/formatting
 * choices from the same durable document record.
 */
function splitHydrationPatch(
	patch: MindMapPresentationPatch,
): readonly MindMapPresentationPatch[] {
	const patches: MindMapPresentationPatch[] = [];
	for (const key of [
		"layout",
		"styleId",
		"paletteId",
		"fontFamilyId",
		"connectorWidthId",
		"connectorProfileId",
	] as const) {
		const value = patch[key];
		if (value !== undefined) {
			patches.push({ [key]: value });
		}
	}
	for (const [nodeId, presentation] of patch.nodes ?? []) {
		patches.push({ nodes: new Map([[nodeId, presentation]]) });
	}
	for (const [edgeId, presentation] of patch.edges ?? []) {
		patches.push({ edges: new Map([[edgeId, presentation]]) });
	}
	if (patch.decorations !== undefined) {
		patches.push({ decorations: patch.decorations });
	}
	return patches;
}

/**
 * Capture the current visual state as JSON-safe metadata-free references.
 * Existing orphan records are retained so an unrelated UI change cannot erase
 * an annotation that may become resolvable after a later source edit.
 */
export function captureDocumentAnnotations(
	document: MindMapDocument,
	basePresentation: MindMapPresentation,
	presentation: MindMapPresentation,
	collapsedNodeIds: ReadonlySet<string>,
	viewport: MindMapViewportState | null,
	existing: DocumentAnnotationRecord | null = null,
): DocumentAnnotationRecord {
	const path = normalizeVaultPath(document.root.source.path);
	const nodes: PersistentNodePresentationAnnotation[] = [];
	for (const [nodeId, nodePresentation] of presentation.nodes) {
		const locator = createMindMapNodeLocator(document, nodeId);
		if (locator !== null) {
			nodes.push({
				target: createPersistentNodeRef(locator),
				status: "attached",
				presentation: validateMindMapNodePresentation(nodePresentation),
			});
		}
	}
	nodes.push(
		...(existing?.nodes ?? [])
			.filter((entry) => entry.status === "orphaned")
			.map(cloneNodeEntry),
	);

	const edgeIndex = collectEdgeIndex(document.root);
	const edges: PersistentEdgePresentationAnnotation[] = [];
	for (const [edgeId, edgePresentation] of presentation.edges) {
		const endpoints = edgeIndex.get(edgeId);
		if (endpoints === undefined) {
			continue;
		}
		const from = createMindMapNodeLocator(document, endpoints.fromId);
		const to = createMindMapNodeLocator(document, endpoints.toId);
		if (from !== null && to !== null) {
			edges.push({
				from: createPersistentNodeRef(from),
				to: createPersistentNodeRef(to),
				status: "attached",
				presentation: validateMindMapEdgePresentation(edgePresentation),
			});
		}
	}
	edges.push(
		...(existing?.edges ?? [])
			.filter((entry) => entry.status === "orphaned")
			.map(cloneEdgeEntry),
	);

	const decorations = presentation.decorations
		.map((decoration) => persistDecoration(decoration, document))
		.filter(
			(
				decoration,
			): decoration is PersistentDecorationAnnotation =>
				decoration !== null,
		);
	decorations.push(
		...(existing?.decorations ?? [])
			.filter((entry) => entry.status === "orphaned")
			.map(cloneDecoration),
	);

	const collapsed: PersistentCollapsedNodeAnnotation[] = [];
	for (const nodeId of collapsedNodeIds) {
		const locator = createMindMapNodeLocator(document, nodeId);
		if (locator !== null) {
			collapsed.push({
				target: createPersistentNodeRef(locator),
				status: "attached",
			});
		}
	}
	collapsed.push(
		...(existing?.collapsed ?? [])
			.filter((entry) => entry.status === "orphaned")
			.map(cloneCollapsedEntry),
	);

	const layout =
		layoutAnnotationEqualsPresentation(
			basePresentation.layout,
			presentation.layout,
		)
			? null
			: {
					engineId: presentation.layout.engineId,
					orientation: presentation.layout.orientation,
					spacing: { ...presentation.layout.spacing },
					options: clonePrimitiveOptions(presentation.layout.options),
				};
	const styleId =
		basePresentation.theme.styleId === presentation.theme.styleId
			? null
			: presentation.theme.styleId;
	const paletteId =
		basePresentation.theme.paletteId === presentation.theme.paletteId
			? null
			: presentation.theme.paletteId;
	const fontFamilyId =
		basePresentation.formatting.fontFamily.id ===
		presentation.formatting.fontFamily.id
			? null
			: presentation.formatting.fontFamily.id;
	const connectorWidthId =
		basePresentation.formatting.connectorWidth.id ===
		presentation.formatting.connectorWidth.id
			? null
			: presentation.formatting.connectorWidth.id;
	const connectorProfileId =
		basePresentation.formatting.connectorProfile.id ===
		presentation.formatting.connectorProfile.id
			? null
			: presentation.formatting.connectorProfile.id;

	return cloneDocumentAnnotationRecord({
		path,
		layout,
		styleId,
		paletteId,
		fontFamilyId,
		connectorWidthId,
		connectorProfileId,
		nodes,
		edges,
		decorations,
		collapsed,
		viewport: viewport === null ? null : validateViewport(viewport),
	});
}

export function cloneDocumentAnnotationRecord(
	record: DocumentAnnotationRecord,
): DocumentAnnotationRecord {
	return {
		path: record.path,
		layout:
			record.layout === null
				? null
				: {
						engineId: record.layout.engineId,
						orientation: record.layout.orientation,
						spacing: { ...record.layout.spacing },
						options: { ...record.layout.options },
					},
		styleId: record.styleId,
		paletteId: record.paletteId,
		fontFamilyId: record.fontFamilyId,
		connectorWidthId: record.connectorWidthId,
		connectorProfileId: record.connectorProfileId,
		nodes: record.nodes.map(cloneNodeEntry),
		edges: record.edges.map(cloneEdgeEntry),
		decorations: record.decorations.map(cloneDecoration),
		collapsed: record.collapsed.map(cloneCollapsedEntry),
		viewport: record.viewport === null ? null : { ...record.viewport },
	};
}

function createEmptyDocumentAnnotationRecord(
	path: string,
): DocumentAnnotationRecord {
	return {
		path,
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
	};
}

function isEmptyDocumentAnnotationRecord(
	record: DocumentAnnotationRecord,
): boolean {
	return (
		record.layout === null &&
		record.styleId === null &&
		record.paletteId === null &&
		record.fontFamilyId === null &&
		record.connectorWidthId === null &&
		record.connectorProfileId === null &&
		record.nodes.length === 0 &&
		record.edges.length === 0 &&
		record.decorations.length === 0 &&
		record.collapsed.length === 0 &&
		record.viewport === null
	);
}

function isPersistentPresentationHistoryEdgeTarget(
	value: unknown,
): value is PersistentPresentationHistoryEdgeTarget {
	return (
		isRecord(value) &&
		isPersistentNodeRef(value.from) &&
		isPersistentNodeRef(value.to)
	);
}

function clonePersistentNodeRefs(
	refs: readonly PersistentNodeRef[],
): readonly PersistentNodeRef[] {
	const unique = new Map<string, PersistentNodeRef>();
	for (const ref of refs) {
		const clone = createPersistentNodeRef(ref.locator);
		unique.set(persistentNodeRefHistoryKey(clone), clone);
	}
	return [...unique.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([, ref]) => ref);
}

function clonePersistentPresentationHistoryEdgeTargets(
	targets: readonly PersistentPresentationHistoryEdgeTarget[],
): readonly PersistentPresentationHistoryEdgeTarget[] {
	const unique = new Map<string, PersistentPresentationHistoryEdgeTarget>();
	for (const target of targets) {
		const clone = {
			from: createPersistentNodeRef(target.from.locator),
			to: createPersistentNodeRef(target.to.locator),
		};
		unique.set(
			`${persistentNodeRefHistoryKey(clone.from)}>${persistentNodeRefHistoryKey(clone.to)}`,
			clone,
		);
	}
	return [...unique.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([, target]) => target);
}

function persistentNodeRefHistoryKey(ref: PersistentNodeRef): string {
	return JSON.stringify(ref.locator);
}

function collectChangedNodePresentationHistoryTargets(
	document: MindMapDocument,
	before: DocumentAnnotationRecord | null,
	after: DocumentAnnotationRecord | null,
): readonly PersistentNodeRef[] {
	const beforeById = indexPersistentNodePresentationEntries(
		document,
		before?.nodes ?? [],
	);
	const afterById = indexPersistentNodePresentationEntries(
		document,
		after?.nodes ?? [],
	);
	const targets: PersistentNodeRef[] = [];
	for (const nodeId of new Set([...beforeById.keys(), ...afterById.keys()])) {
		const previous = beforeById.get(nodeId);
		const next = afterById.get(nodeId);
		if (
			previous === null ||
			next === null ||
			persistentNodePresentationEntriesEqual(previous, next)
		) {
			continue;
		}
		const changed = next ?? previous;
		if (changed !== undefined) {
			targets.push(changed.target);
		}
	}
	return clonePersistentNodeRefs(targets);
}

function collectChangedEdgePresentationHistoryTargets(
	document: MindMapDocument,
	before: DocumentAnnotationRecord | null,
	after: DocumentAnnotationRecord | null,
): readonly PersistentPresentationHistoryEdgeTarget[] {
	const beforeById = indexPersistentEdgePresentationEntries(
		document,
		before?.edges ?? [],
	);
	const afterById = indexPersistentEdgePresentationEntries(
		document,
		after?.edges ?? [],
	);
	const targets: PersistentPresentationHistoryEdgeTarget[] = [];
	for (const edgeId of new Set([...beforeById.keys(), ...afterById.keys()])) {
		const previous = beforeById.get(edgeId);
		const next = afterById.get(edgeId);
		if (
			previous === null ||
			next === null ||
			persistentEdgePresentationEntriesEqual(previous, next)
		) {
			continue;
		}
		const changed = next ?? previous;
		if (changed !== undefined) {
			targets.push({ from: changed.from, to: changed.to });
		}
	}
	return clonePersistentPresentationHistoryEdgeTargets(targets);
}

function indexPersistentNodePresentationEntries(
	document: MindMapDocument,
	entries: readonly PersistentNodePresentationAnnotation[],
): ReadonlyMap<string, PersistentNodePresentationAnnotation | null> {
	const byId = new Map<string, PersistentNodePresentationAnnotation | null>();
	for (const entry of entries) {
		const resolution = resolvePersistentNodeRef(document, entry.target);
		if (resolution === null) {
			continue;
		}
		const nodeId = resolution.node.id;
		if (byId.has(nodeId)) {
			byId.set(nodeId, null);
		} else {
			byId.set(nodeId, entry);
		}
	}
	return byId;
}

function indexPersistentEdgePresentationEntries(
	document: MindMapDocument,
	entries: readonly PersistentEdgePresentationAnnotation[],
): ReadonlyMap<string, PersistentEdgePresentationAnnotation | null> {
	const byId = new Map<string, PersistentEdgePresentationAnnotation | null>();
	for (const entry of entries) {
		const edge = resolvePersistentPresentationHistoryEdgeTarget(document, entry);
		if (edge === null) {
			continue;
		}
		if (byId.has(edge.id)) {
			byId.set(edge.id, null);
		} else {
			byId.set(edge.id, entry);
		}
	}
	return byId;
}

function persistentNodePresentationEntriesEqual(
	left: PersistentNodePresentationAnnotation | null | undefined,
	right: PersistentNodePresentationAnnotation | null | undefined,
): boolean {
	if (left === right) {
		return true;
	}
	return (
		left !== undefined &&
		left !== null &&
		right !== undefined &&
		right !== null &&
		left.status === right.status &&
		JSON.stringify(left.presentation) === JSON.stringify(right.presentation)
	);
}

function persistentEdgePresentationEntriesEqual(
	left: PersistentEdgePresentationAnnotation | null | undefined,
	right: PersistentEdgePresentationAnnotation | null | undefined,
): boolean {
	if (left === right) {
		return true;
	}
	return (
		left !== undefined &&
		left !== null &&
		right !== undefined &&
		right !== null &&
		left.status === right.status &&
		JSON.stringify(left.presentation) === JSON.stringify(right.presentation)
	);
}

function mergeDocumentPresentationHistoryNodes(
	existing: readonly PersistentNodePresentationAnnotation[],
	captured: readonly PersistentNodePresentationAnnotation[],
	targets: readonly PersistentNodeRef[],
	document: MindMapDocument,
): readonly PersistentNodePresentationAnnotation[] {
	const targetIds = resolvePersistentPresentationHistoryNodeTargetIds(
		document,
		targets,
	);
	if (targetIds.size === 0) {
		return existing.map(cloneNodeEntry);
	}
	const desiredById = indexPersistentNodePresentationEntries(
		document,
		captured,
	);
	let merged = existing.map(cloneNodeEntry);
	for (const nodeId of targetIds) {
		const desired = desiredById.get(nodeId);
		if (desired === null) {
			// A malformed or ambiguous history record cannot safely own this
			// current topic, so preserve the latest persisted value untouched.
			continue;
		}
		merged = merged.filter(
			(entry) => !persistentNodeEntryMatchesRuntimeId(entry, document, nodeId),
		);
		if (desired !== undefined) {
			const rebound = rebindNodePresentationHistoryEntry(
				document,
				desired,
				nodeId,
			);
			if (rebound !== null) {
				merged.push(rebound);
			}
		}
	}
	return merged;
}

function mergeDocumentPresentationHistoryEdges(
	existing: readonly PersistentEdgePresentationAnnotation[],
	captured: readonly PersistentEdgePresentationAnnotation[],
	targets: readonly PersistentPresentationHistoryEdgeTarget[],
	document: MindMapDocument,
): readonly PersistentEdgePresentationAnnotation[] {
	const targetIds = resolvePersistentPresentationHistoryEdgeTargetIds(
		document,
		targets,
	);
	if (targetIds.size === 0) {
		return existing.map(cloneEdgeEntry);
	}
	const desiredById = indexPersistentEdgePresentationEntries(
		document,
		captured,
	);
	let merged = existing.map(cloneEdgeEntry);
	for (const edgeId of targetIds) {
		const desired = desiredById.get(edgeId);
		if (desired === null) {
			continue;
		}
		merged = merged.filter(
			(entry) => !persistentEdgeEntryMatchesRuntimeId(entry, document, edgeId),
		);
		if (desired !== undefined) {
			const rebound = rebindEdgePresentationHistoryEntry(
				document,
				desired,
				edgeId,
			);
			if (rebound !== null) {
				merged.push(rebound);
			}
		}
	}
	return merged;
}

function resolvePersistentPresentationHistoryNodeTargetIds(
	document: MindMapDocument,
	targets: readonly PersistentNodeRef[],
): ReadonlySet<string> {
	const ids = new Set<string>();
	for (const target of targets) {
		const resolution = resolvePersistentNodeRef(document, target);
		if (resolution !== null) {
			ids.add(resolution.node.id);
		}
	}
	return ids;
}

function resolvePersistentPresentationHistoryEdgeTargetIds(
	document: MindMapDocument,
	targets: readonly PersistentPresentationHistoryEdgeTarget[],
): ReadonlySet<string> {
	const ids = new Set<string>();
	for (const target of targets) {
		const edge = resolvePersistentPresentationHistoryEdgeTarget(document, target);
		if (edge !== null) {
			ids.add(edge.id);
		}
	}
	return ids;
}

function resolvePersistentPresentationHistoryEdgeTarget(
	document: MindMapDocument,
	target: Pick<PersistentEdgePresentationAnnotation, "from" | "to">,
): {
	readonly id: string;
	readonly from: Exclude<ReturnType<typeof resolvePersistentNodeRef>, null>;
	readonly to: Exclude<ReturnType<typeof resolvePersistentNodeRef>, null>;
} | null {
	const from = resolvePersistentNodeRef(document, target.from);
	const to = resolvePersistentNodeRef(document, target.to);
	if (
		from === null ||
		to === null ||
		!from.node.children.some((child) => child.id === to.node.id)
	) {
		return null;
	}
	return {
		id: createLayoutEdgeId(from.node.id, to.node.id),
		from,
		to,
	};
}

function rebindNodePresentationHistoryEntry(
	document: MindMapDocument,
	entry: PersistentNodePresentationAnnotation,
	expectedNodeId: string,
): PersistentNodePresentationAnnotation | null {
	const resolution = resolvePersistentNodeRef(document, entry.target);
	if (resolution === null || resolution.node.id !== expectedNodeId) {
		return null;
	}
	return {
		...cloneNodeEntry(entry),
		target: createPersistentNodeRef(resolution.locator),
		status: "attached",
	};
}

function rebindEdgePresentationHistoryEntry(
	document: MindMapDocument,
	entry: PersistentEdgePresentationAnnotation,
	expectedEdgeId: string,
): PersistentEdgePresentationAnnotation | null {
	const resolved = resolvePersistentPresentationHistoryEdgeTarget(document, entry);
	if (resolved === null || resolved.id !== expectedEdgeId) {
		return null;
	}
	return {
		...cloneEdgeEntry(entry),
		from: createPersistentNodeRef(resolved.from.locator),
		to: createPersistentNodeRef(resolved.to.locator),
		status: "attached",
	};
}

function mergePersistentNodePresentationDelta(
	existing: readonly PersistentNodePresentationAnnotation[],
	document: MindMapDocument,
	delta: ReadonlyMap<string, MindMapNodePresentation | null>,
): readonly PersistentNodePresentationAnnotation[] {
	let entries = existing.map(cloneNodeEntry);
	for (const [nodeId, presentation] of delta) {
		if (presentation === null) {
			entries = entries.filter(
				(entry) => !persistentNodeEntryMatchesRuntimeId(entry, document, nodeId),
			);
			continue;
		}
		const locator = createMindMapNodeLocator(document, nodeId);
		if (locator === null) {
			// The parsed document changed while this tab held its snapshot. Do not
			// attach the stale override to a different node or discard a record
			// that can no longer be proven to be the same target.
			continue;
		}
		entries = entries.filter(
			(entry) => !persistentNodeEntryMatchesRuntimeId(entry, document, nodeId),
		);
		entries.push({
			target: createPersistentNodeRef(locator),
			status: "attached",
			presentation: validateMindMapNodePresentation(presentation),
		});
	}
	return entries;
}

function mergePersistentEdgePresentationDelta(
	existing: readonly PersistentEdgePresentationAnnotation[],
	document: MindMapDocument,
	delta: ReadonlyMap<string, MindMapEdgePresentation | null>,
): readonly PersistentEdgePresentationAnnotation[] {
	let entries = existing.map(cloneEdgeEntry);
	const edgeIndex = collectEdgeIndex(document.root);
	for (const [edgeId, presentation] of delta) {
		if (presentation === null) {
			entries = entries.filter(
				(entry) => !persistentEdgeEntryMatchesRuntimeId(entry, document, edgeId),
			);
			continue;
		}
		const endpoints = edgeIndex.get(edgeId);
		if (endpoints === undefined) {
			// As with node entries, a stale runtime ID is never rebound by guess.
			continue;
		}
		const from = createMindMapNodeLocator(document, endpoints.fromId);
		const to = createMindMapNodeLocator(document, endpoints.toId);
		if (from === null || to === null) {
			continue;
		}
		entries = entries.filter(
			(entry) => !persistentEdgeEntryMatchesRuntimeId(entry, document, edgeId),
		);
		entries.push({
			from: createPersistentNodeRef(from),
			to: createPersistentNodeRef(to),
			status: "attached",
			presentation: validateMindMapEdgePresentation(presentation),
		});
	}
	return entries;
}

function persistentNodeEntryMatchesRuntimeId(
	entry: PersistentNodePresentationAnnotation,
	document: MindMapDocument,
	nodeId: string,
): boolean {
	return resolvePersistentNodeRef(document, entry.target)?.node.id === nodeId;
}

function persistentEdgeEntryMatchesRuntimeId(
	entry: PersistentEdgePresentationAnnotation,
	document: MindMapDocument,
	edgeId: string,
): boolean {
	const from = resolvePersistentNodeRef(document, entry.from);
	const to = resolvePersistentNodeRef(document, entry.to);
	return (
		from !== null &&
		to !== null &&
		from.node.children.some((child) => child.id === to.node.id) &&
		createLayoutEdgeId(from.node.id, to.node.id) === edgeId
	);
}

function isAnnotationRecord(value: unknown): value is AnnotationRecord {
	if (!isRecord(value) || !isPersistentNodeRef(value.target)) {
		return false;
	}
	return (
		typeof value.id === "string" &&
		value.id.length > 0 &&
		typeof value.text === "string" &&
		(value.status === "attached" || value.status === "orphaned")
	);
}

function migrateLegacyDocumentAnnotationRecordV4(
	value: unknown,
): DocumentAnnotationRecord | null {
	if (!isRecord(value)) {
		return null;
	}
	const candidate: unknown = {
		path: value.path,
		layout: value.layout,
		styleId: value.styleId,
		paletteId: value.paletteId,
		fontFamilyId: value.fontFamilyId,
		connectorWidthId: value.connectorWidthId,
		connectorProfileId: null,
		nodes: value.nodes,
		edges: value.edges,
		decorations: value.decorations,
		collapsed: value.collapsed,
		viewport: value.viewport,
	};
	return isDocumentAnnotationRecord(candidate)
		? cloneDocumentAnnotationRecord(candidate)
		: null;
}

function migrateLegacyDocumentAnnotationRecordV3(
	value: unknown,
): DocumentAnnotationRecord | null {
	if (!isRecord(value)) {
		return null;
	}
	const candidate: unknown = {
		path: value.path,
		layout: value.layout,
		styleId: value.styleId,
		paletteId: value.paletteId,
		fontFamilyId: null,
		connectorWidthId: null,
		connectorProfileId: null,
		nodes: value.nodes,
		edges: value.edges,
		decorations: value.decorations,
		collapsed: value.collapsed,
		viewport: value.viewport,
	};
	return isDocumentAnnotationRecord(candidate)
		? cloneDocumentAnnotationRecord(candidate)
		: null;
}

function migrateLegacyDocumentAnnotationRecordV2(
	value: unknown,
): DocumentAnnotationRecord | null {
	if (!isRecord(value)) {
		return null;
	}
	const themeId = value.themeId;
	if (
		!(themeId === null ||
			(typeof themeId === "string" &&
				isSafePresentationIdentifier(themeId)))
	) {
		return null;
	}
	const migratedSelection =
		themeId === null ? null : migrateLegacyMindMapThemeId(themeId);
	const candidate: unknown = {
		path: value.path,
		layout: value.layout,
		styleId: migratedSelection?.styleId ?? null,
		paletteId: migratedSelection?.paletteId ?? null,
		fontFamilyId: null,
		connectorWidthId: null,
		connectorProfileId: null,
		nodes: value.nodes,
		edges: value.edges,
		decorations: value.decorations,
		collapsed: value.collapsed,
		viewport: value.viewport,
	};
	return isDocumentAnnotationRecord(candidate)
		? cloneDocumentAnnotationRecord(candidate)
		: null;
}

function isDocumentAnnotationRecord(
	value: unknown,
): value is DocumentAnnotationRecord {
	if (!isRecord(value)) {
		return false;
	}
	try {
		if (
			typeof value.path !== "string" ||
			normalizeVaultPath(value.path) !== value.path ||
			!(
				value.layout === null ||
				isPersistentLayoutAnnotation(value.layout)
			) ||
			!(
				value.styleId === null ||
				(typeof value.styleId === "string" &&
					isSafePresentationIdentifier(value.styleId))
			) ||
			!(
				value.paletteId === null ||
				(typeof value.paletteId === "string" &&
					isSafePresentationIdentifier(value.paletteId))
			) ||
			!(
				value.fontFamilyId === null ||
				(typeof value.fontFamilyId === "string" &&
					isSafePresentationIdentifier(value.fontFamilyId))
			) ||
			!(
				value.connectorWidthId === null ||
				(typeof value.connectorWidthId === "string" &&
					isSafePresentationIdentifier(value.connectorWidthId))
			) ||
			!(
				value.connectorProfileId === null ||
				(typeof value.connectorProfileId === "string" &&
					isSafePresentationIdentifier(value.connectorProfileId))
			) ||
			!Array.isArray(value.nodes) ||
			!value.nodes.every(isPersistentNodeEntry) ||
			!Array.isArray(value.edges) ||
			!value.edges.every(isPersistentEdgeEntry) ||
			!Array.isArray(value.decorations) ||
			!value.decorations.every(isPersistentDecoration) ||
			!Array.isArray(value.collapsed) ||
			!value.collapsed.every(isPersistentCollapsedEntry) ||
			!(
				value.viewport === null ||
				isValidViewport(value.viewport)
			)
		) {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

function isPersistentLayoutAnnotation(
	value: unknown,
): value is PersistentLayoutAnnotation {
	if (!isRecord(value) || !isRecord(value.spacing) || !isRecord(value.options)) {
		return false;
	}
	const spacing = value.spacing;
	const options = value.options;
	return (
		typeof value.engineId === "string" &&
		isSafePresentationIdentifier(value.engineId) &&
		[
			"left-to-right",
			"right-to-left",
			"top-to-bottom",
			"bottom-to-top",
		].includes(String(value.orientation)) &&
		["level", "sibling", "subtree"].every((key) =>
			isSafeFiniteNumber(spacing[key]),
		) &&
		Object.entries(options).every(
			([key, option]) =>
				isSafePresentationIdentifier(key) &&
				(typeof option === "string" ||
					typeof option === "boolean" ||
					isSafeFiniteNumber(option)),
		)
	);
}

function isPersistentNodeEntry(
	value: unknown,
): value is PersistentNodePresentationAnnotation {
	if (!isRecord(value) || !isPersistentNodeRef(value.target)) {
		return false;
	}
	try {
		validateMindMapNodePresentation(value.presentation);
		return isStatus(value.status);
	} catch {
		return false;
	}
}

function isPersistentEdgeEntry(
	value: unknown,
): value is PersistentEdgePresentationAnnotation {
	if (
		!isRecord(value) ||
		!isPersistentNodeRef(value.from) ||
		!isPersistentNodeRef(value.to)
	) {
		return false;
	}
	try {
		validateMindMapEdgePresentation(value.presentation);
		return isStatus(value.status);
	} catch {
		return false;
	}
}

function isPersistentCollapsedEntry(
	value: unknown,
): value is PersistentCollapsedNodeAnnotation {
	return (
		isRecord(value) &&
		isPersistentNodeRef(value.target) &&
		isStatus(value.status)
	);
}

function isPersistentDecoration(
	value: unknown,
): value is PersistentDecorationAnnotation {
	if (
		!isRecord(value) ||
		typeof value.id !== "string" ||
		!isSafePresentationIdentifier(value.id) ||
		!isStatus(value.status) ||
		!(
			value.variant === undefined ||
			(typeof value.variant === "string" &&
				isSafePresentationIdentifier(value.variant))
		)
	) {
		return false;
	}
	switch (value.kind) {
		case "marker":
			return (
				isPersistentNodeRef(value.target) &&
				typeof value.markerId === "string" &&
				isSafePresentationIdentifier(value.markerId) &&
				isOptionalText(value.label)
			);
		case "boundary":
			return (
				Array.isArray(value.targets) &&
				value.targets.length > 0 &&
				value.targets.every(isPersistentNodeRef) &&
				isOptionalText(value.label)
			);
		case "summary":
			return (
				Array.isArray(value.targets) &&
				value.targets.length > 0 &&
				value.targets.every(isPersistentNodeRef) &&
				typeof value.text === "string"
			);
		case "relationship":
			return (
				isPersistentNodeRef(value.from) &&
				isPersistentNodeRef(value.to) &&
				isOptionalText(value.label)
			);
		default:
			return false;
	}
}

function isPersistentNodeRef(value: unknown): value is PersistentNodeRef {
	return (
		isRecord(value) &&
		value.version === PERSISTENT_NODE_REF_VERSION &&
		isMindMapNodeLocator(value.locator)
	);
}

function isLegacyAnnotationRecordV0(
	value: unknown,
): value is LegacyAnnotationRecordV0 {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		value.id.length > 0 &&
		typeof value.text === "string" &&
		isMindMapNodeLocator(value.locator)
	);
}

function resolvePersistentNodeRef(
	document: MindMapDocument,
	ref: PersistentNodeRef,
) {
	return resolveMindMapNodeLocatorDetailed(document, ref.locator);
}

function hydrateDecoration(
	entry: PersistentDecorationAnnotation,
	document: MindMapDocument,
): {
	readonly persistent: PersistentDecorationAnnotation;
	readonly runtime: MindMapDecoration;
} | null {
	switch (entry.kind) {
		case "marker": {
			const target = resolvePersistentNodeRef(document, entry.target);
			if (target === null) {
				return null;
			}
			return {
				persistent: {
					...entry,
					target: createPersistentNodeRef(target.locator),
					status: "attached",
				},
				runtime: compactObject({
					id: entry.id,
					kind: entry.kind,
					nodeId: target.node.id,
					markerId: entry.markerId,
					label: entry.label,
					variant: entry.variant,
				}),
			};
		}
		case "boundary":
		case "summary": {
			const targets = entry.targets.map((target) =>
				resolvePersistentNodeRef(document, target),
			);
			if (targets.some((target) => target === null)) {
				return null;
			}
			const resolved = targets.filter(
				(
					target,
				): target is NonNullable<(typeof targets)[number]> =>
					target !== null,
			);
			return {
				persistent:
					entry.kind === "boundary"
						? compactObject({
								...cloneDecoration(entry),
								targets: resolved.map(({ locator }) =>
									createPersistentNodeRef(locator),
								),
								status: "attached" as const,
							})
						: compactObject({
								...cloneDecoration(entry),
								targets: resolved.map(({ locator }) =>
									createPersistentNodeRef(locator),
								),
								status: "attached" as const,
							}),
				runtime:
					entry.kind === "boundary"
						? compactObject({
								id: entry.id,
								kind: entry.kind,
								nodeIds: resolved.map(({ node }) => node.id),
								label: entry.label,
								variant: entry.variant,
							})
						: compactObject({
								id: entry.id,
								kind: entry.kind,
								nodeIds: resolved.map(({ node }) => node.id),
								text: entry.text,
								variant: entry.variant,
							}),
			};
		}
		case "relationship": {
			const from = resolvePersistentNodeRef(document, entry.from);
			const to = resolvePersistentNodeRef(document, entry.to);
			if (from === null || to === null) {
				return null;
			}
			return {
				persistent: compactObject({
					...cloneDecoration(entry),
					from: createPersistentNodeRef(from.locator),
					to: createPersistentNodeRef(to.locator),
					status: "attached" as const,
				}),
				runtime: compactObject({
					id: entry.id,
					kind: entry.kind,
					fromNodeId: from.node.id,
					toNodeId: to.node.id,
					label: entry.label,
					variant: entry.variant,
				}),
			};
		}
	}
}

function persistDecoration(
	decoration: MindMapDecoration,
	document: MindMapDocument,
): PersistentDecorationAnnotation | null {
	switch (decoration.kind) {
		case "marker": {
			const target = createMindMapNodeLocator(document, decoration.nodeId);
			return target === null
				? null
				: compactObject({
						id: decoration.id,
						kind: decoration.kind,
						target: createPersistentNodeRef(target),
						markerId: decoration.markerId,
						label: decoration.label,
						variant: decoration.variant,
						status: "attached" as const,
					});
		}
		case "boundary":
		case "summary": {
			const targets = decoration.nodeIds.map((id) =>
				createMindMapNodeLocator(document, id),
			);
			if (targets.some((target) => target === null)) {
				return null;
			}
			const refs = targets
				.filter((target): target is MindMapNodeLocator => target !== null)
				.map(createPersistentNodeRef);
			return decoration.kind === "boundary"
				? compactObject({
						id: decoration.id,
						kind: decoration.kind,
						targets: refs,
						label: decoration.label,
						variant: decoration.variant,
						status: "attached" as const,
					})
				: compactObject({
						id: decoration.id,
						kind: decoration.kind,
						targets: refs,
						text: decoration.text,
						variant: decoration.variant,
						status: "attached" as const,
					});
		}
		case "relationship": {
			const from = createMindMapNodeLocator(document, decoration.fromNodeId);
			const to = createMindMapNodeLocator(document, decoration.toNodeId);
			return from === null || to === null
				? null
				: compactObject({
						id: decoration.id,
						kind: decoration.kind,
						from: createPersistentNodeRef(from),
						to: createPersistentNodeRef(to),
						label: decoration.label,
						variant: decoration.variant,
						status: "attached" as const,
					});
		}
	}
}

function migrateDocumentRecord(
	record: DocumentAnnotationRecord,
	nextPath: string,
): DocumentAnnotationRecord {
	const migrate = (ref: PersistentNodeRef) =>
		migratePersistentNodeRef(ref, nextPath);
	return cloneDocumentAnnotationRecord({
		...record,
		path: nextPath,
		nodes: record.nodes.map((entry) => ({
			...entry,
			target: migrate(entry.target),
		})),
		edges: record.edges.map((entry) => ({
			...entry,
			from: migrate(entry.from),
			to: migrate(entry.to),
		})),
		decorations: record.decorations.map((entry) => {
			switch (entry.kind) {
				case "marker":
					return { ...entry, target: migrate(entry.target) };
				case "boundary":
				case "summary":
					return {
						...entry,
						targets: entry.targets.map(migrate),
					};
				case "relationship":
					return {
						...entry,
						from: migrate(entry.from),
						to: migrate(entry.to),
					};
			}
		}),
		collapsed: record.collapsed.map((entry) => ({
			...entry,
			target: migrate(entry.target),
		})),
	});
}

function migratePersistentNodeRef(
	ref: PersistentNodeRef,
	nextPath: string,
): PersistentNodeRef {
	return createPersistentNodeRef({
		...cloneLocator(ref.locator),
		documentPath: nextPath,
	});
}

function cloneStore(store: AnnotationStore): AnnotationStore {
	return createAnnotationStore(store.annotations, store.documents);
}

function cloneAnnotation(annotation: AnnotationRecord): AnnotationRecord {
	return {
		id: annotation.id,
		target: createPersistentNodeRef(annotation.target.locator),
		text: annotation.text,
		status: annotation.status,
	};
}

function cloneNodeEntry(
	entry: PersistentNodePresentationAnnotation,
): PersistentNodePresentationAnnotation {
	return {
		target: createPersistentNodeRef(entry.target.locator),
		status: entry.status,
		presentation: validateMindMapNodePresentation(entry.presentation),
	};
}

function cloneEdgeEntry(
	entry: PersistentEdgePresentationAnnotation,
): PersistentEdgePresentationAnnotation {
	return {
		from: createPersistentNodeRef(entry.from.locator),
		to: createPersistentNodeRef(entry.to.locator),
		status: entry.status,
		presentation: validateMindMapEdgePresentation(entry.presentation),
	};
}

function cloneCollapsedEntry(
	entry: PersistentCollapsedNodeAnnotation,
): PersistentCollapsedNodeAnnotation {
	return {
		target: createPersistentNodeRef(entry.target.locator),
		status: entry.status,
	};
}

function cloneDecoration(
	entry: PersistentDecorationAnnotation,
): PersistentDecorationAnnotation {
	switch (entry.kind) {
		case "marker":
			return compactObject({
				...entry,
				target: createPersistentNodeRef(entry.target.locator),
			});
		case "boundary":
		case "summary":
			return compactObject({
				...entry,
				targets: entry.targets.map(({ locator }) =>
					createPersistentNodeRef(locator),
				),
			});
		case "relationship":
			return compactObject({
				...entry,
				from: createPersistentNodeRef(entry.from.locator),
				to: createPersistentNodeRef(entry.to.locator),
			});
	}
}

function collectNodeIds(root: MindMapNode): ReadonlySet<string> {
	const ids = new Set<string>();
	const pending = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		ids.add(node.id);
		pending.push(...node.children);
	}
	return ids;
}

function collectEdgeIds(root: MindMapNode): ReadonlySet<string> {
	return new Set(collectEdgeIndex(root).keys());
}

function collectEdgeIndex(
	root: MindMapNode,
): ReadonlyMap<string, { readonly fromId: string; readonly toId: string }> {
	const edges = new Map<
		string,
		{ readonly fromId: string; readonly toId: string }
	>();
	const pending = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		for (const child of node.children) {
			edges.set(createLayoutEdgeId(node.id, child.id), {
				fromId: node.id,
				toId: child.id,
			});
			pending.push(child);
		}
	}
	return edges;
}

function layoutAnnotationEqualsPresentation(
	left: MindMapLayoutSpec,
	right: MindMapLayoutSpec,
): boolean {
	return (
		left.engineId === right.engineId &&
		left.orientation === right.orientation &&
		left.spacing.level === right.spacing.level &&
		left.spacing.sibling === right.spacing.sibling &&
		left.spacing.subtree === right.spacing.subtree &&
		JSON.stringify(clonePrimitiveOptions(left.options)) ===
			JSON.stringify(clonePrimitiveOptions(right.options))
	);
}

function clonePrimitiveOptions(
	options: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string | number | boolean>> {
	const entries = Object.entries(options)
		.filter(
			(
				entry,
			): entry is [string, string | number | boolean] =>
				typeof entry[1] === "string" ||
				typeof entry[1] === "boolean" ||
				isSafeFiniteNumber(entry[1]),
		)
		.sort(([left], [right]) => left.localeCompare(right));
	return Object.fromEntries(entries);
}

function validateViewport(viewport: MindMapViewportState): MindMapViewportState {
	if (!isValidViewport(viewport)) {
		throw new RangeError("Viewport contains invalid geometry.");
	}
	return { ...viewport };
}

function isValidViewport(value: unknown): value is MindMapViewportState {
	return (
		isRecord(value) &&
		typeof value.centerX === "number" &&
		Number.isFinite(value.centerX) &&
		typeof value.centerY === "number" &&
		Number.isFinite(value.centerY) &&
		typeof value.scale === "number" &&
		Number.isFinite(value.scale) &&
		value.scale >= 0.2 &&
		value.scale <= 3
	);
}

function normalizeVaultPath(path: string): string {
	const normalized = path.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
	if (
		normalized.length === 0 ||
		normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
	) {
		throw new RangeError("Annotation paths must be normalized Vault paths.");
	}
	return normalized;
}

function requireValidStore(store: AnnotationStore): void {
	if (!isAnnotationStore(store)) {
		throw new TypeError("Annotation store contains an invalid record.");
	}
}

function isSafeFiniteNumber(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isFinite(value) &&
		Math.abs(value) <= 10_000
	);
}

function isStatus(value: unknown): value is AnnotationRecordStatus {
	return value === "attached" || value === "orphaned";
}

function isOptionalText(value: unknown): boolean {
	return value === undefined || typeof value === "string";
}

function nextRevision(revision: string | number): string | number {
	return typeof revision === "number" ? revision + 1 : `${revision}:annotation`;
}

function parseSerializedValue(value: unknown): unknown {
	if (typeof value !== "string") {
		return value;
	}
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}

function cloneLocator(locator: MindMapNodeLocator): MindMapNodeLocator {
	return {
		version: locator.version,
		documentPath: locator.documentPath,
		sourceAnchor: { ...locator.sourceAnchor },
		ancestry: locator.ancestry.map((segment) => ({
			...segment,
			fingerprint: { ...segment.fingerprint },
		})),
		node: {
			...locator.node,
			fingerprint: { ...locator.node.fingerprint },
		},
	};
}

function compactObject<T extends object>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(([, child]) => child !== undefined),
	) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
