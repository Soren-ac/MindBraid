// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import { BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION } from "../src/application/composition/built-in-composition";
import { parseMarkdown } from "../src/core/parser";
import {
	createDefaultMindMapInteractionState,
	createDefaultMindMapPresentation,
	type MindMapColorScheme,
} from "../src/presentation/presentation";
import { DomSvgMindMapRenderer } from "../src/ui/renderer";

const MINIMUM_DEFAULT_TOPIC_TEXT_CONTRAST = 3;
const BRANCH_SAMPLE_COUNT = 8;

/**
 * Representative Obsidian semantic-token values used to assess the renderer's
 * CSS-variable output. The test deliberately resolves variables itself because
 * happy-dom does not calculate `var(...)` values from a host theme.
 */
const HOST_COLORS: Readonly<
	Record<MindMapColorScheme, Readonly<Record<string, string>>>
> = {
	light: {
		"background-primary": "#ffffff",
		"background-secondary": "#f5f5f5",
		"background-modifier-hover": "#f0f0f0",
		"background-modifier-border": "#d1d5db",
		"background-modifier-border-hover": "#9ca3af",
		"background-modifier-border-focus": "#2563eb",
		"interactive-accent": "#4f46e5",
		"text-normal": "#1f2937",
		"text-on-accent": "#ffffff",
		"text-muted": "#6b7280",
		"text-faint": "#94a3b8",
		"color-blue": "#2563eb",
		"color-green": "#15803d",
		"color-orange": "#c2410c",
		"color-red": "#dc2626",
		"color-purple": "#7e22ce",
		"color-cyan": "#0e7490",
		"color-pink": "#db2777",
		"color-yellow": "#a16207",
	},
	dark: {
		"background-primary": "#1e1e1e",
		"background-secondary": "#262626",
		"background-modifier-hover": "#303030",
		"background-modifier-border": "#454545",
		"background-modifier-border-hover": "#6b7280",
		"background-modifier-border-focus": "#60a5fa",
		"interactive-accent": "#4f46e5",
		"text-normal": "#e5e7eb",
		"text-on-accent": "#ffffff",
		"text-muted": "#a1a1aa",
		"text-faint": "#737373",
		"color-blue": "#60a5fa",
		"color-green": "#4ade80",
		"color-orange": "#fb923c",
		"color-red": "#f87171",
		"color-purple": "#c084fc",
		"color-cyan": "#22d3ee",
		"color-pink": "#f472b6",
		"color-yellow": "#facc15",
	},
};

interface RgbaColor {
	readonly red: number;
	readonly green: number;
	readonly blue: number;
	readonly alpha: number;
}

interface RenderedTopicColorSample {
	readonly role: string;
	readonly shape: string | undefined;
	readonly text: RgbaColor;
	readonly background: RgbaColor;
	readonly textCss: string;
	readonly fillCss: string;
}

afterEach(() => {
	document.body.replaceChildren();
});

describe("built-in node color contrast", () => {
	it("keeps default topic text above the minimum contrast threshold for every style, palette, and scheme", () => {
		const composition = BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION;
		expect(composition.capabilities.styles).toHaveLength(3);
		expect(composition.capabilities.palettes).toHaveLength(5);

		const violations: string[] = [];
		for (const colorScheme of ["light", "dark"] as const) {
			for (const style of composition.capabilities.styles) {
				for (const palette of composition.capabilities.palettes) {
					for (const topic of renderBuiltInTopicColorSamples(
						style.id,
						palette.id,
						colorScheme,
					)) {
						const contrast = contrastRatio(topic.text, topic.background);
						if (contrast < MINIMUM_DEFAULT_TOPIC_TEXT_CONTRAST) {
							violations.push(
								[
									`${style.id}/${palette.id}/${colorScheme}/${topic.role}`,
									`contrast ${contrast.toFixed(2)}`,
									`shape ${topic.shape ?? "default"}`,
									`text ${topic.textCss}`,
									`fill ${topic.fillCss}`,
								].join("; "),
							);
						}
					}
				}
			}
		}

		expect(violations).toEqual([]);
	});

	it("uses light text on Retro Autumn's deep fills and dark text on its light fills", () => {
		const samples = renderBuiltInTopicColorSamples(
			"colorful",
			"retro-autumn",
			"light",
		).filter((sample) => sample.role === "main-topic");
		expect(
			samples.slice(0, 5).map(({ fillCss, textCss }) => ({
				fill: fillCss,
				text: textCss,
			})),
		).toEqual([
			{ fill: "#E4A757", text: "#5C4A3D" },
			{ fill: "#7E8D70", text: "#FFFFFF" },
			{ fill: "#B25D4F", text: "#FFFFFF" },
			{ fill: "#C29B72", text: "#5C4A3D" },
			{ fill: "#6D5A50", text: "#FFFFFF" },
		]);
	});
});

