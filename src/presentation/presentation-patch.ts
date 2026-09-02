import type {
	MindMapFrontendCapabilities,
	MindMapLayoutCapability,
	MindMapLayoutOptionCapability,
} from "../ui/frontend";
import type {
	MindMapDecoration,
	MindMapEdgePresentation,
	MindMapLayoutSpec,
	MindMapNodeContent,
	MindMapNodePresentation,
	MindMapNodeTypography,
	MindMapPresentation,
	MindMapThemeColor,
	MindMapThemeSpec,
} from "./presentation";
import { composeMindMapTheme } from "./presentation";
import { validateMindMapDecoration } from "./decorations";

const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const SAFE_HOST_TOKEN_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;
const SAFE_LITERAL_COLOR_PATTERN =
	/^#[0-9a-fA-F]{3,4}(?:[0-9a-fA-F]{3,4})?$/;
const MAX_PRESENTATION_NUMBER = 10_000;
const MAX_TEXT_LENGTH = 100_000;

export interface MindMapPresentationPatch {
	readonly layout?: MindMapLayoutSpec;
	readonly styleId?: string;
	readonly paletteId?: string;
	readonly fontFamilyId?: string;
	readonly connectorWidthId?: string;
	readonly connectorProfileId?: string;
	/**
	 * Sparse changes keyed by current parsed node IDs. `null` removes an
	 * existing override.
	 */
	readonly nodes?: ReadonlyMap<string, MindMapNodePresentation | null>;
	/**
	 * Sparse changes keyed by deterministic layout edge IDs. `null` removes an
	 * existing override.
	 */
	readonly edges?: ReadonlyMap<string, MindMapEdgePresentation | null>;
	/** When present, replaces the complete decoration list. */
	readonly decorations?: readonly MindMapDecoration[];
}

export interface MindMapPresentationPatchContext {
	readonly capabilities: MindMapFrontendCapabilities;
	readonly nodeIds?: ReadonlySet<string>;
	readonly edgeIds?: ReadonlySet<string>;
}

/**
 * Validate and immutably apply one renderer-neutral presentation command.
 *
 * Registered capabilities are the source of truth. In particular, a stored
 * theme ID resolves to the registered theme snapshot rather than accepting an
 * untrusted serialized theme object.
 */
export function applyMindMapPresentationPatch(
	current: MindMapPresentation,
	patch: MindMapPresentationPatch,
	context: MindMapPresentationPatchContext,
): MindMapPresentation {
	const layout =
		patch.layout === undefined
			? current.layout
			: validateLayout(patch.layout, context.capabilities);
	const theme =
		patch.styleId === undefined && patch.paletteId === undefined
			? current.theme
			: resolveThemeComposition(
					patch.styleId ??
						resolveAvailableStyleId(
							current.theme.styleId,
							context.capabilities,
						),
					patch.paletteId ??
						resolveAvailablePaletteId(
							current.theme.paletteId,
							context.capabilities,
						),
					context.capabilities,
				);
	const formatting =
		patch.fontFamilyId === undefined &&
		patch.connectorWidthId === undefined &&
		patch.connectorProfileId === undefined
			? current.formatting
			: resolveGlobalPresentation(
					patch.fontFamilyId ??
						resolveAvailableGlobalFontId(
							current.formatting.fontFamily.id,
							context.capabilities,
						),
					patch.connectorWidthId ??
						resolveAvailableConnectorWidthId(
							current.formatting.connectorWidth.id,
							context.capabilities,
						),
					patch.connectorProfileId ??
						resolveAvailableConnectorProfileId(
							current.formatting.connectorProfile.id,
							context.capabilities,
						),
					context.capabilities,
				);
	const nodes = applyNodeOverrides(current.nodes, patch.nodes, context);
	const edges = applyEdgeOverrides(current.edges, patch.edges, context);
	const decorations =
		patch.decorations === undefined
			? cloneDecorations(current.decorations)
			: validateDecorations(patch.decorations, context);

	return {
		revision: current.revision + 1,
		layout,
		theme,
		formatting,
		nodes,
		edges,
		decorations,
	};
}

