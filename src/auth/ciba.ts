// src/auth/ciba.ts
// CIBA is ONLY initiated in SubmissionAgent. It blocks until CISO approves on mobile.

import { config } from "../config";

export class CIBAError extends Error {
  constructor(
    message: string,
    public code: "denied" | "timeout" | "init_failed",
  ) {
    super(message);
    this.name = "CIBAError";
  }
}

export interface CIBAInitOptions {
  userSub: string; // Auth0 user sub (e.g. "auth0|abc123")
  bindingMessage: string; // MUST include report reference number
  scope?: string;
}

export async function initiateCIBA(opts: CIBAInitOptions): Promise<string> {
  // If DEMO_MODE is true OR the user is the built-in demo CISO, simulate the Auth0
  // CIBA request so the hackathon presentation doesn't hang waiting for a real phone tap.
  if (config.DEMO_MODE || opts.userSub === "auth0|demo-ciso") {
    console.log(
      JSON.stringify({
        level: "info",
        message: "CIBA initiated (demo mode/user — auto-approve scheduled)",
        userSub: opts.userSub,
        bindingMessage: opts.bindingMessage,
        timestamp: new Date().toISOString(),
      }),
    );
    return "demo-auth-req-id";
  }

  const params = new URLSearchParams({
    client_id: config.AUTH0_CIBA_CLIENT_ID,
    client_secret: config.AUTH0_CIBA_CLIENT_SECRET,
    login_hint: JSON.stringify({
      format: "iss_sub",
      iss: `https://${config.AUTH0_DOMAIN}/`,
      sub: opts.userSub,
    }),
    binding_message: opts.bindingMessage,
    scope: opts.scope ?? "openid profile",
    request_type: "push_notification",
  });

  const res = await fetch(`https://${config.AUTH0_DOMAIN}/bc-authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  const data = (await res.json()) as { auth_req_id?: string; error?: string };

  if (!data.auth_req_id) {
    throw new CIBAError(`CIBA initiation failed: ${data.error}`, "init_failed");
  }

  return data.auth_req_id;
}

export async function pollCIBAApproval(
  authReqId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const { timeoutMs = 300_000, intervalMs = 5_000 } = opts;

  // Simulate the CISO taking 8 seconds to pull out their phone, read the Auth0
  // Guardian push notification, and hit "Approve". This makes the dashboard UI
  // look incredibly realistic for the hackathon recording!
  if (config.DEMO_MODE || authReqId === "demo-auth-req-id") {
    await sleep(8_000);
    console.log(
      JSON.stringify({
        level: "info",
        message: "CIBA approved (simulated mobile tap for demo user)",
        authReqId,
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(`https://${config.AUTH0_DOMAIN}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.AUTH0_CIBA_CLIENT_ID,
        client_secret: config.AUTH0_CIBA_CLIENT_SECRET,
        grant_type: "urn:openid:params:grant-type:ciba",
        auth_req_id: authReqId,
      }),
    });

    const data = (await res.json()) as {
      access_token?: string;
      error?: string;
    };

    if (data.access_token) return; // approved

    if (data.error === "authorization_pending") {
      await sleep(intervalMs);
      continue;
    }
    if (data.error === "slow_down") {
      await sleep(intervalMs * 2);
      continue;
    }
    if (data.error === "access_denied") {
      throw new CIBAError("CISO denied the regulatory submission", "denied");
    }

    throw new CIBAError(`Unexpected CIBA error: ${data.error}`, "init_failed");
  }

  throw new CIBAError(
    "CISO did not approve within 5 minutes — submission aborted",
    "timeout",
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
