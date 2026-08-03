import { describe, expect, it, vi } from "vitest";

import {
	calculateMindMapRasterDimensions,
	createBrowserMindMapRasterPort,
	rasterizeMindMapSvg,
	type MindMapRasterBrowserPort,
} from "../src/export/raster";
import {
	DEFAULT_MIND_MAP_EXPORT_LIMITS,
	MindMapExportError,
} from "../src/export/types";
import {
	captureMindMapExportError,
	createChunkedPngBytes,
	createJpegBytes,
	readUint32,
} from "./export-fixtures";

describe("mind-map raster export", () => {
	it("calculates DPI-scaled pixel dimensions and rejects unsafe requests", () => {
		expect(calculateMindMapRasterDimensions(192, 96, 300)).toEqual({
			logicalWidth: 192,
			logicalHeight: 96,
			pixelWidth: 600,
			pixelHeight: 300,
			dpi: 300,
		});
		expect(
			captureMindMapExportError(() =>
				calculateMindMapRasterDimensions(192, 96, 71),
			),
		).toMatchObject({ code: "invalid-options" });
		expect(captureMindMapExportError(() =>
			calculateMindMapRasterDimensions(100, 100, 96, {
				...DEFAULT_MIND_MAP_EXPORT_LIMITS,
				maximumPixels: 1,
			}),
		)).toMatchObject({ code: "too-large" });
	});

	it("uses the injected browser port, preserves PNG density, and releases images", async () => {
		const harness = createRasterHarness(createChunkedPngBytes());

		const result = await rasterizeMindMapSvg(
			{
				svg: "<svg/>",
				logicalWidth: 192,
				logicalHeight: 96,
				format: "png",
				dpi: 300,
				jpegBackgroundColor: "#fff",
			},
			harness.port,
		);

		expect(result).toMatchObject({
			mimeType: "image/png",
			dimensions: { pixelWidth: 600, pixelHeight: 300, dpi: 300 },
		});
		expect(harness.loadSvg).toHaveBeenCalledWith("<svg/>", undefined);
		expect(harness.createCanvas).toHaveBeenCalledWith(600, 300);
		expect(harness.drawImage).toHaveBeenCalledWith(
			harness.image,
			0,
			0,
			600,
			300,
		);
		expect(harness.fillRect).not.toHaveBeenCalled();
		expect(harness.encodeCanvas).toHaveBeenCalledWith(
			harness.canvas,
			"image/png",
			undefined,
			undefined,
		);
		expect(harness.releaseImage).toHaveBeenCalledWith(harness.image);
		const densityOffset = findPngChunkOffset(result.bytes, "pHYs");
		expect(readUint32(result.bytes, densityOffset + 8)).toBe(
			Math.round(300 / 0.0254),
		);
	});

	it("fills JPEG with a background and normalizes JPEG quality through the port", async () => {
		const harness = createRasterHarness(createJpegBytes());

		const result = await rasterizeMindMapSvg(
			{
				svg: "<svg/>",
				logicalWidth: 96,
				logicalHeight: 96,
				format: "jpeg",
				dpi: 150,
				jpegQuality: 2,
				jpegBackgroundColor: "#f7f3e8",
			},
			harness.port,
		);

		expect(result.mimeType).toBe("image/jpeg");
		expect(harness.context.fillStyle).toBe("#f7f3e8");
		expect(harness.fillRect).toHaveBeenCalledWith(0, 0, 150, 150);
		expect(harness.encodeCanvas).toHaveBeenCalledWith(
			harness.canvas,
			"image/jpeg",
			1,
			undefined,
		);
	});

	it("stops before touching the browser port when cancelled and releases a loaded image on encode failure", async () => {
		const cancelled = createRasterHarness(createChunkedPngBytes());
		const controller = new AbortController();
		controller.abort();

		await expect(
			rasterizeMindMapSvg(
				{
					svg: "<svg/>",
					logicalWidth: 96,
					logicalHeight: 96,
					format: "png",
					dpi: 150,
					jpegBackgroundColor: "#fff",
				},
				cancelled.port,
				controller.signal,
			),
		).rejects.toMatchObject({ code: "aborted" });
		expect(cancelled.loadSvg).not.toHaveBeenCalled();

		const failing = createRasterHarness(createChunkedPngBytes());
		failing.encodeCanvas.mockRejectedValueOnce(new Error("encode failed"));
		await expect(
			rasterizeMindMapSvg(
				{
					svg: "<svg/>",
					logicalWidth: 96,
					logicalHeight: 96,
					format: "png",
					dpi: 150,
					jpegBackgroundColor: "#fff",
				},
				failing.port,
			),
		).rejects.toThrow("encode failed");
		expect(failing.releaseImage).toHaveBeenCalledWith(failing.image);
	});

	it("uses a worker result when available without constructing a main-thread canvas", async () => {
		const harness = createRasterHarness(createChunkedPngBytes());
		const worker = vi.fn(async (): Promise<Uint8Array> =>
			createChunkedPngBytes(),
		);
		harness.port.rasterizeInWorker = worker;
		const progress: string[] = [];

		const result = await rasterizeMindMapSvg(
			{
				svg: "<svg/>",
				logicalWidth: 96,
				logicalHeight: 96,
				format: "png",
				dpi: 150,
				jpegBackgroundColor: "#fff",
			},
			harness.port,
			{
				onProgress: (event) => progress.push(`${event.phase}:${event.state}`),
			},
		);

		expect(result.dimensions).toMatchObject({ pixelWidth: 150, pixelHeight: 150 });
		expect(worker).toHaveBeenCalledWith(
			expect.objectContaining({ pixelWidth: 150, pixelHeight: 150 }),
			expect.any(Object),
		);
		expect(harness.loadSvg).not.toHaveBeenCalled();
		expect(harness.createCanvas).not.toHaveBeenCalled();
		expect(progress).toEqual(["rasterize:started", "rasterize:completed"]);
	});

	it("falls back to the main-thread port when a worker fails", async () => {
		const harness = createRasterHarness(createChunkedPngBytes());
		const worker = vi.fn(async (): Promise<Uint8Array> => {
			throw new Error("Worker unavailable");
		});
		harness.port.rasterizeInWorker = worker;
		const progress: string[] = [];

		await rasterizeMindMapSvg(
			{
				svg: "<svg/>",
				logicalWidth: 96,
				logicalHeight: 96,
				format: "png",
				dpi: 150,
				jpegBackgroundColor: "#fff",
			},
			harness.port,
			{
				onProgress: (event) => progress.push(`${event.phase}:${event.state}`),
			},
		);

		expect(worker).toHaveBeenCalledTimes(1);
		expect(harness.loadSvg).toHaveBeenCalledTimes(1);
		expect(harness.createCanvas).toHaveBeenCalledWith(150, 150);
		expect(progress).toEqual(["rasterize:started", "rasterize:completed"]);
	});

	it("revokes the Blob URL when the browser rejects Worker construction", async () => {
		const createObjectURL = vi.fn(() => "blob:obmind-export-worker");
		const revokeObjectURL = vi.fn();
		const ThrowingWorker = class {
			public constructor() {
				throw new Error("Worker construction blocked by CSP");
			}
		} as unknown as typeof Worker;
		const ownerWindow = {
			Worker: ThrowingWorker,
			OffscreenCanvas: class {},
			createImageBitmap: vi.fn(),
			Blob,
			URL: { createObjectURL, revokeObjectURL },
		} as unknown as Window;
		const port = createBrowserMindMapRasterPort({
			defaultView: ownerWindow,
		} as unknown as Document);
		const rasterizeInWorker = port.rasterizeInWorker?.bind(port);
		if (rasterizeInWorker === undefined) {
			throw new Error("Expected the feature-detected worker rasterizer.");
		}

		await expect(
			rasterizeInWorker({
				svg: "<svg/>",
				pixelWidth: 96,
				pixelHeight: 96,
				format: "png",
				jpegBackgroundColor: "#fff",
			}),
		).rejects.toThrow("Worker construction blocked by CSP");
		expect(createObjectURL).toHaveBeenCalledTimes(1);
		expect(revokeObjectURL).toHaveBeenCalledWith(
			"blob:obmind-export-worker",
		);
	});

	it("cancels an in-flight worker without falling back to a canvas", async () => {
		const harness = createRasterHarness(createChunkedPngBytes());
		harness.port.rasterizeInWorker = async (_request, context) =>
			new Promise<Uint8Array>((_resolve, reject) => {
				context?.signal?.addEventListener(
					"abort",
					() =>
						reject(
							new MindMapExportError(
								"Mind-map export was cancelled.",
								"aborted",
							),
						),
					{ once: true },
				);
			});
		const controller = new AbortController();
		const pending = rasterizeMindMapSvg(
			{
				svg: "<svg/>",
				logicalWidth: 96,
				logicalHeight: 96,
				format: "png",
				dpi: 150,
				jpegBackgroundColor: "#fff",
			},
			harness.port,
			{ signal: controller.signal },
		);
		controller.abort();

		await expect(pending).rejects.toMatchObject({ code: "aborted" });
		expect(harness.loadSvg).not.toHaveBeenCalled();
		expect(harness.createCanvas).not.toHaveBeenCalled();
	});
});

