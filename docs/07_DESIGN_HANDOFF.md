# PROOFLYN — Design Handoff (Frozen Functional UI → Morning Design Pass)

> **Status:** Functional prototype complete; visual design intentionally frozen behind CSS custom properties in `src/app/globals.css`.  
> **Rule:** Tomorrow's design pass MUST NOT modify business logic in `src/core/`, `src/server/`, `src/mcp/`, or API contracts in `src/app/api/v1/`.

---

## 1. Screens & Existing Components

| Screen / View | Route / Component | API Endpoints Consumed |
|---|---|---|
| Sign-In Gate, Dashboard, Investigation List, Create Investigation | `src/app/page.tsx`, `src/components/TopBar.tsx` | `GET /api/v1/auth/me`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/cases`, `POST /api/v1/cases` |
| Case Workspace Shell & Summary Header | `src/app/cases/[id]/page.tsx`, `src/components/CaseWorkspace.tsx` | `GET /api/v1/cases/:id` |
| Document Upload & Preserved Originals | `src/components/DocumentsPanel.tsx` | `POST /api/v1/cases/:id/documents`, `GET /api/v1/cases/:id/documents/:docId/download` |
| Extraction Review, Human Verification & Manual Entry | `src/components/FieldsVerificationPanel.tsx` | `GET /api/v1/cases/:id/fields`, `POST /api/v1/cases/:id/fields`, `PATCH /api/v1/cases/:id/fields/:fieldId/verify` |
| Reconciliation, Discrepancies, Evidence Gaps, Coverage & Payment Blockers | `src/components/ReconciliationPanel.tsx` | `POST /api/v1/cases/:id/reconcile`, `GET /api/v1/cases/:id/discrepancies`, `GET /api/v1/cases/:id/gaps`, `GET /api/v1/cases/:id/blockers`, `PATCH /api/v1/cases/:id/blockers/:blockerId` |
| Explainable Evidence Graph Explorer | `src/components/EvidenceGraphPanel.tsx` | `GET /api/v1/cases/:id/graph` |
| Transaction Memory Timeline & Hash Chain | `src/components/TimelineAndMcpPanel.tsx` (`TimelinePanel`) | `GET /api/v1/cases/:id/timeline` |
| MCP Evidence Audit Panel | `src/components/TimelineAndMcpPanel.tsx` (`McpEvidencePanel`) | `GET /api/v1/cases/:id/mcp-calls` |
| Dispute-Ready Evidence Pack Preview, Download & Follow-Up Drafts | `src/components/ReportPackPanel.tsx` | `GET /api/v1/cases/:id/reports`, `POST /api/v1/cases/:id/reports`, `GET /api/v1/cases/:id/reports/:reportId/download?format=json\|html`, `GET/POST /api/v1/cases/:id/follow-up-drafts` |

---

## 2. CSS Design Tokens (`src/app/globals.css`)

All surface, text, semantic status (`--ok-*`, `--warn-*`, `--danger-*`, `--info-*`), font (`--font-sans`, `--font-mono`), radius, and spacing tokens are isolated in `:root` in `src/app/globals.css`.

---

## 3. Deferred Visual Decisions (Morning Session)

1. Final brand palette, dark/light theme polarity, typography pairing, and PROOFLYN logomark.
2. Evidence Graph polish (interactive pan/zoom/collapse layout or `@xyflow/react` upgrade if desired — currently a zero-dependency layered SVG + provenance adjacency inspector).
3. Case workspace layout refinement (e.g., side-by-side source PDF preview alongside extracted/verified field verification).
4. Print/branded styling for downloaded HTML Dispute-Ready Evidence Packs (`generateReportHtml` in `src/core/report-builder.ts`).

---

## 4. Items Needing User Approval Before Design Pass

- Brand color palette and visual direction (corporate audit slate vs high-contrast forensic).
- Whether to install an external graph/UI icon library (`lucide-react` or `@xyflow/react`) or keep zero extra UI dependencies.
