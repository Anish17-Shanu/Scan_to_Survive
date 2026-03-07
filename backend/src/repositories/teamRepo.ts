import { supabase } from "../config/supabase.js";
import type { TeamRow } from "../types/models.js";

export async function createTeam(payload: {
  event_config_id: string;
  team_name: string;
  password_hash: string;
}): Promise<TeamRow> {
  const { data, error } = await supabase
    .from("teams")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as TeamRow;
}

export async function findTeamById(teamId: string): Promise<TeamRow | null> {
  const { data, error } = await supabase.from("teams").select("*").eq("id", teamId).maybeSingle();
  if (error) throw error;
  return (data as TeamRow | null) ?? null;
}

export async function findTeamByName(eventConfigId: string, teamName: string): Promise<TeamRow | null> {
  const { data, error } = await supabase.from("teams").select("*").eq("event_config_id", eventConfigId);
  if (error) throw error;
  const needle = teamName.trim().toLowerCase();
  const rows = (data ?? []) as TeamRow[];
  return rows.find((row) => row.team_name.toLowerCase() === needle) ?? null;
}

export async function updateTeam(teamId: string, patch: Partial<TeamRow>): Promise<TeamRow> {
  const { data, error } = await supabase
    .from("teams")
    .update(patch)
    .eq("id", teamId)
    .select("*")
    .single();
  if (error) throw error;
  return data as TeamRow;
}

export async function updateTeamWithVersion(
  teamId: string,
  expectedVersion: number,
  patch: Partial<TeamRow>
): Promise<TeamRow | null> {
  const { data, error } = await supabase
    .from("teams")
    .update({ ...patch, version: expectedVersion + 1 })
    .eq("id", teamId)
    .eq("version", expectedVersion)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data as TeamRow | null) ?? null;
}

export async function listTeamsByEvent(eventConfigId: string): Promise<TeamRow[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("event_config_id", eventConfigId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TeamRow[];
}

export async function countTeamsByEvent(eventConfigId: string): Promise<number> {
  const { count, error } = await supabase
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("event_config_id", eventConfigId);
  if (error) throw error;
  return count ?? 0;
}

export async function deleteTeamsByEvent(eventConfigId: string): Promise<number> {
  const total = await countTeamsByEvent(eventConfigId);
  if (total === 0) return 0;
  const { error } = await supabase.from("teams").delete().eq("event_config_id", eventConfigId);
  if (error) throw error;
  return total;
}

export async function listLeaderboard(eventConfigId: string): Promise<TeamRow[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("event_config_id", eventConfigId)
    .in("status", ["completed", "timeout"])
    .order("total_time_seconds", { ascending: true, nullsFirst: false })
    .order("hints_used", { ascending: true })
    .order("trap_hits", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TeamRow[];
}
