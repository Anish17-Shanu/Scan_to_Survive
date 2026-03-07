import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { adminMonitor } from "../services/eventService.js";
import { verifyToken } from "../utils/jwt.js";

const clients = new Set<WebSocket>();

export function attachWsServer(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws/admin" });

  wss.on("connection", (socket, request) => {
    const url = new URL(request.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");
    if (!token) {
      socket.close(1008, "Missing token");
      return;
    }
    try {
      const claims = verifyToken(token) as { role?: string };
      if (claims.role !== "admin") {
        socket.close(1008, "Admin token required");
        return;
      }
    } catch {
      socket.close(1008, "Invalid token");
      return;
    }

    clients.add(socket);
    socket.on("close", () => clients.delete(socket));
  });

  const timer = setInterval(async () => {
    if (clients.size === 0) return;
    try {
      const snapshot = await adminMonitor();
      const payload = JSON.stringify({ type: "monitor_snapshot", data: snapshot });
      for (const client of clients) {
        if (client.readyState === client.OPEN) {
          client.send(payload);
        }
      }
    } catch (error) {
      logger.warn("ws snapshot broadcast failed", { error: String(error) });
    }
  }, env.WS_BROADCAST_INTERVAL_MS);

  wss.on("close", () => clearInterval(timer));
  return wss;
}
