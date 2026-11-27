/**
 * PROOFLYN — Reconciliation Engine
 * Pure business logic. No I/O, no framework dependencies.
 * All arithmetic is deterministic. Missing is never zero.
 * Each rule is documented with its ID from the catalog.
 */

import {
  type ExtractedField,
  type SourceDocument,
  type Discrepancy,
  type ConfidenceLevel,
  type FieldPresence,
  type Currency,
  type QuantityUnit,
  RULES_VERSION,
} from './types';
import { generateId, hashObject } from './crypto';

export interface ReconciliationInput {
  caseId: string;
  documents: SourceDocument[];
  fields: ExtractedField[];
  actorId: string;
  runId?: string;
}

export interface DocumentFields {
  documentId: string;
  documentType: string;
  quantity: FieldValue | null;
  unitPrice: FieldValue | null;
  totalAmount: FieldValue | null;
  invoiceNumber: FieldValue | null;
  supplierName: FieldValue | null;
  currency: Currency | null;
  unit: QuantityUnit | null;
}

export interface FieldValue {
  fieldId: string;
  numericValue: number | null;
  stringValue: string | null;
  presence: FieldPresence;
  status: string;
}

export interface ReconciliationOutput {
  runId: string;
  discrepancies: Discrepancy[];
  warnings: string[];
  inputSnapshotHash: string;
  rulesVersion: string;
}

function getFieldsByDocument(
  documents: SourceDocument[],
  fields: ExtractedField[]
): Map<string, DocumentFields> {
  const result = new Map<string, DocumentFields>();

  for (const doc of documents) {
    const docFields = fields.filter((f) => f.documentId === doc.id);
    const getField = (name: string): FieldValue | null => {
      const f = docFields.find((ff) => ff.fieldName === name && ff.status !== 'REJECTED')
        ?? docFields.find((ff) => ff.fieldName === name);
      if (!f) return null;
      return {
        fieldId: f.id,
        numericValue: f.numericValue,
        stringValue: f.extractedValue,
        presence: f.presence,
        status: f.status,
      };
    };

    const validFields = docFields.filter((f) => f.status !== 'REJECTED');

    result.set(doc.id, {
      documentId: doc.id,
      documentType: doc.documentType,
      quantity: getField('quantity'),
      unitPrice: getField('unit_price'),
      totalAmount: getField('total_amount'),
      invoiceNumber: getField('invoice_number'),
      supplierName: getField('supplier_name'),
      currency: (validFields.find((f) => f.currency)?.currency as Currency) || null,
      unit: (validFields.find((f) => f.unit)?.unit as QuantityUnit) || null,
    });
  }

  return result;
}

function fieldIsUsable(fv: FieldValue | null): fv is FieldValue & { numericValue: number } {
  return (
    fv !== null &&
    fv.presence === 'PRESENT' &&
    fv.status !== 'REJECTED' &&
    fv.numericValue !== null &&
    Number.isInteger(fv.numericValue)
  );
}

function stringFieldIsUsable(fv: FieldValue | null): fv is FieldValue & { stringValue: string } {
  return (
    fv !== null &&
    fv.presence === 'PRESENT' &&
    fv.status !== 'REJECTED' &&
    typeof fv.stringValue === 'string' &&
    fv.stringValue.trim().length > 0
  );
}

function isHumanVerified(status: string): boolean {
  return status === 'VERIFIED' || status === 'CORRECTED';
}

function getConfidence(fields: FieldValue[], isConflicted = false): ConfidenceLevel {
  if (fields.some((f) => f.presence !== 'PRESENT' || f.status === 'REJECTED')) {
    return 'INSUFFICIENT';
  }
  if (isConflicted) {
    return 'CONFLICTED';
  }
  if (fields.every((f) => isHumanVerified(f.status))) {
    return 'VERIFIED';
  }
  return 'SUPPORTED_UNVERIFIED';
}

function unitsCompatible(a: QuantityUnit | null, b: QuantityUnit | null): boolean {
  return !a || !b || a === b;
}

function currenciesCompatible(a: Currency | null, b: Currency | null): boolean {
  return !a || !b || a === b;
}

/**
 * R-QTY-01: Invoice quantity > total delivered quantity
 */
