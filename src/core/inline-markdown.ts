/**
 * Framework-free projection and editing helpers for the deliberately small
 * inline-Markdown subset displayed by ObMind topics.
 *
 * This is not a general Markdown parser. Its two responsibilities are:
 *
 * 1. project the supported wrappers to the text shown by a topic; and
 * 2. retain source wrappers when a visible-text edit has one conservative,
 *    balanced source mapping.
 *
 * When a change crosses an ambiguous wrapper boundary, the planner falls back
 * to escaped plain Markdown. That loses presentation for that one topic but
 * cannot leave malformed emphasis, links, wikilinks, or code spans behind.
 */

export type InlineMarkdownEditStrategy =
	| "preserve-source"
	| "escaped-plain";

export interface InlineMarkdownEditResult {
	readonly source: string;
	readonly strategy: InlineMarkdownEditStrategy;
}

interface SourcePair {
	readonly openStart: number;
	readonly openEnd: number;
	readonly closeStart: number;
	readonly closeEnd: number;
}

type EditableContext =
	| "code"
	| "link-label"
	| "plain"
	| "wiki";

interface EditableContainer {
	readonly context: EditableContext;
	readonly sourceStart: number;
	sourceEnd: number;
	visibleStart: number;
	visibleEnd: number;
	readonly codeMarker?: string;
}

interface ProjectionBuilder {
	readonly source: string;
	visibleText: string;
	readonly boundaries: Map<number, number[]>;
	readonly containers: EditableContainer[];
	readonly pairs: SourcePair[];
	readonly links: InlineMarkdownLink[];
}

export interface InlineMarkdownProjection {
	readonly visibleText: string;
	readonly links: readonly InlineMarkdownLink[];
}

export interface InlineMarkdownLink {
	readonly kind: "markdown" | "wikilink";
	readonly target: string;
	readonly label: string;
	readonly embedded: boolean;
	readonly sourceStart: number;
	readonly sourceEnd: number;
	readonly visibleStart: number;
	readonly visibleEnd: number;
}

const BREAK_PATTERN = /^<br[ \t]*\/?>/i;
const ESCAPABLE_PUNCTUATION_PATTERN = /[\\`*_[\]{}()#+\-.!<>~]/;
const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}_]/u;

/**
 * Return the reader-visible topic text for the supported inline subset.
 */
export function projectInlineMarkdown(
	source: string,
): InlineMarkdownProjection {
	const trimmed = trimHorizontalWhitespace(source);
	const builder = createProjectionBuilder(trimmed.core);
	scanInlineRange(builder, 0, trimmed.core.length, "plain");
	trimProjectedVisibleText(builder);
	return {
		visibleText: builder.visibleText,
		links: cloneProjectedLinks(builder, trimmed.leading.length),
	};
}

/**
 * Apply a visible-text edit to inline Markdown.
 *
 * `null` means the expected visible value does not describe `source`, so the
 * caller must treat the source snapshot as stale. A successful plan always
 * keeps the result on one physical Markdown line: visible newlines are encoded
 * as `<br>`.
 */
export function planInlineMarkdownVisibleEdit(
	source: string,
	expectedVisibleText: string,
	nextVisibleText: string,
): InlineMarkdownEditResult | null {
	const trimmed = trimHorizontalWhitespace(source);
	const builder = createProjectionBuilder(trimmed.core);
	scanInlineRange(builder, 0, trimmed.core.length, "plain");
	trimProjectedVisibleText(builder);

	const currentVisibleText = builder.visibleText;
	const expected = normalizeVisibleText(expectedVisibleText).trim();
	const next = normalizeVisibleText(nextVisibleText).trim();
	if (currentVisibleText !== expected) {
		return null;
	}
	if (currentVisibleText === next) {
		return {
			source,
			strategy: "preserve-source",
		};
	}

	const change = findVisibleChange(currentVisibleText, next);
	const container = findSmallestEditableContainer(builder, change);
	if (container !== null) {
		const sourceStart = resolveSourceBoundary(
			builder,
			container,
			change.oldStart,
			"start",
		);
		const sourceEnd = resolveSourceBoundary(
			builder,
			container,
			change.oldEnd,
			"end",
		);
		const replacement = encodeForContext(
			next.slice(change.newStart, change.newEnd),
			container,
		);
		if (
			sourceStart !== null &&
			sourceEnd !== null &&
			replacement !== null &&
			sourceStart <= sourceEnd &&
			isBalancedReplacement(builder.pairs, sourceStart, sourceEnd)
		) {
			return {
				source:
					trimmed.leading +
					trimmed.core.slice(0, sourceStart) +
					replacement +
					trimmed.core.slice(sourceEnd) +
					trimmed.trailing,
				strategy: "preserve-source",
			};
		}
	}

	return {
		source:
			trimmed.leading +
			encodeVisibleTextAsInlineMarkdown(next) +
			trimmed.trailing,
		strategy: "escaped-plain",
	};
}

/**
 * Encode visible topic text as safe, single-physical-line Markdown.
 */
export function encodeVisibleTextAsInlineMarkdown(value: string): string {
	return normalizeVisibleText(value)
		.split("\n")
		.map((line) =>
			line
					.replace(/[\\`*_[\]<>~-]/g, "\\$&")
				.replace(
					/([ \t]+)(#+)$/,
					(_match, whitespace: string, hashes: string) =>
						`${whitespace}\\${hashes}`,
				),
		)
		.join("<br>");
}

