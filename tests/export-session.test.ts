import { describe, expect, it, vi } from "vitest";

import type { MindMapExporterDependencies } from "../src/export/exporter";
import {
	MindMapExportEncoderRegistry,
	type MindMapExportEncoder,
	type MindMapExportEncodingRequest,
} from "../src/export/registry";
import {
	getMindMapExportSceneRevision,
	MindMapExportSession,
} from "../src/export/session";
import {
	reportMindMapExportProgress,
	type MindMapExportArtifact,
	type MindMapExportOptions,
} from "../src/export/types";
import { createExportScene } from "./export-fixtures";

describe("mind-map export dialog session", () => {
	it("caches one immutable scene and prepared SVG across filename-only changes", async () => {
		const scene = createExportScene();
		const capture = vi.fn(async () => scene);
		const encode = vi.fn(
			async (
				_request: MindMapExportEncodingRequest,
			): Promise<MindMapExportArtifact> => ({
				format: "svg",
				fileName: "placeholder.svg",
				mimeType: "image/svg+xml",
				bytes: new Uint8Array(),
				width: 1,
				height: 1,
				dpi: null,
			}),
		);
		const session = new MindMapExportSession({
			capturer: { capture },
			dependencies: createSessionDependencies(encode),
			getCurrentRevision: () => getMindMapExportSceneRevision(scene),
		});

		await session.createArtifact(createOptions({ fileName: "First" }));
		await session.createArtifact(createOptions({ fileName: "Second" }));

		expect(capture).toHaveBeenCalledTimes(1);
		expect(encode).toHaveBeenCalledTimes(2);
		expect(encode.mock.calls[0]?.[0].serializedSvg).toBe(
			encode.mock.calls[1]?.[0].serializedSvg,
		);
		expect(encode.mock.calls[1]?.[0].fileName).toBe("Second.svg");
	});

	it("reuses one serialized SVG across compatible format changes", async () => {
		const scene = createExportScene();
		const serialized: unknown[] = [];
		const svgEncoder = createSvgEncoder(async (request) => {
			serialized.push(request.serializedSvg);
			return createArtifact("svg", request.fileName);
		});
		const pngEncoder: MindMapExportEncoder = {
			capability: {
				format: "png",
				label: "PNG",
				mimeType: "image/png",
				backgrounds: ["theme", "transparent"],
				dpi: {
					minimum: 72,
					maximum: 600,
					presets: [96, 150, 300, 600],
					defaultValue: 150,
					supportsCustomValue: true,
				},
				jpegQuality: null,
			},
			encode: async (request) => {
				serialized.push(request.serializedSvg);
				return createArtifact("png", request.fileName);
			},
		};
		const session = new MindMapExportSession({
			capturer: { capture: async () => scene },
			dependencies: createSessionDependenciesWithEncoders([
				svgEncoder,
				pngEncoder,
			]),
		});

		await session.createArtifact(createOptions());
		await session.createArtifact(
			createOptions({ format: "png", fileName: "Roadmap image", dpi: 150 }),
		);

		expect(serialized).toHaveLength(2);
		expect(serialized[1]).toBe(serialized[0]);
	});

	it("invalidates an open dialog before saving when its source revision changes", async () => {
		const scene = createExportScene();
		let current = getMindMapExportSceneRevision(scene);
		const capture = vi.fn(async () => scene);
		const save = vi.fn(async (): Promise<void> => undefined);
		const session = new MindMapExportSession({
			capturer: { capture },
			dependencies: createSessionDependencies(),
			getCurrentRevision: () => current,
		});
		await session.getScene("visible-map");
		current = { ...current, sourceRevision: "revision-2" };

		await expect(
			session.exportToSink(createOptions(), { save }),
		).rejects.toMatchObject({ code: "scene-unavailable" });
		expect(save).not.toHaveBeenCalled();
	});

	it("does not save after cancellation when an encoder ignores the signal", async () => {
		const scene = createExportScene();
		let encodeStarted = false;
		let resolveEncode: (artifact: MindMapExportArtifact) => void = () => {
			throw new Error("The encoder resolver is not ready.");
		};
		const encoder = createSvgEncoder(
			(request) =>
				new Promise<MindMapExportArtifact>((resolve) => {
					encodeStarted = true;
					resolveEncode = resolve;
				}),
		);
		const save = vi.fn(async (): Promise<void> => undefined);
		const controller = new AbortController();
		const session = new MindMapExportSession({
			capturer: { capture: async () => scene },
			dependencies: createSessionDependencies(
				async () => {
					throw new Error("The registered encoder should be used instead.");
				},
				encoder,
			),
		});
		const pending = session.exportToSink(createOptions(), { save }, {
			signal: controller.signal,
		});
		await vi.waitFor(() => {
			expect(encodeStarted).toBe(true);
		});
		controller.abort();
		resolveEncode(createArtifact("svg", "Roadmap.svg"));

		await expect(pending).rejects.toMatchObject({ code: "aborted" });
		expect(save).not.toHaveBeenCalled();
	});

	it("reports capture, serialization, encoding, and save exactly once", async () => {
		const scene = createExportScene();
		const events: string[] = [];
		const encoder = createSvgEncoder(async (request) => {
			reportMindMapExportProgress(request.context, "encode", "started");
			reportMindMapExportProgress(request.context, "encode", "completed", 1);
			return {
				format: "svg",
				fileName: request.fileName,
				mimeType: "image/svg+xml",
				bytes: new Uint8Array(),
				width: request.serializedSvg.width,
				height: request.serializedSvg.height,
				dpi: null,
			};
		});
		const session = new MindMapExportSession({
			capturer: { capture: async () => scene },
			dependencies: createSessionDependencies(
				async () => {
					throw new Error("The registered encoder should be used instead.");
				},
				encoder,
			),
		});

		await session.exportToSink(
			createOptions(),
			{ save: async () => undefined },
			{ onProgress: (event) => events.push(`${event.phase}:${event.state}`) },
		);

		expect(events).toEqual([
			"capture:started",
			"capture:completed",
			"serialize:started",
			"serialize:completed",
			"encode:started",
			"encode:completed",
			"save:started",
			"save:completed",
		]);
	});
});

