import type { LayoutOrientation } from "../core/model";
import type {
	MindMapDecoration,
	MindMapMarkerDecoration,
} from "./presentation";

/**
 * Decoration IDs share the persisted presentation identifier envelope. Node
 * IDs intentionally use a separate, wider envelope because parsed IDs embed
 * an encoded Vault path.
 */
export const MAX_MIND_MAP_DECORATION_ID_LENGTH = 128;
export const MAX_MIND_MAP_DECORATION_NODE_ID_LENGTH = 8_192;
export const MAX_MIND_MAP_DECORATION_TEXT_LENGTH = 100_000;
export const MAX_MIND_MAP_DECORATION_ID_ALLOCATION_ATTEMPTS = 1_000_000;

export const DEFAULT_MIND_MAP_BOUNDARY_PADDING = 16;
export const DEFAULT_MIND_MAP_SUMMARY_PADDING = 18;
export const DEFAULT_MIND_MAP_RELATIONSHIP_OFFSET = 24;

const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const MAX_GEOMETRY_COORDINATE = 1_000_000;

/**
 * The optional node collection makes the same commands usable during a
 * sidebar preview (where only syntactic validation is available) and a live
 * document mutation (where every reference must resolve to a current node).
 */
export interface MindMapDecorationValidationContext {
	readonly nodeIds?: ReadonlySet<string>;
}

export interface MindMapDecorationDraftBase {
	readonly id?: string;
	readonly variant?: string;
}

export interface MindMapMarkerDecorationDraft
	extends MindMapDecorationDraftBase {
	readonly kind: "marker";
	readonly nodeId: string;
	readonly markerId: string;
	readonly label?: string;
}

export interface MindMapBoundaryDecorationDraft
	extends MindMapDecorationDraftBase {
	readonly kind: "boundary";
	readonly nodeIds: readonly string[];
	readonly label?: string;
}

export interface MindMapSummaryDecorationDraft
	extends MindMapDecorationDraftBase {
	readonly kind: "summary";
	readonly nodeIds: readonly string[];
	readonly text: string;
}

export interface MindMapRelationshipDecorationDraft
	extends MindMapDecorationDraftBase {
	readonly kind: "relationship";
	readonly fromNodeId: string;
	readonly toNodeId: string;
	readonly label?: string;
}

export type MindMapDecorationDraft =
	| MindMapMarkerDecorationDraft
	| MindMapBoundaryDecorationDraft
	| MindMapSummaryDecorationDraft
	| MindMapRelationshipDecorationDraft;

export interface MindMapMarkerDecorationUpdate {
	readonly kind: "marker";
	readonly nodeId: string;
	readonly markerId: string;
	readonly label?: string;
	readonly variant?: string;
}

export interface MindMapBoundaryDecorationUpdate {
	readonly kind: "boundary";
	readonly nodeIds: readonly string[];
	readonly label?: string;
	readonly variant?: string;
}

export interface MindMapSummaryDecorationUpdate {
	readonly kind: "summary";
	readonly nodeIds: readonly string[];
	readonly text: string;
	readonly variant?: string;
}

export interface MindMapRelationshipDecorationUpdate {
	readonly kind: "relationship";
	readonly fromNodeId: string;
	readonly toNodeId: string;
	readonly label?: string;
	readonly variant?: string;
}

/** A full replacement that deliberately cannot rename the selected record. */
export type MindMapDecorationUpdate =
	| MindMapMarkerDecorationUpdate
	| MindMapBoundaryDecorationUpdate
	| MindMapSummaryDecorationUpdate
	| MindMapRelationshipDecorationUpdate;

/** Per-tab interaction state; it is never persisted with annotations. */
export interface MindMapDecorationSelection {
	readonly selectedDecorationId: string | null;
}

/**
 * Ephemeral command envelope only. `decorations` originates from presentation
 * annotations while `selection` belongs to the tab; hosts persist only the
 * former. Keeping both explicit lets a pure command clear a stale selection
 * without mixing it into `MindMapPresentation`.
 */
export interface MindMapDecorationCommandState {
	readonly decorations: readonly MindMapDecoration[];
	readonly selection: MindMapDecorationSelection;
}

export type MindMapDecorationCommand =
	| {
			readonly type: "create";
			readonly decoration: MindMapDecorationDraft;
			/** Defaults to selecting the newly created decoration. */
			readonly select?: boolean;
	  }
	| {
			readonly type: "update";
			readonly id: string;
			readonly decoration: MindMapDecorationUpdate;
	  }
	| {
			readonly type: "delete";
			readonly id: string;
	  }
	| {
			readonly type: "select";
			readonly id: string | null;
	  };

export interface MindMapDecorationSelectionOptions {
	readonly id?: string;
	readonly variant?: string;
	readonly label?: string;
}

export interface MindMapSummaryDecorationSelectionOptions {
	readonly id?: string;
	readonly variant?: string;
}

/**
 * Create a relationship draft from a sidebar selection. Its two slots are
 * explicit in the public decoration contract, so no array-shaped endpoint
 * can reach persistence or rendering.
 */