function createProjectionBuilder(source: string): ProjectionBuilder {
	return {
		source,
		visibleText: "",
		boundaries: new Map([[0, [0]]]),
		containers: [],
		pairs: [],
		links: [],
	};
}

function cloneProjectedLinks(
	builder: ProjectionBuilder,
	sourceOffset: number,
): readonly InlineMarkdownLink[] {
	return [...builder.links]
		.sort(
			(left, right) =>
				left.sourceStart - right.sourceStart ||
				left.sourceEnd - right.sourceEnd,
		)
		.map((link) => ({
			...link,
			sourceStart: link.sourceStart + sourceOffset,
			sourceEnd: link.sourceEnd + sourceOffset,
			label: builder.visibleText.slice(
				link.visibleStart,
				link.visibleEnd,
			),
		}));
}

function trimProjectedVisibleText(builder: ProjectionBuilder): void {
	const leadingLength =
		builder.visibleText.length -
		builder.visibleText.trimStart().length;
	const trailingBoundary = builder.visibleText.trimEnd().length;
	if (
		leadingLength === 0 &&
		trailingBoundary === builder.visibleText.length
	) {
		return;
	}

	builder.visibleText = builder.visibleText.slice(
		leadingLength,
		trailingBoundary,
	);
	const adjustedBoundaries = new Map<number, number[]>();
	for (const [visibleOffset, sourceOffsets] of builder.boundaries) {
		if (
			visibleOffset < leadingLength ||
			visibleOffset > trailingBoundary
		) {
			continue;
		}
		adjustedBoundaries.set(
			visibleOffset - leadingLength,
			sourceOffsets,
		);
	}
	builder.boundaries.clear();
	for (const [visibleOffset, sourceOffsets] of adjustedBoundaries) {
		builder.boundaries.set(visibleOffset, sourceOffsets);
	}

	for (const container of builder.containers) {
		container.visibleStart = Math.max(
			0,
			container.visibleStart - leadingLength,
		);
		container.visibleEnd = Math.min(
			builder.visibleText.length,
			Math.max(0, container.visibleEnd - leadingLength),
		);
	}

	for (let index = builder.links.length - 1; index >= 0; index -= 1) {
		const link = builder.links[index];
		if (
			link === undefined ||
			link.visibleEnd <= leadingLength ||
			link.visibleStart >= trailingBoundary
		) {
			builder.links.splice(index, 1);
			continue;
		}
		builder.links[index] = {
			...link,
			visibleStart: Math.max(0, link.visibleStart - leadingLength),
			visibleEnd: Math.min(
				builder.visibleText.length,
				link.visibleEnd - leadingLength,
			),
		};
	}
}

