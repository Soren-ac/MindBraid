import {
  BILATERAL_TREE_LAYOUT_ENGINE,
  BILATERAL_TREE_LAYOUT_ENGINE_ID,
} from "./bilateral-layout";
import {
  BUILT_IN_TREE_LAYOUT_ENGINE,
  TREE_LAYOUT_ENGINE_ID,
  createLayoutEngineResolver,
  type LayoutEngine,
  type LayoutEngineResolver,
} from "./layout";

export interface MindMapLayoutEngineRegistry extends LayoutEngineResolver {
  list(): readonly LayoutEngine[];
  has(engineId: string): boolean;
}

export function createMindMapLayoutEngineRegistry(
  engines: readonly LayoutEngine[],
): MindMapLayoutEngineRegistry {
  const resolver = createLayoutEngineResolver(engines);
  const registered = [...engines];
  const ids = new Set(registered.map(({ id }) => id));
  return {
    ...resolver,
    list(): readonly LayoutEngine[] {
      return registered;
    },
    has(engineId: string): boolean {
      return ids.has(engineId);
    },
  };
}

export const DEFAULT_MIND_MAP_LAYOUT_ENGINE_ID =
  BILATERAL_TREE_LAYOUT_ENGINE_ID;

export const BUILT_IN_MIND_MAP_LAYOUT_ENGINE_REGISTRY =
  createMindMapLayoutEngineRegistry([
    BILATERAL_TREE_LAYOUT_ENGINE,
    BUILT_IN_TREE_LAYOUT_ENGINE,
  ]);

export {
  BILATERAL_TREE_LAYOUT_ENGINE_ID,
  TREE_LAYOUT_ENGINE_ID,
};
