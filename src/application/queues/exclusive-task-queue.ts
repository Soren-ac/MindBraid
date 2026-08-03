export class ExclusiveTaskQueueClosedError extends Error {
	public constructor() {
		super("The exclusive task queue is closed.");
		this.name = "ExclusiveTaskQueueClosedError";
	}
}

/**
 * Small framework-free mutex for host-owned mutations.
 *
 * Tasks are started in submission order. A rejection never poisons the queue,
 * and closing rejects work that has not started while allowing the active task
 * to finish its public-API write.
 */
export class ExclusiveTaskQueue {
	private tail: Promise<void> = Promise.resolve();
	private closed = false;
	private generation = 0;

	public run<T>(task: () => Promise<T>): Promise<T> {
		if (this.closed) {
			return Promise.reject(new ExclusiveTaskQueueClosedError());
		}

		const submittedGeneration = this.generation;
		const result = this.tail.then(async () => {
			if (
				this.closed ||
				submittedGeneration !== this.generation
			) {
				throw new ExclusiveTaskQueueClosedError();
			}
			return task();
		});
		this.tail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	public close(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.generation += 1;
	}
}
