import { describe, expect, it } from "vitest";

import {
  SerialMutationQueue,
  SerialMutationQueueClosedError,
} from "../src/application/queues/serial-mutation-queue";

interface TestSettings {
  readonly layout: string;
  readonly theme: string;
}

function createDeferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolvePromise: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => {
      resolvePromise?.();
    },
  };
}

describe("SerialMutationQueue", () => {
  it("skips persistence when a semantic mutation returns the current state", async () => {
    const initial: TestSettings = { layout: "tree", theme: "pencil" };
    const commits: TestSettings[] = [];
    let normalizationCount = 0;
    const queue = new SerialMutationQueue<TestSettings>(
      initial,
      async (next) => {
        commits.push(next);
      },
    );

    await expect(
      queue.enqueue(
        (current) => current,
        (candidate) => {
          normalizationCount += 1;
          return { ...candidate };
        },
      ),
    ).resolves.toBe(initial);
    expect(queue.getSnapshot()).toBe(initial);
    expect(commits).toEqual([]);
    expect(normalizationCount).toBe(0);
  });

  it("normalizes changed candidates before committing and publishing them", async () => {
    const committed: TestSettings[] = [];
    const queue = new SerialMutationQueue<TestSettings>(
      { layout: "tree", theme: "pencil" },
      async (next) => {
        committed.push(next);
      },
    );

    await expect(
      queue.enqueue(
        (current) => ({ ...current, layout: "balanced" }),
        (candidate) => ({ ...candidate, theme: "normalized" }),
      ),
    ).resolves.toEqual({ layout: "balanced", theme: "normalized" });
    expect(queue.getSnapshot()).toEqual({
      layout: "balanced",
      theme: "normalized",
    });
    expect(committed).toEqual([
      { layout: "balanced", theme: "normalized" },
    ]);
  });

  it("evaluates each mutation against the latest committed snapshot", async () => {
    const firstCommit = createDeferred();
    const committed: TestSettings[] = [];
    const queue = new SerialMutationQueue<TestSettings>(
      {
        layout: "tree",
        theme: "pencil",
      },
      async (next) => {
        committed.push(next);
        if (committed.length === 1) {
          await firstCommit.promise;
        }
      },
    );

    const layoutChange = queue.enqueue((current) => ({
      ...current,
      layout: "balanced",
    }));
    const themeChange = queue.enqueue((current) => ({
      ...current,
      theme: "native",
    }));

    await Promise.resolve();
    expect(committed).toEqual([
      {
        layout: "balanced",
        theme: "pencil",
      },
    ]);

    firstCommit.resolve();
    await expect(layoutChange).resolves.toEqual({
      layout: "balanced",
      theme: "pencil",
    });
    await expect(themeChange).resolves.toEqual({
      layout: "balanced",
      theme: "native",
    });
    expect(committed).toEqual([
      {
        layout: "balanced",
        theme: "pencil",
      },
      {
        layout: "balanced",
        theme: "native",
      },
    ]);
  });

  it("keeps the last successful snapshot after a failed commit", async () => {
    const queue = new SerialMutationQueue<TestSettings>(
      {
        layout: "tree",
        theme: "pencil",
      },
      (next) => {
        if (next.theme === "broken") {
          throw new Error("save failed");
        }
      },
    );

    await expect(
      queue.enqueue((current) => ({
        ...current,
        theme: "broken",
      })),
    ).rejects.toThrow("save failed");

    await expect(
      queue.enqueue((current) => ({
        ...current,
        layout: "balanced",
      })),
    ).resolves.toEqual({
      layout: "balanced",
      theme: "pencil",
    });
    expect(queue.getSnapshot()).toEqual({
      layout: "balanced",
      theme: "pencil",
    });
  });

  it("does not start pending work or publish an in-flight commit after close", async () => {
    const firstCommit = createDeferred();
    let commitCount = 0;
    const initial: TestSettings = {
      layout: "tree",
      theme: "pencil",
    };
    const queue = new SerialMutationQueue<TestSettings>(
      initial,
      async () => {
        commitCount += 1;
        await firstCommit.promise;
      },
    );

    const inFlight = queue.enqueue((current) => ({
      ...current,
      layout: "balanced",
    }));
    const pending = queue.enqueue((current) => ({
      ...current,
      theme: "native",
    }));
    const inFlightExpectation = expect(inFlight).rejects.toBeInstanceOf(
      SerialMutationQueueClosedError,
    );
    const pendingExpectation = expect(pending).rejects.toBeInstanceOf(
      SerialMutationQueueClosedError,
    );

    await Promise.resolve();
    queue.close();
    firstCommit.resolve();

    await inFlightExpectation;
    await pendingExpectation;
    expect(commitCount).toBe(1);
    expect(queue.getSnapshot()).toBe(initial);
  });
});
