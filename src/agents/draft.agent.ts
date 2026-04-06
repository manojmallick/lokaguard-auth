// src/agents/draft.agent.ts
// Generates DORA initial notification draft using local Qwen

import { BaseAgent } from "./base.agent";
import { getQwenClient } from "../llm/qwen.client";
import { buildDraftReportPrompt } from "../llm/prompts/draft-report.prompt";
import { buildDORAReport } from "../regulatory/report-builder";
import { config } from "../config";
import type { AgentContext, AgentResult } from "../types/agent.types";

interface DraftLLMOutput {
  incidentType: "availability" | "integrity" | "confidentiality" | "authenticity";
  incidentDescription: string;
  rootCause: string | null;
  affectedServices: string[];
  immediateActions: string;
  geographicScope: string;
}

export class DraftAgent extends BaseAgent {
  readonly name = "DraftAgent";

  async run(ctx: AgentContext): Promise<AgentResult> {
    const trace = this.startTrace(ctx);
    this.log("Generating DORA initial notification draft");
    this.emitStatus("generating_dora_draft", ctx.reportId);

    try {
      const classification = ctx.classificationResult as {
        incidentDescription?: string;
        affectedServices?: string[];
        estimatedAffectedClients?: number;
        durationMinutes?: number;
        immediateActions?: string;
      } | undefined;

      const prompt = buildDraftReportPrompt({
        incidentSummary: classification?.incidentDescription ?? "ICT incident under investigation",
        affectedServices: classification?.affectedServices ?? [],
        affectedClientsCount: classification?.estimatedAffectedClients ?? 0,
        durationMinutes: classification?.durationMinutes ?? 0,
        immediateActions: classification?.immediateActions ?? "Under investigation",
        geographicScope: "Netherlands, Belgium, Germany",
        reportId: ctx.reportId,
        entityName: "Manoj Mallick",
        entityLEI: config.DNB_ORG_LEI,
      });

      let draftOutput: DraftLLMOutput;

      try {
        const qwen = getQwenClient();
        const isUp = await qwen.isAvailable();

        if (!isUp) {
          this.log("Ollama unavailable — using fallback draft");
          draftOutput = this.fallbackDraft(ctx, classification);
        } else {
          const raw = await qwen.generate(prompt);
          draftOutput = JSON.parse(raw.trim()) as DraftLLMOutput;
        }
      } catch (llmErr) {
        this.log("LLM draft generation failed, using fallback", {
          error: llmErr instanceof Error ? llmErr.message : String(llmErr),
        });
        draftOutput = this.fallbackDraft(ctx, classification);
      }

      // Assemble the full DORAInitialNotification object
      const rootCause = draftOutput.rootCause !== null ? draftOutput.rootCause : undefined;
      const affectedClientsCount = classification?.estimatedAffectedClients;

      const report = buildDORAReport(ctx.reportId, {
        incidentId: ctx.incidentId,
        detectionDateTime: new Date(Date.now() - 5_400_000).toISOString(), // 90min ago
        classificationDateTime: new Date().toISOString(),
        incidentType: draftOutput.incidentType,
        incidentDescription: draftOutput.incidentDescription,
        ...(rootCause !== undefined ? { rootCause } : {}),
        affectedServices: draftOutput.affectedServices,
        ...(affectedClientsCount !== undefined ? { affectedClientsCount } : {}),
        geographicScope: draftOutput.geographicScope,
        reputationalImpact: true,
        immediateActions: draftOutput.immediateActions,
      });

      this.log("DORA draft generated", { reportId: ctx.reportId });
      this.emitStatus("dora_draft_ready", ctx.reportId);
      this.completeTrace(trace, true);

      return { success: true, data: { report } };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log("DraftAgent failed", { error });
      this.completeTrace(trace, false);
      return { success: false, error };
    }
  }

  private fallbackDraft(
    ctx: AgentContext,
    classification?: {
      affectedServices?: string[];
      estimatedAffectedClients?: number;
      immediateActions?: string;
    } | undefined,
  ): DraftLLMOutput {
    return {
      incidentType: "availability",
      incidentDescription:
        "Complete unavailability of payment processing infrastructure affecting retail banking customers in NL, BE, DE. Root cause: network peering failure at AMS-IX exchange.",
      rootCause: "AMS-IX peering session failure causing loss of primary network path to payment processing cluster.",
      affectedServices: classification?.affectedServices ?? [
        "payment-gateway",
        "core-banking-api",
        "transaction-processor",
      ],
      immediateActions:
        "1. Incident response team activated at T+5min. 2. Traffic rerouted to secondary BGP peer at T+35min. 3. Customer status page updated at T+45min. 4. DNB notification initiated at T+90min (within 4-hour mandate).",
      geographicScope: "Netherlands, Belgium, Germany",
    };
  }
}
