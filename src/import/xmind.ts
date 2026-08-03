import {
	inspectImportArchive,
	openImportArchive,
	type ImportArchive,
} from "./archive";
import {
	DEFAULT_MIND_MAP_IMPORT_LIMITS,
	MindMapImportError,
	assertImportInputWithinLimits,
	assertImportedTopicPosition,
	requireImportedText,
	type ImportedMindMapSheet,
	type ImportedMindMapTopic,
	type ImportedMindMapWorkbook,
	type MindMapImportAdapter,
	type MindMapImportDiagnostic,
	type MindMapImportInput,
	type MindMapImportLimits,
	type MindMapImportTaskState,
} from "./types";
import {
	getDirectChildrenByLocalName,
	getElementsByLocalName,
	parseImportXml,
} from "./xml";

const XMIND_CONTENT_JSON = "content.json";
const XMIND_CONTENT_XML = "content.xml";
const XMIND_MANIFEST_JSON = "manifest.json";
const XMIND_MANIFEST_XML = "META-INF/manifest.xml";
const XMIND_STYLES_JSON = "styles.json";
const XMIND_STYLES_XML = "styles.xml";

const XMIND_READABLE_ARCHIVE_ENTRIES = new Set<string>([
	XMIND_CONTENT_JSON,
	XMIND_CONTENT_XML,
	XMIND_MANIFEST_JSON,
	XMIND_MANIFEST_XML,
]);

const TASK_START_MARKER = "task-start";
const TASK_DONE_MARKER = "task-done";

type JsonRecord = Record<string, unknown>;

interface MutableImportedTopic {
	id: string;
	text: string;
	taskState: MindMapImportTaskState | null;
	children: MutableImportedTopic[];
}

interface ImportBuilder {
	readonly limits: MindMapImportLimits;
	readonly diagnostics: MindMapImportDiagnostic[];
	readonly emittedDiagnosticKeys: Set<string>;
	topicCount: number;
	nextGeneratedTopicId: number;
}

interface JsonTopicWorkItem {
	readonly source: JsonRecord;
	readonly target: MutableImportedTopic | null;
	readonly depth: number;
	readonly fallbackText: string;
}

interface XmlTopicWorkItem {
	readonly source: Element;
	readonly target: MutableImportedTopic | null;
	readonly depth: number;
	readonly fallbackText: string;
}

interface MarkerInspection {
	readonly present: boolean;
	readonly malformed: boolean;
	readonly ids: readonly string[];
}

/**
 * Reads the two native XMind archive families without accepting presentation
 * data as Markdown semantics. The adapter intentionally imports only the
 * attached topic tree and an unambiguous binary task marker.
 */
export const XMIND_IMPORT_ADAPTER: MindMapImportAdapter = Object.freeze({
	id: "xmind",
	label: "XMind",
	extensions: ["xmind"],
	sniff(input: MindMapImportInput): number {
		try {
			const entries = inspectImportArchive(
				input.bytes,
				DEFAULT_MIND_MAP_IMPORT_LIMITS,
			);
			if (
				entries.some(
					({ name }) =>
						name === XMIND_CONTENT_JSON || name === XMIND_CONTENT_XML,
				)
			) {
				return 100;
			}
			return extensionOf(input.name) === "xmind" ? 20 : 0;
		} catch {
			return 0;
		}
	},
	parse(
		input: MindMapImportInput,
		limits: MindMapImportLimits = DEFAULT_MIND_MAP_IMPORT_LIMITS,
	) {
		return parseXMindImport(input, limits);
	},
});

export function parseXMindImport(
	input: MindMapImportInput,
	limits: MindMapImportLimits = DEFAULT_MIND_MAP_IMPORT_LIMITS,
): ImportedMindMapWorkbook {
	assertImportInputWithinLimits(input, limits);
	const builder = createImportBuilder(limits);
	const archive = openImportArchive(
		input.bytes,
		XMIND_READABLE_ARCHIVE_ENTRIES,
		limits,
	);
	inspectManifestEncryption(archive, builder);
	if (
		archive.entries.some(
			({ name }) => name === XMIND_STYLES_JSON || name === XMIND_STYLES_XML,
		)
	) {
		emitDiagnostic(
			builder,
			"xmind-styles-omitted",
			"XMind styles, themes, and layout choices were not imported.",
		);
	}

	const json = archive.readText(XMIND_CONTENT_JSON);
	if (json !== null) {
		return parseJsonWorkbook(json, input.name, builder);
	}

	const xml = archive.readText(XMIND_CONTENT_XML);
	if (xml !== null) {
		return parseXmlWorkbook(xml, input.name, builder);
	}

	throw new MindMapImportError(
		"missing-content",
		"The XMind archive does not contain content.json or content.xml.",
	);
}