export function createMindMapPresentationPatch(
	previous: MindMapPresentation,
	next: MindMapPresentation,
): MindMapPresentationPatch {
	return {
		...(layoutEquals(previous.layout, next.layout)
			? {}
			: { layout: cloneLayout(next.layout) }),
		...(previous.theme.styleId === next.theme.styleId
			? {}
			: { styleId: next.theme.styleId }),
		...(previous.theme.paletteId === next.theme.paletteId
			? {}
			: { paletteId: next.theme.paletteId }),
		...(previous.formatting.fontFamily.id === next.formatting.fontFamily.id
			? {}
			: { fontFamilyId: next.formatting.fontFamily.id }),
		...(previous.formatting.connectorWidth.id ===
			next.formatting.connectorWidth.id
			? {}
			: { connectorWidthId: next.formatting.connectorWidth.id }),
		...(previous.formatting.connectorProfile.id ===
			next.formatting.connectorProfile.id
			? {}
			: { connectorProfileId: next.formatting.connectorProfile.id }),
		...(mapEquals(previous.nodes, next.nodes, nodePresentationEquals)
			? {}
			: {
					nodes: replacementMap(
						previous.nodes,
						next.nodes,
						nodePresentationEquals,
					),
				}),
		...(mapEquals(previous.edges, next.edges, edgePresentationEquals)
			? {}
			: {
					edges: replacementMap(
						previous.edges,
						next.edges,
						edgePresentationEquals,
					),
				}),
		...(decorationsEqual(previous.decorations, next.decorations)
			? {}
			: { decorations: cloneDecorations(next.decorations) }),
	};
}

export function validateMindMapNodePresentation(
	value: unknown,
	capabilities?: MindMapFrontendCapabilities,
): MindMapNodePresentation {
	if (!isRecord(value)) {
		throw new TypeError("Node presentation must be an object.");
	}
	const role = optionalEnum(value.role, [
		"root",
		"main-topic",
		"subtopic",
	] as const);
	const variant = optionalIdentifier(value.variant, "node variant");
	const shape = optionalEnum(value.shape, [
		"rounded-rectangle",
		"rectangle",
		"pill",
		"ellipse",
		"diamond",
		"underline",
		"none",
	] as const);
	if (
		shape !== undefined &&
		capabilities !== undefined &&
		!capabilities.nodeShapes.includes(shape)
	) {
		throw new RangeError(`Unsupported node shape "${shape}".`);
	}
	const fill = optionalColor(value.fill);
	const stroke = optionalColor(value.stroke);
	const textColor = optionalColor(value.textColor);
	const borderWidth = optionalFiniteNumber(value.borderWidth, "border width");
	const radius = optionalFiniteNumber(value.radius, "radius");
	const maxWidth = optionalFiniteNumber(value.maxWidth, "maximum width");
	const minHeight = optionalFiniteNumber(value.minHeight, "minimum height");
	const paddingInline = optionalFiniteNumber(
		value.paddingInline,
		"inline padding",
	);
	const paddingBlock = optionalFiniteNumber(
		value.paddingBlock,
		"block padding",
	);
	const typography =
		value.typography === undefined
			? undefined
			: validateTypography(value.typography);
	const iconId = optionalIdentifier(value.iconId, "icon ID");
	if (
		iconId !== undefined &&
		capabilities !== undefined &&
		!capabilities.assets.some(
			(asset) => asset.kind === "icon" && asset.id === iconId,
		)
	) {
		throw new RangeError(`Unsupported icon "${iconId}".`);
	}
	const markerIds = validateMarkerIds(value.markerIds, capabilities);
	const branchColorIndex = optionalInteger(
		value.branchColorIndex,
		"branch color index",
	);
	const content =
		value.content === undefined
			? undefined
			: validateNodeContent(value.content, capabilities);

	return compactObject({
		role,
		variant,
		shape,
		fill,
		stroke,
		textColor,
		borderWidth,
		radius,
		maxWidth,
		minHeight,
		paddingInline,
		paddingBlock,
		typography,
		iconId,
		markerIds,
		branchColorIndex,
		content,
	});
}

