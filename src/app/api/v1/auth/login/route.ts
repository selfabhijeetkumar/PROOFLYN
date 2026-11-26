import { z } from 'zod';
import { getDb } from '@/db/connection';
import { verifyPassword } from '@/db/seed-data';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import {
  buildSessionCookieHeader,
  signSessionToken,
} from '@/server/auth';
import { checkRateLimit } from '@/server/rate-limit';
import { assertSameOrigin, handleApiError, ok, parseJsonBody } from '@/server/api-helpers';
import { ServiceError } from '@/server/services/investigation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LoginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1).max(200),
  })
  .strict();

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = await parseJsonBody(req, LoginSchema);
    checkRateLimit(`login:${body.email.toLowerCase()}`, 20, 60_000);

    const repo = new InvestigationRepository(getDb());
    const user = repo.getUserByEmail(body.email);
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      throw new ServiceError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
    }

    const actor = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      name: user.name,
    };
    const token = signSessionToken(actor);

    return ok({ user: actor }, 200, {
      'Set-Cookie': buildSessionCookieHeader(token),
    });
  } catch (err) {
    return handleApiError(err, 'POST /api/v1/auth/login');
  }
}
