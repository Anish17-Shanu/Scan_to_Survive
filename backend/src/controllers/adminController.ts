import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../utils/apiError.js";
import {
  adminCreateTeam,
  adminLeaderboard,
  adminPostGameAnalytics,
  adminReplayTimeline,
  adminConfigHistory,
  adminExportBundle,
  adminIncidentHealth,
  adminMonitor,
  adminOpsPackage,
  adminPostEventReviewSummary,
  adminRecordLoadTest,
  adminRankingAudit,
  adminStoryRouteReview,
  broadcastHostMessage,
  configureEvent,
  disqualifyTeam,
  forceFinishTeam,
  forceUnlockNext,
  launchEventIfReady,
  pauseEvent,
  readinessStatus,
  resetEverything,
  resetAllTeamsForActiveEvent,
  rollbackToConfigSnapshot,
  revealFinaleTopThree,
  revealFinaleSequence,
  resumeEvent,
  revealLeaderboard,
  publicWinnerDisplayBoard,
  superAdminStartGame,
  superAdminEndGame
} from "../services/eventService.js";

const configureSchema = z.object({
  total_teams: z.number().int(),
  floor_room_map: z.array(
    z.object({
      floor: z.number().int().min(1),
      available_rooms: z.number().int().min(1)
    })
  ),
  excluded_room_numbers: z.array(z.string().trim().min(2).max(30)).default([]),
  trap_count: z.number().int(),
  game_duration_hours: z.number().positive(),
  max_hints: z.number().int(),
  difficulty_curve: z.object({
    easy_orders: z.array(z.number().int()).default([1, 2]),
    medium_orders: z.array(z.number().int()).default([3, 4]),
    hard_orders: z.array(z.number().int()).default([5, 6]),
    very_hard_orders: z.array(z.number().int()).default([7])
  }),
  question_pool_size: z.number().int(),
  max_teams_per_path: z.number().int()
});

const createTeamSchema = z.object({
  team_name: z.string().min(1),
  password: z.string().min(1)
});

const disqualifySchema = z.object({
  team_id: z.string().uuid(),
  reason: z.string().min(3).max(300)
});

const pauseSchema = z.object({
  reason: z.string().min(3).max(200)
});

const forceTeamSchema = z.object({
  team_id: z.string().uuid(),
  reason: z.string().min(3).max(300)
});

const broadcastSchema = z.object({
  message: z.string().trim().min(3).max(240),
  level: z.enum(["info", "warning", "critical"]).default("info")
});
const rollbackSchema = z.object({
  snapshot_log_id: z.number().int().positive()
});
const loadTestSchema = z.object({
  simulated_teams: z.number().int().min(5).max(500),
  notes: z.string().trim().max(500).optional()
});
const superAdminGameControlSchema = z.object({
  unlock_text: z.literal("SUPERADMIN"),
  note: z.string().trim().max(500).optional()
});

export async function configureEventController(req: Request, res: Response): Promise<void> {
  const parsed = configureSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid configuration payload");
  const data = await configureEvent(parsed.data);
  res.status(201).json(data);
}

export async function createTeamController(req: Request, res: Response): Promise<void> {
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid create-team payload");
  const team = await adminCreateTeam({
    teamName: parsed.data.team_name,
    password: parsed.data.password
  });
  res.status(201).json({ team });
}

export async function monitorController(_req: Request, res: Response): Promise<void> {
  res.json(await adminMonitor());
}

export async function opsPackageController(_req: Request, res: Response): Promise<void> {
  res.json(await adminOpsPackage());
}

export async function leaderboardController(_req: Request, res: Response): Promise<void> {
  res.json(await adminLeaderboard());
}

export async function revealController(_req: Request, res: Response): Promise<void> {
  res.json(await revealLeaderboard());
}

export async function revealFinaleController(_req: Request, res: Response): Promise<void> {
  res.json(await revealFinaleTopThree());
}

