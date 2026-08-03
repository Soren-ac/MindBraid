import type { MindMapNodeKind } from "../../core/model";

export type MindMapCanvasPointerIntent =
	| "begin-marquee"
	| "clear-selection-and-pan"
	| "commit-edit-clear-selection-and-pan";

export interface MindMapCanvasPointerGesture {
	readonly hasActiveEdit: boolean;
	readonly shiftKey?: boolean;
	readonly spaceKey?: boolean;
}

/**
 * Resolve a primary pointer gesture that started on blank canvas.
 *
 * Interaction model:
 *  - Space + drag  → pan (spaceKey = true)
 *  - Plain drag    → lasso / marquee selection
 *  - Shift + drag  → also marquee (additive)
 *
 * This remains renderer-neutral so replacement frontends preserve the same
 * edit/selection lifecycle. A validation failure while committing is handled
 * by the adapter, which must keep the editor active and skip the remaining
 * clear/pan actions.
 */
export function resolveMindMapCanvasPointerIntent(
	gesture: MindMapCanvasPointerGesture,
): MindMapCanvasPointerIntent {
	// Space held → pan regardless of other modifiers.
	if (gesture.spaceKey === true) {
		return gesture.hasActiveEdit
			? "commit-edit-clear-selection-and-pan"
			: "clear-selection-and-pan";
	}
	// Plain drag or Shift drag → marquee selection.
	if (gesture.hasActiveEdit) {
		return "commit-edit-clear-selection-and-pan";
	}
	return "begin-marquee";
}

export type MindMapNodeClickIntent =
	| "edit"
	| "open-source"
	| "select";

export interface MindMapNodeClickGesture {
	readonly alreadySelected: boolean;
	readonly altKey?: boolean;
	readonly ctrlKey?: boolean;
	readonly metaKey?: boolean;
	readonly shiftKey?: boolean;
}

/**
 * Resolve a primary-button topic click without depending on DOM events.
 *
 * Source navigation is deliberately modifier-only: a plain first click keeps
 * the user in the map, while a later click on the selected topic edits it.
 */
export function resolveMindMapNodeClickIntent(
	gesture: MindMapNodeClickGesture,
): MindMapNodeClickIntent {
	if (gesture.altKey === true) {
		return "open-source";
	}

	if (
		gesture.ctrlKey === true ||
		gesture.metaKey === true ||
		gesture.shiftKey === true
	) {
		return "select";
	}

	return gesture.alreadySelected ? "edit" : "select";
}

export type MindMapNodeKeyIntent =
	| "clear-selection"
	| "consume"
	| "create-child"
	| "create-sibling"
	| "edit"
	| "open-source"
	| "select";

export interface MindMapKeyGesture {
	readonly altKey?: boolean;
	readonly ctrlKey?: boolean;
	readonly isComposing?: boolean;
	readonly key: string;
	readonly metaKey?: boolean;
	readonly repeat?: boolean;
	readonly shiftKey?: boolean;
}

export interface MindMapNodeKeyGesture extends MindMapKeyGesture {
	readonly nodeKind: MindMapNodeKind;
	readonly selected: boolean;
}

export type MindMapNodeEditorKeyIntent =
	| "cancel-edit"
	| "commit-edit"
	| "commit-and-create-child"
	| "consume";

export interface MindMapNodeEditorKeyGesture extends MindMapKeyGesture {
	readonly allowsLineBreaks?: boolean;
}

/**
 * Resolve shortcuts while the inline topic editor owns focus.
 *
 * This state is intentionally separate from the selected-node state machine:
 * a repeated Tab must submit the current draft before creating a child from
 * the refreshed source snapshot. The renderer reports that compound intent;
 * the host owns the serialized Markdown mutations.
 */
