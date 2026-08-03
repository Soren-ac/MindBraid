import type {
	HeadingMindMapNode,
	ListMindMapNode,
	MindMapDocument,
	MindMapNode,
	MindMapNodeKind,
} from "../../core/model";
import {
	NodeTextEditError,
	planNodeTextEdit,
	type NodeTextEditInContentPlan,
} from "./node-edit";
import {
	createMarkdownSourceRevision,
	parseMarkdown,
} from "../../core/parser";
import { findUnsupportedListContinuationLine } from "./node-mutation";

export const DEFAULT_NEW_NODE_TEXT = "New topic";

export type NodeCreateKind = "child" | "sibling";

export type NodeInsertionFallbackReason = "heading-level-limit";

export type NodeInsertionErrorCode =
	| "empty-new-text"
	| "multiline-new-text"
	| "root-sibling-not-supported"
	| "stale-source"
	| "stale-target"
	| "target-node-not-found"
	| "unsafe-insertion-boundary";

export class NodeInsertionError extends Error {
	public constructor(
		public readonly code: NodeInsertionErrorCode,
		message: string,
	) {
		super(message);
		this.name = "NodeInsertionError";
	}
}

export interface NodeInsertionRequest {
	/** Exact parsed snapshot currently displayed by the mind-map view. */
	readonly document: MindMapDocument;
	/** Exact current Markdown buffer. It is never mutated by this planner. */
	readonly content: string;
	readonly targetNodeId: string;
	/** Revision captured by the explicit create gesture. */
	readonly sourceRevision: string;
	readonly createKind: NodeCreateKind;
	readonly text?: string;
}

export interface NodeInsertionPlan
	extends Pick<NodeTextEditInContentPlan, "updatedContent"> {
	/** Offset in the original content at which `insertionText` is inserted. */
	readonly insertionOffset: number;
	/** Exact bytes to insert, including any required line terminator. */
	readonly insertionText: string;
	/** The inserted Markdown line without its terminator. */
	readonly insertedLine: string;
	/** Zero-based source line occupied by the new node after insertion. */
	readonly sourceLine: number;
	readonly createdNodeKind: Exclude<MindMapNodeKind, "root">;
	/**
	 * Non-null only when the requested tree relationship cannot be represented
	 * by the preferred Markdown construct.
	 */
	readonly fallbackReason: NodeInsertionFallbackReason | null;
}

interface SourceLine {
	readonly line: number;
	readonly start: number;
	readonly end: number;
	readonly text: string;
	readonly terminator: string;
}

interface IndexedNode {
	readonly node: MindMapNode;
	readonly parent: MindMapNode | null;
}

interface InsertionStrategy {
	readonly createdNodeKind: "heading" | "list";
	readonly insertedLine: string;
	readonly boundaryLine: number | null;
	readonly expectedParentId: string;
	readonly fallbackReason: NodeInsertionFallbackReason | null;
}

interface AppliedInsertion {
	readonly insertionOffset: number;
	readonly insertionText: string;
	readonly sourceLine: number;
	readonly updatedContent: string;
}

/**
 * Plan one explicit Markdown node insertion without writing to the source.
 *
 * The exact source revision, target identity, source line, resulting node kind,
 * and resulting parent relationship are all verified before a plan is
 * returned. Callers may apply `updatedContent` through an Obsidian public API
 * only as the direct result of the corresponding user create gesture.
 */
export function planNodeInsertionInContent(
	request: NodeInsertionRequest,
): NodeInsertionPlan {
	const text = request.text ?? DEFAULT_NEW_NODE_TEXT;
	assertValidNewText(text);
	assertCurrentRevision(request);

	const documentIndex = indexNodes(request.document.root);
	const documentTarget = documentIndex.get(request.targetNodeId);
	if (documentTarget === undefined) {
		throw new NodeInsertionError(
			"target-node-not-found",
			`Target node "${request.targetNodeId}" is not present in the document snapshot.`,
		);
	}
	if (
		documentTarget.node.kind === "root" &&
		request.createKind === "sibling"
	) {
		throw new NodeInsertionError(
			"root-sibling-not-supported",
			"The document root cannot have a Markdown sibling.",
		);
	}

	const currentDocument = parseMarkdown(
		request.content,
		request.document.root.source.path,
		request.document.root.text,
	);
	const currentIndex = indexNodes(currentDocument.root);
	const currentTarget = currentIndex.get(request.targetNodeId);
	if (currentTarget === undefined) {
		throw staleTargetError(
			"The target node is no longer present at its mapped source location.",
		);
	}
	assertSameNodeFacts(documentTarget.node, currentTarget.node);

	const lines = splitSourceLines(request.content);
	assertSourceLineMatches(currentTarget.node, lines);
	const unsupportedLine = findUnsupportedListContinuationLine(
		currentTarget.node,
		currentIndex,
		lines,
		lines.length,
	);
	if (unsupportedLine !== null) {
		throw new NodeInsertionError(
			"unsafe-insertion-boundary",
			`List body content on line ${unsupportedLine + 1} is not safe to restructure yet.`,
		);
	}
	const strategy = createInsertionStrategy(
		currentTarget,
		currentIndex,
		lines,
		request.createKind,
		text,
	);
	const applied = applyInsertion(
		request.content,
		lines,
		strategy.boundaryLine,
		strategy.insertedLine,
	);

	assertResultingRelationship(
		applied.updatedContent,
		request.document.root.source.path,
		request.document.root.text,
		request.targetNodeId,
		applied.sourceLine,
		text.trim(),
		strategy,
	);

	return {
		insertionOffset: applied.insertionOffset,
		insertionText: applied.insertionText,
		insertedLine: strategy.insertedLine,
		sourceLine: applied.sourceLine,
		createdNodeKind: strategy.createdNodeKind,
		fallbackReason: strategy.fallbackReason,
		updatedContent: applied.updatedContent,
	};
}

