import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { login } from "../controllers/authController.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const authRouter = Router();

authRouter.post("/login", rateLimit(60_000, 12), asyncHandler(login));
