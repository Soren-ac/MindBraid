import {
	DEFAULT_MIND_MAP_EXPORT_LIMITS,
	DEFAULT_MIND_MAP_EXPORT_PDF_RASTER_DPI,
	isMindMapRasterExportFormat,
	MindMapExportError,
	normalizeMindMapExportPadding,
	type MindMapExportDiagnostic,
	type MindMapExportEncoderCapability,
	type MindMapExportLimits,
	type MindMapExportLogicalDimensions,
	type MindMapExportOptions,
	type MindMapExportPlan,
	type MindMapExportScene,
	type MindMapRasterDimensions,
} from "./types";

const CSS_PIXELS_PER_INCH = 96;

export interface MindMapExportPlanningContext {
	readonly limits?: MindMapExportLimits;
	/**
	 * Optional encoder declaration used to surface UI-facing capability errors.
	 * The planner remains usable in core tests without a registered UI catalog.
	 */
	readonly encoder?: MindMapExportEncoderCapability;
}

/**
 * Calculates export feasibility without constructing SVG, a canvas, a Blob,
 * or a download. This is safe to call while a user types a custom DPI value.
 */
export function planMindMapExport(
	scene: MindMapExportScene,
	options: MindMapExportOptions,
	context: MindMapExportPlanningContext = {},
): MindMapExportPlan {
	const limits = context.limits ?? DEFAULT_MIND_MAP_EXPORT_LIMITS;
	const diagnostics: MindMapExportDiagnostic[] = [];
	const logicalDimensions = calculateLogicalDimensions(scene, options, diagnostics);
	validateEncoderCapabilities(options, context.encoder, diagnostics);
	const rasterLimits = resolveRasterLimits(limits, context.encoder);

	const internalRasterDpi =
		context.encoder?.fixedRasterDpi ??
		(options.format === "pdf" &&
		context.encoder?.pdfMode !== "vector-single-page"
			? DEFAULT_MIND_MAP_EXPORT_PDF_RASTER_DPI
			: undefined);
	if (
		!isMindMapRasterExportFormat(options.format) &&
		internalRasterDpi === undefined
	) {
		return Object.freeze({
			format: options.format,
			logicalDimensions,
			rasterDimensions: null,
			requestedDpi: null,
			maximumSafeDpi: null,
			recommendedDpi: null,
			estimatedRgbaBytes: 0,
			diagnostics: Object.freeze(diagnostics),
			canExport: !hasErrorDiagnostic(diagnostics),
		});
	}

	const dpi: number =
		(isMindMapRasterExportFormat(options.format)
		? (options.dpi ?? getDefaultDpi(context.encoder, rasterLimits))
		: internalRasterDpi) ?? Number.NaN;
	const effectiveLimits = isMindMapRasterExportFormat(options.format)
		? rasterLimits
		: limits;
	const maximumSafeDpi = findMaximumSafeDpi(
		logicalDimensions,
		effectiveLimits,
	);
	const rasterDimensions = calculateRasterDimensionsIfValid(
		logicalDimensions,
		dpi,
		effectiveLimits,
		diagnostics,
	);
	if (
		maximumSafeDpi === null &&
		logicalDimensions.width > 0 &&
		logicalDimensions.height > 0 &&
		!diagnostics.some((diagnostic) => diagnostic.code === "raster-too-large")
	) {
		diagnostics.push({
			severity: "error",
			code: "raster-too-large",
			message: `This map is too large to rasterize safely, even at ${String(effectiveLimits.minimumDpi)} DPI.`,
		});
	}
	if (
		isMindMapRasterExportFormat(options.format) &&
		maximumSafeDpi !== null &&
		Number.isFinite(dpi) &&
		dpi > maximumSafeDpi
	) {
		diagnostics.push({
			severity: "warning",
			code: "raster-dpi-reduced",
			message: `Use ${String(maximumSafeDpi)} DPI or lower to stay within the safe raster limit.`,
		});
	}

	return Object.freeze({
		format: options.format,
		logicalDimensions,
		rasterDimensions,
		requestedDpi: Number.isFinite(dpi) ? dpi : null,
		maximumSafeDpi,
		recommendedDpi:
			maximumSafeDpi === null
				? null
				: isMindMapRasterExportFormat(options.format) && Number.isFinite(dpi)
					? Math.min(
							Math.max(dpi, Math.ceil(effectiveLimits.minimumDpi)),
							maximumSafeDpi,
						)
					: maximumSafeDpi,
		estimatedRgbaBytes:
			rasterDimensions === null
				? 0
				: rasterDimensions.pixelWidth * rasterDimensions.pixelHeight * 4,
		diagnostics: Object.freeze(diagnostics),
		canExport: !hasErrorDiagnostic(diagnostics),
	});
}