export function createMindMapRelationshipDecorationDraft(
	selectedNodeIds: readonly string[],
	options: MindMapDecorationSelectionOptions = {},
	context: MindMapDecorationValidationContext = {},
): MindMapRelationshipDecorationDraft {
	if (!Array.isArray(selectedNodeIds) || selectedNodeIds.length !== 2) {
		throw new TypeError("Relationships require exactly two selected nodes.");
	}
	const fromNodeId = requireNodeId(selectedNodeIds[0], context);
	const toNodeId = requireNodeId(selectedNodeIds[1], context);
	if (fromNodeId === toNodeId) {
		throw new TypeError("Relationship endpoints must be different nodes.");
	}
	return compactDraft<MindMapRelationshipDecorationDraft>({
		kind: "relationship",
		fromNodeId,
		toNodeId,
		id: optionalDecorationId(options.id),
		variant: optionalVariant(options.variant),
		label: optionalText(options.label),
	});
}

export function createMindMapBoundaryDecorationDraft(
	selectedNodeIds: readonly string[],
	options: MindMapDecorationSelectionOptions = {},
	context: MindMapDecorationValidationContext = {},
): MindMapBoundaryDecorationDraft {
	return compactDraft<MindMapBoundaryDecorationDraft>({
		kind: "boundary",
		nodeIds: validateNodeIds(selectedNodeIds, context),
		id: optionalDecorationId(options.id),
		variant: optionalVariant(options.variant),
		label: optionalText(options.label),
	});
}

export function createMindMapSummaryDecorationDraft(
	selectedNodeIds: readonly string[],
	text: string,
	options: MindMapSummaryDecorationSelectionOptions = {},
	context: MindMapDecorationValidationContext = {},
): MindMapSummaryDecorationDraft {
	return compactDraft<MindMapSummaryDecorationDraft>({
		kind: "summary",
		nodeIds: validateNodeIds(selectedNodeIds, context),
		text: requireText(text),
		id: optionalDecorationId(options.id),
		variant: optionalVariant(options.variant),
	});
}

/**
 * Validate and clone a renderer-neutral decoration. Unknown object fields are
 * intentionally dropped so this remains a JSON-safe persistence boundary.
 */
export function validateMindMapDecoration(
	value: unknown,
	context: MindMapDecorationValidationContext = {},
): MindMapDecoration {
	if (!isRecord(value)) {
		throw new TypeError("Decoration must be an object.");
	}
	const id = requireDecorationId(value.id);
	const variant = optionalVariant(value.variant);

	switch (value.kind) {
		case "marker":
			return compactDecoration<MindMapMarkerDecoration>({
				id,
				kind: "marker",
				nodeId: requireNodeId(value.nodeId, context),
				markerId: requireDecorationId(value.markerId),
				variant,
				label: optionalText(value.label),
			});
		case "boundary":
			return compactDecoration<MindMapDecoration>({
				id,
				kind: "boundary",
				nodeIds: validateNodeIds(value.nodeIds, context),
				variant,
				label: optionalText(value.label),
			});
		case "summary":
			return compactDecoration<MindMapDecoration>({
				id,
				kind: "summary",
				nodeIds: validateNodeIds(value.nodeIds, context),
				variant,
				text: requireText(value.text),
			});
		case "relationship": {
			const fromNodeId = requireNodeId(value.fromNodeId, context);
			const toNodeId = requireNodeId(value.toNodeId, context);
			if (fromNodeId === toNodeId) {
				throw new TypeError("Relationship endpoints must be different nodes.");
			}
			return compactDecoration<MindMapDecoration>({
				id,
				kind: "relationship",
				fromNodeId,
				toNodeId,
				variant,
				label: optionalText(value.label),
			});
		}
		default:
			throw new TypeError("Decoration kind is not supported.");
	}
}

/** Validate collection uniqueness and return ownership-safe decoration data. */
export function validateMindMapDecorations(
	value: unknown,
	context: MindMapDecorationValidationContext = {},
): readonly MindMapDecoration[] {
	if (!Array.isArray(value)) {
		throw new TypeError("Decorations must be an array.");
	}
	const ids = new Set<string>();
	return value.map((candidate) => {
		const decoration = validateMindMapDecoration(candidate, context);
		if (ids.has(decoration.id)) {
			throw new TypeError("Decoration IDs must be unique.");
		}
		ids.add(decoration.id);
		return decoration;
	});
}

export function isSafeMindMapDecorationIdentifier(
	value: unknown,
): value is string {
	return (
		typeof value === "string" &&
		isJsonSafeString(value, MAX_MIND_MAP_DECORATION_ID_LENGTH, false) &&
		SAFE_IDENTIFIER_PATTERN.test(value)
	);
}

export function isSafeMindMapDecorationNodeId(value: unknown): value is string {
	return (
		typeof value === "string" &&
		isJsonSafeString(value, MAX_MIND_MAP_DECORATION_NODE_ID_LENGTH, false)
	);
}

export function isSafeMindMapDecorationText(value: unknown): value is string {
	return (
		typeof value === "string" &&
		isJsonSafeString(value, MAX_MIND_MAP_DECORATION_TEXT_LENGTH, true)
	);
}

/**
 * Choose the lowest available deterministic suffix. A bounded attempt count
 * prevents a forged persisted collection from turning allocation into an
 * unbounded loop.
 */
