'use client';

import type { InvestigationEvent, McpToolCall } from '@/core/types';

interface TimelineAndMcpPanelProps {
  events: InvestigationEvent[];
  chainVerification: { valid: boolean; brokenAt?: number; reason?: string };
  mcpCalls: McpToolCall[];
}

export function TimelinePanel({ events, chainVerification }: Omit<TimelineAndMcpPanelProps, 'mcpCalls'>) {
  return (
    <div className="card">
      <div className="row-between">
        <div>
          <h3>Append-Only Transaction Memory ({events.length} events)</h3>
          <p className="small muted">
            Every mutation appends a SHA-256 hash-chained event linking to the prior event hash.
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
        <p className="muted">No events recorded yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Event Type</th>
                <th>Actor</th>
                <th>Description</th>
                <th>Event Hash / Prev Hash</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td className="small muted">{ev.createdAt}</td>
                  <td>
                    <span className="badge info">{ev.eventType}</span>
                  </td>
                  <td className="mono small">{ev.actorId}</td>
                  <td>{ev.description}</td>
                  <td className="mono small">
                    <div>{ev.eventHash.slice(0, 14)}…</div>
                    <div className="muted">
                      prev: {ev.previousEventHash ? `${ev.previousEventHash.slice(0, 14)}…` : 'GENESIS'}
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
      <h3>MCP Evidence — Real Tool-Call Audit Log ({mcpCalls.length})</h3>
      <p className="small muted">
        Every investigation action executed through <code className="mono">McpGateway</code> over
        stdio JSON-RPC to <code className="mono">src/mcp/server.ts</code> is persisted here with
        input/output hashes and latency.
      </p>

      {mcpCalls.length === 0 ? (
        <p className="muted">
          No MCP tool calls recorded yet for this case. Run MCP Reconciliation, Refresh Graph, or
          Generate Evidence Pack to execute live MCP tools.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Tool Name</th>
                <th>Actor</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Input Hash</th>
                <th>Output Hash</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {mcpCalls.map((c) => (
                <tr key={c.id}>
                  <td className="small muted">{c.createdAt}</td>
                  <td className="mono">{c.toolName}</td>
                  <td className="mono small">{c.actorId}</td>
                  <td>
                    <span className={`badge ${c.status === 'SUCCESS' ? 'ok' : 'danger'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="small">{c.durationMs} ms</td>
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
