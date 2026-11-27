# PROOFLYN — Testing and Security Report

> Observed verification and security triage for M7. All claims below are backed by executed commands in this workspace.

## 1. Unified Verification Command (`npm run verify`)

Executed `npm run verify` (`tsx src/scripts/verify.ts`) after all code and test edits:

| Phase / Check | Outcome | Duration | Details |
|---|---|---:|---|
| `dependency-check` | PASS | 1 ms | Verified `pnpm-lock.yaml` and core dependencies present |
| `typecheck` (`npx tsc --noEmit`) | PASS | 4,188 ms | 0 TypeScript errors |
| `lint` (`npx eslint src`) | PASS | 3,774 ms | 0 errors, 0 warnings |
| `vitest` (`npx vitest run`) | PASS | 4,750 ms | 3 test files, **29/29 tests passed** |
| `mcp:smoke` (`npx tsx src/mcp/smoke-test.ts`) | PASS | 2,005 ms | All 6 MCP tools discovered over real `stdio`, unknown input rejected, INV-1047 verified, 6 `SUCCESS` rows persisted |
| `demo:reset` (`npx tsx src/db/reset.ts`) | PASS | 1,321 ms | Rebuilt SQLite DB + 3 synthetic PDFs cleanly |
| `post-reset-validation` | PASS | 6 ms | Verified INV-1047 present (`docs=3`, `fields=12`, `events=5`), `verifyEventChain()` valid (`true`), files present on disk |
| `next-build` (`npx next build`) | PASS | 70,195 ms | Clean production bundle across 25 App Router routes |

**Total:** `8/8` checks passed in `86.2s` (exit code `0`).

## 2. Automated Test Breakdown (`npx vitest run --reporter=verbose`)

- `src/core/__tests__/reconciliation.test.ts` (**18 tests**):
  - INV-1047 golden case: `R-QTY-01` (100 vs 90 = 10 units, 1,250,000 minor units / ₹12,500.00 computed illustration), `R-DLV-02`, confidence upgrade after verification, deterministic snapshot hash + `rulesVersion`.
  - Rule coverage: `R-QTY-02`, `R-PRC-01`, `R-CUR-01` (currency & unit mismatch blocking arithmetic), `R-DUP-01` (case-insensitive duplicate invoice), `R-DLV-01` (missing delivery record emits gap, not discrepancy), missing/invalid/rejected fields refused by arithmetic, multi-record partial delivery sum.
  - Coverage bounded `<= total` (`14/14` verified on INV-1047), payment blockers, evidence graph, report snapshot & escaped HTML, canonical object hashing, event hash-chain verification and tamper detection.
- `src/server/__tests__/api.test.ts` (**4 tests**):
  - `/api/v1/health`, auth login/me/logout, invalid password `401`, cross-origin mutating request blocked with `403`.
  - Organization tenant isolation (`404` across orgs), duplicate case number conflict (`409`), valid case creation (`201`).
  - Upload security: executable disguised as PDF (`MZ` header) rejected `400`, plain text spoofed as `.pdf` rejected `400`, path traversal (`../../secret.txt`) rejected `400`, unsupported `.zip` rejected `400`, oversize `>10 MB` rejected `413`, corrupted `%PDF-` stored safely with `0` fields and explicit warning, valid PDF/CSV extraction, PNG without `GEMINI_API_KEY` stored with explicit warning, manual field entry, SHA-256 download header verified.
  - End-to-end INV-1047 API + MCP Gateway flow: field verification (`VerificationRecord`), MCP reconcile + idempotent second call (`reusedExistingRun: true`), gaps (`14` slots), RBAC blocker check (`403` for Investigator, `200` for Reviewer), MCP graph (`>=16` nodes), hash-chain verification, `mcp_tool_calls` audit rows (`SUCCESS`), MCP report generation, JSON/HTML download, follow-up draft creation.
- `src/server/__tests__/security-and-reliability.test.ts` (**7 tests**):
  - `parseDecimalToMinorUnits()` exact string parsing (no floats).
  - `extractFieldsFromText()` deterministic extraction without fabricating missing fields.
  - `redactValue()` secret/Bearer token redaction for structured stderr JSON logs.
  - `generateReportHtml()` XSS payload escaping (`<script>`, `<svg onload=...`) and deterministic `snapshotHash`.
  - `verifyEventChain()` cryptographic tamper detection (`brokenAt: 0`).
  - Fixed-window `checkRateLimit()` threshold enforcement (`429 RATE_LIMITED`).
  - Invalid REST case ID (`404`) and MCP Gateway unknown-case error persistence (`ERROR` logged in `mcp_tool_calls`).

