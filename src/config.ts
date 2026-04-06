// src/config.ts
// Zod env validation — crashes fast on missing/invalid vars

import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

try {
  const envPath = path.join(process.cwd(), ".env");
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const parts = trimmed.split("=");
      if (parts.length > 1) {
        const key = parts[0]?.trim();
        const value = parts.slice(1).join("=").trim().replace(/^["']|["']$/g, "");
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
} catch (e) {}

const EnvSchema = z.object({
  // Auth0 Core
  AUTH0_DOMAIN: z.string().min(1),
  AUTH0_CLIENT_ID: z.string().min(1),
  AUTH0_CLIENT_SECRET: z.string().min(1),
  AUTH0_AUDIENCE: z.string().url(),

  // Token Vault
  AUTH0_TOKEN_VAULT_BASE_URL: z.string().url(),
  AUTH0_SERVICE_ACCOUNT_USER_ID: z.string().startsWith("auth0|"),

  // CIBA
  AUTH0_CIBA_CLIENT_ID: z.string().min(1),
  AUTH0_CIBA_CLIENT_SECRET: z.string().min(1),
  CIBA_BINDING_MESSAGE_PREFIX: z.string().default("LokaGuard: Approve DORA submission"),

  // OpenFGA
  OPENFGA_API_URL: z.string().url(),
  OPENFGA_STORE_ID: z.string().min(1),
  OPENFGA_AUTHORIZATION_MODEL_ID: z.string().optional(),
  OPENFGA_API_TOKEN: z.string().optional(),

  // LLM
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("qwen2.5:7b"),

  // Database
  DATABASE_PATH: z.string().default("./data/lokaguard.db"),

  // External services
  DNB_API_BASE_URL: z.string().url().default("https://www.dnb.nl/en/"),
  DNB_ORG_LEI: z.string().length(20),

  // GitHub audit trail
  GITHUB_AUDIT_REPO: z.string().default("lokaguard-audit-trail"),
  GITHUB_AUDIT_OWNER: z.string().default("lokaguard"),
  GITHUB_PAT: z.string().optional(),

  // App
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

  // Demo mode — bypass real Auth0/OpenFGA/DNB calls
  DEMO_MODE: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
});

export type AppConfig = z.infer<typeof EnvSchema>;

function loadConfig(): AppConfig {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    // In demo mode, allow missing Auth0 credentials
    if (process.env["DEMO_MODE"] === "true") {
      const demoEnv = {
        AUTH0_DOMAIN: process.env["AUTH0_DOMAIN"] ?? "demo.us.auth0.com",
        AUTH0_CLIENT_ID: process.env["AUTH0_CLIENT_ID"] ?? "demo-client-id",
        AUTH0_CLIENT_SECRET: process.env["AUTH0_CLIENT_SECRET"] ?? "demo-client-secret",
        AUTH0_AUDIENCE: process.env["AUTH0_AUDIENCE"] ?? "https://demo.us.auth0.com/api/v2/",
        AUTH0_TOKEN_VAULT_BASE_URL:
          process.env["AUTH0_TOKEN_VAULT_BASE_URL"] ?? "https://demo.us.auth0.com",
        AUTH0_SERVICE_ACCOUNT_USER_ID:
          process.env["AUTH0_SERVICE_ACCOUNT_USER_ID"] ?? "auth0|demo-service-account",
        AUTH0_CIBA_CLIENT_ID: process.env["AUTH0_CIBA_CLIENT_ID"] ?? "demo-ciba-client",
        AUTH0_CIBA_CLIENT_SECRET:
          process.env["AUTH0_CIBA_CLIENT_SECRET"] ?? "demo-ciba-secret",
        OPENFGA_API_URL:
          process.env["OPENFGA_API_URL"] ?? "https://api.us1.fga.dev",
        OPENFGA_STORE_ID: process.env["OPENFGA_STORE_ID"] ?? "demo-store",
        DNB_ORG_LEI: process.env["DNB_ORG_LEI"] ?? "724500AB12CD34EF5678",
        ...process.env,
        DEMO_MODE: "true",
      };
      const demoResult = EnvSchema.safeParse(demoEnv);
      if (demoResult.success) return demoResult.data;
    }

    console.error("❌ Invalid environment configuration:");
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
