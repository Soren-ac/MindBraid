import { describe, expect, it, vi } from "vitest";

import {
	ExclusiveTaskQueue,
	ExclusiveTaskQueueClosedError,
} from "../src/application/queues/exclusive-task-queue";

describe("ExclusiveTaskQueue", () => {
	it("runs asynchronous work in submission order", async () => {
		const queue = new ExclusiveTaskQueue();
		const events: string[] = [];
		let releaseFirst!: () => void;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});

		const first = queue.run(async () => {
			events.push("first:start");
			await firstGate;
			events.push("first:end");
			return 1;
		});
		const second = queue.run(async () => {
			events.push("second");
			return 2;
		});

		await vi.waitFor(() => {
			expect(events).toEqual(["first:start"]);
		});
		releaseFirst();

		await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
		expect(events).toEqual(["first:start", "first:end", "second"]);
	});

	it("continues after a task rejects", async () => {
		const queue = new ExclusiveTaskQueue();
		const first = queue.run(async () => {
			throw new Error("planned failure");
		});
		const second = queue.run(async () => "ok");

		await expect(first).rejects.toThrow("planned failure");
		await expect(second).resolves.toBe("ok");
	});

	it("rejects queued and newly submitted work after close", async () => {
		const queue = new ExclusiveTaskQueue();
		let firstStarted = false;
		let releaseFirst!: () => void;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const first = queue.run(async () => {
			firstStarted = true;
			await firstGate;
		});
		const queued = queue.run(async () => "never");

		await vi.waitFor(() => {
			expect(firstStarted).toBe(true);
		});
		queue.close();
		releaseFirst();

		await expect(first).resolves.toBeUndefined();
		await expect(queued).rejects.toBeInstanceOf(
			ExclusiveTaskQueueClosedError,
		);
		await expect(
			queue.run(async () => "never"),
		).rejects.toBeInstanceOf(ExclusiveTaskQueueClosedError);
	});
});
