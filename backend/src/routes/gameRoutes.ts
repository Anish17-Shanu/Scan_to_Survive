import { Router } from "express";
import {
  abilityController,
  hintController,
  publicHealthController,
  publicLeaderboardController,
  publicSpectatorController,
  teamStatusController,
  publicWinnerDisplayController,
  rapidCategoryController,
  scanController,
  startController,
  submitController
} from "../controllers/gameController.js";
import { requireAuth, requireTeam } from "../middleware/auth.js";
import { enforceEventRunning } from "../middleware/eventRunning.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { teamThrottle } from "../middleware/teamThrottle.js";
import { enforceGameTimeout } from "../middleware/timeout.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const gameRouter = Router();

gameRouter.post(
  "/start",
  // Allow very large synchronized starts while teamThrottle still protects each team session.
  rateLimit(30_000, 500),
  requireAuth,
  asyncHandler(requireTeam),
  asyncHandler(teamThrottle(30_000, 12, "start")),
  asyncHandler(enforceEventRunning),
  asyncHandler(enforceGameTimeout),
  asyncHandler(startController)
);
gameRouter.post(
  "/scan",
  rateLimit(10_000, 30),
  requireAuth,
  asyncHandler(requireTeam),
  asyncHandler(teamThrottle(10_000, 12, "scan")),
  asyncHandler(enforceEventRunning),
  asyncHandler(enforceGameTimeout),
  asyncHandler(scanController)
);
gameRouter.post(
  "/submit",
  rateLimit(10_000, 25),
  requireAuth,
  asyncHandler(requireTeam),
  asyncHandler(teamThrottle(10_000, 10, "submit")),
  asyncHandler(enforceEventRunning),
  asyncHandler(enforceGameTimeout),
  asyncHandler(submitController)
);
gameRouter.post(
  "/hint",
  rateLimit(30_000, 20),
  requireAuth,
  asyncHandler(requireTeam),
  asyncHandler(teamThrottle(30_000, 10, "hint")),
  asyncHandler(enforceEventRunning),
  asyncHandler(enforceGameTimeout),
  asyncHandler(hintController)
);
gameRouter.post(
  "/rapid-category",
  rateLimit(30_000, 20),
  requireAuth,
  asyncHandler(requireTeam),
  asyncHandler(teamThrottle(30_000, 10, "rapid-category")),
  asyncHandler(enforceEventRunning),
  asyncHandler(enforceGameTimeout),
  asyncHandler(rapidCategoryController)
);
gameRouter.post(
  "/ability",
  rateLimit(30_000, 25),
  requireAuth,
  asyncHandler(requireTeam),
  asyncHandler(teamThrottle(30_000, 15, "ability")),
  asyncHandler(enforceEventRunning),
  asyncHandler(enforceGameTimeout),
  asyncHandler(abilityController)
);
gameRouter.get(
  "/me-status",
  rateLimit(10_000, 90),
  requireAuth,
  asyncHandler(requireTeam),
  asyncHandler(enforceGameTimeout),
  asyncHandler(teamStatusController)
);
gameRouter.get("/leaderboard", rateLimit(10_000, 60), requireAuth, asyncHandler(publicLeaderboardController));
gameRouter.get("/winner-display", rateLimit(10_000, 90), asyncHandler(publicWinnerDisplayController));
gameRouter.get("/spectator", rateLimit(10_000, 90), asyncHandler(publicSpectatorController));
gameRouter.get("/health", rateLimit(10_000, 120), asyncHandler(publicHealthController));
