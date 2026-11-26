import { getDb } from '@/db/connection';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { InvestigationService } from '@/server/services/investigation-service';
import { requireAuth } from '@/server/auth';
import { handleApiError, ok } from '@/server/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const latestRun = repo.getLatestReconciliationRun(caseData.id);
    const discrepancies = repo.listDiscrepancies(caseData.id, latestRun?.id);
    const confidenceAssessments = repo.listConfidenceAssessments(caseData.id, latestRun?.id);
    return ok({ latestRun, discrepancies, confidenceAssessments });
  } catch (err) {
    return handleApiError(err, 'GET /api/v1/cases/[id]/discrepancies');
  }
}
