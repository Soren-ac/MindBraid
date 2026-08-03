import { describe, expect, it } from "vitest";

import {
	applyCollapsedNodeIdDelta,
	captureDocumentAnnotations,
	createAnnotationStore,
	createDocumentPresentationHistoryEntrySnapshots,
	createDocumentPresentationHistorySnapshot,
	createDocumentPresentationOverrideDelta,
	createPersistentNodeRef,
	deserializeAnnotationStore,
	hydrateDocumentAnnotations,
	mergeDocumentAnnotationRecordFields,
	mergeDocumentAnnotationRecordPresentationOverrideDelta,
	migrateAnnotationStorePath,
	rebindAnnotationStore,
	replaceDocumentAnnotationAppearanceReferences,
	restoreDocumentPresentationHistorySnapshot,
	serializeAnnotationStore,
	upsertDocumentAnnotationRecord,
} from "../src/application/persistence/annotations";
import { BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION } from "../src/application/composition/built-in-composition";
import { createLayoutEdgeId } from "../src/layout/layout";
import type { MindMapDocument, MindMapNode } from "../src/core/model";
import { createMindMapNodeLocator } from "../src/topic/node-identity";
import { parseMarkdown } from "../src/core/parser";
import {
	createDefaultMindMapPresentation,
	type MindMapEdgePresentation,
	type MindMapNodePresentation,
} from "../src/presentation/presentation";
import {
	FLAG_ASSET_ID,
	PRIORITY_HIGH_ASSET_ID,
	TAG_LABEL_ASSET_ID,
} from "../src/presentation/assets";

const NOTE_PATH = "Folder/Annotations.md";

