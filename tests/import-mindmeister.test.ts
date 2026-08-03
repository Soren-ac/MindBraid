import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
	MINDMEISTER_IMPORT_ADAPTER,
	parseMindMeisterImport,
} from "../src/import/mindmeister";
import { DEFAULT_MIND_MAP_IMPORT_LIMITS } from "../src/import/types";

describe("MindMeister import", () => {
	it("parses map.json hierarchy and task state", () => {
		const input = createMindInput({
			map_version: "5",
			id: "workbook",
			root: {
				id: "root",
				title: "Product plan",
				children: [
					{
						id: "research",
						title: "Research",
						completed: true,
						children: [{ id: "interviews", title: "Interviews" }],
					},
					{ id: "delivery", title: "Delivery", completed: false },
				],
			},
		});

		const workbook = parseMindMeisterImport(input);

		expect(MINDMEISTER_IMPORT_ADAPTER.sniff(input)).toBe(100);
		expect(workbook.sheets).toHaveLength(1);
		expect(workbook.sheets[0]?.root).toMatchObject({
			text: "Product plan",
			children: [
				{
					text: "Research",
					taskState: "checked",
					children: [{ text: "Interviews" }],
				},
				{ text: "Delivery", taskState: "unchecked" },
			],
		});
	});

	it("accepts object-valued children and reports omitted presentation", () => {
		const workbook = parseMindMeisterImport(
			createMindInput({
				root: {
					title: "Map",
					children: {
						one: { title: "One", note: "Not imported" },
						two: { title: "Two" },
					},
				},
			}),
		);

		expect(workbook.sheets[0]?.root.children.map(({ text }) => text)).toEqual([
			"One",
			"Two",
		]);
		expect(workbook.diagnostics).toContainEqual(
			expect.objectContaining({ code: "mindmeister-presentation-omitted" }),
		);
	});

	it("rejects missing roots and topic limits", () => {
		expect(() => parseMindMeisterImport(createMindInput({}))).toThrow(
			/root topic/i,
		);
		expect(() =>
			parseMindMeisterImport(
				createMindInput({
					root: {
						title: "Root",
						children: [{ title: "A" }, { title: "B" }],
					},
				}),
				{ ...DEFAULT_MIND_MAP_IMPORT_LIMITS, maximumTopics: 2 },
			),
		).toThrow(/topic limit/i);
	});

	it("imports deeply nested maps without recursive call-stack growth", () => {
		let rootJson = '{"title":"Leaf"}';
		for (let depth = 0; depth < 6_000; depth += 1) {
			rootJson = `{"title":"Topic ${String(depth)}","children":[${rootJson}]}`;
		}
		const workbook = parseMindMeisterImport(
			{
				name: "deep.mind",
				bytes: zipSync({
					"map.json": strToU8(`{"root":${rootJson}}`),
				}),
			},
			{
				...DEFAULT_MIND_MAP_IMPORT_LIMITS,
				maximumDepth: 6_001,
				maximumTopics: 6_001,
			},
		);

		let topicCount = 0;
		const pending = [workbook.sheets[0]!.root];
		while (pending.length > 0) {
			const topic = pending.pop();
			if (topic === undefined) {
				continue;
			}
			topicCount += 1;
			pending.push(...topic.children);
		}
		expect(topicCount).toBe(6_001);
	});
});

function createMindInput(value: unknown) {
	return {
		name: "example.mind",
		bytes: zipSync({ "map.json": strToU8(JSON.stringify(value)) }),
	};
}
