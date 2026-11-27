import { detectGaps } from '@/core';
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
    const persistedGaps = repo.listEvidenceGaps(caseData.id, latestRun?.id);
    const live = detectGaps({
      caseId: caseData.id,
      documents: repo.listSourceDocuments(caseData.id),
      fields: repo.listExtractedFields(caseData.id),
      reconciliationRunId: latestRun?.id ?? null,
    });

    return ok({
      gaps: persistedGaps.length > 0 ? persistedGaps : live.gaps,
      coverage: live.coverage,
      confidenceLadder: live.confidenceAssessments,
    });
  } catch (err) {
    return handleApiError(err, 'GET /api/v1/cases/[id]/gaps');
  }
}
