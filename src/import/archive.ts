import { inflateSync } from "fflate";

import {
	MindMapImportError,
	type MindMapImportLimits,
} from "./types";

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const MAXIMUM_ZIP_COMMENT_BYTES = 0xffff;

export interface ImportArchiveEntryInfo {
	readonly name: string;
	readonly compressedBytes: number;
	readonly expandedBytes: number;
	readonly compression: number;
	readonly encrypted: boolean;
}

interface ParsedImportArchiveEntry extends ImportArchiveEntryInfo {
	readonly localHeaderOffset: number;
	readonly dataOffset: number;
}

export interface ImportArchive {
	readonly entries: readonly ImportArchiveEntryInfo[];
	has(name: string): boolean;
	readBytes(name: string): Uint8Array | null;
	readText(name: string): string | null;
}

export function hasZipSignature(bytes: Uint8Array): boolean {
	if (bytes.byteLength < 4) {
		return false;
	}
	const signature = readUint32(bytes, 0);
	return (
		signature === LOCAL_FILE_HEADER_SIGNATURE ||
		signature === END_OF_CENTRAL_DIRECTORY_SIGNATURE ||
		signature === DATA_DESCRIPTOR_SIGNATURE
	);
}

export function inspectImportArchive(
	bytes: Uint8Array,
	limits: MindMapImportLimits,
): readonly ImportArchiveEntryInfo[] {
	if (!hasZipSignature(bytes)) {
		throw new MindMapImportError("invalid-archive", "File is not a ZIP archive.");
	}
	return readCentralDirectory(bytes, limits);
}

/**
 * Opens a ZIP archive entirely in memory while retaining only explicitly
 * allow-listed entries. The central directory is validated before fflate is
 * allowed to inflate any content.
 */
export function openImportArchive(
	bytes: Uint8Array,
	allowedEntryNames: ReadonlySet<string>,
	limits: MindMapImportLimits,
): ImportArchive {
	if (!hasZipSignature(bytes)) {
		throw new MindMapImportError("invalid-archive", "File is not a ZIP archive.");
	}
	const entries = readCentralDirectory(bytes, limits);
	const encryptedEntry = entries.find(({ encrypted }) => encrypted);
	if (encryptedEntry !== undefined) {
		throw new MindMapImportError(
			"encrypted-archive",
			`Archive entry "${encryptedEntry.name}" is encrypted.`,
		);
	}
	const selectedNames = new Set(
		entries
			.map(({ name }) => name)
			.filter((name) => allowedEntryNames.has(name)),
	);
	let selectedExpandedBytes = 0;
	for (const entry of entries) {
		if (!selectedNames.has(entry.name)) {
			continue;
		}
		if (entry.compression !== 0 && entry.compression !== 8) {
			throw new MindMapImportError(
				"unsupported-compression",
				`Archive entry "${entry.name}" uses unsupported compression ${String(entry.compression)}.`,
			);
		}
		if (entry.expandedBytes > limits.maximumArchiveEntryBytes) {
			throw new MindMapImportError(
				"limit-exceeded",
				`Archive entry "${entry.name}" exceeds the expanded-size limit.`,
			);
		}
		selectedExpandedBytes += entry.expandedBytes;
	}
	if (selectedExpandedBytes > limits.maximumArchiveExpandedBytes) {
		throw new MindMapImportError(
			"limit-exceeded",
			"Selected archive content exceeds the expanded-size limit.",
		);
	}

	const decoded = new Map<string, Uint8Array>();
	let actualExpandedBytes = 0;
	for (const entry of entries) {
		if (!selectedNames.has(entry.name)) {
			continue;
		}
		const value = decompressSelectedEntry(bytes, entry, limits);
		actualExpandedBytes += value.byteLength;
		if (actualExpandedBytes > limits.maximumArchiveExpandedBytes) {
			throw new MindMapImportError(
				"limit-exceeded",
				"Selected archive content exceeds the expanded-size limit.",
			);
		}
		decoded.set(entry.name, value);
	}
	return {
		entries,
		has: (name) => decoded.has(name),
		readBytes(name) {
			const value = decoded.get(name);
			return value === undefined ? null : value.slice();
		},
		readText(name) {
			const value = decoded.get(name);
			if (value === undefined) {
				return null;
			}
			try {
				return new TextDecoder("utf-8", { fatal: true }).decode(value);
			} catch (error: unknown) {
				throw new MindMapImportError(
					"invalid-archive",
					`Archive entry "${name}" is not valid UTF-8 text.`,
					error,
				);
			}
		},
	};
}

