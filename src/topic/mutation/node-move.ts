import type {
	HeadingMindMapNode,
	ListMindMapNode,
	MindMapDocument,
	MindMapNode,
	SourceLocation,
} from "../../core/model";
import {
	createMarkdownSourceRevision,
	parseMarkdown,
} from "../../core/parser";
import { findUnsupportedListContinuationLine } from "./node-mutation";

export type NodeMovePlacement = "before" | "after" | "child";

export type NodeMoveErrorCode =
	| "heading-level-limit"
	| "not-siblings"
	| "root-source-not-supported"
	| "root-target-not-supported"
	| "same-node"
	| "source-node-not-found"
	| "stale-node"
	| "stale-source"
	| "target-inside-source"
	| "target-node-not-found"
	| "unsafe-result"
	| "unsafe-source-range"
	| "unsupported-structure";

export class NodeMoveError extends Error {
	public constructor(
		public readonly code: NodeMoveErrorCode,
		message: string,
	) {
		super(message);
		this.name = "NodeMoveError";
	}
}

export interface NodeMoveRequest {
	/** Exact parsed snapshot displayed when the explicit drag gesture began. */
	readonly document: MindMapDocument;
	/** Exact current Markdown buffer. It is never mutated by this planner. */
	readonly content: string;
	readonly sourceRevision: string;
	readonly sourceNodeId: string;
	readonly targetNodeId: string;
	readonly placement: NodeMovePlacement;
}

export interface NodeMoveLineRange {
	readonly startLine: number;
	readonly endLineExclusive: number;
}

export interface NodeMovePlan {
	readonly updatedContent: string;
	readonly changed: boolean;
	readonly placement: NodeMovePlacement;
	readonly originalRange: NodeMoveLineRange;
	readonly movedRange: NodeMoveLineRange;
	readonly movedSourceLine: number;
	readonly targetSourceLine: number;
	/**
	 * One contiguous replacement that transforms the exact input buffer into
	 * `updatedContent`. The editor host can apply this without replacing the
	 * complete document.
	 */
	readonly replacementStartOffset: number;
	readonly replacementEndOffset: number;
	readonly replacementText: string;
}

export interface MindMapNodeMoveResult {
	readonly nodeId: string;
	readonly source: SourceLocation;
	readonly changed: boolean;
}

interface IndexedNode {
	readonly node: MindMapNode;
	readonly parent: MindMapNode | null;
	readonly childIndex: number;
}

interface SourceLine {
	readonly text: string;
	readonly terminator: string;
	readonly originLine: number;
}

interface SplitContent {
	readonly byteOrderMark: string;
	readonly lines: readonly SourceLine[];
	readonly contentLineCount: number;
	readonly preferredTerminator: string;
}

interface MoveStrategy {
	readonly destinationLine: number;
	readonly headingLevelDelta: number;
	readonly listIndent: string | null;
}

interface ContiguousReplacement {
	readonly startOffset: number;
	readonly endOffset: number;
	readonly text: string;
}

/**
 * Plan a checked source-level node move without touching Obsidian or the DOM.
 *
 * A heading owns its complete Markdown section through the line before the
 * next heading of the same or a higher rank. A list item owns its structural
 * subtree through the last parsed descendant line. This intentionally does
 * not claim support for CommonMark list continuation paragraphs.
 */
