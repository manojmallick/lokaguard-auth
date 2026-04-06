// src/types/report.types.ts

export interface DORAInitialNotification {
  // Identification
  referenceNumber: string; // Internal: "LG-2024-001"
  financialEntityName: string; // "Manoj Mallick"
  financialEntityLEI: string; // Legal Entity Identifier (20 chars, alphanumeric)
  competentAuthority: "DNB" | "AFM";

  // Timing (all UTC ISO 8601)
  detectionDateTime: string; // When incident was first detected
  classificationDateTime: string; // When classified as major

  // Incident characterization
  incidentType: "availability" | "integrity" | "confidentiality" | "authenticity";
  incidentDescription: string; // Max 500 characters — keep concise
  rootCause?: string; // If known at time of filing

  // Impact
  affectedServices: string[]; // ICT service names
  affectedClientsCount?: number;
  geographicScope: string; // Countries affected, e.g. "Netherlands"
  financialImpactEUR?: number;
  reputationalImpact: boolean;

  // Response
  immediateActions: string; // Actions taken immediately after detection

  // Metadata
  status: "initial" | "intermediate" | "final";
  submittedAt?: string; // Set after successful DNB submission
  dnbReferenceId?: string; // Returned by DNB API
}

export interface DNBSubmissionResponse {
  referenceId: string;
  receivedAt: string;
  status: "accepted" | "pending" | "rejected";
  errorMessage?: string;
}
