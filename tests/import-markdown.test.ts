import { describe, expect, it } from "vitest";

import {
	createUniqueImportedNotePath,
	createMindMapMarkdownImportPlan,
	sanitizeImportedBasename,
} from "../src/import/markdown";
import type { ImportedMindMapWorkbook } from "../src/import/types";
import { parseMarkdown } from "../src/core/parser";

describe("mind-map Markdown import plan", () => {
	it("converts arbitrary-depth topics and tasks into nested lists", () => {
		const plan = createMindMapMarkdownImportPlan(WORKBOOK, "sheet");

		expect(plan.suggestedBasename).toBe("Product Plan");
		expect(plan.content).toBe(
			"- [x] Research\\*\n  - Interviews\n- [ ] Delivery\n",
		);
		expect(plan.topicCount).toBe(4);

		const parsed = parseMarkdown(
			plan.content,
			`${plan.suggestedBasename}.md`,
			plan.suggestedBasename,
		);
		expect(parsed.root.children).toMatchObject([
			{
				text: "Research*",
				taskState: "checked",
				children: [{ text: "Interviews" }],
			},
			{ text: "Delivery", taskState: "unchecked" },
		]);
	});

	it("sanitizes unsafe filenames and preserves empty central-only maps", () => {
		expect(sanitizeImportedBasename('  A/B:*?"<>|#[x]^...  ')).toBe(
			"A B x",
		);
		const plan = createMindMapMarkdownImportPlan(
			{
				...WORKBOOK,
				sheets: [
					{
						id: "empty",
						title: "Empty",
						root: {
							id: "root",
							text: "Root/only",
							taskState: null,
							children: [],
						},
					},
				],
			},
			"empty",
		);
		expect(plan.suggestedBasename).toBe("Root only");
		expect(plan.content).toBe("");
		expect(plan.topicCount).toBe(1);
		expect(plan.diagnostics).toContainEqual(
			expect.objectContaining({ code: "root-title-sanitized" }),
		);
	});

	it("chooses a non-overwriting destination path", () => {
		const existing = new Set(["Maps/Plan.md", "Maps/Plan 2.md"]);
		expect(
			createUniqueImportedNotePath("Maps", "Plan", (path) => existing.has(path)),
		).toBe("Maps/Plan 3.md");
	});

	it("reports only workbook-wide and selected-sheet diagnostics", () => {
		const plan = createMindMapMarkdownImportPlan(
			{
				...WORKBOOK,
				diagnostics: [
					{ severity: "warning", code: "global", message: "Global" },
					{
						severity: "warning",
						code: "selected",
						message: "Selected",
						sheetId: "sheet",
					},
					{
						severity: "warning",
						code: "other",
						message: "Other",
						sheetId: "other-sheet",
					},
				],
			},
			"sheet",
		);

		expect(plan.diagnostics.map(({ code }) => code)).toEqual([
			"global",
			"selected",
		]);
	});
});

const WORKBOOK: ImportedMindMapWorkbook = {
	format: "mindmeister",
	sourceName: "plan.mind",
	diagnostics: [],
	sheets: [
		{
			id: "sheet",
			title: "Plan",
			root: {
				id: "root",
				text: "Product Plan",
				taskState: null,
				children: [
					{
						id: "research",
						text: "Research*",
						taskState: "checked",
						children: [
							{
								id: "interviews",
								text: "Interviews",
								taskState: null,
								children: [],
							},
						],
					},
					{
						id: "delivery",
						text: "Delivery",
						taskState: "unchecked",
						children: [],
					},
				],
			},
		},
	],
};
