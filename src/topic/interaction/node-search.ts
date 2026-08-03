import type {
	MindMapDocument,
	MindMapNode,
	SourceLocation,
} from "../../core/model";

/**
 * One source-derived entry in the current document's searchable topic index.
 *
 * `ancestorIds` is ordered from the synthetic document root to the direct
 * parent. A frontend can therefore reveal a result without re-walking the
 * source tree or importing the parser.
 */
export interface MindMapNodeSearchEntry {
	readonly nodeId: string;
	readonly text: string;
	readonly source: SourceLocation;
	readonly ancestorIds: readonly string[];
	readonly documentOrder: number;
}

/**
 * A renderer-neutral, current-document-only search index.
 *
 * It intentionally contains no Vault lookup, editor state, or persisted data.
 * The index is rebuilt from the one document already parsed for the active
 * mind-map frame.
 */
export interface MindMapDocumentSearchIndex {
	readonly path: string;
	readonly sourceRevision: string;
	readonly entries: readonly MindMapNodeSearchEntry[];
	readonly entriesByNodeId: ReadonlyMap<string, MindMapNodeSearchEntry>;
}

/**
 * A deterministic match result. The ancestor chain is copied from the index
 * so a reveal operation can expand only the necessary branches.
 */
export interface MindMapNodeSearchResult
	extends MindMapNodeSearchEntry {
	readonly query: string;
}

/**
 * Build a depth-first source-order index for exactly one parsed Markdown
 * document. Duplicate node IDs are rejected because reveal would otherwise
 * be ambiguous.
 */
export function createMindMapDocumentSearchIndex(
	document: MindMapDocument,
): MindMapDocumentSearchIndex {
	const entries: MindMapNodeSearchEntry[] = [];
	const entriesByNodeId = new Map<string, MindMapNodeSearchEntry>();

	const visit = (
		node: MindMapNode,
		ancestorIds: readonly string[],
	): void => {
		if (entriesByNodeId.has(node.id)) {
			throw new Error(
				`Duplicate mind-map node id "${node.id}" cannot be searched safely.`,
			);
		}

		const entry: MindMapNodeSearchEntry = {
			nodeId: node.id,
			text: node.text,
			source: { ...node.source },
			ancestorIds: [...ancestorIds],
			documentOrder: entries.length,
		};
		entries.push(entry);
		entriesByNodeId.set(entry.nodeId, entry);

		const childAncestors = [...ancestorIds, node.id];
		for (const child of node.children) {
			visit(child, childAncestors);
		}
	};

	visit(document.root, []);

	return {
		path: document.root.source.path,
		sourceRevision: document.sourceRevision,
		entries,
		entriesByNodeId,
	};
}

/**
 * Search visible topic text using Unicode normalization and case-insensitive
 * substring matching. An empty or whitespace-only query intentionally returns
 * no results, avoiding an accidental "select every topic" state in a search
 * frontend.
 */
export function searchMindMapDocument(
	index: MindMapDocumentSearchIndex,
	query: string,
): readonly MindMapNodeSearchResult[] {
	const normalizedQuery = normalizeSearchText(query);
	if (normalizedQuery.length === 0) {
		return [];
	}

	return index.entries.flatMap((entry) =>
		normalizeSearchText(entry.text).includes(normalizedQuery)
			? [
					{
						...entry,
						source: { ...entry.source },
						ancestorIds: [...entry.ancestorIds],
						query: normalizedQuery,
					},
				]
			: [],
	);
}

/**
 * Resolve one indexed topic for reveal or keyboard navigation without a
 * source-tree traversal.
 */
export function getMindMapNodeSearchEntry(
	index: MindMapDocumentSearchIndex,
	nodeId: string,
): MindMapNodeSearchEntry | null {
	return index.entriesByNodeId.get(nodeId) ?? null;
}

function normalizeSearchText(value: string): string {
	return value.normalize("NFKC").trim().toLowerCase();
}
