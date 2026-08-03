import { describe, expect, it } from "vitest";

import { createDefaultMindMapPresentation, literalColor } from "../src/presentation/presentation";
import { cloneMindMapPresentation } from "../src/presentation/presentation-snapshot";

describe("presentation snapshot cloning", () => {
	it("owns nested layout, theme, map, and decoration data", () => {
		const original = createDefaultMindMapPresentation("left-to-right");
		const source = {
			...original,
			layout: {
				...original.layout,
				options: { compactness: 0.75 },
			},
			nodes: new Map([
				["topic", { fill: literalColor("#abcdef") }],
			]),
			decorations: [
				{
					id: "summary",
					kind: "summary" as const,
					nodeIds: ["topic"],
					text: "Summary",
				},
			],
		};

		const clone = cloneMindMapPresentation(source);

		expect(clone).toEqual(source);
		expect(clone).not.toBe(source);
		expect(clone.layout).not.toBe(source.layout);
		expect(clone.theme).not.toBe(source.theme);
		expect(clone.nodes).not.toBe(source.nodes);
		expect(clone.nodes.get("topic")).not.toBe(source.nodes.get("topic"));
		expect(clone.decorations).not.toBe(source.decorations);
	});
});
