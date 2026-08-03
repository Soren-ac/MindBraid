import { describe, expect, it } from "vitest";

import {
	BUILT_IN_MIND_MAP_EXPORT_ENCODER_CAPABILITIES,
} from "../src/export/built-in-encoders";
import {
	MindMapExportEncoderRegistry,
	type MindMapExportEncoder,
} from "../src/export/registry";

describe("mind-map export encoder registry", () => {
	it("exposes independently declared controls for every built-in format", () => {
		const jpg = BUILT_IN_MIND_MAP_EXPORT_ENCODER_CAPABILITIES.find(
			(capability) => capability.format === "jpeg",
		);
		const png = BUILT_IN_MIND_MAP_EXPORT_ENCODER_CAPABILITIES.find(
			(capability) => capability.format === "png",
		);
		const pdf = BUILT_IN_MIND_MAP_EXPORT_ENCODER_CAPABILITIES.find(
			(capability) => capability.format === "pdf",
		);
		const svg = BUILT_IN_MIND_MAP_EXPORT_ENCODER_CAPABILITIES.find(
			(capability) => capability.format === "svg",
		);

		expect(jpg).toMatchObject({
			backgrounds: ["theme"],
			dpi: { supportsCustomValue: true },
			jpegQuality: { defaultValue: 0.92 },
		});
		expect(png).toMatchObject({
			backgrounds: ["theme", "transparent"],
			dpi: { supportsCustomValue: true },
			jpegQuality: null,
		});
		expect(pdf).toMatchObject({
			pdfMode: "raster-single-page",
			dpi: null,
		});
		expect(svg).toMatchObject({ dpi: null, jpegQuality: null });
	});

	it("rejects duplicate format registrations and resolves registered encoders", () => {
		const encoder = createEncoder("svg");
		const registry = new MindMapExportEncoderRegistry([encoder]);
		expect(registry.resolve("svg")).toBe(encoder);
		expect(registry.listCapabilities()).toEqual([encoder.capability]);
		expect(() =>
			new MindMapExportEncoderRegistry([encoder, createEncoder("svg")]),
		).toThrow("More than one encoder");
	});
});

function createEncoder(format: "svg"): MindMapExportEncoder {
	return {
		capability: {
			format,
			label: "SVG",
			mimeType: "image/svg+xml",
			backgrounds: ["theme", "transparent"],
			dpi: null,
			jpegQuality: null,
		},
		async encode(): Promise<never> {
			throw new Error("Not used by this registry test.");
		},
	};
}
