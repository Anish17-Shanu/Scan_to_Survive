import { supabase } from "../config/supabase.js";
import type { PathRow } from "../types/models.js";

export async function clearPaths(eventConfigId: string): Promise<void> {
  const { error } = await supabase.from("paths").delete().eq("event_config_id", eventConfigId);
  if (error) throw error;
}

export async function insertPaths(rows: Array<Omit<PathRow, "id">>): Promise<PathRow[]> {
  const { data, error } = await supabase.from("paths").insert(rows).select("*");
  if (error) throw error;
  return (data ?? []) as PathRow[];
}

export async function listPathsByEvent(eventConfigId: string): Promise<PathRow[]> {
  const { data, error } = await supabase
    .from("paths")
    .select("*")
    .eq("event_config_id", eventConfigId)
    .order("path_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PathRow[];
}
