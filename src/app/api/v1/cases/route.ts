import { z } from 'zod';
import { getDb } from '@/db/connection';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { InvestigationService } from '@/server/services/investigation-service';
import { requireAuth } from '@/server/auth';
import { assertSameOrigin, handleApiError, ok, parseJsonBody } from '@/server/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateCaseSchema = z
  .object({
    caseNumber: z.string().min(2).max(64),
    title: z.string().min(3).max(200),
    description: z.string().max(2000).optional(),
    buyerName: z.string().max(200).optional(),
    supplierName: z.string().max(200).optional(),
  })
  .strict();

export async function GET(req: Request) {
  try {
    const repo = new InvestigationRepository(getDb());
    const actor = requireAuth(req, repo);
    const cases = repo.listCasesByOrg(actor.organizationId);
    return ok({ cases });
  } catch (err) {
    return handleApiError(err, 'GET /api/v1/cases');
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const repo = new InvestigationRepository(getDb());
    const actor = requireAuth(req, repo);
    const body = await parseJsonBody(req, CreateCaseSchema);
    const service = new InvestigationService(repo);
    const created = service.createInvestigationCase(actor.id, body);
    return ok({ case: created }, 201);
  } catch (err) {
    return handleApiError(err, 'POST /api/v1/cases');
  }
}
