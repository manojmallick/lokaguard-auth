// src/api/routes/incidents.ts
// POST /api/incidents — trigger the DORA pipeline

import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { LokaRouter } from "../../agents/loka-router";
import { RegDataAgent } from "../../agents/reg-data.agent";
import { ClassifyAgent } from "../../agents/classify.agent";
import { DraftAgent } from "../../agents/draft.agent";
import { SubmissionAgent } from "../../agents/submission.agent";
import { AuditAgent } from "../../agents/audit.agent";
import { getDatabase } from "../../db/sqlite";
import { broadcastToClients } from "../ws/agent-status.ws";
import { generateReportId } from "../../regulatory/report-builder";
import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { logger } from "../middleware/logger.middleware";

const router = Router();

const IncidentSchema = z.object({
  jiraIssueKey: z.string().regex(/^[A-Z]+-\d+$/, "Must be a valid Jira key, e.g. INC-1234"),
  userId: z.string().startsWith("auth0|").optional(),
});

router.post("/incidents", async (req: AuthenticatedRequest, res) => {
  const parsed = IncidentSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { jiraIssueKey } = parsed.data;
  const userId = parsed.data.userId ?? req.user?.sub ?? "auth0|demo-user";
  const organizationId = req.user?.org_id ?? "org-manojmallick";

  const incidentId = uuidv4();
  const reportId = generateReportId();

  // Store incident in SQLite
  const db = getDatabase();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO incidents (id, jira_issue_key, user_id, organization_id, status, report_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'detected', ?, ?, ?)`,
  ).run(incidentId, jiraIssueKey, userId, organizationId, reportId, now, now);

  // Return immediately — pipeline runs in background
  res.status(202).json({
    message: "Incident received — DORA pipeline initiated",
    incidentId,
    reportId,
    status: "processing",
    dashboardUrl: `/dashboard/?reportId=${reportId}`,
  });

  // Run pipeline asynchronously
  runPipeline({ incidentId, reportId, userId, organizationId }).catch((err) => {
    logger.error("Pipeline execution failed", {
      incidentId,
      reportId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
});

async function runPipeline(params: {
  incidentId: string;
  reportId: string;
  userId: string;
  organizationId: string;
}): Promise<void> {
  const { incidentId, reportId, userId, organizationId } = params;

  const router = new LokaRouter();

  // Wire all events → WebSocket broadcast
  router.on("agent:start", (e: unknown) => broadcastToClients({ type: "agent:start", ...asRecord(e) }));
  router.on("agent:complete", (e: unknown) => broadcastToClients({ type: "agent:complete", ...asRecord(e) }));
  router.on("agent:error", (e: unknown) => broadcastToClients({ type: "agent:error", ...asRecord(e) }));
  router.on("agent:status", (e: unknown) => broadcastToClients({ type: "agent:status", ...asRecord(e) }));
  router.on("agent:log", (e: unknown) => {
    logger.debug("Agent log", asRecord(e));
    broadcastToClients({ type: "agent:log", ...asRecord(e) });
  });

  router
    .register({ id: "regDataAgent", agent: new RegDataAgent(), dependsOn: [] })
    .register({ id: "classifyAgent", agent: new ClassifyAgent(), dependsOn: ["regDataAgent"] })
    .register({ id: "draftAgent", agent: new DraftAgent(), dependsOn: ["classifyAgent"] })
    .register({ id: "submissionAgent", agent: new SubmissionAgent(), dependsOn: ["draftAgent"] })
    .register({ id: "auditAgent", agent: new AuditAgent(), dependsOn: ["submissionAgent"] });

  const ctx = {
    userId,
    incidentId,
    reportId,
    organizationId,
    trace: [],
  };

  broadcastToClients({
    type: "pipeline:start",
    reportId,
    incidentId,
    timestamp: new Date().toISOString(),
  });

  const results = await router.execute(ctx);

  const allSuccess = [...results.values()].every((r) => r.success);

  // Update incident status in SQLite
  const db = getDatabase();
  db.prepare(
    `UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?`,
  ).run(allSuccess ? "submitted" : "failed", new Date().toISOString(), incidentId);

  broadcastToClients({
    type: "pipeline:complete",
    reportId,
    incidentId,
    success: allSuccess,
    timestamp: new Date().toISOString(),
    results: Object.fromEntries(
      [...results.entries()].map(([k, v]) => [k, { success: v.success, error: v.error }]),
    ),
  });
}

function asRecord(val: unknown): Record<string, unknown> {
  return typeof val === "object" && val !== null
    ? (val as Record<string, unknown>)
    : { value: val };
}

export default router;
