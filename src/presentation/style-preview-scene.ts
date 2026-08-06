import type {
	MindMapConnectorStrokeProfile,
	MindMapEdgeRouting,
	MindMapLineStyle,
	MindMapNodePresentation,
	MindMapNodeFillSource,
	MindMapNodeRole,
	MindMapNodeShape,
	MindMapRenderEffectKind,
	MindMapRenderEffectRef,
	MindMapStyleSpec,
	MindMapThemeTypographyTokens,
} from "./presentation";
import { resolveMindMapNodeFillSource } from "./presentation";
import {
	CHARCOAL_EDGE_EFFECT_ID,
	CHARCOAL_FILL_EFFECT_ID,
	CHARCOAL_PAPER_EFFECT_ID,
	CHARCOAL_CONTOUR_DASH_ARRAY,
	CHARCOAL_STROKE_EFFECT_ID,
	PAPER_GRAIN_EFFECT_ID,
	PENCIL_DOUBLE_STROKE_EFFECT_ID,
	PENCIL_EDGE_EFFECT_ID,
	PENCIL_HATCH_EFFECT_ID,
	TECHNICAL_GRID_EFFECT_ID,
	type MindMapRenderEffectCapability,
	type MindMapRenderEffectResolver,
} from "./render-effects";

/**
 * A renderer-neutral miniature scene used by style pickers. It deliberately
 * contains semantic roles and resolved style metrics rather than HTML/SVG so
 * another frontend can render the same preview with Canvas, native controls,
 * or a thumbnail exporter.
 */
export interface MindMapStylePreviewScene {
	readonly width: number;
	readonly height: number;
	readonly nodes: readonly MindMapStylePreviewNode[];
	readonly edges: readonly MindMapStylePreviewEdge[];
	readonly effects: MindMapStylePreviewEffects;
}

export interface MindMapStylePreviewPoint {
	readonly x: number;
	readonly y: number;
}

export interface MindMapStylePreviewTypography {
	readonly fontFamilyToken: string;
	readonly fontSize: number;
	readonly fontWeight: number;
	readonly lineHeight: number;
}

/** The full resolved role metrics, not just scaled thumbnail dimensions. */
export interface MindMapStylePreviewRoleMetrics {
	readonly maxWidth: number;
	readonly minHeight: number;
	readonly paddingInline: number;
	readonly paddingBlock: number;
	readonly borderWidth: number;
	readonly radius: number;
	readonly typography: MindMapStylePreviewTypography;
}

export interface MindMapStylePreviewNode {
	readonly id: string;
	readonly role: MindMapNodeRole;
	readonly label: string;
	readonly shape: MindMapNodeShape;
	readonly fillSource: MindMapNodeFillSource;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly metrics: MindMapStylePreviewRoleMetrics;
}

export interface MindMapStylePreviewEdge {
	readonly id: string;
	readonly sourceNodeId: string;
	readonly targetNodeId: string;
	readonly from: MindMapStylePreviewPoint;
	readonly to: MindMapStylePreviewPoint;
	readonly routing: MindMapEdgeRouting;
	readonly lineStyle: MindMapLineStyle;
	readonly connectorProfile: MindMapConnectorStrokeProfile;
	/** Scaled for the thumbnail while retaining the source profile above. */
	readonly strokeWidth: number;
	readonly edgeEffect: MindMapStylePreviewEffect | null;
}

/**
 * Presentation semantics for registered render-effect profiles. These values
 * are intentionally visual-neutral: they describe the tiny preview without
 * leaking DOM/CSS implementation details into style specifications.
 */
export interface MindMapStylePreviewEffectPresentation {
	readonly canvasTexture:
		| "none"
		| "paper"
		| "technical-grid"
		| "charcoal-paper";
	readonly nodeStroke: "single" | "double" | "dry";
	/**
	 * Optional dash cadence already scaled into preview-scene units. It is a
	 * profile capability, so thumbnails do not infer it from a Style ID.
	 */
	readonly nodeStrokeDashArray: readonly number[] | null;
	readonly nodeFill: "none" | "hatch" | "powder";
	readonly edgeStroke: "clean" | "sketch" | "dry";
}

export interface MindMapStylePreviewEffect {
	readonly profileId: string;
	readonly kind: MindMapRenderEffectKind;
	readonly options: Readonly<Record<string, string | number | boolean>>;
	readonly presentation: MindMapStylePreviewEffectPresentation;
}

