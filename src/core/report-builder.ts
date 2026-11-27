/**
 * PROOFLYN — Report Builder
 * Generates reproducible Dispute-Ready Evidence Packs (JSON + escaped HTML).
 * Pure business logic — no I/O.
 */

import {
  type InvestigationCase,
  type Party,
  type SourceDocument,
  type ExtractedField,
  type VerificationRecord,
  type Discrepancy,
  type EvidenceGap,
  type PaymentBlocker,
  type ConfidenceAssessment,
  type EvidenceGraphData,
  type InvestigationEvent,
  type McpToolCall,
  type Report,
} from './types';
import { generateId, hashObject } from './crypto';

export interface ReportInput {
  caseData: InvestigationCase;
  parties?: Party[];
  documents: SourceDocument[];
  fields: ExtractedField[];
  verificationRecords?: VerificationRecord[];
  discrepancies: Discrepancy[];
  gaps: EvidenceGap[];
  blockers: PaymentBlocker[];
  confidenceAssessments: ConfidenceAssessment[];
  graph: EvidenceGraphData;
  events: InvestigationEvent[];
  mcpToolCalls?: McpToolCall[];
  reconciliationRunId: string;
  generatedBy: string;
  generatedAt?: string;
}

export interface ReportContent {
  title: string;
  caseNumber: string;
  generatedAt: string;
  summary: {
    caseTitle: string;
    status: string;
    documentCount: number;
    discrepancyCount: number;
    gapCount: number;
    blockerCount: number;
    overallConfidence: string;
  };
  parties: Array<{ name: string; role: string; identifier?: string }>;
  documents: Array<{
    id: string;
    type: string;
    filename: string;
    sha256: string;
    uploadedAt: string;
  }>;
  extractedVsVerified: Array<{
    fieldName: string;
    documentType: string;
    extractedValue: string | null;
    verifiedValue: string | null;
    status: string;
  }>;
  reconciliationResults: {
    discrepancies: Array<{
      ruleId: string;
      type: string;
      description: string;
      expectedValue: string | null;
      actualValue: string | null;
      varianceDisplay: string | null;
      confidence: string;
      sourceDocuments: string[];
    }>;
  };
  evidenceGaps: Array<{
    type: string;
    ruleId: string | null;
    description: string;
    whatIsMissing: string;
    whyItMatters: string;
    whatCouldResolve: string;
  }>;
  paymentBlockers: Array<{
    ruleId: string;
    title: string;
    reason: string;
    impact: string;
    resolutionRequired: string;
    status: string;
  }>;
  evidenceRelationships: {
    nodeCount: number;
    edgeCount: number;
  };
  timeline: Array<{
    timestamp: string;
    eventType: string;
    description: string;
  }>;
  mcpEvidence: Array<{
    toolName: string;
    status: string;
    durationMs: number;
    inputHash: string;
    outputHash: string | null;
    createdAt: string;
  }>;
  followUpQuestions: string[];
  limitations: string[];
  disclaimer: string;
}

