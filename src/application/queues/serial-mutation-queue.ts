export type SerialStateMutation<State> = (current: State) => State;
export type SerialStateNormalizer<State> = (candidate: State) => State;

export type SerialStateCommit<State> = (
  next: State,
  previous: State,
) => void | Promise<void>;

export class SerialMutationQueueClosedError extends Error {
  public constructor() {
    super("The serial mutation queue is closed.");
    this.name = "SerialMutationQueueClosedError";
  }
}

/**
 * Serializes whole-state persistence without letting independently initiated
 * mutations overwrite one another with stale snapshots.
 *
 * A mutation is evaluated only when it reaches the head of the queue, so it
 * always receives the latest successfully committed state. Failed commits do
 * not advance that state, and later work can continue from the last success.
 * Returning the current state object is an explicit no-op and skips optional
 * normalization and commit.
 */
export class SerialMutationQueue<State> {
  private readonly commit: SerialStateCommit<State>;
  private state: State;
  private tail: Promise<void> = Promise.resolve();
  private closed = false;

  public constructor(initialState: State, commit: SerialStateCommit<State>) {
    this.state = initialState;
    this.commit = commit;
  }

  public getSnapshot(): State {
    return this.state;
  }

  public enqueue(
    mutation: SerialStateMutation<State>,
    normalize?: SerialStateNormalizer<State>,
  ): Promise<State> {
    const operation = this.tail.then(async () => {
      if (this.closed) {
        throw new SerialMutationQueueClosedError();
      }

      const previous = this.state;
      const candidate = mutation(previous);
      if (Object.is(candidate, previous)) {
        if (this.closed) {
          throw new SerialMutationQueueClosedError();
        }
        return previous;
      }
      const next = normalize === undefined ? candidate : normalize(candidate);
      if (Object.is(next, previous)) {
        if (this.closed) {
          throw new SerialMutationQueueClosedError();
        }
        return previous;
      }
      await this.commit(next, previous);

      if (this.closed) {
        throw new SerialMutationQueueClosedError();
      }

      this.state = next;
      return next;
    });

    this.tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  public close(): void {
    this.closed = true;
  }
}
