import { describe, expect, it } from "vitest";

import {
	encodeVisibleTextAsInlineMarkdown,
	planInlineMarkdownVisibleEdit,
	projectInlineMarkdown,
} from "../src/core/inline-markdown";

describe("projectInlineMarkdown", () => {
	it("projects supported wrappers, links, wikilinks, escapes, and code", () => {
		expect(
			projectInlineMarkdown(
				"**Bold** _italic_ ~~old~~ [label](destination) " +
					"[[Target|Alias]] `literal_*_` \\*escaped\\*",
			).visibleText,
		).toBe(
			"Bold italic old label Alias literal_*_ *escaped*",
		);
	});

	it("extracts Markdown, wikilink, and embedded-link source facts", () => {
		const markdown = "[Docs **here**](https://example.com/docs)";
		const wiki = "[[Project/Plan#P0|Roadmap]]";
		const embeddedMarkdown = "![Preview](assets/preview.png)";
		const embeddedWiki = "![[assets/sketch.png|Sketch]]";
		const separator = " / ";
		const projection = projectInlineMarkdown(
			[markdown, wiki, embeddedMarkdown, embeddedWiki].join(separator),
		);
		const markdownVisible = "Docs here";
		const wikiVisible = "Roadmap";
		const embeddedMarkdownVisible = "Preview";
		const embeddedWikiVisible = "Sketch";
		const wikiSourceStart = markdown.length + separator.length;
		const embeddedMarkdownSourceStart =
			wikiSourceStart + wiki.length + separator.length;
		const embeddedWikiSourceStart =
			embeddedMarkdownSourceStart +
			embeddedMarkdown.length +
			separator.length;
		const wikiVisibleStart = markdownVisible.length + separator.length;
		const embeddedMarkdownVisibleStart =
			wikiVisibleStart + wikiVisible.length + separator.length;
		const embeddedWikiVisibleStart =
			embeddedMarkdownVisibleStart +
			embeddedMarkdownVisible.length +
			separator.length;

		expect(projection).toEqual({
			visibleText: "Docs here / Roadmap / Preview / Sketch",
			links: [
				{
					kind: "markdown",
					target: "https://example.com/docs",
					label: markdownVisible,
					embedded: false,
					sourceStart: 0,
					sourceEnd: markdown.length,
					visibleStart: 0,
					visibleEnd: markdownVisible.length,
				},
				{
					kind: "wikilink",
					target: "Project/Plan#P0",
					label: wikiVisible,
					embedded: false,
					sourceStart: wikiSourceStart,
					sourceEnd: wikiSourceStart + wiki.length,
					visibleStart: wikiVisibleStart,
					visibleEnd: wikiVisibleStart + wikiVisible.length,
				},
				{
					kind: "markdown",
					target: "assets/preview.png",
					label: embeddedMarkdownVisible,
					embedded: true,
					sourceStart: embeddedMarkdownSourceStart,
					sourceEnd:
						embeddedMarkdownSourceStart + embeddedMarkdown.length,
					visibleStart: embeddedMarkdownVisibleStart,
					visibleEnd:
						embeddedMarkdownVisibleStart +
						embeddedMarkdownVisible.length,
				},
				{
					kind: "wikilink",
					target: "assets/sketch.png",
					label: embeddedWikiVisible,
					embedded: true,
					sourceStart: embeddedWikiSourceStart,
					sourceEnd: embeddedWikiSourceStart + embeddedWiki.length,
					visibleStart: embeddedWikiVisibleStart,
					visibleEnd:
						embeddedWikiVisibleStart + embeddedWikiVisible.length,
				},
			],
		});
	});

	it("keeps source offsets relative to the untrimmed inline source", () => {
		const markdown = "[One](target)";
		const source = ` \t${markdown}  `;

		expect(projectInlineMarkdown(source)).toEqual({
			visibleText: "One",
			links: [
				{
					kind: "markdown",
					target: "target",
					label: "One",
					embedded: false,
					sourceStart: 2,
					sourceEnd: 2 + markdown.length,
					visibleStart: 0,
					visibleEnd: 3,
				},
			],
		});
	});

	it("keeps identifier underscores literal", () => {
		expect(
			projectInlineMarkdown(
				"snake_case double__underscore__name __strong__",
			).visibleText,
		).toBe("snake_case double__underscore__name strong");
	});

	it("projects supported HTML breaks as visible line breaks", () => {
		expect(
			projectInlineMarkdown("First<br>Second<BR />Third").visibleText,
		).toBe("First\nSecond\nThird");
		expect(projectInlineMarkdown("`First<br>Second`").visibleText).toBe(
			"First<br>Second",
		);
	});
});

