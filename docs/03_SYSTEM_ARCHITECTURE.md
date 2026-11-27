# PROOFLYN — System Architecture

> Modular Monolith | Node.js `v26.13.1` | Next.js `15.5.29` (Node Runtime) | SQLite (`node:sqlite`, WAL) | `@modelcontextprotocol/sdk@1.32.2`

## 1. Layer Boundaries (Single Source of Business Truth)

```
+-------------------------------------------------------------------+
| Frontend (Next.js App Router, React 19, Frozen Neutral CSS Tokens)|
| - Consumes REST /api/v1/* ONLY; escapes all text; zero raw HTML   |
+----------------------------------+--------------------------------+
                                   | HTTP (httpOnly cookie session)
                                   v
+-------------------------------------------------------------------+
| Server Layer (src/server/, src/app/api/v1/)                       |
| - Auth, RBAC (INVESTIGATOR / REVIEWER), org/case scoping          |
| - Secure upload (magic bytes, 10MB cap, UUID storage outside web) |
| - Layered extraction (MANUAL / PDF_TEXT / CSV_PARSE / opt Vision) |
| - InvestigationService + Repositories (src/server/repositories/)  |
| - McpGateway singleton (src/mcp/gateway.ts, globalThis cached)    |
+-------------------+-----------------------------+-----------------+
                    |                             |
                    | Direct service calls        | Stdio JSON-RPC
                    | (CRUD / upload / verify)    | (@modelcontextprotocol/sdk)
                    v                             v
+-------------------+--------------+   +----------+------------------+
| Repositories (src/server/        |   | MCP Server (src/mcp/server.ts|
|   repositories/)                 |   | - 6 Zod-validated tools     |
| - SQLite WAL (node:sqlite)       |<--+ - Calls same service/core   |
| - Hash-chained events            |   | - Logs all calls to DB      |
| - Idempotent runs & reports      |   | - External client ready     |
+-------------------+--------------+   +----------+------------------+
                    |                             |
                    +--------------+--------------+
                                   |
                                   v
+-------------------------------------------------------------------+
| Core Domain Engine (src/core/) — PURE TypeScript, ZERO I/O        |
| - reconciliation.ts (R-QTY-01/02, R-PRC-01, R-DUP-01, R-DLV-02,   |
|   R-CUR-01)                                                       |
| - evidence-gaps.ts (R-DLV-01, R-DOC-01, R-VER-01, coverage,       |
|   confidence ladder)                                              |
| - payment-blockers.ts (advisory blockers with resolution steps)   |
| - evidence-graph.ts (nodes & edges with rule_id + provenance)     |
| - report-builder.ts (Dispute-Ready Evidence Pack JSON + HTML)     |
| - crypto.ts (SHA-256, canonical hashObject, event hash chain)     |
+-------------------------------------------------------------------+
```

## 2. Why This Architecture Enforces PROOFLYN Guarantees

1. **Zero Business Logic Duplication**: Both REST workflows and external MCP clients invoke `src/core/` via `src/server/services/investigation-service.ts` and repositories.
2. **Real MCP in Production Path**: Investigation actions (`get_case_context`, `reconcile_case_records`, `detect_evidence_gaps`, `assess_payment_blockers`, `get_evidence_graph`, `generate_evidence_report`) route through `McpGateway` over `StdioClientTransport` to `src/mcp/server.ts`, logging every invocation in `mcp_tool_calls`.
3. **Model Independence**: `src/core/` is 100% deterministic. Optional Gemini extraction never alters verified financial fields or blocks investigation when offline.
4. **Tamper-Evident Auditability**: Uploaded files live outside `public/` under generated UUID names with SHA-256 checksums. Every case mutation appends a hash-chained `investigation_events` record. `VerificationRecord` is append-only.
