import { supabase } from "../config/supabase.js";
import type { EventConfigRow } from "../types/models.js";

export async function createEventConfig(payload: Omit<EventConfigRow, "id" | "created_at" | "status">): Promise<EventConfigRow> {
  const { data, error } = await supabase
    .from("event_config")
    .insert({ ...payload, status: "draft" })
    .select("*")
    .single();
  if (error) throw error;
  return data as EventConfigRow;
}

export async function activateEvent(eventConfigId: string): Promise<void> {
  const { error: configErr } = await supabase
    .from("event_config")
    .update({ status: "active" })
    .eq("id", eventConfigId);
  if (configErr) throw configErr;

  const { error: stateErr } = await supabase
    .from("event_state")
    .update({
      active_event_id: eventConfigId,
      leaderboard_visible: false,
      is_paused: false,
      pause_reason: null,
      pause_started_at: null
    })
    .eq("id", 1);
  if (stateErr) throw stateErr;
}

export async function getActiveEvent(): Promise<EventConfigRow | null> {
  const { data: stateRows, error: stateErr } = await supabase
    .from("event_state")
    .select("active_event_id")
    .order("id", { ascending: true })
    .limit(1);
  if (stateErr) throw stateErr;
  const state = stateRows?.[0];
  if (!state || !state.active_event_id) return null;

  const { data, error } = await supabase
    .from("event_config")
    .select("*")
    .eq("id", state.active_event_id)
    .maybeSingle();
  if (error) throw error;
  return (data as EventConfigRow | null) ?? null;
}

export async function getEventState(): Promise<{
  active_event_id: string | null;
  leaderboard_visible: boolean;
  is_paused: boolean;
  pause_reason: string | null;
  pause_started_at: string | null;
}> {
  const { data: rows, error } = await supabase
    .from("event_state")
    .select("active_event_id, leaderboard_visible, is_paused, pause_reason, pause_started_at")
    .order("id", { ascending: true })
    .limit(1);
  if (error) throw error;
  const row = rows?.[0];
  if (!row) {
    return {
      active_event_id: null,
      leaderboard_visible: false,
      is_paused: false,
      pause_reason: null,
      pause_started_at: null
    };
  }
  return row as {
    active_event_id: string | null;
    leaderboard_visible: boolean;
    is_paused: boolean;
    pause_reason: string | null;
    pause_started_at: string | null;
  };
}

export async function setLeaderboardVisible(visible: boolean): Promise<void> {
  const { error } = await supabase.from("event_state").update({ leaderboard_visible: visible }).eq("id", 1);
  if (error) throw error;
}

export async function setEventStatus(eventConfigId: string, status: "draft" | "active" | "completed"): Promise<void> {
  const { error } = await supabase.from("event_config").update({ status }).eq("id", eventConfigId);
  if (error) throw error;
}

export async function setPauseState(
  isPaused: boolean,
  reason: string | null,
  pauseStartedAt: string | null
): Promise<void> {
  const { error } = await supabase
    .from("event_state")
    .update({ is_paused: isPaused, pause_reason: reason, pause_started_at: pauseStartedAt })
    .eq("id", 1);
  if (error) throw error;
}

export async function resetAllEvents(): Promise<number> {
  const { count, error } = await supabase
    .from("event_config")
    .delete({ count: "exact" })
    .not("id", "is", null);
  if (error) throw error;

  const { error: stateErr } = await supabase
    .from("event_state")
    .upsert({
      id: 1,
      active_event_id: null,
      leaderboard_visible: false,
      is_paused: false,
      pause_reason: null,
      pause_started_at: null
    }, { onConflict: "id" });
  if (stateErr) throw stateErr;

  return count ?? 0;
}
