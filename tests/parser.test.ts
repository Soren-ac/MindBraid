import { describe, expect, it } from "vitest";

import type { MindMapNode } from "../src/core/model";
import { parseMarkdown } from "../src/core/parser";

const FILE_PATH = "Notes/Test.md";

function parse(content: string) {
	return parseMarkdown(content, FILE_PATH, "Test");
}

function shape(node: MindMapNode): [string, ...unknown[]] {
	return [node.text, ...node.children.map(shape)];
}

describe("parseMarkdown", () => {
	it("creates only the file root for an empty file", () => {
		const document = parse("");

		expect(document.rawIsEmpty).toBe(true);
		expect(document.hasStructuralNodes).toBe(false);
		expect(document.root).toMatchObject({
			kind: "root",
			text: "Test",
			links: [],
			source: { path: FILE_PATH, line: 0, ch: 0 },
			children: [],
		});
	});

	it("treats whitespace-only content as empty", () => {
		const document = parse(" \n\t\n");

		expect(document.rawIsEmpty).toBe(true);
		expect(document.hasStructuralNodes).toBe(false);
	});

	it("ignores a file containing only prose", () => {
		const document = parse("A paragraph.\n\nAnother paragraph.");

		expect(document.rawIsEmpty).toBe(false);
		expect(document.hasStructuralNodes).toBe(false);
		expect(shape(document.root)).toEqual(["Test"]);
	});

	it("parses a single heading", () => {
		const document = parse("# Introduction");

		expect(shape(document.root)).toEqual(["Test", ["Introduction"]]);
		expect(document.root.children[0]).toMatchObject({
			kind: "heading",
			level: 1,
			source: { path: FILE_PATH, line: 0, ch: 0 },
		});
	});

	it("builds a multi-level heading hierarchy", () => {
		const document = parse("# A\n## B\n### C\n## D");

		expect(shape(document.root)).toEqual([
			"Test",
			["A", ["B", ["C"]], ["D"]],
		]);
	});

	it("attaches a skipped heading level to the nearest lower level", () => {
		const document = parse("# A\n### B\n## C\n###### D");

		expect(shape(document.root)).toEqual([
			"Test",
			["A", ["B"], ["C", ["D"]]],
		]);
		expect(document.root.children[0]).toMatchObject({
			kind: "heading",
			level: 1,
			children: [
				{ kind: "heading", level: 3 },
				{
					kind: "heading",
					level: 2,
					children: [{ kind: "heading", level: 6 }],
				},
			],
		});
	});

	it("creates unique IDs for repeated headings and repeated list text", () => {
		const document = parse("# Same\n# Same\n- Same\n- Same");
		const firstHeading = document.root.children[0];
		const secondHeading = document.root.children[1];
		const firstItem = secondHeading?.children[0];
		const secondItem = secondHeading?.children[1];

		expect(firstHeading?.id).not.toBe(secondHeading?.id);
		expect(firstItem?.id).not.toBe(secondItem?.id);
		expect(firstHeading?.id).not.toContain("Same");
		expect(firstHeading?.source.line).toBe(0);
		expect(secondHeading?.source.line).toBe(1);
		expect(firstItem?.source.line).toBe(2);
		expect(secondItem?.source.line).toBe(3);
	});

	it("preserves Chinese heading text", () => {
		const document = parse("# 项目规划\n## 数据模型");

		expect(shape(document.root)).toEqual([
			"Test",
			["项目规划", ["数据模型"]],
		]);
	});

	it("supports all unordered list markers", () => {
		const document = parse("- Dash\n* Star\n+ Plus");

		expect(shape(document.root)).toEqual([
			"Test",
			["Dash"],
			["Star"],
			["Plus"],
		]);
		expect(document.root.children.every((node) => node.kind === "list")).toBe(
			true,
		);
		expect(document.root.children).toMatchObject([
			{
				kind: "list",
				marker: "-",
				ordered: false,
				ordinal: null,
				taskState: null,
			},
			{
				kind: "list",
				marker: "*",
				ordered: false,
				ordinal: null,
				taskState: null,
			},
			{
				kind: "list",
				marker: "+",
				ordered: false,
				ordinal: null,
				taskState: null,
			},
		]);
	});

	it("supports ordered lists", () => {
		const document = parse("1. One\n2. Two\n10. Ten");

		expect(shape(document.root)).toEqual([
			"Test",
			["One"],
			["Two"],
			["Ten"],
		]);
		expect(document.root.children).toMatchObject([
			{
				kind: "list",
				marker: "1.",
				ordered: true,
				ordinal: 1,
				taskState: null,
			},
			{
				kind: "list",
				marker: "2.",
				ordered: true,
				ordinal: 2,
				taskState: null,
			},
			{
				kind: "list",
				marker: "10.",
				ordered: true,
				ordinal: 10,
				taskState: null,
			},
		]);
	});

	it("extracts checked and unchecked task-list semantics", () => {
		const document = parse(
			"- [ ] Todo\n* [x] Done\n+ [X] Also done\n1. [ ] Ordered todo\n- [~] Literal marker",
		);

		expect(shape(document.root)).toEqual([
			"Test",
			["Todo"],
			["Done"],
			["Also done"],
			["Ordered todo"],
			["[~] Literal marker"],
		]);
		expect(document.root.children).toMatchObject([
			{ marker: "-", taskState: "unchecked" },
			{ marker: "*", taskState: "checked" },
			{ marker: "+", taskState: "checked" },
			{
				marker: "1.",
				ordered: true,
				ordinal: 1,
				taskState: "unchecked",
			},
			{ marker: "-", taskState: null },
		]);
	});

	it("uses indentation to build nested mixed lists", () => {
		const document = parse(
			"- A\n  - B\n    1. C\n  * D\n+ E",
		);

		expect(shape(document.root)).toEqual([
			"Test",
			["A", ["B", ["C"]], ["D"]],
			["E"],
		]);
	});

	it("attaches list blocks to the most recent heading", () => {
		const document = parse(
			"## Parser\n\nProse is ignored.\n- Lexer\n- Grammar\n  - Cypher\n  - SQL",
		);

		expect(shape(document.root)).toEqual([
			"Test",
			[
				"Parser",
				["Lexer"],
				["Grammar", ["Cypher"], ["SQL"]],
			],
		]);
	});

	it("attaches lists before any heading to the document root", () => {
		const document = parse("- Before\n# Heading\n- After");

		expect(shape(document.root)).toEqual([
			"Test",
			["Before"],
			["Heading", ["After"]],
		]);
	});

	it("ignores YAML frontmatter at the start of the file", () => {
		const document = parse(
			"---\ntitle: '# Fake'\ntags:\n  - fake\n---\n# Real",
		);

		expect(shape(document.root)).toEqual(["Test", ["Real"]]);
		expect(document.root.children[0]?.source.line).toBe(5);
	});

	it("ignores an unclosed YAML frontmatter block through end of file", () => {
		const document = parse("---\ntitle: Test\n# Still metadata\n- still metadata");

		expect(shape(document.root)).toEqual(["Test"]);
	});

	it("ignores fenced code blocks", () => {
		const document = parse(
			[
				"# Before",
				"```ts",
				"const value = 1;",
				"```",
				"~~~text",
				"some code",
				"~~~",
				"## After",
			].join("\n"),
		);

		expect(shape(document.root)).toEqual([
			"Test",
			["Before", ["After"]],
		]);
	});

	it("does not parse pseudo headings or lists inside fenced code", () => {
		const document = parse(
			[
				"# Real",
				"```md",
				"# Fake heading",
				"- Fake list",
				"```",
				"- Real list",
			].join("\n"),
		);

		expect(shape(document.root)).toEqual([
			"Test",
			["Real", ["Real list"]],
		]);
	});

	it("ignores an unclosed fenced code block through end of file", () => {
		const document = parse("# Real\n````md\n# Fake\n- Fake");

		expect(shape(document.root)).toEqual(["Test", ["Real"]]);
	});

	it("ignores quote block contents", () => {
		const document = parse(
			"> # Fake\n> - Fake item\n  > ## Also fake\n# Real",
		);

		expect(shape(document.root)).toEqual(["Test", ["Real"]]);
	});

	it("preserves list context across blank lines and handles odd dedents", () => {
		const document = parse(
			"- A\n\n    - B\n  - C\n   - D\n- E",
		);

		expect(shape(document.root)).toEqual([
			"Test",
			["A", ["B"], ["C", ["D"]]],
			["E"],
		]);
	});

	it("treats an initially four-space-indented list marker as code", () => {
		const document = parse("    - Fake\n- Real");

		expect(shape(document.root)).toEqual(["Test", ["Real"]]);
		expect(document.root.children[0]?.source.line).toBe(1);
	});

	it("uses tabs as four indentation columns for hierarchy", () => {
		const document = parse("- Parent\n\t- Child\n\t\t1. Grandchild");
		const child = document.root.children[0]?.children[0];

		expect(shape(document.root)).toEqual([
			"Test",
			["Parent", ["Child", ["Grandchild"]]],
		]);
		expect(child?.source).toEqual({
			path: FILE_PATH,
			line: 1,
			ch: 1,
		});
	});

	it("normalizes a BOM and CRLF without changing source line mapping", () => {
		const document = parse(
			"\uFEFF---\r\ntitle: ignored\r\n---\r\n# 标题\r\n  - 子项",
		);
		const heading = document.root.children[0];
		const item = heading?.children[0];

		expect(document.rawIsEmpty).toBe(false);
		expect(heading?.source.line).toBe(3);
		expect(item?.source).toEqual({
			path: FILE_PATH,
			line: 4,
			ch: 2,
		});
	});

	it("removes heading, list, task, and basic inline formatting markers", () => {
		const document = parse(
			"# **Bold** and __strong__ and _italic_ ###\n- [x] `code` [label](https://example.com) [[Target|Alias]] ~~old~~",
		);

		expect(shape(document.root)).toEqual([
			"Test",
			[
				"Bold and strong and italic",
				["code label Alias old"],
			],
		]);
	});

	it("preserves link source facts on headings and list items", () => {
		const headingSource = "[Documentation](https://example.com/docs)";
		const listSource = "![[assets/diagram.png|Diagram]]";
		const document = parse(`# ${headingSource}\n- ${listSource}`);
		const heading = document.root.children[0];
		const item = heading?.children[0];

		expect(document.root.links).toEqual([]);
		expect(heading?.links).toEqual([
			{
				kind: "markdown",
				target: "https://example.com/docs",
				label: "Documentation",
				embedded: false,
				sourceStart: 0,
				sourceEnd: headingSource.length,
				visibleStart: 0,
				visibleEnd: "Documentation".length,
			},
		]);
		expect(item?.links).toEqual([
			{
				kind: "wikilink",
				target: "assets/diagram.png",
				label: "Diagram",
				embedded: true,
				sourceStart: 0,
				sourceEnd: listSource.length,
				visibleStart: 0,
				visibleEnd: "Diagram".length,
			},
		]);
	});

	it("gives parsed nodes independent link snapshots", () => {
		const document = parse(
			"# [Shared](target)\n# [Shared](target)",
		);
		const first = document.root.children[0];
		const second = document.root.children[1];

		expect(first?.links).toEqual(second?.links);
		expect(first?.links).not.toBe(second?.links);
		expect(first?.links[0]).not.toBe(second?.links[0]);
	});

	it("preserves literal code spans, escapes, and identifier underscores", () => {
		const document = parse(
			"# `snake_case_name` and snake_case_name and double__underscore__name\n- \\*literal\\* and _italic_",
		);

		expect(shape(document.root)).toEqual([
			"Test",
			[
				"snake_case_name and snake_case_name and double__underscore__name",
				["*literal* and italic"],
			],
		]);
	});

	it("projects inline HTML breaks without changing physical source lines", () => {
		const document = parse(
			"# First<br>Second\n- Before<BR />After\n- `literal<br>tag`",
		);

		expect(shape(document.root)).toEqual([
			"Test",
			[
				"First\nSecond",
				["Before\nAfter"],
				["literal<br>tag"],
			],
		]);
		expect(document.root.children[0]?.source.line).toBe(0);
		expect(document.root.children[0]?.children[0]?.source.line).toBe(1);
		expect(document.root.children[0]?.children[1]?.source.line).toBe(2);
	});

	it("does not treat thematic breaks as list items", () => {
		const document = parse(
			"# Before\n* * *\n- - -\n---\n## After",
		);

		expect(shape(document.root)).toEqual([
			"Test",
			["Before", ["After"]],
		]);
	});

	it("requires whitespace after heading and list markers", () => {
		const document = parse(
			"#not-a-heading\n-not-a-list\n1) not-an-ordered-list\n# Yes\n- Yes",
		);

		expect(shape(document.root)).toEqual([
			"Test",
			["Yes", ["Yes"]],
		]);
	});
});
