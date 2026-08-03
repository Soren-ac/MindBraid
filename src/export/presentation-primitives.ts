import type {
	MindMapAssetColorRole,
	MindMapAssetPaint,
	MindMapAssetPrimitive,
	MindMapAssetStroke,
	MindMapAssetVisualDescriptor,
} from "../presentation/assets";
import type {
	MindMapDecorationGeometryDescriptor,
	MindMapDecorationPoint,
} from "../presentation/decorations";
import type {
	MindMapExportBounds,
	MindMapExportPaint,
	MindMapExportPrimitive,
	MindMapExportTextAnchor,
	MindMapExportTextPrimitive,
} from "./types";

/** Resolved semantic colors supplied by the renderer before export. */
export type MindMapAssetExportColors = Readonly<
	Record<MindMapAssetColorRole, string>
>;

export type MindMapAssetExportFit = "contain" | "stretch";

/** Explicit text treatment shared by tag and decoration labels. */
export interface MindMapExportTextStyle {
	readonly fill: string;
	readonly fontFamily: string;
	readonly fontSize: number;
	readonly fontWeight: string;
	readonly fontStyle: "normal" | "italic";
	/** Adds a baseline adjustment to a descriptor's text anchor. */
	readonly baselineOffset: number;
	readonly textDecoration?: "line-through";
	readonly textAnchor?: MindMapExportTextAnchor;
}

/** Explicit stroke treatment shared by decoration paths and boundaries. */
export interface MindMapExportStrokeStyle {
	readonly color: string;
	readonly width: number;
	readonly dashArray?: readonly number[];
	readonly lineCap?: "butt" | "round" | "square";
	readonly lineJoin?: "bevel" | "miter" | "round";
	readonly opacity?: number;
}

export interface MindMapAssetExportLabel {
	readonly text: string;
	readonly style: MindMapExportTextStyle;
}

/**
 * Places one validated asset descriptor in scene coordinates. The caller owns
 * dimensions and resolved colors, so this module has no DOM or host coupling.
 */
export interface MindMapAssetExportPrimitiveOptions {
	readonly asset: MindMapAssetVisualDescriptor;
	readonly bounds: MindMapExportBounds;
	readonly colors: MindMapAssetExportColors;
	readonly fit?: MindMapAssetExportFit;
	readonly idPrefix?: string;
	/** Used only by tag assets that declare label content. */
	readonly label?: MindMapAssetExportLabel;
}

export interface MindMapMarkerDecorationExportStyle {
	readonly colors: MindMapAssetExportColors;
	readonly width: number;
	readonly height: number;
	readonly offsetX: number;
	readonly offsetY: number;
	readonly labelGap: number;
	readonly fit?: MindMapAssetExportFit;
	readonly label: MindMapExportTextStyle;
}

export interface MindMapBoundaryDecorationExportStyle {
	readonly fill: MindMapExportPaint;
	readonly stroke: MindMapExportStrokeStyle;
	readonly radius: number;
	readonly label: MindMapExportTextStyle;
}

export interface MindMapSummaryDecorationExportStyle {
	readonly stroke: MindMapExportStrokeStyle;
	readonly text: MindMapExportTextStyle;
}

export interface MindMapRelationshipDecorationExportStyle {
	readonly stroke: MindMapExportStrokeStyle;
	readonly label: MindMapExportTextStyle;
}

/**
 * Decoration geometry intentionally owns no colors or typography. Exporters
 * pass the resolved visual treatment through this explicit input instead.
 */
export interface MindMapDecorationExportPrimitiveOptions {
	readonly markerAssets: ReadonlyMap<string, MindMapAssetVisualDescriptor>;
	readonly marker: MindMapMarkerDecorationExportStyle;
	readonly boundary: MindMapBoundaryDecorationExportStyle;
	readonly summary: MindMapSummaryDecorationExportStyle;
	readonly relationship: MindMapRelationshipDecorationExportStyle;
}

