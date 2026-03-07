import type { NextFunction, Request, Response } from "express";
import { findTeamById } from "../repositories/teamRepo.js";
import { ApiError } from "../utils/apiError.js";
import { verifyToken } from "../utils/jwt.js";

function bearerToken(value?: string): string {
  if (!value || !value.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing authorization token");
  }
  return value.slice("Bearer ".length).trim();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    req.user = verifyToken(bearerToken(req.headers.authorization)) as Express.Request["user"];
    next();
  } catch {
    next(new ApiError(401, "Invalid or expired token"));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== "admin") {
    next(new ApiError(403, "Admin access required"));
    return;
  }
  next();
}

export async function requireTeam(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user || req.user.role !== "team") {
    next(new ApiError(403, "Team access required"));
    return;
  }

  const team = await findTeamById(req.user.sub);
  if (!team) {
    next(new ApiError(401, "Team account not found"));
    return;
  }

  req.user.eventId = team.event_config_id;
  next();
}
