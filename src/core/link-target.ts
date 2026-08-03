/**
 * ObMind link affordances intentionally open only Vault-local destinations.
 * Scheme-relative and URI-scheme targets could escape to a browser or another
 * application, so the Obsidian adapter must reject them before calling the
 * public workspace link resolver.
 */
export function isLocalMindMapLinkTarget(target: string): boolean {
	const value = target.trim();
	return (
		value.length > 0 &&
		!value.startsWith("//") &&
		!/^[a-z][a-z\d+.-]*:/i.test(value)
	);
}