export interface MindMapStylePreviewEffects {
	readonly canvasTexture: MindMapStylePreviewEffect | null;
	readonly nodeStroke: MindMapStylePreviewEffect | null;
	readonly nodeFill: MindMapStylePreviewEffect | null;
	readonly edgeStroke: MindMapStylePreviewEffect | null;
}

/**
 * Optional profile-level extension point. Registering a future effect can add
 * thumbnail semantics here without tying it to a Style ID or to DOM classes.
 */
export interface MindMapStylePreviewEffectPresentationResolver {
	resolve(
		capability: MindMapRenderEffectCapability,
		ref: MindMapRenderEffectRef,
	): MindMapStylePreviewEffectPresentation;
}

const DEFAULT_EFFECT_PRESENTATION: MindMapStylePreviewEffectPresentation = {
	canvasTexture: "none",
	nodeStroke: "single",
	nodeStrokeDashArray: null,
	nodeFill: "none",
	edgeStroke: "clean",
};

/**
 * The live renderer/export contour uses logical scene-pixel gaps. The picker
 * uses a much smaller scene, so preserve its cadence while clamping the tiny
 * gaps to a visually perceptible sub-pixel minimum.
 */
const CHARCOAL_PREVIEW_CONTOUR_DASH_ARRAY = scalePreviewDashArray(
	CHARCOAL_CONTOUR_DASH_ARRAY,
	0.3,
);

/**
 * Built-in effect semantics are attached to registered effect profiles, never
 * to Style IDs. Unknown, valid custom effects get a deliberately restrained
 * single-stroke preview until their frontend registers richer semantics.
 */
export const BUILT_IN_MIND_MAP_STYLE_PREVIEW_EFFECT_RESOLVER: MindMapStylePreviewEffectPresentationResolver =
	{
		resolve(capability): MindMapStylePreviewEffectPresentation {
			switch (capability.id) {
				case PAPER_GRAIN_EFFECT_ID:
					return { ...DEFAULT_EFFECT_PRESENTATION, canvasTexture: "paper" };
				case TECHNICAL_GRID_EFFECT_ID:
					return {
						...DEFAULT_EFFECT_PRESENTATION,
						canvasTexture: "technical-grid",
					};
				case CHARCOAL_PAPER_EFFECT_ID:
					return {
						...DEFAULT_EFFECT_PRESENTATION,
						canvasTexture: "charcoal-paper",
					};
				case PENCIL_DOUBLE_STROKE_EFFECT_ID:
					return { ...DEFAULT_EFFECT_PRESENTATION, nodeStroke: "double" };
				case CHARCOAL_STROKE_EFFECT_ID:
					return {
						...DEFAULT_EFFECT_PRESENTATION,
						nodeStroke: "dry",
						nodeStrokeDashArray: CHARCOAL_PREVIEW_CONTOUR_DASH_ARRAY,
					};
				case PENCIL_HATCH_EFFECT_ID:
					return { ...DEFAULT_EFFECT_PRESENTATION, nodeFill: "hatch" };
				case CHARCOAL_FILL_EFFECT_ID:
					return { ...DEFAULT_EFFECT_PRESENTATION, nodeFill: "powder" };
				case PENCIL_EDGE_EFFECT_ID:
					return { ...DEFAULT_EFFECT_PRESENTATION, edgeStroke: "sketch" };
				case CHARCOAL_EDGE_EFFECT_ID:
					return { ...DEFAULT_EFFECT_PRESENTATION, edgeStroke: "dry" };
				default:
					return DEFAULT_EFFECT_PRESENTATION;
			}
		},
	};

const PREVIEW_WIDTH = 120;
const PREVIEW_HEIGHT = 62;
const ROLE_LABELS: Readonly<Record<MindMapNodeRole, string>> = {
	root: "ROOT",
	"main-topic": "MAIN",
	subtopic: "sub",
};

/**
 * Builds the same root/main/subtopic hierarchy shown by every picker card.
 * It resolves profile kinds through the supplied registry so invalid or
 * mismatched effects cannot silently masquerade as another preview treatment.
 */
