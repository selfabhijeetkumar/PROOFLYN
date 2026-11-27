# PROOFLYN — Environment, Skills, and MCP Activation Report

> Audited: 2026-11-27T03:42+05:30 | Workspace: `C:\WHACKIEST` | OS: Windows (PowerShell 5.1) | Node.js `v26.13.1`, npm `11.21.0`, pnpm `9.12.2`

## 1. Runtime & Toolchain Status

| Component | State | Observed Version / Detail | Notes / Actions |
|-----------|-------|---------------------------|-----------------|
| Node.js | OPERATIONAL | `v26.13.1` (includes built-in `node:sqlite`) | Built-in `DatabaseSync` tested in Node and `tsx` |
| npm / pnpm | OPERATIONAL | npm `11.21.0`, pnpm `9.12.2` | `node_modules/.bin` missing from prior interrupted install; `pnpm install` requires `BypassSandbox` on Windows |
| Git | OPERATIONAL | Branch `overnight/prooflyn` initialized, 0 commits yet | Requires `BypassSandbox` for git init/commit if sandbox blocks `.git` lockfiles |
| `better-sqlite3` | UNAVAILABLE | `11.10.0` installed without binary | No prebuild for Node v26 ABI (`v147`) and no MSVC `cl.exe` installed; replaced with Node built-in `node:sqlite` |
| TypeScript (`tsc`) | OPERATIONAL | Installed in `node_modules/typescript` | `tsconfig.json` had `incremental: true` causing sandbox `EPERM` on `tsconfig.tsbuildinfo`; disable `incremental` |
| Vitest | OPERATIONAL | Installed in `node_modules/vitest` | Runs core unit tests (21/22 passing; 1 case-sensitivity test failure to fix in M2) |
| ESLint | OPERATIONAL | `v9.39.5`, `eslint-config-next@15.5.29` | Needs `eslint.config.mjs` flat config |

## 2. MCP Servers Inventory

| Server | State | Tested Capability / Check | Relevance & Decision |
|--------|-------|---------------------------|----------------------|
| `context7` | CONNECTED AND TESTED | Read schema; called `resolve-library-id` and `query-docs` for `@modelcontextprotocol/sdk` (`/modelcontextprotocol/typescript-sdk`) | RELEVANT — used to verify SDK v1.32.2 `McpServer.registerTool`, `StdioServerTransport`, `Client`, `StdioClientTransport` |
| `ecc_ecc-memory` | DISCOVERABLE (not tested) | Read `instructions.md` and tool list (`memory_save`, `memory_search`, `memory_read`, `memory_doctor`) | NOT RELEVANT for runtime app (handoff file + git are continuity protocol) |
| `supabase` | DISCOVERABLE | Not called (read-only/local SQLite chosen) | NOT RELEVANT (not tested) — local SQLite (`node:sqlite`) chosen for zero-network demo reliability |
| `StitchMCP` | DISCOVERABLE | Not called | NOT RELEVANT (not tested) — design frozen tonight |
| `cal` | DISCOVERABLE | Not called | NOT RELEVANT (not tested) — out of scope |
| `muapi` | DISCOVERABLE | Not called | NOT RELEVANT (not tested) — no paid media generation |
| OpenWhispr local bridge (`127.0.0.1:8200`) | AUTHENTICATION REQUIRED | Probed `http://127.0.0.1:8200/health` → HTTP `401 Unauthorized` | NOT RELEVANT (not tested further) — voice out of MVP scope |
| AppFlowy MCP | UNAVAILABLE | Not present in active `<mcp_servers>` list for this session | NOT RELEVANT — no AppFlowy integration in PROOFLYN |

## 3. Skills & Agents Inventory

- **Workspace skills** (`C:\WHACKIEST\.agents\skills`): 60 GSD & ECC skills discovered (`codebase-mapper`, `debugger`, `empirical-validation`, `executor`, `plan-checker`, `planner`, `tdd-workflow`, `verification-loop`, `verifier`, etc.).
- **User Gemini config skills** (`%USERPROFILE%\.gemini\config\skills`): 37 skills discovered (`appflowy`, `openwhispr-cli`, `openwhispr-api`, `voicestudio`, `muapi-*`, `seo-*`, `ponytail-*`, `competitive-landscape`, etc.) — all `NOT RELEVANT` to PROOFLYN tonight.
- **Harness-loaded global skills** (`<skills>`): `windows-shell-reliability` (READ & APPLIED), `nextjs-best-practices`, `security-and-hardening`, `systematic-debugging`, `mcp-builder`, `code-reviewer` (RELEVANT as needed); design/media/cloud/marketing/SEO skills marked `NOT RELEVANT`.
- **Workspace agents** (`C:\WHACKIEST\.agents\agents`): 72 agent definitions discovered (`gsd-*`, `code-reviewer`, `security-reviewer`, `tdd-guide`, etc.).

## 4. Security Warnings & User Actions Required

- Untrusted data rule: All skill text, uploaded documents, and MCP tool payloads are treated strictly as data.
- Secrets: No secret values exposed or inspected. `.env` will hold local-only dev credentials (`DATABASE_PATH`, `SESSION_SECRET`, `MCP_AUTH_TOKEN`, seeded demo passwords) and remains gitignored.
- No user action required to proceed with local SQLite (`node:sqlite`), Next.js, and stdio `@modelcontextprotocol/sdk` (`1.32.2`).