function assertValidNewText(text: string): void {
	if (/[\r\n]/.test(text)) {
		throw new NodeInsertionError(
			"multiline-new-text",
			"A new node must stay on one Markdown source line.",
		);
	}
	if (text.trim().length === 0) {
		throw new NodeInsertionError(
			"empty-new-text",
			"A new node cannot have empty text.",
		);
	}
}

function assertCurrentRevision(request: NodeInsertionRequest): void {
	if (
		request.document.sourceRevision !== request.sourceRevision ||
		createMarkdownSourceRevision(request.content) !==
			request.sourceRevision
	) {
		throw new NodeInsertionError(
			"stale-source",
			"The Markdown source changed after the create gesture started.",
		);
	}
}

function createInsertionStrategy(
	target: IndexedNode,
	index: ReadonlyMap<string, IndexedNode>,
	lines: readonly SourceLine[],
	createKind: NodeCreateKind,
	text: string,
): InsertionStrategy {
	const node = target.node;
	if (node.kind === "root") {
		return {
			createdNodeKind: "heading",
			insertedLine: createSafeHeadingLine(1, text, node.source.path),
			boundaryLine: null,
			expectedParentId: node.id,
			fallbackReason: null,
		};
	}

	if (node.kind === "heading") {
		const boundaryLine = findHeadingSubtreeBoundary(node, index);
		if (createKind === "sibling") {
			if (target.parent === null) {
				throw staleTargetError("The heading parent is no longer available.");
			}
			return {
				createdNodeKind: "heading",
				insertedLine: createSafeHeadingLine(
					node.level,
					text,
					node.source.path,
				),
				boundaryLine,
				expectedParentId: target.parent.id,
				fallbackReason: null,
			};
		}

		if (node.level < 6) {
			return {
				createdNodeKind: "heading",
				insertedLine: createSafeHeadingLine(
					node.level + 1,
					text,
					node.source.path,
				),
				boundaryLine,
				expectedParentId: node.id,
				fallbackReason: null,
			};
		}

		return {
			createdNodeKind: "list",
			insertedLine: createSafeListLine(
				"",
				"-",
				text,
				node.source.path,
			),
			boundaryLine,
			expectedParentId: node.id,
			fallbackReason: "heading-level-limit",
		};
	}

	const targetLine = getSourceLine(lines, node.source.line);
	const targetIndent = getLeadingWhitespace(
		stripByteOrderMark(targetLine.text, targetLine.line),
	);
	const boundaryLine = getSubtreeLastLine(node) + 1;
	if (createKind === "sibling") {
		if (target.parent === null) {
			throw staleTargetError("The list parent is no longer available.");
		}
		return {
			createdNodeKind: "list",
			insertedLine: createSafeListLine(
				targetIndent,
				node.marker,
				text,
				node.source.path,
			),
			boundaryLine,
			expectedParentId: target.parent.id,
			fallbackReason: null,
		};
	}

	const directListChild = node.children.find(
		(child): child is ListMindMapNode => child.kind === "list",
	);
	const childIndent =
		directListChild === undefined
			? deriveChildIndent(targetIndent)
			: getLeadingWhitespace(
					stripByteOrderMark(
						getSourceLine(lines, directListChild.source.line)
							.text,
						directListChild.source.line,
					),
				);
	const childMarker =
		directListChild?.marker ?? (node.ordered ? "1." : node.marker);
	return {
		createdNodeKind: "list",
		insertedLine: createSafeListLine(
			childIndent,
			childMarker,
			text,
			node.source.path,
		),
		boundaryLine,
		expectedParentId: node.id,
		fallbackReason: null,
	};
}

