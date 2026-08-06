import type { MindMapNodeShape } from "../presentation/presentation";

export type MindMapExportFormat = "svg" | "png" | "jpeg" | "pdf";

export type MindMapExportScope = "visible-map" | "full-map";

export type MindMapExportBackground = "theme" | "transparent";

/**
 * The stable order used by capability-driven export UIs. New encoders may be
 * registered without being added here; this list only gives built-ins a
 * predictable order.
 */
export const MIND_MAP_EXPORT_FORMATS = Object.freeze([
	"jpeg",
	"png",
	"pdf",
	"svg",
] as const satisfies readonly MindMapExportFormat[]);

export interface MindMapExportCaptureRequest {
	readonly scope: MindMapExportScope;
}

export interface MindMapExportOptions extends MindMapExportCaptureRequest {
	readonly format: MindMapExportFormat;
	readonly fileName: string;
	readonly background: MindMapExportBackground;
	readonly padding: number;
	readonly dpi?: number;
	readonly jpegQuality?: number;
}

/** Stable phase order for accessible progress UI and test assertions. */
export const MIND_MAP_EXPORT_PROGRESS_PHASES = Object.freeze([
	"capture",
	"measure",
	"layout",
	"serialize",
	"rasterize",
	"encode",
	"save",
] as const);

/** The high-level stages an explicit export may report to its UI owner. */
export type MindMapExportProgressPhase =
	(typeof MIND_MAP_EXPORT_PROGRESS_PHASES)[number];

export interface MindMapExportProgress {
	readonly phase: MindMapExportProgressPhase;
	/** `started` and `completed` are deliberately enough for non-streaming ports. */
	readonly state: "started" | "completed";
	/** An optional normalized fraction for ports that can supply one. */
	readonly fraction?: number;
}

export type MindMapExportProgressListener = (
	progress: MindMapExportProgress,
) => void;

/**
 * Converts phase-local progress into one monotonic value for a global progress
 * bar. Late renderer events from an earlier phase can never move the bar
 * backwards or mark the whole export complete before the save phase finishes.
 */
export function advanceMindMapExportProgress(
	previous: number,
	progress: MindMapExportProgress,
): number {
	const phaseIndex = Math.max(
		0,
		MIND_MAP_EXPORT_PROGRESS_PHASES.indexOf(progress.phase),
	);
	const phaseFraction = Math.min(
		1,
		Math.max(
			0,
			progress.state === "completed" ? 1 : (progress.fraction ?? 0),
		),
	);
	const aggregate =
		(phaseIndex + phaseFraction) / MIND_MAP_EXPORT_PROGRESS_PHASES.length;
	return Math.max(Math.min(1, Math.max(0, previous)), aggregate);
}

/**
 * Shared execution context for all encoder implementations. It keeps
 * cancellation and status reporting independent from any particular modal.
 */
export interface MindMapExportExecutionContext {
	readonly signal?: AbortSignal;
	readonly onProgress?: MindMapExportProgressListener;
}

/** Progress listeners are observational; UI failures must not abort an export. */
export function reportMindMapExportProgress(
	context: MindMapExportExecutionContext | undefined,
	phase: MindMapExportProgressPhase,
	state: MindMapExportProgress["state"],
	fraction?: number,
): void {
	try {
		context?.onProgress?.({
			phase,
			state,
			...(fraction === undefined ? {} : { fraction }),
		});
	} catch {
		// A display-only progress listener must never affect the artifact.
	}
}

export interface MindMapExportLimits {
	readonly minimumDpi: number;
	readonly maximumDpi: number;
	readonly maximumDimension: number;
	readonly maximumPixels: number;
}

export const DEFAULT_MIND_MAP_EXPORT_LIMITS: MindMapExportLimits =
	Object.freeze({
		minimumDpi: 72,
		maximumDpi: 600,
		maximumDimension: 16_384,
		maximumPixels: 67_108_864,
	});

export const MIND_MAP_EXPORT_DPI_PRESETS = Object.freeze([
	96,
	150,
	300,
	600,
] as const);

/** The current raster-PDF adapter's fixed, non-user-configurable density. */
export const DEFAULT_MIND_MAP_EXPORT_PDF_RASTER_DPI = 192;

export interface MindMapExportDpiCapability {
	readonly minimum: number;
	readonly maximum: number;
	readonly presets: readonly number[];
	readonly defaultValue: number;
	/** A number input is allowed in addition to the listed presets. */
	readonly supportsCustomValue: boolean;
}

export interface MindMapExportJpegQualityCapability {
	readonly minimum: number;
	readonly maximum: number;
	readonly step: number;
	readonly defaultValue: number;
}

/**
 * Format-specific controls declared by an encoder, rather than inferred from
 * a hard-coded format switch in a frontend. `null` means that the format does
 * not expose that option.
 */
