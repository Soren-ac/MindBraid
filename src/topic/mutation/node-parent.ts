import type {
	ListMindMapNode,
	MindMapDocument,
	MindMapNode,
} from "../../core/model";
import {
	NodeTextEditError,
	planNodeTextEdit,
} from "./node-edit";
import { DEFAULT_NEW_NODE_TEXT } from "./node-insert";
import {
	collectMindMapSubtree,
	findMindMapNodeAtLine,
	findUnsupportedListContinuationLine,
	getLeadingWhitespace,
	indexMindMapNodes,
	joinMutationContent,
	sameNodeSourceFacts,
	splitMutationContent,
	type MutationSourceLine,
} from "./node-mutation";
import {
	createMarkdownSourceRevision,
	parseMarkdown,
} from "../../core/parser";

export type NodeParentInsertionErrorCode =
	| "empty-new-text"
	| "heading-level-limit"
	| "multiline-new-text"
	| "root-not-supported"
	| "stale-node"
	| "stale-source"
	| "target-node-not-found"
	| "unsafe-result"
	| "unsafe-source-line";

export class NodeParentInsertionError extends Error {
	public constructor(
		public readonly code: NodeParentInsertionErrorCode,
		message: string,
	) {
		super(message);
		this.name = "NodeParentInsertionError";
	}
}

export interface NodeParentInsertionRequest {
	readonly document: MindMapDocument;
	readonly content: string;
	readonly sourceRevision: string;
	readonly targetNodeId: string;
	readonly text?: string;
}

export interface NodeParentInsertionPlan {
	readonly updatedContent: string;
	readonly insertedLine: string;
	readonly createdNodeKind: "heading" | "list";
	readonly parentSourceLine: number;
	readonly targetSourceLine: number;
	readonly replacementStartOffset: number;
	readonly replacementEndOffset: number;
	readonly replacementText: string;
}

interface ContiguousReplacement {
	readonly startOffset: number;
	readonly endOffset: number;
	readonly text: string;
}

/**
 * Atomically wrap one source-backed topic in a newly inserted parent topic.
 *
 * This is deliberately a single planner/host write rather than an insertion
 * followed by a move, so undo sees one transaction and no intermediate tree
 * can leak to the controller.
 */
