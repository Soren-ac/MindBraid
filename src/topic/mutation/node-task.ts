import type {
	MindMapNode,
	MindMapNodeEditSnapshot,
	MindMapTaskState,
} from "../../core/model";
import { findMindMapNodeAtLine, splitMutationContent } from "./node-mutation";
import { createMarkdownSourceRevision, parseMarkdown } from "../../core/parser";

const TASK_LIST_SOURCE_PATTERN =
	/^([ \t]*)([-*+]|\d+\.)([ \t]+)(\[([ xX])\])(?:[ \t]+|$)/;

export type NodeTaskToggleErrorCode =
	| "not-task-list"
	| "source-line-out-of-range"
	| "stale-node"
	| "stale-source"
	| "task-marker-mismatch"
	| "unsafe-result";

export class NodeTaskToggleError extends Error {
	public constructor(
		public readonly code: NodeTaskToggleErrorCode,
		message: string,
	) {
		super(message);
		this.name = "NodeTaskToggleError";
	}
}

export interface NodeTaskToggleRequest {
	/** Immutable node/source snapshot captured by the explicit checkbox click. */
	readonly node: MindMapNodeEditSnapshot;
	/** Exact current Markdown buffer. This pure planner never writes it. */
	readonly content: string;
}

/**
 * One-character, contiguous source replacement suitable for the shared
 * Obsidian mutation host. Applying it changes only the task marker's state
 * character and leaves all line endings and unrelated bytes untouched.
 */
export interface NodeTaskTogglePlan {
	readonly nodeId: string;
	readonly sourceLine: number;
	readonly sourceRevision: string;
	readonly updatedSourceRevision: string;
	readonly previousTaskState: MindMapTaskState;
	readonly nextTaskState: MindMapTaskState;
	readonly changed: true;
	readonly updatedContent: string;
	readonly replacementStartOffset: number;
	readonly replacementEndOffset: number;
	readonly replacementText: " " | "x";
}

type TaskListSnapshot = MindMapNodeEditSnapshot & {
	readonly kind: "list";
	readonly taskState: MindMapTaskState;
};

/**
 * Plan a stale-safe Markdown task checkbox toggle without touching Obsidian or
 * the DOM. The complete source revision, parsed node snapshot, raw list
 * marker, indentation, task marker, and parser-visible text must all still
 * match the checkbox gesture before the one-character replacement is exposed.
 */
export function planNodeTaskToggleInContent(
	request: NodeTaskToggleRequest,
): NodeTaskTogglePlan {
	const node = request.node;
	assertTaskListSnapshot(node);
	assertCurrentRevision(node, request.content);

	const currentDocument = parseMarkdown(
		request.content,
		node.source.path,
		"",
	);
	const currentNode = findMindMapNodeAtLine(
		currentDocument.root,
		node.source.line,
	);
	if (!matchesTaskSnapshot(node, currentNode)) {
		throw new NodeTaskToggleError(
			"stale-node",
			"The task topic no longer matches the checkbox gesture.",
		);
	}

	const split = splitMutationContent(request.content);
	const sourceLine = split.lines[node.source.line];
	if (
		sourceLine === undefined ||
		node.source.line >= split.contentLineCount
	) {
		throw new NodeTaskToggleError(
			"source-line-out-of-range",
			`Source line ${node.source.line} no longer exists.`,
		);
	}
	if (sourceLine.text !== node.sourceLine) {
		throw new NodeTaskToggleError(
			"stale-node",
			"The task source line no longer matches the displayed topic.",
		);
	}

	const taskMarker = extractTaskMarker(node, sourceLine.text);
	const previousTaskState = toTaskState(taskMarker.stateCharacter);
	if (previousTaskState !== node.taskState) {
		throw new NodeTaskToggleError(
			"task-marker-mismatch",
			"The task marker no longer matches the displayed task state.",
		);
	}

	const nextTaskState =
		previousTaskState === "checked" ? "unchecked" : "checked";
	const replacementText = nextTaskState === "checked" ? "x" : " ";
	const replacementStartOffset =
		getLineStartOffset(split, node.source.line) +
		taskMarker.stateCharacterOffset;
	const replacementEndOffset = replacementStartOffset + 1;
	const updatedContent =
		request.content.slice(0, replacementStartOffset) +
		replacementText +
		request.content.slice(replacementEndOffset);
	const updatedDocument = parseMarkdown(
		updatedContent,
		node.source.path,
		"",
	);
	const updatedNode = findMindMapNodeAtLine(
		updatedDocument.root,
		node.source.line,
	);
	if (!matchesUpdatedTaskSnapshot(node, updatedNode, nextTaskState)) {
		throw new NodeTaskToggleError(
			"unsafe-result",
			"Toggling the task marker did not preserve the topic structure.",
		);
	}

	return {
		nodeId: node.id,
		sourceLine: node.source.line,
		sourceRevision: node.sourceRevision,
		updatedSourceRevision: updatedDocument.sourceRevision,
		previousTaskState,
		nextTaskState,
		changed: true,
		updatedContent,
		replacementStartOffset,
		replacementEndOffset,
		replacementText,
	};
}