interface AssetTransform {
	readonly offsetX: number;
	readonly offsetY: number;
	readonly scaleX: number;
	readonly scaleY: number;
	readonly strokeScale: number;
}

interface ResolvedAssetPaint {
	readonly fill: MindMapExportPaint;
	readonly fillOpacity?: number;
}

interface ResolvedAssetStroke {
	readonly stroke: string;
	readonly strokeWidth: number;
	readonly lineCap?: "butt" | "round" | "square";
	readonly lineJoin?: "bevel" | "miter" | "round";
}

/**
 * Converts every asset primitive into scene-space export primitives. Geometry
 * is copied rather than wrapped in an SVG transform, so raster/PDF consumers
 * can use the same result.
 */
export function createMindMapAssetExportPrimitives(
	options: MindMapAssetExportPrimitiveOptions,
): readonly MindMapExportPrimitive[] {
	const transform = createAssetTransform(
		options.asset,
		options.bounds,
		options.fit ?? "contain",
	);
	const prefix = options.idPrefix ?? options.asset.id;
	const primitives = options.asset.primitives.map((primitive, index) =>
		convertAssetPrimitive(
			primitive,
			`${prefix}:asset:${options.asset.id}:${String(index)}`,
			transform,
			options.colors,
		),
	);

	if (options.label !== undefined) {
		if (options.asset.labelContent === null) {
			throw new RangeError(
				`Mind-map asset "${options.asset.id}" does not declare label content.`,
			);
		}
		const label = options.asset.labelContent;
		primitives.push(
			createTextPrimitive(
				`${prefix}:asset:${options.asset.id}:label`,
				transform.offsetX + label.paddingInline * transform.scaleX,
				transform.offsetY +
					(options.asset.viewBox.height * transform.scaleY) / 2 +
					label.paddingBlock * transform.scaleY,
				truncateText(options.label.text, label.maximumLength),
				options.label.style,
			),
		);
	}

	return primitives;
}

/**
 * Converts resolved decoration geometry into export primitives. Marker assets
 * are supplied as an already-resolved map, so no registry or adapter state is
 * needed at the export boundary.
 */
export function createMindMapDecorationExportPrimitives(
	descriptors: readonly MindMapDecorationGeometryDescriptor[],
	options: MindMapDecorationExportPrimitiveOptions,
): readonly MindMapExportPrimitive[] {
	const primitives: MindMapExportPrimitive[] = [];
	for (const descriptor of descriptors) {
		switch (descriptor.kind) {
			case "marker":
				appendMarkerDecorationPrimitives(primitives, descriptor, options);
				break;
			case "boundary":
				appendBoundaryDecorationPrimitives(primitives, descriptor, options);
				break;
			case "summary":
				appendSummaryDecorationPrimitives(primitives, descriptor, options);
				break;
			case "relationship":
				appendRelationshipDecorationPrimitives(primitives, descriptor, options);
				break;
		}
	}
	return primitives;
}

function appendMarkerDecorationPrimitives(
	primitives: MindMapExportPrimitive[],
	descriptor: Extract<
		MindMapDecorationGeometryDescriptor,
		{ readonly kind: "marker" }
	>,
	options: MindMapDecorationExportPrimitiveOptions,
): void {
	const style = options.marker;
	const width = requirePositiveNumber(style.width, "Marker export width");
	const height = requirePositiveNumber(style.height, "Marker export height");
	const offsetX = requireFiniteNumber(style.offsetX, "Marker export offset X");
	const offsetY = requireFiniteNumber(style.offsetY, "Marker export offset Y");
	const labelGap = requireNonNegativeNumber(
		style.labelGap,
		"Marker export label gap",
	);
	const markerAsset = options.markerAssets.get(descriptor.markerId);
	const hasInlineAssetLabel =
		markerAsset !== undefined &&
		markerAsset.labelContent !== null &&
		descriptor.label !== undefined;
	if (markerAsset !== undefined) {
		primitives.push(
			...createMindMapAssetExportPrimitives({
				asset: markerAsset,
				bounds: {
					x: descriptor.anchor.x + offsetX,
					y: descriptor.anchor.y + offsetY,
					width,
					height,
				},
				colors: style.colors,
				fit: style.fit,
				idPrefix: descriptor.id,
				...(hasInlineAssetLabel
					? { label: { text: descriptor.label, style: style.label } }
					: {}),
			}),
		);
	}
	if (
		descriptor.label !== undefined &&
		descriptor.labelAnchor !== null &&
		!hasInlineAssetLabel
	) {
		primitives.push(
			createTextPrimitive(
				`${descriptor.id}:label`,
				descriptor.labelAnchor.x +
					offsetX +
					(markerAsset === undefined ? 0 : width) +
					labelGap,
				descriptor.labelAnchor.y + offsetY + height / 2,
				descriptor.label,
				style.label,
			),
		);
	}
}