export function planNodeMoveInContent(
	request: NodeMoveRequest,
): NodeMovePlan {
	assertCurrentRevision(request);

	const snapshotIndex = indexNodes(request.document.root);
	const snapshotSource = requireIndexedNode(
		snapshotIndex,
		request.sourceNodeId,
		"source",
	);
	const snapshotTarget = requireIndexedNode(
		snapshotIndex,
		request.targetNodeId,
		"target",
	);
	assertMovableEndpoints(
		snapshotSource.node,
		snapshotTarget.node,
		request.placement,
	);

	const currentDocument = parseMarkdown(
		request.content,
		request.document.root.source.path,
		request.document.root.text,
	);
	const currentIndex = indexNodes(currentDocument.root);
	const source = requireCurrentNode(
		currentIndex,
		request.sourceNodeId,
		"source",
	);
	const target = requireCurrentNode(
		currentIndex,
		request.targetNodeId,
		"target",
	);
	assertSameNodeFacts(snapshotSource.node, source.node);
	assertSameNodeFacts(snapshotTarget.node, target.node);
	assertSameParent(snapshotSource, source);
	assertSameParent(snapshotTarget, target);

	const sourceSubtreeIds = collectSubtreeIds(source.node);
	if (sourceSubtreeIds.has(target.node.id)) {
		throw new NodeMoveError(
			"target-inside-source",
			"A node cannot be moved into its own subtree.",
		);
	}
	if (request.placement !== "child") {
		assertRelativeMove(source, target);
	}

	const split = splitContent(request.content);
	for (const endpoint of [source.node, target.node]) {
		const unsupportedLine = findUnsupportedListContinuationLine(
			endpoint,
			currentIndex,
			split.lines,
			split.contentLineCount,
		);
		if (unsupportedLine !== null) {
			throw new NodeMoveError(
				"unsafe-source-range",
				`List body content on line ${unsupportedLine + 1} is not safe to restructure yet.`,
			);
		}
	}
	const sourceRange = getNodeSourceRange(
		source.node,
		currentIndex,
		split.contentLineCount,
	);
	const targetRange = getNodeSourceRange(
		target.node,
		currentIndex,
		split.contentLineCount,
	);
	assertRangeContainsOnlySubtree(
		source.node,
		sourceRange,
		currentIndex,
	);

	const strategy = createMoveStrategy(
		source,
		target,
		request.placement,
		targetRange,
		split.lines,
	);
	const movedLines = transformMovedLines(
		source.node,
		sourceRange,
		split.lines.slice(
			sourceRange.startLine,
			sourceRange.endLineExclusive,
		),
		strategy,
	);
	const reordered = reorderLines(
		split.lines,
		sourceRange,
		strategy.destinationLine,
		movedLines,
	);
	const updatedContent = joinContent(
		reordered.lines,
		split.byteOrderMark,
		split.preferredTerminator,
	);
	const movedSourceLine = findOriginLine(
		reordered.lines,
		source.node.source.line,
	);
	const targetSourceLine =
		target.node.kind === "root"
			? 0
			: findOriginLine(
					reordered.lines,
					target.node.source.line,
				);
	const movedRange = {
		startLine: reordered.insertionLine,
		endLineExclusive:
			reordered.insertionLine + movedLines.length,
	};
	const changed = updatedContent !== request.content;
	const replacement = createContiguousReplacement(
		request.content,
		updatedContent,
	);

	assertSafeResult({
		content: updatedContent,
		path: request.document.root.source.path,
		basename: request.document.root.text,
		sourceBefore: source.node,
		targetBefore: target.node,
		placement: request.placement,
		headingLevelDelta: strategy.headingLevelDelta,
		movedSourceLine,
		targetSourceLine,
	});

	return {
		updatedContent,
		changed,
		placement: request.placement,
		originalRange: sourceRange,
		movedRange,
		movedSourceLine,
		targetSourceLine,
		replacementStartOffset: replacement.startOffset,
		replacementEndOffset: replacement.endOffset,
		replacementText: replacement.text,
	};
}

function assertCurrentRevision(request: NodeMoveRequest): void {
	if (
		request.document.sourceRevision !== request.sourceRevision ||
		createMarkdownSourceRevision(request.content) !==
			request.sourceRevision
	) {
		throw new NodeMoveError(
			"stale-source",
			"The Markdown source changed after the drag gesture began.",
		);
	}
}

function requireIndexedNode(
	index: ReadonlyMap<string, IndexedNode>,
	nodeId: string,
	role: "source" | "target",
): IndexedNode {
	const entry = index.get(nodeId);
	if (entry !== undefined) {
		return entry;
	}
	throw new NodeMoveError(
		role === "source"
			? "source-node-not-found"
			: "target-node-not-found",
		`The ${role} node is not present in the displayed document snapshot.`,
	);
}

