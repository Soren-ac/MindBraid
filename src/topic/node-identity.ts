import type {
	MindMapDocument,
	MindMapNode,
	MindMapNodeKind,
} from "../core/model";

export const MIND_MAP_NODE_LOCATOR_VERSION = 1;

export interface MindMapNodeSourceAnchor {
	readonly line: number;
	readonly ch: number;
}

/**
 * Opaque deterministic fingerprints derived only from the parsed Markdown
 * snapshot. `semantic` intentionally excludes heading level and list marker so
 * a checked structural move can still find a uniquely identifiable topic.
 */
export interface MindMapNodeFingerprint {
	readonly text: string;
	readonly structure: string;
	readonly semantic: string;
	readonly subtree: string;
}

/**
 * One source-tree position. Occurrence counts make duplicate labels useful
 * without silently accepting an insertion/deletion inside the duplicate group.
 */
export interface MindMapNodeLocatorSegment {
	readonly kind: MindMapNodeKind;
	readonly fingerprint: MindMapNodeFingerprint;
	readonly siblingIndex: number;
	readonly siblingOccurrence: number;
	readonly siblingOccurrenceCount: number;
	readonly kindOccurrence: number;
	readonly kindOccurrenceCount: number;
}

/**
 * Stable, metadata-free description of one node in a document snapshot.
 *
 * It is a reconciliation hint, not a permanent ID. The resolver returns null
 * whenever the available source and tree evidence does not select exactly one
 * candidate.
 */
export interface MindMapNodeLocator {
	readonly version: typeof MIND_MAP_NODE_LOCATOR_VERSION;
	readonly documentPath: string;
	readonly sourceAnchor: MindMapNodeSourceAnchor;
	readonly ancestry: readonly MindMapNodeLocatorSegment[];
	readonly node: MindMapNodeLocatorSegment;
}

export type MindMapNodeLocatorMatchStrategy =
	| "root"
	| "source-anchor"
	| "ancestry"
	| "unique-subtree"
	| "structural-position";

export interface MindMapNodeLocatorResolution {
	readonly node: MindMapNode;
	readonly locator: MindMapNodeLocator;
	readonly strategy: MindMapNodeLocatorMatchStrategy;
}

export interface MindMapNodeReconciliation {
	readonly previousNode: MindMapNode;
	readonly nextNode: MindMapNode;
	readonly previousLocator: MindMapNodeLocator;
	readonly nextLocator: MindMapNodeLocator;
	readonly strategy: MindMapNodeLocatorMatchStrategy;
}

/**
 * Runtime validation for locators loaded from persisted plugin data.
 * Locators remain opaque to callers; this guard only establishes that the
 * resolver can inspect all required structural fields safely.
 */
export function isMindMapNodeLocator(
	value: unknown,
): value is MindMapNodeLocator {
	if (!isRecord(value)) {
		return false;
	}
	const sourceAnchor = value.sourceAnchor;
	return (
		value.version === MIND_MAP_NODE_LOCATOR_VERSION &&
		typeof value.documentPath === "string" &&
		isRecord(sourceAnchor) &&
		typeof sourceAnchor.line === "number" &&
		typeof sourceAnchor.ch === "number" &&
		Array.isArray(value.ancestry) &&
		value.ancestry.every(isLocatorSegmentShape) &&
		isLocatorSegmentShape(value.node) &&
		isUsableLocator(value as unknown as MindMapNodeLocator)
	);
}

interface MutableIndexedNode {
	readonly node: MindMapNode;
	readonly parent: MutableIndexedNode | null;
	readonly siblingIndex: number;
	readonly siblingOccurrence: number;
	readonly siblingOccurrenceCount: number;
	readonly kindOccurrence: number;
	readonly kindOccurrenceCount: number;
	readonly children: MutableIndexedNode[];
	fingerprint: MindMapNodeFingerprint;
}

interface DocumentNodeIndex {
	readonly entries: readonly MutableIndexedNode[];
	readonly byId: ReadonlyMap<string, MutableIndexedNode | null>;
}

