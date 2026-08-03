import { describe, expect, it } from "vitest";

import type { MindMapDocument, MindMapNode } from "../src/core/model";
import {
	createMindMapNodeLocator,
	reconcileMindMapNode,
	reconcileMindMapNodeLocator,
	resolveMindMapNodeLocator,
	resolveMindMapNodeLocatorDetailed,
} from "../src/topic/node-identity";
import { parseMarkdown } from "../src/core/parser";

const NOTE_PATH = "Folder/Identity.md";

describe("mind-map node locators", () => {
	it("captures source, fingerprint, ancestry, and duplicate occurrence facts", () => {
		const document = parse(
			"# Parent\n## Same\n## Same",
		);
		const repeated = findNodesByText(document, "Same");
		const second = repeated[1];
		if (second === undefined) {
			throw new Error("Expected a repeated heading.");
		}

		const locator = createMindMapNodeLocator(document, second.id);

		expect(locator).not.toBeNull();
		expect(locator?.sourceAnchor).toEqual({ line: 2, ch: 0 });
		expect(locator?.ancestry.map(({ kind }) => kind)).toEqual([
			"root",
			"heading",
		]);
		expect(locator?.node.siblingOccurrence).toBe(1);
		expect(locator?.node.siblingOccurrenceCount).toBe(2);
		expect(locator?.node.fingerprint.semantic).toMatch(
			/^obmind-node-v1:/,
		);
		expect(resolveMindMapNodeLocator(document, locator!)).toBe(second);
	});

	it("reconciles a topic after source lines shift", () => {
		const previous = parse("# Parent\n## Topic\n- Item");
		const item = requireNode(previous, "Item");
		const locator = createMindMapNodeLocator(previous, item.id);
		const next = parse("Intro\n\n# Parent\n## Topic\n- Item");
		if (locator === null) {
			throw new Error("Expected a locator.");
		}

		const resolution = resolveMindMapNodeLocatorDetailed(next, locator);

		expect(resolution?.node.text).toBe("Item");
		expect(resolution?.node.source.line).toBe(4);
		expect(resolution?.strategy).toBe("ancestry");
	});

	it("uses ancestry to distinguish duplicate labels in different branches", () => {
		const previous = parse(
			"# First\n## Target\n# Second\n## Target",
		);
		const target = findNodesByText(previous, "Target")[1];
		if (target === undefined) {
			throw new Error("Expected the second target.");
		}
		const locator = createMindMapNodeLocator(previous, target.id);
		const next = parse(
			"Intro\n# First\n## Target\n# Second\n## Target",
		);
		if (locator === null) {
			throw new Error("Expected a locator.");
		}

		const resolved = resolveMindMapNodeLocator(next, locator);

		expect(resolved?.source.line).toBe(4);
		expect(resolved?.text).toBe("Target");
	});

	it("does not let a reused source line steal a same-label node from another parent", () => {
		const previous = parse(
			"# A\n## Topic\n# B\n## Topic",
		);
		const target = findNodesByText(previous, "Topic")[0];
		if (target === undefined) {
			throw new Error("Expected the first topic.");
		}
		const locator = createMindMapNodeLocator(previous, target.id);
		const next = parse(
			"# B\n## Topic\n# A\n## Topic",
		);
		if (locator === null) {
			throw new Error("Expected a locator.");
		}

		const resolved = resolveMindMapNodeLocatorDetailed(next, locator);

		expect(resolved?.node.source.line).toBe(3);
		expect(resolved?.locator.ancestry.at(-1)?.fingerprint.semantic).toBe(
			locator.ancestry.at(-1)?.fingerprint.semantic,
		);
		expect(resolved?.strategy).toBe("ancestry");
	});

	it("uses sibling occurrence when unrelated siblings are inserted", () => {
		const previous = parse("# Parent\n## Same\n## Same");
		const target = findNodesByText(previous, "Same")[1];
		if (target === undefined) {
			throw new Error("Expected the second repeated topic.");
		}
		const locator = createMindMapNodeLocator(previous, target.id);
		const next = parse(
			"# Parent\n## Same\n## Other\n## Same",
		);
		if (locator === null) {
			throw new Error("Expected a locator.");
		}

		expect(resolveMindMapNodeLocator(next, locator)?.source.line).toBe(3);
	});

	it("returns null when a changed duplicate group makes occurrence unsafe", () => {
		const previous = parse("# Parent\n## Same\n## Same");
		const target = findNodesByText(previous, "Same")[1];
		if (target === undefined) {
			throw new Error("Expected the second repeated topic.");
		}
		const locator = createMindMapNodeLocator(previous, target.id);
		const next = parse(
			"# Parent\n## Same\n## Same\n## Same",
		);
		if (locator === null) {
			throw new Error("Expected a locator.");
		}

		expect(resolveMindMapNodeLocator(next, locator)).toBeNull();
	});

	it("uses a unique subtree fingerprint after a branch moves", () => {
		const previous = parse(
			"# First\n## Topic\n### Child\n# Second",
		);
		const topic = requireNode(previous, "Topic");
		const next = parse(
			"# First\n# Second\n## Topic\n### Child",
		);

		const reconciliation = reconcileMindMapNode(
			previous,
			next,
			topic.id,
		);

		expect(reconciliation?.nextNode.text).toBe("Topic");
		expect(reconciliation?.nextNode.source.line).toBe(2);
		expect(reconciliation?.strategy).toBe("unique-subtree");
	});

	it("keeps the correct duplicate branch when sibling subtrees reorder", () => {
		const previous = parse(
			"# Parent\n## Same\n### First child\n## Same\n### Second child",
		);
		const target = findNodesByText(previous, "Same")[0];
		if (target === undefined) {
			throw new Error("Expected the first repeated branch.");
		}
		const next = parse(
			"# Parent\n## Same\n### Second child\n## Same\n### First child",
		);

		const reconciliation = reconcileMindMapNode(
			previous,
			next,
			target.id,
		);

		expect(reconciliation?.nextNode.children[0]?.text).toBe(
			"First child",
		);
		expect(reconciliation?.nextNode.source.line).toBe(3);
		expect(reconciliation?.strategy).toBe("unique-subtree");
	});

	it("uses structural position for an explicit text change", () => {
		const previous = parse("# Parent\n## Old name");
		const target = requireNode(previous, "Old name");
		const locator = createMindMapNodeLocator(previous, target.id);
		const next = parse("# Parent\n## New name");
		if (locator === null) {
			throw new Error("Expected a locator.");
		}

		const resolution = resolveMindMapNodeLocatorDetailed(next, locator);

		expect(resolution?.node.text).toBe("New name");
		expect(resolution?.strategy).toBe("structural-position");
	});

	it("reconciles a text change after non-structural source lines shift", () => {
		const previous = parse("# Parent\n## Old name");
		const target = requireNode(previous, "Old name");
		const locator = createMindMapNodeLocator(previous, target.id);
		const next = parse("Intro\n\n# Parent\n## New name");
		if (locator === null) {
			throw new Error("Expected a locator.");
		}

		const reconciliation = reconcileMindMapNodeLocator(
			previous,
			next,
			locator,
		);

		expect(reconciliation?.nextNode.text).toBe("New name");
		expect(reconciliation?.nextNode.source.line).toBe(3);
		expect(reconciliation?.nextLocator.sourceAnchor.line).toBe(3);
	});

	it("rejects a shifted text change among same-kind siblings", () => {
		const previous = parse(
			"# Parent\n## First\n## Old name",
		);
		const target = requireNode(previous, "Old name");
		const locator = createMindMapNodeLocator(previous, target.id);
		const next = parse(
			"Intro\n# Parent\n## New name\n## First",
		);
		if (locator === null) {
			throw new Error("Expected a locator.");
		}

		expect(resolveMindMapNodeLocator(next, locator)).toBeNull();
	});

	it("conservatively rejects globally ambiguous moved duplicates", () => {
		const previous = parse(
			"# First\n## Same\n# Second\n## Same",
		);
		const target = findNodesByText(previous, "Same")[0];
		if (target === undefined) {
			throw new Error("Expected a repeated target.");
		}
		const locator = createMindMapNodeLocator(previous, target.id);
		const next = parse(
			"Intro\n# Third\n## Same\n# Fourth\n## Same",
		);
		if (locator === null) {
			throw new Error("Expected a locator.");
		}

		expect(resolveMindMapNodeLocator(next, locator)).toBeNull();
	});

	it("rejects another source path and malformed source anchors", () => {
		const previous = parse("# Topic");
		const topic = requireNode(previous, "Topic");
		const locator = createMindMapNodeLocator(previous, topic.id);
		if (locator === null) {
			throw new Error("Expected a locator.");
		}
		const otherPath = parseMarkdown(
			"# Topic",
			"Other.md",
			"Other",
		);
		const malformed = {
			...locator,
			sourceAnchor: {
				line: -1,
				ch: 0,
			},
		};

		expect(resolveMindMapNodeLocator(otherPath, locator)).toBeNull();
		expect(resolveMindMapNodeLocator(previous, malformed)).toBeNull();
	});

	it("reconciles the document root while the path remains stable", () => {
		const previous = parse("# Before");
		const next = parse("# After");
		const locator = createMindMapNodeLocator(
			previous,
			previous.root.id,
		);
		if (locator === null) {
			throw new Error("Expected a root locator.");
		}

		const reconciliation = reconcileMindMapNodeLocator(
			previous,
			next,
			locator,
		);

		expect(reconciliation?.previousNode).toBe(previous.root);
		expect(reconciliation?.nextNode).toBe(next.root);
		expect(reconciliation?.strategy).toBe("root");
	});
});

function parse(content: string): MindMapDocument {
	return parseMarkdown(content, NOTE_PATH, "Identity");
}

function requireNode(
	document: MindMapDocument,
	text: string,
): MindMapNode {
	const node = findNodesByText(document, text)[0];
	if (node === undefined) {
		throw new Error(`Expected node "${text}".`);
	}
	return node;
}

function findNodesByText(
	document: MindMapDocument,
	text: string,
): MindMapNode[] {
	const matches: MindMapNode[] = [];
	const pending: MindMapNode[] = [document.root];
	while (pending.length > 0) {
		const node = pending.shift();
		if (node === undefined) {
			continue;
		}
		if (node.text === text) {
			matches.push(node);
		}
		pending.unshift(...node.children);
	}
	return matches;
}
