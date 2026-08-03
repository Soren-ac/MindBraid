/**
 * Prefer the live editor buffer over the stored Vault snapshot.
 *
 * Obsidian can emit a delayed `vault.modify` echo while an editor still owns
 * newer unsaved text. Publishing that older disk content would temporarily
 * remove freshly created line-based node IDs and terminate their edit session.
 */
export async function readAuthoritativeMarkdownContent(
	readLiveEditor: () => string | null,
	readStoredContent: () => Promise<string>,
): Promise<string> {
	const liveContent = readLiveEditor();
	if (liveContent !== null) {
		return liveContent;
	}
	return readStoredContent();
}