export function validateMindMapEdgePresentation(
	value: unknown,
	capabilities?: MindMapFrontendCapabilities,
): MindMapEdgePresentation {
	if (!isRecord(value)) {
		throw new TypeError("Edge presentation must be an object.");
	}
	const variant = optionalIdentifier(value.variant, "edge variant");
	const color = optionalColor(value.color);
	const width = optionalFiniteNumber(value.width, "edge width");
	const routing = optionalEnum(value.routing, [
		"bezier",
		"straight",
		"orthogonal",
		"rounded-orthogonal",
	] as const);
	if (
		routing !== undefined &&
		capabilities !== undefined &&
		!capabilities.edgeRoutings.includes(routing)
	) {
		throw new RangeError(`Unsupported edge routing "${routing}".`);
	}
	const lineStyle = optionalEnum(value.lineStyle, [
		"solid",
		"dashed",
		"dotted",
	] as const);
	const branchColorIndex = optionalInteger(
		value.branchColorIndex,
		"branch color index",
	);
	return compactObject({
		variant,
		color,
		width,
		routing,
		lineStyle,
		branchColorIndex,
	});
}

export function isSafePresentationIdentifier(value: string): boolean {
	return SAFE_IDENTIFIER_PATTERN.test(value);
}

export function isSafeMindMapThemeColor(
	value: unknown,
): value is MindMapThemeColor {
	if (!isRecord(value)) {
		return false;
	}
	if (value.kind === "host") {
		return (
			typeof value.token === "string" &&
			SAFE_HOST_TOKEN_PATTERN.test(value.token)
		);
	}
	return (
		value.kind === "literal" &&
		typeof value.value === "string" &&
		SAFE_LITERAL_COLOR_PATTERN.test(value.value)
	);
}

function validateLayout(
	layout: MindMapLayoutSpec,
	capabilities: MindMapFrontendCapabilities,
): MindMapLayoutSpec {
	if (!isRecord(layout)) {
		throw new TypeError("Layout presentation must be an object.");
	}
	const capability = capabilities.layouts.find(
		(candidate) => candidate.engineId === layout.engineId,
	);
	if (capability === undefined) {
		throw new RangeError(`Unsupported layout engine "${layout.engineId}".`);
	}
	if (!capability.orientations.includes(layout.orientation)) {
		throw new RangeError(
			`Layout "${layout.engineId}" does not support "${layout.orientation}".`,
		);
	}
	const spacing = validateLayoutSpacing(layout, capability);
	const options = validateLayoutOptions(layout.options, capability);
	if (
		typeof layout.revision !== "string" &&
		(typeof layout.revision !== "number" ||
			!Number.isFinite(layout.revision))
	) {
		throw new TypeError("Layout revision must be a finite number or string.");
	}
	return {
		revision: layout.revision,
		engineId: capability.engineId,
		orientation: layout.orientation,
		spacing,
		options,
	};
}

function validateLayoutSpacing(
	layout: MindMapLayoutSpec,
	capability: MindMapLayoutCapability,
): MindMapLayoutSpec["spacing"] {
	if (!isRecord(layout.spacing)) {
		throw new TypeError("Layout spacing must be an object.");
	}
	const result = {
		level: requireFiniteNumber(layout.spacing.level, "level spacing"),
		sibling: requireFiniteNumber(layout.spacing.sibling, "sibling spacing"),
		subtree: requireFiniteNumber(layout.spacing.subtree, "subtree spacing"),
	};
	if (!capability.supportsSpacing) {
		return result;
	}
	for (const key of ["level", "sibling", "subtree"] as const) {
		const range = capability.spacing?.[key];
		if (
			range === undefined ||
			result[key] < range.minimum ||
			result[key] > range.maximum
		) {
			throw new RangeError(
				`${range?.label ?? key} spacing is outside the supported range.`,
			);
		}
	}
	return result;
}

function validateLayoutOptions(
	options: Readonly<Record<string, unknown>>,
	capability: MindMapLayoutCapability,
): Readonly<Record<string, unknown>> {
	if (!isRecord(options)) {
		throw new TypeError("Layout options must be an object.");
	}
	const validated: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(options)) {
		const option = capability.options.find((candidate) => candidate.key === key);
		if (option === undefined) {
			throw new RangeError(`Unsupported layout option "${key}".`);
		}
		validated[key] = validateLayoutOption(value, option);
	}
	return validated;
}

function validateLayoutOption(
	value: unknown,
	option: MindMapLayoutOptionCapability,
): string | number | boolean {
	switch (option.type) {
		case "boolean":
			if (typeof value !== "boolean") {
				throw new TypeError(`${option.label} must be true or false.`);
			}
			return value;
		case "number": {
			const number = requireFiniteNumber(value, option.label);
			if (
				(option.minimum !== undefined && number < option.minimum) ||
				(option.maximum !== undefined && number > option.maximum)
			) {
				throw new RangeError(`${option.label} is outside the supported range.`);
			}
			return number;
		}
		case "select":
			if (
				typeof value !== "string" ||
				!option.choices.some((choice) => choice.value === value)
			) {
				throw new RangeError(`${option.label} has an unsupported value.`);
			}
			return value;
	}
}

