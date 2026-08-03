/**
 * Static-analysis contract for the single fflate API used by MindBraid.
 * Runtime code still imports the bundled `fflate` package.
 */
export interface InflateOptions {
	readonly out?: Uint8Array;
}

export interface ZipOptions {
	readonly level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

export type ZippableFile =
	| Uint8Array
	| Zippable
	| readonly [Uint8Array | Zippable, ZipOptions];

export interface Zippable {
	readonly [path: string]: ZippableFile;
}

export function inflateSync(
	data: Uint8Array,
	options?: InflateOptions,
): Uint8Array;

export function strToU8(value: string, latin1?: boolean): Uint8Array;

export function zipSync(
	data: Zippable,
	options?: ZipOptions,
): Uint8Array;
