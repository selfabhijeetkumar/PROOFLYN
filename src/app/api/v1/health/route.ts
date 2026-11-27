import { getDb } from '@/db/connection';
import { handleApiError, ok } from '@/server/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const row = db.prepare('SELECT 1 AS ok').get<{ ok: number }>();
    return ok({
      status: row?.ok === 1 ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return handleApiError(err, 'GET /api/v1/health');
  }
}