function createImportBuilder(limits: MindMapImportLimits): ImportBuilder {
	return {
		limits,
		diagnostics: [],
		emittedDiagnosticKeys: new Set<string>(),
		topicCount: 0,
		nextGeneratedTopicId: 1,
	};
}

function parseJsonWorkbook(
	source: string,
	sourceName: string,
	builder: ImportBuilder,
): ImportedMindMapWorkbook {
	let rawWorkbook: unknown;
	try {
		rawWorkbook = JSON.parse(source) as unknown;
	} catch (error: unknown) {
		throw new MindMapImportError(
			"invalid-json",
			"XMind content.json is not valid JSON.",
			error,
		);
	}
	if (!Array.isArray(rawWorkbook)) {
		throw new MindMapImportError(
			"invalid-json",
			"XMind content.json must contain an array of sheets.",
		);
	}
	if (rawWorkbook.length === 0) {
		throw new MindMapImportError(
			"empty-workbook",
			"The XMind workbook does not contain any sheets.",
		);
	}
	if (rawWorkbook.length > builder.limits.maximumSheets) {
		throw new MindMapImportError(
			"limit-exceeded",
			`Imported workbook exceeds the ${String(builder.limits.maximumSheets)} sheet limit.`,
		);
	}

	const sheets: ImportedMindMapSheet[] = [];
	for (let index = 0; index < rawWorkbook.length; index += 1) {
		const rawSheet = requireJsonRecord(
			rawWorkbook[index],
			"XMind content.json contains an invalid sheet.",
		);
		const sheetId = importIdentifier(
			rawSheet.id,
			`xmind-sheet-${String(index + 1)}`,
			builder.limits,
		);
		const provisionalTitle = requireImportedText(
			rawSheet.title,
			`Sheet ${String(index + 1)}`,
			builder.limits,
		);
		inspectJsonSheetFeatures(rawSheet, sheetId, builder);
		const rawRoot = requireJsonRecord(
			rawSheet.rootTopic,
			`XMind sheet "${sheetId}" does not contain a valid root topic.`,
		);
		const root = importJsonTopicTree(
			rawRoot,
			sheetId,
			provisionalTitle,
			builder,
		);
		sheets.push({
			id: sheetId,
			title: requireImportedText(
				rawSheet.title,
				root.text,
				builder.limits,
			),
			root,
		});
	}

	return createWorkbook(sourceName, sheets, builder);
}

function parseXmlWorkbook(
	source: string,
	sourceName: string,
	builder: ImportBuilder,
): ImportedMindMapWorkbook {
	const document = parseImportXml(source, builder.limits);
	const rootElement = document.documentElement;
	if (rootElement === null || rootElement.localName !== "xmap-content") {
		throw new MindMapImportError(
			"invalid-xml",
			"XMind content.xml does not contain an xmap-content root element.",
		);
	}
	const rawSheets = getDirectChildrenByLocalName(rootElement, "sheet");
	if (rawSheets.length === 0) {
		throw new MindMapImportError(
			"empty-workbook",
			"The XMind workbook does not contain any sheets.",
		);
	}
	if (rawSheets.length > builder.limits.maximumSheets) {
		throw new MindMapImportError(
			"limit-exceeded",
			`Imported workbook exceeds the ${String(builder.limits.maximumSheets)} sheet limit.`,
		);
	}

	const sheets: ImportedMindMapSheet[] = [];
	for (let index = 0; index < rawSheets.length; index += 1) {
		const rawSheet = rawSheets[index]!;
		const sheetId = importIdentifier(
			rawSheet.getAttribute("id"),
			`xmind-sheet-${String(index + 1)}`,
			builder.limits,
		);
		const provisionalTitle = requireImportedText(
			getDirectChildText(rawSheet, "title"),
			`Sheet ${String(index + 1)}`,
			builder.limits,
		);
		inspectXmlSheetFeatures(rawSheet, sheetId, builder);
		const rawRoot = getDirectChildrenByLocalName(rawSheet, "topic")[0];
		if (rawRoot === undefined) {
			throw new MindMapImportError(
				"invalid-xml",
				`XMind sheet "${sheetId}" does not contain a root topic.`,
			);
		}
		const root = importXmlTopicTree(
			rawRoot,
			sheetId,
			provisionalTitle,
			builder,
		);
		sheets.push({
			id: sheetId,
			title: requireImportedText(
				getDirectChildText(rawSheet, "title"),
				root.text,
				builder.limits,
			),
			root,
		});
	}

	return createWorkbook(sourceName, sheets, builder);
}

