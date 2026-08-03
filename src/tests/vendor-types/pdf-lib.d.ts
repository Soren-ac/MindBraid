/**
 * Static-analysis contract for the narrow pdf-lib surface used by MindBraid.
 * Runtime code still imports the bundled `pdf-lib` package.
 */
export interface PDFImage {
	readonly width: number;
	readonly height: number;
}

export interface PDFPageDrawImageOptions {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface PDFPage {
	drawImage(image: PDFImage, options: PDFPageDrawImageOptions): void;
}

export interface PDFSaveOptions {
	readonly addDefaultPage?: boolean;
	readonly objectsPerTick?: number;
	readonly useObjectStreams?: boolean;
}

export interface PDFDocumentInstance {
	embedPng(bytes: Uint8Array): Promise<PDFImage>;
	embedJpg(bytes: Uint8Array): Promise<PDFImage>;
	addPage(size: readonly [number, number]): PDFPage;
	save(options?: PDFSaveOptions): Promise<Uint8Array>;
}

export const PDFDocument: {
	create(): Promise<PDFDocumentInstance>;
};
