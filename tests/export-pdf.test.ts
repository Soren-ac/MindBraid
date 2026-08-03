import { describe, expect, it } from "vitest";

import { PDF_LIB_MIND_MAP_ENCODER } from "../src/export/pdf";

const TINY_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1HQAAAABJRU5ErkJggg==";

describe("mind-map PDF export", () => {
	it("encodes one raster image into a single PDF page", async () => {
		const bytes = await PDF_LIB_MIND_MAP_ENCODER.encode({
			bytes: bytesFromBase64(TINY_PNG_BASE64),
			mimeType: "image/png",
			pixelWidth: 400,
			pixelHeight: 200,
			dpi: 200,
		});

		expect(bytes.length).toBeGreaterThan(100);
		expect(new TextDecoder().decode(bytes.subarray(0, 8))).toMatch(/^%PDF-/);
	});

	it("rejects invalid images and cancellation before it creates a document", async () => {
		await expect(
			PDF_LIB_MIND_MAP_ENCODER.encode({
				bytes: new Uint8Array(),
				mimeType: "image/png",
				pixelWidth: 1,
				pixelHeight: 1,
				dpi: 96,
			}),
		).rejects.toMatchObject({ code: "invalid-options" });

		const controller = new AbortController();
		controller.abort();
		await expect(
			PDF_LIB_MIND_MAP_ENCODER.encode(
				{
					bytes: bytesFromBase64(TINY_PNG_BASE64),
					mimeType: "image/png",
					pixelWidth: 1,
					pixelHeight: 1,
					dpi: 96,
				},
				controller.signal,
			),
		).rejects.toMatchObject({ code: "aborted" });
	});
});

function bytesFromBase64(value: string): Uint8Array {
	return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