export function findMaximumSafeMindMapExportDpi(
	logicalDimensions: MindMapExportLogicalDimensions,
	limits: MindMapExportLimits = DEFAULT_MIND_MAP_EXPORT_LIMITS,
): number | null {
	return findMaximumSafeDpi(logicalDimensions, limits);
}

/** Enforces the same capability and allocation checks for non-UI callers. */
export function assertMindMapExportPlanIsExportable(
	plan: MindMapExportPlan,
): void {
	if (plan.canExport) {
		return;
	}
	const errors = plan.diagnostics.filter(
		(diagnostic) => diagnostic.severity === "error",
	);
	const message = errors.map((diagnostic) => diagnostic.message).join(" ");
	throw new MindMapExportError(
		message.length > 0 ? message : "The selected export options are invalid.",
		errors.some((diagnostic) => diagnostic.code === "raster-too-large")
			? "too-large"
			: "invalid-options",
	);
}

function calculateLogicalDimensions(
	scene: MindMapExportScene,
	options: MindMapExportOptions,
	diagnostics: MindMapExportDiagnostic[],
): MindMapExportLogicalDimensions {
	let padding: number;
	try {
		padding = normalizeMindMapExportPadding(options.padding);
	} catch {
		diagnostics.push({
			severity: "error",
			code: "invalid-padding",
			message: "Export padding must be a finite number.",
		});
		return { width: 0, height: 0 };
	}
	const width = scene.bounds.width + padding * 2;
	const height = scene.bounds.height + padding * 2;
	if (
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		width <= 0 ||
		height <= 0
	) {
		diagnostics.push({
			severity: "error",
			code: "invalid-scene",
			message: "The mind-map scene does not have valid export dimensions.",
		});
		return { width: 0, height: 0 };
	}
	return {
		width: Math.max(1, Math.ceil(width)),
		height: Math.max(1, Math.ceil(height)),
	};
}

function validateEncoderCapabilities(
	options: MindMapExportOptions,
	encoder: MindMapExportEncoderCapability | undefined,
	diagnostics: MindMapExportDiagnostic[],
): void {
	if (encoder === undefined) {
		return;
	}
	if (encoder.format !== options.format) {
		diagnostics.push({
			severity: "error",
			code: "unsupported-format",
			message: "The selected export format is not provided by this encoder.",
		});
		return;
	}
	if (!encoder.backgrounds.includes(options.background)) {
		diagnostics.push({
			severity: "error",
			code: "unsupported-background",
			message: "The selected background is not available for this export format.",
		});
	}
	if (encoder.dpi === null && options.dpi !== undefined) {
		diagnostics.push({
			severity: "error",
			code: "unsupported-dpi",
			message: "The selected export format does not accept a DPI setting.",
		});
	}
	const quality = options.jpegQuality;
	if (encoder.jpegQuality === null) {
		if (quality !== undefined) {
			diagnostics.push({
				severity: "error",
				code: "unsupported-quality",
				message: "The selected export format does not accept a quality setting.",
			});
		}
		return;
	}
	if (quality === undefined) {
		return;
	}
	if (!Number.isFinite(quality)) {
		diagnostics.push({
			severity: "error",
			code: "invalid-quality",
			message: "Export quality must be a finite number.",
		});
		return;
	}
	if (
		quality < encoder.jpegQuality.minimum ||
		quality > encoder.jpegQuality.maximum
	) {
		diagnostics.push({
			severity: "error",
			code: "quality-out-of-range",
			message: `Choose a quality between ${String(encoder.jpegQuality.minimum)} and ${String(encoder.jpegQuality.maximum)}.`,
		});
	}
}

