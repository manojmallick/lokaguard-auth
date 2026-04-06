// src/auth/token-vault.ts

import { config } from "../config";
import { getManagementToken } from "./management";

export type TokenVaultConnection =
  | "jira"
  | "github"
  | "slack"
  | "dnb-api"
  | "azure-devops";

export class TokenVaultError extends Error {
  code = "TOKEN_VAULT_ERROR" as const;
  constructor(
    message: string,
    public connection: string,
  ) {
    super(message);
    this.name = "TokenVaultError";
  }
}

export async function getTokenVaultToken(
  userId: string,
  connection: TokenVaultConnection,
): Promise<string> {
  // Demo mode — return mock tokens
  if (config.DEMO_MODE) {
    console.log(
      JSON.stringify({
        level: "info",
        message: "Token Vault fetch (demo mode)",
        connection,
        userId,
        timestamp: new Date().toISOString(),
      }),
    );
    return `demo-token-${connection}-${Date.now()}`;
  }

  const mgmtToken = await getManagementToken();

  // Only log metadata — never log the token value
  console.log(
    JSON.stringify({
      level: "info",
      message: "Fetching Token Vault token",
      connection,
      userId,
      timestamp: new Date().toISOString(),
    }),
  );

  const res = await fetch(
    `${config.AUTH0_TOKEN_VAULT_BASE_URL}/api/v1/users/${userId}/connected-accounts/${connection}/token`,
    {
      headers: {
        Authorization: `Bearer ${mgmtToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!res.ok) {
    const body = await res.text();

    if (res.status === 401) {
      throw new TokenVaultError(
        `Connection '${connection}' is not yet authorized. Please connect this app in the Auth0 Dashboard → Token Vault.`,
        connection,
      );
    }

    throw new TokenVaultError(
      `Token Vault error for ${connection}: ${res.status} ${body}`,
      connection,
    );
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
