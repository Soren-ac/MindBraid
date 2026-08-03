import type { MindMapPdfEncoder } from "./pdf";
import type { MindMapRasterBrowserPort } from "./raster";
import { rasterizeMindMapSvg } from "./raster";
import {
	MindMapExportEncoderRegistry,
	type MindMapExportEncoder,
	type MindMapExportEncodingRequest,
} from "./registry";
import {
	DEFAULT_MIND_MAP_EXPORT_LIMITS,
	DEFAULT_MIND_MAP_EXPORT_PDF_RASTER_DPI,
	MIND_MAP_EXPORT_DPI_PRESETS,
	reportMindMapExportProgress,
	type MindMapExportArtifact,
	type MindMapExportEncoderCapability,
	type MindMapExportLimits,
	MindMapExportError,
	type MindMapExportFormat,
	throwIfMindMapExportAborted,
} from "./types";

const DEFAULT_RASTER_DPI = 150;

export interface BuiltInMindMapExportEncoderDependencies {
	readonly rasterPort: MindMapRasterBrowserPort;
	readonly pdfEncoder: MindMapPdfEncoder;
	readonly limits: MindMapExportLimits;
}

const RASTER_DPI_CAPABILITY = Object.freeze({
	minimum: DEFAULT_MIND_MAP_EXPORT_LIMITS.minimumDpi,
	maximum: DEFAULT_MIND_MAP_EXPORT_LIMITS.maximumDpi,
	presets: MIND_MAP_EXPORT_DPI_PRESETS,
	defaultValue: DEFAULT_RASTER_DPI,
	supportsCustomValue: true,
});

export const BUILT_IN_MIND_MAP_EXPORT_ENCODER_CAPABILITIES = Object.freeze([
	Object.freeze({
		format: "jpeg",
		label: "JPG",
		mimeType: "image/jpeg",
		backgrounds: ["theme"] as const,
		dpi: RASTER_DPI_CAPABILITY,
		jpegQuality: Object.freeze({
			minimum: 0.1,
			maximum: 1,
			step: 0.01,
			defaultValue: 0.92,
		}),
	}),
	Object.freeze({
		format: "png",
		label: "PNG",
		mimeType: "image/png",
		backgrounds: ["theme", "transparent"] as const,
		dpi: RASTER_DPI_CAPABILITY,
		jpegQuality: null,
	}),
	Object.freeze({
		format: "pdf",
		label: "PDF",
		mimeType: "application/pdf",
		backgrounds: ["theme"] as const,
		dpi: null,
		fixedRasterDpi: DEFAULT_MIND_MAP_EXPORT_PDF_RASTER_DPI,
		jpegQuality: null,
		pdfMode: "raster-single-page",
	}),
	Object.freeze({
		format: "svg",
		label: "SVG",
		mimeType: "image/svg+xml",
		backgrounds: ["theme", "transparent"] as const,
		dpi: null,
		jpegQuality: null,
	}),
] as const satisfies readonly MindMapExportEncoderCapability[]);

/** Creates the built-in registry with its concrete browser/PDF ports injected. */
export function createBuiltInMindMapExportEncoderRegistry(
	dependencies: BuiltInMindMapExportEncoderDependencies,
): MindMapExportEncoderRegistry {
	return new MindMapExportEncoderRegistry([
		createRasterEncoder("jpeg", dependencies),
		createRasterEncoder("png", dependencies),
		createPdfEncoder(dependencies),
		createSvgEncoder(),
	]);
}

function createSvgEncoder(): MindMapExportEncoder {
	const capability = getBuiltInCapability("svg");
	return Object.freeze({
		capability,
		async encode(
			request: MindMapExportEncodingRequest,
		): Promise<MindMapExportArtifact> {
			throwIfMindMapExportAborted(request.context?.signal);
			reportMindMapExportProgress(request.context, "encode", "started");
			const artifact: MindMapExportArtifact = {
				format: "svg",
				fileName: request.fileName,
				mimeType: capability.mimeType,
				bytes: new TextEncoder().encode(request.serializedSvg.svg),
				width: request.serializedSvg.width,
				height: request.serializedSvg.height,
				dpi: null,
			};
			reportMindMapExportProgress(request.context, "encode", "completed", 1);
			return artifact;
		},
	});
}

function createRasterEncoder(
	format: "png" | "jpeg",
	dependencies: BuiltInMindMapExportEncoderDependencies,
): MindMapExportEncoder {
	const capability = getBuiltInCapability(format);
	return Object.freeze({
		capability,
		async encode(
			request: MindMapExportEncodingRequest,
		): Promise<MindMapExportArtifact> {
			const dpi = request.options.dpi ?? DEFAULT_RASTER_DPI;
			const raster = await rasterizeMindMapSvg(
				{
					svg: request.serializedSvg.svg,
					logicalWidth: request.serializedSvg.width,
					logicalHeight: request.serializedSvg.height,
					format,
					dpi,
					jpegQuality: request.options.jpegQuality,
					jpegBackgroundColor: request.scene.backgroundColor,
					limits: dependencies.limits,
				},
				dependencies.rasterPort,
				request.context,
			);
			return {
				format,
				fileName: request.fileName,
				mimeType: raster.mimeType,
				bytes: raster.bytes,
				width: raster.dimensions.pixelWidth,
				height: raster.dimensions.pixelHeight,
				dpi,
			};
		},
	});
}

function createPdfEncoder(
	dependencies: BuiltInMindMapExportEncoderDependencies,
): MindMapExportEncoder {
	const capability = getBuiltInCapability("pdf");
	return Object.freeze({
		capability,
		async encode(
			request: MindMapExportEncodingRequest,
		): Promise<MindMapExportArtifact> {
			const raster = await rasterizeMindMapSvg(
				{
					svg: request.serializedSvg.svg,
					logicalWidth: request.serializedSvg.width,
					logicalHeight: request.serializedSvg.height,
					format: "jpeg",
					dpi: DEFAULT_MIND_MAP_EXPORT_PDF_RASTER_DPI,
					jpegQuality: 0.94,
					jpegBackgroundColor: request.scene.backgroundColor,
					limits: dependencies.limits,
				},
				dependencies.rasterPort,
				request.context,
			);
			throwIfMindMapExportAborted(request.context?.signal);
			reportMindMapExportProgress(request.context, "encode", "started");
			const bytes = await dependencies.pdfEncoder.encode(
				{
					bytes: raster.bytes,
					mimeType: raster.mimeType,
					pixelWidth: raster.dimensions.pixelWidth,
					pixelHeight: raster.dimensions.pixelHeight,
					dpi: raster.dimensions.dpi,
				},
				request.context?.signal,
			);
			reportMindMapExportProgress(request.context, "encode", "completed", 1);
			return {
				format: "pdf",
				fileName: request.fileName,
				mimeType: capability.mimeType,
				bytes,
				width: request.serializedSvg.width,
				height: request.serializedSvg.height,
				dpi: null,
			};
		},
	});
}

function getBuiltInCapability(
	format: MindMapExportFormat,
): MindMapExportEncoderCapability {
	const capability = BUILT_IN_MIND_MAP_EXPORT_ENCODER_CAPABILITIES.find(
		(candidate) => candidate.format === format,
	);
	if (capability === undefined) {
		throw new MindMapExportError(
			`No built-in export capability exists for ${format}.`,
			"invalid-options",
		);
	}
	return capability;
}
