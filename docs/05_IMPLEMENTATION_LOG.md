# PROOFLYN — Implementation Log

> Running factual log of build milestones, verification outputs, and MCP tool-call evidence.

## 2026-11-27T03:50+05:30 — M0, M1 & M2 Complete

- **M0 Reconciled**: Audited workspace and previous interrupted runs (`claude-opus-4-6-thinking`, `claude-sonnet-4-6`). Verified `context7` MCP server (`resolve-library-id`, `query-docs` on `@modelcontextprotocol/sdk@1.32.2`) and `127.0.0.1:8200` OpenWhispr probe (401 auth required, not relevant). Created `00_ENVIRONMENT_SKILLS_MCP_ACTIVATION.md`, `01_WORKSPACE_AND_SOURCE_AUDIT.md`, `02_FINAL_PRODUCT_SPECIFICATION_AND_CHALLENGE_REVIEW.md`, `05_DECISION_REGISTER.md`, and `.gsd/SPEC.md` (`FINALIZED`).
- **M1 Fixed & Verified**: Replaced unbuildable `better-sqlite3` (Node v26 ABI v147 without MSVC) with built-in `node:sqlite` (`DatabaseSync`) via `src/db/sqlite.ts`. Added migration `002_domain_entities_and_idempotency` (`purchase_orders`, `invoices`, `delivery_records`, `evidence_items`, unique idempotency indexes). Configured `eslint.config.mjs`, pinned `package.json` dependencies, ran `pnpm install`. `npm run db:migrate` succeeded.
- **M2 Hardened & Tested**: Fixed nested object canonical hashing in `src/core/crypto.ts`, unit/currency enforcement in `R-CUR-01` and rejected-field filtering in `src/core/reconciliation.ts`, bounded coverage ratios in `src/core/evidence-gaps.ts`, full blocker coverage in `src/core/payment-blockers.ts`, deterministic snapshot hashing & MCP evidence appendix in `src/core/report-builder.ts`. `npm run typecheck` (0 errors), `npm run lint` (0 errors, 0 warnings), `npm test` (18/18 passed).

## 2026-11-27T04:22+05:30 — M3 Complete

- **M3 Verified & Cleaned**: Inspected and verified `src/server/repositories/investigation-repo.ts` (removed unused `OrgRow` lint warning), `src/server/services/investigation-service.ts`, `src/server/logger.ts`, `src/db/seed-data.ts`, `src/mcp/server.ts` (6 tools: `get_case_context`, `reconcile_case_records`, `detect_evidence_gaps`, `assess_payment_blockers`, `get_evidence_graph`, `generate_evidence_report`), `src/mcp/gateway.ts`, and `src/mcp/smoke-test.ts`.
- **Verification**: `npm run typecheck` (0 errors), `npm run lint` (0 errors, 0 warnings), `npm test` (18/18 passed), `npm run mcp:smoke` (PASSED: all 6 tools discovered over real stdio transport, unknown field rejected, INV-1047 `R-QTY-01` 100 vs 90 discrepancy asserted, 6 `SUCCESS` rows persisted in `mcp_tool_calls`).

## 2026-11-27T04:30+05:30 — M4 Complete

- **M4 Server & API Layer**: Implemented `src/server/auth.ts` (HMAC-SHA256 signed `httpOnly` cookie sessions + RBAC), `src/server/rate-limit.ts`, `src/server/upload.ts` (extension allowlist, magic-byte validation, executable/archive rejection, 10 MB cap, UUID storage outside `public/`), `src/server/extraction.ts` (`PDF_TEXT` with `Uint8Array` copy fix for `pdf-parse`/`pdf.js` on Node v26, `CSV_PARSE`, `MANUAL`, optional `AI_VISION` gated on `GEMINI_API_KEY`), `src/server/api-helpers.ts`, `src/db/seed.ts`, `src/db/reset.ts`, and 21 REST route handlers under `src/app/api/v1/`.
- **Verification**: `npm run typecheck` (0 errors), `npm run lint` (0 errors, 0 warnings), `npm test` (22/22 passed: 18 core unit tests + 4 comprehensive M4 API/security/upload/MCP/RBAC/idempotency integration tests).

## 2026-11-27T09:44+05:30 — M5 & M6 Complete (Commit `c51d5f5`)

- **M5–M6 Functional Frontend & Design Handoff**: Implemented frozen neutral CSS tokens (`src/app/globals.css`), `src/app/layout.tsx`, `src/app/page.tsx` (login gate, case list, create investigation form), `src/app/cases/[id]/page.tsx`, `src/lib/api-client.ts`, modular components (`TopBar.tsx`, `CaseWorkspace.tsx`, `DocumentsPanel.tsx`, `FieldsVerificationPanel.tsx`, `ReconciliationPanel.tsx`, `EvidenceGraphPanel.tsx`, `TimelineAndMcpPanel.tsx`, `ReportPackPanel.tsx`), and `docs/07_DESIGN_HANDOFF.md`.
- **Verification**: `npm run typecheck` (0 errors), `npm run lint` (0 errors/warnings), `npm test` (22/22 passed), `next build` exit 0.

