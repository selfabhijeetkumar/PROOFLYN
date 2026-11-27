/**
 * PROOFLYN — Database Schema and Migrations
 * SQLite via node:sqlite with WAL mode. Migrations are versioned, idempotent, and re-runnable.
 * Money stored as integer minor units. Missing is never zero.
 */

import path from 'node:path';
import fs from 'node:fs';
import { SqliteDatabase } from './sqlite';
import { loadEnvFile } from './env';

export function getDbPath(): string {
  loadEnvFile();
  const dbPath = process.env.DATABASE_PATH || './data/prooflyn.db';
  const resolved = path.resolve(dbPath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return resolved;
}

export function createDb(dbPath?: string): SqliteDatabase {
  const p = dbPath || getDbPath();
  const db = new SqliteDatabase(p);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

export function runMigrations(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db
      .prepare('SELECT name FROM _migrations')
      .all<{ name: string }>()
      .map((r) => r.name)
  );

  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.name)) {
      db.transaction(() => {
        db.exec(migration.sql);
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name);
      })();
    }
  }
}

interface Migration {
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    name: '001_initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('INVESTIGATOR', 'REVIEWER')),
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS investigation_cases (
        id TEXT PRIMARY KEY,
        case_number TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'CREATED'
          CHECK (status IN ('CREATED','DOCUMENTS_UPLOADED','EXTRACTION_COMPLETE',
            'UNDER_REVIEW','RECONCILED','REPORT_GENERATED','CLOSED')),
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS parties (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('BUYER', 'SUPPLIER')),
        identifier TEXT
      );

