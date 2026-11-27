'use client';

import { useState, type FormEvent } from 'react';
import type { DocumentType, ExtractedField, SourceDocument } from '@/core/types';
import { apiFetch } from '@/lib/api-client';
import { DownloadIcon, FileAuditIcon } from './Icons';

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
        <div className="card-header">
          <div>
            <div className="row" style={{ marginBottom: '4px' }}>
              <FileAuditIcon size={15} />
              <h3 style={{ margin: 0 }}>Upload Source Document</h3>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Accepted formats: PDF, PNG, JPG/JPEG, CSV, TXT (max 10 MB). Files are magic-byte verified,
              hashed (SHA-256), and stored outside the web root.
            </p>
          </div>
          <span className="badge ok">Magic-Byte &amp; SHA-256 Verified</span>
        </div>

        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert info">{notice}</div>}

        <form onSubmit={handleUpload} className="upload-zone row" style={{ alignItems: 'flex-end' }}>
          <div className="field-group">
            <label htmlFor="doc-type-select">Document Classification</label>
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

          <div className="field-group" style={{ flex: 1, minWidth: '240px' }}>
            <label htmlFor="doc-file-input">Source Artifact File</label>
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
        <div className="card-header">
          <h3 style={{ margin: 0 }}>Preserved Source Documents ({documents.length})</h3>
          <span className="badge info">Immutable Originals</span>
        </div>
        {documents.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No source documents uploaded yet for this investigation.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document Type</th>
                  <th>Original Filename</th>
                  <th>MIME / Size</th>
                  <th>SHA-256 Digest</th>
                  <th>Uploaded Timestamp</th>
                  <th className="text-right">Original File</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <span className="badge info">{doc.documentType}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{doc.originalFilename}</td>
                    <td className="mono small muted">
                      {doc.mimeType} • {doc.sizeBytes.toLocaleString()} B
                    </td>
                    <td className="mono small">{doc.sha256.slice(0, 18)}…</td>
                    <td className="mono small muted">{doc.uploadedAt}</td>
                    <td className="text-right">
                      <a
                        className="btn small"
                        href={`/api/v1/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(doc.id)}/download`}
                      >
                        <DownloadIcon size={13} />
                        <span>Download</span>
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
