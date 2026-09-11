const FUTURE_JWT_ERROR_CODE = 'PGRST303';
const FUTURE_JWT_ERROR_MESSAGE = 'jwt issued at future';

export const FUTURE_JWT_RETRY_DELAYS_MS = [300, 900] as const;

type ErrorRecord = {
  cause?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
};

type TransientJwtRetryOptions = {
  delaysMs?: readonly number[];
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

function asErrorRecord(error: unknown): ErrorRecord | null {
  return typeof error === 'object' && error !== null
    ? (error as ErrorRecord)
    : null;
}

function technicalErrorDetails(error: unknown): Record<string, unknown> {
  const record = asErrorRecord(error);
  if (!record) return { value: String(error) };

  return {
    name: record.name,
    code: record.code,
    status: record.status,
    message: record.message,
    details: record.details,
    hint: record.hint,
  };
}

export function reportTechnicalError(context: string, error: unknown): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[Vital diagnostics] ${context}`, technicalErrorDetails(error));
  }
}

export function customerSafeErrorMessage(
  context: string,
  error: unknown,
  customerMessage: string,
): string {
  reportTechnicalError(context, error);
  return customerMessage;
}

export function isFutureJwtTimingError(error: unknown): boolean {
  const record = asErrorRecord(error);
  if (!record) return false;

  const code = typeof record.code === 'string' ? record.code.toUpperCase() : null;
  const message =
    typeof record.message === 'string' ? record.message.trim().toLowerCase() : '';

  if (
    message === FUTURE_JWT_ERROR_MESSAGE &&
    (code === null || code === FUTURE_JWT_ERROR_CODE)
  ) {
    return true;
  }

  return record.cause !== undefined && isFutureJwtTimingError(record.cause);
}

export async function withFutureJwtTimingRetry<T>(
  operation: () => Promise<T>,
  options: TransientJwtRetryOptions = {},
): Promise<T> {
  const delaysMs = options.delaysMs ?? FUTURE_JWT_RETRY_DELAYS_MS;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delayMs = delaysMs[attempt];
      if (delayMs === undefined || !isFutureJwtTimingError(error)) throw error;

      options.onRetry?.(error, attempt + 1, delayMs);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