function scanInlineRange(
	builder: ProjectionBuilder,
	start: number,
	end: number,
	context: EditableContext,
): void {
	let run: EditableContainer | null = null;
	const closeRun = (): void => {
		if (run !== null) {
			run.visibleEnd = builder.visibleText.length;
			if (run.visibleEnd > run.visibleStart) {
				builder.containers.push(run);
			}
			run = null;
		}
	};
	const ensureRun = (sourceStart: number): EditableContainer => {
		if (run === null) {
			run = {
				context,
				sourceStart,
				sourceEnd: sourceStart,
				visibleStart: builder.visibleText.length,
				visibleEnd: builder.visibleText.length,
			};
		}
		return run;
	};

	let index = start;
	while (index < end) {
		const code = findCodeSpan(builder.source, index, end);
		if (code !== null) {
			closeRun();
			const visibleStart = builder.visibleText.length;
			addLiteralRange(
				builder,
				code.contentStart,
				code.contentEnd,
				true,
			);
			builder.containers.push({
				context: "code",
				sourceStart: code.contentStart,
				sourceEnd: code.contentEnd,
				visibleStart,
				visibleEnd: builder.visibleText.length,
				codeMarker: code.marker,
			});
			builder.pairs.push({
				openStart: index,
				openEnd: code.contentStart,
				closeStart: code.contentEnd,
				closeEnd: code.end,
			});
			index = code.end;
			continue;
		}

		const link = findMarkdownLink(builder.source, index, end);
		if (link !== null) {
			closeRun();
			const visibleStart = builder.visibleText.length;
			scanInlineRange(
				builder,
				link.labelStart,
				link.labelEnd,
				"link-label",
			);
			builder.containers.push({
				context: "link-label",
				sourceStart: link.labelStart,
				sourceEnd: link.labelEnd,
				visibleStart,
				visibleEnd: builder.visibleText.length,
			});
			builder.pairs.push({
				openStart: index,
				openEnd: link.labelStart,
				closeStart: link.labelEnd,
				closeEnd: link.end,
			});
			builder.links.push({
				kind: "markdown",
				target: link.target,
				label: builder.visibleText.slice(
					visibleStart,
					builder.visibleText.length,
				),
				embedded: link.embedded,
				sourceStart: link.sourceStart,
				sourceEnd: link.end,
				visibleStart,
				visibleEnd: builder.visibleText.length,
			});
			index = link.end;
			continue;
		}

		const wiki = findWikiLink(builder.source, index, end);
		if (wiki !== null) {
			closeRun();
			const visibleStart = builder.visibleText.length;
			scanInlineRange(
				builder,
				wiki.visibleStart,
				wiki.visibleEnd,
				"wiki",
			);
			builder.containers.push({
				context: "wiki",
				sourceStart: wiki.visibleStart,
				sourceEnd: wiki.visibleEnd,
				visibleStart,
				visibleEnd: builder.visibleText.length,
			});
			builder.pairs.push({
				openStart: index,
				openEnd: wiki.visibleStart,
				closeStart: wiki.visibleEnd,
				closeEnd: wiki.end,
			});
			builder.links.push({
				kind: "wikilink",
				target: wiki.target,
				label: builder.visibleText.slice(
					visibleStart,
					builder.visibleText.length,
				),
				embedded: wiki.embedded,
				sourceStart: wiki.sourceStart,
				sourceEnd: wiki.end,
				visibleStart,
				visibleEnd: builder.visibleText.length,
			});
			index = wiki.end;
			continue;
		}

		const emphasis = findEmphasis(builder.source, index, end);
		if (emphasis !== null) {
			closeRun();
			const visibleStart = builder.visibleText.length;
			scanInlineRange(
				builder,
				emphasis.contentStart,
				emphasis.contentEnd,
				context,
			);
			builder.containers.push({
				context,
				sourceStart: emphasis.contentStart,
				sourceEnd: emphasis.contentEnd,
				visibleStart,
				visibleEnd: builder.visibleText.length,
			});
			builder.pairs.push({
				openStart: index,
				openEnd: emphasis.contentStart,
				closeStart: emphasis.contentEnd,
				closeEnd: emphasis.end,
			});
			index = emphasis.end;
			continue;
		}

		const escapedCharacter =
			builder.source[index] === "\\" &&
			index + 1 < end &&
			ESCAPABLE_PUNCTUATION_PATTERN.test(
				builder.source[index + 1] ?? "",
			);
		if (escapedCharacter) {
			const activeRun = ensureRun(index);
			addVisibleUnit(
				builder,
				builder.source[index + 1] ?? "",
				index,
				index + 2,
			);
			activeRun.sourceEnd = index + 2;
			index += 2;
			continue;
		}

		const breakMatch = BREAK_PATTERN.exec(builder.source.slice(index, end));
		if (breakMatch !== null) {
			const activeRun = ensureRun(index);
			addVisibleUnit(
				builder,
				"\n",
				index,
				index + breakMatch[0].length,
			);
			activeRun.sourceEnd = index + breakMatch[0].length;
			index += breakMatch[0].length;
			continue;
		}

		const activeRun = ensureRun(index);
		addVisibleUnit(
			builder,
			builder.source[index] ?? "",
			index,
			index + 1,
		);
		activeRun.sourceEnd = index + 1;
		index += 1;
	}
	closeRun();
}