      CREATE TABLE IF NOT EXISTS source_documents (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        document_type TEXT NOT NULL
          CHECK (document_type IN ('PURCHASE_ORDER','INVOICE','DELIVERY_RECORD','SUPPORTING')),
        original_filename TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        uploaded_by TEXT NOT NULL REFERENCES users(id),
        uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS extracted_fields (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES source_documents(id),
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        field_name TEXT NOT NULL,
        raw_text TEXT,
        extracted_value TEXT,
        numeric_value INTEGER,
        currency TEXT,
        unit TEXT,
        presence TEXT NOT NULL DEFAULT 'PRESENT'
          CHECK (presence IN ('PRESENT', 'MISSING', 'INVALID')),
        source_page_number INTEGER,
        source_offset TEXT,
        extraction_method TEXT NOT NULL
          CHECK (extraction_method IN ('MANUAL','PDF_TEXT','AI_VISION','CSV_PARSE')),
        extraction_version TEXT NOT NULL DEFAULT '1.0.0',
        status TEXT NOT NULL DEFAULT 'EXTRACTED'
          CHECK (status IN ('EXTRACTED','NEEDS_REVIEW','VERIFIED','CORRECTED','REJECTED')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS verification_records (
        id TEXT PRIMARY KEY,
        extracted_field_id TEXT NOT NULL REFERENCES extracted_fields(id),
        verified_by TEXT NOT NULL REFERENCES users(id),
        previous_value TEXT,
        new_value TEXT,
        previous_status TEXT NOT NULL,
        new_status TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS reconciliation_runs (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        input_snapshot_hash TEXT NOT NULL,
        rules_version TEXT NOT NULL,
        previous_run_id TEXT REFERENCES reconciliation_runs(id),
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS discrepancies (
        id TEXT PRIMARY KEY,
        reconciliation_run_id TEXT NOT NULL REFERENCES reconciliation_runs(id),
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        rule_id TEXT NOT NULL,
        discrepancy_type TEXT NOT NULL,
        description TEXT NOT NULL,
        source_document_ids TEXT NOT NULL DEFAULT '[]',
        source_field_ids TEXT NOT NULL DEFAULT '[]',
        expected_value TEXT,
        actual_value TEXT,
        variance_value INTEGER,
        variance_currency TEXT,
        confidence TEXT NOT NULL DEFAULT 'SUPPORTED_UNVERIFIED',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS evidence_gaps (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        reconciliation_run_id TEXT REFERENCES reconciliation_runs(id),
        gap_type TEXT NOT NULL,
        rule_id TEXT,
        description TEXT NOT NULL,
        what_is_missing TEXT NOT NULL,
        why_it_matters TEXT NOT NULL,
        affected_conclusions TEXT NOT NULL,
        what_could_resolve TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS payment_blockers (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        reconciliation_run_id TEXT REFERENCES reconciliation_runs(id),
        rule_id TEXT NOT NULL,
        title TEXT NOT NULL,
        reason TEXT NOT NULL,
        impact TEXT NOT NULL,
        resolution_required TEXT NOT NULL,
        evidence_references TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'OPEN'
          CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
        acknowledged_by TEXT REFERENCES users(id),
        acknowledged_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS confidence_assessments (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        reconciliation_run_id TEXT NOT NULL REFERENCES reconciliation_runs(id),
        finding_id TEXT,
        level TEXT NOT NULL
          CHECK (level IN ('VERIFIED','SUPPORTED_UNVERIFIED','CONFLICTED','INSUFFICIENT')),
        criteria TEXT NOT NULL,
        input_fields_verified INTEGER NOT NULL DEFAULT 0,
        input_fields_total INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS evidence_relationships (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        source_node_id TEXT NOT NULL,
        source_node_type TEXT NOT NULL,
        target_node_id TEXT NOT NULL,
        target_node_type TEXT NOT NULL,
        edge_type TEXT NOT NULL,
        rule_id TEXT,
        source_reference TEXT,
        derivation_rule TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS investigation_events (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        event_type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        description TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        previous_event_hash TEXT,
        event_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS mcp_tool_calls (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'ERROR', 'TIMEOUT')),
        duration_ms INTEGER NOT NULL DEFAULT 0,
        output_hash TEXT,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        reconciliation_run_id TEXT NOT NULL REFERENCES reconciliation_runs(id),
        snapshot_hash TEXT NOT NULL,
        content_json TEXT NOT NULL,
        content_html TEXT,
        generated_by TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS follow_up_drafts (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        report_id TEXT NOT NULL REFERENCES reports(id),
        questions TEXT NOT NULL DEFAULT '[]',
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_cases_org ON investigation_cases(organization_id);
      CREATE INDEX IF NOT EXISTS idx_docs_case ON source_documents(case_id);
      CREATE INDEX IF NOT EXISTS idx_fields_doc ON extracted_fields(document_id);
      CREATE INDEX IF NOT EXISTS idx_fields_case ON extracted_fields(case_id);
      CREATE INDEX IF NOT EXISTS idx_events_case ON investigation_events(case_id);
      CREATE INDEX IF NOT EXISTS idx_discrepancies_case ON discrepancies(case_id);
      CREATE INDEX IF NOT EXISTS idx_gaps_case ON evidence_gaps(case_id);
      CREATE INDEX IF NOT EXISTS idx_blockers_case ON payment_blockers(case_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_calls_case ON mcp_tool_calls(case_id);
      CREATE INDEX IF NOT EXISTS idx_reports_case ON reports(case_id);
    `,
  },
  {
    name: '002_domain_entities_and_idempotency',
    sql: `
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        source_document_id TEXT NOT NULL REFERENCES source_documents(id),
        po_number TEXT,
        supplier_name TEXT,
        ordered_quantity INTEGER,
        unit TEXT,
        unit_price_minor INTEGER,
        total_amount_minor INTEGER,
        currency TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        source_document_id TEXT NOT NULL REFERENCES source_documents(id),
        invoice_number TEXT,
        supplier_name TEXT,
        invoiced_quantity INTEGER,
        unit TEXT,
        unit_price_minor INTEGER,
        total_amount_minor INTEGER,
        currency TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS delivery_records (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        source_document_id TEXT NOT NULL REFERENCES source_documents(id),
        delivery_reference TEXT,
        delivery_date TEXT,
        delivered_quantity INTEGER,
        unit TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS evidence_items (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES investigation_cases(id),
        source_document_id TEXT REFERENCES source_documents(id),
        extracted_field_id TEXT REFERENCES extracted_fields(id),
        item_type TEXT NOT NULL,
        label TEXT NOT NULL,
        summary TEXT NOT NULL,
        verification_status TEXT NOT NULL DEFAULT 'EXTRACTED',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_reconcile_idempotent
        ON reconciliation_runs(case_id, input_snapshot_hash, rules_version);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_idempotent
        ON reports(case_id, reconciliation_run_id, snapshot_hash);
    `,
  },
];
