// src/regulatory/report-builder.ts
// Assembles DORAInitialNotification from agent outputs

import { v4 as uuidv4 } from "uuid";
import { config } from "../config";
import type { DORAInitialNotification } from "../types/report.types";

export interface ReportBuildInput {
  incidentId: string;
  detectionDateTime: string;
  classificationDateTime: string;
  incidentType: "availability" | "integrity" | "confidentiality" | "authenticity";
  incidentDescription: string;
  rootCause?: string;
  affectedServices: string[];
  affectedClientsCount?: number;
  geographicScope: string;
  financialImpactEUR?: number;
  reputationalImpact: boolean;
  immediateActions: string;
}

let reportCounter = 1;

export function generateReportId(): string {
  const year = new Date().getFullYear();
  const seq = String(reportCounter++).padStart(3, "0");
  return `LG-${year}-${seq}`;
}

export function buildDORAReport(
  reportId: string,
  input: ReportBuildInput,
): DORAInitialNotification {
  // Truncate description to 500 chars (regulatory requirement)
  const incidentDescription = input.incidentDescription.slice(0, 500);

  return {
    referenceNumber: reportId,
    financialEntityName: "Manoj Mallick",
    financialEntityLEI: config.DNB_ORG_LEI,
    competentAuthority: "DNB" as const,

    detectionDateTime: input.detectionDateTime,
    classificationDateTime: input.classificationDateTime,

    incidentType: input.incidentType,
    incidentDescription,
    ...(input.rootCause !== undefined ? { rootCause: input.rootCause } : {}),

    affectedServices: input.affectedServices,
    ...(input.affectedClientsCount !== undefined ? { affectedClientsCount: input.affectedClientsCount } : {}),
    geographicScope: input.geographicScope,
    ...(input.financialImpactEUR !== undefined ? { financialImpactEUR: input.financialImpactEUR } : {}),
    reputationalImpact: input.reputationalImpact,

    immediateActions: input.immediateActions,

    status: "initial" as const,
  };
}