function ruleQTY01(
  caseId: string,
  invoiceDoc: DocumentFields,
  deliveryDocs: DocumentFields[],
  runId: string
): { discrepancies: Discrepancy[]; warnings: string[] } {
  const results: Discrepancy[] = [];
  const warnings: string[] = [];
  const invoiceQty = invoiceDoc.quantity;

  if (!fieldIsUsable(invoiceQty)) return { discrepancies: results, warnings };

  let totalDelivered = 0;
  let hasDelivery = false;
  const deliveryFieldIds: string[] = [];
  const deliveryDocIds: string[] = [];
  const usedDeliveryFields: FieldValue[] = [];

  for (const dd of deliveryDocs) {
    if (!fieldIsUsable(dd.quantity)) continue;
    if (!unitsCompatible(invoiceDoc.unit, dd.unit)) {
      warnings.push(
        `R-CUR-01: Cannot compare invoice unit (${invoiceDoc.unit}) with delivery unit (${dd.unit}) on document ${dd.documentId}.`
      );
      return { discrepancies: [], warnings };
    }
    totalDelivered += dd.quantity.numericValue;
    hasDelivery = true;
    deliveryFieldIds.push(dd.quantity.fieldId);
    deliveryDocIds.push(dd.documentId);
    usedDeliveryFields.push(dd.quantity);
  }

  if (!hasDelivery) return { discrepancies: results, warnings };

  if (invoiceQty.numericValue > totalDelivered) {
    const variance = invoiceQty.numericValue - totalDelivered;
    let varianceValue: number | null = null;
    let varianceCurrency: Currency | null = null;
    if (fieldIsUsable(invoiceDoc.unitPrice) && invoiceDoc.currency) {
      varianceValue = variance * invoiceDoc.unitPrice.numericValue;
      varianceCurrency = invoiceDoc.currency;
    }

    results.push({
      id: generateId(),
      reconciliationRunId: runId,
      caseId,
      ruleId: 'R-QTY-01',
      discrepancyType: 'QUANTITY_MISMATCH',
      description: `Invoice quantity (${invoiceQty.numericValue}) exceeds total delivered quantity (${totalDelivered}). Variance: ${variance} ${invoiceDoc.unit || 'units'}.`,
      sourceDocumentIds: [invoiceDoc.documentId, ...deliveryDocIds],
      sourceFieldIds: [invoiceQty.fieldId, ...deliveryFieldIds],
      expectedValue: String(totalDelivered),
      actualValue: String(invoiceQty.numericValue),
      varianceValue,
      varianceCurrency,
      confidence: getConfidence([invoiceQty, ...usedDeliveryFields]),
      createdAt: new Date().toISOString(),
    });
  }

  return { discrepancies: results, warnings };
}

/**
 * R-QTY-02: PO quantity vs invoice quantity conflict
 */
function ruleQTY02(
  caseId: string,
  poDoc: DocumentFields,
  invoiceDoc: DocumentFields,
  runId: string
): Discrepancy[] {
  const poQty = poDoc.quantity;
  const invQty = invoiceDoc.quantity;

  if (!fieldIsUsable(poQty) || !fieldIsUsable(invQty)) return [];
  if (!unitsCompatible(poDoc.unit, invoiceDoc.unit)) return [];

  if (poQty.numericValue !== invQty.numericValue) {
    const allVerified = isHumanVerified(poQty.status) && isHumanVerified(invQty.status);
    return [
      {
        id: generateId(),
        reconciliationRunId: runId,
        caseId,
        ruleId: 'R-QTY-02',
        discrepancyType: 'QUANTITY_MISMATCH',
        description: `PO quantity (${poQty.numericValue}) differs from invoice quantity (${invQty.numericValue}).`,
        sourceDocumentIds: [poDoc.documentId, invoiceDoc.documentId],
        sourceFieldIds: [poQty.fieldId, invQty.fieldId],
        expectedValue: String(poQty.numericValue),
        actualValue: String(invQty.numericValue),
        varianceValue: null,
        varianceCurrency: null,
        confidence: getConfidence([poQty, invQty], allVerified),
        createdAt: new Date().toISOString(),
      },
    ];
  }

  return [];
}

/**
 * R-PRC-01: Unit price mismatch (only when BOTH sides have data and compatible currency)
 */
