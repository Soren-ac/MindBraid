import type {
	LayoutOrientation,
	MindMapNodeKind,
} from "../core/model";
import type {
	MindMapNodePresentation,
	MindMapNodeRole,
	MindMapThemeSpec,
} from "../presentation/presentation";

/**
 * Logical node-content sizing is intentionally independent from DOM/CSS.
 *
 * DOM renderers can map inline/block sizes to CSS logical properties, while a
 * Canvas renderer can use the same values when measuring and wrapping text.
 * A mind-map orientation changes the branch flow, not the writing direction of
 * the topic text.
 */
export interface MindMapBranchFlow {
	readonly axis: "x" | "y";
	readonly sign: -1 | 1;
}

export interface MindMapNodeTextWrapPolicy {
	/**
	 * `fit-content` lets short topics remain compact and constrains long topics
	 * to `maxInlineSize` before wrapping.
	 */
	readonly inlineSizing: "fit-content";
	/** Preserve explicit topic line breaks while allowing ordinary wrapping. */
	readonly whiteSpace: "pre-wrap";
	/**
	 * `anywhere` is required for long CJK and unbroken identifier/URL-like
	 * strings. Unlike `break-word`, it participates in intrinsic sizing.
	 */
	readonly overflowWrap: "anywhere";
	readonly wordBreak: "normal";
	readonly textDirection: "auto";
	readonly overflowInline: "visible";
	readonly overflowBlock: "visible";
}

export interface MindMapNodeEditorLayoutPolicy {
	readonly whiteSpace: "pre-wrap";
	readonly overflowWrap: "anywhere";
	readonly wordBreak: "normal";
	readonly maxBlockSize: number;
	/**
	 * The editor grows with its content until `maxBlockSize`, then becomes
	 * vertically scrollable. Display nodes themselves do not scroll.
	 */
	readonly overflowBlock: "auto";
	readonly overflowInline: "hidden";
	readonly resize: "none";
}

export interface MindMapNodeContentLayoutPolicy {
	readonly role: MindMapNodeRole;
	readonly orientation: LayoutOrientation;
	readonly branchFlow: MindMapBranchFlow;
	readonly minInlineSize: number;
	readonly maxInlineSize: number;
	readonly text: MindMapNodeTextWrapPolicy;
	readonly editor: MindMapNodeEditorLayoutPolicy;
}

export interface MindMapNodeContentLayoutContext {
	readonly kind: MindMapNodeKind;
	readonly depth: number;
	readonly orientation: LayoutOrientation;
	readonly theme: MindMapThemeSpec;
	/**
	 * Sparse per-node presentation. Its role and max width take precedence over
	 * the corresponding theme role and theme-wide node token.
	 */
	readonly nodePresentation?: MindMapNodePresentation;
	/**
	 * Adapter- or document-specific constraints. These are presentation-only
	 * and must never be persisted in `MindMapNode`.
	 */
	readonly constraints?: MindMapNodeContentLayoutConstraints;
}

export interface MindMapNodeContentLayoutConstraints {
	readonly minInlineSize?: number;
	readonly maxInlineSize?: number;
	readonly editorMaxBlockSize?: number;
}

export interface MindMapNodeContentRoleProfile {
	readonly minInlineSize: number;
	readonly fallbackMaxInlineSize: number;
	readonly editorMaxBlockSize: number;
}

export interface MindMapNodeContentLayoutStrategy {
	readonly id: string;
	readonly revision: string | number;
	resolve(
		context: MindMapNodeContentLayoutContext,
	): MindMapNodeContentLayoutPolicy;
}

export interface MindMapNodeContentLayoutStrategyOptions {
	readonly id?: string;
	readonly revision?: string | number;
	readonly roles?: Partial<
		Readonly<
			Record<
				MindMapNodeRole,
				Partial<MindMapNodeContentRoleProfile>
			>
		>
	>;
}

export interface MindMapNodeEditorBlockLayout {
	readonly blockSize: number;
	readonly scrollable: boolean;
}

export const DEFAULT_MIND_MAP_NODE_CONTENT_ROLE_PROFILES: Readonly<
	Record<MindMapNodeRole, MindMapNodeContentRoleProfile>
