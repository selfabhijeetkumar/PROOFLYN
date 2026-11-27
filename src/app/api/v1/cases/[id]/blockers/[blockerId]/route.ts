import { z } from 'zod';
import { getDb } from '@/db/connection';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { InvestigationService } from '@/server/services/investigation-service';
import { requireAuth } from '@/server/auth';
import { assertSameOrigin, handleApiError, ok, parseJsonBody } from '@/server/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UpdateBlockerSchema = z
  .object({
    status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']),
    note: z.string().max(500).optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; blockerId: string }> }
) {
  try {
    assertSameOrigin(req);
    const { id, blockerId } = await context.params;
    const repo = new InvestigationRepository(getDb());
    const actor = requireAuth(req, repo);
    const body = await parseJsonBody(req, UpdateBlockerSchema);
    const service = new InvestigationService(repo);
    const result = service.updateBlockerStatus(id, blockerId, actor.id, body.status, body.note);
    return ok(result);
  } catch (err) {
    return handleApiError(err, 'PATCH /api/v1/cases/[id]/blockers/[blockerId]');
  }
}