function requireCurrentNode(
	index: ReadonlyMap<string, IndexedNode>,
	nodeId: string,
	role: "source" | "target",
): IndexedNode {
	const entry = index.get(nodeId);
	if (entry !== undefined) {
		return entry;
	}
	throw new NodeMoveError(
		"stale-node",
		`The ${role} node is no longer present at its mapped source line.`,
	);
}

function assertMovableEndpoints(
	source: MindMapNode,
	target: MindMapNode,
	placement: NodeMovePlacement,
): void {
	if (source.kind === "root") {
		throw new NodeMoveError(
			"root-source-not-supported",
			"The document root cannot be moved.",
		);
	}
	if (target.kind === "root" && placement !== "child") {
		throw new NodeMoveError(
			"root-target-not-supported",
			"The document root supports child drops only.",
		);
	}
	if (source.id === target.id) {
		throw new NodeMoveError(
			"same-node",
			"A node cannot be moved relative to itself.",
		);
	}
}

function assertSameParent(
	snapshot: IndexedNode,
	current: IndexedNode,
): void {
	if (snapshot.parent?.id !== current.parent?.id) {
		throw new NodeMoveError(
			"stale-node",
			"The node parent no longer matches the displayed tree.",
		);
	}
}

function assertRelativeMove(
	source: IndexedNode,
	target: IndexedNode,
): void {
	if (
		source.parent === null ||
		target.parent === null
	) {
		throw new NodeMoveError(
			"not-siblings",
			"Before/after moves require a source-backed target parent.",
		);
	}
	if (source.node.kind !== target.node.kind) {
		throw new NodeMoveError(
			"unsupported-structure",
			"Mixed heading/list sibling order cannot be represented safely.",
		);
	}
}

function createMoveStrategy(
	source: IndexedNode,
	target: IndexedNode,
	placement: NodeMovePlacement,
	targetRange: NodeMoveLineRange,
	lines: readonly SourceLine[],
): MoveStrategy {
	if (source.node.kind === "heading") {
		if (
			target.node.kind !== "heading" &&
			target.node.kind !== "root"
		) {
			throw new NodeMoveError(
				"unsupported-structure",
				"A heading subtree cannot become a list-item child without changing its node kind.",
			);
		}
		const desiredLevel =
			target.node.kind === "root"
				? 1
				: placement === "child"
					? target.node.level + 1
					: target.node.level;
		return {
			destinationLine:
				placement === "before"
					? targetRange.startLine
					: targetRange.endLineExclusive,
			headingLevelDelta: desiredLevel - source.node.level,
			listIndent: null,
		};
	}

	if (source.node.kind === "root") {
		throw new NodeMoveError(
			"root-source-not-supported",
			"The document root cannot be moved.",
		);
	}
	if (placement !== "child") {
		if (target.node.kind !== "list") {
			throw new NodeMoveError(
				"unsupported-structure",
				"Mixed heading/list sibling order cannot be represented safely.",
			);
		}
		return {
			destinationLine:
				placement === "before"
					? targetRange.startLine
					: targetRange.endLineExclusive,
			headingLevelDelta: 0,
			listIndent: getListIndent(target.node, lines),
		};
	}

	if (target.node.kind === "list") {
		return {
			destinationLine: targetRange.endLineExclusive,
			headingLevelDelta: 0,
			listIndent: getListChildIndent(target.node, lines),
		};
	}
	if (target.node.kind === "root") {
		if (
			target.node.children.some(
				(child) => child.kind === "heading",
			)
		) {
			throw new NodeMoveError(
				"unsupported-structure",
				"A list cannot become the final document-root child after headings.",
			);
		}
		const directListChild = target.node.children.find(
			(child): child is ListMindMapNode =>
				child.kind === "list",
		);
		return {
			destinationLine: targetRange.endLineExclusive,
			headingLevelDelta: 0,
			listIndent:
				directListChild === undefined
					? ""
					: getListIndent(directListChild, lines),
		};
	}
	if (
		target.node.children.some(
			(child) => child.kind === "heading",
		)
	) {
		throw new NodeMoveError(
			"unsupported-structure",
			"A list cannot be the final child of a heading that already has heading children.",
		);
	}
	return {
		destinationLine: targetRange.endLineExclusive,
		headingLevelDelta: 0,
		listIndent: getHeadingListChildIndent(target.node, lines),
	};
}

