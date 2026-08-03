import {
	DEFAULT_MIND_MAP_IMPORT_LIMITS,
	MindMapImportError,
	assertImportInputWithinLimits,
	type MindMapImportAdapter,
	type MindMapImportLimits,
	type MindMapImportRegistry,
} from "./types";

export function createMindMapImportRegistry(
	adapters: readonly MindMapImportAdapter[],
): MindMapImportRegistry {
	const ids = new Set<string>();
	for (const adapter of adapters) {
		if (ids.has(adapter.id)) {
			throw new Error(`Duplicate mind-map import adapter "${adapter.id}".`);
		}
		ids.add(adapter.id);
	}
	const registered = [...adapters];
	return {
		adapters: registered,
		resolve(input) {
			let resolved: MindMapImportAdapter | null = null;
			let confidence = 0;
			for (const adapter of registered) {
				const score = adapter.sniff(input);
				if (score > confidence) {
					resolved = adapter;
					confidence = score;
				}
			}
			if (resolved === null || confidence <= 0) {
				throw new MindMapImportError(
					"unsupported-format",
					"The selected file is not a supported XMind, MindMeister, or MindManager archive.",
				);
			}
			return resolved;
		},
		parse(input, limits = DEFAULT_MIND_MAP_IMPORT_LIMITS) {
			assertImportInputWithinLimits(input, limits);
			return this.resolve(input).parse(input, limits);
		},
	};
}

export function normalizeImportLimits(
	limits?: Partial<MindMapImportLimits>,
): MindMapImportLimits {
	return { ...DEFAULT_MIND_MAP_IMPORT_LIMITS, ...limits };
}
