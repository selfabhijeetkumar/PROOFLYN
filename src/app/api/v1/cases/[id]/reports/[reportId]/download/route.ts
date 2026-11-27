import { NextResponse } from 'next/server';
import { generateReportHtml, type ReportContent } from '@/core';
import { getDb } from '@/db/connection';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { InvestigationService, ServiceError } from '@/server/services/investigation-service';
import { requireAuth } from '@/server/auth';
import { handleApiError } from '@/server/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string; reportId: string }> }
) {
  try {
    const { id, reportId } = await context.params;
    const repo = new InvestigationRepository(getDb());
    const actor = requireAuth(req, repo);
    const service = new InvestigationService(repo);
    const { caseData } = service.authorizeCaseAccess(id, actor.id);

    const report = repo.getReport(caseData.id, reportId);
    if (!report) {
      throw new ServiceError('NOT_FOUND', 'Report not found.', 404);
    }

    const url = new URL(req.url);
    const format = (url.searchParams.get('format') || 'json').toLowerCase();
    const safeCase = caseData.caseNumber.replace(/[^\w.-]/g, '_');

    if (format === 'html') {
      const html =
        report.contentHtml ||
        generateReportHtml(JSON.parse(report.contentJson) as ReportContent);
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="PROOFLYN-${safeCase}-evidence-pack.html"`,
          'X-Content-Type-Options': 'nosniff',
          'X-Report-Snapshot-Hash': report.snapshotHash,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'json') {
      return new NextResponse(report.contentJson, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="PROOFLYN-${safeCase}-evidence-pack.json"`,
          'X-Content-Type-Options': 'nosniff',
          'X-Report-Snapshot-Hash': report.snapshotHash,
          'Cache-Control': 'no-store',
        },
      });
    }

    throw new ServiceError('VALIDATION_ERROR', 'Unsupported download format. Use json or html.', 400);
  } catch (err) {
    return handleApiError(err, 'GET /api/v1/cases/[id]/reports/[reportId]/download');
  }
}
