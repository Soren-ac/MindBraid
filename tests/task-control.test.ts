import { describe, expect, it } from "vitest";

import {
	createMindMapTaskCheckmarkPathData,
	resolveMindMapTaskCheckmarkStrokeWidth,
} from "../src/presentation/task-control";

describe("mind-map task control geometry", () => {
	it("creates one deterministic rounded checkmark path", () => {
		expect(createMindMapTaskCheckmarkPathData()).toBe(
			"M 4.25 8.25 L 7 11 L 11.75 5.5",
		);
	});

	it("scales the same geometry into export bounds", () => {
		expect(
			createMindMapTaskCheckmarkPathData({
				x: 10,
				y: 20,
				width: 32,
				height: 8,
			}),
		).toBe("M 18.5 24.125 L 24 25.5 L 33.5 22.75");
		expect(resolveMindMapTaskCheckmarkStrokeWidth(32, 8)).toBeCloseTo(
			0.875,
		);
	});

	it("normalizes invalid bounds without emitting non-finite data", () => {
		const path = createMindMapTaskCheckmarkPathData({
			x: Number.NaN,
			y: Number.POSITIVE_INFINITY,
			width: 0,
			height: Number.NaN,
		});
		expect(path).toBe(createMindMapTaskCheckmarkPathData());
		expect(path).not.toMatch(/NaN|Infinity/);
	});
});