function rulePRC01(
  caseId: string,
  poDoc: DocumentFields,
  invoiceDoc: DocumentFields,
  runId: string
): Discrepancy[] {
  const poPrice = poDoc.unitPrice;
  const invPrice = invoiceDoc.unitPrice;

  if (!fieldIsUsable(poPrice) || !fieldIsUsable(invPrice)) return [];
  if (!currenciesCompatible(poDoc.currency, invoiceDoc.currency)) return [];

  if (poPrice.numericValue !== invPrice.numericValue) {
    const allVerified = isHumanVerified(poPrice.status) && isHumanVerified(invPrice.status);
    return [
      {
        id: generateId(),
        reconciliationRunId: runId,
        caseId,
        ruleId: 'R-PRC-01',
        discrepancyType: 'PRICE_MISMATCH',
        description: `PO unit price (${poPrice.numericValue}) differs from invoice unit price (${invPrice.numericValue}).`,
        sourceDocumentIds: [poDoc.documentId, invoiceDoc.documentId],
        sourceFieldIds: [poPrice.fieldId, invPrice.fieldId],
        expectedValue: String(poPrice.numericValue),
        actualValue: String(invPrice.numericValue),
        varianceValue: Math.abs(poPrice.numericValue - invPrice.numericValue),
        varianceCurrency: invoiceDoc.currency || poDoc.currency,
        confidence: getConfidence([poPrice, invPrice], allVerified),
        createdAt: new Date().toISOString(),
      },
    ];
  }

  return [];
}

/**
 * R-DUP-01: Duplicate invoice (same supplier + invoice number)
 */
function ruleDUP01(
  caseId: string,
  invoiceDocs: DocumentFields[],
  runId: string
): Discrepancy[] {
  const results: Discrepancy[] = [];
  const seen = new Map<string, DocumentFields>();

  for (const inv of invoiceDocs) {
    const invNum = inv.invoiceNumber;
    const supplier = inv.supplierName;
    if (!stringFieldIsUsable(invNum) || !stringFieldIsUsable(supplier)) continue;

    const key = `${supplier.stringValue.trim().toLowerCase()}::${invNum.stringValue.trim().toLowerCase()}`;
    const existing = seen.get(key);
    if (existing && existing.invoiceNumber && existing.supplierName) {
      results.push({
        id: generateId(),
        reconciliationRunId: runId,
        caseId,
        ruleId: 'R-DUP-01',
        discrepancyType: 'DUPLICATE_INVOICE',
        description: `Duplicate invoice detected: invoice number "${invNum.stringValue}" from supplier "${supplier.stringValue}" appears in multiple documents.`,
        sourceDocumentIds: [existing.documentId, inv.documentId],
        sourceFieldIds: [existing.invoiceNumber.fieldId, invNum.fieldId],
        expectedValue: 'Unique invoice',
        actualValue: `Duplicate: ${invNum.stringValue}`,
        varianceValue: null,
        varianceCurrency: null,
        confidence: getConfidence([
          existing.invoiceNumber,
          invNum,
          existing.supplierName,
          supplier,
        ]),
        createdAt: new Date().toISOString(),
      });
    } else {
      seen.set(key, inv);
    }
  }

  return results;
}

/**
 * R-DLV-02: Partial delivery (sum delivered across delivery records < ordered)
 */
function ruleDLV02(
  caseId: string,
  poDoc: DocumentFields,
  deliveryDocs: DocumentFields[],
  runId: string
): Discrepancy[] {
  const poQty = poDoc.quantity;
  if (!fieldIsUsable(poQty)) return [];

  let totalDelivered = 0;
  let hasDelivery = false;
  const fieldIds: string[] = [];
  const docIds: string[] = [];
  const usedFields: FieldValue[] = [];

  for (const dd of deliveryDocs) {
    if (!fieldIsUsable(dd.quantity)) continue;
    if (!unitsCompatible(poDoc.unit, dd.unit)) return [];
    totalDelivered += dd.quantity.numericValue;
    hasDelivery = true;
    fieldIds.push(dd.quantity.fieldId);
    docIds.push(dd.documentId);
    usedFields.push(dd.quantity);
  }

  if (!hasDelivery) return [];

  if (totalDelivered < poQty.numericValue) {
    return [
      {
        id: generateId(),
        reconciliationRunId: runId,
        caseId,
        ruleId: 'R-DLV-02',
        discrepancyType: 'PARTIAL_DELIVERY',
        description: `Partial delivery: total delivered (${totalDelivered}) is less than PO quantity (${poQty.numericValue}). Shortfall: ${poQty.numericValue - totalDelivered} ${poDoc.unit || 'units'}.`,
        sourceDocumentIds: [poDoc.documentId, ...docIds],
        sourceFieldIds: [poQty.fieldId, ...fieldIds],
        expectedValue: String(poQty.numericValue),
        actualValue: String(totalDelivered),
        varianceValue: null,
        varianceCurrency: null,
        confidence: getConfidence([poQty, ...usedFields]),
        createdAt: new Date().toISOString(),
      },
    ];
  }

  return [];
}

/**
 * R-CUR-01: Currency or unit mismatch — cannot compare, emit warning
 */
