import { describe, expect, it } from "vitest";

import type {
	HeadingMindMapNode,
	ListMindMapNode,
	MindMapNode,
} from "../src/core/model";
import { createMindMapNodeEditSnapshot } from "../src/core/model";
import {
	NodeTextEditError,
	normalizeRootNodeName,
	planNodeTextEdit,
	planNodeTextEditInContent,
	RootNodeNameError,
} from "../src/topic/mutation/node-edit";
import { parseMarkdown } from "../src/core/parser";

const PATH = "Notes/Test.md";

describe("planNodeTextEdit", () => {
	it("preserves heading indentation, marker, and separator whitespace", () => {
		const line = "  ###\t**Old heading**";
		const node = getHeading(parse(line));

		expect(planNodeTextEdit(node, line, "New heading")).toEqual({
			replacementLine: "  ###\t**New heading**",
		});
	});

	it("preserves optional closing heading hashes and their whitespace", () => {
		const line = "# **Old** \t###  ";
		const node = getHeading(parse(line));

		expect(planNodeTextEdit(node, line, "New")).toEqual({
			replacementLine: "# **New** \t###  ",
		});
	});

	it("adds a valid separator when an empty heading gains text", () => {
		const node = getHeading(parse("#"));

		expect(planNodeTextEdit(node, "#", "Named")).toEqual({
			replacementLine: "# Named",
		});
	});

	it("preserves an unordered marker and nested tab indentation", () => {
		const content = "- Parent\n\t* Child";
		const node = getList(parse(content), 1);

		expect(planNodeTextEdit(node, "\t* Child", "Renamed")).toEqual({
			replacementLine: "\t* Renamed",
		});
	});

	it("preserves an ordered marker and its separator", () => {
		const line = "12.\tOld";
		const node = getList(parse(line), 0);

		expect(planNodeTextEdit(node, line, "New")).toEqual({
			replacementLine: "12.\tNew",
		});
	});

	it("preserves a task box, casing, and surrounding whitespace", () => {
		const line = "-  [X]\t**Done**";
		const node = getList(parse(line), 0);

		expect(planNodeTextEdit(node, line, "Renamed")).toEqual({
			replacementLine: "-  [X]\t**Renamed**",
		});
	});

	it("checks parser-visible Chinese and inline-formatted text", () => {
		const line = "## **中文** 与 [[目标|别名]]";
		const node = getHeading(parse(line));

		expect(node.text).toBe("中文 与 别名");
		expect(planNodeTextEdit(node, line, "新的主题")).toEqual({
			replacementLine: "## 新的主题",
		});
	});

	it("escapes Markdown punctuation so edited input remains visible plain text", () => {
		const content = "# Old\n- Item";
		const document = parse(content);
		const heading = getHeading(document);
		const list = getList(document, 1);

		const headingPlan = planNodeTextEdit(
			heading,
			"# Old",
			"Literal **bold** `code` #",
		);
		const listPlan = planNodeTextEdit(
			list,
			"- Item",
			"[ ] C++",
		);

		expect(headingPlan.replacementLine).toBe(
			"# Literal \\*\\*bold\\*\\* \\`code\\` \\#",
		);
		expect(listPlan.replacementLine).toBe(
			"- \\[ \\] C++",
		);
		const edited = parseMarkdown(
			`${headingPlan.replacementLine}\n${listPlan.replacementLine}`,
			PATH,
			"Test",
		);
		expect(getHeading(edited).text).toBe(
			"Literal **bold** `code` #",
		);
		const editedList = getList(edited, 1);
		expect(editedList.text).toBe("[ ] C++");
		expect(editedList.taskState).toBeNull();
	});

	it("preserves a typed literal HTML break as visible text", () => {
		const content = "# Old";
		const document = parse(content);
		const heading = getHeading(document);
		const plan = planNodeTextEditInContent(
			createMindMapNodeEditSnapshot(
				heading,
				document.sourceRevision,
			),
			content,
			"Literal <br>",
		);

		expect(plan.updatedContent).toBe("# Literal \\<br\\>");
		expect(parse(plan.updatedContent).root.children[0]?.text).toBe(
			"Literal <br>",
		);
	});

	it.each(["--", "---"])(
		"keeps a hyphen-only list value as a node: %j",
		(newText) => {
			const node = getList(parse("- Old"), 0);
			const plan = planNodeTextEdit(node, "- Old", newText);
			const edited = parse(plan.replacementLine);
			const editedNode = getList(edited, 0);

			expect(plan.replacementLine).toBe(
				`- ${newText.replaceAll("-", "\\-")}`,
			);
			expect(editedNode.text).toBe(newText);
			expect(edited.hasStructuralNodes).toBe(true);
		},
	);

	it.each(["", " ", "\t"])("rejects empty new text %j", (newText) => {
		const line = "# Old";
		const node = getHeading(parse(line));

		expectNodeEditError(
			() => planNodeTextEdit(node, line, newText),
			"empty-new-text",
		);
	});

	it.each(["new\nline", "new\rline", "new\r\nline"])(
		"encodes multiline new text without adding a source line: %j",
		(newText) => {
			const line = "# Old";
			const node = getHeading(parse(line));
			const plan = planNodeTextEdit(node, line, newText);
			expect(plan.replacementLine).toBe("# new<br>line");
			expect(getHeading(parse(plan.replacementLine)).text).toBe(
				"new\nline",
			);
		},
	);

	it("rejects the document root", () => {
		const root = parse("# Old").root;

		expectNodeEditError(
			() => planNodeTextEdit(root, "# Old", "New"),
			"root-not-editable",
		);
	});

	it("rejects a stale node kind", () => {
		const node = getHeading(parse("# Old"));

		expectNodeEditError(
			() => planNodeTextEdit(node, "- Old", "New"),
			"stale-source",
		);
	});

	it("rejects a stale heading level", () => {
		const node = getHeading(parse("## Old"));

		expectNodeEditError(
			() => planNodeTextEdit(node, "### Old", "New"),
			"stale-source",
		);
	});

	it("rejects a stale list marker", () => {
		const node = getList(parse("- Old"), 0);

		expectNodeEditError(
			() => planNodeTextEdit(node, "* Old", "New"),
			"stale-source",
		);
	});

	it("rejects stale visible text even when the structure still matches", () => {
		const node = getHeading(parse("# **Old**"));

		expectNodeEditError(
			() => planNodeTextEdit(node, "# **Changed**", "New"),
			"stale-source",
		);
	});

	it("rejects a raw-line change even when the visible text is unchanged", () => {
		const document = parse("# **Old**");
		const node = createMindMapNodeEditSnapshot(
			getHeading(document),
			document.sourceRevision,
		);

		expectNodeEditError(
			() => planNodeTextEdit(node, "# _Old_", "New"),
			"stale-source",
		);
	});

	it("captures a minimal immutable edit snapshot without a child tree", () => {
		const document = parse("# Parent\n## Child");
		const heading = getHeading(document);
		const snapshot = createMindMapNodeEditSnapshot(
			heading,
			document.sourceRevision,
		);

		expect(snapshot).toMatchObject({
			id: heading.id,
			kind: "heading",
			text: "Parent",
			level: 1,
			sourceLine: "# Parent",
			source: heading.source,
			sourceRevision: document.sourceRevision,
		});
		expect("children" in snapshot).toBe(false);
		expect(snapshot.source).not.toBe(heading.source);
	});

	it("rejects a stale task state", () => {
		const node = getList(parse("- [ ] Todo"), 0);

		expectNodeEditError(
			() => planNodeTextEdit(node, "- [x] Todo", "New"),
			"stale-source",
		);
	});
});

