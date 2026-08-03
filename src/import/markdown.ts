import { encodeVisibleTextAsInlineMarkdown } from "../core/inline-markdown";
import {
	MindMapImportError,
	type ImportedMindMapSheet,
	type ImportedMindMapTopic,
	type ImportedMindMapWorkbook,
	type MindMapImportDiagnostic,
} from "./types";

export interface MindMapMarkdownImportPlan {
	readonly sheetId: string;
	readonly suggestedBasename: string;
	readonly content: string;
	readonly topicCount: number;
	readonly diagnostics: readonly MindMapImportDiagnostic[];
}

export function createMindMapMarkdownImportPlan(
	workbook: ImportedMindMapWorkbook,
	sheetId: string,
): MindMapMarkdownImportPlan {
	const sheet = workbook.sheets.find((candidate) => candidate.id === sheetId);
	if (sheet === undefined) {
		throw new MindMapImportError(
			"empty-workbook",
			`Imported workbook does not contain sheet "${sheetId}".`,
		);
	}
	const lines: string[] = [];
	let topicCount = 1;
	const pending: Array<{
		readonly topic: ImportedMindMapTopic;
		readonly depth: number;
	}> = [];
	for (let index = sheet.root.children.length - 1; index >= 0; index -= 1) {
		const topic = sheet.root.children[index];
		if (topic !== undefined) {
			pending.push({ topic, depth: 0 });
		}
	}
	while (pending.length > 0) {
		const current = pending.pop();
		if (current === undefined) {
			continue;
		}
		topicCount += 1;
		lines.push(renderImportedTopicLine(current.topic, current.depth));
		for (
			let index = current.topic.children.length - 1;
			index >= 0;
			index -= 1
		) {
			const child = current.topic.children[index];
			if (child !== undefined) {
				pending.push({ topic: child, depth: current.depth + 1 });
			}
		}
	}
	const diagnostics = workbook.diagnostics.filter(
		(diagnostic) =>
			diagnostic.sheetId === undefined || diagnostic.sheetId === sheet.id,
	);
	const suggestedBasename = sanitizeImportedBasename(
		sheet.root.text || sheet.title,
	);
	if (suggestedBasename !== sheet.root.text) {
		diagnostics.push({
			severity: "warning",
			code: "root-title-sanitized",
			message:
				"The central topic was adjusted to form a safe Markdown filename; review the destination name before importing.",
			sheetId: sheet.id,
			topicId: sheet.root.id,
		});
	}
	if (sheet.root.taskState !== null) {
		diagnostics.push({
			severity: "warning",
			code: "root-task-omitted",
			message:
				"The central topic task state is not represented because the central topic becomes the Markdown filename.",
			sheetId: sheet.id,
			topicId: sheet.root.id,
		});
	}
	return {
		sheetId: sheet.id,
		suggestedBasename,
		content: lines.length === 0 ? "" : `${lines.join("\n")}\n`,
		topicCount,
		diagnostics,
	};
}

export function sanitizeImportedBasename(value: string): string {
	const sanitized = value
		.normalize("NFC")
		.replace(/[\\/:*?"<>|#[\]^]/g, " ")
		.replace(/\p{Cc}/gu, " ")
		.replace(/\s+/g, " ")
		.replace(/[. ]+$/g, "")
		.trim();
	return sanitized.length === 0 ? "Imported mind map" : sanitized.slice(0, 180);
}

export function createUniqueImportedNotePath(
	parentPath: string,
	basename: string,
	exists: (path: string) => boolean,
): string {
	const safeBasename = sanitizeImportedBasename(basename);
	const prefix = parentPath.length === 0 ? "" : `${parentPath.replace(/\/$/, "")}/`;
	for (let index = 1; index <= 10_000; index += 1) {
		const suffix = index === 1 ? "" : ` ${String(index)}`;
		const path = `${prefix}${safeBasename}${suffix}.md`;
		if (!exists(path)) {
			return path;
		}
	}
	throw new Error("Could not find an available imported note path.");
}

export function countImportedTopics(sheet: ImportedMindMapSheet): number {
	let count = 0;
	const pending = [sheet.root];
	while (pending.length > 0) {
		const topic = pending.pop();
		if (topic === undefined) {
			continue;
		}
		count += 1;
		pending.push(...topic.children);
	}
	return count;
}

function renderImportedTopicLine(
	topic: ImportedMindMapTopic,
	depth: number,
): string {
	const taskMarker =
		topic.taskState === null
			? ""
			: topic.taskState === "checked"
				? "[x] "
				: "[ ] ";
	return `${"  ".repeat(depth)}- ${taskMarker}${encodeVisibleTextAsInlineMarkdown(topic.text)}`;
}
