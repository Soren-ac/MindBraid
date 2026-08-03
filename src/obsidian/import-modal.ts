import { Modal, Notice, Setting, type App } from "obsidian";

import {
	countImportedTopics,
	createMindMapMarkdownImportPlan,
	sanitizeImportedBasename,
	type MindMapMarkdownImportPlan,
} from "../import/markdown";
import {
	DEFAULT_OBMIND_LANGUAGE,
	createObMindTranslator,
	localizeObMindError,
	type ObMindLanguage,
	type ObMindTranslationKey,
	type ObMindTranslator,
} from "../i18n/i18n";
import {
	MindMapImportError,
	type ImportedMindMapWorkbook,
	type MindMapImportDiagnostic,
} from "../import/types";

export interface MindMapImportFilePicker {
	readonly result: Promise<File | null>;
	cancel(): void;
}

export function createMindMapImportFilePicker(
	ownerDocument: Document,
	language: ObMindLanguage = DEFAULT_OBMIND_LANGUAGE,
): MindMapImportFilePicker {
	const translator = createObMindTranslator(language);
	const input = ownerDocument.body.createEl("input");
	input.className = "obmind-import-file-input";
	input.type = "file";
	input.accept = ".xmind,.mind,.mmap";
	input.setAttribute("aria-label", translator.t("import.file-picker.aria-label"));
	input.title = translator.t("import.file-picker.title");

	let settled = false;
	let resolveResult: (file: File | null) => void = () => undefined;
	const cleanup = (): void => {
		input.removeEventListener("change", handleChange);
		input.removeEventListener("cancel", handleCancel);
		input.remove();
	};
	const settle = (file: File | null): void => {
		if (settled) {
			return;
		}
		settled = true;
		cleanup();
		resolveResult(file);
	};
	const handleChange = (): void => {
		settle(input.files?.[0] ?? null);
	};
	const handleCancel = (): void => {
		settle(null);
	};
	input.addEventListener("change", handleChange);
	input.addEventListener("cancel", handleCancel);
	const result = new Promise<File | null>((resolve) => {
		resolveResult = resolve;
	});
	input.click();
	return {
		result,
		cancel: () => settle(null),
	};
}

export interface MindMapImportModalOptions {
	readonly workbook: ImportedMindMapWorkbook;
	/** Initial language; an open modal can be refreshed through setLanguage(). */
	readonly language?: ObMindLanguage;
	readonly resolveDestinationPath: (basename: string) => string;
	readonly confirmImport: (
		plan: MindMapMarkdownImportPlan,
		destinationPath: string,
	) => Promise<void>;
	readonly closed?: () => void;
}

export class MindMapImportModal extends Modal {
	private selectedSheetId: string;
	private basename: string;
	private detailsEl: HTMLElement | null = null;
	private diagnosticsEl: HTMLElement | null = null;
	private destinationEl: HTMLElement | null = null;
	private importButton: HTMLButtonElement | null = null;
	private cancelButton: HTMLButtonElement | null = null;
	private readonly formControls: Array<
		HTMLInputElement | HTMLSelectElement
	> = [];
	private importing = false;
	private forceClosing = false;
	private contentMounted = false;
	private translator: ObMindTranslator;

	public constructor(
		app: App,
		private readonly options: MindMapImportModalOptions,
	) {
		super(app);
		this.translator = createObMindTranslator(
			options.language ?? DEFAULT_OBMIND_LANGUAGE,
		);
		const firstSheet = options.workbook.sheets[0];
		if (firstSheet === undefined) {
			throw new Error(this.t("import-modal.no-sheets"));
		}
		this.selectedSheetId = firstSheet.id;
		this.basename = createMindMapMarkdownImportPlan(
			options.workbook,
			firstSheet.id,
		).suggestedBasename;
	}

	public override onOpen(): void {
		this.contentMounted = true;
		this.renderOpenContent();
	}

	/**
	 * Refreshes product copy while retaining the selected sheet and destination
	 * draft. The import plan remains unchanged, so this cannot mutate a note.
	 */
	public setLanguage(language: ObMindLanguage): void {
		if (this.translator.language === language) {
			return;
		}
		this.translator = createObMindTranslator(language);
		if (this.contentMounted) {
			this.renderOpenContent();
		}
	}

