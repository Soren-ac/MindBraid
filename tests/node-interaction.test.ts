import { describe, expect, it } from "vitest";

import {
	resolveMindMapCanvasPointerIntent,
	resolveMindMapNodeClickIntent,
	resolveMindMapNodeEditorKeyIntent,
	resolveMindMapNodeKeyIntent,
} from "../src/topic/interaction/node-interaction";

describe("resolveMindMapCanvasPointerIntent", () => {
	it("begins marquee selection on a plain drag (no space key)", () => {
		expect(
			resolveMindMapCanvasPointerIntent({
				hasActiveEdit: false,
			}),
		).toBe("begin-marquee");
	});

	it("pans when Space is held on an idle canvas", () => {
		expect(
			resolveMindMapCanvasPointerIntent({
				hasActiveEdit: false,
				spaceKey: true,
			}),
		).toBe("clear-selection-and-pan");
	});

	it("commits an active inline edit before panning (Space held)", () => {
		expect(
			resolveMindMapCanvasPointerIntent({
				hasActiveEdit: true,
				spaceKey: true,
			}),
		).toBe("commit-edit-clear-selection-and-pan");
	});

	it("commits an active inline edit before marquee on plain drag", () => {
		expect(
			resolveMindMapCanvasPointerIntent({
				hasActiveEdit: true,
			}),
		).toBe("commit-edit-clear-selection-and-pan");
	});

	it("begins marquee on Shift-drag (no space key)", () => {
		expect(
			resolveMindMapCanvasPointerIntent({
				hasActiveEdit: false,
				shiftKey: true,
			}),
		).toBe("begin-marquee");
	});
});

describe("resolveMindMapNodeClickIntent", () => {
	it("selects on the first plain click", () => {
		expect(
			resolveMindMapNodeClickIntent({ alreadySelected: false }),
		).toBe("select");
	});

	it("edits when an already-selected node is clicked again", () => {
		expect(
			resolveMindMapNodeClickIntent({ alreadySelected: true }),
		).toBe("edit");
	});

	it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }])(
		"reserves selection modifiers for multi-selection: %o",
		(modifier) => {
			expect(
				resolveMindMapNodeClickIntent({
					alreadySelected: false,
					...modifier,
				}),
			).toBe("select");
		},
	);

	it("keeps source navigation behind Alt/Option click", () => {
		expect(
			resolveMindMapNodeClickIntent({
				alreadySelected: false,
				altKey: true,
			}),
		).toBe("open-source");
	});
});

describe("resolveMindMapNodeKeyIntent", () => {
	it("creates a child with Tab and a sibling with Enter", () => {
		expect(
			resolveMindMapNodeKeyIntent({
				key: "Tab",
				nodeKind: "heading",
				selected: true,
			}),
		).toBe("create-child");
		expect(
			resolveMindMapNodeKeyIntent({
				key: "Enter",
				nodeKind: "list",
				selected: true,
			}),
		).toBe("create-sibling");
	});

	it("treats Enter on the document root as a main-topic child", () => {
		expect(
			resolveMindMapNodeKeyIntent({
				key: "Enter",
				nodeKind: "root",
				selected: true,
			}),
		).toBe("create-child");
	});

	it("supports Space and F2 editing", () => {
		expect(
			resolveMindMapNodeKeyIntent({
				key: " ",
				nodeKind: "heading",
				selected: true,
			}),
		).toBe("edit");
		expect(
			resolveMindMapNodeKeyIntent({
				key: "F2",
				nodeKind: "heading",
				selected: false,
			}),
		).toBe("edit");
	});

	it("opens source with Cmd/Ctrl+Enter", () => {
		expect(
			resolveMindMapNodeKeyIntent({
				key: "Enter",
				metaKey: true,
				nodeKind: "heading",
				selected: true,
			}),
		).toBe("open-source");
	});

	it("clears a selected topic with Escape", () => {
		expect(
			resolveMindMapNodeKeyIntent({
				key: "Escape",
				nodeKind: "heading",
				selected: true,
			}),
		).toBe("clear-selection");
	});

	it.each([
		{ key: "Tab", shiftKey: true },
		{ key: "Tab", isComposing: true },
	])("ignores reserved, repeated, or composing gestures: %o", (gesture) => {
		expect(
			resolveMindMapNodeKeyIntent({
				nodeKind: "heading",
				selected: true,
				...gesture,
			}),
		).toBeNull();
	});

	it.each([
		{ key: "Enter", altKey: true },
		{ key: "Enter", repeat: true },
		{ key: " ", metaKey: true },
		{ key: " ", isComposing: true },
	])("consumes button activation without a semantic action: %o", (gesture) => {
		expect(
			resolveMindMapNodeKeyIntent({
				nodeKind: "heading",
				selected: true,
				...gesture,
			}),
		).toBe("consume");
	});

	it.each(["Enter", " "])(
		"selects an unselected keyboard-focused topic with %o",
		(key) => {
			expect(
				resolveMindMapNodeKeyIntent({
					key,
					nodeKind: "heading",
					selected: false,
				}),
			).toBe("select");
		},
	);

	it("does not create when the focused node is not selected", () => {
		expect(
			resolveMindMapNodeKeyIntent({
				key: "Tab",
				nodeKind: "heading",
				selected: false,
			}),
		).toBeNull();
	});
});

