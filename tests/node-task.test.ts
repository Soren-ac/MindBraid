import { describe, expect, it } from "vitest";

import { createMindMapNodeEditSnapshot } from "../src/core/model";
import {
	NodeTaskToggleError,
	planNodeTaskToggleInContent,
} from "../src/topic/mutation/node-task";
import { parseMarkdown } from "../src/core/parser";

const PATH = "Notes/Tasks.md";

function parse(content: string) {
	return parseMarkdown(content, PATH, "Tasks");
}

function findListAtLine(content: string, line: number) {
	const document = parse(content);
	const node = findNode(document.root, (candidate) =>
		candidate.kind === "list" && candidate.source.line === line,
	);
	if (node?.kind !== "list") {
		throw new Error(`Expected a list node on line ${line}.`);
	}
	return {
		document,
		node,
	};
}

function planForLine(content: string, line: number) {
	const { document, node } = findListAtLine(content, line);
	return planNodeTaskToggleInContent({
		node: createMindMapNodeEditSnapshot(
			node,
			document.sourceRevision,
		),
		content,
	});
}

describe("planNodeTaskToggleInContent", () => {
	it("toggles an unchecked unordered task with a one-character replacement", () => {
		const content = "- [ ] Buy milk\n- [x] Keep";
		const plan = planForLine(content, 0);

		expect(plan).toMatchObject({
			nodeId: findListAtLine(content, 0).node.id,
			sourceLine: 0,
			previousTaskState: "unchecked",
			nextTaskState: "checked",
			changed: true,
			replacementStartOffset: 3,
			replacementEndOffset: 4,
			replacementText: "x",
			updatedContent: "- [x] Buy milk\n- [x] Keep",
		});
		expect(
			content.slice(0, plan.replacementStartOffset) +
				plan.replacementText +
				content.slice(plan.replacementEndOffset),
		).toBe(plan.updatedContent);
		expect(findListAtLine(plan.updatedContent, 0).node.taskState).toBe(
			"checked",
		);
	});

	it("toggles a checked ordered task while preserving formatting and CRLF", () => {
		const content = "1. [X]\t**Done**\r\n2. [ ] Keep\r\n";
		const plan = planForLine(content, 0);

		expect(plan).toMatchObject({
			previousTaskState: "checked",
			nextTaskState: "unchecked",
			replacementText: " ",
			updatedContent: "1. [ ]\t**Done**\r\n2. [ ] Keep\r\n",
		});
		expect(plan.updatedContent.replace("[ ]", "[X]")).toBe(content);
		expect(findListAtLine(plan.updatedContent, 0).node).toMatchObject({
			marker: "1.",
			ordered: true,
			ordinal: 1,
			text: "Done",
			taskState: "unchecked",
		});
	});

	it("preserves every non-task byte, including BOM, indentation, and mixed line endings", () => {
		const content =
			"\uFEFF# Plan\r\n  12.\t[ ] **Ship** [[Release|Alias]]\nTail\r";
		const plan = planForLine(content, 1);

		expect(plan.updatedContent).toBe(
			"\uFEFF# Plan\r\n  12.\t[x] **Ship** [[Release|Alias]]\nTail\r",
		);
		const changedOffsets = [...content]
			.map((character, index) =>
				character === plan.updatedContent[index] ? null : index,
			)
			.filter((index): index is number => index !== null);
		expect(changedOffsets).toEqual([plan.replacementStartOffset]);
		expect(plan.replacementEndOffset).toBe(
			plan.replacementStartOffset + 1,
		);
	});

	it("rejects a source revision that changed after the checkbox gesture", () => {
		const original = "- [ ] Task";
		const { document, node } = findListAtLine(original, 0);
		const snapshot = createMindMapNodeEditSnapshot(
			node,
			document.sourceRevision,
		);

		expectTaskError(
			() =>
				planNodeTaskToggleInContent({
					node: snapshot,
					content: "# Added\n- [ ] Task",
				}),
			"stale-source",
		);
	});

	it("rejects mismatched task marker, indentation, state, and visible text snapshots", () => {
		const content = "  - [ ] Visible task";
		const { document, node } = findListAtLine(content, 0);
		const snapshot = createMindMapNodeEditSnapshot(
			node,
			document.sourceRevision,
		);
		if (snapshot.kind !== "list") {
			throw new Error("Expected a list snapshot.");
		}

		for (const mismatchedNode of [
			{ ...snapshot, marker: "*" as const },
			{
				...snapshot,
				source: { ...snapshot.source, ch: snapshot.source.ch + 1 },
			},
			{ ...snapshot, taskState: "checked" as const },
			{ ...snapshot, text: "Different visible text" },
		]) {
			expectTaskError(
				() =>
					planNodeTaskToggleInContent({
						node: mismatchedNode,
						content,
					}),
				"stale-node",
			);
		}
	});

	it("rejects non-task nodes without exposing a write plan", () => {
		const content = "# Heading\n- Plain list";
		const document = parse(content);
		const heading = document.root.children[0];
		const list = heading?.children[0];
		if (heading === undefined || list === undefined) {
			throw new Error("Expected source nodes.");
		}

		for (const node of [heading, list]) {
			expectTaskError(
				() =>
					planNodeTaskToggleInContent({
						node: createMindMapNodeEditSnapshot(
							node,
							document.sourceRevision,
						),
						content,
					}),
				"not-task-list",
			);
		}
	});
});

function findNode(
	root: ReturnType<typeof parse>["root"],
	predicate: (node: ReturnType<typeof parse>["root"]["children"][number]) => boolean,
) {
	const pending = [...root.children];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		if (predicate(node)) {
			return node;
		}
		for (const child of node.children) {
			pending.push(child);
		}
	}
	return null;
}

function expectTaskError(
	callback: () => unknown,
	code: NodeTaskToggleError["code"],
): void {
	try {
		callback();
	} catch (error: unknown) {
		expect(error).toBeInstanceOf(NodeTaskToggleError);
		expect((error as NodeTaskToggleError).code).toBe(code);
		return;
	}
	throw new Error(`Expected NodeTaskToggleError(${code}).`);
}
