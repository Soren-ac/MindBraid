import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MindMapController,
  type MindMapSource,
  type MindMapTimerPort,
  type MindMapViewState,
} from "../src/application/controller";

const sourceA: MindMapSource = {
  path: "Notes/A.md",
  basename: "A",
  name: "A.md",
  extension: "md",
};

const sourceB: MindMapSource = {
  path: "Notes/B.md",
  basename: "B",
  name: "B.md",
  extension: "md",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("MindMapController", () => {
  it("starts idle and immediately publishes the current state", () => {
    const controller = createController();
    const states: MindMapViewState[] = [];

    const unsubscribe = controller.subscribe((state) => states.push(state));

    expect(states).toHaveLength(1);
    expect(states[0]).toEqual({
      status: "idle",
      direction: "left-to-right",
    });

    unsubscribe();
    controller.dispose();
  });

  it("transitions from loading to a parsed ready document", async () => {
    const controller = createController();

    controller.activateMarkdown(sourceA, async () => "# Heading");
    expect(controller.getState().status).toBe("loading");

    await flushPromises();

    const state = controller.getState();
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.document.root.text).toBe("A");
      expect(state.document.root.children[0]?.text).toBe("Heading");
    }

    controller.dispose();
  });

  it("debounces content snapshots until the configured delay", async () => {
    vi.useFakeTimers();
    const controller = createController(250);

    controller.activateMarkdown(sourceA, async () => "# Before");
    await flushPromises();

    controller.scheduleContent(sourceA, "# After");
    await vi.advanceTimersByTimeAsync(249);

    const beforeState = controller.getState();
    expect(beforeState.status).toBe("ready");
    if (beforeState.status === "ready") {
      expect(beforeState.document.root.children[0]?.text).toBe("Before");
    }

    await vi.advanceTimersByTimeAsync(1);

    const afterState = controller.getState();
    expect(afterState.status).toBe("ready");
    if (afterState.status === "ready") {
      expect(afterState.document.root.children[0]?.text).toBe("After");
    }

    controller.dispose();
  });

  it("debounces reloads and reads content only after the delay", async () => {
    vi.useFakeTimers();
    const controller = createController(250);
    const loader = vi.fn(async () => "# Reloaded");

    controller.activateMarkdown(sourceA, async () => "# Before");
    await flushPromises();
    controller.scheduleReload(sourceA, loader);
    await vi.advanceTimersByTimeAsync(249);

    expect(loader).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();

    expect(loader).toHaveBeenCalledTimes(1);
    const state = controller.getState();
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.document.root.children[0]?.text).toBe("Reloaded");
    }

    controller.dispose();
  });

  it("applies an explicit commit immediately and cancels pending content", async () => {
    vi.useFakeTimers();
    const controller = createController(250);

    controller.activateMarkdown(sourceA, async () => "# Before");
    await flushPromises();
    controller.scheduleContent(sourceA, "# Stale pending text");
    controller.commitContent(sourceA, "# Committed");

    const committedState = controller.getState();
    expect(committedState.status).toBe("ready");
    if (committedState.status === "ready") {
      expect(committedState.document.root.children[0]?.text).toBe(
        "Committed",
      );
    }

    await vi.advanceTimersByTimeAsync(300);
    const finalState = controller.getState();
    expect(finalState.status).toBe("ready");
    if (finalState.status === "ready") {
      expect(finalState.document.root.children[0]?.text).toBe(
        "Committed",
      );
    }

    controller.dispose();
  });

  it("does not republish an identical source revision", async () => {
    vi.useFakeTimers();
    const controller = createController(250);

    controller.activateMarkdown(sourceA, async () => "# Stable");
    await flushPromises();
    const states: MindMapViewState[] = [];
    const unsubscribe = controller.subscribe((state) => states.push(state));

    controller.commitContent(sourceA, "# Stable");
    controller.scheduleContent(sourceA, "# Stable");
    await vi.advanceTimersByTimeAsync(250);

    expect(states).toHaveLength(1);
    expect(states[0]?.status).toBe("ready");

    unsubscribe();
    controller.dispose();
  });

  it("lets a newer editor snapshot supersede a pending reload", async () => {
    vi.useFakeTimers();
    const controller = createController(250);
    const reload = vi.fn(async () => "# Stale disk content");

    controller.activateMarkdown(sourceA, async () => "# Before");
    await flushPromises();
    controller.scheduleReload(sourceA, reload);
    controller.scheduleContent(sourceA, "# Live editor content");
    await vi.advanceTimersByTimeAsync(250);

    expect(reload).not.toHaveBeenCalled();
    const state = controller.getState();
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.document.root.children[0]?.text).toBe(
        "Live editor content",
      );
    }

    controller.dispose();
  });

  it("ignores a stale load after a newer source becomes ready", async () => {
    const controller = createController();
    const oldLoad = createDeferred<string>();
    const newLoad = createDeferred<string>();

    controller.activateMarkdown(sourceA, () => oldLoad.promise);
    controller.activateMarkdown(sourceB, () => newLoad.promise);

    newLoad.resolve("# New");
    await flushPromises();
    oldLoad.resolve("# Old");
    await flushPromises();

    const state = controller.getState();
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.source.path).toBe(sourceB.path);
      expect(state.document.root.children[0]?.text).toBe("New");
    }

    controller.dispose();
  });

  it("does not apply edits for a source that is not active", async () => {
    vi.useFakeTimers();
    const controller = createController(250);

    controller.activateMarkdown(sourceA, async () => "# Current");
    await flushPromises();
    controller.scheduleContent(sourceB, "# Wrong");
    await vi.advanceTimersByTimeAsync(300);

    const state = controller.getState();
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.source.path).toBe(sourceA.path);
      expect(state.document.root.children[0]?.text).toBe("Current");
    }

    controller.dispose();
  });

  it("publishes unsupported and error states and preserves direction", () => {
    const controller = createController();
    const imageSource: MindMapSource = {
      path: "image.png",
      basename: "image",
      name: "image.png",
      extension: "png",
    };

    controller.setUnsupported(imageSource);
    controller.setDirection("top-to-bottom");

    expect(controller.getState()).toEqual({
      status: "unsupported",
      source: imageSource,
      direction: "top-to-bottom",
    });

    controller.setError("Read failed", imageSource);
    expect(controller.getState()).toEqual({
      status: "error",
      source: imageSource,
      message: "Read failed",
      direction: "top-to-bottom",
    });

    controller.dispose();
  });

  it("publishes a current loader error and ignores a stale rejection", async () => {
    const controller = createController();
    const staleLoad = createDeferred<string>();

    controller.activateMarkdown(sourceA, () => staleLoad.promise);
    controller.activateMarkdown(sourceB, async () => {
      throw new Error("Read failed");
    });
    await flushPromises();

    expect(controller.getState()).toEqual({
      status: "error",
      source: sourceB,
      message: "Read failed",
      direction: "left-to-right",
    });

    staleLoad.reject(new Error("Stale failure"));
    await flushPromises();

    expect(controller.getState()).toEqual({
      status: "error",
      source: sourceB,
      message: "Read failed",
      direction: "left-to-right",
    });

    controller.dispose();
  });

  it("cancels pending debounced work when disposed", async () => {
    vi.useFakeTimers();
    const controller = createController(250);
    const listener = vi.fn();

    controller.activateMarkdown(sourceA, async () => "# Before");
    await flushPromises();
    controller.subscribe(listener);
    controller.scheduleContent(sourceA, "# After");
    controller.dispose();
    await vi.advanceTimersByTimeAsync(300);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not cancel a task that a synchronous scheduler already completed", async () => {
    const cancel = vi.fn();
    const synchronousTimerPort: MindMapTimerPort = {
      schedule(callback) {
        callback();
        return cancel;
      },
    };
    const controller = new MindMapController("left-to-right", {
      timerPort: synchronousTimerPort,
    });

    controller.activateMarkdown(sourceA, async () => "# Before");
    await flushPromises();
    controller.scheduleContent(sourceA, "# After");

    const state = controller.getState();
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.document.root.children[0]?.text).toBe("After");
    }

    controller.dispose();

    expect(cancel).not.toHaveBeenCalled();
  });
});

const TEST_TIMER_PORT: MindMapTimerPort = {
  schedule(callback, delayMs) {
    const scheduleTimer = setTimeout;
    const cancelTimer = clearTimeout;
    let pending = true;
    const timer = scheduleTimer(() => {
      if (!pending) {
        return;
      }

      pending = false;
      callback();
    }, delayMs);

    return () => {
      if (!pending) {
        return;
      }

      pending = false;
      cancelTimer(timer);
    };
  },
};

function createController(debounceMs?: number): MindMapController {
  return new MindMapController("left-to-right", {
    timerPort: TEST_TIMER_PORT,
    ...(debounceMs === undefined ? {} : { debounceMs }),
  });
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((error: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: (value: T) => {
      resolvePromise?.(value);
    },
    reject: (error: unknown) => {
      rejectPromise?.(error);
    },
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
