export type MindMapImportFormat = "xmind" | "mindmeister" | "mindmanager";

export type MindMapImportTaskState = "checked" | "unchecked";

export type MindMapImportDiagnosticSeverity = "info" | "warning" | "error";

export interface MindMapImportDiagnostic {
	readonly severity: MindMapImportDiagnosticSeverity;
	readonly code: string;
	readonly message: string;
	readonly sheetId?: string;
	readonly topicId?: string;
}

/**
 * Framework-free semantic topic produced by a vendor adapter.
 *
 * Vendor geometry and styling intentionally stay out of this structure. Future
 * presentation import can consume separately validated hints without changing
 * the Markdown conversion contract.
 */
export interface ImportedMindMapTopic {
	readonly id: string;
	readonly text: string;
	readonly taskState: MindMapImportTaskState | null;
	readonly children: readonly ImportedMindMapTopic[];
}

export interface ImportedMindMapSheet {
	readonly id: string;
	readonly title: string;
	readonly root: ImportedMindMapTopic;
}

export interface ImportedMindMapWorkbook {
	readonly format: MindMapImportFormat;
	readonly sourceName: string;
	readonly sheets: readonly ImportedMindMapSheet[];
	readonly diagnostics: readonly MindMapImportDiagnostic[];
}

export interface MindMapImportInput {
	readonly name: string;
	readonly bytes: Uint8Array;
}

export interface MindMapImportLimits {
	readonly maximumInputBytes: number;
	readonly maximumArchiveEntries: number;
	readonly maximumArchiveEntryBytes: number;
	readonly maximumArchiveExpandedBytes: number;
	readonly maximumSheets: number;
	readonly maximumTopics: number;
	readonly maximumDepth: number;
	readonly maximumTextLength: number;
	readonly maximumXmlElements: number;
	readonly maximumXmlDepth: number;
	readonly maximumXmlAttributes: number;
}

export const DEFAULT_MIND_MAP_IMPORT_LIMITS: MindMapImportLimits =
	Object.freeze({
		maximumInputBytes: 50 * 1024 * 1024,
		maximumArchiveEntries: 4096,
		maximumArchiveEntryBytes: 16 * 1024 * 1024,
		maximumArchiveExpandedBytes: 128 * 1024 * 1024,
		maximumSheets: 128,
		maximumTopics: 50_000,
		maximumDepth: 512,
		maximumTextLength: 32_768,
		maximumXmlElements: 250_000,
		maximumXmlDepth: 2_048,
		maximumXmlAttributes: 1_000_000,
	});

export type MindMapImportErrorCode =
	| "unsupported-format"
	| "invalid-archive"
	| "encrypted-archive"
	| "unsafe-archive-path"
	| "duplicate-archive-entry"
	| "unsupported-compression"
	| "missing-content"
	| "invalid-json"
	| "invalid-xml"
	| "unsafe-xml"
	| "limit-exceeded"
	| "empty-workbook";

export class MindMapImportError extends Error {
	public constructor(
		public readonly code: MindMapImportErrorCode,
		message: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = "MindMapImportError";
	}
}

export interface MindMapImportAdapter {
	readonly id: MindMapImportFormat;
	readonly label: string;
	readonly extensions: readonly string[];
	/** Returns a confidence score from 0 (not recognized) to 100. */
	sniff(input: MindMapImportInput): number;
	parse(
		input: MindMapImportInput,
		limits?: MindMapImportLimits,
	): ImportedMindMapWorkbook;
}

export interface MindMapImportRegistry {
	readonly adapters: readonly MindMapImportAdapter[];
	resolve(input: MindMapImportInput): MindMapImportAdapter;
	parse(
		input: MindMapImportInput,
		limits?: MindMapImportLimits,
	): ImportedMindMapWorkbook;
}

export interface ImportedTopicTraversalState {
	readonly topicCount: number;
}

export function assertImportInputWithinLimits(
	input: MindMapImportInput,
	limits: MindMapImportLimits,
): void {
	if (input.bytes.byteLength > limits.maximumInputBytes) {
		throw new MindMapImportError(
			"limit-exceeded",
			`Import file exceeds the ${String(limits.maximumInputBytes)} byte limit.`,
		);
	}
}

export function requireImportedText(
	value: unknown,
	fallback: string,
	limits: MindMapImportLimits,
): string {
	const text = typeof value === "string" ? value.trim() : "";
	const resolved = text.length > 0 ? text : fallback;
	if (resolved.length > limits.maximumTextLength) {
		throw new MindMapImportError(
			"limit-exceeded",
			`Imported topic text exceeds the ${String(limits.maximumTextLength)} character limit.`,
		);
	}
	return resolved;
}

export function assertImportedTopicPosition(
	depth: number,
	topicCount: number,
	limits: MindMapImportLimits,
): void {
	if (depth > limits.maximumDepth) {
		throw new MindMapImportError(
			"limit-exceeded",
			`Imported topic depth exceeds the ${String(limits.maximumDepth)} level limit.`,
		);
	}
	if (topicCount > limits.maximumTopics) {
		throw new MindMapImportError(
			"limit-exceeded",
			`Imported workbook exceeds the ${String(limits.maximumTopics)} topic limit.`,
		);
	}
}