function appendBoundaryDecorationPrimitives(
	primitives: MindMapExportPrimitive[],
	descriptor: Extract<
		MindMapDecorationGeometryDescriptor,
		{ readonly kind: "boundary" }
	>,
	options: MindMapDecorationExportPrimitiveOptions,
): void {
	const style = options.boundary;
	const bounds = descriptor.bounds;
	const stroke = resolveStrokeStyle(style.stroke, "Boundary export stroke");
	const radius = requireNonNegativeNumber(style.radius, "Boundary export radius");
	primitives.push({
		kind: "rect",
		id: descriptor.id,
		x: requireFiniteNumber(bounds.x, "Boundary export X"),
		y: requireFiniteNumber(bounds.y, "Boundary export Y"),
		width: requireNonNegativeNumber(bounds.width, "Boundary export width"),
		height: requireNonNegativeNumber(bounds.height, "Boundary export height"),
		radiusX: radius,
		radiusY: radius,
		fill: cloneExportPaint(style.fill),
		stroke: stroke.stroke,
		strokeWidth: stroke.strokeWidth,
		opacity: stroke.opacity,
	});
	if (descriptor.label !== undefined && descriptor.labelAnchor !== null) {
		primitives.push(
			createTextPrimitive(
				`${descriptor.id}:label`,
				descriptor.labelAnchor.x,
				descriptor.labelAnchor.y,
				descriptor.label,
				style.label,
			),
		);
	}
}

function appendSummaryDecorationPrimitives(
	primitives: MindMapExportPrimitive[],
	descriptor: Extract<
		MindMapDecorationGeometryDescriptor,
		{ readonly kind: "summary" }
	>,
	options: MindMapDecorationExportPrimitiveOptions,
): void {
	const stroke = resolveStrokeStyle(options.summary.stroke, "Summary export stroke");
	primitives.push({
		kind: "path",
		id: descriptor.id,
		data: createPointPathData(descriptor.bracket, false),
		fill: { kind: "none" },
		stroke: stroke.stroke,
		strokeWidth: stroke.strokeWidth,
		dashArray: stroke.dashArray,
		lineCap: stroke.lineCap,
		lineJoin: stroke.lineJoin,
		opacity: stroke.opacity,
	});
	primitives.push(
		createTextPrimitive(
			`${descriptor.id}:text`,
			descriptor.textAnchor.x,
			descriptor.textAnchor.y,
			descriptor.text,
			options.summary.text,
			textAnchorForDecorationAlignment(descriptor.textAlignment),
		),
	);
}

