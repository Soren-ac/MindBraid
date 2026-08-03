import { describe, expect, it } from "vitest";

import { writeJpegDensity, writePngDensity } from "../src/export/image-density";
import { MindMapExportError } from "../src/export/types";
import {
	captureMindMapExportError,
	concatenateBytes,
	createChunkedPngBytes,
	createJpegBytes,
	createPngChunk,
	readUint16,
	readUint32,
	writeUint32,
} from "./export-fixtures";

describe("mind-map raster density metadata", () => {
	it("inserts a single PNG pHYs chunk directly after IHDR and replaces stale density", () => {
		const staleDensity = new Uint8Array(9);
		writeUint32(staleDensity, 0, 1);
		writeUint32(staleDensity, 4, 1);
		staleDensity[8] = 1;
		const input = concatenateBytes([
			createChunkedPngBytes().subarray(0, 33),
			createPngChunk("pHYs", staleDensity),
			createChunkedPngBytes().subarray(33),
		]);

		const result = writePngDensity(input, 300);
		const chunks = readPngChunks(result);
		const densityChunks = chunks.filter((chunk) => chunk.type === "pHYs");

		expect(chunks.map((chunk) => chunk.type)).toEqual([
			"IHDR",
			"pHYs",
			"IEND",
		]);
		expect(densityChunks).toHaveLength(1);
		const density = densityChunks[0]!.data;
		expect(readUint32(density, 0)).toBe(Math.round(300 / 0.0254));
		expect(readUint32(density, 4)).toBe(Math.round(300 / 0.0254));
		expect(density[8]).toBe(1);
	});

	it("updates an existing JFIF header or installs one when the JPEG has none", () => {
		const withJfif = writeJpegDensity(createJpegBytes(), 300);
		expect(withJfif[13]).toBe(1);
		expect(readUint16(withJfif, 14)).toBe(300);
		expect(readUint16(withJfif, 16)).toBe(300);

		const withoutJfif = writeJpegDensity(createJpegBytes(false), 150);
		expect(Array.from(withoutJfif.subarray(2, 9))).toEqual([
			0xff,
			0xe0,
			0x00,
			0x10,
			0x4a,
			0x46,
			0x49,
		]);
		expect(withoutJfif[13]).toBe(1);
		expect(readUint16(withoutJfif, 14)).toBe(150);
		expect(readUint16(withoutJfif, 16)).toBe(150);
	});

	it("rejects malformed source bytes and invalid densities", () => {
		expect(() => writePngDensity(new Uint8Array([1, 2, 3]), 150)).toThrow(
		MindMapExportError,
	);
		expect(() => writeJpegDensity(new Uint8Array([0xff, 0xd8]), 150)).toThrow(
		MindMapExportError,
	);
		expect(
			captureMindMapExportError(() =>
				writeJpegDensity(createJpegBytes(), 0),
			),
		).toMatchObject({ code: "invalid-options" });
	});
});

interface PngChunk {
	readonly type: string;
	readonly data: Uint8Array;
}

function readPngChunks(bytes: Uint8Array): readonly PngChunk[] {
	const chunks: PngChunk[] = [];
	let offset = 8;
	while (offset < bytes.length) {
		const dataLength = readUint32(bytes, offset);
		const type = String.fromCharCode(
			bytes[offset + 4]!,
			bytes[offset + 5]!,
			bytes[offset + 6]!,
			bytes[offset + 7]!,
		);
		const dataStart = offset + 8;
		const dataEnd = dataStart + dataLength;
		chunks.push({ type, data: bytes.slice(dataStart, dataEnd) });
		offset = dataEnd + 4;
	}
	return chunks;
}