function createWorkbook(
	sourceName: string,
	sheets: readonly ImportedMindMapSheet[],
	builder: ImportBuilder,
): ImportedMindMapWorkbook {
	if (sheets.length === 0) {
		throw new MindMapImportError(
			"empty-workbook",
			"The XMind workbook does not contain any importable sheets.",
		);
	}
	return {
		format: "xmind",
		sourceName,
		sheets,
		diagnostics: builder.diagnostics,
	};
}

function importJsonTopicTree(
	rootSource: JsonRecord,
	sheetId: string,
	rootFallbackText: string,
	builder: ImportBuilder,
): ImportedMindMapTopic {
	const root = createMutableTopic(builder);
	reserveTopicPosition(0, builder);
	const stack: JsonTopicWorkItem[] = [
		{
			source: rootSource,
			target: root,
			depth: 0,
			fallbackText: rootFallbackText,
		},
	];

	while (stack.length > 0) {
		const current = stack.pop()!;
		const rawTopicId = importIdentifier(
			current.source.id,
			current.target?.id ?? createGeneratedTopicId(builder),
			builder.limits,
		);
		const taskState = inspectJsonTopicFeatures(
			current.source,
			sheetId,
			rawTopicId,
			builder,
		);
		if (current.target !== null) {
			current.target.id = rawTopicId;
			current.target.text = requireImportedText(
				current.source.title,
				current.fallbackText,
				builder.limits,
			);
			current.target.taskState = taskState;
		}

		const children = readOptionalJsonRecord(
			current.source.children,
			"XMind topic children must be an object.",
		);
		if (children === null) {
			continue;
		}
		const attached = readJsonTopicArray(children, "attached");
		const detached = readJsonTopicArray(children, "detached");
		const summaries = readJsonTopicArray(children, "summary");
		if (detached.length > 0) {
			emitDiagnostic(
				builder,
				"xmind-detached-topics-omitted",
				"Detached XMind topics were not imported because Markdown has no equivalent tree relationship.",
				sheetId,
				rawTopicId,
			);
		}
		if (summaries.length > 0) {
			emitDiagnostic(
				builder,
				"xmind-summaries-omitted",
				"XMind summary topics were not imported because summaries are not yet rendered by MindBraid.",
				sheetId,
				rawTopicId,
			);
		}

		pushJsonChildren(
			stack,
			attached,
			current.target,
			current.depth + 1,
			builder,
		);
	}

	return root;
}

function pushJsonChildren(
	stack: JsonTopicWorkItem[],
	children: readonly JsonRecord[],
	parent: MutableImportedTopic | null,
	depth: number,
	builder: ImportBuilder,
): void {
	const work: JsonTopicWorkItem[] = [];
	for (const childSource of children) {
		reserveTopicPosition(depth, builder);
		const target = parent === null ? null : createMutableTopic(builder);
		if (target !== null && parent !== null) {
			parent.children.push(target);
		}
		work.push({
			source: childSource,
			target,
			depth,
			fallbackText: "Untitled topic",
		});
	}
	for (let index = work.length - 1; index >= 0; index -= 1) {
		stack.push(work[index]!);
	}
}