function renderBuiltInTopicColorSamples(
	styleId: string,
	paletteId: string,
	colorScheme: MindMapColorScheme,
): readonly RenderedTopicColorSample[] {
	const mindMap = parseMarkdown(
		Array.from(
			{ length: BRANCH_SAMPLE_COUNT },
			(_, index) => `# Branch ${index + 1}\n## Child ${index + 1}`,
		).join("\n"),
		"Map.md",
		"Map",
	);
	const container = document.createElementNS(
		"http://www.w3.org/1999/xhtml",
		"div",
	) as HTMLDivElement;
	applyHostColors(container, colorScheme);
	document.body.append(container);
	const renderer = new DomSvgMindMapRenderer({
		interaction: () => undefined,
	});
	renderer.mount(container);
	const colorProbe = container.querySelector<HTMLElement>(
		".obmind-color-probe",
	);
	if (colorProbe === null) {
		throw new Error("Expected the renderer color probe to be mounted.");
	}
	// happy-dom does not inherit custom properties as completely as Chromium;
	// mirror the host tokens onto the probe while retaining the production path.
	applyHostColors(colorProbe, colorScheme);

	try {
		const presentation = createDefaultMindMapPresentation("left-to-right");
		renderer.render({
			root: mindMap.root,
			sourceRevision: mindMap.sourceRevision,
			language: "zh-CN",
			colorScheme,
			presentation: {
				...presentation,
				theme:
					BUILT_IN_MIND_MAP_FRONTEND_COMPOSITION.themeComposition.compose(
						styleId,
						paletteId,
					),
			},
			interaction: createDefaultMindMapInteractionState(),
			topicCommandAvailability: {
				hasInternalClipboard: false,
				hasUndoEntry: false,
				hasRedoEntry: false,
			},
		});

		const canvas = parseRenderedColor(
			container.style.getPropertyValue("--obmind-theme-canvas"),
			colorScheme,
		);
		const samples = Array.from(
			container.querySelectorAll<HTMLElement>(".obmind-node"),
		).map((node) => {
			const content = node.querySelector<HTMLElement>(
				".obmind-node-content",
			);
			if (content === null) {
				throw new Error("Expected each rendered topic to have content.");
			}
			const shape = node.dataset.obmindNodeShape;
			const fillCss = content.style.getPropertyValue("--obmind-node-fill");
			const textCss = content.style.getPropertyValue("--obmind-node-text");
			const fill = parseRenderedColor(fillCss, colorScheme);
			const text = parseRenderedColor(textCss, colorScheme);
			return {
				role: node.dataset.obmindNodeRole ?? "unknown",
				shape,
				text,
				background:
					shape === "none" || shape === "underline"
						? canvas
						: composite(fill, canvas),
				textCss,
				fillCss,
			};
		});

		expect(samples).toHaveLength(BRANCH_SAMPLE_COUNT * 2 + 1);
		return samples;
	} finally {
		renderer.destroy();
		container.remove();
	}
}

function applyHostColors(
	container: HTMLElement,
	colorScheme: MindMapColorScheme,
): void {
	for (const [token, value] of Object.entries(HOST_COLORS[colorScheme])) {
		container.style.setProperty(`--${token}`, value);
	}
}

function parseRenderedColor(
	value: string,
	colorScheme: MindMapColorScheme,
): RgbaColor {
	const normalized = value.trim();
	const hostToken = normalized.match(/^var\(--([a-z0-9-]+)\)$/iu)?.[1];
	const source =
		hostToken === undefined
			? normalized
			: HOST_COLORS[colorScheme][hostToken];
	if (source === undefined) {
		throw new Error(`No test color is registered for ${normalized}.`);
	}

	const hex = source.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu);
	if (hex !== null) {
		return parseHexColor(hex[1] ?? "");
	}
	const rgb = source.match(
		/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/u,
	);
	if (rgb !== null) {
		return {
			red: Number(rgb[1]),
			green: Number(rgb[2]),
			blue: Number(rgb[3]),
			alpha: rgb[4] === undefined ? 1 : Number(rgb[4]),
		};
	}
	throw new Error(`Unsupported rendered test color ${source}.`);
}

function parseHexColor(value: string): RgbaColor {
	const expanded =
		value.length === 3 || value.length === 4
			? [...value].map((channel) => `${channel}${channel}`).join("")
			: value;
	return {
		red: Number.parseInt(expanded.slice(0, 2), 16),
		green: Number.parseInt(expanded.slice(2, 4), 16),
		blue: Number.parseInt(expanded.slice(4, 6), 16),
		alpha:
			expanded.length === 8
				? Number.parseInt(expanded.slice(6, 8), 16) / 255
				: 1,
	};
}

function composite(
	foreground: RgbaColor,
	background: RgbaColor,
): RgbaColor {
	const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
	if (alpha === 0) {
		return { red: 0, green: 0, blue: 0, alpha: 0 };
	}
	return {
		red:
			(foreground.red * foreground.alpha +
				background.red * background.alpha * (1 - foreground.alpha)) /
			alpha,
		green:
			(foreground.green * foreground.alpha +
				background.green * background.alpha * (1 - foreground.alpha)) /
			alpha,
		blue:
			(foreground.blue * foreground.alpha +
				background.blue * background.alpha * (1 - foreground.alpha)) /
			alpha,
		alpha,
	};
}

function contrastRatio(foreground: RgbaColor, background: RgbaColor): number {
	const renderedForeground = composite(foreground, background);
	const foregroundLuminance = relativeLuminance(renderedForeground);
	const backgroundLuminance = relativeLuminance(background);
	return (
		(Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
		(Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
	);
}

function relativeLuminance(color: RgbaColor): number {
	const linear = [color.red, color.green, color.blue].map((channel) => {
		const normalized = channel / 255;
		return normalized <= 0.04045
			? normalized / 12.92
			: ((normalized + 0.055) / 1.055) ** 2.4;
	});
	const [red, green, blue] = linear;
	if (red === undefined || green === undefined || blue === undefined) {
		throw new Error("Expected RGB channels.");
	}
	return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}
