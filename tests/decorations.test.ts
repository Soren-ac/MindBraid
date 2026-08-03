import { describe, expect, it } from "vitest";

import {
	DEFAULT_MIND_MAP_BOUNDARY_PADDING,
	MAX_MIND_MAP_DECORATION_TEXT_LENGTH,
	allocateMindMapDecorationId,
	applyMindMapDecorationCommand,
	createMindMapBoundaryDecorationDraft,
	createMindMapDecorationCommandState,
	createMindMapRelationshipDecorationDraft,
	createMindMapSummaryDecorationDraft,
	getMindMapDecoration,
	reconcileMindMapDecorationNodeReferences,
	resolveMindMapDecorationGeometry,
	validateMindMapDecoration,
} from "../src/presentation/decorations";
import type { MindMapDecoration } from "../src/presentation/presentation";

const nodeIds = new Set(["a", "b", "c"]);
const context = { nodeIds };

describe("presentation decorations", () => {
	it("validates selection-based relationship, boundary, and summary drafts", () => {
		expect(
			createMindMapRelationshipDecorationDraft(
				["a", "b"],
				{ id: "relationship-1", label: "depends on" },
				context,
			),
		).toEqual({
			id: "relationship-1",
			kind: "relationship",
			fromNodeId: "a",
			toNodeId: "b",
			label: "depends on",
		});
		expect(
			createMindMapBoundaryDecorationDraft(["a", "c"], {}, context),
		).toEqual({ kind: "boundary", nodeIds: ["a", "c"] });
		expect(
			createMindMapSummaryDecorationDraft(["c"], "Outcome", {}, context),
		).toEqual({ kind: "summary", nodeIds: ["c"], text: "Outcome" });

		expect(() =>
			createMindMapRelationshipDecorationDraft(["a"], {}, context),
		).toThrow("exactly two");
		expect(() =>
			createMindMapRelationshipDecorationDraft(["a", "a"], {}, context),
		).toThrow("different nodes");
		expect(() => createMindMapBoundaryDecorationDraft([], {}, context)).toThrow(
			"at least one node",
		);
		expect(() =>
			createMindMapSummaryDecorationDraft(["missing"], "x", {}, context),
		).toThrow("Unknown decoration node ID");
	});

	it("rejects invalid endpoints and non-JSON-safe bounded text or IDs", () => {
		expect(() =>
			validateMindMapDecoration(
				{
					id: "relationship-1",
					kind: "relationship",
					fromNodeId: "a",
					toNodeId: "a",
				},
				context,
			),
		).toThrow("different nodes");
		expect(() =>
			validateMindMapDecoration(
				{
					id: "not safe",
					kind: "marker",
					nodeId: "a",
					markerId: "priority",
				},
				context,
			),
		).toThrow("safe bounded identifiers");
		expect(() =>
			validateMindMapDecoration(
				{
					id: "marker-1",
					kind: "marker",
					nodeId: "a\u0000b",
					markerId: "priority",
				},
				context,
			),
		).toThrow("safe bounded strings");
		expect(() =>
			validateMindMapDecoration(
				{
					id: "summary-1",
					kind: "summary",
					nodeIds: ["a"],
					text: "x".repeat(MAX_MIND_MAP_DECORATION_TEXT_LENGTH + 1),
				},
				context,
			),
		).toThrow("bounded JSON-safe string");
		expect(() =>
			validateMindMapDecoration(
				{
					id: "summary-1",
					kind: "summary",
					nodeIds: ["a"],
					text: "\ud800",
				},
				context,
			),
		).toThrow("bounded JSON-safe string");
	});

	it("allocates IDs and applies immutable CRUD commands without stale selection", () => {
		expect(
			allocateMindMapDecorationId(
				["marker-1", "marker-2", "marker-4"],
				"marker",
			),
		).toBe("marker-3");
		expect(() => allocateMindMapDecorationId([], "bad prefix")).toThrow(
			"safe bounded identifiers",
		);

		const initial = createMindMapDecorationCommandState([], null, context);
		const created = applyMindMapDecorationCommand(
			initial,
			{
				type: "create",
				decoration: {
					kind: "marker",
					nodeId: "a",
					markerId: "priority",
					label: "P1",
				},
			},
			context,
		);

		expect(initial).toEqual({
			decorations: [],
			selection: { selectedDecorationId: null },
		});
		expect(created.selection.selectedDecorationId).toBe("marker-1");
		expect(created.decorations).toEqual([
			{
				id: "marker-1",
				kind: "marker",
				nodeId: "a",
				markerId: "priority",
				label: "P1",
			},
		]);

		const updated = applyMindMapDecorationCommand(
			created,
			{
				type: "update",
				id: "marker-1",
				decoration: {
					kind: "marker",
					nodeId: "a",
					markerId: "flag",
					label: "Escalated",
				},
			},
			context,
		);
		expect(updated.selection.selectedDecorationId).toBe("marker-1");
		expect(updated.decorations[0]).toMatchObject({
			markerId: "flag",
			label: "Escalated",
		});
		expect(created.decorations[0]).toMatchObject({ markerId: "priority" });

		const withBoundary = applyMindMapDecorationCommand(
			updated,
			{
				type: "create",
				select: false,
				decoration: { kind: "boundary", nodeIds: ["a", "b"] },
			},
			context,
		);
		const boundary = getMindMapDecoration(withBoundary, "boundary-1");
		if (boundary === null || boundary.kind !== "boundary") {
			throw new Error("Expected a boundary decoration.");
		}
		(boundary.nodeIds as string[]).push("c");
		expect(withBoundary.decorations[1]).toMatchObject({ nodeIds: ["a", "b"] });

		const deleted = applyMindMapDecorationCommand(
			withBoundary,
			{ type: "delete", id: "marker-1" },
			context,
		);
		expect(deleted.selection.selectedDecorationId).toBeNull();
		expect(deleted.decorations.map((decoration) => decoration.id)).toEqual([
			"boundary-1",
		]);
	});

	it("cleans and remaps node references without attaching to a guessed node", () => {
		const state = createMindMapDecorationCommandState([
			{
				id: "marker-removed",
				kind: "marker",
				nodeId: "b",
				markerId: "priority",
			},
			{
				id: "boundary-1",
				kind: "boundary",
				nodeIds: ["a", "b"],
			},
			{
				id: "summary-1",
				kind: "summary",
				nodeIds: ["b", "c"],
				text: "Kept target",
			},
			{
				id: "relationship-kept",
				kind: "relationship",
				fromNodeId: "a",
				toNodeId: "c",
			},
			{
				id: "relationship-removed",
				kind: "relationship",
				fromNodeId: "a",
				toNodeId: "b",
			},
		], "relationship-removed");

		const reconciliation = reconcileMindMapDecorationNodeReferences(state, {
			nodeIds: new Set(["A", "C"]),
			nodeIdRemap: new Map([
				["a", "A"],
				["b", null],
				["c", "C"],
			]),
		});

		expect(reconciliation.removedDecorationIds).toEqual([
			"marker-removed",
			"relationship-removed",
		]);
		expect(reconciliation.remappedDecorationIds).toEqual([
			"boundary-1",
			"summary-1",
			"relationship-kept",
		]);
		expect(reconciliation.state.selection.selectedDecorationId).toBeNull();
		expect(reconciliation.state.decorations).toEqual([
			{ id: "boundary-1", kind: "boundary", nodeIds: ["A"] },
			{
				id: "summary-1",
				kind: "summary",
				nodeIds: ["C"],
				text: "Kept target",
			},
			{
				id: "relationship-kept",
				kind: "relationship",
				fromNodeId: "A",
				toNodeId: "C",
			},
		]);
		expect(state.decorations[1]).toMatchObject({ nodeIds: ["a", "b"] });
	});

	it("resolves deterministic renderer-neutral geometry from node bounds only", () => {
		const decorations: readonly MindMapDecoration[] = [
			{
				id: "marker-1",
				kind: "marker",
				nodeId: "a",
				markerId: "priority",
				label: "P1",
			},
			{
				id: "boundary-1",
				kind: "boundary",
				nodeIds: ["a", "b"],
				label: "Group",
			},
			{
				id: "summary-1",
				kind: "summary",
				nodeIds: ["a", "b"],
				text: "Result",
			},
			{
				id: "relationship-1",
				kind: "relationship",
				fromNodeId: "a",
				toNodeId: "b",
				label: "relates",
			},
			{
				id: "relationship-missing",
				kind: "relationship",
				fromNodeId: "a",
				toNodeId: "missing",
			},
		];
		const resolution = resolveMindMapDecorationGeometry(
			decorations,
			{
				orientation: "left-to-right",
				nodeBounds: [
					{ id: "a", x: 0, y: 0, width: 100, height: 40 },
					{ id: "b", x: 200, y: 80, width: 80, height: 60 },
					{ id: "ignored", x: Number.NaN, y: 0, width: 1, height: 1 },
				],
			},
			{ boundaryPadding: 10, summaryPadding: 20, relationshipOffset: 30 },
		);

		expect(resolution.unresolvedDecorationIds).toEqual([
			"relationship-missing",
		]);
		expect(resolution.descriptors.map((descriptor) => descriptor.id)).toEqual([
			"marker-1",
			"boundary-1",
			"summary-1",
			"relationship-1",
		]);

		const boundary = resolution.descriptors.find(
			(descriptor) => descriptor.id === "boundary-1",
		);
		if (boundary === undefined || boundary.kind !== "boundary") {
			throw new Error("Expected a boundary descriptor.");
		}
		expect(boundary.bounds).toEqual({ x: -10, y: -10, width: 300, height: 160 });
		expect(boundary.labelAnchor).toEqual({ x: 0, y: 0 });

		const summary = resolution.descriptors.find(
			(descriptor) => descriptor.id === "summary-1",
		);
		if (summary === undefined || summary.kind !== "summary") {
			throw new Error("Expected a summary descriptor.");
		}
		expect(summary.side).toBe("right");
		expect(summary.bracket).toEqual([
			{ x: 280, y: 0 },
			{ x: 300, y: 0 },
			{ x: 300, y: 140 },
			{ x: 280, y: 140 },
		]);
		expect(summary.textAnchor).toEqual({ x: 320, y: 70 });

		const relationship = resolution.descriptors.find(
			(descriptor) => descriptor.id === "relationship-1",
		);
		if (relationship === undefined || relationship.kind !== "relationship") {
			throw new Error("Expected a relationship descriptor.");
		}
		expect(relationship.start.x).toBeGreaterThanOrEqual(0);
		expect(relationship.start.x).toBeLessThanOrEqual(100);
		expect(relationship.end.x).toBeGreaterThanOrEqual(200);
		expect(relationship.end.x).toBeLessThanOrEqual(280);
		expect(
			[relationship.start, relationship.control, relationship.end].flatMap(
				(point) => [point.x, point.y],
			),
		).toSatisfy((coordinates: readonly number[]) =>
			coordinates.every(Number.isFinite),
		);
	});

	it("orients summary brackets by layout and treats duplicate node bounds as unresolved", () => {
		const summary: readonly MindMapDecoration[] = [
			{
				id: "summary-1",
				kind: "summary",
				nodeIds: ["a"],
				text: "Summary",
			},
		];
		const expectedSides = {
			"left-to-right": "right",
			"right-to-left": "left",
			"top-to-bottom": "bottom",
			"bottom-to-top": "top",
		} as const;
		for (const [orientation, side] of Object.entries(expectedSides)) {
			const descriptor = resolveMindMapDecorationGeometry(summary, {
				orientation: orientation as keyof typeof expectedSides,
				nodeBounds: [{ id: "a", x: 0, y: 0, width: 100, height: 40 }],
			}).descriptors[0];
			expect(descriptor).toMatchObject({ kind: "summary", side });
		}

		const unresolved = resolveMindMapDecorationGeometry(summary, {
			nodeBounds: [
				{ id: "a", x: 0, y: 0, width: 100, height: 40 },
				{ id: "a", x: 0, y: 0, width: 100, height: 40 },
			],
		});
		expect(unresolved.descriptors).toEqual([]);
		expect(unresolved.unresolvedDecorationIds).toEqual(["summary-1"]);

		expect(DEFAULT_MIND_MAP_BOUNDARY_PADDING).toBeGreaterThan(0);
	});
});