export function allocateMindMapDecorationId(
	existingIds: Iterable<string>,
	prefix = "decoration",
): string {
	const safePrefix = requireDecorationId(prefix);
	const used = new Set<string>();
	for (const id of existingIds) {
		if (typeof id === "string") {
			used.add(id);
		}
	}

	for (
		let suffix = 1;
		suffix <= MAX_MIND_MAP_DECORATION_ID_ALLOCATION_ATTEMPTS;
		suffix += 1
	) {
		const candidate = `${safePrefix}-${String(suffix)}`;
		if (candidate.length > MAX_MIND_MAP_DECORATION_ID_LENGTH) {
			break;
		}
		if (!used.has(candidate)) {
			return candidate;
		}
	}
	throw new RangeError("No safe decoration ID is available.");
}

export function createMindMapDecorationCommandState(
	decorations: readonly MindMapDecoration[] = [],
	selectedDecorationId: string | null = null,
	context: MindMapDecorationValidationContext = {},
): MindMapDecorationCommandState {
	const clonedDecorations = validateMindMapDecorations(decorations, context);
	const selected =
		selectedDecorationId !== null &&
		isSafeMindMapDecorationIdentifier(selectedDecorationId) &&
		clonedDecorations.some(
			(decoration) => decoration.id === selectedDecorationId,
		)
			? selectedDecorationId
			: null;
	return {
		decorations: clonedDecorations,
		selection: { selectedDecorationId: selected },
	};
}

/**
 * Apply one explicit, immutable decoration command. Updates retain their ID,
 * and delete/reconcile commands clear a selected record only when that record
 * actually disappears.
 */
export function applyMindMapDecorationCommand(
	state: MindMapDecorationCommandState,
	command: MindMapDecorationCommand,
	context: MindMapDecorationValidationContext = {},
): MindMapDecorationCommandState {
	const current = createMindMapDecorationCommandState(
		state.decorations,
		state.selection.selectedDecorationId,
		context,
	);
	if (!isRecord(command)) {
		throw new TypeError("Decoration command must be an object.");
	}

	switch (command.type) {
		case "create": {
			const id = resolveDraftId(command.decoration, current.decorations);
			if (current.decorations.some((decoration) => decoration.id === id)) {
				throw new TypeError(`Decoration ID "${id}" already exists.`);
			}
			const decoration = materializeDraft(command.decoration, id, context);
			return createMindMapDecorationCommandState(
				[...current.decorations, decoration],
				command.select === false
					? current.selection.selectedDecorationId
					: id,
				context,
			);
		}
		case "update": {
			const id = requireDecorationId(command.id);
			const index = current.decorations.findIndex(
				(decoration) => decoration.id === id,
			);
			if (index < 0) {
				throw new RangeError(`Unknown decoration ID "${id}".`);
			}
			const replacement = materializeUpdate(command.decoration, id, context);
			const decorations = current.decorations.map((decoration) =>
				decoration.id === id ? replacement : cloneDecoration(decoration),
			);
			return createMindMapDecorationCommandState(
				decorations,
				current.selection.selectedDecorationId,
				context,
			);
		}
		case "delete": {
			const id = requireDecorationId(command.id);
			const decorations = current.decorations.filter(
				(decoration) => decoration.id !== id,
			);
			return createMindMapDecorationCommandState(
				decorations,
				current.selection.selectedDecorationId === id
					? null
					: current.selection.selectedDecorationId,
				context,
			);
		}
		case "select": {
			const selectedId =
				command.id !== null
					? requireDecorationId(command.id)
					: null;
			return createMindMapDecorationCommandState(
				current.decorations,
				selectedId,
				context,
			);
		}
		default:
			throw new TypeError("Decoration command type is not supported.");
	}
}

/** Returns a cloned decoration, so callers cannot mutate state ownership. */
export function getMindMapDecoration(
	state: MindMapDecorationCommandState,
	id: string,
): MindMapDecoration | null {
	const safeId = requireDecorationId(id);
	const found = state.decorations.find((decoration) => decoration.id === safeId);
	return found === undefined ? null : cloneDecoration(found);
}

export interface MindMapDecorationNodeReferenceReconciliationRequest {
	/** Current parsed node IDs after a source refresh. */
	readonly nodeIds: ReadonlySet<string>;
	/** `null` explicitly drops an old node; an absent key leaves it unchanged. */
	readonly nodeIdRemap?: ReadonlyMap<string, string | null>;
}

export interface MindMapDecorationNodeReferenceReconciliation {
	readonly state: MindMapDecorationCommandState;
	readonly removedDecorationIds: readonly string[];
	readonly remappedDecorationIds: readonly string[];
}

/**
 * Rebind decoration references after a source refresh without guessing. Marker
 * and relationship records disappear when an endpoint cannot be proved;
 * boundary and summary groups retain every still-valid unique member and only
 * disappear once their group becomes empty.
 */