describe("annotation persistence", () => {
	it("rebinds only a uniquely resolved current node and refreshes its locator", () => {
		const previous = parse("# Parent\n## Topic");
		const locator = requireLocator(previous, "Topic");
		const store = createAnnotationStore([
			{
				id: "annotation-1",
				target: createPersistentNodeRef(locator),
				text: "Keep this context.",
				status: "attached",
			},
		]);

		const result = rebindAnnotationStore(
			store,
			parse("Intro\n\n# Parent\n## Topic"),
		);

		expect(result.rebound).toEqual([
			expect.objectContaining({
				annotationId: "annotation-1",
				strategy: "ancestry",
			}),
		]);
		expect(result.orphaned).toEqual([]);
		expect(result.store.annotations[0]?.status).toBe("attached");
		expect(result.store.annotations[0]?.target.locator.sourceAnchor.line).toBe(3);
	});

	it("preserves ambiguous targets as orphaned records rather than guessing", () => {
		const previous = parse("# First\n## Same\n# Second\n## Same");
		const firstSame = previous.root.children[0]?.children[0];
		if (firstSame === undefined) {
			throw new Error("Expected the first duplicate.");
		}
		const locator = createMindMapNodeLocator(previous, firstSame.id);
		if (locator === null) {
			throw new Error("Expected a locator.");
		}
		const store = createAnnotationStore([
			{
				id: "ambiguous",
				target: createPersistentNodeRef(locator),
				text: "Never guess.",
				status: "attached",
			},
		]);

		const result = rebindAnnotationStore(
			store,
			parse("# Third\n## Same\n# Fourth\n## Same"),
		);

		expect(result.rebound).toEqual([]);
		expect(result.orphaned).toEqual(["ambiguous"]);
		expect(result.store.annotations[0]).toMatchObject({
			id: "ambiguous",
			status: "orphaned",
			target: { locator },
		});
	});

	it("migrates only exact file-path references after a confirmed rename", () => {
		const previous = parse("# Topic");
		const locator = requireLocator(previous, "Topic");
		const other = parseMarkdown("# Other", "Other.md", "Other");
		const otherLocator = requireLocator(other, "Other");
		const store = createAnnotationStore([
			record("renamed", locator),
			record("unrelated", otherLocator),
		]);

		const migrated = migrateAnnotationStorePath(
			store,
			NOTE_PATH,
			"Archive/Annotations.md",
		);

		expect(migrated.migrated).toEqual(["renamed"]);
		expect(migrated.store.annotations[0]?.target.locator.documentPath).toBe(
			"Archive/Annotations.md",
		);
		expect(migrated.store.annotations[1]?.target.locator.documentPath).toBe(
			"Other.md",
		);
		expect(
			rebindAnnotationStore(
				migrated.store,
				parseMarkdown("# Topic", "Archive/Annotations.md", "Annotations"),
			).rebound.map(({ annotationId }) => annotationId),
		).toEqual(["renamed"]);
	});

	it("validates serialized data and migrates the v0 locator format", () => {
		const document = parse("# Topic");
		const locator = requireLocator(document, "Topic");
		const legacy = {
			annotations: [
				{ id: "legacy", locator, text: "Migrated annotation" },
			],
		};

		const loaded = deserializeAnnotationStore(JSON.stringify(legacy));

		expect(loaded).toMatchObject({ migrated: true });
		expect(loaded?.store.annotations[0]).toMatchObject({
			id: "legacy",
			status: "attached",
			target: { version: 1, locator },
		});
		expect(deserializeAnnotationStore(serializeAnnotationStore(loaded!.store))).toEqual({
			store: loaded!.store,
			migrated: false,
		});
		expect(deserializeAnnotationStore("not json")).toBeNull();
		expect(
			deserializeAnnotationStore({
				version: 1,
				annotations: [
					{
						id: "invalid",
						text: "Bad locator",
						status: "attached",
						target: { version: 1, locator: { documentPath: NOTE_PATH } },
					},
				],
			}),
		).toBeNull();
	});

	it("rejects duplicate annotation IDs", () => {
		const locator = requireLocator(parse("# Topic"), "Topic");
		expect(() => createAnnotationStore([record("same", locator), record("same", locator)])).toThrow(
			"invalid record",
		);
	});

	it("round-trips document presentation, collapse, and viewport across shifted lines", () => {
		const previous = parse("# Parent\n## Topic");
		const parent = requireNode(previous, "Parent");
		const topic = requireNode(previous, "Topic");
		const base = createDefaultMindMapPresentation("left-to-right");
		const presentation = {
			...base,
			layout: {
				...base.layout,
				orientation: "right-to-left" as const,
				spacing: { level: 100, sibling: 32, subtree: 40 },
			},
			formatting:
				BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.formatting.compose(
					"handwritten",
					"thick",
					"taper-to-child",
				),
			nodes: new Map([[topic.id, { shape: "pill" as const }]]),
		};
		const record = captureDocumentAnnotations(
			previous,
			base,
			presentation,
			new Set([parent.id]),
			{ centerX: 20, centerY: -5, scale: 1.25 },
		);
		const stored = upsertDocumentAnnotationRecord(
			createAnnotationStore(),
			record,
		);
		const next = parse("Intro\n\n# Parent\n## Topic");
		const hydrated = hydrateDocumentAnnotations(
			deserializeAnnotationStore(serializeAnnotationStore(stored))!.store,
			next,
			base,
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities,
		);
		const nextParent = requireNode(next, "Parent");
		const nextTopic = requireNode(next, "Topic");

		expect(hydrated.found).toBe(true);
		expect(hydrated.hasPresentationOverride).toBe(true);
		expect(hydrated.orphanedCount).toBe(0);
		expect(hydrated.presentation.layout).toMatchObject({
			orientation: "right-to-left",
			spacing: { level: 100, sibling: 32, subtree: 40 },
		});
		expect(hydrated.presentation.nodes.get(nextTopic.id)).toEqual({
			shape: "pill",
		});
		expect(hydrated.presentation.formatting).toMatchObject({
			fontFamily: { id: "handwritten" },
			connectorWidth: { id: "thick", width: 2.25 },
			connectorProfile: {
				id: "taper-to-child",
				profile: { kind: "taper-to-child", childWidthRatio: 0.35 },
			},
		});
		expect(hydrated.collapsedNodeIds).toEqual(new Set([nextParent.id]));
		expect(hydrated.viewport).toEqual({
			centerX: 20,
			centerY: -5,
			scale: 1.25,
		});
		expect(
			hydrated.store.documents[0]?.nodes[0]?.target.locator.sourceAnchor.line,
		).toBe(3);
	});

	it("round-trips node assets and authored decorations through structural locators", () => {
		const previous = parse("# Parent\n## First\n## Second");
		const first = requireNode(previous, "First");
		const second = requireNode(previous, "Second");
		const base = createDefaultMindMapPresentation("left-to-right");
		const presentation = {
			...base,
			nodes: new Map([
				[
					first.id,
					{
						iconId: FLAG_ASSET_ID,
						markerIds: [PRIORITY_HIGH_ASSET_ID],
					},
				],
			]),
			decorations: [
				{
					id: "tag-1",
					kind: "marker" as const,
					nodeId: first.id,
					markerId: TAG_LABEL_ASSET_ID,
					label: "Release",
				},
				{
					id: "boundary-1",
					kind: "boundary" as const,
					nodeIds: [first.id, second.id],
					label: "Scope",
				},
				{
					id: "summary-1",
					kind: "summary" as const,
					nodeIds: [first.id, second.id],
					text: "Outcome",
				},
				{
					id: "relationship-1",
					kind: "relationship" as const,
					fromNodeId: first.id,
					toNodeId: second.id,
					label: "Depends on",
				},
			],
		};
		const stored = upsertDocumentAnnotationRecord(
			createAnnotationStore(),
			captureDocumentAnnotations(
				previous,
				base,
				presentation,
				new Set(),
				null,
			),
		);
		const next = parse("Intro\n\n# Parent\n## First\n## Second");
		const hydrated = hydrateDocumentAnnotations(
			deserializeAnnotationStore(serializeAnnotationStore(stored))!.store,
			next,
			base,
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities,
		);
		const nextFirst = requireNode(next, "First");
		const nextSecond = requireNode(next, "Second");

		expect(hydrated.orphanedCount).toBe(0);
		expect(hydrated.presentation.nodes.get(nextFirst.id)).toEqual({
			iconId: FLAG_ASSET_ID,
			markerIds: [PRIORITY_HIGH_ASSET_ID],
		});
		expect(hydrated.presentation.decorations).toEqual([
			{
				id: "tag-1",
				kind: "marker",
				nodeId: nextFirst.id,
				markerId: TAG_LABEL_ASSET_ID,
				label: "Release",
			},
			{
				id: "boundary-1",
				kind: "boundary",
				nodeIds: [nextFirst.id, nextSecond.id],
				label: "Scope",
			},
			{
				id: "summary-1",
				kind: "summary",
				nodeIds: [nextFirst.id, nextSecond.id],
				text: "Outcome",
			},
			{
				id: "relationship-1",
				kind: "relationship",
				fromNodeId: nextFirst.id,
				toNodeId: nextSecond.id,
				label: "Depends on",
			},
		]);
	});

	it("keeps ambiguous persisted presentation targets orphaned", () => {
		const previous = parse(
			"# Root\n## Same\n### Child\n## Same\n### Child",
		);
		const target = findNodes(previous.root, "Same")[1];
		if (target === undefined) {
			throw new Error("Expected a duplicate topic.");
		}
		const base = createDefaultMindMapPresentation("left-to-right");
		const record = captureDocumentAnnotations(
			previous,
			base,
			{ ...base, nodes: new Map([[target.id, { maxWidth: 320 }]]) },
			new Set([target.id]),
			null,
		);
		const next = parse(
			"# Root\n## Same\n### Child\n## Same\n### Child\n## Same\n### Child",
		);
		const hydrated = hydrateDocumentAnnotations(
			upsertDocumentAnnotationRecord(createAnnotationStore(), record),
			next,
			base,
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities,
		);

		expect(hydrated.presentation.nodes.size).toBe(0);
		expect(hydrated.collapsedNodeIds.size).toBe(0);
		expect(hydrated.orphanedCount).toBe(2);
		expect(hydrated.store.documents[0]).toMatchObject({
			nodes: [{ status: "orphaned" }],
			collapsed: [{ status: "orphaned" }],
		});
	});

	it("migrates document keys and every nested persistent reference", () => {
		const document = parse("# Parent\n## Topic");
		const base = createDefaultMindMapPresentation("left-to-right");
		const parent = requireNode(document, "Parent");
		const topic = requireNode(document, "Topic");
		const record = captureDocumentAnnotations(
			document,
			base,
			{ ...base, nodes: new Map([[topic.id, { shape: "ellipse" }]]) },
			new Set([parent.id]),
			null,
		);
		const result = migrateAnnotationStorePath(
			upsertDocumentAnnotationRecord(createAnnotationStore(), record),
			NOTE_PATH,
			"Archive/Annotations.md",
		);
		const migrated = result.store.documents[0];

		expect(result.migrated).toContain(`document:${NOTE_PATH}`);
		expect(migrated?.path).toBe("Archive/Annotations.md");
		expect(migrated?.nodes[0]?.target.locator.documentPath).toBe(
			"Archive/Annotations.md",
		);
		expect(migrated?.collapsed[0]?.target.locator.documentPath).toBe(
			"Archive/Annotations.md",
		);
	});

	it("rejects unsafe document presentation payloads", () => {
		expect(
			deserializeAnnotationStore({
				version: 2,
				annotations: [],
				documents: [
					{
						path: NOTE_PATH,
						layout: null,
						themeId: "url(https://example.com)",
						nodes: [],
						edges: [],
						decorations: [],
						collapsed: [],
						viewport: null,
					},
				],
			}),
		).toBeNull();
	});

	it("migrates v2 document theme IDs to matching style and palette IDs", () => {
		const migrated = deserializeAnnotationStore({
			version: 2,
			annotations: [],
			documents: [
				{
					path: NOTE_PATH,
					layout: null,
					themeId: "pencil-sketch",
					nodes: [],
					edges: [],
					decorations: [],
					collapsed: [],
					viewport: null,
				},
			],
		});

		expect(migrated?.migrated).toBe(true);
		expect(migrated?.store.version).toBe(5);
		expect(migrated?.store.documents[0]).toMatchObject({
			styleId: "pencil-sketch",
			paletteId: "pencil-sketch",
			fontFamilyId: null,
			connectorWidthId: null,
			connectorProfileId: null,
		});
	});

	it("migrates v3 documents with style-default global formatting", () => {
		const migrated = deserializeAnnotationStore({
			version: 3,
			annotations: [],
			documents: [
				{
					path: NOTE_PATH,
					layout: null,
					styleId: "cloud",
					paletteId: "colorful",
					nodes: [],
					edges: [],
					decorations: [],
					collapsed: [],
					viewport: null,
				},
			],
		});

		expect(migrated).toMatchObject({ migrated: true });
		expect(migrated?.store).toMatchObject({
			version: 5,
			documents: [
				{
					styleId: "cloud",
					paletteId: "colorful",
					fontFamilyId: null,
					connectorWidthId: null,
					connectorProfileId: null,
				},
			],
		});
	});

	it("migrates v4 documents while preserving existing global formatting", () => {
		const migrated = deserializeAnnotationStore({
			version: 4,
			annotations: [],
			documents: [
				{
					path: NOTE_PATH,
					layout: null,
					styleId: "pencil-sketch",
					paletteId: "cloud",
					fontFamilyId: "handwritten",
					connectorWidthId: "thick",
					nodes: [],
					edges: [],
					decorations: [],
					collapsed: [],
					viewport: null,
				},
			],
		});

		expect(migrated).toMatchObject({ migrated: true });
		expect(migrated?.store).toMatchObject({
			version: 5,
			documents: [
				{
					styleId: "pencil-sketch",
					paletteId: "cloud",
					fontFamilyId: "handwritten",
					connectorWidthId: "thick",
					connectorProfileId: null,
				},
			],
		});
	});

	it("isolates every unavailable document presentation field during hydration", () => {
		const document = parse("# Topic");
		const composition =
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition;
		const formatting =
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.formatting;
		const capabilities =
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities;
		const plainBase = createDefaultMindMapPresentation("left-to-right");
		const base = {
			...plainBase,
			theme: composition.compose("colorful", "colorful"),
		};
		const selected = {
			...base,
			layout: {
				...base.layout,
				orientation: "top-to-bottom" as const,
				options: { compactness: "compact", alignSameLevel: false },
			},
			theme: composition.compose("pencil-sketch", "cloud"),
			formatting: formatting.compose(
				"handwritten",
				"thick",
				"taper-to-child",
			),
		};
		const persisted = captureDocumentAnnotations(
			document,
			base,
			selected,
			new Set(),
			null,
		);

		const corruptions = [
			{
				field: "layout",
				record: {
					...persisted,
					layout: {
						...persisted.layout!,
						options: { balanceStrategy: "alternating" },
					},
				},
			},
			{
				field: "style",
				record: { ...persisted, styleId: "unavailable-style" },
			},
			{
				field: "palette",
				record: { ...persisted, paletteId: "unavailable-palette" },
			},
			{
				field: "font",
				record: { ...persisted, fontFamilyId: "unavailable-font" },
			},
			{
				field: "width",
				record: {
					...persisted,
					connectorWidthId: "unavailable-width",
				},
			},
			{
				field: "profile",
				record: {
					...persisted,
					connectorProfileId: "unavailable-profile",
				},
			},
		] as const;

		for (const { field, record } of corruptions) {
			const hydrated = hydrateDocumentAnnotations(
				upsertDocumentAnnotationRecord(createAnnotationStore(), record),
				document,
				base,
				capabilities,
			);

			expect(hydrated.hasPresentationOverride, field).toBe(true);
			expect(hydrated.presentation.layout.orientation, field).toBe(
				field === "layout" ? base.layout.orientation : "top-to-bottom",
			);
			expect(hydrated.presentation.theme.styleId, field).toBe(
				field === "style" ? base.theme.styleId : "pencil-sketch",
			);
			expect(hydrated.presentation.theme.paletteId, field).toBe(
				field === "palette" ? base.theme.paletteId : "cloud",
			);
			expect(hydrated.presentation.formatting.fontFamily.id, field).toBe(
				field === "font" ? base.formatting.fontFamily.id : "handwritten",
			);
			expect(hydrated.presentation.formatting.connectorWidth.id, field).toBe(
				field === "width" ? base.formatting.connectorWidth.id : "thick",
			);
			expect(
				hydrated.presentation.formatting.connectorProfile.id,
				field,
			).toBe(
				field === "profile"
					? base.formatting.connectorProfile.id
					: "taper-to-child",
			);
		}
	});

	it("keeps valid node and edge overrides when neighboring overrides are unsupported", () => {
		const document = parse("# Parent\n## First\n## Second");
		const parent = requireNode(document, "Parent");
		const first = requireNode(document, "First");
		const second = requireNode(document, "Second");
		const base = createDefaultMindMapPresentation("left-to-right");
		const firstEdgeId = createLayoutEdgeId(parent.id, first.id);
		const secondEdgeId = createLayoutEdgeId(parent.id, second.id);
		const persisted = captureDocumentAnnotations(
			document,
			base,
			{
				...base,
				nodes: new Map([
					[first.id, { shape: "pill" as const }],
					[second.id, { shape: "rounded-rectangle" as const }],
				]),
				edges: new Map([
					[firstEdgeId, { routing: "straight" as const }],
					[secondEdgeId, { routing: "bezier" as const }],
				]),
			},
			new Set(),
			null,
		);
		const capabilities = {
			...BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities,
			nodeShapes: ["rounded-rectangle"] as const,
			edgeRoutings: ["bezier"] as const,
		};

		const hydrated = hydrateDocumentAnnotations(
			upsertDocumentAnnotationRecord(createAnnotationStore(), persisted),
			document,
			base,
			capabilities,
		);

		expect(hydrated.presentation.nodes.get(first.id)).toBeUndefined();
		expect(hydrated.presentation.nodes.get(second.id)).toEqual({
			shape: "rounded-rectangle",
		});
		expect(hydrated.presentation.edges.get(firstEdgeId)).toBeUndefined();
		expect(hydrated.presentation.edges.get(secondEdgeId)).toEqual({
			routing: "bezier",
		});
		expect(hydrated.orphanedCount).toBe(0);
	});

	it("merges delayed document state by owned field", () => {
		const document = parse("# Parent\n## Topic");
		const base = createDefaultMindMapPresentation("left-to-right");
		const parent = requireNode(document, "Parent");
		const existing = captureDocumentAnnotations(
			document,
			base,
			{
				...base,
				layout: {
					...base.layout,
					orientation: "right-to-left",
				},
			},
			new Set([parent.id]),
			{ centerX: 1, centerY: 2, scale: 1 },
		);
		const delayedViewport = captureDocumentAnnotations(
			document,
			base,
			base,
			new Set(),
			{ centerX: 30, centerY: 40, scale: 1.5 },
		);

		const merged = mergeDocumentAnnotationRecordFields(
			existing,
			delayedViewport,
			["viewport"],
		);

		expect(merged.layout).toEqual(existing.layout);
		expect(merged.collapsed).toEqual(existing.collapsed);
		expect(merged.viewport).toEqual({
			centerX: 30,
			centerY: 40,
			scale: 1.5,
		});
	});

	it("restores presentation history by owned fields without replaying interaction state", () => {
		const document = parse("# Parent\n## Topic");
		const parent = requireNode(document, "Parent");
		const plainBase = createDefaultMindMapPresentation("left-to-right");
		const composition =
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition;
		const base = {
			...plainBase,
			theme: composition.compose("colorful", "colorful"),
		};
		const styled = {
			...base,
			theme: composition.compose("pencil-sketch", "colorful"),
		};
		const styledRecord = captureDocumentAnnotations(
			document,
			base,
			styled,
			new Set(),
			null,
		);
		const latestInteraction = captureDocumentAnnotations(
			document,
			base,
			{
				...styled,
				theme: composition.compose("pencil-sketch", "cloud"),
			},
			new Set([parent.id]),
			{ centerX: 30, centerY: 40, scale: 1.5 },
		);

		const undo = createDocumentPresentationHistorySnapshot(
			NOTE_PATH,
			null,
			["style"],
		);
		const undone = restoreDocumentPresentationHistorySnapshot(
			document,
			latestInteraction,
			undo,
		);

		expect(undone).not.toBeNull();
		expect(undone?.styleId).toBeNull();
		expect(undone?.paletteId).toBe("cloud");
		expect(undone?.collapsed).toEqual(latestInteraction.collapsed);
		expect(undone?.viewport).toEqual(latestInteraction.viewport);

		const redo = createDocumentPresentationHistorySnapshot(
			NOTE_PATH,
			styledRecord,
			["style"],
		);
		const redone = restoreDocumentPresentationHistorySnapshot(
			document,
			undone,
			redo,
		);

		expect(redone?.styleId).toBe("pencil-sketch");
		expect(redone?.paletteId).toBe("cloud");
		expect(redone?.collapsed).toEqual(latestInteraction.collapsed);
		expect(redone?.viewport).toEqual(latestInteraction.viewport);
	});

	it("restores only history-owned node and edge targets", () => {
		const document = parse("# Parent\n## A\n## B");
		const parent = requireNode(document, "Parent");
		const a = requireNode(document, "A");
		const b = requireNode(document, "B");
		const aEdgeId = createLayoutEdgeId(parent.id, a.id);
		const bEdgeId = createLayoutEdgeId(parent.id, b.id);
		const base = createDefaultMindMapPresentation("left-to-right");
		const firstChange = captureDocumentAnnotations(
			document,
			base,
			{
				...base,
				nodes: new Map([[a.id, { shape: "ellipse" }]]),
				edges: new Map([[aEdgeId, { routing: "straight" }]]),
			},
			new Set(),
			null,
		);
		const snapshots = createDocumentPresentationHistoryEntrySnapshots(
			document,
			null,
			firstChange,
			["nodes", "edges"],
		);
		const laterState = captureDocumentAnnotations(
			document,
			base,
			{
				...base,
				nodes: new Map([
					[a.id, { shape: "ellipse" }],
					[b.id, { shape: "pill" }],
				]),
				edges: new Map([
					[aEdgeId, { routing: "straight" }],
					[bEdgeId, { routing: "bezier" }],
				]),
				decorations: [
					{
						id: "marker-b",
						kind: "marker",
						nodeId: b.id,
						markerId: "priority",
					},
				],
			},
			new Set([parent.id]),
			{ centerX: 50, centerY: 60, scale: 1.25 },
		);

		const undone = restoreDocumentPresentationHistorySnapshot(
			document,
			laterState,
			snapshots.before,
		);
		if (undone === null) {
			throw new Error("Expected unrelated annotations to retain the record.");
		}
		const undoneHydrated = hydrateDocumentAnnotations(
			upsertDocumentAnnotationRecord(createAnnotationStore(), undone),
			document,
			base,
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities,
		);

		expect(undoneHydrated.presentation.nodes.get(a.id)).toBeUndefined();
		expect(undoneHydrated.presentation.nodes.get(b.id)).toEqual({
			shape: "pill",
		});
		expect(undoneHydrated.presentation.edges.get(aEdgeId)).toBeUndefined();
		expect(undoneHydrated.presentation.edges.get(bEdgeId)).toEqual({
			routing: "bezier",
		});
		expect(undone.decorations).toEqual(laterState.decorations);
		expect(undone.collapsed).toEqual(laterState.collapsed);
		expect(undone.viewport).toEqual(laterState.viewport);

		const redone = restoreDocumentPresentationHistorySnapshot(
			document,
			undone,
			snapshots.after,
		);
		if (redone === null) {
			throw new Error("Expected the redone presentation record.");
		}
		const redoneHydrated = hydrateDocumentAnnotations(
			upsertDocumentAnnotationRecord(createAnnotationStore(), redone),
			document,
			base,
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities,
		);

		expect(redoneHydrated.presentation.nodes.get(a.id)).toEqual({
			shape: "ellipse",
		});
		expect(redoneHydrated.presentation.nodes.get(b.id)).toEqual({
			shape: "pill",
		});
		expect(redoneHydrated.presentation.edges.get(aEdgeId)).toEqual({
			routing: "straight",
		});
		expect(redoneHydrated.presentation.edges.get(bEdgeId)).toEqual({
			routing: "bezier",
		});
		expect(redone.decorations).toEqual(laterState.decorations);
		expect(redone.collapsed).toEqual(laterState.collapsed);
		expect(redone.viewport).toEqual(laterState.viewport);
	});

	it("merges style and palette fields independently", () => {
		const document = parse("# Topic");
		const plainBase = createDefaultMindMapPresentation("left-to-right");
		const composition =
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition;
		const base = {
			...plainBase,
			theme: composition.compose("colorful", "colorful"),
		};
		const styleChange = captureDocumentAnnotations(
			document,
			base,
			{ ...base, theme: composition.compose("pencil-sketch", "colorful") },
			new Set(),
			null,
		);
		const paletteChange = captureDocumentAnnotations(
			document,
			base,
			{ ...base, theme: composition.compose("colorful", "cloud") },
			new Set(),
			null,
		);

		const merged = mergeDocumentAnnotationRecordFields(
			styleChange,
			paletteChange,
			["palette"],
		);

		expect(merged.styleId).toBe("pencil-sketch");
		expect(merged.paletteId).toBe("cloud");
	});

	it("merges global font and connector width fields independently", () => {
		const document = parse("# Topic");
		const base = createDefaultMindMapPresentation("left-to-right");
		const formatting =
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.formatting;
		const fontChange = captureDocumentAnnotations(
			document,
			base,
			{
				...base,
				formatting: formatting.compose("handwritten", "style-default"),
			},
			new Set(),
			null,
		);
		const widthChange = captureDocumentAnnotations(
			document,
			base,
			{
				...base,
				formatting: formatting.compose("style-default", "extra-thick"),
			},
			new Set(),
			null,
		);

		const merged = mergeDocumentAnnotationRecordFields(
			fontChange,
			widthChange,
			["connector-width"],
		);

		expect(merged.fontFamilyId).toBe("handwritten");
		expect(merged.connectorWidthId).toBe("extra-thick");
	});

	it("merges two stale tabs' owned node and edge deltas by ID", () => {
		const document = parse("# Parent\n## A\n## B");
		const base = createDefaultMindMapPresentation("left-to-right");
		const parent = requireNode(document, "Parent");
		const a = requireNode(document, "A");
		const b = requireNode(document, "B");
		const aEdgeId = createLayoutEdgeId(parent.id, a.id);
		const bEdgeId = createLayoutEdgeId(parent.id, b.id);
		const tabABefore = {
			...base,
			nodes: new Map(base.nodes),
			edges: new Map(base.edges),
		};
		const tabBBefore = {
			...base,
			nodes: new Map(base.nodes),
			edges: new Map(base.edges),
		};
		const tabAAfter = {
			...tabABefore,
			nodes: new Map([[a.id, { shape: "ellipse" as const }]]),
			edges: new Map([[aEdgeId, { routing: "straight" as const }]]),
		};
		const tabBAfter = {
			...tabBBefore,
			nodes: new Map([[b.id, { shape: "pill" as const }]]),
			edges: new Map([[bEdgeId, { routing: "bezier" as const }]]),
		};

		const afterA = mergeDocumentAnnotationRecordPresentationOverrideDelta(
			null,
			document,
			createDocumentPresentationOverrideDelta(tabABefore, tabAAfter),
		);
		const tabBDelta = createDocumentPresentationOverrideDelta(
			tabBBefore,
			tabBAfter,
		);
		expect([...tabBDelta.nodes.keys()]).toEqual([b.id]);
		expect([...tabBDelta.edges.keys()]).toEqual([bEdgeId]);
		const afterB = mergeDocumentAnnotationRecordPresentationOverrideDelta(
			afterA,
			document,
			tabBDelta,
		);

		const hydrated = hydrateDocumentAnnotations(
			upsertDocumentAnnotationRecord(createAnnotationStore(), afterB),
			document,
			base,
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities,
		);
		expect(hydrated.presentation.nodes).toEqual(
			new Map([
				[a.id, { shape: "ellipse" }],
				[b.id, { shape: "pill" }],
			]),
		);
		expect(hydrated.presentation.edges).toEqual(
			new Map([
				[aEdgeId, { routing: "straight" }],
				[bEdgeId, { routing: "bezier" }],
			]),
		);
	});

	it("rebinds deleted custom appearance IDs without changing unrelated document fields", () => {
		const document = parse("# Topic");
		const base = createDefaultMindMapPresentation("left-to-right");
		const topic = requireNode(document, "Topic");
		const first = captureDocumentAnnotations(
			document,
			base,
			{
				...base,
				theme: {
					...base.theme,
					styleId: "custom-style-1",
					paletteId: "custom-palette-1",
				},
				nodes: new Map([[topic.id, { shape: "pill" as const }]]),
			},
			new Set([topic.id]),
			{ centerX: 20, centerY: 30, scale: 1.2 },
		);
		const second = {
			...first,
			path: "Folder/Other.md",
			styleId: "colorful",
			paletteId: "custom-palette-1",
		};
		const store = upsertDocumentAnnotationRecord(
			upsertDocumentAnnotationRecord(createAnnotationStore(), first),
			second,
		);

		const withoutStyle = replaceDocumentAnnotationAppearanceReferences(
			store,
			{
				kind: "style",
				removedId: "custom-style-1",
				fallbackId: "colorful",
			},
		);
		const withoutPalette = replaceDocumentAnnotationAppearanceReferences(
			withoutStyle,
			{
				kind: "palette",
				removedId: "custom-palette-1",
				fallbackId: "cloud",
			},
		);

		expect(withoutPalette.documents).toHaveLength(2);
		expect(withoutPalette.documents[0]).toMatchObject({
			path: NOTE_PATH,
			styleId: "colorful",
			paletteId: "cloud",
			nodes: first.nodes,
			collapsed: first.collapsed,
			viewport: first.viewport,
		});
		expect(withoutPalette.documents[1]).toMatchObject({
			path: "Folder/Other.md",
			styleId: "colorful",
			paletteId: "cloud",
		});
		expect(() =>
			replaceDocumentAnnotationAppearanceReferences(store, {
				kind: "style",
				removedId: "same",
				fallbackId: "same",
			}),
		).toThrow("replacement IDs are invalid");
	});

	it("applies a stale tab's null node and edge deletion without erasing another tab", () => {
		const document = parse("# Parent\n## A\n## B");
		const base = createDefaultMindMapPresentation("left-to-right");
		const parent = requireNode(document, "Parent");
		const a = requireNode(document, "A");
		const b = requireNode(document, "B");
		const aEdgeId = createLayoutEdgeId(parent.id, a.id);
		const bEdgeId = createLayoutEdgeId(parent.id, b.id);
		const deleteTabBefore = {
			...base,
			nodes: new Map([[a.id, { shape: "ellipse" as const }]]),
			edges: new Map([[aEdgeId, { routing: "straight" as const }]]),
		};
		const otherTabBefore = {
			...deleteTabBefore,
			nodes: new Map(deleteTabBefore.nodes),
			edges: new Map(deleteTabBefore.edges),
		};
		const initial = mergeDocumentAnnotationRecordPresentationOverrideDelta(
			null,
			document,
			createDocumentPresentationOverrideDelta(base, deleteTabBefore),
		);
		const otherTabAfter = {
			...otherTabBefore,
			nodes: new Map<string, MindMapNodePresentation>([
				...otherTabBefore.nodes,
				[b.id, { shape: "pill" as const }],
			]),
			edges: new Map<string, MindMapEdgePresentation>([
				...otherTabBefore.edges,
				[bEdgeId, { routing: "bezier" as const }],
			]),
		};
		const afterOtherTab = mergeDocumentAnnotationRecordPresentationOverrideDelta(
			initial,
			document,
			createDocumentPresentationOverrideDelta(otherTabBefore, otherTabAfter),
		);
		const deleteTabAfter = {
			...base,
			nodes: new Map(),
			edges: new Map(),
		};
		const deletionDelta = createDocumentPresentationOverrideDelta(
			deleteTabBefore,
			deleteTabAfter,
		);
		expect(deletionDelta.nodes).toEqual(new Map([[a.id, null]]));
		expect(deletionDelta.edges).toEqual(new Map([[aEdgeId, null]]));
		const afterDeletion = mergeDocumentAnnotationRecordPresentationOverrideDelta(
			afterOtherTab,
			document,
			deletionDelta,
		);

		const hydrated = hydrateDocumentAnnotations(
			upsertDocumentAnnotationRecord(createAnnotationStore(), afterDeletion),
			document,
			base,
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities,
		);
		expect(hydrated.presentation.nodes).toEqual(
			new Map([[b.id, { shape: "pill" }]]),
		);
		expect(hydrated.presentation.edges).toEqual(
			new Map([[bEdgeId, { routing: "bezier" }]]),
		);
	});

	it("rebases one tab's collapse delta over another tab's state", () => {
		expect(
			applyCollapsedNodeIdDelta(
				new Set(["from-other-tab"]),
				new Set(["expanded-here"]),
				new Set(["collapsed-here"]),
			),
		).toEqual(new Set(["from-other-tab", "collapsed-here"]));
	});
});