describe("resolveMindMapNodeEditorKeyIntent", () => {
	it("commits with Enter and chains a child creation with Tab", () => {
		expect(
			resolveMindMapNodeEditorKeyIntent({ key: "Enter" }),
		).toBe("commit-edit");
		expect(
			resolveMindMapNodeEditorKeyIntent({ key: "Tab" }),
		).toBe("commit-and-create-child");
	});

	it("cancels with Escape and ignores ordinary text input", () => {
		expect(
			resolveMindMapNodeEditorKeyIntent({ key: "Escape" }),
		).toBe("cancel-edit");
		expect(
			resolveMindMapNodeEditorKeyIntent({ key: "a" }),
		).toBeNull();
	});

	it.each(["Enter", "Tab", "Escape"])(
		"consumes repeated %s without duplicating an action",
		(key) => {
			expect(
				resolveMindMapNodeEditorKeyIntent({
					key,
					repeat: true,
				}),
			).toBe("consume");
		},
	);

	it("does not commit an IME composition", () => {
		expect(
			resolveMindMapNodeEditorKeyIntent({
				key: "Enter",
				isComposing: true,
			}),
		).toBeNull();
		expect(
			resolveMindMapNodeEditorKeyIntent({
				key: "Tab",
				isComposing: true,
			}),
		).toBe("consume");
		expect(
			resolveMindMapNodeEditorKeyIntent({
				key: "Process",
				isComposing: true,
			}),
		).toBeNull();
	});

	it("never creates a child from a modified Tab", () => {
		for (const modifier of [
			{ altKey: true },
			{ ctrlKey: true },
			{ metaKey: true },
			{ shiftKey: true },
		]) {
			expect(
				resolveMindMapNodeEditorKeyIntent({
					key: "Tab",
					...modifier,
				}),
			).toBeNull();
		}
	});

	it("leaves Shift+Enter to the multiline editor", () => {
		expect(
			resolveMindMapNodeEditorKeyIntent({
				key: "Enter",
				shiftKey: true,
			}),
		).toBeNull();
		expect(
			resolveMindMapNodeEditorKeyIntent({
				key: "Enter",
				shiftKey: true,
				allowsLineBreaks: false,
			}),
		).toBe("consume");
	});

	it("consumes command-modified Enter and modified Escape without losing the draft", () => {
		expect(
			resolveMindMapNodeEditorKeyIntent({
				key: "Enter",
				metaKey: true,
			}),
		).toBe("consume");
		expect(
			resolveMindMapNodeEditorKeyIntent({
				key: "Escape",
				shiftKey: true,
			}),
		).toBe("consume");
	});
});
