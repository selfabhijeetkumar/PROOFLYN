import { getDb } from '@/db/connection';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { InvestigationService } from '@/server/services/investigation-service';
import { requireAuth } from '@/server/auth';
import { handleApiError, ok } from '@/server/api-helpers';
import { detectGaps, verifyEventChain } from '@/core';

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
    const ctx = service.getCaseContext(id, actor.id);
    const latestRun = repo.getLatestReconciliationRun(ctx.caseId);
    const gapOutput = detectGaps({
      caseId: ctx.caseId,
      documents: ctx.documents,
      fields: [...ctx.verifiedRecords, ...ctx.unverifiedRecords],
      reconciliationRunId: latestRun?.id ?? null,
    });
    const events = repo.listEvents(ctx.caseId);
    const chainStatus = verifyEventChain(events);
    const mcpToolCalls = repo.listMcpToolCalls(ctx.caseId);
    const reports = repo.listReports(ctx.caseId);

    return ok({
      case: repo.getCaseByIdForOrg(ctx.caseId, actor.organizationId),
      context: ctx,
      latestRun,
      coverage: gapOutput.coverage,
      confidenceAssessments: gapOutput.confidenceAssessments,
      eventChain: chainStatus,
      mcpCallCount: mcpToolCalls.length,
      reportCount: reports.length,
    });
  } catch (err) {
    return handleApiError(err, 'GET /api/v1/cases/[id]');
  }
}
