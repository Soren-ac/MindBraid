import type {
	MindMapNodePresentation,
	MindMapNodeShape,
	MindMapThemeColor,
} from "./presentation";
import { isSafeMindMapThemeColor } from "./presentation-patch";

export type MindMapNodeFormattingCommand =
	| {
			readonly type: "shape";
			readonly value: MindMapNodeShape | undefined;
	  }
	| {
			readonly type: "color";
			readonly field: "fill" | "stroke" | "textColor";
			readonly value: MindMapThemeColor | undefined;
	  }
	| {
			readonly type: "metric";
			readonly field: "borderWidth" | "radius";
			readonly value: number | undefined;
	  }
	| {
			readonly type: "typography";
			readonly field: "fontSize" | "fontWeight";
			readonly value: number | undefined;
	  }
	| { readonly type: "reset" };

/**
 * Builds one sparse, immutable patch for every selected topic. It never reads
 * Markdown and never writes visual values onto source-derived nodes.
 */
export function createMindMapNodeFormattingPatch(
	current: ReadonlyMap<string, MindMapNodePresentation>,
	nodeIds: readonly string[],
	command: MindMapNodeFormattingCommand,
): ReadonlyMap<string, MindMapNodePresentation | null> {
	const uniqueIds = [...new Set(nodeIds)];
	if (uniqueIds.length === 0 || uniqueIds.some((id) => id.length === 0)) {
		throw new TypeError("Node formatting requires selected node IDs.");
	}
	validateCommand(command);
	const patch = new Map<string, MindMapNodePresentation | null>();
	for (const nodeId of uniqueIds) {
		if (command.type === "reset") {
			patch.set(nodeId, null);
			continue;
		}
		const next = applyCommand(current.get(nodeId) ?? {}, command);
		patch.set(nodeId, Object.keys(next).length === 0 ? null : next);
	}
	return patch;
}

function applyCommand(
	current: MindMapNodePresentation,
	command: Exclude<MindMapNodeFormattingCommand, { readonly type: "reset" }>,
): MindMapNodePresentation {
	if (command.type === "shape") {
		return replaceOptionalField(current, "shape", command.value);
	}
	if (command.type === "color") {
		return replaceOptionalField(current, command.field, command.value);
	}
	if (command.type === "metric") {
		return replaceOptionalField(current, command.field, command.value);
	}

	const typography = { ...current.typography };
	if (command.value === undefined) {
		delete typography[command.field];
	} else {
		typography[command.field] = command.value;
	}
	const next = { ...current };
	if (Object.keys(typography).length === 0) {
		delete next.typography;
	} else {
		next.typography = typography;
	}
	return next;
}

function replaceOptionalField<
	TKey extends "shape" | "fill" | "stroke" | "textColor" | "borderWidth" | "radius",
>(
	current: MindMapNodePresentation,
	key: TKey,
	value: MindMapNodePresentation[TKey],
): MindMapNodePresentation {
	const next = { ...current };
	if (value === undefined) {
		delete next[key];
	} else {
		next[key] = value;
	}
	return next;
}

function validateCommand(command: MindMapNodeFormattingCommand): void {
	if (
		command.type === "color" &&
		command.value !== undefined &&
		!isSafeMindMapThemeColor(command.value)
	) {
		throw new TypeError("Node formatting contains an unsafe color.");
	}
	if (
		(command.type === "metric" || command.type === "typography") &&
		command.value !== undefined
	) {
		if (!Number.isFinite(command.value)) {
			throw new TypeError("Node formatting metrics must be finite.");
		}
		const [minimum, maximum] = metricRange(command.field);
		if (command.value < minimum || command.value > maximum) {
			throw new RangeError(
				`${command.field} must be between ${String(minimum)} and ${String(maximum)}.`,
			);
		}
	}
}

function metricRange(
	field: "borderWidth" | "radius" | "fontSize" | "fontWeight",
): readonly [number, number] {
	switch (field) {
		case "borderWidth":
			return [0, 32];
		case "radius":
			return [0, 240];
		case "fontSize":
			return [6, 160];
		case "fontWeight":
			return [100, 1000];
	}
}
