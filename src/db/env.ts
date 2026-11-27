/**
 * PROOFLYN — Safe environment loader (no third-party dotenv required)
 * Loads .env from project root if present, never overwriting existing process.env keys.
 */
import fs from 'node:fs';
import path from 'node:path';

let loaded = false;

export function loadEnvFile(rootDir = process.cwd()): void {
  if (loaded) return;
  loaded = true;

  const envPath = path.resolve(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let val = line.slice(eqIndex + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}
