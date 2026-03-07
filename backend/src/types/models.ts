export type EventConfigRow = {
  id: string;
  total_teams: number;
  total_floors: number;
  total_available_rooms: number;
  floor_room_map: Array<{ floor: number; available_rooms: number }>;
  excluded_room_numbers: string[];
  trap_count: number;
  game_duration: number;
  max_hints: number;
  difficulty_curve: Record<string, unknown>;
  question_pool_size: number;
  max_teams_per_path: number;
  status: "draft" | "active" | "completed";
  created_at: string;
};

export type PathRow = {
  id: string;
  event_config_id: string;
  path_name: string;
  max_capacity: number;
  path_order: number;
};

export type RoomRow = {
  id: string;
  event_config_id: string;
  room_number: string;
  floor: number;
  path_id: string | null;
  order_number: number | null;
  room_code: string;
  is_trap: boolean;
  is_entry: boolean;
  is_final: boolean;
  difficulty_level: number | null;
  trap_base_probability: number;
};

export type TeamRow = {
  id: string;
  event_config_id: string;
  team_name: string;
  password_hash: string;
  assigned_path: string | null;
  current_order: number;
  phase: "main" | "rapid_fire" | "completed";
  version: number;
  session_token: string | null;
  current_room_id: string | null;
  hints_used: number;
  trap_hits: number;
  penalty_seconds: number;
  start_time: string | null;
  end_time: string | null;
  total_time_seconds: number | null;
  points: number;
  rapid_fire_start_time: string | null;
  rapid_fire_score: number;
  story_fragments_collected: number;
  combo_streak: number;
  shield_charges: number;
  shield_active: boolean;
  pulse_charges: number;
  status: "waiting" | "active" | "completed" | "timeout" | "disqualified";
  suspicious_score: number;
  created_at: string;
  updated_at: string;
};

export type QuestionRow = {
  id: string;
  event_config_id: string;
  difficulty_level: number;
  category: string;
  question_text: string;
  correct_answer: string;
  hint_primary: string;
  hint_secondary: string;
  active: boolean;
};

export type TeamQuestionRow = {
  id: string;
  event_config_id: string;
  team_id: string;
  order_number: number;
  question_id: string;
  cached_question: string;
  cached_answer: string;
  cached_hint_primary: string | null;
  cached_hint_secondary: string | null;
  difficulty_level: number;
  created_at: string;
};
