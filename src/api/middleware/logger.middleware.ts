// src/api/middleware/logger.middleware.ts
// Structured JSON logging middleware

import type { Request, Response, NextFunction } from "express";
import { createLogger, format, transports } from "winston";
import { config } from "../../config";

export const logger = createLogger({
  level: config.LOG_LEVEL,
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
  ),
  transports: [new transports.Console()],
});

export function loggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();

  res.on("finish", () => {
    logger.info("HTTP request", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      userAgent: req.get("user-agent"),
      ip: req.ip,
    });
  });

  next();
}
