/**
 * A minimal async mutex: serialises asynchronous critical sections so they run
 * one at a time in the order they were requested.
 *
 * The editor uses this to serialise filesystem mutations (save / rename). If a
 * rename triggered by the filename field's `onBlur` were allowed to interleave
 * with a save, one could write to a path the other has just moved, corrupting
 * state or writing to a stale path. Running them exclusively — and re-reading
 * the current file path inside each critical section — removes that race.
 */
export class Mutex {
  // The tail of the promise chain; each new task waits on the previous one.
  private tail: Promise<void> = Promise.resolve()

  /**
   * Run `task` once all previously queued tasks have settled. Resolves (or
   * rejects) with `task`'s result. A task's failure does not break the chain
   * for subsequent tasks.
   */
  runExclusive<T>(task: () => Promise<T>): Promise<T> {
    // Chain onto the current tail, swallowing prior errors so the lock is not
    // permanently poisoned by one failed task.
    const run = this.tail.then(task, task)
    // The next waiter should proceed regardless of this task's outcome.
    this.tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}
