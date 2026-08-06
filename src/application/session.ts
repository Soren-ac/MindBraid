import type { MindMapDocument, MindMapNode } from "../core/model";
import { reconcileMindMapNode } from "../topic/node-identity";
import type {
	MindMapInteractionState,
	MindMapPresentation,
	MindMapViewportState,
} from "../presentation/presentation";
import { normalizeMindMapVisibleDepthLimit } from "../topic/interaction/node-focus";

/**
 * Transient state for one open mind-map tab. It is deliberately independent
 * from the Markdown controller and the explicit host-owned source edit path.
 */
export class MindMapViewSession {
	private readonly collapsedNodeIds = new Set<string>();
	private readonly selectedNodeIds = new Set<string>();
	private primarySelectedNodeId: string | null = null;
	private selectionAnchorNodeId: string | null = null;
	private focusedNodeId: string | null = null;
	private hoveredNodeId: string | null = null;
	private focusRootNodeId: string | null = null;
	private visibleDepthLimit: number | null = null;
	private selectedDecorationId: string | null = null;
	private minimapVisible = false;
	private viewport: MindMapViewportState | null = null;
	private documentPresentationOverride: MindMapPresentation | null = null;
	private viewPresentationOverride: MindMapPresentation | null = null;

	public getPresentationOverride(): MindMapPresentation | null {
		return (
			this.viewPresentationOverride ??
			this.documentPresentationOverride
		);
	}

	public getViewPresentationOverride(): MindMapPresentation | null {
		return this.viewPresentationOverride;
	}

	public getDocumentPresentationOverride(): MindMapPresentation | null {
		return this.documentPresentationOverride;
	}

	public setViewPresentationOverride(
		presentation: MindMapPresentation | null,
	): void {
		this.viewPresentationOverride = presentation;
		this.reconcileSelectedDecoration();
	}

	public setDocumentPresentationOverride(
		presentation: MindMapPresentation | null,
	): void {
		this.documentPresentationOverride = presentation;
		this.reconcileSelectedDecoration();
	}

	public clearPresentationOverrides(): void {
		this.documentPresentationOverride = null;
		this.viewPresentationOverride = null;
		this.reconcileSelectedDecoration();
	}

	public updateEffectivePresentationOverride(
		update: (presentation: MindMapPresentation) => MindMapPresentation,
	): void {
		if (this.viewPresentationOverride !== null) {
			this.viewPresentationOverride = update(this.viewPresentationOverride);
			this.reconcileSelectedDecoration();
			return;
		}
		if (this.documentPresentationOverride !== null) {
			this.documentPresentationOverride = update(
				this.documentPresentationOverride,
			);
			this.reconcileSelectedDecoration();
		}
	}

	public hydrateDocumentState(
		presentation: MindMapPresentation | null,
		collapsedNodeIds: ReadonlySet<string>,
		viewport: MindMapViewportState | null,
		viewportPolicy: "replace" | "preserve" = "replace",
	): void {
		this.documentPresentationOverride = presentation;
		this.collapsedNodeIds.clear();
		for (const nodeId of collapsedNodeIds) {
			this.collapsedNodeIds.add(nodeId);
		}
		if (viewportPolicy === "replace") {
			this.viewport = viewport === null ? null : { ...viewport };
		}
		this.reconcileSelectedDecoration();
	}

	public getInteractionState(): MindMapInteractionState {
		return {
			collapsedNodeIds: new Set(this.collapsedNodeIds),
			selectedNodeIds: new Set(this.selectedNodeIds),
			primarySelectedNodeId: this.primarySelectedNodeId,
			selectionAnchorNodeId: this.selectionAnchorNodeId,
			focusedNodeId: this.focusedNodeId,
			hoveredNodeId: this.hoveredNodeId,
			focusRootNodeId: this.focusRootNodeId,
			visibleDepthLimit: this.visibleDepthLimit,
			selectedDecorationId: this.selectedDecorationId,
			minimapVisible: this.minimapVisible,
			viewport: this.viewport,
		};
	}

	public resetAll(): void {
		this.resetInteraction();
		this.clearPresentationOverrides();
	}

	public resetForSource(): void {
		this.resetInteraction();
		this.documentPresentationOverride = null;
		this.viewPresentationOverride = clearSourcePresentationOverrides(
			this.viewPresentationOverride,
		);
	}

	public prepareForStructuralSourceChange(): void {
		this.documentPresentationOverride = clearSourcePresentationOverrides(
			this.documentPresentationOverride,
		);
		this.viewPresentationOverride = clearSourcePresentationOverrides(
			this.viewPresentationOverride,
		);
	}

