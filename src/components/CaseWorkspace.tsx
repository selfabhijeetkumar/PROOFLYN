'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  ConfidenceAssessment,
  Discrepancy,
  DocumentType,
  EvidenceGap,
  EvidenceGraphData,
  ExtractedField,
  FollowUpDraft,
  InvestigationCase,
  InvestigationEvent,
  McpCaseContext,
  McpToolCall,
  PaymentBlocker,
  ReconciliationRun,
  Report,
  VerificationRecord,
} from '@/core/types';
import { apiFetch, formatMinorMoney } from '@/lib/api-client';
import { AppShell, TopBar, type ClientUser } from './TopBar';
import { DocumentsPanel } from './DocumentsPanel';
import { FieldsVerificationPanel } from './FieldsVerificationPanel';
import { ReconciliationPanel } from './ReconciliationPanel';
import { EvidenceGraphPanel } from './EvidenceGraphPanel';
import { McpEvidencePanel, TimelinePanel } from './TimelineAndMcpPanel';
import { ReportPackPanel } from './ReportPackPanel';

type CaseTab =
  | 'documents'
  | 'verification'
  | 'reconciliation'
  | 'graph'
  | 'timeline'
  | 'mcp'
  | 'report';

interface CaseBundle {
  caseData: InvestigationCase;
  context: McpCaseContext;
  latestRun: ReconciliationRun | null;
  coverage: { verified: number; total: number; ratioLabel: string };
  confidenceAssessments: ConfidenceAssessment[];
  eventChain: { valid: boolean; brokenAt?: number; reason?: string };
  verifications: VerificationRecord[];
  events: InvestigationEvent[];
  mcpCalls: McpToolCall[];
  reports: Report[];
  drafts: FollowUpDraft[];
  gaps: EvidenceGap[];
  discrepancies: Discrepancy[];
  blockers: PaymentBlocker[];
  graph: EvidenceGraphData | null;
}

function summarizeDocSide(
  docType: DocumentType,
  docs: McpCaseContext['documents'],
  fields: ExtractedField[]
) {
  const matchingDocs = docs.filter((d) => d.documentType === docType);
  if (matchingDocs.length === 0) {
    return { present: false, qtyText: 'MISSING RECORD', priceText: '—', badge: 'danger', statusLabel: 'MISSING' };
  }
  const docIds = new Set(matchingDocs.map((d) => d.id));
  const docFields = fields.filter((f) => docIds.has(f.documentId) && f.status !== 'REJECTED');
  const qtyFields = docFields.filter((f) => f.fieldName === 'quantity' && f.presence === 'PRESENT');
  const priceField = docFields.find((f) => f.fieldName === 'unit_price' && f.presence === 'PRESENT');

  const qtySum = qtyFields.reduce((acc, f) => acc + (f.numericValue ?? 0), 0);
  const unit = qtyFields[0]?.unit || 'UNITS';
  const allVerified =
    qtyFields.length > 0 && qtyFields.every((f) => f.status === 'VERIFIED' || f.status === 'CORRECTED');

  return {
    present: true,
    qtyText: qtyFields.length > 0 ? `${qtySum} ${unit}` : 'QTY MISSING',
    qtyNumeric: qtyFields.length > 0 ? qtySum : null,
    priceText:
      priceField && priceField.numericValue !== null
        ? `@ ${formatMinorMoney(priceField.numericValue, priceField.currency)} / unit`
        : `${matchingDocs.length} document(s)`,
    badge: qtyFields.length === 0 ? 'warn' : allVerified ? 'ok' : 'info',
    statusLabel: qtyFields.length === 0 ? 'INCOMPLETE' : allVerified ? 'VERIFIED' : 'EXTRACTED',
  };
}

