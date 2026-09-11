export type PasswordRecoveryUrl = {
  isRecovery: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  flowId: string | null;
  tokenHash: string | null;
  errorDescription: string | null;
};

function readParameters(url: string): URLSearchParams {
  const [urlWithoutFragment, fragment = ''] = url.split('#', 2);
  const query = urlWithoutFragment?.split('?', 2)[1] ?? '';
  const parameters = new URLSearchParams(query);

  new URLSearchParams(fragment).forEach((value, key) => {
    parameters.set(key, value);
  });

  return parameters;
}

function targetsResetPassword(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname === 'reset-password' ||
      parsedUrl.pathname.replace(/\/$/, '').endsWith('/reset-password')
    );
  } catch {
    return /(?:^|\/)reset-password(?:[/?#]|$)/i.test(url);
  }
}

export function parsePasswordRecoveryUrl(url: string): PasswordRecoveryUrl {
  const parameters = readParameters(url);
  const accessToken = parameters.get('access_token');
  const refreshToken = parameters.get('refresh_token');
  const code = parameters.get('code');
  const tokenHash = parameters.get('token_hash');
  const errorDescription =
    parameters.get('error_description') ?? parameters.get('error');
  const containsAuthResult = Boolean(
    accessToken || refreshToken || code || tokenHash || errorDescription,
  );

  return {
    isRecovery:
      parameters.get('type') === 'recovery' ||
      (targetsResetPassword(url) && containsAuthResult),
    accessToken,
    refreshToken,
    code,
    flowId: parameters.get('sb_flow_id'),
    tokenHash,
    errorDescription,
  };
}