export function planNodeParentInsertionInContent(
	request: NodeParentInsertionRequest,
): NodeParentInsertionPlan {
	const text = request.text ?? DEFAULT_NEW_NODE_TEXT;
	assertValidText(text);
	assertCurrentRevision(request);

	const snapshotIndex = indexMindMapNodes(request.document.root);
	const snapshotTarget = snapshotIndex.get(request.targetNodeId);
	if (snapshotTarget === undefined) {
		throw new NodeParentInsertionError(
			"target-node-not-found",
			`Target node "${request.targetNodeId}" is not present in the displayed snapshot.`,
		);
	}
	if (snapshotTarget.node.kind === "root") {
		throw new NodeParentInsertionError(
			"root-not-supported",
			"The document root cannot be wrapped in a Markdown parent.",
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
		throw new NodeParentInsertionError(
			"stale-node",
			"The target no longer matches the displayed tree.",
		);
	}
	if (target.node.kind === "root") {
		throw new NodeParentInsertionError(
			"root-not-supported",
			"The document root cannot be wrapped in a Markdown parent.",
		);
	}

	const split = splitMutationContent(request.content);
	const unsupportedLine = findUnsupportedListContinuationLine(
		target.node,
		currentIndex,
		split.lines,
		split.contentLineCount,
	);
	if (unsupportedLine !== null) {
		throw new NodeParentInsertionError(
			"unsafe-source-line",
			`List body content on line ${unsupportedLine + 1} is not safe to restructure yet.`,
		);
	}
	const mutableLines = split.lines.map((line) => ({ ...line }));
	const targetLine = mutableLines[target.node.source.line];
	if (targetLine === undefined) {
		throw unsafeSourceLineError(
			"The target source line no longer exists.",
		);
	}

	let insertedLine: string;
	if (target.node.kind === "heading") {
		for (const node of collectMindMapSubtree(target.node)) {
			if (node.kind === "heading" && node.level >= 6) {
				throw new NodeParentInsertionError(
					"heading-level-limit",
					"Wrapping this branch would create a heading deeper than level six.",
				);
			}
		}
		insertedLine = createSafeStructuralLine(
			`${getLeadingWhitespace(targetLine.text)}${"#".repeat(target.node.level)} `,
			"heading",
			text,
			target.node.source.path,
		);
		transformHeadingSubtree(target.node, mutableLines);
	} else {
		const targetIndent = getLeadingWhitespace(targetLine.text);
		insertedLine = createSafeStructuralLine(
			`${targetIndent}${target.node.marker} `,
			"list",
			text,
			target.node.source.path,
		);
		transformListSubtree(
			target.node,
			deriveChildIndent(targetIndent),
			mutableLines,
		);
	}

	const insertedTerminator =
		targetLine.terminator.length > 0
			? targetLine.terminator
			: split.preferredTerminator;
	mutableLines.splice(target.node.source.line, 0, {
		text: insertedLine,
		terminator: insertedTerminator,
		originLine: -1,
	});
	const updatedContent = joinMutationContent(split, mutableLines);
	const parentSourceLine = target.node.source.line;
	const targetSourceLine = parentSourceLine + 1;
	assertSafeResult({
		content: updatedContent,
		path: request.document.root.source.path,
		basename: request.document.root.text,
		parentSourceLine,
		targetSourceLine,
		expectedParentText: text.trim(),
		targetBefore: target.node,
	});
	const replacement = createContiguousReplacement(
		request.content,
		updatedContent,
	);

	return {
		updatedContent,
		insertedLine,
		createdNodeKind: target.node.kind,
		parentSourceLine,
		targetSourceLine,
		replacementStartOffset: replacement.startOffset,
		replacementEndOffset: replacement.endOffset,
		replacementText: replacement.text,
	};
}

function assertValidText(text: string): void {
	if (/[\r\n]/.test(text)) {
		throw new NodeParentInsertionError(
			"multiline-new-text",
			"A new parent topic must stay on one Markdown line.",
		);
	}
	if (text.trim().length === 0) {
		throw new NodeParentInsertionError(
			"empty-new-text",
			"A new parent topic cannot be empty.",
		);
	}
}

function assertCurrentRevision(
	request: NodeParentInsertionRequest,
): void {
	if (
		request.document.sourceRevision !== request.sourceRevision ||
		createMarkdownSourceRevision(request.content) !==
			request.sourceRevision
	) {
		throw new NodeParentInsertionError(
			"stale-source",
			"The Markdown source changed after the create-parent gesture began.",
		);
	}
}

function createSafeStructuralLine(
	prefix: string,
	kind: "heading" | "list",
	text: string,
	path: string,
): string {
	const placeholder = "Branchory parent placeholder";
	const sourceLine = `${prefix}${placeholder}`;
	const leadingWhitespace = getLeadingWhitespace(sourceLine);
	const needsListContext =
		kind === "list" && getIndentWidth(leadingWhitespace) >= 4;
	const syntheticContent = needsListContext
		? `- Branchory synthetic parent\n${sourceLine}`
		: sourceLine;
	const sourceLineNumber = needsListContext ? 1 : 0;
	const parsed = parseMarkdown(syntheticContent, path, "");
	const node = findMindMapNodeAtLine(
		parsed.root,
		sourceLineNumber,
	);
	if (node === null || node.kind !== kind) {
		throw unsafeSourceLineError(
			`Could not create a valid ${kind} source line.`,
		);
	}
	try {
		return planNodeTextEdit(node, sourceLine, text).replacementLine;
	} catch (error: unknown) {
		if (error instanceof NodeTextEditError) {
			const code =
				error.code === "empty-new-text"
					? error.code
					: "unsafe-source-line";
			throw new NodeParentInsertionError(code, error.message);
		}
		throw error;
	}
}

function transformHeadingSubtree(
	root: Extract<MindMapNode, { readonly kind: "heading" }>,
	lines: MutationSourceLine[],
): void {
	for (const node of collectMindMapSubtree(root)) {
		if (node.kind !== "heading") {
			continue;
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
			throw unsafeSourceLineError(
				"A wrapped heading marker no longer matches its parsed source.",
			);
		}
		lines[node.source.line] = {
			...sourceLine,
			text:
				(match[1] ?? "") +
				"#".repeat(node.level + 1) +
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
		throw unsafeSourceLineError(
			"The wrapped list source line no longer exists.",
		);
	}
	const sourceIndent = getLeadingWhitespace(rootLine.text);
	for (const node of collectMindMapSubtree(root)) {
		if (node.kind !== "list") {
			throw unsafeSourceLineError(
				"A list subtree contains an unsupported node kind.",
			);
		}
		const sourceLine = lines[node.source.line];
		if (sourceLine === undefined) {
			throw unsafeSourceLineError(
				"A wrapped list descendant no longer exists.",
			);
		}
		const indent = getLeadingWhitespace(sourceLine.text);
		if (!indent.startsWith(sourceIndent)) {
			throw unsafeSourceLineError(
				"Mixed list indentation cannot be shifted safely.",
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

function assertSafeResult(options: {
	readonly content: string;
	readonly path: string;
	readonly basename: string;
	readonly parentSourceLine: number;
	readonly targetSourceLine: number;
	readonly expectedParentText: string;
	readonly targetBefore: Exclude<
		MindMapNode,
		{ readonly kind: "root" }
	>;
}): void {
	const document = parseMarkdown(
		options.content,
		options.path,
		options.basename,
	);
	const parent = findMindMapNodeAtLine(
		document.root,
		options.parentSourceLine,
	);
	const target = findMindMapNodeAtLine(
		document.root,
		options.targetSourceLine,
	);
	if (
		parent === null ||
		target === null ||
		parent.kind !== options.targetBefore.kind ||
		parent.text !== options.expectedParentText ||
		parent.children.length !== 1 ||
		parent.children[0]?.id !== target.id
	) {
		throw new NodeParentInsertionError(
			"unsafe-result",
			"The inserted topic did not become the target's parent.",
		);
	}
	if (
		parent.kind === "heading" &&
		(options.targetBefore.kind !== "heading" ||
			parent.level !== options.targetBefore.level)
	) {
		throw new NodeParentInsertionError(
			"unsafe-result",
			"The inserted heading parent has the wrong level.",
		);
	}
	if (
		parent.kind === "list" &&
		(options.targetBefore.kind !== "list" ||
			parent.marker !== options.targetBefore.marker)
	) {
		throw new NodeParentInsertionError(
			"unsafe-result",
			"The inserted list parent has the wrong marker.",
		);
	}
	assertEquivalentWrappedSubtree(options.targetBefore, target);
}

function assertEquivalentWrappedSubtree(
	before: MindMapNode,
	after: MindMapNode,
): void {
	if (
		before.kind !== after.kind ||
		before.text !== after.text ||
		before.children.length !== after.children.length
	) {
		throw new NodeParentInsertionError(
			"unsafe-result",
			"The wrapped subtree changed shape or visible text.",
		);
	}
	if (
		before.kind === "heading" &&
		(after.kind !== "heading" ||
			after.level !== before.level + 1)
	) {
		throw new NodeParentInsertionError(
			"unsafe-result",
			"The wrapped heading subtree was not relevelled consistently.",
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
		throw new NodeParentInsertionError(
			"unsafe-result",
			"The wrapped list subtree changed marker or task state.",
		);
	}
	for (let index = 0; index < before.children.length; index += 1) {
		const beforeChild = before.children[index];
		const afterChild = after.children[index];
		if (beforeChild === undefined || afterChild === undefined) {
			throw new NodeParentInsertionError(
				"unsafe-result",
				"The wrapped subtree child mapping is incomplete.",
			);
		}
		assertEquivalentWrappedSubtree(beforeChild, afterChild);
	}
}

function deriveChildIndent(parentIndent: string): string {
	const usesOnlyTabs =
		parentIndent.length > 0 && /^\t+$/.test(parentIndent);
	return parentIndent + (usesOnlyTabs ? "\t" : "  ");
}

function getIndentWidth(whitespace: string): number {
	let width = 0;
	for (const character of whitespace) {
		width += character === "\t" ? 4 : 1;
	}
	return width;
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

function unsafeSourceLineError(
	message: string,
): NodeParentInsertionError {
	return new NodeParentInsertionError("unsafe-source-line", message);
}
