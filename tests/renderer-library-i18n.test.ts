// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import {
	applyPresentationLibraryDraftConflict,
	createPaletteLibraryEditor,
	createStyleLibraryEditor,
} from "../src/ui/basic-presentation-library-editor";
import { BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION } from "../src/application/composition/built-in-composition";
import { parseMarkdown } from "../src/core/parser";
import {
	createMindMapPresentationLibraryPaletteDraft,
	createMindMapPresentationLibraryStyleDraft,
} from "../src/presentation/presentation-library-editor";
import {
	createDefaultMindMapInteractionState,
	createDefaultMindMapPresentation,
	type MindMapInteractionState,
} from "../src/presentation/presentation";
import {
	DomSvgMindMapRenderer,
	type MindMapRenderInput,
} from "../src/ui/renderer";

afterEach(() => {
	document.body.replaceChildren();
});

describe("renderer localization", () => {
	it("uses Chinese canvas, node, task, disclosure, and context-menu labels by default", () => {
		const mindMap = parseMarkdown(
			"# Parent\n- [ ] Task\n## Child",
			"Map.md",
			"Map",
		);
		const parent = mindMap.root.children[0];
		const task = parent?.children.find((node) => node.kind === "list");
		if (parent === undefined || task === undefined) {
			throw new Error("Expected a parent topic and a task topic.");
		}

		const container = createHtmlDiv();
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		renderer.render(createRenderInput(mindMap, "zh-CN"));

		const surface = container.querySelector<HTMLElement>(
			".obmind-renderer-surface",
		);
		const parentContent = getNodeContent(container, parent.id);
		const taskToggle = container.querySelector<HTMLButtonElement>(
			`[data-obmind-node-id="${task.id}"] .obmind-node-task-checkbox`,
		);
		const disclosure = container.querySelector<HTMLButtonElement>(
			`[data-obmind-node-id="${parent.id}"] .obmind-node-toggle`,
		);
		if (
			surface === null ||
			taskToggle === null ||
			disclosure === null
		) {
			throw new Error("Expected localized renderer controls.");
		}

		expect(surface.getAttribute("aria-label")).toBe("思维导图画布");
		expect(parentContent.title).toContain("单击选中");
		expect(parentContent.getAttribute("aria-label")).toContain(
			"选择主题",
		);
		expect(taskToggle.title).toBe("标记任务为完成");
		expect(taskToggle.getAttribute("aria-label")).toBe(
			"标记任务为完成：Task",
		);
		expect(disclosure.title).toBe("收起 Parent");
		expect(disclosure.getAttribute("aria-label")).toContain("收起 Parent");

		parentContent.dispatchEvent(
			new MouseEvent("contextmenu", {
				bubbles: true,
				cancelable: true,
				clientX: 24,
				clientY: 24,
			}),
		);
		const menu = container.querySelector<HTMLElement>(
			".obmind-node-context-menu",
		);
		expect(menu?.getAttribute("aria-label")).toBe("Parent 的操作");
		expect(menu?.classList).toContain("obmind-floating-panel");
		expect(menu?.textContent).toContain("编辑主题");
		expect(menu?.textContent).toContain("删除分支");
		expect(menu?.querySelectorAll('[role="separator"]')).toHaveLength(4);
		expect(
			menu
				?.querySelector<HTMLElement>(
					'[data-obmind-topic-command="delete-branch"]',
				)
				?.dataset.obmindContextTone,
		).toBe("danger");
		expect(
			menu
				?.querySelector<HTMLElement>(
					'[data-obmind-context-action="create-child"]',
				)
				?.dataset.obmindContextGroup,
		).toBe("structure");

		renderer.destroy();
	});

	it("switches renderer chrome to English without ending an active inline edit", () => {
		const mindMap = parseMarkdown("# Parent\n## Child", "Map.md", "Map");
		const parent = mindMap.root.children[0];
		if (parent === undefined) {
			throw new Error("Expected a parent topic.");
		}
		const container = createHtmlDiv();
		document.body.append(container);
		const renderer = new DomSvgMindMapRenderer({
			interaction: () => undefined,
		});
		renderer.mount(container);
		renderer.render(createRenderInput(mindMap, "zh-CN"));

		expect(renderer.beginNodeEdit(parent.id)).toBe(true);
		const editor = container.querySelector<HTMLTextAreaElement>(
			".obmind-node-editor",
		);
		if (editor === null) {
			throw new Error("Expected an active inline editor.");
		}
		editor.value = "Draft text";

		renderer.render(createRenderInput(mindMap, "en"));

		expect(container.querySelector(".obmind-node-editor")).toBe(editor);
		expect(editor.value).toBe("Draft text");
		expect(
			container.querySelector(".obmind-renderer-surface")?.getAttribute(
				"aria-label",
			),
		).toBe("Mind map canvas");
		expect(
			container.querySelector(
				`[data-obmind-node-id="${parent.id}"] .obmind-node-editor-accessible-label`,
			)?.textContent,
		).toBe("Edit Parent");

		renderer.destroy();
	});
});

