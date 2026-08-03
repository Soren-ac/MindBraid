import {
	prepareMindMapExportArtifact,
	type MindMapExporterDependencies,
	type MindMapPreparedExportWithContext,
} from "./exporter";
import { createBuiltInMindMapExportEncoderRegistry } from "./built-in-encoders";
import {
	assertMindMapExportPlanIsExportable,
	planMindMapExport,
} from "./plan";
import type { MindMapExportEncoderRegistry } from "./registry";
import type { SerializedMindMapSvg } from "./svg";
import {
	MindMapExportError,
	type MindMapExportBackground,
	reportMindMapExportProgress,
	type MindMapExportArtifact,
	type MindMapExportExecutionContext,
	type MindMapExportOptions,
	type MindMapExportPlan,
	type MindMapExportScene,
	type MindMapExportScope,
	normalizeMindMapExportFileName,
	normalizeMindMapExportPadding,
	throwIfMindMapExportAborted,
} from "./types";

export interface MindMapExportSceneCapturer {
	capture(
		request: { readonly scope: MindMapExportScope },
		context?: MindMapExportExecutionContext,
	): Promise<MindMapExportScene>;
}

export interface MindMapExportSceneRevision {
	readonly sourcePath: string;
	readonly sourceRevision: string;
	readonly presentationRevision: number;
}

export type MindMapExportRevisionReader = () =>
	| MindMapExportSceneRevision
	| null;

export interface MindMapExportArtifactSink {
	save(artifact: MindMapExportArtifact): Promise<void>;
}

export interface MindMapExportSessionOptions {
	readonly capturer: MindMapExportSceneCapturer;
	readonly dependencies: MindMapExporterDependencies;
	/**
	 * A host supplies its current source/presentation tuple. When it changes
	 * during an open dialog, cached work is invalidated before it can be saved.
	 */
	readonly getCurrentRevision?: MindMapExportRevisionReader;
}

/**
 * Per-dialog cache and stale-revision guard. It is renderer-neutral and owns
 * no DOM resources, so an ItemView can dispose it synchronously on close.
 */
export class MindMapExportSession {
	private readonly capturer: MindMapExportSceneCapturer;
	private readonly dependencies: MindMapExporterDependencies;
	private readonly registry: MindMapExportEncoderRegistry;
	private readonly getCurrentRevision: MindMapExportRevisionReader | undefined;
	private readonly scenes = new Map<MindMapExportScope, MindMapExportScene>();
	private readonly plans = new Map<string, MindMapExportPlan>();
	private readonly serializedSvgs = new Map<string, SerializedMindMapSvg>();
	private generation = 0;
	private destroyed = false;

	public constructor(options: MindMapExportSessionOptions) {
		this.capturer = options.capturer;
		this.dependencies = options.dependencies;
		this.registry =
			options.dependencies.registry ??
			createBuiltInMindMapExportEncoderRegistry(options.dependencies);
		this.getCurrentRevision = options.getCurrentRevision;
	}

	public async getScene(
		scope: MindMapExportScope,
		context?: MindMapExportExecutionContext,
	): Promise<MindMapExportScene> {
		this.assertActive();
		throwIfMindMapExportAborted(context?.signal);
		const generation = this.generation;
		const cached = this.scenes.get(scope);
		if (cached !== undefined) {
			this.assertSceneCurrent(cached);
			return cached;
		}
		reportMindMapExportProgress(context, "capture", "started");
		const scene = await this.capturer.capture({ scope }, context);
		throwIfMindMapExportAborted(context?.signal);
		this.assertActive();
		this.assertGeneration(generation);
		this.assertSceneCurrent(scene);
		this.scenes.set(scope, scene);
		reportMindMapExportProgress(context, "capture", "completed", 1);
		return scene;
	}

	public async getPlan(
		options: MindMapExportOptions,
		context?: MindMapExportExecutionContext,
	): Promise<MindMapExportPlan> {
		const generation = this.generation;
		const scene = await this.getScene(options.scope, context);
		this.assertGeneration(generation);
		const key = createPlanKey(scene, options);
		const cached = this.plans.get(key);
		if (cached !== undefined) {
			return cached;
		}
		const encoder = this.registry.resolve(options.format).capability;
		const plan = planMindMapExport(scene, options, {
			limits: this.dependencies.limits,
			encoder,
		});
		this.plans.set(key, plan);
		return plan;
	}

	public async createArtifact(
		options: MindMapExportOptions,
		context?: MindMapExportExecutionContext,
	): Promise<MindMapExportArtifact> {
		const generation = this.generation;
		const scene = await this.getScene(options.scope, context);
		assertMindMapExportPlanIsExportable(
			await this.getPlan(options, context),
		);
		this.assertGeneration(generation);
		this.assertSceneCurrent(scene);
		const prepared = this.getOrPrepare(scene, options, context);
		this.assertSceneCurrent(scene);
		const artifact = await prepared.encoder.encode({
			scene: prepared.scene,
			options: prepared.options,
			fileName: prepared.fileName,
			serializedSvg: prepared.serializedSvg,
			context,
		});
		throwIfMindMapExportAborted(context?.signal);
		this.assertGeneration(generation);
		this.assertSceneCurrent(scene);
		return artifact;
	}

