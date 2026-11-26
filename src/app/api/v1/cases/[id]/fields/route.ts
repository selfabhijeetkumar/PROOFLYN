import { z } from 'zod';
import { getDb } from '@/db/connection';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { InvestigationService } from '@/server/services/investigation-service';
import { requireAuth } from '@/server/auth';
import { assertSameOrigin, handleApiError, ok, parseJsonBody } from '@/server/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ManualFieldSchema = z
  .object({
    documentId: z.string().min(1).max(128),
    fieldName: z.string().min(1).max(64),
    value: z.string().max(500),
    numericValue: z.number().int().nonnegative().nullable().optional(),
    currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).nullable().optional(),
    unit: z.enum(['UNITS', 'KG', 'LITERS', 'METERS', 'PIECES']).nullable().optional(),
    presence: z.enum(['PRESENT', 'MISSING', 'INVALID']).optional(),
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

    const fields = repo.listExtractedFields(caseData.id);
    const verifications = repo.listVerificationRecords(caseData.id);
    return ok({ fields, verifications });
  } catch (err) {
    return handleApiError(err, 'GET /api/v1/cases/[id]/fields');
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
    const body = await parseJsonBody(req, ManualFieldSchema);
    const service = new InvestigationService(repo);
    const field = service.addManualField(id, actor.id, body);
    return ok({ field }, 201);
  } catch (err) {
    return handleApiError(err, 'POST /api/v1/cases/[id]/fields');
  }
}
