import crypto from "node:crypto";
import { env } from "../config/env.js";
import { LOG_ACTIONS } from "../constants/game.js";
import { getActiveEvent } from "../repositories/eventRepo.js";
import { createLog } from "../repositories/logRepo.js";
import { findTeamByName, updateTeamWithVersion } from "../repositories/teamRepo.js";
import { comparePassword } from "../utils/password.js";
import { ApiError } from "../utils/apiError.js";
import { signAdminToken, signTeamToken } from "../utils/jwt.js";

export async function loginTeam(input: { teamName: string; password: string }) {
  const activeEvent = await getActiveEvent();
  if (!activeEvent) throw new ApiError(409, "No active event configured");
  if (activeEvent.status !== "active") throw new ApiError(409, "Event is not currently open for team login");

  const team = await findTeamByName(activeEvent.id, input.teamName);
  if (!team) throw new ApiError(401, "Invalid team credentials");

  const passOk = await comparePassword(input.password, team.password_hash);
  if (!passOk) throw new ApiError(401, "Invalid team credentials");
  if (team.status === "disqualified") throw new ApiError(403, "Team disqualified");

  const sessionId = crypto.randomUUID();
  const updated = await updateTeamWithVersion(team.id, team.version, { session_token: sessionId });
  if (!updated) throw new ApiError(409, "Concurrent login; retry");

  await createLog({
    event_config_id: activeEvent.id,
    team_id: team.id,
    action_type: LOG_ACTIONS.TEAM_LOGIN
  });

  const token = signTeamToken({
    sub: updated.id,
    role: "team",
    sessionId,
    eventId: activeEvent.id
  });
  return {
    token,
    device_policy: "multi_device_allowed",
    device_policy_note: "Team session can continue across devices and tabs without forced re-login.",
    team: {
      id: updated.id,
      team_name: updated.team_name,
      status: updated.status,
      hints_used: updated.hints_used,
      trap_hits: updated.trap_hits
    }
  };
}

export async function loginAdmin(input: { username: string; password: string }) {
  if (input.username !== env.ADMIN_USERNAME) throw new ApiError(401, "Invalid admin credentials");
  const passOk = await comparePassword(input.password, env.ADMIN_PASSWORD_HASH);
  if (!passOk) throw new ApiError(401, "Invalid admin credentials");
  return { token: signAdminToken({ sub: "admin", role: "admin" }) };
}