export function reconcileMindMapDecorationNodeReferences(
	state: MindMapDecorationCommandState,
	request: MindMapDecorationNodeReferenceReconciliationRequest,
): MindMapDecorationNodeReferenceReconciliation {
	const current = createMindMapDecorationCommandState(
		state.decorations,
		state.selection.selectedDecorationId,
	);
	const knownNodeIds = collectSafeNodeIds(request.nodeIds);
	const context: MindMapDecorationValidationContext = { nodeIds: knownNodeIds };
	const removedDecorationIds: string[] = [];
	const remappedDecorationIds: string[] = [];
	const decorations: MindMapDecoration[] = [];

	for (const decoration of current.decorations) {
		const reconciled = reconcileDecoration(
			decoration,
			knownNodeIds,
			request.nodeIdRemap,
		);
		if (reconciled === null) {
			removedDecorationIds.push(decoration.id);
			continue;
		}
		if (!decorationsEqual(decoration, reconciled)) {
			remappedDecorationIds.push(decoration.id);
		}
		decorations.push(reconciled);
	}

	const selectedDecorationId = removedDecorationIds.includes(
		current.selection.selectedDecorationId ?? "",
	)
		? null
		: current.selection.selectedDecorationId;
	return {
		state: createMindMapDecorationCommandState(
			decorations,
			selectedDecorationId,
			context,
		),
		removedDecorationIds,
		remappedDecorationIds,
	};
}

export interface MindMapDecorationPoint {
	readonly x: number;
	readonly y: number;
}