function findHeadingSubtreeBoundary(
	node: HeadingMindMapNode,
	index: ReadonlyMap<string, IndexedNode>,
): number | null {
	const subtreeIds = collectSubtreeIds(node);
	const subtreeLastLine = getSubtreeLastLine(node);
	let boundary: number | null = null;
	for (const entry of index.values()) {
		if (
			entry.node.kind === "root" ||
			subtreeIds.has(entry.node.id) ||
			entry.node.source.line <= subtreeLastLine
		) {
			continue;
		}
		if (boundary === null || entry.node.source.line < boundary) {
			boundary = entry.node.source.line;
		}
	}
	return boundary;
}

function createSafeHeadingLine(
	level: number,
	text: string,
	path: string,
): string {
	return createSafeStructuralLine(
		`${"#".repeat(level)} `,
		"heading",
		text,
		path,
	);
}

function createSafeListLine(
	indent: string,
	marker: string,
	text: string,
	path: string,
): string {
	return createSafeStructuralLine(
		`${indent}${marker} `,
		"list",
		text,
		path,
	);
}

function createSafeStructuralLine(
	prefix: string,
	kind: "heading" | "list",
	text: string,
	path: string,
): string {
	const placeholder = "ObMind insertion placeholder";
	const sourceLine = `${prefix}${placeholder}`;
	const leadingWhitespace = getLeadingWhitespace(sourceLine);
	const needsListContext =
		kind === "list" && getIndentWidth(leadingWhitespace) >= 4;
	const syntheticContent = needsListContext
		? `- ObMind insertion parent\n${sourceLine}`
		: sourceLine;
	const targetLine = needsListContext ? 1 : 0;
	const parsed = parseMarkdown(syntheticContent, path, "");
	const node = findNodeAtLine(parsed.root, targetLine);
	if (node === null || node.kind !== kind) {
		throw new NodeInsertionError(
			"unsafe-insertion-boundary",
			`Could not create a valid ${kind} source line.`,
		);
	}

	try {
		return planNodeTextEdit(node, sourceLine, text).replacementLine;
	} catch (error: unknown) {
		if (error instanceof NodeTextEditError) {
			const mappedCode =
				error.code === "empty-new-text"
					? error.code
					: "unsafe-insertion-boundary";
			throw new NodeInsertionError(mappedCode, error.message);
		}
		throw error;
	}
}

function applyInsertion(
	content: string,
	lines: readonly SourceLine[],
	boundaryLine: number | null,
	insertedLine: string,
): AppliedInsertion {
	if (
		boundaryLine !== null &&
		boundaryLine >= 0 &&
		boundaryLine < lines.length
	) {
		const boundary = getSourceLine(lines, boundaryLine);
		const lineEnding = chooseLineEnding(lines, boundaryLine);
		const insertionText = `${insertedLine}${lineEnding}`;
		return {
			insertionOffset: boundary.start,
			insertionText,
			sourceLine: boundaryLine,
			updatedContent:
				content.slice(0, boundary.start) +
				insertionText +
				content.slice(boundary.start),
		};
	}

	if (boundaryLine !== null && boundaryLine < 0) {
		throw staleTargetError("The insertion boundary is invalid.");
	}
	if (content.length === 0) {
		return {
			insertionOffset: 0,
			insertionText: insertedLine,
			sourceLine: 0,
			updatedContent: insertedLine,
		};
	}

	const lineEnding = chooseLineEnding(lines, lines.length);
	const hasTrailingTerminator = /(?:\r\n|\n|\r)$/.test(content);
	const insertionText = hasTrailingTerminator
		? `${insertedLine}${lineEnding}`
		: `${lineEnding}${insertedLine}`;
	return {
		insertionOffset: content.length,
		insertionText,
		sourceLine: hasTrailingTerminator
			? lines.length - 1
			: lines.length,
		updatedContent: content + insertionText,
	};
}

