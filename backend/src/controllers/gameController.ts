import type { Request, Response } from "express";
import { z } from "zod";
import { getActiveEvent, getEventState } from "../repositories/eventRepo.js";
import { findTeamById } from "../repositories/teamRepo.js";
import { ApiError } from "../utils/apiError.js";
import { scanRoom, selectRapidCategory, startGame, submitAnswer, useAbility, useHint } from "../services/gameService.js";
import { adminLeaderboard, adminMonitor, publicWinnerDisplayBoard, teamMissionDebrief } from "../services/eventService.js";

const scanSchema = z.object({
  room_code: z.string().min(1)
});

const submitSchema = z.object({
  room_code: z.string().min(1),
  answer: z.string().min(1).max(300)
});

const abilitySchema = z.object({
  ability: z.enum(["shield", "pulse"])
});

const rapidCategorySchema = z.object({
  category: z.enum(["web", "database", "networking"])
});

export async function startController(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new ApiError(401, "Unauthorized");
  res.json(await startGame(req.user.sub));
}

export async function scanController(req: Request, res: Response): Promise<void> {
  const parsed = scanSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid scan payload");
  if (!req.user) throw new ApiError(401, "Unauthorized");
  res.json(await scanRoom(req.user.sub, parsed.data.room_code));
}

export async function submitController(req: Request, res: Response): Promise<void> {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid submit payload");
  if (!req.user) throw new ApiError(401, "Unauthorized");
  res.json(
    await submitAnswer(req.user.sub, {
      roomCode: parsed.data.room_code,
      answer: parsed.data.answer
    })
  );
}

export async function hintController(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new ApiError(401, "Unauthorized");
  res.json(await useHint(req.user.sub));
}

export async function abilityController(req: Request, res: Response): Promise<void> {
  const parsed = abilitySchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid ability payload");
  if (!req.user) throw new ApiError(401, "Unauthorized");
  res.json(await useAbility(req.user.sub, parsed.data.ability));
}

export async function rapidCategoryController(req: Request, res: Response): Promise<void> {
  const parsed = rapidCategorySchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid rapid category payload");
  if (!req.user) throw new ApiError(401, "Unauthorized");
  res.json(await selectRapidCategory(req.user.sub, parsed.data.category));
}

export async function publicLeaderboardController(req: Request, res: Response): Promise<void> {
  const payload = await adminLeaderboard();
  if (!req.user) {
    res.json(payload);
    return;
  }
  res.json({
    ...payload,
    team_debrief: await teamMissionDebrief(req.user.sub)
  });
}

export async function publicWinnerDisplayController(_req: Request, res: Response): Promise<void> {
  res.json(await publicWinnerDisplayBoard());
}

export async function teamStatusController(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new ApiError(401, "Unauthorized");
  const team = await findTeamById(req.user.sub);
  if (!team) throw new ApiError(404, "Team not found");
  const terminalStatuses = new Set(["completed", "timeout", "disqualified"]);
  res.json({
    team,
    should_redirect_finish: terminalStatuses.has(team.status)
  });
}

export async function publicSpectatorController(_req: Request, res: Response): Promise<void> {
  const monitor = (await adminMonitor()) as {
    event: Record<string, unknown>;
    live_leaderboard?: unknown[];
    room_occupancy?: unknown[];
    path_distribution?: unknown[];
    latest_broadcast?: unknown;
  };
  res.json({
    event: monitor.event,
    live_leaderboard: (monitor.live_leaderboard ?? []).slice(0, 8),
    room_occupancy: monitor.room_occupancy,
    path_distribution: monitor.path_distribution,
    latest_broadcast: monitor.latest_broadcast
  });
}

export async function publicHealthController(_req: Request, res: Response): Promise<void> {
  const [state, event] = await Promise.all([getEventState(), getActiveEvent()]);
  res.json({
    ok: true,
    server_time: new Date().toISOString(),
    active_event_id: state.active_event_id ?? null,
    event_status: event?.status ?? null,
    is_paused: state.is_paused,
    pause_reason: state.pause_reason ?? null
  });
}
