// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
	BasicMindMapFrontend,
	type BasicMindMapExportServices,
} from "../src/ui/basic-frontend";
import {
	BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION,
	createBuiltInMindMapFrontendComposition,
	type BuiltInMindMapFrontendComposition,
} from "../src/application/composition/built-in-composition";
import type { MindMapExporterDependencies } from "../src/export/exporter";
import {
	MindMapExportEncoderRegistry,
	type MindMapExportEncoder,
} from "../src/export/registry";
import { MindMapExportSession } from "../src/export/session";
import type {
	MindMapExportArtifact,
	MindMapExportScene,
} from "../src/export/types";
import type {
	MindMapFrontendEvent,
	MindMapFrontendFrame,
} from "../src/ui/frontend";
import { parseMarkdown } from "../src/core/parser";
import {
	createDefaultMindMapInteractionState,
	createDefaultMindMapPresentation,
} from "../src/presentation/presentation";
import type {
	MindMapRenderer,
	MindMapRendererFactory,
} from "../src/ui/renderer";

const renderMindMap = vi.fn();
const captureExportScene = vi.fn();
const exportDocument = parseMarkdown("# Topic\n- Child", "Map.md", "Map");

const exportScene: MindMapExportScene = {
	sourcePath: "Map.md",
	sourceRevision: exportDocument.sourceRevision,
	presentationRevision: 1,
	scope: "visible-map",
	bounds: { x: 0, y: 0, width: 120, height: 80 },
	backgroundColor: "#ffffff",
	paperTexture: null,
	primitives: [],
	nodeShapes: [],
};

const renderer: MindMapRenderer = {
	mount: () => undefined,
	render: renderMindMap,
	captureExportScene,
	fitView: () => undefined,
	getViewport: () => null,
	setViewport: () => true,
	setViewActive: () => undefined,
	focusNode: () => false,
	beginNodeEdit: () => false,
	handleKeyboardGesture: () => false,
	destroy: () => undefined,
};

const rendererFactory: MindMapRendererFactory = {
	create: () => renderer,
};

function createIdleFrame(
	appearanceMode: MindMapFrontendFrame["appearanceMode"] = "system",
	colorScheme: MindMapFrontendFrame["colorScheme"] =
		appearanceMode === "light" ? "light" : "dark",
	language: MindMapFrontendFrame["language"] = "en",
): MindMapFrontendFrame {
	return {
		document: { status: "idle" },
		language,
		appearanceMode,
		colorScheme,
		presentation: createDefaultMindMapPresentation("left-to-right"),
		interaction: createDefaultMindMapInteractionState(),
		capabilities: BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities,
		topicCommandAvailability: {
			hasInternalClipboard: false,
			hasUndoEntry: false,
			hasRedoEntry: false,
		},
	};
}

function createReadyFrame(
	styleId: string,
	paletteId: string,
	colorScheme: MindMapFrontendFrame["colorScheme"] = "dark",
	fontFamilyId = "style-default",
	connectorWidthId = "style-default",
	composition: BuiltInMindMapFrontendComposition =
		BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION,
	language: MindMapFrontendFrame["language"] = "en",
): MindMapFrontendFrame {
	const document = exportDocument;
	const presentation = createDefaultMindMapPresentation("left-to-right");
	return {
		language,
		document: {
			status: "ready",
			source: {
				path: "Map.md",
				basename: "Map",
				name: "Map.md",
				extension: "md",
			},
			document,
		},
		appearanceMode: "system",
		colorScheme,
		presentation: {
			...presentation,
			theme: composition.themeComposition.compose(styleId, paletteId),
			formatting: composition.formatting.compose(
				fontFamilyId,
				connectorWidthId,
			),
		},
		interaction: createDefaultMindMapInteractionState(),
		capabilities: composition.capabilities,
		topicCommandAvailability: {
			hasInternalClipboard: false,
			hasUndoEntry: false,
			hasRedoEntry: false,
		},
	};
}

function createCustomLibraryComposition(
	options: {
		readonly styleLabel?: string;
		readonly styleRevision?: string;
		readonly paletteLabel?: string;
		readonly paletteRevision?: string;
	} = {},
): BuiltInMindMapFrontendComposition {
	const styleTemplate =
		BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition.styles.resolve(
			"colorful",
		);
	const paletteTemplate =
		BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition.palettes.resolve(
			"colorful",
		);
	return createBuiltInMindMapFrontendComposition(
		[
			{
				...styleTemplate,
				id: "custom-style-1",
				label: options.styleLabel ?? "Custom style",
				revision: options.styleRevision ?? "custom-style-test-v1",
			},
		],
		[
			{
				...paletteTemplate,
				id: "custom-palette-1",
				label: options.paletteLabel ?? "Custom colors",
				revision: options.paletteRevision ?? "custom-palette-test-v1",
			},
		],
	);
}

afterEach(() => {
	document.body.replaceChildren();
	renderMindMap.mockClear();
	captureExportScene.mockReset();
});

