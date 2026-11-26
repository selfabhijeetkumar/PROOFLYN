import { z } from 'zod';
import { generateId, type DocumentType } from '@/core';
import { getDb } from '@/db/connection';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { InvestigationService, ServiceError } from '@/server/services/investigation-service';
import { requireAuth } from '@/server/auth';
import { checkRateLimit } from '@/server/rate-limit';
import {
  getUploadDir,
  MAX_UPLOAD_BYTES,
  removeStoredUploadFile,
  storeUploadFile,
  validateUploadFile,
} from '@/server/upload';
import { extractDocumentFields } from '@/server/extraction';
import { assertSameOrigin, handleApiError, ok } from '@/server/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DocTypeSchema = z.enum(['PURCHASE_ORDER', 'INVOICE', 'DELIVERY_RECORD', 'SUPPORTING']);

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
    const documents = repo.listSourceDocuments(caseData.id);
    return ok({ documents });
  } catch (err) {
    return handleApiError(err, 'GET /api/v1/cases/[id]/documents');
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  let uploadDir: string | null = null;
  let storedPath: string | null = null;

  try {
    assertSameOrigin(req);
    const { id } = await context.params;
    const repo = new InvestigationRepository(getDb());
    const actor = requireAuth(req, repo);
    checkRateLimit(`upload:${actor.id}`, 30, 60_000);

    const service = new InvestigationService(repo);
    const { caseData } = service.authorizeCaseAccess(id, actor.id);

    const contentLength = Number(req.headers.get('content-length') || '0');
    if (contentLength > MAX_UPLOAD_BYTES + 64 * 1024) {
      throw new ServiceError('FILE_TOO_LARGE', 'Request payload exceeds the 10 MB upload cap.', 413);
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      throw new ServiceError('INVALID_UPLOAD', 'Expected multipart/form-data upload.', 400);
    }

    const fileEntry = formData.get('file');
    const docTypeRaw = formData.get('documentType');
    if (!fileEntry || typeof fileEntry === 'string' || typeof fileEntry.arrayBuffer !== 'function') {
      throw new ServiceError('INVALID_UPLOAD', 'Missing "file" field in form-data.', 400);
    }

    const parsedDocType = DocTypeSchema.safeParse(docTypeRaw);
    if (!parsedDocType.success) {
      throw new ServiceError(
        'VALIDATION_ERROR',
        'Invalid documentType. Must be PURCHASE_ORDER, INVOICE, DELIVERY_RECORD, or SUPPORTING.',
        400
      );
    }
    const documentType: DocumentType = parsedDocType.data;

    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    const validated = validateUploadFile(fileEntry.name || 'upload.bin', buffer);

    uploadDir = getUploadDir();
    storedPath = storeUploadFile(uploadDir, validated.extension, buffer);

    const documentId = generateId();
    const extraction = await extractDocumentFields({
      caseId: caseData.id,
      documentId,
      documentType,
      extension: validated.extension,
      buffer,
    });

    const saved = service.recordDocumentAndExtraction(
      caseData.id,
      actor.id,
      {
        id: documentId,
        documentType,
        originalFilename: validated.safeOriginalFilename,
        storagePath: storedPath,
        mimeType: validated.mimeType,
        sizeBytes: validated.sizeBytes,
        sha256: validated.sha256Hex,
        uploadedAt: new Date().toISOString(),
      },
      extraction.fields,
      extraction.method,
      extraction.warning
    );

    return ok(saved, 201);
  } catch (err) {
    if (uploadDir && storedPath) {
      removeStoredUploadFile(uploadDir, storedPath);
    }
    return handleApiError(err, 'POST /api/v1/cases/[id]/documents');
  }
}
