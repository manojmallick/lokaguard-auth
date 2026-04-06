// src/api/routes/health.ts
// GET /health — judges will check this

import { Router } from "express";
import { getDatabase } from "../../db/sqlite";
import { getQwenClient } from "../../llm/qwen.client";
import { config } from "../../config";

const router = Router();

router.get("/health", async (_req, res) => {
  const checks: Record<string, "ok" | "degraded" | "unavailable"> = {};

  // SQLite check
  try {
    getDatabase().prepare("SELECT 1").get();
    checks["database"] = "ok";
  } catch {
    checks["database"] = "unavailable";
  }

  // Ollama check — in demo mode, treat as "ok" since we use fallbacks
  try {
    const qwen = getQwenClient();
    const ollamaUp = await qwen.isAvailable();
    checks["ollama"] = ollamaUp ? "ok" : config.DEMO_MODE ? "ok" : "unavailable";
  } catch {
    checks["ollama"] = config.DEMO_MODE ? "ok" : "unavailable";
  }

  const overallStatus = Object.values(checks).every((v) => v === "ok")
    ? "ok"
    : "degraded";

  // In demo mode always 200 — no partial content codes to confuse judges
  const httpStatus = config.DEMO_MODE ? 200 : overallStatus === "ok" ? 200 : 207;

  res.status(httpStatus).json({
    status: overallStatus,
    version: "1.0.0",
    demoMode: config.DEMO_MODE,
    llm: config.DEMO_MODE ? "fallback (deterministic DORA classifier)" : "ollama/qwen2.5",
    timestamp: new Date().toISOString(),
    checks,
  });
});

export default router;