function addLiteralRange(
	builder: ProjectionBuilder,
	start: number,
	end: number,
	treatBreakAsLiteral: boolean,
): void {
	let index = start;
	while (index < end) {
		if (!treatBreakAsLiteral) {
			const breakMatch = BREAK_PATTERN.exec(
				builder.source.slice(index, end),
			);
			if (breakMatch !== null) {
				addVisibleUnit(
					builder,
					"\n",
					index,
					index + breakMatch[0].length,
				);
				index += breakMatch[0].length;
				continue;
			}
		}
		addVisibleUnit(
			builder,
			builder.source[index] ?? "",
			index,
			index + 1,
		);
		index += 1;
	}
}

function addVisibleUnit(
	builder: ProjectionBuilder,
	visible: string,
	sourceStart: number,
	sourceEnd: number,
): void {
	const visibleStart = builder.visibleText.length;
	addBoundary(builder, visibleStart, sourceStart);
	builder.visibleText += visible;
	addBoundary(builder, builder.visibleText.length, sourceEnd);
}

function addBoundary(
	builder: ProjectionBuilder,
	visibleOffset: number,
	sourceOffset: number,
): void {
	const offsets = builder.boundaries.get(visibleOffset);
	if (offsets === undefined) {
		builder.boundaries.set(visibleOffset, [sourceOffset]);
		return;
	}
	if (!offsets.includes(sourceOffset)) {
		offsets.push(sourceOffset);
	}
}

function findSmallestEditableContainer(
	builder: ProjectionBuilder,
	change: VisibleChange,
): EditableContainer | null {
	const candidates = builder.containers.filter((container) => {
		if (
			change.oldStart < container.visibleStart ||
			change.oldEnd > container.visibleEnd
		) {
			return false;
		}
		if (change.oldStart === change.oldEnd) {
			return (
				(change.oldStart > container.visibleStart &&
					change.oldStart < container.visibleEnd) ||
				(container.visibleStart === 0 &&
					container.visibleEnd === builder.visibleText.length)
			);
		}
		return true;
	});
	candidates.sort((left, right) => {
		const leftSpan = left.visibleEnd - left.visibleStart;
		const rightSpan = right.visibleEnd - right.visibleStart;
		return leftSpan - rightSpan;
	});
	return candidates[0] ?? null;
}

