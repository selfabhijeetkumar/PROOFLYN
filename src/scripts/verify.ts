/**
 * PROOFLYN — Comprehensive Verification Script (`npm run verify`)
 *
 * Runs all verification phases in sequence and prints a structured pass/fail summary:
 * 1. Dependency / lockfile check
 * 2. TypeScript type-checking (`tsc --noEmit`)
 * 3. ESLint (`eslint src`, zero warnings/errors)
 * 4. Vitest unit + integration + security tests (`vitest run`)
 * 5. Real stdio MCP smoke test (`src/mcp/smoke-test.ts`)
 * 6. Reproducible demo reset (`src/db/reset.ts`) + cryptographic post-reset validation
 * 7. Next.js production build (`next build`)
 *
 * Exit code 0 iff all checks pass.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process';
import { verifyEventChain } from '@/core';
import { loadEnvFile } from '@/db/env';
import { createDb, getDbPath } from '@/db/schema';
import { getUploadDir } from '@/server/upload';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';

interface CheckResult {
  name: string;
  passed: boolean;
  durationMs: number;
  detail: string;
}

const results: CheckResult[] = [];

function run(name: string, cmd: string, extraEnv: Record<string, string> = {}): CheckResult {
  const start = Date.now();
  try {
    const output = execSync(cmd, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 180_000,
      env: { ...process.env, FORCE_COLOR: '0', ...extraEnv },
    } satisfies ExecSyncOptionsWithStringEncoding);
    const ms = Date.now() - start;
    const result: CheckResult = {
      name,
      passed: true,
      durationMs: ms,
      detail: output.trim().split('\n').slice(-3).join(' | '),
    };
    results.push(result);
    console.log(`  [PASS] ${name} (${ms}ms)`);
    return result;
  } catch (err: unknown) {
    const ms = Date.now() - start;
    const stderr = (err as { stderr?: string }).stderr || '';
    const stdout = (err as { stdout?: string }).stdout || '';
    const detail = (stderr || stdout || (err as Error).message || 'Command failed')
      .trim()
      .split('\n')
      .slice(-5)
      .join(' | ');
    const result: CheckResult = { name, passed: false, durationMs: ms, detail };
    results.push(result);
    console.log(`  [FAIL] ${name} (${ms}ms)`);
    console.log(`         ${detail.slice(0, 220)}`);
    return result;
  }
}

console.log('\n==============================================================');
console.log('PROOFLYN — Full Verification Suite');
console.log('==============================================================\n');

// 1. Dependency validation
console.log('Phase 1: Dependency Validation');
{
  const start = Date.now();
  const lockExists = fs.existsSync(path.resolve('pnpm-lock.yaml'));
  const nodeModulesOk =
    fs.existsSync(path.resolve('node_modules/@modelcontextprotocol/sdk')) &&
    fs.existsSync(path.resolve('node_modules/next')) &&
    fs.existsSync(path.resolve('node_modules/zod'));
  const ms = Date.now() - start;
  const ok = lockExists && nodeModulesOk;
  results.push({
    name: 'dependency-check',
    passed: ok,
    durationMs: ms,
    detail: `pnpm-lock.yaml=${lockExists}, coreDeps=${nodeModulesOk}`,
  });
  console.log(`  ${ok ? '[PASS]' : '[FAIL]'} dependency-check (${ms}ms)`);
}

// 2. Static analysis
console.log('\nPhase 2: Static Analysis');
run('typecheck', 'npx tsc --noEmit');
run('lint', 'npx eslint src');

// 3. Automated test suite
console.log('\nPhase 3: Test Suite');
run('vitest', 'npx vitest run');

// 4. Real MCP stdio smoke test
console.log('\nPhase 4: MCP Integration');
run('mcp:smoke', 'npx tsx src/mcp/smoke-test.ts');

// 5. Reproducible demo reset
console.log('\nPhase 5: Demo Reset & Post-Reset Validation');
run('demo:reset', 'npx tsx src/db/reset.ts');

{
  const start = Date.now();
  try {
    loadEnvFile();
    const db = createDb(getDbPath());
    const repo = new InvestigationRepository(db);
    const inv1047 = repo.getCaseByNumberForOrg('INV-1047', 'org-nexarc-demo');

    if (!inv1047) {
      db.close();
      throw new Error('Seeded INV-1047 case not found after demo:reset');
    }

    const docs = repo.listSourceDocuments(inv1047.id);
    const fields = repo.listExtractedFields(inv1047.id);
    const events = repo.listEvents(inv1047.id);
    const chain = verifyEventChain(events);
    const investigator = repo.getUserByEmail(
      process.env.DEMO_INVESTIGATOR_EMAIL || 'investigator@prooflyn.dev'
    );
    const reviewer = repo.getUserByEmail(
      process.env.DEMO_REVIEWER_EMAIL || 'reviewer@prooflyn.dev'
    );
    const uploadDir = getUploadDir();
    const filesExistOnDisk = docs.every((d) =>
      fs.existsSync(path.join(uploadDir, path.basename(d.storagePath)))
    );
    db.close();

    const ok =
      docs.length >= 3 &&
      fields.length >= 10 &&
      events.length >= 1 &&
      chain.valid &&
      Boolean(investigator && investigator.role === 'INVESTIGATOR') &&
      Boolean(reviewer && reviewer.role === 'REVIEWER') &&
      filesExistOnDisk;

    const ms = Date.now() - start;
    const detail = `docs=${docs.length}, fields=${fields.length}, events=${events.length}, chainValid=${chain.valid}, filesOnDisk=${filesExistOnDisk}`;
    results.push({ name: 'post-reset-validation', passed: ok, durationMs: ms, detail });
    console.log(`  ${ok ? '[PASS]' : '[FAIL]'} post-reset-validation (${ms}ms) — ${detail}`);
  } catch (err: unknown) {
    const ms = Date.now() - start;
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name: 'post-reset-validation', passed: false, durationMs: ms, detail });
    console.log(`  [FAIL] post-reset-validation (${ms}ms) — ${detail}`);
  }
}

// 6. Production Next.js build
console.log('\nPhase 6: Production Build');
fs.rmSync(path.resolve('.next'), { recursive: true, force: true });
run('next-build', 'npx next build', { NODE_ENV: 'production' });

// Summary
console.log('\n==============================================================');
console.log('VERIFICATION SUMMARY');
console.log('==============================================================\n');

const passed = results.filter((r) => r.passed);
const failed = results.filter((r) => !r.passed);
const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

for (const r of results) {
  console.log(`  ${r.passed ? '[PASS]' : '[FAIL]'} ${r.name.padEnd(26)} ${String(r.durationMs).padStart(7)}ms`);
}

console.log(`\n  Passed: ${passed.length}/${results.length} | Total time: ${(totalMs / 1000).toFixed(1)}s`);

if (failed.length > 0) {
  console.log('\n  Failed checks:');
  for (const f of failed) {
    console.log(`    - ${f.name}: ${f.detail.slice(0, 180)}`);
  }
  console.log('\n  VERDICT: VERIFICATION FAILED\n');
  process.exit(1);
}

console.log('\n  VERDICT: ALL CHECKS PASSED\n');
process.exit(0);
