// src/index.ts
// Express + WebSocket server entry point

import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { config } from "./config";
import { loggerMiddleware, logger } from "./api/middleware/logger.middleware";
import { authMiddleware } from "./api/middleware/auth.middleware";
import { initializeWebSocket } from "./api/ws/agent-status.ws";
import { getDatabase } from "./db/sqlite";

import healthRouter from "./api/routes/health";
import incidentsRouter from "./api/routes/incidents";
import reportsRouter from "./api/routes/reports";

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// ── Middleware ────────────────────────────────────────────
app.use(express.json());
app.use(loggerMiddleware);

// Serve static dashboard
app.use(
  "/dashboard",
  express.static(path.join(__dirname, "..", "public", "dashboard")),
);

// ── Routes ───────────────────────────────────────────────
app.use("/", healthRouter);

// Protected API routes
app.use("/api", authMiddleware, incidentsRouter);
app.use("/api", authMiddleware, reportsRouter);

// Root redirect
app.get("/", (_req, res) => {
  res.redirect("/dashboard");
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error("Unhandled error", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Internal server error" });
  },
);

// ── WebSocket ────────────────────────────────────────────
initializeWebSocket(wss);

// ── Start ─────────────────────────────────────────────────
async function start(): Promise<void> {
  // Initialize database
  getDatabase();
  logger.info("Database initialized", { path: config.DATABASE_PATH });

  httpServer.listen(config.PORT, () => {
    logger.info("LokaGuard Auth server started", {
      port: config.PORT,
      nodeEnv: config.NODE_ENV,
      demoMode: config.DEMO_MODE,
      dashboardUrl: `http://localhost:${config.PORT}/dashboard`,
      healthUrl: `http://localhost:${config.PORT}/health`,
    });

    if (config.DEMO_MODE) {
      logger.warn(
        "⚠️  Running in DEMO MODE — Auth0/OpenFGA/DNB calls are mocked. Set DEMO_MODE=false and provide real credentials for production.",
      );
    }
  });
}

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down gracefully");
  httpServer.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  httpServer.close(() => process.exit(0));
});

start().catch((err) => {
  logger.error("Fatal startup error", { error: err });
  process.exit(1);
});
