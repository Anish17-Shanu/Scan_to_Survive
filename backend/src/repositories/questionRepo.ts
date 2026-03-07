import { supabase } from "../config/supabase.js";
import type { QuestionRow, TeamQuestionRow } from "../types/models.js";

export async function clearQuestionsByEvent(eventConfigId: string): Promise<void> {
  const { error } = await supabase.from("questions_pool").delete().eq("event_config_id", eventConfigId);
  if (error) throw error;
}

export async function insertQuestions(
  rows: Array<Omit<QuestionRow, "id">>
): Promise<QuestionRow[]> {
  const { data, error } = await supabase.from("questions_pool").insert(rows).select("*");
  if (error) throw error;
  return (data ?? []) as QuestionRow[];
}

export async function listQuestionsByDifficulty(
  eventConfigId: string,
  difficulty: number
): Promise<QuestionRow[]> {
  const { data, error } = await supabase
    .from("questions_pool")
    .select("*")
    .eq("event_config_id", eventConfigId)
    .eq("difficulty_level", difficulty)
    .eq("active", true);
  if (error) throw error;
  return (data ?? []) as QuestionRow[];
}

export async function clearTeamQuestions(teamId: string): Promise<void> {
  const { error } = await supabase.from("team_questions").delete().eq("team_id", teamId);
  if (error) throw error;
}

export async function upsertTeamQuestions(rows: Array<Omit<TeamQuestionRow, "id" | "created_at">>): Promise<void> {
  const { error } = await supabase.from("team_questions").upsert(rows, {
    onConflict: "team_id,order_number"
  });
  if (error) throw error;
}

export async function findTeamQuestion(teamId: string, orderNumber: number): Promise<TeamQuestionRow | null> {
  const { data, error } = await supabase
    .from("team_questions")
    .select("*")
    .eq("team_id", teamId)
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw error;
  return (data as TeamQuestionRow | null) ?? null;
}

export async function countQuestionsByEvent(eventConfigId: string): Promise<number> {
  const { count, error } = await supabase
    .from("questions_pool")
    .select("id", { count: "exact", head: true })
    .eq("event_config_id", eventConfigId)
    .eq("active", true);
  if (error) throw error;
  return count ?? 0;
}

export async function countTeamQuestionCacheByEvent(eventConfigId: string): Promise<number> {
  const { count, error } = await supabase
    .from("team_questions")
    .select("id", { count: "exact", head: true })
    .eq("event_config_id", eventConfigId);
  if (error) throw error;
  return count ?? 0;
}
