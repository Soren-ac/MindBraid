import type {
	HeadingMindMapNode,
	ListMindMapNode,
	MindMapDocument,
	MindMapNode,
} from "../../core/model";
import {
	collectMindMapSubtree,
	findUnsupportedListContinuationLine,
	getLeadingWhitespace,
	getLineStartOffset,
	getStructuralSourceRange,
	indexMindMapNodes,
	joinMutationContent,
	rangeContainsOnlySubtree,
	sameNodeSourceFacts,
	splitMutationContent,
	type IndexedMindMapNode,
	type MutationSourceLine,
	type StructuralSourceRange,
} from "./node-mutation";
import {
	createMarkdownSourceRevision,
	parseMarkdown,
} from "../../core/parser";

export type NodeDeletionMode = "subtree" | "promote-children";

export type NodeDeletionErrorCode =
	| "empty-selection"
	| "node-not-found"
	| "root-not-supported"
	| "stale-node"
	| "stale-source"
	| "unsafe-promotion"
	| "unsafe-result"
	| "unsafe-source-range";

export class NodeDeletionError extends Error {
	public constructor(
		public readonly code: NodeDeletionErrorCode,
		message: string,
	) {
		super(message);
		this.name = "NodeDeletionError";
	}
}

export interface NodeDeletionRequest {
	/** Exact parsed snapshot displayed when the delete gesture began. */
	readonly document: MindMapDocument;
	/** Exact current Markdown buffer. It is never mutated by this planner. */
	readonly content: string;
	/** Revision captured by the explicit delete gesture. */
	readonly sourceRevision: string;
	/**
	 * One or more selected nodes. Duplicate IDs are ignored. When an ancestor
	 * and its descendant are both selected, the ancestor owns the mutation and
	 * the covered descendant is removed from `effectiveNodeIds`.
	 */
	readonly nodeIds: readonly string[];
	readonly mode: NodeDeletionMode;
}

export interface NodeDeletionRange
	extends StructuralSourceRange {
	readonly nodeId: string;
}

export interface NodeDeletionPlan {
	readonly updatedContent: string;
	readonly changed: true;
	readonly mode: NodeDeletionMode;
	readonly requestedNodeIds: readonly string[];
	readonly effectiveNodeIds: readonly string[];
	readonly sourceRanges: readonly NodeDeletionRange[];
	/** One contiguous replacement suitable for an editor transaction. */
	readonly replacementStartOffset: number;
	readonly replacementEndOffset: number;
	readonly replacementText: string;
}

interface SemanticRoot {
	readonly kind: "root";
	readonly text: string;
	readonly children: readonly SemanticNode[];
}

type SemanticNode = SemanticHeading | SemanticList;

interface SemanticHeading {
	readonly kind: "heading";
	readonly text: string;
	readonly level: number;
	readonly children: readonly SemanticNode[];
}

interface SemanticList {
	readonly kind: "list";
	readonly text: string;
	readonly marker: string;
	readonly ordered: boolean;
	readonly ordinal: number | null;
	readonly taskState: string | null;
	readonly children: readonly SemanticNode[];
}

interface ContiguousReplacement {
	readonly startOffset: number;
	readonly endOffset: number;
	readonly text: string;
}

/**
 * Plan an atomic, stale-safe deletion for one or more mind-map branches.
 *
 * `subtree` removes the complete Markdown section owned by a heading, or the
 * parsed structural subtree owned by a list item. `promote-children` removes
 * only each selected source line and rewrites its direct child subtrees so
 * they become children of the deleted node's parent. The planner reparses the
 * entire result and rejects any operation whose structural result differs
 * from that exact tree transformation.
 */
