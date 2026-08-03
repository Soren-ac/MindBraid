import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
	hasZipSignature,
	inspectImportArchive,
	openImportArchive,
} from "../src/import/archive";
import {
	DEFAULT_MIND_MAP_IMPORT_LIMITS,
	MindMapImportError,
} from "../src/import/types";

describe("mind-map import archive", () => {
	it("reads only allow-listed UTF-8 entries", () => {
		const bytes = zipSync({
			"map.json": strToU8('{"root":{"title":"Map"}}'),
			"resources/image.png": new Uint8Array([1, 2, 3]),
		});
		const archive = openImportArchive(
			bytes,
			new Set(["map.json"]),
			DEFAULT_MIND_MAP_IMPORT_LIMITS,
		);

		expect(hasZipSignature(bytes)).toBe(true);
		expect(archive.readText("map.json")).toContain("Map");
		expect(archive.readBytes("resources/image.png")).toBeNull();
		expect(archive.entries).toHaveLength(2);
	});

	it("rejects path traversal before inflating entries", () => {
		const bytes = zipSync({ "../map.json": strToU8("{}") });

		expect(() =>
			inspectImportArchive(bytes, DEFAULT_MIND_MAP_IMPORT_LIMITS),
		).toThrow(MindMapImportError);
	});

	it("enforces entry-count and selected expanded-size limits", () => {
		const bytes = zipSync({
			"map.json": strToU8("x".repeat(64)),
			"other.json": strToU8("{}"),
		});

		expect(() =>
			inspectImportArchive(bytes, {
				...DEFAULT_MIND_MAP_IMPORT_LIMITS,
				maximumArchiveEntries: 1,
			}),
		).toThrow(/too many entries/i);
		expect(() =>
			openImportArchive(bytes, new Set(["map.json"]), {
				...DEFAULT_MIND_MAP_IMPORT_LIMITS,
				maximumArchiveEntryBytes: 10,
			}),
		).toThrow(/expanded-size limit/i);
	});

	it("rejects non-ZIP input", () => {
		const bytes = strToU8("not a zip");

		expect(hasZipSignature(bytes)).toBe(false);
		expect(() =>
			openImportArchive(
				bytes,
				new Set(["map.json"]),
				DEFAULT_MIND_MAP_IMPORT_LIMITS,
			),
		).toThrow(/not a ZIP archive/i);
	});

	it("rejects forged expanded sizes before retaining decompressed output", () => {
		const bytes = zipSync({
			"map.json": strToU8("x".repeat(1024 * 1024)),
		});
		const forged = bytes.slice();
		const centralOffset = findCentralEntry(forged, "map.json");
		const localOffset = readUint32(forged, centralOffset + 42);
		writeUint32(forged, centralOffset + 24, 1);
		if ((readUint16(forged, localOffset + 6) & 0x0008) === 0) {
			writeUint32(forged, localOffset + 22, 1);
		}

		expect(() =>
			openImportArchive(
				forged,
				new Set(["map.json"]),
				DEFAULT_MIND_MAP_IMPORT_LIMITS,
			),
		).toThrow(/unexpected size/i);
	});

	it("rejects an archive when even an unselected entry is encrypted", () => {
		const bytes = zipSync({
			"map.json": strToU8("{}"),
			"resources/image.png": new Uint8Array([1, 2, 3]),
		});
		const encrypted = bytes.slice();
		const centralOffset = findCentralEntry(
			encrypted,
			"resources/image.png",
		);
		const localOffset = readUint32(encrypted, centralOffset + 42);
		writeUint16(
			encrypted,
			centralOffset + 8,
			readUint16(encrypted, centralOffset + 8) | 0x0001,
		);
		writeUint16(
			encrypted,
			localOffset + 6,
			readUint16(encrypted, localOffset + 6) | 0x0001,
		);

		expect(() =>
			openImportArchive(
				encrypted,
				new Set(["map.json"]),
				DEFAULT_MIND_MAP_IMPORT_LIMITS,
			),
		).toThrow(/encrypted/i);
	});

	it("rejects trailing data that contradicts the EOCD comment length", () => {
		const bytes = zipSync({ "map.json": strToU8("{}") });
		const withTrailingData = new Uint8Array(bytes.byteLength + 4);
		withTrailingData.set(bytes);
		withTrailingData.set([1, 2, 3, 4], bytes.byteLength);

		expect(() =>
			inspectImportArchive(
				withTrailingData,
				DEFAULT_MIND_MAP_IMPORT_LIMITS,
			),
		).toThrow(/end-of-central-directory/i);
	});
});

function findCentralEntry(bytes: Uint8Array, name: string): number {
	const expectedName = strToU8(name);
	for (let offset = 0; offset + 46 <= bytes.byteLength; offset += 1) {
		if (readUint32(bytes, offset) !== 0x02014b50) {
			continue;
		}
		const nameLength = readUint16(bytes, offset + 28);
		if (nameLength !== expectedName.byteLength) {
			continue;
		}
		const actualName = bytes.subarray(offset + 46, offset + 46 + nameLength);
		if (actualName.every((value, index) => value === expectedName[index])) {
			return offset;
		}
	}
	throw new Error(`Could not find central entry ${name}.`);
}

function readUint16(bytes: Uint8Array, offset: number): number {
	return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
	return (
		(bytes[offset]! |
			(bytes[offset + 1]! << 8) |
			(bytes[offset + 2]! << 16) |
			(bytes[offset + 3]! << 24)) >>>
		0
	);
}

function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
	bytes[offset] = value & 0xff;
	bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
	bytes[offset] = value & 0xff;
	bytes[offset + 1] = (value >>> 8) & 0xff;
	bytes[offset + 2] = (value >>> 16) & 0xff;
	bytes[offset + 3] = (value >>> 24) & 0xff;
}
