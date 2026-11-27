'use client';

import { useState, type FormEvent } from 'react';
import type { DocumentType, ExtractedField, SourceDocument } from '@/core/types';
import { apiFetch } from '@/lib/api-client';

interface DocumentsPanelProps {
  caseId: string;
  documents: SourceDocument[];
  onRefresh: () => Promise<void>;
}

export function DocumentsPanel({ caseId, documents, onRefresh }: DocumentsPanelProps) {
  const [docType, setDocType] = useState<DocumentType>('SUPPORTING');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file (PDF, PNG, JPG, CSV, or TXT).');
      return;
    }
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append('documentType', docType);
      formData.append('file', file);

      const res = await apiFetch<{
        document: SourceDocument;
        fields: ExtractedField[];
        warning: string | null;
      }>(`/api/v1/cases/${encodeURIComponent(caseId)}/documents`, {
        method: 'POST',
        body: formData,
      });

      const msg =
        `Uploaded ${res.document.originalFilename} (${res.fields.length} field(s) extracted).` +
        (res.warning ? ` Note: ${res.warning}` : '');
      setNotice(msg);
      setFile(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="card">
        <h3>Upload Source Document</h3>
        <p className="small muted">
          Accepted formats: PDF, PNG, JPG/JPEG, CSV, TXT (max 10 MB). Files are magic-byte verified,
          hashed (SHA-256), and stored outside the web root.
        </p>

        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert info">{notice}</div>}

        <form onSubmit={handleUpload} className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field-group">
            <label htmlFor="doc-type-select">Document Type</label>
            <select
              id="doc-type-select"
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocumentType)}
            >
              <option value="PURCHASE_ORDER">Purchase Order</option>
              <option value="INVOICE">Invoice</option>
              <option value="DELIVERY_RECORD">Delivery Record (GRN)</option>
              <option value="SUPPORTING">Supporting Document</option>
            </select>
          </div>

          <div className="field-group" style={{ flex: 1, minWidth: '220px' }}>
            <label htmlFor="doc-file-input">File</label>
            <input
              id="doc-file-input"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.csv,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <button type="submit" className="primary" disabled={uploading}>
            {uploading ? 'Uploading & Extracting...' : 'Upload & Extract'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Preserved Source Documents ({documents.length})</h3>
        {documents.length === 0 ? (
          <p className="muted">No source documents uploaded yet for this investigation.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Filename</th>
                  <th>MIME / Size</th>
                  <th>SHA-256</th>
                  <th>Uploaded At</th>
                  <th>Original File</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <span className="badge">{doc.documentType}</span>
                    </td>
                    <td>{doc.originalFilename}</td>
                    <td className="small muted">
                      {doc.mimeType} ({doc.sizeBytes} B)
                    </td>
                    <td className="mono">{doc.sha256.slice(0, 16)}…</td>
                    <td className="small muted">{doc.uploadedAt}</td>
                    <td>
                      <a
                        className="btn small"
                        href={`/api/v1/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(doc.id)}/download`}
                      >
                        Download
                      </a>
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