function readCentralDirectory(
	bytes: Uint8Array,
	limits: MindMapImportLimits,
): readonly ParsedImportArchiveEntry[] {
	const endOffset = findEndOfCentralDirectory(bytes);
	const diskNumber = readUint16(bytes, endOffset + 4);
	const centralDirectoryDisk = readUint16(bytes, endOffset + 6);
	const entriesOnDisk = readUint16(bytes, endOffset + 8);
	const entryCount = readUint16(bytes, endOffset + 10);
	const centralDirectoryBytes = readUint32(bytes, endOffset + 12);
	const centralDirectoryOffset = readUint32(bytes, endOffset + 16);
	if (
		diskNumber !== 0 ||
		centralDirectoryDisk !== 0 ||
		entriesOnDisk !== entryCount
	) {
		throw new MindMapImportError(
			"invalid-archive",
			"Multi-disk ZIP mind-map archives are not supported.",
		);
	}
	if (
		entryCount === 0xffff ||
		centralDirectoryBytes === 0xffffffff ||
		centralDirectoryOffset === 0xffffffff
	) {
		throw new MindMapImportError(
			"invalid-archive",
			"ZIP64 mind-map archives are not supported.",
		);
	}
	if (entryCount > limits.maximumArchiveEntries) {
		throw new MindMapImportError(
			"limit-exceeded",
			"Archive contains too many entries.",
		);
	}
	if (
		centralDirectoryOffset + centralDirectoryBytes !== endOffset ||
		centralDirectoryOffset > endOffset
	) {
		throw new MindMapImportError(
			"invalid-archive",
			"Archive central directory is outside the input buffer.",
		);
	}

	const entries: ParsedImportArchiveEntry[] = [];
	const names = new Set<string>();
	let offset = centralDirectoryOffset;
	for (let index = 0; index < entryCount; index += 1) {
		if (
			offset + 46 > bytes.byteLength ||
			readUint32(bytes, offset) !== CENTRAL_DIRECTORY_SIGNATURE
		) {
			throw new MindMapImportError(
				"invalid-archive",
				"Archive central directory is malformed.",
			);
		}
		const flags = readUint16(bytes, offset + 8);
		const compression = readUint16(bytes, offset + 10);
		const crc32 = readUint32(bytes, offset + 16);
		const compressedBytes = readUint32(bytes, offset + 20);
		const expandedBytes = readUint32(bytes, offset + 24);
		const nameLength = readUint16(bytes, offset + 28);
		const extraLength = readUint16(bytes, offset + 30);
		const commentLength = readUint16(bytes, offset + 32);
		const diskStart = readUint16(bytes, offset + 34);
		const localHeaderOffset = readUint32(bytes, offset + 42);
		const end = offset + 46 + nameLength + extraLength + commentLength;
		if (end > bytes.byteLength) {
			throw new MindMapImportError(
				"invalid-archive",
				"Archive entry metadata is truncated.",
			);
		}
		if (
			compressedBytes === 0xffffffff ||
			expandedBytes === 0xffffffff ||
			localHeaderOffset === 0xffffffff
		) {
			throw new MindMapImportError(
				"invalid-archive",
				"ZIP64 mind-map archive entries are not supported.",
			);
		}
		if (diskStart !== 0) {
			throw new MindMapImportError(
				"invalid-archive",
				"Multi-disk ZIP mind-map archives are not supported.",
			);
		}
		const rawName = bytes.subarray(offset + 46, offset + 46 + nameLength);
		let name: string;
		try {
			name = new TextDecoder("utf-8", { fatal: true }).decode(
				rawName,
			);
		} catch (error: unknown) {
			throw new MindMapImportError(
				"invalid-archive",
				"Archive contains an invalid UTF-8 entry name.",
				error,
			);
		}
		validateArchiveEntryName(name);
		if (names.has(name)) {
			throw new MindMapImportError(
				"duplicate-archive-entry",
				`Archive contains duplicate entry "${name}".`,
			);
		}
		names.add(name);
		const dataOffset = validateLocalFileHeader(bytes, {
			name,
			rawName,
			flags,
			compression,
			crc32,
			compressedBytes,
			expandedBytes,
			localHeaderOffset,
			centralDirectoryOffset,
		});
		entries.push({
			name,
			compressedBytes,
			expandedBytes,
			compression,
			encrypted: (flags & 0x0001) !== 0,
			localHeaderOffset,
			dataOffset,
		});
		offset = end;
	}
	assertNonOverlappingLocalEntries(entries);
	return entries;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
	const minimumOffset = Math.max(0, bytes.byteLength - 22 - MAXIMUM_ZIP_COMMENT_BYTES);
	for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset -= 1) {
		if (
			readUint32(bytes, offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE &&
			offset + 22 + readUint16(bytes, offset + 20) === bytes.byteLength
		) {
			return offset;
		}
	}
	throw new MindMapImportError(
		"invalid-archive",
		"Archive end-of-central-directory record is missing.",
	);
}

function validateArchiveEntryName(name: string): void {
	if (
		name.length === 0 ||
		name.includes("\0") ||
		name.startsWith("/") ||
		name.includes("\\") ||
		name.split("/").some((segment) => segment === "..")
	) {
		throw new MindMapImportError(
			"unsafe-archive-path",
			`Archive entry path "${name}" is unsafe.`,
		);
	}
}

