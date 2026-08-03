import {
	createBuiltInMindMapExportEncoderRegistry,
	type BuiltInMindMapExportEncoderDependencies,
} from "./built-in-encoders";
import {
	PDF_LIB_MIND_MAP_ENCODER,
	type MindMapPdfEncoder,
} from "./pdf";
import {
	createBrowserMindMapRasterPort,
	type MindMapRasterBrowserPort,
} from "./raster";
import {
	MindMapExportEncoderRegistry,
	type MindMapExportEncoder,
} from "./registry";
import {
	assertMindMapExportPlanIsExportable,
	planMindMapExport,
} from "./plan";
import type { SerializedMindMapSvg } from "./svg";
import { serializeMindMapExportSceneToSvg } from "./svg";
import {
	DEFAULT_MIND_MAP_EXPORT_LIMITS,
	type MindMapExportArtifact,
	type MindMapExportExecutionContext,
	type MindMapExportLimits,
	type MindMapExportOptions,
	type MindMapExportScene,
	normalizeMindMapExportFileName,
	reportMindMapExportProgress,
	throwIfMindMapExportAborted,
} from "./types";

/**
 * Browser and PDF ports are injected so the orchestration stays testable. A
 * caller may additionally replace the full encoder registry for new formats.
 */
export interface MindMapExporterDependencies
	extends BuiltInMindMapExportEncoderDependencies {
	readonly rasterPort: MindMapRasterBrowserPort;
	readonly pdfEncoder: MindMapPdfEncoder;
	readonly limits: MindMapExportLimits;
	readonly registry?: MindMapExportEncoderRegistry;
}

/**
 * The cacheable boundary between scene preparation and actual format encoding.
 * It contains no Blob, canvas, or download resource, so a modal session may
 * safely retain it while users change only filename or quality controls.
 */
export interface MindMapPreparedExport {
	readonly scene: MindMapExportScene;
	readonly options: MindMapExportOptions;
	readonly fileName: string;
	readonly encoder: MindMapExportEncoder;
	readonly serializedSvg: SerializedMindMapSvg;
}

export function createBrowserMindMapExporterDependencies(
	ownerDocument: Document,
): MindMapExporterDependencies {
	const dependencies: BuiltInMindMapExportEncoderDependencies = {
		rasterPort: createBrowserMindMapRasterPort(ownerDocument),
		pdfEncoder: PDF_LIB_MIND_MAP_ENCODER,
		limits: DEFAULT_MIND_MAP_EXPORT_LIMITS,
	};
	return {
		...dependencies,
		registry: createBuiltInMindMapExportEncoderRegistry(dependencies),
	};
}

/**
 * Encodes one immutable scene through a registered format adapter. Existing
 * callers can keep passing an AbortSignal as the fourth argument; new callers
 * may use the execution context to receive phase progress.
 */
export async function createMindMapExportArtifact(
	scene: MindMapExportScene,
	options: MindMapExportOptions,
	dependencies: MindMapExporterDependencies,
	contextOrSignal?: MindMapExportExecutionContext | AbortSignal,
): Promise<MindMapExportArtifact> {
	const prepared = prepareMindMapExportArtifact(
		scene,
		options,
		dependencies,
		contextOrSignal,
	);
	throwIfMindMapExportAborted(prepared.context?.signal);
	return prepared.encoder.encode({
		scene: prepared.scene,
		options: prepared.options,
		fileName: prepared.fileName,
		serializedSvg: prepared.serializedSvg,
		context: prepared.context,
	});
}

export interface MindMapPreparedExportWithContext extends MindMapPreparedExport {
	readonly context: MindMapExportExecutionContext | undefined;
}

/**
 * Serializes a scene once, without allocating a raster image. The returned
 * object is deliberately suitable for short-lived dialog-session caching.
 */
export function prepareMindMapExportArtifact(
	scene: MindMapExportScene,
	options: MindMapExportOptions,
	dependencies: MindMapExporterDependencies,
	contextOrSignal?: MindMapExportExecutionContext | AbortSignal,
): MindMapPreparedExportWithContext {
	const context = normalizeExecutionContext(contextOrSignal);
	throwIfMindMapExportAborted(context?.signal);
	const registry =
		dependencies.registry ?? createBuiltInMindMapExportEncoderRegistry(dependencies);
	const encoder = registry.resolve(options.format);
	assertMindMapExportPlanIsExportable(
		planMindMapExport(scene, options, {
			limits: dependencies.limits,
			encoder: encoder.capability,
		}),
	);
	const fileName = normalizeMindMapExportFileName(
		options.fileName,
		options.format,
	);
	const background = encoder.capability.backgrounds.includes(options.background)
		? options.background
		: "theme";

	reportMindMapExportProgress(context, "serialize", "started");
	const serialized = serializeMindMapExportSceneToSvg(
		scene,
		{
			background,
			padding: options.padding,
		},
		context?.signal,
	);
	reportMindMapExportProgress(context, "serialize", "completed", 1);
	throwIfMindMapExportAborted(context?.signal);
	return {
		scene,
		options,
		fileName,
		encoder,
		serializedSvg: serialized,
		context,
	};
}

function normalizeExecutionContext(
	value: MindMapExportExecutionContext | AbortSignal | undefined,
): MindMapExportExecutionContext | undefined {
	if (value === undefined) {
		return undefined;
	}
	return isAbortSignal(value) ? { signal: value } : value;
}

function isAbortSignal(value: MindMapExportExecutionContext | AbortSignal): value is AbortSignal {
	return "aborted" in value && "addEventListener" in value;
}
