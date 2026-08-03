import { describe, expect, it } from "vitest";

import type {
	MindMapDocument,
	MindMapNode,
} from "../src/core/model";
import {
	NodeDeletionError,
	getNodeDeletionRangeOffsets,
	planNodeDeletionInContent,
	type NodeDeletionMode,
	type NodeDeletionPlan,
} from "../src/topic/mutation/node-delete";
import { parseMarkdown } from "../src/core/parser";

const PATH = "Notes/Test.md";

describe("planNodeDeletionInContent", () => {
	it("deletes a complete heading section including prose and fenced code", () => {
		const content = [
			"# Keep",
			"# Remove",
			"Body",
			"## Child",
			"```md",
			"# pseudo heading",
			"- pseudo list",
			"```",
			"# Tail",
		].join("\n");
		const document = parse(content);
		const plan = remove(
			content,
			document,
			[findByText(document, "Remove").id],
			"subtree",
		);

		expect(plan.updatedContent).toBe("# Keep\n# Tail");
		expect(plan.sourceRanges).toEqual([
			{
				nodeId: findByText(document, "Remove").id,
				startLine: 1,
				endLineExclusive: 8,
			},
		]);
		expect(applyReplacement(content, plan)).toBe(
			plan.updatedContent,
		);
	});

	it("rejects deleting a list branch with unmodeled continuation content", () => {
		const content = [
			"# List",
			"- Keep",
			"- Remove",
			"  * Child",
			"    1. Grandchild",
			"Following prose",
			"- Tail",
		].join("\n");
		const document = parse(content);
		expectDeletionError(
			() =>
				remove(
					content,
					document,
					[findByText(document, "Remove").id],
					"subtree",
				),
			"unsafe-source-range",
		);
	});

	it("promotes skipped-level heading children and their complete subtrees", () => {
		const content = [
			"# Parent",
			"## Remove",
			"Body retained",
			"#### First",
			"###### Deep",
			"### Second",
			"## Tail",
		].join("\n");
		const document = parse(content);
		const plan = remove(
			content,
			document,
			[findByText(document, "Remove").id],
			"promote-children",
		);

		expect(plan.updatedContent).toBe(
			[
				"# Parent",
				"Body retained",
				"## First",
				"#### Deep",
				"## Second",
				"## Tail",
			].join("\n"),
		);
		expect(shape(parse(plan.updatedContent).root)).toEqual([
			"Test",
			[
				"Parent",
				["First", ["Deep"]],
				["Second"],
				["Tail"],
			],
		]);
	});

	it("promotes heading list children while retaining body and marker facts", () => {
		const content =
			"# Parent\n## Remove\nBody\n1. [x] Done\n   + Child\n## Tail";
		const document = parse(content);
		const plan = remove(
			content,
			document,
			[findByText(document, "Remove").id],
			"promote-children",
		);

		expect(plan.updatedContent).toBe(
			"# Parent\nBody\n1. [x] Done\n   + Child\n## Tail",
		);
		const done = findByText(parse(plan.updatedContent), "Done");
		expect(done).toMatchObject({
			kind: "list",
			marker: "1.",
			taskState: "checked",
		});
		expect(findParent(parse(plan.updatedContent).root, done.id)?.text).toBe(
			"Parent",
		);
	});

	it("promotes list children to the deleted item's indentation", () => {
		const content = [
			"- Parent",
			"  * Remove",
			"     3. First",
			"       + Deep",
			"    - Second",
			"  - Tail",
		].join("\n");
		const document = parse(content);
		const plan = remove(
			content,
			document,
			[findByText(document, "Remove").id],
			"promote-children",
		);

		expect(plan.updatedContent).toBe(
			[
				"- Parent",
				"  3. First",
				"    + Deep",
				"  - Second",
				"  - Tail",
			].join("\n"),
		);
		expect(shape(parse(plan.updatedContent).root)).toEqual([
			"Test",
			[
				"Parent",
				["First", ["Deep"]],
				["Second"],
				["Tail"],
			],
		]);
	});

	it("deletes a leaf line in promote mode", () => {
		const content = "# A\n## Leaf\n## Tail";
		const document = parse(content);
		const plan = remove(
			content,
			document,
			[findByText(document, "Leaf").id],
			"promote-children",
		);

		expect(plan.updatedContent).toBe("# A\n## Tail");
		expect(plan.sourceRanges[0]).toMatchObject({
			startLine: 1,
			endLineExclusive: 2,
		});
	});

	it("deletes multiple branches atomically in one replacement", () => {
		const content =
			"# A\n## Remove A\n### Child\n## Keep\n# Remove B\nBody\n# Tail";
		const document = parse(content);
		const plan = remove(
			content,
			document,
			[
				findByText(document, "Remove A").id,
				findByText(document, "Remove B").id,
			],
			"subtree",
		);

		expect(plan.effectiveNodeIds).toHaveLength(2);
		expect(plan.updatedContent).toBe("# A\n## Keep\n# Tail");
		expect(applyReplacement(content, plan)).toBe(
			plan.updatedContent,
		);
	});

	it("deduplicates IDs and removes descendants covered by a selected ancestor", () => {
		const content = "# Parent\n## Child\n### Grandchild\n# Tail";
		const document = parse(content);
		const parent = findByText(document, "Parent");
		const child = findByText(document, "Child");
		const plan = remove(
			content,
			document,
			[parent.id, child.id, child.id],
			"subtree",
		);

		expect(plan.requestedNodeIds).toEqual([parent.id, child.id]);
		expect(plan.effectiveNodeIds).toEqual([parent.id]);
		expect(plan.updatedContent).toBe("# Tail");
	});

	it("uses source IDs to distinguish duplicate labels", () => {
		const content = "# Same\nFirst\n# Other\n# Same\nSecond";
		const document = parse(content);
		const duplicates = findAllByText(document, "Same");
		const second = duplicates[1];
		if (second === undefined) {
			throw new Error("Expected the second duplicate.");
		}
		const plan = remove(
			content,
			document,
			[second.id],
			"subtree",
		);

		expect(plan.updatedContent).toBe("# Same\nFirst\n# Other\n");
	});

	it("preserves BOM, CRLF, and bytes outside deleted ranges", () => {
		const content = "\uFEFF# Keep\r\n# Remove\r\n## Child\r\n# Tail\r\n";
		const document = parse(content);
		const plan = remove(
			content,
			document,
			[findByText(document, "Remove").id],
			"subtree",
		);

		expect(plan.updatedContent).toBe(
			"\uFEFF# Keep\r\n# Tail\r\n",
		);
		expect(plan.updatedContent.startsWith("\uFEFF")).toBe(true);
		expect(plan.updatedContent.endsWith("\r\n")).toBe(true);
	});

	it("exposes exact byte offsets for a source range", () => {
		const content = "\uFEFF# Keep\r\n# Remove\r\n# Tail";
		const document = parse(content);
		const plan = remove(
			content,
			document,
			[findByText(document, "Remove").id],
			"subtree",
		);
		const offsets = getNodeDeletionRangeOffsets(
			content,
			plan.sourceRanges[0] ?? {
				startLine: 0,
				endLineExclusive: 0,
			},
		);

		expect(content.slice(offsets.startOffset, offsets.endOffset)).toBe(
			"# Remove\r\n",
		);
	});

	it("rejects an empty selection and the document root", () => {
		const content = "# A";
		const document = parse(content);

		expectDeletionError(
			() => remove(content, document, [], "subtree"),
			"empty-selection",
		);
		expectDeletionError(
			() =>
				remove(
					content,
					document,
					[document.root.id],
					"subtree",
				),
			"root-not-supported",
		);
	});

	it("rejects missing nodes, stale content, and forged mappings", () => {
		const content = "# A\n# B";
		const document = parse(content);
		const a = findByText(document, "A");

		expectDeletionError(
			() =>
				remove(
					content,
					document,
					["obmind:missing"],
					"subtree",
				),
			"node-not-found",
		);
		expectDeletionError(
			() =>
				planNodeDeletionInContent({
					document,
					content: "# Changed\n# B",
					sourceRevision: document.sourceRevision,
					nodeIds: [a.id],
					mode: "subtree",
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
		expectDeletionError(
			() => remove(content, forged, [a.id], "subtree"),
			"stale-node",
		);
	});
});

function parse(content: string): MindMapDocument {
	return parseMarkdown(content, PATH, "Test");
}

function remove(
	content: string,
	document: MindMapDocument,
	nodeIds: readonly string[],
	mode: NodeDeletionMode,
): NodeDeletionPlan {
	return planNodeDeletionInContent({
		document,
		content,
		sourceRevision: document.sourceRevision,
		nodeIds,
		mode,
	});
}

function findByText(
	document: MindMapDocument,
	text: string,
): MindMapNode {
	const match = findAllByText(document, text)[0];
	if (match === undefined) {
		throw new Error(`Expected node "${text}".`);
	}
	return match;
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

function shape(node: MindMapNode): [string, ...unknown[]] {
	return [node.text, ...node.children.map(shape)];
}

function expectDeletionError(
	run: () => unknown,
	code: NodeDeletionError["code"],
): void {
	try {
		run();
		throw new Error("Expected NodeDeletionError.");
	} catch (error: unknown) {
		expect(error).toBeInstanceOf(NodeDeletionError);
		expect((error as NodeDeletionError).code).toBe(code);
	}
}

function applyReplacement(
	content: string,
	plan: NodeDeletionPlan,
): string {
	return (
		content.slice(0, plan.replacementStartOffset) +
		plan.replacementText +
		content.slice(plan.replacementEndOffset)
	);
}
