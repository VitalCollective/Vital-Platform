export const READ_REQUEST_TIMEOUT_MS = 12_000;

export class RequestTimeoutError extends Error {
  constructor() {
    super('The request timed out.');
    this.name = 'RequestTimeoutError';
  }
}

type RequestTimeoutOptions = {
  timeoutMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
};

export async function withRequestTimeout<T>(
  operation: PromiseLike<T>,
  options: RequestTimeoutOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? READ_REQUEST_TIMEOUT_MS;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimer(() => reject(new RequestTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimer(timer);
  }
}
