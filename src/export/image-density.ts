import { MindMapExportError } from "./types";

const PNG_SIGNATURE = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_PHYS_TYPE = new Uint8Array([0x70, 0x48, 0x59, 0x73]);

export function writePngDensity(
	bytes: Uint8Array,
	dpi: number,
): Uint8Array {
	if (!startsWith(bytes, PNG_SIGNATURE)) {
		throw new MindMapExportError(
			"Could not write PNG density metadata because the encoded image is invalid.",
			"encode-failed",
		);
	}
	const pixelsPerMeter = Math.max(1, Math.round(normalizeDpi(dpi) / 0.0254));
	const densityChunk = createPngDensityChunk(pixelsPerMeter);
	const parts: Uint8Array[] = [bytes.subarray(0, PNG_SIGNATURE.length)];
	let offset = PNG_SIGNATURE.length;
	let inserted = false;

	while (offset < bytes.length) {
		if (offset + 12 > bytes.length) {
			throw invalidPngError();
		}
		const dataLength = readUint32(bytes, offset);
		const chunkEnd = offset + 12 + dataLength;
		if (chunkEnd > bytes.length) {
			throw invalidPngError();
		}
		const typeOffset = offset + 4;
		const isPhys = bytesEqualAt(bytes, typeOffset, PNG_PHYS_TYPE);
		if (!isPhys) {
			parts.push(bytes.subarray(offset, chunkEnd));
		}
		const isHeader =
			bytes[typeOffset] === 0x49 &&
			bytes[typeOffset + 1] === 0x48 &&
			bytes[typeOffset + 2] === 0x44 &&
			bytes[typeOffset + 3] === 0x52;
		if (isHeader && !inserted) {
			parts.push(densityChunk);
			inserted = true;
		}
		offset = chunkEnd;
	}

	if (!inserted) {
		throw invalidPngError();
	}
	return concatenateBytes(parts);
}

export function writeJpegDensity(
	bytes: Uint8Array,
	dpi: number,
): Uint8Array {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
		throw new MindMapExportError(
			"Could not write JPEG density metadata because the encoded image is invalid.",
			"encode-failed",
		);
	}
	const density = Math.min(65_535, Math.max(1, Math.round(normalizeDpi(dpi))));
	const updated = bytes.slice();
	let offset = 2;

	while (offset + 4 <= updated.length) {
		if (updated[offset] !== 0xff) {
			throw invalidJpegError();
		}
		let markerOffset = offset;
		while (markerOffset < updated.length && updated[markerOffset] === 0xff) {
			markerOffset += 1;
		}
		if (markerOffset >= updated.length) {
			throw invalidJpegError();
		}
		const marker = updated[markerOffset];
		if (marker === undefined) {
			throw invalidJpegError();
		}
		if (marker === 0xd9 || marker === 0xda) {
			break;
		}
		if (isStandaloneJpegMarker(marker)) {
			offset = markerOffset + 1;
			continue;
		}
		if (markerOffset + 3 > updated.length) {
			throw invalidJpegError();
		}
		const segmentLength = readUint16(updated, markerOffset + 1);
		const segmentEnd = markerOffset + 1 + segmentLength;
		if (segmentLength < 2 || segmentEnd > updated.length) {
			throw invalidJpegError();
		}
		const payloadOffset = markerOffset + 3;
		if (
			marker === 0xe0 &&
			segmentLength >= 16 &&
			isJfifIdentifier(updated, payloadOffset)
		) {
			updated[payloadOffset + 7] = 1;
			writeUint16(updated, payloadOffset + 8, density);
			writeUint16(updated, payloadOffset + 10, density);
			return updated;
		}
		offset = segmentEnd;
	}

	return concatenateBytes([
		updated.subarray(0, 2),
		createJfifDensitySegment(density),
		updated.subarray(2),
	]);
}