function appendRelationshipDecorationPrimitives(
	primitives: MindMapExportPrimitive[],
	descriptor: Extract<
		MindMapDecorationGeometryDescriptor,
		{ readonly kind: "relationship" }
	>,
	options: MindMapDecorationExportPrimitiveOptions,
): void {
	const stroke = resolveStrokeStyle(
		options.relationship.stroke,
		"Relationship export stroke",
	);
	primitives.push({
		kind: "path",
		id: descriptor.id,
		data: createQuadraticPathData(
			descriptor.start,
			descriptor.control,
			descriptor.end,
		),
		fill: { kind: "none" },
		stroke: stroke.stroke,
		strokeWidth: stroke.strokeWidth,
		dashArray: stroke.dashArray,
		lineCap: stroke.lineCap,
		lineJoin: stroke.lineJoin,
		opacity: stroke.opacity,
	});
	if (descriptor.label !== undefined && descriptor.labelAnchor !== null) {
		primitives.push(
			createTextPrimitive(
				`${descriptor.id}:label`,
				descriptor.labelAnchor.x,
				descriptor.labelAnchor.y,
				descriptor.label,
				options.relationship.label,
				"middle",
			),
		);
	}
}

function convertAssetPrimitive(
	primitive: MindMapAssetPrimitive,
	id: string,
	transform: AssetTransform,
	colors: MindMapAssetExportColors,
): MindMapExportPrimitive {
	switch (primitive.kind) {
		case "circle": {
			const paint = resolveAssetPaint(primitive.fill, colors);
			const stroke = resolveAssetStroke(primitive.stroke, colors, transform);
			const center = transformPoint(
				{ x: primitive.centerX, y: primitive.centerY },
				transform,
			);
			const radiusX = primitive.radius * transform.scaleX;
			const radiusY = primitive.radius * transform.scaleY;
			if (approximatelyEqual(radiusX, radiusY)) {
				return {
					kind: "circle",
					id,
					centerX: center.x,
					centerY: center.y,
					radius: radiusX,
					fill: paint.fill,
					fillOpacity: paint.fillOpacity,
					stroke: stroke.stroke,
					strokeWidth: stroke.strokeWidth,
				};
			}
			return {
				kind: "ellipse",
				id,
				centerX: center.x,
				centerY: center.y,
				radiusX,
				radiusY,
				fill: paint.fill,
				fillOpacity: paint.fillOpacity,
				stroke: stroke.stroke,
				strokeWidth: stroke.strokeWidth,
			};
		}
		case "rect": {
			const paint = resolveAssetPaint(primitive.fill, colors);
			const stroke = resolveAssetStroke(primitive.stroke, colors, transform);
			return {
				kind: "rect",
				id,
				x: transform.offsetX + primitive.x * transform.scaleX,
				y: transform.offsetY + primitive.y * transform.scaleY,
				width: primitive.width * transform.scaleX,
				height: primitive.height * transform.scaleY,
				radiusX: (primitive.radius ?? 0) * transform.scaleX,
				radiusY: (primitive.radius ?? 0) * transform.scaleY,
				fill: paint.fill,
				fillOpacity: paint.fillOpacity,
				stroke: stroke.stroke,
				strokeWidth: stroke.strokeWidth,
			};
		}
		case "line": {
			const stroke = resolveAssetStroke(primitive.stroke, colors, transform);
			return createPathPrimitive(
				id,
				createPointPathData([primitive.start, primitive.end], false, transform),
				{ kind: "none" },
				stroke,
			);
		}
		case "polyline": {
			const stroke = resolveAssetStroke(primitive.stroke, colors, transform);
			return createPathPrimitive(
				id,
				createPointPathData(primitive.points, false, transform),
				{ kind: "none" },
				stroke,
			);
		}
		case "polygon": {
			const paint = resolveAssetPaint(primitive.fill, colors);
			const stroke = resolveAssetStroke(primitive.stroke, colors, transform);
			return {
				...createPathPrimitive(
					id,
					createPointPathData(primitive.points, true, transform),
					paint.fill,
					stroke,
				),
				fillOpacity: paint.fillOpacity,
			};
		}
		case "arc": {
			const stroke = resolveAssetStroke(primitive.stroke, colors, transform);
			return createPathPrimitive(
				id,
				createArcPathData(primitive, transform),
				{ kind: "none" },
				stroke,
			);
		}
	}
}

