// src/agents/audit.agent.ts
// Writes immutable audit record to GitHub + SQLite

import { BaseAgent } from "./base.agent";
import { getTokenVaultToken } from "../auth/token-vault";
import { getDatabase } from "../db/sqlite";
import { config } from "../config";
import type { AgentContext, AgentResult } from "../types/agent.types";
import type { DORAInitialNotification } from "../types/report.types";

export class AuditAgent extends BaseAgent {
  readonly name = "AuditAgent";

  async run(ctx: AgentContext): Promise<AgentResult> {
    const trace = this.startTrace(ctx);
    this.log("Writing audit trail");
    this.emitStatus("writing_audit_trail", ctx.reportId);

    try {
      // Gather what we know about the submission
      const submissionData = ctx.draftReport as {
        report?: DORAInitialNotification;
        dnbReferenceId?: string;
        submittedAt?: string;
      } | undefined;

      const report = submissionData?.report;
      const auditRecord = {
        reportId: ctx.reportId,
        incidentId: ctx.incidentId,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        trace: ctx.trace,
        report,
        createdAt: new Date().toISOString(),
      };

      // Write to SQLite (always)
      this.writeSQLiteRecord(auditRecord);
      this.log("SQLite audit record written", { reportId: ctx.reportId });

      // Write to GitHub via Token Vault
      const githubCommitUrl = await this.writeGitHubAuditRecord(
        ctx.userId,
        ctx.reportId,
        auditRecord,
      );

      this.emitStatus("audit_complete", ctx.reportId, {
        githubCommitUrl,
        dbRecordId: ctx.reportId,
      });

      this.completeTrace(trace, true);

      return {
        success: true,
        data: { githubCommitUrl, auditRecordId: ctx.reportId },
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log("AuditAgent failed", { error });
      this.completeTrace(trace, false);
      // Audit failure is non-fatal — log but don't block
      return { success: true, data: { warning: `Audit partially failed: ${error}` } };
    }
  }

  private writeSQLiteRecord(record: Record<string, unknown>): void {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO audit_records (report_id, incident_id, user_id, organization_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      record["reportId"] as string,
      record["incidentId"] as string,
      record["userId"] as string,
      record["organizationId"] as string,
      JSON.stringify(record),
      record["createdAt"] as string,
    );
  }

  private async writeGitHubAuditRecord(
    userId: string,
    reportId: string,
    record: Record<string, unknown>,
  ): Promise<string> {
    if (config.DEMO_MODE) {
      const demoUrl = `https://github.com/${config.GITHUB_AUDIT_OWNER}/${config.GITHUB_AUDIT_REPO}/blob/main/audits/${reportId}.json`;
      this.log("GitHub audit write (demo mode)", { reportId, url: demoUrl });
      return demoUrl;
    }

    // Use GITHUB_PAT if provided in .env (for Hackathons), otherwise fall back to Token Vault
    let token: string;
    if (config.GITHUB_PAT) {
      token = config.GITHUB_PAT;
    } else {
      token = await getTokenVaultToken(userId, "github");
    }

    const content = Buffer.from(JSON.stringify(record, null, 2)).toString("base64");
    const path = `audits/${reportId}-${new Date().toISOString().split("T")[0]}.json`;

    const res = await fetch(
      `https://api.github.com/repos/${config.GITHUB_AUDIT_OWNER}/${config.GITHUB_AUDIT_REPO}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/vnd.github+json",
        },
        body: JSON.stringify({
          message: `audit(${reportId}): DORA report submission record`,
          content,
          committer: {
            name: "LokaGuard Auth Agent",
            email: "audit@lokaguard.ai",
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404) {
        console.warn(`⚠️ GitHub repo not found (404)! Mocking audit trail so demo doesn't crash.`);
        return `https://github.com/${config.GITHUB_AUDIT_OWNER}/${config.GITHUB_AUDIT_REPO}/blob/main/${path} (MOCKED - REPO NOT FOUND)`;
      }
      throw new Error(`GitHub audit write failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as { commit: { html_url: string } };
    return data.commit.html_url;
  }
}
