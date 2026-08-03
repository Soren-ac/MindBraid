// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { parseImportXml } from "../src/import/xml";
import { DEFAULT_MIND_MAP_IMPORT_LIMITS } from "../src/import/types";

describe("mind-map XML resource limits", () => {
	it("rejects excessive element count before DOM construction", () => {
		expect(() =>
			parseImportXml("<root><a/><b/></root>", {
				...DEFAULT_MIND_MAP_IMPORT_LIMITS,
				maximumXmlElements: 2,
			}),
		).toThrow(/element limit/i);
	});

	it("rejects excessive element depth and attributes", () => {
		expect(() =>
			parseImportXml("<root><a><b/></a></root>", {
				...DEFAULT_MIND_MAP_IMPORT_LIMITS,
				maximumXmlDepth: 1,
			}),
		).toThrow(/element-depth limit/i);
		expect(() =>
			parseImportXml('<root a="1" b="2"/>', {
				...DEFAULT_MIND_MAP_IMPORT_LIMITS,
				maximumXmlAttributes: 1,
			}),
		).toThrow(/attribute limit/i);
	});

	it("does not count markup-looking comment or quoted attribute text", () => {
		const document = parseImportXml(
			'<root value="> fake"><!-- <fake/> --></root>',
			{
				...DEFAULT_MIND_MAP_IMPORT_LIMITS,
				maximumXmlElements: 1,
				maximumXmlAttributes: 1,
			},
		);

		expect(document.documentElement.localName).toBe("root");
	});
});
