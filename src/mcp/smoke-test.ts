/**
 * PROOFLYN — Real MCP Smoke Test (`npm run mcp:smoke`)
 * Connects a real MCP SDK Client over StdioClientTransport to src/mcp/server.ts,
 * verifies all 6 tools are discoverable, rejects unknown input fields, executes all 6 tools
 * against seeded INV-1047, asserts results, and exits non-zero on failure.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createDb, runMigrations } from '@/db/schema';
import { seedDatabase } from '@/db/seed-data';
import type {
  McpCaseContext,
  McpReconcileResult,
  McpGapResult,
  McpBlockerResult,
  McpGraphResult,
  McpReportResult,
} from '@/core';

const EXPECTED_TOOLS = [
  'get_case_context',
  'reconcile_case_records',
  'detect_evidence_gaps',
  'assess_payment_blockers',
  'get_evidence_graph',
  'generate_evidence_report',
];

async function main(): Promise<void> {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prooflyn-mcp-smoke-'));
  const dbPath = path.join(tempRoot, 'smoke.db');
  const uploadDir = path.join(tempRoot, 'uploads');

  const db = createDb(dbPath);
  runMigrations(db);
  const seeded = seedDatabase(db, {
    investigatorEmail: 'investigator@prooflyn.dev',
    investigatorPassword: 'smoke-test-investigator',
    reviewerEmail: 'reviewer@prooflyn.dev',
    reviewerPassword: 'smoke-test-reviewer',
    uploadDir,
  });
  db.close();

  const tsxCli = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
  const serverEntry = path.resolve(process.cwd(), 'src/mcp/server.ts');

  const childEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) childEnv[k] = v;
  }
  childEnv.DATABASE_PATH = dbPath;
  childEnv.UPLOAD_DIR = uploadDir;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCli, serverEntry],
    cwd: process.cwd(),
    env: childEnv,
    stderr: 'pipe',
  });

  const client = new Client({ name: 'prooflyn-smoke-client', version: '1.0.0' });

  try {
    await client.connect(transport);
    console.log('Connected to PROOFLYN MCP server over stdio.');

    const listResult = await client.listTools();
    const toolNames = listResult.tools.map((t) => t.name).sort();
    console.log('Discovered MCP tools:', toolNames.join(', '));
    assert.deepEqual(toolNames, [...EXPECTED_TOOLS].sort());

    const parseToolJson = <T>(res: Awaited<ReturnType<typeof client.callTool>>): T => {
      assert.ok(!res.isError, `Tool returned error: ${JSON.stringify(res.content)}`);
      const textBlock = (res.content as Array<{ type: string; text?: string }>).find(
        (c) => c.type === 'text' && typeof c.text === 'string'
      );
      assert.ok(textBlock?.text, 'Missing text response block');
      return JSON.parse(textBlock.text) as T;
    };

    // Negative test: strict schema rejects unknown input fields
    const unknownFieldRes = await client.callTool({
      name: 'get_case_context',
      arguments: {
        caseId: seeded.inv1047CaseId,
        actorId: seeded.investigatorId,
        unexpectedField: 'should-fail',
      },
    });
    assert.equal(unknownFieldRes.isError, true, 'Unknown input field must be rejected');

    // 1. get_case_context
    const ctx = parseToolJson<McpCaseContext>(
      await client.callTool({
        name: 'get_case_context',
        arguments: { caseId: seeded.inv1047CaseId, actorId: seeded.investigatorId },
      })
    );
    assert.equal(ctx.caseNumber, 'INV-1047');
    assert.equal(ctx.documents.length, 3);

    // 2. reconcile_case_records
    const rec = parseToolJson<McpReconcileResult>(
      await client.callTool({
        name: 'reconcile_case_records',
        arguments: { caseId: seeded.inv1047CaseId, actorId: seeded.investigatorId },
      })
    );
    const qtyDisc = rec.discrepancies.find((d) => d.ruleId === 'R-QTY-01');
    assert.ok(qtyDisc, 'Expected R-QTY-01 discrepancy for INV-1047');
    assert.equal(qtyDisc.expectedValue, '90');
    assert.equal(qtyDisc.actualValue, '100');
    assert.equal(qtyDisc.varianceValue, 1250000);

    // 3. detect_evidence_gaps
    const gaps = parseToolJson<McpGapResult>(
      await client.callTool({
        name: 'detect_evidence_gaps',
        arguments: { caseId: seeded.inv1047CaseId, actorId: seeded.investigatorId },
      })
    );
    assert.ok(gaps.gaps.some((g) => g.ruleId === 'R-VER-01'));
    assert.equal(gaps.coverage.total, 14);

    // 4. assess_payment_blockers
    const blockers = parseToolJson<McpBlockerResult>(
      await client.callTool({
        name: 'assess_payment_blockers',
        arguments: { caseId: seeded.inv1047CaseId, actorId: seeded.investigatorId },
      })
    );
    assert.ok(blockers.blockers.some((b) => b.ruleId === 'R-QTY-01'));

    // 5. get_evidence_graph
    const graph = parseToolJson<McpGraphResult>(
      await client.callTool({
        name: 'get_evidence_graph',
        arguments: { caseId: seeded.inv1047CaseId, actorId: seeded.investigatorId },
      })
    );
    assert.ok(graph.nodes.length >= 16);
    assert.ok(graph.edges.length >= 15);

    // 6. generate_evidence_report
    const report = parseToolJson<McpReportResult>(
      await client.callTool({
        name: 'generate_evidence_report',
        arguments: { caseId: seeded.inv1047CaseId, actorId: seeded.investigatorId },
      })
    );
    assert.equal(report.status, 'GENERATED');
    assert.ok(report.reportId);
    assert.ok(report.findings.some((f) => f.ruleId === 'R-QTY-01'));

    // Verify all 6 tool calls were persisted in mcp_tool_calls (plus 1 error call for unknown field if handler reached, or 6)
    const verifyDb = createDb(dbPath);
    const rows = verifyDb
      .prepare('SELECT tool_name, status FROM mcp_tool_calls WHERE case_id = ? ORDER BY rowid ASC')
      .all<{ tool_name: string; status: string }>(seeded.inv1047CaseId);
    verifyDb.close();
    assert.equal(rows.length, 6, `Expected 6 logged MCP tool calls, got ${rows.length}`);
    assert.ok(rows.every((r) => r.status === 'SUCCESS'));

    console.log('MCP smoke test PASSED: all 6 tools discovered, validated, executed, and logged.');
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('MCP smoke test FAILED:', err);
  process.exit(1);
});
