/**
 * Product copy owned by the Obsidian host adapters.  Core, renderer, and
 * replaceable frontend copy deliberately live in their own catalogs so an
 * adapter can be tested without loading Obsidian.
 */
export const OBMIND_OBSIDIAN_EN_MESSAGES = {
	"command.open-current-note": "Open mind map for current note",
	"command.import-file": "Import mind-map file",
	"ribbon.open-current-note": "Open mind map for current note",

	"settings.appearance.name": "Appearance",
	"settings.appearance.description":
		"Follow the app or force light or dark colors inside mind-map views.",
	"settings.default-layout.name": "Default layout",
	"settings.default-layout.description":
		"Choose the layout engine used by newly opened mind maps.",
	"settings.layout-direction.name": "Layout direction",
	"settings.layout-direction.description":
		"Choose how mind-map branches flow from the document root.",
	"settings.spacing.level.name": "Level spacing",
	"settings.spacing.level.description":
		"Space between parent and child topic levels.",
	"settings.spacing.sibling.name": "Sibling spacing",
	"settings.spacing.sibling.description":
		"Space between adjacent topics under the same parent.",
	"settings.spacing.subtree.name": "Subtree spacing",
	"settings.spacing.subtree.description":
		"Additional separation between neighboring topic branches.",
	"settings.spacing.pixels": "{value} px",
	"settings.default-style.name": "Default style",
	"settings.default-style.description":
		"Choose topic shapes, typography, lines, and visual treatment.",
	"settings.default-palette.name": "Default color scheme",
	"settings.default-palette.description":
		"Choose colors independently from the mind-map style.",

	"notice.persistence-failed": "Could not save mind-map presentation data.",
	"notice.source-unavailable": "The source note is no longer available.",
	"notice.link-unavailable": "Only local Markdown and wikilinks can be opened in ObMind.",
	"notice.source-open-failed":
		"Could not open the source note in the Markdown editor.",
	"notice.import-already-open": "A mind-map import is already open.",
	"notice.import-file-too-large":
		"Could not read mind-map file: the selected file exceeds the {limit} byte import limit.",
	"notice.import-file-read-failed": "Could not read mind-map file.",
	"notice.import-commit-in-progress":
		"Another mind-map import is already being committed.",
	"notice.import-open-view-failed":
		"Imported {count} topics to {path}, but the new view could not be opened.",
	"notice.import-complete": "Imported {count} topics to {path}.",
	"notice.clipboard-required": "Copy or cut a topic before pasting.",
	"notice.undo-unavailable":
		"There is no applicable ObMind source edit to undo.",
	"notice.redo-unavailable":
		"There is no applicable ObMind source edit to redo.",
	"history.toggle-branch": "Toggle branch",
	"history.reveal-topic": "Reveal topic",
	"history.expand-all": "Expand all branches",
	"history.collapse-all": "Collapse all branches",
	"history.complete-task": "Complete task",
	"history.reopen-task": "Reopen task",
	"history.edit-topic": "Edit topic",
	"history.add-child-topic": "Add child topic",
	"history.add-sibling-topic": "Add sibling topic",
	"history.move-topic": "Move topic",
	"history.cut-topic": "Cut topic",
	"history.delete-branch": "Delete branch",
	"history.delete-topic": "Delete topic",
	"history.paste-topic": "Paste topic",
	"history.insert-parent-topic": "Insert parent topic",
	"history.outdent-topic": "Outdent topic",
	"history.replace-presentation": "Replace mind-map presentation",
	"history.create-custom-style": "Create custom mind-map style",
	"history.create-custom-palette": "Create custom mind-map color scheme",
	"history.change-presentation": "Change mind-map presentation",
	"history.change-viewport": "Change mind-map viewport",
	"import.default-destination-name": "Imported mind map.md",

	"import.file-picker.aria-label": "Choose a mind-map file to import",
	"import.file-picker.title": "Choose a mind-map file to import",
	"import-modal.title": "Import mind map",
	"import-modal.no-sheets":
		"Cannot preview an imported workbook without sheets.",
	"import-modal.sheet.name": "Sheet",
	"import-modal.sheet.description":
		"Choose the map to convert into one Markdown note.",
	"import-modal.sheet.aria-label": "Mind-map sheet",
	"import-modal.note-name.name": "Note name",
	"import-modal.note-name.description":
		"The source file is never modified; import creates a new note.",
	"import-modal.note-name.aria-label": "Imported note name",
	"import-modal.cancel.aria-label": "Cancel mind-map import",
	"import-modal.cancel.title": "Cancel mind-map import",
	"import-modal.confirm.aria-label": "Import mind map",
	"import-modal.confirm.title": "Import mind map",
	"import-modal.central-topic": "Central topic: {topic}",
	"import-modal.topics-found":
		"{count} topics found. The central topic becomes the note name; {attachedCount} attached topics become nested Markdown lists.",
	"import-modal.destination": "Destination: {path}",
	"import-modal.no-losses":
		"Topic text and hierarchy can be imported without known losses.",
	"import-modal.not-preserved": "Not preserved",
	"import-modal.import": "Import",
	"import-modal.importing": "Importing...",
	"import-modal.import-failed": "Could not import mind map.",
	"import-modal.import-failed-with-reason":
		"Could not import mind map: {message}",

	"import-error.unsupported-format":
		"The selected file is not a supported mind-map format.",
	"import-error.invalid-archive": "The selected mind-map archive is invalid.",
	"import-error.encrypted-archive":
		"Password-protected mind-map archives are not supported.",
	"import-error.unsafe-archive-path":
		"The selected archive contains an unsafe entry path.",
	"import-error.duplicate-archive-entry":
		"The selected archive contains duplicate entries.",
	"import-error.unsupported-compression":
		"The selected archive uses an unsupported compression method.",
	"import-error.missing-content":
		"The selected mind-map file does not contain readable map content.",
	"import-error.invalid-json": "The selected mind-map JSON is invalid.",
	"import-error.invalid-xml": "The selected mind-map XML is invalid.",
	"import-error.unsafe-xml": "The selected mind-map XML is unsafe.",
	"import-error.limit-exceeded":
		"The selected mind-map file exceeds an import safety limit.",
	"import-error.empty-workbook":
		"The selected mind-map file does not contain an importable map.",

	"import-diagnostic.root-title-sanitized":
		"The central topic was adjusted to form a safe Markdown filename; review the destination name before importing.",
	"import-diagnostic.root-task-omitted":
		"The central topic task state is not represented because the central topic becomes the Markdown filename.",
	"import-diagnostic.mindmeister-presentation-omitted":
		"MindMeister notes, links, media, positions, and visual styling are not imported yet.",
	"import-diagnostic.mindmanager-presentation-omitted":
		"MindManager notes, links, media, relationships, callouts, and visual styling are not imported yet.",
	"import-diagnostic.xmind-styles-omitted":
		"XMind styles, themes, and layout choices were not imported.",
	"import-diagnostic.xmind-detached-topics-omitted":
		"Detached XMind topics were not imported because Markdown has no equivalent tree relationship.",
	"import-diagnostic.xmind-summaries-omitted":
		"XMind summary topics were not imported because summaries are not yet rendered by ObMind.",
	"import-diagnostic.xmind-relationships-omitted":
		"XMind relationships were not imported because relationship rendering is not yet available.",
	"import-diagnostic.xmind-notes-omitted":
		"XMind topic notes were not imported because Markdown topic bodies are not represented by ObMind's tree model.",
	"import-diagnostic.xmind-labels-omitted": "XMind topic labels were not imported.",
	"import-diagnostic.xmind-images-omitted":
		"XMind topic images and attachments were not imported.",
	"import-diagnostic.xmind-boundaries-omitted":
		"XMind boundaries were not imported because boundary rendering is not yet available.",
	"import-diagnostic.xmind-markers-omitted":
		"Only an unambiguous XMind task-start or task-done marker can be preserved; other markers were omitted.",
	"import-diagnostic.xmind-manifest-unreadable":
		"The optional XMind manifest could not be inspected for encryption metadata.",
	"import-diagnostic.unknown":
		"Some source-map content may not be preserved by this importer.",
} as const;