export function createMindMapStylePreviewScene(
	style: MindMapStyleSpec,
	effects: MindMapRenderEffectResolver,
	presentationResolver: MindMapStylePreviewEffectPresentationResolver =
		BUILT_IN_MIND_MAP_STYLE_PREVIEW_EFFECT_RESOLVER,
): MindMapStylePreviewScene {
	const root = createPreviewNode(style, "root", "root");
	const leftMain = createPreviewNode(style, "main-topic", "left-main");
	const rightMain = createPreviewNode(style, "main-topic", "right-main");
	const leftSubtopic = createPreviewNode(style, "subtopic", "left-subtopic");
	const rightSubtopic = createPreviewNode(style, "subtopic", "right-subtopic");

	const placedRoot = placeNode(root, {
		x: (PREVIEW_WIDTH - root.width) / 2,
		y: (PREVIEW_HEIGHT - root.height) / 2,
	});
	const placedLeftMain = placeNode(leftMain, { x: 4, y: 8 });
	const placedRightMain = placeNode(rightMain, {
		x: PREVIEW_WIDTH - rightMain.width - 4,
		y: 8,
	});
	const placedLeftSubtopic = placeNode(leftSubtopic, { x: 8, y: 44 });
	const placedRightSubtopic = placeNode(rightSubtopic, {
		x: PREVIEW_WIDTH - rightSubtopic.width - 8,
		y: 44,
	});

	const previewEffects: MindMapStylePreviewEffects = {
		canvasTexture: resolvePreviewEffect(
			style.tokens.effects.canvasTexture,
			"canvas-texture",
			effects,
			presentationResolver,
		),
		nodeStroke: resolvePreviewEffect(
			style.tokens.effects.nodeStroke,
			"node-stroke",
			effects,
			presentationResolver,
		),
		nodeFill: resolvePreviewEffect(
			style.tokens.effects.nodeFill,
			"node-fill",
			effects,
			presentationResolver,
		),
		edgeStroke: resolvePreviewEffect(
			style.tokens.effects.edgeStroke,
			"edge-stroke",
			effects,
			presentationResolver,
		),
	};

	const edgeOptions = {
		routing: style.tokens.edge.routing,
		lineStyle: style.tokens.edge.lineStyle,
		connectorProfile: style.tokens.edge.connectorProfile,
		strokeWidth: Math.min(2.8, Math.max(0.8, style.tokens.edge.width)),
		edgeEffect: previewEffects.edgeStroke,
	};
	const edges = [
		createPreviewEdge(
			"root-left-main",
			placedRoot,
			placedLeftMain,
			leftAnchor(placedRoot),
			rightAnchor(placedLeftMain),
			edgeOptions,
		),
		createPreviewEdge(
			"root-right-main",
			placedRoot,
			placedRightMain,
			rightAnchor(placedRoot),
			leftAnchor(placedRightMain),
			edgeOptions,
		),
		createPreviewEdge(
			"left-main-subtopic",
			placedLeftMain,
			placedLeftSubtopic,
			bottomAnchor(placedLeftMain),
			topAnchor(placedLeftSubtopic),
			edgeOptions,
		),
		createPreviewEdge(
			"right-main-subtopic",
			placedRightMain,
			placedRightSubtopic,
			bottomAnchor(placedRightMain),
			topAnchor(placedRightSubtopic),
			edgeOptions,
		),
	];

	return {
		width: PREVIEW_WIDTH,
		height: PREVIEW_HEIGHT,
		nodes: [
			placedRoot,
			placedLeftMain,
			placedRightMain,
			placedLeftSubtopic,
			placedRightSubtopic,
		],
		edges,
		effects: previewEffects,
	};
}

/** Converts a semantic preview route to SVG path data without creating DOM. */
export function createMindMapStylePreviewEdgePathData(
	edge: MindMapStylePreviewEdge,
): string {
	const { from, to } = edge;
	switch (edge.routing) {
		case "straight":
			return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
		case "bezier": {
			const [firstControl, secondControl] = getBezierControls(from, to);
			return `M ${from.x} ${from.y} C ${firstControl.x} ${firstControl.y}, ${secondControl.x} ${secondControl.y}, ${to.x} ${to.y}`;
		}
		case "orthogonal":
			return createOrthogonalPathData(from, to);
		case "rounded-orthogonal":
			return createRoundedOrthogonalPathData(from, to);
	}
}

/**
 * Creates a closed SVG outline for styles whose registered connector profile
 * tapers toward the child. The mini preview therefore communicates tapering
 * rather than pretending every branch uses a uniform SVG stroke.
 */
