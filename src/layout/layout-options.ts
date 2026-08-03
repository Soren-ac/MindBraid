/**
 * Built-in layout-option definitions and safe runtime resolution.
 *
 * This module intentionally contains no DOM, Obsidian, renderer, or
 * presentation imports. A layout engine consumes the resolved values while a
 * frontend may adapt the exported definitions into controls. Keeping those
 * two concerns here prevents a future frontend from becoming the authority on
 * what a layout option means.
 */

export type MindMapLayoutOptionValue = string | number | boolean;

const SAFE_OPTION_KEY = /^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/;

/**
 * Renderer-neutral control metadata. It deliberately mirrors the small
 * primitive-only configuration vocabulary that can be persisted in document
 * annotations. A frontend adapts this metadata; it never becomes the source
 * of validation semantics.
 */
export type MindMapLayoutOptionDefinition =
	| {
		readonly key: string;
		readonly label: string;
		readonly description?: string;
		readonly type: "number";
		readonly defaultValue: number;
		readonly minimum?: number;
		readonly maximum?: number;
		readonly step?: number;
	  }
	| {
		readonly key: string;
		readonly label: string;
		readonly description?: string;
		readonly type: "boolean";
		readonly defaultValue: boolean;
	  }
	| {
		readonly key: string;
		readonly label: string;
		readonly description?: string;
		readonly type: "select";
		readonly defaultValue: string;
		readonly choices: readonly {
			readonly value: string;
			readonly label: string;
		}[];
	  };

/**
 * Immutable option schema for one layout engine. `validate` preserves sparse
 * input for annotation persistence, whereas `normalize` also supplies every
 * registered default for engine execution.
 */
export interface MindMapLayoutOptionSchema {
	readonly definitions: readonly MindMapLayoutOptionDefinition[];
	has(key: string): boolean;
	validate(
		options: unknown,
	): Readonly<Record<string, MindMapLayoutOptionValue>>;
	normalize(
		options: unknown,
	): Readonly<Record<string, MindMapLayoutOptionValue>>;
}

/**
 * Scales explicit spacing without replacing it. This lets users combine a
 * semantic compactness preference with exact level/sibling/subtree values, rather
 * than making one control silently overwrite the other.
 */
export type MindMapLayoutCompactness =
	| "compact"
	| "comfortable"
	| "spacious";

/**
 * Controls whether topics with the same structural depth share one primary
 * axis coordinate. Branch-local flow is more compact when parent topics have
 * very different measured sizes, but deliberately gives up global alignment.
 */
export type MindMapSameLevelAlignment = boolean;

/**
 * Selects how a bilateral root distributes its direct branches. Per-branch
 * manual placement remains a future metadata-backed capability and is not
 * implied by these automatic strategies.
 */
export type MindMapBilateralRootBranchDistribution =
	| "balanced-by-weight"
	| "alternating"
	| "primary-side";

export interface ResolvedMindMapTreeLayoutOptions {
	readonly compactness: MindMapLayoutCompactness;
	readonly spacingScale: number;
	readonly alignSameLevel: MindMapSameLevelAlignment;
}

export interface ResolvedMindMapBilateralTreeLayoutOptions
	extends ResolvedMindMapTreeLayoutOptions {
	readonly rootBranchDistribution: MindMapBilateralRootBranchDistribution;
}

const COMPACTNESS_SCALE: Readonly<Record<MindMapLayoutCompactness, number>> = {
	compact: 0.72,
	comfortable: 1,
	spacious: 1.32,
};

const DEFAULT_TREE_LAYOUT_OPTIONS: ResolvedMindMapTreeLayoutOptions =
	Object.freeze({
		compactness: "comfortable",
		spacingScale: COMPACTNESS_SCALE.comfortable,
		alignSameLevel: true,
	});

const DEFAULT_BILATERAL_TREE_LAYOUT_OPTIONS: ResolvedMindMapBilateralTreeLayoutOptions =
	Object.freeze({
		...DEFAULT_TREE_LAYOUT_OPTIONS,
		rootBranchDistribution: "balanced-by-weight",
	});

/**
 * Options shared by the built-in one-sided and bilateral tree engines.
 *
 * The definitions are immutable, primitive-only data. They can be rendered by
 * a DOM form today or by a future Canvas/React/etc. frontend unchanged.
 */
export const BUILT_IN_TREE_LAYOUT_OPTION_DEFINITIONS: readonly MindMapLayoutOptionDefinition[] =
	freezeMindMapLayoutOptionDefinitions([
		{
			key: "compactness",
			label: "Map compactness",
			description:
				"Scales the configured level, sibling, and subtree spacing without replacing those values.",
			type: "select",
			defaultValue: "comfortable",
			choices: [
				{ value: "compact", label: "Compact" },
				{ value: "comfortable", label: "Comfortable" },
				{ value: "spacious", label: "Spacious" },
			],
		},
		{
			key: "alignSameLevel",
			label: "Align same-level topics",
			description:
				"Keeps topics at the same tree depth on one shared level. Turn off for branch-local compact flow.",
			type: "boolean",
			defaultValue: true,
		},
	]);

