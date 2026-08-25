import type {
	MindMapPaletteCapability,
	MindMapStyleCapability,
} from "./frontend";
import {
	createObMindTranslator,
	normalizeObMindLanguage,
	type ObMindLanguage,
	type ObMindTranslator,
} from "../i18n/i18n";
import {
	isSafeHostColorToken,
	isSafeLiteralColor,
	type MindMapEdgeRouting,
	type MindMapLineStyle,
	type MindMapNodeShape,
	type MindMapThemeColor,
} from "../presentation/presentation";
/*
 * Keep rendering types and color-safety policy sourced from the presentation
 * core so this DOM adapter cannot drift from persistence validation.
 */
import type {
	MindMapPresentationLibraryPaletteColorTarget,
	MindMapPresentationLibraryPaletteCoreColor,
	MindMapPresentationLibraryPaletteDraft,
	MindMapPresentationLibraryPaletteDraftChange,
	MindMapPresentationLibraryPaletteRole,
	MindMapPresentationLibraryPaletteRoleColorChannel,
	MindMapPresentationLibraryDraftConflict,
	MindMapPresentationLibraryStyleDraft,
	MindMapPresentationLibraryStyleDraftChange,
	MindMapPresentationLibraryStyleRole,
} from "../presentation/presentation-library-editor";
import type { MindMapPresentationLibraryEntryKind } from "../presentation/presentation-library";

const STYLE_EDITOR_ROLES: readonly MindMapPresentationLibraryStyleRole[] = [
	"root",
	"mainTopic",
	"subtopic",
];

const PALETTE_EDITOR_CORE_COLORS: readonly MindMapPresentationLibraryPaletteCoreColor[] = [
	"canvas",
	"surface",
	"surfaceEmphasis",
	"surfaceHover",
	"text",
	"textOnAccent",
	"textMuted",
	"border",
	"borderHover",
	"accent",
	"edge",
	"selection",
];

const PALETTE_EDITOR_COLOR_CHANNELS: readonly MindMapPresentationLibraryPaletteRoleColorChannel[] = [
	"fill",
	"stroke",
	"textColor",
];

const MIND_MAP_LINE_STYLES: readonly MindMapLineStyle[] = [
	"solid",
	"dashed",
	"dotted",
];

interface HtmlElementFactory {
	createElement<K extends keyof HTMLElementTagNameMap>(
		tagName: K,
	): HTMLElementTagNameMap[K];
}

export interface StyleLibraryEditorOptions {
	readonly ownerDocument: Document;
	/** The caller owns language persistence; this DOM adapter only renders it. */
	readonly language: ObMindLanguage;
	readonly capability: MindMapStyleCapability;
	readonly draft: MindMapPresentationLibraryStyleDraft;
	readonly nodeShapes: readonly MindMapNodeShape[];
	readonly edgeRoutings: readonly MindMapEdgeRouting[];
	readonly canDuplicate: boolean;
	readonly canEdit: boolean;
	readonly canDelete: boolean;
	/** Explains a temporary unavailable editor without implying a built-in entry. */
	readonly unavailableMessage?: string;
}

export interface PaletteLibraryEditorOptions {
	readonly ownerDocument: Document;
	/** The caller owns language persistence; this DOM adapter only renders it. */
	readonly language: ObMindLanguage;
	readonly capability: MindMapPaletteCapability;
	readonly draft: MindMapPresentationLibraryPaletteDraft;
	readonly colorHost: HTMLElement;
	readonly canDuplicate: boolean;
	readonly canEdit: boolean;
	readonly canDelete: boolean;
	/** Explains a temporary unavailable editor without implying a built-in entry. */
	readonly unavailableMessage?: string;
}

/**
 * The editor DOM is intentionally a thin adapter around the immutable library
 * draft module. Its data attributes describe semantic fields rather than DOM
 * structure, so an alternate frontend can emit the same library commands.
 */
