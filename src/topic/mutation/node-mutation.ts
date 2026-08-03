import type {
	HeadingMindMapNode,
	MindMapNode,
} from "../../core/model";

/**
 * Shared, framework-free source facts used by structural mutation planners.
 *
 * The final entry may be the synthetic empty line after a trailing line
 * terminator. `contentLineCount` deliberately excludes that entry so source
 * ranges always describe bytes that actually belong to Markdown lines.
 */
export interface MutationSourceLine {
	readonly text: string;
	readonly terminator: string;
	readonly originLine: number;
}

export interface SplitMutationContent {
	readonly byteOrderMark: string;
	readonly lines: readonly MutationSourceLine[];
	readonly contentLineCount: number;
	readonly preferredTerminator: string;
}

export interface IndexedMindMapNode {
	readonly node: MindMapNode;
	readonly parent: MindMapNode | null;
	readonly childIndex: number;
}

export interface StructuralSourceRange {
	readonly startLine: number;
	readonly endLineExclusive: number;
}

interface StructuralNodeEntry {
	readonly node: MindMapNode;
}

interface StructuralSourceTextLine {
	readonly text: string;
}

export function splitMutationContent(
	content: string,
): SplitMutationContent {
	const byteOrderMark = content.startsWith("\uFEFF") ? "\uFEFF" : "";
	const body =
		byteOrderMark.length === 0 ? content : content.slice(1);
	const lines: MutationSourceLine[] = [];
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

export function joinMutationContent(
	split: Pick<SplitMutationContent, "byteOrderMark">,
	lines: readonly MutationSourceLine[],
): string {
	return (
		split.byteOrderMark +
		lines.map((line) => line.text + line.terminator).join("")
	);
}

export function indexMindMapNodes(
	root: MindMapNode,
): Map<string, IndexedMindMapNode> {
	const result = new Map<string, IndexedMindMapNode>();
	const pending: IndexedMindMapNode[] = [
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

export function collectMindMapSubtree(
	node: MindMapNode,
): MindMapNode[] {
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

export function getStructuralSourceRange(
	node: MindMapNode,
	index: ReadonlyMap<string, IndexedMindMapNode>,
	contentLineCount: number,
): StructuralSourceRange {
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
		endLineExclusive =
			Math.max(
				...collectMindMapSubtree(node).map(
					(candidate) => candidate.source.line,
				),
			) + 1;
	}

	if (
		node.source.line < 0 ||
		endLineExclusive <= node.source.line ||
		endLineExclusive > contentLineCount
	) {
		throw new Error("The structural source range is invalid.");
	}
	return {
		startLine: node.source.line,
		endLineExclusive,
	};
}

export function rangeContainsOnlySubtree(
	node: MindMapNode,
	range: StructuralSourceRange,
	index: ReadonlyMap<string, IndexedMindMapNode>,
): boolean {
	const subtreeIds = new Set(
		collectMindMapSubtree(node).map((candidate) => candidate.id),
	);
	for (const entry of index.values()) {
		if (
			entry.node.kind !== "root" &&
			entry.node.source.line >= range.startLine &&
			entry.node.source.line < range.endLineExclusive &&
			!subtreeIds.has(entry.node.id)
		) {
			return false;
		}
	}
	return true;
}

/**
 * Find non-blank source inside a list branch that the phase-one parser does
 * not model as a list node. It may be a CommonMark continuation paragraph,
 * fenced block, quote, or other body content whose ownership ObMind cannot
 * safely rewrite yet.
 *
 * Structural list mutations must reject such a branch/target. This keeps the
 * documented "complex list continuation unsupported" boundary from becoming
 * silent source reassociation or orphaned text.
 */
export function findUnsupportedListContinuationLine(
	node: MindMapNode,
	index: ReadonlyMap<string, StructuralNodeEntry>,
	lines: readonly StructuralSourceTextLine[],
	contentLineCount: number,
): number | null {
	if (node.kind !== "list") {
		return null;
	}

	const subtree = collectMindMapSubtree(node);
	const subtreeIds = new Set(subtree.map((candidate) => candidate.id));
	const modeledLines = new Set(
		subtree
			.filter((candidate) => candidate.kind === "list")
			.map((candidate) => candidate.source.line),
	);
	let boundaryLine = contentLineCount;
	for (const entry of index.values()) {
		if (
			entry.node.kind !== "root" &&
			!subtreeIds.has(entry.node.id) &&
			entry.node.source.line > node.source.line
		) {
			boundaryLine = Math.min(
				boundaryLine,
				entry.node.source.line,
			);
		}
	}

	for (
		let lineNumber = node.source.line;
		lineNumber < boundaryLine;
		lineNumber += 1
	) {
		if (modeledLines.has(lineNumber)) {
			continue;
		}
		const line = lines[lineNumber];
		if (line === undefined || line.text.trim().length > 0) {
			return lineNumber;
		}
	}
	return null;
}

export function sameNodeSourceFacts(
	expected: MindMapNode,
	current: MindMapNode,
): boolean {
	if (
		expected.id !== current.id ||
		expected.kind !== current.kind ||
		expected.text !== current.text ||
		expected.source.path !== current.source.path ||
		expected.source.line !== current.source.line ||
		expected.source.ch !== current.source.ch
	) {
		return false;
	}
	if (expected.kind === "heading") {
		return (
			current.kind === "heading" &&
			expected.level === current.level &&
			expected.sourceLine === current.sourceLine
		);
	}
	if (expected.kind === "list") {
		return (
			current.kind === "list" &&
			expected.marker === current.marker &&
			expected.ordered === current.ordered &&
			expected.ordinal === current.ordinal &&
			expected.taskState === current.taskState &&
			expected.sourceLine === current.sourceLine
		);
	}
	return current.kind === "root";
}

export function findMindMapNodeAtLine(
	root: MindMapNode,
	line: number,
): MindMapNode | null {
	for (const node of collectMindMapSubtree(root)) {
		if (node.kind !== "root" && node.source.line === line) {
			return node;
		}
	}
	return null;
}

export function getHeadingSectionBoundary(
	node: HeadingMindMapNode,
	index: ReadonlyMap<string, IndexedMindMapNode>,
	contentLineCount: number,
): number {
	return getStructuralSourceRange(
		node,
		index,
		contentLineCount,
	).endLineExclusive;
}

export function getLineStartOffset(
	split: SplitMutationContent,
	line: number,
): number {
	if (line < 0 || line > split.lines.length) {
		throw new Error(`Source line ${line} is outside the buffer.`);
	}
	let offset = split.byteOrderMark.length;
	for (let index = 0; index < line; index += 1) {
		const sourceLine = split.lines[index];
		if (sourceLine === undefined) {
			throw new Error(`Source line ${line} is outside the buffer.`);
		}
		offset += sourceLine.text.length + sourceLine.terminator.length;
	}
	return offset;
}

export function getLeadingWhitespace(value: string): string {
	return /^[ \t]*/.exec(value)?.[0] ?? "";
}
