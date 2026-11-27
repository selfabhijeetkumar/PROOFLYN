'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  ConfidenceAssessment,
  Discrepancy,
  EvidenceGap,
  EvidenceGraphData,
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
import { apiFetch } from '@/lib/api-client';
import { TopBar, type ClientUser } from './TopBar';
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

  return (
    <>
      <TopBar
        user={user}
        onLogout={handleLogout}
        backHref="/"
        backLabel="All Investigations"
      />
      <main className="container">
        <div className="card">
          <div className="row-between">
            <div>
              <div className="row">
                <h2 style={{ margin: 0 }}>{bundle.caseData.caseNumber}</h2>
                <span className="badge info">{bundle.caseData.status}</span>
                <span className={`badge ${bundle.eventChain.valid ? 'ok' : 'danger'}`}>
                  Audit Chain: {bundle.eventChain.valid ? 'VALID' : 'BROKEN'}
                </span>
              </div>
              <div style={{ fontWeight: 600, marginTop: '4px' }}>{bundle.caseData.title}</div>
              {bundle.caseData.description && (
                <p className="small muted" style={{ marginBottom: 0 }}>
                  {bundle.caseData.description}
                </p>
              )}
            </div>

            <div className="grid-4" style={{ minWidth: '340px' }}>
              <div className="stat-box">
                <div className="stat-label">Documents</div>
                <div className="stat-value">{bundle.context.documents.length}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Evidence Coverage</div>
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

          {bundle.context.parties.length > 0 && (
            <div className="row small muted" style={{ marginTop: '10px' }}>
              {bundle.context.parties.map((p) => (
                <span key={p.id}>
                  <strong>{p.role}:</strong> {p.name}
                </span>
              ))}
            </div>
          )}
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
    </>
  );
}
