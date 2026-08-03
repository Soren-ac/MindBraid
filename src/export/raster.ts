import { writeJpegDensity, writePngDensity } from "./image-density";
import {
	DEFAULT_MIND_MAP_EXPORT_LIMITS,
	reportMindMapExportProgress,
	type MindMapExportExecutionContext,
	type MindMapExportLimits,
	MindMapExportError,
	type MindMapRasterDimensions,
	throwIfMindMapExportAborted,
} from "./types";

const CSS_PIXELS_PER_INCH = 96;

export type MindMapRasterFormat = "png" | "jpeg";

export interface MindMapRasterCanvas {
	readonly element: HTMLCanvasElement;
	readonly context: CanvasRenderingContext2D;
}

interface MindMapRasterHtmlElementFactory {
	createElement<K extends keyof HTMLElementTagNameMap>(
		tagName: K,
	): HTMLElementTagNameMap[K];
}

export interface MindMapRasterBrowserPort {
	loadSvg(svg: string, signal?: AbortSignal): Promise<CanvasImageSource>;
	createCanvas(width: number, height: number): MindMapRasterCanvas;
	encodeCanvas(
		canvas: HTMLCanvasElement,
		mimeType: "image/png" | "image/jpeg",
		quality: number | undefined,
		signal?: AbortSignal,
	): Promise<Uint8Array>;
	releaseImage?(image: CanvasImageSource): void;
	/**
	 * An optional off-main-thread path. It is a performance hint only: callers
	 * must fall back to the regular canvas port when it is unavailable or fails.
	 */
	rasterizeInWorker?(
		request: MindMapRasterWorkerRequest,
		context?: MindMapExportExecutionContext,
	): Promise<Uint8Array>;
}

export interface MindMapRasterWorkerRequest {
	readonly svg: string;
	readonly pixelWidth: number;
	readonly pixelHeight: number;
	readonly format: MindMapRasterFormat;
	readonly jpegQuality?: number;
	readonly jpegBackgroundColor: string;
}

export interface MindMapRasterizeRequest {
	readonly svg: string;
	readonly logicalWidth: number;
	readonly logicalHeight: number;
	readonly format: MindMapRasterFormat;
	readonly dpi: number;
	readonly jpegQuality?: number;
	readonly jpegBackgroundColor: string;
	readonly limits?: MindMapExportLimits;
}

export interface MindMapRasterizedImage {
	readonly bytes: Uint8Array;
	readonly mimeType: "image/png" | "image/jpeg";
	readonly dimensions: MindMapRasterDimensions;
}

export function calculateMindMapRasterDimensions(
	logicalWidth: number,
	logicalHeight: number,
	dpi: number,
	limits: MindMapExportLimits = DEFAULT_MIND_MAP_EXPORT_LIMITS,
): MindMapRasterDimensions {
	if (
		!Number.isFinite(logicalWidth) ||
		!Number.isFinite(logicalHeight) ||
		logicalWidth <= 0 ||
		logicalHeight <= 0 ||
		!Number.isFinite(dpi) ||
		dpi < limits.minimumDpi ||
		dpi > limits.maximumDpi
	) {
		throw new MindMapExportError(
			`Raster export requires positive dimensions and a DPI between ${String(limits.minimumDpi)} and ${String(limits.maximumDpi)}.`,
			"invalid-options",
		);
	}
	const scale = dpi / CSS_PIXELS_PER_INCH;
	const pixelWidth = Math.max(1, Math.ceil(logicalWidth * scale));
	const pixelHeight = Math.max(1, Math.ceil(logicalHeight * scale));
	if (
		pixelWidth > limits.maximumDimension ||
		pixelHeight > limits.maximumDimension ||
		pixelWidth * pixelHeight > limits.maximumPixels
	) {
		throw new MindMapExportError(
			`The requested raster export is ${String(pixelWidth)} × ${String(pixelHeight)} pixels, which exceeds the safe export limit.`,
			"too-large",
		);
	}
	return {
		logicalWidth,
		logicalHeight,
		pixelWidth,
		pixelHeight,
		dpi,
	};
}

