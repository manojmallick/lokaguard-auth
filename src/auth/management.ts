// src/auth/management.ts
// Auth0 Management API — used ONLY for bootstrapping Token Vault
// Agents must NEVER call this directly; they call getTokenVaultToken() exclusively.

import { config } from "../config";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getManagementToken(): Promise<string> {
  // Cache management tokens (they have longer TTL than vault tokens)
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  if (config.DEMO_MODE) {
    cachedToken = "demo-management-token";
    tokenExpiresAt = Date.now() + 3_600_000;
    return cachedToken;
  }

  const res = await fetch(`https://${config.AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.AUTH0_CLIENT_ID,
      client_secret: config.AUTH0_CLIENT_SECRET,
      audience: config.AUTH0_AUDIENCE,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get Auth0 management token: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;

  return cachedToken;
}