function resolveThemeComposition(
	styleId: string,
	paletteId: string,
	capabilities: MindMapFrontendCapabilities,
): MindMapThemeSpec {
	if (!isSafePresentationIdentifier(styleId)) {
		throw new TypeError("Style ID is not safe.");
	}
	if (!isSafePresentationIdentifier(paletteId)) {
		throw new TypeError("Palette ID is not safe.");
	}
	const style = capabilities.styles.find(
		(candidate) => candidate.id === styleId,
	);
	if (style === undefined) {
		throw new RangeError(`Unsupported mind-map style "${styleId}".`);
	}
	const palette = capabilities.palettes.find(
		(candidate) => candidate.id === paletteId,
	);
	if (palette === undefined) {
		throw new RangeError(`Unsupported mind-map palette "${paletteId}".`);
	}
	return composeMindMapTheme(style.style, palette.palette);
}

function resolveGlobalPresentation(
	fontFamilyId: string,
	connectorWidthId: string,
	connectorProfileId: string,
	capabilities: MindMapFrontendCapabilities,
): MindMapPresentation["formatting"] {
	if (!isSafePresentationIdentifier(fontFamilyId)) {
		throw new TypeError("Global font ID is not safe.");
	}
	if (!isSafePresentationIdentifier(connectorWidthId)) {
		throw new TypeError("Connector width ID is not safe.");
	}
	if (!isSafePresentationIdentifier(connectorProfileId)) {
		throw new TypeError("Connector profile ID is not safe.");
	}
	const fontFamily = capabilities.globalFonts.find(
		(candidate) => candidate.id === fontFamilyId,
	);
	if (fontFamily === undefined) {
		throw new RangeError(`Unsupported global font "${fontFamilyId}".`);
	}
	if (
		fontFamily.fontFamilyToken !== null &&
		!SAFE_HOST_TOKEN_PATTERN.test(fontFamily.fontFamilyToken)
	) {
		throw new TypeError("Global font capability contains an unsafe token.");
	}
	const connectorWidth = capabilities.connectorWidths.find(
		(candidate) => candidate.id === connectorWidthId,
	);
	if (connectorWidth === undefined) {
		throw new RangeError(
			`Unsupported connector width "${connectorWidthId}".`,
		);
	}
	if (
		connectorWidth.width !== null &&
		(!Number.isFinite(connectorWidth.width) ||
			connectorWidth.width <= 0 ||
			connectorWidth.width > MAX_PRESENTATION_NUMBER)
	) {
		throw new RangeError(
			"Connector width capability contains an invalid width.",
		);
	}
	const connectorProfile = capabilities.connectorProfiles.find(
		(candidate) => candidate.id === connectorProfileId,
	);
	if (connectorProfile === undefined) {
		throw new RangeError(
			`Unsupported connector profile "${connectorProfileId}".`,
		);
	}
	if (
		connectorProfile.profile !== null &&
		connectorProfile.profile.kind === "taper-to-child" &&
		(!Number.isFinite(connectorProfile.profile.childWidthRatio) ||
			connectorProfile.profile.childWidthRatio <= 0 ||
			connectorProfile.profile.childWidthRatio > 1)
	) {
		throw new RangeError(
			"Connector profile capability contains an invalid child width ratio.",
		);
	}
	return {
		fontFamily: {
			...fontFamily,
		},
		connectorWidth: {
			...connectorWidth,
		},
		connectorProfile: {
			...connectorProfile,
			profile:
				connectorProfile.profile === null
					? null
					: { ...connectorProfile.profile },
		},
	};
}

function resolveAvailableStyleId(
	styleId: string,
	capabilities: MindMapFrontendCapabilities,
): string {
	return capabilities.styles.some((candidate) => candidate.id === styleId)
		? styleId
		: capabilities.defaultStyleId;
}

function resolveAvailablePaletteId(
	paletteId: string,
	capabilities: MindMapFrontendCapabilities,
): string {
	return capabilities.palettes.some(
		(candidate) => candidate.id === paletteId,
	)
		? paletteId
		: capabilities.defaultPaletteId;
}

