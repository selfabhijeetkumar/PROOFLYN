import { z } from 'zod';
import { getDb } from '@/db/connection';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { InvestigationService } from '@/server/services/investigation-service';
import { requireAuth } from '@/server/auth';
import { assertSameOrigin, handleApiError, ok, parseJsonBody } from '@/server/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateDraftSchema = z
  .object({
    reportId: z.string().min(1).max(128),
    questions: z.array(z.string().min(3).max(500)).max(20).optional(),
  })
  .strict();

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const repo = new InvestigationRepository(getDb());
    const actor = requireAuth(req, repo);
    const service = new InvestigationService(repo);
    const { caseData } = service.authorizeCaseAccess(id, actor.id);
    const drafts = repo.listFollowUpDrafts(caseData.id);
    return ok({ drafts });
  } catch (err) {
    return handleApiError(err, 'GET /api/v1/cases/[id]/follow-up-drafts');
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(req);
    const { id } = await context.params;
    const repo = new InvestigationRepository(getDb());
    const actor = requireAuth(req, repo);
    const body = await parseJsonBody(req, CreateDraftSchema);
    const service = new InvestigationService(repo);
    const draft = service.createFollowUpDraft(id, body.reportId, actor.id, body.questions);
    return ok({ draft }, 201);
  } catch (err) {
    return handleApiError(err, 'POST /api/v1/cases/[id]/follow-up-drafts');
  }
}
