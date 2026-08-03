import type { MindMapPresentation } from "./presentation";

/**
 * Creates an ownership-safe presentation snapshot for transactions and async
 * persistence. Presentation data is deliberately structured-cloneable: maps,
 * arrays, primitive option values, and plain renderer-neutral records only.
 */
export function cloneMindMapPresentation(
	presentation: MindMapPresentation,
): MindMapPresentation {
	return {
		revision: presentation.revision,
		layout: clonePlainValue(presentation.layout),
		theme: clonePlainValue(presentation.theme),
		formatting: clonePlainValue(presentation.formatting),
		nodes: new Map(
			[...presentation.nodes].map(([nodeId, value]) => [
				nodeId,
				clonePlainValue(value),
			]),
		),
		edges: new Map(
			[...presentation.edges].map(([edgeId, value]) => [
				edgeId,
				clonePlainValue(value),
			]),
		),
		decorations: clonePlainValue(presentation.decorations),
	};
}

function clonePlainValue<T>(value: T): T {
	if (Array.isArray(value)) {
		const items = value as unknown[];
		return items.map((item) => clonePlainValue(item)) as T;
	}
	if (typeof value !== "object" || value === null) {
		return value;
	}
	const clone: Record<string, unknown> = {};
	for (const [key, nested] of Object.entries(value)) {
		clone[key] = clonePlainValue(nested);
	}
	return clone as T;
}