	private renderOpenContent(): void {
		this.modalEl.addClass("obmind-import-modal-shell");
		this.titleEl.textContent = this.t("import-modal.title");
		this.contentEl.empty();
		this.contentEl.addClass("obmind-import-modal");
		this.formControls.length = 0;
		this.detailsEl = null;
		this.diagnosticsEl = null;
		this.destinationEl = null;
		this.importButton = null;
		this.cancelButton = null;

		const summary = this.contentEl.createDiv("obmind-import-summary");
		summary.createEl("strong", { text: this.options.workbook.sourceName });
		summary.createSpan({
			text: ` · ${formatImportFormat(this.options.workbook.format)}`,
		});

		if (this.options.workbook.sheets.length > 1) {
			new Setting(this.contentEl)
				.setName(this.t("import-modal.sheet.name"))
				.setDesc(this.t("import-modal.sheet.description"))
				.addDropdown((dropdown) => {
					this.formControls.push(dropdown.selectEl);
					dropdown.selectEl.setAttribute(
						"aria-label",
						this.t("import-modal.sheet.aria-label"),
					);
					for (const sheet of this.options.workbook.sheets) {
						dropdown.addOption(sheet.id, sheet.title || sheet.root.text);
					}
					dropdown.setValue(this.selectedSheetId).onChange((value) => {
						this.selectedSheetId = value;
						this.basename = createMindMapMarkdownImportPlan(
							this.options.workbook,
							value,
						).suggestedBasename;
						this.renderDynamicContent();
					});
				});
		}

		new Setting(this.contentEl)
			.setName(this.t("import-modal.note-name.name"))
			.setDesc(this.t("import-modal.note-name.description"))
			.addText((text) => {
				this.formControls.push(text.inputEl);
				text.inputEl.setAttribute(
					"aria-label",
					this.t("import-modal.note-name.aria-label"),
				);
				text.setValue(this.basename).onChange((value) => {
					this.basename = value;
					this.renderDynamicContent();
				});
				text.inputEl.addClass("obmind-import-name-input");
			});

		this.detailsEl = this.contentEl.createDiv("obmind-import-details");
		this.destinationEl = this.contentEl.createDiv(
			"obmind-import-destination",
		);
		this.diagnosticsEl = this.contentEl.createDiv(
			"obmind-import-diagnostics",
		);

		const actions = this.contentEl.createDiv("obmind-import-actions");
		this.cancelButton = actions.createEl("button", {
			text: this.t("common.cancel"),
		});
		this.cancelButton.addClass("obmind-import-cancel");
		this.cancelButton.setAttribute(
			"aria-label",
			this.t("import-modal.cancel.aria-label"),
		);
		this.cancelButton.title = this.t("import-modal.cancel.title");
		this.cancelButton.addEventListener("click", () => this.close());
		this.importButton = actions.createEl("button", {
			text: this.t("import-modal.import"),
		});
		this.importButton.addClass("mod-cta", "obmind-import-confirm");
		this.importButton.setAttribute(
			"aria-label",
			this.t("import-modal.confirm.aria-label"),
		);
		this.importButton.title = this.t("import-modal.confirm.title");
		this.importButton.addEventListener("click", () => {
			void this.handleImport();
		});
		this.renderDynamicContent();
	}

	public override close(): void {
		if (this.importing && !this.forceClosing) {
			return;
		}
		super.close();
	}

	public forceClose(): void {
		this.forceClosing = true;
		super.close();
	}

	public override onClose(): void {
		this.contentMounted = false;
		this.modalEl.removeClass("obmind-import-modal-shell");
		this.contentEl.empty();
		this.detailsEl = null;
		this.diagnosticsEl = null;
		this.destinationEl = null;
		this.importButton = null;
		this.cancelButton = null;
		this.formControls.length = 0;
		this.options.closed?.();
	}

