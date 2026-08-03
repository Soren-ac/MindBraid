import { describe, expect, it, vi } from "vitest";

import { readAuthoritativeMarkdownContent } from "../src/core/source-content";

describe("readAuthoritativeMarkdownContent", () => {
	it("keeps a newer live editor buffer over a delayed stored snapshot", async () => {
		const readStored = vi.fn(async () => "# stale");
		await expect(
			readAuthoritativeMarkdownContent(
				() => "# New topic",
				readStored,
			),
		).resolves.toBe("# New topic");
		expect(readStored).not.toHaveBeenCalled();
	});

	it("reads stored content when the note has no open editor", async () => {
		const readStored = vi.fn(async () => "# External update");
		await expect(
			readAuthoritativeMarkdownContent(() => null, readStored),
		).resolves.toBe("# External update");
		expect(readStored).toHaveBeenCalledOnce();
	});
});
