# PROOFLYN
### An MCP-Powered Evidence Intelligence Agent for B2B Invoice Dispute Investigation

> **Every Transaction Has a Story. Every Claim Has Proof.**

**PROOFLYN** investigates delayed or disputed B2B invoices by connecting Purchase Orders, Vendor Invoices, and Delivery Records (GRNs) through deterministic reconciliation rules, source-linked human verification, real Model Context Protocol (`MCP`) tool execution over `stdio`, hash-chained audit logs, and immutable Dispute-Ready Evidence Packs.

Built for **wHACKiest 2026** (*Track 1: Make MCP Matter*).

---

## Problem Statement

B2B suppliers, buyers, and MSME finance teams routinely deal with delayed payments and invoice disputes where critical records are scattered across POs, invoices, goods received notes, and spreadsheets. Manually reconstructing what happened is slow, error-prone, and difficult to defend without cryptographic provenance, clear distinction between missing evidence and proven discrepancies, and human sign-off.

---

## Main Capabilities

- **3-Way Deterministic Reconciliation Engine (`src/core/`):** Pure TypeScript business logic with zero I/O implementing 9 versioned rules (`R-QTY-01`, `R-QTY-02`, `R-PRC-01`, `R-DUP-01`, `R-DLV-01`, `R-DLV-02`, `R-DOC-01`, `R-CUR-01`, `R-VER-01`). Money uses integer minor units + ISO currency codes; missing inputs are explicitly modeled (`PRESENT` / `MISSING` / `INVALID`) and never treated as zero.
- **Real `stdio` MCP Server & Client Gateway (`src/mcp/`):** Six Zod-validated tools executed over JSON-RPC `StdioServerTransport`, persisted in `mcp_tool_calls` with SHA-256 input/output hashes, timeout handling (`15s`), and one automatic reconnect.
- **Secure Document Ingestion & Honest Layered Extraction (`src/server/`):** Extension allowlist (`.pdf`, `.png`, `.jpg`/`.jpeg`, `.csv`, `.txt`), magic-byte inspection, executable/archive rejection, `10 MB` size cap, UUID storage outside `public/`, and layered extraction (`PDF_TEXT` via `pdf-parse`, `CSV_PARSE`, `MANUAL` fallback, and optional `AI_VISION` gated on `GEMINI_API_KEY`).
- **Human Verification & Append-Only Audit Trail:** Extracted fields remain separated from verified records; `VerificationRecord` entries preserve original `rawText`; every case mutation appends to a SHA-256 hash-chained `investigation_events` ledger with `verifyEventChain()`.
- **Evidence Gaps, Coverage & Advisory Payment Blockers:** Categorical confidence ladder (`VERIFIED` -> `SUPPORTED_UNVERIFIED` -> `CONFLICTED` -> `INSUFFICIENT`), bounded slot coverage (`verified / 14`), explainable provenance graph (`get_evidence_graph`), and advisory-only payment blockers gated by `REVIEWER` RBAC.
- **Dispute-Ready Evidence Pack & Drafts:** Reproducible report snapshots (`snapshotHash`), escaped HTML and JSON downloads, MCP tool-call evidence appendix, and draft-only vendor follow-up questions (never auto-sent).
- **Architectural Ledger B2B UI:** Clean financial workbench (`AppShell` sidebar, Dashboard spotlight, live 3-Way Match Matrix on `INV-1047`, verification filters, SVG provenance graph, timeline/MCP audit logs, and Evidence Pack preview).

---

## Technology Stack

- **Framework & Language:** Next.js `15.5.29` (App Router, Node.js runtime), React `19.3.1`, TypeScript `5.9.3`
- **Database:** Local SQLite (`node:sqlite` `DatabaseSync` in `WAL` mode) with versioned SQL migrations (`src/db/schema.ts`) behind `InvestigationRepository`
- **MCP Integration:** `@modelcontextprotocol/sdk@1.32.2` (`McpServer` + `StdioServerTransport` / `StdioClientTransport`) + `zod@3.25.76`
- **Parsing & Testing:** `pdf-parse@1.1.4`, `vitest@3.2.7`, `eslint@9.39.5`

---

## MCP Architecture & Six Tools

Both the Next.js API routes (via `McpGateway` in `src/mcp/gateway.ts`) and external `stdio` clients share the same MCP entrypoint (`src/mcp/server.ts`) calling `src/core/` via `InvestigationService`:

| Tool | Purpose | Key Input |
|---|---|---|
| `get_case_context` | Read case metadata, documents, parties, verified/unverified records, and references | `caseId`, `actorId` |
| `reconcile_case_records` | Execute deterministic 3-way reconciliation; creates immutable idempotent `ReconciliationRun` | `caseId`, `actorId`, optional `recordIds` |
| `detect_evidence_gaps` | Identify missing/unverified evidence, confidence ladder levels, and bounded slot coverage | `caseId`, `actorId` |
| `assess_payment_blockers` | Evaluate advisory rule-backed payment blockers and required resolutions | `caseId`, `actorId` |
| `get_evidence_graph` | Build and persist provenance graph linking case -> documents -> fields -> discrepancies/gaps | `caseId`, `actorId` |
| `generate_evidence_report` | Generate reproducible JSON + HTML Dispute-Ready Evidence Pack snapshot | `caseId`, `actorId`, optional `includeHtml` |

All MCP server logs write exclusively to `stderr` with secret redaction (`redactValue`) so `stdout` carries clean JSON-RPC protocol frames only.

---

## Local Setup

### 1. Prerequisites

