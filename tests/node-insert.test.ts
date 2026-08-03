import { describe, expect, it } from "vitest";

import type {
	MindMapDocument,
	MindMapNode,
} from "../src/core/model";
import {
	DEFAULT_NEW_NODE_TEXT,
	NodeInsertionError,
	planNodeInsertionInContent,
	type NodeCreateKind,
	type NodeInsertionPlan,
} from "../src/topic/mutation/node-insert";
import { parseMarkdown } from "../src/core/parser";

const PATH = "Notes/Test.md";

describe("planNodeInsertionInContent", () => {
	it("creates a level-one heading as the root child of an empty note", () => {
		const content = "";
		const document = parse(content);

		const plan = createPlan(
			content,
			document,
			document.root.id,
			"child",
		);

		expect(DEFAULT_NEW_NODE_TEXT).toBe("New topic");
		expect(plan).toEqual({
			insertionOffset: 0,
			insertionText: "# New topic",
			insertedLine: "# New topic",
			sourceLine: 0,
			createdNodeKind: "heading",
			fallbackReason: null,
			updatedContent: "# New topic",
		});
		expectCreatedRelationship(plan, document.root.id, "heading");
	});

	it("appends a root child after ordinary prose at end of file", () => {
		const content = "Intro paragraph.\n\nTail paragraph.";
		const document = parse(content);

		const plan = createPlan(
			content,
			document,
			document.root.id,
			"child",
		);

		expect(plan.insertedLine).toBe("# New topic");
		expect(plan.sourceLine).toBe(3);
		expect(plan.updatedContent).toBe(
			"Intro paragraph.\n\nTail paragraph.\n# New topic",
		);
	});

	it("inserts a heading sibling after its complete subtree and body prose", () => {
		const content = [
			"# Parent",
			"Parent prose",
			"## Child",
			"Child prose",
			"# Existing",
			"Existing prose",
		].join("\n");
		const document = parse(content);
		const parent = findNode(
			document.root,
			(node) => node.kind === "heading" && node.text === "Parent",
		);

		const plan = createPlan(
			content,
			document,
			requireNode(parent).id,
			"sibling",
		);

		expect(plan.sourceLine).toBe(4);
		expect(plan.insertedLine).toBe("# New topic");
		expect(plan.updatedContent).toBe(
			[
				"# Parent",
				"Parent prose",
				"## Child",
				"Child prose",
				"# New topic",
				"# Existing",
				"Existing prose",
			].join("\n"),
		);
		expectCreatedRelationship(
			plan,
			document.root.id,
			"heading",
		);
	});

	it("inserts a heading child one level deeper at subtree end", () => {
		const content = [
			"# Parent",
			"Parent prose",
			"### Skipped child",
			"Child prose",
			"# Existing",
		].join("\n");
		const document = parse(content);
		const parent = requireNode(
			findNode(
				document.root,
				(node) => node.kind === "heading" && node.text === "Parent",
			),
		);

		const plan = createPlan(
			content,
			document,
			parent.id,
			"child",
		);

		expect(plan.sourceLine).toBe(4);
		expect(plan.insertedLine).toBe("## New topic");
		expect(plan.updatedContent).toContain(
			"Child prose\n## New topic\n# Existing",
		);
		expectCreatedRelationship(plan, parent.id, "heading");
	});

	it("falls back to a list child for a level-six heading and records why", () => {
		const content = "# Root\n###### Deep\nDeep prose\n# Existing";
		const document = parse(content);
		const deep = requireNode(
			findNode(
				document.root,
				(node) => node.kind === "heading" && node.level === 6,
			),
		);

		const plan = createPlan(
			content,
			document,
			deep.id,
			"child",
		);

		expect(plan.insertedLine).toBe("- New topic");
		expect(plan.createdNodeKind).toBe("list");
		expect(plan.fallbackReason).toBe("heading-level-limit");
		expect(plan.updatedContent).toContain(
			"Deep prose\n- New topic\n# Existing",
		);
		expectCreatedRelationship(plan, deep.id, "list");
	});

	it("rejects a list sibling insertion when unmodeled body content follows the branch", () => {
		const content = [
			"# List",
			"- Parent",
			"  * Child",
			"Paragraph boundary",
			"- Existing",
		].join("\n");
		const document = parse(content);
		const parent = requireNode(
			findNode(
				document.root,
				(node) => node.kind === "list" && node.text === "Parent",
			),
		);

		expectInsertionError(
			() =>
				createPlan(
					content,
					document,
					parent.id,
					"sibling",
				),
			"unsafe-insertion-boundary",
		);
	});

	it("rejects a list child insertion before an unmodeled continuation", () => {
		const content = "- Parent\nParagraph boundary\n- Existing";
		const document = parse(content);
		const parent = requireNode(
			findNode(
				document.root,
				(node) => node.kind === "list" && node.text === "Parent",
			),
		);

		expectInsertionError(
			() =>
				createPlan(
					content,
					document,
					parent.id,
					"child",
				),
			"unsafe-insertion-boundary",
		);
	});

	it("rejects a list insertion when body content follows a parsed child", () => {
		const content = "- Parent\n\t* Existing child\nParagraph";
		const document = parse(content);
		const parent = requireNode(
			findNode(
				document.root,
				(node) => node.kind === "list" && node.text === "Parent",
			),
		);

		expectInsertionError(
			() =>
				createPlan(
					content,
					document,
					parent.id,
					"child",
				),
			"unsafe-insertion-boundary",
		);
	});

	it("keeps ordered siblings and starts a nested ordered list at one", () => {
		const siblingContent = "12. Parent\n13. Tail";
		const siblingDocument = parse(siblingContent);
		const siblingTarget = requireNode(
			siblingDocument.root.children[0],
		);
		const siblingPlan = createPlan(
			siblingContent,
			siblingDocument,
			siblingTarget.id,
			"sibling",
		);

		expect(siblingPlan.insertedLine).toBe("12. New topic");

		const childContent = "12. Parent\n13. Tail";
		const childDocument = parse(childContent);
		const childTarget = requireNode(childDocument.root.children[0]);
		const childPlan = createPlan(
			childContent,
			childDocument,
			childTarget.id,
			"child",
		);

		expect(childPlan.insertedLine).toBe("  1. New topic");
		expectCreatedRelationship(childPlan, childTarget.id, "list");
	});

	it("preserves CRLF and the existing final newline", () => {
		const content = "# Parent\r\n## Child\r\n# Existing\r\n";
		const document = parse(content);
		const parent = requireNode(document.root.children[0]);

		const plan = createPlan(
			content,
			document,
			parent.id,
			"child",
		);

		expect(plan.insertionText).toBe("## New topic\r\n");
		expect(plan.sourceLine).toBe(2);
		expect(plan.updatedContent).toBe(
			"# Parent\r\n## Child\r\n## New topic\r\n# Existing\r\n",
		);
		expect(plan.updatedContent.endsWith("\r\n")).toBe(true);
	});

	it("preserves final-newline policy when appending at end of file", () => {
		const withoutTerminator = "# Parent";
		const withoutDocument = parse(withoutTerminator);
		const withoutPlan = createPlan(
			withoutTerminator,
			withoutDocument,
			withoutDocument.root.children[0]?.id ?? "",
			"child",
		);
		expect(withoutPlan.updatedContent).toBe(
			"# Parent\n## New topic",
		);

		const withTerminator = "# Parent\n";
		const withDocument = parse(withTerminator);
		const withPlan = createPlan(
			withTerminator,
			withDocument,
			withDocument.root.children[0]?.id ?? "",
			"child",
		);
		expect(withPlan.updatedContent).toBe(
			"# Parent\n## New topic\n",
		);
	});

	it("escapes custom plain text through the existing edit planner", () => {
		const content = "# Parent";
		const document = parse(content);
		const parent = requireNode(document.root.children[0]);

		const plan = createPlan(
			content,
			document,
			parent.id,
			"child",
			"Literal **bold** [ ] `code` #",
		);

		expect(plan.insertedLine).toBe(
			"## Literal \\*\\*bold\\*\\* \\[ \\] \\`code\\` \\#",
		);
		const created = findNodeAtLine(
			parse(plan.updatedContent).root,
			plan.sourceLine,
		);
		expect(created?.text).toBe("Literal **bold** [ ] `code` #");
	});

	it("rejects a root sibling", () => {
		const content = "# Parent";
		const document = parse(content);

		expectInsertionError(
			() =>
				createPlan(
					content,
					document,
					document.root.id,
					"sibling",
				),
			"root-sibling-not-supported",
		);
	});

	it("rejects stale source content and stale gesture revisions", () => {
		const content = "# Parent";
		const document = parse(content);
		const targetId = document.root.children[0]?.id ?? "";

		expectInsertionError(
			() =>
				planNodeInsertionInContent({
					document,
					content: "# Changed",
					targetNodeId: targetId,
					sourceRevision: document.sourceRevision,
					createKind: "child",
				}),
			"stale-source",
		);
		expectInsertionError(
			() =>
				planNodeInsertionInContent({
					document,
					content,
					targetNodeId: targetId,
					sourceRevision: "stale-revision",
					createKind: "child",
				}),
			"stale-source",
		);
	});

	it("rejects a target missing from the current document", () => {
		const content = "# Parent";
		const document = parse(content);

		expectInsertionError(
			() =>
				createPlan(
					content,
					document,
					"obmind:missing",
					"child",
				),
			"target-node-not-found",
		);
	});

	it("rejects a forged stale source location", () => {
		const content = "# Parent\n# Existing";
		const document = parse(content);
		const target = requireNode(document.root.children[0]);
		const forgedTarget = {
			...target,
			source: {
				...target.source,
				line: 1,
			},
		};
		const forgedDocument: MindMapDocument = {
			...document,
			root: {
				...document.root,
				children: [
					forgedTarget,
					...document.root.children.slice(1),
				],
			},
		};

		expectInsertionError(
			() =>
				createPlan(
					content,
					forgedDocument,
					target.id,
					"child",
				),
			"stale-target",
		);
	});

	it("rejects an insertion that would land inside an unclosed fence", () => {
		const content = "# Parent\n```md\nunterminated code";
		const document = parse(content);
		const parent = requireNode(document.root.children[0]);

		expectInsertionError(
			() =>
				createPlan(
					content,
					document,
					parent.id,
					"child",
				),
			"unsafe-insertion-boundary",
		);
	});

	it.each(["", " ", "\t"])("rejects empty text %j", (text) => {
		const content = "# Parent";
		const document = parse(content);
		const parent = requireNode(document.root.children[0]);

		expectInsertionError(
			() =>
				createPlan(
					content,
					document,
					parent.id,
					"child",
					text,
				),
			"empty-new-text",
		);
	});

	it.each(["one\ntwo", "one\rtwo"])(
		"rejects multiline text %j",
		(text) => {
			const content = "# Parent";
			const document = parse(content);
			const parent = requireNode(document.root.children[0]);

			expectInsertionError(
				() =>
					createPlan(
						content,
						document,
						parent.id,
						"child",
						text,
					),
				"multiline-new-text",
			);
		},
	);
});