describe("planNodeTextEditInContent", () => {
	it("preserves formatted source when visible text was not changed", () => {
		const headingContent = "# **Topic**\n";
		const headingDocument = parse(headingContent);
		const heading = createMindMapNodeEditSnapshot(
			getHeading(headingDocument),
			headingDocument.sourceRevision,
		);
		expect(
			planNodeTextEditInContent(
				heading,
				headingContent,
				"Topic",
			),
		).toEqual({
			replacementLine: "# **Topic**",
			updatedContent: headingContent,
		});

		const listContent = "- [ ] *Task*\n";
		const listDocument = parse(listContent);
		const list = createMindMapNodeEditSnapshot(
			getList(listDocument, 0),
			listDocument.sourceRevision,
		);
		expect(
			planNodeTextEditInContent(list, listContent, "Task"),
		).toEqual({
			replacementLine: "- [ ] *Task*",
			updatedContent: listContent,
		});
	});

	it("replaces only the target line in LF content", () => {
		const content = "Intro\n# Old\n- Keep\n";
		const document = parse(content);
		const node = createMindMapNodeEditSnapshot(
			getHeading(document),
			document.sourceRevision,
		);

		expect(planNodeTextEditInContent(node, content, "New")).toEqual({
			replacementLine: "# New",
			updatedContent: "Intro\n# New\n- Keep\n",
		});
	});

	it("preserves unambiguous inline formatting and link destinations", () => {
		const content =
			"# **Old heading**\n- [Old label](https://example.com)\n";
		const document = parse(content);
		const heading = createMindMapNodeEditSnapshot(
			getHeading(document),
			document.sourceRevision,
		);
		const headingPlan = planNodeTextEditInContent(
			heading,
			content,
			"New heading",
		);
		expect(headingPlan.updatedContent).toBe(
			"# **New heading**\n- [Old label](https://example.com)\n",
		);

		const refreshed = parse(headingPlan.updatedContent);
		const list = createMindMapNodeEditSnapshot(
			getList(refreshed, 1),
			refreshed.sourceRevision,
		);
		expect(
			planNodeTextEditInContent(
				list,
				headingPlan.updatedContent,
				"New label",
			).updatedContent,
		).toBe(
			"# **New heading**\n- [New label](https://example.com)\n",
		);
	});

	it("stores multiline topic text on one physical Markdown line", () => {
		const content = "# Old\n- Keep\n";
		const document = parse(content);
		const node = createMindMapNodeEditSnapshot(
			getHeading(document),
			document.sourceRevision,
		);
		const plan = planNodeTextEditInContent(
			node,
			content,
			"First\nSecond",
		);

		expect(plan.updatedContent).toBe("# First<br>Second\n- Keep\n");
		const refreshed = parse(plan.updatedContent);
		expect(getHeading(refreshed).text).toBe("First\nSecond");
		expect(getList(refreshed, 1).source.line).toBe(1);
	});

	it("preserves CRLF terminators and all non-target content", () => {
		const content = "Intro\r\n## Old\r\nTail\r\n";
		const document = parse(content);
		const node = createMindMapNodeEditSnapshot(
			getHeading(document),
			document.sourceRevision,
		);

		expect(planNodeTextEditInContent(node, content, "新标题")).toEqual({
			replacementLine: "## 新标题",
			updatedContent: "Intro\r\n## 新标题\r\nTail\r\n",
		});
	});

	it("preserves legacy CR terminators", () => {
		const content = "Intro\r## Old\rTail\r";
		const document = parse(content);
		const node = createMindMapNodeEditSnapshot(
			getHeading(document),
			document.sourceRevision,
		);

		expect(planNodeTextEditInContent(node, content, "New")).toEqual({
			replacementLine: "## New",
			updatedContent: "Intro\r## New\rTail\r",
		});
	});

	it("preserves a leading byte-order mark", () => {
		const content = "\uFEFF# Old\r\nTail";
		const document = parse(content);
		const node = createMindMapNodeEditSnapshot(
			getHeading(document),
			document.sourceRevision,
		);

		expect(planNodeTextEditInContent(node, content, "New")).toEqual({
			replacementLine: "\uFEFF# New",
			updatedContent: "\uFEFF# New\r\nTail",
		});
	});

	it("edits the mapped duplicate without changing its sibling", () => {
		const content = "# Same\n# Same\n";
		const parsed = parse(content);
		const node = findNode(
			parsed.root,
			(candidate) =>
				candidate.kind === "heading" &&
				candidate.source.line === 1,
		);
		if (node?.kind !== "heading") {
			throw new Error("Expected the second duplicate heading.");
		}

		const snapshot = createMindMapNodeEditSnapshot(
			node,
			parsed.sourceRevision,
		);
		expect(planNodeTextEditInContent(snapshot, content, "Second")).toEqual({
			replacementLine: "# Second",
			updatedContent: "# Same\n# Second\n",
		});
	});

	it("rejects a source line that is now inside a fenced code block", () => {
		const original = "Intro\n# Old";
		const document = parse(original);
		const node = createMindMapNodeEditSnapshot(
			getHeading(document),
			document.sourceRevision,
		);
		const current = "```\n# Old\n```";

		expectNodeEditError(
			() => planNodeTextEditInContent(node, current, "New"),
			"stale-source",
		);
	});

	it("rejects when a new line shifted the source mapping", () => {
		const document = parse("# Old\nTail");
		const node = createMindMapNodeEditSnapshot(
			getHeading(document),
			document.sourceRevision,
		);

		expectNodeEditError(
			() =>
				planNodeTextEditInContent(
					node,
					"Inserted\n# Old\nTail",
					"New",
				),
			"stale-source",
		);
	});

	it("rejects an out-of-range source line", () => {
		const document = parse("# Old");
		const snapshot = createMindMapNodeEditSnapshot(
			getHeading(document),
			document.sourceRevision,
		);
		if (snapshot.kind !== "heading") {
			throw new Error("Expected a heading snapshot.");
		}
		const staleNode = {
			...snapshot,
			source: {
				...snapshot.source,
				line: 3,
			},
		};

		expectNodeEditError(
			() => planNodeTextEditInContent(staleNode, "# Old", "New"),
			"source-line-out-of-range",
		);
	});

	it("rejects an identical duplicate inserted before the mapped node", () => {
		const original = "# Same\n# Same";
		const document = parse(original);
		const second = findNode(
			document.root,
			(node) => node.kind === "heading" && node.source.line === 1,
		);
		if (second?.kind !== "heading") {
			throw new Error("Expected the second duplicate heading.");
		}
		const snapshot = createMindMapNodeEditSnapshot(
			second,
			document.sourceRevision,
		);

		expectNodeEditError(
			() =>
				planNodeTextEditInContent(
					snapshot,
					"# Same\n# Same\n# Same",
					"Wrong target",
				),
			"stale-source",
		);
	});
});

