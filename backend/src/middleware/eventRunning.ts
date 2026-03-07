import type { NextFunction, Request, Response } from "express";
import { getActiveEvent, getEventState } from "../repositories/eventRepo.js";
import { ApiError } from "../utils/apiError.js";

export async function enforceEventRunning(_req: Request, _res: Response, next: NextFunction): Promise<void> {
  const state = await getEventState();
  if (!state.active_event_id) {
    next(new ApiError(409, "No active event"));
    return;
  }
  if (state.is_paused) {
    next(new ApiError(423, `Event paused${state.pause_reason ? `: ${state.pause_reason}` : ""}`));
    return;
  }
  const activeEvent = await getActiveEvent();
  if (!activeEvent || activeEvent.status !== "active") {
    next(new ApiError(423, "Event is not currently running"));
    return;
  }
  next();
}
