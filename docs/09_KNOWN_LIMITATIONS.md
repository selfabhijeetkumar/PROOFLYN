# PROOFLYN — Known Limitations

> Honest engineering ledger of MVP boundaries, environmental constraints, and deferred items.

1. **Visual Design Intentionally Frozen (Design Pass Deferred):**
   - Per Design Freeze rules, `src/app/globals.css` uses minimal neutral CSS custom properties only, and `src/components/*` focuses on functional clarity rather than polished aesthetics. See [07_DESIGN_HANDOFF.md](file:///c:/WHACKIEST/docs/07_DESIGN_HANDOFF.md).
2. **Local SQLite Single-Node Persistence:**
   - Persistence uses Node v26 built-in `node:sqlite` (`WAL` mode) on local disk (`./data/prooflyn.db`) wrapped behind `InvestigationRepository`. Concurrent multi-instance scaling would require swapping the repository implementation to PostgreSQL/Supabase.
3. **In-Memory Rate Limiter:**
   - `src/server/rate-limit.ts` uses an in-memory `Map` on `globalThis`. Counts reset on server restart and are per-process rather than Redis-backed.
4. **Optional AI Extraction (`GEMINI_API_KEY`):**
   - Without `GEMINI_API_KEY`, uploaded raster images (`.png`, `.jpg`, `.jpeg`) store safely and return `0` fields with an explicit warning directing the operator to manual field entry (`MANUAL`). Deterministic parsing (`PDF_TEXT`, `CSV_PARSE`) and all 6 MCP tools remain 100% functional without any AI provider.
   - Note: `GEMINI_API_KEY` was not configured in this test environment, so live Gemini Vision network extraction was not tested empirically.
5. **External MCP Inspector Binary Not Installed Locally:**
   - `npx --no-install @modelcontextprotocol/inspector --version` returned exit code `1` offline. External Inspector UI attachment is documented in `docs/08_JUDGES_DEMO_SCRIPT.md` and marked `UNVERIFIED`. Real stdio MCP execution is verified via `npm run mcp:smoke`.
6. **Browser-Click E2E Not Executed:**
   - Playwright (`1.65.1`) is present in environment binaries, and we verified SSR pages, security headers, APIs, and MCP-in-Next via live `next start` HTTP requests plus 29 Vitest tests, but a scripted mouse-click Playwright browser UI walkthrough was not run.
7. **Dependency Advisories:**
   - `pnpm audit --prod` reports 5 advisories (`postcss@8.4.31` inside `next@15.5.29`, `zod@3.25.76`), and `pnpm audit` reports 5 dev-only advisories (`tinypool@1.1.1`, `vitest@3.2.7`). See triage rationale in `docs/06_TESTING_AND_SECURITY_REPORT.md`.
8. **OCR / Multi-Page Scanned PDFs:**
   - `PDF_TEXT` extracts embedded text streams via `pdf-parse`; image-only scanned PDFs without embedded text return `0` fields with a clear warning and require manual field entry.
