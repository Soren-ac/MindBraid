import { describe, expect, it } from "vitest";

import {
	advanceMindMapExportProgress,
	type MindMapExportProgress,
} from "../src/export/types";

describe("mind-map export progress", () => {
	it("keeps phase-local updates monotonic and completes only after save", () => {
		const events: readonly MindMapExportProgress[] = [
			{ phase: "capture", state: "started", fraction: 0 },
			{ phase: "measure", state: "started", fraction: 0.5 },
			{ phase: "measure", state: "started", fraction: 1 },
			{ phase: "layout", state: "completed", fraction: 1 },
			// Drawing is reported as capture work by the DOM renderer. This late
			// event must not move the global bar back behind layout.
			{ phase: "capture", state: "started", fraction: 0.25 },
			{ phase: "serialize", state: "completed", fraction: 1 },
			{ phase: "rasterize", state: "completed", fraction: 1 },
			{ phase: "encode", state: "completed", fraction: 1 },
			{ phase: "save", state: "started", fraction: 0 },
			{ phase: "save", state: "completed", fraction: 1 },
		];
		const values: number[] = [];
		let current = 0;
		for (const event of events) {
			current = advanceMindMapExportProgress(current, event);
			values.push(current);
		}

		expect(values).toEqual([...values].sort((left, right) => left - right));
		expect(values.slice(0, -1).every((value) => value < 1)).toBe(true);
		expect(values.at(-1)).toBe(1);
	});
});