export interface MindMapExportEncoderCapability {
	readonly format: MindMapExportFormat;
	readonly label: string;
	readonly mimeType: string;
	readonly backgrounds: readonly MindMapExportBackground[];
	readonly dpi: MindMapExportDpiCapability | null;
	/**
	 * A non-user-configurable raster density used internally by an encoder (the
	 * current raster-PDF adapter uses this for its embedded image).
	 */
	readonly fixedRasterDpi?: number;
	readonly jpegQuality: MindMapExportJpegQualityCapability | null;
	readonly pdfMode?: "raster-single-page" | "vector-single-page";
}

export interface MindMapExportCapabilities {
	/** Preferred, capability-driven format catalog for new frontends. */
	readonly encoders: readonly MindMapExportEncoderCapability[];
	/** @deprecated Prefer `encoders.map((encoder) => encoder.format)`. */
	readonly formats: readonly MindMapExportFormat[];
	readonly scopes: readonly MindMapExportScope[];
	/** @deprecated Prefer each encoder's `dpi` declaration. */
	readonly rasterDpiPresets: readonly number[];
	readonly limits: MindMapExportLimits;
	/** @deprecated Prefer the PDF encoder capability's `pdfMode`. */
	readonly pdfMode: "raster-single-page";
}

export function getMindMapExportEncoderCapability(
	capabilities: MindMapExportCapabilities,
	format: MindMapExportFormat,
): MindMapExportEncoderCapability | undefined {
	return capabilities.encoders.find((encoder) => encoder.format === format);
}

