import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../src/core/parser";
import {
	canActivateMindMapTopicCommandResult,
	resolveMindMapTopicCommandShortcut,
	type MindMapTopicCommandResult,
} from "../src/topic/interaction/topic-command";

describe("resolveMindMapTopicCommandShortcut", () => {
	it.each([
		[{ key: "c", metaKey: true }, "copy"],
		[{ key: "x", ctrlKey: true }, "cut"],
		[{ key: "v", metaKey: true }, "paste-child"],
		[{ key: "Enter", ctrlKey: true }, "create-parent"],
		[{ key: "Delete" }, "delete-branch"],
		[{ key: "Backspace" }, "delete-branch"],
		[{ key: "Tab", shiftKey: true }, "outdent"],
	] as const)("maps %o to %s", (gesture, expected) => {
		expect(resolveMindMapTopicCommandShortcut(gesture, true)).toBe(
			expected,
		);
	});

	it("activates host results only on their exact current document frame", () => {
		const current = parseMarkdown("# Topic", "Map.md", "Map");
		const result: MindMapTopicCommandResult = {
			changed: true,
			document: current,
			selectedNodeIds: [],
			primaryNodeId: null,
			beginEditNodeId: null,
		};

		expect(
			canActivateMindMapTopicCommandResult(current, result),
		).toBe(true);
		expect(
			canActivateMindMapTopicCommandResult(
				parseMarkdown("# Changed", "Map.md", "Map"),
				result,
			),
		).toBe(false);
		expect(
			canActivateMindMapTopicCommandResult(
				parseMarkdown("# Topic", "Other.md", "Other"),
				result,
			),
		).toBe(false);
	});

	it("supports undo and redo without a selected topic", () => {
		expect(
			resolveMindMapTopicCommandShortcut(
				{ key: "z", metaKey: true },
				false,
			),
		).toBe("undo");
		expect(
			resolveMindMapTopicCommandShortcut(
				{ key: "Z", metaKey: true, shiftKey: true },
				false,
			),
		).toBe("redo");
		expect(
			resolveMindMapTopicCommandShortcut(
				{ key: "y", ctrlKey: true },
				false,
			),
		).toBe("redo");
	});

	it("rejects reserved, repeated, composing, and unselected topic commands", () => {
		expect(
			resolveMindMapTopicCommandShortcut(
				{ key: "Delete" },
				false,
			),
		).toBeNull();
		expect(
			resolveMindMapTopicCommandShortcut(
				{ key: "x", metaKey: true, repeat: true },
				true,
			),
		).toBeNull();
		expect(
			resolveMindMapTopicCommandShortcut(
				{ key: "v", metaKey: true, isComposing: true },
				true,
			),
		).toBeNull();
		expect(
			resolveMindMapTopicCommandShortcut(
				{ key: "c", metaKey: true, shiftKey: true },
				true,
			),
		).toBeNull();
	});
});
