import { describe, expect, it } from 'vitest'
import { Mutex } from '../src/lib/mutex'

/** A promise plus its resolver, so tests control resolution order. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Drain queued microtasks so chained promise callbacks have all run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
}

describe('Mutex', () => {
  it('runs a single task and returns its value', async () => {
    const mutex = new Mutex()
    await expect(mutex.runExclusive(async () => 7)).resolves.toBe(7)
  })

  it('serialises tasks in submission order (no interleaving)', async () => {
    const mutex = new Mutex()
    const events: string[] = []
    const first = deferred<void>()
    const second = deferred<void>()

    const p1 = mutex.runExclusive(async () => {
      events.push('start-1')
      await first.promise
      events.push('end-1')
    })
    const p2 = mutex.runExclusive(async () => {
      events.push('start-2')
      await second.promise
      events.push('end-2')
    })

    // Let the queue kick off the first task (it starts on a microtask turn).
    await flush()
    // Task 2 must not start until task 1 has ended.
    expect(events).toEqual(['start-1'])
    first.resolve()
    await p1
    // p1 has ended; task 2 begins on a following microtask turn.
    await flush()
    expect(events).toEqual(['start-1', 'end-1', 'start-2'])
    second.resolve()
    await p2
    expect(events).toEqual(['start-1', 'end-1', 'start-2', 'end-2'])
  })

  it('does not deadlock the queue when a task rejects', async () => {
    const mutex = new Mutex()
    const failing = mutex.runExclusive(async () => {
      throw new Error('boom')
    })
    await expect(failing).rejects.toThrow('boom')
    // A subsequent task still runs.
    await expect(mutex.runExclusive(async () => 'ok')).resolves.toBe('ok')
  })

  it('preserves order across many queued tasks', async () => {
    const mutex = new Mutex()
    const order: number[] = []
    const tasks = Array.from({ length: 6 }, (_, i) =>
      mutex.runExclusive(async () => {
        order.push(i)
      }),
    )
    await Promise.all(tasks)
    expect(order).toEqual([0, 1, 2, 3, 4, 5])
  })
})
