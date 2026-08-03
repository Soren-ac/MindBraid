import { describe, expect, it } from "vitest";

import type { LayoutOrientation } from "../src/core/model";
import {
	DEFAULT_MIND_MAP_NODE_CONTENT_ROLE_PROFILES,
	constrainMindMapNodeIntrinsicInlineSize,
	createMindMapNodeContentLayoutStrategy,
	resolveMindMapBranchFlow,
	resolveMindMapNodeEditorBlockLayout,
	resolveMindMapNodeContentLayout,
	resolveMindMapNodeContentRole,
} from "../src/layout/node-content-layout";
import {
	createDefaultMindMapThemeSpec,
	type MindMapNodePresentation,
} from "../src/presentation/presentation";

function createContext(
	orientation: LayoutOrientation = "left-to-right",
	nodePresentation?: MindMapNodePresentation,
) {
	return {
		kind: "heading" as const,
		depth: 1,
		orientation,
		theme: createDefaultMindMapThemeSpec({
			tokens: {
				node: {
					maxWidth: 240,
				},
				roles: {
					mainTopic: {
						maxWidth: 320,
					},
				},
			},
		}),
		nodePresentation,
	};
}

describe("mind-map node content layout", () => {
	it("resolves semantic roles without adding presentation to source nodes", () => {
		expect(resolveMindMapNodeContentRole("root", 42)).toBe("root");
		expect(resolveMindMapNodeContentRole("heading", 1)).toBe(
			"main-topic",
		);
		expect(resolveMindMapNodeContentRole("list", 2)).toBe("subtopic");
		expect(resolveMindMapNodeContentRole("heading", Number.NaN)).toBe(
			"subtopic",
		);
	});

	it("uses node, role, theme, then strategy max-inline precedence", () => {
		const nodeOverride = resolveMindMapNodeContentLayout(
			createContext("left-to-right", {
				maxWidth: 410,
			}),
		);
		expect(nodeOverride.maxInlineSize).toBe(410);

		const roleOverride = resolveMindMapNodeContentLayout(
			createContext(),
		);
		expect(roleOverride.maxInlineSize).toBe(320);

		const themeFallback = resolveMindMapNodeContentLayout({
			...createContext(),
			depth: 2,
		});
		expect(themeFallback.maxInlineSize).toBe(240);

		const profileFallback = resolveMindMapNodeContentLayout({
			...createContext(),
			theme: createDefaultMindMapThemeSpec({
				tokens: {
					node: {
						maxWidth: Number.NaN,
					},
					roles: {
						mainTopic: {
							maxWidth: Number.POSITIVE_INFINITY,
						},
					},
				},
			}),
		});
		expect(profileFallback.maxInlineSize).toBe(
			DEFAULT_MIND_MAP_NODE_CONTENT_ROLE_PROFILES[
				"main-topic"
			].fallbackMaxInlineSize,
		);
	});

	it("keeps short nodes compact and wraps long unbroken CJK text", () => {
		const policy = resolveMindMapNodeContentLayout(createContext());

		expect(policy.text).toEqual({
			inlineSizing: "fit-content",
			whiteSpace: "pre-wrap",
			overflowWrap: "anywhere",
			wordBreak: "normal",
			textDirection: "auto",
			overflowInline: "visible",
			overflowBlock: "visible",
		});
		expect(
			constrainMindMapNodeIntrinsicInlineSize(12, policy),
		).toBe(policy.minInlineSize);
		expect(
			constrainMindMapNodeIntrinsicInlineSize(180, policy),
		).toBe(180);
		expect(
			constrainMindMapNodeIntrinsicInlineSize(2_000, policy),
		).toBe(policy.maxInlineSize);
	});

	it("grows the inline editor before enabling bounded vertical scrolling", () => {
		const root = resolveMindMapNodeContentLayout({
			...createContext(),
			kind: "root",
			depth: 0,
		});
		const subtopic = resolveMindMapNodeContentLayout({
			...createContext(),
			kind: "list",
			depth: 3,
		});

		expect(root.editor).toMatchObject({
			whiteSpace: "pre-wrap",
			overflowWrap: "anywhere",
			maxBlockSize: 240,
			overflowBlock: "auto",
			overflowInline: "hidden",
			resize: "none",
		});
		expect(subtopic.editor.maxBlockSize).toBe(192);
		expect(root.editor.maxBlockSize).toBeGreaterThan(
			subtopic.editor.maxBlockSize,
		);
		expect(resolveMindMapNodeEditorBlockLayout(118, 2, 192)).toEqual({
			blockSize: 120,
			scrollable: false,
		});
		expect(resolveMindMapNodeEditorBlockLayout(220, 2, 192)).toEqual({
			blockSize: 192,
			scrollable: true,
		});
	});

	it("does not create an incidental scrollbar for border pixels", () => {
		expect(resolveMindMapNodeEditorBlockLayout(100, 2, 102)).toEqual({
			blockSize: 102,
			scrollable: false,
		});
		expect(
			resolveMindMapNodeEditorBlockLayout(
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.NaN,
			),
		).toEqual({
			blockSize: 0,
			scrollable: false,
		});
	});

	it.each([
		["left-to-right", "x", 1],
		["right-to-left", "x", -1],
		["top-to-bottom", "y", 1],
		["bottom-to-top", "y", -1],
	] as const)(
		"supports %s without changing horizontal topic writing",
		(orientation, axis, sign) => {
			const policy = resolveMindMapNodeContentLayout(
				createContext(orientation),
			);

			expect(policy.orientation).toBe(orientation);
			expect(policy.branchFlow).toEqual({ axis, sign });
			expect(policy.text.textDirection).toBe("auto");
			expect(policy.text.inlineSizing).toBe("fit-content");
		},
	);

	it("lets a replacement strategy tune role constraints independently", () => {
		const strategy = createMindMapNodeContentLayoutStrategy({
			id: "compact-editor",
			revision: "compact-editor-v2",
			roles: {
				"main-topic": {
					minInlineSize: 120,
					fallbackMaxInlineSize: 500,
					editorMaxBlockSize: 160,
				},
			},
		});
		const policy = strategy.resolve({
			...createContext(),
			theme: createDefaultMindMapThemeSpec({
				tokens: {
					node: {
						maxWidth: Number.NaN,
					},
					roles: {
						mainTopic: {
							maxWidth: Number.NaN,
						},
					},
				},
			}),
		});

		expect(strategy.id).toBe("compact-editor");
		expect(strategy.revision).toBe("compact-editor-v2");
		expect(policy).toMatchObject({
			minInlineSize: 120,
			maxInlineSize: 500,
			editor: {
				maxBlockSize: 160,
			},
		});
	});

	it("honors adapter constraints and preserves min/max invariants", () => {
		const policy = resolveMindMapNodeContentLayout({
			...createContext(),
			constraints: {
				minInlineSize: 300,
				maxInlineSize: 120,
				editorMaxBlockSize: 96,
			},
		});

		expect(policy.minInlineSize).toBe(120);
		expect(policy.maxInlineSize).toBe(120);
		expect(policy.editor.maxBlockSize).toBe(96);
		expect(
			constrainMindMapNodeIntrinsicInlineSize(Number.NaN, {
				minInlineSize: -1,
				maxInlineSize: Number.POSITIVE_INFINITY,
			}),
		).toBe(0);
	});

	it("exposes the branch-flow mapper as a renderer-neutral primitive", () => {
		expect(resolveMindMapBranchFlow("right-to-left")).toEqual({
			axis: "x",
			sign: -1,
		});
		expect(resolveMindMapBranchFlow("bottom-to-top")).toEqual({
			axis: "y",
			sign: -1,
		});
	});
});
