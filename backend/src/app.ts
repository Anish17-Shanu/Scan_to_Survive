import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { apiTelemetry } from "./middleware/apiTelemetry.js";
import { getActiveEvent, getEventState } from "./repositories/eventRepo.js";
import { adminRouter } from "./routes/adminRoutes.js";
import { authRouter } from "./routes/authRoutes.js";
import { gameRouter } from "./routes/gameRoutes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  const allowedOrigins = env.CORS_ORIGIN.split(",").map((v) => v.trim());
  const allowWildcard = allowedOrigins.includes("*");

  app.use(helmet());
  app.use(
    cors({
      origin: allowWildcard ? true : allowedOrigins,
      credentials: !allowWildcard
    })
  );
  app.use(express.json());
  app.use(apiTelemetry);
  app.use(morgan("tiny"));

  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: "scan-to-survive-backend",
      routes: {
        health: "/health",
        auth_login: "/api/auth/login",
        admin: "/api/admin/*",
        game: "/api/game/*"
      }
    });
  });

  app.get("/health", (_req, res, next) => {
    void Promise.all([getEventState(), getActiveEvent()])
      .then(([state, event]) =>
        res.json({
          ok: true,
          active_event_id: state.active_event_id,
          is_paused: state.is_paused,
          pause_reason: state.pause_reason,
          game_duration_seconds: event?.game_duration ?? null
        })
      )
      .catch(next);
  });
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/game", gameRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