export interface MindMapDecorationBounds {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** One positioned topic as seen by a renderer-neutral scene adapter. */
export interface MindMapDecorationNodeBounds extends MindMapDecorationBounds {
	readonly id: string;
}

/**
 * Geometry input deliberately accepts only positioned bounds and orientation.
 * It has no DOM element, CSS measurement, Obsidian object, or live viewport.
 */
export interface MindMapDecorationGeometryScene {
	readonly nodeBounds: readonly MindMapDecorationNodeBounds[];
	readonly orientation?: LayoutOrientation;
}

export interface MindMapDecorationGeometryOptions {
	readonly boundaryPadding?: number;
	readonly summaryPadding?: number;
	readonly relationshipOffset?: number;
}

export interface MindMapMarkerDecorationGeometryDescriptor {
	readonly kind: "marker";
	readonly id: string;
	readonly nodeId: string;
	readonly markerId: string;
	readonly label?: string;
	readonly anchor: MindMapDecorationPoint;
	readonly labelAnchor: MindMapDecorationPoint | null;
}

export interface MindMapBoundaryDecorationGeometryDescriptor {
	readonly kind: "boundary";
	readonly id: string;
	readonly nodeIds: readonly string[];
	readonly label?: string;
	readonly bounds: MindMapDecorationBounds;
	readonly labelAnchor: MindMapDecorationPoint | null;
}

export type MindMapSummaryBracketSide = "left" | "right" | "top" | "bottom";
export type MindMapDecorationTextAlignment = "start" | "center" | "end";

export interface MindMapSummaryDecorationGeometryDescriptor {
	readonly kind: "summary";
	readonly id: string;
	readonly nodeIds: readonly string[];
	readonly text: string;
	readonly groupBounds: MindMapDecorationBounds;
	readonly side: MindMapSummaryBracketSide;
	/** Ordered open-bracket points; renderers choose SVG, Canvas, or export form. */
	readonly bracket: readonly MindMapDecorationPoint[];
	readonly textAnchor: MindMapDecorationPoint;
	readonly textAlignment: MindMapDecorationTextAlignment;
}

export interface MindMapRelationshipDecorationGeometryDescriptor {
	readonly kind: "relationship";
	readonly id: string;
	readonly fromNodeId: string;
	readonly toNodeId: string;
	readonly label?: string;
	readonly start: MindMapDecorationPoint;
	readonly control: MindMapDecorationPoint;
	readonly end: MindMapDecorationPoint;
	readonly labelAnchor: MindMapDecorationPoint | null;
}

export type MindMapDecorationGeometryDescriptor =
	| MindMapMarkerDecorationGeometryDescriptor
	| MindMapBoundaryDecorationGeometryDescriptor
	| MindMapSummaryDecorationGeometryDescriptor
	| MindMapRelationshipDecorationGeometryDescriptor;

export interface MindMapDecorationGeometryResolution {
	readonly descriptors: readonly MindMapDecorationGeometryDescriptor[];
	/** Valid decoration records whose current scene lacks all required bounds. */
	readonly unresolvedDecorationIds: readonly string[];
}

/**
 * Resolve deterministic scene descriptors without creating browser objects.
 * Missing/ambiguous bounds are reported as unresolved rather than guessed.
 */
export function resolveMindMapDecorationGeometry(
	decorations: readonly MindMapDecoration[],
	scene: MindMapDecorationGeometryScene,
	options: MindMapDecorationGeometryOptions = {},
): MindMapDecorationGeometryResolution {
	const validDecorations = validateMindMapDecorations(decorations);
	const boundsByNodeId = indexNodeBounds(scene.nodeBounds);
	const orientation = resolveOrientation(scene.orientation);
	const boundaryPadding = resolveGeometryLength(
		options.boundaryPadding,
		DEFAULT_MIND_MAP_BOUNDARY_PADDING,
	);
	const summaryPadding = resolveGeometryLength(
		options.summaryPadding,
		DEFAULT_MIND_MAP_SUMMARY_PADDING,
	);
	const relationshipOffset = resolveGeometryLength(
		options.relationshipOffset,
		DEFAULT_MIND_MAP_RELATIONSHIP_OFFSET,
	);
	const descriptors: MindMapDecorationGeometryDescriptor[] = [];
	const unresolvedDecorationIds: string[] = [];

	for (const decoration of validDecorations) {
		const descriptor = resolveDecorationGeometry(
			decoration,
			boundsByNodeId,
			orientation,
			boundaryPadding,
			summaryPadding,
			relationshipOffset,
		);
		if (descriptor === null) {
			unresolvedDecorationIds.push(decoration.id);
		} else {
			descriptors.push(descriptor);
		}
	}

	return { descriptors, unresolvedDecorationIds };
}

function resolveDraftId(
	draft: unknown,
	decorations: readonly MindMapDecoration[],
): string {
	if (!isRecord(draft)) {
		throw new TypeError("Decoration draft must be an object.");
	}
	if (draft.id !== undefined) {
		return requireDecorationId(draft.id);
	}
	if (!isDecorationKind(draft.kind)) {
		throw new TypeError("Decoration kind is not supported.");
	}
	return allocateMindMapDecorationId(
		decorations.map((decoration) => decoration.id),
		draft.kind,
	);
}

function materializeDraft(
	draft: unknown,
	id: string,
	context: MindMapDecorationValidationContext,
): MindMapDecoration {
	if (!isRecord(draft)) {
		throw new TypeError("Decoration draft must be an object.");
	}
	return materializeDecoration(draft, id, context, true);
}

function materializeUpdate(
	update: unknown,
	id: string,
	context: MindMapDecorationValidationContext,
): MindMapDecoration {
	if (!isRecord(update)) {
		throw new TypeError("Decoration update must be an object.");
	}
	if (update.id !== undefined) {
		throw new TypeError("Decoration updates cannot change their ID.");
	}
	return materializeDecoration(update, id, context, false);
}

function materializeDecoration(
	value: Record<string, unknown>,
	id: string,
	context: MindMapDecorationValidationContext,
	allowId: boolean,
): MindMapDecoration {
	if (allowId && value.id !== undefined && requireDecorationId(value.id) !== id) {
		throw new TypeError("Decoration draft ID does not match its command ID.");
	}
	switch (value.kind) {
		case "marker":
			return validateMindMapDecoration(
				{
					id,
					kind: value.kind,
					nodeId: value.nodeId,
					markerId: value.markerId,
					variant: value.variant,
					label: value.label,
				},
				context,
			);
		case "boundary":
			return validateMindMapDecoration(
				{
					id,
					kind: value.kind,
					nodeIds: value.nodeIds,
					variant: value.variant,
					label: value.label,
				},
				context,
			);
		case "summary":
			return validateMindMapDecoration(
				{
					id,
					kind: value.kind,
					nodeIds: value.nodeIds,
					variant: value.variant,
					text: value.text,
				},
				context,
			);
		case "relationship":
			return validateMindMapDecoration(
				{
					id,
					kind: value.kind,
					fromNodeId: value.fromNodeId,
					toNodeId: value.toNodeId,
					variant: value.variant,
					label: value.label,
				},
				context,
			);
		default:
			throw new TypeError("Decoration kind is not supported.");
	}
}

function reconcileDecoration(
	decoration: MindMapDecoration,
	knownNodeIds: ReadonlySet<string>,
	nodeIdRemap: ReadonlyMap<string, string | null> | undefined,
): MindMapDecoration | null {
	switch (decoration.kind) {
		case "marker": {
			const nodeId = remapNodeId(
				decoration.nodeId,
				knownNodeIds,
				nodeIdRemap,
			);
			return nodeId === null
				? null
				: cloneMarkerDecoration(decoration, nodeId);
		}
		case "boundary":
		case "summary": {
			const nodeIds = uniqueNodeIds(
				decoration.nodeIds
					.map((nodeId) =>
						remapNodeId(nodeId, knownNodeIds, nodeIdRemap),
					)
					.filter((nodeId): nodeId is string => nodeId !== null),
			);
			if (nodeIds.length === 0) {
				return null;
			}
			return decoration.kind === "boundary"
				? {
						id: decoration.id,
						kind: "boundary",
						nodeIds,
						...(decoration.variant === undefined
							? {}
							: { variant: decoration.variant }),
						...(decoration.label === undefined
							? {}
							: { label: decoration.label }),
					}
				: {
						id: decoration.id,
						kind: "summary",
						nodeIds,
						text: decoration.text,
						...(decoration.variant === undefined
							? {}
							: { variant: decoration.variant }),
					};
		}
		case "relationship": {
			const fromNodeId = remapNodeId(
				decoration.fromNodeId,
				knownNodeIds,
				nodeIdRemap,
			);
			const toNodeId = remapNodeId(
				decoration.toNodeId,
				knownNodeIds,
				nodeIdRemap,
			);
			if (
				fromNodeId === null ||
				toNodeId === null ||
				fromNodeId === toNodeId
			) {
				return null;
			}
			return {
				id: decoration.id,
				kind: "relationship",
				fromNodeId,
				toNodeId,
				...(decoration.variant === undefined
					? {}
					: { variant: decoration.variant }),
				...(decoration.label === undefined
					? {}
					: { label: decoration.label }),
			};
		}
	}
}

function remapNodeId(
	nodeId: string,
	knownNodeIds: ReadonlySet<string>,
	nodeIdRemap: ReadonlyMap<string, string | null> | undefined,
): string | null {
	if (nodeIdRemap?.has(nodeId) === true) {
		const mapped = nodeIdRemap.get(nodeId);
		return mapped !== null && mapped !== undefined && knownNodeIds.has(mapped)
			? mapped
			: null;
	}
	return knownNodeIds.has(nodeId) ? nodeId : null;
}

function collectSafeNodeIds(nodeIds: ReadonlySet<string>): ReadonlySet<string> {
	const result = new Set<string>();
	for (const nodeId of nodeIds) {
		if (isSafeMindMapDecorationNodeId(nodeId)) {
			result.add(nodeId);
		}
	}
	return result;
}

function resolveDecorationGeometry(
	decoration: MindMapDecoration,
	boundsByNodeId: ReadonlyMap<string, MindMapDecorationBounds>,
	orientation: LayoutOrientation,
	boundaryPadding: number,
	summaryPadding: number,
	relationshipOffset: number,
): MindMapDecorationGeometryDescriptor | null {
	switch (decoration.kind) {
		case "marker": {
			const bounds = boundsByNodeId.get(decoration.nodeId);
			if (bounds === undefined) {
				return null;
			}
			const anchor = {
				x: bounds.x + bounds.width,
				y: bounds.y,
			};
			return {
				kind: "marker",
				id: decoration.id,
				nodeId: decoration.nodeId,
				markerId: decoration.markerId,
				...(decoration.label === undefined ? {} : { label: decoration.label }),
				anchor,
				labelAnchor:
					decoration.label === undefined ? null : { ...anchor },
			};
		}
		case "boundary": {
			const groupBounds = resolveGroupBounds(
				decoration.nodeIds,
				boundsByNodeId,
			);
			if (groupBounds === null) {
				return null;
			}
			const bounds = expandBounds(groupBounds, boundaryPadding);
			return {
				kind: "boundary",
				id: decoration.id,
				nodeIds: [...decoration.nodeIds],
				...(decoration.label === undefined ? {} : { label: decoration.label }),
				bounds,
				labelAnchor:
					decoration.label === undefined
						? null
						: { x: bounds.x + boundaryPadding, y: bounds.y + boundaryPadding },
			};
		}
		case "summary": {
			const groupBounds = resolveGroupBounds(
				decoration.nodeIds,
				boundsByNodeId,
			);
			if (groupBounds === null) {
				return null;
			}
			const bracket = resolveSummaryBracket(
				groupBounds,
				orientation,
				summaryPadding,
			);
			return {
				kind: "summary",
				id: decoration.id,
				nodeIds: [...decoration.nodeIds],
				text: decoration.text,
				groupBounds,
				side: bracket.side,
				bracket: bracket.points,
				textAnchor: bracket.textAnchor,
				textAlignment: bracket.textAlignment,
			};
		}
		case "relationship": {
			const from = boundsByNodeId.get(decoration.fromNodeId);
			const to = boundsByNodeId.get(decoration.toNodeId);
			if (from === undefined || to === undefined) {
				return null;
			}
			const fromCenter = centerOfBounds(from);
			const toCenter = centerOfBounds(to);
			const start = resolveRectAnchor(from, toCenter, decoration.id);
			const end = resolveRectAnchor(to, fromCenter, decoration.id);
			const control = resolveRelationshipControl(
				start,
				end,
				decoration.id,
				relationshipOffset,
			);
			return {
				kind: "relationship",
				id: decoration.id,
				fromNodeId: decoration.fromNodeId,
				toNodeId: decoration.toNodeId,
				...(decoration.label === undefined ? {} : { label: decoration.label }),
				start,
				control,
				end,
				labelAnchor:
					decoration.label === undefined
						? null
						: quadraticPoint(start, control, end, 0.5),
			};
		}
	}
}

function indexNodeBounds(
	nodeBounds: unknown,
): ReadonlyMap<string, MindMapDecorationBounds> {
	const result = new Map<string, MindMapDecorationBounds>();
	const duplicates = new Set<string>();
	if (!Array.isArray(nodeBounds)) {
		return result;
	}
	for (const candidate of nodeBounds) {
		if (!isRecord(candidate) || !isSafeMindMapDecorationNodeId(candidate.id)) {
			continue;
		}
		const bounds = parseBounds(candidate);
		if (bounds === null || duplicates.has(candidate.id)) {
			continue;
		}
		if (result.has(candidate.id)) {
			result.delete(candidate.id);
			duplicates.add(candidate.id);
			continue;
		}
		result.set(candidate.id, bounds);
	}
	return result;
}

function parseBounds(value: Record<string, unknown>): MindMapDecorationBounds | null {
	const { x, y, width, height } = value;
	if (
		!isFiniteGeometryCoordinate(x) ||
		!isFiniteGeometryCoordinate(y) ||
		!isFiniteGeometryCoordinate(width) ||
		!isFiniteGeometryCoordinate(height) ||
		width < 0 ||
		height < 0
	) {
		return null;
	}
	return { x, y, width, height };
}

function resolveGroupBounds(
	nodeIds: readonly string[],
	boundsByNodeId: ReadonlyMap<string, MindMapDecorationBounds>,
): MindMapDecorationBounds | null {
	const bounds = nodeIds.map((nodeId) => boundsByNodeId.get(nodeId));
	if (bounds.some((item) => item === undefined)) {
		return null;
	}
	const resolved = bounds.filter(
		(item): item is MindMapDecorationBounds => item !== undefined,
	);
	if (resolved.length === 0) {
		return null;
	}
	const minX = Math.min(...resolved.map((item) => item.x));
	const minY = Math.min(...resolved.map((item) => item.y));
	const maxX = Math.max(...resolved.map((item) => item.x + item.width));
	const maxY = Math.max(...resolved.map((item) => item.y + item.height));
	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY,
	};
}

