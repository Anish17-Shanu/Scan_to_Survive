import { supabase } from "../config/supabase.js";
import type { RoomRow } from "../types/models.js";

export async function insertRooms(rooms: Array<Omit<RoomRow, "id">>): Promise<RoomRow[]> {
  const { data, error } = await supabase.from("rooms").insert(rooms).select("*");
  if (error) throw error;
  return (data ?? []) as RoomRow[];
}

export async function clearRooms(eventConfigId: string): Promise<void> {
  const { error } = await supabase.from("rooms").delete().eq("event_config_id", eventConfigId);
  if (error) throw error;
}

export async function findRoomByCode(eventConfigId: string, roomCode: string): Promise<RoomRow | null> {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("event_config_id", eventConfigId)
    .eq("room_code", roomCode)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as RoomRow;

  const { data: allRows, error: allErr } = await supabase
    .from("rooms")
    .select("*")
    .eq("event_config_id", eventConfigId);
  if (allErr) throw allErr;

  const normalized = roomCode.trim().toLowerCase();
  const rows = (allRows ?? []) as RoomRow[];
  return rows.find((row) => row.room_code.trim().toLowerCase() === normalized) ?? null;
}

export async function listRoomsByEvent(eventConfigId: string): Promise<RoomRow[]> {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("event_config_id", eventConfigId)
    .order("floor", { ascending: true })
    .order("room_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RoomRow[];
}

export async function findExpectedRoom(eventConfigId: string, pathId: string, currentOrder: number): Promise<RoomRow | null> {
  if (currentOrder === 1) {
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("event_config_id", eventConfigId)
      .eq("is_entry", true)
      .single();
    if (error) throw error;
    return data as RoomRow;
  }

  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("event_config_id", eventConfigId)
    .eq("path_id", pathId)
    .eq("order_number", currentOrder - 1)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as RoomRow;

  const { data: finalRoom, error: finalErr } = await supabase
    .from("rooms")
    .select("*")
    .eq("event_config_id", eventConfigId)
    .eq("is_final", true)
    .maybeSingle();
  if (finalErr) throw finalErr;
  return (finalRoom as RoomRow | null) ?? null;
}