export function planNodeDeletionInContent(
	request: NodeDeletionRequest,
): NodeDeletionPlan {
	assertCurrentRevision(request);
	const requestedNodeIds = uniqueIds(request.nodeIds);
	if (requestedNodeIds.length === 0) {
		throw new NodeDeletionError(
			"empty-selection",
			"At least one node must be selected for deletion.",
		);
	}

	const snapshotIndex = indexMindMapNodes(request.document.root);
	const snapshotEntries = requestedNodeIds.map((nodeId) =>
		requireSnapshotNode(snapshotIndex, nodeId),
	);
	for (const entry of snapshotEntries) {
		if (entry.node.kind === "root") {
			throw new NodeDeletionError(
				"root-not-supported",
				"The document root cannot be deleted.",
			);
		}
	}

	const effectiveSnapshotEntries = removeCoveredDescendants(
		snapshotEntries,
		snapshotIndex,
	);
	const effectiveNodeIds = effectiveSnapshotEntries.map(
		(entry) => entry.node.id,
	);
	const currentDocument = parseMarkdown(
		request.content,
		request.document.root.source.path,
		request.document.root.text,
	);
	const currentIndex = indexMindMapNodes(currentDocument.root);
	const currentEntries = effectiveSnapshotEntries.map((snapshotEntry) => {
		const currentEntry = currentIndex.get(snapshotEntry.node.id);
		if (currentEntry === undefined) {
			throw new NodeDeletionError(
				"stale-node",
				`Node "${snapshotEntry.node.id}" no longer exists at its mapped source line.`,
			);
		}
		if (
			!sameNodeSourceFacts(snapshotEntry.node, currentEntry.node) ||
			snapshotEntry.parent?.id !== currentEntry.parent?.id
		) {
			throw new NodeDeletionError(
				"stale-node",
				`Node "${snapshotEntry.node.id}" no longer matches the displayed tree.`,
			);
		}
		return currentEntry;
	});

	const split = splitMutationContent(request.content);
	const ranges = currentEntries.map((entry): NodeDeletionRange => {
		const range = getCheckedSourceRange(
			entry.node,
			currentIndex,
			split.lines,
			split.contentLineCount,
		);
		return {
			nodeId: entry.node.id,
			...range,
		};
	});
	assertDisjointRanges(ranges);

	const mutableLines = split.lines.map((line) => ({ ...line }));
	if (request.mode === "promote-children") {
		for (const entry of currentEntries) {
			if (entry.node.kind === "root") {
				throw new NodeDeletionError(
					"root-not-supported",
					"The document root cannot be deleted.",
				);
			}
			promoteChildrenInSource(entry.node, mutableLines);
		}
	}

	const removedRanges =
		request.mode === "subtree"
			? ranges
			: currentEntries.map(
					(entry): NodeDeletionRange => ({
						nodeId: entry.node.id,
						startLine: entry.node.source.line,
						endLineExclusive: entry.node.source.line + 1,
					}),
				);
	for (const range of [...removedRanges].sort(
		(left, right) => right.startLine - left.startLine,
	)) {
		mutableLines.splice(
			range.startLine,
			range.endLineExclusive - range.startLine,
		);
	}

	const updatedContent = joinMutationContent(split, mutableLines);
	if (updatedContent === request.content) {
		throw new NodeDeletionError(
			"unsafe-result",
			"The deletion did not change the source buffer.",
		);
	}
	const expected = createExpectedDocument(
		currentDocument.root,
		new Set(effectiveNodeIds),
		request.mode,
	);
	const actualDocument = parseMarkdown(
		updatedContent,
		request.document.root.source.path,
		request.document.root.text,
	);
	const actual = toSemanticRoot(actualDocument.root);
	if (!semanticTreesEqual(expected, actual)) {
		throw new NodeDeletionError(
			request.mode === "promote-children"
				? "unsafe-promotion"
				: "unsafe-result",
			"The resulting Markdown tree does not match the requested deletion.",
		);
	}

	const replacement = createContiguousReplacement(
		request.content,
		updatedContent,
	);
	return {
		updatedContent,
		changed: true,
		mode: request.mode,
		requestedNodeIds,
		effectiveNodeIds,
		sourceRanges: ranges,
		replacementStartOffset: replacement.startOffset,
		replacementEndOffset: replacement.endOffset,
		replacementText: replacement.text,
	};
}

function assertCurrentRevision(request: NodeDeletionRequest): void {
	if (
		request.document.sourceRevision !== request.sourceRevision ||
		createMarkdownSourceRevision(request.content) !==
			request.sourceRevision
	) {
		throw new NodeDeletionError(
			"stale-source",
			"The Markdown source changed after the delete gesture began.",
		);
	}
}

function uniqueIds(ids: readonly string[]): string[] {
	return [...new Set(ids)];
}

function requireSnapshotNode(
	index: ReadonlyMap<string, IndexedMindMapNode>,
	nodeId: string,
): IndexedMindMapNode {
	const entry = index.get(nodeId);
	if (entry !== undefined) {
		return entry;
	}
	throw new NodeDeletionError(
		"node-not-found",
		`Node "${nodeId}" is not present in the displayed document snapshot.`,
	);
}

function removeCoveredDescendants(
	entries: readonly IndexedMindMapNode[],
	index: ReadonlyMap<string, IndexedMindMapNode>,
): IndexedMindMapNode[] {
	const selectedIds = new Set(entries.map((entry) => entry.node.id));
	return entries.filter((entry) => {
		let parent = entry.parent;
		while (parent !== null) {
			if (selectedIds.has(parent.id)) {
				return false;
			}
			parent = index.get(parent.id)?.parent ?? null;
		}
		return true;
	});
}

