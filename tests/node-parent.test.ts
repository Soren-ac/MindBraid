import { describe, expect, it } from "vitest";

import type {
	MindMapDocument,
	MindMapNode,
} from "../src/core/model";
import {
	NodeParentInsertionError,
	planNodeParentInsertionInContent,
	type NodeParentInsertionPlan,
} from "../src/topic/mutation/node-parent";
import { parseMarkdown } from "../src/core/parser";

const PATH = "Notes/Test.md";

describe("planNodeParentInsertionInContent", () => {
	it("wraps a complete heading subtree in one new parent", () => {
		const content =
			"# Before\n# Target\nTarget body\n### Child\n# Tail";
		const document = parse(content);
		const plan = wrap(
			content,
			document,
			findByText(document, "Target").id,
			"New parent",
		);

		expect(plan.updatedContent).toBe(
			"# Before\n# New parent\n## Target\nTarget body\n#### Child\n# Tail",
		);
		expect(plan).toMatchObject({
			insertedLine: "# New parent",
			createdNodeKind: "heading",
			parentSourceLine: 1,
			targetSourceLine: 2,
		});
		expect(applyReplacement(content, plan)).toBe(
			plan.updatedContent,
		);
	});

	it("wraps a list subtree and preserves marker and task facts", () => {
		const content =
			"# List\n  3. [x] Target\n     + Child\n  - Tail";
		const document = parse(content);
		const plan = wrap(
			content,
			document,
			findByText(document, "Target").id,
			"Parent",
		);

		expect(plan.updatedContent).toBe(
			"# List\n  3. Parent\n    3. [x] Target\n       + Child\n  - Tail",
		);
		const updated = parse(plan.updatedContent);
		const target = findByText(updated, "Target");
		expect(target).toMatchObject({
			kind: "list",
			marker: "3.",
			taskState: "checked",
		});
		expect(findParent(updated.root, target.id)?.text).toBe("Parent");
	});

	it("rejects wrapping a list branch with unmodeled body content", () => {
		const content = "- Target\ncontinuation\n- Tail";
		const document = parse(content);

		expectParentError(
			() =>
				wrap(
					content,
					document,
					findByText(document, "Target").id,
				),
			"unsafe-source-line",
		);
	});

	it("uses tab indentation for an all-tab list branch", () => {
		const content = "- Outer\n\t* Target\n\t\t+ Child\n- Tail";
		const document = parse(content);
		const plan = wrap(
			content,
			document,
			findByText(document, "Target").id,
		);

		expect(plan.updatedContent).toBe(
			"- Outer\n\t* New topic\n\t\t* Target\n\t\t\t+ Child\n- Tail",
		);
	});

	it("preserves a BOM, CRLF, and final newline policy", () => {
		const content = "\uFEFF# Target\r\n## Child\r\n# Tail\r\n";
		const document = parse(content);
		const plan = wrap(
			content,
			document,
			findByText(document, "Target").id,
			"Parent",
		);

		expect(plan.updatedContent).toBe(
			"\uFEFF# Parent\r\n## Target\r\n### Child\r\n# Tail\r\n",
		);
	});

	it("escapes visible plain text through the existing edit planner", () => {
		const content = "# Target";
		const document = parse(content);
		const plan = wrap(
			content,
			document,
			findByText(document, "Target").id,
			"Literal **bold** [ ]",
		);

		expect(plan.insertedLine).toBe(
			"# Literal \\*\\*bold\\*\\* \\[ \\]",
		);
		expect(
			findByText(
				parse(plan.updatedContent),
				"Literal **bold** [ ]",
			).text,
		).toBe("Literal **bold** [ ]");
	});

	it("rejects a heading subtree that already reaches level six", () => {
		const content = "# Target\n###### Deep";
		const document = parse(content);

		expectParentError(
			() =>
				wrap(
					content,
					document,
					findByText(document, "Target").id,
				),
			"heading-level-limit",
		);
	});

	it("rejects the root, bad text, stale source, and a missing target", () => {
		const content = "# Target";
		const document = parse(content);

		expectParentError(
			() => wrap(content, document, document.root.id),
			"root-not-supported",
		);
		expectParentError(
			() =>
				wrap(
					content,
					document,
					findByText(document, "Target").id,
					" ",
				),
			"empty-new-text",
		);
		expectParentError(
			() =>
				wrap(
					content,
					document,
					findByText(document, "Target").id,
					"one\ntwo",
				),
			"multiline-new-text",
		);
		expectParentError(
			() =>
				planNodeParentInsertionInContent({
					document,
					content: "# Changed",
					sourceRevision: document.sourceRevision,
					targetNodeId: findByText(document, "Target").id,
				}),
			"stale-source",
		);
		expectParentError(
			() => wrap(content, document, "obmind:missing"),
			"target-node-not-found",
		);
	});
});

function parse(content: string): MindMapDocument {
	return parseMarkdown(content, PATH, "Test");
}

function wrap(
	content: string,
	document: MindMapDocument,
	targetNodeId: string,
	text?: string,
): NodeParentInsertionPlan {
	return planNodeParentInsertionInContent({
		document,
		content,
		sourceRevision: document.sourceRevision,
		targetNodeId,
		...(text === undefined ? {} : { text }),
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

function findParent(
	root: MindMapNode,
	nodeId: string,
): MindMapNode | null {
	const pending = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		if (node.children.some((child) => child.id === nodeId)) {
			return node;
		}
		for (const child of node.children) {
			pending.push(child);
		}
	}
	return null;
}

function expectParentError(
	run: () => unknown,
	code: NodeParentInsertionError["code"],
): void {
	try {
		run();
		throw new Error("Expected NodeParentInsertionError.");
	} catch (error: unknown) {
		expect(error).toBeInstanceOf(NodeParentInsertionError);
		expect((error as NodeParentInsertionError).code).toBe(code);
	}
}

function applyReplacement(
	content: string,
	plan: NodeParentInsertionPlan,
): string {
	return (
		content.slice(0, plan.replacementStartOffset) +
		plan.replacementText +
		content.slice(plan.replacementEndOffset)
	);
}