export function createStyleLibraryEditor(
	options: StyleLibraryEditorOptions,
): HTMLElement {
	const translator = createObMindTranslator(
		normalizeObMindLanguage(options.language),
	);
	const t: ObMindTranslator["t"] = (key, values) =>
		translator.t(key, values);
	const editor = createElement(
		options.ownerDocument,
		"div",
		"obmind-library-editor-content",
	);
	editor.dataset.obmindLibraryKind = "style";
	editor.dataset.obmindLanguage = translator.language;
	if (!options.canEdit) {
		editor.append(
			createLibraryEditorNotice(
				options.ownerDocument,
				options.unavailableMessage ??
					t("library.style.immutable-notice"),
			),
		);
		if (options.canDuplicate) {
			editor.append(
				createLibraryActionButton(
					options.ownerDocument,
					"style",
					"duplicate",
					t("library.action.duplicate-entry", {
						label: options.capability.label,
					}),
				),
			);
		}
		return editor;
	}

	editor.append(
		createLibraryTextRow({
			ownerDocument: options.ownerDocument,
			kind: "style",
			field: "label",
			label: t("library.style.name"),
			value: options.draft.label,
		}),
	);

	const roleGroup = createLibraryDetails(
		options.ownerDocument,
		t("library.section.topic-roles"),
		true,
	);
	for (const role of STYLE_EDITOR_ROLES) {
		const roleTokens = options.draft.tokens.roles[role];
		const group = createLibraryDetails(
			options.ownerDocument,
			getStyleRoleLabel(role, translator),
			role === "root",
		);
		group.append(
			createLibrarySelectRow({
				ownerDocument: options.ownerDocument,
				kind: "style",
				field: "role-shape",
				label: t("library.field.shape"),
				value: roleTokens.shape ?? "rounded-rectangle",
				choices: options.nodeShapes.map((shape) => ({
					value: shape,
					label: getNodeShapeLabel(shape, translator),
				})),
				dataset: { obmindLibraryRole: role },
			}),
			createLibraryNumberRow({
				ownerDocument: options.ownerDocument,
				kind: "style",
				field: "role-radius",
				label: t("library.field.corner-radius"),
				value: roleTokens.radius ?? options.draft.tokens.node.radius,
				minimum: 0,
				maximum: 240,
				step: 1,
				dataset: { obmindLibraryRole: role },
			}),
			createLibraryNumberRow({
				ownerDocument: options.ownerDocument,
				kind: "style",
				field: "role-max-width",
				label: t("library.field.maximum-width"),
				value: roleTokens.maxWidth ?? options.draft.tokens.node.maxWidth,
				minimum: 40,
				maximum: 1200,
				step: 4,
				dataset: { obmindLibraryRole: role },
			}),
			createLibraryNumberRow({
				ownerDocument: options.ownerDocument,
				kind: "style",
				field: "role-font-size",
				label: t("library.field.font-size"),
				value:
					roleTokens.typography?.fontSize ??
					(role === "root"
						? options.draft.tokens.typography.rootFontSize
						: options.draft.tokens.typography.fontSize),
				minimum: 6,
				maximum: 160,
				step: 1,
				dataset: { obmindLibraryRole: role },
			}),
		);
		roleGroup.append(group);
	}
	editor.append(roleGroup);

	const geometryGroup = createLibraryDetails(
		options.ownerDocument,
		t("library.section.shared-geometry"),
		false,
	);
	geometryGroup.append(
		createLibraryNumberRow({
			ownerDocument: options.ownerDocument,
			kind: "style",
			field: "node-max-width",
			label: t("library.field.default-maximum-width"),
			value: options.draft.tokens.node.maxWidth,
			minimum: 40,
			maximum: 1200,
			step: 4,
		}),
		createLibraryNumberRow({
			ownerDocument: options.ownerDocument,
			kind: "style",
			field: "node-padding-inline",
			label: t("library.field.horizontal-padding"),
			value: options.draft.tokens.node.paddingInline,
			minimum: 0,
			maximum: 240,
			step: 1,
		}),
		createLibraryNumberRow({
			ownerDocument: options.ownerDocument,
			kind: "style",
			field: "node-padding-block",
			label: t("library.field.vertical-padding"),
			value: options.draft.tokens.node.paddingBlock,
			minimum: 0,
			maximum: 240,
			step: 1,
		}),
	);
	editor.append(geometryGroup);

	const edgeGroup = createLibraryDetails(
		options.ownerDocument,
		t("library.section.connectors"),
		false,
	);
	edgeGroup.append(
		createLibrarySelectRow({
			ownerDocument: options.ownerDocument,
			kind: "style",
			field: "edge-routing",
			label: t("library.field.route"),
			value: options.draft.tokens.edge.routing,
			choices: options.edgeRoutings.map((routing) => ({
				value: routing,
					label: getEdgeRoutingLabel(routing, translator),
			})),
		}),
		createLibrarySelectRow({
			ownerDocument: options.ownerDocument,
			kind: "style",
			field: "edge-line-style",
			label: t("library.field.line-style"),
			value: options.draft.tokens.edge.lineStyle,
			choices: MIND_MAP_LINE_STYLES.map((lineStyle) => ({
				value: lineStyle,
					label: getLineStyleLabel(lineStyle, translator),
			})),
		}),
		createLibraryNumberRow({
			ownerDocument: options.ownerDocument,
			kind: "style",
			field: "edge-width",
			label: t("library.field.default-width"),
			value: options.draft.tokens.edge.width,
			minimum: 0.1,
			maximum: 64,
			step: 0.1,
		}),
	);
	editor.append(edgeGroup);
	if (options.canDuplicate) {
		editor.append(
			createLibraryActionButton(
				options.ownerDocument,
				"style",
				"duplicate",
				t("library.action.duplicate-entry", {
					label: options.capability.label,
				}),
			),
		);
	}
	if (options.canDelete) {
		editor.append(
			createLibraryActionButton(
				options.ownerDocument,
				"style",
				"delete",
				t("library.action.delete-custom-style"),
				true,
			),
		);
	}
	return editor;
}

