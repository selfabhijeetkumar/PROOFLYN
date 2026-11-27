# PROOFLYN — Judges Demo Script

> Every synthetic document and company in the demo dataset is explicitly labeled **SYNTHETIC — FOR DEMONSTRATION PURPOSES ONLY**.

## 1. Pre-Demo Reset (15 seconds)

Verify `.env` contains `DEMO_INVESTIGATOR_PASSWORD` and `DEMO_REVIEWER_PASSWORD` (already populated from `.env.example` keys for local demo). Run:

```powershell
npm run demo:reset
```

Expected output confirms creation of `org-nexarc-demo`, `user-investigator-1`, `user-reviewer-1`, `case-inv-1047`, and 3 deterministic synthetic PDFs in `uploads/`.

Start the production server (already built via `npm run verify`) or dev server:

```powershell
npm run start
```

Open `http://localhost:3000`.

## 2. Live Walkthrough: Golden Case `INV-1047`

1. **Sign In (Investigator):**
   - Email: value of `DEMO_INVESTIGATOR_EMAIL` (default `investigator@prooflyn.dev`)
   - Password: value of `DEMO_INVESTIGATOR_PASSWORD` from `.env`
   - Show the Investigation Dashboard listing `INV-1047` (*TechCorp Solutions Industrial Valves Q4 Dispute*) plus edge-case demo fixtures (`INV-2001` Missing Delivery, `INV-2002` Duplicate Invoice, `INV-2003` Partial Delivery).
2. **Inspect Case & Documents Tab:**
   - Open `INV-1047`.
   - Point out the 3 deterministic synthetic PDFs (`PO-2026-001-SYNTHETIC.pdf`, `INV-1047-SYNTHETIC.pdf`, `GRN-2026-001-SYNTHETIC.pdf`), each stored outside `public/` with SHA-256 checksums and downloadable.
3. **Human Verification Tab:**
   - Show extracted values (PO `100 UNITS @ INR 1,250.00`, Invoice `100 UNITS @ INR 1,250.00`, GRN `90 UNITS`) separated from verified state.
   - Verify or correct a field (`VERIFY` with a short note). Point out the append-only `VerificationRecord` history preserving original `rawText`.
4. **Reconciliation, Gaps & Blockers Tab (Real MCP Call):**
   - Click **Run Reconciliation (via MCP)**.
   - Show **`R-QTY-01`**: Invoice `100` vs Delivered `90` -> deterministic **`10` unit discrepancy**, computed variance illustration `INR 12,500.00` (explicitly labeled as illustration only, not a recovery claim).
   - Show **Evidence Gaps** (`whatIsMissing`, `whyItMatters`, `whatCouldResolve`) and bounded evidence coverage ratio (`verified / 14`).
   - Show **Payment Blockers** (`OPEN`, rule-cited, advisory only). Demonstrate RBAC: Investigator cannot acknowledge/resolve a blocker; signing in as Reviewer (`DEMO_REVIEWER_EMAIL` / `DEMO_REVIEWER_PASSWORD`) unlocks acknowledgment with audit note.
5. **Evidence Graph Tab (via MCP `get_evidence_graph`):**
   - Show layered Case -> Documents -> Fields -> Discrepancies & Gaps nodes/edges with rule & provenance inspection.
6. **Timeline & MCP Evidence Tabs:**
   - Open **Timeline**: show append-only events and live SHA-256 hash-chain verification badge (`Chain Valid`).
   - Open **MCP Evidence**: show real `mcp_tool_calls` rows (`get_case_context`, `reconcile_case_records`, `detect_evidence_gaps`, `assess_payment_blockers`, `get_evidence_graph`, `generate_evidence_report`) with input/output SHA-256 hashes, status, and duration.
7. **Report Pack Tab:**
   - Generate Dispute-Ready Evidence Pack via MCP `generate_evidence_report`.
   - Preview structured pack and download both **JSON** and escaped **HTML** formats.
   - Generate a **Follow-Up Draft** (explicitly draft-only; never auto-sent).

## 3. Standalone MCP Demonstration

To prove the MCP server works independently over stdio outside Next.js:

```powershell
npm run mcp:smoke
```

Expected output: connects `Client` via `StdioClientTransport` to `src/mcp/server.ts`, discovers all 6 tools, rejects unknown input fields, runs all 6 tools against `INV-1047`, asserts `R-QTY-01` (100 vs 90, 1,250,000 minor units), and logs 6 `SUCCESS` rows.

### Attaching MCP Inspector (External Client)

If network/npm install is available, launch MCP Inspector against the exact same stdio entrypoint:

```powershell
npx @modelcontextprotocol/inspector npx tsx src/mcp/server.ts
```

> **Status:** `UNVERIFIED` in this offline workspace (`@modelcontextprotocol/inspector` is not pre-installed locally; `npx --no-install @modelcontextprotocol/inspector --version` exited `1`). Protocol interoperability is empirically verified via `npm run mcp:smoke` using `@modelcontextprotocol/sdk@1.32.2` `Client` + `StdioClientTransport`.