function parse(content: string): MindMapDocument {
	return parseMarkdown(content, PATH, "Test");
}

function createPlan(
	content: string,
	document: MindMapDocument,
	targetNodeId: string,
	createKind: NodeCreateKind,
	text?: string,
): NodeInsertionPlan {
	return planNodeInsertionInContent({
		document,
		content,
		targetNodeId,
		sourceRevision: document.sourceRevision,
		createKind,
		...(text === undefined ? {} : { text }),
	});
}

function expectCreatedRelationship(
	plan: NodeInsertionPlan,
	expectedParentId: string,
	expectedKind: "heading" | "list",
): void {
	const document = parse(plan.updatedContent);
	const created = findNodeAtLine(document.root, plan.sourceLine);
	expect(created).toMatchObject({
		kind: expectedKind,
		text: "New topic",
	});
	expect(findParent(document.root, created?.id ?? "")?.id).toBe(
		expectedParentId,
	);
}

function findNode(
	root: MindMapNode,
	predicate: (node: MindMapNode) => boolean,
): MindMapNode | null {
	const pending = [root];
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

function findNodeAtLine(
	root: MindMapNode,
	line: number,
): MindMapNode | null {
	return findNode(
		root,
		(node) => node.kind !== "root" && node.source.line === line,
	);
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

function requireNode(node: MindMapNode | null | undefined): MindMapNode {
	if (node === null || node === undefined) {
		throw new Error("Expected a mind-map node.");
	}
	return node;
}

function expectInsertionError(
	run: () => unknown,
	code: NodeInsertionError["code"],
): void {
	try {
		run();
		throw new Error("Expected NodeInsertionError.");
	} catch (error: unknown) {
		expect(error).toBeInstanceOf(NodeInsertionError);
		expect((error as NodeInsertionError).code).toBe(code);
	}
}
