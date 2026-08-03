import { bench, describe } from "vitest";

import { planMindMapExport } from "../../src/export/plan";
import { serializeMindMapExportSceneToSvg } from "../../src/export/svg";
import type {
	MindMapExportPrimitive,
	MindMapExportScene,
} from "../../src/export/types";

/**
 * Explicit, opt-in performance coverage. It has no wall-clock assertion, so
 * normal CI remains deterministic; run `npm run benchmark:export` when
 * profiling a renderer/encoder change on a representative desktop machine.
 */
describe("mind-map export scene", () => {
	const scene1000 = createBenchmarkScene(1_000);
	const scene5000 = createBenchmarkScene(5_000);
	const pngOptions = {
		format: "png" as const,
		fileName: "benchmark",
		scope: "full-map" as const,
		background: "theme" as const,
		padding: 32,
		dpi: 150,
	};

	bench("preflights 1,000 topics", () => {
		planMindMapExport(scene1000, pngOptions);
	});

	bench("serializes 1,000 topics", () => {
		serializeMindMapExportSceneToSvg(scene1000, pngOptions);
	});

	bench("preflights 5,000 topics", () => {
		planMindMapExport(scene5000, pngOptions);
	});

	bench("serializes 5,000 topics", () => {
		serializeMindMapExportSceneToSvg(scene5000, pngOptions);
	});
});

function createBenchmarkScene(topicCount: number): MindMapExportScene {
	const primitives: MindMapExportPrimitive[] = [];
	for (let index = 0; index < topicCount; index += 1) {
		const x = (index % 50) * 160;
		const y = Math.floor(index / 50) * 60;
		primitives.push(
			{
				kind: "rect",
				id: `topic-${String(index)}`,
				x,
				y,
				width: 132,
				height: 36,
				radiusX: 8,
				radiusY: 8,
				fill: { kind: "color", value: "#ffffff" },
				stroke: "#4b5563",
				strokeWidth: 1,
			},
			{
				kind: "text",
				id: `topic-label-${String(index)}`,
				x: x + 12,
				y: y + 23,
				text: `Topic ${String(index)}`,
				fill: "#111827",
				fontFamily: "system-ui, sans-serif",
				fontSize: 14,
				fontWeight: "500",
				fontStyle: "normal",
			},
		);
	}
	return {
		sourcePath: "Benchmarks/large-map.md",
		sourceRevision: "benchmark-revision",
		presentationRevision: 1,
		scope: "full-map",
		bounds: {
			x: 0,
			y: 0,
			width: 8_000,
			height: Math.ceil(topicCount / 50) * 60,
		},
		backgroundColor: "#f8fafc",
		paperTexture: null,
		primitives,
		nodeShapes: ["rounded-rectangle"],
	};
}