interface RankedCandidate {
	readonly indexed: MutableIndexedNode;
	readonly locator: MindMapNodeLocator;
	readonly rank: number;
	readonly strategy: MindMapNodeLocatorMatchStrategy;
}

/**
 * Capture a locator for a current node ID. Duplicate IDs in a forged model are
 * rejected instead of selecting one arbitrarily.
 */
export function createMindMapNodeLocator(
	document: MindMapDocument,
	nodeId: string,
): MindMapNodeLocator | null {
	const index = indexMindMapDocument(document);
	const indexed = index.byId.get(nodeId);
	return indexed === undefined || indexed === null
		? null
		: createLocator(document.root.source.path, indexed);
}

/**
 * Resolve a locator against another snapshot of the same source path.
 */
export function resolveMindMapNodeLocator(
	document: MindMapDocument,
	locator: MindMapNodeLocator,
): MindMapNode | null {
	return resolveMindMapNodeLocatorDetailed(document, locator)?.node ?? null;
}

export function resolveMindMapNodeLocatorDetailed(
	document: MindMapDocument,
	locator: MindMapNodeLocator,
): MindMapNodeLocatorResolution | null {
	if (
		!isUsableLocator(locator) ||
		document.root.source.path !== locator.documentPath
	) {
		return null;
	}

	const index = indexMindMapDocument(document);
	if (locator.node.kind === "root") {
		if (locator.ancestry.length !== 0) {
			return null;
		}
		const indexedRoot = index.entries[0];
		if (indexedRoot === undefined || indexedRoot.node.kind !== "root") {
			return null;
		}
		return {
			node: indexedRoot.node,
			locator: createLocator(locator.documentPath, indexedRoot),
			strategy: "root",
		};
	}

	const sameKind = index.entries.filter(
		(entry) => entry.node.kind === locator.node.kind,
	);
	const subtreeMatchCount = sameKind.filter(
		(entry) =>
			entry.fingerprint.subtree === locator.node.fingerprint.subtree,
	).length;
	const semanticMatchCount = sameKind.filter(
		(entry) =>
			entry.fingerprint.semantic ===
			locator.node.fingerprint.semantic,
	).length;
	const ranked = sameKind
		.map((entry) =>
			rankCandidate(
				locator,
				createLocator(locator.documentPath, entry),
				entry,
				subtreeMatchCount,
				semanticMatchCount,
			),
		)
		.filter((candidate): candidate is RankedCandidate => candidate !== null);

	if (ranked.length === 0) {
		return null;
	}
	const bestRank = Math.max(...ranked.map(({ rank }) => rank));
	const best = ranked.filter(({ rank }) => rank === bestRank);
	if (best.length !== 1) {
		return null;
	}

	const match = best[0];
	if (match === undefined) {
		return null;
	}
	return {
		node: match.indexed.node,
		locator: match.locator,
		strategy: match.strategy,
	};
}

/**
 * Reconcile a previously captured locator and return a refreshed locator for
 * the new snapshot. The locator must first resolve in the supplied old
 * document, preventing an unrelated or already-stale locator from being
 * rebound.
 */
export function reconcileMindMapNodeLocator(
	previousDocument: MindMapDocument,
	nextDocument: MindMapDocument,
	locator: MindMapNodeLocator,
): MindMapNodeReconciliation | null {
	const previous = resolveMindMapNodeLocatorDetailed(
		previousDocument,
		locator,
	);
	if (previous === null) {
		return null;
	}
	const next = resolveMindMapNodeLocatorDetailed(
		nextDocument,
		previous.locator,
	);
	if (next === null) {
		return null;
	}

	return {
		previousNode: previous.node,
		nextNode: next.node,
		previousLocator: previous.locator,
		nextLocator: next.locator,
		strategy: next.strategy,
	};
}

/**
 * Convenience entry point for reconciling a node from its current parsed ID.
 */