export function createPaletteLibraryEditor(
	options: PaletteLibraryEditorOptions,
): HTMLElement {
	const translator = createObMindTranslator(
		normalizeObMindLanguage(options.language),
	);
	const t: ObMindTranslator["t"] = (key, values) =>
		translator.t(key, values);
	const editor = createElement(
		options.ownerDocument,
		"div",
		"obmind-library-editor-content",
	);
	editor.dataset.obmindLibraryKind = "palette";
	editor.dataset.obmindLanguage = translator.language;
	if (!options.canEdit) {
		editor.append(
			createLibraryEditorNotice(
				options.ownerDocument,
				options.unavailableMessage ??
					t("library.palette.immutable-notice"),
			),
		);
		if (options.canDuplicate) {
			editor.append(
				createLibraryActionButton(
					options.ownerDocument,
					"palette",
					"duplicate",
					t("library.action.duplicate-entry", {
						label: options.capability.label,
					}),
				),
			);
		}
		return editor;
	}

	editor.append(
		createLibraryTextRow({
			ownerDocument: options.ownerDocument,
			kind: "palette",
			field: "label",
			label: t("library.palette.name"),
			value: options.draft.label,
		}),
	);

	const baseGroup = createLibraryDetails(
		options.ownerDocument,
		t("library.section.base-colors"),
		true,
	);
	for (const color of PALETTE_EDITOR_CORE_COLORS) {
		baseGroup.append(
			createPaletteColorRow({
				ownerDocument: options.ownerDocument,
				colorHost: options.colorHost,
				translator,
				target: "base",
				field: "core",
				color,
				label: getPaletteColorLabel(color, translator),
				value: options.draft.colors[color],
			}),
		);
	}
	editor.append(baseGroup);

	const rolesGroup = createLibraryDetails(
		options.ownerDocument,
		t("library.section.topic-role-colors"),
		false,
	);
	for (const role of STYLE_EDITOR_ROLES) {
		const group = createLibraryDetails(
			options.ownerDocument,
			getStyleRoleLabel(role, translator),
			false,
		);
		for (const channel of PALETTE_EDITOR_COLOR_CHANNELS) {
			group.append(
				createPaletteColorRow({
					ownerDocument: options.ownerDocument,
					colorHost: options.colorHost,
					translator,
					target: "base",
					field: "role",
					role,
					channel,
					label: getPaletteRoleChannelLabel(channel, translator),
					value:
						options.draft.roles[role][channel] ??
						getPaletteRoleFallbackColor(options.draft, channel),
				}),
			);
		}
		rolesGroup.append(group);
	}
	editor.append(rolesGroup);

	const branchGroup = createLibraryDetails(
		options.ownerDocument,
		t("library.section.branch-colors"),
		false,
	);
	for (const [index, color] of options.draft.colors.branchPalette.entries()) {
		branchGroup.append(
			createPaletteColorRow({
				ownerDocument: options.ownerDocument,
				colorHost: options.colorHost,
				translator,
				target: "base",
				field: "branch",
				index,
				label: t("library.field.branch", {
					index: translator.formatNumber(index + 1),
				}),
				value: color,
			}),
		);
	}
	editor.append(branchGroup);

	const lightToggle = createLibraryCheckboxRow({
		ownerDocument: options.ownerDocument,
		kind: "palette",
		field: "light-overrides-enabled",
		label: t("library.field.light-overrides-enabled"),
		checked: options.draft.lightOverridesEnabled,
	});
	editor.append(lightToggle);
	if (options.draft.lightOverridesEnabled) {
		const lightGroup = createLibraryDetails(
			options.ownerDocument,
			t("library.section.light-mode-overrides"),
			false,
		);
		for (const color of PALETTE_EDITOR_CORE_COLORS) {
			lightGroup.append(
				createPaletteColorRow({
					ownerDocument: options.ownerDocument,
					colorHost: options.colorHost,
					translator,
					target: "light",
					field: "core",
					color,
					label: getPaletteColorLabel(color, translator),
					value:
						options.draft.lightColors?.[color] ??
						options.draft.colors[color],
				}),
			);
		}
		for (const role of STYLE_EDITOR_ROLES) {
			const group = createLibraryDetails(
				options.ownerDocument,
				t("library.role.topic", {
					role: getStyleRoleLabel(role, translator),
				}),
				false,
			);
			for (const channel of PALETTE_EDITOR_COLOR_CHANNELS) {
				group.append(
					createPaletteColorRow({
						ownerDocument: options.ownerDocument,
						colorHost: options.colorHost,
						translator,
						target: "light",
						field: "role",
						role,
						channel,
						label: getPaletteRoleChannelLabel(channel, translator),
						value:
							options.draft.lightRoles?.[role]?.[channel] ??
							options.draft.roles[role][channel] ??
							getPaletteRoleFallbackColor(options.draft, channel),
					}),
				);
			}
			lightGroup.append(group);
		}
		const lightBranches =
			options.draft.lightColors?.branchPalette ??
			options.draft.colors.branchPalette;
		for (const [index, color] of lightBranches.entries()) {
			lightGroup.append(
				createPaletteColorRow({
					ownerDocument: options.ownerDocument,
					colorHost: options.colorHost,
					translator,
					target: "light",
					field: "branch",
					index,
					label: t("library.field.branch", {
						index: translator.formatNumber(index + 1),
					}),
					value: color,
				}),
			);
		}
		editor.append(lightGroup);
	}
	if (options.canDuplicate) {
		editor.append(
			createLibraryActionButton(
				options.ownerDocument,
				"palette",
				"duplicate",
				t("library.action.duplicate-entry", {
					label: options.capability.label,
				}),
			),
		);
	}
	if (options.canDelete) {
		editor.append(
			createLibraryActionButton(
				options.ownerDocument,
				"palette",
				"delete",
				t("library.action.delete-custom-palette"),
				true,
			),
		);
	}
	return editor;
}

