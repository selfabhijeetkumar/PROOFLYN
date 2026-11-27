import { getDb } from '@/db/connection';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { establishLocalDemoSession, getSessionActor, requireAuth } from '@/server/auth';
import { handleApiError, ok } from '@/server/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const repo = new InvestigationRepository(getDb());
    const existingActor = getSessionActor(req, repo);
    if (existingActor) {
      return ok({ user: existingActor });
    }

    const demoSession = establishLocalDemoSession(req, repo);
    if (demoSession) {
      return ok(
        { user: demoSession.actor, localDemoMode: true },
        200,
        { 'Set-Cookie': demoSession.cookieHeader }
      );
    }

    const actor = requireAuth(req, repo);
    return ok({ user: actor });
  } catch (err) {
    return handleApiError(err, 'GET /api/v1/auth/me');
  }
}