function importXmlTopicTree(
	rootSource: Element,
	sheetId: string,
	rootFallbackText: string,
	builder: ImportBuilder,
): ImportedMindMapTopic {
	const root = createMutableTopic(builder);
	reserveTopicPosition(0, builder);
	const stack: XmlTopicWorkItem[] = [
		{
			source: rootSource,
			target: root,
			depth: 0,
			fallbackText: rootFallbackText,
		},
	];

	while (stack.length > 0) {
		const current = stack.pop()!;
		const rawTopicId = importIdentifier(
			current.source.getAttribute("id"),
			current.target?.id ?? createGeneratedTopicId(builder),
			builder.limits,
		);
		const taskState = inspectXmlTopicFeatures(
			current.source,
			sheetId,
			rawTopicId,
			builder,
		);
		if (current.target !== null) {
			current.target.id = rawTopicId;
			current.target.text = requireImportedText(
				getDirectChildText(current.source, "title"),
				current.fallbackText,
				builder.limits,
			);
			current.target.taskState = taskState;
		}

		const descendants = getXmlTopicDescendants(current.source);
		if (descendants.detached.length > 0) {
			emitDiagnostic(
				builder,
				"xmind-detached-topics-omitted",
				"Detached XMind topics were not imported because Markdown has no equivalent tree relationship.",
				sheetId,
				rawTopicId,
			);
		}
		if (descendants.summary.length > 0) {
			emitDiagnostic(
				builder,
				"xmind-summaries-omitted",
				"XMind summary topics were not imported because summaries are not yet rendered by MindBraid.",
				sheetId,
				rawTopicId,
			);
		}

		pushXmlChildren(
			stack,
			descendants.attached,
			current.target,
			current.depth + 1,
			builder,
		);
	}

	return root;
}

function pushXmlChildren(
	stack: XmlTopicWorkItem[],
	children: readonly Element[],
	parent: MutableImportedTopic | null,
	depth: number,
	builder: ImportBuilder,
): void {
	const work: XmlTopicWorkItem[] = [];
	for (const childSource of children) {
		reserveTopicPosition(depth, builder);
		const target = parent === null ? null : createMutableTopic(builder);
		if (target !== null && parent !== null) {
			parent.children.push(target);
		}
		work.push({
			source: childSource,
			target,
			depth,
			fallbackText: "Untitled topic",
		});
	}
	for (let index = work.length - 1; index >= 0; index -= 1) {
		stack.push(work[index]!);
	}
}

function getXmlTopicDescendants(source: Element): {
	readonly attached: readonly Element[];
	readonly detached: readonly Element[];
	readonly summary: readonly Element[];
} {
	const attached: Element[] = [];
	const detached: Element[] = [];
	const summary: Element[] = [];
	for (const childrenElement of getDirectChildrenByLocalName(source, "children")) {
		for (const topicsElement of getDirectChildrenByLocalName(
			childrenElement,
			"topics",
		)) {
			const topics = getDirectChildrenByLocalName(topicsElement, "topic");
			switch (topicsElement.getAttribute("type")) {
				case "attached":
					attached.push(...topics);
					break;
				case "detached":
					detached.push(...topics);
					break;
				case "summary":
					summary.push(...topics);
					break;
			}
		}
	}
	return { attached, detached, summary };
}

function inspectJsonSheetFeatures(
	sheet: JsonRecord,
	sheetId: string,
	builder: ImportBuilder,
): void {
	if (hasMeaningfulJsonValue(sheet, "relationships")) {
		emitDiagnostic(
			builder,
			"xmind-relationships-omitted",
			"XMind relationships were not imported because relationship rendering is not yet available.",
			sheetId,
		);
	}
	if (hasJsonStyleOrLayout(sheet)) {
		emitDiagnostic(
			builder,
			"xmind-styles-omitted",
			"XMind styles, themes, and layout choices were not imported.",
			sheetId,
		);
	}
}