export function resolveMindMapNodeEditorKeyIntent(
	gesture: MindMapNodeEditorKeyGesture,
): MindMapNodeEditorKeyIntent | null {
	if (gesture.key === "Process") {
		return null;
	}

	const recognized =
		gesture.key === "Escape" ||
		gesture.key === "Enter" ||
		gesture.key === "Tab";
	if (!recognized) {
		return null;
	}

	if (gesture.isComposing === true) {
		return gesture.key === "Tab" ? "consume" : null;
	}

	if (gesture.repeat === true) {
		return "consume";
	}

	// The DOM adapter uses a multiline textarea. Shift+Enter is deliberately
	// left to that editor's native behavior, while plain Enter remains the
	// structural commit gesture.
	if (
		gesture.key === "Enter" &&
		gesture.shiftKey === true &&
		gesture.altKey !== true &&
		gesture.ctrlKey !== true &&
		gesture.metaKey !== true
	) {
		return gesture.allowsLineBreaks === false ? "consume" : null;
	}

	const hasModifier =
		gesture.altKey === true ||
		gesture.ctrlKey === true ||
		gesture.metaKey === true ||
		gesture.shiftKey === true;
	if (hasModifier) {
		// Keep command-modified Enter/Escape inside the editor. Modified Tab
		// remains available for the host's normal focus traversal.
		return gesture.key === "Tab" ? null : "consume";
	}

	if (gesture.key === "Escape") {
		return "cancel-edit";
	}
	if (gesture.key === "Enter") {
		return "commit-edit";
	}
	return "commit-and-create-child";
}

/**
 * Resolve shortcuts while a node content control, rather than its text input,
 * owns focus. Text-editor events never reach this state machine.
 */
export function resolveMindMapNodeKeyIntent(
	gesture: MindMapNodeKeyGesture,
): MindMapNodeKeyIntent | null {
	if (gesture.isComposing === true || gesture.repeat === true) {
		return gesture.key === "Enter" || gesture.key === " "
			? "consume"
			: null;
	}

	const hasCommandModifier =
		gesture.ctrlKey === true || gesture.metaKey === true;
	if (
		gesture.key === "Enter" &&
		hasCommandModifier &&
		gesture.altKey !== true &&
		gesture.shiftKey !== true
	) {
		return "open-source";
	}

	if (
		gesture.key === "F2" &&
		gesture.altKey !== true &&
		gesture.ctrlKey !== true &&
		gesture.metaKey !== true &&
		gesture.shiftKey !== true
	) {
		return "edit";
	}

	if (
		gesture.selected &&
		gesture.key === " " &&
		gesture.altKey !== true &&
		gesture.ctrlKey !== true &&
		gesture.metaKey !== true &&
		gesture.shiftKey !== true
	) {
		return "edit";
	}

	if (
		gesture.selected &&
		gesture.key === "Tab" &&
		gesture.altKey !== true &&
		gesture.ctrlKey !== true &&
		gesture.metaKey !== true &&
		gesture.shiftKey !== true
	) {
		return "create-child";
	}

	if (
		gesture.selected &&
		gesture.key === "Enter" &&
		gesture.altKey !== true &&
		gesture.ctrlKey !== true &&
		gesture.metaKey !== true &&
		gesture.shiftKey !== true
	) {
		return gesture.nodeKind === "root"
			? "create-child"
			: "create-sibling";
	}

	if (
		gesture.selected &&
		gesture.key === "Escape" &&
		gesture.altKey !== true &&
		gesture.ctrlKey !== true &&
		gesture.metaKey !== true &&
		gesture.shiftKey !== true
	) {
		return "clear-selection";
	}

	if (
		!gesture.selected &&
		(gesture.key === "Enter" || gesture.key === " ") &&
		gesture.altKey !== true &&
		gesture.ctrlKey !== true &&
		gesture.metaKey !== true &&
		gesture.shiftKey !== true
	) {
		return "select";
	}

	if (gesture.key === "Enter" || gesture.key === " ") {
		return "consume";
	}

	return null;
}