interface RasterHarness {
	readonly port: MindMapRasterBrowserPort;
	readonly image: CanvasImageSource;
	readonly canvas: HTMLCanvasElement;
	readonly context: CanvasRenderingContext2D & {
		readonly fillRect: ReturnType<typeof vi.fn>;
		readonly drawImage: ReturnType<typeof vi.fn>;
	};
	readonly fillRect: ReturnType<typeof vi.fn>;
	readonly drawImage: ReturnType<typeof vi.fn>;
	readonly loadSvg: ReturnType<typeof vi.fn>;
	readonly createCanvas: ReturnType<typeof vi.fn>;
	readonly encodeCanvas: ReturnType<typeof vi.fn>;
	readonly releaseImage: ReturnType<typeof vi.fn>;
}

function createRasterHarness(encoded: Uint8Array): RasterHarness {
	const image = {} as CanvasImageSource;
	const canvas = {} as HTMLCanvasElement;
	const fillRect = vi.fn();
	const drawImage = vi.fn();
	const context = {
		fillStyle: "",
		fillRect,
		drawImage,
	} as unknown as RasterHarness["context"];
	const loadSvg = vi.fn(async (): Promise<CanvasImageSource> => image);
	const createCanvas = vi.fn(() => ({ element: canvas, context }));
	const encodeCanvas = vi.fn(async (): Promise<Uint8Array> => encoded);
	const releaseImage = vi.fn();
	return {
		port: { loadSvg, createCanvas, encodeCanvas, releaseImage },
		image,
		canvas,
		context,
		fillRect,
		drawImage,
		loadSvg,
		createCanvas,
		encodeCanvas,
		releaseImage,
	};
}

function findPngChunkOffset(bytes: Uint8Array, expectedType: string): number {
	let offset = 8;
	while (offset < bytes.length) {
		const length = readUint32(bytes, offset);
		const type = String.fromCharCode(
			bytes[offset + 4]!,
			bytes[offset + 5]!,
			bytes[offset + 6]!,
			bytes[offset + 7]!,
		);
		if (type === expectedType) {
			return offset;
		}
		offset += 12 + length;
	}
	throw new Error(`Missing PNG ${expectedType} chunk.`);
}