function createLibraryEditorNotice(
	ownerDocument: Document,
	message: string,
): HTMLElement {
	const notice = createElement(
		ownerDocument,
		"p",
		"obmind-library-editor-notice",
	);
	notice.textContent = message;
	return notice;
}

function createLibraryDetails(
	ownerDocument: Document,
	label: string,
	open: boolean,
): HTMLElement {
	const details = createElement(
		ownerDocument,
		"details",
		"obmind-library-editor-group",
	);
	details.open = open;
	const summary = createElement(
		ownerDocument,
		"summary",
		"obmind-library-editor-group-title",
	);
	summary.textContent = label;
	details.append(summary);
	return details;
}

function createLibraryActionButton(
	ownerDocument: Document,
	kind: "style" | "palette",
	action: "duplicate" | "delete",
	label: string,
	destructive = false,
): HTMLButtonElement {
	const button = createElement(
		ownerDocument,
		"button",
		destructive
			? "obmind-library-editor-action obmind-library-editor-action-danger"
			: "obmind-library-editor-action",
	);
	button.type = "button";
	button.dataset.obmindLibraryKind = kind;
	button.dataset.obmindLibraryAction = action;
	button.textContent = label;
	return button;
}

function createLibraryTextRow(options: {
	readonly ownerDocument: Document;
	readonly kind: "style" | "palette";
	readonly field: "label";
	readonly label: string;
	readonly value: string;
}): HTMLElement {
	const row = createLibraryEditorRow(options.ownerDocument, options.label);
	const input = createElement(
		options.ownerDocument,
		"input",
		"obmind-library-editor-input",
	);
	input.type = "text";
	input.value = options.value;
	input.maxLength = 160;
	input.dataset.obmindLibraryKind = options.kind;
	input.dataset.obmindLibraryField = options.field;
	input.setAttribute("aria-label", options.label);
	row.append(input);
	return row;
}

function createLibraryNumberRow(options: {
	readonly ownerDocument: Document;
	readonly kind: "style";
	readonly field:
		| "role-radius"
		| "role-max-width"
		| "role-font-size"
		| "node-max-width"
		| "node-padding-inline"
		| "node-padding-block"
		| "edge-width";
	readonly label: string;
	readonly value: number;
	readonly minimum: number;
	readonly maximum: number;
	readonly step: number;
	readonly dataset?: Readonly<Record<string, string>>;
}): HTMLElement {
	const row = createLibraryEditorRow(options.ownerDocument, options.label);
	const input = createElement(
		options.ownerDocument,
		"input",
		"obmind-library-editor-input obmind-library-editor-number",
	);
	input.type = "number";
	input.value = String(options.value);
	input.min = String(options.minimum);
	input.max = String(options.maximum);
	input.step = String(options.step);
	input.dataset.obmindLibraryKind = options.kind;
	input.dataset.obmindLibraryField = options.field;
	applyDataset(input, options.dataset);
	input.setAttribute("aria-label", options.label);
	row.append(input);
	return row;
}

