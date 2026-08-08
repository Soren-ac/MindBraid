import { describe, expect, it } from "vitest";
import { literalColor, type MindMapNodePresentation } from "../src/presentation/presentation";
import { createMindMapNodeFormattingPatch } from "../src/presentation/node-presentation-edit";

describe("node presentation formatting", () => {
	it("applies one sparse color change to every selected node", () => {
		const current = new Map<string, MindMapNodePresentation>([
			["a", { radius: 12 }],
			["b", { borderWidth: 2 }],
		]);
		const patch = createMindMapNodeFormattingPatch(current, ["a", "b"], {
			type: "color",
			field: "fill",
			value: literalColor("#336699"),
		});
		expect(patch.get("a")).toEqual({
			radius: 12,
			fill: literalColor("#336699"),
		});
		expect(patch.get("b")).toEqual({
			borderWidth: 2,
			fill: literalColor("#336699"),
		});
	});

	it("merges and independently clears nested typography", () => {
		const current = new Map<string, MindMapNodePresentation>([
			["a", { typography: { fontSize: 18, fontWeight: 600 } }],
		]);
		const changed = createMindMapNodeFormattingPatch(current, ["a"], {
			type: "typography",
			field: "fontSize",
			value: 22,
		});
		expect(changed.get("a")).toEqual({
			typography: { fontSize: 22, fontWeight: 600 },
		});
		const cleared = createMindMapNodeFormattingPatch(
			new Map([["a", changed.get("a") ?? {}]]),
			["a"],
			{
				type: "typography",
				field: "fontWeight",
				value: undefined,
			},
		);
		expect(cleared.get("a")).toEqual({ typography: { fontSize: 22 } });
	});

	it("uses null to reset selected overrides and rejects unsafe values", () => {
		const current = new Map<string, MindMapNodePresentation>([
			["a", { radius: 12 }],
		]);
		expect(
			createMindMapNodeFormattingPatch(current, ["a", "a"], {
				type: "reset",
			}),
		).toEqual(new Map([["a", null]]));
		expect(() =>
			createMindMapNodeFormattingPatch(current, ["a"], {
				type: "typography",
				field: "fontSize",
				value: 2,
			}),
		).toThrow(RangeError);
	});

	it("resets formatting without removing node assets", () => {
		const current = new Map<string, MindMapNodePresentation>([
			[
				"a",
				{
					shape: "ellipse",
					fill: literalColor("#336699"),
					borderWidth: 4,
					radius: 12,
					typography: { fontSize: 22 },
					iconId: "flag",
					markerIds: ["done"],
				},
			],
		]);

		expect(
			createMindMapNodeFormattingPatch(current, ["a"], {
				type: "reset",
			}),
		).toEqual(
			new Map([
				[
					"a",
					{
						iconId: "flag",
						markerIds: ["done"],
					},
				],
			]),
		);
	});
});
