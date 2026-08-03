import type {
	HeadingMindMapNode,
	ListMindMapNode,
	MindMapNode,
	MindMapNodeEditSnapshot,
} from "../../core/model";
import { planInlineMarkdownVisibleEdit } from "../../core/inline-markdown";
import { parseMarkdown } from "../../core/parser";

const HEADING_PATTERN = /^( {0,3})(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/;
const LIST_PATTERN = /^([ \t]*)([-*+]|\d+\.)(?:[ \t]+(.*))?$/;
const TASK_PATTERN = /^(\[([ xX])\])(?:([ \t]+)(.*)|$)$/;
const CLOSING_HEADING_PATTERN = /([ \t]+#+[ \t]*)$/;
const INVALID_ROOT_NAME_CHARACTER_PATTERN = /[<>:"/\\|?*]/;
const RESERVED_WINDOWS_NAME_PATTERN =
	/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export type NodeTextEditErrorCode =
	| "empty-new-text"
	| "root-not-editable"
	| "source-line-out-of-range"
	| "stale-source"
	| "unsafe-result";

export class NodeTextEditError extends Error {
	public constructor(
		public readonly code: NodeTextEditErrorCode,
		message: string,
	) {
		super(message);
		this.name = "NodeTextEditError";
	}
}

export type RootNodeNameErrorCode =
	| "control-character"
	| "empty-name"
	| "invalid-character"
	| "multiline-name"
	| "reserved-name"
	| "trailing-dot-or-space";

export class RootNodeNameError extends Error {
	public constructor(
		public readonly code: RootNodeNameErrorCode,
		message: string,
	) {
		super(message);
		this.name = "RootNodeNameError";
	}
}

export interface NodeTextEditPlan {
	readonly replacementLine: string;
}

export interface NodeTextEditInContentPlan extends NodeTextEditPlan {
	readonly updatedContent: string;
}

interface HeadingLineParts {
	readonly byteOrderMark: string;
	readonly leadingWhitespace: string;
	readonly marker: string;
	readonly separator: string;
	readonly inlineSource: string;
	readonly closingMarker: string;
}

interface ListLineParts {
	readonly byteOrderMark: string;
	readonly leadingWhitespace: string;
	readonly marker: string;
	readonly separator: string;
	readonly taskBox: string;
	readonly taskSeparator: string;
	readonly inlineSource: string;
}

interface LineRange {
	readonly start: number;
	readonly end: number;
}

type NodeLineEditSnapshot =
	| HeadingMindMapNode
	| ListMindMapNode
	| Extract<MindMapNodeEditSnapshot, { readonly kind: "heading" }>
	| Extract<MindMapNodeEditSnapshot, { readonly kind: "list" }>;

/**
 * Plan a single-line source replacement without mutating Markdown content.
 *
 * The caller must supply the current source line. Its parsed structure and
 * visible text are checked against the immutable node snapshot before a
 * replacement is returned, preventing a stale UI state from overwriting a
 * newer edit.
 */
export function planNodeTextEdit(
	node: MindMapNode | MindMapNodeEditSnapshot,
	currentSourceLine: string,
	newText: string,
): NodeTextEditPlan {
	assertEditableNode(node);
	assertValidNewText(newText);

	if (/[\r\n]/.test(currentSourceLine)) {
		throw staleSourceError("The current source value is not a single line.");
	}

	const currentNode = parseCurrentSourceLine(node, currentSourceLine);
	assertNodeSnapshotMatches(node, currentNode);

	if (node.kind === "heading") {
		return {
			replacementLine: replaceHeadingLine(
				node,
				currentSourceLine,
				newText,
			),
		};
	}

	return {
		replacementLine: replaceListLine(node, currentSourceLine, newText),
	};
}

/**
 * Plan the same edit against complete Markdown content.
 *
 * The line range is located with the node's zero-based source line. Replacing
 * only that range leaves every existing LF, CRLF (and legacy CR) terminator and
 * all other source bytes untouched.
 */
export function planNodeTextEditInContent(
	node: MindMapNodeEditSnapshot,
	content: string,
	newText: string,
): NodeTextEditInContentPlan {
	assertEditableNode(node);
	assertValidNewText(newText);

	const range = findLineRange(content, node.source.line);
	if (range === null) {
		throw new NodeTextEditError(
			"source-line-out-of-range",
			`Source line ${node.source.line} no longer exists.`,
		);
	}

	const parsedDocument = parseMarkdown(content, node.source.path, "");
	if (parsedDocument.sourceRevision !== node.sourceRevision) {
		throw staleSourceError(
			"The Markdown source changed after the inline editor opened.",
		);
	}
	const currentNode = findNodeAtLine(
		parsedDocument.root,
		node.source.line,
	);
	assertNodeSnapshotMatches(node, currentNode);

	const currentSourceLine = content.slice(range.start, range.end);
	// Opening an inline editor exposes parser-visible text, not the original
	// Markdown tokens. Submitting that same visible value must be a byte-for-
	// byte no-op so a chained Tab does not strip emphasis, links, task syntax,
	// or other preserved inline source formatting.
	if (normalizeVisibleText(newText).trim() === node.text) {
		return {
			replacementLine: currentSourceLine,
			updatedContent: content,
		};
	}
	const { replacementLine } = planNodeTextEdit(
		node,
		currentSourceLine,
		newText,
	);
	const updatedContent =
		content.slice(0, range.start) +
		replacementLine +
		content.slice(range.end);
	const updatedNode = findNodeAtLine(
		parseMarkdown(
			updatedContent,
			node.source.path,
			"",
		).root,
		node.source.line,
	);
	if (
		updatedNode === null ||
		updatedNode.kind !== node.kind ||
		updatedNode.text !== normalizeVisibleText(newText).trim()
	) {
		throw new NodeTextEditError(
			"unsafe-result",
			"The edited Markdown did not reproduce the submitted visible text.",
		);
	}

	return {
		replacementLine,
		updatedContent,
	};
}

/**
 * Normalize a proposed document-root name without performing a rename.
 */
export function normalizeRootNodeName(input: string): string {
	if (/[\r\n]/.test(input)) {
		throw new RootNodeNameError(
			"multiline-name",
			"A note name cannot contain a line break.",
		);
	}
	if (containsControlCharacter(input)) {
		throw new RootNodeNameError(
			"control-character",
			"A note name cannot contain control characters.",
		);
	}

	let normalized = input.trim();
	if (/\.md$/i.test(normalized)) {
		normalized = normalized.slice(0, -3);
	}

	if (normalized.length === 0) {
		throw new RootNodeNameError(
			"empty-name",
			"A note name cannot be empty.",
		);
	}
	if (
		normalized === "." ||
		normalized === ".." ||
		RESERVED_WINDOWS_NAME_PATTERN.test(normalized)
	) {
		throw new RootNodeNameError(
			"reserved-name",
			`"${normalized}" is not a valid note name.`,
		);
	}
	if (INVALID_ROOT_NAME_CHARACTER_PATTERN.test(normalized)) {
		throw new RootNodeNameError(
			"invalid-character",
			'A note name cannot contain <>:"/\\|?*.',
		);
	}
	if (/[. ]$/.test(normalized)) {
		throw new RootNodeNameError(
			"trailing-dot-or-space",
			"A note name cannot end with a dot or space.",
		);
	}

	return normalized;
}

function assertEditableNode(
	node: MindMapNode | MindMapNodeEditSnapshot,
): asserts node is NodeLineEditSnapshot {
	if (node.kind === "root") {
		throw new NodeTextEditError(
			"root-not-editable",
			"The document root cannot be edited as a Markdown source line.",
		);
	}
}

function assertValidNewText(newText: string): void {
	if (normalizeVisibleText(newText).trim().length === 0) {
		throw new NodeTextEditError(
			"empty-new-text",
			"Node text cannot be empty.",
		);
	}
}

function replaceHeadingLine(
	node: Extract<NodeLineEditSnapshot, { readonly kind: "heading" }>,
	currentSourceLine: string,
	newText: string,
): string {
	const parts = extractHeadingLineParts(node, currentSourceLine);
	if (parts === null) {
		throw staleSourceError("The source line is no longer the same heading.");
	}

	const separator = parts.separator.length > 0 ? parts.separator : " ";
	const inlineEdit = planInlineMarkdownVisibleEdit(
		parts.inlineSource,
		node.text,
		newText,
	);
	if (inlineEdit === null) {
		throw staleSourceError(
			"The heading's inline Markdown no longer matches the topic.",
		);
	}
	return (
		parts.byteOrderMark +
		parts.leadingWhitespace +
		parts.marker +
		separator +
		inlineEdit.source +
		parts.closingMarker
	);
}

function replaceListLine(
	node: Extract<NodeLineEditSnapshot, { readonly kind: "list" }>,
	currentSourceLine: string,
	newText: string,
): string {
	const parts = extractListLineParts(node, currentSourceLine);
	if (parts === null) {
		throw staleSourceError("The source line is no longer the same list item.");
	}

	const separator = parts.separator.length > 0 ? parts.separator : " ";
	const taskPrefix =
		parts.taskBox.length === 0
			? ""
			: parts.taskBox +
				(parts.taskSeparator.length > 0
					? parts.taskSeparator
					: " ");
	const inlineEdit = planInlineMarkdownVisibleEdit(
		parts.inlineSource,
		node.text,
		newText,
	);
	if (inlineEdit === null) {
		throw staleSourceError(
			"The list item's inline Markdown no longer matches the topic.",
		);
	}

	return (
		parts.byteOrderMark +
		parts.leadingWhitespace +
		parts.marker +
		separator +
		taskPrefix +
		inlineEdit.source
	);
}

function extractHeadingLineParts(
	node: Extract<NodeLineEditSnapshot, { readonly kind: "heading" }>,
	currentSourceLine: string,
): HeadingLineParts | null {
	const { byteOrderMark, line } = splitByteOrderMark(
		currentSourceLine,
		node.source.line,
	);
	const match = HEADING_PATTERN.exec(line);
	const leadingWhitespace = match?.[1];
	const marker = match?.[2];
	if (
		leadingWhitespace === undefined ||
		marker === undefined ||
		marker.length !== node.level ||
		leadingWhitespace.length !== node.source.ch
	) {
		return null;
	}

	const markerEnd = leadingWhitespace.length + marker.length;
	const remainder = line.slice(markerEnd);
	const separator = /^[ \t]+/.exec(remainder)?.[0] ?? "";
	const rawText = remainder.slice(separator.length);
	const closingMatch = CLOSING_HEADING_PATTERN.exec(rawText);
	const closingMarker = closingMatch?.[1] ?? "";

	return {
		byteOrderMark,
		leadingWhitespace,
		marker,
		separator,
		inlineSource: rawText.slice(0, rawText.length - closingMarker.length),
		closingMarker,
	};
}

function extractListLineParts(
	node: Extract<NodeLineEditSnapshot, { readonly kind: "list" }>,
	currentSourceLine: string,
): ListLineParts | null {
	const { byteOrderMark, line } = splitByteOrderMark(
		currentSourceLine,
		node.source.line,
	);
	const match = LIST_PATTERN.exec(line);
	const leadingWhitespace = match?.[1];
	const marker = match?.[2];
	if (
		leadingWhitespace === undefined ||
		marker === undefined ||
		marker !== node.marker ||
		leadingWhitespace.length !== node.source.ch
	) {
		return null;
	}

	const markerEnd = leadingWhitespace.length + marker.length;
	const remainder = line.slice(markerEnd);
	const separator = /^[ \t]+/.exec(remainder)?.[0] ?? "";
	const rawText = remainder.slice(separator.length);
	const taskMatch = TASK_PATTERN.exec(rawText);
	const taskBox = taskMatch?.[1] ?? "";
	const taskSeparator = taskMatch?.[3] ?? "";
	const inlineSource =
		taskBox.length === 0
			? rawText
			: taskMatch?.[4] ?? "";

	return {
		byteOrderMark,
		leadingWhitespace,
		marker,
		separator,
		taskBox,
		taskSeparator,
		inlineSource,
	};
}

function splitByteOrderMark(
	line: string,
	sourceLine: number,
): { readonly byteOrderMark: string; readonly line: string } {
	if (sourceLine === 0 && line.startsWith("\uFEFF")) {
		return {
			byteOrderMark: "\uFEFF",
			line: line.slice(1),
		};
	}

	return {
		byteOrderMark: "",
		line,
	};
}

function parseCurrentSourceLine(
	node: NodeLineEditSnapshot,
	currentSourceLine: string,
): MindMapNode | null {
	const needsListContext =
		node.kind === "list" &&
		getIndentWidth(
			/^[ \t]*/.exec(
				node.source.line === 0
					? currentSourceLine.replace(/^\uFEFF/, "")
					: currentSourceLine,
			)?.[0] ?? "",
		) >= 4;
	const needsPrefix = node.source.line > 0 || needsListContext;
	const prefix = needsListContext ? "- obmind-context" : "obmind-context";
	const syntheticContent = needsPrefix
		? `${prefix}\n${currentSourceLine}`
		: currentSourceLine;
	const targetLine = needsPrefix ? 1 : 0;
	const document = parseMarkdown(syntheticContent, node.source.path, "");
	return findNodeAtLine(document.root, targetLine);
}

function assertNodeSnapshotMatches(
	expected: NodeLineEditSnapshot,
	current: MindMapNode | null,
): void {
	if (
		current === null ||
		current.kind !== expected.kind ||
		current.source.ch !== expected.source.ch ||
		current.sourceLine !== expected.sourceLine ||
		current.text !== expected.text
	) {
		throw staleSourceError(
			"The source line changed after the mind-map node was created.",
		);
	}

	if (
		expected.kind === "heading" &&
		(current.kind !== "heading" || current.level !== expected.level)
	) {
		throw staleSourceError("The heading level has changed.");
	}

	if (
		expected.kind === "list" &&
		(current.kind !== "list" ||
			current.marker !== expected.marker ||
			current.ordered !== expected.ordered ||
			current.ordinal !== expected.ordinal ||
			current.taskState !== expected.taskState)
	) {
		throw staleSourceError("The list marker or task state has changed.");
	}
}

function findNodeAtLine(root: MindMapNode, line: number): MindMapNode | null {
	const pending: MindMapNode[] = [...root.children];
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

function findLineRange(content: string, targetLine: number): LineRange | null {
	if (!Number.isInteger(targetLine) || targetLine < 0) {
		return null;
	}

	const terminatorPattern = /\r\n|\n|\r/g;
	let currentLine = 0;
	let start = 0;
	let match: RegExpExecArray | null;
	while ((match = terminatorPattern.exec(content)) !== null) {
		if (currentLine === targetLine) {
			return {
				start,
				end: match.index,
			};
		}
		currentLine += 1;
		start = match.index + match[0].length;
	}

	return currentLine === targetLine
		? {
				start,
				end: content.length,
			}
		: null;
}

function getIndentWidth(whitespace: string): number {
	let width = 0;
	for (const character of whitespace) {
		width += character === "\t" ? 4 : 1;
	}
	return width;
}

function containsControlCharacter(value: string): boolean {
	for (const character of value) {
		const codePoint = character.codePointAt(0);
		if (
			codePoint !== undefined &&
			(codePoint <= 0x1f ||
				(codePoint >= 0x7f && codePoint <= 0x9f))
		) {
			return true;
		}
	}

	return false;
}

function staleSourceError(message: string): NodeTextEditError {
	return new NodeTextEditError("stale-source", message);
}

function normalizeVisibleText(value: string): string {
	return value.replace(/\r\n?/g, "\n");
}