function createLibrarySelectRow(options: {
	readonly ownerDocument: Document;
	readonly kind: "style";
	readonly field: "role-shape" | "edge-routing" | "edge-line-style";
	readonly label: string;
	readonly value: string;
	readonly choices: readonly { readonly value: string; readonly label: string }[];
	readonly dataset?: Readonly<Record<string, string>>;
}): HTMLElement {
	const row = createLibraryEditorRow(options.ownerDocument, options.label);
	const select = createElement(
		options.ownerDocument,
		"select",
		"obmind-toolbar-select obmind-sidebar-select",
	);
	select.dataset.obmindLibraryKind = options.kind;
	select.dataset.obmindLibraryField = options.field;
	applyDataset(select, options.dataset);
	for (const choice of options.choices) {
		const option = createElement(options.ownerDocument, "option", "");
		option.value = choice.value;
		option.textContent = choice.label;
		select.append(option);
	}
	select.value = options.value;
	select.setAttribute("aria-label", options.label);
	row.append(select);
	return row;
}

function createPaletteColorRow(options: {
	readonly ownerDocument: Document;
	readonly colorHost: HTMLElement;
	readonly translator: ObMindTranslator;
	readonly target: MindMapPresentationLibraryPaletteColorTarget;
	readonly field: "core" | "role" | "branch";
	readonly label: string;
	readonly value: MindMapThemeColor;
	readonly color?: MindMapPresentationLibraryPaletteCoreColor;
	readonly role?: MindMapPresentationLibraryPaletteRole;
	readonly channel?: MindMapPresentationLibraryPaletteRoleColorChannel;
	readonly index?: number;
}): HTMLElement {
	const row = createLibraryEditorRow(options.ownerDocument, options.label);
	const input = createElement(
		options.ownerDocument,
		"input",
		"obmind-library-editor-input obmind-library-editor-color",
	);
	input.type = "color";
	input.value = getLibraryColorInputValue(options.value, options.colorHost);
	input.dataset.obmindLibraryKind = "palette";
	input.dataset.obmindLibraryField = options.field;
	input.dataset.obmindLibraryTarget = options.target;
	if (options.color !== undefined) {
		input.dataset.obmindLibraryColor = options.color;
	}
	if (options.role !== undefined) {
		input.dataset.obmindLibraryRole = options.role;
	}
	if (options.channel !== undefined) {
		input.dataset.obmindLibraryChannel = options.channel;
	}
	if (options.index !== undefined) {
		input.dataset.obmindLibraryIndex = String(options.index);
	}
	if (options.value.kind === "host") {
		input.title = options.translator.t("library.color.host-token-notice");
	}
	input.setAttribute("aria-label", options.label);
	row.append(input);
	return row;
}

function createLibraryCheckboxRow(options: {
	readonly ownerDocument: Document;
	readonly kind: "palette";
	readonly field: "light-overrides-enabled";
	readonly label: string;
	readonly checked: boolean;
}): HTMLElement {
	const row = createLibraryEditorRow(options.ownerDocument, options.label);
	const input = createElement(
		options.ownerDocument,
		"input",
		"obmind-library-editor-checkbox",
	);
	input.type = "checkbox";
	input.checked = options.checked;
	input.dataset.obmindLibraryKind = options.kind;
	input.dataset.obmindLibraryField = options.field;
	input.setAttribute("aria-label", options.label);
	row.append(input);
	return row;
}

function createLibraryEditorRow(
	ownerDocument: Document,
	label: string,
): HTMLElement {
	const row = createElement(ownerDocument, "label", "obmind-sidebar-row");
	const caption = createElement(
		ownerDocument,
		"span",
		"obmind-sidebar-row-label",
	);
	caption.textContent = label;
	row.append(caption);
	return row;
}

function applyDataset(
	element: HTMLElement,
	values: Readonly<Record<string, string>> | undefined,
): void {
	if (values === undefined) {
		return;
	}
	for (const [key, value] of Object.entries(values)) {
		element.dataset[key] = value;
	}
}

export function getLibraryEditorAction(
	target: EventTarget | null,
	kind: "style" | "palette",
): "duplicate" | "delete" | null {
	if (!(target instanceof Element)) {
		return null;
	}
	const button = target.closest<HTMLButtonElement>(
		`button[data-obmind-library-kind="${kind}"][data-obmind-library-action]`,
	);
	const action = button?.dataset.obmindLibraryAction;
	return action === "duplicate" || action === "delete" ? action : null;
}

