'use client';

import { useState } from 'react';
import type { FollowUpDraft, Report } from '@/core/types';
import type { ReportContent } from '@/core/report-builder';
import { apiFetch } from '@/lib/api-client';

interface ReportPackPanelProps {
  caseId: string;
  reports: Report[];
  drafts: FollowUpDraft[];
  onRefresh: () => Promise<void>;
}

export function ReportPackPanel({ caseId, reports, drafts, onRefresh }: ReportPackPanelProps) {
  const [selectedReportId, setSelectedReportId] = useState<string>(reports[0]?.id ?? '');
  const [generating, setGenerating] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeReport =
    reports.find((r) => r.id === selectedReportId) ?? reports[0] ?? null;

  let parsedContent: ReportContent | null = null;
  if (activeReport) {
    try {
      parsedContent = JSON.parse(activeReport.contentJson) as ReportContent;
    } catch {
      parsedContent = null;
    }
  }

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ generated: { reportId: string; snapshotHash: string } }>(
        `/api/v1/cases/${encodeURIComponent(caseId)}/reports`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ includeHtml: true }),
        }
      );
      setSelectedReportId(res.generated.reportId);
      setNotice(
        `Evidence Pack generated via MCP (${res.generated.reportId}, snapshot ${res.generated.snapshotHash.slice(0, 14)}…).`
      );
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateDraft = async () => {
    if (!activeReport) return;
    setCreatingDraft(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/cases/${encodeURIComponent(caseId)}/follow-up-drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: activeReport.id }),
      });
      setNotice('Follow-up draft saved (draft only — never auto-sent).');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save follow-up draft.');
    } finally {
      setCreatingDraft(false);
    }
  };

  return (
    <div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <div className="card">
        <div className="row-between">
          <div>
            <h3>Dispute-Ready Evidence Pack (MCP <code className="mono">generate_evidence_report</code>)</h3>
            <p className="small muted">
              Immutable snapshot grounded strictly in persisted records, SHA-256 document hashes,
              reconciliation findings, gaps, blockers, timeline, and MCP tool-call evidence.
            </p>
          </div>
          <button type="button" className="primary" onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating via MCP...' : 'Generate Evidence Pack'}
          </button>
        </div>

        {reports.length > 0 && (
          <div className="row" style={{ marginTop: '12px' }}>
            <label htmlFor="report-select" className="small muted">Snapshot:</label>
            <select
              id="report-select"
              value={activeReport?.id ?? ''}
              onChange={(e) => setSelectedReportId(e.target.value)}
            >
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.createdAt} — {r.snapshotHash.slice(0, 12)}…
                </option>
              ))}
            </select>
            {activeReport && (
              <>
                <a
                  className="btn"
                  href={`/api/v1/cases/${encodeURIComponent(caseId)}/reports/${encodeURIComponent(activeReport.id)}/download?format=json`}
                >
                  Download JSON
                </a>
                <a
                  className="btn"
                  href={`/api/v1/cases/${encodeURIComponent(caseId)}/reports/${encodeURIComponent(activeReport.id)}/download?format=html`}
                >
                  Download HTML
                </a>
                <button type="button" onClick={handleCreateDraft} disabled={creatingDraft}>
                  {creatingDraft ? 'Saving Draft...' : 'Create Follow-Up Draft'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {!parsedContent ? (
        <div className="card">
          <p className="muted">
            No report snapshot generated yet. Click &ldquo;Generate Evidence Pack&rdquo; above.
          </p>
        </div>
      ) : (
        <div className="card">
          <h3>{parsedContent.title}</h3>
          <p className="small muted">
            Snapshot Hash: <code className="mono">{activeReport?.snapshotHash}</code> | Overall
            Confidence: <strong>{parsedContent.summary.overallConfidence}</strong> | Graph:{' '}
            {parsedContent.evidenceRelationships.nodeCount} nodes /{' '}
            {parsedContent.evidenceRelationships.edgeCount} edges
          </p>

          <div className="alert info">
            <strong>Disclaimer:</strong> {parsedContent.disclaimer}
          </div>

          <h4>1. Source Documents ({parsedContent.documents.length})</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Filename</th>
                  <th>SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {parsedContent.documents.map((d) => (
                  <tr key={d.id}>
                    <td>{d.type}</td>
                    <td>{d.filename}</td>
                    <td className="mono small">{d.sha256}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 style={{ marginTop: '16px' }}>
            2. Extracted vs Verified Values ({parsedContent.extractedVsVerified.length})
          </h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document Type</th>
                  <th>Field</th>
                  <th>Extracted</th>
                  <th>Verified</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {parsedContent.extractedVsVerified.map((ev, idx) => (
                  <tr key={idx}>
                    <td>{ev.documentType}</td>
                    <td className="mono">{ev.fieldName}</td>
                    <td>{ev.extractedValue ?? '—'}</td>
                    <td>{ev.verifiedValue ?? '—'}</td>
                    <td>
                      <span className="badge">{ev.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 style={{ marginTop: '16px' }}>
            3. Reconciliation Discrepancies ({parsedContent.reconciliationResults.discrepancies.length})
          </h4>
          {parsedContent.reconciliationResults.discrepancies.length === 0 ? (
            <p className="small muted">None</p>
          ) : (
            <ul>
              {parsedContent.reconciliationResults.discrepancies.map((d, idx) => (
                <li key={idx} className="small" style={{ marginBottom: '6px' }}>
                  <code className="mono">[{d.ruleId}]</code> <strong>{d.type}</strong> ({d.confidence}):{' '}
                  {d.description}
                  {d.varianceDisplay ? ` — ${d.varianceDisplay}` : ''}
                </li>
              ))}
            </ul>
          )}

          <h4>4. Evidence Gaps ({parsedContent.evidenceGaps.length})</h4>
          {parsedContent.evidenceGaps.length === 0 ? (
            <p className="small muted">None</p>
          ) : (
            <ul>
              {parsedContent.evidenceGaps.map((g, idx) => (
                <li key={idx} className="small" style={{ marginBottom: '4px' }}>
                  <strong>{g.whatIsMissing}:</strong> {g.whyItMatters} (Resolve: {g.whatCouldResolve})
                </li>
              ))}
            </ul>
          )}

          <h4>5. Payment Blockers ({parsedContent.paymentBlockers.length})</h4>
          {parsedContent.paymentBlockers.length === 0 ? (
            <p className="small muted">None</p>
          ) : (
            <ul>
              {parsedContent.paymentBlockers.map((b, idx) => (
                <li key={idx} className="small" style={{ marginBottom: '4px' }}>
                  <code className="mono">[{b.ruleId}]</code> <strong>{b.title}</strong> ({b.status}):{' '}
                  {b.reason}
                </li>
              ))}
            </ul>
          )}

          <h4>6. Recommended Follow-Up Questions</h4>
          <ul>
            {parsedContent.followUpQuestions.map((q, idx) => (
              <li key={idx} className="small">
                {q}
              </li>
            ))}
          </ul>

          <h4>7. Limitations</h4>
          <ul>
            {parsedContent.limitations.map((l, idx) => (
              <li key={idx} className="small muted">
                {l}
              </li>
            ))}
          </ul>

          <h4>8. MCP Evidence Appendix ({parsedContent.mcpEvidence.length} calls)</h4>
          <p className="small muted">
            Verified MCP calls recorded in snapshot:{' '}
            {parsedContent.mcpEvidence
              .map((m) => `${m.toolName} (${m.status}, ${m.durationMs}ms)`)
              .join(' | ') || 'None'}
          </p>
        </div>
      )}

      <div className="card">
        <h3>Follow-Up Drafts ({drafts.length}) — Draft Only, Never Auto-Sent</h3>
        {drafts.length === 0 ? (
          <p className="muted">No follow-up drafts saved yet.</p>
        ) : (
          drafts.map((d) => (
            <div key={d.id} className="stat-box" style={{ marginBottom: '8px' }}>
              <div className="small muted">
                Draft <code className="mono">{d.id}</code> | Created {d.createdAt}
              </div>
              <ul>
                {d.questions.map((q, i) => (
                  <li key={i} className="small">
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
