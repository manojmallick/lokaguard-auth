// tests/auth/token-vault.test.ts
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Set demo mode before config loads
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

describe("getTokenVaultToken", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a demo token in demo mode", async () => {
    const { getTokenVaultToken } = await import("../../src/auth/token-vault");
    const token = await getTokenVaultToken("auth0|user-1", "jira");
    expect(token).toMatch(/^demo-token-jira-/);
  });

  it("handles all connection types", async () => {
    const { getTokenVaultToken } = await import("../../src/auth/token-vault");
    const connections = ["jira", "github", "slack", "dnb-api", "azure-devops"] as const;

    for (const conn of connections) {
      const token = await getTokenVaultToken("auth0|user-1", conn);
      expect(token).toContain(conn);
    }
  });

  it("throws TokenVaultError on 401 in production mode", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.resetModules();

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/oauth/token")) {
        return {
          ok: true,
          json: async () => ({ access_token: "mgmt-token", expires_in: 3600 }),
        };
      }
      return { ok: false, status: 401, text: async () => "Unauthorized" };
    }) as unknown as typeof fetch;

    const { getTokenVaultToken, TokenVaultError } = await import("../../src/auth/token-vault");
    await expect(getTokenVaultToken("auth0|user-1", "jira")).rejects.toThrow(TokenVaultError);

    vi.stubEnv("DEMO_MODE", "true");
  });
});