function getCheckedSourceRange(
	node: MindMapNode,
	index: ReadonlyMap<string, IndexedMindMapNode>,
	lines: readonly MutationSourceLine[],
	contentLineCount: number,
): StructuralSourceRange {
	const unsupportedLine = findUnsupportedListContinuationLine(
		node,
		index,
		lines,
		contentLineCount,
	);
	if (unsupportedLine !== null) {
		throw new NodeDeletionError(
			"unsafe-source-range",
			`List body content on line ${unsupportedLine + 1} is not safe to restructure yet.`,
		);
	}
	let range: StructuralSourceRange;
	try {
		range = getStructuralSourceRange(
			node,
			index,
			contentLineCount,
		);
	} catch (error: unknown) {
		throw new NodeDeletionError(
			"unsafe-source-range",
			error instanceof Error
				? error.message
				: "The node source range is invalid.",
		);
	}
	if (!rangeContainsOnlySubtree(node, range, index)) {
		throw new NodeDeletionError(
			"unsafe-source-range",
			"The source range contains a structural node outside the selected subtree.",
		);
	}
	return range;
}

function assertDisjointRanges(
	ranges: readonly NodeDeletionRange[],
): void {
	const sorted = [...ranges].sort(
		(left, right) => left.startLine - right.startLine,
	);
	for (let index = 1; index < sorted.length; index += 1) {
		const previous = sorted[index - 1];
		const current = sorted[index];
		if (
			previous !== undefined &&
			current !== undefined &&
			current.startLine < previous.endLineExclusive
		) {
			throw new NodeDeletionError(
				"unsafe-source-range",
				"Selected source ranges overlap unexpectedly.",
			);
		}
	}
}

function promoteChildrenInSource(
	node: Exclude<MindMapNode, { readonly kind: "root" }>,
	lines: MutationSourceLine[],
): void {
	if (node.kind === "heading") {
		for (const child of node.children) {
			if (child.kind === "heading") {
				transformHeadingSubtree(
					child,
					node.level - child.level,
					lines,
				);
			}
		}
		return;
	}

	const targetLine = lines[node.source.line];
	if (targetLine === undefined) {
		throw unsafePromotionError(
			"The selected list source line no longer exists.",
		);
	}
	const destinationIndent = getLeadingWhitespace(targetLine.text);
	for (const child of node.children) {
		if (child.kind !== "list") {
			throw unsafePromotionError(
				"A list item contains a non-list child that cannot be promoted safely.",
			);
		}
		transformListSubtree(child, destinationIndent, lines);
	}
}

function transformHeadingSubtree(
	root: HeadingMindMapNode,
	levelDelta: number,
	lines: MutationSourceLine[],
): void {
	for (const node of collectMindMapSubtree(root)) {
		if (node.kind !== "heading") {
			continue;
		}
		const nextLevel = node.level + levelDelta;
		if (nextLevel < 1 || nextLevel > 6) {
			throw unsafePromotionError(
				"Promoting the heading subtree would exceed Markdown heading levels.",
			);
		}
		const sourceLine = lines[node.source.line];
		const match =
			sourceLine === undefined
				? null
				: /^( {0,3})(#{1,6})(?=[ \t]|$)/.exec(
						sourceLine.text,
					);
		if (
			sourceLine === undefined ||
			match === null ||
			(match[2]?.length ?? 0) !== node.level
		) {
			throw unsafePromotionError(
				"A promoted heading marker no longer matches its parsed source.",
			);
		}
		lines[node.source.line] = {
			...sourceLine,
			text:
				(match[1] ?? "") +
				"#".repeat(nextLevel) +
				sourceLine.text.slice(match[0].length),
		};
	}
}

function transformListSubtree(
	root: ListMindMapNode,
	destinationIndent: string,
	lines: MutationSourceLine[],
): void {
	const rootLine = lines[root.source.line];
	if (rootLine === undefined) {
		throw unsafePromotionError(
			"A promoted list source line no longer exists.",
		);
	}
	const sourceIndent = getLeadingWhitespace(rootLine.text);
	for (const node of collectMindMapSubtree(root)) {
		if (node.kind !== "list") {
			throw unsafePromotionError(
				"A promoted list subtree contains a non-list node.",
			);
		}
		const sourceLine = lines[node.source.line];
		if (sourceLine === undefined) {
			throw unsafePromotionError(
				"A promoted list descendant no longer exists.",
			);
		}
		const indent = getLeadingWhitespace(sourceLine.text);
		if (!indent.startsWith(sourceIndent)) {
			throw unsafePromotionError(
				"Mixed list indentation cannot be promoted without changing structure.",
			);
		}
		lines[node.source.line] = {
			...sourceLine,
			text:
				destinationIndent +
				sourceLine.text.slice(sourceIndent.length),
		};
	}
}

