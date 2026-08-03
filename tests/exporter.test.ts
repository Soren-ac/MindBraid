import { describe, expect, it, vi } from "vitest";

import {
	createMindMapExportArtifact,
	type MindMapExporterDependencies,
} from "../src/export/exporter";
import type { MindMapPdfEncoder } from "../src/export/pdf";
import type { MindMapRasterBrowserPort } from "../src/export/raster";
import {
	MindMapExportEncoderRegistry,
	type MindMapExportEncoder,
} from "../src/export/registry";
import {
	DEFAULT_MIND_MAP_EXPORT_LIMITS,
	type MindMapExportOptions,
} from "../src/export/types";
import {
	createChunkedPngBytes,
	createExportScene,
	createJpegBytes,
} from "./export-fixtures";

describe("mind-map export artifact routing", () => {
	it("serializes SVG without constructing a raster image and normalizes its file name", async () => {
		const harness = createExporterHarness(createChunkedPngBytes());
		const artifact = await createMindMapExportArtifact(
			createExportScene(),
			createOptions({ format: "svg", fileName: "Roadmap" }),
			harness.dependencies,
		);

		expect(artifact).toMatchObject({
			format: "svg",
			fileName: "Roadmap.svg",
			mimeType: "image/svg+xml",
			width: 140,
			height: 100,
			dpi: null,
		});
		expect(new TextDecoder().decode(artifact.bytes)).toContain("<svg");
		expect(harness.loadSvg).not.toHaveBeenCalled();
		expect(harness.pdfEncode).not.toHaveBeenCalled();
	});

	it("routes PNG through the injected raster port at the selected DPI", async () => {
		const harness = createExporterHarness(createChunkedPngBytes());
		const artifact = await createMindMapExportArtifact(
			createExportScene(),
			createOptions({
				format: "png",
				fileName: "Roadmap.png",
				padding: 0,
				dpi: 96,
			}),
			harness.dependencies,
		);

		expect(artifact).toMatchObject({
			format: "png",
			fileName: "Roadmap.png",
			mimeType: "image/png",
			width: 120,
			height: 80,
			dpi: 96,
		});
		expect(harness.createCanvas).toHaveBeenCalledWith(120, 80);
		expect(harness.pdfEncode).not.toHaveBeenCalled();
	});

	it("uses an opaque JPEG snapshot for PDF, then delegates to the PDF encoder", async () => {
		const harness = createExporterHarness(createJpegBytes());
		const artifact = await createMindMapExportArtifact(
			createExportScene(),
			createOptions({
				format: "pdf",
				fileName: "Roadmap",
				padding: 0,
			}),
			harness.dependencies,
		);

		expect(artifact).toMatchObject({
			format: "pdf",
			fileName: "Roadmap.pdf",
			mimeType: "application/pdf",
			width: 120,
			height: 80,
			dpi: null,
			bytes: new Uint8Array([1, 2, 3]),
		});
		expect(harness.loadSvg).toHaveBeenCalledTimes(1);
		expect(harness.loadSvg.mock.calls[0]![0]).toContain(
			"obmind-export-background",
		);
		expect(harness.createCanvas).toHaveBeenCalledWith(240, 160);
		expect(harness.pdfEncode).toHaveBeenCalledWith(
			expect.objectContaining({
				mimeType: "image/jpeg",
				pixelWidth: 240,
				pixelHeight: 160,
				dpi: 192,
			}),
			undefined,
		);
	});

	it("propagates cancellation and downstream encoder failures without starting an unintended export", async () => {
		const cancelled = createExporterHarness(createChunkedPngBytes());
		const controller = new AbortController();
		controller.abort();

		await expect(
			createMindMapExportArtifact(
				createExportScene(),
				createOptions({ format: "png" }),
				cancelled.dependencies,
				controller.signal,
			),
		).rejects.toMatchObject({ code: "aborted" });
		expect(cancelled.loadSvg).not.toHaveBeenCalled();

		const failingPdf = createExporterHarness(createJpegBytes());
		failingPdf.pdfEncode.mockRejectedValueOnce(new Error("PDF unavailable"));
		await expect(
			createMindMapExportArtifact(
				createExportScene(),
				createOptions({ format: "pdf" }),
				failingPdf.dependencies,
			),
		).rejects.toThrow("PDF unavailable");
	});

	it("rejects options outside a registered encoder capability before encoding", async () => {
		const harness = createExporterHarness(createChunkedPngBytes());
		const encode = vi.fn<MindMapExportEncoder["encode"]>();
		const encoder: MindMapExportEncoder = {
			capability: {
				format: "png",
				label: "Bounded PNG",
				mimeType: "image/png",
				backgrounds: ["theme"],
				dpi: {
					minimum: 96,
					maximum: 144,
					presets: [96, 144],
					defaultValue: 96,
					supportsCustomValue: true,
				},
				jpegQuality: null,
			},
			encode,
		};

		await expect(
			createMindMapExportArtifact(
				createExportScene(),
				createOptions({ format: "png", dpi: 150 }),
				{
					...harness.dependencies,
					registry: new MindMapExportEncoderRegistry([encoder]),
				},
			),
		).rejects.toMatchObject({ code: "invalid-options" });
		expect(encode).not.toHaveBeenCalled();
		expect(harness.loadSvg).not.toHaveBeenCalled();
	});

	it("reports each encoder phase once in source order", async () => {
		const harness = createExporterHarness(createChunkedPngBytes());
		const progress: string[] = [];

		await createMindMapExportArtifact(
			createExportScene(),
			createOptions({ format: "png", padding: 0, dpi: 96 }),
			harness.dependencies,
			{
				onProgress: (event) => progress.push(`${event.phase}:${event.state}`),
			},
		);

		expect(progress).toEqual([
			"serialize:started",
			"serialize:completed",
			"rasterize:started",
			"rasterize:completed",
		]);
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
		padding: 10,
		...overrides,
	};
}

interface ExporterHarness {
	readonly dependencies: MindMapExporterDependencies;
	readonly loadSvg: ReturnType<typeof vi.fn>;
	readonly createCanvas: ReturnType<typeof vi.fn>;
	readonly pdfEncode: ReturnType<typeof vi.fn>;
}

function createExporterHarness(encoded: Uint8Array): ExporterHarness {
	const image = {} as CanvasImageSource;
	const context = {
		fillStyle: "",
		fillRect: vi.fn(),
		drawImage: vi.fn(),
	} as unknown as CanvasRenderingContext2D;
	const canvas = {} as HTMLCanvasElement;
	const loadSvg = vi.fn(async (): Promise<CanvasImageSource> => image);
	const createCanvas = vi.fn(() => ({ element: canvas, context }));
	const encodeCanvas = vi.fn(async (): Promise<Uint8Array> => encoded);
	const rasterPort: MindMapRasterBrowserPort = {
		loadSvg,
		createCanvas,
		encodeCanvas,
		releaseImage: vi.fn(),
	};
	const pdfEncode = vi.fn(async (): Promise<Uint8Array> =>
		new Uint8Array([1, 2, 3]),
	);
	const pdfEncoder: MindMapPdfEncoder = { encode: pdfEncode };
	return {
		dependencies: {
			rasterPort,
			pdfEncoder,
			limits: DEFAULT_MIND_MAP_EXPORT_LIMITS,
		},
		loadSvg,
		createCanvas,
		pdfEncode,
	};
}
