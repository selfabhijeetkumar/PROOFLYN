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

interface FieldsVerificationPanelProps {
  caseId: string;
  documents: SourceDocument[];
  fields: ExtractedField[];
  verifications: VerificationRecord[];
  onRefresh: () => Promise<void>;
}

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

  const badgeClass = (status: ExtractedField['status']) => {
    if (status === 'VERIFIED' || status === 'CORRECTED') return 'ok';
    if (status === 'REJECTED') return 'danger';
    if (status === 'NEEDS_REVIEW') return 'warn';
    return 'info';
  };

  const displayValue = (f: ExtractedField) => {
    if (f.presence !== 'PRESENT') return `[${f.presence}]`;
    if ((f.fieldName === 'unit_price' || f.fieldName === 'total_amount') && f.numericValue !== null) {
      return `${formatMinorMoney(f.numericValue, f.currency)} (minor: ${f.numericValue})`;
    }
    return `${f.extractedValue ?? '—'}${f.unit ? ` ${f.unit}` : ''}`;
  };

  return (
    <div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <div className="card">
        <h3>Extracted vs Verified Fields ({fields.length})</h3>
        <p className="small muted">
          Extracted values are never treated as verified until a human confirms or corrects them.
          Original raw extracted text is always preserved alongside verification history.
        </p>

        {fields.length === 0 ? (
          <p className="muted">No extracted fields yet. Upload a document or add a manual field below.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Field</th>
                  <th>Raw Extracted</th>
                  <th>Current Value</th>
                  <th>Method / Loc</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.id}>
                    <td className="small">{docNameById.get(f.documentId) ?? f.documentId}</td>
                    <td className="mono">{f.fieldName}</td>
                    <td className="small muted">{f.rawText ?? '—'}</td>
                    <td>{displayValue(f)}</td>
                    <td className="small muted">
                      {f.extractionMethod}
                      {f.sourceOffset ? ` (${f.sourceOffset})` : ''}
                    </td>
                    <td>
                      <span className={`badge ${badgeClass(f.status)}`}>{f.status}</span>
                    </td>
                    <td>
                      <div className="row">
                        <button
                          type="button"
                          disabled={busyId === f.id || f.presence !== 'PRESENT'}
                          onClick={() => runVerifyAction(f, 'VERIFY', 'Human confirmed against source document')}
                        >
                          Verify
                        </button>
                        <button
                          type="button"
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
                          className="danger"
                          disabled={busyId === f.id}
                          onClick={() => runVerifyAction(f, 'REJECT', 'Rejected as invalid or irrelevant extraction')}
                        >
                          Reject
                        </button>
                      </div>
                      {editingFieldId === f.id && (
                        <div style={{ marginTop: '8px', padding: '8px', background: 'var(--surface-muted)', borderRadius: '4px' }}>
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
                                className="primary"
                                disabled={busyId === f.id || !correctValue.trim() || correctReason.trim().length < 2}
                                onClick={() => runVerifyAction(f, 'CORRECT', correctReason, correctValue)}
                              >
                                Save Correction
                              </button>
                              <button type="button" onClick={() => setEditingFieldId(null)}>
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
        <h3>Manual Field Entry (Always Available Fallback)</h3>
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
        <h3>Append-Only Verification Audit Records ({verifications.length})</h3>
        {verifications.length === 0 ? (
          <p className="muted">No human verification actions recorded yet.</p>
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
                    <td className="small muted">{v.createdAt}</td>
                    <td className="mono">{v.extractedFieldId.slice(0, 12)}</td>
                    <td className="small">
                      {v.previousStatus} → {v.newStatus}
                    </td>
                    <td className="small">
                      {v.previousValue ?? 'null'} → {v.newValue ?? 'null'}
                    </td>
                    <td className="mono">{v.verifiedBy}</td>
                    <td>{v.reason}</td>
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
