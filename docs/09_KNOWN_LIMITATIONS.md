# PROOFLYN — Known Limitations

> Honest engineering ledger of MVP boundaries, environmental constraints, and deferred items.

1. **Visual Polish Scope (30-Minute Architectural Ledger Pass Applied):**
   - The core Architectural Ledger B2B SaaS UI pass has been applied across Dashboard, `INV-1047` workspace, 3-way match matrix, verification tables, SVG graph, timeline, MCP audit panel, and Evidence Pack preview (`docs/07_DESIGN_HANDOFF.md`), while deferred optional enhancements (side-by-side raw PDF/image viewer and print-CSS tuning for exported HTML packs) remain documented in [07_DESIGN_HANDOFF.md](./07_DESIGN_HANDOFF.md).
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
   - Automated Chrome DevTools browser verification failed to attach (`DevToolsActivePort` missing / Chrome remote debugging disabled), and `playwright` is not installed as a local project dependency. SSR pages, auto-issued local demo `HttpOnly` sessions, security headers, APIs, and MCP-in-Next workflows were verified against live `http://localhost:3000`.
7. **Local Hackathon Demo Auto-Session (`PROOFLYN_LOCAL_DEMO_MODE=true`):**
   - For local hackathon demos, `.env` sets `PROOFLYN_LOCAL_DEMO_MODE=true` so `GET /api/v1/auth/me` issues a signed `HttpOnly` session cookie for the seeded `INVESTIGATOR` account on strict loopback (`localhost` / `127.0.0.1`) requests when no session exists. This flag defaults to `false` (disabled) in `.env.example` and is rejected on non-loopback hosts, reverse-proxied requests, or deployed environments (`VERCEL`, `RAILWAY_ENVIRONMENT`, `FLY_APP_NAME`, `RENDER`, `APP_ENV=production`, `COOKIE_SECURE=true`, etc.). Protected `/api/v1/cases*` routes still require valid cookies. Demonstrating `REVIEWER`-only blocker actions requires clicking **Sign out** and signing in as `DEMO_REVIEWER_EMAIL`.
8. **Dependency Advisories:**
   - `pnpm audit --prod` reports 5 advisories (`postcss@8.4.31` inside `next@15.5.29`, `zod@3.25.76`), and `pnpm audit` reports 5 dev-only advisories (`tinypool@1.1.1`, `vitest@3.2.7`). See triage rationale in `docs/06_TESTING_AND_SECURITY_REPORT.md`.
8. **OCR / Multi-Page Scanned PDFs:**
   - `PDF_TEXT` extracts embedded text streams via `pdf-parse`; image-only scanned PDFs without embedded text return `0` fields with a clear warning and require manual field entry.
