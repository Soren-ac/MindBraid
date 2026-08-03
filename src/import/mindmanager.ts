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
import {
	containsElementWithLocalName,
	getDirectChildrenByLocalName,
	getElementsByLocalName,
	parseImportXml,
} from "./xml";

const MINDMANAGER_CONTENT_ENTRIES = ["Document.xml", "document.xml"] as const;
const MINDMANAGER_ALLOWED_ENTRIES = new Set<string>(MINDMANAGER_CONTENT_ENTRIES);
const UNSUPPORTED_LOCAL_NAMES = new Set([
	"NotesData",
	"NotesGroup",
	"Hyperlink",
	"Image",
	"Icon",
	"Relationship",
	"Boundary",
	"Callout",
]);

interface MutableImportedTopic {
	id: string;
	text: string;
	taskState: ImportedMindMapTopic["taskState"];
	children: MutableImportedTopic[];
}

interface MindManagerTopicWorkItem {
	readonly element: Element;
	readonly target: MutableImportedTopic;
	readonly fallbackId: string;
	readonly depth: number;
}

export const MINDMANAGER_IMPORT_ADAPTER: MindMapImportAdapter = Object.freeze({
	id: "mindmanager",
	label: "MindManager",
	extensions: ["mmap"],
	sniff(input: MindMapImportInput): number {
		try {
			const entries = inspectImportArchive(
				input.bytes,
				DEFAULT_MIND_MAP_IMPORT_LIMITS,
			);
			return entries.some(({ name }) =>
				MINDMANAGER_ALLOWED_ENTRIES.has(name),
			)
				? 100
				: extensionOf(input.name) === "mmap"
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
		return parseMindManagerImport(input, limits);
	},
});

export function parseMindManagerImport(
	input: MindMapImportInput,
	limits: MindMapImportLimits = DEFAULT_MIND_MAP_IMPORT_LIMITS,
): ImportedMindMapWorkbook {
	assertImportInputWithinLimits(input, limits);
	const archive = openImportArchive(
		input.bytes,
		MINDMANAGER_ALLOWED_ENTRIES,
		limits,
	);
	const contentEntry = MINDMANAGER_CONTENT_ENTRIES.find((name) => archive.has(name));
	if (contentEntry === undefined) {
		throw new MindMapImportError(
			"missing-content",
			"MindManager archive does not contain Document.xml.",
		);
	}
	const source = archive.readText(contentEntry);
	if (source === null) {
		throw new MindMapImportError(
			"missing-content",
			"MindManager Document.xml could not be read.",
		);
	}
	const document = parseImportXml(source, limits);
	const rootElement = findRootTopic(document);
	if (rootElement === null) {
		throw new MindMapImportError(
			"empty-workbook",
			"MindManager document does not contain a central topic.",
		);
	}
	const diagnostics: MindMapImportDiagnostic[] = [];
	const hasUnsupportedContent = containsElementWithLocalName(
		document,
		UNSUPPORTED_LOCAL_NAMES,
	);
	const root = convertMindManagerTopic(
		rootElement,
		"root",
		limits,
	);
	if (hasUnsupportedContent) {
		diagnostics.push({
			severity: "warning",
			code: "mindmanager-presentation-omitted",
			message:
				"MindManager notes, links, media, relationships, callouts, and visual styling are not imported yet.",
			topicId: root.id,
		});
	}
	return {
		format: "mindmanager",
		sourceName: input.name,
		sheets: [
			{
				id: attributeByLocalName(rootElement, "OId") ?? "map",
				title: root.text,
				root,
			},
		],
		diagnostics,
	};
}

function findRootTopic(document: Document): Element | null {
	const oneTopic = getElementsByLocalName(document, "OneTopic")[0];
	if (oneTopic !== undefined) {
		return getDirectChildrenByLocalName(oneTopic, "Topic")[0] ?? null;
	}
	const map = getElementsByLocalName(document, "Map")[0] ?? document.documentElement;
	return getDirectChildrenByLocalName(map, "Topic")[0] ??
		getElementsByLocalName(map, "Topic")[0] ??
		null;
}

function convertMindManagerTopic(
	rootElement: Element,
	rootFallbackId: string,
	limits: MindMapImportLimits,
): ImportedMindMapTopic {
	const root = createMutableMindManagerTopic();
	const pending: MindManagerTopicWorkItem[] = [
		{
			element: rootElement,
			target: root,
			fallbackId: rootFallbackId,
			depth: 0,
		},
	];
	let topicCount = 0;
	while (pending.length > 0) {
		const current = pending.pop();
		if (current === undefined) {
			continue;
		}
		topicCount += 1;
		assertImportedTopicPosition(current.depth, topicCount, limits);
		const id =
			attributeByLocalName(current.element, "OId") ??
			attributeByLocalName(current.element, "Id") ??
			current.fallbackId;
		const textElement = getDirectChildrenByLocalName(
			current.element,
			"Text",
		)[0];
		current.target.id = id;
		current.target.text = requireImportedText(
			textElement === undefined
				? attributeByLocalName(current.element, "Text") ??
					attributeByLocalName(current.element, "Title")
				: attributeByLocalName(textElement, "PlainText") ??
					textElement.textContent,
			"Untitled topic",
			limits,
		);
		current.target.taskState = resolveMindManagerTaskState(current.element);

		const childElements = getMindManagerChildTopics(current.element);
		const childWork: MindManagerTopicWorkItem[] = [];
		for (let index = 0; index < childElements.length; index += 1) {
			const child = childElements[index];
			if (child === undefined) {
				continue;
			}
			const target = createMutableMindManagerTopic();
			current.target.children.push(target);
			childWork.push({
				element: child,
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

function getMindManagerChildTopics(element: Element): readonly Element[] {
	const subtopics = getDirectChildrenByLocalName(element, "SubTopics").flatMap(
		(container) => getDirectChildrenByLocalName(container, "Topic"),
	);
	return subtopics.length > 0
		? subtopics
		: getDirectChildrenByLocalName(element, "Topic");
}

function createMutableMindManagerTopic(): MutableImportedTopic {
	return {
		id: "pending",
		text: "Untitled topic",
		taskState: null,
		children: [],
	};
}

function resolveMindManagerTaskState(
	element: Element,
): ImportedMindMapTopic["taskState"] {
	const completed =
		attributeByLocalName(element, "TaskComplete") ??
		attributeByLocalName(element, "PercentComplete");
	if (completed === null) {
		return null;
	}
	const normalized = completed.trim().toLowerCase();
	if (normalized === "true" || normalized === "100" || normalized === "1") {
		return "checked";
	}
	if (normalized === "false" || normalized === "0") {
		return "unchecked";
	}
	return null;
}

function attributeByLocalName(
	element: Element,
	localName: string,
): string | null {
	const direct = element.getAttribute(localName);
	if (direct !== null) {
		return direct;
	}
	for (const attribute of Array.from(element.attributes)) {
		if (attribute.localName.toLowerCase() === localName.toLowerCase()) {
			return attribute.value;
		}
	}
	return null;
}

function extensionOf(name: string): string {
	return name.toLowerCase().split(".").at(-1) ?? "";
}
