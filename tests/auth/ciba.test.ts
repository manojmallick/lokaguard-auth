// tests/auth/ciba.test.ts
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

describe("CIBA — demo mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  it("initiateCIBA returns a demo auth_req_id", async () => {
    const { initiateCIBA } = await import("../../src/auth/ciba");
    const id = await initiateCIBA({
      userSub: "auth0|ciso-1",
      bindingMessage: "LokaGuard: Approve DORA report LG-2024-001 for DNB submission",
    });
    expect(id).toBe("demo-auth-req-id");
  });

  it("pollCIBAApproval resolves after simulated delay in demo mode", async () => {
    const { initiateCIBA, pollCIBAApproval } = await import("../../src/auth/ciba");
    const id = await initiateCIBA({
      userSub: "auth0|ciso-1",
      bindingMessage: "LokaGuard: Approve DORA report LG-2024-001 for DNB submission",
    });

    const pollPromise = pollCIBAApproval(id);
    vi.advanceTimersByTime(5_000);
    await expect(pollPromise).resolves.toBeUndefined();
  });
});

describe("CIBA — production mode errors", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DEMO_MODE", "false");
  });

  it("throws CIBAError with code 'init_failed' when bc-authorize returns error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: "invalid_client" }),
    }) as unknown as typeof fetch;

    const { initiateCIBA, CIBAError } = await import("../../src/auth/ciba");
    await expect(
      initiateCIBA({
        userSub: "auth0|ciso-1",
        bindingMessage: "LokaGuard: Approve DORA report LG-2024-001 for DNB submission",
      }),
    ).rejects.toThrow(CIBAError);
  });

  it("throws CIBAError with code 'denied' when CISO denies", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: "access_denied" }),
    }) as unknown as typeof fetch;

    const { pollCIBAApproval, CIBAError } = await import("../../src/auth/ciba");
    await expect(pollCIBAApproval("mock-id", { intervalMs: 10 })).rejects.toThrow(
      expect.objectContaining({ code: "denied" }) as unknown as CIBAError,
    );
  });
});