function validateLocalFileHeader(
	bytes: Uint8Array,
	entry: {
		readonly name: string;
		readonly rawName: Uint8Array;
		readonly flags: number;
		readonly compression: number;
		readonly crc32: number;
		readonly compressedBytes: number;
		readonly expandedBytes: number;
		readonly localHeaderOffset: number;
		readonly centralDirectoryOffset: number;
	},
): number {
	const offset = entry.localHeaderOffset;
	if (
		offset + 30 > entry.centralDirectoryOffset ||
		readUint32(bytes, offset) !== LOCAL_FILE_HEADER_SIGNATURE
	) {
		throw new MindMapImportError(
			"invalid-archive",
			`Archive entry "${entry.name}" has an invalid local header.`,
		);
	}
	const localFlags = readUint16(bytes, offset + 6);
	const localCompression = readUint16(bytes, offset + 8);
	const localCrc32 = readUint32(bytes, offset + 14);
	const localCompressedBytes = readUint32(bytes, offset + 18);
	const localExpandedBytes = readUint32(bytes, offset + 22);
	const localNameLength = readUint16(bytes, offset + 26);
	const localExtraLength = readUint16(bytes, offset + 28);
	const localNameStart = offset + 30;
	const localNameEnd = localNameStart + localNameLength;
	const dataOffset = localNameEnd + localExtraLength;
	const dataEnd = dataOffset + entry.compressedBytes;
	if (
		localFlags !== entry.flags ||
		localCompression !== entry.compression ||
		localNameLength !== entry.rawName.byteLength ||
		localNameEnd > entry.centralDirectoryOffset ||
		dataOffset > entry.centralDirectoryOffset ||
		dataEnd > entry.centralDirectoryOffset ||
		!equalBytes(bytes.subarray(localNameStart, localNameEnd), entry.rawName)
	) {
		throw new MindMapImportError(
			"invalid-archive",
			`Archive entry "${entry.name}" disagrees with its central-directory record.`,
		);
	}
	const usesDataDescriptor = (entry.flags & 0x0008) !== 0;
	if (
		usesDataDescriptor
			? (localCrc32 !== 0 && localCrc32 !== entry.crc32) ||
				(localCompressedBytes !== 0 &&
					localCompressedBytes !== entry.compressedBytes) ||
				(localExpandedBytes !== 0 &&
					localExpandedBytes !== entry.expandedBytes)
			: localCrc32 !== entry.crc32 ||
				localCompressedBytes !== entry.compressedBytes ||
				localExpandedBytes !== entry.expandedBytes
	) {
		throw new MindMapImportError(
			"invalid-archive",
			`Archive entry "${entry.name}" has inconsistent size or checksum metadata.`,
		);
	}
	return dataOffset;
}

function assertNonOverlappingLocalEntries(
	entries: readonly ParsedImportArchiveEntry[],
): void {
	const ordered = [...entries].sort(
		(left, right) => left.localHeaderOffset - right.localHeaderOffset,
	);
	let previousEnd = -1;
	for (const entry of ordered) {
		if (entry.localHeaderOffset < previousEnd) {
			throw new MindMapImportError(
				"invalid-archive",
				"Archive local file records overlap.",
			);
		}
		previousEnd = entry.dataOffset + entry.compressedBytes;
	}
}

function decompressSelectedEntry(
	bytes: Uint8Array,
	entry: ParsedImportArchiveEntry,
	limits: MindMapImportLimits,
): Uint8Array {
	const compressed = bytes.subarray(
		entry.dataOffset,
		entry.dataOffset + entry.compressedBytes,
	);
	if (entry.compression === 0) {
		if (entry.compressedBytes !== entry.expandedBytes) {
			throw new MindMapImportError(
				"invalid-archive",
				`Stored archive entry "${entry.name}" has inconsistent sizes.`,
			);
		}
		return compressed.slice();
	}

	let inflated: Uint8Array;
	try {
		inflated = inflateSync(compressed, {
			out: new Uint8Array(entry.expandedBytes + 1),
		});
	} catch (error: unknown) {
		throw new MindMapImportError(
			"invalid-archive",
			`Could not decompress archive entry "${entry.name}".`,
			error,
		);
	}
	if (
		inflated.byteLength !== entry.expandedBytes ||
		inflated.byteLength > limits.maximumArchiveEntryBytes
	) {
		throw new MindMapImportError(
			"invalid-archive",
			`Archive entry "${entry.name}" expanded to an unexpected size.`,
		);
	}
	return inflated.slice();
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
	if (left.byteLength !== right.byteLength) {
		return false;
	}
	for (let index = 0; index < left.byteLength; index += 1) {
		if (left[index] !== right[index]) {
			return false;
		}
	}
	return true;
}

function readUint16(bytes: Uint8Array, offset: number): number {
	if (offset < 0 || offset + 2 > bytes.byteLength) {
		return -1;
	}
	return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
	if (offset < 0 || offset + 4 > bytes.byteLength) {
		return -1;
	}
	return (
		(bytes[offset]! |
			(bytes[offset + 1]! << 8) |
			(bytes[offset + 2]! << 16) |
			(bytes[offset + 3]! << 24)) >>>
		0
	);
}
