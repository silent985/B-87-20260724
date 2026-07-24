import { describe, it, expect, vi } from 'vitest';
import { createLastWin } from '../../src/utils/lastWin';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('createLastWin', () => {
  it('returns the result of the latest async operation', async () => {
    const lw = createLastWin<number>();
    const result = await lw.run(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('discards stale results when a newer operation starts', async () => {
    const lw = createLastWin<string>();
    const order: string[] = [];

    const first = lw.run(async () => {
      await delay(50);
      order.push('first-resolved');
      return 'first';
    });
    const second = lw.run(async () => {
      await delay(10);
      order.push('second-resolved');
      return 'second';
    });

    const [r1, r2] = await Promise.all([first, second]);
    expect(r1).toBeNull();
    expect(r2).toBe('second');
    expect(order).toEqual(['second-resolved', 'first-resolved']);
  });

  it('invalidate() marks in-flight operations stale', async () => {
    const lw = createLastWin<number>();
    const result = lw.run(async () => {
      await delay(20);
      return 1;
    });
    lw.invalidate();
    expect(await result).toBeNull();
  });

  it('calls onCancel when a stale result arrives', async () => {
    const onCancel = vi.fn();
    const lw = createLastWin<number>({ onCancel });
    const first = lw.run(async () => {
      await delay(30);
      return 100;
    });
    lw.run(async () => {
      await delay(5);
      return 200;
    });
    await first;
    expect(onCancel).toHaveBeenCalledWith(100);
  });

  it('getToken returns increasing token', () => {
    const lw = createLastWin<number>();
    const t1 = lw.getToken();
    lw.run(() => Promise.resolve(1));
    const t2 = lw.getToken();
    expect(t2).toBeGreaterThan(t1);
  });

  it('sequential operations all resolve', async () => {
    const lw = createLastWin<number>();
    expect(await lw.run(() => Promise.resolve(1))).toBe(1);
    expect(await lw.run(() => Promise.resolve(2))).toBe(2);
    expect(await lw.run(() => Promise.resolve(3))).toBe(3);
  });
});