export function reconcileMindMapNode(
	previousDocument: MindMapDocument,
	nextDocument: MindMapDocument,
	previousNodeId: string,
): MindMapNodeReconciliation | null {
	const locator = createMindMapNodeLocator(
		previousDocument,
		previousNodeId,
	);
	return locator === null
		? null
		: reconcileMindMapNodeLocator(
				previousDocument,
				nextDocument,
				locator,
			);
}

function rankCandidate(
	expected: MindMapNodeLocator,
	candidate: MindMapNodeLocator,
	indexed: MutableIndexedNode,
	subtreeMatchCount: number,
	semanticMatchCount: number,
): RankedCandidate | null {
	const anchorMatches =
		expected.sourceAnchor.line === candidate.sourceAnchor.line &&
		expected.sourceAnchor.ch === candidate.sourceAnchor.ch;
	const semanticMatches =
		expected.node.fingerprint.semantic ===
		candidate.node.fingerprint.semantic;
	const structureMatches =
		expected.node.fingerprint.structure ===
		candidate.node.fingerprint.structure;
	const subtreeMatches =
		expected.node.fingerprint.subtree ===
		candidate.node.fingerprint.subtree;
	const ancestryMatches = locatorAncestryMatches(
		expected.ancestry,
		candidate.ancestry,
	);
	const siblingOccurrenceMatches =
		expected.node.siblingOccurrence ===
			candidate.node.siblingOccurrence &&
		expected.node.siblingOccurrenceCount ===
			candidate.node.siblingOccurrenceCount &&
		(expected.node.siblingOccurrenceCount === 1 || subtreeMatches);
	const structuralPositionMatches =
		expected.node.kindOccurrence === candidate.node.kindOccurrence &&
		expected.node.kindOccurrenceCount ===
			candidate.node.kindOccurrenceCount;
	const anchorSemanticContextMatches =
		expected.node.siblingOccurrenceCount ===
			candidate.node.siblingOccurrenceCount &&
		(expected.node.siblingOccurrenceCount === 1 || subtreeMatches);

	if (
		anchorMatches &&
		semanticMatches &&
		anchorSemanticContextMatches &&
		(semanticMatchCount === 1 ||
			ancestryMatches ||
			(subtreeMatches && subtreeMatchCount === 1))
	) {
		return {
			indexed,
			locator: candidate,
			rank: 600,
			strategy: "source-anchor",
		};
	}
	if (
		semanticMatches &&
		ancestryMatches &&
		siblingOccurrenceMatches
	) {
		return {
			indexed,
			locator: candidate,
			rank: 550,
			strategy: "ancestry",
		};
	}
	if (subtreeMatches && subtreeMatchCount === 1) {
		return {
			indexed,
			locator: candidate,
			rank: 500,
			strategy: "unique-subtree",
		};
	}
	if (
		!semanticMatches &&
		anchorMatches &&
		ancestryMatches &&
		structureMatches &&
		structuralPositionMatches
	) {
		return {
			indexed,
			locator: candidate,
			rank: 450,
			strategy: "structural-position",
		};
	}
	if (
		!semanticMatches &&
		ancestryMatches &&
		structureMatches &&
		structuralPositionMatches &&
		expected.node.kindOccurrenceCount === 1 &&
		candidate.node.kindOccurrenceCount === 1
	) {
		return {
			indexed,
			locator: candidate,
			rank: 400,
			strategy: "structural-position",
		};
	}

	return null;
}

function locatorAncestryMatches(
	expected: readonly MindMapNodeLocatorSegment[],
	candidate: readonly MindMapNodeLocatorSegment[],
): boolean {
	if (expected.length !== candidate.length) {
		return false;
	}
	for (let index = 0; index < expected.length; index += 1) {
		const left = expected[index];
		const right = candidate[index];
		if (
			left === undefined ||
			right === undefined ||
			left.kind !== right.kind ||
			left.fingerprint.semantic !== right.fingerprint.semantic ||
			left.siblingOccurrence !== right.siblingOccurrence ||
			left.siblingOccurrenceCount !== right.siblingOccurrenceCount
		) {
			return false;
		}
	}
	return true;
}