function resolveSourceBoundary(
	builder: ProjectionBuilder,
	container: EditableContainer,
	visibleOffset: number,
	side: "end" | "start",
): number | null {
	if (visibleOffset === container.visibleStart) {
		return container.sourceStart;
	}
	if (visibleOffset === container.visibleEnd) {
		return container.sourceEnd;
	}

	const candidates = (builder.boundaries.get(visibleOffset) ?? []).filter(
		(sourceOffset) =>
			sourceOffset >= container.sourceStart &&
			sourceOffset <= container.sourceEnd,
	);
	if (candidates.length === 0) {
		return null;
	}
	return side === "start"
		? Math.max(...candidates)
		: Math.min(...candidates);
}

function encodeForContext(
	value: string,
	container: EditableContainer,
): string | null {
	if (container.context === "code") {
		if (
			value.includes("\n") ||
			(container.codeMarker !== undefined &&
				value.includes(container.codeMarker))
		) {
			return null;
		}
		return value;
	}
	if (container.context === "link-label" && value.includes("]")) {
		return null;
	}
	if (
		container.context === "wiki" &&
		(value.includes("]") || value.includes("|"))
	) {
		return null;
	}
	return encodeVisibleTextAsInlineMarkdown(value);
}

function isBalancedReplacement(
	pairs: readonly SourcePair[],
	start: number,
	end: number,
): boolean {
	for (const pair of pairs) {
		const removesOpen = start <= pair.openStart && end >= pair.openEnd;
		const removesClose =
			start <= pair.closeStart && end >= pair.closeEnd;
		if (removesOpen !== removesClose) {
			return false;
		}
	}
	return true;
}

interface VisibleChange {
	readonly oldStart: number;
	readonly oldEnd: number;
	readonly newStart: number;
	readonly newEnd: number;
}

function findVisibleChange(
	current: string,
	next: string,
): VisibleChange {
	let prefix = 0;
	while (
		prefix < current.length &&
		prefix < next.length &&
		current[prefix] === next[prefix]
	) {
		prefix += 1;
	}

	let suffix = 0;
	while (
		suffix < current.length - prefix &&
		suffix < next.length - prefix &&
		current[current.length - suffix - 1] ===
			next[next.length - suffix - 1]
	) {
		suffix += 1;
	}

	return {
		oldStart: prefix,
		oldEnd: current.length - suffix,
		newStart: prefix,
		newEnd: next.length - suffix,
	};
}

interface CodeSpan {
	readonly marker: string;
	readonly contentStart: number;
	readonly contentEnd: number;
	readonly end: number;
}

function findCodeSpan(
	source: string,
	start: number,
	end: number,
): CodeSpan | null {
	if (source[start] !== "`" || isEscaped(source, start)) {
		return null;
	}
	let markerEnd = start;
	while (markerEnd < end && source[markerEnd] === "`") {
		markerEnd += 1;
	}
	const marker = source.slice(start, markerEnd);
	const close = source.indexOf(marker, markerEnd);
	if (close < markerEnd || close + marker.length > end) {
		return null;
	}
	return {
		marker,
		contentStart: markerEnd,
		contentEnd: close,
		end: close + marker.length,
	};
}

interface MarkdownLink {
	readonly sourceStart: number;
	readonly labelStart: number;
	readonly labelEnd: number;
	readonly target: string;
	readonly embedded: boolean;
	readonly end: number;
}

