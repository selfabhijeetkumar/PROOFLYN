/**
 * PROOFLYN — Database Seed CLI (`npm run db:seed`)
 * Reads seeded demo user credentials from environment variables (never hardcoded).
 */

import { loadEnvFile } from './env';
import { createDb, runMigrations } from './schema';
import { seedDatabase } from './seed-data';
import { getUploadDir } from '@/server/upload';

function requireEnv(name: string, fallback?: string): string {
  const val = process.env[name]?.trim() || fallback;
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}. Set it in .env before running db:seed.`);
  }
  return val;
}

function main(): void {
  loadEnvFile();
  const investigatorEmail = requireEnv('DEMO_INVESTIGATOR_EMAIL', 'investigator@prooflyn.dev');
  const investigatorPassword = requireEnv('DEMO_INVESTIGATOR_PASSWORD');
  const reviewerEmail = requireEnv('DEMO_REVIEWER_EMAIL', 'reviewer@prooflyn.dev');
  const reviewerPassword = requireEnv('DEMO_REVIEWER_PASSWORD');

  const db = createDb();
  runMigrations(db);
  const result = seedDatabase(db, {
    investigatorEmail,
    investigatorPassword,
    reviewerEmail,
    reviewerPassword,
    uploadDir: getUploadDir(),
    includeExtraCases: true,
  });
  db.close();
  console.log('Seed completed cleanly:', result);
}

main();
