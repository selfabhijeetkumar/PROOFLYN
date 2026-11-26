/**
 * PROOFLYN — MCP Client Gateway
 * Singleton cached on globalThis (Node runtime).
 * Spawns the real stdio MCP server, validates tool calls, enforces timeout + 1 reconnect,
 * and persists every call in mcp_tool_calls + investigation_events.
 */

import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { generateId, hashObject } from '@/core';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { logEvent } from '@/server/logger';

export class McpGatewayError extends Error {
  constructor(
    public readonly code: 'MCP_TIMEOUT' | 'MCP_CONNECTION_ERROR' | 'MCP_TOOL_ERROR',
    message: string,
    public readonly statusCode: number = 502
  ) {
    super(message);
    this.name = 'McpGatewayError';
  }
}

export interface McpCallOptions {
  timeoutMs?: number;
  databasePath?: string;
}

export class McpGateway {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(private readonly defaultTimeoutMs: number = 15000) {}

  private async connect(databasePath?: string): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const tsxCli = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
      const serverEntry = path.resolve(process.cwd(), 'src/mcp/server.ts');
      const childEnv: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) childEnv[k] = v;
      }
      childEnv.PROOFLYN_GATEWAY_MANAGED = '1';
      if (databasePath) {
        childEnv.DATABASE_PATH = databasePath;
      }

      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [tsxCli, serverEntry],
        cwd: process.cwd(),
        env: childEnv,
        stderr: 'pipe',
      });

      if (transport.stderr) {
        transport.stderr.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf8').trim();
          if (text) {
            logEvent('info', 'mcp_server_stderr', { line: text });
          }
        });
      }

      transport.onclose = () => {
        this.client = null;
        this.transport = null;
      };

      const client = new Client({ name: 'prooflyn-web-gateway', version: '1.0.0' });
      await client.connect(transport);
      this.client = client;
      this.transport = transport;
      return client;
    })();

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async close(): Promise<void> {
    try {
      await this.client?.close();
    } catch {
      // ignore close error
    }
    try {
      await this.transport?.close();
    } catch {
      // ignore close error
    }
    this.client = null;
    this.transport = null;
  }

  async listTools(options?: McpCallOptions) {
    const client = await this.connect(options?.databasePath);
    return client.listTools(undefined, { timeout: options?.timeoutMs ?? this.defaultTimeoutMs });
  }

  async callTool<T>(
    toolName: string,
    args: { caseId: string; actorId: string; [key: string]: unknown },
    repo: InvestigationRepository = new InvestigationRepository(),
    options?: McpCallOptions
  ): Promise<T> {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const started = Date.now();
    const inputHash = hashObject(args);

    const attemptCall = async (): Promise<T> => {
      const client = await this.connect(options?.databasePath);
      const raw = await client.callTool(
        { name: toolName, arguments: args },
        undefined,
        { timeout: timeoutMs }
      );

      const textBlock = (raw.content as Array<{ type: string; text?: string }>)?.find(
        (c) => c.type === 'text' && typeof c.text === 'string'
      );
      const parsed = textBlock?.text ? JSON.parse(textBlock.text) : null;

      if (raw.isError) {
        const errInfo = parsed?.error || { code: 'MCP_TOOL_ERROR', message: textBlock?.text || 'MCP tool failed' };
        throw new McpGatewayError('MCP_TOOL_ERROR', `${errInfo.code}: ${errInfo.message}`, 400);
      }
      return parsed as T;
    };

    try {
      let result: T;
      try {
        result = await attemptCall();
      } catch (firstErr) {
        // Reconnect once if transport/connection failed (never retry business validation errors)
        if (firstErr instanceof McpGatewayError && firstErr.code === 'MCP_TOOL_ERROR') {
          throw firstErr;
        }
        logEvent('warn', 'mcp_gateway_reconnect', {
          toolName,
          reason: firstErr instanceof Error ? firstErr.message : String(firstErr),
        });
        await this.close();
        result = await attemptCall();
      }

      const durationMs = Date.now() - started;
      const outputHash = hashObject(result);

      repo.logMcpToolCall({
        id: generateId(),
        caseId: args.caseId,
        toolName,
        actorId: args.actorId,
        inputHash,
        status: 'SUCCESS',
        durationMs,
        outputHash,
        error: null,
      });

      const caseExists = repo.getCaseByIdForOrg(
        args.caseId,
        repo.getUserById(args.actorId)?.organizationId || ''
      );
      if (caseExists) {
        repo.appendEvent(
          caseExists.id,
          'MCP_TOOL_CALL',
          args.actorId,
          `MCP tool "${toolName}" succeeded in ${durationMs}ms.`,
          { toolName, durationMs, inputHash, outputHash }
        );
      }

      return result;
    } catch (err) {
      const durationMs = Date.now() - started;
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = /timeout|timed out/i.test(message);
      const status = isTimeout ? 'TIMEOUT' : 'ERROR';

      try {
        repo.logMcpToolCall({
          id: generateId(),
          caseId: args.caseId,
          toolName,
          actorId: args.actorId,
          inputHash,
          status,
          durationMs,
          outputHash: null,
          error: message,
        });
      } catch {
        // ignore logging failure
      }

      if (err instanceof McpGatewayError) throw err;
      throw new McpGatewayError(
        isTimeout ? 'MCP_TIMEOUT' : 'MCP_CONNECTION_ERROR',
        message,
        isTimeout ? 504 : 502
      );
    }
  }
}

const globalForGateway = globalThis as unknown as {
  __prooflynMcpGateway?: McpGateway;
};

export function getMcpGateway(): McpGateway {
  if (!globalForGateway.__prooflynMcpGateway) {
    globalForGateway.__prooflynMcpGateway = new McpGateway();
  }
  return globalForGateway.__prooflynMcpGateway;
}