function parse(content: string) {
	return parseMarkdown(content, NOTE_PATH, "Annotations");
}

function requireLocator(document: MindMapDocument, text: string) {
	const node = findNode(document.root, text);
	if (node === null) {
		throw new Error(`Expected node ${text}.`);
	}
	const locator = createMindMapNodeLocator(document, node.id);
	if (locator === null) {
		throw new Error(`Expected locator for ${text}.`);
	}
	return locator;
}

function record(id: string, locator: ReturnType<typeof requireLocator>) {
	return {
		id,
		target: createPersistentNodeRef(locator),
		text: id,
		status: "attached" as const,
	};
}

function findNode(
	node: MindMapNode,
	text: string,
): MindMapNode | null {
	if (node.text === text) {
		return node;
	}
	for (const child of node.children) {
		const result = findNode(child, text);
		if (result !== null) {
			return result;
		}
	}
	return null;
}

function findNodes(node: MindMapNode, text: string): MindMapNode[] {
	const matches: MindMapNode[] = [];
	const pending = [node];
	while (pending.length > 0) {
		const current = pending.shift();
		if (current === undefined) {
			continue;
		}
		if (current.text === text) {
			matches.push(current);
		}
		pending.push(...current.children);
	}
	return matches;
}

function requireNode(document: MindMapDocument, text: string): MindMapNode {
	const node = findNode(document.root, text);
	if (node === null) {
		throw new Error(`Expected node ${text}.`);
	}
	return node;
}
