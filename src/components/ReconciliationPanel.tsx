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

  return (
    <div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert info">{notice}</div>}

      <div className="card">
        <div className="row-between">
          <div>
            <h3>Deterministic Reconciliation (MCP-Backed)</h3>
            <p className="small muted">
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
          <div className="small muted" style={{ marginTop: '8px' }}>
            Latest Run: <code className="mono">{latestRun.id}</code> | Rules:{' '}
            <code className="mono">{latestRun.rulesVersion}</code> | Input Snapshot Hash:{' '}
            <code className="mono">{latestRun.inputSnapshotHash.slice(0, 16)}…</code>
          </div>
        ) : (
          <div className="alert warn" style={{ marginTop: '12px' }}>
            No reconciliation run persisted yet. Click &ldquo;Run MCP Reconciliation&rdquo; to evaluate records.
          </div>
        )}
      </div>

      <div className="card">
        <h3>Discrepancies ({discrepancies.length})</h3>
        {discrepancies.length === 0 ? (
          <p className="muted">No discrepancies detected in the latest reconciliation run.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Expected vs Actual</th>
                  <th>Computed Variance Illustration</th>
                  <th>Confidence</th>
                  <th>Sources</th>
                </tr>
              </thead>
              <tbody>
                {discrepancies.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.ruleId}</td>
                    <td>
                      <span className="badge danger">{d.discrepancyType}</span>
                    </td>
                    <td>{d.description}</td>
                    <td className="small">
                      Expected: <strong>{d.expectedValue ?? '—'}</strong>
                      <br />
                      Actual: <strong>{d.actualValue ?? '—'}</strong>
                    </td>
                    <td className="small">
                      {d.varianceValue !== null
                        ? `${formatMinorMoney(d.varianceValue, d.varianceCurrency)} (computed illustration only)`
                        : '—'}
                    </td>
                    <td>
                      <span className={`badge ${confidenceBadge(d.confidence)}`}>{d.confidence}</span>
                    </td>
                    <td className="mono small">
                      Docs: {d.sourceDocumentIds.length}, Fields: {d.sourceFieldIds.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="row-between">
          <h3>Evidence Gaps &amp; Coverage ({coverage.ratioLabel})</h3>
          <span className="badge info">
            Verified Slots: {coverage.verified} / {coverage.total}
          </span>
        </div>

        {confidenceAssessments.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            {confidenceAssessments.map((ca) => (
              <div key={ca.id} className="small" style={{ marginBottom: '4px' }}>
                <span className={`badge ${confidenceBadge(ca.level)}`}>{ca.level}</span>{' '}
                {ca.criteria} ({ca.inputFieldsVerified}/{ca.inputFieldsTotal} verified inputs)
              </div>
            ))}
          </div>
        )}

        {gaps.length === 0 ? (
          <p className="muted">No open evidence gaps.</p>
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
                    <td>{g.whatIsMissing}</td>
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
        <h3>Advisory Payment Blockers ({blockers.length})</h3>
        <p className="small muted">
          Advisory only — PROOFLYN never auto-executes or rejects payments. Only a REVIEWER may
          acknowledge or resolve blockers.
        </p>
        {blockers.length === 0 ? (
          <p className="muted">No payment blockers recorded.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Blocker</th>
                  <th>Reason &amp; Impact</th>
                  <th>Resolution Required</th>
                  <th>Status</th>
                  <th>Reviewer Governance</th>
                </tr>
              </thead>
              <tbody>
                {blockers.map((b) => (
                  <tr key={b.id}>
                    <td className="mono">{b.ruleId}</td>
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
                            disabled={blockerBusyId === b.id || b.status === 'ACKNOWLEDGED'}
                            onClick={() => handleBlockerStatus(b.id, 'ACKNOWLEDGED')}
                          >
                            Acknowledge
                          </button>
                          <button
                            type="button"
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