export function buildReport(input: ReportInput): { report: Report; content: ReportContent } {
  const now = input.generatedAt || input.caseData.updatedAt || new Date().toISOString();
  const verRecords = input.verificationRecords || [];

  const overallConfidence =
    input.confidenceAssessments.find((ca) => ca.findingId === null)?.level || 'INSUFFICIENT';

  const content: ReportContent = {
    title: `Dispute-Ready Evidence Pack — ${input.caseData.caseNumber}`,
    caseNumber: input.caseData.caseNumber,
    generatedAt: now,
    summary: {
      caseTitle: input.caseData.title,
      status: input.caseData.status,
      documentCount: input.documents.length,
      discrepancyCount: input.discrepancies.length,
      gapCount: input.gaps.length,
      blockerCount: input.blockers.filter((b) => b.status === 'OPEN').length,
      overallConfidence,
    },
    parties: (input.parties || []).map((p) => ({
      name: p.name,
      role: p.role,
      identifier: p.identifier,
    })),
    documents: input.documents.map((d) => ({
      id: d.id,
      type: d.documentType,
      filename: d.originalFilename,
      sha256: d.sha256,
      uploadedAt: d.uploadedAt,
    })),
    extractedVsVerified: input.fields
      .filter((f) => f.presence === 'PRESENT')
      .map((f) => {
        const doc = input.documents.find((d) => d.id === f.documentId);
        const firstCorrection = verRecords
          .filter((v) => v.extractedFieldId === f.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        const originalExtracted = firstCorrection?.previousValue ?? f.rawText ?? f.extractedValue;
        const verifiedVal =
          f.status === 'VERIFIED' || f.status === 'CORRECTED' ? f.extractedValue : null;
        return {
          fieldName: f.fieldName,
          documentType: doc?.documentType || 'UNKNOWN',
          extractedValue: originalExtracted,
          verifiedValue: verifiedVal,
          status: f.status,
        };
      }),
    reconciliationResults: {
      discrepancies: input.discrepancies.map((d) => ({
        ruleId: d.ruleId,
        type: d.discrepancyType,
        description: d.description,
        expectedValue: d.expectedValue,
        actualValue: d.actualValue,
        varianceDisplay:
          d.varianceValue !== null && d.varianceCurrency
            ? `${d.varianceCurrency} ${(d.varianceValue / 100).toFixed(2)}`
            : null,
        confidence: d.confidence,
        sourceDocuments: d.sourceDocumentIds,
      })),
    },
    evidenceGaps: input.gaps.map((g) => ({
      type: g.gapType,
      ruleId: g.ruleId,
      description: g.description,
      whatIsMissing: g.whatIsMissing,
      whyItMatters: g.whyItMatters,
      whatCouldResolve: g.whatCouldResolve,
    })),
    paymentBlockers: input.blockers.map((b) => ({
      ruleId: b.ruleId,
      title: b.title,
      reason: b.reason,
      impact: b.impact,
      resolutionRequired: b.resolutionRequired,
      status: b.status,
    })),
    evidenceRelationships: {
      nodeCount: input.graph.nodes.length,
      edgeCount: input.graph.edges.length,
    },
    timeline: input.events.map((e) => ({
      timestamp: e.createdAt,
      eventType: e.eventType,
      description: e.description,
    })),
    mcpEvidence: (input.mcpToolCalls || []).map((c) => ({
      toolName: c.toolName,
      status: c.status,
      durationMs: c.durationMs,
      inputHash: c.inputHash,
      outputHash: c.outputHash,
      createdAt: c.createdAt,
    })),
    followUpQuestions: generateFollowUpQuestions(input),
    limitations: [
      'This report presents factual findings from document analysis. It does not make legal determinations.',
      'Missing evidence does not prove a claim is false.',
      'Extracted values that have not been human-verified are marked as SUPPORTED_UNVERIFIED.',
      'Variance values are computed illustrations, not recovery claims.',
      'AI-generated explanations are not verified conclusions.',
    ],
    disclaimer:
      'PROOFLYN provides evidence-based investigation support. All findings should be reviewed by qualified personnel before making payment or dispute decisions. This system does not approve, reject, or execute payments.',
  };

  // Canonical snapshot hash excludes volatile generatedAt so identical evidence snapshots yield identical hashes
  const { generatedAt: _ignoredGeneratedAt, ...snapshotContent } = content;
  void _ignoredGeneratedAt;
  const contentJson = JSON.stringify(content);
  const snapshotHash = hashObject(snapshotContent);

  const report: Report = {
    id: generateId(),
    caseId: input.caseData.id,
    reconciliationRunId: input.reconciliationRunId,
    snapshotHash,
    contentJson,
    contentHtml: null,
    generatedBy: input.generatedBy,
    createdAt: now,
  };

  return { report, content };
}

function generateFollowUpQuestions(input: ReportInput): string[] {
  const questions: string[] = [];

  for (const disc of input.discrepancies) {
    if (disc.ruleId === 'R-QTY-01') {
      const diff =
        disc.actualValue && disc.expectedValue
          ? parseInt(disc.actualValue, 10) - parseInt(disc.expectedValue, 10)
          : null;
      questions.push(
        `What is the status of the ${diff !== null && !Number.isNaN(diff) ? diff : 'outstanding'} undelivered units? Were they backordered, cancelled, or delivered separately?`
      );
    }
    if (disc.ruleId === 'R-QTY-02') {
      questions.push(
        'Was a purchase order quantity amendment approved for the difference between PO and invoice quantities?'
      );
    }
    if (disc.ruleId === 'R-DUP-01') {
      questions.push(
        'Is the duplicate invoice a re-submission or a separate transaction? Can the supplier confirm?'
      );
    }
    if (disc.ruleId === 'R-PRC-01') {
      questions.push(
        'Was there an agreed price amendment after the original PO? Can the supplier provide documentation?'
      );
    }
  }

  for (const gap of input.gaps) {
    if (gap.ruleId === 'R-DLV-01') {
      questions.push(
        'Can the warehouse or receiving department provide delivery confirmation or a goods received note?'
      );
    }
  }

  if (questions.length === 0) {
    questions.push('No specific follow-up questions identified based on current findings.');
  }

  return [...new Set(questions)];
}

export function generateReportHtml(content: ReportContent): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(content.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
    h2 { color: #333; margin-top: 2rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; font-size: 0.92rem; }
    th { background: #f5f5f5; }
    .badge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.85rem; font-weight: 600; }
    .badge-open { background: #fee; color: #c33; }
    .badge-verified { background: #efe; color: #363; }
    .badge-unverified { background: #ffe; color: #663; }
    .disclaimer { background: #f8f8f8; border-left: 4px solid #999; padding: 1rem; margin-top: 2rem; font-size: 0.9rem; }
    .gap { background: #fff8e1; border-left: 3px solid #f9a825; padding: 0.75rem; margin: 0.5rem 0; }
    .blocker { background: #fce4ec; border-left: 3px solid #c62828; padding: 0.75rem; margin: 0.5rem 0; }
    .synthetic { background: #e3f2fd; border: 1px dashed #1565c0; padding: 0.5rem; text-align: center; font-size: 0.85rem; color: #1565c0; }
  </style>
</head>
<body>
  <div class="synthetic">PROOFLYN — DISPUTE-READY EVIDENCE PACK</div>
  <h1>${escapeHtml(content.title)}</h1>
  <p>Generated: ${escapeHtml(content.generatedAt)}</p>

  <h2>Summary</h2>
  <table>
    <tr><th>Case</th><td>${escapeHtml(content.summary.caseTitle)}</td></tr>
    <tr><th>Status</th><td>${escapeHtml(content.summary.status)}</td></tr>
    <tr><th>Documents</th><td>${content.summary.documentCount}</td></tr>
    <tr><th>Discrepancies</th><td>${content.summary.discrepancyCount}</td></tr>
    <tr><th>Evidence Gaps</th><td>${content.summary.gapCount}</td></tr>
    <tr><th>Open Blockers</th><td>${content.summary.blockerCount}</td></tr>
    <tr><th>Overall Confidence</th><td><span class="badge ${content.summary.overallConfidence === 'VERIFIED' ? 'badge-verified' : 'badge-unverified'}">${escapeHtml(content.summary.overallConfidence)}</span></td></tr>
  </table>

  <h2>Parties</h2>
  ${content.parties.length === 0 ? '<p>No parties recorded.</p>' : `<table>
    <tr><th>Role</th><th>Name</th><th>Identifier</th></tr>
    ${content.parties.map((p) => `<tr><td>${escapeHtml(p.role)}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.identifier || '—')}</td></tr>`).join('\n    ')}
  </table>`}

  <h2>Source Documents</h2>
  <table>
    <tr><th>Type</th><th>Filename</th><th>SHA-256</th><th>Uploaded</th></tr>
    ${content.documents.map((d) => `<tr><td>${escapeHtml(d.type)}</td><td>${escapeHtml(d.filename)}</td><td><code>${escapeHtml(d.sha256.slice(0, 16))}…</code></td><td>${escapeHtml(d.uploadedAt)}</td></tr>`).join('\n    ')}
  </table>

  <h2>Extracted vs Verified Values</h2>
  <table>
    <tr><th>Field</th><th>Document Type</th><th>Extracted</th><th>Verified</th><th>Status</th></tr>
    ${content.extractedVsVerified.map((f) => `<tr><td>${escapeHtml(f.fieldName)}</td><td>${escapeHtml(f.documentType)}</td><td>${escapeHtml(f.extractedValue || '—')}</td><td>${escapeHtml(f.verifiedValue || '—')}</td><td><span class="badge ${f.status === 'VERIFIED' || f.status === 'CORRECTED' ? 'badge-verified' : 'badge-unverified'}">${escapeHtml(f.status)}</span></td></tr>`).join('\n    ')}
  </table>

  <h2>Discrepancies</h2>
  ${content.reconciliationResults.discrepancies.length === 0 ? '<p>No discrepancies found.</p>' : content.reconciliationResults.discrepancies.map((d) => `
  <div style="border: 1px solid #ddd; padding: 1rem; margin: 0.5rem 0; border-radius: 4px;">
    <strong>${escapeHtml(d.ruleId)}: ${escapeHtml(d.type)}</strong>
    <p>${escapeHtml(d.description)}</p>
    ${d.varianceDisplay ? `<p><strong>Variance (computed illustration):</strong> ${escapeHtml(d.varianceDisplay)}</p>` : ''}
    <p><span class="badge ${d.confidence === 'VERIFIED' ? 'badge-verified' : 'badge-unverified'}">${escapeHtml(d.confidence)}</span></p>
  </div>`).join('\n')}

  <h2>Evidence Gaps</h2>
  ${content.evidenceGaps.length === 0 ? '<p>No evidence gaps identified.</p>' : content.evidenceGaps.map((g) => `
  <div class="gap">
    <strong>${escapeHtml(g.type)}</strong>${g.ruleId ? ` (${escapeHtml(g.ruleId)})` : ''}: ${escapeHtml(g.description)}
    <br><em>Missing:</em> ${escapeHtml(g.whatIsMissing)}
    <br><em>Impact:</em> ${escapeHtml(g.whyItMatters)}
    <br><em>Resolution:</em> ${escapeHtml(g.whatCouldResolve)}
  </div>`).join('\n')}

  <h2>Payment Blockers</h2>
  ${content.paymentBlockers.length === 0 ? '<p>No payment blockers identified.</p>' : content.paymentBlockers.map((b) => `
  <div class="blocker">
    <strong>[${escapeHtml(b.ruleId)}] ${escapeHtml(b.title)}</strong> <span class="badge badge-open">${escapeHtml(b.status)}</span>
    <br><em>Reason:</em> ${escapeHtml(b.reason)}
    <br><em>Impact:</em> ${escapeHtml(b.impact)}
    <br><em>Resolution Required:</em> ${escapeHtml(b.resolutionRequired)}
  </div>`).join('\n')}

  <h2>Evidence Relationships</h2>
  <p>${content.evidenceRelationships.nodeCount} evidence nodes, ${content.evidenceRelationships.edgeCount} relationships mapped.</p>

  <h2>Timeline</h2>
  <table>
    <tr><th>Timestamp</th><th>Event</th><th>Description</th></tr>
    ${content.timeline.map((t) => `<tr><td>${escapeHtml(t.timestamp)}</td><td>${escapeHtml(t.eventType)}</td><td>${escapeHtml(t.description)}</td></tr>`).join('\n    ')}
  </table>

  <h2>MCP Tool-Call Evidence Appendix</h2>
  ${content.mcpEvidence.length === 0 ? '<p>No MCP tool calls recorded yet.</p>' : `<table>
    <tr><th>Tool</th><th>Status</th><th>Duration (ms)</th><th>Input Hash</th><th>Output Hash</th><th>Timestamp</th></tr>
    ${content.mcpEvidence.map((c) => `<tr><td><code>${escapeHtml(c.toolName)}</code></td><td>${escapeHtml(c.status)}</td><td>${c.durationMs}</td><td><code>${escapeHtml(c.inputHash.slice(0, 12))}…</code></td><td><code>${escapeHtml(c.outputHash ? c.outputHash.slice(0, 12) + '…' : '—')}</code></td><td>${escapeHtml(c.createdAt)}</td></tr>`).join('\n    ')}
  </table>`}

  <h2>Recommended Follow-Up Questions</h2>
  <ol>
    ${content.followUpQuestions.map((q) => `<li>${escapeHtml(q)}</li>`).join('\n    ')}
  </ol>

  <h2>Limitations</h2>
  <ul>
    ${content.limitations.map((l) => `<li>${escapeHtml(l)}</li>`).join('\n    ')}
  </ul>

  <div class="disclaimer">${escapeHtml(content.disclaimer)}</div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
