import http from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { attachWsServer } from "./realtime/wsHub.js";

const app = createApp();
const server = http.createServer(app);
const wsServer = attachWsServer(server);

server.listen(env.PORT, () => {
  logger.info("Backend started", { port: env.PORT });
});

function shutdown(signal: string) {
  logger.info("Shutdown signal received", { signal });
  wsServer.close(() => logger.info("WS server closed"));
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
