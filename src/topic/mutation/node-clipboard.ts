import type {
	MindMapDocument,
	MindMapNode,
} from "../../core/model";
import {
	findMindMapNodeAtLine,
	findUnsupportedListContinuationLine,
	getLeadingWhitespace,
	getLineStartOffset,
	getStructuralSourceRange,
	indexMindMapNodes,
	rangeContainsOnlySubtree,
	sameNodeSourceFacts,
	splitMutationContent,
	type IndexedMindMapNode,
	type SplitMutationContent,
	type StructuralSourceRange,
} from "./node-mutation";
import {
	createMarkdownSourceRevision,
	parseMarkdown,
} from "../../core/parser";

export const MIND_MAP_CLIPBOARD_KIND = "obmind-node-clipboard";
export const MIND_MAP_CLIPBOARD_VERSION = 1;

export type NodePastePlacement = "child" | "sibling";

export type NodeClipboardErrorCode =
	| "empty-payload"
	| "empty-selection"
	| "heading-level-limit"
	| "invalid-payload"
	| "mixed-branch-kinds"
	| "node-not-found"
	| "root-copy-not-supported"
	| "root-sibling-not-supported"
	| "stale-node"
	| "stale-source"
	| "unsafe-insertion-boundary"
	| "unsafe-result"
	| "unsafe-source-range"
	| "unsupported-target";

export class NodeClipboardError extends Error {
	public constructor(
		public readonly code: NodeClipboardErrorCode,
		message: string,
	) {
		super(message);
		this.name = "NodeClipboardError";
	}
}

interface ClipboardNodeBase {
	/** Zero-based line offset inside this branch's canonical Markdown. */
	readonly sourceLineOffset: number;
	readonly text: string;
	readonly children: readonly MindMapClipboardNode[];
}

export interface MindMapClipboardHeading
	extends ClipboardNodeBase {
	readonly kind: "heading";
	readonly level: number;
}

export interface MindMapClipboardList extends ClipboardNodeBase {
	readonly kind: "list";
	readonly marker: string;
	readonly ordered: boolean;
	readonly ordinal: number | null;
	readonly taskState: "unchecked" | "checked" | null;
}

export type MindMapClipboardNode =
	| MindMapClipboardHeading
	| MindMapClipboardList;

export interface MindMapClipboardBranch {
	readonly sourcePath: string;
	readonly sourceNodeId: string;
	readonly sourceRange: StructuralSourceRange;
	/**
	 * Canonical LF-delimited Markdown. Line text is otherwise byte-preserved;
	 * a source BOM is deliberately omitted so it can never be pasted mid-file.
	 */
	readonly markdown: string;
	readonly lines: readonly string[];
	readonly root: MindMapClipboardNode;
}

/**
 * Versioned, renderer-independent clipboard data. `markdown` is suitable for
 * the operating-system text clipboard while `branches` retains enough source
 * structure for a checked ObMind paste.
 */
export interface MindMapClipboardPayload {
	readonly kind: typeof MIND_MAP_CLIPBOARD_KIND;
	readonly version: typeof MIND_MAP_CLIPBOARD_VERSION;
	readonly branches: readonly MindMapClipboardBranch[];
	readonly markdown: string;
	readonly integrityRevision: string;
}

export interface NodeCopyRequest {
	readonly document: MindMapDocument;
	readonly content: string;
	readonly sourceRevision: string;
	readonly nodeIds: readonly string[];
}

export interface NodePasteRequest {
	readonly document: MindMapDocument;
	readonly content: string;
	readonly sourceRevision: string;
	readonly targetNodeId: string;
	readonly placement: NodePastePlacement;
	readonly payload: MindMapClipboardPayload;
}

export interface NodePastePlan {
	readonly updatedContent: string;
	readonly placement: NodePastePlacement;
	readonly insertedRootLines: readonly number[];
	readonly insertedNodeCount: number;
	readonly insertionOffset: number;
	readonly insertionText: string;
	readonly replacementStartOffset: number;
	readonly replacementEndOffset: number;
	readonly replacementText: string;
}