export const OBMIND_OBSIDIAN_ZH_CN_MESSAGES = {
	"command.open-current-note": "为当前笔记打开思维导图",
	"command.import-file": "导入思维导图文件",
	"ribbon.open-current-note": "为当前笔记打开思维导图",

	"settings.appearance.name": "外观",
	"settings.appearance.description":
		"跟随 Obsidian，或在思维导图视图中强制使用浅色或深色色彩。",
	"settings.default-layout.name": "默认布局",
	"settings.default-layout.description": "选择新打开思维导图使用的布局引擎。",
	"settings.layout-direction.name": "布局方向",
	"settings.layout-direction.description": "选择分支从文档根节点延伸的方向。",
	"settings.spacing.level.name": "层级间距",
	"settings.spacing.level.description": "父节点与子节点层级之间的间距。",
	"settings.spacing.sibling.name": "同级间距",
	"settings.spacing.sibling.description": "同一父节点下相邻主题之间的间距。",
	"settings.spacing.subtree.name": "子树间距",
	"settings.spacing.subtree.description": "相邻主题分支之间的额外间距。",
	"settings.spacing.pixels": "{value} 像素",
	"settings.default-style.name": "默认样式",
	"settings.default-style.description": "选择主题形状、字体、连线和视觉处理方式。",
	"settings.default-palette.name": "默认配色",
	"settings.default-palette.description": "独立于思维导图样式选择颜色。",

	"notice.persistence-failed": "无法保存思维导图展示数据。",
	"notice.source-unavailable": "源笔记已不可用。",
	"notice.link-unavailable": "ObMind 仅打开本地 Markdown 链接和双链。",
	"notice.source-open-failed": "无法在 Markdown 编辑器中打开源笔记。",
	"notice.import-already-open": "已有一个思维导图导入流程正在进行。",
	"notice.import-file-too-large":
		"无法读取思维导图文件：所选文件超过 {limit} 字节的导入限制。",
	"notice.import-file-read-failed": "无法读取思维导图文件。",
	"notice.import-commit-in-progress": "另一个思维导图导入正在写入。",
	"notice.import-open-view-failed":
		"已将 {count} 个主题导入到 {path}，但无法打开新视图。",
	"notice.import-complete": "已将 {count} 个主题导入到 {path}。",
	"notice.clipboard-required": "请先复制或剪切一个主题，再进行粘贴。",
	"notice.undo-unavailable": "没有可撤销的 ObMind 源文件编辑。",
	"notice.redo-unavailable": "没有可重做的 ObMind 源文件编辑。",
	"history.toggle-branch": "切换分支折叠状态",
	"history.reveal-topic": "显示主题",
	"history.expand-all": "展开所有分支",
	"history.collapse-all": "折叠所有分支",
	"history.complete-task": "完成任务",
	"history.reopen-task": "重新打开任务",
	"history.edit-topic": "编辑主题",
	"history.add-child-topic": "添加子主题",
	"history.add-sibling-topic": "添加同级主题",
	"history.move-topic": "移动主题",
	"history.cut-topic": "剪切主题",
	"history.delete-branch": "删除分支",
	"history.delete-topic": "删除主题",
	"history.paste-topic": "粘贴主题",
	"history.insert-parent-topic": "插入父主题",
	"history.outdent-topic": "提升主题层级",
	"history.replace-presentation": "替换思维导图展示设置",
	"history.create-custom-style": "创建自定义思维导图样式",
	"history.create-custom-palette": "创建自定义思维导图配色",
	"history.change-presentation": "修改思维导图展示设置",
	"history.change-viewport": "修改思维导图视口",
	"import.default-destination-name": "导入的思维导图.md",

	"import.file-picker.aria-label": "选择要导入的思维导图文件",
	"import.file-picker.title": "选择要导入的思维导图文件",
	"import-modal.title": "导入思维导图",
	"import-modal.no-sheets": "无法预览不含画布的导入文件。",
	"import-modal.sheet.name": "画布",
	"import-modal.sheet.description": "选择要转换为一个 Markdown 笔记的导图。",
	"import-modal.sheet.aria-label": "思维导图画布",
	"import-modal.note-name.name": "笔记名称",
	"import-modal.note-name.description": "不会修改源文件；导入会创建一个新笔记。",
	"import-modal.note-name.aria-label": "导入的笔记名称",
	"import-modal.cancel.aria-label": "取消导入思维导图",
	"import-modal.cancel.title": "取消导入思维导图",
	"import-modal.confirm.aria-label": "导入思维导图",
	"import-modal.confirm.title": "导入思维导图",
	"import-modal.central-topic": "中心主题：{topic}",
	"import-modal.topics-found":
		"找到 {count} 个主题。中心主题会作为笔记名称；其余 {attachedCount} 个关联主题会转换为嵌套 Markdown 列表。",
	"import-modal.destination": "目标位置：{path}",
	"import-modal.no-losses": "主题文本和层级可在当前已知范围内无损导入。",
	"import-modal.not-preserved": "不会保留",
	"import-modal.import": "导入",
	"import-modal.importing": "正在导入...",
	"import-modal.import-failed": "无法导入思维导图。",
	"import-modal.import-failed-with-reason": "无法导入思维导图：{message}",

	"import-error.unsupported-format": "所选文件不是受支持的思维导图格式。",
	"import-error.invalid-archive": "所选思维导图压缩包无效。",
	"import-error.encrypted-archive": "暂不支持受密码保护的思维导图压缩包。",
	"import-error.unsafe-archive-path": "所选压缩包包含不安全的条目路径。",
	"import-error.duplicate-archive-entry": "所选压缩包包含重复条目。",
	"import-error.unsupported-compression": "所选压缩包使用了不受支持的压缩方式。",
	"import-error.missing-content": "所选思维导图文件不包含可读取的导图内容。",
	"import-error.invalid-json": "所选思维导图 JSON 无效。",
	"import-error.invalid-xml": "所选思维导图 XML 无效。",
	"import-error.unsafe-xml": "所选思维导图 XML 不安全。",
	"import-error.limit-exceeded": "所选思维导图文件超过导入安全限制。",
	"import-error.empty-workbook": "所选思维导图文件不包含可导入的导图。",

	"import-diagnostic.root-title-sanitized":
		"已调整中心主题以生成安全的 Markdown 文件名；导入前请检查目标名称。",
	"import-diagnostic.root-task-omitted":
		"中心主题会作为 Markdown 文件名，因此不会保留它的任务状态。",
	"import-diagnostic.mindmeister-presentation-omitted":
		"暂不导入 MindMeister 的注释、链接、媒体、位置和视觉样式。",
	"import-diagnostic.mindmanager-presentation-omitted":
		"暂不导入 MindManager 的注释、链接、媒体、关系、标注和视觉样式。",
	"import-diagnostic.xmind-styles-omitted": "未导入 XMind 的样式、主题和布局选择。",
	"import-diagnostic.xmind-detached-topics-omitted":
		"Markdown 没有对应的树关系，因此未导入 XMind 浮动主题。",
	"import-diagnostic.xmind-summaries-omitted":
		"ObMind 暂不渲染摘要，因此未导入 XMind 摘要主题。",
	"import-diagnostic.xmind-relationships-omitted":
		"ObMind 暂不支持关系线渲染，因此未导入 XMind 关系。",
	"import-diagnostic.xmind-notes-omitted":
		"ObMind 的树模型不表示 Markdown 主题正文，因此未导入 XMind 主题注释。",
	"import-diagnostic.xmind-labels-omitted": "未导入 XMind 主题标签。",
	"import-diagnostic.xmind-images-omitted": "未导入 XMind 主题图片和附件。",
	"import-diagnostic.xmind-boundaries-omitted":
		"ObMind 暂不支持边界渲染，因此未导入 XMind 边界。",
	"import-diagnostic.xmind-markers-omitted":
		"只能保留明确的 XMind 待办或完成标记；其他标记未导入。",
	"import-diagnostic.xmind-manifest-unreadable":
		"无法检查可选的 XMind 清单文件中的加密元数据。",
	"import-diagnostic.unknown": "此导入器可能无法保留源导图中的部分内容。",
} as const satisfies Record<keyof typeof OBMIND_OBSIDIAN_EN_MESSAGES, string>;
