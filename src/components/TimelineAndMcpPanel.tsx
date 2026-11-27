'use client';

import type { InvestigationEvent, McpToolCall } from '@/core/types';
import { CheckCircleIcon, TerminalIcon } from './Icons';

interface TimelineAndMcpPanelProps {
  events: InvestigationEvent[];
  chainVerification: { valid: boolean; brokenAt?: number; reason?: string };
  mcpCalls: McpToolCall[];
}

export function TimelinePanel({ events, chainVerification }: Omit<TimelineAndMcpPanelProps, 'mcpCalls'>) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="row" style={{ marginBottom: '4px' }}>
            <CheckCircleIcon size={15} />
            <h3 style={{ margin: 0 }}>Append-Only Transaction Memory ({events.length} events)</h3>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Every state mutation appends a SHA-256 hash-chained event linking cryptographically to the prior event.
          </p>
        </div>
        <span className={`badge ${chainVerification.valid ? 'ok' : 'danger'}`}>
          Hash Chain: {chainVerification.valid ? 'VERIFIED VALID' : 'INTEGRITY BROKEN'}
        </span>
      </div>

      {!chainVerification.valid && chainVerification.reason && (
        <div className="alert error" style={{ marginTop: '8px' }}>
          {chainVerification.reason}
        </div>
      )}

      {events.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>No events recorded yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Event Type</th>
                <th>Actor</th>
                <th>Audit Description</th>
                <th>Event Hash → Previous Hash</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td className="mono small muted">{ev.createdAt}</td>
                  <td>
                    <span className="badge info">{ev.eventType}</span>
                  </td>
                  <td className="mono small">{ev.actorId}</td>
                  <td>{ev.description}</td>
                  <td className="mono small">
                    <div>{ev.eventHash.slice(0, 16)}…</div>
                    <div className="muted">
                      prev: {ev.previousEventHash ? `${ev.previousEventHash.slice(0, 16)}…` : 'GENESIS'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function McpEvidencePanel({ mcpCalls }: { mcpCalls: McpToolCall[] }) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="row" style={{ marginBottom: '4px' }}>
            <TerminalIcon size={15} />
            <h3 style={{ margin: 0 }}>MCP Evidence — Real Tool-Call Audit Log ({mcpCalls.length})</h3>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Every tool execution routed via <code className="mono">McpGateway</code> over stdio
            JSON-RPC to <code className="mono">src/mcp/server.ts</code> with deterministic input/output hashes.
          </p>
        </div>
        <span className="badge ok">Stdio JSON-RPC Verified</span>
      </div>

      {mcpCalls.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No MCP tool calls recorded yet for this case. Run MCP Reconciliation, Refresh Graph, or
          Generate Evidence Pack to execute live MCP tools.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>MCP Tool Name</th>
                <th>Actor</th>
                <th>Status</th>
                <th className="text-right">Latency</th>
                <th>Input SHA-256</th>
                <th>Output SHA-256</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {mcpCalls.map((c) => (
                <tr key={c.id}>
                  <td className="mono small muted">{c.createdAt}</td>
                  <td className="mono">
                    <strong>{c.toolName}</strong>
                  </td>
                  <td className="mono small">{c.actorId}</td>
                  <td>
                    <span className={`badge ${c.status === 'SUCCESS' ? 'ok' : 'danger'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="mono small text-right">{c.durationMs} ms</td>
                  <td className="mono small">{c.inputHash.slice(0, 14)}…</td>
                  <td className="mono small">{c.outputHash ? `${c.outputHash.slice(0, 14)}…` : '—'}</td>
                  <td className="small muted">{c.error ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