	/**
	 * Performs the explicit artifact save under the same stale-state guard. A
	 * source/presentation change after encoding but before saving rejects the
	 * operation rather than writing a stale snapshot to the download sink.
	 */
	public async exportToSink(
		options: MindMapExportOptions,
		sink: MindMapExportArtifactSink,
		context?: MindMapExportExecutionContext,
	): Promise<MindMapExportArtifact> {
		const generation = this.generation;
		const artifact = await this.createArtifact(options, context);
		this.assertGeneration(generation);
		const scene = await this.getScene(options.scope, context);
		this.assertGeneration(generation);
		this.assertSceneCurrent(scene);
		throwIfMindMapExportAborted(context?.signal);
		reportMindMapExportProgress(context, "save", "started");
		await sink.save(artifact);
		throwIfMindMapExportAborted(context?.signal);
		this.assertGeneration(generation);
		reportMindMapExportProgress(context, "save", "completed", 1);
		return artifact;
	}

	public invalidate(): void {
		this.generation += 1;
		this.scenes.clear();
		this.plans.clear();
		this.serializedSvgs.clear();
	}

	public destroy(): void {
		this.destroyed = true;
		this.invalidate();
	}

	private getOrPrepare(
		scene: MindMapExportScene,
		options: MindMapExportOptions,
		context: MindMapExportExecutionContext | undefined,
	): MindMapPreparedExportWithContext {
		const encoder = this.registry.resolve(options.format);
		const background = resolveEffectiveBackground(
			options.background,
			encoder.capability.backgrounds,
		);
		const key = createSerializedSvgKey(
			scene,
			background,
			normalizeMindMapExportPadding(options.padding),
		);
		const serializedSvg = this.serializedSvgs.get(key);
		if (serializedSvg !== undefined) {
			return {
				scene,
				options,
				fileName: normalizeFileNameForSession(options.fileName, options.format),
				encoder,
				serializedSvg,
				context,
			};
		}
		const prepared = prepareMindMapExportArtifact(
			scene,
			options,
			this.dependencies,
			context,
		);
		this.serializedSvgs.set(key, prepared.serializedSvg);
		return prepared;
	}

	private assertActive(): void {
		if (this.destroyed) {
			throw new MindMapExportError(
				"The mind-map export session is no longer available.",
				"scene-unavailable",
			);
		}
	}

	private assertGeneration(expected: number): void {
		if (this.generation !== expected) {
			throw new MindMapExportError(
				"The mind map changed while export work was in progress. Please review the updated export.",
				"scene-unavailable",
			);
		}
	}

	private assertSceneCurrent(scene: MindMapExportScene): void {
		const current = this.getCurrentRevision?.();
		if (current === undefined || current === null) {
			return;
		}
		if (!isMindMapExportSceneCurrent(scene, current)) {
			this.invalidate();
			throw new MindMapExportError(
				"The mind map changed while export options were open. Please review the updated export.",
				"scene-unavailable",
			);
		}
	}
}

export function getMindMapExportSceneRevision(
	scene: MindMapExportScene,
): MindMapExportSceneRevision {
	return {
		sourcePath: scene.sourcePath,
		sourceRevision: scene.sourceRevision,
		presentationRevision: scene.presentationRevision,
	};
}

export function isMindMapExportSceneCurrent(
	scene: MindMapExportScene,
	revision: MindMapExportSceneRevision,
): boolean {
	return (
		scene.sourcePath === revision.sourcePath &&
		scene.sourceRevision === revision.sourceRevision &&
		scene.presentationRevision === revision.presentationRevision
	);
}

function createPlanKey(
	scene: MindMapExportScene,
	options: MindMapExportOptions,
): string {
	return [
		createSceneKey(scene),
		options.format,
		options.background,
		String(options.padding),
		String(options.dpi ?? ""),
	].join("|");
}

function createSerializedSvgKey(
	scene: MindMapExportScene,
	background: MindMapExportBackground,
	padding: number,
): string {
	return [
		createSceneKey(scene),
		background,
		String(padding),
	].join("|");
}

function resolveEffectiveBackground(
	requested: MindMapExportBackground,
	supported: readonly MindMapExportBackground[],
): MindMapExportBackground {
	return supported.includes(requested) ? requested : "theme";
}

function createSceneKey(scene: MindMapExportScene): string {
	return [
		scene.scope,
		scene.sourcePath,
		scene.sourceRevision,
		String(scene.presentationRevision),
	].join("|");
}

function normalizeFileNameForSession(
	fileName: string,
	format: MindMapExportOptions["format"],
): string {
	// Re-use the public preparation path for initial cache population. On a
	// filename-only change no serialization should occur, but extension cleanup
	// must remain exactly equivalent.
	return normalizeMindMapExportFileName(fileName, format);
}