function assertTaskListSnapshot(
	node: MindMapNodeEditSnapshot,
): asserts node is TaskListSnapshot {
	if (node.kind !== "list" || node.taskState === null) {
		throw new NodeTaskToggleError(
			"not-task-list",
			"Only a parsed Markdown task list item can be toggled.",
		);
	}
}

function assertCurrentRevision(
	node: TaskListSnapshot,
	content: string,
): void {
	if (createMarkdownSourceRevision(content) !== node.sourceRevision) {
		throw new NodeTaskToggleError(
			"stale-source",
			"The Markdown source changed after the task checkbox was activated.",
		);
	}
}

function matchesTaskSnapshot(
	expected: TaskListSnapshot,
	current: MindMapNode | null,
): boolean {
	return (
		current?.kind === "list" &&
		current.id === expected.id &&
		current.text === expected.text &&
		current.source.path === expected.source.path &&
		current.source.line === expected.source.line &&
		current.source.ch === expected.source.ch &&
		current.marker === expected.marker &&
		current.ordered === expected.ordered &&
		current.ordinal === expected.ordinal &&
		current.taskState === expected.taskState &&
		current.sourceLine === expected.sourceLine
	);
}

function matchesUpdatedTaskSnapshot(
	expected: TaskListSnapshot,
	current: MindMapNode | null,
	nextTaskState: MindMapTaskState,
): boolean {
	return (
		current?.kind === "list" &&
		current.id === expected.id &&
		current.text === expected.text &&
		current.source.path === expected.source.path &&
		current.source.line === expected.source.line &&
		current.source.ch === expected.source.ch &&
		current.marker === expected.marker &&
		current.ordered === expected.ordered &&
		current.ordinal === expected.ordinal &&
		current.taskState === nextTaskState
	);
}

function extractTaskMarker(
	node: TaskListSnapshot,
	sourceLine: string,
): {
	readonly stateCharacter: " " | "x" | "X";
	readonly stateCharacterOffset: number;
} {
	const match = TASK_LIST_SOURCE_PATTERN.exec(sourceLine);
	const leadingWhitespace = match?.[1];
	const marker = match?.[2];
	const separator = match?.[3];
	const taskBox = match?.[4];
	const stateCharacter = match?.[5];
	if (
		leadingWhitespace === undefined ||
		marker === undefined ||
		separator === undefined ||
		taskBox === undefined ||
		(stateCharacter !== " " &&
			stateCharacter !== "x" &&
			stateCharacter !== "X") ||
		leadingWhitespace.length !== node.source.ch ||
		marker !== node.marker
	) {
		throw new NodeTaskToggleError(
			"task-marker-mismatch",
			"The source line is no longer the expected task list item.",
		);
	}

	const stateCharacterOffset =
		leadingWhitespace.length + marker.length + separator.length + 1;
	if (
		sourceLine.slice(
			stateCharacterOffset - 1,
			stateCharacterOffset + 2,
		) !== taskBox
	) {
		throw new NodeTaskToggleError(
			"task-marker-mismatch",
			"The source task marker is not safe to toggle.",
		);
	}

	return {
		stateCharacter,
		stateCharacterOffset,
	};
}

function toTaskState(
	stateCharacter: " " | "x" | "X",
): MindMapTaskState {
	return stateCharacter === " " ? "unchecked" : "checked";
}

function getLineStartOffset(
	split: ReturnType<typeof splitMutationContent>,
	targetLine: number,
): number {
	let offset = split.byteOrderMark.length;
	for (let line = 0; line < targetLine; line += 1) {
		const sourceLine = split.lines[line];
		if (sourceLine === undefined) {
			throw new NodeTaskToggleError(
				"source-line-out-of-range",
				`Source line ${targetLine} no longer exists.`,
			);
		}
		offset += sourceLine.text.length + sourceLine.terminator.length;
	}
	return offset;
}
