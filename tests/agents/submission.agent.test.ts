// tests/agents/submission.agent.test.ts
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.stubEnv("DEMO_MODE", "true");
vi.stubEnv("AUTH0_DOMAIN", "test.us.auth0.com");
vi.stubEnv("AUTH0_CLIENT_ID", "test-client");
vi.stubEnv("AUTH0_CLIENT_SECRET", "test-secret");
vi.stubEnv("AUTH0_AUDIENCE", "https://test.us.auth0.com/api/v2/");
vi.stubEnv("AUTH0_TOKEN_VAULT_BASE_URL", "https://test.us.auth0.com");
vi.stubEnv("AUTH0_SERVICE_ACCOUNT_USER_ID", "auth0|test-service");
vi.stubEnv("AUTH0_CIBA_CLIENT_ID", "test-ciba");
vi.stubEnv("AUTH0_CIBA_CLIENT_SECRET", "test-ciba-secret");
vi.stubEnv("OPENFGA_API_URL", "https://api.us1.fga.dev");
vi.stubEnv("OPENFGA_STORE_ID", "test-store");
vi.stubEnv("DNB_ORG_LEI", "724500AB12CD34EF5678");
vi.stubEnv("NODE_ENV", "test");

// Mock Auth0 and OpenFGA — never hit real APIs in tests
vi.mock("../../src/auth/token-vault", () => ({
  getTokenVaultToken: vi.fn().mockResolvedValue("mock-dnb-token"),
  TokenVaultError: class TokenVaultError extends Error { code = "TOKEN_VAULT_ERROR"; },
}));

vi.mock("../../src/auth/openfga", () => ({
  checkPermission: vi.fn().mockResolvedValue(true),
  FGAPermissionError: class FGAPermissionError extends Error { code = "FGA_PERMISSION_DENIED"; },
}));

vi.mock("../../src/auth/ciba", () => ({
  initiateCIBA: vi.fn().mockResolvedValue("mock-auth-req-id"),
  pollCIBAApproval: vi.fn().mockResolvedValue(undefined),
  CIBAError: class CIBAError extends Error { constructor(msg: string, public code: string) { super(msg); } },
}));

vi.mock("../../src/regulatory/dnb-client", () => ({
  DNBClient: vi.fn().mockImplementation(() => ({
    submitReport: vi.fn().mockResolvedValue({
      referenceId: "DNB-LG-2024-001-123456",
      receivedAt: new Date().toISOString(),
      status: "accepted",
    }),
  })),
}));

const mockReport = {
  referenceNumber: "LG-2024-001",
  financialEntityName: "Manoj Mallick",
  financialEntityLEI: "724500AB12CD34EF5678",
  competentAuthority: "DNB",
  detectionDateTime: new Date().toISOString(),
  classificationDateTime: new Date().toISOString(),
  incidentType: "availability",
  incidentDescription: "Payment service outage affecting 280,000 customers.",
  affectedServices: ["payment-gateway"],
  geographicScope: "Netherlands",
  reputationalImpact: true,
  immediateActions: "Traffic rerouted to backup.",
  status: "initial",
} as const;

const mockCtx = {
  userId: "auth0|test-user",
  incidentId: "INC-1234",
  reportId: "LG-2024-001",
  organizationId: "org-test",
  trace: [],
  draftReport: { report: mockReport },
};

describe("SubmissionAgent", () => {
  let SubmissionAgent: typeof import("../../src/agents/submission.agent").SubmissionAgent;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../../src/agents/submission.agent");
    SubmissionAgent = mod.SubmissionAgent;
  });

  it("completes successfully when CISO approves", async () => {
    const agent = new SubmissionAgent();
    const result = await agent.run(mockCtx);
    expect(result.success).toBe(true);
    expect((result.data as { dnbReferenceId: string } | undefined)?.dnbReferenceId).toMatch(/^DNB-/);
  });

  it("emits status events in correct order", async () => {
    const agent = new SubmissionAgent();
    const stages: string[] = [];
    agent.on("status", (e: { stage: string }) => stages.push(e.stage));
    await agent.run(mockCtx);
    expect(stages[0]).toBe("checking_permissions");
    expect(stages).toContain("awaiting_ciso_approval");
    expect(stages).toContain("ciso_approved");
    expect(stages).toContain("submission_complete");
  });

  it("returns failure when no draft report is available", async () => {
    const agent = new SubmissionAgent();
    const result = await agent.run({ ...mockCtx, draftReport: undefined });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No DORA report draft");
  });

  it("throws FGAPermissionError when user lacks permission", async () => {
    const { checkPermission } = await import("../../src/auth/openfga");
    vi.mocked(checkPermission).mockResolvedValueOnce(false);

    const agent = new SubmissionAgent();
    const result = await agent.run(mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("cannot submit");
  });
});
