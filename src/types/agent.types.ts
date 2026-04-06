// src/types/agent.types.ts

export interface AgentContext {
  userId: string;
  incidentId: string;
  reportId: string;
  organizationId: string;
  trace: AgentTrace[];
  // Populated as agents run
  incidentData?: Record<string, unknown>;
  classificationResult?: Record<string, unknown>;
  draftReport?: Record<string, unknown>;
}

export interface AgentResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface AgentTrace {
  agent: string;
  startedAt: string;
  completedAt?: string;
  success?: boolean;
}

export interface AgentStatusEvent {
  stage: string;
  agentName: string;
  reportId: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

export interface AgentLogEvent {
  agent: string;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}
