/**
 * PROOFLYN — Real MCP Server (@modelcontextprotocol/sdk over stdio)
 * Exposes exactly 6 investigation tools backed by core/ through InvestigationService.
 * NEVER writes anything except JSON-RPC protocol messages to stdout; logs go to stderr.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { generateId, hashObject } from '@/core';
import { loadEnvFile } from '@/db/env';
import { getDb } from '@/db/connection';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { InvestigationService, ServiceError } from '@/server/services/investigation-service';
import { logEvent } from '@/server/logger';

loadEnvFile();

const CaseIdInputSchema = z
  .object({
    caseId: z.string().min(1).max(128),
    actorId: z.string().min(1).max(128).optional(),
  })
  .strict();

const ReconcileInputSchema = z
  .object({
    caseId: z.string().min(1).max(128),
    actorId: z.string().min(1).max(128).optional(),
    recordIds: z.array(z.string().min(1).max(128)).max(100).optional(),
  })
  .strict();

const GenerateReportInputSchema = z
  .object({
    caseId: z.string().min(1).max(128),
    actorId: z.string().min(1).max(128).optional(),
    options: z
      .object({
        includeHtml: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

function resolveActorId(provided?: string): string {
  const actorId = provided || process.env.MCP_DEFAULT_ACTOR_ID;
  if (!actorId) {
    throw new ServiceError(
      'UNAUTHORIZED',
      'Actor identity (actorId) is required for authorization.',
      401
    );
  }
  return actorId;
}

export function createProoflynMcpServer(repo = new InvestigationRepository(getDb())): McpServer {
  const service = new InvestigationService(repo);
  const gatewayManaged = process.env.PROOFLYN_GATEWAY_MANAGED === '1';

  const server = new McpServer({
    name: 'prooflyn-evidence-mcp',
    version: '1.0.0',
  });

  const runTool = async <T>(
    toolName: string,
    args: { caseId: string; actorId?: string },
    fn: (actorId: string) => T
  ) => {
    const started = Date.now();
    const inputHash = hashObject(args);
    let actorId = args.actorId || 'unknown';
    try {
      actorId = resolveActorId(args.actorId);
      const result = fn(actorId);
      const text = JSON.stringify(result);
      if (!gatewayManaged) {
        repo.logMcpToolCall({
          id: generateId(),
          caseId: args.caseId,
          toolName,
          actorId,
          inputHash,
          status: 'SUCCESS',
          durationMs: Date.now() - started,
          outputHash: hashObject(result),
          error: null,
        });
      }
      logEvent('info', 'mcp_tool_success', { toolName, caseId: args.caseId, actorId });
      return {
        content: [{ type: 'text' as const, text }],
      };
    } catch (err) {
      const code = err instanceof ServiceError ? err.code : 'INTERNAL_ERROR';
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (!gatewayManaged) {
        try {
          repo.logMcpToolCall({
            id: generateId(),
            caseId: args.caseId,
            toolName,
            actorId,
            inputHash,
            status: 'ERROR',
            durationMs: Date.now() - started,
            outputHash: null,
            error: `${code}: ${message}`,
          });
        } catch {
          // Avoid masking original tool error if DB logging fails
        }
      }
      logEvent('error', 'mcp_tool_error', { toolName, caseId: args.caseId, code, message });
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: { code, message } }),
          },
        ],
      };
    }
  };

  server.registerTool(
    'get_case_context',
    {
      description:
        'Read-only lookup of investigation case details, parties, documents, verified/unverified fields, findings, gaps, blockers, and evidence references.',
      inputSchema: CaseIdInputSchema,
    },
    async (args) =>
      runTool('get_case_context', args, (actorId) => service.getCaseContext(args.caseId, actorId))
  );

  server.registerTool(
    'reconcile_case_records',
    {
      description:
        'Execute deterministic cross-document reconciliation across PO, Invoice, and Delivery Records; creates or reuses an immutable idempotent ReconciliationRun.',
      inputSchema: ReconcileInputSchema,
    },
    async (args) =>
      runTool('reconcile_case_records', args, (actorId) =>
        service.reconcileCaseRecords(args.caseId, actorId, args.recordIds)
      )
  );

  server.registerTool(
    'detect_evidence_gaps',
    {
      description:
        'Detect missing documents, missing/invalid fields, conflicting metadata, and unverified fields; computes evidence coverage ratio and confidence ladder.',
      inputSchema: CaseIdInputSchema,
    },
    async (args) =>
      runTool('detect_evidence_gaps', args, (actorId) =>
        service.detectEvidenceGaps(args.caseId, actorId)
      )
  );

  server.registerTool(
    'assess_payment_blockers',
    {
      description:
        'Generate advisory payment blockers with originating rule IDs, impact, evidence references, and human resolution requirements.',
      inputSchema: CaseIdInputSchema,
    },
    async (args) =>
      runTool('assess_payment_blockers', args, (actorId) =>
        service.assessPaymentBlockers(args.caseId, actorId)
      )
  );

  server.registerTool(
    'get_evidence_graph',
    {
      description:
        'Build and return explainable evidence graph nodes and provenance edges linking case, documents, fields, discrepancies, and gaps.',
      inputSchema: CaseIdInputSchema,
    },
    async (args) =>
      runTool('get_evidence_graph', args, (actorId) =>
        service.getEvidenceGraph(args.caseId, actorId)
      )
  );

  server.registerTool(
    'generate_evidence_report',
    {
      description:
        'Create or retrieve an immutable Dispute-Ready Evidence Pack report snapshot grounded in case records, findings, gaps, blockers, timeline, and MCP logs.',
      inputSchema: GenerateReportInputSchema,
    },
    async (args) =>
      runTool('generate_evidence_report', args, (actorId) => {
        const res = service.generateEvidenceReport(args.caseId, actorId, args.options);
        return {
          reportId: res.reportId,
          snapshotHash: res.snapshotHash,
          status: res.status,
          findings: res.findings,
          sourceReferences: res.sourceReferences,
          limitations: res.limitations,
        };
      })
  );

  return server;
}

async function main(): Promise<void> {
  const server = createProoflynMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logEvent('info', 'mcp_server_started', { transport: 'stdio' });
}

const isEntrypoint =
  process.argv[1]?.endsWith('mcp/server.ts') || process.argv[1]?.endsWith('mcp\\server.ts');

if (isEntrypoint) {
  main().catch((err) => {
    logEvent('error', 'mcp_server_fatal', {
      message: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
