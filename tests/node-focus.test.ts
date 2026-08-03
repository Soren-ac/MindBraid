import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../src/core/parser";
import {
	normalizeMindMapVisibleDepthLimit,
	projectMindMapFocus,
} from "../src/topic/interaction/node-focus";

const parse = (content: string) => parseMarkdown(content, "Map.md", "Map");

describe("mind-map focus projection", () => {
	it("focuses one branch and returns a document breadcrumb", () => {
		const document = parse("# A\n## B\n### C\n# D");
		const branch = document.root.children[0]?.children[0];
		if (branch === undefined) {
			throw new Error("Expected focus branch.");
		}

		const projection = projectMindMapFocus(document.root, branch.id, null);

		expect(projection.root).toBe(branch);
		expect(projection.focusRootNodeId).toBe(branch.id);
		expect(projection.breadcrumbs.map(({ text }) => text)).toEqual([
			"Map",
			"A",
			"B",
		]);
		expect([...projection.visibleNodeIds]).toEqual([
			branch.id,
			branch.children[0]?.id,
		]);
	});

	it("limits descendants without mutating the parsed tree", () => {
		const document = parse("# A\n## B\n### C\n#### D");
		const projection = projectMindMapFocus(document.root, null, 2);

		expect(projection.root).not.toBe(document.root);
		expect(projection.root.children[0]?.children[0]?.children).toEqual([]);
		expect(document.root.children[0]?.children[0]?.children).toHaveLength(1);
		expect(projection.visibleNodeIds.size).toBe(3);
	});

	it("falls back to the document root when a stale focus ID disappears", () => {
		const document = parse("# A");
		const projection = projectMindMapFocus(document.root, "missing", null);

		expect(projection.root).toBe(document.root);
		expect(projection.focusRootNodeId).toBeNull();
	});

	it("rejects invalid visible depth values", () => {
		expect(() => normalizeMindMapVisibleDepthLimit(-1)).toThrow(RangeError);
		expect(() => normalizeMindMapVisibleDepthLimit(1.5)).toThrow(RangeError);
		expect(normalizeMindMapVisibleDepthLimit(0)).toBe(0);
	});
});
