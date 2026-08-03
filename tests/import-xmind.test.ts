// @vitest-environment happy-dom

import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { XMIND_IMPORT_ADAPTER } from "../src/import/xmind";
import {
	DEFAULT_MIND_MAP_IMPORT_LIMITS,
	MindMapImportError,
	type MindMapImportLimits,
} from "../src/import/types";

function makeXMindArchive(entries: Readonly<Record<string, string>>): Uint8Array {
	const bytes: Record<string, Uint8Array> = {};
	for (const [name, content] of Object.entries(entries)) {
		bytes[name] = strToU8(content);
	}
	return zipSync(bytes);
}

function parseXMind(
	entries: Readonly<Record<string, string>>,
	limits?: MindMapImportLimits,
) {
	return XMIND_IMPORT_ADAPTER.parse(
		{
			name: "Roadmap.xmind",
			bytes: makeXMindArchive(entries),
		},
		limits,
	);
}

function expectImportError(
	callback: () => unknown,
	code: MindMapImportError["code"],
): void {
	try {
		callback();
	} catch (error: unknown) {
		expect(error).toBeInstanceOf(MindMapImportError);
		expect((error as MindMapImportError).code).toBe(code);
		return;
	}
	throw new Error(`Expected import error "${code}".`);
}

describe("XMind import adapter", () => {
	it("recognizes ZIP-backed .xmind files without claiming plain text", () => {
		expect(
			XMIND_IMPORT_ADAPTER.sniff({
				name: "Map.xmind",
				bytes: makeXMindArchive({ "content.json": "[]" }),
			}),
		).toBe(100);
		expect(
			XMIND_IMPORT_ADAPTER.sniff({
				name: "Map.xmind",
				bytes: strToU8("not an archive"),
			}),
		).toBe(0);
	});

	it("imports every modern JSON sheet and preserves attached hierarchy and clear tasks", () => {
		const workbook = parseXMind({
			"content.json": JSON.stringify([
				{
					id: "sheet-one",
					title: "First sheet",
					rootTopic: {
						id: "root-one",
						title: "First root",
						children: {
							attached: [
								{
									id: "todo",
									title: "Todo",
									markers: [{ markerId: "task-start" }],
									children: {
										attached: [
											{
												id: "done",
												title: "Done",
												markers: [{ markerId: "task-done" }],
											},
										],
									},
								},
							],
						},
					},
				},
				{
					id: "sheet-two",
					title: "Second sheet",
					rootTopic: {
						id: "root-two",
						title: "Second root",
					},
				},
			]),
		});

		expect(workbook).toMatchObject({
			format: "xmind",
			sourceName: "Roadmap.xmind",
			sheets: [
				{
					id: "sheet-one",
					title: "First sheet",
					root: {
						id: "root-one",
						text: "First root",
						children: [
							{
								id: "todo",
								text: "Todo",
								taskState: "unchecked",
								children: [
									{
										id: "done",
										text: "Done",
										taskState: "checked",
									},
								],
							},
						],
					},
				},
				{
					id: "sheet-two",
					root: {
						id: "root-two",
						text: "Second root",
						children: [],
					},
				},
			],
		});
		expect(workbook.diagnostics).toEqual([]);
	});

	it("reports unrepresentable modern features while retaining an otherwise clear task", () => {
		const workbook = parseXMind(
			{
				"content.json": JSON.stringify([
				{
					id: "sheet",
					title: "Map",
					theme: { id: "native-theme" },
					relationships: [{ id: "relationship" }],
					rootTopic: {
						id: "root",
						title: "Root",
						notes: { plain: { content: "A note" } },
						labels: ["Important"],
						markers: [
							{ markerId: "task-start" },
							{ markerId: "priority-1" },
						],
						image: { src: "xap:resources/image.png" },
						boundaries: [{ id: "boundary" }],
						summaries: [{ id: "summary" }],
						style: { properties: { "svg:fill": "#fff" } },
						children: {
							attached: [],
							detached: [{ id: "float", title: "Floating" }],
							summary: [{ id: "summary-topic", title: "Summary" }],
						},
					},
				},
				]),
			},
			{
				...DEFAULT_MIND_MAP_IMPORT_LIMITS,
				maximumTopics: 1,
			},
		);

		expect(workbook.sheets[0]?.root.taskState).toBe("unchecked");
		expect(workbook.sheets[0]?.root.children).toEqual([]);
		expect(workbook.diagnostics.map(({ code }) => code)).toEqual(
			expect.arrayContaining([
				"xmind-notes-omitted",
				"xmind-labels-omitted",
				"xmind-markers-omitted",
				"xmind-images-omitted",
				"xmind-relationships-omitted",
				"xmind-boundaries-omitted",
				"xmind-summaries-omitted",
				"xmind-detached-topics-omitted",
				"xmind-styles-omitted",
			]),
		);
	});

	it("imports the legacy XML family namespace-tolerantly and omits detached branches", () => {
		const workbook = parseXMind({
			"content.xml": [
				'<?xml version="1.0" encoding="UTF-8"?>',
				'<x:xmap-content xmlns:x="urn:xmind:xmap:xmlns:content:2.0">',
				'  <x:sheet id="legacy-sheet" theme="legacy-theme">',
				"    <x:title>Legacy map</x:title>",
				"    <x:relationships><x:relationship id=\"relationship\" /></x:relationships>",
				'    <x:topic id="legacy-root" structure-class="org.xmind.ui.logic.right">',
				"      <x:title>Legacy root</x:title>",
				"      <x:marker-refs><x:marker-ref marker-id=\"task-done\" /></x:marker-refs>",
				"      <x:children>",
				"        <x:topics type=\"attached\">",
				'          <x:topic id="legacy-child">',
				"            <x:title>Legacy child</x:title>",
				"            <x:marker-refs><x:marker-ref marker-id=\"task-start\" /></x:marker-refs>",
				"          </x:topic>",
				"        </x:topics>",
				"        <x:topics type=\"detached\">",
				'          <x:topic id="detached"><x:title>Detached</x:title></x:topic>',
				"        </x:topics>",
				"      </x:children>",
				"    </x:topic>",
				"  </x:sheet>",
				"</x:xmap-content>",
			].join("\n"),
			"styles.xml": "<styles />",
		});

		expect(workbook.sheets).toMatchObject([
			{
				id: "legacy-sheet",
				title: "Legacy map",
				root: {
					id: "legacy-root",
					text: "Legacy root",
					taskState: "checked",
					children: [
						{
							id: "legacy-child",
							text: "Legacy child",
							taskState: "unchecked",
						},
					],
				},
			},
		]);
		expect(workbook.diagnostics.map(({ code }) => code)).toEqual(
			expect.arrayContaining([
				"xmind-detached-topics-omitted",
				"xmind-relationships-omitted",
				"xmind-styles-omitted",
			]),
		);
	});

	it("rejects inspectable encrypted XMind manifest metadata", () => {
		expectImportError(
			() =>
				parseXMind({
					"content.json": JSON.stringify([
						{
							id: "sheet",
							title: "Map",
							rootTopic: { id: "root", title: "Root" },
						},
					]),
					"manifest.json": JSON.stringify({
						"file-entries": {
							"content.json": {
								"encryption-data": { algorithm: "AES" },
							},
						},
					}),
				}),
			"encrypted-archive",
		);
	});

	it("enforces topic and depth limits during iterative tree traversal", () => {
		const deeplyNestedRoot: Record<string, unknown> = {
			id: "root",
			title: "Root",
		};
		let current = deeplyNestedRoot;
		for (let index = 0; index < 4; index += 1) {
			const child: Record<string, unknown> = {
				id: `topic-${String(index)}`,
				title: `Topic ${String(index)}`,
			};
			current.children = { attached: [child] };
			current = child;
		}
		const content = JSON.stringify([
			{
				id: "sheet",
				title: "Map",
				rootTopic: deeplyNestedRoot,
			},
		]);

		expectImportError(
			() =>
				parseXMind(
					{ "content.json": content },
					{
						...DEFAULT_MIND_MAP_IMPORT_LIMITS,
						maximumTopics: 3,
					},
				),
			"limit-exceeded",
		);
		expectImportError(
			() =>
				parseXMind(
					{ "content.json": content },
					{
						...DEFAULT_MIND_MAP_IMPORT_LIMITS,
						maximumDepth: 2,
					},
				),
			"limit-exceeded",
		);
	});

	it("rejects unsafe legacy XML before attempting DOM traversal", () => {
		expectImportError(
			() =>
				parseXMind({
					"content.xml": [
						"<!DOCTYPE xmap-content [<!ENTITY xxe SYSTEM \"file:///secret\">]>",
						"<xmap-content><sheet><topic><title>&xxe;</title></topic></sheet></xmap-content>",
					].join("\n"),
				}),
			"unsafe-xml",
		);
	});
});