function findMarkdownLink(
	source: string,
	start: number,
	end: number,
): MarkdownLink | null {
	const imageOffset = source.startsWith("![", start) ? 1 : 0;
	const bracketStart = start + imageOffset;
	if (
		source[bracketStart] !== "[" ||
		source[bracketStart + 1] === "[" ||
		isEscaped(source, bracketStart)
	) {
		return null;
	}
	const labelEnd = findUnescaped(source, "](", bracketStart + 1, end);
	if (labelEnd < 0) {
		return null;
	}
	const destinationStart = labelEnd + 2;
	const destinationEnd = findUnescaped(
		source,
		")",
		destinationStart,
		end,
	);
	if (destinationEnd < 0) {
		return null;
	}
	return {
		sourceStart: start,
		labelStart: bracketStart + 1,
		labelEnd,
		target: source.slice(destinationStart, destinationEnd).trim(),
		embedded: imageOffset === 1,
		end: destinationEnd + 1,
	};
}

interface WikiLink {
	readonly sourceStart: number;
	readonly visibleStart: number;
	readonly visibleEnd: number;
	readonly target: string;
	readonly embedded: boolean;
	readonly end: number;
}

function findWikiLink(
	source: string,
	start: number,
	end: number,
): WikiLink | null {
	const imageOffset = source.startsWith("![[", start) ? 1 : 0;
	const markerStart = start + imageOffset;
	if (
		!source.startsWith("[[", markerStart) ||
		isEscaped(source, markerStart)
	) {
		return null;
	}
	const close = findUnescaped(source, "]]", markerStart + 2, end);
	if (close < 0) {
		return null;
	}
	const contentStart = markerStart + 2;
	const content = source.slice(contentStart, close);
	const separator = content.lastIndexOf("|");
	const targetEnd =
		separator < 0 ? close : contentStart + separator;
	return {
		sourceStart: start,
		visibleStart:
			separator < 0 ? contentStart : contentStart + separator + 1,
		visibleEnd: close,
		target: source.slice(contentStart, targetEnd).trim(),
		embedded: imageOffset === 1,
		end: close + 2,
	};
}

interface EmphasisSpan {
	readonly contentStart: number;
	readonly contentEnd: number;
	readonly end: number;
}

function findEmphasis(
	source: string,
	start: number,
	end: number,
): EmphasisSpan | null {
	const markers = ["**", "__", "~~", "*", "_"] as const;
	for (const marker of markers) {
		if (
			!source.startsWith(marker, start) ||
			isEscaped(source, start) ||
			(marker.includes("_") &&
				isWordCharacter(source[start - 1]))
		) {
			continue;
		}
		const contentStart = start + marker.length;
		let close = source.indexOf(marker, contentStart);
		while (close >= 0 && close + marker.length <= end) {
			if (
				!isEscaped(source, close) &&
				(!marker.includes("_") ||
					!isWordCharacter(source[close + marker.length]))
			) {
				return {
					contentStart,
					contentEnd: close,
					end: close + marker.length,
				};
			}
			close = source.indexOf(marker, close + 1);
		}
	}
	return null;
}

function findUnescaped(
	source: string,
	needle: string,
	start: number,
	end: number,
): number {
	let index = source.indexOf(needle, start);
	while (index >= 0 && index + needle.length <= end) {
		if (!isEscaped(source, index)) {
			return index;
		}
		index = source.indexOf(needle, index + 1);
	}
	return -1;
}

function isEscaped(source: string, index: number): boolean {
	let slashes = 0;
	for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
		if (source[cursor] !== "\\") {
			break;
		}
		slashes += 1;
	}
	return slashes % 2 === 1;
}

function isWordCharacter(character: string | undefined): boolean {
	return character !== undefined && WORD_CHARACTER_PATTERN.test(character);
}

function normalizeVisibleText(value: string): string {
	return value.replace(/\r\n?/g, "\n");
}

function trimHorizontalWhitespace(source: string): {
	readonly leading: string;
	readonly core: string;
	readonly trailing: string;
} {
	const leading = /^[ \t]*/.exec(source)?.[0] ?? "";
	const withoutLeading = source.slice(leading.length);
	const trailing = /[ \t]*$/.exec(withoutLeading)?.[0] ?? "";
	return {
		leading,
		core: withoutLeading.slice(
			0,
			withoutLeading.length - trailing.length,
		),
		trailing,
	};
}
