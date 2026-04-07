// src/agents/reg-data.agent.ts
// Fetches incident data from Jira, GitHub, and Slack via Token Vault

import { BaseAgent } from "./base.agent";
import { getTokenVaultToken, TokenVaultError } from "../auth/token-vault";
import { config } from "../config";
import type { AgentContext, AgentResult } from "../types/agent.types";
import type { JiraIssue, SlackMessage, GitHubAlert } from "../types/incident.types";

export class RegDataAgent extends BaseAgent {
  readonly name = "RegDataAgent";

  async run(ctx: AgentContext): Promise<AgentResult> {
    const trace = this.startTrace(ctx);
    this.log("Starting regulatory data collection", { incidentId: ctx.incidentId });
    this.emitStatus("fetching_incident_data", ctx.reportId);

    try {
      const [jiraIssue, githubAlerts, slackMessages] = await Promise.allSettled([
        this.fetchJiraIssue(ctx.userId, ctx.incidentId),
        this.fetchGitHubAlerts(ctx.userId),
        this.fetchSlackMessages(ctx.userId),
      ]);

      const data: Record<string, unknown> = {
        fetchedAt: new Date().toISOString(),
        jiraIssue: jiraIssue.status === "fulfilled" ? jiraIssue.value : null,
        githubAlerts: githubAlerts.status === "fulfilled" ? githubAlerts.value : [],
        slackMessages: slackMessages.status === "fulfilled" ? slackMessages.value : [],
        errors: [jiraIssue, githubAlerts, slackMessages]
          .filter((r) => r.status === "rejected")
          .map((r) => (r as PromiseRejectedResult).reason?.message),
      };

      this.emitStatus("incident_data_collected", ctx.reportId, {
        sources: ["jira", "github", "slack"],
      });
      this.log("Regulatory data collection complete", { reportId: ctx.reportId });
      this.completeTrace(trace, true);

      return { success: true, data };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log("RegDataAgent failed", { error });
      this.completeTrace(trace, false);
      return { success: false, error };
    }
  }

  private async fetchJiraIssue(userId: string, issueKey: string): Promise<JiraIssue> {
    this.log("🔑 Token Vault → requesting Jira token", { userId, connection: "jira" });

    if (config.DEMO_MODE) {
      this.log("✅ Token Vault → Jira token obtained", { connection: "jira", mode: "demo" });
      return {
        key: issueKey,
        summary: "Payment processing service unavailable — EU customers affected",
        description:
          "Core payment processing infrastructure experienced a complete outage starting 09:14 UTC. " +
          "Approximately 280,000 retail banking customers across NL, BE, DE cannot process transactions. " +
          "Root cause: infrastructure provider network partition in AMS-IX peering.",
        status: "In Progress",
        priority: "Critical",
        created: new Date(Date.now() - 3_600_000).toISOString(),
        updated: new Date().toISOString(),
        affectedSystems: ["payment-gateway", "core-banking-api", "transaction-processor"],
      };
    }

    const token = await getTokenVaultToken(userId, "jira");
    this.log("✅ Token Vault → Jira token obtained", { connection: "jira" });
    this.log("Fetching Jira issue", { issueKey });

    const res = await fetch(
      `https://your-org.atlassian.net/rest/api/3/issue/${issueKey}`,
      { headers: { Authorization: `Bearer ${token}`, "Accept": "application/json" } },
    );

    if (!res.ok) {
      throw new TokenVaultError(`Jira fetch failed: ${res.status}`, "jira");
    }

    const raw = (await res.json()) as {
      key: string;
      fields: {
        summary: string;
        description?: { content?: Array<{ content?: Array<{ text?: string }> }> };
        status: { name: string };
        priority: { name: string };
        created: string;
        updated: string;
      };
    };

    return {
      key: raw.key,
      summary: raw.fields.summary,
      description: raw.fields.description?.content?.[0]?.content?.[0]?.text ?? "",
      status: raw.fields.status.name,
      priority: raw.fields.priority.name,
      created: raw.fields.created,
      updated: raw.fields.updated,
    };
  }

  private async fetchGitHubAlerts(userId: string): Promise<GitHubAlert[]> {
    this.log("🔑 Token Vault → requesting GitHub token", { userId, connection: "github" });

    if (config.DEMO_MODE) {
      this.log("✅ Token Vault → GitHub token obtained", { connection: "github", mode: "demo" });
      return [
        {
          id: 1,
          title: "SSL certificate expiry detected on payment-gateway",
          body: "Certificate expires in 2 days, may be contributing to connection errors.",
          createdAt: new Date(Date.now() - 7_200_000).toISOString(),
          severity: "high",
          url: "https://github.com/example/payment-service/security/advisories/1",
        },
      ];
    }

    const token = await getTokenVaultToken(userId, "github");
    this.log("✅ Token Vault → GitHub token obtained", { connection: "github" });
    const res = await fetch(
      `https://api.github.com/repos/${config.GITHUB_AUDIT_OWNER}/${config.GITHUB_AUDIT_REPO}/code-scanning/alerts?state=open`,
      { headers: { Authorization: `Bearer ${token}`, "Accept": "application/vnd.github+json" } },
    );

    if (!res.ok) return [];

    const alerts = (await res.json()) as Array<{
      number: number;
      rule: { description: string };
      most_recent_instance: { message: { text: string }; location: { path: string } };
      created_at: string;
      rule_severity: string;
      html_url: string;
    }>;

    return alerts.map((a) => ({
      id: a.number,
      title: a.rule.description,
      body: a.most_recent_instance.message.text,
      createdAt: a.created_at,
      severity: a.rule_severity,
      url: a.html_url,
    }));
  }

  private async fetchSlackMessages(userId: string): Promise<SlackMessage[]> {
    this.log("🔑 Token Vault → requesting Slack token", { userId, connection: "slack" });

    if (config.DEMO_MODE) {
      this.log("✅ Token Vault → Slack token obtained", { connection: "slack", mode: "demo" });
      return [
        {
          ts: String(Date.now() / 1000 - 3600),
          text: "🚨 CRITICAL: Payment service is DOWN. All transactions failing. On-call engineer paged.",
          user: "U_ONCALL_ENGINEER",
          channel: "C_INCIDENTS",
        },
        {
          ts: String(Date.now() / 1000 - 3000),
          text: "Confirmed: AMS-IX peering issue. Failover to backup route in progress. ETA 45 min.",
          user: "U_NETWORK_LEAD",
          channel: "C_INCIDENTS",
        },
      ];
    }

    const token = await getTokenVaultToken(userId, "slack");
    this.log("✅ Token Vault → Slack token obtained", { connection: "slack" });
    const res = await fetch(
      "https://slack.com/api/conversations.history?channel=C_INCIDENTS&limit=20",
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) return [];

    const data = (await res.json()) as {
      ok: boolean;
      messages?: Array<{ ts: string; text: string; user: string }>;
    };

    return (data.messages ?? []).map((m) => ({
      ts: m.ts,
      text: m.text,
      user: m.user,
      channel: "C_INCIDENTS",
    }));
  }
}