describe("normalizeRootNodeName", () => {
	it.each([
		["  Project  ", "Project"],
		["Project.md", "Project"],
		["Project.MD", "Project"],
		["Project.md.md", "Project.md"],
		["中文笔记.md", "中文笔记"],
	])("normalizes %j to %j", (input, expected) => {
		expect(normalizeRootNodeName(input)).toBe(expected);
	});

	it.each(["", "   ", ".md"])("rejects empty name %j", (input) => {
		expectRootNameError(
			() => normalizeRootNodeName(input),
			"empty-name",
		);
	});

	it.each(["one\ntwo", "one\rtwo"])(
		"rejects multiline name %j",
		(input) => {
			expectRootNameError(
				() => normalizeRootNodeName(input),
				"multiline-name",
			);
		},
	);

	it.each([".", "..", "CON", "nul.txt", "LPT9.md"])(
		"rejects reserved name %j",
		(input) => {
			expectRootNameError(
				() => normalizeRootNodeName(input),
				"reserved-name",
			);
		},
	);

	it.each([
		"bad<name",
		"bad>name",
		'bad"name',
		"bad:name",
		"bad/name",
		"bad\\name",
		"bad|name",
		"bad?name",
		"bad*name",
	])("rejects path-invalid name %j", (input) => {
		expectRootNameError(
			() => normalizeRootNodeName(input),
			"invalid-character",
		);
	});

	it.each(["bad.", "bad .md"])(
		"rejects a normalized name ending in a dot or space: %j",
		(input) => {
			expectRootNameError(
				() => normalizeRootNodeName(input),
				"trailing-dot-or-space",
			);
		},
	);

	it("rejects control characters", () => {
		expectRootNameError(
			() => normalizeRootNodeName("bad\u007Fname"),
			"control-character",
		);
	});
});

