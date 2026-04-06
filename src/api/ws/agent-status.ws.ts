// src/api/ws/agent-status.ws.ts
// WebSocket: real-time pipeline status → dashboard
// No additional wiring needed — all agent 'status' events are automatically broadcast

import type { WebSocketServer, WebSocket } from "ws";
import { logger } from "../middleware/logger.middleware";

const clients = new Set<WebSocket>();

export function initializeWebSocket(wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket, req) => {
    clients.add(ws);

    logger.info("WebSocket client connected", {
      clientCount: clients.size,
      origin: req.headers.origin,
    });

    // Send current server state on connect
    ws.send(
      JSON.stringify({
        type: "connected",
        message: "LokaGuard Auth — real-time pipeline connected",
        timestamp: new Date().toISOString(),
        clientCount: clients.size,
      }),
    );

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type?: string };
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      logger.info("WebSocket client disconnected", { clientCount: clients.size });
    });

    ws.on("error", (err) => {
      logger.error("WebSocket error", { error: err.message });
      clients.delete(ws);
    });
  });
}

export function broadcastToClients(payload: Record<string, unknown>): void {
  const message = JSON.stringify(payload);

  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      try {
        client.send(message);
      } catch (err) {
        logger.error("WebSocket broadcast error", {
          error: err instanceof Error ? err.message : String(err),
        });
        clients.delete(client);
      }
    }
  }
}

export function getConnectedClientCount(): number {
  return clients.size;
}