> = Object.freeze({
	root: Object.freeze({
		minInlineSize: 144,
		fallbackMaxInlineSize: 360,
		editorMaxBlockSize: 240,
	}),
	"main-topic": Object.freeze({
		minInlineSize: 88,
		fallbackMaxInlineSize: 320,
		editorMaxBlockSize: 224,
	}),
	subtopic: Object.freeze({
		minInlineSize: 48,
		fallbackMaxInlineSize: 280,
		editorMaxBlockSize: 192,
	}),
});

const DEFAULT_TEXT_POLICY: MindMapNodeTextWrapPolicy = Object.freeze({
	inlineSizing: "fit-content",
	whiteSpace: "pre-wrap",
	overflowWrap: "anywhere",
	wordBreak: "normal",
	textDirection: "auto",
	overflowInline: "visible",
	overflowBlock: "visible",
});

/**
 * Creates the built-in adaptive-content policy. The strategy object is a
 * replaceable renderer dependency rather than a hard-coded theme switch.
 */
export function createMindMapNodeContentLayoutStrategy(
	options: MindMapNodeContentLayoutStrategyOptions = {},
): MindMapNodeContentLayoutStrategy {
	const profiles = {
		root: mergeRoleProfile(
			DEFAULT_MIND_MAP_NODE_CONTENT_ROLE_PROFILES.root,
			options.roles?.root,
		),
		"main-topic": mergeRoleProfile(
			DEFAULT_MIND_MAP_NODE_CONTENT_ROLE_PROFILES["main-topic"],
			options.roles?.["main-topic"],
		),
		subtopic: mergeRoleProfile(
			DEFAULT_MIND_MAP_NODE_CONTENT_ROLE_PROFILES.subtopic,
			options.roles?.subtopic,
		),
	} satisfies Record<MindMapNodeRole, MindMapNodeContentRoleProfile>;

	return Object.freeze({
		id: options.id ?? "adaptive-wrap",
		revision: options.revision ?? 1,
		resolve(
			context: MindMapNodeContentLayoutContext,
		): MindMapNodeContentLayoutPolicy {
			return resolveMindMapNodeContentLayout(context, profiles);
		},
	});
}

/**
 * Pure resolver used by the default strategy and available to adapters that
 * keep their own strategy registry.
 */
export function resolveMindMapNodeContentLayout(
	context: MindMapNodeContentLayoutContext,
	profiles: Readonly<
		Record<MindMapNodeRole, MindMapNodeContentRoleProfile>
	> = DEFAULT_MIND_MAP_NODE_CONTENT_ROLE_PROFILES,
): MindMapNodeContentLayoutPolicy {
	const role =
		context.nodePresentation?.role ??
		resolveMindMapNodeContentRole(context.kind, context.depth);
	const profile = profiles[role];
	const rolePresentation = getThemeRolePresentation(
		context.theme,
		role,
	);
	const maxInlineSize = firstPositiveFinite(
		context.constraints?.maxInlineSize,
		context.nodePresentation?.maxWidth,
		rolePresentation.maxWidth,
		context.theme.tokens.node.maxWidth,
		profile.fallbackMaxInlineSize,
	);
	const requestedMinInlineSize = firstNonNegativeFinite(
		context.constraints?.minInlineSize,
		profile.minInlineSize,
	);
	const minInlineSize = Math.min(
		requestedMinInlineSize,
		maxInlineSize,
	);
	const editorMaxBlockSize = firstPositiveFinite(
		context.constraints?.editorMaxBlockSize,
		profile.editorMaxBlockSize,
	);

	return {
		role,
		orientation: context.orientation,
		branchFlow: resolveMindMapBranchFlow(context.orientation),
		minInlineSize,
		maxInlineSize,
		text: DEFAULT_TEXT_POLICY,
		editor: {
			whiteSpace: "pre-wrap",
			overflowWrap: "anywhere",
			wordBreak: "normal",
			maxBlockSize: editorMaxBlockSize,
			overflowBlock: "auto",
			overflowInline: "hidden",
			resize: "none",
		},
	};
}