	public resetInteraction(): void {
		this.collapsedNodeIds.clear();
		this.selectedNodeIds.clear();
		this.primarySelectedNodeId = null;
		this.selectionAnchorNodeId = null;
		this.focusedNodeId = null;
		this.hoveredNodeId = null;
		this.focusRootNodeId = null;
		this.visibleDepthLimit = null;
		this.selectedDecorationId = null;
		this.minimapVisible = false;
		this.viewport = null;
	}

	public clearViewport(): void {
		this.viewport = null;
	}

	public setViewport(viewport: MindMapViewportState): void {
		this.viewport = { ...viewport };
	}

	public restoreViewport(viewport: MindMapViewportState | null): void {
		this.viewport = viewport === null ? null : { ...viewport };
	}

	/** Restores the view-local state captured before a presentation preview. */
	public restorePresentationPreviewBaseline(
		viewPresentationOverride: MindMapPresentation | null,
		viewport: MindMapViewportState | null,
	): void {
		this.setViewPresentationOverride(viewPresentationOverride);
		this.restoreViewport(viewport);
	}

	public setSelection(
		selectedNodeIds: ReadonlySet<string>,
		primaryNodeId: string | null,
		anchorNodeId: string | null = primaryNodeId,
	): void {
		this.selectedNodeIds.clear();
		for (const id of selectedNodeIds) {
			this.selectedNodeIds.add(id);
		}
		this.primarySelectedNodeId =
			primaryNodeId !== null && this.selectedNodeIds.has(primaryNodeId)
				? primaryNodeId
				: null;
		this.selectionAnchorNodeId =
			anchorNodeId !== null && this.selectedNodeIds.has(anchorNodeId)
				? anchorNodeId
				: this.primarySelectedNodeId;
		this.focusedNodeId = this.primarySelectedNodeId;
		if (this.selectedNodeIds.size > 0) {
			this.selectedDecorationId = null;
		}
	}

	public setFocusedNode(nodeId: string | null): void {
		this.focusedNodeId = nodeId;
	}

	public setHoveredNode(nodeId: string | null): void {
		this.hoveredNodeId = nodeId;
	}

	public setFocusRoot(root: MindMapNode, nodeId: string | null): boolean {
		const nextId =
			nodeId === null || nodeId === root.id
				? null
				: findNode(root, nodeId)?.id ?? null;
		if (nextId === this.focusRootNodeId) {
			return false;
		}
		this.focusRootNodeId = nextId;
		this.viewport = null;
		this.selectedDecorationId = null;
		if (nextId !== null) {
			this.setSelection(new Set([nextId]), nextId, nextId);
		}
		return true;
	}

	public setVisibleDepthLimit(limit: number | null): boolean {
		const normalized = normalizeMindMapVisibleDepthLimit(limit);
		if (normalized === this.visibleDepthLimit) {
			return false;
		}
		this.visibleDepthLimit = normalized;
		this.viewport = null;
		return true;
	}

	public setSelectedDecoration(decorationId: string | null): boolean {
		const next =
			decorationId !== null &&
			this.getPresentationOverride()?.decorations.some(
				(decoration) => decoration.id === decorationId,
			)
				? decorationId
				: null;
		if (next === this.selectedDecorationId) {
			return false;
		}
		this.selectedDecorationId = next;
		if (next !== null) {
			this.setSelection(new Set(), null, null);
		}
		return true;
	}

	public setMinimapVisible(visible: boolean): boolean {
		if (visible === this.minimapVisible) {
			return false;
		}
		this.minimapVisible = visible;
		return true;
	}

	public toggleNode(root: MindMapNode, nodeId: string): boolean {
		const node = findNode(root, nodeId);
		if (node === null || node.children.length === 0) {
			return false;
		}

		if (this.collapsedNodeIds.has(nodeId)) {
			this.collapsedNodeIds.delete(nodeId);
		} else {
			this.collapsedNodeIds.add(nodeId);
		}
		return true;
	}

	public revealNode(root: MindMapNode, nodeId: string): boolean {
		const path = findNodePath(root, nodeId);
		if (path === null) {
			return false;
		}
		for (const ancestor of path.slice(0, -1)) {
			this.collapsedNodeIds.delete(ancestor.id);
		}
		if (
			this.focusRootNodeId !== null &&
			!path.some((node) => node.id === this.focusRootNodeId)
		) {
			this.focusRootNodeId = null;
		}
		if (this.visibleDepthLimit !== null) {
			const focusIndex =
				this.focusRootNodeId === null
					? 0
					: path.findIndex((node) => node.id === this.focusRootNodeId);
			if (
				focusIndex < 0 ||
				path.length - 1 - focusIndex > this.visibleDepthLimit
			) {
				this.visibleDepthLimit = null;
			}
		}
		this.setSelection(new Set([nodeId]), nodeId, nodeId);
		return true;
	}