function resolveAvailableGlobalFontId(
	fontFamilyId: string,
	capabilities: MindMapFrontendCapabilities,
): string {
	return capabilities.globalFonts.some(
		(candidate) => candidate.id === fontFamilyId,
	)
		? fontFamilyId
		: capabilities.defaultGlobalFontId;
}

function resolveAvailableConnectorWidthId(
	connectorWidthId: string,
	capabilities: MindMapFrontendCapabilities,
): string {
	return capabilities.connectorWidths.some(
		(candidate) => candidate.id === connectorWidthId,
	)
		? connectorWidthId
		: capabilities.defaultConnectorWidthId;
}

function resolveAvailableConnectorProfileId(
	connectorProfileId: string,
	capabilities: MindMapFrontendCapabilities,
): string {
	return capabilities.connectorProfiles.some(
		(candidate) => candidate.id === connectorProfileId,
	)
		? connectorProfileId
		: capabilities.defaultConnectorProfileId;
}

function applyNodeOverrides(
	current: ReadonlyMap<string, MindMapNodePresentation>,
	patch: MindMapPresentationPatch["nodes"],
	context: MindMapPresentationPatchContext,
): ReadonlyMap<string, MindMapNodePresentation> {
	const result = new Map(current);
	if (patch === undefined) {
		return result;
	}
	if (!context.capabilities.supportsPerElementPresentation) {
		throw new RangeError("The active frontend does not support node overrides.");
	}
	for (const [nodeId, value] of patch) {
		requireCurrentId(nodeId, context.nodeIds, "node");
		if (value === null) {
			result.delete(nodeId);
		} else {
			result.set(
				nodeId,
				validateMindMapNodePresentation(value, context.capabilities),
			);
		}
	}
	return result;
}

function applyEdgeOverrides(
	current: ReadonlyMap<string, MindMapEdgePresentation>,
	patch: MindMapPresentationPatch["edges"],
	context: MindMapPresentationPatchContext,
): ReadonlyMap<string, MindMapEdgePresentation> {
	const result = new Map(current);
	if (patch === undefined) {
		return result;
	}
	if (!context.capabilities.supportsPerElementPresentation) {
		throw new RangeError("The active frontend does not support edge overrides.");
	}
	for (const [edgeId, value] of patch) {
		requireCurrentId(edgeId, context.edgeIds, "edge");
		if (value === null) {
			result.delete(edgeId);
		} else {
			result.set(
				edgeId,
				validateMindMapEdgePresentation(value, context.capabilities),
			);
		}
	}
	return result;
}

function validateDecorations(
	decorations: readonly MindMapDecoration[],
	context: MindMapPresentationPatchContext,
): readonly MindMapDecoration[] {
	if (!Array.isArray(decorations)) {
		throw new TypeError("Decorations must be an array.");
	}
	const ids = new Set<string>();
	return decorations.map((decoration) => {
		if (!isRecord(decoration)) {
			throw new TypeError("Decoration must be an object.");
		}
		if (
			typeof decoration.id !== "string" ||
			!isSafePresentationIdentifier(decoration.id) ||
			ids.has(decoration.id)
		) {
			throw new TypeError("Decoration IDs must be safe and unique.");
		}
		ids.add(decoration.id);
		if (
			typeof decoration.kind !== "string" ||
			!context.capabilities.renderedDecorations.includes(
				decoration.kind as MindMapDecoration["kind"],
			)
		) {
			throw new RangeError(
				`Unsupported decoration kind "${String(decoration.kind)}".`,
			);
		}
		return validateDecoration(decoration as unknown as MindMapDecoration, context);
	});
}

function validateDecoration(
	decoration: MindMapDecoration,
	context: MindMapPresentationPatchContext,
): MindMapDecoration {
	const validated = validateMindMapDecoration(decoration, {
		nodeIds: context.nodeIds,
	});
	if (validated.kind === "marker") {
		return {
			...validated,
			markerId: requireDecorationMarkerAsset(
				validated.markerId,
				validated.label,
				context.capabilities,
			),
		};
	}
	return validated;
}

