import {
	inspectImportArchive,
	openImportArchive,
} from "./archive";
import {
	DEFAULT_MIND_MAP_IMPORT_LIMITS,
	MindMapImportError,
	assertImportInputWithinLimits,
	assertImportedTopicPosition,
	requireImportedText,
	type ImportedMindMapTopic,
	type ImportedMindMapWorkbook,
	type MindMapImportAdapter,
	type MindMapImportDiagnostic,
	type MindMapImportInput,
	type MindMapImportLimits,
} from "./types";

const MINDMEISTER_CONTENT_ENTRY = "map.json";
const MINDMEISTER_ALLOWED_ENTRIES = new Set([MINDMEISTER_CONTENT_ENTRY]);
const UNSUPPORTED_NODE_KEYS = new Set([
	"note",
	"notes",
	"icon",
	"icons",
	"image",
	"attachment",
	"attachments",
	"link",
	"links",
	"style",
	"position",
]);

interface MutableImportedTopic {
	id: string;
	text: string;
	taskState: ImportedMindMapTopic["taskState"];
	children: MutableImportedTopic[];
}

interface MindMeisterTopicWorkItem {
	readonly record: Record<string, unknown>;
	readonly target: MutableImportedTopic;
	readonly fallbackId: string;
	readonly depth: number;
}

export const MINDMEISTER_IMPORT_ADAPTER: MindMapImportAdapter = Object.freeze({
	id: "mindmeister",
	label: "MindMeister",
	extensions: ["mind"],
	sniff(input: MindMapImportInput): number {
		try {
			const entries = inspectImportArchive(
				input.bytes,
				DEFAULT_MIND_MAP_IMPORT_LIMITS,
			);
			return entries.some(({ name }) => name === MINDMEISTER_CONTENT_ENTRY)
				? 100
				: extensionOf(input.name) === "mind"
					? 20
					: 0;
		} catch {
			return 0;
		}
	},
	parse(
		input: MindMapImportInput,
		limits: MindMapImportLimits = DEFAULT_MIND_MAP_IMPORT_LIMITS,
	) {
		return parseMindMeisterImport(input, limits);
	},
});

export function parseMindMeisterImport(
	input: MindMapImportInput,
	limits: MindMapImportLimits = DEFAULT_MIND_MAP_IMPORT_LIMITS,
): ImportedMindMapWorkbook {
	assertImportInputWithinLimits(input, limits);
	const archive = openImportArchive(
		input.bytes,
		MINDMEISTER_ALLOWED_ENTRIES,
		limits,
	);
	const source = archive.readText(MINDMEISTER_CONTENT_ENTRY);
	if (source === null) {
		throw new MindMapImportError(
			"missing-content",
			"MindMeister archive does not contain map.json.",
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch (error: unknown) {
		throw new MindMapImportError(
			"invalid-json",
			"MindMeister map.json is malformed.",
			error,
		);
	}
	const document = requireRecord(parsed, "MindMeister map.json");
	const rootRecord = resolveMindMeisterRoot(document);
	if (rootRecord === null) {
		throw new MindMapImportError(
			"empty-workbook",
			"MindMeister map does not contain a root topic.",
		);
	}
	const diagnostics: MindMapImportDiagnostic[] = [];
	const root = convertMindMeisterTopic(
		rootRecord,
		"root",
		limits,
		diagnostics,
	);
	const sheetTitle = optionalString(document.title) ?? root.text;
	return {
		format: "mindmeister",
		sourceName: input.name,
		sheets: [
			{
				id: optionalString(document.id) ?? optionalString(document.map_id) ?? "map",
				title: requireImportedText(sheetTitle, "MindMeister map", limits),
				root,
			},
		],
		diagnostics,
	};
}

function resolveMindMeisterRoot(
	document: Record<string, unknown>,
): Record<string, unknown> | null {
	if (isRecord(document.root)) {
		return document.root;
	}
	if (isRecord(document.map) && isRecord(document.map.root)) {
		return document.map.root;
	}
	return null;
}

function convertMindMeisterTopic(
	rootRecord: Record<string, unknown>,
	rootFallbackId: string,
	limits: MindMapImportLimits,
	diagnostics: MindMapImportDiagnostic[],
): ImportedMindMapTopic {
	const root = createMutableMindMeisterTopic();
	const pending: MindMeisterTopicWorkItem[] = [
		{
			record: rootRecord,
			target: root,
			fallbackId: rootFallbackId,
			depth: 0,
		},
	];
	let topicCount = 0;
	let reportedUnsupportedContent = false;
	while (pending.length > 0) {
		const current = pending.pop();
		if (current === undefined) {
			continue;
		}
		topicCount += 1;
		assertImportedTopicPosition(current.depth, topicCount, limits);
		const id = optionalString(current.record.id) ?? current.fallbackId;
		current.target.id = id;
		current.target.text = requireImportedText(
			current.record.title ?? current.record.text,
			"Untitled topic",
			limits,
		);
		current.target.taskState = resolveTaskState(current.record);
		if (
			!reportedUnsupportedContent &&
			Object.keys(current.record).some((key) =>
				UNSUPPORTED_NODE_KEYS.has(key),
			)
		) {
			reportedUnsupportedContent = true;
			diagnostics.push({
				severity: "warning",
				code: "mindmeister-presentation-omitted",
				message:
					"MindMeister notes, links, media, positions, and visual styling are not imported yet.",
				topicId: id,
			});
		}

		const children = normalizeChildren(current.record.children);
		const childWork: MindMeisterTopicWorkItem[] = [];
		for (let index = 0; index < children.length; index += 1) {
			const child = children[index];
			if (child === undefined) {
				continue;
			}
			const target = createMutableMindMeisterTopic();
			current.target.children.push(target);
			childWork.push({
				record: child,
				target,
				fallbackId: `${id}:${String(index)}`,
				depth: current.depth + 1,
			});
		}
		for (let index = childWork.length - 1; index >= 0; index -= 1) {
			pending.push(childWork[index]!);
		}
	}
	return root;
}

function createMutableMindMeisterTopic(): MutableImportedTopic {
	return {
		id: "pending",
		text: "Untitled topic",
		taskState: null,
		children: [],
	};
}

function normalizeChildren(value: unknown): readonly Record<string, unknown>[] {
	if (Array.isArray(value)) {
		return value.filter(isRecord);
	}
	if (isRecord(value)) {
		return Object.values(value).filter(isRecord);
	}
	return [];
}

function resolveTaskState(
	record: Record<string, unknown>,
): ImportedMindMapTopic["taskState"] {
	const value = record.task ?? record.completed ?? record.done;
	if (value === true || value === 1 || value === "done" || value === "completed") {
		return "checked";
	}
	if (value === false || value === 0 || value === "open" || value === "todo") {
		return "unchecked";
	}
	return null;
}

function requireRecord(
	value: unknown,
	label: string,
): Record<string, unknown> {
	if (!isRecord(value)) {
		throw new MindMapImportError("invalid-json", `${label} must be an object.`);
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function extensionOf(name: string): string {
	return name.toLowerCase().split(".").at(-1) ?? "";
}
