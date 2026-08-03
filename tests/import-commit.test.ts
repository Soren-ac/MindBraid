import { describe, expect, it, vi } from "vitest";

import { createImportedMarkdownNote } from "../src/import/commit";
import type { MindMapMarkdownImportPlan } from "../src/import/markdown";

const PLAN: MindMapMarkdownImportPlan = {
	sheetId: "sheet",
	suggestedBasename: "Plan",
	content: "- Topic\n",
	topicCount: 2,
	diagnostics: [],
};

describe("mind-map import commit boundary", () => {
	it("creates one new note only after the explicit commit call", async () => {
		const create = vi.fn(async (path: string, content: string) => ({
			path,
			content,
		}));

		await expect(
			createImportedMarkdownNote(PLAN, "Maps/Plan.md", {
				exists: () => false,
				create,
			}),
		).resolves.toEqual({ path: "Maps/Plan.md", content: "- Topic\n" });
		expect(create).toHaveBeenCalledTimes(1);
		expect(create).toHaveBeenCalledWith("Maps/Plan.md", "- Topic\n");
	});

	it("does not write when the destination already exists", async () => {
		const create = vi.fn(async () => ({ path: "unused" }));

		await expect(
			createImportedMarkdownNote(PLAN, "Maps/Plan.md", {
				exists: () => true,
				create,
			}),
		).rejects.toThrow(/no longer available/i);
		expect(create).not.toHaveBeenCalled();
	});

	it.each(["", "Plan.txt", "/Plan.md", "../Plan.md", "Maps\\Plan.md"])(
		"rejects unsafe destination %j without writing",
		async (path) => {
			const create = vi.fn(async () => ({ path: "unused" }));

			await expect(
				createImportedMarkdownNote(PLAN, path, {
					exists: () => false,
					create,
				}),
			).rejects.toThrow(/destination is invalid/i);
			expect(create).not.toHaveBeenCalled();
		},
	);
});
