/** Build-time placeholder for Obsidian declaration references not used by MindBraid. */
export declare class EditorView {}

export declare class ViewPlugin<
	Value = unknown,
	Argument = undefined,
> {
	private readonly __valueType?: Value;
	private readonly __argumentType?: Argument;
}
