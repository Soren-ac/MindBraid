import {
	DEFAULT_MIND_MAP_IMPORT_LIMITS,
	MindMapImportError,
	type MindMapImportLimits,
} from "./types";

const UNSAFE_XML_PATTERN = /<!\s*(?:DOCTYPE|ENTITY)\b/i;

export function parseImportXml(
	source: string,
	limits: MindMapImportLimits = DEFAULT_MIND_MAP_IMPORT_LIMITS,
): Document {
	if (UNSAFE_XML_PATTERN.test(source)) {
		throw new MindMapImportError(
			"unsafe-xml",
			"Mind-map XML contains a prohibited DTD or entity declaration.",
		);
	}
	assertXmlComplexityWithinLimits(source, limits);
	const document = new DOMParser().parseFromString(source, "application/xml");
	if (containsElementWithLocalName(document, new Set(["parsererror"]))) {
		throw new MindMapImportError("invalid-xml", "Mind-map XML is malformed.");
	}
	return document;
}

export function getElementsByLocalName(
	root: ParentNode,
	localName: string,
): readonly Element[] {
	const matches: Element[] = [];
	const pending: Element[] = [];
	pushChildrenInReverse(pending, root);
	while (pending.length > 0) {
		const element = pending.pop();
		if (element === undefined) {
			continue;
		}
		if (element.localName === localName) {
			matches.push(element);
		}
		pushChildrenInReverse(pending, element);
	}
	return matches;
}

export function getDirectChildrenByLocalName(
	root: Element,
	localName: string,
): readonly Element[] {
	return Array.from(root.children).filter(
		(element) => element.localName === localName,
	);
}

export function containsElementWithLocalName(
	root: ParentNode,
	localNames: ReadonlySet<string>,
): boolean {
	const pending: Element[] = [];
	pushChildrenInReverse(pending, root);
	while (pending.length > 0) {
		const element = pending.pop();
		if (element === undefined) {
			continue;
		}
		if (localNames.has(element.localName)) {
			return true;
		}
		pushChildrenInReverse(pending, element);
	}
	return false;
}

function pushChildrenInReverse(pending: Element[], root: ParentNode): void {
	for (let index = root.children.length - 1; index >= 0; index -= 1) {
		const child = root.children.item(index);
		if (child !== null) {
			pending.push(child);
		}
	}
}

function assertXmlComplexityWithinLimits(
	source: string,
	limits: MindMapImportLimits,
): void {
	let elementCount = 0;
	let attributeCount = 0;
	let depth = 0;
	let cursor = 0;
	while (cursor < source.length) {
		const opening = source.indexOf("<", cursor);
		if (opening < 0) {
			break;
		}
		if (source.startsWith("<!--", opening)) {
			cursor = requireXmlTerminator(source, opening + 4, "-->") + 3;
			continue;
		}
		if (source.startsWith("<![CDATA[", opening)) {
			cursor = requireXmlTerminator(source, opening + 9, "]]>") + 3;
			continue;
		}
		if (source.startsWith("<?", opening)) {
			cursor = requireXmlTerminator(source, opening + 2, "?>") + 2;
			continue;
		}
		if (source.startsWith("<!", opening)) {
			throw new MindMapImportError(
				"unsafe-xml",
				"Mind-map XML contains an unsupported declaration.",
			);
		}

		const closing = findXmlTagEnd(source, opening + 1);
		const body = source.slice(opening + 1, closing);
		if (body.startsWith("/")) {
			depth -= 1;
			if (depth < 0) {
				throw new MindMapImportError(
					"invalid-xml",
					"Mind-map XML has an unexpected closing element.",
				);
			}
			cursor = closing + 1;
			continue;
		}

		elementCount += 1;
		if (elementCount > limits.maximumXmlElements) {
			throw new MindMapImportError(
				"limit-exceeded",
				`Mind-map XML exceeds the ${String(limits.maximumXmlElements)} element limit.`,
			);
		}
		attributeCount += countXmlAttributeAssignments(body);
		if (attributeCount > limits.maximumXmlAttributes) {
			throw new MindMapImportError(
				"limit-exceeded",
				`Mind-map XML exceeds the ${String(limits.maximumXmlAttributes)} attribute limit.`,
			);
		}
		if (!body.trimEnd().endsWith("/")) {
			depth += 1;
			if (depth > limits.maximumXmlDepth) {
				throw new MindMapImportError(
					"limit-exceeded",
					`Mind-map XML exceeds the ${String(limits.maximumXmlDepth)} element-depth limit.`,
				);
			}
		}
		cursor = closing + 1;
	}
	if (depth !== 0) {
		throw new MindMapImportError(
			"invalid-xml",
			"Mind-map XML has unbalanced elements.",
		);
	}
}

function requireXmlTerminator(
	source: string,
	from: number,
	terminator: string,
): number {
	const end = source.indexOf(terminator, from);
	if (end < 0) {
		throw new MindMapImportError(
			"invalid-xml",
			"Mind-map XML contains an unterminated declaration or section.",
		);
	}
	return end;
}

function findXmlTagEnd(source: string, from: number): number {
	let quote: '"' | "'" | null = null;
	for (let index = from; index < source.length; index += 1) {
		const character = source[index];
		if (quote !== null) {
			if (character === quote) {
				quote = null;
			}
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}
		if (character === ">") {
			return index;
		}
	}
	throw new MindMapImportError(
		"invalid-xml",
		"Mind-map XML contains an unterminated element.",
	);
}

function countXmlAttributeAssignments(tagBody: string): number {
	let assignments = 0;
	let quote: '"' | "'" | null = null;
	for (const character of tagBody) {
		if (quote !== null) {
			if (character === quote) {
				quote = null;
			}
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
		} else if (character === "=") {
			assignments += 1;
		}
	}
	return assignments;
}
