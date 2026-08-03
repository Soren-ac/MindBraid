import { describe, expect, it } from "vitest";

import type {
	MindMapDocument,
	MindMapNode,
} from "../src/core/model";
import {
	MIND_MAP_CLIPBOARD_KIND,
	MIND_MAP_CLIPBOARD_VERSION,
	NodeClipboardError,
	createNodeClipboardPayload,
	parseNodeClipboardPayload,
	planNodePasteInContent,
	serializeNodeClipboardPayload,
	type MindMapClipboardPayload,
	type NodePastePlacement,
	type NodePastePlan,
} from "../src/topic/mutation/node-clipboard";
import { parseMarkdown } from "../src/core/parser";

const SOURCE_PATH = "Notes/Source.md";
const TARGET_PATH = "Notes/Target.md";

describe("createNodeClipboardPayload", () => {
	it("copies a complete heading section with body and fenced pseudo nodes", () => {
		const content = [
			"\uFEFF# Copy **bold**",
			"Body paragraph",
			"## Child",
			"```md",
			"# pseudo",
			"- pseudo",
			"```",
			"# Tail",
		].join("\r\n");
		const document = parseSource(content);
		const original = content;
		const payload = copy(content, document, [
			findByText(document, "Copy bold").id,
		]);

		expect(content).toBe(original);
		expect(payload).toMatchObject({
			kind: MIND_MAP_CLIPBOARD_KIND,
			version: MIND_MAP_CLIPBOARD_VERSION,
		});
		expect(payload.branches).toHaveLength(1);
		expect(payload.markdown).toBe(
			[
				"# Copy **bold**",
				"Body paragraph",
				"## Child",
				"```md",
				"# pseudo",
				"- pseudo",
				"```",
			].join("\n"),
		);
		expect(payload.markdown).not.toContain("\uFEFF");
		expect(payload.branches[0]?.root).toMatchObject({
			kind: "heading",
			level: 1,
			text: "Copy bold",
			children: [
				{
					kind: "heading",
					level: 2,
					text: "Child",
				},
			],
		});
	});

	it("copies list marker, task, indentation, and descendant structure", () => {
		const content =
			"# List\n  3. [x] Done\n     + Child\n       * Deep\n# Tail";
		const document = parseSource(content);
		const payload = copy(content, document, [
			findByText(document, "Done").id,
		]);
		const root = payload.branches[0]?.root;

		expect(payload.markdown).toBe(
			"  3. [x] Done\n     + Child\n       * Deep",
		);
		expect(root).toMatchObject({
			kind: "list",
			marker: "3.",
			ordinal: 3,
			taskState: "checked",
		});
		expect(root?.children[0]).toMatchObject({
			kind: "list",
			marker: "+",
			text: "Child",
		});
	});

	it("rejects copying a list branch with unmodeled body content", () => {
		const content = "- Copy\ncontinuation\n- Tail";
		const document = parseSource(content);

		expectClipboardError(
			() =>
				copy(content, document, [
					findByText(document, "Copy").id,
				]),
			"unsafe-source-range",
		);
	});

	it("orders multiple branches by source and removes covered descendants", () => {
		const content = "# First\n## Child\n# Middle\n# Last";
		const document = parseSource(content);
		const first = findByText(document, "First");
		const child = findByText(document, "Child");
		const last = findByText(document, "Last");
		const payload = copy(content, document, [
			last.id,
			child.id,
			first.id,
			first.id,
		]);

		expect(payload.branches.map((branch) => branch.root.text)).toEqual([
			"First",
			"Last",
		]);
		expect(payload.markdown).toBe(
			"# First\n## Child\n# Last",
		);
	});

	it("round-trips its versioned structured JSON payload", () => {
		const content = "# Copy\n## Child";
		const document = parseSource(content);
		const payload = copy(content, document, [
			findByText(document, "Copy").id,
		]);
		const serialized = serializeNodeClipboardPayload(payload);

		expect(parseNodeClipboardPayload(serialized)).toEqual(payload);
	});

	it("rejects a mixed heading/list selection before it can become an unusable clipboard", () => {
		const content = "# First\n- List\n# Heading";
		const document = parseSource(content);

		expectClipboardError(
			() =>
				copy(content, document, [
					findByText(document, "Heading").id,
					findByText(document, "List").id,
				]),
			"mixed-branch-kinds",
		);
	});

	it("rejects empty, root, missing, stale, and forged selections", () => {
		const content = "# Copy\n# Tail";
		const document = parseSource(content);
		const copyNode = findByText(document, "Copy");

		expectClipboardError(
			() => copy(content, document, []),
			"empty-selection",
		);
		expectClipboardError(
			() => copy(content, document, [document.root.id]),
			"root-copy-not-supported",
		);
		expectClipboardError(
			() => copy(content, document, ["obmind:missing"]),
			"node-not-found",
		);
		expectClipboardError(
			() =>
				createNodeClipboardPayload({
					document,
					content: "# Changed\n# Tail",
					sourceRevision: document.sourceRevision,
					nodeIds: [copyNode.id],
				}),
			"stale-source",
		);

		const forged: MindMapDocument = {
			...document,
			root: {
				...document.root,
				children: [
					{ ...copyNode, text: "Forged" },
					...document.root.children.slice(1),
				],
			},
		};
		expectClipboardError(
			() => copy(content, forged, [copyNode.id]),
			"stale-node",
		);
	});
});