function parse(content: string) {
	return parseMarkdown(content, PATH, "Test");
}

function getHeading(document: ReturnType<typeof parse>): HeadingMindMapNode {
	const node = findNode(document.root, (candidate) => {
		return candidate.kind === "heading";
	});
	if (node?.kind !== "heading") {
		throw new Error("Expected a heading node.");
	}
	return node;
}

function getList(
	document: ReturnType<typeof parse>,
	line: number,
): ListMindMapNode {
	const node = findNode(document.root, (candidate) => {
		return candidate.kind === "list" && candidate.source.line === line;
	});
	if (node?.kind !== "list") {
		throw new Error(`Expected a list node on line ${line}.`);
	}
	return node;
}

function findNode(
	root: MindMapNode,
	predicate: (node: MindMapNode) => boolean,
): MindMapNode | null {
	const pending: MindMapNode[] = [...root.children];
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

function expectNodeEditError(
	run: () => unknown,
	code: NodeTextEditError["code"],
): void {
	try {
		run();
		throw new Error("Expected NodeTextEditError.");
	} catch (error: unknown) {
		expect(error).toBeInstanceOf(NodeTextEditError);
		expect((error as NodeTextEditError).code).toBe(code);
	}
}

function expectRootNameError(
	run: () => unknown,
	code: RootNodeNameError["code"],
): void {
	try {
		run();
		throw new Error("Expected RootNodeNameError.");
	} catch (error: unknown) {
		expect(error).toBeInstanceOf(RootNodeNameError);
		expect((error as RootNodeNameError).code).toBe(code);
	}
}