function createExpectedDocument(
	root: MindMapNode,
	selectedIds: ReadonlySet<string>,
	mode: NodeDeletionMode,
): SemanticRoot {
	return {
		kind: "root",
		text: root.text,
		children: root.children.flatMap((child) =>
			createExpectedNodes(child, selectedIds, mode, 0),
		),
	};
}

function createExpectedNodes(
	node: MindMapNode,
	selectedIds: ReadonlySet<string>,
	mode: NodeDeletionMode,
	headingLevelDelta: number,
): readonly SemanticNode[] {
	if (node.kind === "root") {
		return node.children.flatMap((child) =>
			createExpectedNodes(
				child,
				selectedIds,
				mode,
				headingLevelDelta,
			),
		);
	}
	if (selectedIds.has(node.id)) {
		if (mode === "subtree") {
			return [];
		}
		return node.children.flatMap((child) => {
			const childDelta =
				node.kind === "heading" && child.kind === "heading"
					? headingLevelDelta +
						node.level -
						child.level
					: headingLevelDelta;
			return createExpectedNodes(
				child,
				selectedIds,
				mode,
				childDelta,
			);
		});
	}

	const children = node.children.flatMap((child) =>
		createExpectedNodes(
			child,
			selectedIds,
			mode,
			headingLevelDelta,
		),
	);
	if (node.kind === "heading") {
		return [
			{
				kind: "heading",
				text: node.text,
				level: node.level + headingLevelDelta,
				children,
			},
		];
	}
	return [
		{
			kind: "list",
			text: node.text,
			marker: node.marker,
			ordered: node.ordered,
			ordinal: node.ordinal,
			taskState: node.taskState,
			children,
		},
	];
}

function toSemanticRoot(root: MindMapNode): SemanticRoot {
	return {
		kind: "root",
		text: root.text,
		children: root.children.map(toSemanticNode),
	};
}

function toSemanticNode(node: MindMapNode): SemanticNode {
	if (node.kind === "root") {
		throw new NodeDeletionError(
			"unsafe-result",
			"A document root cannot appear inside its own tree.",
		);
	}
	if (node.kind === "heading") {
		return {
			kind: "heading",
			text: node.text,
			level: node.level,
			children: node.children.map(toSemanticNode),
		};
	}
	return {
		kind: "list",
		text: node.text,
		marker: node.marker,
		ordered: node.ordered,
		ordinal: node.ordinal,
		taskState: node.taskState,
		children: node.children.map(toSemanticNode),
	};
}

function semanticTreesEqual(
	left: SemanticRoot,
	right: SemanticRoot,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function createContiguousReplacement(
	currentContent: string,
	updatedContent: string,
): ContiguousReplacement {
	const sharedLimit = Math.min(
		currentContent.length,
		updatedContent.length,
	);
	let startOffset = 0;
	while (
		startOffset < sharedLimit &&
		currentContent[startOffset] === updatedContent[startOffset]
	) {
		startOffset += 1;
	}
	let currentEnd = currentContent.length;
	let updatedEnd = updatedContent.length;
	while (
		currentEnd > startOffset &&
		updatedEnd > startOffset &&
		currentContent[currentEnd - 1] ===
			updatedContent[updatedEnd - 1]
	) {
		currentEnd -= 1;
		updatedEnd -= 1;
	}
	return {
		startOffset,
		endOffset: currentEnd,
		text: updatedContent.slice(startOffset, updatedEnd),
	};
}

function unsafePromotionError(message: string): NodeDeletionError {
	return new NodeDeletionError("unsafe-promotion", message);
}

/**
 * Retained for hosts that prefer source-line transaction metadata. It also
 * makes the range convention explicit without exposing line-splitting code.
 */
export function getNodeDeletionRangeOffsets(
	content: string,
	range: StructuralSourceRange,
): { readonly startOffset: number; readonly endOffset: number } {
	const split = splitMutationContent(content);
	return {
		startOffset: getLineStartOffset(split, range.startLine),
		endOffset: getLineStartOffset(
			split,
			range.endLineExclusive,
		),
	};
}