function createPathPrimitive(
	id: string,
	data: string,
	fill: MindMapExportPaint,
	stroke: ResolvedAssetStroke,
): Extract<MindMapExportPrimitive, { readonly kind: "path" }> {
	return {
		kind: "path",
		id,
		data,
		fill,
		stroke: stroke.stroke,
		strokeWidth: stroke.strokeWidth,
		lineCap: stroke.lineCap,
		lineJoin: stroke.lineJoin,
	};
}

function createAssetTransform(
	asset: MindMapAssetVisualDescriptor,
	bounds: MindMapExportBounds,
	fit: MindMapAssetExportFit,
): AssetTransform {
	const width = requirePositiveNumber(bounds.width, "Asset export width");
	const height = requirePositiveNumber(bounds.height, "Asset export height");
	const x = requireFiniteNumber(bounds.x, "Asset export X");
	const y = requireFiniteNumber(bounds.y, "Asset export Y");
	const viewBoxWidth = requirePositiveNumber(
		asset.viewBox.width,
		"Asset view-box width",
	);
	const viewBoxHeight = requirePositiveNumber(
		asset.viewBox.height,
		"Asset view-box height",
	);
	const scaleX = width / viewBoxWidth;
	const scaleY = height / viewBoxHeight;
	if (fit === "stretch") {
		return {
			offsetX: x,
			offsetY: y,
			scaleX,
			scaleY,
			strokeScale: Math.sqrt(scaleX * scaleY),
		};
	}
	const scale = Math.min(scaleX, scaleY);
	return {
		offsetX: x + (width - viewBoxWidth * scale) / 2,
		offsetY: y + (height - viewBoxHeight * scale) / 2,
		scaleX: scale,
		scaleY: scale,
		strokeScale: scale,
	};
}

function resolveAssetPaint(
	paint: MindMapAssetPaint,
	colors: MindMapAssetExportColors,
): ResolvedAssetPaint {
	if (paint.kind === "none") {
		return { fill: { kind: "none" } };
	}
	return {
		fill: { kind: "color", value: resolveAssetRoleColor(paint.role, colors) },
		...(paint.opacity === undefined
			? {}
			: { fillOpacity: requireOpacity(paint.opacity, "Asset fill opacity") }),
	};
}

function resolveAssetStroke(
	stroke: MindMapAssetStroke | undefined,
	colors: MindMapAssetExportColors,
	transform: AssetTransform,
): ResolvedAssetStroke {
	if (stroke === undefined) {
		return { stroke: "transparent", strokeWidth: 0 };
	}
	return {
		stroke: resolveAssetRoleColor(stroke.role, colors),
		strokeWidth:
			requireNonNegativeNumber(stroke.width, "Asset stroke width") *
			transform.strokeScale,
		...(stroke.lineCap === undefined ? {} : { lineCap: stroke.lineCap }),
		...(stroke.lineJoin === undefined ? {} : { lineJoin: stroke.lineJoin }),
	};
}

function resolveAssetRoleColor(
	role: MindMapAssetColorRole,
	colors: MindMapAssetExportColors,
): string {
	return requireExportColor(colors[role], `Asset color role "${role}"`);
}

function resolveStrokeStyle(
	style: MindMapExportStrokeStyle,
	label: string,
): MindMapExportStrokeStyle & { readonly stroke: string; readonly strokeWidth: number } {
	return {
		...style,
		stroke: requireExportColor(style.color, `${label} color`),
		strokeWidth: requireNonNegativeNumber(style.width, `${label} width`),
		...(style.dashArray === undefined
			? {}
			: {
				dashArray: style.dashArray.map((value) =>
					requireNonNegativeNumber(value, `${label} dash length`),
				),
			}),
		...(style.opacity === undefined
			? {}
			: { opacity: requireOpacity(style.opacity, `${label} opacity`) }),
	};
}