function createPngDensityChunk(pixelsPerMeter: number): Uint8Array {
	const data = new Uint8Array(9);
	writeUint32(data, 0, pixelsPerMeter);
	writeUint32(data, 4, pixelsPerMeter);
	data[8] = 1;
	const typeAndData = concatenateBytes([PNG_PHYS_TYPE, data]);
	const chunk = new Uint8Array(4 + typeAndData.length + 4);
	writeUint32(chunk, 0, data.length);
	chunk.set(typeAndData, 4);
	writeUint32(chunk, 4 + typeAndData.length, crc32(typeAndData));
	return chunk;
}

function createJfifDensitySegment(density: number): Uint8Array {
	const segment = new Uint8Array(18);
	segment.set([0xff, 0xe0, 0x00, 0x10], 0);
	segment.set([0x4a, 0x46, 0x49, 0x46, 0x00], 4);
	segment[9] = 1;
	segment[10] = 2;
	segment[11] = 1;
	writeUint16(segment, 12, density);
	writeUint16(segment, 14, density);
	segment[16] = 0;
	segment[17] = 0;
	return segment;
}

function isJfifIdentifier(bytes: Uint8Array, offset: number): boolean {
	return (
		bytes[offset] === 0x4a &&
		bytes[offset + 1] === 0x46 &&
		bytes[offset + 2] === 0x49 &&
		bytes[offset + 3] === 0x46 &&
		bytes[offset + 4] === 0
	);
}

function isStandaloneJpegMarker(marker: number): boolean {
	return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

function normalizeDpi(value: number): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new MindMapExportError(
			"Export DPI must be a positive finite number.",
			"invalid-options",
		);
	}
	return value;
}

function invalidPngError(): MindMapExportError {
	return new MindMapExportError(
		"Could not write PNG density metadata because the encoded image is truncated.",
		"encode-failed",
	);
}

function invalidJpegError(): MindMapExportError {
	return new MindMapExportError(
		"Could not write JPEG density metadata because the encoded image is truncated.",
		"encode-failed",
	);
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
	return bytesEqualAt(bytes, 0, prefix);
}

function bytesEqualAt(
	bytes: Uint8Array,
	offset: number,
	expected: Uint8Array,
): boolean {
	if (offset + expected.length > bytes.length) {
		return false;
	}
	for (let index = 0; index < expected.length; index += 1) {
		if (bytes[offset + index] !== expected[index]) {
			return false;
		}
	}
	return true;
}

function readUint16(bytes: Uint8Array, offset: number): number {
	const high = bytes[offset];
	const low = bytes[offset + 1];
	if (high === undefined || low === undefined) {
		throw new MindMapExportError(
			"Could not read image metadata because the encoded image is truncated.",
			"encode-failed",
		);
	}
	return (high << 8) | low;
}

function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
	bytes[offset] = (value >>> 8) & 0xff;
	bytes[offset + 1] = value & 0xff;
}

function readUint32(bytes: Uint8Array, offset: number): number {
	const byte0 = bytes[offset];
	const byte1 = bytes[offset + 1];
	const byte2 = bytes[offset + 2];
	const byte3 = bytes[offset + 3];
	if (
		byte0 === undefined ||
		byte1 === undefined ||
		byte2 === undefined ||
		byte3 === undefined
	) {
		throw new MindMapExportError(
			"Could not read image metadata because the encoded image is truncated.",
			"encode-failed",
		);
	}
	return (
		(byte0 * 0x1000000 +
			((byte1 << 16) | (byte2 << 8) | byte3)) >>>
		0
	);
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
	bytes[offset] = (value >>> 24) & 0xff;
	bytes[offset + 1] = (value >>> 16) & 0xff;
	bytes[offset + 2] = (value >>> 8) & 0xff;
	bytes[offset + 3] = value & 0xff;
}

function concatenateBytes(parts: readonly Uint8Array[]): Uint8Array {
	const length = parts.reduce((total, part) => total + part.length, 0);
	const result = new Uint8Array(length);
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const value of bytes) {
		crc ^= value;
		for (let bit = 0; bit < 8; bit += 1) {
			crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}
