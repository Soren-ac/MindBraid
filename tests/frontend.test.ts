import { describe, expect, it, vi } from "vitest";

import {
	getFailedMindMapEditRecovery,
} from "../src/ui/basic-frontend";
import {
	type MindMapFrontend,
	type MindMapFrontendCommand,
	type MindMapFrontendEvent,
	type MindMapFrontendFrame,
	resolveMindMapColorScheme,
	synchronizeMindMapViewActivity,
} from "../src/ui/frontend";
import { BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION } from "../src/application/composition/built-in-composition";
import { BUILT_IN_MIND_MAP_LAYOUT_ENGINE_REGISTRY } from "../src/layout/layouts";
import {
	createDefaultMindMapInteractionState,
	createDefaultMindMapPresentation,
} from "../src/presentation/presentation";
import { DOM_SVG_MIND_MAP_RENDERER_FACTORY } from "../src/ui/renderer";

const DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES =
	BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities;

class RecordingFrontend implements MindMapFrontend {
	public frame: MindMapFrontendFrame | null = null;
	public command: MindMapFrontendCommand | null = null;
	public destroyed = false;

	public mount(_container: HTMLElement): void {
		// The contract permits any DOM/SVG/Canvas implementation.
	}

	public update(frame: MindMapFrontendFrame): void {
		this.frame = frame;
	}

	public execute(command: MindMapFrontendCommand): boolean {
		this.command = command;
		return true;
	}

	public destroy(): void {
		this.destroyed = true;
	}
}