function createOptions(
	overrides: Partial<MindMapExportOptions> = {},
): MindMapExportOptions {
	return {
		format: "svg",
		fileName: "Roadmap",
		scope: "visible-map",
		background: "theme",
		padding: 10,
		...overrides,
	};
}

function createSessionDependencies(
	encode: MindMapExportEncoder["encode"] = async (request) => ({
		format: "svg",
		fileName: request.fileName,
		mimeType: "image/svg+xml",
		bytes: new Uint8Array(),
		width: request.serializedSvg.width,
		height: request.serializedSvg.height,
		dpi: null,
	}),
	existingEncoder?: MindMapExportEncoder,
): MindMapExporterDependencies {
	const encoder = existingEncoder ?? createSvgEncoder(encode);
	return createSessionDependenciesWithEncoders([encoder]);
}

function createSessionDependenciesWithEncoders(
	encoders: readonly MindMapExportEncoder[],
): MindMapExporterDependencies {
	return {
		limits: {
			minimumDpi: 72,
			maximumDpi: 600,
			maximumDimension: 16_384,
			maximumPixels: 67_108_864,
		},
		rasterPort: {} as MindMapExporterDependencies["rasterPort"],
		pdfEncoder: {} as MindMapExporterDependencies["pdfEncoder"],
		registry: new MindMapExportEncoderRegistry(encoders),
	};
}

function createArtifact(
	format: MindMapExportArtifact["format"],
	fileName: string,
): MindMapExportArtifact {
	return {
		format,
		fileName,
		mimeType: format === "png" ? "image/png" : "image/svg+xml",
		bytes: new Uint8Array(),
		width: 1,
		height: 1,
		dpi: format === "png" ? 150 : null,
	};
}

function createSvgEncoder(
	encode: MindMapExportEncoder["encode"],
): MindMapExportEncoder {
	return {
		capability: {
			format: "svg",
			label: "SVG",
			mimeType: "image/svg+xml",
			backgrounds: ["theme", "transparent"],
			dpi: null,
			jpegQuality: null,
		},
		encode,
	};
}
