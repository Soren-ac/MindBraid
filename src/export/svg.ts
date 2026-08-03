import {
	type MindMapExportOptions,
	type MindMapExportPaint,
	type MindMapExportPrimitive,
	type MindMapExportScene,
	MindMapExportError,
	normalizeMindMapExportPadding,
	throwIfMindMapExportAborted,
} from "./types";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export interface SerializedMindMapSvg {
	readonly svg: string;
	readonly width: number;
	readonly height: number;
}

export function serializeMindMapExportSceneToSvg(
	scene: MindMapExportScene,
	options: Pick<MindMapExportOptions, "background" | "padding">,
	signal?: AbortSignal,
): SerializedMindMapSvg {
	throwIfMindMapExportAborted(signal);
	const padding = normalizeMindMapExportPadding(options.padding);
	const width = Math.max(1, Math.ceil(scene.bounds.width + padding * 2));
	const height = Math.max(1, Math.ceil(scene.bounds.height + padding * 2));
	const offsetX = padding - scene.bounds.x;
	const offsetY = padding - scene.bounds.y;
	const patterns = collectPaintPatterns(scene.primitives);
	const definitions: string[] = [];

	for (const pattern of patterns.values()) {
		definitions.push(serializeHatchPattern(pattern.id, pattern.paint));
	}
	if (options.background === "theme" && scene.paperTexture !== null) {
		definitions.push(serializePaperPattern(scene.paperTexture));
	}

	const body: string[] = [];
	if (options.background === "theme") {
		body.push(
			`<rect class="obmind-export-background" x="0" y="0" width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${escapeXmlAttribute(scene.backgroundColor)}"/>`,
		);
		if (scene.paperTexture !== null) {
			body.push(
				`<rect class="obmind-export-paper" x="0" y="0" width="${formatNumber(width)}" height="${formatNumber(height)}" fill="url(#obmind-export-paper-grain)"/>`,
			);
		}
	}

	body.push(
		`<g class="obmind-export-scene" transform="translate(${formatNumber(offsetX)} ${formatNumber(offsetY)})">`,
	);
	for (const primitive of scene.primitives) {
		throwIfMindMapExportAborted(signal);
		body.push(serializePrimitive(primitive, patterns));
	}
	body.push("</g>");

	return {
		width,
		height,
		svg: [
			'<?xml version="1.0" encoding="UTF-8"?>',
			`<svg xmlns="${SVG_NAMESPACE}" width="${formatNumber(width)}" height="${formatNumber(height)}" viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}" role="img" aria-label="Mind map export">`,
			definitions.length > 0 ? `<defs>${definitions.join("")}</defs>` : "",
			...body,
			"</svg>",
		].join(""),
	};
}

interface HatchPatternDefinition {
	readonly id: string;
	readonly paint: Extract<MindMapExportPaint, { readonly kind: "hatch" }>;
}

function collectPaintPatterns(
	primitives: readonly MindMapExportPrimitive[],
): ReadonlyMap<string, HatchPatternDefinition> {
	const patterns = new Map<string, HatchPatternDefinition>();
	for (const primitive of primitives) {
		if (!("fill" in primitive)) {
			continue;
		}
		const fill = primitive.fill;
		if (typeof fill === "string" || fill.kind !== "hatch") {
			continue;
		}
		const signature = JSON.stringify(fill);
		if (!patterns.has(signature)) {
			patterns.set(signature, {
				id: `obmind-export-hatch-${String(patterns.size + 1)}`,
				paint: fill,
			});
		}
	}
	return patterns;
}

function serializeHatchPattern(
	id: string,
	paint: Extract<MindMapExportPaint, { readonly kind: "hatch" }>,
): string {
	const gap = Math.max(2, paint.gap);
	const opacity = clampOpacity(paint.opacity);
	return [
		`<pattern id="${id}" width="${formatNumber(gap)}" height="${formatNumber(gap)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${formatNumber(paint.angle)})">`,
		`<rect width="${formatNumber(gap)}" height="${formatNumber(gap)}" fill="${escapeXmlAttribute(paint.background)}"/>`,
		`<path d="M 0 ${formatNumber(gap)} L ${formatNumber(gap)} 0" fill="none" stroke="${escapeXmlAttribute(paint.color)}" stroke-width="1" opacity="${formatNumber(opacity)}"/>`,
		"</pattern>",
	].join("");
}

function serializePaperPattern(
	texture: NonNullable<MindMapExportScene["paperTexture"]>,
): string {
	const fine = Math.max(2, texture.fineCellSize);
	const coarse = Math.max(fine, texture.coarseCellSize);
	const opacity = clampOpacity(texture.opacity);
	return [
		`<pattern id="obmind-export-paper-grain" width="${formatNumber(coarse)}" height="${formatNumber(coarse)}" patternUnits="userSpaceOnUse" patternTransform="translate(${formatNumber(texture.offsetX)} ${formatNumber(texture.offsetY)})">`,
		`<path d="M 0 0 H ${formatNumber(coarse)} M 0 0 V ${formatNumber(coarse)}" fill="none" stroke="${escapeXmlAttribute(texture.color)}" stroke-width="0.45" opacity="${formatNumber(opacity * 0.7)}"/>`,
		`<path d="M 0 ${formatNumber(fine)} H ${formatNumber(coarse)} M ${formatNumber(fine)} 0 V ${formatNumber(coarse)}" fill="none" stroke="${escapeXmlAttribute(texture.color)}" stroke-width="0.3" opacity="${formatNumber(opacity * 0.35)}"/>`,
		"</pattern>",
	].join("");
}

