# PROOFLYN — Data Model, Rule Catalog, and API Contracts

## 1. Data Model (SQLite WAL — Migrations `001` & `002`)

| Table | Primary Key | Key Foreign Keys & Constraints | Purpose / Integrity Rule |
|---|---|---|---|
| `organizations` | `id` | — | Tenant isolation boundary |
| `users` | `id` | `organization_id → organizations`, `email UNIQUE`, `role IN ('INVESTIGATOR','REVIEWER')` | Seeded local accounts (scrypt password hash) |
| `investigation_cases` | `id` | `organization_id → organizations`, `created_by → users`, `case_number UNIQUE` | Tracks case lifecycle `CREATED`..`CLOSED` |
| `parties` | `id` | `case_id → investigation_cases`, `role IN ('BUYER','SUPPLIER')` | Counterparties per dispute |
| `source_documents` | `id` | `case_id → investigation_cases`, `uploaded_by → users` | Metadata + `sha256` + UUID `storage_path` outside web root |
| `purchase_orders`, `invoices`, `delivery_records` | `id` | `case_id → investigation_cases`, `source_document_id → source_documents` | Structured commercial record views synced from documents |
| `extracted_fields` | `id` | `document_id → source_documents`, `case_id → investigation_cases` | `presence IN ('PRESENT','MISSING','INVALID')`; `status IN ('EXTRACTED','NEEDS_REVIEW','VERIFIED','CORRECTED','REJECTED')`; integer minor units |
| `verification_records` | `id` | `extracted_field_id → extracted_fields`, `verified_by → users` | Append-only audit of every human confirm/correct/reject |
| `reconciliation_runs` | `id` | `case_id`, `previous_run_id`, `UNIQUE(case_id, input_snapshot_hash, rules_version)` | Immutable + idempotent per input snapshot |
| `discrepancies` | `id` | `reconciliation_run_id`, `case_id` | Deterministic findings linked to `rule_id`, doc IDs, field IDs |
| `evidence_gaps` | `id` | `case_id`, `reconciliation_run_id` | Missing doc/field/unverified/conflict gaps |
| `payment_blockers` | `id` | `case_id`, `reconciliation_run_id`, `status IN ('OPEN','ACKNOWLEDGED','RESOLVED')` | Advisory blockers only; humans change status |
| `confidence_assessments` | `id` | `case_id`, `reconciliation_run_id` | `VERIFIED`, `SUPPORTED_UNVERIFIED`, `CONFLICTED`, `INSUFFICIENT` |
| `evidence_items` | `id` | `case_id`, `source_document_id`, `extracted_field_id` | Normalized evidence references |
| `evidence_relationships` | `id` | `case_id` | Graph edges with `rule_id` and `source_reference` |
| `investigation_events` | `id` | `case_id` | Append-only hash chain (`previous_event_hash`, `event_hash`) |
| `mcp_tool_calls` | `id` | `case_id` | Audit log of every MCP tool invocation (`SUCCESS`/`ERROR`/`TIMEOUT`) |
| `reports` | `id` | `case_id`, `reconciliation_run_id`, `UNIQUE(case_id, reconciliation_run_id, snapshot_hash)` | Immutable JSON + on-demand HTML pack |
| `follow_up_drafts` | `id` | `case_id`, `report_id` | Draft vendor/warehouse questions (never auto-sent) |

## 2. Deterministic Rule Catalog (`RULES_VERSION = "1.0.0"`)

- `R-QTY-01`: Invoice qty > sum of delivered qty → `QUANTITY_MISMATCH`; `variance = invoiceQty - deliveredQty`; illustration `variance * invoiceUnitPrice`.
- `R-QTY-02`: PO qty != Invoice qty → `QUANTITY_MISMATCH`.
- `R-PRC-01`: PO unit price != Invoice unit price (both `PRESENT`, non-`REJECTED`, matching currency) → `PRICE_MISMATCH`.
- `R-DUP-01`: Duplicate supplier + invoice number across invoice documents → `DUPLICATE_INVOICE`.
- `R-DLV-01`: No delivery record → `EvidenceGap` (`MISSING_DOCUMENT`), never treated as 0 delivered or proof of non-delivery.
- `R-DLV-02`: Total delivered qty < PO qty → `PARTIAL_DELIVERY`.
- `R-DOC-01`: Missing PO/Invoice or mandatory field `MISSING`/`INVALID` → `EvidenceGap`.
- `R-CUR-01`: Multiple currencies or incompatible quantity units across documents → `CURRENCY_MISMATCH` warning; blocks arithmetic comparison across differing currencies/units.
- `R-VER-01`: Material fields not `VERIFIED`/`CORRECTED` → lowers confidence to `SUPPORTED_UNVERIFIED` and raises advisory blocker.

## 3. REST API Contracts (`/api/v1/...`)

All responses use `{ success: true, data }` or `{ success: false, error: { code, message, details? } }`. No stack traces leaked.

- `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
- `GET /api/v1/cases`, `POST /api/v1/cases`, `GET /api/v1/cases/:id`
- `GET /api/v1/cases/:id/documents`, `POST /api/v1/cases/:id/documents` (multipart upload, magic bytes check), `GET /api/v1/cases/:id/documents/:docId/download`
- `GET /api/v1/cases/:id/fields`, `POST /api/v1/cases/:id/fields` (manual entry), `PATCH /api/v1/cases/:id/fields/:fieldId/verify` (confirm/correct/reject + `VerificationRecord`)
- `POST /api/v1/cases/:id/reconcile` (executes via `McpGateway`: `reconcile_case_records`, `detect_evidence_gaps`, `assess_payment_blockers`)
- `GET /api/v1/cases/:id/discrepancies`, `GET /api/v1/cases/:id/gaps`, `GET /api/v1/cases/:id/blockers`, `PATCH /api/v1/cases/:id/blockers/:blockerId`
- `GET /api/v1/cases/:id/graph` (via `McpGateway` `get_evidence_graph`)
- `GET /api/v1/cases/:id/timeline` (events + `verifyEventChain` status)
- `GET /api/v1/cases/:id/mcp-calls`
- `GET /api/v1/cases/:id/reports`, `POST /api/v1/cases/:id/reports` (via `McpGateway` `generate_evidence_report`), `GET /api/v1/cases/:id/reports/:reportId/download?format=json|html`
- `GET /api/v1/cases/:id/follow-up-drafts`, `POST /api/v1/cases/:id/follow-up-drafts`
