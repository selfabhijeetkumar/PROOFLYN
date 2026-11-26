import { z } from 'zod';
import type { McpBlockerResult, McpGapResult, McpReconcileResult } from '@/core';
import { getDb } from '@/db/connection';
import { getDbPath } from '@/db/schema';
import { getMcpGateway } from '@/mcp/gateway';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { InvestigationService } from '@/server/services/investigation-service';
import { requireAuth } from '@/server/auth';
import { assertSameOrigin, handleApiError, ok } from '@/server/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ReconcileBodySchema = z
  .object({
    recordIds: z.array(z.string().min(1).max(128)).max(100).optional(),
  })
  .strict();

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(req);
    const { id } = await context.params;
    const repo = new InvestigationRepository(getDb());
    const actor = requireAuth(req, repo);
    const service = new InvestigationService(repo);
    const { caseData } = service.authorizeCaseAccess(id, actor.id);

    let recordIds: string[] | undefined;
    const rawText = await req.text();
    if (rawText.trim()) {
      const parsed = ReconcileBodySchema.parse(JSON.parse(rawText));
      recordIds = parsed.recordIds;
    }

    const gateway = getMcpGateway();
    const dbPath = getDbPath();
    const mcpOpts = { databasePath: dbPath };

    const reconciliation = await gateway.callTool<McpReconcileResult>(
      'reconcile_case_records',
      {
        caseId: caseData.id,
        actorId: actor.id,
        ...(recordIds ? { recordIds } : {}),
      },
      repo,
      mcpOpts
    );

    const gaps = await gateway.callTool<McpGapResult>(
      'detect_evidence_gaps',
      { caseId: caseData.id, actorId: actor.id },
      repo,
      mcpOpts
    );

    const blockers = await gateway.callTool<McpBlockerResult>(
      'assess_payment_blockers',
      { caseId: caseData.id, actorId: actor.id },
      repo,
      mcpOpts
    );

    return ok({
      reconciliation,
      gaps,
      blockers,
    });
  } catch (err) {
    return handleApiError(err, 'POST /api/v1/cases/[id]/reconcile');
  }
}