function transformMovedLines(
	source: MindMapNode,
	range: NodeMoveLineRange,
	lines: readonly SourceLine[],
	strategy: MoveStrategy,
): SourceLine[] {
	const result = lines.map((line) => ({ ...line }));
	if (source.kind === "heading") {
		transformHeadingLines(
			source,
			range,
			result,
			strategy.headingLevelDelta,
		);
		return result;
	}
	if (source.kind === "root") {
		throw new NodeMoveError(
			"root-source-not-supported",
			"The document root cannot be moved.",
		);
	}
	if (strategy.listIndent === null) {
		throw new NodeMoveError(
			"unsupported-structure",
			"The list destination indentation is unavailable.",
		);
	}
	transformListLines(source, range, result, strategy.listIndent);
	return result;
}

function transformHeadingLines(
	source: HeadingMindMapNode,
	range: NodeMoveLineRange,
	lines: SourceLine[],
	levelDelta: number,
): void {
	for (const node of collectSubtreeNodes(source)) {
		if (node.kind !== "heading") {
			continue;
		}
		const nextLevel = node.level + levelDelta;
		if (nextLevel < 1 || nextLevel > 6) {
			throw new NodeMoveError(
				"heading-level-limit",
				"Moving this subtree would create a heading outside levels 1 through 6.",
			);
		}
		const relativeLine = node.source.line - range.startLine;
		const line = lines[relativeLine];
		if (line === undefined) {
			throw unsafeRangeError(
				"A heading descendant falls outside the source range.",
			);
		}
		const match = /^( {0,3})(#{1,6})(?=[ \t]|$)/.exec(line.text);
		if (
			match === null ||
			(match[2]?.length ?? 0) !== node.level
		) {
			throw unsafeRangeError(
				"A heading source marker no longer matches its parsed level.",
			);
		}
		lines[relativeLine] = {
			...line,
			text:
				(match[1] ?? "") +
				"#".repeat(nextLevel) +
				line.text.slice(match[0].length),
		};
	}
}

function transformListLines(
	source: ListMindMapNode,
	range: NodeMoveLineRange,
	lines: SourceLine[],
	destinationIndent: string,
): void {
	const sourceRootLine = lines[source.source.line - range.startLine];
	if (sourceRootLine === undefined) {
		throw unsafeRangeError("The list source line is outside its range.");
	}
	const sourceIndent = getLeadingWhitespace(sourceRootLine.text);
	for (const node of collectSubtreeNodes(source)) {
		if (node.kind !== "list") {
			throw new NodeMoveError(
				"unsupported-structure",
				"A list subtree contains an unsupported node kind.",
			);
		}
		const relativeLine = node.source.line - range.startLine;
		const line = lines[relativeLine];
		if (line === undefined) {
			throw unsafeRangeError(
				"A list descendant falls outside the source range.",
			);
		}
		const indent = getLeadingWhitespace(line.text);
		if (!indent.startsWith(sourceIndent)) {
			throw new NodeMoveError(
				"unsupported-structure",
				"Mixed indentation cannot be shifted without changing the list hierarchy.",
			);
		}
		lines[relativeLine] = {
			...line,
			text:
				destinationIndent +
				line.text.slice(sourceIndent.length),
		};
	}
}

function getListChildIndent(
	target: ListMindMapNode,
	lines: readonly SourceLine[],
): string {
	const child = target.children.find(
		(node): node is ListMindMapNode => node.kind === "list",
	);
	if (child !== undefined) {
		return getListIndent(child, lines);
	}
	const parentIndent = getListIndent(target, lines);
	return parentIndent + (/^\t+$/.test(parentIndent) ? "\t" : "  ");
}

function getHeadingListChildIndent(
	target: HeadingMindMapNode,
	lines: readonly SourceLine[],
): string {
	const child = target.children.find(
		(node): node is ListMindMapNode => node.kind === "list",
	);
	return child === undefined ? "" : getListIndent(child, lines);
}

function getListIndent(
	node: ListMindMapNode,
	lines: readonly SourceLine[],
): string {
	const line = lines[node.source.line];
	if (line === undefined) {
		throw unsafeRangeError("The list source line no longer exists.");
	}
	return getLeadingWhitespace(line.text);
}

function getNodeSourceRange(
	node: MindMapNode,
	index: ReadonlyMap<string, IndexedNode>,
	contentLineCount: number,
): NodeMoveLineRange {
	if (node.kind === "root") {
		return {
			startLine: 0,
			endLineExclusive: contentLineCount,
		};
	}
	let endLineExclusive: number;
	if (node.kind === "heading") {
		endLineExclusive = contentLineCount;
		for (const entry of index.values()) {
			if (
				entry.node.kind === "heading" &&
				entry.node.source.line > node.source.line &&
				entry.node.level <= node.level
			) {
				endLineExclusive = Math.min(
					endLineExclusive,
					entry.node.source.line,
				);
			}
		}
	} else {
		endLineExclusive = getSubtreeLastLine(node) + 1;
	}
	if (
		node.source.line < 0 ||
		endLineExclusive <= node.source.line ||
		endLineExclusive > contentLineCount
	) {
		throw unsafeRangeError("The node source range is invalid.");
	}
	return {
		startLine: node.source.line,
		endLineExclusive,
	};
}

function assertRangeContainsOnlySubtree(
	node: MindMapNode,
	range: NodeMoveLineRange,
	index: ReadonlyMap<string, IndexedNode>,
): void {
	const subtreeIds = collectSubtreeIds(node);
	for (const entry of index.values()) {
		if (
			entry.node.kind !== "root" &&
			entry.node.source.line >= range.startLine &&
			entry.node.source.line < range.endLineExclusive &&
			!subtreeIds.has(entry.node.id)
		) {
			throw unsafeRangeError(
				"The source range contains a structural node outside the moved subtree.",
			);
		}
	}
}

function reorderLines(
	lines: readonly SourceLine[],
	sourceRange: NodeMoveLineRange,
	destinationLine: number,
	movedLines: readonly SourceLine[],
): {
	readonly lines: readonly SourceLine[];
	readonly insertionLine: number;
} {
	if (
		destinationLine < 0 ||
		destinationLine > lines.length ||
		(destinationLine > sourceRange.startLine &&
			destinationLine < sourceRange.endLineExclusive)
	) {
		throw unsafeRangeError("The destination line is invalid.");
	}
	const result = lines.map((line) => ({ ...line }));
	const count =
		sourceRange.endLineExclusive - sourceRange.startLine;
	result.splice(sourceRange.startLine, count);
	const insertionLine =
		destinationLine >= sourceRange.endLineExclusive
			? destinationLine - count
			: destinationLine;
	result.splice(insertionLine, 0, ...movedLines);
	return { lines: result, insertionLine };
}

function splitContent(content: string): SplitContent {
	const byteOrderMark = content.startsWith("\uFEFF") ? "\uFEFF" : "";
	const body =
		byteOrderMark.length === 0 ? content : content.slice(1);
	const lines: SourceLine[] = [];
	const terminatorPattern = /\r\n|\n|\r/g;
	let start = 0;
	let originLine = 0;
	let match: RegExpExecArray | null;
	while ((match = terminatorPattern.exec(body)) !== null) {
		lines.push({
			text: body.slice(start, match.index),
			terminator: match[0],
			originLine,
		});
		start = match.index + match[0].length;
		originLine += 1;
	}
	lines.push({
		text: body.slice(start),
		terminator: "",
		originLine,
	});
	const hasTrailingTerminator = /(?:\r\n|\n|\r)$/.test(body);
	return {
		byteOrderMark,
		lines,
		contentLineCount:
			lines.length - (hasTrailingTerminator ? 1 : 0),
		preferredTerminator:
			lines.find((line) => line.terminator.length > 0)
				?.terminator ?? "\n",
	};
}

function joinContent(
	sourceLines: readonly SourceLine[],
	byteOrderMark: string,
	preferredTerminator: string,
): string {
	const lines = sourceLines.map((line) => ({ ...line }));
	for (let index = 0; index < lines.length - 1; index += 1) {
		const line = lines[index];
		if (line !== undefined && line.terminator.length === 0) {
			lines[index] = {
				...line,
				terminator: preferredTerminator,
			};
		}
	}
	const finalLine = lines[lines.length - 1];
	if (finalLine !== undefined && finalLine.terminator.length > 0) {
		lines[lines.length - 1] = {
			...finalLine,
			terminator: "",
		};
	}
	return (
		byteOrderMark +
		lines
			.map((line) => line.text + line.terminator)
			.join("")
	);
}

function findOriginLine(
	lines: readonly SourceLine[],
	originLine: number,
): number {
	const line = lines.findIndex(
		(candidate) => candidate.originLine === originLine,
	);
	if (line < 0) {
		throw unsafeRangeError("A moved source line was lost.");
	}
	return line;
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
		currentContent[currentEnd - 1] === updatedContent[updatedEnd - 1]
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

function assertSafeResult(options: {
	readonly content: string;
	readonly path: string;
	readonly basename: string;
	readonly sourceBefore: MindMapNode;
	readonly targetBefore: MindMapNode;
	readonly placement: NodeMovePlacement;
	readonly headingLevelDelta: number;
	readonly movedSourceLine: number;
	readonly targetSourceLine: number;
}): void {
	const document = parseMarkdown(
		options.content,
		options.path,
		options.basename,
	);
	const index = indexNodes(document.root);
	const moved = findNodeAtLine(document.root, options.movedSourceLine);
	const target =
		options.targetBefore.kind === "root"
			? document.root
			: findNodeAtLine(
					document.root,
					options.targetSourceLine,
				);
	if (moved === null || target === null) {
		throw unsafeResultError(
			"The moved or target node is missing after reparsing.",
		);
	}
	assertEquivalentSubtree(
		options.sourceBefore,
		moved,
		options.headingLevelDelta,
	);

	const movedEntry = index.get(moved.id);
	const targetEntry = index.get(target.id);
	if (
		movedEntry === undefined ||
		targetEntry === undefined ||
		movedEntry.parent === null
	) {
		throw unsafeResultError(
			"The moved relationship is missing after reparsing.",
		);
	}
	if (options.placement === "child") {
		if (
			movedEntry.parent.id !== target.id ||
			target.children[target.children.length - 1]?.id !== moved.id
		) {
			throw unsafeResultError(
				"The moved node did not become the target's final child.",
			);
		}
		return;
	}
	if (
		targetEntry.parent === null ||
		movedEntry.parent.id !== targetEntry.parent.id
	) {
		throw unsafeResultError(
			"The moved node is no longer a sibling of the target.",
		);
	}
	const expectedIndex =
		options.placement === "before"
			? targetEntry.childIndex - 1
			: targetEntry.childIndex + 1;
	if (movedEntry.childIndex !== expectedIndex) {
		throw unsafeResultError(
			"The moved node is not adjacent to the target.",
		);
	}
}

function assertEquivalentSubtree(
	before: MindMapNode,
	after: MindMapNode,
	headingLevelDelta: number,
): void {
	if (
		before.kind !== after.kind ||
		before.text !== after.text ||
		before.children.length !== after.children.length
	) {
		throw unsafeResultError(
			"The moved subtree changed shape or visible text.",
		);
	}
	if (
		before.kind === "heading" &&
		(after.kind !== "heading" ||
			after.level !== before.level + headingLevelDelta)
	) {
		throw unsafeResultError(
			"The moved heading level was not adjusted consistently.",
		);
	}
	if (
		before.kind === "list" &&
		(after.kind !== "list" ||
			before.marker !== after.marker ||
			before.ordered !== after.ordered ||
			before.ordinal !== after.ordinal ||
			before.taskState !== after.taskState)
	) {
		throw unsafeResultError(
			"The moved list marker or task state changed.",
		);
	}
	for (let index = 0; index < before.children.length; index += 1) {
		const beforeChild = before.children[index];
		const afterChild = after.children[index];
		if (beforeChild === undefined || afterChild === undefined) {
			throw unsafeResultError(
				"The moved subtree child mapping is incomplete.",
			);
		}
		assertEquivalentSubtree(
			beforeChild,
			afterChild,
			headingLevelDelta,
		);
	}
}

function assertSameNodeFacts(
	expected: MindMapNode,
	current: MindMapNode,
): void {
	if (
		expected.id !== current.id ||
		expected.kind !== current.kind ||
		expected.text !== current.text ||
		expected.source.path !== current.source.path ||
		expected.source.line !== current.source.line ||
		expected.source.ch !== current.source.ch
	) {
		throw new NodeMoveError(
			"stale-node",
			"A node mapping no longer matches the current source.",
		);
	}
	if (
		expected.kind === "heading" &&
		(current.kind !== "heading" ||
			expected.level !== current.level ||
			expected.sourceLine !== current.sourceLine)
	) {
		throw new NodeMoveError(
			"stale-node",
			"A heading mapping no longer matches the current source.",
		);
	}
	if (
		expected.kind === "list" &&
		(current.kind !== "list" ||
			expected.marker !== current.marker ||
			expected.ordered !== current.ordered ||
			expected.ordinal !== current.ordinal ||
			expected.taskState !== current.taskState ||
			expected.sourceLine !== current.sourceLine)
	) {
		throw new NodeMoveError(
			"stale-node",
			"A list mapping no longer matches the current source.",
		);
	}
}

function indexNodes(root: MindMapNode): Map<string, IndexedNode> {
	const result = new Map<string, IndexedNode>();
	const pending: IndexedNode[] = [
		{ node: root, parent: null, childIndex: 0 },
	];
	while (pending.length > 0) {
		const entry = pending.pop();
		if (entry === undefined) {
			continue;
		}
		result.set(entry.node.id, entry);
		for (
			let index = entry.node.children.length - 1;
			index >= 0;
			index -= 1
		) {
			const child = entry.node.children[index];
			if (child !== undefined) {
				pending.push({
					node: child,
					parent: entry.node,
					childIndex: index,
				});
			}
		}
	}
	return result;
}

function collectSubtreeIds(node: MindMapNode): Set<string> {
	return new Set(
		collectSubtreeNodes(node).map((candidate) => candidate.id),
	);
}

function collectSubtreeNodes(node: MindMapNode): MindMapNode[] {
	const result: MindMapNode[] = [];
	const pending = [node];
	while (pending.length > 0) {
		const current = pending.pop();
		if (current === undefined) {
			continue;
		}
		result.push(current);
		for (
			let index = current.children.length - 1;
			index >= 0;
			index -= 1
		) {
			const child = current.children[index];
			if (child !== undefined) {
				pending.push(child);
			}
		}
	}
	return result;
}

function getSubtreeLastLine(node: MindMapNode): number {
	let lastLine = node.source.line;
	for (const descendant of collectSubtreeNodes(node)) {
		lastLine = Math.max(lastLine, descendant.source.line);
	}
	return lastLine;
}

function findNodeAtLine(
	root: MindMapNode,
	line: number,
): MindMapNode | null {
	for (const node of collectSubtreeNodes(root)) {
		if (node.kind !== "root" && node.source.line === line) {
			return node;
		}
	}
	return null;
}

function getLeadingWhitespace(line: string): string {
	return /^[ \t]*/.exec(line)?.[0] ?? "";
}

function unsafeRangeError(message: string): NodeMoveError {
	return new NodeMoveError("unsafe-source-range", message);
}

function unsafeResultError(message: string): NodeMoveError {
	return new NodeMoveError("unsafe-result", message);
}
