import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../utils/apiError.js";
import { loginAdmin, loginTeam } from "../services/authService.js";
import { completeRapidFire, getRapidFireResult } from "../services/rapidFireService.js";

const loginSchema = z.object({
  role: z.enum(["team", "admin"]),
  team_name: z.string().trim().min(1).max(120).optional(),
  username: z.string().trim().min(2).max(40).optional(),
  password: z.string().min(1).max(128)
});

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "Invalid login payload");
  }

  if (parsed.data.role === "team") {
    if (!parsed.data.team_name) throw new ApiError(400, "team_name is required");
    const result = await loginTeam({
      teamName: parsed.data.team_name,
      password: parsed.data.password
    });
    res.json({ role: "team", ...result });
    return;
  }

  if (!parsed.data.username) throw new ApiError(400, "username is required");
  const result = await loginAdmin({
    username: parsed.data.username,
    password: parsed.data.password
  });
  res.json({ role: "admin", ...result });
}
export async function completeRapidFireController(req: Request, res: Response): Promise<void> {
  const teamId = z.string().uuid().parse(req.params.teamId);
  const result = await completeRapidFire(teamId);
  res.status(200).json(result);
}

export async function getRapidFireResultController(req: Request, res: Response): Promise<void> {
  const teamId = z.string().uuid().parse(req.params.teamId);
  const result = await getRapidFireResult(teamId);
  res.status(200).json(result);
}