describe("presentation library editor localization", () => {
	it("renders translated editor fields while keeping a user-authored library label literal", () => {
		const capabilities = BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.capabilities;
		const style = capabilities.styles[0];
		const palette = capabilities.palettes[0];
		if (style === undefined || palette === undefined) {
			throw new Error("Expected built-in presentation capabilities.");
		}
		const customStyle = {
			...style,
			label: "My literal style",
			origin: "user" as const,
			editable: true,
		};
		const chinese = createStyleLibraryEditor({
			ownerDocument: document,
			language: "zh-CN",
			capability: customStyle,
			draft: createMindMapPresentationLibraryStyleDraft(style.style),
			nodeShapes: capabilities.nodeShapes,
			edgeRoutings: capabilities.edgeRoutings,
			canDuplicate: true,
			canEdit: true,
			canDelete: true,
		});
		const english = createStyleLibraryEditor({
			ownerDocument: document,
			language: "en",
			capability: customStyle,
			draft: createMindMapPresentationLibraryStyleDraft(style.style),
			nodeShapes: capabilities.nodeShapes,
			edgeRoutings: capabilities.edgeRoutings,
			canDuplicate: true,
			canEdit: true,
			canDelete: true,
		});

		expect(
			chinese.querySelector<HTMLInputElement>(
				'[data-obmind-library-field="label"]',
			)?.getAttribute("aria-label"),
		).toBe("样式名称");
		expect(chinese.textContent).toContain("主题角色");
		expect(chinese.textContent).toContain("复制 My literal style");
		expect(
			chinese.querySelector<HTMLOptionElement>(
				'[data-obmind-library-field="role-shape"] option',
			)?.textContent,
		).toBe("圆角矩形");
		expect(
			english.querySelector<HTMLInputElement>(
				'[data-obmind-library-field="label"]',
			)?.getAttribute("aria-label"),
		).toBe("Style name");
		expect(english.textContent).toContain("Topic roles");
		expect(english.textContent).toContain("Duplicate My literal style");

		const paletteEditor = createPaletteLibraryEditor({
			ownerDocument: document,
			language: "en",
			capability: palette,
			draft: createMindMapPresentationLibraryPaletteDraft(palette.palette),
			colorHost: document.body,
			canDuplicate: true,
			canEdit: true,
			canDelete: false,
		});
		expect(paletteEditor.textContent).toContain("Base colors");
		expect(paletteEditor.textContent).toContain("Branch 1");
	});

	it("localizes retained draft-conflict recovery controls", () => {
		const editor = createHtmlDiv();
		applyPresentationLibraryDraftConflict(
			editor,
			{
				entryKind: "palette",
				entryId: "custom-palette",
				baseRevision: 1,
				authoritativeRevision: 2,
			},
			"zh-CN",
		);

		expect(editor.textContent).toContain("本地草稿");
		const reload = editor.querySelector<HTMLButtonElement>(
			'[data-obmind-library-draft-conflict-action="reload"]',
		);
		expect(reload?.textContent).toBe("重新加载最新版本（丢弃本地草稿）");
		expect(reload?.getAttribute("aria-label")).toBe(
			"重新加载修订版本 2 并丢弃本地草稿",
		);
	});
});

function createRenderInput(
	mindMap: ReturnType<typeof parseMarkdown>,
	language: MindMapRenderInput["language"],
	interaction: MindMapInteractionState = createDefaultMindMapInteractionState(),
): MindMapRenderInput {
	return {
		root: mindMap.root,
		sourceRevision: mindMap.sourceRevision,
		language,
		colorScheme: "dark",
		presentation: createDefaultMindMapPresentation("left-to-right"),
		interaction,
		topicCommandAvailability: {
			hasInternalClipboard: false,
			hasUndoEntry: false,
			hasRedoEntry: false,
		},
	};
}

function getNodeContent(
	container: HTMLElement,
	nodeId: string,
): HTMLButtonElement {
	const content = container.querySelector<HTMLButtonElement>(
		`[data-obmind-node-id="${nodeId}"] .obmind-node-content`,
	);
	if (content === null) {
		throw new Error(`Expected rendered content for ${nodeId}.`);
	}
	return content;
}

function createHtmlDiv(): HTMLDivElement {
	return document.createElementNS(
		"http://www.w3.org/1999/xhtml",
		"div",
	) as HTMLDivElement;
}
