// src/llm/prompts/draft-report.prompt.ts

import type { DORAInitialNotification } from "../../types/report.types";

export function buildDraftReportPrompt(params: {
  incidentSummary: string;
  affectedServices: string[];
  affectedClientsCount: number;
  durationMinutes: number;
  immediateActions: string;
  geographicScope: string;
  reportId: string;
  entityName: string;
  entityLEI: string;
}): string {
  return `You are a DORA compliance officer preparing a regulatory notification for DNB (De Nederlandsche Bank).

Generate a formal DORA Article 19 Initial Notification based on this incident:

Report Reference: ${params.reportId}
Financial Entity: ${params.entityName} (LEI: ${params.entityLEI})
Affected Services: ${params.affectedServices.join(", ")}
Estimated Affected Clients: ${params.affectedClientsCount.toLocaleString()}
Duration: ${params.durationMinutes} minutes
Geographic Scope: ${params.geographicScope}
Incident Summary: ${params.incidentSummary}
Immediate Actions Taken: ${params.immediateActions}

Respond with ONLY a JSON object matching this exact structure (no markdown):
{
  "incidentType": "availability" | "integrity" | "confidentiality" | "authenticity",
  "incidentDescription": string (max 500 chars, factual, formal regulatory language),
  "rootCause": string (if determinable, else null),
  "affectedServices": string[],
  "immediateActions": string (formal language, actions taken within first hour),
  "geographicScope": string
}

Requirements:
- Use formal regulatory Dutch-English mixed style appropriate for DNB filings
- incidentDescription must be precise and concise (under 500 characters)
- Do not include speculation — only confirmed facts
- immediateActions must describe containment steps already taken`;
}

export function buildFinalReportEnhancementPrompt(
  draft: Partial<DORAInitialNotification>,
  additionalContext: string,
): string {
  return `You are a DORA compliance expert reviewing a regulatory filing draft.

Current draft:
${JSON.stringify(draft, null, 2)}

Additional context gathered since initial notification:
${additionalContext}

Enhance the incidentDescription and immediateActions fields with the additional context.
Respond with ONLY a JSON object with updated fields:
{
  "incidentDescription": string (max 500 chars),
  "immediateActions": string,
  "rootCause": string or null
}`;
}