/**
 * Bilateral maps inherit the normal tree options and add only their own
 * root-allocation policy. The current implementation is intentionally
 * automatic: exposing a manual choice before there is a stable per-node side
 * persistence contract would be misleading.
 */
export const BUILT_IN_BILATERAL_TREE_LAYOUT_OPTION_DEFINITIONS: readonly MindMapLayoutOptionDefinition[] =
	freezeMindMapLayoutOptionDefinitions([
		...BUILT_IN_TREE_LAYOUT_OPTION_DEFINITIONS,
		{
			key: "balanceStrategy",
			label: "Root branch distribution",
			description:
				"Chooses how direct root branches are allocated across the two sides of a balanced map.",
			type: "select",
			defaultValue: "balanced-by-weight",
			choices: [
				{
					value: "balanced-by-weight",
					label: "Auto balance by branch size",
				},
				{ value: "alternating", label: "Alternate sides" },
				{
					value: "primary-side",
					label: "Use selected direction only",
				},
			],
		},
	]);

export const BUILT_IN_TREE_LAYOUT_OPTION_SCHEMA =
	createMindMapLayoutOptionSchema(
		BUILT_IN_TREE_LAYOUT_OPTION_DEFINITIONS,
	);

export const BUILT_IN_BILATERAL_TREE_LAYOUT_OPTION_SCHEMA =
	createMindMapLayoutOptionSchema(
		BUILT_IN_BILATERAL_TREE_LAYOUT_OPTION_DEFINITIONS,
	);

/**
 * Creates a strict, reusable schema for extension layout engines.
 *
 * Layout definitions are validated once at registration time. Individual
 * values are then copied into fresh objects, so callers cannot mutate schema
 * defaults or smuggle objects through the primitive-only persistence layer.
 */
export function createMindMapLayoutOptionSchema(
	definitions: readonly MindMapLayoutOptionDefinition[],
): MindMapLayoutOptionSchema {
	const byKey = new Map<string, MindMapLayoutOptionDefinition>();
	const registered: MindMapLayoutOptionDefinition[] = [];

	for (const definition of definitions) {
		validateDefinition(definition);
		if (byKey.has(definition.key)) {
			throw new Error(`Duplicate layout option key "${definition.key}".`);
		}
		const cloned = cloneDefinition(definition);
		byKey.set(cloned.key, cloned);
		registered.push(cloned);
	}

	const immutableDefinitions = Object.freeze(registered);
	const validate = (
		options: unknown,
	): Readonly<Record<string, MindMapLayoutOptionValue>> => {
		if (!isRecord(options)) {
			throw new TypeError("Layout options must be an object.");
		}
		const validated: Record<string, MindMapLayoutOptionValue> = {};
		for (const [key, value] of Object.entries(options)) {
			const definition = byKey.get(key);
			if (definition === undefined) {
				throw new RangeError(`Unsupported layout option "${key}".`);
			}
			validated[key] = validateOptionValue(value, definition);
		}
		return Object.freeze(validated);
	};

	return Object.freeze({
		definitions: immutableDefinitions,
		has: (key: string): boolean => byKey.has(key),
		validate,
		normalize: (
			options: unknown,
		): Readonly<Record<string, MindMapLayoutOptionValue>> => {
			const normalized: Record<string, MindMapLayoutOptionValue> = {};
			for (const definition of immutableDefinitions) {
				normalized[definition.key] = definition.defaultValue;
			}
			return Object.freeze({ ...normalized, ...validate(options) });
		},
	});
}

/**
 * Resolves one-sided tree options defensively. Presentation patch validation
 * rejects unsupported values before persistence; this fallback still keeps
 * direct layout-engine callers deterministic and safe.
 */
export function resolveMindMapTreeLayoutOptions(
	options: Readonly<Record<string, unknown>>,
): ResolvedMindMapTreeLayoutOptions {
	const normalized = BUILT_IN_TREE_LAYOUT_OPTION_SCHEMA.normalize(options);
	return resolveNormalizedTreeLayoutOptions(normalized);
}

/** Resolves bilateral-specific automatic root allocation in addition to the
 * shared tree options. */
export function resolveMindMapBilateralTreeLayoutOptions(
	options: Readonly<Record<string, unknown>>,
): ResolvedMindMapBilateralTreeLayoutOptions {
	const normalized = BUILT_IN_BILATERAL_TREE_LAYOUT_OPTION_SCHEMA.normalize(
		options,
	);
	return {
		...resolveNormalizedTreeLayoutOptions(normalized),
		rootBranchDistribution: readRootBranchDistribution(
			normalized.balanceStrategy,
		),
	};
}

export function getMindMapLayoutCompactnessScale(
	compactness: MindMapLayoutCompactness,
): number {
	return COMPACTNESS_SCALE[compactness];
}

