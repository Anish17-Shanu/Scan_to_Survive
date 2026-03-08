import type { NextFunction, Request, Response } from "express";
import { getActiveEvent } from "../repositories/eventRepo.js";
import { findTeamById, updateTeamWithVersion } from "../repositories/teamRepo.js";
import { sweepEventTimeoutIfNeeded } from "../services/eventTimeoutService.js";
import { ApiError } from "../utils/apiError.js";
import { elapsedSeconds } from "../utils/time.js";

export async function enforceGameTimeout(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user || req.user.role !== "team") {
    next();
    return;
  }

  await sweepEventTimeoutIfNeeded("team_request");
  const [team, eventConfig] = await Promise.all([findTeamById(req.user.sub), getActiveEvent()]);
  if (!team || !eventConfig) {
    next();
    return;
  }
  if (team.status === "timeout") {
    next(new ApiError(410, "Game timed out"));
    return;
  }
  if (!team.start_time || team.status !== "active") {
    next();
    return;
  }

  const elapsed = elapsedSeconds(team.start_time);
  if (elapsed < eventConfig.game_duration) {
    next();
    return;
  }

  const total = eventConfig.game_duration + team.penalty_seconds;
  await updateTeamWithVersion(team.id, team.version, {
    status: "timeout",
    end_time: new Date().toISOString(),
    total_time_seconds: total
  });
  next(new ApiError(410, "Game timed out"));
}
