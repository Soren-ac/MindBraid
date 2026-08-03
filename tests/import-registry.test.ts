// @vitest-environment happy-dom

import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { BUILT_IN_MIND_MAP_IMPORT_REGISTRY } from "../src/import/built-in";
import type { MindMapImportFormat } from "../src/import/types";

interface ArchiveFormatFixture {
	readonly format: MindMapImportFormat;
	readonly misleadingName: string;
	readonly entries: Readonly<Record<string, string>>;
}

const ARCHIVE_FORMAT_FIXTURES: readonly ArchiveFormatFixture[] = [
	{
		format: "xmind",
		misleadingName: "renamed-mindmanager.mmap",
		entries: {
			"content.json": JSON.stringify([
				{
					id: "sheet",
					title: "XMind sheet",
					rootTopic: { id: "root", title: "XMind root" },
				},
			]),
		},
	},
	{
		format: "mindmeister",
		misleadingName: "renamed-xmind.xmind",
		entries: {
			"map.json": JSON.stringify({
				id: "map",
				title: "MindMeister map",
				root: { id: "root", title: "MindMeister root" },
			}),
		},
	},
	{
		format: "mindmanager",
		misleadingName: "renamed-mindmeister.mind",
		entries: {
			"Document.xml":
				'<Map><OneTopic><Topic OId="root"><Text PlainText="MindManager root" /></Topic></OneTopic></Map>',
		},
	},
];

describe("built-in mind-map import registry", () => {
	for (const fixture of ARCHIVE_FORMAT_FIXTURES) {
		it(`recognizes ${fixture.format} from ZIP entries instead of ${fixture.misleadingName}`, () => {
			const input = {
				name: fixture.misleadingName,
				bytes: createArchive(fixture.entries),
			};

			expect(BUILT_IN_MIND_MAP_IMPORT_REGISTRY.resolve(input).id).toBe(
				fixture.format,
			);
			expect(BUILT_IN_MIND_MAP_IMPORT_REGISTRY.parse(input).format).toBe(
				fixture.format,
			);
		});
	}
});

function createArchive(entries: Readonly<Record<string, string>>): Uint8Array {
	const archiveEntries: Record<string, Uint8Array> = {};
	for (const [name, content] of Object.entries(entries)) {
		archiveEntries[name] = strToU8(content);
	}
	return zipSync(archiveEntries);
}
