import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { login } from "../controllers/authController.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const authRouter = Router();

// Support large synchronized team logins from a shared network.
authRouter.post("/login", rateLimit(60_000, 500), asyncHandler(login));
