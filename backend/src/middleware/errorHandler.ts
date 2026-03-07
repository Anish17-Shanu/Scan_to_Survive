import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/apiError.js";
import { env } from "../config/env.js";

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Route not found" });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (typeof err === "object" && err !== null && "message" in err) {
    const message = String((err as { message: string }).message);
    logger.error("Unhandled error", { message });
    res.status(500).json({
      error: env.NODE_ENV === "development" ? message : "Internal server error"
    });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}