function assertResultingRelationship(
	updatedContent: string,
	path: string,
	basename: string,
	targetNodeId: string,
	sourceLine: number,
	expectedText: string,
	strategy: InsertionStrategy,
): void {
	const updatedDocument = parseMarkdown(updatedContent, path, basename);
	const updatedIndex = indexNodes(updatedDocument.root);
	const updatedTarget = updatedIndex.get(targetNodeId);
	const created = findNodeAtLine(updatedDocument.root, sourceLine);
	if (
		updatedTarget === undefined ||
		created === null ||
		created.kind !== strategy.createdNodeKind ||
		created.text !== expectedText ||
		updatedIndex.get(created.id)?.parent?.id !==
			strategy.expectedParentId
	) {
		throw new NodeInsertionError(
			"unsafe-insertion-boundary",
			"The planned Markdown line would not create the requested mind-map relationship.",
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
		throw staleTargetError(
			"The target node mapping no longer matches the current Markdown source.",
		);
	}

	if (
		expected.kind === "heading" &&
		(current.kind !== "heading" ||
			expected.level !== current.level ||
			expected.sourceLine !== current.sourceLine)
	) {
		throw staleTargetError("The target heading mapping is stale.");
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
		throw staleTargetError("The target list mapping is stale.");
	}
}

function assertSourceLineMatches(
	node: MindMapNode,
	lines: readonly SourceLine[],
): void {
	if (node.kind === "root") {
		return;
	}
	const line = lines[node.source.line];
	if (
		line === undefined ||
		stripByteOrderMark(line.text, line.line) !== node.sourceLine
	) {
		throw staleTargetError(
			"The target source line no longer exists at its mapped location.",
		);
	}
}

function indexNodes(root: MindMapNode): Map<string, IndexedNode> {
	const result = new Map<string, IndexedNode>();
	const pending: IndexedNode[] = [{ node: root, parent: null }];
	while (pending.length > 0) {
		const entry = pending.pop();
		if (entry === undefined) {
			continue;
		}
		result.set(entry.node.id, entry);
		for (let index = entry.node.children.length - 1; index >= 0; index -= 1) {
			const child = entry.node.children[index];
			if (child !== undefined) {
				pending.push({
					node: child,
					parent: entry.node,
				});
			}
		}
	}
	return result;
}

function collectSubtreeIds(node: MindMapNode): Set<string> {
	const result = new Set<string>();
	const pending = [node];
	while (pending.length > 0) {
		const current = pending.pop();
		if (current === undefined) {
			continue;
		}
		result.add(current.id);
		for (const child of current.children) {
			pending.push(child);
		}
	}
	return result;
}

function getSubtreeLastLine(node: MindMapNode): number {
	let lastLine = node.source.line;
	const pending = [...node.children];
	while (pending.length > 0) {
		const current = pending.pop();
		if (current === undefined) {
			continue;
		}
		lastLine = Math.max(lastLine, current.source.line);
		for (const child of current.children) {
			pending.push(child);
		}
	}
	return lastLine;
}

function findNodeAtLine(root: MindMapNode, line: number): MindMapNode | null {
	const pending = [...root.children];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		if (node.source.line === line) {
			return node;
		}
		for (const child of node.children) {
			pending.push(child);
		}
	}
	return null;
}

function splitSourceLines(content: string): SourceLine[] {
	const lines: SourceLine[] = [];
	const terminatorPattern = /\r\n|\n|\r/g;
	let line = 0;
	let start = 0;
	let match: RegExpExecArray | null;
	while ((match = terminatorPattern.exec(content)) !== null) {
		lines.push({
			line,
			start,
			end: match.index,
			text: content.slice(start, match.index),
			terminator: match[0],
		});
		line += 1;
		start = match.index + match[0].length;
	}
	lines.push({
		line,
		start,
		end: content.length,
		text: content.slice(start),
		terminator: "",
	});
	return lines;
}

function getSourceLine(
	lines: readonly SourceLine[],
	line: number,
): SourceLine {
	const sourceLine = lines[line];
	if (sourceLine === undefined) {
		throw staleTargetError(`Source line ${line} no longer exists.`);
	}
	return sourceLine;
}

function chooseLineEnding(
	lines: readonly SourceLine[],
	boundaryLine: number,
): string {
	const previous = lines[boundaryLine - 1]?.terminator;
	if (previous !== undefined && previous.length > 0) {
		return previous;
	}
	const current = lines[boundaryLine]?.terminator;
	if (current !== undefined && current.length > 0) {
		return current;
	}
	for (const line of lines) {
		if (line.terminator.length > 0) {
			return line.terminator;
		}
	}
	return "\n";
}

function getLeadingWhitespace(line: string): string {
	return /^[ \t]*/.exec(line)?.[0] ?? "";
}

function deriveChildIndent(parentIndent: string): string {
	const usesOnlyTabs =
		parentIndent.length > 0 && /^[\t]+$/.test(parentIndent);
	return parentIndent + (usesOnlyTabs ? "\t" : "  ");
}

function getIndentWidth(whitespace: string): number {
	let width = 0;
	for (const character of whitespace) {
		width += character === "\t" ? 4 : 1;
	}
	return width;
}

function stripByteOrderMark(line: string, lineNumber: number): string {
	return lineNumber === 0 ? line.replace(/^\uFEFF/, "") : line;
}

function staleTargetError(message: string): NodeInsertionError {
	return new NodeInsertionError("stale-target", message);
}
