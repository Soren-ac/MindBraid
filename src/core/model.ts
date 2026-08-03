/**
 * A source position in a Markdown file.
 *
 * Both `line` and `ch` are zero-based, matching Obsidian's editor positions.
 */
export interface SourceLocation {
	readonly path: string;
	readonly line: number;
	readonly ch: number;
}

export type MindMapInlineLinkKind = "markdown" | "wikilink";

/**
 * A source-derived link embedded in one structural topic label.
 *
 * Offsets are relative to the topic's inline Markdown source, not the full
 * document line. End offsets are exclusive. Adapters may use
 * `visibleStart`/`visibleEnd` to expose a dedicated affordance without
 * turning the complete topic into a link.
 */
export interface MindMapInlineLink {
	readonly kind: MindMapInlineLinkKind;
	readonly target: string;
	readonly label: string;
	readonly embedded: boolean;
	readonly sourceStart: number;
	readonly sourceEnd: number;
	readonly visibleStart: number;
	readonly visibleEnd: number;
}

export type MindMapHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type MindMapUnorderedListMarker = "-" | "*" | "+";
export type MindMapOrderedListMarker = `${number}.`;
export type MindMapListMarker =
	| MindMapUnorderedListMarker
	| MindMapOrderedListMarker;
export type MindMapTaskState = "unchecked" | "checked";

/**
 * Source-derived fields shared by every node kind. This is an immutable
 * document snapshot, not a presentation or interaction model.
 */
interface BaseMindMapNode {
	readonly id: string;
	readonly text: string;
	readonly links: readonly MindMapInlineLink[];
	readonly source: SourceLocation;
	readonly children: readonly MindMapNode[];
}

export interface RootMindMapNode extends BaseMindMapNode {
	readonly kind: "root";
}

export interface HeadingMindMapNode extends BaseMindMapNode {
	readonly kind: "heading";
	readonly level: MindMapHeadingLevel;
	/** Normalized source line captured when this node snapshot was parsed. */
	readonly sourceLine: string;
}

export interface ListMindMapNode extends BaseMindMapNode {
	readonly kind: "list";
	readonly marker: MindMapListMarker;
	readonly ordered: boolean;
	readonly ordinal: number | null;
	readonly taskState: MindMapTaskState | null;
	/** Normalized source line captured when this node snapshot was parsed. */
	readonly sourceLine: string;
}

/**
 * Semantic node union produced by the Markdown parser. It contains only facts
 * derived from the source document; themes and per-view UI state belong in a
 * separate presentation model.
 */
export type MindMapNode =
	| RootMindMapNode
	| HeadingMindMapNode
	| ListMindMapNode;

export type MindMapNodeKind = MindMapNode["kind"];

/**
 * Minimal immutable source snapshot captured when an inline editor opens.
 *
 * It deliberately omits `children`: an edit targets one source-backed topic,
 * not a mutable tree reference. Passing this snapshot through the renderer and
 * frontend boundaries lets the host validate the exact original source line
 * even if a newer document frame has the same visible node text.
 */
export type MindMapNodeEditSnapshot = (
	| Pick<RootMindMapNode, "id" | "kind" | "text" | "source">
	| Pick<
			HeadingMindMapNode,
			"id" | "kind" | "text" | "source" | "level" | "sourceLine"
	  >
	| Pick<
			ListMindMapNode,
			| "id"
			| "kind"
			| "text"
			| "source"
			| "marker"
			| "ordered"
			| "ordinal"
			| "taskState"
			| "sourceLine"
	  >
) & {
	/**
	 * Revision of the complete source buffer that produced the node. It closes
	 * ambiguities that a line number and raw line alone cannot distinguish.
	 */
	readonly sourceRevision: string;
};

export function createMindMapNodeEditSnapshot(
	node: MindMapNode,
	sourceRevision: string,
): MindMapNodeEditSnapshot {
	const base = {
		id: node.id,
		kind: node.kind,
		text: node.text,
		source: { ...node.source },
		sourceRevision,
	};

	switch (node.kind) {
		case "root":
			return {
				...base,
				kind: "root",
			};
		case "heading":
			return {
				...base,
				kind: "heading",
				level: node.level,
				sourceLine: node.sourceLine,
			};
		case "list":
			return {
				...base,
				kind: "list",
				marker: node.marker,
				ordered: node.ordered,
				ordinal: node.ordinal,
				taskState: node.taskState,
				sourceLine: node.sourceLine,
			};
	}
}

export interface MindMapDocument {
	readonly root: RootMindMapNode;
	/** Deterministic revision of the exact source buffer, including newlines. */
	readonly sourceRevision: string;
	readonly rawIsEmpty: boolean;
	readonly hasStructuralNodes: boolean;
}

export type LayoutDirection = "left-to-right" | "top-to-bottom";
export type LayoutOrientation =
	| LayoutDirection
	| "right-to-left"
	| "bottom-to-top";