describe("planInlineMarkdownVisibleEdit", () => {
	it.each([
		["**Old**", "Old", "New", "**New**"],
		["_Old_", "Old", "New", "_New_"],
		["~~Old~~", "Old", "New", "~~New~~"],
		["`Old`", "Old", "New", "`New`"],
		["[Old](https://example.com)", "Old", "New", "[New](https://example.com)"],
		["[[Target|Old]]", "Old", "New", "[[Target|New]]"],
		["[[Old]]", "Old", "New", "[[New]]"],
		["![Old](asset.png)", "Old", "New", "![New](asset.png)"],
		["![[Image|Old]]", "Old", "New", "![[Image|New]]"],
	])(
		"preserves an unambiguous wrapper in %j",
		(source, current, next, expected) => {
			expect(
				planInlineMarkdownVisibleEdit(source, current, next),
			).toEqual({
				source: expected,
				strategy: "preserve-source",
			});
		},
	);

	it("preserves an inline wrapper while editing only its visible content", () => {
		expect(
			planInlineMarkdownVisibleEdit(
				"Prefix **old value** suffix",
				"Prefix old value suffix",
				"Prefix new value suffix",
			),
		).toEqual({
			source: "Prefix **new value** suffix",
			strategy: "preserve-source",
		});
	});

	it("preserves unaffected wrappers around a safe plain-text replacement", () => {
		expect(
			planInlineMarkdownVisibleEdit(
				"**Bold** and plain",
				"Bold and plain",
				"Bold and renamed",
			),
		).toEqual({
			source: "**Bold** and renamed",
			strategy: "preserve-source",
		});
	});

	it("preserves a whole-topic wrapper when appending text", () => {
		expect(
			planInlineMarkdownVisibleEdit("**Bold**", "Bold", "Bold again"),
		).toEqual({
			source: "**Bold again**",
			strategy: "preserve-source",
		});
	});

	it("encodes visible multiline edits without adding physical source lines", () => {
		expect(
			planInlineMarkdownVisibleEdit(
				"**One**",
				"One",
				"One\nTwo",
			),
		).toEqual({
			source: "**One<br>Two**",
			strategy: "preserve-source",
		});
		expect(
			projectInlineMarkdown("**One<br>Two**").visibleText,
		).toBe("One\nTwo");
	});

	it("falls back to escaped plain text across an ambiguous wrapper boundary", () => {
		expect(
			planInlineMarkdownVisibleEdit(
				"**Alpha** and *Beta*",
				"Alpha and Beta",
				"Replaced",
			),
		).toEqual({
			source: "Replaced",
			strategy: "escaped-plain",
		});
	});

	it("falls back rather than damaging code, link, or wikilink delimiters", () => {
		expect(
			planInlineMarkdownVisibleEdit("`old`", "old", "has ` tick"),
		).toEqual({
			source: "has \\` tick",
			strategy: "escaped-plain",
		});
		expect(
			planInlineMarkdownVisibleEdit(
				"[old](destination)",
				"old",
				"has ] bracket",
			),
		).toEqual({
			source: "has \\] bracket",
			strategy: "escaped-plain",
		});
		expect(
			planInlineMarkdownVisibleEdit(
				"[[Target|old]]",
				"old",
				"has | pipe",
			),
		).toEqual({
			source: "has | pipe",
			strategy: "escaped-plain",
		});
	});

	it("returns null for a stale visible projection", () => {
		expect(
			planInlineMarkdownVisibleEdit("**Current**", "Stale", "Next"),
		).toBeNull();
	});

	it("returns the exact source for a no-op visible commit", () => {
		expect(
			planInlineMarkdownVisibleEdit(
				" \t**Current**  ",
				"Current",
				" Current ",
			),
		).toEqual({
			source: " \t**Current**  ",
			strategy: "preserve-source",
		});
	});
});

describe("encodeVisibleTextAsInlineMarkdown", () => {
	it("escapes structural punctuation and encodes normalized breaks", () => {
		expect(
			encodeVisibleTextAsInlineMarkdown(
				"Literal **bold**\r\n[ ] and `code`",
			),
		).toBe(
			"Literal \\*\\*bold\\*\\*<br>\\[ \\] and \\`code\\`",
		);
	});

	it("keeps a typed HTML break literal distinct from an inserted newline", () => {
		const encoded = encodeVisibleTextAsInlineMarkdown(
			"Literal <br> then\nnext",
		);

		expect(encoded).toBe("Literal \\<br\\> then<br>next");
		expect(projectInlineMarkdown(encoded).visibleText).toBe(
			"Literal <br> then\nnext",
		);
	});
});