describe("BasicMindMapFrontend appearance control", () => {
	it("forwards active-leaf interaction ownership to the renderer", () => {
		const setViewActive = vi.fn();
		const keyboardRenderer: MindMapRenderer = {
			...renderer,
			setViewActive,
		};
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			{ create: () => keyboardRenderer },
			() => undefined,
		);
		frontend.mount(document.body);

		expect(
			frontend.execute({
				type: "set-view-active",
				active: false,
			}),
		).toBe(true);
		expect(setViewActive).toHaveBeenCalledWith(false);

		frontend.execute({
			type: "set-view-active",
			active: true,
		});
		expect(setViewActive).toHaveBeenLastCalledWith(true);
		frontend.destroy();
	});

	it("stays available globally, dispatches changes, and follows refreshed frames", async () => {
		const events: MindMapFrontendEvent[] = [];
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			rendererFactory,
			() => undefined,
		);
		const container = document.body;

		frontend.mount(container);
		frontend.update(createIdleFrame());

		const appearance = container.querySelector<HTMLSelectElement>(
			'[aria-label="Appearance for all ObMind views"]',
		);
		const layout = container.querySelector<HTMLSelectElement>(
			'[aria-label="Layout stored for this document"]',
		);
		expect(appearance).not.toBeNull();
		expect(
			Array.from(appearance?.options ?? [], (option) => [
				option.value,
				option.textContent,
			]),
		).toEqual([
			["system", "Follow Obsidian"],
			["light", "Light"],
			["dark", "Dark"],
		]);
		expect(appearance?.value).toBe("system");
		expect(appearance?.disabled).toBe(false);
		expect(layout?.disabled).toBe(true);

		if (appearance === null) {
			throw new Error("Expected the appearance toolbar control.");
		}
		appearance.value = "dark";
		appearance.dispatchEvent(new Event("change"));
		await vi.waitFor(() => {
			expect(events).toContainEqual({
				type: "change-appearance",
				appearanceMode: "dark",
			});
		});

		frontend.update(createIdleFrame("light"));
		expect(appearance.value).toBe("light");

		frontend.destroy();
		const eventCount = events.length;
		appearance.value = "dark";
		appearance.dispatchEvent(new Event("change"));
		await Promise.resolve();
		expect(events).toHaveLength(eventCount);
	});

	it("restores the authoritative frame value when persistence fails", async () => {
		const frontend = new BasicMindMapFrontend(
			() => Promise.reject(new Error("Save failed")),
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(createIdleFrame());
		const appearance = document.body.querySelector<HTMLSelectElement>(
			'[aria-label="Appearance for all ObMind views"]',
		);
		if (appearance === null) {
			throw new Error("Expected the appearance toolbar control.");
		}

		appearance.value = "dark";
		appearance.dispatchEvent(new Event("change"));

		await vi.waitFor(() => {
			expect(appearance.value).toBe("system");
		});
		frontend.destroy();
	});

	it("forwards the host-resolved color scheme to the renderer", () => {
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			rendererFactory,
			() => undefined,
		);
		const mindMap = parseMarkdown("# Topic", "Map.md", "Map");
		frontend.mount(document.body);
		frontend.update({
			document: {
				status: "ready",
				source: {
					path: "Map.md",
					basename: "Map",
					name: "Map.md",
					extension: "md",
				},
				document: mindMap,
			},
			language: "en",
			appearanceMode: "system",
			colorScheme: "light",
			presentation: createDefaultMindMapPresentation("left-to-right"),
			interaction: createDefaultMindMapInteractionState(),
			capabilities: BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities,
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		});

		expect(renderMindMap).toHaveBeenCalledWith(
			expect.objectContaining({ colorScheme: "light" }),
		);
		frontend.destroy();
	});
});

