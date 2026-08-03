import {
	type MindMapExportArtifact,
	MindMapExportError,
} from "./types";

export interface MindMapExportArtifactSink {
	save(artifact: MindMapExportArtifact): Promise<void>;
}

interface MindMapExportHtmlElementFactory {
	createElement<K extends keyof HTMLElementTagNameMap>(
		tagName: K,
	): HTMLElementTagNameMap[K];
}

export function createBrowserDownloadMindMapExportSink(
	ownerDocument: Document,
): MindMapExportArtifactSink {
	return {
		async save(artifact): Promise<void> {
			const urlApi = ownerDocument.defaultView?.URL ?? URL;
			let url: string | null = null;
			try {
				const bytes = new Uint8Array(artifact.bytes.byteLength);
				bytes.set(artifact.bytes);
				url = urlApi.createObjectURL(
					new Blob([bytes.buffer], { type: artifact.mimeType }),
				);
				const elementFactory: MindMapExportHtmlElementFactory = ownerDocument;
				const link = elementFactory.createElement("a");
				link.className = "obmind-export-download-link";
				link.href = url;
				link.download = artifact.fileName;
				link.hidden = true;
				ownerDocument.body.append(link);
				link.click();
				link.remove();
				await new Promise<void>((resolve) => {
					(ownerDocument.defaultView ?? window).setTimeout(resolve, 0);
				});
			} catch (error: unknown) {
				throw new MindMapExportError(
					error instanceof Error
						? `Could not save the exported mind map: ${error.message}`
						: "Could not save the exported mind map.",
					"save-failed",
				);
			} finally {
				if (url !== null) {
					urlApi.revokeObjectURL(url);
				}
			}
		},
	};
}
