import { NextResponse } from 'next/server';
import { getDb } from '@/db/connection';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { InvestigationService, ServiceError } from '@/server/services/investigation-service';
import { requireAuth } from '@/server/auth';
import { getUploadDir, readStoredUploadFile } from '@/server/upload';
import { handleApiError } from '@/server/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await context.params;
    const repo = new InvestigationRepository(getDb());
    const actor = requireAuth(req, repo);
    const service = new InvestigationService(repo);
    const { caseData } = service.authorizeCaseAccess(id, actor.id);

    const doc = repo.getSourceDocument(caseData.id, docId);
    if (!doc) {
      throw new ServiceError('NOT_FOUND', 'Source document not found.', 404);
    }

    const bytes = readStoredUploadFile(getUploadDir(), doc.storagePath);
    const safeDownloadName = doc.originalFilename.replace(/["\r\n]/g, '_');

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': doc.mimeType,
        'Content-Disposition': `attachment; filename="${safeDownloadName}"`,
        'X-Content-Type-Options': 'nosniff',
        'X-Document-Sha256': doc.sha256,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleApiError(err, 'GET /api/v1/cases/[id]/documents/[docId]/download');
  }
}