function expandBounds(
	bounds: MindMapDecorationBounds,
	padding: number,
): MindMapDecorationBounds {
	return {
		x: bounds.x - padding,
		y: bounds.y - padding,
		width: bounds.width + padding * 2,
		height: bounds.height + padding * 2,
	};
}

function resolveSummaryBracket(
	bounds: MindMapDecorationBounds,
	orientation: LayoutOrientation,
	padding: number,
): {
	readonly side: MindMapSummaryBracketSide;
	readonly points: readonly MindMapDecorationPoint[];
	readonly textAnchor: MindMapDecorationPoint;
	readonly textAlignment: MindMapDecorationTextAlignment;
} {
	switch (orientation) {
		case "right-to-left": {
			const x = bounds.x - padding;
			return {
				side: "left",
				points: [
					{ x: bounds.x, y: bounds.y },
					{ x, y: bounds.y },
					{ x, y: bounds.y + bounds.height },
					{ x: bounds.x, y: bounds.y + bounds.height },
				],
				textAnchor: { x: x - padding, y: bounds.y + bounds.height / 2 },
				textAlignment: "end",
			};
		}
		case "top-to-bottom": {
			const y = bounds.y + bounds.height + padding;
			return {
				side: "bottom",
				points: [
					{ x: bounds.x, y: bounds.y + bounds.height },
					{ x: bounds.x, y },
					{ x: bounds.x + bounds.width, y },
					{ x: bounds.x + bounds.width, y: bounds.y + bounds.height },
				],
				textAnchor: { x: bounds.x + bounds.width / 2, y: y + padding },
				textAlignment: "center",
			};
		}
		case "bottom-to-top": {
			const y = bounds.y - padding;
			return {
				side: "top",
				points: [
					{ x: bounds.x, y: bounds.y },
					{ x: bounds.x, y },
					{ x: bounds.x + bounds.width, y },
					{ x: bounds.x + bounds.width, y: bounds.y },
				],
				textAnchor: { x: bounds.x + bounds.width / 2, y: y - padding },
				textAlignment: "center",
			};
		}
		case "left-to-right": {
			const x = bounds.x + bounds.width + padding;
			return {
				side: "right",
				points: [
					{ x: bounds.x + bounds.width, y: bounds.y },
					{ x, y: bounds.y },
					{ x, y: bounds.y + bounds.height },
					{ x: bounds.x + bounds.width, y: bounds.y + bounds.height },
				],
				textAnchor: { x: x + padding, y: bounds.y + bounds.height / 2 },
				textAlignment: "start",
			};
		}
	}
}