function createTextPrimitive(
	id: string,
	x: number,
	y: number,
	text: string,
	style: MindMapExportTextStyle,
	textAnchor: MindMapExportTextAnchor | undefined = style.textAnchor,
): MindMapExportTextPrimitive {
	const fontSize = requirePositiveNumber(style.fontSize, "Export text font size");
	const baselineOffset = requireFiniteNumber(
		style.baselineOffset,
		"Export text baseline offset",
	);
	if (typeof text !== "string") {
		throw new TypeError("Export text must be a string.");
	}
	if (typeof style.fontFamily !== "string" || style.fontFamily.trim().length === 0) {
		throw new TypeError("Export text font family must be a non-empty string.");
	}
	if (typeof style.fontWeight !== "string" || style.fontWeight.trim().length === 0) {
		throw new TypeError("Export text font weight must be a non-empty string.");
	}
	return {
		kind: "text",
		id,
		x: requireFiniteNumber(x, "Export text X"),
		y: requireFiniteNumber(y, "Export text Y") + baselineOffset,
		text,
		fill: requireExportColor(style.fill, "Export text fill"),
		fontFamily: style.fontFamily,
		fontSize,
		fontWeight: style.fontWeight,
		fontStyle: style.fontStyle,
		...(style.textDecoration === undefined
			? {}
			: { textDecoration: style.textDecoration }),
		...(textAnchor === undefined ? {} : { textAnchor }),
	};
}

function createPointPathData(
	points: readonly MindMapDecorationPoint[],
	closed: boolean,
	transform?: AssetTransform,
): string {
	if (points.length < 2) {
		throw new RangeError("Export path requires at least two points.");
	}
	const transformed = points.map((point) =>
		transform === undefined ? requirePoint(point, "Export path point") : transformPoint(point, transform),
	);
	const first = transformed[0];
	if (first === undefined) {
		throw new RangeError("Export path requires a first point.");
	}
	const segments = [`M ${formatPathNumber(first.x)} ${formatPathNumber(first.y)}`];
	for (let index = 1; index < transformed.length; index += 1) {
		const point = transformed[index];
		if (point !== undefined) {
			segments.push(`L ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`);
		}
	}
	if (closed) {
		segments.push("Z");
	}
	return segments.join(" ");
}

function createQuadraticPathData(
	start: MindMapDecorationPoint,
	control: MindMapDecorationPoint,
	end: MindMapDecorationPoint,
): string {
	const resolvedStart = requirePoint(start, "Relationship start");
	const resolvedControl = requirePoint(control, "Relationship control");
	const resolvedEnd = requirePoint(end, "Relationship end");
	return `M ${formatPathNumber(resolvedStart.x)} ${formatPathNumber(resolvedStart.y)} Q ${formatPathNumber(resolvedControl.x)} ${formatPathNumber(resolvedControl.y)} ${formatPathNumber(resolvedEnd.x)} ${formatPathNumber(resolvedEnd.y)}`;
}

function createArcPathData(
	primitive: Extract<MindMapAssetPrimitive, { readonly kind: "arc" }>,
	transform: AssetTransform,
): string {
	const startAngle = requireFiniteNumber(primitive.startAngle, "Asset arc start angle");
	const endAngle = requireFiniteNumber(primitive.endAngle, "Asset arc end angle");
	const sweep = endAngle - startAngle;
	if (sweep <= 0 || sweep > 360) {
		throw new RangeError("Asset arc must have a positive sweep no greater than 360 degrees.");
	}
	const center = transformPoint(
		{ x: primitive.centerX, y: primitive.centerY },
		transform,
	);
	const radiusX = requirePositiveNumber(primitive.radius, "Asset arc radius") * transform.scaleX;
	const radiusY = primitive.radius * transform.scaleY;
	const pointAt = (angle: number): MindMapDecorationPoint => {
		const radians = (angle * Math.PI) / 180;
		return {
			x: center.x + Math.cos(radians) * radiusX,
			y: center.y + Math.sin(radians) * radiusY,
		};
	};
	const start = pointAt(startAngle);
	const end = pointAt(endAngle);
	const arc = (to: MindMapDecorationPoint, largeArc: boolean): string =>
		`A ${formatPathNumber(radiusX)} ${formatPathNumber(radiusY)} 0 ${largeArc ? "1" : "0"} 1 ${formatPathNumber(to.x)} ${formatPathNumber(to.y)}`;
	if (approximatelyEqual(sweep, 360)) {
		const middle = pointAt(startAngle + sweep / 2);
		return `M ${formatPathNumber(start.x)} ${formatPathNumber(start.y)} ${arc(middle, false)} ${arc(end, false)}`;
	}
	return `M ${formatPathNumber(start.x)} ${formatPathNumber(start.y)} ${arc(end, sweep > 180)}`;
}