/**
 * Applies the built-in DOM treatment for a retained cross-view draft conflict.
 * The semantic conflict state stays in the framework-free draft module.
 */
export function applyPresentationLibraryDraftConflict(
	editor: HTMLElement,
	conflict: MindMapPresentationLibraryDraftConflict,
	language?: ObMindLanguage,
): void {
	const translator = createObMindTranslator(
		normalizeObMindLanguage(language ?? editor.dataset.obmindLanguage),
	);
	const ownerDocument = editor.ownerDocument;
	const notice = createElement(
		ownerDocument,
		"div",
		"obmind-library-editor-notice",
	);
	notice.setAttribute("role", "alert");
	notice.dataset.obmindLibraryDraftConflict = "true";
	notice.textContent =
		conflict.entryKind === "style"
			? translator.t("library.conflict.style")
			: translator.t("library.conflict.palette");
	const reload = createElement(
		ownerDocument,
		"button",
		"obmind-library-editor-action",
	);
	reload.type = "button";
	reload.dataset.obmindLibraryKind = conflict.entryKind;
	reload.dataset.obmindLibraryDraftConflictAction = "reload";
	reload.textContent = translator.t("library.conflict.reload");
	reload.setAttribute(
		"aria-label",
		translator.t("library.conflict.reload-aria", {
			revision: String(conflict.authoritativeRevision),
		}),
	);
	notice.append(reload);
	editor.prepend(notice);

	for (const control of Array.from(
		editor.querySelectorAll<
			HTMLInputElement | HTMLSelectElement | HTMLButtonElement
		>("input, select, button"),
	)) {
		if (control.dataset.obmindLibraryDraftConflictAction !== "reload") {
			control.disabled = true;
		}
	}
}

export function getPresentationLibraryDraftConflictAction(
	target: EventTarget | null,
	kind: MindMapPresentationLibraryEntryKind,
): "reload" | null {
	if (!(target instanceof Element)) {
		return null;
	}
	const button = target.closest<HTMLButtonElement>(
		`button[data-obmind-library-kind="${kind}"][data-obmind-library-draft-conflict-action]`,
	);
	return button?.dataset.obmindLibraryDraftConflictAction === "reload"
		? "reload"
		: null;
}

export function getLibraryEditorControl(
	target: EventTarget | null,
	kind: "style" | "palette",
): HTMLInputElement | HTMLSelectElement | null {
	if (
		!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)
	) {
		return null;
	}
	return target.dataset.obmindLibraryKind === kind &&
		target.dataset.obmindLibraryField !== undefined
		? target
		: null;
}

export function createStyleLibraryDraftChange(
	control: HTMLInputElement | HTMLSelectElement,
	draft: MindMapPresentationLibraryStyleDraft,
): MindMapPresentationLibraryStyleDraftChange | null {
	const field = control.dataset.obmindLibraryField;
	switch (field) {
		case "label":
			return { type: "set-label", label: control.value };
		case "role-shape": {
			const role = getStyleEditorRole(control);
			const shape = asNodeShape(control.value);
			return role === null || shape === null
				? null
				: { type: "set-role-shape", role, shape };
		}
		case "role-radius": {
			const role = getStyleEditorRole(control);
			const radius = readLibraryFiniteNumber(control);
			return role === null || radius === null
				? null
				: { type: "set-role-radius", role, radius };
		}
		case "role-max-width": {
			const role = getStyleEditorRole(control);
			const maxWidth = readLibraryFiniteNumber(control);
			return role === null || maxWidth === null
				? null
				: { type: "set-role-max-width", role, maxWidth };
		}
		case "role-font-size": {
			const role = getStyleEditorRole(control);
			const fontSize = readLibraryFiniteNumber(control);
			return role === null || fontSize === null
				? null
				: { type: "set-role-font-size", role, fontSize };
		}
		case "node-max-width": {
			const maxWidth = readLibraryFiniteNumber(control);
			return maxWidth === null
				? null
				: { type: "set-node-max-width", maxWidth };
		}
		case "node-padding-inline": {
			const paddingInline = readLibraryFiniteNumber(control);
			return paddingInline === null
				? null
				: {
						type: "set-node-padding",
						paddingInline,
						paddingBlock: draft.tokens.node.paddingBlock,
					};
		}
		case "node-padding-block": {
			const paddingBlock = readLibraryFiniteNumber(control);
			return paddingBlock === null
				? null
				: {
						type: "set-node-padding",
						paddingInline: draft.tokens.node.paddingInline,
						paddingBlock,
					};
		}
		case "edge-routing": {
			const routing = asEdgeRouting(control.value);
			return routing === null ? null : { type: "set-edge-routing", routing };
		}
		case "edge-line-style": {
			const lineStyle = asLineStyle(control.value);
			return lineStyle === null
				? null
				: { type: "set-edge-line-style", lineStyle };
		}
		case "edge-width": {
			const width = readLibraryFiniteNumber(control);
			return width === null ? null : { type: "set-edge-width", width };
		}
		default:
			return null;
	}
}

