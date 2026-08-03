import { describe, expect, it } from "vitest";

import {
	findMaximumSafeMindMapExportDpi,
	planMindMapExport,
} from "../src/export/plan";
import type {
	MindMapExportEncoderCapability,
	MindMapExportOptions,
} from "../src/export/types";
import { createExportScene } from "./export-fixtures";

describe("mind-map export preflight", () => {
	it("calculates final dimensions, RGBA working memory, and a safe custom DPI", () => {
		const plan = planMindMapExport(
			createExportScene(),
			createOptions({ format: "png", padding: 10, dpi: 300 }),
		);

		expect(plan).toMatchObject({
			format: "png",
			logicalDimensions: { width: 140, height: 100 },
			rasterDimensions: {
				logicalWidth: 140,
				logicalHeight: 100,
				pixelWidth: 438,
				pixelHeight: 313,
				dpi: 300,
			},
			requestedDpi: 300,
			maximumSafeDpi: 600,
			recommendedDpi: 300,
			estimatedRgbaBytes: 438 * 313 * 4,
			canExport: true,
		});
	});

	it("finds the exact highest safe DPI before allocating a bitmap", () => {
		const limits = {
			minimumDpi: 72,
			maximumDpi: 600,
			maximumDimension: 300,
			maximumPixels: 60_000,
		};
		const plan = planMindMapExport(
			createExportScene({ bounds: { x: 0, y: 0, width: 100, height: 100 } }),
			createOptions({ format: "png", padding: 0, dpi: 300 }),
			{ limits },
		);

		expect(plan.maximumSafeDpi).toBe(234);
		expect(plan.recommendedDpi).toBe(234);
		expect(plan.canExport).toBe(false);
		expect(plan.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "raster-too-large", severity: "error" }),
				expect.objectContaining({
					code: "raster-dpi-reduced",
					severity: "warning",
				}),
			]),
		);
		expect(
			findMaximumSafeMindMapExportDpi({ width: 100, height: 100 }, limits),
		).toBe(234);
	});

	it("reports bounded custom DPI and format-specific capability violations", () => {
		const pngCapability: MindMapExportEncoderCapability = {
			format: "png",
			label: "PNG",
			mimeType: "image/png",
			backgrounds: ["theme", "transparent"],
			dpi: {
				minimum: 72,
				maximum: 600,
				presets: [96, 150, 300, 600],
				defaultValue: 150,
				supportsCustomValue: true,
			},
			jpegQuality: null,
		};
		const invalidDpi = planMindMapExport(
			createExportScene(),
			createOptions({ format: "png", dpi: 601 }),
			{ encoder: pngCapability },
		);
		expect(invalidDpi.canExport).toBe(false);
		expect(invalidDpi.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "dpi-out-of-range" }),
			]),
		);

		const lowDpi = planMindMapExport(
			createExportScene(),
			createOptions({ format: "png", dpi: 71 }),
			{ encoder: pngCapability },
		);
		expect(lowDpi.recommendedDpi).toBe(72);

		const narrowDpi = planMindMapExport(
			createExportScene(),
			createOptions({ format: "png", dpi: 150 }),
			{
				encoder: {
					...pngCapability,
					dpi: { ...pngCapability.dpi!, maximum: 144 },
				},
			},
		);
		expect(narrowDpi.canExport).toBe(false);
		expect(narrowDpi.maximumSafeDpi).toBe(144);
		expect(narrowDpi.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "dpi-out-of-range" }),
			]),
		);

		const noTransparentJpeg: MindMapExportEncoderCapability = {
			...pngCapability,
			format: "jpeg",
			backgrounds: ["theme"],
		};
		const invalidBackground = planMindMapExport(
			createExportScene(),
			createOptions({
				format: "jpeg",
				background: "transparent",
			}),
			{ encoder: noTransparentJpeg },
		);
		expect(invalidBackground.canExport).toBe(false);
		expect(invalidBackground.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "unsupported-background" }),
			]),
		);

		const invalidQuality = planMindMapExport(
			createExportScene(),
			createOptions({ format: "jpeg", jpegQuality: 0.95 }),
			{
				encoder: {
					...noTransparentJpeg,
					jpegQuality: {
						minimum: 0.5,
						maximum: 0.9,
						step: 0.05,
						defaultValue: 0.85,
					},
				},
			},
		);
		expect(invalidQuality.canExport).toBe(false);
		expect(invalidQuality.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "quality-out-of-range" }),
			]),
		);
	});

	it("explains when the map cannot fit even at the minimum DPI", () => {
		const plan = planMindMapExport(
			createExportScene({
				bounds: { x: 0, y: 0, width: 40_000, height: 40_000 },
			}),
			createOptions({ format: "jpeg", dpi: 72, padding: 0 }),
		);

		expect(plan.maximumSafeDpi).toBeNull();
		expect(plan.recommendedDpi).toBeNull();
		expect(plan.canExport).toBe(false);
	});

	it("preflights the PDF adapter at its fixed internal 192 DPI", () => {
		const pdfCapability: MindMapExportEncoderCapability = {
			format: "pdf",
			label: "PDF",
			mimeType: "application/pdf",
			backgrounds: ["theme"],
			dpi: null,
			fixedRasterDpi: 192,
			jpegQuality: null,
			pdfMode: "raster-single-page",
		};
		const plan = planMindMapExport(
			createExportScene(),
			createOptions({ format: "pdf", padding: 0 }),
			{ encoder: pdfCapability },
		);

		expect(plan).toMatchObject({
			requestedDpi: 192,
			rasterDimensions: {
				pixelWidth: 240,
				pixelHeight: 160,
				dpi: 192,
			},
			estimatedRgbaBytes: 240 * 160 * 4,
			canExport: true,
		});

		const legacyCapabilityPlan = planMindMapExport(
			createExportScene(),
			createOptions({ format: "pdf", padding: 0 }),
		);
		expect(legacyCapabilityPlan.rasterDimensions).toMatchObject({ dpi: 192 });
	});
});

function createOptions(
	overrides: Partial<MindMapExportOptions> = {},
): MindMapExportOptions {
	return {
		format: "svg",
		fileName: "Roadmap",
		scope: "visible-map",
		background: "theme",
		padding: 32,
		...overrides,
	};
}