function validateTypography(value: unknown): MindMapNodeTypography {
	if (!isRecord(value)) {
		throw new TypeError("Node typography must be an object.");
	}
	const fontFamilyToken = optionalIdentifier(
		value.fontFamilyToken,
		"font family token",
	);
	return compactObject({
		fontFamilyToken,
		fontSize: optionalFiniteNumber(value.fontSize, "font size"),
		fontWeight: optionalFiniteNumber(value.fontWeight, "font weight"),
		lineHeight: optionalFiniteNumber(value.lineHeight, "line height"),
		italic:
			value.italic === undefined
				? undefined
				: requireBoolean(value.italic, "italic"),
	});
}

function validateNodeContent(
	value: unknown,
	capabilities?: MindMapFrontendCapabilities,
): MindMapNodeContent {
	if (
		!isRecord(value) ||
		typeof value.plainText !== "string" ||
		!Array.isArray(value.runs)
	) {
		throw new TypeError("Node content must contain plain text and text runs.");
	}
	const plainText = requireText(value.plainText);
	if (
		value.runs.length > 0 &&
		capabilities !== undefined &&
		!capabilities.supportsRichTextRuns
	) {
		throw new RangeError("The active frontend does not support rich text runs.");
	}
	const runs = value.runs.map((run) => {
		if (!isRecord(run)) {
			throw new TypeError("Rich text runs must be objects.");
		}
		return compactObject({
			text: requireText(run.text),
			bold: optionalBoolean(run.bold, "bold"),
			italic: optionalBoolean(run.italic, "italic"),
			code: optionalBoolean(run.code, "code"),
			strike: optionalBoolean(run.strike, "strike"),
			color: optionalColor(run.color),
		});
	});
	return { plainText, runs };
}

function validateMarkerIds(
	value: unknown,
	capabilities?: MindMapFrontendCapabilities,
): readonly string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value)) {
		throw new TypeError("Marker IDs must be an array.");
	}
	const result = (value as unknown[]).map((id) =>
		capabilities === undefined
			? requireIdentifier(id, "marker ID")
			: requireAsset(id, "marker", capabilities),
	);
	if (new Set(result).size !== result.length) {
		throw new TypeError("Marker IDs must be unique.");
	}
	return result;
}

function requireAsset(
	id: unknown,
	kind: "icon" | "marker",
	capabilities: MindMapFrontendCapabilities,
): string {
	const safeId = requireIdentifier(id, `${kind} ID`);
	if (
		!capabilities.assets.some(
			(asset) => asset.kind === kind && asset.id === safeId,
		)
	) {
		throw new RangeError(`Unsupported ${kind} "${safeId}".`);
	}
	return safeId;
}

/**
 * Point decorations host both icon-like marker glyphs and the dedicated
 * free-text tag visual. Node `markerIds` remain marker-only, so choosing a
 * tag here cannot leak into the node-presentation asset slots.
 */
function requireDecorationMarkerAsset(
	id: unknown,
	label: string | undefined,
	capabilities: MindMapFrontendCapabilities,
): string {
	const safeId = requireIdentifier(id, "decoration marker ID");
	const asset = capabilities.assets.find((candidate) => candidate.id === safeId);
	if (asset === undefined || (asset.kind !== "marker" && asset.kind !== "tag")) {
		throw new RangeError(
			`Unsupported decoration marker or tag "${safeId}".`,
		);
	}
	if (
		asset.kind === "tag" &&
		(asset.visual.labelContent === undefined || label?.trim().length === 0 || label === undefined)
	) {
		throw new TypeError("Tag marker decorations require text.");
	}
	return safeId;
}

function requireCurrentId(
	id: unknown,
	known: ReadonlySet<string> | undefined,
	kind: "node" | "edge",
): string {
	if (typeof id !== "string" || id.length === 0) {
		throw new TypeError(`Presentation ${kind} IDs must be non-empty strings.`);
	}
	if (known !== undefined && !known.has(id)) {
		throw new RangeError(`Unknown presentation ${kind} ID "${id}".`);
	}
	return id;
}

function optionalColor(
	value: unknown,
): MindMapThemeColor | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!isSafeMindMapThemeColor(value)) {
		throw new TypeError("Presentation colors must be safe host tokens or hex.");
	}
	return { ...value };
}

function optionalIdentifier(
	value: unknown,
	label: string,
): string | undefined {
	return value === undefined ? undefined : requireIdentifier(value, label);
}