function transformPoint(
	point: MindMapDecorationPoint,
	transform: AssetTransform,
): MindMapDecorationPoint {
	const resolved = requirePoint(point, "Asset point");
	return {
		x: transform.offsetX + resolved.x * transform.scaleX,
		y: transform.offsetY + resolved.y * transform.scaleY,
	};
}

function textAnchorForDecorationAlignment(
	alignment: "start" | "center" | "end",
): MindMapExportTextAnchor {
	switch (alignment) {
		case "start":
			return "start";
		case "center":
			return "middle";
		case "end":
			return "end";
	}
}

function cloneExportPaint(paint: MindMapExportPaint): MindMapExportPaint {
	switch (paint.kind) {
		case "none":
			return { kind: "none" };
		case "color":
			return {
				kind: "color",
				value: requireExportColor(paint.value, "Export fill"),
			};
		case "hatch":
			return {
				kind: "hatch",
				background: requireExportColor(paint.background, "Export hatch background"),
				color: requireExportColor(paint.color, "Export hatch color"),
				gap: requirePositiveNumber(paint.gap, "Export hatch gap"),
				opacity: requireOpacity(paint.opacity, "Export hatch opacity"),
				angle: requireFiniteNumber(paint.angle, "Export hatch angle"),
			};
	}
}

function requirePoint(
	point: MindMapDecorationPoint,
	label: string,
): MindMapDecorationPoint {
	return {
		x: requireFiniteNumber(point.x, `${label} X`),
		y: requireFiniteNumber(point.y, `${label} Y`),
	};
}

function requireExportColor(value: string, label: string): string {
	if (typeof value !== "string") {
		throw new TypeError(`${label} must be a string.`);
	}
	const color = value.trim();
	if (
		color.length === 0 ||
		color.toLowerCase().includes("url(") ||
		color.includes(";") ||
		color.includes("{") ||
		color.includes("}")
	) {
		throw new RangeError(`${label} must be a safe color value.`);
	}
	return color;
}

function requireFiniteNumber(value: number, label: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new RangeError(`${label} must be finite.`);
	}
	return value;
}

function requirePositiveNumber(value: number, label: string): number {
	const number = requireFiniteNumber(value, label);
	if (number <= 0) {
		throw new RangeError(`${label} must be positive.`);
	}
	return number;
}

function requireNonNegativeNumber(value: number, label: string): number {
	const number = requireFiniteNumber(value, label);
	if (number < 0) {
		throw new RangeError(`${label} must be non-negative.`);
	}
	return number;
}

function requireOpacity(value: number, label: string): number {
	const opacity = requireFiniteNumber(value, label);
	if (opacity < 0 || opacity > 1) {
		throw new RangeError(`${label} must be between 0 and 1.`);
	}
	return opacity;
}

function truncateText(value: string, maximumLength: number): string {
	if (typeof value !== "string") {
		throw new TypeError("Asset label must be a string.");
	}
	return Array.from(value).slice(0, maximumLength).join("");
}

function formatPathNumber(value: number): string {
	const rounded =
		Math.round(requireFiniteNumber(value, "Export path coordinate") * 1_000_000) /
		1_000_000;
	return String(Object.is(rounded, -0) ? 0 : rounded);
}

function approximatelyEqual(left: number, right: number): boolean {
	return Math.abs(left - right) <= 0.000_001;
}
