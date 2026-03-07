import { supabase } from "../config/supabase.js";

export async function createLog(payload: {
  event_config_id: string;
  team_id?: string | null;
  action_type: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from("logs").insert({
    event_config_id: payload.event_config_id,
    team_id: payload.team_id ?? null,
    action_type: payload.action_type,
    metadata: payload.metadata ?? {}
  });
  if (error) throw error;
}

export async function listRecentSuspiciousLogs(eventConfigId: string, limit = 20) {
  const { data, error } = await supabase
    .from("logs")
    .select("*")
    .eq("event_config_id", eventConfigId)
    .in("action_type", ["invalid_path_scan", "out_of_order_scan", "stale_session", "double_submit", "device_mismatch"])
    .order("timestamp", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listTeamActionLogs(
  eventConfigId: string,
  teamId: string,
  actionType: string,
  limit = 200
) {
  const { data, error } = await supabase
    .from("logs")
    .select("*")
    .eq("event_config_id", eventConfigId)
    .eq("team_id", teamId)
    .eq("action_type", actionType)
    .order("timestamp", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function hasTeamClaimedCode(
  eventConfigId: string,
  teamId: string,
  actionType: string,
  code: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("logs")
    .select("id")
    .eq("event_config_id", eventConfigId)
    .eq("team_id", teamId)
    .eq("action_type", actionType)
    .eq("metadata->>code", code)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function getLatestEventLogByAction(eventConfigId: string, actionType: string) {
  const { data, error } = await supabase
    .from("logs")
    .select("*")
    .eq("event_config_id", eventConfigId)
    .eq("action_type", actionType)
    .order("timestamp", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function listEventLogsByActions(
  eventConfigId: string,
  actionTypes: string[],
  limit = 2000
) {
  const { data, error } = await supabase
    .from("logs")
    .select("*")
    .eq("event_config_id", eventConfigId)
    .in("action_type", actionTypes)
    .order("timestamp", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listTeamLogs(eventConfigId: string, teamId: string, limit = 4000) {
  const { data, error } = await supabase
    .from("logs")
    .select("*")
    .eq("event_config_id", eventConfigId)
    .eq("team_id", teamId)
    .order("timestamp", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function countTeamActionLogsSince(
  eventConfigId: string,
  teamId: string,
  actionType: string,
  sinceIso: string
): Promise<number> {
  const { count, error } = await supabase
    .from("logs")
    .select("id", { count: "exact", head: true })
    .eq("event_config_id", eventConfigId)
    .eq("team_id", teamId)
    .eq("action_type", actionType)
    .gte("timestamp", sinceIso);
  if (error) throw error;
  return count ?? 0;
}
