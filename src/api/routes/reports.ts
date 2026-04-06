// src/api/routes/reports.ts
// GET /api/reports/:id

import { Router } from "express";
import { getDatabase } from "../../db/sqlite";

const router = Router();

router.get("/reports/:id", (req, res) => {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({ error: "Report ID required" });
    return;
  }

  const db = getDatabase();

  const report = db
    .prepare(
      `SELECT r.*, i.jira_issue_key, i.status as incident_status
       FROM reports r
       JOIN incidents i ON r.incident_id = i.id
       WHERE r.id = ?`,
    )
    .get(id) as
    | {
        id: string;
        incident_id: string;
        payload: string;
        status: string;
        dnb_reference_id: string | null;
        submitted_at: string | null;
        created_at: string;
        updated_at: string;
        jira_issue_key: string;
        incident_status: string;
      }
    | undefined;

  if (!report) {
    // Also check audit_records
    const auditRecord = db
      .prepare(`SELECT * FROM audit_records WHERE report_id = ?`)
      .get(id) as { payload: string } | undefined;

    if (auditRecord) {
      res.json(JSON.parse(auditRecord.payload));
      return;
    }

    res.status(404).json({ error: "Report not found" });
    return;
  }

  res.json({
    id: report.id,
    incidentId: report.incident_id,
    jiraIssueKey: report.jira_issue_key,
    status: report.status,
    incidentStatus: report.incident_status,
    dnbReferenceId: report.dnb_reference_id,
    submittedAt: report.submitted_at,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    report: JSON.parse(report.payload) as unknown,
  });
});

router.get("/reports", (_req, res) => {
  const db = getDatabase();
  const reports = db
    .prepare(
      `SELECT r.id, r.incident_id, r.status, r.dnb_reference_id, r.submitted_at, r.created_at,
              i.jira_issue_key
       FROM reports r
       JOIN incidents i ON r.incident_id = i.id
       ORDER BY r.created_at DESC
       LIMIT 50`,
    )
    .all() as Array<{
    id: string;
    incident_id: string;
    status: string;
    dnb_reference_id: string | null;
    submitted_at: string | null;
    created_at: string;
    jira_issue_key: string;
  }>;

  res.json({ reports, total: reports.length });
});

export default router;
