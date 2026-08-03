export const MIND_MAP_TASK_CONTROL_SIZE = 16;
export const MIND_MAP_TASK_CONTROL_GAP = 7;
export const MIND_MAP_TASK_CHECKMARK_VIEWBOX_SIZE = 16;
export const MIND_MAP_TASK_CHECKMARK_STROKE_WIDTH = 1.75;

export interface MindMapTaskCheckmarkBounds {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

const CHECKMARK_POINTS = Object.freeze([
	Object.freeze({ x: 4.25, y: 8.25 }),
	Object.freeze({ x: 7, y: 11 }),
	Object.freeze({ x: 11.75, y: 5.5 }),
]);

/**
 * Creates the deterministic checkmark shared by the live SVG control and all
 * export encoders. Invalid export bounds fall back to the canonical view box
 * rather than emitting non-finite path data.
 */
export function createMindMapTaskCheckmarkPathData(
	bounds: MindMapTaskCheckmarkBounds = {
		x: 0,
		y: 0,
		width: MIND_MAP_TASK_CHECKMARK_VIEWBOX_SIZE,
		height: MIND_MAP_TASK_CHECKMARK_VIEWBOX_SIZE,
	},
): string {
	const x = finiteOr(bounds.x, 0);
	const y = finiteOr(bounds.y, 0);
	const width = positiveFiniteOr(
		bounds.width,
		MIND_MAP_TASK_CHECKMARK_VIEWBOX_SIZE,
	);
	const height = positiveFiniteOr(
		bounds.height,
		MIND_MAP_TASK_CHECKMARK_VIEWBOX_SIZE,
	);
	const scaleX = width / MIND_MAP_TASK_CHECKMARK_VIEWBOX_SIZE;
	const scaleY = height / MIND_MAP_TASK_CHECKMARK_VIEWBOX_SIZE;
	return CHECKMARK_POINTS.map((point, index) => {
		const command = index === 0 ? "M" : "L";
		return `${command} ${String(x + point.x * scaleX)} ${String(y + point.y * scaleY)}`;
	}).join(" ");
}

export function resolveMindMapTaskCheckmarkStrokeWidth(
	width: number,
	height: number,
): number {
	const normalizedWidth = positiveFiniteOr(
		width,
		MIND_MAP_TASK_CHECKMARK_VIEWBOX_SIZE,
	);
	const normalizedHeight = positiveFiniteOr(
		height,
		MIND_MAP_TASK_CHECKMARK_VIEWBOX_SIZE,
	);
	return (
		MIND_MAP_TASK_CHECKMARK_STROKE_WIDTH *
		(Math.min(normalizedWidth, normalizedHeight) /
			MIND_MAP_TASK_CHECKMARK_VIEWBOX_SIZE)
	);
}

function finiteOr(value: number, fallback: number): number {
	return Number.isFinite(value) ? value : fallback;
}

function positiveFiniteOr(value: number, fallback: number): number {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}
