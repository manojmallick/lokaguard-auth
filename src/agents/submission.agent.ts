// src/agents/submission.agent.ts
// OpenFGA check → CIBA push → CISO approves → Token Vault: DNB token → submit

import { BaseAgent } from "./base.agent";
import { checkPermission, FGAPermissionError } from "../auth/openfga";
import { initiateCIBA, pollCIBAApproval, CIBAError } from "../auth/ciba";
import { getTokenVaultToken } from "../auth/token-vault";
import { DNBClient } from "../regulatory/dnb-client";
import type { AgentContext, AgentResult } from "../types/agent.types";
import type { DORAInitialNotification } from "../types/report.types";

export class SubmissionAgent extends BaseAgent {
  readonly name = "SubmissionAgent";
  private dnbClient = new DNBClient();

  async run(ctx: AgentContext): Promise<AgentResult> {
    const trace = this.startTrace(ctx);
    const { userId, reportId } = ctx;

    const draftData = ctx.draftReport as { report?: DORAInitialNotification } | undefined;
    const report = draftData?.report;

    if (!report) {
      this.completeTrace(trace, false);
      return { success: false, error: "No DORA report draft available for submission" };
    }

    try {
      // 1. OpenFGA check — CISO or CRO only
      this.emitStatus("checking_permissions", reportId);
      this.log("🔒 OpenFGA → checking can_submit permission", { userId, object: `regulatory_report:${reportId}` });
      const allowed = await checkPermission(
        userId,
        "can_submit",
        `regulatory_report:${reportId}`,
      );

      if (!allowed) {
        throw new FGAPermissionError(
          `User ${userId} cannot submit report ${reportId} — requires CISO or CRO role`,
        );
      }

      this.log("✅ OpenFGA → can_submit: GRANTED", { userId, reportId });

      // 2. Notify dashboard — "awaiting CISO approval"
      this.emitStatus("awaiting_ciso_approval", reportId);
      this.log("Initiating CIBA step-up authentication", { userId, reportId });

      // 3. Initiate CIBA — binding message MUST include report ID (CLAUDE.md rule)
      const authReqId = await initiateCIBA({
        userSub: userId,
        bindingMessage: `LokaGuard: Approve DORA report ${reportId} for DNB submission`,
        scope: "openid profile",
      });

      // 4. Poll until CISO approves on their Auth0 Guardian mobile app (blocks here)
      await pollCIBAApproval(authReqId);

      // 5. Notify dashboard — "approved, submitting"
      this.emitStatus("ciso_approved", reportId);
      this.log("CISO approved — fetching DNB token from Token Vault");

      // 6. Fetch DNB token from Token Vault
      this.log("🔑 Token Vault → requesting dnb-api token", { userId, connection: "dnb-api" });
      const dnbToken = await getTokenVaultToken(userId, "dnb-api");
      this.log("✅ Token Vault → dnb-api token obtained", { connection: "dnb-api" });

      // 7. Submit to DNB
      this.emitStatus("submitting_to_dnb", reportId);

      // Update submittedAt with UTC ISO 8601 — new Date().toISOString() is correct
      const submittedReport: DORAInitialNotification = {
        ...report,
        submittedAt: new Date().toISOString(),
      };

      const submission = await this.dnbClient.submitReport(submittedReport, dnbToken);

      this.emitStatus("submission_complete", reportId, {
        dnbReferenceId: submission.referenceId,
        status: submission.status,
      });

      this.log("Report submitted to DNB", {
        reportId,
        dnbReferenceId: submission.referenceId,
      });

      this.completeTrace(trace, true);

      return {
        success: true,
        data: {
          dnbReferenceId: submission.referenceId,
          submittedAt: submittedReport.submittedAt,
          status: submission.status,
          report: { ...submittedReport, dnbReferenceId: submission.referenceId },
        },
      };
    } catch (err) {
      if (err instanceof CIBAError) {
        const stage =
          err.code === "denied"
            ? "ciso_denied"
            : err.code === "timeout"
              ? "ciso_timeout"
              : "ciba_failed";

        this.emitStatus(stage, reportId, { error: err.message });
        this.log("CIBA failed", { code: err.code, message: err.message });
        this.completeTrace(trace, false);
        return { success: false, error: err.message };
      }

      if (err instanceof FGAPermissionError) {
        this.emitStatus("permission_denied", reportId);
        this.completeTrace(trace, false);
        return { success: false, error: err.message };
      }

      const error = err instanceof Error ? err.message : String(err);
      this.log("SubmissionAgent failed", { error });
      this.completeTrace(trace, false);
      return { success: false, error };
    }
  }
}
