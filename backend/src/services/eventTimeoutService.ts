import { getActiveEvent, getEventState, setEventStatus } from "../repositories/eventRepo.js";
import { createLog, listEventLogsByActions } from "../repositories/logRepo.js";
import { listTeamsByEvent, updateTeamWithVersion } from "../repositories/teamRepo.js";
import { elapsedSeconds } from "../utils/time.js";

function activeElapsedMs(input: {
  nowMs: number;
  logs: Array<{ action_type: string; timestamp: string }>;
  currentlyPaused: boolean;
}): number {
  const ordered = input.logs
    .slice()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const firstResume = ordered.find((row) => row.action_type === "event_resumed");
  if (!firstResume) return 0;

  let elapsed = 0;
  let runningSince = new Date(firstResume.timestamp).getTime();

  for (const row of ordered) {
    const ts = new Date(row.timestamp).getTime();
    if (ts < runningSince) continue;
    if (row.action_type === "event_paused" && runningSince !== -1) {
      elapsed += Math.max(0, ts - runningSince);
      runningSince = -1;
      continue;
    }
    if (row.action_type === "event_resumed" && runningSince === -1) {
      runningSince = ts;
    }
  }

  if (!input.currentlyPaused && runningSince !== -1) {
    elapsed += Math.max(0, input.nowMs - runningSince);
  }
  return elapsed;
}

export async function sweepEventTimeoutIfNeeded(trigger: string) {
  const event = await getActiveEvent();
  if (!event || event.status !== "active") return { timed_out: false };

  const teams = await listTeamsByEvent(event.id);
  const startedTeams = teams.filter((team) => Boolean(team.start_time));
  // Do not auto-timeout the event before gameplay has actually started.
  if (startedTeams.length === 0) {
    return { timed_out: false, active_elapsed_seconds: 0, reason: "no_started_teams" };
  }

  const state = await getEventState();
  const logs = (await listEventLogsByActions(event.id, ["event_resumed", "event_paused"], 2000)) as Array<{
    action_type: string;
    timestamp: string;
  }>;
  const elapsedMs = activeElapsedMs({
    nowMs: Date.now(),
    logs,
    currentlyPaused: state.is_paused
  });
  if (elapsedMs < event.game_duration * 1000) {
    return { timed_out: false, active_elapsed_seconds: Math.floor(elapsedMs / 1000) };
  }

  const terminal = new Set(["completed", "timeout", "disqualified"]);
  let updatedCount = 0;
  const finishedAt = new Date().toISOString();
  for (const team of teams) {
    if (terminal.has(team.status)) continue;
    const total = team.start_time
      ? Math.max(event.game_duration, elapsedSeconds(team.start_time)) + team.penalty_seconds
      : event.game_duration + team.penalty_seconds;
    const updated = await updateTeamWithVersion(team.id, team.version, {
      status: "timeout",
      phase: "completed",
      end_time: finishedAt,
      total_time_seconds: total
    });
    if (updated) updatedCount += 1;
  }

  await setEventStatus(event.id, "completed");
  await createLog({
    event_config_id: event.id,
    action_type: "event_auto_timeout_complete",
    metadata: {
      trigger,
      active_elapsed_seconds: Math.floor(elapsedMs / 1000),
      game_duration_seconds: event.game_duration,
      teams_closed: updatedCount
    }
  });
  return {
    timed_out: true,
    active_elapsed_seconds: Math.floor(elapsedMs / 1000),
    teams_closed: updatedCount
  };
}