export async function rasterizeMindMapSvg(
	request: MindMapRasterizeRequest,
	port: MindMapRasterBrowserPort,
	contextOrSignal?: MindMapExportExecutionContext | AbortSignal,
): Promise<MindMapRasterizedImage> {
	const context = normalizeExecutionContext(contextOrSignal);
	throwIfMindMapExportAborted(context?.signal);
	const dimensions = calculateMindMapRasterDimensions(
		request.logicalWidth,
		request.logicalHeight,
		request.dpi,
		request.limits,
	);
	reportMindMapExportProgress(context, "rasterize", "started", 0);
	const workerBytes = await tryRasterizeInWorker(
		request,
		dimensions,
		port,
		context,
	);
	if (workerBytes !== null) {
		reportMindMapExportProgress(context, "rasterize", "completed", 1);
		return {
			bytes:
				request.format === "png"
					? writePngDensity(workerBytes, request.dpi)
					: writeJpegDensity(workerBytes, request.dpi),
			mimeType: request.format === "png" ? "image/png" : "image/jpeg",
			dimensions,
		};
	}

	const image = await port.loadSvg(request.svg, context?.signal);
	try {
		throwIfMindMapExportAborted(context?.signal);
		const canvas = port.createCanvas(
			dimensions.pixelWidth,
			dimensions.pixelHeight,
		);
		if (request.format === "jpeg") {
			canvas.context.fillStyle = request.jpegBackgroundColor;
			canvas.context.fillRect(
				0,
				0,
				dimensions.pixelWidth,
				dimensions.pixelHeight,
			);
		}
		canvas.context.drawImage(
			image,
			0,
			0,
			dimensions.pixelWidth,
			dimensions.pixelHeight,
		);
		throwIfMindMapExportAborted(context?.signal);
		const mimeType =
			request.format === "png" ? "image/png" : "image/jpeg";
		const quality =
			request.format === "jpeg"
				? normalizeJpegQuality(request.jpegQuality)
				: undefined;
		const encoded = await port.encodeCanvas(
			canvas.element,
			mimeType,
			quality,
			context?.signal,
		);
		throwIfMindMapExportAborted(context?.signal);
		reportMindMapExportProgress(context, "rasterize", "completed", 1);
		return {
			bytes:
				request.format === "png"
					? writePngDensity(encoded, request.dpi)
					: writeJpegDensity(encoded, request.dpi),
			mimeType,
			dimensions,
		};
	} finally {
		port.releaseImage?.(image);
	}
}

export function createBrowserMindMapRasterPort(
	ownerDocument: Document,
): MindMapRasterBrowserPort {
	const workerRasterizer = createBrowserWorkerRasterizer(ownerDocument);
	return {
		async loadSvg(svg, signal): Promise<CanvasImageSource> {
			throwIfMindMapExportAborted(signal);
			const urlApi = ownerDocument.defaultView?.URL ?? URL;
			const url = urlApi.createObjectURL(
				new Blob([svg], {
					type: "image/svg+xml;charset=utf-8",
				}),
			);
			const elementFactory: MindMapRasterHtmlElementFactory = ownerDocument;
			const image = elementFactory.createElement("img");
			try {
				const loaded = waitForImage(image, signal);
				image.src = url;
				await loaded;
				throwIfMindMapExportAborted(signal);
				return image;
			} finally {
				urlApi.revokeObjectURL(url);
			}
		},
		createCanvas(width, height): MindMapRasterCanvas {
			const elementFactory: MindMapRasterHtmlElementFactory = ownerDocument;
			const canvas = elementFactory.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext("2d");
			if (context === null) {
				throw new MindMapExportError(
					"This Obsidian window could not create a 2D export canvas.",
					"encode-failed",
				);
			}
			return { element: canvas, context };
		},
		async encodeCanvas(canvas, mimeType, quality, signal): Promise<Uint8Array> {
			throwIfMindMapExportAborted(signal);
			const blob = await new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(result) => {
						if (result === null) {
							reject(
								new MindMapExportError(
									"The browser could not encode the mind-map image.",
									"encode-failed",
								),
							);
							return;
						}
						resolve(result);
					},
					mimeType,
					quality,
				);
			});
			throwIfMindMapExportAborted(signal);
			return new Uint8Array(await blob.arrayBuffer());
		},
		releaseImage(image): void {
			if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
				image.close();
			}
		},
		...(workerRasterizer === undefined
			? {}
			: { rasterizeInWorker: workerRasterizer }),
	};
}

function normalizeExecutionContext(
	value: MindMapExportExecutionContext | AbortSignal | undefined,
): MindMapExportExecutionContext | undefined {
	if (value === undefined) {
		return undefined;
	}
	return isAbortSignal(value) ? { signal: value } : value;
}

function isAbortSignal(
	value: MindMapExportExecutionContext | AbortSignal,
): value is AbortSignal {
	return "aborted" in value && "addEventListener" in value;
}

async function tryRasterizeInWorker(
	request: MindMapRasterizeRequest,
	dimensions: MindMapRasterDimensions,
	port: MindMapRasterBrowserPort,
	context: MindMapExportExecutionContext | undefined,
): Promise<Uint8Array | null> {
	if (port.rasterizeInWorker === undefined) {
		return null;
	}
	throwIfMindMapExportAborted(context?.signal);
	try {
		const bytes = await port.rasterizeInWorker(
			{
				svg: request.svg,
				pixelWidth: dimensions.pixelWidth,
				pixelHeight: dimensions.pixelHeight,
				format: request.format,
				jpegQuality:
					request.format === "jpeg"
						? normalizeJpegQuality(request.jpegQuality)
						: undefined,
				jpegBackgroundColor: request.jpegBackgroundColor,
			},
			context,
		);
		throwIfMindMapExportAborted(context?.signal);
		return bytes;
	} catch (error: unknown) {
		if (isAbortError(error) || context?.signal?.aborted === true) {
			throw error;
		}
		// Blob workers may be blocked by host CSP or unavailable in older desktop
		// runtimes. The main-thread canvas path remains the reliable fallback.
		return null;
	}
}

