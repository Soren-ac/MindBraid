import { describe, expect, it, vi } from "vitest";

import {
	runMindMapNodeEditWorkflow,
	type MindMapNodeEditWorkflowPort,
} from "../src/topic/mutation/node-edit-workflow";
import { createMindMapNodeEditSnapshot } from "../src/core/model";
import { parseMarkdown } from "../src/core/parser";

function fixture() {
	const original = parseMarkdown("# Parent", "Map.md", "Map");
	const parent = original.root.children[0];
	if (parent === undefined) {
		throw new Error("Workflow fixture is missing its parent.");
	}
	const edited = parseMarkdown("# Renamed", "Map.md", "Map");
	const editedParent = edited.root.children[0];
	if (editedParent === undefined) {
		throw new Error("Workflow fixture is missing its edited parent.");
	}
	return {
		original,
		edited,
		parent,
		editedParent,
		snapshot: createMindMapNodeEditSnapshot(
			parent,
			original.sourceRevision,
		),
	};
}

describe("runMindMapNodeEditWorkflow", () => {
	it("awaits the edit and creates from its fresh document revision", async () => {
		const data = fixture();
		const calls: string[] = [];
		let resolveEdit:
			| ((value: {
					document: typeof data.edited;
					nodeId: string;
			  }) => void)
			| undefined;
		const editPromise = new Promise<{
			document: typeof data.edited;
			nodeId: string;
		}>((resolve) => {
			resolveEdit = resolve;
		});
		const port: MindMapNodeEditWorkflowPort = {
			editNode: vi.fn(async () => {
				calls.push("edit");
				return editPromise;
			}),
			createNode: async (document, snapshot, createKind) => {
				calls.push("create");
				expect(document).toBe(data.edited);
				expect(snapshot.sourceRevision).toBe(
					data.edited.sourceRevision,
				);
				expect(snapshot.sourceRevision).not.toBe(
					data.original.sourceRevision,
				);
				expect(snapshot.text).toBe("Renamed");
				expect(createKind).toBe("child");
				return {
					nodeId: "created",
					source: { path: "Map.md", line: 1, ch: 0 },
				};
			},
		};

		const pending = runMindMapNodeEditWorkflow(
			{
				sourceSnapshot: data.snapshot,
				newText: "Renamed",
				continuation: {
					type: "create-node",
					relation: "child",
				},
			},
			port,
		);
		await Promise.resolve();
		expect(calls).toEqual(["edit"]);

		resolveEdit?.({
			document: data.edited,
			nodeId: data.editedParent.id,
		});
		await expect(pending).resolves.toMatchObject({
			creation: { nodeId: "created" },
		});
		expect(calls).toEqual(["edit", "create"]);
	});

	it("does not create when the edit fails", async () => {
		const data = fixture();
		const createNode = vi.fn();
		await expect(
			runMindMapNodeEditWorkflow(
				{
					sourceSnapshot: data.snapshot,
					newText: "Renamed",
					continuation: {
						type: "create-node",
						relation: "child",
					},
				},
				{
					editNode: vi.fn(async () => {
						throw new Error("stale");
					}),
					createNode,
				},
			),
		).rejects.toThrow("stale");
		expect(createNode).not.toHaveBeenCalled();
	});

	it("supports a plain edit without a structural continuation", async () => {
		const data = fixture();
		const createNode = vi.fn();
		const result = await runMindMapNodeEditWorkflow(
			{
				sourceSnapshot: data.snapshot,
				newText: "Renamed",
			},
			{
				editNode: vi.fn(async () => ({
					document: data.edited,
					nodeId: data.editedParent.id,
				})),
				createNode,
			},
		);

		expect(result.creation).toBeNull();
		expect(createNode).not.toHaveBeenCalled();
	});

	it("rejects a continuation if the edited node cannot be resolved", async () => {
		const data = fixture();
		await expect(
			runMindMapNodeEditWorkflow(
				{
					sourceSnapshot: data.snapshot,
					newText: "Renamed",
					continuation: {
						type: "create-node",
						relation: "child",
					},
				},
				{
					editNode: vi.fn(async () => ({
						document: data.edited,
						nodeId: "missing",
					})),
					createNode: vi.fn(),
				},
			),
		).rejects.toThrow("could not be refreshed");
	});
});
