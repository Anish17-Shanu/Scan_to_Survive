import type { NextFunction, Request, Response } from "express";
import { countTeamActionLogsSince, createLog } from "../repositories/logRepo.js";
import { ApiError } from "../utils/apiError.js";

export function teamThrottle(windowMs: number, maxRequests: number, actionKey: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user || req.user.role !== "team" || !req.user.eventId) {
      next();
      return;
    }
    const sinceIso = new Date(Date.now() - windowMs).toISOString();
    const actionType = `api_${actionKey}`;
    const hits = await countTeamActionLogsSince(req.user.eventId, req.user.sub, actionType, sinceIso);
    if (hits >= maxRequests) {
      next(new ApiError(429, "Too many requests, please try again shortly"));
      return;
    }
    await createLog({
      event_config_id: req.user.eventId,
      team_id: req.user.sub,
      action_type: actionType
    });
    next();
  };
}
