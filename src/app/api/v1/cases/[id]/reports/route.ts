import { z } from 'zod';
import type { McpReportResult } from '@/core';
import { getDb } from '@/db/connection';
import { getDbPath } from '@/db/schema';
import { getMcpGateway } from '@/mcp/gateway';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { InvestigationService } from '@/server/services/investigation-service';
import { requireAuth } from '@/server/auth';
import { checkRateLimit } from '@/server/rate-limit';
import { assertSameOrigin, handleApiError, ok } from '@/server/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ReportOptionsSchema = z
  .object({
    includeHtml: z.boolean().optional(),
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

    const reports = repo.listReports(caseData.id);
    return ok({ reports });
  } catch (err) {
    return handleApiError(err, 'GET /api/v1/cases/[id]/reports');
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
    checkRateLimit(`report:${actor.id}`, 20, 60_000);

    const service = new InvestigationService(repo);
    const { caseData } = service.authorizeCaseAccess(id, actor.id);

    let options: { includeHtml?: boolean } | undefined;
    const rawText = await req.text();
    if (rawText.trim()) {
      options = ReportOptionsSchema.parse(JSON.parse(rawText));
    }

    const generated = await getMcpGateway().callTool<McpReportResult>(
      'generate_evidence_report',
      {
        caseId: caseData.id,
        actorId: actor.id,
        ...(options ? { options } : {}),
      },
      repo,
      { databasePath: getDbPath() }
    );

    const report = repo.getReport(caseData.id, generated.reportId);
    return ok({ generated, report }, 201);
  } catch (err) {
    return handleApiError(err, 'POST /api/v1/cases/[id]/reports');
  }
}