describe("planNodePasteInContent", () => {
	it("pastes a heading branch as a relevelled sibling with body and fences intact", () => {
		const payload = headingPayload();
		const content = "# Target\nTarget body\n# Tail";
		const document = parseTarget(content);
		const plan = paste(
			content,
			document,
			findByText(document, "Target").id,
			"sibling",
			payload,
		);

		expect(plan.updatedContent).toBe(
			[
				"# Target",
				"Target body",
				"# Copy **bold**",
				"Body",
				"### Deep",
				"```md",
				"# pseudo",
				"```",
				"# Tail",
			].join("\n"),
		);
		expect(plan.insertedRootLines).toEqual([2]);
		expect(plan.insertedNodeCount).toBe(2);
		expect(applyReplacement(content, plan)).toBe(
			plan.updatedContent,
		);
	});

	it("pastes multiple heading branches as children in source order", () => {
		const source = "# First\n## Child\n# Second";
		const sourceDocument = parseSource(source);
		const payload = copy(source, sourceDocument, [
			findByText(sourceDocument, "Second").id,
			findByText(sourceDocument, "First").id,
		]);
		const content = "# Target\n# Tail";
		const document = parseTarget(content);
		const plan = paste(
			content,
			document,
			findByText(document, "Target").id,
			"child",
			payload,
		);

		expect(plan.updatedContent).toBe(
			"# Target\n## First\n### Child\n## Second\n# Tail",
		);
		expect(plan.insertedRootLines).toEqual([1, 3]);
		expect(shape(parseTarget(plan.updatedContent).root)).toEqual([
			"Target note",
			[
				"Target",
				["First", ["Child"]],
				["Second"],
			],
			["Tail"],
		]);
	});

	it("pastes a nested list branch beside a list and reindents every descendant", () => {
		const payload = listPayload();
		const content = "# Target\n- Existing\n- Tail";
		const document = parseTarget(content);
		const plan = paste(
			content,
			document,
			findByText(document, "Existing").id,
			"sibling",
			payload,
		);

		expect(plan.updatedContent).toBe(
			"# Target\n- Existing\n3. [x] Done\n   + Child\n     * Deep\n- Tail",
		);
		const done = findByText(
			parseTarget(plan.updatedContent),
			"Done",
		);
		expect(done).toMatchObject({
			kind: "list",
			marker: "3.",
			taskState: "checked",
		});
	});

	it("pastes a list branch as a list child using existing child indentation", () => {
		const payload = listPayload();
		const content = "- Target\n\t* Existing child\n- Tail";
		const document = parseTarget(content);
		const plan = paste(
			content,
			document,
			findByText(document, "Target").id,
			"child",
			payload,
		);

		expect(plan.updatedContent).toBe(
			"- Target\n\t* Existing child\n\t3. [x] Done\n\t   + Child\n\t     * Deep\n- Tail",
		);
		expect(
			findParent(
				parseTarget(plan.updatedContent).root,
				findByText(
					parseTarget(plan.updatedContent),
					"Done",
				).id,
			)?.text,
		).toBe("Target");
	});

	it("rejects pasting beside a list target with unmodeled body content", () => {
		const payload = simpleListPayload();
		const content = "- Target\ncontinuation\n- Tail";
		const document = parseTarget(content);

		expectClipboardError(
			() =>
				paste(
					content,
					document,
					findByText(document, "Target").id,
					"sibling",
					payload,
				),
			"unsafe-source-range",
		);
	});

	it("pastes a list under a heading before its first heading child", () => {
		const payload = simpleListPayload();
		const content =
			"# Target\nTarget body\n## Existing heading\n# Tail";
		const document = parseTarget(content);
		const plan = paste(
			content,
			document,
			findByText(document, "Target").id,
			"child",
			payload,
		);

		expect(plan.updatedContent).toBe(
			"# Target\nTarget body\n- Item\n  - Child\n## Existing heading\n# Tail",
		);
		expect(shape(parseTarget(plan.updatedContent).root)).toEqual([
			"Target note",
			[
				"Target",
				["Item", ["Child"]],
				["Existing heading"],
			],
			["Tail"],
		]);
	});

	it("pastes a root list before headings so it remains a root child", () => {
		const payload = simpleListPayload();
		const content = "Intro\n# Heading";
		const document = parseTarget(content);
		const plan = paste(
			content,
			document,
			document.root.id,
			"child",
			payload,
		);

		expect(plan.updatedContent).toBe(
			"Intro\n- Item\n  - Child\n# Heading",
		);
		expect(
			findParent(
				parseTarget(plan.updatedContent).root,
				findByText(
					parseTarget(plan.updatedContent),
					"Item",
				).id,
			)?.kind,
		).toBe("root");
	});

	it("preserves destination BOM, CRLF, and final newline policy", () => {
		const payload = simpleListPayload();
		const content = "\uFEFF# Target\r\n# Tail\r\n";
		const document = parseTarget(content);
		const plan = paste(
			content,
			document,
			findByText(document, "Target").id,
			"child",
			payload,
		);

		expect(plan.updatedContent).toBe(
			"\uFEFF# Target\r\n- Item\r\n  - Child\r\n# Tail\r\n",
		);
		expect(plan.updatedContent.indexOf("\uFEFF")).toBe(0);
		expect(plan.updatedContent.endsWith("\r\n")).toBe(true);
	});

	it("pastes a heading into an empty document root", () => {
		const payload = headingPayload();
		const content = "";
		const document = parseTarget(content);
		const plan = paste(
			content,
			document,
			document.root.id,
			"child",
			payload,
		);

		expect(plan.updatedContent.startsWith("# Copy **bold**")).toBe(true);
		expect(plan.insertedRootLines).toEqual([0]);
	});

	it("rejects heading overflow and structurally incompatible targets", () => {
		const source = "# Copy\n###### Deep";
		const sourceDocument = parseSource(source);
		const heading = copy(source, sourceDocument, [
			findByText(sourceDocument, "Copy").id,
		]);
		const targetContent = "###### Target\n- List";
		const targetDocument = parseTarget(targetContent);

		expectClipboardError(
			() =>
				paste(
					targetContent,
					targetDocument,
					findByText(targetDocument, "Target").id,
					"child",
					heading,
				),
			"heading-level-limit",
		);
		expectClipboardError(
			() =>
				paste(
					targetContent,
					targetDocument,
					findByText(targetDocument, "List").id,
					"child",
					heading,
				),
			"unsupported-target",
		);
		expectClipboardError(
			() =>
				paste(
					targetContent,
					targetDocument,
					targetDocument.root.id,
					"sibling",
					heading,
				),
			"root-sibling-not-supported",
		);
	});

	it("rejects a paste inside an unclosed fence", () => {
		const fencedContent = "# Target\n```md\nunclosed";
		const fencedDocument = parseTarget(fencedContent);
		expectClipboardError(
			() =>
				paste(
					fencedContent,
					fencedDocument,
					findByText(fencedDocument, "Target").id,
					"child",
					headingPayload(),
				),
			"unsafe-result",
		);
	});

	it("rejects stale targets and tampered payloads", () => {
		const payload = simpleListPayload();
		const content = "# Target";
		const document = parseTarget(content);

		expectClipboardError(
			() =>
				planNodePasteInContent({
					document,
					content: "# Changed",
					sourceRevision: document.sourceRevision,
					targetNodeId: findByText(document, "Target").id,
					placement: "child",
					payload,
				}),
			"stale-source",
		);

		const tampered = {
			...payload,
			markdown: payload.markdown + "\n# injected",
		} as MindMapClipboardPayload;
		expectClipboardError(
			() =>
				paste(
					content,
					document,
					findByText(document, "Target").id,
					"child",
					tampered,
				),
			"invalid-payload",
		);
	});
});

