import type { MindMapMarkdownImportPlan } from "./markdown";

export interface ImportedMarkdownNoteCreationPort<TNote> {
	exists(path: string): boolean;
	create(path: string, content: string): Promise<TNote>;
}

/**
 * The final, explicit import-commit boundary.
 *
 * Parsing and preview remain read-only. The Obsidian host supplies the only
 * concrete creation port, and this guard refuses invalid or already occupied
 * destinations before invoking it exactly once.
 */
export async function createImportedMarkdownNote<TNote>(
	plan: MindMapMarkdownImportPlan,
	destinationPath: string,
	port: ImportedMarkdownNoteCreationPort<TNote>,
): Promise<TNote> {
	assertSafeImportedMarkdownPath(destinationPath);
	if (port.exists(destinationPath)) {
		throw new Error("The import destination is no longer available.");
	}
	return port.create(destinationPath, plan.content);
}

function assertSafeImportedMarkdownPath(path: string): void {
	if (
		path.length === 0 ||
		!path.toLowerCase().endsWith(".md") ||
		path.startsWith("/") ||
		path.includes("\\") ||
		path.split("/").some((segment) => segment === "..")
	) {
		throw new Error("The import destination is invalid.");
	}
}
