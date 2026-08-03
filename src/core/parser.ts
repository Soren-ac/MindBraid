import type {
	MindMapDocument,
	MindMapHeadingLevel,
	MindMapInlineLink,
	MindMapListMarker,
	MindMapTaskState,
	SourceLocation,
} from "./model";
import { projectInlineMarkdown } from "./inline-markdown";

interface HeadingFrame {
	level: number;
	node: MutableHeadingMindMapNode;
}

interface ListFrame {
	indent: number;
	node: MutableMindMapNode;
}

interface Fence {
	character: "`" | "~";
	length: number;
}

interface MutableBaseMindMapNode {
	id: string;
	text: string;
	links: MindMapInlineLink[];
	source: SourceLocation;
	children: MutableMindMapNode[];
}

interface MutableRootMindMapNode extends MutableBaseMindMapNode {
	kind: "root";
}

interface MutableHeadingMindMapNode extends MutableBaseMindMapNode {
	kind: "heading";
	level: MindMapHeadingLevel;
	sourceLine: string;
}

interface MutableListMindMapNode extends MutableBaseMindMapNode {
	kind: "list";
	marker: MindMapListMarker;
	ordered: boolean;
	ordinal: number | null;
	taskState: MindMapTaskState | null;
	sourceLine: string;
}

type MutableMindMapNode =
	| MutableRootMindMapNode
	| MutableHeadingMindMapNode
	| MutableListMindMapNode;

interface ExtractedTask {
	text: string;
	taskState: MindMapTaskState | null;
}