function requireIdentifier(value: unknown, label: string): string {
	if (
		typeof value !== "string" ||
		!isSafePresentationIdentifier(value)
	) {
		throw new TypeError(`${label} is not a safe identifier.`);
	}
	return value;
}

function requireText(value: unknown): string {
	if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH) {
		throw new TypeError("Presentation text must be a bounded string.");
	}
	return value;
}

function optionalFiniteNumber(
	value: unknown,
	label: string,
): number | undefined {
	return value === undefined ? undefined : requireFiniteNumber(value, label);
}

function requireFiniteNumber(value: unknown, label: string): number {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < 0 ||
		value > MAX_PRESENTATION_NUMBER
	) {
		throw new RangeError(
			`${label} must be a finite number between 0 and ${MAX_PRESENTATION_NUMBER}.`,
		);
	}
	return value;
}

function optionalInteger(
	value: unknown,
	label: string,
): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	const number = requireFiniteNumber(value, label);
	if (!Number.isInteger(number)) {
		throw new TypeError(`${label} must be an integer.`);
	}
	return number;
}

function optionalBoolean(
	value: unknown,
	label: string,
): boolean | undefined {
	return value === undefined ? undefined : requireBoolean(value, label);
}

function requireBoolean(value: unknown, label: string): boolean {
	if (typeof value !== "boolean") {
		throw new TypeError(`${label} must be true or false.`);
	}
	return value;
}

function optionalEnum<T extends string>(
	value: unknown,
	values: readonly T[],
): T | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "string" || !values.includes(value as T)) {
		throw new RangeError("Unsupported presentation value.");
	}
	return value as T;
}

function cloneLayout(layout: MindMapLayoutSpec): MindMapLayoutSpec {
	return {
		...layout,
		spacing: { ...layout.spacing },
		options: { ...layout.options },
	};
}

function cloneDecorations(
	decorations: readonly MindMapDecoration[],
): readonly MindMapDecoration[] {
	return decorations.map((decoration) => {
		switch (decoration.kind) {
			case "marker":
			case "relationship":
				return { ...decoration };
			case "boundary":
			case "summary":
				return { ...decoration, nodeIds: [...decoration.nodeIds] };
		}
	});
}

function replacementMap<T>(
	previous: ReadonlyMap<string, T>,
	next: ReadonlyMap<string, T>,
	equals: (left: T, right: T) => boolean,
): ReadonlyMap<string, T | null> {
	const changes = new Map<string, T | null>();
	for (const [key, previousValue] of previous) {
		const nextValue = next.get(key);
		if (nextValue === undefined) {
			changes.set(key, null);
		} else if (!equals(previousValue, nextValue)) {
			changes.set(key, nextValue);
		}
	}
	for (const [key, value] of next) {
		if (!previous.has(key)) {
			changes.set(key, value);
		}
	}
	return changes;
}

function layoutEquals(left: MindMapLayoutSpec, right: MindMapLayoutSpec): boolean {
	return (
		left.engineId === right.engineId &&
		left.orientation === right.orientation &&
		left.spacing.level === right.spacing.level &&
		left.spacing.sibling === right.spacing.sibling &&
		left.spacing.subtree === right.spacing.subtree &&
		stableJson(left.options) === stableJson(right.options)
	);
}

function mapEquals<T>(
	left: ReadonlyMap<string, T>,
	right: ReadonlyMap<string, T>,
	equals: (leftValue: T, rightValue: T) => boolean,
): boolean {
	if (left.size !== right.size) {
		return false;
	}
	for (const [key, value] of left) {
		const other = right.get(key);
		if (other === undefined || !equals(value, other)) {
			return false;
		}
	}
	return true;
}

function nodePresentationEquals(
	left: MindMapNodePresentation,
	right: MindMapNodePresentation,
): boolean {
	return stableJson(left) === stableJson(right);
}

function edgePresentationEquals(
	left: MindMapEdgePresentation,
	right: MindMapEdgePresentation,
): boolean {
	return stableJson(left) === stableJson(right);
}

function decorationsEqual(
	left: readonly MindMapDecoration[],
	right: readonly MindMapDecoration[],
): boolean {
	return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
	return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortJson);
	}
	if (!isRecord(value)) {
		return value;
	}
	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, child]) => [key, sortJson(child)]),
	);
}

function compactObject<T extends object>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(([, child]) => child !== undefined),
	) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