	private renderDynamicContent(): void {
		if (
			this.detailsEl === null ||
			this.diagnosticsEl === null ||
			this.destinationEl === null
		) {
			return;
		}
		const plan = createMindMapMarkdownImportPlan(
			this.options.workbook,
			this.selectedSheetId,
		);
		const sheet = this.options.workbook.sheets.find(
			(candidate) => candidate.id === this.selectedSheetId,
		);
		if (sheet === undefined) {
			return;
		}
		this.detailsEl.empty();
		this.detailsEl.createDiv({
			text: this.t("import-modal.central-topic", {
				topic: sheet.root.text,
			}),
		});
		const topicCount = countImportedTopics(sheet);
		this.detailsEl.createDiv({
			text: this.t("import-modal.topics-found", {
				count: this.translator.formatNumber(topicCount),
				attachedCount: this.translator.formatNumber(
					Math.max(0, topicCount - 1),
				),
			}),
		});

		const safeBasename = sanitizeImportedBasename(this.basename);
		this.destinationEl.textContent = this.t("import-modal.destination", {
			path: this.options.resolveDestinationPath(safeBasename),
		});
		this.diagnosticsEl.empty();
		if (plan.diagnostics.length === 0) {
			this.diagnosticsEl.createDiv({
				cls: "obmind-import-diagnostic obmind-import-diagnostic-info",
				text: this.t("import-modal.no-losses"),
			});
		} else {
			this.diagnosticsEl.createEl("h3", {
				text: this.t("import-modal.not-preserved"),
			});
			const list = this.diagnosticsEl.createEl("ul");
			for (const diagnostic of plan.diagnostics) {
				list.createEl("li", {
					cls: `obmind-import-diagnostic obmind-import-diagnostic-${diagnostic.severity}`,
					text: localizeImportDiagnostic(diagnostic, this.translator),
				});
			}
		}
		if (this.importButton !== null) {
			this.importButton.disabled = this.importing;
			this.importButton.textContent = this.importing
				? this.t("import-modal.importing")
				: this.t("import-modal.import");
		}
		if (this.cancelButton !== null) {
			this.cancelButton.disabled = this.importing;
		}
		for (const control of this.formControls) {
			control.disabled = this.importing;
		}
	}

	private async handleImport(): Promise<void> {
		if (this.importing) {
			return;
		}
		this.importing = true;
		this.renderDynamicContent();
		const basePlan = createMindMapMarkdownImportPlan(
			this.options.workbook,
			this.selectedSheetId,
		);
		const safeBasename = sanitizeImportedBasename(this.basename);
		const plan = { ...basePlan, suggestedBasename: safeBasename };
		const destinationPath = this.options.resolveDestinationPath(safeBasename);
		try {
			await this.options.confirmImport(plan, destinationPath);
			this.importing = false;
			this.close();
		} catch (error: unknown) {
			this.importing = false;
			if (this.forceClosing) {
				return;
			}
			this.renderDynamicContent();
			new Notice(
				localizeImportFailure(error, this.translator),
			);
		}
	}

	private t(
		key: ObMindTranslationKey,
		values?: Readonly<Record<string, string | number>>,
	): string {
		return this.translator.t(key, values);
	}
}

const IMPORT_DIAGNOSTIC_KEYS: Readonly<
	Record<string, ObMindTranslationKey>
> = Object.freeze({
	"root-title-sanitized": "import-diagnostic.root-title-sanitized",
	"root-task-omitted": "import-diagnostic.root-task-omitted",
	"mindmeister-presentation-omitted":
		"import-diagnostic.mindmeister-presentation-omitted",
	"mindmanager-presentation-omitted":
		"import-diagnostic.mindmanager-presentation-omitted",
	"xmind-styles-omitted": "import-diagnostic.xmind-styles-omitted",
	"xmind-detached-topics-omitted":
		"import-diagnostic.xmind-detached-topics-omitted",
	"xmind-summaries-omitted": "import-diagnostic.xmind-summaries-omitted",
	"xmind-relationships-omitted":
		"import-diagnostic.xmind-relationships-omitted",
	"xmind-notes-omitted": "import-diagnostic.xmind-notes-omitted",
	"xmind-labels-omitted": "import-diagnostic.xmind-labels-omitted",
	"xmind-images-omitted": "import-diagnostic.xmind-images-omitted",
	"xmind-boundaries-omitted": "import-diagnostic.xmind-boundaries-omitted",
	"xmind-markers-omitted": "import-diagnostic.xmind-markers-omitted",
	"xmind-manifest-unreadable":
		"import-diagnostic.xmind-manifest-unreadable",
});

function localizeImportDiagnostic(
	diagnostic: MindMapImportDiagnostic,
	translator: ObMindTranslator,
): string {
	const key = IMPORT_DIAGNOSTIC_KEYS[diagnostic.code];
	return translator.t(key ?? "import-diagnostic.unknown");
}

function localizeImportFailure(
	error: unknown,
	translator: ObMindTranslator,
): string {
	if (error instanceof MindMapImportError) {
		return translator.t(
			`import-error.${error.code}` as ObMindTranslationKey,
		);
	}
	return localizeObMindError(
		error,
		translator,
		"import-modal.import-failed",
	);
}

function formatImportFormat(
	format: ImportedMindMapWorkbook["format"],
): string {
	switch (format) {
		case "xmind":
			return "XMind";
		case "mindmeister":
			return "MindMeister";
		case "mindmanager":
			return "MindManager";
	}
}
