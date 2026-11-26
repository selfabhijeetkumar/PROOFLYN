import { z } from 'zod';
import { getDb } from '@/db/connection';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { InvestigationService } from '@/server/services/investigation-service';
import { requireAuth } from '@/server/auth';
import { assertSameOrigin, handleApiError, ok, parseJsonBody } from '@/server/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VerifyFieldSchema = z
  .object({
    action: z.enum(['VERIFY', 'CORRECT', 'REJECT']),
    newValue: z.string().max(500).optional(),
    numericValue: z.number().int().nonnegative().nullable().optional(),
    currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).nullable().optional(),
    unit: z.enum(['UNITS', 'KG', 'LITERS', 'METERS', 'PIECES']).nullable().optional(),
    reason: z.string().min(2).max(500),
  })
  .strict();

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; fieldId: string }> }
) {
  try {
    assertSameOrigin(req);
    const { id, fieldId } = await context.params;
    const repo = new InvestigationRepository(getDb());
    const actor = requireAuth(req, repo);
    const body = await parseJsonBody(req, VerifyFieldSchema);
    const service = new InvestigationService(repo);
    const updated = service.verifyField(id, fieldId, actor.id, body);
    return ok({ field: updated });
  } catch (err) {
    return handleApiError(err, 'PATCH /api/v1/cases/[id]/fields/[fieldId]/verify');
  }
}
