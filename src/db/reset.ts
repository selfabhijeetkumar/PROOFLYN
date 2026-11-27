/**
 * PROOFLYN — Reproducible Demo Reset CLI (`npm run demo:reset`)
 * Deletes existing SQLite DB and uploaded files, re-runs migrations, and seeds synthetic INV-1047 + fixtures.
 * Credentials are read strictly from environment variables.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from './env';
import { createDb, getDbPath, runMigrations } from './schema';
import { closeDb } from './connection';
import { seedDatabase } from './seed-data';
import { getUploadDir } from '@/server/upload';

function requireEnv(name: string, fallback?: string): string {
  const val = process.env[name]?.trim() || fallback;
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}. Set it in .env before running demo:reset.`);
  }
  return val;
}

function main(): void {
  loadEnvFile();
  const investigatorEmail = requireEnv('DEMO_INVESTIGATOR_EMAIL', 'investigator@prooflyn.dev');
  const investigatorPassword = requireEnv('DEMO_INVESTIGATOR_PASSWORD');
  const reviewerEmail = requireEnv('DEMO_REVIEWER_EMAIL', 'reviewer@prooflyn.dev');
  const reviewerPassword = requireEnv('DEMO_REVIEWER_PASSWORD');

  closeDb();

  const dbPath = getDbPath();
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${dbPath}${suffix}`;
    if (fs.existsSync(target)) {
      try {
        fs.unlinkSync(target);
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        if (code === 'EBUSY' || code === 'EPERM') {
          throw new Error(
            `Cannot reset database (${target} is locked by another running process). Stop the running PROOFLYN server (Ctrl+C) and re-run npm run demo:reset.`
          );
        }
        throw err;
      }
    }
  }

  const uploadDir = getUploadDir();
  if (fs.existsSync(uploadDir)) {
    for (const entry of fs.readdirSync(uploadDir)) {
      const full = path.join(uploadDir, entry);
      try {
        fs.chmodSync(full, 0o644);
      } catch {
        // ignore
      }
      fs.rmSync(full, { recursive: true, force: true });
    }
  }

  const db = createDb(dbPath);
  runMigrations(db);
  const seeded = seedDatabase(db, {
    investigatorEmail,
    investigatorPassword,
    reviewerEmail,
    reviewerPassword,
    uploadDir,
    includeExtraCases: true,
  });
  db.close();
  console.log('Demo reset completed cleanly:', seeded);
}

main();
