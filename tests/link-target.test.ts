import { describe, expect, it } from "vitest";

import { isLocalMindMapLinkTarget } from "../src/core/link-target";

describe("mind-map link target policy", () => {
	it.each([
		"Notes/Plan.md",
		"Notes/Plan#Milestone",
		"../Sibling note",
		"#Current heading",
	])("accepts Vault-local target %s", (target) => {
		expect(isLocalMindMapLinkTarget(target)).toBe(true);
	});

	it.each([
		"",
		"   ",
		"https://example.com",
		"mailto:user@example.com",
		"obsidian://open?vault=Other",
		"data:text/plain,hello",
		"//example.com/path",
	])("rejects external or empty target %s", (target) => {
		expect(isLocalMindMapLinkTarget(target)).toBe(false);
	});
});