function ruleCUR01(
  caseId: string,
  allDocs: DocumentFields[],
  runId: string
): { discrepancies: Discrepancy[]; warnings: string[] } {
  const results: Discrepancy[] = [];
  const warnings: string[] = [];
  const currencies = new Set<Currency>();
  const units = new Set<QuantityUnit>();

  for (const doc of allDocs) {
    if (doc.currency) currencies.add(doc.currency);
    if (doc.unit) units.add(doc.unit);
  }

  if (currencies.size > 1) {
    const list = [...currencies].sort().join(', ');
    warnings.push(`Multiple currencies detected (${list}). Financial comparison skipped.`);
    results.push({
      id: generateId(),
      reconciliationRunId: runId,
      caseId,
      ruleId: 'R-CUR-01',
      discrepancyType: 'CURRENCY_MISMATCH',
      description: `Multiple currencies detected across documents: ${list}. Financial comparison not possible without conversion.`,
      sourceDocumentIds: allDocs.filter((d) => d.currency).map((d) => d.documentId),
      sourceFieldIds: [],
      expectedValue: 'Single currency',
      actualValue: list,
      varianceValue: null,
      varianceCurrency: null,
      confidence: 'CONFLICTED',
      createdAt: new Date().toISOString(),
    });
  }

  if (units.size > 1) {
    const list = [...units].sort().join(', ');
    warnings.push(`Multiple quantity units detected (${list}). Quantity comparison skipped.`);
    results.push({
      id: generateId(),
      reconciliationRunId: runId,
      caseId,
      ruleId: 'R-CUR-01',
      discrepancyType: 'UNIT_MISMATCH',
      description: `Multiple quantity units detected across documents: ${list}. Quantity comparison not possible without unit normalization.`,
      sourceDocumentIds: allDocs.filter((d) => d.unit).map((d) => d.documentId),
      sourceFieldIds: [],
      expectedValue: 'Single quantity unit',
      actualValue: list,
      varianceValue: null,
      varianceCurrency: null,
      confidence: 'CONFLICTED',
      createdAt: new Date().toISOString(),
    });
  }

  return { discrepancies: results, warnings };
}

export function reconcile(input: ReconciliationInput): ReconciliationOutput {
  const { caseId, documents, fields } = input;
  const runId = input.runId || generateId();

  const docFieldMap = getFieldsByDocument(documents, fields);
  const poDocs = documents.filter((d) => d.documentType === 'PURCHASE_ORDER');
  const invoiceDocs = documents.filter((d) => d.documentType === 'INVOICE');
  const deliveryDocs = documents.filter((d) => d.documentType === 'DELIVERY_RECORD');

  const poFields = poDocs.map((d) => docFieldMap.get(d.id)!).filter(Boolean);
  const invoiceFields = invoiceDocs.map((d) => docFieldMap.get(d.id)!).filter(Boolean);
  const deliveryFields = deliveryDocs.map((d) => docFieldMap.get(d.id)!).filter(Boolean);
  const allDocFields = [...poFields, ...invoiceFields, ...deliveryFields];

  const discrepancies: Discrepancy[] = [];
  const warnings: string[] = [];

  for (const inv of invoiceFields) {
    const qty01 = ruleQTY01(caseId, inv, deliveryFields, runId);
    discrepancies.push(...qty01.discrepancies);
    warnings.push(...qty01.warnings);

    for (const po of poFields) {
      discrepancies.push(...ruleQTY02(caseId, po, inv, runId));
      discrepancies.push(...rulePRC01(caseId, po, inv, runId));
    }
  }

  discrepancies.push(...ruleDUP01(caseId, invoiceFields, runId));

  for (const po of poFields) {
    discrepancies.push(...ruleDLV02(caseId, po, deliveryFields, runId));
  }

  const cur01 = ruleCUR01(caseId, allDocFields, runId);
  discrepancies.push(...cur01.discrepancies);
  warnings.push(...cur01.warnings);

  const snapshotData = {
    caseId,
    rulesVersion: RULES_VERSION,
    documents: documents
      .map((d) => `${d.id}:${d.documentType}:${d.sha256}`)
      .sort(),
    fields: fields
      .map(
        (f) =>
          `${f.id}:${f.documentId}:${f.fieldName}:${f.extractedValue ?? ''}:${f.numericValue ?? ''}:${f.presence}:${f.currency ?? ''}:${f.unit ?? ''}:${f.status}`
      )
      .sort(),
  };
  const inputSnapshotHash = hashObject(snapshotData);

  return {
    runId,
    discrepancies,
    warnings: [...new Set(warnings)],
    inputSnapshotHash,
    rulesVersion: RULES_VERSION,
  };
}
