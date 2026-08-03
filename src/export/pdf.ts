import { PDFDocument } from "pdf-lib";

import {
	MindMapExportError,
	throwIfMindMapExportAborted,
} from "./types";

const PDF_POINTS_PER_INCH = 72;
const MAXIMUM_PDF_PAGE_POINTS = 14_400;

export interface MindMapPdfImage {
	readonly bytes: Uint8Array;
	readonly mimeType: "image/png" | "image/jpeg";
	readonly pixelWidth: number;
	readonly pixelHeight: number;
	readonly dpi: number;
}

export interface MindMapPdfEncoder {
	encode(
		image: MindMapPdfImage,
		signal?: AbortSignal,
	): Promise<Uint8Array>;
}

export const PDF_LIB_MIND_MAP_ENCODER: MindMapPdfEncoder = Object.freeze({
	async encode(
		image: MindMapPdfImage,
		signal?: AbortSignal,
	): Promise<Uint8Array> {
		throwIfMindMapExportAborted(signal);
		validatePdfImage(image);
		const document = await PDFDocument.create();
		throwIfMindMapExportAborted(signal);
		const embedded =
			image.mimeType === "image/png"
				? await document.embedPng(image.bytes)
				: await document.embedJpg(image.bytes);
		throwIfMindMapExportAborted(signal);
		const naturalWidth =
			(image.pixelWidth * PDF_POINTS_PER_INCH) / image.dpi;
		const naturalHeight =
			(image.pixelHeight * PDF_POINTS_PER_INCH) / image.dpi;
		const pageScale = Math.min(
			1,
			MAXIMUM_PDF_PAGE_POINTS / naturalWidth,
			MAXIMUM_PDF_PAGE_POINTS / naturalHeight,
		);
		const pageWidth = Math.max(1, naturalWidth * pageScale);
		const pageHeight = Math.max(1, naturalHeight * pageScale);
		const page = document.addPage([pageWidth, pageHeight]);
		page.drawImage(embedded, {
			x: 0,
			y: 0,
			width: pageWidth,
			height: pageHeight,
		});
		const result = await document.save({
			addDefaultPage: false,
			objectsPerTick: 50,
			useObjectStreams: true,
		});
		throwIfMindMapExportAborted(signal);
		return result;
	},
});

function validatePdfImage(image: MindMapPdfImage): void {
	if (
		image.bytes.length === 0 ||
		!Number.isFinite(image.pixelWidth) ||
		!Number.isFinite(image.pixelHeight) ||
		!Number.isFinite(image.dpi) ||
		image.pixelWidth <= 0 ||
		image.pixelHeight <= 0 ||
		image.dpi <= 0
	) {
		throw new MindMapExportError(
			"PDF export requires a valid encoded image and positive dimensions.",
			"invalid-options",
		);
	}
}
