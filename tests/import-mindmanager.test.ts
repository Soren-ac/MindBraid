// @vitest-environment happy-dom

import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
	MINDMANAGER_IMPORT_ADAPTER,
	parseMindManagerImport,
} from "../src/import/mindmanager";
import { DEFAULT_MIND_MAP_IMPORT_LIMITS } from "../src/import/types";

describe("MindManager import", () => {
	it("parses namespaced Document.xml topic trees", () => {
		const input = createMmapInput(`<?xml version="1.0" encoding="UTF-8"?>
			<ap:Map xmlns:ap="http://schemas.mindjet.com/MindManager/Application/2003">
				<ap:OneTopic>
					<ap:Topic OId="root">
						<ap:Text PlainText="Project" />
						<ap:SubTopics>
							<ap:Topic OId="a">
								<ap:Text PlainText="Research" />
								<ap:SubTopics>
									<ap:Topic OId="a1"><ap:Text PlainText="Interviews" /></ap:Topic>
								</ap:SubTopics>
							</ap:Topic>
							<ap:Topic OId="b" TaskComplete="true"><ap:Text PlainText="Delivery" /></ap:Topic>
						</ap:SubTopics>
					</ap:Topic>
				</ap:OneTopic>
			</ap:Map>`);

		const workbook = parseMindManagerImport(input);

		expect(MINDMANAGER_IMPORT_ADAPTER.sniff(input)).toBe(100);
		expect(workbook.sheets[0]?.root).toMatchObject({
			id: "root",
			text: "Project",
			children: [
				{ text: "Research", children: [{ text: "Interviews" }] },
				{ text: "Delivery", taskState: "checked" },
			],
		});
	});

	it("reports unsupported rich elements", () => {
		const workbook = parseMindManagerImport(
			createMmapInput(`<Map><OneTopic><Topic OId="root">
				<Text PlainText="Map"/><NotesData>note</NotesData>
			</Topic></OneTopic></Map>`),
		);

		expect(workbook.diagnostics).toContainEqual(
			expect.objectContaining({ code: "mindmanager-presentation-omitted" }),
		);
	});

	it("rejects unsafe XML and depth limits", () => {
		expect(() =>
			parseMindManagerImport(
				createMmapInput('<!DOCTYPE x [<!ENTITY y "bad">]><Map/>'),
			),
		).toThrow(/prohibited/i);
		expect(() =>
			parseMindManagerImport(
				createMmapInput(`<Map><OneTopic><Topic><Text PlainText="Root"/>
					<SubTopics><Topic><Text PlainText="A"/><SubTopics>
						<Topic><Text PlainText="B"/></Topic>
					</SubTopics></Topic></SubTopics>
				</Topic></OneTopic></Map>`),
				{ ...DEFAULT_MIND_MAP_IMPORT_LIMITS, maximumDepth: 1 },
			),
		).toThrow(/depth/i);
	});

	it("imports deeply nested topics without recursive call-stack growth", () => {
		let topicXml = '<Topic OId="leaf"><Text PlainText="Leaf"/></Topic>';
		for (let depth = 0; depth < 2_000; depth += 1) {
			topicXml = `<Topic OId="topic-${String(depth)}"><Text PlainText="Topic ${String(depth)}"/><SubTopics>${topicXml}</SubTopics></Topic>`;
		}
		const workbook = parseMindManagerImport(
			createMmapInput(`<Map><OneTopic>${topicXml}</OneTopic></Map>`),
			{
				...DEFAULT_MIND_MAP_IMPORT_LIMITS,
				maximumDepth: 2_001,
				maximumTopics: 2_001,
				maximumXmlDepth: 4_100,
			},
		);

		let topicCount = 0;
		const pending = [workbook.sheets[0]!.root];
		while (pending.length > 0) {
			const topic = pending.pop();
			if (topic === undefined) {
				continue;
			}
			topicCount += 1;
			pending.push(...topic.children);
		}
		expect(topicCount).toBe(2_001);
	});
});

function createMmapInput(xml: string) {
	return {
		name: "example.mmap",
		bytes: zipSync({ "Document.xml": strToU8(xml) }),
	};
}
