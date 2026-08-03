import type { MindMapDocument } from "../../core/model";

/**
 * Renderer-neutral commands that operate on the current mind-map document.
 *
 * A command is only an intent. The ItemView validates the rendered revision
 * and the Obsidian host decides whether and how Markdown may be changed.
 */
export type MindMapTopicCommand =
	| "copy"
	| "cut"
	| "delete-branch"
	| "delete-single"
	| "paste-child"
	| "paste-sibling"
	| "create-parent"
	| "outdent"
	| "undo"
	| "redo";

export const MIND_MAP_TOPIC_COMMANDS = [
	"copy",
	"cut",
	"delete-branch",
	"delete-single",
	"paste-child",
	"paste-sibling",
	"create-parent",
	"outdent",
	"undo",
	"redo",
] as const satisfies readonly MindMapTopicCommand[];

export interface MindMapTopicCommandRequest {
	readonly command: MindMapTopicCommand;
	readonly nodeIds: readonly string[];
	readonly primaryNodeId: string | null;
	readonly sourceRevision: string;
}

/**
 * Host-confirmed result of one semantic topic command. A frontend consumes
 * only current node IDs and optional edit intent; it never receives source
 * offsets or Obsidian objects.
 */
export interface MindMapTopicCommandResult {
	readonly changed: boolean;
	readonly document: MindMapDocument;
	readonly selectedNodeIds: readonly string[];
	readonly primaryNodeId: string | null;
	readonly beginEditNodeId: string | null;
}

/**
 * A completed host write may return after the user activates another note.
 * Frontends should apply selection/edit follow-up only to the exact returned
 * document frame; skipping a stale activation is not a write failure.
 */
export function canActivateMindMapTopicCommandResult(
	currentDocument: MindMapDocument,
	result: MindMapTopicCommandResult,
): boolean {
	return (
		currentDocument.root.source.path ===
			result.document.root.source.path &&
		currentDocument.sourceRevision === result.document.sourceRevision
	);
}

export interface MindMapTopicCommandKeyGesture {
	readonly altKey?: boolean;
	readonly ctrlKey?: boolean;
	readonly isComposing?: boolean;
	readonly key: string;
	readonly metaKey?: boolean;
	readonly repeat?: boolean;
	readonly shiftKey?: boolean;
}

/**
 * Resolve document/topic shortcuts without depending on DOM or Obsidian.
 * Repeated structural mutations are deliberately ignored.
 */
export function resolveMindMapTopicCommandShortcut(
	gesture: MindMapTopicCommandKeyGesture,
	hasSelection: boolean,
): MindMapTopicCommand | null {
	if (gesture.isComposing === true || gesture.repeat === true) {
		return null;
	}
	const primaryModifier =
		gesture.ctrlKey === true || gesture.metaKey === true;
	const normalizedKey = gesture.key.toLowerCase();

	if (primaryModifier && !gesture.altKey) {
		if (normalizedKey === "z") {
			return gesture.shiftKey === true ? "redo" : "undo";
		}
		if (normalizedKey === "y" && gesture.shiftKey !== true) {
			return "redo";
		}
		if (!hasSelection || gesture.shiftKey === true) {
			return null;
		}
		if (normalizedKey === "c") {
			return "copy";
		}
		if (normalizedKey === "x") {
			return "cut";
		}
		if (normalizedKey === "v") {
			return "paste-child";
		}
		if (gesture.key === "Enter") {
			return "create-parent";
		}
		return null;
	}

	if (
		!hasSelection ||
		gesture.altKey === true ||
		gesture.ctrlKey === true ||
		gesture.metaKey === true
	) {
		return null;
	}
	if (
		(gesture.key === "Delete" || gesture.key === "Backspace") &&
		gesture.shiftKey !== true
	) {
		return "delete-branch";
	}
	if (gesture.key === "Tab" && gesture.shiftKey === true) {
		return "outdent";
	}
	return null;
}