function centerOfBounds(bounds: MindMapDecorationBounds): MindMapDecorationPoint {
	return {
		x: bounds.x + bounds.width / 2,
		y: bounds.y + bounds.height / 2,
	};
}

function resolveRectAnchor(
	bounds: MindMapDecorationBounds,
	toward: MindMapDecorationPoint,
	seed: string,
): MindMapDecorationPoint {
	const center = centerOfBounds(bounds);
	let dx = toward.x - center.x;
	let dy = toward.y - center.y;
	if (dx === 0 && dy === 0) {
		const fallback = unitVectorFromSeed(seed);
		dx = fallback.x;
		dy = fallback.y;
	}
	const halfWidth = bounds.width / 2;
	const halfHeight = bounds.height / 2;
	if (halfWidth === 0 && halfHeight === 0) {
		return center;
	}
	if (
		halfWidth > 0 &&
		(halfHeight === 0 || Math.abs(dx) * halfHeight >= Math.abs(dy) * halfWidth)
	) {
		const x = center.x + (dx < 0 ? -halfWidth : halfWidth);
		return {
			x,
			y: center.y + (Math.abs(dx) === 0 ? 0 : (dy * halfWidth) / Math.abs(dx)),
		};
	}
	const y = center.y + (dy < 0 ? -halfHeight : halfHeight);
	return {
		x: center.x + (Math.abs(dy) === 0 ? 0 : (dx * halfHeight) / Math.abs(dy)),
		y,
	};
}

function resolveRelationshipControl(
	start: MindMapDecorationPoint,
	end: MindMapDecorationPoint,
	seed: string,
	offset: number,
): MindMapDecorationPoint {
	let dx = end.x - start.x;
	let dy = end.y - start.y;
	let length = Math.hypot(dx, dy);
	if (length === 0) {
		const fallback = unitVectorFromSeed(seed);
		dx = fallback.x;
		dy = fallback.y;
		length = 1;
	}
	return {
		x: (start.x + end.x) / 2 - (dy / length) * offset,
		y: (start.y + end.y) / 2 + (dx / length) * offset,
	};
}

function quadraticPoint(
	start: MindMapDecorationPoint,
	control: MindMapDecorationPoint,
	end: MindMapDecorationPoint,
	t: number,
): MindMapDecorationPoint {
	const inverse = 1 - t;
	return {
		x:
			inverse * inverse * start.x +
			2 * inverse * t * control.x +
			t * t * end.x,
		y:
			inverse * inverse * start.y +
			2 * inverse * t * control.y +
			t * t * end.y,
	};
}