interface TransformedBranch {
	readonly lines: readonly string[];
	readonly expectedRoot: MindMapClipboardNode;
}

interface PasteStrategy {
	readonly boundaryLine: number;
	readonly expectedParentId: string;
	readonly destinationHeadingLevel: number | null;
	readonly destinationListIndent: string | null;
}

interface AppliedInsertion {
	readonly updatedContent: string;
	readonly insertionOffset: number;
	readonly insertionText: string;
	readonly firstSourceLine: number;
}

interface ContiguousReplacement {
	readonly startOffset: number;
	readonly endOffset: number;
	readonly text: string;
}

/**
 * Capture one or more non-overlapping structural branches.
 *
 * Selected descendants covered by a selected ancestor are omitted and the
 * remaining branches are ordered by source position. A heading branch owns
 * its complete section (including prose and fenced blocks); a list branch
 * owns its parsed list subtree. No source is modified.
 */
export function createNodeClipboardPayload(
	request: NodeCopyRequest,
): MindMapClipboardPayload {
	assertCurrentRevision(
		request.document,
		request.content,
		request.sourceRevision,
		"copy",
	);
	const nodeIds = [...new Set(request.nodeIds)];
	if (nodeIds.length === 0) {
		throw new NodeClipboardError(
			"empty-selection",
			"At least one node must be selected for copying.",
		);
	}

	const snapshotIndex = indexMindMapNodes(request.document.root);
	const snapshotEntries = nodeIds.map((nodeId) =>
		requireSnapshotNode(snapshotIndex, nodeId),
	);
	for (const entry of snapshotEntries) {
		if (entry.node.kind === "root") {
			throw new NodeClipboardError(
				"root-copy-not-supported",
				"The document root is not a copyable branch.",
			);
		}
	}
	const effectiveEntries = removeCoveredDescendants(
		snapshotEntries,
		snapshotIndex,
	).sort(
		(left, right) =>
			left.node.source.line - right.node.source.line,
	);

	const currentDocument = parseMarkdown(
		request.content,
		request.document.root.source.path,
		request.document.root.text,
	);
	const currentIndex = indexMindMapNodes(currentDocument.root);
	const split = splitMutationContent(request.content);
	const branches = effectiveEntries.map((snapshotEntry) => {
		const currentEntry = currentIndex.get(snapshotEntry.node.id);
		if (
			currentEntry === undefined ||
			!sameNodeSourceFacts(
				snapshotEntry.node,
				currentEntry.node,
			) ||
			snapshotEntry.parent?.id !== currentEntry.parent?.id
		) {
			throw new NodeClipboardError(
				"stale-node",
				`Node "${snapshotEntry.node.id}" no longer matches the displayed tree.`,
			);
		}
		if (currentEntry.node.kind === "root") {
			throw new NodeClipboardError(
				"root-copy-not-supported",
				"The document root is not a copyable branch.",
			);
		}
		return createClipboardBranch(
			currentEntry.node,
			currentIndex,
			split,
		);
	});
	// A version-1 payload is one pasteable sibling group. Reject a mixed
	// heading/list selection before a cut can remove the source and leave an
	// internal clipboard that no supported destination can consume.
	getUniformClipboardBranchKind(branches);

	const markdown = branches
		.map((branch) => branch.markdown)
		.join("\n");
	const payloadWithoutRevision = {
		kind: MIND_MAP_CLIPBOARD_KIND,
		version: MIND_MAP_CLIPBOARD_VERSION,
		branches,
		markdown,
	} as const;
	return {
		...payloadWithoutRevision,
		integrityRevision: createClipboardIntegrityRevision(
			payloadWithoutRevision,
		),
	};
}

/**
 * Paste a checked clipboard payload as target children or immediately after
 * the target as siblings. The source branch's inline Markdown, body text,
 * blank lines, and fenced blocks are retained. Structural markers are changed
 * only where required to express the destination relationship.
 */
