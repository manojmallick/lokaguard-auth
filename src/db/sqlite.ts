// src/db/sqlite.ts
// better-sqlite3 for local audit trail

import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { config } from "../config";

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    mkdirSync(dirname(config.DATABASE_PATH), { recursive: true });

    db = new Database(config.DATABASE_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    initializeSchema(db);
  }
  return db;
}

function initializeSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS audit_records (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id    TEXT    NOT NULL UNIQUE,
      incident_id  TEXT    NOT NULL,
      user_id      TEXT    NOT NULL,
      organization_id TEXT NOT NULL,
      payload      TEXT    NOT NULL,
      created_at   TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id              TEXT PRIMARY KEY,
      jira_issue_key  TEXT NOT NULL,
      user_id         TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'detected',
      report_id       TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id              TEXT PRIMARY KEY,
      incident_id     TEXT NOT NULL,
      payload         TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'draft',
      dnb_reference_id TEXT,
      submitted_at    TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      FOREIGN KEY (incident_id) REFERENCES incidents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_audit_records_report_id ON audit_records(report_id);
    CREATE INDEX IF NOT EXISTS idx_incidents_jira_key ON incidents(jira_issue_key);
    CREATE INDEX IF NOT EXISTS idx_reports_incident_id ON reports(incident_id);
  `);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