function inspectJsonTopicFeatures(
	topic: JsonRecord,
	sheetId: string,
	topicId: string,
	builder: ImportBuilder,
): MindMapImportTaskState | null {
	if (hasMeaningfulJsonValue(topic, "notes")) {
		emitDiagnostic(
			builder,
			"xmind-notes-omitted",
			"XMind topic notes were not imported because Markdown topic bodies are not represented by MindBraid's tree model.",
			sheetId,
			topicId,
		);
	}
	if (hasMeaningfulJsonValue(topic, "labels")) {
		emitDiagnostic(
			builder,
			"xmind-labels-omitted",
			"XMind topic labels were not imported.",
			sheetId,
			topicId,
		);
	}
	if (hasMeaningfulJsonValue(topic, "image")) {
		emitDiagnostic(
			builder,
			"xmind-images-omitted",
			"XMind topic images and attachments were not imported.",
			sheetId,
			topicId,
		);
	}
	if (hasMeaningfulJsonValue(topic, "boundaries")) {
		emitDiagnostic(
			builder,
			"xmind-boundaries-omitted",
			"XMind boundaries were not imported because boundary rendering is not yet available.",
			sheetId,
			topicId,
		);
	}
	if (hasMeaningfulJsonValue(topic, "summaries")) {
		emitDiagnostic(
			builder,
			"xmind-summaries-omitted",
			"XMind summaries were not imported because summary rendering is not yet available.",
			sheetId,
			topicId,
		);
	}
	if (hasJsonStyleOrLayout(topic)) {
		emitDiagnostic(
			builder,
			"xmind-styles-omitted",
			"XMind styles, themes, and layout choices were not imported.",
			sheetId,
			topicId,
		);
	}

	const markers = getJsonMarkerInspection(topic);
	return resolveTaskMarker(
		markers,
		sheetId,
		topicId,
		builder,
	);
}

function inspectXmlSheetFeatures(
	sheet: Element,
	sheetId: string,
	builder: ImportBuilder,
): void {
	if (getDirectChildrenByLocalName(sheet, "relationships").length > 0) {
		emitDiagnostic(
			builder,
			"xmind-relationships-omitted",
			"XMind relationships were not imported because relationship rendering is not yet available.",
			sheetId,
		);
	}
	if (hasXmlStyleOrLayout(sheet)) {
		emitDiagnostic(
			builder,
			"xmind-styles-omitted",
			"XMind styles, themes, and layout choices were not imported.",
			sheetId,
		);
	}
}

function inspectXmlTopicFeatures(
	topic: Element,
	sheetId: string,
	topicId: string,
	builder: ImportBuilder,
): MindMapImportTaskState | null {
	if (getDirectChildrenByLocalName(topic, "notes").length > 0) {
		emitDiagnostic(
			builder,
			"xmind-notes-omitted",
			"XMind topic notes were not imported because Markdown topic bodies are not represented by MindBraid's tree model.",
			sheetId,
			topicId,
		);
	}
	if (getDirectChildrenByLocalName(topic, "labels").length > 0) {
		emitDiagnostic(
			builder,
			"xmind-labels-omitted",
			"XMind topic labels were not imported.",
			sheetId,
			topicId,
		);
	}
	if (getDirectChildrenByLocalName(topic, "image").length > 0) {
		emitDiagnostic(
			builder,
			"xmind-images-omitted",
			"XMind topic images and attachments were not imported.",
			sheetId,
			topicId,
		);
	}
	if (
		getDirectChildrenByLocalName(topic, "boundaries").length > 0 ||
		getDirectChildrenByLocalName(topic, "boundary").length > 0
	) {
		emitDiagnostic(
			builder,
			"xmind-boundaries-omitted",
			"XMind boundaries were not imported because boundary rendering is not yet available.",
			sheetId,
			topicId,
		);
	}
	if (
		getDirectChildrenByLocalName(topic, "summaries").length > 0 ||
		getDirectChildrenByLocalName(topic, "summary").length > 0
	) {
		emitDiagnostic(
			builder,
			"xmind-summaries-omitted",
			"XMind summaries were not imported because summary rendering is not yet available.",
			sheetId,
			topicId,
		);
	}
	if (hasXmlStyleOrLayout(topic)) {
		emitDiagnostic(
			builder,
			"xmind-styles-omitted",
			"XMind styles, themes, and layout choices were not imported.",
			sheetId,
			topicId,
		);
	}

	const markerRefs = getDirectChildrenByLocalName(topic, "marker-refs");
	const markerElements = markerRefs.flatMap((container) =>
		getElementsByLocalName(container, "marker-ref"),
	);
	const markerIds: string[] = [];
	let malformedMarker = false;
	for (const marker of markerElements) {
		const markerId = marker.getAttribute("marker-id")?.trim() ?? "";
		if (markerId.length === 0) {
			malformedMarker = true;
			continue;
		}
		markerIds.push(markerId);
	}
	return resolveTaskMarker(
		{
			present: markerRefs.length > 0,
			malformed: malformedMarker,
			ids: markerIds,
		},
		sheetId,
		topicId,
		builder,
	);
}