export function createPaletteLibraryDraftChange(
	control: HTMLInputElement | HTMLSelectElement,
): MindMapPresentationLibraryPaletteDraftChange | null {
	const field = control.dataset.obmindLibraryField;
	if (field === "label") {
		return { type: "set-label", label: control.value };
	}
	if (field === "light-overrides-enabled") {
		return control instanceof HTMLInputElement
			? { type: "set-light-overrides-enabled", enabled: control.checked }
			: null;
	}
	const target = getPaletteEditorTarget(control);
	if (target === null) {
		return null;
	}
	if (field === "core") {
		const color = asPaletteCoreColor(control.dataset.obmindLibraryColor);
		return color === null
			? null
			: {
					type: "set-core-color",
					target,
					color,
					value: control.value,
				};
	}
	if (field === "role") {
		const role = getPaletteEditorRole(control);
		const channel = asPaletteRoleColorChannel(
			control.dataset.obmindLibraryChannel,
		);
		return role === null || channel === null
			? null
			: {
					type: "set-role-color",
					target,
					role,
					channel,
					value: control.value,
				};
	}
	if (field === "branch") {
		const index = Number(control.dataset.obmindLibraryIndex);
		return !Number.isInteger(index) || index < 0
			? null
			: {
					type: "set-branch-color",
					target,
					index,
					value: control.value,
				};
	}
	return null;
}

function getStyleEditorRole(
	control: HTMLInputElement | HTMLSelectElement,
): MindMapPresentationLibraryStyleRole | null {
	const role = control.dataset.obmindLibraryRole;
	return STYLE_EDITOR_ROLES.find((candidate) => candidate === role) ?? null;
}

function getPaletteEditorRole(
	control: HTMLInputElement | HTMLSelectElement,
): MindMapPresentationLibraryPaletteRole | null {
	return getStyleEditorRole(control);
}

function getPaletteEditorTarget(
	control: HTMLInputElement | HTMLSelectElement,
): MindMapPresentationLibraryPaletteColorTarget | null {
	const target = control.dataset.obmindLibraryTarget;
	return target === "base" || target === "light" ? target : null;
}

function readLibraryFiniteNumber(
	control: HTMLInputElement | HTMLSelectElement,
): number | null {
	const value = Number(control.value);
	return Number.isFinite(value) ? value : null;
}

function asNodeShape(value: string): MindMapNodeShape | null {
	const shapes: readonly MindMapNodeShape[] = [
		"rounded-rectangle",
		"rectangle",
		"pill",
		"ellipse",
		"underline",
		"none",
	];
	return shapes.find((shape) => shape === value) ?? null;
}

function asEdgeRouting(value: string): MindMapEdgeRouting | null {
	const routings: readonly MindMapEdgeRouting[] = [
		"bezier",
		"straight",
		"orthogonal",
		"rounded-orthogonal",
	];
	return routings.find((routing) => routing === value) ?? null;
}

function asLineStyle(value: string): MindMapLineStyle | null {
	return MIND_MAP_LINE_STYLES.find((lineStyle) => lineStyle === value) ?? null;
}

function asPaletteCoreColor(
	value: string | undefined,
): MindMapPresentationLibraryPaletteCoreColor | null {
	return PALETTE_EDITOR_CORE_COLORS.find((color) => color === value) ?? null;
}

function asPaletteRoleColorChannel(
	value: string | undefined,
): MindMapPresentationLibraryPaletteRoleColorChannel | null {
	return (
		PALETTE_EDITOR_COLOR_CHANNELS.find((channel) => channel === value) ?? null
	);
}

function getLibraryColorInputValue(
	color: MindMapThemeColor,
	host: HTMLElement,
): string {
	if (color.kind === "literal" && isSafeLiteralColor(color.value)) {
		return normalizeColorInputValue(color.value);
	}
	if (color.kind !== "host" || !isSafeHostColorToken(color.token)) {
		return "#808080";
	}
	const cssValue = host.ownerDocument.defaultView
		?.getComputedStyle(host)
		.getPropertyValue(`--${color.token}`)
		.trim();
	return cssValue === undefined || cssValue.length === 0
		? "#808080"
		: (parseCssColorToHex(cssValue) ?? "#808080");
}