export function resolveMindMapNodeContentRole(
	kind: MindMapNodeKind,
	depth: number,
): MindMapNodeRole {
	if (kind === "root") {
		return "root";
	}
	return Number.isFinite(depth) && depth === 1
		? "main-topic"
		: "subtopic";
}

export function resolveMindMapBranchFlow(
	orientation: LayoutOrientation,
): MindMapBranchFlow {
	switch (orientation) {
		case "left-to-right":
			return { axis: "x", sign: 1 };
		case "right-to-left":
			return { axis: "x", sign: -1 };
		case "top-to-bottom":
			return { axis: "y", sign: 1 };
		case "bottom-to-top":
			return { axis: "y", sign: -1 };
	}
}

/**
 * Canvas/SVG text measurers can use this helper after measuring an intrinsic
 * single-line width. DOM adapters get the same behavior from `fit-content`.
 */
export function constrainMindMapNodeIntrinsicInlineSize(
	intrinsicInlineSize: number,
	policy: Pick<
		MindMapNodeContentLayoutPolicy,
		"minInlineSize" | "maxInlineSize"
	>,
): number {
	const safeMinimum = firstNonNegativeFinite(
		policy.minInlineSize,
		0,
	);
	const safeMaximum = Math.max(
		safeMinimum,
		firstPositiveFinite(policy.maxInlineSize, safeMinimum || 1),
	);
	const safeIntrinsic = Number.isFinite(intrinsicInlineSize)
		? Math.max(0, intrinsicInlineSize)
		: safeMinimum;
	return Math.min(
		safeMaximum,
		Math.max(safeMinimum, safeIntrinsic),
	);
}

/**
 * Convert textarea content and border measurements into a border-box height.
 * The border adjustment prevents a one- or two-pixel accidental scrollbar
 * while content is still below the configured editor limit.
 */
export function resolveMindMapNodeEditorBlockLayout(
	contentBlockSize: number,
	borderBlockSize: number,
	maxBlockSize: number,
): MindMapNodeEditorBlockLayout {
	const safeContent = Number.isFinite(contentBlockSize)
		? Math.max(0, contentBlockSize)
		: 0;
	const safeBorder = Number.isFinite(borderBlockSize)
		? Math.max(0, borderBlockSize)
		: 0;
	const naturalBlockSize = safeContent + safeBorder;
	const safeMaximum =
		Number.isFinite(maxBlockSize) && maxBlockSize > 0
			? maxBlockSize
			: naturalBlockSize;

	return {
		blockSize: Math.min(naturalBlockSize, safeMaximum),
		scrollable: naturalBlockSize > safeMaximum + 0.5,
	};
}

function getThemeRolePresentation(
	theme: MindMapThemeSpec,
	role: MindMapNodeRole,
): MindMapNodePresentation {
	switch (role) {
		case "root":
			return theme.tokens.roles.root;
		case "main-topic":
			return theme.tokens.roles.mainTopic;
		case "subtopic":
			return theme.tokens.roles.subtopic;
	}
}

function mergeRoleProfile(
	base: MindMapNodeContentRoleProfile,
	override: Partial<MindMapNodeContentRoleProfile> | undefined,
): MindMapNodeContentRoleProfile {
	return Object.freeze({
		minInlineSize: firstNonNegativeFinite(
			override?.minInlineSize,
			base.minInlineSize,
		),
		fallbackMaxInlineSize: firstPositiveFinite(
			override?.fallbackMaxInlineSize,
			base.fallbackMaxInlineSize,
		),
		editorMaxBlockSize: firstPositiveFinite(
			override?.editorMaxBlockSize,
			base.editorMaxBlockSize,
		),
	});
}

function firstPositiveFinite(
	...values: readonly (number | undefined)[]
): number {
	for (const value of values) {
		if (
			value !== undefined &&
			Number.isFinite(value) &&
			value > 0
		) {
			return value;
		}
	}
	return 1;
}

function firstNonNegativeFinite(
	...values: readonly (number | undefined)[]
): number {
	for (const value of values) {
		if (
			value !== undefined &&
			Number.isFinite(value) &&
			value >= 0
		) {
			return value;
		}
	}
	return 0;
}