const HEADING_PATTERN = /^( {0,3})(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/;
const LIST_PATTERN = /^([ \t]*)([-*+]|\d+\.)(?:[ \t]+(.*))?$/;
const TASK_PATTERN = /^\[([ xX])\](?:[ \t]+|$)(.*)$/;
const FRONTMATTER_OPEN_PATTERN = /^---[ \t]*$/;
const FRONTMATTER_CLOSE_PATTERN = /^(?:---|\.\.\.)[ \t]*$/;
const FENCE_OPEN_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE_PATTERN = /^ {0,3}([`~]{3,})[ \t]*$/;
const BLOCKQUOTE_PATTERN = /^[ \t]*>/;
const THEMATIC_BREAK_PATTERN =
	/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;

/**
 * Convert the supported structural subset of Markdown into a mind-map tree.
 *
 * This parser deliberately has no Obsidian or DOM dependencies. It is a
 * line-oriented parser for the MVP rules rather than a complete CommonMark
 * implementation.
 */
export function parseMarkdown(
	content: string,
	filePath: string,
	basename: string,
): MindMapDocument {
	const normalizedContent = normalizeContent(content);
	const lines = normalizedContent.split("\n");
	const root = createRootNode(basename, filePath);
	const headingStack: HeadingFrame[] = [];
	let latestHeading: MutableHeadingMindMapNode | undefined;
	let listStack: ListFrame[] = [];
	let listAnchor: MutableMindMapNode = root;
	let fence: Fence | undefined;
	let inFrontmatter =
		lines.length > 0 && FRONTMATTER_OPEN_PATTERN.test(lines[0] ?? "");

	const resetListBlock = (): void => {
		listStack = [];
		listAnchor = latestHeading ?? root;
	};

	for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
		const line = lines[lineNumber] ?? "";

		if (inFrontmatter) {
			if (
				lineNumber > 0 &&
				FRONTMATTER_CLOSE_PATTERN.test(line)
			) {
				inFrontmatter = false;
			}
			continue;
		}

		if (fence) {
			if (isFenceClose(line, fence)) {
				fence = undefined;
			}
			continue;
		}

		if (BLOCKQUOTE_PATTERN.test(line)) {
			resetListBlock();
			continue;
		}

		const fenceOpen = getFenceOpen(line);
		if (fenceOpen) {
			fence = fenceOpen;
			resetListBlock();
			continue;
		}

		const headingMatch = HEADING_PATTERN.exec(line);
		if (headingMatch) {
			resetListBlock();

			const level = toHeadingLevel(headingMatch[2]?.length ?? 1);
			const rawText = removeClosingHeadingMarker(headingMatch[3] ?? "");
			const projection = projectInlineMarkdown(rawText);
			const node = createHeadingNode(
				projection.visibleText,
				projection.links,
				filePath,
				lineNumber,
				headingMatch[1]?.length ?? 0,
				level,
				line,
			);

			while (
				headingStack.length > 0 &&
				(headingStack[headingStack.length - 1]?.level ?? 0) >= level
			) {
				headingStack.pop();
			}

			const parent =
				headingStack[headingStack.length - 1]?.node ?? root;
			parent.children.push(node);
			headingStack.push({ level, node });
			latestHeading = node;
			listAnchor = node;
			continue;
		}

		const listMatch = THEMATIC_BREAK_PATTERN.test(line)
			? null
			: LIST_PATTERN.exec(line);
		if (listMatch) {
			const leadingWhitespace = listMatch[1] ?? "";
			const indent = getIndentWidth(leadingWhitespace);

			// Four-space indentation outside an active list is an indented code
			// block, not a new list block.
			if (listStack.length === 0 && indent >= 4) {
				resetListBlock();
				continue;
			}

			if (listStack.length === 0) {
				listAnchor = latestHeading ?? root;
			}

			while (
				listStack.length > 0 &&
				(listStack[listStack.length - 1]?.indent ?? -1) >= indent
			) {
				listStack.pop();
			}

			const marker = toListMarker(listMatch[2] ?? "-");
			const extractedTask = extractTask(listMatch[3] ?? "");
			const projection = projectInlineMarkdown(extractedTask.text);
			const node = createListNode(
				projection.visibleText,
				projection.links,
				filePath,
				lineNumber,
				leadingWhitespace.length,
				marker,
				extractedTask.taskState,
				line,
			);
			const parent =
				listStack[listStack.length - 1]?.node ?? listAnchor;
			parent.children.push(node);
			listStack.push({ indent, node });
			continue;
		}

		// Empty lines do not end a list block. This lets a visually separated
		// nested item retain its indentation relationship.
		if (line.trim().length === 0) {
			continue;
		}

		// Normal prose and indented code are not nodes. They do, however, end
		// the active list indentation context.
		resetListBlock();
	}

	const document: MindMapDocument = {
		root,
		sourceRevision: createMarkdownSourceRevision(content),
		rawIsEmpty: normalizedContent.trim().length === 0,
		hasStructuralNodes: root.children.length > 0,
	};
	return document;
}

/**
 * Create a compact deterministic revision for stale-edit validation.
 *
 * Two independently mixed 32-bit lanes plus the UTF-16 length make accidental
 * collisions negligible for this local concurrency guard without relying on a
 * Node, browser-crypto, or Obsidian API.
 */
export function createMarkdownSourceRevision(content: string): string {
	let first = 0x811c9dc5;
	let second = 0x9e3779b9;

	for (let index = 0; index < content.length; index += 1) {
		const codeUnit = content.charCodeAt(index);
		first = Math.imul(first ^ codeUnit, 0x01000193);
		second = Math.imul(
			second ^ codeUnit ^ index,
			0x85ebca6b,
		);
	}

	return [
		"obmind-source-v1",
		content.length.toString(36),
		(first >>> 0).toString(36),
		(second >>> 0).toString(36),
	].join(":");
}

function createRootNode(
	text: string,
	filePath: string,
): MutableRootMindMapNode {
	return {
		...createNodeBase("root", text, [], filePath, 0, 0),
		kind: "root",
	};
}

function createHeadingNode(
	text: string,
	links: readonly MindMapInlineLink[],
	filePath: string,
	line: number,
	ch: number,
	level: MindMapHeadingLevel,
	sourceLine: string,
): MutableHeadingMindMapNode {
	return {
		...createNodeBase("heading", text, links, filePath, line, ch),
		kind: "heading",
		level,
		sourceLine,
	};
}

function createListNode(
	text: string,
	links: readonly MindMapInlineLink[],
	filePath: string,
	line: number,
	ch: number,
	marker: MindMapListMarker,
	taskState: MindMapTaskState | null,
	sourceLine: string,
): MutableListMindMapNode {
	const ordered = !isUnorderedListMarker(marker);
	return {
		...createNodeBase("list", text, links, filePath, line, ch),
		kind: "list",
		marker,
		ordered,
		ordinal: ordered ? Number.parseInt(marker.slice(0, -1), 10) : null,
		taskState,
		sourceLine,
	};
}

function createNodeBase(
	kind: "root" | "heading" | "list",
	text: string,
	links: readonly MindMapInlineLink[],
	filePath: string,
	line: number,
	ch: number,
): MutableBaseMindMapNode {
	return {
		id:
			kind === "root"
				? `obmind:${encodeURIComponent(filePath)}:root`
				: `obmind:${encodeURIComponent(filePath)}:${kind}:${line}`,
		text,
		links: links.map((link) => ({ ...link })),
		source: {
			path: filePath,
			line,
			ch,
		},
		children: [],
	};
}

function extractTask(value: string): ExtractedTask {
	const match = TASK_PATTERN.exec(value);
	if (!match) {
		return {
			text: value,
			taskState: null,
		};
	}

	return {
		text: match[2] ?? "",
		taskState:
			(match[1] ?? " ").toLowerCase() === "x"
				? "checked"
				: "unchecked",
	};
}

function toHeadingLevel(level: number): MindMapHeadingLevel {
	if (level >= 1 && level <= 6) {
		return level as MindMapHeadingLevel;
	}

	throw new Error(`Unsupported heading level: ${level}`);
}

function toListMarker(marker: string): MindMapListMarker {
	if (marker === "-" || marker === "*" || marker === "+") {
		return marker;
	}

	return marker as MindMapListMarker;
}

function isUnorderedListMarker(
	marker: MindMapListMarker,
): marker is "-" | "*" | "+" {
	return marker === "-" || marker === "*" || marker === "+";
}

function normalizeContent(content: string): string {
	return content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function removeClosingHeadingMarker(value: string): string {
	return value.replace(/[ \t]+#+[ \t]*$/, "");
}

function getIndentWidth(whitespace: string): number {
	let width = 0;
	for (const character of whitespace) {
		width += character === "\t" ? 4 : 1;
	}
	return width;
}

function getFenceOpen(line: string): Fence | undefined {
	const match = FENCE_OPEN_PATTERN.exec(line);
	const marker = match?.[1];
	if (!marker) {
		return undefined;
	}

	const character = marker[0];
	if (character !== "`" && character !== "~") {
		return undefined;
	}

	return {
		character,
		length: marker.length,
	};
}

function isFenceClose(line: string, fence: Fence): boolean {
	const marker = FENCE_CLOSE_PATTERN.exec(line)?.[1];
	if (!marker || marker.length < fence.length) {
		return false;
	}

	return [...marker].every(
		(character) => character === fence.character,
	);
}
