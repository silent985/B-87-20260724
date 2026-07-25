export interface LastWinOptions<T> {
  onCancel?: (result: T) => void;
}

export function createLastWin<T>(options: LastWinOptions<T> = {}): {
  run: (fn: () => Promise<T>) => Promise<T | null>;
  invalidate: () => void;
  getToken: () => number;
} {
  let token = 0;
  return {
    run: async (fn: () => Promise<T>): Promise<T | null> => {
      const myToken = ++token;
      const result = await fn();
      if (myToken !== token) {
        options.onCancel?.(result);
        return null;
      }
      return result;
    },
    invalidate: () => {
      token++;
    },
    getToken: () => token,
  };
}