export function CaseWorkspace({ caseId }: { caseId: string }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [tab, setTab] = useState<CaseTab>('documents');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const me = await apiFetch<{ user: ClientUser }>('/api/v1/auth/me');
      setUser(me.user);

      const encId = encodeURIComponent(caseId);
      const [detail, fieldsRes, discRes, gapsRes, blockersRes, timelineRes, mcpRes, reportsRes, draftsRes] =
        await Promise.all([
          apiFetch<{
            case: InvestigationCase;
            context: McpCaseContext;
            latestRun: ReconciliationRun | null;
            coverage: { verified: number; total: number; ratioLabel: string };
            confidenceAssessments: ConfidenceAssessment[];
            eventChain: { valid: boolean; brokenAt?: number; reason?: string };
          }>(`/api/v1/cases/${encId}`),
          apiFetch<{ fields: McpCaseContext['verifiedRecords']; verifications: VerificationRecord[] }>(
            `/api/v1/cases/${encId}/fields`
          ),
          apiFetch<{ discrepancies: Discrepancy[] }>(`/api/v1/cases/${encId}/discrepancies`),
          apiFetch<{ gaps: EvidenceGap[]; coverage: { verified: number; total: number; ratioLabel: string }; confidenceLadder: ConfidenceAssessment[] }>(
            `/api/v1/cases/${encId}/gaps`
          ),
          apiFetch<{ blockers: PaymentBlocker[] }>(`/api/v1/cases/${encId}/blockers`),
          apiFetch<{ events: InvestigationEvent[]; chainVerification: { valid: boolean; brokenAt?: number; reason?: string } }>(
            `/api/v1/cases/${encId}/timeline`
          ),
          apiFetch<{ calls: McpToolCall[] }>(`/api/v1/cases/${encId}/mcp-calls`),
          apiFetch<{ reports: Report[] }>(`/api/v1/cases/${encId}/reports`),
          apiFetch<{ drafts: FollowUpDraft[] }>(`/api/v1/cases/${encId}/follow-up-drafts`),
        ]);

      setBundle({
        caseData: detail.case,
        context: {
          ...detail.context,
          verifiedRecords: fieldsRes.fields.filter(
            (f) => f.status === 'VERIFIED' || f.status === 'CORRECTED'
          ),
          unverifiedRecords: fieldsRes.fields.filter(
            (f) => f.status !== 'VERIFIED' && f.status !== 'CORRECTED' && f.status !== 'REJECTED'
          ),
        },
        latestRun: detail.latestRun,
        coverage: gapsRes.coverage,
        confidenceAssessments: gapsRes.confidenceLadder,
        eventChain: timelineRes.chainVerification,
        verifications: fieldsRes.verifications,
        events: timelineRes.events,
        mcpCalls: mcpRes.calls,
        reports: reportsRes.reports,
        drafts: draftsRes.drafts,
        gaps: gapsRes.gaps,
        discrepancies: discRes.discrepancies,
        blockers: blockersRes.blockers,
        graph: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load investigation case.');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleLogout = async () => {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    window.location.href = '/';
  };

  if (loading) {
    return (
      <>
        <TopBar user={user} backHref="/" backLabel="All Investigations" />
        <main className="container">
          <div className="card">Loading investigation workspace...</div>
        </main>
      </>
    );
  }

  if (error || !bundle || !user) {
    return (
      <>
        <TopBar user={user} backHref="/" backLabel="Back to Dashboard" />
        <main className="container">
          <div className="alert error">{error || 'Authentication or case access required.'}</div>
        </main>
      </>
    );
  }

  const allFields = [...bundle.context.verifiedRecords, ...bundle.context.unverifiedRecords];
  const poSummary = summarizeDocSide('PURCHASE_ORDER', bundle.context.documents, allFields);
  const invSummary = summarizeDocSide('INVOICE', bundle.context.documents, allFields);
  const grnSummary = summarizeDocSide('DELIVERY_RECORD', bundle.context.documents, allFields);

  const qtyDiscrepancy = bundle.discrepancies.find((d) => d.ruleId === 'R-QTY-01');
  const liveQtyDelta =
    invSummary.qtyNumeric !== null &&
    invSummary.qtyNumeric !== undefined &&
    grnSummary.qtyNumeric !== null &&
    grnSummary.qtyNumeric !== undefined
      ? invSummary.qtyNumeric - grnSummary.qtyNumeric
      : null;

  return (
    <AppShell
      user={user}
      onLogout={handleLogout}
      activeCaseId={bundle.caseData.id}
      breadcrumbCurrent={bundle.caseData.caseNumber}
    >
      <main className="container">
        <div className="card">
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: '300px' }}>
              <div className="row" style={{ marginBottom: '6px' }}>
                <h1 className="page-title mono" style={{ margin: 0 }}>
                  {bundle.caseData.caseNumber}
                </h1>
                <span className="badge info">{bundle.caseData.status}</span>
                <span className={`badge ${bundle.eventChain.valid ? 'ok' : 'danger'}`}>
                  Audit Chain: {bundle.eventChain.valid ? 'VALID' : 'BROKEN'}
                </span>
              </div>
              <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text)' }}>
                {bundle.caseData.title}
              </div>
              {bundle.caseData.description && (
                <p className="small muted" style={{ margin: '4px 0 0' }}>
                  {bundle.caseData.description}
                </p>
              )}

              {bundle.context.parties.length > 0 && (
                <div className="row" style={{ marginTop: '10px', gap: '8px' }}>
                  {bundle.context.parties.map((p) => (
                    <span key={p.id} className="badge">
                      {p.role}: {p.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid-4" style={{ minWidth: '380px', flex: '0 1 480px' }}>
              <div className="stat-box">
                <div className="stat-label">Documents</div>
                <div className="stat-value">{bundle.context.documents.length}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Evidence Slots</div>
                <div className="stat-value">{bundle.coverage.ratioLabel}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Discrepancies</div>
                <div className="stat-value">{bundle.discrepancies.length}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">MCP Calls</div>
                <div className="stat-value">{bundle.mcpCalls.length}</div>
              </div>
            </div>
          </div>

          {/* 3-Way Match Snapshot built strictly from persisted case records */}
          <div className="match-matrix" aria-label="3-Way Match Matrix">
            <div className="match-cell">
              <div className="match-cell-title">
                <span>1. Purchase Order</span>
                <span className={`badge ${poSummary.badge}`}>{poSummary.statusLabel}</span>
              </div>
              <div className="match-cell-primary">{poSummary.qtyText}</div>
              <div className="match-cell-meta">{poSummary.priceText}</div>
            </div>

            <div className="match-cell">
              <div className="match-cell-title">
                <span>2. Vendor Invoice</span>
                <span className={`badge ${invSummary.badge}`}>{invSummary.statusLabel}</span>
              </div>
              <div className="match-cell-primary">{invSummary.qtyText}</div>
              <div className="match-cell-meta">{invSummary.priceText}</div>
            </div>

            <div className="match-cell">
              <div className="match-cell-title">
                <span>3. Delivery (GRN)</span>
                <span className={`badge ${grnSummary.badge}`}>{grnSummary.statusLabel}</span>
              </div>
              <div className="match-cell-primary">{grnSummary.qtyText}</div>
              <div className="match-cell-meta">{grnSummary.priceText}</div>
            </div>

            <div
              className={`match-cell ${
                qtyDiscrepancy || (liveQtyDelta !== null && liveQtyDelta !== 0)
                  ? 'variance-alert'
                  : bundle.latestRun
                    ? 'variance-ok'
                    : ''
              }`}
            >
              <div className="match-cell-title">
                <span>4. Quantity Variance</span>
                {qtyDiscrepancy ? (
                  <span className="badge danger">{qtyDiscrepancy.ruleId}</span>
                ) : liveQtyDelta !== null && liveQtyDelta !== 0 ? (
                  <span className="badge warn">DELTA DETECTED</span>
                ) : (
                  <span className="badge">{bundle.latestRun ? 'MATCHED' : 'UNRECONCILED'}</span>
                )}
              </div>
              <div className="match-cell-primary">
                {qtyDiscrepancy
                  ? `${qtyDiscrepancy.actualValue} vs ${qtyDiscrepancy.expectedValue}`
                  : liveQtyDelta !== null
                    ? liveQtyDelta === 0
                      ? '0 UNITS'
                      : `${liveQtyDelta > 0 ? `+${liveQtyDelta}` : liveQtyDelta} UNITS`
                    : 'Not comparable'}
              </div>
              <div className="match-cell-meta">
                {qtyDiscrepancy && qtyDiscrepancy.varianceValue !== null
                  ? `Computed illustration: ${formatMinorMoney(qtyDiscrepancy.varianceValue, qtyDiscrepancy.varianceCurrency)}`
                  : liveQtyDelta !== null && liveQtyDelta !== 0 && !bundle.latestRun
                    ? 'Open tab 3 to persist MCP reconciliation'
                    : grnSummary.present
                      ? 'Persisted deterministic evaluation'
                      : 'Delivery record missing (R-DLV-01)'}
              </div>
            </div>
          </div>
        </div>

        <nav className="tabs" aria-label="Investigation Views">
          <button
            type="button"
            className={`tab-btn ${tab === 'documents' ? 'active' : ''}`}
            onClick={() => setTab('documents')}
          >
            1. Documents ({bundle.context.documents.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'verification' ? 'active' : ''}`}
            onClick={() => setTab('verification')}
          >
            2. Extraction &amp; Verification ({allFields.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'reconciliation' ? 'active' : ''}`}
            onClick={() => setTab('reconciliation')}
          >
            3. Reconcile, Gaps &amp; Blockers ({bundle.discrepancies.length}/{bundle.blockers.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'graph' ? 'active' : ''}`}
            onClick={() => setTab('graph')}
          >
            4. Evidence Graph
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'timeline' ? 'active' : ''}`}
            onClick={() => setTab('timeline')}
          >
            5. Timeline ({bundle.events.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'mcp' ? 'active' : ''}`}
            onClick={() => setTab('mcp')}
          >
            6. MCP Evidence ({bundle.mcpCalls.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'report' ? 'active' : ''}`}
            onClick={() => setTab('report')}
          >
            7. Evidence Pack ({bundle.reports.length})
          </button>
        </nav>

        {tab === 'documents' && (
          <DocumentsPanel
            caseId={bundle.caseData.id}
            documents={bundle.context.documents}
            onRefresh={loadAll}
          />
        )}

        {tab === 'verification' && (
          <FieldsVerificationPanel
            caseId={bundle.caseData.id}
            documents={bundle.context.documents}
            fields={allFields}
            verifications={bundle.verifications}
            onRefresh={loadAll}
          />
        )}

        {tab === 'reconciliation' && (
          <ReconciliationPanel
            caseId={bundle.caseData.id}
            userRole={user.role}
            latestRun={bundle.latestRun}
            discrepancies={bundle.discrepancies}
            gaps={bundle.gaps}
            coverage={bundle.coverage}
            confidenceAssessments={bundle.confidenceAssessments}
            blockers={bundle.blockers}
            onRefresh={loadAll}
          />
        )}

        {tab === 'graph' && (
          <EvidenceGraphPanel
            caseId={bundle.caseData.id}
            initialGraph={bundle.graph}
            onRefresh={loadAll}
          />
        )}

        {tab === 'timeline' && (
          <TimelinePanel events={bundle.events} chainVerification={bundle.eventChain} />
        )}

        {tab === 'mcp' && <McpEvidencePanel mcpCalls={bundle.mcpCalls} />}

        {tab === 'report' && (
          <ReportPackPanel
            caseId={bundle.caseData.id}
            reports={bundle.reports}
            drafts={bundle.drafts}
            onRefresh={loadAll}
          />
        )}
      </main>
    </AppShell>
  );
}