function resolveTaskMarker(
	markers: MarkerInspection,
	sheetId: string,
	topicId: string,
	builder: ImportBuilder,
): MindMapImportTaskState | null {
	if (!markers.present) {
		return null;
	}
	const markerIds = new Set(markers.ids);
	const hasStart = markerIds.has(TASK_START_MARKER);
	const hasDone = markerIds.has(TASK_DONE_MARKER);
	const hasUnsupportedMarker = [...markerIds].some(
		(markerId) =>
			markerId !== TASK_START_MARKER && markerId !== TASK_DONE_MARKER,
	);
	if (markers.malformed || hasUnsupportedMarker || (hasStart && hasDone)) {
		emitDiagnostic(
			builder,
			"xmind-markers-omitted",
			"Only an unambiguous XMind task-start or task-done marker can be preserved; other markers were omitted.",
			sheetId,
			topicId,
		);
	}
	if (hasStart === hasDone) {
		return null;
	}
	return hasDone ? "checked" : "unchecked";
}

function getJsonMarkerInspection(topic: JsonRecord): MarkerInspection {
	const rawMarkers = topic.markers;
	if (rawMarkers === undefined || rawMarkers === null) {
		return { present: false, malformed: false, ids: [] };
	}
	if (!Array.isArray(rawMarkers)) {
		return { present: true, malformed: true, ids: [] };
	}
	const ids: string[] = [];
	let malformed = false;
	for (const marker of rawMarkers) {
		if (typeof marker === "string") {
			const markerId = marker.trim();
			if (markerId.length > 0) {
				ids.push(markerId);
			} else {
				malformed = true;
			}
			continue;
		}
		if (!isJsonRecord(marker)) {
			malformed = true;
			continue;
		}
		const rawMarkerId = marker.markerId ?? marker["marker-id"];
		if (typeof rawMarkerId !== "string" || rawMarkerId.trim().length === 0) {
			malformed = true;
			continue;
		}
		ids.push(rawMarkerId.trim());
	}
	return { present: rawMarkers.length > 0, malformed, ids };
}

function hasJsonStyleOrLayout(value: JsonRecord): boolean {
	return (
		hasMeaningfulJsonValue(value, "style") ||
		hasMeaningfulJsonValue(value, "styleId") ||
		hasMeaningfulJsonValue(value, "style-id") ||
		hasMeaningfulJsonValue(value, "theme") ||
		hasMeaningfulJsonValue(value, "structureClass") ||
		hasMeaningfulJsonValue(value, "structure-class") ||
		hasMeaningfulJsonValue(value, "topicPositioning") ||
		hasMeaningfulJsonValue(value, "topicOverlapping")
	);
}

function hasXmlStyleOrLayout(value: Element): boolean {
	return (
		value.hasAttribute("style-id") ||
		value.hasAttribute("styleId") ||
		value.hasAttribute("theme") ||
		value.hasAttribute("structure-class") ||
		value.hasAttribute("structureClass") ||
		value.hasAttribute("topic-positioning") ||
		value.hasAttribute("topic-overlapping") ||
		getDirectChildrenByLocalName(value, "style").length > 0
	);
}

function hasMeaningfulJsonValue(value: JsonRecord, key: string): boolean {
	const candidate = value[key];
	if (candidate === undefined || candidate === null) {
		return false;
	}
	if (Array.isArray(candidate)) {
		return candidate.length > 0;
	}
	if (typeof candidate === "string") {
		return candidate.trim().length > 0;
	}
	if (isJsonRecord(candidate)) {
		return Object.keys(candidate).length > 0;
	}
	return true;
}

