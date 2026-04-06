// src/regulatory/dora-classifier.ts

export interface DORAIncidentFactors {
  affectedClients: number;
  totalClients: number;
  durationMinutes: number;
  dataLoss: boolean; // any loss of availability/integrity/confidentiality
  serviceType: "critical" | "important" | "standard";
  geographicScope: "local" | "national" | "cross-border";
  financialImpactEUR?: number;
  reputationalImpact?: boolean; // media coverage / regulatory attention
}

export type DORASeverity = "minor" | "major";

export interface ClassificationResult {
  severity: DORASeverity;
  requiresReport: boolean;
  criteriaMatched: string[];
  criteria: Record<string, boolean>;
}

export function classifyDORASeverity(factors: DORAIncidentFactors): DORASeverity {
  const { criteria } = evaluateCriteria(factors);
  const isMajor = Object.values(criteria).some(Boolean);
  return isMajor ? "major" : "minor";
}

export function classifyWithDetails(factors: DORAIncidentFactors): ClassificationResult {
  const { criteria } = evaluateCriteria(factors);

  const isMajor = Object.values(criteria).some(Boolean);
  const severity: DORASeverity = isMajor ? "major" : "minor";
  const criteriaMatched = Object.entries(criteria)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return {
    severity,
    requiresReport: isMajor,
    criteriaMatched,
    criteria,
  };
}

function evaluateCriteria(
  factors: DORAIncidentFactors,
): { criteria: Record<string, boolean> } {
  const clientPct =
    factors.totalClients > 0
      ? (factors.affectedClients / factors.totalClients) * 100
      : 0;

  // EBA RTS: ANY one criterion being true = major incident (all 7 checked)
  const criteria: Record<string, boolean> = {
    clientsPercentage: clientPct >= 10,
    clientsAbsolute: factors.affectedClients >= 100_000,
    durationCritical:
      factors.serviceType === "critical" && factors.durationMinutes >= 240,
    durationImportant:
      factors.serviceType === "important" && factors.durationMinutes >= 480,
    dataLoss: factors.dataLoss,
    financialImpact: (factors.financialImpactEUR ?? 0) >= 100_000,
    reputationalImpact: factors.reputationalImpact === true,
  };

  return { criteria };
}

// Only major incidents require reporting to DNB under DORA Article 19
export function requiresDORAReport(severity: DORASeverity): boolean {
  return severity === "major";
}
