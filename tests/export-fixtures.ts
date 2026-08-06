import {
	MindMapExportError,
	type MindMapExportScene,
} from "../src/export/types";

export function createExportScene(
	overrides: Partial<MindMapExportScene> = {},
): MindMapExportScene {
	return {
		sourcePath: "Projects/Roadmap.md",
		sourceRevision: "revision-1",
		presentationRevision: 3,
		scope: "visible-map",
		bounds: { x: 10, y: 20, width: 120, height: 80 },
		backgroundColor: "#f7f3e8",
		canvasTexture: null,
		primitives: [
			{
				kind: "rect",
				id: "root",
				x: 10,
				y: 20,
				width: 120,
				height: 48,
				radiusX: 12,
				radiusY: 12,
				fill: { kind: "color", value: "#ffffff" },
				stroke: "#24211f",
				strokeWidth: 1,
			},
			{
				kind: "text",
				id: "root-text",
				x: 28,
				y: 48,
				text: "Roadmap",
				fill: "#24211f",
				fontFamily: "sans-serif",
				fontSize: 16,
				fontWeight: "600",
				fontStyle: "normal",
			},
		],
		nodeShapes: [],
		...overrides,
	};
}

/**
 * A structurally valid PNG stream for metadata tests. The density writer only
 * needs chunks, rather than compressed pixel data, so this deliberately keeps
 * the fixture small and deterministic.
 */
export function createChunkedPngBytes(): Uint8Array {
	return concatenateBytes([
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		createPngChunk("IHDR", new Uint8Array(13)),
		createPngChunk("IEND", new Uint8Array()),
	]);
}

export function createPngChunk(type: string, data: Uint8Array): Uint8Array {
	const bytes = new Uint8Array(12 + data.length);
	writeUint32(bytes, 0, data.length);
	for (let index = 0; index < 4; index += 1) {
		bytes[4 + index] = type.charCodeAt(index);
	}
	bytes.set(data, 8);
	// The export code deliberately does not validate source PNG CRCs. A zero
	// checksum therefore keeps these metadata-only test fixtures concise.
	return bytes;
}

export function createJpegBytes(includeJfif = true): Uint8Array {
	const start = new Uint8Array([0xff, 0xd8]);
	const end = new Uint8Array([0xff, 0xd9]);
	if (!includeJfif) {
		return concatenateBytes([start, end]);
	}
	return concatenateBytes([
		start,
		new Uint8Array([
			0xff,
			0xe0,
			0x00,
			0x10,
			0x4a,
			0x46,
			0x49,
			0x46,
			0x00,
			0x01,
			0x02,
			0x00,
			0x00,
			0x01,
			0x00,
			0x01,
			0x00,
			0x00,
		]),
		end,
	]);
}

export function readUint16(bytes: Uint8Array, offset: number): number {
	return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

export function readUint32(bytes: Uint8Array, offset: number): number {
	return (
		(bytes[offset]! * 0x1000000 +
			((bytes[offset + 1]! << 16) |
				(bytes[offset + 2]! << 8) |
				bytes[offset + 3]!)) >>
		0
	);
}

export function writeUint32(
	bytes: Uint8Array,
	offset: number,
	value: number,
): void {
	bytes[offset] = (value >>> 24) & 0xff;
	bytes[offset + 1] = (value >>> 16) & 0xff;
	bytes[offset + 2] = (value >>> 8) & 0xff;
	bytes[offset + 3] = value & 0xff;
}

export function concatenateBytes(parts: readonly Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const result = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

export function captureMindMapExportError(
	callback: () => unknown,
): MindMapExportError {
	try {
		callback();
	} catch (error: unknown) {
		if (error instanceof MindMapExportError) {
			return error;
		}
		throw error;
	}
	throw new Error("Expected a MindMapExportError.");
}