function unitVectorFromSeed(seed: string): MindMapDecorationPoint {
	let hash = 2_166_136_261;
	for (let index = 0; index < seed.length; index += 1) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	const angle = ((hash >>> 0) % 360) * (Math.PI / 180);
	return { x: Math.cos(angle), y: Math.sin(angle) };
}

function resolveOrientation(value: unknown): LayoutOrientation {
	return value === "right-to-left" ||
		value === "top-to-bottom" ||
		value === "bottom-to-top" ||
		value === "left-to-right"
		? value
		: "left-to-right";
}

function resolveGeometryLength(value: unknown, fallback: number): number {
	return isFiniteGeometryCoordinate(value) && value >= 0 ? value : fallback;
}

function isFiniteGeometryCoordinate(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isFinite(value) &&
		Math.abs(value) <= MAX_GEOMETRY_COORDINATE
	);
}

function requireDecorationId(value: unknown): string {
	if (!isSafeMindMapDecorationIdentifier(value)) {
		throw new TypeError("Decoration IDs must be safe bounded identifiers.");
	}
	return value;
}

function optionalDecorationId(value: unknown): string | undefined {
	return value === undefined ? undefined : requireDecorationId(value);
}

function optionalVariant(value: unknown): string | undefined {
	return value === undefined ? undefined : requireDecorationId(value);
}

function requireNodeId(
	value: unknown,
	context: MindMapDecorationValidationContext,
): string {
	if (!isSafeMindMapDecorationNodeId(value)) {
		throw new TypeError("Decoration node IDs must be safe bounded strings.");
	}
	if (context.nodeIds !== undefined && !context.nodeIds.has(value)) {
		throw new RangeError(`Unknown decoration node ID "${value}".`);
	}
	return value;
}

function validateNodeIds(
	value: unknown,
	context: MindMapDecorationValidationContext,
): readonly string[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new TypeError("Decoration groups require at least one node.");
	}
	const nodeIds = value.map((nodeId) => requireNodeId(nodeId, context));
	if (new Set(nodeIds).size !== nodeIds.length) {
		throw new TypeError("Decoration node IDs must be unique.");
	}
	return nodeIds;
}

function optionalText(value: unknown): string | undefined {
	return value === undefined ? undefined : requireText(value);
}

function requireText(value: unknown): string {
	if (!isSafeMindMapDecorationText(value)) {
		throw new TypeError("Decoration text must be a bounded JSON-safe string.");
	}
	return value;
}

function isJsonSafeString(
	value: string,
	maximumLength: number,
	allowEmpty: boolean,
): boolean {
	if (
		value.length > maximumLength ||
		(!allowEmpty && value.length === 0) ||
		value.includes("\u0000")
	) {
		return false;
	}
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code >= 0xd800 && code <= 0xdbff) {
			const next = value.charCodeAt(index + 1);
			if (!(next >= 0xdc00 && next <= 0xdfff)) {
				return false;
			}
			index += 1;
		} else if (code >= 0xdc00 && code <= 0xdfff) {
			return false;
		}
	}
	return true;
}

function cloneDecoration(decoration: MindMapDecoration): MindMapDecoration {
	switch (decoration.kind) {
		case "marker":
			return cloneMarkerDecoration(decoration, decoration.nodeId);
		case "boundary":
			return {
				id: decoration.id,
				kind: "boundary",
				nodeIds: [...decoration.nodeIds],
				...(decoration.variant === undefined
					? {}
					: { variant: decoration.variant }),
				...(decoration.label === undefined ? {} : { label: decoration.label }),
			};
		case "summary":
			return {
				id: decoration.id,
				kind: "summary",
				nodeIds: [...decoration.nodeIds],
				text: decoration.text,
				...(decoration.variant === undefined
					? {}
					: { variant: decoration.variant }),
			};
		case "relationship":
			return {
				id: decoration.id,
				kind: "relationship",
				fromNodeId: decoration.fromNodeId,
				toNodeId: decoration.toNodeId,
				...(decoration.variant === undefined
					? {}
					: { variant: decoration.variant }),
				...(decoration.label === undefined ? {} : { label: decoration.label }),
			};
	}
}

function cloneMarkerDecoration(
	decoration: MindMapMarkerDecoration,
	nodeId: string,
): MindMapMarkerDecoration {
	return {
		id: decoration.id,
		kind: "marker",
		nodeId,
		markerId: decoration.markerId,
		...(decoration.variant === undefined ? {} : { variant: decoration.variant }),
		...(decoration.label === undefined ? {} : { label: decoration.label }),
	};
}

function decorationsEqual(
	left: MindMapDecoration,
	right: MindMapDecoration,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function uniqueNodeIds(nodeIds: readonly string[]): readonly string[] {
	return [...new Set(nodeIds)];
}

function compactDraft<T extends object>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(([, nested]) => nested !== undefined),
	) as T;
}

function compactDecoration<T extends object>(value: T): T {
	return compactDraft(value);
}

function isDecorationKind(value: unknown): value is MindMapDecoration["kind"] {
	return (
		value === "marker" ||
		value === "boundary" ||
		value === "summary" ||
		value === "relationship"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