export interface MindMapExportBounds {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export type MindMapExportPaint =
	| {
			readonly kind: "none";
	  }
	| {
			readonly kind: "color";
			readonly value: string;
	  }
	| {
			readonly kind: "hatch";
			readonly background: string;
			readonly color: string;
			readonly gap: number;
			readonly opacity: number;
			readonly angle: number;
	  }
	| {
			/** Deterministic charcoal-dust pattern used by material Styles. */
			readonly kind: "speckle";
			readonly background: string;
			readonly color: string;
			readonly gap: number;
			readonly radius: number;
			readonly opacity: number;
	  };

interface MindMapExportPrimitiveBase {
	readonly id?: string;
	readonly opacity?: number;
	/** Optional fill-only alpha, kept separate from whole-primitive opacity. */
	readonly fillOpacity?: number;
	readonly transform?: string;
}

interface MindMapExportStrokePrimitiveBase
	extends MindMapExportPrimitiveBase {
	readonly stroke: string;
	readonly strokeWidth: number;
	readonly dashArray?: readonly number[];
	readonly lineCap?: "butt" | "round" | "square";
	readonly lineJoin?: "bevel" | "miter" | "round";
}

export interface MindMapExportRectPrimitive
	extends MindMapExportPrimitiveBase {
	readonly kind: "rect";
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly radiusX: number;
	readonly radiusY: number;
	readonly fill: MindMapExportPaint;
	readonly stroke: string;
	readonly strokeWidth: number;
}

export interface MindMapExportEllipsePrimitive
	extends MindMapExportPrimitiveBase {
	readonly kind: "ellipse";
	readonly centerX: number;
	readonly centerY: number;
	readonly radiusX: number;
	readonly radiusY: number;
	readonly fill: MindMapExportPaint;
	readonly stroke: string;
	readonly strokeWidth: number;
}

export interface MindMapExportPathPrimitive
	extends MindMapExportStrokePrimitiveBase {
	readonly kind: "path";
	readonly data: string;
	readonly fill: MindMapExportPaint;
}

export interface MindMapExportCirclePrimitive
	extends MindMapExportPrimitiveBase {
	readonly kind: "circle";
	readonly centerX: number;
	readonly centerY: number;
	readonly radius: number;
	readonly fill: MindMapExportPaint;
	readonly stroke: string;
	readonly strokeWidth: number;
}

export type MindMapExportTextAnchor = "start" | "middle" | "end";

export interface MindMapExportTextPrimitive
	extends MindMapExportPrimitiveBase {
	readonly kind: "text";
	readonly x: number;
	readonly y: number;
	readonly text: string;
	readonly fill: string;
	readonly fontFamily: string;
	readonly fontSize: number;
	readonly fontWeight: string;
	readonly fontStyle: "normal" | "italic";
	readonly textDecoration?: "line-through";
	readonly textAnchor?: MindMapExportTextAnchor;
}

export type MindMapExportPrimitive =
	| MindMapExportRectPrimitive
	| MindMapExportEllipsePrimitive
	| MindMapExportPathPrimitive
	| MindMapExportCirclePrimitive
	| MindMapExportTextPrimitive;

export interface MindMapExportPaperGrainTexture {
	readonly kind: "paper-grain";
	readonly fineColor: string;
	readonly coarseColor: string;
	readonly fineCellSize: number;
	readonly coarseCellSize: number;
	readonly offsetX: number;
	readonly offsetY: number;
	readonly opacity: number;
}

export interface MindMapExportTechnicalGridTexture {
	readonly kind: "technical-grid";
	readonly minorColor: string;
	readonly majorColor: string;
	readonly cellSize: number;
	readonly majorEvery: number;
	readonly opacity: number;
}

export interface MindMapExportCharcoalPaperTexture {
	readonly kind: "charcoal-paper";
	readonly fineColor: string;
	readonly coarseColor: string;
	readonly fineCellSize: number;
	readonly coarseCellSize: number;
	readonly offsetX: number;
	readonly offsetY: number;
	readonly opacity: number;
}

/**
 * Renderer-neutral canvas material captured in the immutable export scene.
 * Palette colors are already resolved by the live adapter before this value
 * crosses into the framework-free encoder boundary.
 */
export type MindMapExportCanvasTexture =
	| MindMapExportPaperGrainTexture
	| MindMapExportTechnicalGridTexture
	| MindMapExportCharcoalPaperTexture;

export interface MindMapExportScene {
	readonly sourcePath: string;
	readonly sourceRevision: string;
	readonly presentationRevision: number;
	readonly scope: MindMapExportScope;
	readonly bounds: MindMapExportBounds;
	readonly backgroundColor: string;
	readonly canvasTexture: MindMapExportCanvasTexture | null;
	readonly primitives: readonly MindMapExportPrimitive[];
	readonly nodeShapes: readonly MindMapNodeShape[];
}

export interface MindMapExportArtifact {
	readonly format: MindMapExportFormat;
	readonly fileName: string;
	readonly mimeType: string;
	readonly bytes: Uint8Array;
	readonly width: number;
	readonly height: number;
	readonly dpi: number | null;
}

export interface MindMapRasterDimensions {
	readonly logicalWidth: number;
	readonly logicalHeight: number;
	readonly pixelWidth: number;
	readonly pixelHeight: number;
	readonly dpi: number;
}

export interface MindMapExportLogicalDimensions {
	readonly width: number;
	readonly height: number;
}

export type MindMapExportDiagnosticSeverity = "info" | "warning" | "error";

export type MindMapExportDiagnosticCode =
	| "invalid-padding"
	| "invalid-scene"
	| "invalid-dpi"
	| "dpi-out-of-range"
	| "unsupported-dpi"
	| "invalid-quality"
	| "quality-out-of-range"
	| "unsupported-quality"
	| "raster-too-large"
	| "raster-dpi-reduced"
	| "unsupported-background"
	| "unsupported-format";

export interface MindMapExportDiagnostic {
	readonly severity: MindMapExportDiagnosticSeverity;
	readonly code: MindMapExportDiagnosticCode;
	readonly message: string;
}

/**
 * A side-effect-free export feasibility result. It is intentionally separate
 * from encoding so a dialog can update estimates on every option change
 * without capturing a canvas or allocating bitmap memory.
 */
export interface MindMapExportPlan {
	readonly format: MindMapExportFormat;
	readonly logicalDimensions: MindMapExportLogicalDimensions;
	readonly rasterDimensions: MindMapRasterDimensions | null;
	readonly requestedDpi: number | null;
	readonly maximumSafeDpi: number | null;
	readonly recommendedDpi: number | null;
	/** One RGBA bitmap allocation, expressed in bytes. */
	readonly estimatedRgbaBytes: number;
	readonly diagnostics: readonly MindMapExportDiagnostic[];
	readonly canExport: boolean;
}

export class MindMapExportError extends Error {
	public constructor(
		message: string,
		public readonly code:
			| "aborted"
			| "invalid-options"
			| "scene-unavailable"
			| "too-large"
			| "encode-failed"
			| "save-failed",
	) {
		super(message);
		this.name = "MindMapExportError";
	}
}

export function normalizeMindMapExportFileName(
	fileName: string,
	format: MindMapExportFormat,
): string {
	const fallback = "mind-map";
	const invalidCharacters = new Set(["\\", "/", ":", "*", "?", '"', "<", ">", "|"]);
	const cleaned = Array.from(fileName.trim(), (character) =>
		character.charCodeAt(0) <= 0x1f || invalidCharacters.has(character)
			? "-"
			: character,
	)
		.join("")
		.replace(/\.+$/g, "")
		.trim();
	const baseName = cleaned.length > 0 ? cleaned : fallback;
	const extension = format === "jpeg" ? "jpg" : format;
	return baseName.toLowerCase().endsWith(`.${extension}`)
		? baseName
		: `${baseName}.${extension}`;
}

/** Keep SVG serialization and preflight calculation on the same padding rule. */
export function normalizeMindMapExportPadding(value: number): number {
	if (!Number.isFinite(value)) {
		throw new MindMapExportError(
			"Export padding must be a finite number.",
			"invalid-options",
		);
	}
	return Math.min(512, Math.max(0, value));
}

export function isMindMapRasterExportFormat(
	format: MindMapExportFormat,
): format is "png" | "jpeg" {
	return format === "png" || format === "jpeg";
}

export function throwIfMindMapExportAborted(
	signal: AbortSignal | undefined,
): void {
	if (signal?.aborted === true) {
		throw new MindMapExportError("Mind-map export was cancelled.", "aborted");
	}
}
