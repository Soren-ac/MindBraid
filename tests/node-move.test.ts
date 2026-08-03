import { describe, expect, it } from "vitest";

import type {
	MindMapDocument,
	MindMapNode,
} from "../src/core/model";
import {
	NodeMoveError,
	planNodeMoveInContent,
	type NodeMovePlacement,
	type NodeMovePlan,
} from "../src/topic/mutation/node-move";
import { parseMarkdown } from "../src/core/parser";

const PATH = "Notes/Test.md";

describe("planNodeMoveInContent", () => {
	it("moves a complete heading section after a sibling", () => {
		const content = [
			"# A",
			"A prose",
			"## A child",
			"```md",
			"# pseudo heading",
			"```",
			"# B",
			"B prose",
			"# C",
		].join("\n");
		const document = parse(content);
		const plan = move(
			content,
			document,
			findByText(document, "A").id,
			findByText(document, "B").id,
			"after",
		);

		expect(plan.changed).toBe(true);
		expect(plan.originalRange).toEqual({
			startLine: 0,
			endLineExclusive: 6,
		});
		expect(plan.updatedContent).toBe(
			[
				"# B",
				"B prose",
				"# A",
				"A prose",
				"## A child",
				"```md",
				"# pseudo heading",
				"```",
				"# C",
			].join("\n"),
		);
		expect(applyPlannedReplacement(content, plan)).toBe(
			plan.updatedContent,
		);
		expect(shape(parse(plan.updatedContent).root)).toEqual([
			"Test",
			["B"],
			["A", ["A child"]],
			["C"],
		]);
	});

	it("moves a heading before a sibling", () => {
		const content = "# A\n# B\n# C";
		const document = parse(content);
		const plan = move(
			content,
			document,
			findByText(document, "C").id,
			findByText(document, "B").id,
			"before",
		);

		expect(plan.updatedContent).toBe("# A\n# C\n# B");
		expect(plan.movedSourceLine).toBe(1);
		expect(plan.targetSourceLine).toBe(2);
	});

	it("moves a heading to an exact position under another parent", () => {
		const content =
			"# Parent A\n## A1\n# Parent B\n## B1\n## B2";
		const document = parse(content);
		const plan = move(
			content,
			document,
			findByText(document, "A1").id,
			findByText(document, "B2").id,
			"before",
		);

		expect(plan.updatedContent).toBe(
			"# Parent A\n# Parent B\n## B1\n## A1\n## B2",
		);
		expect(shape(parse(plan.updatedContent).root)).toEqual([
			"Test",
			["Parent A"],
			["Parent B", ["B1"], ["A1"], ["B2"]],
		]);
	});

	it("moves a list branch to an exact position under another heading", () => {
		const content =
			"# Parent A\n- A1\n  - child\n# Parent B\n- B1\n- B2";
		const document = parse(content);
		const plan = move(
			content,
			document,
			findByText(document, "A1").id,
			findByText(document, "B2").id,
			"before",
		);

		expect(plan.updatedContent).toBe(
			"# Parent A\n# Parent B\n- B1\n- A1\n  - child\n- B2",
		);
		expect(shape(parse(plan.updatedContent).root)).toEqual([
			"Test",
			["Parent A"],
			["Parent B", ["B1"], ["A1", ["child"]], ["B2"]],
		]);
	});

	it("rejects moving from or beside a list branch with unmodeled body content", () => {
		const content =
			"- Source\ncontinuation\n- Target\nother continuation\n- Tail";
		const document = parse(content);

		expectMoveError(
			() =>
				move(
					content,
					document,
					findByText(document, "Source").id,
					findByText(document, "Tail").id,
					"before",
				),
			"unsafe-source-range",
		);
		expectMoveError(
			() =>
				move(
					content,
					document,
					findByText(document, "Tail").id,
					findByText(document, "Target").id,
					"after",
				),
			"unsafe-source-range",
		);
	});

	it("moves the exact duplicate-label heading selected by its source ID", () => {
		const content =
			"# Same\nFirst body\n# Other\n# Same\nSecond body";
		const document = parse(content);
		const duplicates = findAllByText(document, "Same");
		const first = duplicates[0];
		const second = duplicates[1];
		if (first === undefined || second === undefined) {
			throw new Error("Expected two duplicate-label headings.");
		}

		const plan = move(
			content,
			document,
			second.id,
			first.id,
			"before",
		);

		expect(plan.updatedContent).toBe(
			"# Same\nSecond body\n# Same\nFirst body\n# Other",
		);
		expect(plan.movedSourceLine).toBe(0);
	});

	it("relevels a complete heading subtree as the target's final child", () => {
		const content =
			"# Destination\n## Existing\n# Moving\n### Skipped\n# Tail";
		const document = parse(content);
		const plan = move(
			content,
			document,
			findByText(document, "Moving").id,
			findByText(document, "Destination").id,
			"child",
		);

		expect(plan.updatedContent).toBe(
			"# Destination\n## Existing\n## Moving\n#### Skipped\n# Tail",
		);
		expect(shape(parse(plan.updatedContent).root)).toEqual([
			"Test",
			[
				"Destination",
				["Existing"],
				["Moving", ["Skipped"]],
			],
			["Tail"],
		]);
	});

	it("promotes a heading subtree to a final main topic through the root", () => {
		const content =
			"# First\n## Promote\n### Child\n# Last";
		const document = parse(content);
		const plan = move(
			content,
			document,
			findByText(document, "Promote").id,
			document.root.id,
			"child",
		);

		expect(plan.updatedContent).toBe(
			"# First\n# Last\n# Promote\n## Child",
		);
		expect(shape(parse(plan.updatedContent).root)).toEqual([
			"Test",
			["First"],
			["Last"],
			["Promote", ["Child"]],
		]);
	});

	it("rejects a heading move that would exceed level six", () => {
		const content =
			"# Target\n# Moving\n###### Deep";
		const document = parse(content);

		expectMoveError(
			() =>
				move(
					content,
					document,
					findByText(document, "Moving").id,
					findByText(document, "Target").id,
					"child",
				),
			"heading-level-limit",
		);
	});

	it("reorders a list item together with its descendants", () => {
		const content =
			"# List\n- A\n  - A child\n- B\n- C\nTail";
		const document = parse(content);
		const plan = move(
			content,
			document,
			findByText(document, "A").id,
			findByText(document, "B").id,
			"after",
		);

		expect(plan.updatedContent).toBe(
			"# List\n- B\n- A\n  - A child\n- C\nTail",
		);
		expect(shape(parse(plan.updatedContent).root)).toEqual([
			"Test",
			[
				"List",
				["B"],
				["A", ["A child"]],
				["C"],
			],
		]);
	});

	it("reindents a list subtree as the target's final child", () => {
		const content =
			"# List\n- A\n- B\n  * Existing\n- C";
		const document = parse(content);
		const plan = move(
			content,
			document,
			findByText(document, "A").id,
			findByText(document, "B").id,
			"child",
		);

		expect(plan.updatedContent).toBe(
			"# List\n- B\n  * Existing\n  - A\n- C",
		);
		expect(shape(parse(plan.updatedContent).root)).toEqual([
			"Test",
			[
				"List",
				["B", ["Existing"], ["A"]],
				["C"],
			],
		]);
	});

	it("preserves ordered, task, and mixed list markers while moving a subtree", () => {
		const content =
			"# List\n1. First\n2. [x] Done\n   + Nested\n* Other";
		const document = parse(content);
		const plan = move(
			content,
			document,
			findByText(document, "Done").id,
			findByText(document, "Other").id,
			"after",
		);

		expect(plan.updatedContent).toBe(
			"# List\n1. First\n* Other\n2. [x] Done\n   + Nested",
		);
		const moved = findByText(parse(plan.updatedContent), "Done");
		expect(moved.kind).toBe("list");
		if (moved.kind === "list") {
			expect(moved.marker).toBe("2.");
			expect(moved.ordinal).toBe(2);
			expect(moved.taskState).toBe("checked");
			expect(moved.children[0]?.kind).toBe("list");
			if (moved.children[0]?.kind === "list") {
				expect(moved.children[0].marker).toBe("+");
			}
		}
	});

	it("moves a list subtree to a heading with no heading children", () => {
		const content =
			"# Target\nTarget prose\n# Other\n- Move\n  - Child\n# Tail";
		const document = parse(content);
		const plan = move(
			content,
			document,
			findByText(document, "Move").id,
			findByText(document, "Target").id,
			"child",
		);

		expect(plan.updatedContent).toBe(
			"# Target\nTarget prose\n- Move\n  - Child\n# Other\n# Tail",
		);
		expect(shape(parse(plan.updatedContent).root)).toEqual([
			"Test",
			["Target", ["Move", ["Child"]]],
			["Other"],
			["Tail"],
		]);
	});

	it("promotes a list subtree to the root when the document has no headings", () => {
		const content =
			"- Parent\n  - Promote\n    - Child\n- Last";
		const document = parse(content);
		const plan = move(
			content,
			document,
			findByText(document, "Promote").id,
			document.root.id,
			"child",
		);

		expect(plan.updatedContent).toBe(
			"- Parent\n- Last\n- Promote\n  - Child",
		);
		expect(shape(parse(plan.updatedContent).root)).toEqual([
			"Test",
			["Parent"],
			["Last"],
			["Promote", ["Child"]],
		]);
	});

	it("preserves CRLF, a byte-order mark, and final-newline policy", () => {
		const content = "\uFEFF# A\r\n## Child\r\n# B\r\n";
		const document = parse(content);
		const plan = move(
			content,
			document,
			findByText(document, "A").id,
			findByText(document, "B").id,
			"after",
		);

		expect(plan.updatedContent).toBe(
			"\uFEFF# B\r\n# A\r\n## Child\r\n",
		);
		expect(plan.updatedContent.endsWith("\r\n")).toBe(true);
		expect(plan.updatedContent.indexOf("\uFEFF")).toBe(0);
		expect(applyPlannedReplacement(content, plan)).toBe(
			plan.updatedContent,
		);
	});

	it("returns changed false for an adjacent no-op", () => {
		const content = "# A\n# B\n";
		const document = parse(content);
		const plan = move(
			content,
			document,
			findByText(document, "A").id,
			findByText(document, "B").id,
			"before",
		);

		expect(plan.changed).toBe(false);
		expect(plan.updatedContent).toBe(content);
	});

	it("rejects a target inside the moved subtree", () => {
		const content = "# Parent\n## Child";
		const document = parse(content);

		expectMoveError(
			() =>
				move(
					content,
					document,
					findByText(document, "Parent").id,
					findByText(document, "Child").id,
					"child",
				),
			"target-inside-source",
		);
	});

	it("rejects dropping a node relative to itself", () => {
		const content = "# A";
		const document = parse(content);
		const topic = findByText(document, "A");

		expectMoveError(
			() =>
				move(
					content,
					document,
					topic.id,
					topic.id,
					"child",
				),
			"same-node",
		);
	});

	it("rejects moving the root and before/after drops on the root", () => {
		const content = "# A";
		const document = parse(content);
		const topic = findByText(document, "A");

		expectMoveError(
			() =>
				move(
					content,
					document,
					document.root.id,
					topic.id,
					"child",
				),
			"root-source-not-supported",
		);
		expectMoveError(
			() =>
				move(
					content,
					document,
					topic.id,
					document.root.id,
					"after",
				),
			"root-target-not-supported",
		);
	});

	it("rejects stale revisions and forged node mappings", () => {
		const content = "# A\n# B";
		const document = parse(content);
		const a = findByText(document, "A");
		const b = findByText(document, "B");

		expectMoveError(
			() =>
				planNodeMoveInContent({
					document,
					content: "# Changed\n# B",
					sourceRevision: document.sourceRevision,
					sourceNodeId: a.id,
					targetNodeId: b.id,
					placement: "after",
				}),
			"stale-source",
		);

		const forged: MindMapDocument = {
			...document,
			root: {
				...document.root,
				children: [
					{ ...a, text: "Forged" },
					...document.root.children.slice(1),
				],
			},
		};
		expectMoveError(
			() =>
				move(
					content,
					forged,
					a.id,
					b.id,
					"after",
				),
			"stale-node",
		);
	});

	it("rejects unsupported mixed-structure placement", () => {
		const content =
			"# Heading\n- Item\n## Child heading\n# Other";
		const document = parse(content);

		expectMoveError(
			() =>
				move(
					content,
					document,
					findByText(document, "Item").id,
					findByText(document, "Other").id,
					"after",
				),
			"unsupported-structure",
		);
		expectMoveError(
			() =>
				move(
					content,
					document,
					findByText(document, "Other").id,
					findByText(document, "Item").id,
					"child",
				),
			"unsupported-structure",
		);
	});

	it("rejects list-to-root moves when headings make final-root placement impossible", () => {
		const content = "- Before\n# Heading\n- Nested";
		const document = parse(content);

		expectMoveError(
			() =>
				move(
					content,
					document,
					findByText(document, "Nested").id,
					document.root.id,
					"child",
				),
			"unsupported-structure",
		);
	});

	it("rejects a list as the final child of a heading with heading children", () => {
		const content =
			"# Target\n## Heading child\n# Source\n- List";
		const document = parse(content);

		expectMoveError(
			() =>
				move(
					content,
					document,
					findByText(document, "List").id,
					findByText(document, "Target").id,
					"child",
				),
			"unsupported-structure",
		);
	});
});