describe("frontend replacement contract", () => {
	it("assigns transient interaction ownership to only the active view", () => {
		const first = { setViewActive: vi.fn() };
		const second = { setViewActive: vi.fn() };

		synchronizeMindMapViewActivity([first, second], second);
		expect(first.setViewActive).toHaveBeenCalledWith(false);
		expect(second.setViewActive).toHaveBeenCalledWith(true);

		synchronizeMindMapViewActivity([first, second], null);
		expect(first.setViewActive).toHaveBeenLastCalledWith(false);
		expect(second.setViewActive).toHaveBeenLastCalledWith(false);
	});

	it("exposes only registered layout, appearance, and rendering capabilities", () => {
		expect(DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.defaultStyleId).toBe(
			"colorful",
		);
		expect(DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.defaultPaletteId).toBe(
			"colorful",
		);
		for (const layout of DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.layouts) {
			expect(() =>
				BUILT_IN_MIND_MAP_LAYOUT_ENGINE_REGISTRY.resolve(
					layout.engineId,
				),
			).not.toThrow();
		}
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.layouts[0]?.orientations,
		).toEqual([
			"left-to-right",
			"right-to-left",
			"top-to-bottom",
			"bottom-to-top",
		]);
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.layouts[0]
				?.defaultOrientations,
		).toEqual([
			"left-to-right",
			"right-to-left",
			"top-to-bottom",
			"bottom-to-top",
		]);
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.edgeRoutings,
		).toContain("rounded-orthogonal");
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.styles.map(
				(style) => style.id,
			),
		).toEqual([
			"pencil-sketch",
			"cloud",
			"colorful",
			"swiss-editorial",
			"atlas-cards",
			"technical-draft",
			"charcoal",
		]);
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.styles.map(
				({ id, origin, editable }) => ({ id, origin, editable }),
			),
		).toEqual([
			{ id: "pencil-sketch", origin: "built-in", editable: false },
			{ id: "cloud", origin: "built-in", editable: false },
			{ id: "colorful", origin: "built-in", editable: false },
			{ id: "swiss-editorial", origin: "built-in", editable: false },
			{ id: "atlas-cards", origin: "built-in", editable: false },
			{ id: "technical-draft", origin: "built-in", editable: false },
			{ id: "charcoal", origin: "built-in", editable: false },
		]);
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.palettes.map(
				(palette) => palette.id,
			),
		).toEqual([
			"pencil-sketch",
			"colorful",
			"morandi-mint",
			"retro-autumn",
			"coastal-ink",
			"deep-lagoon",
			"coral-tide",
		]);
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.palettes.map(
				({ id, origin, editable }) => ({ id, origin, editable }),
			),
		).toEqual([
			{ id: "pencil-sketch", origin: "built-in", editable: false },
			{ id: "colorful", origin: "built-in", editable: false },
			{ id: "morandi-mint", origin: "built-in", editable: false },
			{ id: "retro-autumn", origin: "built-in", editable: false },
			{ id: "coastal-ink", origin: "built-in", editable: false },
			{ id: "deep-lagoon", origin: "built-in", editable: false },
			{ id: "coral-tide", origin: "built-in", editable: false },
		]);
		expect(DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.defaultGlobalFontId).toBe(
			"style-default",
		);
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.globalFonts.map(
				(font) => font.id,
			),
		).toEqual([
			"style-default",
			"obsidian-interface",
			"obsidian-text",
			"monospace",
			"handwritten",
			"system-sans",
			"chinese-heiti-simplified",
			"chinese-heiti-traditional",
			"hiragino-sans-gb",
			"chinese-songti-simplified",
			"chinese-songti-traditional",
			"source-han-sans",
			"source-han-serif",
		]);
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.connectorWidths.map(
				(width) => width.id,
			),
		).toEqual([
			"style-default",
			"extra-thin",
			"thin",
			"medium",
			"thick",
			"extra-thick",
		]);
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.defaultConnectorProfileId,
		).toBe("style-default");
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.connectorProfiles.map(
				({ id, profile }) => ({ id, profile }),
			),
		).toEqual([
			{ id: "style-default", profile: null },
			{ id: "uniform", profile: { kind: "uniform" } },
			{
				id: "taper-to-child",
				profile: {
					kind: "taper-to-child",
					childWidthRatio: 0.35,
				},
			},
		]);
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.styles[0]
				?.requiredEffectIds,
		).toEqual([
			"paper-grain",
			"pencil-double",
			"pencil-hatch",
			"pencil-edge",
			"pencil-dot",
		]);
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.renderEffects,
		).toEqual(
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.effects.list(),
		);
		for (const style of DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.styles) {
			for (const effectId of style.requiredEffectIds) {
				expect(
					BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.effects.has(
						effectId,
					),
				).toBe(true);
			}
		}
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.editing,
		).toEqual({
			nodeKinds: ["root", "heading", "list"],
			rootBehavior: "rename-file",
			createChildFor: ["root", "heading", "list"],
			createSiblingFor: ["heading", "list"],
			multiline: true,
			textFormat: "plain-text",
		});
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.moving,
		).toEqual({
			movableNodeKinds: ["heading", "list"],
			placements: ["before", "after", "child"],
			siblingOrdering: "cross-parent-same-kind",
			childPlacement: "append",
			movesSubtree: true,
			rootAcceptsChildren: true,
			freePositioning: false,
			dropPreview: {
				states: ["none", "invalid", "valid"],
				destinationTopic: true,
				connector: true,
				siblingInsertionMarker: true,
				geometryResolver: "injectable",
			},
		});
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.contentLayout,
		).toEqual({
			strategyId: "adaptive-wrap",
			strategyRevision: 1,
			roleAware: true,
			adaptiveInlineSize: true,
			wrapsUnbrokenText: true,
			displayBlockOverflow: "grow",
			editorBlockOverflow: "grow-then-scroll",
		});
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.disclosure,
		).toEqual({
			trigger: "hover-focus",
			placement: "outgoing-connection",
			expandedIndicator: "dot",
			collapsedBadge: "total-hidden-descendants",
			orientations: [
				"left-to-right",
				"right-to-left",
				"top-to-bottom",
				"bottom-to-top",
			],
		});
		expect(
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION
				.contentLayoutStrategy.id,
		).toBe(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.contentLayout
				.strategyId,
		);
		expect(
			DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES.topicEditing,
		).toEqual({
			commands: [
				"copy",
				"cut",
				"delete-branch",
				"delete-single",
				"paste-child",
				"paste-sibling",
				"create-parent",
				"outdent",
				"undo",
				"redo",
			],
			supportsMultiSelection: true,
			supportsRangeSelection: true,
			supportsMarqueeSelection: true,
			keyboardNavigation: "orientation-aware",
			clipboard: {
				payloadVersion: 1,
				internalBranches: true,
				writesPlainMarkdownToSystem: true,
				readsExternalContent: false,
			},
			history: {
				scope: "plugin-session-per-document",
				limit: 100,
				documentLimit: 20,
				staleSourcePolicy: "reject",
			},
			stableIdentity: "metadata-free-conservative-locator",
		});
	});

	it("retains a submitted inline draft for host-failure recovery", () => {
		expect(
			getFailedMindMapEditRecovery({
				type: "edit-node-text",
				nodeId: "topic",
				expectedText: "Before",
				sourceSnapshot: {
					id: "topic",
					kind: "heading",
					text: "Before",
					source: {
						path: "Map.md",
						line: 0,
						ch: 0,
					},
					sourceRevision: "source:1",
					level: 1,
					sourceLine: "# Before",
				},
				text: "Unsaved draft",
			}),
		).toEqual({
			nodeId: "topic",
			text: "Unsaved draft",
		});
		expect(
			getFailedMindMapEditRecovery({
				type: "fit-view",
			}),
		).toBeNull();
	});

	it("lets a complete frontend consume data, presentation, and session separately", () => {
		const frontend = new RecordingFrontend();
		const frame: MindMapFrontendFrame = {
			document: { status: "idle" },
			language: "zh-CN",
			appearanceMode: "system",
			colorScheme: "dark",
			presentation:
				createDefaultMindMapPresentation("left-to-right"),
			interaction: createDefaultMindMapInteractionState(),
			capabilities: DEFAULT_MIND_MAP_FRONTEND_CAPABILITIES,
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
			presentationHistoryAvailability: {
				hasUndoEntry: false,
				hasRedoEntry: false,
				undoAction: null,
				redoAction: null,
			},
		};

		frontend.update(frame);
		frontend.execute({ type: "fit-view" });
		frontend.destroy();

		expect(frontend.frame).toBe(frame);
		expect(frontend.frame?.appearanceMode).toBe("system");
		expect(frontend.frame?.colorScheme).toBe("dark");
		expect(frontend.command).toEqual({ type: "fit-view" });
		expect(frontend.destroyed).toBe(true);
		expect("direction" in frame.document).toBe(false);
	});

	it("models appearance changes as a global frontend intent", () => {
		const event: MindMapFrontendEvent = {
			type: "change-appearance",
			appearanceMode: "dark",
		};

		expect(event).toEqual({
			type: "change-appearance",
			appearanceMode: "dark",
		});
	});

	it("resolves forced appearance independently from the host scheme", () => {
		expect(resolveMindMapColorScheme("system", "light")).toBe("light");
		expect(resolveMindMapColorScheme("system", "dark")).toBe("dark");
		expect(resolveMindMapColorScheme("light", "dark")).toBe("light");
		expect(resolveMindMapColorScheme("dark", "light")).toBe("dark");
	});

	it("creates the default renderer through a replaceable factory", () => {
		const renderer = DOM_SVG_MIND_MAP_RENDERER_FACTORY.create({
			interaction: () => undefined,
		});

		expect(renderer.getViewport()).toBeNull();
		expect(renderer.focusNode("missing")).toBe(false);
		expect(renderer.beginNodeEdit("missing")).toBe(false);
		renderer.destroy();
		expect(() => renderer.fitView()).not.toThrow();
	});
});