function inspectManifestEncryption(
	archive: ImportArchive,
	builder: ImportBuilder,
): void {
	const jsonManifest = archive.readText(XMIND_MANIFEST_JSON);
	if (jsonManifest !== null) {
		try {
			const parsed = JSON.parse(jsonManifest) as unknown;
			if (containsJsonEncryptionMarker(parsed)) {
				throw new MindMapImportError(
					"encrypted-archive",
					"Password-protected XMind archives are not supported.",
				);
			}
		} catch (error: unknown) {
			if (error instanceof MindMapImportError) {
				throw error;
			}
			emitDiagnostic(
				builder,
				"xmind-manifest-unreadable",
				"The optional XMind manifest could not be inspected for encryption metadata.",
			);
		}
	}

	const xmlManifest = archive.readText(XMIND_MANIFEST_XML);
	if (
		xmlManifest !== null &&
		/\b(?:encryption-data|password-hint)\b/i.test(xmlManifest)
	) {
		throw new MindMapImportError(
			"encrypted-archive",
			"Password-protected XMind archives are not supported.",
		);
	}
}

function containsJsonEncryptionMarker(value: unknown): boolean {
	const stack: unknown[] = [value];
	while (stack.length > 0) {
		const current = stack.pop();
		if (Array.isArray(current)) {
			for (const nested of current) {
				stack.push(nested);
			}
			continue;
		}
		if (!isJsonRecord(current)) {
			continue;
		}
		if (
			current["encryption-data"] !== undefined &&
			current["encryption-data"] !== null
		) {
			return true;
		}
		if (
			current["password-hint"] !== undefined &&
			current["password-hint"] !== null
		) {
			return true;
		}
		for (const nested of Object.values(current)) {
			stack.push(nested);
		}
	}
	return false;
}

function reserveTopicPosition(depth: number, builder: ImportBuilder): void {
	builder.topicCount += 1;
	assertImportedTopicPosition(depth, builder.topicCount, builder.limits);
}

function createMutableTopic(builder: ImportBuilder): MutableImportedTopic {
	return {
		id: createGeneratedTopicId(builder),
		text: "Untitled topic",
		taskState: null,
		children: [],
	};
}

function createGeneratedTopicId(builder: ImportBuilder): string {
	const id = `xmind-topic-${String(builder.nextGeneratedTopicId)}`;
	builder.nextGeneratedTopicId += 1;
	return id;
}

function importIdentifier(
	value: unknown,
	fallback: string,
	limits: MindMapImportLimits,
): string {
	const identifier = typeof value === "string" ? value.trim() : "";
	const resolved = identifier.length > 0 ? identifier : fallback;
	if (resolved.length > limits.maximumTextLength) {
		throw new MindMapImportError(
			"limit-exceeded",
			`Imported identifier exceeds the ${String(limits.maximumTextLength)} character limit.`,
		);
	}
	return resolved;
}

function requireJsonRecord(value: unknown, message: string): JsonRecord {
	if (!isJsonRecord(value)) {
		throw new MindMapImportError("invalid-json", message);
	}
	return value;
}

function readOptionalJsonRecord(
	value: unknown,
	message: string,
): JsonRecord | null {
	if (value === undefined || value === null) {
		return null;
	}
	return requireJsonRecord(value, message);
}

function readJsonTopicArray(
	children: JsonRecord,
	key: string,
): readonly JsonRecord[] {
	const value = children[key];
	if (value === undefined || value === null) {
		return [];
	}
	if (!Array.isArray(value)) {
		throw new MindMapImportError(
			"invalid-json",
			`XMind topic children.${key} must be an array.`,
		);
	}
	return value.map((topic) =>
		requireJsonRecord(topic, `XMind topic children.${key} contains an invalid topic.`),
	);
}

function getDirectChildText(element: Element, localName: string): string | null {
	const child = getDirectChildrenByLocalName(element, localName)[0];
	return child === undefined ? null : child.textContent;
}

function emitDiagnostic(
	builder: ImportBuilder,
	code: string,
	message: string,
	sheetId?: string,
	topicId?: string,
): void {
	const key = `${sheetId ?? "workbook"}:${code}`;
	if (builder.emittedDiagnosticKeys.has(key)) {
		return;
	}
	builder.emittedDiagnosticKeys.add(key);
	builder.diagnostics.push({
		severity: "warning",
		code,
		message,
		sheetId,
		topicId,
	});
}

function isJsonRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extensionOf(name: string): string {
	return name.toLowerCase().split(".").at(-1) ?? "";
}
