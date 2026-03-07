// Create this new file if it doesn't exist

import { findTeamById, updateTeamWithVersion } from "../repositories/teamRepo.js";
import { createLog } from "../repositories/logRepo.js";
import { elapsedSeconds } from "../utils/time.js";
import { ApiError } from "../utils/apiError.js";

export async function completeRapidFire(teamId: string) {
  const team = await findTeamById(teamId);
  if (!team) throw new ApiError(404, "Team not found");
  
  if (team.phase !== "rapid_fire") {
    throw new ApiError(409, "Team is not in rapid-fire phase");
  }

  const now = new Date();
  const rapidFireEndTime = now.toISOString();
  
  // Calculate total time including rapid-fire
  const totalSeconds = team.start_time 
    ? elapsedSeconds(team.start_time) + team.penalty_seconds
    : team.penalty_seconds;

  // Update team status to completed
  const updated = await updateTeamWithVersion(team.id, team.version, {
    status: "completed",
    phase: "completed",
    end_time: rapidFireEndTime,
    total_time_seconds: totalSeconds
  });

  if (!updated) throw new ApiError(409, "Concurrent update; retry");

  // Log rapid-fire completion
  await createLog({
    event_config_id: team.event_config_id,
    team_id: team.id,
    action_type: "rapid_fire_completed",
    metadata: {
      rapid_fire_score: team.rapid_fire_score,
      total_time_seconds: totalSeconds,
      final_points: team.points,
      completed_at: rapidFireEndTime
    }
  });

  // Return result payload for immediate display
  return {
    team_id: updated.id,
    team_name: updated.team_name,
    status: updated.status,
    phase: updated.phase,
    total_time_seconds: updated.total_time_seconds,
    points: updated.points,
    rapid_fire_score: updated.rapid_fire_score,
    hints_used: updated.hints_used,
    trap_hits: updated.trap_hits,
    message: "Rapid-fire complete! Results saved.",
    result_visible: true
  };
}

export async function getRapidFireResult(teamId: string) {
  const team = await findTeamById(teamId);
  if (!team) throw new ApiError(404, "Team not found");

  if (team.status !== "completed") {
    throw new ApiError(409, "Team has not completed rapid-fire yet");
  }

  return {
    team_id: team.id,
    team_name: team.team_name,
    status: team.status,
    phase: team.phase,
    total_time_seconds: team.total_time_seconds,
    points: team.points,
    rapid_fire_score: team.rapid_fire_score,
    hints_used: team.hints_used,
    trap_hits: team.trap_hits,
    end_time: team.end_time,
    result_visible: true
  };
}