describe("BasicMindMapFrontend language control", () => {
	it("defaults to Chinese chrome, emits a language event, and hot-switches without recreating the renderer", async () => {
		const events: MindMapFrontendEvent[] = [];
		const createRenderer = vi.fn(() => renderer);
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			{ create: createRenderer },
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(createIdleFrame("system", "dark", "zh-CN"));

		expect(document.body.textContent).toContain("没有活动文件");
		expect(
			document.body.querySelector<HTMLInputElement>(
				".obmind-toolbar-search-input",
			)?.placeholder,
		).toBe("查找主题");
		const language = document.body.querySelector<HTMLSelectElement>(
			"select[data-obmind-language-select]",
		);
		if (language === null) {
			throw new Error("Expected the interface language selector.");
		}
		expect(language.getAttribute("aria-label")).toBe("ObMind 界面语言");
		expect(
			Array.from(language.options, (option) => [option.value, option.textContent]),
		).toEqual([
			["zh-CN", "简体中文"],
			["en", "English"],
		]);

		language.value = "en";
		language.dispatchEvent(new Event("change"));
		await vi.waitFor(() => {
			expect(events).toContainEqual({ type: "change-language", language: "en" });
		});

		frontend.update(createIdleFrame("system", "dark", "en"));
		expect(document.body.textContent).toContain("No active file");
		expect(
			document.body.querySelector<HTMLInputElement>(
				".obmind-toolbar-search-input",
			)?.placeholder,
		).toBe("Find topics");
		expect(createRenderer).toHaveBeenCalledTimes(1);
		frontend.destroy();
	});

	it("structures the sidebar as an accessible three-tab settings workspace", () => {
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(createIdleFrame("system", "light", "zh-CN"));

		const root = document.body.querySelector<HTMLElement>(
			".obmind-frontend",
		);
		const sidebar = document.body.querySelector<HTMLElement>(
			".obmind-sidebar",
		);
		const toggle = document.body.querySelector<HTMLButtonElement>(
			'button[aria-label="切换设置面板"]',
		);
		const close = document.body.querySelector<HTMLButtonElement>(
			'button[aria-label="关闭设置面板"]',
		);
		const tabs = Array.from(
			document.body.querySelectorAll<HTMLButtonElement>(
				".obmind-sidebar-tab",
			),
		);
		const appearancePanel = document.body.querySelector<HTMLElement>(
			'[data-obmind-sidebar-panel="appearance"]',
		);
		const topicPanel = document.body.querySelector<HTMLElement>(
			'[data-obmind-sidebar-panel="topic"]',
		);
		const layoutPanel = document.body.querySelector<HTMLElement>(
			'[data-obmind-sidebar-panel="layout"]',
		);
		if (
			root === null ||
			sidebar === null ||
			toggle === null ||
			close === null ||
			appearancePanel === null ||
			topicPanel === null ||
			layoutPanel === null
		) {
			throw new Error("Expected the structured settings sidebar.");
		}

		expect(
			document.body.querySelector(".obmind-sidebar-title")?.textContent,
		).toBe("思维导图设置");
		expect(tabs.map((tab) => tab.textContent)).toEqual([
			"外观",
			"主题",
			"布局",
		]);
		expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
		expect(appearancePanel.hidden).toBe(false);
		expect(topicPanel.hidden).toBe(true);
		expect(layoutPanel.hidden).toBe(true);
		expect(topicPanel.querySelector(".obmind-node-asset-grid")).not.toBeNull();
		expect(layoutPanel.querySelector(".obmind-layout-options")).not.toBeNull();
		expect(topicPanel.textContent).toContain("清除图标、标记和标签");
		expect(layoutPanel.textContent).toContain("聚焦已选分支");
		expect(layoutPanel.textContent).toContain("显示完整导图");

		toggle.click();
		expect(root.classList).toContain("obmind-sidebar-open");
		expect(sidebar.inert).toBe(false);
		tabs[1]?.click();
		expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
		expect(appearancePanel.hidden).toBe(true);
		expect(topicPanel.hidden).toBe(false);
		tabs[1]?.dispatchEvent(
			new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
		);
		expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
		expect(layoutPanel.hidden).toBe(false);

		frontend.update(createIdleFrame("system", "light", "en"));
		expect(
			document.body.querySelector(".obmind-sidebar-title")?.textContent,
		).toBe("Mind map settings");
		expect(tabs.map((tab) => tab.textContent)).toEqual([
			"Appearance",
			"Topic",
			"Layout",
		]);

		close.click();
		expect(root.classList).not.toContain("obmind-sidebar-open");
		expect(sidebar.inert).toBe(true);
		frontend.destroy();
	});

	it("localizes export chrome and aria labels from the active frame language", () => {
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(
			createReadyFrame(
				"colorful",
				"colorful",
				"dark",
				"style-default",
				"style-default",
				BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION,
				"zh-CN",
			),
		);

		const exportButton = document.body.querySelector<HTMLButtonElement>(
			".obmind-sidebar-export-button",
		);
		if (exportButton === null) {
			throw new Error("Expected the export button.");
		}
		expect(exportButton.getAttribute("aria-label")).toBe("导出此思维导图");
		exportButton.click();
		expect(document.body.querySelector(".obmind-export-title")?.textContent).toBe(
			"导出思维导图",
		);
		expect(
			document.body.querySelector(".obmind-export-tablist")?.getAttribute(
				"aria-label",
			),
		).toBe("导出格式");
		const dialog = document.body.querySelector<HTMLElement>(
			".obmind-export-dialog",
		);
		const fileName = document.body.querySelector<HTMLInputElement>(
			'[aria-label="导出文件名"]',
		);
		if (dialog === null || fileName === null) {
			throw new Error("Expected the localized export dialog.");
		}
		fileName.value = "保留的导出名称";

		frontend.update(
			createReadyFrame(
				"colorful",
				"colorful",
				"dark",
				"style-default",
				"style-default",
				BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION,
				"en",
			),
		);
		expect(document.body.querySelector(".obmind-export-dialog")).toBe(dialog);
		expect(document.body.querySelector(".obmind-export-title")?.textContent).toBe(
			"Export mind map",
		);
		expect(fileName.value).toBe("保留的导出名称");
		frontend.destroy();
	});

	it("does not expose an arbitrary English host error in the Chinese UI", async () => {
		const frontend = new BasicMindMapFrontend(
			() => Promise.reject(new Error("Save failed in host adapter")),
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(createIdleFrame("system", "dark", "zh-CN"));

		const appearance = document.body.querySelector<HTMLSelectElement>(
			'[aria-label="所有 ObMind 视图的外观"]',
		);
		if (appearance === null) {
			throw new Error("Expected the localized appearance control.");
		}
		appearance.value = "dark";
		appearance.dispatchEvent(new Event("change"));

		await vi.waitFor(() => {
			const status = document.body.querySelector<HTMLElement>(
				".obmind-status",
			);
			expect(status?.textContent).toBe("无法完成此思维导图操作。");
			expect(status?.title).toBe("未知渲染错误");
			expect(status?.textContent).not.toContain("Save failed");
			expect(status?.title).not.toContain("Save failed");
		});
		frontend.destroy();
	});
});

describe("BasicMindMapFrontend style and color-scheme presets", () => {
	it("renders independent previews and emits independent document changes", async () => {
		const events: MindMapFrontendEvent[] = [];
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(createReadyFrame("pencil-sketch", "cloud"));

		const styleButtons = Array.from(
			document.body.querySelectorAll<HTMLButtonElement>(
				"button[data-obmind-style-id]",
			),
		);
		const paletteButtons = Array.from(
			document.body.querySelectorAll<HTMLButtonElement>(
				"button[data-obmind-palette-id]",
			),
		);
		const fontFamily = document.body.querySelector<HTMLSelectElement>(
			'[aria-label="Global font stored for this document"]',
		);
		const connectorWidth = document.body.querySelector<HTMLSelectElement>(
			'[aria-label="Connector width stored for this document"]',
		);
		expect(styleButtons).toHaveLength(3);
		expect(paletteButtons).toHaveLength(5);
		expect(paletteButtons.map((button) => button.textContent)).toEqual([
			"Graphite",
			"Aurora",
			"Spectrum",
			"Morandi Mint",
			"Retro Autumn",
		]);
		expect(
			paletteButtons.map((button) => button.getAttribute("aria-label")),
		).toEqual([
			"Graphite color scheme",
			"Aurora color scheme",
			"Spectrum color scheme",
			"Morandi Mint color scheme",
			"Retro Autumn color scheme",
		]);
		expect(
			styleButtons.find(
				(button) => button.dataset.obmindStyleId === "pencil-sketch",
			)?.getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			paletteButtons.find(
				(button) => button.dataset.obmindPaletteId === "cloud",
			)?.getAttribute("aria-pressed"),
		).toBe("true");
		expect(styleButtons.every((button) => button.querySelector("svg") !== null)).toBe(
			true,
		);
		expect(
			paletteButtons.every((button) => button.querySelector("svg") !== null),
		).toBe(true);
		expect(fontFamily?.value).toBe("style-default");
		expect(fontFamily?.options.length).toBe(
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities.globalFonts.length,
		);
		expect(connectorWidth?.value).toBe("style-default");
		expect(connectorWidth?.options.length).toBe(
			BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities.connectorWidths.length,
		);

		styleButtons.find(
			(button) => button.dataset.obmindStyleId === "colorful",
		)?.click();
		paletteButtons.find(
			(button) => button.dataset.obmindPaletteId === "pencil-sketch",
		)?.click();
		paletteButtons.find(
			(button) => button.dataset.obmindPaletteId === "morandi-mint",
		)?.click();
		paletteButtons.find(
			(button) => button.dataset.obmindPaletteId === "retro-autumn",
		)?.click();
		if (fontFamily === null || connectorWidth === null) {
			throw new Error("Expected global formatting controls.");
		}
		fontFamily.value = "handwritten";
		fontFamily.dispatchEvent(new Event("change"));
		connectorWidth.value = "thick";
		connectorWidth.dispatchEvent(new Event("change"));

		await vi.waitFor(() => {
			expect(events).toContainEqual({
				type: "change-style",
				styleId: "colorful",
				scope: "document",
			});
			expect(events).toContainEqual({
				type: "change-palette",
				paletteId: "pencil-sketch",
				scope: "document",
			});
			expect(events).toContainEqual({
				type: "change-palette",
				paletteId: "morandi-mint",
				scope: "document",
			});
			expect(events).toContainEqual({
				type: "change-palette",
				paletteId: "retro-autumn",
				scope: "document",
			});
			expect(events).toContainEqual({
				type: "change-global-font",
				fontFamilyId: "handwritten",
				scope: "document",
			});
			expect(events).toContainEqual({
				type: "change-connector-width",
				connectorWidthId: "thick",
				scope: "document",
			});
		});

		frontend.update(
			createReadyFrame(
				"colorful",
				"pencil-sketch",
				"light",
				"handwritten",
				"thick",
			),
		);
		expect(
			document.body.querySelector<HTMLButtonElement>(
				'button[data-obmind-style-id="colorful"]',
			)?.getAttribute("aria-pressed"),
		).toBe("true");
		expect(fontFamily.value).toBe("handwritten");
		expect(connectorWidth.value).toBe("thick");
		expect(
			document.body.querySelector<HTMLButtonElement>(
				'button[data-obmind-palette-id="pencil-sketch"]',
			)?.getAttribute("aria-pressed"),
		).toBe("true");

		frontend.destroy();
	});

	it("refreshes visible preset names even when a capability revision is unchanged", () => {
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		const frame = createReadyFrame("colorful", "colorful");
		frontend.update(frame);

		const capabilities = {
			...frame.capabilities,
			styles: frame.capabilities.styles.map((capability) =>
				capability.id === "colorful"
					? { ...capability, label: "Updated style name" }
					: capability,
			),
			palettes: frame.capabilities.palettes.map((capability) =>
				capability.id === "colorful"
					? { ...capability, label: "Updated palette name" }
					: capability,
			),
		};
		frontend.update({ ...frame, capabilities });

		expect(
			document.body.querySelector<HTMLButtonElement>(
				'button[data-obmind-style-id="colorful"]',
			)?.textContent,
		).toBe("Updated style name");
		expect(
			document.body.querySelector<HTMLButtonElement>(
				'button[data-obmind-palette-id="colorful"]',
			)?.textContent,
		).toBe("Updated palette name");
		frontend.destroy();
	});

	it("keeps built-in library entries immutable and emits duplicate commands", async () => {
		const events: MindMapFrontendEvent[] = [];
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(createReadyFrame("colorful", "colorful"));

		const duplicateStyle = document.body.querySelector<HTMLButtonElement>(
			'button[data-obmind-library-kind="style"][data-obmind-library-action="duplicate"]',
		);
		const duplicatePalette = document.body.querySelector<HTMLButtonElement>(
			'button[data-obmind-library-kind="palette"][data-obmind-library-action="duplicate"]',
		);
		expect(duplicateStyle).not.toBeNull();
		expect(duplicatePalette).not.toBeNull();
		expect(
			document.body.querySelector(
				'[data-obmind-library-kind="style"][data-obmind-library-field]',
			),
		).toBeNull();
		expect(
			document.body.querySelector(
				'button[data-obmind-library-kind="style"][data-obmind-library-action="delete"]',
			),
		).toBeNull();

		duplicateStyle?.click();
		duplicatePalette?.click();
		await vi.waitFor(() => {
			expect(events).toContainEqual({
				type: "manage-presentation-library",
				command: {
					type: "duplicate-style",
					sourceStyleId: "colorful",
					label: "Copy of Colorful",
				},
			});
			expect(events).toContainEqual({
				type: "manage-presentation-library",
				command: {
					type: "duplicate-palette",
					sourcePaletteId: "colorful",
					label: "Copy of Spectrum",
				},
			});
		});
		frontend.destroy();
	});

	it("edits custom styles through color-free semantic definitions", async () => {
		const events: MindMapFrontendEvent[] = [];
		const composition = createCustomLibraryComposition();
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(
			createReadyFrame(
				"custom-style-1",
				"custom-palette-1",
				"dark",
				"style-default",
				"style-default",
				composition,
			),
		);

		const label = document.body.querySelector<HTMLInputElement>(
			'input[data-obmind-library-kind="style"][data-obmind-library-field="label"]',
		);
		if (label === null) {
			throw new Error("Expected an editable custom Style form.");
		}
		label.value = "Renamed style";
		label.dispatchEvent(new Event("change", { bubbles: true }));

		await vi.waitFor(() => {
			expect(
				events.some(
					(event) =>
						event.type === "manage-presentation-library" &&
						event.command.type === "update-style",
				),
			).toBe(true);
		});
		const update = events.find(
			(event) =>
				event.type === "manage-presentation-library" &&
				event.command.type === "update-style",
		);
		if (
			update?.type !== "manage-presentation-library" ||
			update.command.type !== "update-style"
		) {
			throw new Error("Expected an update-style command.");
		}
		expect(update.command.definition.label).toBe("Renamed style");
		expect(update.command.expectedRevision).toBe("custom-style-test-v1");
		expect(update.command.definition).toHaveProperty("tokens");
		expect(update.command.definition).not.toHaveProperty("colors");

		document.body
			.querySelector<HTMLButtonElement>(
				'button[data-obmind-library-kind="style"][data-obmind-library-action="delete"]',
			)
			?.click();
		await vi.waitFor(() => {
			expect(events).toContainEqual({
				type: "manage-presentation-library",
				command: {
					type: "delete-style",
					styleId: "custom-style-1",
					expectedRevision: "custom-style-test-v1",
				},
			});
		});
		frontend.destroy();
	});

	it("holds a custom Style editor until its current revision command settles", async () => {
		let settleCommand = (): void => {
			throw new Error("Expected the presentation-library command to start.");
		};
		const eventSink = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					settleCommand = resolve;
				}),
		);
		const frontend = new BasicMindMapFrontend(
			eventSink,
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(
			createReadyFrame(
				"custom-style-1",
				"custom-palette-1",
				"dark",
				"style-default",
				"style-default",
				createCustomLibraryComposition(),
			),
		);

		const label = document.body.querySelector<HTMLInputElement>(
			'input[data-obmind-library-kind="style"][data-obmind-library-field="label"]',
		);
		if (label === null) {
			throw new Error("Expected an editable custom Style form.");
		}
		label.value = "Saving style";
		label.dispatchEvent(new Event("change", { bubbles: true }));

		await vi.waitFor(() => {
			expect(eventSink).toHaveBeenCalledTimes(1);
		});
		expect(document.body.textContent).toContain("Saving this custom style");
		expect(
			document.body.querySelector(
				'button[data-obmind-library-kind="style"][data-obmind-library-action="delete"]',
			),
		).toBeNull();

		settleCommand();
		await vi.waitFor(() => {
			expect(
				document.body.querySelector<HTMLInputElement>(
					'input[data-obmind-library-kind="style"][data-obmind-library-field="label"]',
				),
			).not.toBeNull();
		});
		frontend.destroy();
	});

	it("edits custom palettes without leaking geometry and supports light overrides", async () => {
		const events: MindMapFrontendEvent[] = [];
		const composition = createCustomLibraryComposition();
		const frontend = new BasicMindMapFrontend(
			(event) => {
				events.push(event);
			},
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(
			createReadyFrame(
				"custom-style-1",
				"custom-palette-1",
				"light",
				"style-default",
				"style-default",
				composition,
			),
		);

		const lightToggle = document.body.querySelector<HTMLInputElement>(
			'input[data-obmind-library-kind="palette"][data-obmind-library-field="light-overrides-enabled"]',
		);
		if (lightToggle === null) {
			throw new Error("Expected an editable custom Palette form.");
		}
		lightToggle.checked = true;
		lightToggle.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => {
			expect(
				document.body.querySelector(
					'input[data-obmind-library-kind="palette"][data-obmind-library-target="light"]',
				),
			).not.toBeNull();
		});

		const lightCanvas = document.body.querySelector<HTMLInputElement>(
			'input[data-obmind-library-kind="palette"][data-obmind-library-field="core"][data-obmind-library-target="light"][data-obmind-library-color="canvas"]',
		);
		if (lightCanvas === null) {
			throw new Error("Expected a light-mode canvas color control.");
		}
		lightCanvas.value = "#123456";
		lightCanvas.dispatchEvent(new Event("change", { bubbles: true }));

		await vi.waitFor(() => {
			expect(
				events.filter(
					(event) =>
						event.type === "manage-presentation-library" &&
						event.command.type === "update-palette",
				),
			).toHaveLength(2);
		});
		const updates = events.filter(
			(event) =>
				event.type === "manage-presentation-library" &&
				event.command.type === "update-palette",
		);
		const update = updates.at(-1);
		if (
			update?.type !== "manage-presentation-library" ||
			update.command.type !== "update-palette"
		) {
			throw new Error("Expected an update-palette command.");
		}
		expect(update.command.definition).toHaveProperty("colors");
		expect(update.command.expectedRevision).toBe("custom-palette-test-v1");
		expect(update.command.definition).toHaveProperty(
			"lightColors.canvas",
			expect.objectContaining({ kind: "literal", value: "#123456" }),
		);
		expect(update.command.definition).not.toHaveProperty("tokens");

		document.body
			.querySelector<HTMLButtonElement>(
				'button[data-obmind-library-kind="palette"][data-obmind-library-action="delete"]',
			)
			?.click();
		await vi.waitFor(() => {
			expect(events).toContainEqual({
				type: "manage-presentation-library",
				command: {
					type: "delete-palette",
					paletteId: "custom-palette-1",
					expectedRevision: "custom-palette-test-v1",
				},
			});
		});
		frontend.destroy();
	});

	it("preserves a dirty Style draft across an authoritative revision change until it is explicitly reloaded", () => {
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(
			createReadyFrame(
				"custom-style-1",
				"custom-palette-1",
				"dark",
				"style-default",
				"style-default",
				createCustomLibraryComposition(),
			),
		);

		const label = document.body.querySelector<HTMLInputElement>(
			'input[data-obmind-library-kind="style"][data-obmind-library-field="label"]',
		);
		if (label === null) {
			throw new Error("Expected an editable custom Style form.");
		}
		label.value = "Older unsaved draft";
		label.dispatchEvent(new Event("input", { bubbles: true }));

		frontend.update(
			createReadyFrame(
				"custom-style-1",
				"custom-palette-1",
				"dark",
				"style-default",
				"style-default",
				createCustomLibraryComposition({
					styleLabel: "Saved in another view",
					styleRevision: "custom-style-test-v2",
				}),
			),
		);
		expect(
			frontend.execute({
				type: "presentation-library-conflict",
				conflict: {
					entryKind: "style",
					entryId: "custom-style-1",
					expectedRevision: "custom-style-test-v1",
					actualRevision: "custom-style-test-v2",
					reason: "revision-mismatch",
				},
			}),
		).toBe(true);
		expect(
			document.body.querySelector<HTMLInputElement>(
				'input[data-obmind-library-kind="style"][data-obmind-library-field="label"]',
			)?.value,
		).toBe("Older unsaved draft");
		expect(
			document.body.querySelector<HTMLInputElement>(
				'input[data-obmind-library-kind="style"][data-obmind-library-field="label"]',
			)?.disabled,
		).toBe(true);
		expect(document.body.textContent).toContain("local draft is preserved");
		expect(
			document.body.querySelector(".obmind-status")?.textContent,
		).toContain("local draft is preserved");

		document.body
			.querySelector<HTMLButtonElement>(
				'button[data-obmind-library-kind="style"][data-obmind-library-draft-conflict-action="reload"]',
			)
			?.click();
		expect(
			document.body.querySelector<HTMLInputElement>(
				'input[data-obmind-library-kind="style"][data-obmind-library-field="label"]',
			)?.value,
		).toBe("Saved in another view");
		expect(
			document.body.querySelector<HTMLInputElement>(
				'input[data-obmind-library-kind="style"][data-obmind-library-field="label"]',
			)?.disabled,
		).toBe(false);
		frontend.destroy();
	});

	it("preserves a dirty Palette draft across an authoritative revision change until it is explicitly reloaded", () => {
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(
			createReadyFrame(
				"custom-style-1",
				"custom-palette-1",
				"dark",
				"style-default",
				"style-default",
				createCustomLibraryComposition(),
			),
		);

		const label = document.body.querySelector<HTMLInputElement>(
			'input[data-obmind-library-kind="palette"][data-obmind-library-field="label"]',
		);
		if (label === null) {
			throw new Error("Expected an editable custom Palette form.");
		}
		label.value = "Older unsaved colors";
		label.dispatchEvent(new Event("input", { bubbles: true }));

		frontend.update(
			createReadyFrame(
				"custom-style-1",
				"custom-palette-1",
				"dark",
				"style-default",
				"style-default",
				createCustomLibraryComposition({
					paletteLabel: "Saved colors in another view",
					paletteRevision: "custom-palette-test-v2",
				}),
			),
		);

		expect(
			document.body.querySelector<HTMLInputElement>(
				'input[data-obmind-library-kind="palette"][data-obmind-library-field="label"]',
			)?.value,
		).toBe("Older unsaved colors");
		expect(
			document.body.querySelector<HTMLInputElement>(
				'input[data-obmind-library-kind="palette"][data-obmind-library-field="label"]',
			)?.disabled,
		).toBe(true);
		expect(document.body.textContent).toContain("local draft is preserved");

		document.body
			.querySelector<HTMLButtonElement>(
				'button[data-obmind-library-kind="palette"][data-obmind-library-draft-conflict-action="reload"]',
			)
			?.click();
		expect(
			document.body.querySelector<HTMLInputElement>(
				'input[data-obmind-library-kind="palette"][data-obmind-library-field="label"]',
			)?.value,
		).toBe("Saved colors in another view");
		frontend.destroy();
	});

	it("treats a matching newer library entry as acknowledgement of the local Style draft", () => {
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(
			createReadyFrame(
				"custom-style-1",
				"custom-palette-1",
				"dark",
				"style-default",
				"style-default",
				createCustomLibraryComposition(),
			),
		);

		const label = document.body.querySelector<HTMLInputElement>(
			'input[data-obmind-library-kind="style"][data-obmind-library-field="label"]',
		);
		if (label === null) {
			throw new Error("Expected an editable custom Style form.");
		}
		label.value = "Locally saved style";
		label.dispatchEvent(new Event("input", { bubbles: true }));

		frontend.update(
			createReadyFrame(
				"custom-style-1",
				"custom-palette-1",
				"dark",
				"style-default",
				"style-default",
				createCustomLibraryComposition({
					styleLabel: "Locally saved style",
					styleRevision: "custom-style-test-v2",
				}),
			),
		);

		expect(
			document.body.querySelector<HTMLInputElement>(
				'input[data-obmind-library-kind="style"][data-obmind-library-field="label"]',
			)?.disabled,
		).toBe(false);
		expect(
			document.body.querySelector(
				'[data-obmind-library-draft-conflict="true"]',
			),
		).toBeNull();
		frontend.destroy();
	});

	it("keeps preset controls disabled without an active Markdown document", () => {
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(createIdleFrame());

		for (const button of Array.from(
			document.body.querySelectorAll<HTMLButtonElement>(
				"button[data-obmind-style-id], button[data-obmind-palette-id]",
			),
		)) {
			expect(button.disabled).toBe(true);
		}
		expect(
			document.body.querySelector<HTMLSelectElement>(
				'[aria-label="Global font stored for this document"]',
			)?.disabled,
		).toBe(true);
		expect(
			document.body.querySelector<HTMLSelectElement>(
				'[aria-label="Connector width stored for this document"]',
			)?.disabled,
		).toBe(true);
		frontend.destroy();
	});

	it("repaints a palette change without fitting the viewport as if the style changed", () => {
		const fitView = vi.fn();
		const paletteRenderer: MindMapRenderer = {
			...renderer,
			fitView,
		};
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			{ create: () => paletteRenderer },
			() => undefined,
		);
		frontend.mount(document.body);

		const initial = createReadyFrame("pencil-sketch", "pencil-sketch");
		frontend.update(initial);
		fitView.mockClear();
		frontend.update({
			...initial,
			presentation: {
				...initial.presentation,
				revision: initial.presentation.revision + 1,
				theme:
					BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition.compose(
						"pencil-sketch",
						"colorful",
					),
			},
		});

		expect(fitView).not.toHaveBeenCalled();
		frontend.destroy();
	});
});