function resolveNormalizedTreeLayoutOptions(
	normalized: Readonly<Record<string, MindMapLayoutOptionValue>>,
): ResolvedMindMapTreeLayoutOptions {
	const compactness = readCompactness(normalized.compactness);
	return {
		compactness,
		spacingScale: COMPACTNESS_SCALE[compactness],
		alignSameLevel: normalized.alignSameLevel === true,
	};
}

function readCompactness(value: unknown): MindMapLayoutCompactness {
	return value === "compact" ||
		value === "comfortable" ||
		value === "spacious"
		? value
		: DEFAULT_TREE_LAYOUT_OPTIONS.compactness;
}

function readRootBranchDistribution(
	value: unknown,
): MindMapBilateralRootBranchDistribution {
	return value === "balanced-by-weight" ||
		value === "alternating" ||
		value === "primary-side"
		? value
		: DEFAULT_BILATERAL_TREE_LAYOUT_OPTIONS.rootBranchDistribution;
}

function validateDefinition(definition: MindMapLayoutOptionDefinition): void {
	if (!SAFE_OPTION_KEY.test(definition.key)) {
		throw new Error(`Invalid layout option key "${definition.key}".`);
	}
	if (definition.label.trim().length === 0) {
		throw new Error(`Layout option "${definition.key}" requires a label.`);
	}
	if (
		definition.description !== undefined &&
		definition.description.trim().length === 0
	) {
		throw new Error(
			`Layout option "${definition.key}" has an empty description.`,
		);
	}

	switch (definition.type) {
		case "boolean":
			return;
		case "number":
			validateNumberDefinition(definition);
			return;
		case "select":
			validateSelectDefinition(definition);
			return;
	}
}

function validateNumberDefinition(
	definition: Extract<MindMapLayoutOptionDefinition, { readonly type: "number" }>,
): void {
	if (!Number.isFinite(definition.defaultValue)) {
		throw new Error(
			`Layout option "${definition.key}" has an invalid numeric default.`,
		);
	}
	if (
		(definition.minimum !== undefined &&
			(!Number.isFinite(definition.minimum) ||
				definition.defaultValue < definition.minimum)) ||
		(definition.maximum !== undefined &&
			(!Number.isFinite(definition.maximum) ||
				definition.defaultValue > definition.maximum)) ||
		(definition.minimum !== undefined &&
			definition.maximum !== undefined &&
			definition.minimum > definition.maximum) ||
		(definition.step !== undefined &&
			(!Number.isFinite(definition.step) || definition.step <= 0))
	) {
		throw new Error(
			`Layout option "${definition.key}" has an invalid numeric range.`,
		);
	}
}

function validateSelectDefinition(
	definition: Extract<MindMapLayoutOptionDefinition, { readonly type: "select" }>,
): void {
	if (definition.choices.length === 0) {
		throw new Error(`Layout option "${definition.key}" requires choices.`);
	}
	const choices = new Set<string>();
	for (const choice of definition.choices) {
		if (
			!SAFE_OPTION_KEY.test(choice.value) ||
			choice.label.trim().length === 0 ||
			choices.has(choice.value)
		) {
			throw new Error(
				`Layout option "${definition.key}" has an invalid select choice.`,
			);
		}
		choices.add(choice.value);
	}
	if (!choices.has(definition.defaultValue)) {
		throw new Error(
			`Layout option "${definition.key}" default is not a registered choice.`,
		);
	}
}

function validateOptionValue(
	value: unknown,
	definition: MindMapLayoutOptionDefinition,
): MindMapLayoutOptionValue {
	switch (definition.type) {
		case "boolean":
			if (typeof value !== "boolean") {
				throw new TypeError(
					`Layout option "${definition.key}" must be true or false.`,
				);
			}
			return value;
		case "number":
			if (
				typeof value !== "number" ||
				!Number.isFinite(value) ||
				(definition.minimum !== undefined && value < definition.minimum) ||
				(definition.maximum !== undefined && value > definition.maximum)
			) {
				throw new RangeError(
					`Layout option "${definition.key}" is outside its supported range.`,
				);
			}
			return value;
		case "select":
			if (
				typeof value !== "string" ||
				!definition.choices.some((choice) => choice.value === value)
			) {
				throw new RangeError(
					`Layout option "${definition.key}" has an unsupported value.`,
				);
			}
			return value;
	}
}

function cloneDefinition(
	definition: MindMapLayoutOptionDefinition,
): MindMapLayoutOptionDefinition {
	return definition.type === "select"
		? Object.freeze({
				...definition,
				choices: Object.freeze(
					definition.choices.map((choice) => Object.freeze({ ...choice })),
				),
			})
		: Object.freeze({ ...definition });
}

function freezeMindMapLayoutOptionDefinitions(
	definitions: readonly MindMapLayoutOptionDefinition[],
): readonly MindMapLayoutOptionDefinition[] {
	return Object.freeze(definitions.map(cloneDefinition));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
