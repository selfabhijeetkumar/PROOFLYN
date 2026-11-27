'use client';

import { useState, type FormEvent } from 'react';
import type {
  Currency,
  ExtractedField,
  QuantityUnit,
  SourceDocument,
  VerificationRecord,
} from '@/core/types';
import { apiFetch, formatMinorMoney } from '@/lib/api-client';
import { CheckCircleIcon } from './Icons';

interface FieldsVerificationPanelProps {
  caseId: string;
  documents: SourceDocument[];
  fields: ExtractedField[];
  verifications: VerificationRecord[];
  onRefresh: () => Promise<void>;
}

type FieldFilter = 'ALL' | 'VERIFIED' | 'EXTRACTED' | 'NEEDS_REVIEW' | 'MISSING';

export function FieldsVerificationPanel({
  caseId,
  documents,
  fields,
  verifications,
  onRefresh,
}: FieldsVerificationPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [correctValue, setCorrectValue] = useState('');
  const [correctReason, setCorrectReason] = useState('');
  const [filter, setFilter] = useState<FieldFilter>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Manual field entry state
  const [manualDocId, setManualDocId] = useState(documents[0]?.id ?? '');
  const [manualName, setManualName] = useState('quantity');
  const [manualValue, setManualValue] = useState('');
  const [manualCurrency, setManualCurrency] = useState<Currency | ''>('');
  const [manualUnit, setManualUnit] = useState<QuantityUnit | ''>('UNITS');
  const [addingManual, setAddingManual] = useState(false);

  const docNameById = new Map(documents.map((d) => [d.id, `${d.documentType}: ${d.originalFilename}`]));

  const runVerifyAction = async (
    field: ExtractedField,
    action: 'VERIFY' | 'CORRECT' | 'REJECT',
    reason: string,
    newValue?: string
  ) => {
    setBusyId(field.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(
        `/api/v1/cases/${encodeURIComponent(caseId)}/fields/${encodeURIComponent(field.id)}/verify`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            reason,
            ...(newValue !== undefined ? { newValue } : {}),
          }),
        }
      );
      setEditingFieldId(null);
      setCorrectValue('');
      setCorrectReason('');
      setNotice(`Field "${field.fieldName}" updated (${action}).`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleManualAdd = async (e: FormEvent) => {
    e.preventDefault();
    const targetDocId = manualDocId || documents[0]?.id;
    if (!targetDocId) {
      setError('Upload a source document before adding manual fields.');
      return;
    }
    setAddingManual(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/cases/${encodeURIComponent(caseId)}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: targetDocId,
          fieldName: manualName,
          value: manualValue,
          currency: manualCurrency || null,
          unit: manualUnit || null,
        }),
      });
      setManualValue('');
      setNotice(`Manual field "${manualName}" recorded.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual field creation failed.');
    } finally {
      setAddingManual(false);
    }
  };

  const badgeClass = (f: ExtractedField) => {
    if (f.presence !== 'PRESENT' || f.status === 'REJECTED') return 'danger';
    if (f.status === 'VERIFIED' || f.status === 'CORRECTED') return 'ok';
    if (f.status === 'NEEDS_REVIEW') return 'warn';
    return 'info';
  };

  const displayValue = (f: ExtractedField) => {
    if (f.presence !== 'PRESENT') return `[${f.presence}]`;
    if ((f.fieldName === 'unit_price' || f.fieldName === 'total_amount') && f.numericValue !== null) {
      return `${formatMinorMoney(f.numericValue, f.currency)} (minor: ${f.numericValue})`;
    }
    return `${f.extractedValue ?? '—'}${f.unit ? ` ${f.unit}` : ''}`;
  };

  const verifiedCount = fields.filter((f) => f.status === 'VERIFIED' || f.status === 'CORRECTED').length;
  const extractedCount = fields.filter((f) => f.status === 'EXTRACTED').length;
  const needsReviewCount = fields.filter((f) => f.status === 'NEEDS_REVIEW').length;
  const missingOrRejectedCount = fields.filter((f) => f.presence !== 'PRESENT' || f.status === 'REJECTED').length;

  const filteredFields = fields.filter((f) => {
    if (filter === 'VERIFIED') return f.status === 'VERIFIED' || f.status === 'CORRECTED';
    if (filter === 'EXTRACTED') return f.status === 'EXTRACTED';
    if (filter === 'NEEDS_REVIEW') return f.status === 'NEEDS_REVIEW';
    if (filter === 'MISSING') return f.presence !== 'PRESENT' || f.status === 'REJECTED';
    return true;
  });

  return (
    <div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <div className="card">
        <div className="card-header">
          <div>
            <div className="row" style={{ marginBottom: '4px' }}>
              <CheckCircleIcon size={15} />
              <h3 style={{ margin: 0 }}>Extracted vs Verified Fields ({fields.length})</h3>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Extracted values are never treated as verified until a human confirms or corrects them.
              Original raw text is preserved alongside append-only verification history.
            </p>
          </div>
          <div className="row">
            <span className="badge ok">Verified: {verifiedCount}</span>
            <span className="badge info">Extracted: {extractedCount}</span>
            <span className="badge warn">Needs Review: {needsReviewCount}</span>
            {missingOrRejectedCount > 0 && (
              <span className="badge danger">Missing/Rejected: {missingOrRejectedCount}</span>
            )}
          </div>
        </div>

        <div className="row" style={{ marginBottom: '12px' }}>
          <button type="button" className={`small ${filter === 'ALL' ? 'primary' : ''}`} onClick={() => setFilter('ALL')}>
            All ({fields.length})
          </button>
          <button type="button" className={`small ${filter === 'VERIFIED' ? 'primary' : ''}`} onClick={() => setFilter('VERIFIED')}>
            Verified ({verifiedCount})
          </button>
          <button type="button" className={`small ${filter === 'EXTRACTED' ? 'primary' : ''}`} onClick={() => setFilter('EXTRACTED')}>
            Extracted ({extractedCount})
          </button>
          <button type="button" className={`small ${filter === 'NEEDS_REVIEW' ? 'primary' : ''}`} onClick={() => setFilter('NEEDS_REVIEW')}>
            Needs Review ({needsReviewCount})
          </button>
          <button type="button" className={`small ${filter === 'MISSING' ? 'primary' : ''}`} onClick={() => setFilter('MISSING')}>
            Missing / Rejected ({missingOrRejectedCount})
          </button>
        </div>

        {filteredFields.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {fields.length === 0
              ? 'No extracted fields yet. Upload a document or add a manual field below.'
              : 'No fields match the selected verification filter.'}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source Document</th>
                  <th>Field</th>
                  <th>Raw Extracted</th>
                  <th>Current Value</th>
                  <th>Method / Loc</th>
                  <th>Verification State</th>
                  <th>Review Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFields.map((f) => (
                  <tr
                    key={f.id}
                    className={
                      f.presence !== 'PRESENT' || f.status === 'NEEDS_REVIEW'
                        ? 'row-highlight'
                        : undefined
                    }
                  >
                    <td className="small">{docNameById.get(f.documentId) ?? f.documentId}</td>
                    <td className="mono">
                      <strong>{f.fieldName}</strong>
                    </td>
                    <td className="mono small muted">{f.rawText ?? '—'}</td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {displayValue(f)}
                    </td>
                    <td className="mono small muted">
                      {f.extractionMethod}
                      {f.sourceOffset ? ` (${f.sourceOffset})` : ''}
                    </td>
                    <td>
                      <span className={`badge ${badgeClass(f)}`}>
                        {f.presence !== 'PRESENT' ? f.presence : f.status}
                      </span>
                    </td>
                    <td>
                      <div className="row">
                        <button
                          type="button"
                          className="small primary"
                          disabled={busyId === f.id || f.presence !== 'PRESENT'}
                          onClick={() => runVerifyAction(f, 'VERIFY', 'Human confirmed against source document')}
                        >
                          Verify
                        </button>
                        <button
                          type="button"
                          className="small"
                          disabled={busyId === f.id}
                          onClick={() => {
                            setEditingFieldId(editingFieldId === f.id ? null : f.id);
                            setCorrectValue(f.extractedValue ?? '');
                            setCorrectReason('');
                          }}
                        >
                          Correct
                        </button>
                        <button
                          type="button"
                          className="small danger"
                          disabled={busyId === f.id}
                          onClick={() => runVerifyAction(f, 'REJECT', 'Rejected as invalid or irrelevant extraction')}
                        >
                          Reject
                        </button>
                      </div>
                      {editingFieldId === f.id && (
                        <div
                          style={{
                            marginTop: '8px',
                            padding: '10px',
                            background: 'var(--surface-subtle)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                          }}
                        >
                          <div className="form-grid">
                            <input
                              type="text"
                              placeholder="Corrected value (integer minor units for money)"
                              value={correctValue}
                              onChange={(e) => setCorrectValue(e.target.value)}
                            />
                            <input
                              type="text"
                              placeholder="Audit reason for correction (required)"
                              value={correctReason}
                              onChange={(e) => setCorrectReason(e.target.value)}
                            />
                            <div className="row">
                              <button
                                type="button"
                                className="small primary"
                                disabled={busyId === f.id || !correctValue.trim() || correctReason.trim().length < 2}
                                onClick={() => runVerifyAction(f, 'CORRECT', correctReason, correctValue)}
                              >
                                Save Correction
                              </button>
                              <button type="button" className="small" onClick={() => setEditingFieldId(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
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
            <h3 style={{ margin: 0 }}>Manual Field Entry (Always Available Fallback)</h3>
            <p className="small muted" style={{ margin: '2px 0 0' }}>
              Record human-read evidence fields directly when scanned images or partial documents lack parseable text.
            </p>
          </div>
          <span className="badge info">Method: MANUAL</span>
        </div>
        <form onSubmit={handleManualAdd} className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field-group">
            <label htmlFor="manual-doc">Source Document</label>
            <select
              id="manual-doc"
              value={manualDocId || documents[0]?.id || ''}
              onChange={(e) => setManualDocId(e.target.value)}
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.documentType}: {d.originalFilename}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="manual-name">Field Name</label>
            <select
              id="manual-name"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
            >
              <option value="quantity">quantity</option>
              <option value="unit_price">unit_price (minor units, e.g. 125000)</option>
              <option value="total_amount">total_amount (minor units)</option>
              <option value="invoice_number">invoice_number</option>
              <option value="po_number">po_number</option>
              <option value="supplier_name">supplier_name</option>
              <option value="delivery_date">delivery_date</option>
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="manual-val">Value</label>
            <input
              id="manual-val"
              type="text"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="e.g. 90 or 125000"
              required
            />
          </div>
          <div className="field-group">
            <label htmlFor="manual-unit">Unit (qty)</label>
            <select
              id="manual-unit"
              value={manualUnit}
              onChange={(e) => setManualUnit(e.target.value as QuantityUnit | '')}
            >
              <option value="">(none)</option>
              <option value="UNITS">UNITS</option>
              <option value="KG">KG</option>
              <option value="LITERS">LITERS</option>
              <option value="METERS">METERS</option>
              <option value="PIECES">PIECES</option>
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="manual-curr">Currency (money)</label>
            <select
              id="manual-curr"
              value={manualCurrency}
              onChange={(e) => setManualCurrency(e.target.value as Currency | '')}
            >
              <option value="">(none)</option>
              <option value="INR">INR</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <button type="submit" className="primary" disabled={addingManual || documents.length === 0}>
            {addingManual ? 'Saving...' : 'Add Manual Field'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ margin: 0 }}>Append-Only Verification Audit Records ({verifications.length})</h3>
          <span className="badge">Immutable Trail</span>
        </div>
        {verifications.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No human verification actions recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Field ID</th>
                  <th>Transition</th>
                  <th>Previous → New</th>
                  <th>Actor</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {verifications.map((v) => (
                  <tr key={v.id}>
                    <td className="mono small muted">{v.createdAt}</td>
                    <td className="mono">{v.extractedFieldId.slice(0, 12)}</td>
                    <td className="small">
                      <span className="badge">{v.previousStatus}</span> →{' '}
                      <span className="badge ok">{v.newStatus}</span>
                    </td>
                    <td className="mono small">
                      {v.previousValue ?? 'null'} → {v.newValue ?? 'null'}
                    </td>
                    <td className="mono small">{v.verifiedBy}</td>
                    <td className="small">{v.reason}</td>
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
