export const RECENT_SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

export type DeletionUser = { id: string; lastSignInAt: string | null };
export type DeletionManifest = { profile_id: string; avatar_reference: string | null };

export type DeleteAccountDependencies = {
  now: () => number;
  verifyUser: (token: string) => Promise<DeletionUser | null>;
  getManifest: (token: string) => Promise<DeletionManifest>;
  listAvatarObjects: (profileId: string) => Promise<string[]>;
  removeAvatarObjects: (paths: string[]) => Promise<void>;
  authorizeDeletion: (profileId: string) => Promise<void>;
  clearDeletionAuthorization: (profileId: string) => Promise<void>;
  deleteAuthUser: (profileId: string) => Promise<void>;
  reportFailure?: (code: string) => void;
};

export class DeletionProblem extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'DeletionProblem';
    this.code = code;
    this.status = status;
  }
}

const responseHeaders = {
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export function createDeleteAccountHandler(dependencies: DeleteAccountDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders });
    if (request.method !== 'POST') return json({ deleted: false, code: 'method_not_allowed' }, 405);

    let authorizedProfileId: string | null = null;
    try {
      const authorization = request.headers.get('Authorization') ?? '';
      const match = authorization.match(/^Bearer\s+(.+)$/i);
      if (!match) throw new DeletionProblem('unauthorized', 401, 'Sign in before deleting your account.');

      let body: { confirmation?: unknown };
      try { body = await request.json(); }
      catch { throw new DeletionProblem('invalid_request', 400, 'The deletion request was invalid.'); }
      if (body.confirmation !== 'DELETE') {
        throw new DeletionProblem('confirmation_required', 400, 'Type DELETE to confirm account deletion.');
      }

      const token = match[1];
      const user = await dependencies.verifyUser(token);
      if (!user) throw new DeletionProblem('unauthorized', 401, 'Sign in before deleting your account.');

      const lastSignIn = user.lastSignInAt ? Date.parse(user.lastSignInAt) : Number.NaN;
      if (!Number.isFinite(lastSignIn) || dependencies.now() - lastSignIn > RECENT_SIGN_IN_WINDOW_MS) {
        throw new DeletionProblem('recent_auth_required', 403, 'Sign in again before deleting your account.');
      }

      const manifest = await dependencies.getManifest(token);
      if (manifest.profile_id !== user.id) {
        throw new DeletionProblem('identity_mismatch', 403, 'The account identity could not be verified.');
      }

      const avatarPaths = await dependencies.listAvatarObjects(user.id);
      if (avatarPaths.length) await dependencies.removeAvatarObjects(avatarPaths);
      authorizedProfileId = user.id;
      await dependencies.authorizeDeletion(user.id);
      await dependencies.deleteAuthUser(user.id);
      authorizedProfileId = null; // The successful profile cascade removed it.

      return json({ deleted: true });
    } catch (error) {
      if (authorizedProfileId) {
        try { await dependencies.clearDeletionAuthorization(authorizedProfileId); }
        catch { /* The marker expires after five minutes and cannot authorize a later deletion. */ }
      }
      const problem = error instanceof DeletionProblem
        ? error
        : new DeletionProblem('deletion_failed', 500, "We couldn't delete your account. Please try again.");
      dependencies.reportFailure?.(problem.code);
      return json({ deleted: false, code: problem.code, message: problem.message }, problem.status);
    }
  };
}
