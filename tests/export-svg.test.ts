import { describe, expect, it } from "vitest";

import { serializeMindMapExportSceneToSvg } from "../src/export/svg";
import {
	captureMindMapExportError,
	createExportScene,
} from "./export-fixtures";

describe("mind-map SVG export", () => {
	it("serializes an isolated scene with escaped content, paint definitions, and a themed background", () => {
		const scene = createExportScene({
			paperTexture: {
				kind: "paper-grain",
				color: "#594f43",
				fineCellSize: 4,
				coarseCellSize: 16,
				offsetX: 1.5,
				offsetY: -2,
				opacity: 0.35,
			},
			primitives: [
				{
					kind: "rect",
					id: 'topic<&"\'',
					x: 10,
					y: 20,
					width: 120,
					height: 48,
					radiusX: 12,
					radiusY: 12,
					fill: {
						kind: "hatch",
						background: "#fff",
						color: "#222",
						gap: 8,
						opacity: 0.45,
						angle: -16,
					},
					stroke: "#222",
					strokeWidth: 1.5,
				},
				{
					kind: "path",
					data: "M 0 0 C 10 4 20 8 30 12",
					fill: { kind: "none" },
					stroke: "#222",
					strokeWidth: 2,
					dashArray: [3, 2],
					lineCap: "round",
					lineJoin: "round",
				},
				{
					kind: "text",
					x: 28,
					y: 48,
					text: 'A & B < C > D "quoted"',
					fill: "#24211f",
					fontFamily: 'Example "Family"',
					fontSize: 16,
					fontWeight: "600",
					fontStyle: "italic",
					textDecoration: "line-through",
				},
			],
		});

		const serialized = serializeMindMapExportSceneToSvg(scene, {
			background: "theme",
			padding: 10,
		});

		expect(serialized).toMatchObject({ width: 140, height: 100 });
		expect(serialized.svg).toContain('viewBox="0 0 140 100"');
		expect(serialized.svg).toContain(
			'<rect class="obmind-export-background" x="0" y="0" width="140" height="100" fill="#f7f3e8"/>',
		);
		expect(serialized.svg).toContain("obmind-export-paper-grain");
		expect(serialized.svg).toContain("obmind-export-hatch-1");
		expect(serialized.svg).toContain('transform="translate(0 -10)"');
		expect(serialized.svg).toContain(
			'data-obmind-export-id="topic&lt;&amp;&quot;&apos;"',
		);
		expect(serialized.svg).toContain(
			"A &amp; B &lt; C &gt; D \"quoted\"",
		);
		expect(serialized.svg).toContain(
			'font-family="Example &quot;Family&quot;"',
		);
		expect(serialized.svg).toContain('stroke-dasharray="3 2"');
		expect(serialized.svg).toContain('stroke-linecap="round"');
		expect(serialized.svg).toContain('text-decoration="line-through"');
	});

	it("omits canvas-only background treatments for transparent exports", () => {
		const scene = createExportScene({
			paperTexture: {
				kind: "paper-grain",
				color: "#594f43",
				fineCellSize: 4,
				coarseCellSize: 16,
				offsetX: 0,
				offsetY: 0,
				opacity: 0.35,
			},
		});

		const serialized = serializeMindMapExportSceneToSvg(scene, {
			background: "transparent",
			padding: 0,
		});

		expect(serialized.svg).not.toContain("obmind-export-background");
		expect(serialized.svg).not.toContain("obmind-export-paper-grain");
		expect(serialized.svg).toContain('class="obmind-export-scene"');
	});

	it("rejects cancellation and invalid padding before emitting output", () => {
		const controller = new AbortController();
		controller.abort();

		expect(captureMindMapExportError(() =>
			serializeMindMapExportSceneToSvg(
				createExportScene(),
				{ background: "theme", padding: 12 },
				controller.signal,
			),
		)).toMatchObject({ code: "aborted" });
		expect(captureMindMapExportError(() =>
			serializeMindMapExportSceneToSvg(createExportScene(), {
				background: "theme",
				padding: Number.NaN,
			}),
		)).toMatchObject({ code: "invalid-options" });
	});
});