export function createMindMapStylePreviewTaperedEdgePathData(
	edge: MindMapStylePreviewEdge,
): string | null {
	if (edge.connectorProfile.kind !== "taper-to-child") {
		return null;
	}
	const points = samplePreviewEdge(edge, 14);
	if (points.length < 2) {
		return null;
	}
	const left: MindMapStylePreviewPoint[] = [];
	const right: MindMapStylePreviewPoint[] = [];
	for (const [index, point] of points.entries()) {
		const previous = points[Math.max(0, index - 1)] ?? point;
		const next = points[Math.min(points.length - 1, index + 1)] ?? point;
		const tangentX = next.x - previous.x;
		const tangentY = next.y - previous.y;
		const length = Math.hypot(tangentX, tangentY) || 1;
		const normalX = -tangentY / length;
		const normalY = tangentX / length;
		const progress = index / (points.length - 1);
		const width =
			edge.strokeWidth *
			(1 - progress + progress * edge.connectorProfile.childWidthRatio);
		const halfWidth = width / 2;
		left.push({ x: point.x + normalX * halfWidth, y: point.y + normalY * halfWidth });
		right.push({ x: point.x - normalX * halfWidth, y: point.y - normalY * halfWidth });
	}
	return `M ${left
		.map((point) => `${point.x} ${point.y}`)
		.join(" L ")} L ${right
		.slice()
		.reverse()
		.map((point) => `${point.x} ${point.y}`)
		.join(" L ")} Z`;
}

function createPreviewNode(
	style: MindMapStyleSpec,
	role: MindMapNodeRole,
	id: string,
): MindMapStylePreviewNode {
	const metrics = resolvePreviewRoleMetrics(style, role);
	const dimensions = resolvePreviewNodeDimensions(role, metrics);
	return {
		id,
		role,
		label: ROLE_LABELS[role],
		shape: resolveRolePresentation(style, role).shape ?? "rounded-rectangle",
		fillSource: resolveMindMapNodeFillSource(
			style.tokens.nodeTreatment,
			role,
		),
		x: 0,
		y: 0,
		width: dimensions.width,
		height: dimensions.height,
		metrics,
	};
}

function resolvePreviewRoleMetrics(
	style: MindMapStyleSpec,
	role: MindMapNodeRole,
): MindMapStylePreviewRoleMetrics {
	const presentation = resolveRolePresentation(style, role);
	const typography = resolvePreviewTypography(
		style.tokens.typography,
		presentation,
		role,
	);
	return {
		maxWidth: presentation.maxWidth ?? style.tokens.node.maxWidth,
		minHeight: presentation.minHeight ?? style.tokens.node.minHeight,
		paddingInline:
			presentation.paddingInline ?? style.tokens.node.paddingInline,
		paddingBlock: presentation.paddingBlock ?? style.tokens.node.paddingBlock,
		borderWidth: presentation.borderWidth ?? style.tokens.node.borderWidth,
		radius: presentation.radius ?? style.tokens.node.radius,
		typography,
	};
}

function resolvePreviewTypography(
	typography: MindMapThemeTypographyTokens,
	presentation: MindMapNodePresentation,
	role: MindMapNodeRole,
): MindMapStylePreviewTypography {
	const roleTypography = presentation.typography;
	const root = role === "root";
	return {
		fontFamilyToken:
			roleTypography?.fontFamilyToken ?? typography.fontFamilyToken,
		fontSize:
			roleTypography?.fontSize ??
			(root ? typography.rootFontSize : typography.fontSize),
		fontWeight:
			roleTypography?.fontWeight ??
			(root ? typography.rootFontWeight : typography.fontWeight),
		lineHeight: roleTypography?.lineHeight ?? typography.lineHeight,
	};
}

function resolveRolePresentation(
	style: MindMapStyleSpec,
	role: MindMapNodeRole,
): MindMapNodePresentation {
	switch (role) {
		case "root":
			return style.tokens.roles.root;
		case "main-topic":
			return style.tokens.roles.mainTopic;
		case "subtopic":
			return style.tokens.roles.subtopic;
	}
}

