import { describe, expect, it } from "vitest";

import { createMindMapNodeAssetPatch } from "../src/presentation/node-assets-edit";

describe("node asset presentation edits", () => {
	it("sets one icon across a multi-selection without losing formatting", () => {
		const current = new Map([
			["a", { shape: "pill" as const }],
			["b", { markerIds: ["done"] }],
		]);
		const patch = createMindMapNodeAssetPatch(current, ["a", "b"], {
			type: "set-icon",
			iconId: "star",
		});
		expect(patch.get("a")).toMatchObject({ shape: "pill", iconId: "star" });
		expect(patch.get("b")).toMatchObject({
			markerIds: ["done"],
			iconId: "star",
		});
	});

	it("toggles one marker immutably and removes empty sparse overrides", () => {
		const current = new Map([["a", { markerIds: ["done"] }]]);
		const patch = createMindMapNodeAssetPatch(current, ["a"], {
			type: "set-marker",
			markerId: "done",
			enabled: false,
		});
		expect(patch.get("a")).toBeNull();
		expect(current.get("a")?.markerIds).toEqual(["done"]);
	});

	it("clears only node information fields", () => {
		const patch = createMindMapNodeAssetPatch(
			new Map([
				[
					"a",
					{ iconId: "flag", markerIds: ["done"], radius: 12 },
				],
			]),
			["a"],
			{ type: "clear-assets" },
		);
		expect(patch.get("a")).toEqual({ radius: 12 });
	});
});