export function planNodePasteInContent(
	request: NodePasteRequest,
): NodePastePlan {
	assertCurrentRevision(
		request.document,
		request.content,
		request.sourceRevision,
		"paste",
	);
	assertValidClipboardPayload(request.payload);

	const snapshotIndex = indexMindMapNodes(request.document.root);
	const snapshotTarget = requireSnapshotNode(
		snapshotIndex,
		request.targetNodeId,
	);
	if (
		snapshotTarget.node.kind === "root" &&
		request.placement === "sibling"
	) {
		throw new NodeClipboardError(
			"root-sibling-not-supported",
			"The document root cannot have a Markdown sibling.",
		);
	}

	const currentDocument = parseMarkdown(
		request.content,
		request.document.root.source.path,
		request.document.root.text,
	);
	const currentIndex = indexMindMapNodes(currentDocument.root);
	const target = currentIndex.get(request.targetNodeId);
	if (
		target === undefined ||
		!sameNodeSourceFacts(snapshotTarget.node, target.node) ||
		snapshotTarget.parent?.id !== target.parent?.id
	) {
		throw new NodeClipboardError(
			"stale-node",
			"The paste target no longer matches the displayed tree.",
		);
	}

	const branchKind = getUniformBranchKind(request.payload);
	const split = splitMutationContent(request.content);
	const strategy = createPasteStrategy(
		target,
		currentIndex,
		split,
		request.placement,
		branchKind,
	);
	const transformedBranches = request.payload.branches.map(
		(branch) =>
			transformClipboardBranch(
				branch,
				strategy.destinationHeadingLevel,
				strategy.destinationListIndent,
			),
	);
	const flattenedLines: string[] = [];
	const rootLineOffsets: number[] = [];
	for (const branch of transformedBranches) {
		rootLineOffsets.push(flattenedLines.length);
		flattenedLines.push(...branch.lines);
	}
	if (flattenedLines.length === 0) {
		throw invalidPayloadError(
			"The clipboard payload contains no Markdown lines.",
		);
	}

	const applied = applyClipboardInsertion(
		request.content,
		split,
		strategy.boundaryLine,
		flattenedLines,
	);
	const insertedRootLines = rootLineOffsets.map(
		(offset) => applied.firstSourceLine + offset,
	);
	assertSafePasteResult({
		content: applied.updatedContent,
		path: request.document.root.source.path,
		basename: request.document.root.text,
		expectedParentId: strategy.expectedParentId,
		expectedRoots: transformedBranches.map(
			(branch) => branch.expectedRoot,
		),
		insertedRootLines,
	});
	const replacement = createContiguousReplacement(
		request.content,
		applied.updatedContent,
	);

	return {
		updatedContent: applied.updatedContent,
		placement: request.placement,
		insertedRootLines,
		insertedNodeCount: request.payload.branches.reduce(
			(count, branch) => count + countClipboardNodes(branch.root),
			0,
		),
		insertionOffset: applied.insertionOffset,
		insertionText: applied.insertionText,
		replacementStartOffset: replacement.startOffset,
		replacementEndOffset: replacement.endOffset,
		replacementText: replacement.text,
	};
}

export function serializeNodeClipboardPayload(
	payload: MindMapClipboardPayload,
): string {
	assertValidClipboardPayload(payload);
	return JSON.stringify(payload);
}

export function parseNodeClipboardPayload(
	value: string,
): MindMapClipboardPayload {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw invalidPayloadError("Clipboard data is not valid JSON.");
	}
	assertValidClipboardPayload(parsed);
	return parsed;
}

function assertCurrentRevision(
	document: MindMapDocument,
	content: string,
	sourceRevision: string,
	operation: "copy" | "paste",
): void {
	if (
		document.sourceRevision !== sourceRevision ||
		createMarkdownSourceRevision(content) !== sourceRevision
	) {
		throw new NodeClipboardError(
			"stale-source",
			`The Markdown source changed after the ${operation} gesture began.`,
		);
	}
}

