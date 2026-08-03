import { createMindMapImportRegistry } from "./registry";
import { MINDMANAGER_IMPORT_ADAPTER } from "./mindmanager";
import { MINDMEISTER_IMPORT_ADAPTER } from "./mindmeister";
import { XMIND_IMPORT_ADAPTER } from "./xmind";

export const BUILT_IN_MIND_MAP_IMPORT_REGISTRY = createMindMapImportRegistry([
	XMIND_IMPORT_ADAPTER,
	MINDMEISTER_IMPORT_ADAPTER,
	MINDMANAGER_IMPORT_ADAPTER,
]);
