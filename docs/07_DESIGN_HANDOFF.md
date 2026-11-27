# PROOFLYN — Design Handoff & Applied UI Architecture

> **Status:** **Premium B2B UI Design Pass Applied** (30-minute pass complete, preserving all M0–M8 logic and APIs).  
> **Stitch Exploration:** Connected to `StitchMCP`, created project `projects/15392573047859772150` (*PROOFLYN — B2B Invoice Dispute Evidence Intelligence*), and synthesized the **Architectural Ledger** design system (`assets/b3632eb5ac794fb7b580154b169e148d`) as our restrained visual direction.

---

## 1. Visual Direction ("Architectural Ledger")

- **Palette:** Crisp Porcelain Slate canvas (`#F4F6F9`), pure white ledger sheets (`#FFFFFF`), 1px hairline borders (`#E2E6EC` / `#CBD3DE`), Deep Ink Navy primary (`#0F2744`), Muted Emerald verified (`#126E47`), Warm Amber needs review (`#A15C07`), Crimson discrepancy/blocker (`#B42318`).
- **Typography:** Self-hosted Google Fonts (`Plus Jakarta Sans` UI copy + `JetBrains Mono` tabular figures and slashed zeros for case IDs, amounts, variances, and SHA-256 hashes) via `next/font/google` in [layout.tsx](../src/app/layout.tsx).
- **Shape & Discipline:** Sharp architectural corners (`2px` status stamps with indicator dots, `4px` cards/buttons), zero gradients, zero emojis (clean stroke SVGs in [Icons.tsx](../src/components/Icons.tsx)), zero fabricated metrics or customer claims.

---

## 2. Improvements Applied Across Priority Screens

| Screen / Component | File(s) | Visual & UX Enhancements Applied |
|---|---|---|
| Global Tokens & Shell | `src/app/layout.tsx`, `src/app/globals.css`, `src/components/TopBar.tsx`, `src/components/Icons.tsx` | Added `AppShell` with persistent left sidebar navigation (`Investigation Ledger`, `INV-1047 Spotlight`, MCP stdio badge, session card, role switch), sticky breadcrumb topbar, crisp ledger table styling, and responsive mobile collapse. |
| **A. Dashboard** | `src/app/page.tsx` | Replaced raw tables with 4 real-data KPI cards, a **Primary Demo Case Spotlight** for `INV-1047` built strictly from persisted case fields, an asymmetric two-column workbench (searchable Investigation Ledger + New Case drawer), and `row-highlight` cueing. |
| **B. INV-1047 Case & Reconciliation** | `src/components/CaseWorkspace.tsx`, `src/components/ReconciliationPanel.tsx` | Added a live **3-Way Match Matrix** (`Purchase Order` vs `Vendor Invoice` vs `Delivery GRN` vs `Quantity Variance`) computed strictly from persisted fields (`100` vs `90` = `-10` unit variance + computed illustration), visual evidence coverage progress bar, and crimson-accented blocker governance rows. |
| **C. Evidence & Verification** | `src/components/FieldsVerificationPanel.tsx`, `src/components/DocumentsPanel.tsx` | Added status summary counts + filter buttons (`Verified`, `Extracted`, `Needs Review`, `Missing / Rejected`), clear semantic badges, highlighted exceptions, dashed secure upload zone, and clean download links. |
| **D. Evidence Graph & Timeline** | `src/components/EvidenceGraphPanel.tsx`, `src/components/TimelineAndMcpPanel.tsx` | Upgraded SVG graph from tiny dots to color-coded rectangular node cards with column headers (`Case Scope`, `Source Documents`, `Fields`, `Findings & Gaps`) and clean row-selection sync; refined hash-chain & event ledger alignment. |
| **E. MCP Evidence & Report Pack** | `src/components/TimelineAndMcpPanel.tsx`, `src/components/ReportPackPanel.tsx` | Aligned right-numeric latency & mono digest columns in `McpEvidencePanel`; added structured KPI summary tiles, HTML/JSON download icons, highlighted discrepancy alerts, and draft-only cues in `ReportPackPanel`. |

---

## 3. Verification & Remaining Polish Items

- Verified after final UI edits via `npm run verify` (`8/8` PASS: `typecheck`, `lint`, `30/30` vitest, `mcp:smoke`, `demo:reset`, `post-reset-validation`, `next-build`) and live `http://localhost:3000`.
- Remaining visual-only items (deferred cleanly without affecting functionality):
  1. Side-by-side raw PDF/image viewer pane next to `FieldsVerificationPanel`.
  2. Print/PDF CSS refinement inside downloaded HTML packs (`generateReportHtml` in `src/core/report-builder.ts`).
  3. Interactive Chrome/Playwright browser screenshot inspection (remote Chrome DevTools debugging was not active in this session).