function createLocator(
	documentPath: string,
	indexed: MutableIndexedNode,
): MindMapNodeLocator {
	const ancestry: MindMapNodeLocatorSegment[] = [];
	let parent = indexed.parent;
	while (parent !== null) {
		ancestry.unshift(createLocatorSegment(parent));
		parent = parent.parent;
	}

	return {
		version: MIND_MAP_NODE_LOCATOR_VERSION,
		documentPath,
		sourceAnchor: {
			line: indexed.node.source.line,
			ch: indexed.node.source.ch,
		},
		ancestry,
		node: createLocatorSegment(indexed),
	};
}

function createLocatorSegment(
	indexed: MutableIndexedNode,
): MindMapNodeLocatorSegment {
	return {
		kind: indexed.node.kind,
		fingerprint: { ...indexed.fingerprint },
		siblingIndex: indexed.siblingIndex,
		siblingOccurrence: indexed.siblingOccurrence,
		siblingOccurrenceCount: indexed.siblingOccurrenceCount,
		kindOccurrence: indexed.kindOccurrence,
		kindOccurrenceCount: indexed.kindOccurrenceCount,
	};
}

function indexMindMapDocument(document: MindMapDocument): DocumentNodeIndex {
	const root = createIndexedNode(document.root, null, {
		siblingIndex: 0,
		siblingOccurrence: 0,
		siblingOccurrenceCount: 1,
		kindOccurrence: 0,
		kindOccurrenceCount: 1,
	});
	const entries: MutableIndexedNode[] = [root];
	const byId = new Map<string, MutableIndexedNode | null>();
	addIndexedId(byId, root);

	for (let cursor = 0; cursor < entries.length; cursor += 1) {
		const parent = entries[cursor];
		if (parent === undefined) {
			continue;
		}
		const semanticKeys = parent.node.children.map((child) =>
			createSemanticFingerprint(child),
		);
		const semanticCounts = countValues(semanticKeys);
		const kindCounts = countValues(
			parent.node.children.map(({ kind }) => kind),
		);
		const semanticOccurrences = new Map<string, number>();
		const kindOccurrences = new Map<MindMapNodeKind, number>();

		for (
			let siblingIndex = 0;
			siblingIndex < parent.node.children.length;
			siblingIndex += 1
		) {
			const child = parent.node.children[siblingIndex];
			const semanticKey = semanticKeys[siblingIndex];
			if (child === undefined || semanticKey === undefined) {
				continue;
			}
			const siblingOccurrence =
				semanticOccurrences.get(semanticKey) ?? 0;
			const kindOccurrence = kindOccurrences.get(child.kind) ?? 0;
			const indexed = createIndexedNode(child, parent, {
				siblingIndex,
				siblingOccurrence,
				siblingOccurrenceCount:
					semanticCounts.get(semanticKey) ?? 1,
				kindOccurrence,
				kindOccurrenceCount: kindCounts.get(child.kind) ?? 1,
			});
			semanticOccurrences.set(semanticKey, siblingOccurrence + 1);
			kindOccurrences.set(child.kind, kindOccurrence + 1);
			parent.children.push(indexed);
			entries.push(indexed);
			addIndexedId(byId, indexed);
		}
	}

	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const indexed = entries[index];
		if (indexed === undefined) {
			continue;
		}
		indexed.fingerprint = {
			...indexed.fingerprint,
			subtree: fingerprintParts([
				"subtree",
				indexed.fingerprint.semantic,
				...indexed.children.map(
					(child) => child.fingerprint.subtree,
				),
			]),
		};
	}

	return {
		entries,
		byId,
	};
}

function createIndexedNode(
	node: MindMapNode,
	parent: MutableIndexedNode | null,
	position: Omit<
		MutableIndexedNode,
		"node" | "parent" | "children" | "fingerprint"
	>,
): MutableIndexedNode {
	const text = fingerprintParts(["text", node.text]);
	const structure = createStructureFingerprint(node);
	return {
		node,
		parent,
		...position,
		children: [],
		fingerprint: {
			text,
			structure,
			semantic: createSemanticFingerprint(node),
			subtree: "",
		},
	};
}