## 3. Live Production Server Smoke Check

Tested `npx next start -p 3100 -H 127.0.0.1` against the freshly built bundle and seeded database:
- `GET /` -> `200` with headers `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Content-Security-Policy`.
- Authenticated `POST /api/v1/auth/login` -> `GET /api/v1/cases` -> `GET /cases/case-inv-1047` (`200`) -> `POST /api/v1/cases/case-inv-1047/reconcile` (`200`, `R-QTY-01` 90 vs 100, variance `1250000` minor units) -> `GET /api/v1/cases/case-inv-1047/mcp-calls` (`3` calls logged).
- Followed immediately by `npm run demo:reset` so the demo database remains clean.

## 4. Security Controls Checklist

| Control | Implementation | Verification |
|---|---|---|
| Session Auth & Passwords | `scrypt` salted hashes (`16B` salt, `64B` key), `timingSafeEqual`, HMAC-SHA256 `httpOnly; SameSite=Lax` cookie | Tested in `api.test.ts` |
| Role-Based Access Control | `INVESTIGATOR` vs `REVIEWER` checks in service layer (blocker acknowledge/resolve requires `REVIEWER`) | Tested (`403` vs `200`) in `api.test.ts` |
| Tenant Scoping | All repository case queries filter by `organization_id` | Tested (`404` for outsider org) |
| CSRF / Same-Origin | `assertSameOrigin()` rejects cross-origin mutating requests | Tested (`403`) in `api.test.ts` |
| Secure File Uploads | Extension allowlist, magic bytes checked, exe/zip rejected, `10 MB` cap, UUID filename outside `public/` | Tested in `api.test.ts` |
| XSS / Injection Prevention | Escaped HTML in `report-builder.ts`, parameterized SQLite statements, React escaping | Tested in `security-and-reliability.test.ts` |
| Log Redaction | `redactValue()` masks `password`, `secret`, `token`, `cookie`, `apiKey`, `Bearer ...` on stderr | Tested in `security-and-reliability.test.ts` |
| Security Headers / CSP | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, strict CSP in `next.config.js` | Verified against live `next start` |
| Rate Limiting | In-memory fixed-window limiter on auth/upload/report routes (`429`) | Tested in `security-and-reliability.test.ts` |
| Audit Integrity | Append-only `investigation_events` SHA-256 hash chain + `verifyEventChain()` | Tested in `reconciliation.test.ts`, `api.test.ts`, `security-and-reliability.test.ts`, `verify.ts` |

## 5. Dependency Audit Triage

Ran `pnpm audit --prod` and `pnpm audit`:
- **Production (`pnpm audit --prod`) — 5 findings (3 high, 2 moderate):**
  - `postcss@8.4.31` (transitive under `next@15.5.29`): 4 advisories (`GHSA-6g55-p6wh-862q`, `GHSA-r28c-9q8g-f849`, `GHSA-qx2v-qp2m-jg93`, `GHSA-fxqj-rqcc-2cmp`) relating to attacker-controlled CSS / `sourceMappingURL`. **Triage:** Build-time dependency only; PROOFLYN serves static `src/app/globals.css` and does not accept or compile user-supplied CSS. Upgrading Next.js major/minor was intentionally avoided to preserve the verified production build.
  - `zod@3.25.76` (direct and transitive under `@modelcontextprotocol/sdk@1.32.2`): 1 high advisory (`GHSA-mrhx-c7xc-m3w5` — memory exhaustion on unconstrained large collections). **Triage:** Mitigated by strict `10 MB` body/upload caps, bounded inputs on all API/MCP schemas, and Zod v3 compatibility required by `@modelcontextprotocol/sdk@1.32.2`.
- **Development-only (`pnpm audit`) — 5 additional findings (2 critical in `tinypool@1.1.1`, 3 moderate in `vitest@3.2.7` / `@vitest/mocker@3.2.7`):**
  - **Triage:** Test runner packages only; excluded from `.next` production build and runtime.

No blind `audit fix --force` was executed.
