# PROOFLYN Specification

Status: FINALIZED

See canonical full specification and adversarial review in:
- [docs/PROOFLYN_MASTER_PROMPT.md](../docs/PROOFLYN_MASTER_PROMPT.md)
- [docs/02_FINAL_PRODUCT_SPECIFICATION_AND_CHALLENGE_REVIEW.md](../docs/02_FINAL_PRODUCT_SPECIFICATION_AND_CHALLENGE_REVIEW.md)
- [docs/05_DECISION_REGISTER.md](../docs/05_DECISION_REGISTER.md)

Core Guarantees:
1. Pure deterministic business logic in `src/core/` (reconciliation rules `R-QTY-01`, `R-QTY-02`, `R-PRC-01`, `R-DUP-01`, `R-DLV-01`, `R-DLV-02`, `R-DOC-01`, `R-CUR-01`, `R-VER-01`).
2. Local SQLite persistence (`node:sqlite` WAL mode) with versioned migrations and hash-chained append-only `investigation_events`.
3. Real `@modelcontextprotocol/sdk` stdio MCP server (`src/mcp/server.ts`) exposing all 6 investigation tools, wired through `McpGateway` (`src/mcp/gateway.ts`) and verified by `npm run mcp:smoke`.
4. Secure REST `/api/v1/...` routes, two-role auth (`INVESTIGATOR`, `REVIEWER`), magic-byte validated uploads, layered extraction, human verification workflow, functional Next.js UI with frozen design tokens, JSON/HTML Dispute-Ready Evidence Pack, and seeded `INV-1047` demo.