function createSemanticFingerprint(node: MindMapNode): string {
	return fingerprintParts(["semantic", node.kind, node.text]);
}

function createStructureFingerprint(node: MindMapNode): string {
	switch (node.kind) {
		case "root":
			return fingerprintParts(["structure", "root"]);
		case "heading":
			return fingerprintParts([
				"structure",
				"heading",
				String(node.level),
			]);
		case "list":
			return fingerprintParts([
				"structure",
				"list",
				node.ordered ? "ordered" : "unordered",
				node.taskState ?? "no-task",
			]);
	}
}

function countValues<Value>(
	values: readonly Value[],
): ReadonlyMap<Value, number> {
	const counts = new Map<Value, number>();
	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return counts;
}

function addIndexedId(
	byId: Map<string, MutableIndexedNode | null>,
	indexed: MutableIndexedNode,
): void {
	if (byId.has(indexed.node.id)) {
		byId.set(indexed.node.id, null);
	} else {
		byId.set(indexed.node.id, indexed);
	}
}

function isUsableLocator(locator: MindMapNodeLocator): boolean {
	return (
		locator.version === MIND_MAP_NODE_LOCATOR_VERSION &&
		locator.documentPath.length > 0 &&
		Number.isInteger(locator.sourceAnchor.line) &&
		locator.sourceAnchor.line >= 0 &&
		Number.isInteger(locator.sourceAnchor.ch) &&
		locator.sourceAnchor.ch >= 0 &&
		isUsableSegment(locator.node) &&
		locator.ancestry.every(isUsableSegment)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isUsableSegment(segment: MindMapNodeLocatorSegment): boolean {
	return (
		segment.fingerprint.text.length > 0 &&
		segment.fingerprint.structure.length > 0 &&
		segment.fingerprint.semantic.length > 0 &&
		segment.fingerprint.subtree.length > 0 &&
		isNonNegativeInteger(segment.siblingIndex) &&
		isNonNegativeInteger(segment.siblingOccurrence) &&
		isPositiveInteger(segment.siblingOccurrenceCount) &&
		segment.siblingOccurrence < segment.siblingOccurrenceCount &&
		isNonNegativeInteger(segment.kindOccurrence) &&
		isPositiveInteger(segment.kindOccurrenceCount) &&
		segment.kindOccurrence < segment.kindOccurrenceCount
	);
}

function isLocatorSegmentShape(
	value: unknown,
): value is MindMapNodeLocatorSegment {
	if (!isRecord(value) || !isRecord(value.fingerprint)) {
		return false;
	}
	return (
		(value.kind === "root" || value.kind === "heading" || value.kind === "list") &&
		typeof value.fingerprint.text === "string" &&
		typeof value.fingerprint.structure === "string" &&
		typeof value.fingerprint.semantic === "string" &&
		typeof value.fingerprint.subtree === "string" &&
		typeof value.siblingIndex === "number" &&
		typeof value.siblingOccurrence === "number" &&
		typeof value.siblingOccurrenceCount === "number" &&
		typeof value.kindOccurrence === "number" &&
		typeof value.kindOccurrenceCount === "number"
	);
}

function isNonNegativeInteger(value: number): boolean {
	return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: number): boolean {
	return Number.isInteger(value) && value > 0;
}

function fingerprintParts(parts: readonly string[]): string {
	const serialized = parts
		.map((part) => `${part.length.toString(36)}:${part}`)
		.join("|");
	let first = 0x811c9dc5;
	let second = 0x9e3779b9;
	for (let index = 0; index < serialized.length; index += 1) {
		const codeUnit = serialized.charCodeAt(index);
		first = Math.imul(first ^ codeUnit, 0x01000193);
		second = Math.imul(
			second ^ codeUnit ^ index,
			0x85ebca6b,
		);
	}
	return [
		"obmind-node-v1",
		serialized.length.toString(36),
		(first >>> 0).toString(36),
		(second >>> 0).toString(36),
	].join(":");
}
