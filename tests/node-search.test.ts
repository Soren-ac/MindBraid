import { describe, expect, it } from "vitest";

import {
	createMindMapDocumentSearchIndex,
	getMindMapNodeSearchEntry,
	searchMindMapDocument,
} from "../src/topic/interaction/node-search";
import { parseMarkdown } from "../src/core/parser";

const PATH = "Notes/Search.md";

function parse(content: string) {
	return parseMarkdown(content, PATH, "Search");
}

describe("current-document mind-map search", () => {
	it("returns matching topics in deterministic depth-first document order", () => {
		const document = parse(
			[
				"# Match heading",
				"- Match child",
				"## Unrelated",
				"- Nested match",
				"# Match tail",
			].join("\n"),
		);
		const index = createMindMapDocumentSearchIndex(document);

		expect(
			searchMindMapDocument(index, "match").map(
				(result) => result.text,
			),
		).toEqual([
			"Match heading",
			"Match child",
			"Nested match",
			"Match tail",
		]);
		expect(index.entries.map((entry) => entry.documentOrder)).toEqual(
			[0, 1, 2, 3, 4, 5],
		);
	});

	it("matches Latin text case-insensitively and preserves CJK matching", () => {
		const document = parse("# ROADMAP\n## 中文路线图\n- Release plan");
		const index = createMindMapDocumentSearchIndex(document);

		expect(
			searchMindMapDocument(index, "road").map(
				(result) => result.text,
			),
		).toEqual(["ROADMAP"]);
		expect(
			searchMindMapDocument(index, "中文").map(
				(result) => result.text,
			),
		).toEqual(["中文路线图"]);
		expect(
			searchMindMapDocument(index, "  RELEASE PLAN ").map(
				(result) => result.text,
			),
		).toEqual(["Release plan"]);
	});

	it("keeps the ordered ancestor chain required to reveal a hidden result", () => {
		const document = parse(
			"# Parent\n## Branch\n- Target topic\n  - Deep child",
		);
		const index = createMindMapDocumentSearchIndex(document);
		const target = searchMindMapDocument(index, "target")[0];
		const parent = document.root.children[0];
		const branch = parent?.children[0];

		expect(target).toMatchObject({
			text: "Target topic",
			ancestorIds: [
				document.root.id,
				parent?.id,
				branch?.id,
			],
		});
		if (target === undefined) {
			throw new Error("Expected a target search result.");
		}
		expect(getMindMapNodeSearchEntry(index, target.nodeId)).toEqual(
			index.entriesByNodeId.get(target.nodeId),
		);
		expect(getMindMapNodeSearchEntry(index, "missing")).toBeNull();
	});

	it("returns no result for an empty or whitespace-only query", () => {
		const index = createMindMapDocumentSearchIndex(parse("# Topic"));

		expect(searchMindMapDocument(index, "")).toEqual([]);
		expect(searchMindMapDocument(index, " \t ")).toEqual([]);
	});
});
