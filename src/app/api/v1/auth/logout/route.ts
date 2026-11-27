import { buildClearSessionCookieHeader } from '@/server/auth';
import { assertSameOrigin, handleApiError, ok } from '@/server/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    return ok({ loggedOut: true }, 200, {
      'Set-Cookie': buildClearSessionCookieHeader(),
    });
  } catch (err) {
    return handleApiError(err, 'POST /api/v1/auth/logout');
  }
}