describe("BasicMindMapFrontend export workflow", () => {
	it("keeps the fixed sidebar export action disabled until a renderer has a ready Markdown document", () => {
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			rendererFactory,
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(createIdleFrame());

		const exportButton = document.body.querySelector<HTMLButtonElement>(
			'[aria-label="Export this mind map"]',
		);
		expect(exportButton).not.toBeNull();
		expect(exportButton?.disabled).toBe(true);
		expect(
			document.body.querySelector(".obmind-sidebar-footer"),
		).not.toBeNull();
		frontend.destroy();
	});

	it("renders accessible capability-backed format tabs and isolates each format's settings", async () => {
		const exportRenderer: MindMapRenderer = {
			...renderer,
			captureExportScene: async () => exportScene,
		};
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			{ create: () => exportRenderer },
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(createReadyFrame("colorful", "cloud"));
		document.body
			.querySelector<HTMLButtonElement>('[aria-label="Export this mind map"]')
			?.click();

		const tablist = document.body.querySelector(".obmind-export-tablist");
		const tabs = Array.from(
			document.body.querySelectorAll<HTMLButtonElement>(
				".obmind-export-tab",
			),
		);
		expect(tablist).not.toBeNull();
		expect(tabs.map((tab) => tab.textContent)).toEqual([
			"JPG",
			"PNG",
			"PDF",
			"SVG",
		]);
		expect(
			document.body.querySelector<HTMLInputElement>('[aria-label="Export file name"]')
				?.value,
		).toBe("Map");
		expect(
			document.body.querySelector<HTMLSelectElement>(
				'[aria-label="Mind map export scope"]',
			)?.value,
		).toBe("visible-map");

		const svgTab = tabs.find((tab) => tab.textContent === "SVG");
		svgTab?.click();
		const svgPanel = document.body.querySelector<HTMLElement>(
			".obmind-export-tabpanel:not([hidden])",
		);
		expect(svgTab?.getAttribute("aria-selected")).toBe("true");
		expect(svgPanel?.textContent).toContain("SVG settings");
		expect(
			svgPanel?.querySelector('[aria-label="SVG export DPI"]'),
		).toBeNull();
		expect(
			svgPanel?.querySelector('[aria-label="SVG export background"]'),
		).not.toBeNull();

		const jpgTab = tabs.find((tab) => tab.textContent === "JPG");
		jpgTab?.click();
		const jpgPanel = document.body.querySelector<HTMLElement>(
			".obmind-export-tabpanel:not([hidden])",
		);
		expect(jpgPanel?.textContent).toContain("JPG settings");
		expect(
			jpgPanel?.querySelector<HTMLInputElement>('[aria-label="JPG export DPI"]'),
		).not.toBeNull();
		expect(
			jpgPanel?.querySelector<HTMLInputElement>('[aria-label="JPG quality"]'),
		).not.toBeNull();
		expect(
			jpgPanel?.querySelector('[aria-label="JPG export background"]'),
		).toBeNull();

		const pngTab = tabs.find((tab) => tab.textContent === "PNG");
		pngTab?.click();
		const pngPanel = document.body.querySelector<HTMLElement>(
			".obmind-export-tabpanel:not([hidden])",
		);
		expect(
			pngPanel?.querySelector<HTMLInputElement>('[aria-label="PNG export DPI"]'),
		).not.toBeNull();
		expect(
			pngPanel?.querySelector('[aria-label="PNG export background"]'),
		).not.toBeNull();
		expect(pngPanel?.querySelector('[aria-label="PNG quality"]')).toBeNull();

		const pdfTab = tabs.find((tab) => tab.textContent === "PDF");
		pdfTab?.click();
		const pdfPanel = document.body.querySelector<HTMLElement>(
			".obmind-export-tabpanel:not([hidden])",
		);
		expect(pdfPanel?.textContent).toContain("PDF settings");
		expect(pdfPanel?.querySelector('[aria-label$="export DPI"]')).toBeNull();
		expect(pdfPanel?.querySelector('[aria-label$="quality"]')).toBeNull();

		await vi.waitFor(() => {
			expect(
				document.body.querySelector<HTMLButtonElement>(
					".obmind-export-button-primary",
				)?.disabled,
			).toBe(false);
		});
		frontend.destroy();
	});

	it("accepts a custom raster DPI, preserves the format-specific background, and reuses the preflight snapshot", async () => {
		const capture = vi.fn(async (): Promise<MindMapExportScene> => exportScene);
		const exportRenderer: MindMapRenderer = {
			...renderer,
			captureExportScene: capture,
		};
		const createArtifact = vi.fn(
			async (
				_scene: MindMapExportScene,
				options: import("../src/export/types").MindMapExportOptions,
			): Promise<MindMapExportArtifact> => ({
				format: options.format,
				fileName: "Map.png",
				mimeType: "image/png",
				bytes: new Uint8Array([1, 2, 3]),
				width: 120,
				height: 80,
				dpi: options.dpi ?? null,
			}),
		);
		const save = vi.fn(async () => undefined);
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			{ create: () => exportRenderer },
			() => undefined,
			{
				createDependencies: () => ({}) as MindMapExporterDependencies,
				createArtifact,
				createArtifactSink: () => ({ save }),
			},
		);
		frontend.mount(document.body);
		frontend.update(createReadyFrame("colorful", "cloud"));
		document.body
			.querySelector<HTMLButtonElement>('[aria-label="Export this mind map"]')
			?.click();

		document.body
			.querySelector<HTMLButtonElement>(".obmind-export-tab:first-child")
			?.click();
		const pngTab = Array.from(
			document.body.querySelectorAll<HTMLButtonElement>(
				".obmind-export-tab",
			),
		).find((tab) => tab.textContent === "PNG");
		pngTab?.click();
		const dpi = document.body.querySelector<HTMLInputElement>(
			'[aria-label="PNG export DPI"]',
		);
		const background = document.body.querySelector<HTMLSelectElement>(
			'[aria-label="PNG export background"]',
		);
		const form = document.body.querySelector<HTMLFormElement>(
			".obmind-export-form",
		);
		if (dpi === null || background === null || form === null) {
			throw new Error("Expected the PNG export settings.");
		}
		dpi.value = "277";
		dpi.dispatchEvent(new Event("input"));
		background.value = "transparent";
		background.dispatchEvent(new Event("change"));

		await vi.waitFor(() => {
			expect(
				document.body.querySelector<HTMLButtonElement>(
					".obmind-export-button-primary",
				)?.disabled,
			).toBe(false);
		});
		form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

		await vi.waitFor(() => {
			expect(createArtifact).toHaveBeenCalledTimes(1);
			expect(save).toHaveBeenCalledTimes(1);
		});
		expect(createArtifact.mock.calls[0]?.[1]).toMatchObject({
			format: "png",
			fileName: "Map",
			scope: "visible-map",
			background: "transparent",
			dpi: 277,
			padding: 32,
		});
		expect(capture).toHaveBeenCalledTimes(1);
		frontend.destroy();
	});

	it("uses the production dialog session to reuse serialized SVG after an encoder retry", async () => {
		const capture = vi.fn(async (): Promise<MindMapExportScene> => exportScene);
		const serialized: unknown[] = [];
		let attempt = 0;
		const encoder: MindMapExportEncoder = {
			capability: {
				format: "svg",
				label: "SVG",
				mimeType: "image/svg+xml",
				backgrounds: ["theme", "transparent"],
				dpi: null,
				jpegQuality: null,
			},
			encode: async (request) => {
				serialized.push(request.serializedSvg);
				attempt += 1;
				if (attempt === 1) {
					throw new Error("temporary encoder failure");
				}
				return {
					format: "svg",
					fileName: request.fileName,
					mimeType: "image/svg+xml",
					bytes: new Uint8Array([1]),
					width: request.serializedSvg.width,
					height: request.serializedSvg.height,
					dpi: null,
				};
			},
		};
		const dependencies: MindMapExporterDependencies = {
			limits: BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities.export.limits,
			rasterPort: {} as MindMapExporterDependencies["rasterPort"],
			pdfEncoder: {} as MindMapExporterDependencies["pdfEncoder"],
			registry: new MindMapExportEncoderRegistry([encoder]),
		};
		const save = vi.fn(async () => undefined);
		const services: BasicMindMapExportServices = {
			createDependencies: () => dependencies,
			createArtifact: async () => {
				throw new Error("The production session should own encoding.");
			},
			createArtifactSink: () => ({ save }),
			createSession: (options) => new MindMapExportSession(options),
		};
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			{
				create: () => ({
					...renderer,
					captureExportScene: capture,
				}),
			},
			() => undefined,
			services,
		);
		frontend.mount(document.body);
		frontend.update(createReadyFrame("colorful", "cloud"));
		document.body
			.querySelector<HTMLButtonElement>('[aria-label="Export this mind map"]')
			?.click();

		const form = document.body.querySelector<HTMLFormElement>(
			".obmind-export-form",
		);
		await vi.waitFor(() => {
			expect(
				document.body.querySelector<HTMLButtonElement>(
					".obmind-export-button-primary",
				)?.disabled,
			).toBe(false);
		});
		form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await vi.waitFor(() => {
			const message = document.body.querySelector(
				".obmind-export-status",
			)?.textContent;
			expect(message).toContain("The export failed unexpectedly.");
			expect(message).not.toContain("temporary encoder failure");
		});
		const fileName = document.body.querySelector<HTMLInputElement>(
			'[aria-label="Export file name"]',
		);
		if (fileName !== null) {
			fileName.value = "Map retry";
		}
		form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

		await vi.waitFor(() => {
			expect(save).toHaveBeenCalledTimes(1);
			expect(document.body.querySelector('[role="dialog"]')).toBeNull();
		});
		expect(capture).toHaveBeenCalledTimes(1);
		expect(serialized).toHaveLength(2);
		expect(serialized[1]).toBe(serialized[0]);
		frontend.destroy();
	});

	it("offers an explicit safe DPI action when a custom raster setting exceeds map limits", async () => {
		const oversizedScene: MindMapExportScene = {
			...exportScene,
			bounds: { x: 0, y: 0, width: 8192, height: 480 },
		};
		const exportRenderer: MindMapRenderer = {
			...renderer,
			captureExportScene: async () => oversizedScene,
		};
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			{ create: () => exportRenderer },
			() => undefined,
		);
		frontend.mount(document.body);
		frontend.update(createReadyFrame("colorful", "cloud"));
		document.body
			.querySelector<HTMLButtonElement>('[aria-label="Export this mind map"]')
			?.click();
		Array.from(
			document.body.querySelectorAll<HTMLButtonElement>(
				".obmind-export-tab",
			),
		)
			.find((tab) => tab.textContent === "PNG")
			?.click();

		const dpi = document.body.querySelector<HTMLInputElement>(
			'[aria-label="PNG export DPI"]',
		);
		if (dpi === null) {
			throw new Error("Expected a custom PNG DPI input.");
		}
		dpi.value = "600";
		dpi.dispatchEvent(new Event("input"));

		const safeDpi = document.body.querySelector<HTMLButtonElement>(
			".obmind-export-tabpanel:not([hidden]) .obmind-export-safe-dpi",
		);
		await vi.waitFor(() => {
			expect(safeDpi?.hidden).toBe(false);
			expect(safeDpi?.textContent).toMatch(/^Use safe \d+ DPI$/);
		});
		safeDpi?.click();
		await vi.waitFor(() => {
			expect(Number(dpi.value)).toBeLessThan(600);
			expect(
				document.body.querySelector<HTMLButtonElement>(
					".obmind-export-button-primary",
				)?.disabled,
			).toBe(false);
		});
		frontend.destroy();
	});

	it("shows encoder progress while an export is in flight", async () => {
		let resolveArtifact: (artifact: MindMapExportArtifact) => void = () => {
			throw new Error("The export artifact resolver is not ready.");
		};
		const exportRenderer: MindMapRenderer = {
			...renderer,
			captureExportScene: async () => exportScene,
		};
		const createArtifact = vi.fn(
			(
				_scene: MindMapExportScene,
				options: import("../src/export/types").MindMapExportOptions,
				_dependencies: MindMapExporterDependencies,
				context?: import("../src/export/types").MindMapExportExecutionContext,
			): Promise<MindMapExportArtifact> =>
				new Promise<MindMapExportArtifact>((resolve) => {
					context?.onProgress?.({ phase: "encode", state: "started" });
					resolveArtifact = () =>
						resolve({
							format: options.format,
							fileName: "Map.svg",
							mimeType: "image/svg+xml",
							bytes: new Uint8Array([1]),
							width: 120,
							height: 80,
							dpi: null,
						});
				}),
		);
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			{ create: () => exportRenderer },
			() => undefined,
			{
				createDependencies: () => ({}) as MindMapExporterDependencies,
				createArtifact,
				createArtifactSink: () => ({ save: async () => undefined }),
			},
		);
		frontend.mount(document.body);
		frontend.update(createReadyFrame("colorful", "cloud"));
		document.body
			.querySelector<HTMLButtonElement>('[aria-label="Export this mind map"]')
			?.click();
		await vi.waitFor(() => {
			expect(
				document.body.querySelector<HTMLButtonElement>(
					".obmind-export-button-primary",
				)?.disabled,
			).toBe(false);
		});
		document.body
			.querySelector<HTMLFormElement>(".obmind-export-form")
			?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

		await vi.waitFor(() => {
			expect(document.body.querySelector(".obmind-export-progress")?.textContent).toContain(
				"Encoding file",
			);
		});
		resolveArtifact({
			format: "svg",
			fileName: "Map.svg",
			mimeType: "image/svg+xml",
			bytes: new Uint8Array([1]),
			width: 120,
			height: 80,
			dpi: null,
		});
		await vi.waitFor(() => {
			expect(document.body.querySelector('[role="dialog"]')).toBeNull();
		});
		frontend.destroy();
	});

	it("does not save after close when an injected encoder ignores cancellation", async () => {
		let exportSignal: AbortSignal | undefined;
		let resolveArtifact: (artifact: MindMapExportArtifact) => void = () => {
			throw new Error("The export artifact resolver is not ready.");
		};
		const save = vi.fn(async () => undefined);
		const exportRenderer: MindMapRenderer = {
			...renderer,
			captureExportScene: async () => exportScene,
		};
		const frontend = new BasicMindMapFrontend(
			() => undefined,
			{ create: () => exportRenderer },
			() => undefined,
			{
				createDependencies: () => ({}) as MindMapExporterDependencies,
				createArtifact: (
					_scene,
					_options,
					_dependencies,
					context,
				) =>
					new Promise<MindMapExportArtifact>((resolve) => {
						exportSignal = context?.signal;
						resolveArtifact = resolve;
					}),
				createArtifactSink: () => ({ save }),
			},
		);
		frontend.mount(document.body);
		frontend.update(createReadyFrame("colorful", "cloud"));
		document.body
			.querySelector<HTMLButtonElement>('[aria-label="Export this mind map"]')
			?.click();
		await vi.waitFor(() => {
			expect(
				document.body.querySelector<HTMLButtonElement>(
					".obmind-export-button-primary",
				)?.disabled,
			).toBe(false);
		});
		document.body
			.querySelector<HTMLFormElement>(".obmind-export-form")
			?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

		await vi.waitFor(() => expect(exportSignal).toBeDefined());
		frontend.destroy();
		expect(exportSignal?.aborted).toBe(true);
		expect(document.body.querySelector('[role="dialog"]')).toBeNull();
		resolveArtifact({
			format: "svg",
			fileName: "Map.svg",
			mimeType: "image/svg+xml",
			bytes: new Uint8Array([1]),
			width: 120,
			height: 80,
			dpi: null,
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(save).not.toHaveBeenCalled();
	});
});
