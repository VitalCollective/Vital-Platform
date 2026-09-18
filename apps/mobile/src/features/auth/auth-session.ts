type AuthErrorLike = {
  code?: unknown;
  status?: unknown;
};

const invalidSessionCodes = new Set([
  'bad_jwt',
  'invalid_jwt',
  'refresh_token_already_used',
  'refresh_token_not_found',
  'session_not_found',
  'user_not_found',
]);

export function isDefinitiveAuthSessionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const record = error as AuthErrorLike;
  const code = typeof record.code === 'string' ? record.code.toLowerCase() : '';
  const status = typeof record.status === 'number' ? record.status : null;
  return invalidSessionCodes.has(code) || status === 401 || status === 403;
}