## 2026-11-27T10:17+05:30 — M7 & M8 Complete

- **M7 Security, Reliability & Unified Verification**: Added `src/server/__tests__/security-and-reliability.test.ts` (7 tests covering minor-unit decimal parsing, deterministic text extraction, logger secret redaction, report HTML XSS escaping + snapshot reproducibility, event hash-chain tamper detection, fixed-window rate limiting, and invalid-ID/MCP error persistence). Built `src/scripts/verify.ts` wired to `npm run verify` (`package.json`). Audited dependencies (`pnpm audit --prod` & `pnpm audit`) and documented triage in `docs/06_TESTING_AND_SECURITY_REPORT.md`.
- **M8 Demo Preparation & Acceptance**: Verified `npm run verify` (**8/8 passed**: `dependency-check`, `typecheck`, `lint`, `vitest` **29/29**, `mcp:smoke`, `demo:reset`, `post-reset-validation`, `next-build`). Tested live `npx next start -p 3100` against seeded `INV-1047` (HTTP 200 on `/` and `/cases/case-inv-1047`, security headers verified, MCP-backed reconcile `R-QTY-01` 90 vs 100 / 1,250,000 minor units, 3 logged MCP calls), then reset demo state via `npm run demo:reset`. Authored `docs/08_JUDGES_DEMO_SCRIPT.md`, `docs/09_KNOWN_LIMITATIONS.md`, and `docs/10_FINAL_ACCEPTANCE_REPORT.md`.

## 2026-11-27T10:40+05:30 — Guarded Local Demo Auto-Session (`PROOFLYN_LOCAL_DEMO_MODE`)

- **Auth & Environment**: Added `isLocalDemoRequestAllowed()` and `establishLocalDemoSession()` in `src/server/auth.ts`, wired into `GET /api/v1/auth/me` (`src/app/api/v1/auth/me/route.ts`). Disabled by default (`PROOFLYN_LOCAL_DEMO_MODE=false` in `.env.example`, enabled locally in `.env`). Refuses non-loopback `URL`/`Host`/`Origin`/`Referer`/`X-Forwarded-*`/`Forwarded` and deployed environment flags; protected `/api/v1/cases*` routes still require valid signed `HttpOnly` session cookies (`requireAuth`). Also added an actionable lock message in `src/db/reset.ts` when SQLite is held open by a running server.
- **Verification**: Added security-boundary tests in `src/server/__tests__/security-and-reliability.test.ts`; `npm run verify` passed **8/8** (`typecheck`, `lint`, `vitest` **30/30**, `mcp:smoke`, `demo:reset`, `post-reset-validation`, `next-build`); verified live `http://localhost:3000` issues loopback Investigator session cookie (`localDemoMode: true`), keeps cookie-less `/api/v1/cases` at `401`, loads `INV-1047`, runs MCP reconciliation (`R-QTY-01`), graph (`19` nodes), and `mcp-calls` (`4` logged calls).

## 2026-11-27T11:08+05:30 — 30-Minute Premium UI Design Pass

- **Design Direction via Stitch MCP**: Connected `StitchMCP`, created project `projects/15392573047859772150`, and extracted the light-mode **Architectural Ledger** design system (`#F4F6F9` porcelain slate, `#FFFFFF` sheets, `#E2E6EC` hairlines, `#0F2744` navy, `#126E47` verified emerald, `#A15C07` amber, `#B42318` crimson, tabular monospace metrics, zero gradients, zero emojis).
- **UI & Shell Polish**: Added `Plus Jakarta Sans` + `JetBrains Mono` in `src/app/layout.tsx`, clean SVG icon set (`src/components/Icons.tsx`), `AppShell` sidebar navigation + top breadcrumb bar (`src/components/TopBar.tsx`), Dashboard KPI strip + INV-1047 spotlight + searchable ledger (`src/app/page.tsx`), live 3-Way Match Matrix in `src/components/CaseWorkspace.tsx`, coverage meter + highlighted discrepancies/blockers (`src/components/ReconciliationPanel.tsx`), field state filters (`src/components/FieldsVerificationPanel.tsx`), upgraded SVG node boxes in `src/components/EvidenceGraphPanel.tsx`, and aligned `DocumentsPanel`, `TimelineAndMcpPanel`, and `ReportPackPanel`. Zero API/schema/business-logic changes.
- **Verification**: `npm run verify` passed **8/8** (`typecheck`, `lint`, `vitest`, `mcp:smoke`, `demo:reset`, `post-reset-validation`, `next-build` in `165.0s`), plus live `http://localhost:3000` verification.
