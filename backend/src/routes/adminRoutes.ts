import { Router } from "express";
import {
  broadcastController,
  configHistoryController,
  configureEventController,
  createTeamController,
  disqualifyController,
  exportBundleController,
  forceFinishController,
  forceUnlockController,
  incidentHealthController,
  launchController,
  leaderboardController,
  loadTestRecordController,
  monitorController,
  opsPackageController,
  pauseController,
  postEventReviewController,
  postGameAnalyticsController,
  readinessController,
  rankingAuditController,
  rollbackConfigController,
  resetEverythingController,
  resetTeamsController,
  replayTimelineController,
  revealFinaleController,
  revealFinaleSequenceController,
  revealController,
  resumeController,
  superAdminEndGameController,
  superAdminStartGameController,
  storyRouteReviewController
} from "../controllers/adminController.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const adminRouter = Router();

adminRouter.post(
  "/configure-event",
  rateLimit(30_000, 20),
  requireAuth,
  requireAdmin,
  asyncHandler(configureEventController)
);
adminRouter.post("/create-team", rateLimit(30_000, 50), requireAuth, requireAdmin, asyncHandler(createTeamController));
adminRouter.get("/monitor", rateLimit(10_000, 60), requireAuth, requireAdmin, asyncHandler(monitorController));
adminRouter.get("/readiness", rateLimit(10_000, 60), requireAuth, requireAdmin, asyncHandler(readinessController));
adminRouter.get("/incident-health", rateLimit(10_000, 60), requireAuth, requireAdmin, asyncHandler(incidentHealthController));
adminRouter.get("/ranking-audit", rateLimit(10_000, 60), requireAuth, requireAdmin, asyncHandler(rankingAuditController));
adminRouter.get("/story-route-review", rateLimit(10_000, 60), requireAuth, requireAdmin, asyncHandler(storyRouteReviewController));
adminRouter.get("/post-event-review", rateLimit(10_000, 60), requireAuth, requireAdmin, asyncHandler(postEventReviewController));
adminRouter.post("/load-test/record", rateLimit(10_000, 20), requireAuth, requireAdmin, asyncHandler(loadTestRecordController));
adminRouter.post("/launch", rateLimit(30_000, 20), requireAuth, requireAdmin, asyncHandler(launchController));
adminRouter.post(
  "/start-game",
  rateLimit(30_000, 10),
  requireAuth,
  requireAdmin,
  asyncHandler(superAdminStartGameController)
);
adminRouter.post(
  "/end-game",
  rateLimit(30_000, 10),
  requireAuth,
  requireAdmin,
  asyncHandler(superAdminEndGameController)
);
adminRouter.get("/config-history", rateLimit(10_000, 60), requireAuth, requireAdmin, asyncHandler(configHistoryController));
adminRouter.get("/ops-package", rateLimit(10_000, 60), requireAuth, requireAdmin, asyncHandler(opsPackageController));
adminRouter.get("/replay/:teamId", rateLimit(10_000, 60), requireAuth, requireAdmin, asyncHandler(replayTimelineController));
adminRouter.get("/post-game-analytics", rateLimit(10_000, 60), requireAuth, requireAdmin, asyncHandler(postGameAnalyticsController));
adminRouter.get("/leaderboard", rateLimit(10_000, 60), requireAuth, requireAdmin, asyncHandler(leaderboardController));
adminRouter.post("/reveal", rateLimit(30_000, 20), requireAuth, requireAdmin, asyncHandler(revealController));
adminRouter.post("/reveal-finale", rateLimit(30_000, 20), requireAuth, requireAdmin, asyncHandler(revealFinaleController));
adminRouter.post("/reveal-finale-sequence", rateLimit(30_000, 20), requireAuth, requireAdmin, asyncHandler(revealFinaleSequenceController));
adminRouter.post("/disqualify", rateLimit(30_000, 30), requireAuth, requireAdmin, asyncHandler(disqualifyController));
adminRouter.post("/pause", rateLimit(30_000, 20), requireAuth, requireAdmin, asyncHandler(pauseController));
adminRouter.post("/resume", rateLimit(30_000, 20), requireAuth, requireAdmin, asyncHandler(resumeController));
adminRouter.post("/broadcast", rateLimit(30_000, 30), requireAuth, requireAdmin, asyncHandler(broadcastController));
adminRouter.post("/rollback-config", rateLimit(30_000, 10), requireAuth, requireAdmin, asyncHandler(rollbackConfigController));
adminRouter.get("/export-bundle", rateLimit(10_000, 30), requireAuth, requireAdmin, asyncHandler(exportBundleController));
adminRouter.post("/reset-teams", rateLimit(60_000, 5), requireAuth, requireAdmin, asyncHandler(resetTeamsController));
adminRouter.post("/reset-everything", rateLimit(60_000, 3), requireAuth, requireAdmin, asyncHandler(resetEverythingController));
adminRouter.post("/force-finish", rateLimit(30_000, 30), requireAuth, requireAdmin, asyncHandler(forceFinishController));
adminRouter.post("/force-unlock", rateLimit(30_000, 30), requireAuth, requireAdmin, asyncHandler(forceUnlockController));