function serializePrimitive(
	primitive: MindMapExportPrimitive,
	patterns: ReadonlyMap<string, HatchPatternDefinition>,
): string {
	const common = serializeCommonAttributes(primitive);
	switch (primitive.kind) {
		case "rect":
			return `<rect${common} x="${formatNumber(primitive.x)}" y="${formatNumber(primitive.y)}" width="${formatNumber(primitive.width)}" height="${formatNumber(primitive.height)}" rx="${formatNumber(primitive.radiusX)}" ry="${formatNumber(primitive.radiusY)}" fill="${serializePaint(primitive.fill, patterns)}" stroke="${serializeStroke(primitive.stroke, primitive.strokeWidth)}" stroke-width="${formatNumber(Math.max(0, primitive.strokeWidth))}"/>`;
		case "ellipse":
			return `<ellipse${common} cx="${formatNumber(primitive.centerX)}" cy="${formatNumber(primitive.centerY)}" rx="${formatNumber(primitive.radiusX)}" ry="${formatNumber(primitive.radiusY)}" fill="${serializePaint(primitive.fill, patterns)}" stroke="${serializeStroke(primitive.stroke, primitive.strokeWidth)}" stroke-width="${formatNumber(Math.max(0, primitive.strokeWidth))}"/>`;
		case "circle":
			return `<circle${common} cx="${formatNumber(primitive.centerX)}" cy="${formatNumber(primitive.centerY)}" r="${formatNumber(primitive.radius)}" fill="${serializePaint(primitive.fill, patterns)}" stroke="${serializeStroke(primitive.stroke, primitive.strokeWidth)}" stroke-width="${formatNumber(Math.max(0, primitive.strokeWidth))}"/>`;
		case "path":
			return `<path${common} d="${escapeXmlAttribute(primitive.data)}" fill="${serializePaint(primitive.fill, patterns)}" stroke="${serializeStroke(primitive.stroke, primitive.strokeWidth)}" stroke-width="${formatNumber(Math.max(0, primitive.strokeWidth))}"${serializeDashArray(primitive.dashArray)}${serializeOptionalAttribute("stroke-linecap", primitive.lineCap)}${serializeOptionalAttribute("stroke-linejoin", primitive.lineJoin)}/>`;
		case "text":
			if (primitive.textAnchor !== undefined) {
				return `<text${common} x="${formatNumber(primitive.x)}" y="${formatNumber(primitive.y)}" fill="${escapeXmlAttribute(primitive.fill)}" font-family="${escapeXmlAttribute(primitive.fontFamily)}" font-size="${formatNumber(primitive.fontSize)}" font-weight="${escapeXmlAttribute(primitive.fontWeight)}" font-style="${primitive.fontStyle}"${serializeOptionalAttribute("text-decoration", primitive.textDecoration)}${serializeOptionalAttribute("text-anchor", primitive.textAnchor)} xml:space="preserve">${escapeXmlText(primitive.text)}</text>`;
			}
			return `<text${common} x="${formatNumber(primitive.x)}" y="${formatNumber(primitive.y)}" fill="${escapeXmlAttribute(primitive.fill)}" font-family="${escapeXmlAttribute(primitive.fontFamily)}" font-size="${formatNumber(primitive.fontSize)}" font-weight="${escapeXmlAttribute(primitive.fontWeight)}" font-style="${primitive.fontStyle}"${serializeOptionalAttribute("text-decoration", primitive.textDecoration)} xml:space="preserve">${escapeXmlText(primitive.text)}</text>`;
	}
}

function serializePaint(
	paint: MindMapExportPaint,
	patterns: ReadonlyMap<string, HatchPatternDefinition>,
): string {
	switch (paint.kind) {
		case "none":
			return "none";
		case "color":
			return escapeXmlAttribute(paint.value);
		case "hatch": {
			const pattern = patterns.get(JSON.stringify(paint));
			if (pattern === undefined) {
				throw new MindMapExportError(
					"Could not resolve an export hatch pattern.",
					"encode-failed",
				);
			}
			return `url(#${pattern.id})`;
		}
	}
}

function serializeStroke(stroke: string, width: number): string {
	return width > 0 ? escapeXmlAttribute(stroke) : "none";
}

function serializeCommonAttributes(
	primitive: MindMapExportPrimitive,
): string {
	const values: string[] = [];
	if (primitive.id !== undefined) {
		values.push(` data-obmind-export-id="${escapeXmlAttribute(primitive.id)}"`);
	}
	if (primitive.opacity !== undefined) {
		values.push(` opacity="${formatNumber(clampOpacity(primitive.opacity))}"`);
	}
	if (primitive.fillOpacity !== undefined) {
		values.push(
			` fill-opacity="${formatNumber(clampOpacity(primitive.fillOpacity))}"`,
		);
	}
	if (
		primitive.transform !== undefined &&
		/^[a-zA-Z0-9(),.\s+-]+$/.test(primitive.transform)
	) {
		values.push(` transform="${escapeXmlAttribute(primitive.transform)}"`);
	}
	return values.join("");
}

function serializeDashArray(values: readonly number[] | undefined): string {
	if (values === undefined || values.length === 0) {
		return "";
	}
	return ` stroke-dasharray="${values
		.map((value) => formatNumber(Math.max(0, value)))
		.join(" ")}"`;
}

function serializeOptionalAttribute(
	name: string,
	value: string | undefined,
): string {
	return value === undefined
		? ""
		: ` ${name}="${escapeXmlAttribute(value)}"`;
}

function escapeXmlText(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function escapeXmlAttribute(value: string): string {
	return escapeXmlText(value)
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function formatNumber(value: number): string {
	if (!Number.isFinite(value)) {
		throw new MindMapExportError(
			"Export geometry contains a non-finite number.",
			"encode-failed",
		);
	}
	return String(Math.round(value * 1000) / 1000);
}

function clampOpacity(value: number): number {
	return Math.min(1, Math.max(0, value));
}