	public expandAll(): void {
		this.collapsedNodeIds.clear();
	}

	/**
	 * Keep the document root and its first level visible.
	 */
	public collapseAll(root: MindMapNode): void {
		this.collapsedNodeIds.clear();
		for (const child of root.children) {
			collectBranchNodeIds(child, this.collapsedNodeIds);
		}
	}

	public reconcileDocument(
		previousDocument: MindMapDocument,
		nextDocument: MindMapDocument,
	): void {
		const reconciled = new Map<string, MindMapNode | null>();
		const reconcileId = (nodeId: string | null): MindMapNode | null => {
			if (nodeId === null) {
				return null;
			}
			const cached = reconciled.get(nodeId);
			if (cached !== undefined || reconciled.has(nodeId)) {
				return cached ?? null;
			}
			const match = reconcileMindMapNode(
				previousDocument,
				nextDocument,
				nodeId,
			);
			const node =
				match === null ||
				(match.strategy === "source-anchor" &&
					match.previousLocator.node.siblingOccurrenceCount > 1 &&
					match.previousLocator.node.siblingOccurrence !==
						match.nextLocator.node.siblingOccurrence)
					? null
					: match.nextNode;
			reconciled.set(nodeId, node);
			return node;
		};

		const nextCollapsed = new Set<string>();
		for (const id of this.collapsedNodeIds) {
			const node = reconcileId(id);
			if (node !== null && node.children.length > 0) {
				nextCollapsed.add(node.id);
			}
		}
		this.collapsedNodeIds.clear();
		for (const id of nextCollapsed) {
			this.collapsedNodeIds.add(id);
		}

		const previousPrimary = this.primarySelectedNodeId;
		const previousAnchor = this.selectionAnchorNodeId;
		const nextSelected = new Set<string>();
		for (const id of this.selectedNodeIds) {
			const node = reconcileId(id);
			if (node !== null) {
				nextSelected.add(node.id);
			}
		}
		this.selectedNodeIds.clear();
		for (const id of nextSelected) {
			this.selectedNodeIds.add(id);
		}

		const nextPrimary = reconcileId(previousPrimary)?.id ?? null;
		this.primarySelectedNodeId =
			nextPrimary !== null && this.selectedNodeIds.has(nextPrimary)
				? nextPrimary
				: (this.selectedNodeIds.values().next().value ?? null);
		const nextAnchor = reconcileId(previousAnchor)?.id ?? null;
		this.selectionAnchorNodeId =
			nextAnchor !== null && this.selectedNodeIds.has(nextAnchor)
				? nextAnchor
				: this.primarySelectedNodeId;
		this.focusedNodeId = reconcileId(this.focusedNodeId)?.id ?? null;
		this.hoveredNodeId = reconcileId(this.hoveredNodeId)?.id ?? null;
		this.focusRootNodeId = reconcileId(this.focusRootNodeId)?.id ?? null;
		this.reconcileSelectedDecoration();
	}

	private reconcileSelectedDecoration(): void {
		if (
			this.selectedDecorationId !== null &&
			!this.getPresentationOverride()?.decorations.some(
				(decoration) => decoration.id === this.selectedDecorationId,
			)
		) {
			this.selectedDecorationId = null;
		}
	}

}

function clearSourcePresentationOverrides(
	presentation: MindMapPresentation | null,
): MindMapPresentation | null {
	if (presentation === null) {
		return null;
	}
	return {
		...presentation,
		revision: presentation.revision + 1,
		nodes: new Map(),
		edges: new Map(),
		decorations: [],
	};
}

function findNode(root: MindMapNode, id: string): MindMapNode | null {
	const pending: MindMapNode[] = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === undefined) {
			continue;
		}
		if (node.id === id) {
			return node;
		}
		for (const child of node.children) {
			pending.push(child);
		}
	}
	return null;
}

function findNodePath(
	root: MindMapNode,
	id: string,
	path: readonly MindMapNode[] = [],
): readonly MindMapNode[] | null {
	const nextPath = [...path, root];
	if (root.id === id) {
		return nextPath;
	}
	for (const child of root.children) {
		const result = findNodePath(child, id, nextPath);
		if (result !== null) {
			return result;
		}
	}
	return null;
}

function collectBranchNodeIds(
	node: MindMapNode,
	branchIds: Set<string>,
): void {
	if (node.children.length === 0) {
		return;
	}
	branchIds.add(node.id);
	for (const child of node.children) {
		collectBranchNodeIds(child, branchIds);
	}
}
