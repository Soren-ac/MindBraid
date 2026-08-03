import type { SerializedMindMapSvg } from "./svg";
import {
	type MindMapExportArtifact,
	type MindMapExportEncoderCapability,
	MindMapExportError,
	type MindMapExportExecutionContext,
	type MindMapExportFormat,
	type MindMapExportOptions,
	type MindMapExportScene,
} from "./types";

/**
 * The encoder input is deliberately a fully prepared, immutable scene. An
 * encoder never knows about the live renderer, a Vault, or a download UI.
 */
export interface MindMapExportEncodingRequest {
	readonly scene: MindMapExportScene;
	readonly options: MindMapExportOptions;
	readonly fileName: string;
	readonly serializedSvg: SerializedMindMapSvg;
	readonly context?: MindMapExportExecutionContext;
}

export interface MindMapExportEncoder {
	readonly capability: MindMapExportEncoderCapability;
	encode(request: MindMapExportEncodingRequest): Promise<MindMapExportArtifact>;
}

/**
 * A format registry is the only dispatch point needed by the export pipeline.
 * It lets future WebP/vector-PDF/etc. encoders add a tab and implementation
 * without adding format switches to renderer or controller code.
 */
export class MindMapExportEncoderRegistry {
	private readonly byFormat: ReadonlyMap<MindMapExportFormat, MindMapExportEncoder>;

	public constructor(encoders: readonly MindMapExportEncoder[]) {
		const byFormat = new Map<MindMapExportFormat, MindMapExportEncoder>();
		for (const encoder of encoders) {
			const format = encoder.capability.format;
			if (byFormat.has(format)) {
				throw new MindMapExportError(
					`More than one encoder was registered for ${format}.`,
					"invalid-options",
				);
			}
			byFormat.set(format, encoder);
		}
		this.byFormat = byFormat;
	}

	public list(): readonly MindMapExportEncoder[] {
		return Object.freeze([...this.byFormat.values()]);
	}

	public listCapabilities(): readonly MindMapExportEncoderCapability[] {
		return Object.freeze(
			[...this.byFormat.values()].map((encoder) => encoder.capability),
		);
	}

	public resolve(format: MindMapExportFormat): MindMapExportEncoder {
		const encoder = this.byFormat.get(format);
		if (encoder === undefined) {
			throw new MindMapExportError(
				"The requested mind-map export format is not supported.",
				"invalid-options",
			);
		}
		return encoder;
	}
}