function resolveRasterLimits(
	limits: MindMapExportLimits,
	encoder: MindMapExportEncoderCapability | undefined,
): MindMapExportLimits {
	const dpi = encoder?.dpi;
	if (dpi === null || dpi === undefined) {
		return limits;
	}
	return {
		...limits,
		minimumDpi: Math.max(limits.minimumDpi, dpi.minimum),
		maximumDpi: Math.min(limits.maximumDpi, dpi.maximum),
	};
}

function getDefaultDpi(
	encoder: MindMapExportEncoderCapability | undefined,
	limits: MindMapExportLimits,
): number {
	const configured = encoder?.dpi?.defaultValue;
	return configured === undefined
		? Math.min(150, limits.maximumDpi)
		: configured;
}

function calculateRasterDimensionsIfValid(
	logicalDimensions: MindMapExportLogicalDimensions,
	dpi: number,
	limits: MindMapExportLimits,
	diagnostics: MindMapExportDiagnostic[],
): MindMapRasterDimensions | null {
	if (!Number.isFinite(dpi)) {
		diagnostics.push({
			severity: "error",
			code: "invalid-dpi",
			message: "Raster DPI must be a finite number.",
		});
		return null;
	}
	if (dpi < limits.minimumDpi || dpi > limits.maximumDpi) {
		diagnostics.push({
			severity: "error",
			code: "dpi-out-of-range",
			message: `Choose a DPI between ${String(limits.minimumDpi)} and ${String(limits.maximumDpi)}.`,
		});
		return null;
	}
	if (logicalDimensions.width <= 0 || logicalDimensions.height <= 0) {
		return null;
	}
	const scale = dpi / CSS_PIXELS_PER_INCH;
	const pixelWidth = Math.max(1, Math.ceil(logicalDimensions.width * scale));
	const pixelHeight = Math.max(1, Math.ceil(logicalDimensions.height * scale));
	if (
		pixelWidth > limits.maximumDimension ||
		pixelHeight > limits.maximumDimension ||
		pixelWidth * pixelHeight > limits.maximumPixels
	) {
		diagnostics.push({
			severity: "error",
			code: "raster-too-large",
			message: `The requested raster export is ${String(pixelWidth)} × ${String(pixelHeight)} pixels, which exceeds the safe export limit.`,
		});
		return null;
	}
	return {
		logicalWidth: logicalDimensions.width,
		logicalHeight: logicalDimensions.height,
		pixelWidth,
		pixelHeight,
		dpi,
	};
}

function findMaximumSafeDpi(
	logicalDimensions: MindMapExportLogicalDimensions,
	limits: MindMapExportLimits,
): number | null {
	if (
		!Number.isFinite(logicalDimensions.width) ||
		!Number.isFinite(logicalDimensions.height) ||
		logicalDimensions.width <= 0 ||
		logicalDimensions.height <= 0
	) {
		return null;
	}
	const lowerBound = Math.ceil(limits.minimumDpi);
	const upperBound = Math.floor(limits.maximumDpi);
	if (
		lowerBound > upperBound ||
		!isSafeDpi(logicalDimensions, lowerBound, limits)
	) {
		return null;
	}
	let lower = lowerBound;
	let upper = upperBound;
	while (lower < upper) {
		const middle = Math.ceil((lower + upper) / 2);
		if (isSafeDpi(logicalDimensions, middle, limits)) {
			lower = middle;
		} else {
			upper = middle - 1;
		}
	}
	return lower;
}

function isSafeDpi(
	logicalDimensions: MindMapExportLogicalDimensions,
	dpi: number,
	limits: MindMapExportLimits,
): boolean {
	const scale = dpi / CSS_PIXELS_PER_INCH;
	const width = Math.max(1, Math.ceil(logicalDimensions.width * scale));
	const height = Math.max(1, Math.ceil(logicalDimensions.height * scale));
	return (
		width <= limits.maximumDimension &&
		height <= limits.maximumDimension &&
		width * height <= limits.maximumPixels
	);
}

function hasErrorDiagnostic(
	diagnostics: readonly MindMapExportDiagnostic[],
): boolean {
	return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