export async function revealFinaleSequenceController(_req: Request, res: Response): Promise<void> {
  res.json(await revealFinaleSequence());
}

export async function disqualifyController(req: Request, res: Response): Promise<void> {
  const parsed = disqualifySchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid disqualify payload");
  res.json(await disqualifyTeam(parsed.data.team_id, parsed.data.reason));
}

export async function pauseController(req: Request, res: Response): Promise<void> {
  const parsed = pauseSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid pause payload");
  res.json(await pauseEvent(parsed.data.reason));
}

export async function resumeController(_req: Request, res: Response): Promise<void> {
  res.json(await resumeEvent());
}

export async function forceFinishController(req: Request, res: Response): Promise<void> {
  const parsed = forceTeamSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid force-finish payload");
  res.json(await forceFinishTeam(parsed.data.team_id, parsed.data.reason));
}

export async function forceUnlockController(req: Request, res: Response): Promise<void> {
  const parsed = forceTeamSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid force-unlock payload");
  res.json(await forceUnlockNext(parsed.data.team_id, parsed.data.reason));
}

export async function readinessController(_req: Request, res: Response): Promise<void> {
  res.json(await readinessStatus());
}

export async function launchController(_req: Request, res: Response): Promise<void> {
  res.json(await launchEventIfReady());
}

export async function superAdminStartGameController(req: Request, res: Response): Promise<void> {
  const parsed = superAdminGameControlSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new ApiError(400, "Invalid privileged start payload");
  res.json(await superAdminStartGame(parsed.data.note));
}

export async function superAdminEndGameController(req: Request, res: Response): Promise<void> {
  const parsed = superAdminGameControlSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new ApiError(400, "Invalid privileged end payload");
  res.json(await superAdminEndGame(parsed.data.note));
}

export async function replayTimelineController(req: Request, res: Response): Promise<void> {
  const teamId = z.string().uuid().parse(req.params.teamId);
  res.json(await adminReplayTimeline(teamId));
}

export async function postGameAnalyticsController(_req: Request, res: Response): Promise<void> {
  res.json(await adminPostGameAnalytics());
}

export async function resetTeamsController(_req: Request, res: Response): Promise<void> {
  res.json(await resetAllTeamsForActiveEvent());
}

export async function resetEverythingController(_req: Request, res: Response): Promise<void> {
  res.json(await resetEverything());
}

export async function broadcastController(req: Request, res: Response): Promise<void> {
  const parsed = broadcastSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid broadcast payload");
  res.json(await broadcastHostMessage(parsed.data.message, parsed.data.level));
}

export async function configHistoryController(_req: Request, res: Response): Promise<void> {
  res.json(await adminConfigHistory());
}

export async function rollbackConfigController(req: Request, res: Response): Promise<void> {
  const parsed = rollbackSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid rollback payload");
  res.json(await rollbackToConfigSnapshot(parsed.data.snapshot_log_id));
}

export async function exportBundleController(_req: Request, res: Response): Promise<void> {
  res.json(await adminExportBundle());
}

export async function incidentHealthController(_req: Request, res: Response): Promise<void> {
  res.json(await adminIncidentHealth());
}

export async function rankingAuditController(_req: Request, res: Response): Promise<void> {
  res.json(await adminRankingAudit());
}

export async function loadTestRecordController(req: Request, res: Response): Promise<void> {
  const parsed = loadTestSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid load-test payload");
  res.json(await adminRecordLoadTest(parsed.data));
}

export async function storyRouteReviewController(_req: Request, res: Response): Promise<void> {
  res.json(await adminStoryRouteReview());
}

export async function postEventReviewController(_req: Request, res: Response): Promise<void> {
  res.json(await adminPostEventReviewSummary());
}

export async function publicWinnerDisplayController(_req: Request, res: Response): Promise<void> {
  const display = await publicWinnerDisplayBoard();
  res.json(display);
}