function resolvePreviewNodeDimensions(
	role: MindMapNodeRole,
	metrics: MindMapStylePreviewRoleMetrics,
): { readonly width: number; readonly height: number } {
	const labelCharacters = ROLE_LABELS[role].length;
	const labelWidth =
		metrics.typography.fontSize * labelCharacters * 0.58 +
		metrics.paddingInline * 2;
	const widthScale = role === "root" ? 0.32 : 0.38;
	const widthBounds =
		role === "root"
			? { minimum: 24, maximum: 40 }
			: role === "main-topic"
				? { minimum: 17, maximum: 29 }
				: { minimum: 14, maximum: 24 };
	const heightBounds =
		role === "root"
			? { minimum: 13, maximum: 20 }
			: role === "main-topic"
				? { minimum: 9, maximum: 14 }
				: { minimum: 7, maximum: 11 };
	return {
		width: clamp(
			Math.min(labelWidth, metrics.maxWidth) * widthScale,
			widthBounds.minimum,
			widthBounds.maximum,
		),
		height: clamp(
			(metrics.minHeight + metrics.paddingBlock * 1.4) * 0.27,
			heightBounds.minimum,
			heightBounds.maximum,
		),
	};
}

function resolvePreviewEffect(
	ref: MindMapRenderEffectRef | null,
	kind: MindMapRenderEffectKind,
	effects: MindMapRenderEffectResolver,
	presentationResolver: MindMapStylePreviewEffectPresentationResolver,
): MindMapStylePreviewEffect | null {
	if (ref === null) {
		return null;
	}
	const capability = effects.resolve(ref.profileId, kind);
	return {
		profileId: ref.profileId,
		kind,
		options: { ...ref.options },
		presentation: presentationResolver.resolve(capability, ref),
	};
}

function placeNode(
	node: MindMapStylePreviewNode,
	position: MindMapStylePreviewPoint,
): MindMapStylePreviewNode {
	return { ...node, ...position };
}

function createPreviewEdge(
	id: string,
	source: MindMapStylePreviewNode,
	target: MindMapStylePreviewNode,
	from: MindMapStylePreviewPoint,
	to: MindMapStylePreviewPoint,
	options: Omit<
		MindMapStylePreviewEdge,
		"id" | "sourceNodeId" | "targetNodeId" | "from" | "to"
	>,
): MindMapStylePreviewEdge {
	return {
		id,
		sourceNodeId: source.id,
		targetNodeId: target.id,
		from,
		to,
		...options,
	};
}

function leftAnchor(node: MindMapStylePreviewNode): MindMapStylePreviewPoint {
	return { x: node.x, y: node.y + node.height / 2 };
}

function rightAnchor(node: MindMapStylePreviewNode): MindMapStylePreviewPoint {
	return { x: node.x + node.width, y: node.y + node.height / 2 };
}

function topAnchor(node: MindMapStylePreviewNode): MindMapStylePreviewPoint {
	return { x: node.x + node.width / 2, y: node.y };
}

function bottomAnchor(node: MindMapStylePreviewNode): MindMapStylePreviewPoint {
	return { x: node.x + node.width / 2, y: node.y + node.height };
}

function createOrthogonalPathData(
	from: MindMapStylePreviewPoint,
	to: MindMapStylePreviewPoint,
): string {
	if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)) {
		const middle = (from.x + to.x) / 2;
		return `M ${from.x} ${from.y} H ${middle} V ${to.y} H ${to.x}`;
	}
	const middle = (from.y + to.y) / 2;
	return `M ${from.x} ${from.y} V ${middle} H ${to.x} V ${to.y}`;
}

function createRoundedOrthogonalPathData(
	from: MindMapStylePreviewPoint,
	to: MindMapStylePreviewPoint,
): string {
	const horizontalFirst = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
	if (horizontalFirst) {
		const middleX = (from.x + to.x) / 2;
		const directionX = Math.sign(middleX - from.x) || 1;
		const directionY = Math.sign(to.y - from.y) || 1;
		const radius = Math.min(
			3,
			Math.abs(to.y - from.y) / 2,
			Math.abs(middleX - from.x) / 2,
			Math.abs(to.x - middleX) / 2,
		);
		if (radius < 0.25) {
			return createOrthogonalPathData(from, to);
		}
		return `M ${from.x} ${from.y} H ${middleX - directionX * radius} Q ${middleX} ${from.y} ${middleX} ${from.y + directionY * radius} V ${to.y - directionY * radius} Q ${middleX} ${to.y} ${middleX + directionX * radius} ${to.y} H ${to.x}`;
	}
	const middleY = (from.y + to.y) / 2;
	const directionX = Math.sign(to.x - from.x) || 1;
	const directionY = Math.sign(middleY - from.y) || 1;
	const radius = Math.min(
		3,
		Math.abs(to.x - from.x) / 2,
		Math.abs(middleY - from.y) / 2,
		Math.abs(to.y - middleY) / 2,
	);
	if (radius < 0.25) {
		return createOrthogonalPathData(from, to);
	}
	return `M ${from.x} ${from.y} V ${middleY - directionY * radius} Q ${from.x} ${middleY} ${from.x + directionX * radius} ${middleY} H ${to.x - directionX * radius} Q ${to.x} ${middleY} ${to.x} ${middleY + directionY * radius} V ${to.y}`;
}

