import type { MindMapNodePresentation } from "./presentation";

const SAFE_ASSET_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export type MindMapNodeAssetCommand =
	| {
			readonly type: "set-icon";
			readonly iconId: string | null;
	  }
	| {
			readonly type: "set-marker";
			readonly markerId: string;
			readonly enabled: boolean;
	  }
	| {
			readonly type: "clear-assets";
	  };

/**
 * Builds sparse presentation changes for explicit node-information gestures.
 * The registry-aware presentation patch remains the final validation boundary.
 */
export function createMindMapNodeAssetPatch(
	current: ReadonlyMap<string, MindMapNodePresentation>,
	nodeIds: readonly string[],
	command: MindMapNodeAssetCommand,
): ReadonlyMap<string, MindMapNodePresentation | null> {
	const uniqueNodeIds = [...new Set(nodeIds)];
	if (uniqueNodeIds.length === 0 || uniqueNodeIds.some((id) => id.length === 0)) {
		throw new TypeError("Node asset editing requires selected node IDs.");
	}
	validateCommand(command);
	const result = new Map<string, MindMapNodePresentation | null>();
	for (const nodeId of uniqueNodeIds) {
		const next = cloneNodePresentation(current.get(nodeId) ?? {});
		switch (command.type) {
			case "set-icon":
				if (command.iconId === null) {
					delete next.iconId;
				} else {
					next.iconId = command.iconId;
				}
				break;
			case "set-marker": {
				const markerIds = new Set(next.markerIds ?? []);
				if (command.enabled) {
					markerIds.add(command.markerId);
				} else {
					markerIds.delete(command.markerId);
				}
				if (markerIds.size === 0) {
					delete next.markerIds;
				} else {
					next.markerIds = [...markerIds];
				}
				break;
			}
			case "clear-assets":
				delete next.iconId;
				delete next.markerIds;
				break;
		}
		result.set(nodeId, Object.keys(next).length === 0 ? null : next);
	}
	return result;
}

function validateCommand(command: MindMapNodeAssetCommand): void {
	if (command.type === "set-icon" && command.iconId !== null) {
		requireAssetId(command.iconId);
	} else if (command.type === "set-marker") {
		requireAssetId(command.markerId);
	}
}

function requireAssetId(value: string): void {
	if (!SAFE_ASSET_ID.test(value)) {
		throw new TypeError("Node asset IDs must be safe identifiers.");
	}
}

function cloneNodePresentation(
	presentation: MindMapNodePresentation,
): { -readonly [K in keyof MindMapNodePresentation]: MindMapNodePresentation[K] } {
	const result = { ...presentation } as {
		-readonly [K in keyof MindMapNodePresentation]: MindMapNodePresentation[K];
	};
	if (presentation.typography !== undefined) {
		result.typography = { ...presentation.typography };
	}
	if (presentation.markerIds !== undefined) {
		result.markerIds = [...presentation.markerIds];
	}
	return result;
}
