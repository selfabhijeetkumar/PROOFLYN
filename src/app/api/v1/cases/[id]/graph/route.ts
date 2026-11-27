import type { McpGraphResult } from '@/core';
import { getDb } from '@/db/connection';
import { getDbPath } from '@/db/schema';
import { getMcpGateway } from '@/mcp/gateway';
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

    const graph = await getMcpGateway().callTool<McpGraphResult>(
      'get_evidence_graph',
      { caseId: caseData.id, actorId: actor.id },
      repo,
      { databasePath: getDbPath() }
    );

    return ok({ graph });
  } catch (err) {
    return handleApiError(err, 'GET /api/v1/cases/[id]/graph');
  }
}
