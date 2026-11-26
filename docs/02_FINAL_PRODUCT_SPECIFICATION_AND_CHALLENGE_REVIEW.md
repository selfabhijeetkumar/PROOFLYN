# PROOFLYN — Final Product Specification and Adversarial Challenge Review

**PROOFLYN** — *Every Transaction Has a Story. Every Claim Has Proof.*
An MCP-powered Evidence Intelligence Agent for B2B Invoice Dispute Investigation (Track 1 — Make MCP Matter).

## 1. End-to-End Workflow & Roles

1. **Workflow**: Create Case → Upload Source Documents (PO, Invoice, Delivery Record, Supporting) → Layered Extraction (`PDF_TEXT` / `CSV_PARSE` / optional `AI_VISION` / `MANUAL`) → Human Review & Verification (Confirm / Correct / Reject; originals preserved + append-only `VerificationRecord`) → Deterministic Cross-Document Reconciliation (`R-QTY-01`, `R-QTY-02`, `R-PRC-01`, `R-DUP-01`, `R-DLV-01`, `R-DLV-02`, `R-DOC-01`, `R-CUR-01`, `R-VER-01`) → Discrepancies + Evidence Gaps + Confidence Ladder + Coverage Ratio + Payment Blockers → Explainable Evidence Graph + Hash-Chained Investigation Events → Dispute-Ready Evidence Pack (JSON + HTML download + Follow-Up Drafts) + Live MCP Tool-Call Audit Panel.
2. **Minimum Roles (2)**:
   - **Investigator** (`INVESTIGATOR`): create cases, upload documents, run extraction, enter/verify/correct/reject fields, run reconciliation via MCP, view graph/timeline/MCP logs, generate evidence packs and follow-up drafts.
   - **Reviewer** (`REVIEWER`): all Investigator inspection actions plus human verification, acknowledging/resolving payment blockers, and finalizing/closing investigations.

## 2. Adversarial Challenge Review (Skeptical Perspectives)

| Perspective | Core Challenge | PROOFLYN Answer & Architectural Guarantee | Classification |
|---|---|---|---|
| **MCP Expert / Judge** | Why is MCP essential instead of a direct REST controller? | Investigation capabilities (`get_case_context`, `reconcile_case_records`, `detect_evidence_gaps`, `assess_payment_blockers`, `get_evidence_graph`, `generate_evidence_report`) run as a standalone stdio MCP server usable by external MCP clients (Inspector/Claude Desktop) AND by the web app via `McpGateway` (`StdioClientTransport`), sharing `core/` with zero business-logic duplication. | ALREADY IMPLEMENTED (design) / ACCEPT FOR MVP (M3) |
| **B2B Finance Manager** | How does this differ from OCR + a two-number invoice diff? | PROOFLYN separates `extracted` vs `verified` fields, preserves source hashes and page/offset citations, never treats missing delivery records as zero/non-delivery (`R-DLV-01`), builds an explicit Evidence Graph linking every finding to a `rule_id`, and surfaces advisory Payment Blockers with concrete resolution steps. | ACCEPT FOR MVP |
| **Security Reviewer** | How are bad extractions corrected and fabricated evidence prevented? | Corrections never overwrite `rawText` or delete `SourceDocument`s; every review appends an immutable `VerificationRecord` and hash-chained `InvestigationEvent`. Uploads check extensions + magic bytes + 10 MB cap + UUID storage outside `public/` + SHA-256. Every MCP call validates strict Zod schemas and case/org membership. | ACCEPT FOR MVP |
| **Enterprise Architect** | What happens when an AI model or MCP server fails? | Deterministic rules in `core/` have zero LLM dependency; optional Gemini vision fails gracefully to manual entry. `McpGateway` enforces a 15 s timeout, attempts 1 reconnect on transport close, logs `ERROR`/`TIMEOUT` in `mcp_tool_calls`, and returns structured errors without fake success. | ACCEPT FOR MVP |
| **QA Engineer** | How are conclusions grounded and conflicting records handled? | Money uses integer minor units; quantities use integers + unit; `MISSING`/`INVALID` inputs refuse arithmetic; conflicting units/currencies emit `R-CUR-01`; per-finding confidence (`VERIFIED`, `SUPPORTED_UNVERIFIED`, `CONFLICTED`, `INSUFFICIENT`) avoids arbitrary percentages; identical input snapshots return idempotent runs/reports. | ACCEPT FOR MVP |
| **Customer** | What is cleanly demonstrable tomorrow morning? | Synthetic case `INV-1047` (PO 100, Invoice 100 @ 1,250.00 INR, Delivery 90) demonstrates the full clickable journey + 10-unit / 12,500.00 INR illustration variance + downloadable Dispute-Ready Evidence Pack + real MCP Evidence panel + live external MCP Inspector attachment. | ACCEPT FOR MVP |
| **Scope Gate** | ERP integrations, auto-payments, email sending, visual polish | Zoho/Tally/Gmail/payment execution/auto-dispute emails are excluded; visual design is frozen behind CSS variables; PDF binary export / image OCR are optional or deferred if external deps unavailable. | REJECT / DEFER |