function parse(content: string): MindMapDocument {
	return parseMarkdown(content, PATH, "Test");
}

function move(
	content: string,
	document: MindMapDocument,
	sourceNodeId: string,
	targetNodeId: string,
	placement: NodeMovePlacement,
): NodeMovePlan {
	return planNodeMoveInContent({
		document,
		content,
		sourceRevision: document.sourceRevision,
		sourceNodeId,
		targetNodeId,
		placement,
	});
}

function findByText(
	document: MindMapDocument,
	text: string,
): MindMapNode {
	const pending: MindMapNode[] = [document.root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		if (node.text === text) {
			return node;
		}
		for (
			let index = node.children.length - 1;
			index >= 0;
			index -= 1
		) {
			const child = node.children[index];
			if (child !== undefined) {
				pending.push(child);
			}
		}
	}
	throw new Error(`Expected node "${text}".`);
}

function findAllByText(
	document: MindMapDocument,
	text: string,
): MindMapNode[] {
	const matches: MindMapNode[] = [];
	const pending: MindMapNode[] = [document.root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		if (node.text === text) {
			matches.push(node);
		}
		for (
			let index = node.children.length - 1;
			index >= 0;
			index -= 1
		) {
			const child = node.children[index];
			if (child !== undefined) {
				pending.push(child);
			}
		}
	}
	return matches;
}

function shape(node: MindMapNode): [string, ...unknown[]] {
	return [node.text, ...node.children.map(shape)];
}

function expectMoveError(
	run: () => unknown,
	code: NodeMoveError["code"],
): void {
	try {
		run();
		throw new Error("Expected NodeMoveError.");
	} catch (error: unknown) {
		expect(error).toBeInstanceOf(NodeMoveError);
		expect((error as NodeMoveError).code).toBe(code);
	}
}

function applyPlannedReplacement(
	content: string,
	plan: NodeMovePlan,
): string {
	return (
		content.slice(0, plan.replacementStartOffset) +
		plan.replacementText +
		content.slice(plan.replacementEndOffset)
	);
}
