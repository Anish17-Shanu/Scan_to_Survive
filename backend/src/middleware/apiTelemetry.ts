import type { NextFunction, Request, Response } from "express";
import { recordApiMetric } from "../services/telemetryService.js";

export function apiTelemetry(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    const path = req.originalUrl.split("?")[0] || req.path;
    if (!path.startsWith("/api/")) return;
    recordApiMetric({
      method: req.method,
      route: path,
      status: res.statusCode,
      duration_ms: Date.now() - start
    });
  });
  next();
}