function parseCssColorToHex(value: string): string | null {
	if (/^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value)) {
		return normalizeColorInputValue(value);
	}
	const match = value.match(
		/^rgba?\(\s*(\d{1,3})[ ,]+(\d{1,3})[ ,]+(\d{1,3})(?:\s*[,/]\s*[\d.]+)?\s*\)$/iu,
	);
	if (match === null) {
		return null;
	}
	const channels = match.slice(1, 4).map(Number);
	if (channels.some((channel) => channel < 0 || channel > 255)) {
		return null;
	}
	return `#${channels
		.map((channel) => channel.toString(16).padStart(2, "0"))
		.join("")}`;
}

function getPaletteRoleFallbackColor(
	draft: MindMapPresentationLibraryPaletteDraft,
	channel: MindMapPresentationLibraryPaletteRoleColorChannel,
): MindMapThemeColor {
	switch (channel) {
		case "fill":
			return draft.colors.surface;
		case "stroke":
			return draft.colors.border;
		case "textColor":
			return draft.colors.text;
	}
}

function getStyleRoleLabel(
	role: MindMapPresentationLibraryStyleRole,
	translator: ObMindTranslator,
): string {
	switch (role) {
		case "root":
			return translator.t("library.role.root");
		case "mainTopic":
			return translator.t("library.role.main-topic");
		case "subtopic":
			return translator.t("library.role.subtopic");
	}
}

function getPaletteColorLabel(
	color: MindMapPresentationLibraryPaletteCoreColor,
	translator: ObMindTranslator,
): string {
	switch (color) {
		case "canvas":
			return translator.t("library.core-color.canvas");
		case "surface":
			return translator.t("library.core-color.surface");
		case "surfaceEmphasis":
			return translator.t("library.core-color.surface-emphasis");
		case "surfaceHover":
			return translator.t("library.core-color.surface-hover");
		case "text":
			return translator.t("library.core-color.text");
		case "textOnAccent":
			return translator.t("library.core-color.text-on-accent");
		case "textMuted":
			return translator.t("library.core-color.text-muted");
		case "border":
			return translator.t("library.core-color.border");
		case "borderHover":
			return translator.t("library.core-color.border-hover");
		case "accent":
			return translator.t("library.core-color.accent");
		case "edge":
			return translator.t("library.core-color.edge");
		case "selection":
			return translator.t("library.core-color.selection");
	}
}

function getPaletteRoleChannelLabel(
	channel: MindMapPresentationLibraryPaletteRoleColorChannel,
	translator: ObMindTranslator,
): string {
	switch (channel) {
		case "fill":
			return translator.t("library.role-color.fill");
		case "stroke":
			return translator.t("library.role-color.stroke");
		case "textColor":
			return translator.t("library.role-color.text");
	}
}

function getEdgeRoutingLabel(
	routing: MindMapEdgeRouting,
	translator: ObMindTranslator,
): string {
	switch (routing) {
		case "bezier":
			return translator.t("library.routing.bezier");
		case "straight":
			return translator.t("library.routing.straight");
		case "orthogonal":
			return translator.t("library.routing.orthogonal");
		case "rounded-orthogonal":
			return translator.t("library.routing.rounded-orthogonal");
	}
}

function getLineStyleLabel(
	lineStyle: MindMapLineStyle,
	translator: ObMindTranslator,
): string {
	switch (lineStyle) {
		case "solid":
			return translator.t("library.line-style.solid");
		case "dashed":
			return translator.t("library.line-style.dashed");
		case "dotted":
			return translator.t("library.line-style.dotted");
	}
}
function createElement<K extends keyof HTMLElementTagNameMap>(
	ownerDocument: Document,
	tagName: K,
	className: string,
): HTMLElementTagNameMap[K] {
	const factory: HtmlElementFactory = ownerDocument;
	const element = factory.createElement(tagName);
	element.className = className;
	return element;
}

function normalizeColorInputValue(value: string): string {
	if (/^#[0-9a-fA-F]{6}$/.test(value)) {
		return value;
	}
	if (/^#[0-9a-fA-F]{3}$/.test(value)) {
		return `#${value
			.slice(1)
			.split("")
			.map((character) => character + character)
			.join("")}`;
	}
	return "#ffffff";
}

function getNodeShapeLabel(
	shape: MindMapNodeShape,
	translator: ObMindTranslator,
): string {
	switch (shape) {
		case "rounded-rectangle":
			return translator.t("library.shape.rounded-rectangle");
		case "rectangle":
			return translator.t("library.shape.rectangle");
		case "pill":
			return translator.t("library.shape.pill");
		case "ellipse":
			return translator.t("library.shape.ellipse");
		case "diamond":
			return translator.t("library.shape.diamond");
		case "underline":
			return translator.t("library.shape.underline");
		case "none":
			return translator.t("library.shape.none");
	}
}
