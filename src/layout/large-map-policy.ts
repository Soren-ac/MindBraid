import type { MindMapNode } from "../core/model";

/**
 * Framework-neutral policy for keeping unusually large tree layouts usable on
 * the main UI thread. It deliberately has no knowledge of a renderer, DOM,
 * Obsidian, or persisted presentation state.
 *
 * The recommended depth is selected from the actual tree shape, not only the
 * total count. A broad root with thousands of direct children therefore opens
 * at depth zero instead of defeating the protection with a nominal depth of
 * three or four.
 */
export interface MindMapLargeMapPolicyOptions {
	/** A map at or above this count receives an advisory safe projection. */
	readonly warningNodeCount: number;
	/** A map at or above this count receives the stricter safe projection. */
	readonly guardedNodeCount: number;
	/** Maximum nodes in the initial advisory projection. */
	readonly warningVisibleNodeBudget: number;
	/** Maximum nodes in the initial guarded projection. */
	readonly guardedVisibleNodeBudget: number;
	/** Maximum depth considered for the initial advisory projection. */
	readonly warningMaximumVisibleDepth: number;
	/** Maximum depth considered for the initial guarded projection. */
	readonly guardedMaximumVisibleDepth: number;
}

export type MindMapLargeMapProtectionLevel =
	| "normal"
	| "warning"
	| "guarded";

/**
 * An immutable decision for one parsed tree. `nodeCount` includes the
 * document root because it is a rendered topic in the mind-map scene.
 */
export interface MindMapLargeMapProtection {
	readonly level: MindMapLargeMapProtectionLevel;
	readonly nodeCount: number;
	/**
	 * A depth relative to the effective focus root which keeps the initial
	 * scene inside the policy budget. `null` means no safety projection.
	 */
	readonly initialVisibleDepthLimit: number | null;
	readonly initialVisibleNodeCount: number;
	readonly hiddenNodeCount: number;
	/** Whether rendering all source nodes requires an explicit user action. */
	readonly requiresExplicitFullRender: boolean;
}

/**
 * The renderer-facing portion of the policy plus tab-local acknowledgement.
 * It remains transient: callers must never serialize it into Markdown,
 * document presentation, or plugin defaults.
 */
export interface MindMapLargeMapGuardState {
	readonly protection: MindMapLargeMapProtection;
	readonly fullMapConfirmed: boolean;
}

export const DEFAULT_MIND_MAP_LARGE_MAP_POLICY: Readonly<MindMapLargeMapPolicyOptions> =
	Object.freeze({
		warningNodeCount: 2_000,
		guardedNodeCount: 10_000,
		warningVisibleNodeBudget: 1_200,
		guardedVisibleNodeBudget: 700,
		warningMaximumVisibleDepth: 4,
		guardedMaximumVisibleDepth: 3,
	});

/** Counts every parsed topic iteratively, avoiding call-stack growth. */
export function countMindMapNodes(root: MindMapNode): number {
	let count = 0;
	const pending: MindMapNode[] = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		count += 1;
		for (const child of node.children) {
			pending.push(child);
		}
	}
	return count;
}

/**
 * Resolves the initial large-map guard for one immutable parsed tree. The
 * policy does not mutate the source tree; callers pass its recommended depth
 * into the existing focus projection before layout and rendering begin.
 */
export function resolveMindMapLargeMapProtection(
	root: MindMapNode,
	options: MindMapLargeMapPolicyOptions = DEFAULT_MIND_MAP_LARGE_MAP_POLICY,
): MindMapLargeMapProtection {
	const depthCounts = countMindMapNodesByDepth(root);
	const nodeCount = depthCounts.reduce((total, count) => total + count, 0);
	const level = resolveMindMapLargeMapProtectionLevel(nodeCount, options);
	if (level === "normal") {
		return {
			level,
			nodeCount,
			initialVisibleDepthLimit: null,
			initialVisibleNodeCount: nodeCount,
			hiddenNodeCount: 0,
			requiresExplicitFullRender: false,
		};
	}

	const budget =
		level === "warning"
			? options.warningVisibleNodeBudget
			: options.guardedVisibleNodeBudget;
	const maximumDepth =
		level === "warning"
			? options.warningMaximumVisibleDepth
			: options.guardedMaximumVisibleDepth;
	const projection = resolveSafeDepth(depthCounts, budget, maximumDepth);

	return {
		level,
		nodeCount,
		initialVisibleDepthLimit: projection.depth,
		initialVisibleNodeCount: projection.nodeCount,
		hiddenNodeCount: Math.max(0, nodeCount - projection.nodeCount),
		requiresExplicitFullRender: projection.nodeCount < nodeCount,
	};
}

/**
 * Classifies a known topic count without constructing a render tree. Import
 * preview adapters use this read-only helper to warn before a new note exists.
 */
export function resolveMindMapLargeMapProtectionLevel(
	nodeCount: number,
	options: MindMapLargeMapPolicyOptions = DEFAULT_MIND_MAP_LARGE_MAP_POLICY,
): MindMapLargeMapProtectionLevel {
	assertValidPolicy(options);
	if (!Number.isSafeInteger(nodeCount) || nodeCount < 1) {
		throw new RangeError(
			"Mind-map large-map nodeCount must be a positive safe integer.",
		);
	}
	if (nodeCount >= options.guardedNodeCount) {
		return "guarded";
	}
	if (nodeCount >= options.warningNodeCount) {
		return "warning";
	}
	return "normal";
}

function countMindMapNodesByDepth(root: MindMapNode): readonly number[] {
	const counts: number[] = [];
	const pending: Array<{
		readonly node: MindMapNode;
		readonly depth: number;
	}> = [{ node: root, depth: 0 }];

	while (pending.length > 0) {
		const current = pending.pop();
		if (current === undefined) {
			continue;
		}
		counts[current.depth] = (counts[current.depth] ?? 0) + 1;
		for (const child of current.node.children) {
			pending.push({ node: child, depth: current.depth + 1 });
		}
	}

	return counts;
}

function resolveSafeDepth(
	depthCounts: readonly number[],
	budget: number,
	maximumDepth: number,
): { readonly depth: number; readonly nodeCount: number } {
	let nodeCount = 0;
	let depth = 0;
	for (
		let candidateDepth = 0;
		candidateDepth < depthCounts.length && candidateDepth <= maximumDepth;
		candidateDepth += 1
	) {
		const countAtDepth = depthCounts[candidateDepth] ?? 0;
		if (nodeCount + countAtDepth > budget) {
			break;
		}
		nodeCount += countAtDepth;
		depth = candidateDepth;
	}

	// A well-formed mind-map always has one root, but remain total for a custom
	// caller which supplies an impossible zero budget after bypassing validation.
	return {
		depth,
		nodeCount: Math.max(1, nodeCount),
	};
}

function assertValidPolicy(options: MindMapLargeMapPolicyOptions): void {
	for (const [name, value] of Object.entries(options)) {
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new RangeError(
				`Mind-map large-map policy "${name}" must be a non-negative safe integer.`,
			);
		}
	}
	if (options.warningNodeCount < 1) {
		throw new RangeError(
			"Mind-map large-map warningNodeCount must be at least one.",
		);
	}
	if (options.guardedNodeCount < options.warningNodeCount) {
		throw new RangeError(
			"Mind-map large-map guardedNodeCount must not be below warningNodeCount.",
		);
	}
	if (
		options.warningVisibleNodeBudget < 1 ||
		options.guardedVisibleNodeBudget < 1
	) {
		throw new RangeError(
			"Mind-map large-map visible-node budgets must be at least one.",
		);
	}
}