function isAbortError(error: unknown): error is MindMapExportError {
	return error instanceof MindMapExportError && error.code === "aborted";
}

function createBrowserWorkerRasterizer(
	ownerDocument: Document,
): MindMapRasterBrowserPort["rasterizeInWorker"] | undefined {
	const ownerWindow = ownerDocument.defaultView;
	if (
		ownerWindow === null ||
		typeof ownerWindow.Worker !== "function" ||
		typeof ownerWindow.OffscreenCanvas !== "function" ||
		typeof ownerWindow.createImageBitmap !== "function"
	) {
		return undefined;
	}
	return async (request, context): Promise<Uint8Array> => {
		throwIfMindMapExportAborted(context?.signal);
		const workerUrl = ownerWindow.URL.createObjectURL(
			new ownerWindow.Blob([MIND_MAP_RASTER_WORKER_SOURCE], {
				type: "text/javascript",
			}),
		);
		let worker: Worker | null = null;
		try {
			worker = new ownerWindow.Worker(workerUrl);
			return await executeWorkerRasterization(worker, request, context?.signal);
		} finally {
			worker?.terminate();
			ownerWindow.URL.revokeObjectURL(workerUrl);
		}
	};
}

function executeWorkerRasterization(
	worker: Worker,
	request: MindMapRasterWorkerRequest,
	signal: AbortSignal | undefined,
): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const cleanup = (): void => {
			worker.removeEventListener("message", handleMessage);
			worker.removeEventListener("error", handleError);
			signal?.removeEventListener("abort", handleAbort);
		};
		const handleMessage = (event: MessageEvent<unknown>): void => {
			const message = event.data as
				| { readonly type: "success"; readonly bytes: ArrayBuffer }
				| { readonly type: "error"; readonly message: string };
			cleanup();
			if (message.type === "success" && message.bytes instanceof ArrayBuffer) {
				resolve(new Uint8Array(message.bytes));
				return;
			}
			reject(
				new MindMapExportError(
					message.type === "error"
						? message.message
						: "The export worker returned an invalid result.",
					"encode-failed",
				),
			);
		};
		const handleError = (): void => {
			cleanup();
			reject(
				new MindMapExportError(
					"The export worker could not rasterize the mind map.",
					"encode-failed",
				),
			);
		};
		const handleAbort = (): void => {
			cleanup();
			reject(
				new MindMapExportError(
					"Mind-map export was cancelled.",
					"aborted",
				),
			);
		};
		worker.addEventListener("message", handleMessage, { once: true });
		worker.addEventListener("error", handleError, { once: true });
		signal?.addEventListener("abort", handleAbort, { once: true });
		if (signal?.aborted === true) {
			handleAbort();
			return;
		}
		worker.postMessage(request);
	});
}

const MIND_MAP_RASTER_WORKER_SOURCE = `
self.addEventListener("message", async (event) => {
  let image = null;
  try {
    const request = event.data;
    const source = new Blob([request.svg], { type: "image/svg+xml;charset=utf-8" });
    image = await createImageBitmap(source);
    const canvas = new OffscreenCanvas(request.pixelWidth, request.pixelHeight);
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("The export worker could not create a 2D canvas.");
    if (request.format === "jpeg") {
      context.fillStyle = request.jpegBackgroundColor;
      context.fillRect(0, 0, request.pixelWidth, request.pixelHeight);
    }
    context.drawImage(image, 0, 0, request.pixelWidth, request.pixelHeight);
    const mimeType = request.format === "png" ? "image/png" : "image/jpeg";
    const blob = await canvas.convertToBlob({ type: mimeType, quality: request.jpegQuality });
    const bytes = await blob.arrayBuffer();
    self.postMessage({ type: "success", bytes }, [bytes]);
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "The export worker failed." });
  } finally {
    image?.close?.();
  }
});
`;

function normalizeJpegQuality(value: number | undefined): number {
	if (value === undefined) {
		return 0.92;
	}
	if (!Number.isFinite(value)) {
		throw new MindMapExportError(
			"JPEG quality must be a finite number.",
			"invalid-options",
		);
	}
	return Math.min(1, Math.max(0.1, value));
}

function waitForImage(
	image: HTMLImageElement,
	signal: AbortSignal | undefined,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const cleanup = (): void => {
			image.removeEventListener("load", handleLoad);
			image.removeEventListener("error", handleError);
			signal?.removeEventListener("abort", handleAbort);
		};
		const handleLoad = (): void => {
			cleanup();
			resolve();
		};
		const handleError = (): void => {
			cleanup();
			reject(
				new MindMapExportError(
					"The browser could not decode the generated SVG.",
					"encode-failed",
				),
			);
		};
		const handleAbort = (): void => {
			cleanup();
			reject(
				new MindMapExportError(
					"Mind-map export was cancelled.",
					"aborted",
				),
			);
		};
		image.addEventListener("load", handleLoad, { once: true });
		image.addEventListener("error", handleError, { once: true });
		signal?.addEventListener("abort", handleAbort, { once: true });
		if (signal?.aborted === true) {
			handleAbort();
		}
	});
}
