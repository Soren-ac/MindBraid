import {
	createMindMapNodeEditSnapshot,
	type MindMapDocument,
	type MindMapNode,
	type MindMapNodeEditSnapshot,
	type SourceLocation,
} from "../../core/model";
import type { NodeCreateKind } from "./node-insert";

export interface MindMapNodeCreationResult {
	readonly nodeId: string;
	readonly source: SourceLocation;
}

export interface MindMapNodeEditResult {
	readonly document: MindMapDocument;
	readonly nodeId: string;
}

export interface MindMapNodeEditWorkflowPort {
	editNode(
		node: MindMapNodeEditSnapshot,
		newText: string,
	): Promise<MindMapNodeEditResult>;
	createNode(
		document: MindMapDocument,
		node: MindMapNodeEditSnapshot,
		createKind: NodeCreateKind,
	): Promise<MindMapNodeCreationResult>;
}

export interface MindMapNodeEditWorkflowRequest {
	readonly sourceSnapshot: MindMapNodeEditSnapshot;
	readonly newText: string;
	readonly continuation?: {
		readonly type: "create-node";
		readonly relation: NodeCreateKind;
	};
}

export interface MindMapNodeEditWorkflowResult {
	readonly edit: MindMapNodeEditResult;
	readonly creation: MindMapNodeCreationResult | null;
}

/**
 * Serialize an inline-edit continuation without exposing Obsidian or DOM
 * details. In particular, creation always uses the document revision returned
 * by the completed edit rather than the stale snapshot that opened the input.
 */
export async function runMindMapNodeEditWorkflow(
	request: MindMapNodeEditWorkflowRequest,
	port: MindMapNodeEditWorkflowPort,
): Promise<MindMapNodeEditWorkflowResult> {
	const edit = await port.editNode(
		request.sourceSnapshot,
		request.newText,
	);
	if (request.continuation?.type !== "create-node") {
		return {
			edit,
			creation: null,
		};
	}

	const editedNode = findNode(edit.document.root, edit.nodeId);
	if (editedNode === null) {
		throw new Error(
			"The edited node could not be refreshed before continuing.",
		);
	}

	const creation = await port.createNode(
		edit.document,
		createMindMapNodeEditSnapshot(
			editedNode,
			edit.document.sourceRevision,
		),
		request.continuation.relation,
	);
	return {
		edit,
		creation,
	};
}

function findNode(root: MindMapNode, nodeId: string): MindMapNode | null {
	const pending = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		if (node.id === nodeId) {
			return node;
		}
		for (const child of node.children) {
			pending.push(child);
		}
	}
	return null;
}
