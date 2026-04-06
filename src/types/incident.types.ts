// src/types/incident.types.ts

export interface ICTIncident {
  id: string;
  jiraIssueKey: string;
  userId: string;
  organizationId: string;
  title: string;
  description: string;
  affectedSystems: string[];
  detectedAt: string; // UTC ISO 8601
  reportedBy: string;
  status: "detected" | "classifying" | "drafting" | "awaiting_approval" | "submitted" | "failed";
}

export interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  created: string;
  updated: string;
  affectedSystems?: string[];
}

export interface SlackMessage {
  ts: string;
  text: string;
  user: string;
  channel: string;
}

export interface GitHubAlert {
  id: number;
  title: string;
  body: string;
  createdAt: string;
  severity: string;
  url: string;
}
