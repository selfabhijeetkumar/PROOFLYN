'use client';

import { useState } from 'react';
import type {
  BlockerStatus,
  ConfidenceAssessment,
  Discrepancy,
  EvidenceGap,
  PaymentBlocker,
  ReconciliationRun,
  UserRole,
} from '@/core/types';
import { apiFetch, formatMinorMoney } from '@/lib/api-client';
import { AlertIcon, TerminalIcon } from './Icons';

interface ReconciliationPanelProps {
  caseId: string;
  userRole: UserRole;
  latestRun: ReconciliationRun | null;
  discrepancies: Discrepancy[];
  gaps: EvidenceGap[];
  coverage: { verified: number; total: number; ratioLabel: string };
  confidenceAssessments: ConfidenceAssessment[];
  blockers: PaymentBlocker[];
  onRefresh: () => Promise<void>;
}

export function ReconciliationPanel({
  caseId,
  userRole,
  latestRun,
  discrepancies,
  gaps,
  coverage,
  confidenceAssessments,
  blockers,
  onRefresh,
}: ReconciliationPanelProps) {
  const [running, setRunning] = useState(false);
  const [blockerBusyId, setBlockerBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleRunReconcile = async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{
        reconciliation: { runId: string; reusedExistingRun: boolean; discrepancies: Discrepancy[]; warnings: string[] };
        gaps: { gaps: EvidenceGap[] };
        blockers: { blockers: PaymentBlocker[]; summary: string };
      }>(`/api/v1/cases/${encodeURIComponent(caseId)}/reconcile`, {
        method: 'POST',
      });
      setNotice(
        `MCP Reconciliation ${res.reconciliation.reusedExistingRun ? 'reused identical run' : 'completed new run'} (${res.reconciliation.runId}): ` +
          `${res.reconciliation.discrepancies.length} discrepancy(ies), ${res.gaps.gaps.length} gap(s), ${res.blockers.summary}`
      );
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconciliation failed.');
    } finally {
      setRunning(false);
    }
  };

  const handleBlockerStatus = async (blockerId: string, status: BlockerStatus) => {
    setBlockerBusyId(blockerId);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/cases/${encodeURIComponent(caseId)}/blockers/${encodeURIComponent(blockerId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          note: `Updated to ${status} via PROOFLYN review workspace.`,
        }),
      });
      setNotice(`Payment blocker updated to ${status}.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Blocker update failed.');
    } finally {
      setBlockerBusyId(null);
    }
  };

  const confidenceBadge = (level: string) => {
    if (level === 'VERIFIED') return 'ok';
    if (level === 'SUPPORTED_UNVERIFIED') return 'warn';
    if (level === 'CONFLICTED' || level === 'INSUFFICIENT') return 'danger';
    return '';
  };

  const coveragePct =
    coverage.total > 0 ? Math.min(100, Math.round((coverage.verified / coverage.total) * 100)) : 0;

  return (
    <div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert info">{notice}</div>}

      <div className="card">
        <div className="row-between">
          <div>
            <div className="row" style={{ marginBottom: '4px' }}>
              <TerminalIcon size={15} />
              <h3 style={{ margin: 0 }}>Deterministic Reconciliation (MCP-Backed)</h3>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Executes <code className="mono">reconcile_case_records</code>,{' '}
              <code className="mono">detect_evidence_gaps</code>, and{' '}
              <code className="mono">assess_payment_blockers</code> through the stdio MCP server.
            </p>
          </div>
          <button type="button" className="primary" onClick={handleRunReconcile} disabled={running}>
            {running ? 'Running MCP Tools...' : 'Run MCP Reconciliation'}
          </button>
        </div>

        {latestRun ? (
          <div className="row small muted" style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
            <span>
              Run ID: <code className="mono">{latestRun.id}</code>
            </span>
            <span>|</span>
            <span>
              Rules: <code className="mono">{latestRun.rulesVersion}</code>
            </span>
            <span>|</span>
            <span>
              Input Hash: <code className="mono">{latestRun.inputSnapshotHash.slice(0, 16)}…</code>
            </span>
          </div>
        ) : (
          <div className="alert warn" style={{ marginTop: '12px', marginBottom: 0 }}>
            No reconciliation run persisted yet. Click &ldquo;Run MCP Reconciliation&rdquo; to evaluate records.
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="row">
            <AlertIcon size={15} />
            <h3 style={{ margin: 0 }}>Discrepancies ({discrepancies.length})</h3>
          </div>
          {discrepancies.length > 0 && <span className="badge danger">Exceptions Flagged</span>}
        </div>
        {discrepancies.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No discrepancies detected in the latest reconciliation run.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Type</th>
                  <th>Explanation</th>
                  <th>Expected vs Actual</th>
                  <th>Computed Illustration</th>
                  <th>Confidence</th>
                  <th>Sources</th>
                </tr>
              </thead>
              <tbody>
                {discrepancies.map((d) => (
                  <tr key={d.id} className="row-highlight">
                    <td className="mono">
                      <strong>{d.ruleId}</strong>
                    </td>
                    <td>
                      <span className="badge danger">{d.discrepancyType}</span>
                    </td>
                    <td>{d.description}</td>
                    <td className="small num">
                      <div>
                        <span className="muted">Expected:</span> <strong>{d.expectedValue ?? '—'}</strong>
                      </div>
                      <div>
                        <span className="muted">Actual:</span> <strong>{d.actualValue ?? '—'}</strong>
                      </div>
                    </td>
                    <td className="small num">
                      {d.varianceValue !== null ? (
                        <div>
                          <strong>{formatMinorMoney(d.varianceValue, d.varianceCurrency)}</strong>
                          <div className="muted">computed illustration only</div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`badge ${confidenceBadge(d.confidence)}`}>{d.confidence}</span>
                    </td>
                    <td className="mono small">
                      Docs: {d.sourceDocumentIds.length} • Fields: {d.sourceFieldIds.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3 style={{ margin: 0 }}>Evidence Gaps &amp; Coverage</h3>
            <div className="small muted">
              Bounded slot completeness across required case evidence documents &amp; mandatory fields
            </div>
          </div>
          <span className="badge info">
            {coverage.ratioLabel} ({coverage.verified} / {coverage.total} verified)
          </span>
        </div>

        <div className="progress-track" aria-label={`Evidence coverage ${coveragePct}%`}>
          <div className="progress-fill" style={{ width: `${coveragePct}%` }} />
        </div>

        {confidenceAssessments.length > 0 && (
          <div style={{ marginBottom: '12px', display: 'grid', gap: '6px' }}>
            {confidenceAssessments.map((ca) => (
              <div key={ca.id} className="stat-box row-between" style={{ padding: '8px 10px' }}>
                <div className="row small">
                  <span className={`badge ${confidenceBadge(ca.level)}`}>{ca.level}</span>
                  <span>{ca.criteria}</span>
                </div>
                <span className="mono small muted">
                  {ca.inputFieldsVerified}/{ca.inputFieldsTotal} verified inputs
                </span>
              </div>
            ))}
          </div>
        )}

        {gaps.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No open evidence gaps.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rule / Type</th>
                  <th>What Is Missing</th>
                  <th>Why It Matters</th>
                  <th>Affected Conclusions</th>
                  <th>What Could Resolve</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <span className="badge warn">{g.ruleId ?? g.gapType}</span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{g.whatIsMissing}</td>
                    <td className="small">{g.whyItMatters}</td>
                    <td className="small">{g.affectedConclusions}</td>
                    <td className="small">{g.whatCouldResolve}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3 style={{ margin: 0 }}>Advisory Payment Blockers ({blockers.length})</h3>
            <p className="small muted" style={{ margin: '2px 0 0' }}>
              Advisory only — PROOFLYN never auto-executes or rejects payments. Only a REVIEWER may
              acknowledge or resolve blockers.
            </p>
          </div>
          <span className="badge">{userRole}</span>
        </div>

        {blockers.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No payment blockers recorded.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Blocker &amp; Evidence Refs</th>
                  <th>Reason &amp; Impact</th>
                  <th>Resolution Required</th>
                  <th>Status</th>
                  <th>Reviewer Governance</th>
                </tr>
              </thead>
              <tbody>
                {blockers.map((b) => (
                  <tr key={b.id} className={b.status === 'OPEN' ? 'row-highlight' : undefined}>
                    <td className="mono">
                      <strong>{b.ruleId}</strong>
                    </td>
                    <td>
                      <strong>{b.title}</strong>
                      <div className="mono small muted">{b.evidenceReferences.join(', ')}</div>
                    </td>
                    <td className="small">
                      <div>{b.reason}</div>
                      <div className="muted">Impact: {b.impact}</div>
                    </td>
                    <td className="small">{b.resolutionRequired}</td>
                    <td>
                      <span
                        className={`badge ${
                          b.status === 'RESOLVED' ? 'ok' : b.status === 'ACKNOWLEDGED' ? 'info' : 'danger'
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td>
                      {userRole === 'REVIEWER' ? (
                        <div className="row">
                          <button
                            type="button"
                            className="small"
                            disabled={blockerBusyId === b.id || b.status === 'ACKNOWLEDGED'}
                            onClick={() => handleBlockerStatus(b.id, 'ACKNOWLEDGED')}
                          >
                            Acknowledge
                          </button>
                          <button
                            type="button"
                            className="small primary"
                            disabled={blockerBusyId === b.id || b.status === 'RESOLVED'}
                            onClick={() => handleBlockerStatus(b.id, 'RESOLVED')}
                          >
                            Resolve
                          </button>
                        </div>
                      ) : (
                        <span className="small muted">Reviewer role required</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
