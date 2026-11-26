/**
 * PROOFLYN — Investigation Service
 * Orchestrates core/ rules with InvestigationRepository, authorization, and audit events.
 * Shared by BOTH MCP tool handlers and REST API handlers.
 */

import {
  reconcile,
  detectGaps,
  assessBlockers,
  buildEvidenceGraph,
  buildReport,
  generateReportHtml,
  generateId,
  type User,
  type InvestigationCase,
  type SourceDocument,
  type DocumentType,
  type ExtractionMethod,
  type McpCaseContext,
  type McpReconcileResult,
  type McpGapResult,
  type McpBlockerResult,
  type McpGraphResult,
  type McpReportResult,
  type BlockerStatus,
  type ExtractionStatus,
  type FieldPresence,
  type Currency,
  type QuantityUnit,
  type ExtractedField,
  type Report,
  type FollowUpDraft,
} from '@/core';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';

export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class InvestigationService {
  constructor(private readonly repo: InvestigationRepository = new InvestigationRepository()) {}

  authorizeCaseAccess(caseId: string, actorId: string): { actor: User; caseData: InvestigationCase } {
    const actor = this.repo.getUserById(actorId);
    if (!actor) {
      throw new ServiceError('UNAUTHORIZED', 'Authenticated actor not found.', 401);
    }
    const caseData =
      this.repo.getCaseByIdForOrg(caseId, actor.organizationId) ||
      this.repo.getCaseByNumberForOrg(caseId, actor.organizationId);
    if (!caseData) {
      throw new ServiceError('NOT_FOUND', `Investigation case "${caseId}" not found or access denied.`, 404);
    }
    return { actor, caseData };
  }

  getCaseContext(caseId: string, actorId: string): McpCaseContext {
    const { caseData } = this.authorizeCaseAccess(caseId, actorId);
    const parties = this.repo.listParties(caseData.id);
    const documents = this.repo.listSourceDocuments(caseData.id);
    const fields = this.repo.listExtractedFields(caseData.id);
    const verifiedRecords = fields.filter(
      (f) => f.status === 'VERIFIED' || f.status === 'CORRECTED'
    );
    const unverifiedRecords = fields.filter(
      (f) => f.status !== 'VERIFIED' && f.status !== 'CORRECTED' && f.status !== 'REJECTED'
    );
    const existingFindings = this.repo.listDiscrepancies(caseData.id);
    const evidenceGaps = this.repo.listEvidenceGaps(caseData.id);
    const paymentBlockers = this.repo.listPaymentBlockers(caseData.id);
    const evidenceReferences = [
      ...documents.map((d) => `doc:${d.id}:${d.sha256.slice(0, 12)}`),
      ...existingFindings.map((f) => `finding:${f.ruleId}:${f.id}`),
    ];

    return {
      caseId: caseData.id,
      caseNumber: caseData.caseNumber,
      title: caseData.title,
      status: caseData.status,
      parties,
      documents,
      verifiedRecords,
      unverifiedRecords,
      existingFindings,
      evidenceGaps,
      paymentBlockers,
      evidenceReferences,
    };
  }

  reconcileCaseRecords(
    caseId: string,
    actorId: string,
    recordIds?: string[]
  ): McpReconcileResult {
    const { actor, caseData } = this.authorizeCaseAccess(caseId, actorId);
    let documents = this.repo.listSourceDocuments(caseData.id);
    let fields = this.repo.listExtractedFields(caseData.id);

    if (recordIds && recordIds.length > 0) {
      const idSet = new Set(recordIds);
      const filteredDocs = documents.filter((d) => idSet.has(d.id));
      const filteredFields = fields.filter((f) => idSet.has(f.id) || idSet.has(f.documentId));
      if (filteredDocs.length > 0) {
        documents = filteredDocs;
        fields = fields.filter((f) => filteredDocs.some((d) => d.id === f.documentId));
      } else if (filteredFields.length > 0) {
        fields = filteredFields;
        const docIdSet = new Set(filteredFields.map((f) => f.documentId));
        documents = documents.filter((d) => docIdSet.has(d.id));
      }
    }

    const recOutput = reconcile({
      caseId: caseData.id,
      documents,
      fields,
      actorId: actor.id,
    });

    const existingRun = this.repo.findReconciliationRunBySnapshot(
      caseData.id,
      recOutput.inputSnapshotHash,
      recOutput.rulesVersion
    );

    if (existingRun) {
      const existingDiscrepancies = this.repo.listDiscrepancies(caseData.id, existingRun.id);
      return {
        runId: existingRun.id,
        reusedExistingRun: true,
        discrepancies: existingDiscrepancies,
        warnings: recOutput.warnings,
        sourceReferences: documents.map((d) => `${d.documentType}:${d.originalFilename}:${d.id}`),
        inputSnapshotHash: existingRun.inputSnapshotHash,
        rulesVersion: existingRun.rulesVersion,
      };
    }

    const previousRun = this.repo.getLatestReconciliationRun(caseData.id);
    const run = {
      id: recOutput.runId,
      caseId: caseData.id,
      inputSnapshotHash: recOutput.inputSnapshotHash,
      rulesVersion: recOutput.rulesVersion,
      previousRunId: previousRun ? previousRun.id : null,
      createdBy: actor.id,
      createdAt: new Date().toISOString(),
    };

    this.repo.saveReconciliationRun(run, recOutput.discrepancies);
    this.repo.updateCaseStatus(caseData.id, 'RECONCILED');
    this.repo.appendEvent(
      caseData.id,
      'RECONCILIATION_RUN',
      actor.id,
      `Reconciliation run ${run.id} completed with ${recOutput.discrepancies.length} discrepancy(ies).`,
      {
        runId: run.id,
        rulesVersion: run.rulesVersion,
        inputSnapshotHash: run.inputSnapshotHash,
        discrepancyCount: recOutput.discrepancies.length,
      }
    );

    for (const d of recOutput.discrepancies) {
      this.repo.appendEvent(
        caseData.id,
        'FINDING_CREATED',
        actor.id,
        `${d.ruleId} (${d.discrepancyType}): ${d.description}`,
        { discrepancyId: d.id, ruleId: d.ruleId, confidence: d.confidence }
      );
    }

    return {
      runId: run.id,
      reusedExistingRun: false,
      discrepancies: recOutput.discrepancies,
      warnings: recOutput.warnings,
      sourceReferences: documents.map((d) => `${d.documentType}:${d.originalFilename}:${d.id}`),
      inputSnapshotHash: run.inputSnapshotHash,
      rulesVersion: run.rulesVersion,
    };
  }

  detectEvidenceGaps(caseId: string, actorId: string): McpGapResult {
    const { caseData } = this.authorizeCaseAccess(caseId, actorId);
    const documents = this.repo.listSourceDocuments(caseData.id);
    const fields = this.repo.listExtractedFields(caseData.id);
    const latestRun = this.repo.getLatestReconciliationRun(caseData.id);

    const result = detectGaps({
      caseId: caseData.id,
      documents,
      fields,
      reconciliationRunId: latestRun?.id ?? null,
    });

    this.repo.replaceGapsAndConfidence(
      caseData.id,
      latestRun?.id ?? null,
      result.gaps,
      result.confidenceAssessments
    );

    return {
      gaps: result.gaps,
      coverage: result.coverage,
      confidenceLadder: result.confidenceAssessments,
    };
  }

  assessPaymentBlockers(caseId: string, actorId: string): McpBlockerResult {
    const { caseData } = this.authorizeCaseAccess(caseId, actorId);
    const documents = this.repo.listSourceDocuments(caseData.id);
    const fields = this.repo.listExtractedFields(caseData.id);
    const latestRun = this.repo.getLatestReconciliationRun(caseData.id);
    const discrepancies = this.repo.listDiscrepancies(caseData.id, latestRun?.id);
    const gapOutput = detectGaps({
      caseId: caseData.id,
      documents,
      fields,
      reconciliationRunId: latestRun?.id ?? null,
    });

    this.repo.replaceGapsAndConfidence(
      caseData.id,
      latestRun?.id ?? null,
      gapOutput.gaps,
      gapOutput.confidenceAssessments
    );

    const blockerOutput = assessBlockers({
      caseId: caseData.id,
      discrepancies,
      gaps: gapOutput.gaps,
      fields,
      reconciliationRunId: latestRun?.id ?? null,
    });

    const persistedBlockers = this.repo.syncPaymentBlockers(
      caseData.id,
      latestRun?.id ?? null,
      blockerOutput.blockers
    );

    const openCount = persistedBlockers.filter((b) => b.status === 'OPEN').length;
    const summary =
      openCount === 0
        ? 'No open payment blockers.'
        : `${openCount} advisory payment blocker(s) open for review.`;

    return {
      blockers: persistedBlockers,
      summary,
    };
  }

  getEvidenceGraph(caseId: string, actorId: string): McpGraphResult {
    const { caseData } = this.authorizeCaseAccess(caseId, actorId);
    const documents = this.repo.listSourceDocuments(caseData.id);
    const fields = this.repo.listExtractedFields(caseData.id);
    const discrepancies = this.repo.listDiscrepancies(caseData.id);
    const gaps = this.repo.listEvidenceGaps(caseData.id);

    const graph = buildEvidenceGraph({
      caseData,
      documents,
      fields,
      discrepancies,
      gaps,
    });

    this.repo.saveEvidenceGraph(caseData.id, graph);
    return graph;
  }

  generateEvidenceReport(
    caseId: string,
    actorId: string,
    options?: { includeHtml?: boolean }
  ): McpReportResult & { report: Report } {
    const { actor, caseData } = this.authorizeCaseAccess(caseId, actorId);
    let latestRun = this.repo.getLatestReconciliationRun(caseData.id);
    if (!latestRun) {
      this.reconcileCaseRecords(caseData.id, actor.id);
      latestRun = this.repo.getLatestReconciliationRun(caseData.id);
    }
    if (!latestRun) {
      throw new ServiceError('RECONCILIATION_REQUIRED', 'Unable to initialize reconciliation run.', 500);
    }

    const parties = this.repo.listParties(caseData.id);
    const documents = this.repo.listSourceDocuments(caseData.id);
    const fields = this.repo.listExtractedFields(caseData.id);
    const verificationRecords = this.repo.listVerificationRecords(caseData.id);
    const discrepancies = this.repo.listDiscrepancies(caseData.id, latestRun.id);
    const gapOutput = detectGaps({
      caseId: caseData.id,
      documents,
      fields,
      reconciliationRunId: latestRun.id,
    });
    this.repo.replaceGapsAndConfidence(
      caseData.id,
      latestRun.id,
      gapOutput.gaps,
      gapOutput.confidenceAssessments
    );

    const blockerResult = this.assessPaymentBlockers(caseData.id, actor.id);
    const graph = this.getEvidenceGraph(caseData.id, actor.id);
    const events = this.repo.listEvents(caseData.id);
    const mcpToolCalls = this.repo.listMcpToolCalls(caseData.id);

    const built = buildReport({
      caseData,
      parties,
      documents,
      fields,
      verificationRecords,
      discrepancies,
      gaps: gapOutput.gaps,
      blockers: blockerResult.blockers,
      confidenceAssessments: gapOutput.confidenceAssessments,
      graph,
      events,
      mcpToolCalls,
      reconciliationRunId: latestRun.id,
      generatedBy: actor.id,
    });

    const existingReport = this.repo.findReportBySnapshot(
      caseData.id,
      latestRun.id,
      built.report.snapshotHash
    );
    if (existingReport) {
      return {
        report: existingReport,
        reportId: existingReport.id,
        snapshotHash: existingReport.snapshotHash,
        status: 'GENERATED',
        findings: discrepancies,
        sourceReferences: documents.map((d) => `${d.documentType}:${d.originalFilename}:${d.sha256.slice(0, 12)}`),
        limitations: built.content.limitations,
      };
    }

    const html = options?.includeHtml !== false ? generateReportHtml(built.content) : null;
    const savedReport: Report = {
      ...built.report,
      contentHtml: html,
    };

    this.repo.saveReport(savedReport);
    this.repo.updateCaseStatus(caseData.id, 'REPORT_GENERATED');
    this.repo.appendEvent(
      caseData.id,
      'REPORT_GENERATED',
      actor.id,
      `Generated Dispute-Ready Evidence Pack (${savedReport.id}).`,
      { reportId: savedReport.id, snapshotHash: savedReport.snapshotHash }
    );

    return {
      report: savedReport,
      reportId: savedReport.id,
      snapshotHash: savedReport.snapshotHash,
      status: 'GENERATED',
      findings: discrepancies,
      sourceReferences: documents.map((d) => `${d.documentType}:${d.originalFilename}:${d.sha256.slice(0, 12)}`),
      limitations: built.content.limitations,
    };
  }

  // === Human Verification & Blocker Governance ===

  verifyField(
    caseId: string,
    fieldId: string,
    actorId: string,
    input: {
      action: 'VERIFY' | 'CORRECT' | 'REJECT';
      newValue?: string;
      numericValue?: number | null;
      currency?: Currency | null;
      unit?: QuantityUnit | null;
      reason: string;
    }
  ): ExtractedField {
    const { actor, caseData } = this.authorizeCaseAccess(caseId, actorId);
    const field = this.repo.getExtractedField(caseData.id, fieldId);
    if (!field) {
      throw new ServiceError('NOT_FOUND', 'Extracted field not found in this case.', 404);
    }

    let nextStatus: ExtractionStatus = field.status;
    let nextValue = field.extractedValue;
    let nextNumeric = field.numericValue;
    let nextPresence: FieldPresence = field.presence;
    const nextCurrency = input.currency !== undefined ? input.currency : field.currency;
    const nextUnit = input.unit !== undefined ? input.unit : field.unit;

    if (input.action === 'VERIFY') {
      if (field.presence !== 'PRESENT') {
        throw new ServiceError('INVALID_STATE', 'Cannot verify a MISSING or INVALID field without correcting it.', 400);
      }
      nextStatus = 'VERIFIED';
    } else if (input.action === 'CORRECT') {
      if (input.newValue === undefined || input.newValue.trim() === '') {
        throw new ServiceError('VALIDATION_ERROR', 'Correction requires a non-empty newValue.', 400);
      }
      nextStatus = 'CORRECTED';
      nextValue = input.newValue.trim();
      nextPresence = 'PRESENT';
      if (input.numericValue !== undefined) {
        nextNumeric = input.numericValue;
      } else if (['quantity', 'unit_price', 'total_amount'].includes(field.fieldName)) {
        const parsed = Number(nextValue);
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new ServiceError(
            'VALIDATION_ERROR',
            `Field "${field.fieldName}" requires a non-negative integer minor/quantity value.`,
            400
          );
        }
        nextNumeric = parsed;
      }
    } else if (input.action === 'REJECT') {
      nextStatus = 'REJECTED';
    }

    const now = new Date().toISOString();
    this.repo.applyFieldVerification(
      field.id,
      {
        extractedValue: nextValue,
        numericValue: nextNumeric,
        presence: nextPresence,
        currency: nextCurrency,
        unit: nextUnit,
        status: nextStatus,
      },
      {
        id: generateId(),
        extractedFieldId: field.id,
        verifiedBy: actor.id,
        previousValue: field.extractedValue,
        newValue: nextValue,
        previousStatus: field.status,
        newStatus: nextStatus,
        reason: input.reason.trim(),
        createdAt: now,
      }
    );

    const doc = this.repo.getSourceDocument(caseData.id, field.documentId);
    if (doc) {
      this.repo.syncDomainRecordForDocument(doc, this.repo.listExtractedFields(caseData.id));
    }

    if (caseData.status === 'CREATED' || caseData.status === 'DOCUMENTS_UPLOADED' || caseData.status === 'EXTRACTION_COMPLETE') {
      this.repo.updateCaseStatus(caseData.id, 'UNDER_REVIEW');
    }

    this.repo.appendEvent(
      caseData.id,
      input.action === 'CORRECT' ? 'HUMAN_CORRECTION' : 'FIELD_VERIFIED',
      actor.id,
      `Field "${field.fieldName}" marked ${nextStatus} (${input.reason.trim()}).`,
      {
        fieldId: field.id,
        action: input.action,
        previousValue: field.extractedValue,
        newValue: nextValue,
        previousStatus: field.status,
        newStatus: nextStatus,
      }
    );

    return this.repo.getExtractedField(caseData.id, field.id)!;
  }

  updateBlockerStatus(
    caseId: string,
    blockerId: string,
    actorId: string,
    status: BlockerStatus,
    note?: string
  ): PaymentBlockerStatusResult {
    const { actor, caseData } = this.authorizeCaseAccess(caseId, actorId);
    if (actor.role !== 'REVIEWER') {
      throw new ServiceError(
        'FORBIDDEN',
        'Only a REVIEWER can acknowledge or resolve payment blockers.',
        403
      );
    }
    const blocker = this.repo.getPaymentBlocker(caseData.id, blockerId);
    if (!blocker) {
      throw new ServiceError('NOT_FOUND', 'Payment blocker not found.', 404);
    }

    this.repo.updatePaymentBlockerStatus(blocker.id, status, actor.id);
    this.repo.appendEvent(
      caseData.id,
      'REVIEW_ACTION',
      actor.id,
      `Payment blocker "${blocker.title}" status updated from ${blocker.status} to ${status}.${note ? ` Note: ${note}` : ''}`,
      { blockerId: blocker.id, previousStatus: blocker.status, newStatus: status }
    );

    return { blocker: this.repo.getPaymentBlocker(caseData.id, blocker.id)! };
  }

  createFollowUpDraft(caseId: string, reportId: string, actorId: string, customQuestions?: string[]): FollowUpDraft {
    const { actor, caseData } = this.authorizeCaseAccess(caseId, actorId);
    const report = this.repo.getReport(caseData.id, reportId);
    if (!report) {
      throw new ServiceError('NOT_FOUND', 'Report not found for follow-up draft.', 404);
    }
    const parsed = JSON.parse(report.contentJson) as { followUpQuestions?: string[] };
    const questions =
      customQuestions && customQuestions.length > 0
        ? customQuestions
        : parsed.followUpQuestions || [];

    const draft: FollowUpDraft = {
      id: generateId(),
      caseId: caseData.id,
      reportId: report.id,
      questions,
      createdBy: actor.id,
      createdAt: new Date().toISOString(),
    };
    this.repo.saveFollowUpDraft(draft);
    this.repo.appendEvent(
      caseData.id,
      'REVIEW_ACTION',
      actor.id,
      `Created non-sent follow-up draft (${draft.id}) with ${questions.length} question(s).`,
      { draftId: draft.id, reportId: report.id }
    );
    return draft;
  }

  createInvestigationCase(
    actorId: string,
    input: {
      caseNumber: string;
      title: string;
      description?: string;
      buyerName?: string;
      supplierName?: string;
    }
  ): InvestigationCase {
    const actor = this.repo.getUserById(actorId);
    if (!actor) {
      throw new ServiceError('UNAUTHORIZED', 'Authenticated actor not found.', 401);
    }

    const existing = this.repo.getCaseByNumberForOrg(input.caseNumber.trim(), actor.organizationId);
    if (existing) {
      throw new ServiceError(
        'DUPLICATE_CASE_NUMBER',
        `Case number "${input.caseNumber.trim()}" already exists in this organization.`,
        409
      );
    }

    const now = new Date().toISOString();
    const newCase: InvestigationCase = {
      id: generateId(),
      caseNumber: input.caseNumber.trim(),
      title: input.title.trim(),
      description: (input.description ?? '').trim(),
      status: 'CREATED',
      organizationId: actor.organizationId,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    };

    this.repo.runInTransaction(() => {
      this.repo.createCase(newCase);
      if (input.buyerName?.trim()) {
        this.repo.addParty({
          id: generateId(),
          caseId: newCase.id,
          name: input.buyerName.trim(),
          role: 'BUYER',
        });
      }
      if (input.supplierName?.trim()) {
        this.repo.addParty({
          id: generateId(),
          caseId: newCase.id,
          name: input.supplierName.trim(),
          role: 'SUPPLIER',
        });
      }
      this.repo.appendEvent(
        newCase.id,
        'CASE_CREATED',
        actor.id,
        `Created investigation case ${newCase.caseNumber}: ${newCase.title}`,
        { caseNumber: newCase.caseNumber }
      );
    });

    return newCase;
  }

  recordDocumentAndExtraction(
    caseId: string,
    actorId: string,
    doc: Omit<SourceDocument, 'caseId' | 'uploadedBy'>,
    fields: ExtractedField[],
    extractionMethod: ExtractionMethod,
    warning: string | null
  ): { document: SourceDocument; fields: ExtractedField[]; warning: string | null } {
    const { actor, caseData } = this.authorizeCaseAccess(caseId, actorId);
    const fullDoc: SourceDocument = {
      ...doc,
      caseId: caseData.id,
      uploadedBy: actor.id,
    };

    this.repo.runInTransaction(() => {
      this.repo.addSourceDocument(fullDoc);
      for (const f of fields) {
        this.repo.addExtractedField(f);
      }
      const allFields = this.repo.listExtractedFields(caseData.id);
      this.repo.syncDomainRecordForDocument(fullDoc, allFields);
      this.repo.updateCaseStatus(
        caseData.id,
        fields.length > 0 ? 'EXTRACTION_COMPLETE' : 'DOCUMENTS_UPLOADED'
      );
      this.repo.appendEvent(
        caseData.id,
        'DOCUMENT_ADDED',
        actor.id,
        `Uploaded ${fullDoc.documentType} (${fullDoc.originalFilename}).`,
        {
          documentId: fullDoc.id,
          documentType: fullDoc.documentType,
          sha256: fullDoc.sha256,
          sizeBytes: fullDoc.sizeBytes,
        }
      );
      this.repo.appendEvent(
        caseData.id,
        'EXTRACTION_RUN',
        actor.id,
        fields.length > 0
          ? `Extracted ${fields.length} field(s) using ${extractionMethod}.`
          : `Extraction (${extractionMethod}) produced 0 structured fields.${warning ? ` ${warning}` : ''}`,
        {
          documentId: fullDoc.id,
          method: extractionMethod,
          fieldCount: fields.length,
          warning,
        }
      );
    });

    return { document: fullDoc, fields, warning };
  }

  addManualField(
    caseId: string,
    actorId: string,
    input: {
      documentId: string;
      fieldName: string;
      value: string;
      numericValue?: number | null;
      currency?: Currency | null;
      unit?: QuantityUnit | null;
      presence?: FieldPresence;
    }
  ): ExtractedField {
    const { actor, caseData } = this.authorizeCaseAccess(caseId, actorId);
    const doc = this.repo.getSourceDocument(caseData.id, input.documentId);
    if (!doc) {
      throw new ServiceError('NOT_FOUND', 'Target source document not found in this case.', 404);
    }

    const trimmed = input.value.trim();
    const presence: FieldPresence = input.presence ?? 'PRESENT';
    let numericValue: number | null = input.numericValue ?? null;

    if (presence === 'PRESENT' && ['quantity', 'unit_price', 'total_amount'].includes(input.fieldName) && numericValue === null) {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ServiceError(
          'VALIDATION_ERROR',
          `Field "${input.fieldName}" requires a non-negative integer value (minor units for money, integer for quantity).`,
          400
        );
      }
      numericValue = parsed;
    }

    const now = new Date().toISOString();
    const field: ExtractedField = {
      id: generateId(),
      documentId: doc.id,
      caseId: caseData.id,
      fieldName: input.fieldName.trim(),
      rawText: trimmed,
      extractedValue: presence === 'PRESENT' ? trimmed : null,
      numericValue,
      currency: input.currency ?? null,
      unit: input.unit ?? null,
      presence,
      sourcePageNumber: null,
      sourceOffset: 'manual-entry',
      extractionMethod: 'MANUAL',
      extractionVersion: '1.0.0',
      status: 'EXTRACTED',
      createdAt: now,
      updatedAt: now,
    };

    this.repo.runInTransaction(() => {
      this.repo.addExtractedField(field);
      this.repo.syncDomainRecordForDocument(doc, this.repo.listExtractedFields(caseData.id));
      this.repo.appendEvent(
        caseData.id,
        'EVIDENCE_CHANGE',
        actor.id,
        `Added manual field "${field.fieldName}" on ${doc.originalFilename}.`,
        { fieldId: field.id, documentId: doc.id, method: 'MANUAL' }
      );
    });

    return field;
  }

  getAllowedDocumentTypes(): DocumentType[] {
    return ['PURCHASE_ORDER', 'INVOICE', 'DELIVERY_RECORD', 'SUPPORTING'];
  }
}

interface PaymentBlockerStatusResult {
  blocker: ReturnType<InvestigationRepository['getPaymentBlocker']>;
}
