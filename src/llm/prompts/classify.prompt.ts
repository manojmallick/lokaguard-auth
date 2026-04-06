// src/llm/prompts/classify.prompt.ts

export function buildClassifyPrompt(incidentData: {
  title: string;
  description: string;
  affectedSystems: string[];
  startTime: string;
  currentTime: string;
}): string {
  return `You are a DORA compliance expert. Analyze this ICT incident and extract structured data.

INCIDENT:
Title: ${incidentData.title}
Description: ${incidentData.description}
Affected systems: ${incidentData.affectedSystems.join(", ")}
Start time: ${incidentData.startTime}
Current time: ${incidentData.currentTime}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "incidentType": "availability" | "integrity" | "confidentiality" | "authenticity",
  "affectedServices": string[],
  "estimatedAffectedClients": number,
  "durationMinutes": number,
  "dataLoss": boolean,
  "reputationalImpact": boolean,
  "immediateActions": string,
  "incidentDescription": string
}

The incidentDescription must be factual, under 500 characters, suitable for a regulatory filing.`;
}