function headingPayload(): MindMapClipboardPayload {
	const content = [
		"### Copy **bold**",
		"Body",
		"##### Deep",
		"```md",
		"# pseudo",
		"```",
	].join("\n");
	const document = parseSource(content);
	return copy(content, document, [
		findByText(document, "Copy bold").id,
	]);
}

function listPayload(): MindMapClipboardPayload {
	const content =
		"# Source\n  3. [x] Done\n     + Child\n       * Deep";
	const document = parseSource(content);
	return copy(content, document, [
		findByText(document, "Done").id,
	]);
}

function simpleListPayload(): MindMapClipboardPayload {
	const content = "- Item\n  - Child";
	const document = parseSource(content);
	return copy(content, document, [
		findByText(document, "Item").id,
	]);
}

function parseSource(content: string): MindMapDocument {
	return parseMarkdown(content, SOURCE_PATH, "Source");
}

function parseTarget(content: string): MindMapDocument {
	return parseMarkdown(content, TARGET_PATH, "Target note");
}

function copy(
	content: string,
	document: MindMapDocument,
	nodeIds: readonly string[],
): MindMapClipboardPayload {
	return createNodeClipboardPayload({
		document,
		content,
		sourceRevision: document.sourceRevision,
		nodeIds,
	});
}

function paste(
	content: string,
	document: MindMapDocument,
	targetNodeId: string,
	placement: NodePastePlacement,
	payload: MindMapClipboardPayload,
): NodePastePlan {
	return planNodePasteInContent({
		document,
		content,
		sourceRevision: document.sourceRevision,
		targetNodeId,
		placement,
		payload,
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

function shape(node: MindMapNode): [string, ...unknown[]] {
	return [node.text, ...node.children.map(shape)];
}

function expectClipboardError(
	run: () => unknown,
	code: NodeClipboardError["code"],
): void {
	try {
		run();
		throw new Error("Expected NodeClipboardError.");
	} catch (error: unknown) {
		expect(error).toBeInstanceOf(NodeClipboardError);
		expect((error as NodeClipboardError).code).toBe(code);
	}
}

function applyReplacement(
	content: string,
	plan: NodePastePlan,
): string {
	return (
		content.slice(0, plan.replacementStartOffset) +
		plan.replacementText +
		content.slice(plan.replacementEndOffset)
	);
}