function getBezierControls(
	from: MindMapStylePreviewPoint,
	to: MindMapStylePreviewPoint,
): readonly [MindMapStylePreviewPoint, MindMapStylePreviewPoint] {
	if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)) {
		return [
			{ x: from.x + (to.x - from.x) * 0.52, y: from.y },
			{ x: to.x - (to.x - from.x) * 0.52, y: to.y },
		];
	}
	return [
		{ x: from.x, y: from.y + (to.y - from.y) * 0.52 },
		{ x: to.x, y: to.y - (to.y - from.y) * 0.52 },
	];
}

function samplePreviewEdge(
	edge: MindMapStylePreviewEdge,
	segments: number,
): readonly MindMapStylePreviewPoint[] {
	if (edge.routing === "straight") {
		return sampleLine(edge.from, edge.to, segments);
	}
	if (edge.routing === "bezier") {
		const [firstControl, secondControl] = getBezierControls(edge.from, edge.to);
		return Array.from({ length: segments + 1 }, (_, index) => {
			const t = index / segments;
			const inverse = 1 - t;
			return {
				x:
					inverse ** 3 * edge.from.x +
					3 * inverse ** 2 * t * firstControl.x +
					3 * inverse * t ** 2 * secondControl.x +
					t ** 3 * edge.to.x,
				y:
					inverse ** 3 * edge.from.y +
					3 * inverse ** 2 * t * firstControl.y +
					3 * inverse * t ** 2 * secondControl.y +
					t ** 3 * edge.to.y,
			};
		});
	}
	const points = getOrthogonalPreviewPoints(edge.from, edge.to);
	return samplePolyline(points, segments);
}

function getOrthogonalPreviewPoints(
	from: MindMapStylePreviewPoint,
	to: MindMapStylePreviewPoint,
): readonly MindMapStylePreviewPoint[] {
	if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)) {
		const middle = (from.x + to.x) / 2;
		return [from, { x: middle, y: from.y }, { x: middle, y: to.y }, to];
	}
	const middle = (from.y + to.y) / 2;
	return [from, { x: from.x, y: middle }, { x: to.x, y: middle }, to];
}

function sampleLine(
	from: MindMapStylePreviewPoint,
	to: MindMapStylePreviewPoint,
	segments: number,
): readonly MindMapStylePreviewPoint[] {
	return Array.from({ length: segments + 1 }, (_, index) => {
		const progress = index / segments;
		return {
			x: from.x + (to.x - from.x) * progress,
			y: from.y + (to.y - from.y) * progress,
		};
	});
}

function samplePolyline(
	points: readonly MindMapStylePreviewPoint[],
	segments: number,
): readonly MindMapStylePreviewPoint[] {
	const lengths = points.slice(1).map((point, index) => {
		const previous = points[index] ?? point;
		return Math.hypot(point.x - previous.x, point.y - previous.y);
	});
	const totalLength = lengths.reduce((sum, length) => sum + length, 0);
	if (totalLength === 0) {
		return [points[0] ?? { x: 0, y: 0 }];
	}
	return Array.from({ length: segments + 1 }, (_, index) => {
		let remaining = (index / segments) * totalLength;
		for (const [segmentIndex, length] of lengths.entries()) {
			if (remaining <= length || segmentIndex === lengths.length - 1) {
				const from = points[segmentIndex] ?? { x: 0, y: 0 };
				const to = points[segmentIndex + 1] ?? from;
				const progress = length === 0 ? 0 : remaining / length;
				return {
					x: from.x + (to.x - from.x) * progress,
					y: from.y + (to.y - from.y) * progress,
				};
			}
			remaining -= length;
		}
		return points.at(-1) ?? { x: 0, y: 0 };
	});
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function scalePreviewDashArray(
	values: readonly number[],
	scale: number,
): readonly number[] {
	return values.map((value, index) => {
		const scaled = value * scale;
		const minimum = index % 2 === 0 ? 0.8 : 0.55;
		return Math.round(Math.max(minimum, scaled) * 100) / 100;
	});
}