function requireSnapshotNode(
	index: ReadonlyMap<string, IndexedMindMapNode>,
	nodeId: string,
): IndexedMindMapNode {
	const entry = index.get(nodeId);
	if (entry !== undefined) {
		return entry;
	}
	throw new NodeClipboardError(
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

function createClipboardBranch(
	node: Exclude<MindMapNode, { readonly kind: "root" }>,
	index: ReadonlyMap<string, IndexedMindMapNode>,
	split: SplitMutationContent,
): MindMapClipboardBranch {
	const unsupportedLine = findUnsupportedListContinuationLine(
		node,
		index,
		split.lines,
		split.contentLineCount,
	);
	if (unsupportedLine !== null) {
		throw new NodeClipboardError(
			"unsafe-source-range",
			`List body content on line ${unsupportedLine + 1} is not safe to copy structurally yet.`,
		);
	}
	let sourceRange: StructuralSourceRange;
	try {
		sourceRange = getStructuralSourceRange(
			node,
			index,
			split.contentLineCount,
		);
	} catch (error: unknown) {
		throw new NodeClipboardError(
			"unsafe-source-range",
			error instanceof Error
				? error.message
				: "The branch source range is invalid.",
		);
	}
	if (!rangeContainsOnlySubtree(node, sourceRange, index)) {
		throw new NodeClipboardError(
			"unsafe-source-range",
			"The branch range contains a structural node outside its subtree.",
		);
	}
	const lines = split.lines
		.slice(sourceRange.startLine, sourceRange.endLineExclusive)
		.map((line) => line.text);
	if (lines.length === 0) {
		throw new NodeClipboardError(
			"unsafe-source-range",
			"The branch source range is empty.",
		);
	}
	return {
		sourcePath: node.source.path,
		sourceNodeId: node.id,
		sourceRange,
		markdown: lines.join("\n"),
		lines,
		root: toClipboardNode(node, sourceRange.startLine),
	};
}

function toClipboardNode(
	node: MindMapNode,
	rangeStartLine: number,
): MindMapClipboardNode {
	if (node.kind === "root") {
		throw new NodeClipboardError(
			"root-copy-not-supported",
			"The document root cannot be represented as a clipboard branch.",
		);
	}
	const base = {
		sourceLineOffset: node.source.line - rangeStartLine,
		text: node.text,
		children: node.children.map((child) =>
			toClipboardNode(child, rangeStartLine),
		),
	};
	if (node.kind === "heading") {
		return {
			...base,
			kind: "heading",
			level: node.level,
		};
	}
	return {
		...base,
		kind: "list",
		marker: node.marker,
		ordered: node.ordered,
		ordinal: node.ordinal,
		taskState: node.taskState,
	};
}

function getUniformBranchKind(
	payload: MindMapClipboardPayload,
): "heading" | "list" {
	return getUniformClipboardBranchKind(payload.branches);
}

function getUniformClipboardBranchKind(
	branches: readonly MindMapClipboardBranch[],
): "heading" | "list" {
	const first = branches[0]?.root.kind;
	if (first === undefined) {
		throw new NodeClipboardError(
			"empty-payload",
			"The clipboard payload has no branches.",
		);
	}
	if (
		branches.some(
			(branch) => branch.root.kind !== first,
		)
	) {
		throw new NodeClipboardError(
			"mixed-branch-kinds",
			"Heading and list branches cannot be pasted as one sibling group.",
		);
	}
	return first;
}

function createPasteStrategy(
	target: IndexedMindMapNode,
	index: ReadonlyMap<string, IndexedMindMapNode>,
	split: SplitMutationContent,
	placement: NodePastePlacement,
	branchKind: "heading" | "list",
): PasteStrategy {
	if (branchKind === "heading") {
		if (
			target.node.kind === "list" ||
			(placement === "sibling" && target.node.kind !== "heading")
		) {
			throw new NodeClipboardError(
				"unsupported-target",
				"A heading branch can be pasted only under a heading/root or beside a heading.",
			);
		}
		const expectedParent =
			placement === "child"
				? target.node
				: target.parent;
		if (expectedParent === null) {
			throw new NodeClipboardError(
				"unsupported-target",
				"The heading sibling parent is unavailable.",
			);
		}
		const destinationHeadingLevel =
			target.node.kind === "root"
				? 1
				: placement === "child"
					? target.node.level + 1
					: target.node.level;
		return {
			boundaryLine:
				target.node.kind === "root"
					? split.contentLineCount
						: getCheckedSourceRange(
								target.node,
								index,
								split,
							).endLineExclusive,
			expectedParentId: expectedParent.id,
			destinationHeadingLevel,
			destinationListIndent: null,
		};
	}

	if (placement === "sibling") {
		if (target.node.kind !== "list" || target.parent === null) {
			throw new NodeClipboardError(
				"unsupported-target",
				"A list branch can be pasted as a sibling only beside another list item.",
			);
		}
		return {
				boundaryLine: getCheckedSourceRange(
					target.node,
					index,
					split,
				).endLineExclusive,
			expectedParentId: target.parent.id,
			destinationHeadingLevel: null,
			destinationListIndent: getListIndent(
				target.node,
				split,
			),
		};
	}

	if (target.node.kind === "list") {
		return {
				boundaryLine: getCheckedSourceRange(
					target.node,
					index,
					split,
				).endLineExclusive,
			expectedParentId: target.node.id,
			destinationHeadingLevel: null,
			destinationListIndent: getListChildIndent(
				target.node,
				split,
			),
		};
	}
	return {
		boundaryLine: findListChildBoundary(
			target.node,
			index,
			split,
		),
		expectedParentId: target.node.id,
		destinationHeadingLevel: null,
		destinationListIndent:
			target.node.kind === "root"
				? getRootListIndent(target.node, split)
				: getHeadingListIndent(target.node, split),
	};
}

function getCheckedSourceRange(
	node: MindMapNode,
	index: ReadonlyMap<string, IndexedMindMapNode>,
	split: SplitMutationContent,
): StructuralSourceRange {
	try {
		const unsupportedLine = findUnsupportedListContinuationLine(
			node,
			index,
			split.lines,
			split.contentLineCount,
		);
		if (unsupportedLine !== null) {
			throw new Error(
				`List body content on line ${unsupportedLine + 1} is not safe to restructure yet.`,
			);
		}
		const range = getStructuralSourceRange(
			node,
			index,
			split.contentLineCount,
		);
		if (!rangeContainsOnlySubtree(node, range, index)) {
			throw new Error(
				"The source range contains a node outside the target subtree.",
			);
		}
		return range;
	} catch (error: unknown) {
		throw new NodeClipboardError(
			"unsafe-source-range",
			error instanceof Error
				? error.message
				: "The source range is invalid.",
		);
	}
}

function findListChildBoundary(
	target: MindMapNode,
	index: ReadonlyMap<string, IndexedMindMapNode>,
	split: SplitMutationContent,
): number {
	if (target.kind === "list") {
		return getCheckedSourceRange(
			target,
			index,
			split,
		).endLineExclusive;
	}
	const firstHeadingChild = target.children.find(
		(child) => child.kind === "heading",
	);
	if (firstHeadingChild !== undefined) {
		return firstHeadingChild.source.line;
	}
	if (target.kind === "root") {
		return split.contentLineCount;
	}
	return getCheckedSourceRange(
		target,
		index,
		split,
	).endLineExclusive;
}

function getListIndent(
	node: Extract<MindMapNode, { readonly kind: "list" }>,
	split: SplitMutationContent,
): string {
	const sourceLine = split.lines[node.source.line];
	if (sourceLine === undefined) {
		throw new NodeClipboardError(
			"unsafe-source-range",
			"The list source line no longer exists.",
		);
	}
	return getLeadingWhitespace(sourceLine.text);
}

function getListChildIndent(
	node: Extract<MindMapNode, { readonly kind: "list" }>,
	split: SplitMutationContent,
): string {
	const child = node.children.find(
		(candidate) => candidate.kind === "list",
	);
	if (child?.kind === "list") {
		return getListIndent(child, split);
	}
	const parentIndent = getListIndent(node, split);
	return parentIndent + (/^\t+$/.test(parentIndent) ? "\t" : "  ");
}

function getRootListIndent(
	node: Extract<MindMapNode, { readonly kind: "root" }>,
	split: SplitMutationContent,
): string {
	const child = node.children.find(
		(candidate) => candidate.kind === "list",
	);
	return child?.kind === "list" ? getListIndent(child, split) : "";
}

function getHeadingListIndent(
	node: Extract<MindMapNode, { readonly kind: "heading" }>,
	split: SplitMutationContent,
): string {
	const child = node.children.find(
		(candidate) => candidate.kind === "list",
	);
	return child?.kind === "list" ? getListIndent(child, split) : "";
}

function transformClipboardBranch(
	branch: MindMapClipboardBranch,
	destinationHeadingLevel: number | null,
	destinationListIndent: string | null,
): TransformedBranch {
	const lines = [...branch.lines];
	if (branch.root.kind === "heading") {
		if (destinationHeadingLevel === null) {
			throw new NodeClipboardError(
				"unsupported-target",
				"A heading destination level is required.",
			);
		}
		const levelDelta =
			destinationHeadingLevel - branch.root.level;
		transformClipboardHeadingLines(
			branch.root,
			lines,
			levelDelta,
		);
		return {
			lines,
			expectedRoot: transformExpectedClipboardNode(
				branch.root,
				levelDelta,
			),
		};
	}
	if (destinationListIndent === null) {
		throw new NodeClipboardError(
			"unsupported-target",
			"A list destination indentation is required.",
		);
	}
	transformClipboardListLines(
		branch.root,
		lines,
		destinationListIndent,
	);
	return {
		lines,
		expectedRoot: branch.root,
	};
}

function transformClipboardHeadingLines(
	root: MindMapClipboardHeading,
	lines: string[],
	levelDelta: number,
): void {
	for (const node of collectClipboardNodes(root)) {
		if (node.kind !== "heading") {
			continue;
		}
		const nextLevel = node.level + levelDelta;
		if (nextLevel < 1 || nextLevel > 6) {
			throw new NodeClipboardError(
				"heading-level-limit",
				"Pasting this branch would exceed Markdown heading levels.",
			);
		}
		const line = lines[node.sourceLineOffset];
		const match =
			line === undefined
				? null
				: /^( {0,3})(#{1,6})(?=[ \t]|$)/.exec(line);
		if (
			line === undefined ||
			match === null ||
			(match[2]?.length ?? 0) !== node.level
		) {
			throw invalidPayloadError(
				"A clipboard heading marker does not match its structured node.",
			);
		}
		lines[node.sourceLineOffset] =
			(match[1] ?? "") +
			"#".repeat(nextLevel) +
			line.slice(match[0].length);
	}
}

function transformClipboardListLines(
	root: MindMapClipboardList,
	lines: string[],
	destinationIndent: string,
): void {
	const rootLine = lines[root.sourceLineOffset];
	if (rootLine === undefined) {
		throw invalidPayloadError(
			"The clipboard list root source line is missing.",
		);
	}
	const sourceIndent = getLeadingWhitespace(rootLine);
	for (const node of collectClipboardNodes(root)) {
		if (node.kind !== "list") {
			throw invalidPayloadError(
				"A list clipboard branch contains a heading child.",
			);
		}
		const line = lines[node.sourceLineOffset];
		if (line === undefined) {
			throw invalidPayloadError(
				"A clipboard list descendant source line is missing.",
			);
		}
		const indent = getLeadingWhitespace(line);
		if (!indent.startsWith(sourceIndent)) {
			throw new NodeClipboardError(
				"unsupported-target",
				"Mixed list indentation cannot be shifted safely.",
			);
		}
		lines[node.sourceLineOffset] =
			destinationIndent + line.slice(sourceIndent.length);
	}
}

function transformExpectedClipboardNode(
	node: MindMapClipboardNode,
	headingLevelDelta: number,
): MindMapClipboardNode {
	const children = node.children.map((child) =>
		transformExpectedClipboardNode(child, headingLevelDelta),
	);
	if (node.kind === "heading") {
		return {
			...node,
			level: node.level + headingLevelDelta,
			children,
		};
	}
	return {
		...node,
		children,
	};
}

function applyClipboardInsertion(
	content: string,
	split: SplitMutationContent,
	boundaryLine: number,
	lines: readonly string[],
): AppliedInsertion {
	const block = lines.join(split.preferredTerminator);
	if (content.length === 0) {
		return {
			updatedContent: block,
			insertionOffset: 0,
			insertionText: block,
			firstSourceLine: 0,
		};
	}
	if (boundaryLine < 0 || boundaryLine > split.contentLineCount) {
		throw new NodeClipboardError(
			"unsafe-insertion-boundary",
			"The paste boundary is outside the Markdown buffer.",
		);
	}
	if (boundaryLine < split.contentLineCount) {
		const insertionOffset = getLineStartOffset(split, boundaryLine);
		const insertionText =
			block + split.preferredTerminator;
		return {
			updatedContent:
				content.slice(0, insertionOffset) +
				insertionText +
				content.slice(insertionOffset),
			insertionOffset,
			insertionText,
			firstSourceLine: boundaryLine,
		};
	}

	const hasTrailingTerminator = /(?:\r\n|\n|\r)$/.test(content);
	const insertionText = hasTrailingTerminator
		? block + split.preferredTerminator
		: split.preferredTerminator + block;
	return {
		updatedContent: content + insertionText,
		insertionOffset: content.length,
		insertionText,
		firstSourceLine: split.contentLineCount,
	};
}

function assertSafePasteResult(options: {
	readonly content: string;
	readonly path: string;
	readonly basename: string;
	readonly expectedParentId: string;
	readonly expectedRoots: readonly MindMapClipboardNode[];
	readonly insertedRootLines: readonly number[];
}): void {
	const document = parseMarkdown(
		options.content,
		options.path,
		options.basename,
	);
	const index = indexMindMapNodes(document.root);
	for (let branchIndex = 0; branchIndex < options.expectedRoots.length; branchIndex += 1) {
		const expected = options.expectedRoots[branchIndex];
		const sourceLine = options.insertedRootLines[branchIndex];
		if (expected === undefined || sourceLine === undefined) {
			throw new NodeClipboardError(
				"unsafe-result",
				"The pasted branch mapping is incomplete.",
			);
		}
		const actual = findMindMapNodeAtLine(document.root, sourceLine);
		if (
			actual === null ||
			!clipboardNodeMatchesMindMapNode(expected, actual) ||
			index.get(actual.id)?.parent?.id !==
				options.expectedParentId
		) {
			throw new NodeClipboardError(
				"unsafe-result",
				"The pasted Markdown does not create the requested branch relationship.",
			);
		}
	}
}

function clipboardNodeMatchesMindMapNode(
	expected: MindMapClipboardNode,
	actual: MindMapNode,
): boolean {
	if (
		actual.kind === "root" ||
		expected.kind !== actual.kind ||
		expected.text !== actual.text ||
		expected.children.length !== actual.children.length
	) {
		return false;
	}
	if (
		expected.kind === "heading" &&
		(actual.kind !== "heading" ||
			expected.level !== actual.level)
	) {
		return false;
	}
	if (
		expected.kind === "list" &&
		(actual.kind !== "list" ||
			expected.marker !== actual.marker ||
			expected.ordered !== actual.ordered ||
			expected.ordinal !== actual.ordinal ||
			expected.taskState !== actual.taskState)
	) {
		return false;
	}
	return expected.children.every((child, index) => {
		const actualChild = actual.children[index];
		return (
			actualChild !== undefined &&
			clipboardNodeMatchesMindMapNode(child, actualChild)
		);
	});
}

function assertValidClipboardPayload(
	value: unknown,
): asserts value is MindMapClipboardPayload {
	if (!isRecord(value)) {
		throw invalidPayloadError("Clipboard data must be an object.");
	}
	if (
		value.kind !== MIND_MAP_CLIPBOARD_KIND ||
		value.version !== MIND_MAP_CLIPBOARD_VERSION
	) {
		throw invalidPayloadError(
			"The clipboard payload kind or version is unsupported.",
		);
	}
	if (
		!Array.isArray(value.branches) ||
		value.branches.length === 0
	) {
		throw new NodeClipboardError(
			"empty-payload",
			"The clipboard payload has no branches.",
		);
	}
	if (
		typeof value.markdown !== "string" ||
		typeof value.integrityRevision !== "string"
	) {
		throw invalidPayloadError(
			"The clipboard payload metadata is incomplete.",
		);
	}
	for (const branch of value.branches) {
		assertValidClipboardBranch(branch);
	}
	const typedBranches =
		value.branches as unknown as readonly MindMapClipboardBranch[];
	if (
		value.markdown !==
		typedBranches.map((branch) => branch.markdown).join("\n")
	) {
		throw invalidPayloadError(
			"The clipboard plain Markdown does not match its branches.",
		);
	}
	const expectedRevision = createClipboardIntegrityRevision({
		kind: MIND_MAP_CLIPBOARD_KIND,
		version: MIND_MAP_CLIPBOARD_VERSION,
		branches: typedBranches,
		markdown: value.markdown,
	});
	if (value.integrityRevision !== expectedRevision) {
		throw invalidPayloadError(
			"The clipboard payload failed its integrity check.",
		);
	}
}

function assertValidClipboardBranch(value: unknown): void {
	if (!isRecord(value)) {
		throw invalidPayloadError(
			"A clipboard branch must be an object.",
		);
	}
	if (
		typeof value.sourcePath !== "string" ||
		typeof value.sourceNodeId !== "string" ||
		typeof value.markdown !== "string" ||
		!Array.isArray(value.lines) ||
		!value.lines.every((line) => typeof line === "string") ||
		!isRecord(value.sourceRange)
	) {
		throw invalidPayloadError(
			"A clipboard branch has invalid source metadata.",
		);
	}
	if (
		!Number.isInteger(value.sourceRange.startLine) ||
		!Number.isInteger(value.sourceRange.endLineExclusive) ||
		(value.sourceRange.startLine as number) < 0 ||
		(value.sourceRange.endLineExclusive as number) <=
			(value.sourceRange.startLine as number) ||
		value.markdown !== value.lines.join("\n")
	) {
		throw invalidPayloadError(
			"A clipboard branch has an invalid line range.",
		);
	}
	assertValidClipboardNode(value.root, value.lines.length);
}

function assertValidClipboardNode(
	value: unknown,
	lineCount: number,
): void {
	if (
		!isRecord(value) ||
		(value.kind !== "heading" && value.kind !== "list") ||
		typeof value.text !== "string" ||
		!Number.isInteger(value.sourceLineOffset) ||
		(value.sourceLineOffset as number) < 0 ||
		(value.sourceLineOffset as number) >= lineCount ||
		!Array.isArray(value.children)
	) {
		throw invalidPayloadError(
			"A clipboard node has invalid common fields.",
		);
	}
	if (
		value.kind === "heading" &&
		(!Number.isInteger(value.level) ||
			(value.level as number) < 1 ||
			(value.level as number) > 6)
	) {
		throw invalidPayloadError(
			"A clipboard heading has an invalid level.",
		);
	}
	if (
		value.kind === "list" &&
		(typeof value.marker !== "string" ||
			typeof value.ordered !== "boolean" ||
			(value.ordinal !== null &&
				!Number.isInteger(value.ordinal)) ||
			(value.taskState !== null &&
				value.taskState !== "checked" &&
				value.taskState !== "unchecked"))
	) {
		throw invalidPayloadError(
			"A clipboard list node has invalid marker metadata.",
		);
	}
	for (const child of value.children) {
		assertValidClipboardNode(child, lineCount);
	}
}

function createClipboardIntegrityRevision(
	payload: Omit<MindMapClipboardPayload, "integrityRevision">,
): string {
	return createMarkdownSourceRevision(JSON.stringify(payload));
}

function collectClipboardNodes(
	root: MindMapClipboardNode,
): MindMapClipboardNode[] {
	const result: MindMapClipboardNode[] = [];
	const pending = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		result.push(node);
		for (
			let index = node.children.length - 1;
			index >= 0;
			index -= 1
		) {
			const child = node.children[index];
			if (child !== undefined) {
				pending.push(child);
			}
		}
	}
	return result;
}

function countClipboardNodes(root: MindMapClipboardNode): number {
	return collectClipboardNodes(root).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
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

function invalidPayloadError(message: string): NodeClipboardError {
	return new NodeClipboardError("invalid-payload", message);
}