- Node.js (tested on Node `v26.13.1` with built-in `node:sqlite`)
- `pnpm` (`pnpm@9.12.2` or compatible) or `npm`

### 2. Install Dependencies

```powershell
pnpm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your local demo values:

```env
# Database & Uploads (gitignored)
DATABASE_PATH=./data/prooflyn.db
UPLOAD_DIR=./uploads

# MCP Server
MCP_TRANSPORT=stdio
MCP_SERVER_PORT=3001
MCP_AUTH_TOKEN=change-me-in-production

# Seeded Demo Accounts (placeholders — set strong local passwords in .env)
DEMO_INVESTIGATOR_EMAIL=investigator@prooflyn.dev
DEMO_INVESTIGATOR_PASSWORD=change-me
DEMO_REVIEWER_EMAIL=reviewer@prooflyn.dev
DEMO_REVIEWER_PASSWORD=change-me

# Guarded Local Hackathon Convenience Mode (loopback only; disabled by default)
PROOFLYN_LOCAL_DEMO_MODE=false

# Session Signing Secret
SESSION_SECRET=change-this-to-a-random-string

# Optional: Gemini API key for AI-assisted image extraction (not required for core demo)
# GEMINI_API_KEY=
```

> **Note:** Setting `PROOFLYN_LOCAL_DEMO_MODE=true` in `.env` allows `http://localhost:3000` to automatically establish a signed `HttpOnly` session for the seeded `INVESTIGATOR` account on strict loopback requests (`localhost` / `127.0.0.1`) so demo judges are not blocked by a login screen. Protected `/api/v1/cases*` routes still require valid session cookies, and the mode is blocked in deployed environments and non-loopback requests.

---

## Running Locally & Loading the Synthetic `INV-1047` Demo

Stop any running PROOFLYN server first, then reset and seed synthetic demo fixtures:

```powershell
npm run demo:reset
```

This creates the SQLite schema, writes deterministic synthetic PDFs (explicitly labeled **SYNTHETIC — FOR DEMONSTRATION PURPOSES ONLY**), and seeds:
- **`INV-1047`** (*TechCorp Solutions Industrial Valves Q4 Dispute*): PO `100 UNITS @ INR 1,250.00`, Invoice `100 UNITS @ INR 1,250.00`, Delivery Record `GRN-2026-001` `90 UNITS` -> deterministic `R-QTY-01` `10`-unit discrepancy (`INR 12,500.00` computed illustration).
- Additional edge-case demo fixtures: `INV-2001` (Missing Delivery), `INV-2002` (Duplicate Invoice), and `INV-2003` (Partial Delivery).

Start the development or production server:

```powershell
npm run dev
# OR after building:
npm run build
npm run start
```

Open `http://localhost:3000` and see [docs/08_JUDGES_DEMO_SCRIPT.md](./docs/08_JUDGES_DEMO_SCRIPT.md) for the step-by-step walkthrough.

---

## Tests & Verification

Run the unified verification pipeline (ensure no server is holding `data/prooflyn.db` locked during `demo:reset`):

```powershell
npm run verify
```

Individual commands:

```powershell
npm run typecheck   # TypeScript check (tsc --noEmit)
npm run lint        # ESLint (eslint src)
npm test            # Vitest suite (core unit tests + REST/upload/MCP + security/reliability)
npm run mcp:smoke   # Real stdio MCP client discovery + schema validation + all 6 tools on INV-1047
npm run build       # Production Next.js build
```

---

## Known Limitations

- Single-node local SQLite persistence (`WAL` mode) and in-memory fixed-window rate limiter; scaling horizontally would require swapping `InvestigationRepository` / rate limiting to PostgreSQL + Redis.
- Without `GEMINI_API_KEY`, uploaded raster images (`.png`, `.jpg`) store cleanly and emit a warning directing operators to `MANUAL` field entry; scanned image-only PDFs without embedded text likewise require `MANUAL` entry.
- `PROOFLYN_LOCAL_DEMO_MODE=true` opens directly as `INVESTIGATOR`; demonstrating `REVIEWER`-only payment blocker acknowledgment/resolution requires clicking **Switch Account / Sign Out** and signing in with `DEMO_REVIEWER_EMAIL`.
- External `@modelcontextprotocol/inspector` CLI attachment and interactive Chrome/Playwright click-through remain unverified in the offline environment; protocol compliance is verified via `npm run mcp:smoke`. See [docs/09_KNOWN_LIMITATIONS.md](./docs/09_KNOWN_LIMITATIONS.md).

---

## Documentation Index

- Architecture & Data Contracts: [docs/03_SYSTEM_ARCHITECTURE.md](./docs/03_SYSTEM_ARCHITECTURE.md), [docs/04_DATA_MODEL_AND_API_CONTRACTS.md](./docs/04_DATA_MODEL_AND_API_CONTRACTS.md)
- Testing & Security Report: [docs/06_TESTING_AND_SECURITY_REPORT.md](./docs/06_TESTING_AND_SECURITY_REPORT.md)
- Design Handoff & UI Notes: [docs/07_DESIGN_HANDOFF.md](./docs/07_DESIGN_HANDOFF.md)
- Judges Demo Script: [docs/08_JUDGES_DEMO_SCRIPT.md](./docs/08_JUDGES_DEMO_SCRIPT.md)
- Known Limitations & Final Acceptance: [docs/09_KNOWN_LIMITATIONS.md](./docs/09_KNOWN_LIMITATIONS.md), [docs/10_FINAL_ACCEPTANCE_REPORT.md](./docs/10_FINAL_ACCEPTANCE_REPORT.md)
