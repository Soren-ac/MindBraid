/**
 * Framework-free state machine for one continuous presentation gesture.
 *
 * A gesture owns immutable baseline and preview snapshots. Its lifecycle is
 * explicit so callers can model slider/color-picker previews without creating
 * one persistence/history entry per intermediate update. The module has no
 * DOM, Obsidian, or presentation-schema dependency.
 */

export type PresentationGestureLifecycle =
	| "active"
	| "committed"
	| "cancelled";

export interface PresentationGestureState<TSnapshot> {
	readonly id: string;
	readonly lifecycle: PresentationGestureLifecycle;
	readonly baseRevision: number;
	readonly before: TSnapshot;
	readonly preview: TSnapshot;
}

export interface ActivePresentationGestureState<TSnapshot>
	extends PresentationGestureState<TSnapshot> {
	readonly lifecycle: "active";
}

export interface PresentationGestureAdapter<TSnapshot, TPatch> {
	clone(this: void, snapshot: TSnapshot): TSnapshot;
	revision(this: void, snapshot: TSnapshot): number;
	apply(this: void, snapshot: TSnapshot, patch: TPatch): TSnapshot;
}

/**
 * The terminal result of one successful commit. It is also the replacement
 * lifecycle state the caller must retain; it cannot be updated or committed
 * again.
 */
export interface CompletedPresentationGesture<TSnapshot>
	extends PresentationGestureState<TSnapshot> {
	readonly lifecycle: "committed";
	readonly after: TSnapshot;
}

/**
 * The terminal result of a cancelled preview. `restored` is an ownership-safe
 * baseline copy for callers that render a cancelled preview locally.
 */
export interface CancelledPresentationGesture<TSnapshot>
	extends PresentationGestureState<TSnapshot> {
	readonly lifecycle: "cancelled";
	readonly restored: TSnapshot;
}

export class PresentationGestureConflictError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = "PresentationGestureConflictError";
	}
}

export class PresentationGestureLifecycleError extends PresentationGestureConflictError {
	public constructor(message: string) {
		super(message);
		this.name = "PresentationGestureLifecycleError";
	}
}

/** Begins an active, ownership-safe preview transaction. */
export function beginPresentationGesture<TSnapshot, TPatch>(
	id: string,
	baseline: TSnapshot,
	adapter: PresentationGestureAdapter<TSnapshot, TPatch>,
): ActivePresentationGestureState<TSnapshot> {
	const normalizedId = normalizeGestureId(id);
	const before = adapter.clone(baseline);
	const baseRevision = readRevision(before, adapter.revision, "baseline");
	return {
		id: normalizedId,
		lifecycle: "active",
		baseRevision,
		before,
		preview: adapter.clone(before),
	};
}

/**
 * Applies one intermediate preview patch. It never mutates the input state or
 * its snapshots, and a preview revision may not regress from the last preview.
 */
export function updatePresentationGesture<TSnapshot, TPatch>(
	state: PresentationGestureState<TSnapshot>,
	id: string,
	patch: TPatch,
	adapter: PresentationGestureAdapter<TSnapshot, TPatch>,
): ActivePresentationGestureState<TSnapshot> {
	requireActiveGesture(state, id);
	assertStoredBaseline(state, adapter.revision);
	const priorPreviewRevision = readRevision(
		state.preview,
		adapter.revision,
		"preview",
	);
	const next = adapter.apply(adapter.clone(state.preview), patch);
	const nextRevision = readRevision(next, adapter.revision, "next preview");
	if (nextRevision < priorPreviewRevision) {
		throw new PresentationGestureConflictError(
			"A presentation preview cannot move behind its previous revision.",
		);
	}
	return {
		id: state.id,
		lifecycle: "active",
		baseRevision: state.baseRevision,
		before: adapter.clone(state.before),
		preview: adapter.clone(next),
	};
}

/**
 * Strong completion API: verifies that the live presentation still matches
 * the baseline before returning a terminal committed state.
 */
export function commitPresentationGesture<TSnapshot, TPatch>(
	state: PresentationGestureState<TSnapshot>,
	id: string,
	current: TSnapshot,
	adapter: PresentationGestureAdapter<TSnapshot, TPatch>,
): CompletedPresentationGesture<TSnapshot> {
	return completeActivePresentationGesture(
		state,
		id,
		current,
		adapter.clone,
		adapter.revision,
		true,
	);
}

/**
 * Completes a gesture and returns a terminal committed state.
 *
 * The four-argument overload is the required form for new callers: it checks
 * the live baseline before completion. The three-argument overload remains
 * for source compatibility with older hosts and cannot detect an external
 * stale baseline because it has no live snapshot to compare.
 */
