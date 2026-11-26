# PROOFLYN — Decision Register

| ID | Category | Decision | Status | Rationale |
|----|----------|----------|--------|-----------|
| D-01 | Architecture | Modular monolith (`core/`, `server/`, `mcp/`, `app/`) | CONFIRMED | Single source of business truth in pure `core/`; both REST and MCP call `core/` through repositories. |
| D-02 | Stack | TypeScript + Next.js App Router (Node runtime) + React 19 | CONFIRMED | Established in M1 skeleton; never Edge runtime because SQLite and stdio child processes require Node. |
| D-03 | Persistence | Local SQLite via Node.js `v26.13.1` built-in `node:sqlite` (`DatabaseSync`, WAL mode) | ACCEPTED | `better-sqlite3@11.10.0` lacks prebuilds for Node v26 ABI and no MSVC compiler exists on host; `node:sqlite` needs zero native compilation and works offline. |
| D-04 | MCP Transport | Official `@modelcontextprotocol/sdk@1.32.2` over `stdio` (`StdioServerTransport` + `StdioClientTransport` in `McpGateway`), Streamable HTTP as fallback only | CONFIRMED | Identical stdio server can be attached by MCP Inspector / Claude Desktop during judge demo. |
| D-05 | Auth | Local seeded `INVESTIGATOR` & `REVIEWER` users, scrypt hashes, HMAC-signed `httpOnly` cookie, server-side org/case scoping | ACCEPTED | Credentials read from env vars (never hardcoded in source); satisfies MVP two-role gate without external IdP. |
| D-06 | Money & Qty | Integer minor units (`amountMinor`, ISO currency) and integer quantities + unit; missing is never zero | CONFIRMED | Eliminates floating-point drift and silent zero-substitution errors. |
| D-07 | Upload | Multipart via Web `FormData` (remove unused `multer`), extension + magic-byte validation, 10 MB cap, UUID filenames outside `public/`, SHA-256 | ACCEPTED | Next.js App Router natively parses `FormData`; magic bytes block executable/spoofed payloads. |
| D-08 | Extraction | Layered: `MANUAL` always available, deterministic `PDF_TEXT` (`pdf-parse`) + `CSV_PARSE`, optional `AI_VISION` if `GEMINI_API_KEY` set | CONFIRMED | Guarantees 100% offline model-independent operation. |
| D-09 | Report Reproducibility | `Report.snapshotHash` computed via recursive canonical `hashObject()` excluding volatile timestamps/IDs | ACCEPTED | Ensures identical evidence snapshot yields identical report content hash. |
| D-10 | Visual Design | Frozen behind CSS custom properties in `globals.css`; minimal functional UI only | CONFIRMED | Preserves clean separation for morning design pass without touching business logic. |
| D-11 | Deferred Scope | Direct Zoho/Tally/Gmail/payment gateways, auto-emails, PDF-export via headless Chromium, non-MVP auth SSO | DEFERRED / REJECTED | Out of hackathon MVP scope; recorded in known limitations. |