export function completePresentationGesture<TSnapshot>(
	state: PresentationGestureState<TSnapshot>,
	id: string,
	clone: (snapshot: TSnapshot) => TSnapshot,
): CompletedPresentationGesture<TSnapshot>;
export function completePresentationGesture<TSnapshot, TPatch>(
	state: PresentationGestureState<TSnapshot>,
	id: string,
	current: TSnapshot,
	adapter: PresentationGestureAdapter<TSnapshot, TPatch>,
): CompletedPresentationGesture<TSnapshot>;
export function completePresentationGesture<TSnapshot, TPatch>(
	state: PresentationGestureState<TSnapshot>,
	id: string,
	currentOrClone: TSnapshot | ((snapshot: TSnapshot) => TSnapshot),
	adapter?: PresentationGestureAdapter<TSnapshot, TPatch>,
): CompletedPresentationGesture<TSnapshot> {
	if (adapter !== undefined) {
		return completeActivePresentationGesture(
			state,
			id,
			currentOrClone as TSnapshot,
			adapter.clone,
			adapter.revision,
			true,
		);
	}
	if (typeof currentOrClone !== "function") {
		throw new TypeError(
			"A snapshot clone is required for the legacy completion overload.",
		);
	}
	return completeActivePresentationGesture(
		state,
		id,
		state.before,
		currentOrClone as (snapshot: TSnapshot) => TSnapshot,
		null,
		false,
	);
}

/**
 * Strong cancellation API. Retain the returned terminal state to make later
 * update/commit attempts fail deterministically.
 */
export function cancelPresentationGestureState<TSnapshot>(
	state: PresentationGestureState<TSnapshot>,
	id: string,
	clone: (snapshot: TSnapshot) => TSnapshot,
): CancelledPresentationGesture<TSnapshot> {
	requireActiveGesture(state, id);
	return {
		id: state.id,
		lifecycle: "cancelled",
		baseRevision: state.baseRevision,
		before: clone(state.before),
		preview: clone(state.preview),
		restored: clone(state.before),
	};
}

/**
 * Compatibility restoration API. New callers should use
 * `cancelPresentationGestureState` and retain its terminal lifecycle state.
 */
export function cancelPresentationGesture<TSnapshot>(
	state: PresentationGestureState<TSnapshot>,
	id: string,
	clone: (snapshot: TSnapshot) => TSnapshot,
): TSnapshot {
	return cancelPresentationGestureState(state, id, clone).restored;
}

/**
 * Verifies that no external presentation write replaced the gesture baseline.
 * It is meaningful only while the gesture remains active.
 */
export function assertPresentationGestureBaseline<TSnapshot>(
	state: PresentationGestureState<TSnapshot>,
	current: TSnapshot,
	revision: (snapshot: TSnapshot) => number,
): void {
	requireActiveLifecycle(state);
	assertStoredBaseline(state, revision);
	const currentRevision = readRevision(current, revision, "current presentation");
	if (currentRevision !== state.baseRevision) {
		throw new PresentationGestureConflictError(
			"The presentation changed after this preview gesture began.",
		);
	}
}

function completeActivePresentationGesture<TSnapshot>(
	state: PresentationGestureState<TSnapshot>,
	id: string,
	current: TSnapshot,
	clone: (snapshot: TSnapshot) => TSnapshot,
	revision: ((snapshot: TSnapshot) => number) | null,
	hasLiveBaseline: boolean,
): CompletedPresentationGesture<TSnapshot> {
	requireActiveGesture(state, id);
	if (hasLiveBaseline && revision !== null) {
		assertPresentationGestureBaseline(state, current, revision);
	}
	return {
		id: state.id,
		lifecycle: "committed",
		baseRevision: state.baseRevision,
		before: clone(state.before),
		preview: clone(state.preview),
		after: clone(state.preview),
	};
}

function assertStoredBaseline<TSnapshot>(
	state: PresentationGestureState<TSnapshot>,
	revision: (snapshot: TSnapshot) => number,
): void {
	const storedRevision = readRevision(state.before, revision, "stored baseline");
	if (storedRevision !== state.baseRevision) {
		throw new PresentationGestureConflictError(
			"The presentation gesture baseline was mutated after it began.",
		);
	}
}

function readRevision<TSnapshot>(
	snapshot: TSnapshot,
	revision: (snapshot: TSnapshot) => number,
	label: string,
): number {
	const value = revision(snapshot);
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new TypeError(
			`The ${label} revision must be a non-negative safe integer.`,
		);
	}
	return value;
}

function requireActiveGesture<TSnapshot>(
	state: PresentationGestureState<TSnapshot>,
	id: string,
): asserts state is ActivePresentationGestureState<TSnapshot> {
	requireGestureId(state, id);
	requireActiveLifecycle(state);
}

function requireActiveLifecycle<TSnapshot>(
	state: PresentationGestureState<TSnapshot>,
): asserts state is ActivePresentationGestureState<TSnapshot> {
	if (state.lifecycle !== "active") {
		throw new PresentationGestureLifecycleError(
			`Presentation gesture "${state.id}" is already ${state.lifecycle}.`,
		);
	}
}

function requireGestureId<TSnapshot>(
	state: PresentationGestureState<TSnapshot>,
	id: string,
): void {
	const normalizedId = normalizeGestureId(id);
	if (state.id !== normalizedId) {
		throw new PresentationGestureConflictError(
			`Presentation gesture "${normalizedId}" does not own the active preview.`,
		);
	}
}

function normalizeGestureId(id: string): string {
	const normalizedId = id.trim();
	if (normalizedId.length === 0) {
		throw new TypeError("Presentation gesture ID must not be empty.");
	}
	return normalizedId;
}
