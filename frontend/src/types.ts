export type TeamState = {
  id: string;
  team_name: string;
  status: string;
  phase: "main" | "rapid_fire" | "completed";
  assigned_path: string | null;
  current_order: number;
  current_room_id: string | null;
  hints_used: number;
  trap_hits: number;
  penalty_seconds: number;
  points: number;
  rapid_fire_start_time: string | null;
  rapid_fire_score: number;
  story_fragments_collected: number;
  combo_streak: number;
  shield_charges: number;
  shield_active: boolean;
  pulse_charges: number;
  start_time: string | null;
  end_time: string | null;
  total_time_seconds: number | null;
};

export type PulseState = {
  id: string;
  label: string;
};

export type BroadcastState = {
  level: string;
  message: string;
  timestamp: string;
};

export type AdminMonitorSnapshot = {
  event: {
    id: string;
    total_teams: number;
    game_duration: number;
    is_paused?: boolean;
    pause_reason?: string | null;
    active_pulse?: PulseState;
  };
  latest_broadcast?: BroadcastState | null;
  path_distribution: Array<{ path_name: string; assigned: number; max_capacity: number }>;
  room_occupancy: Array<{ room_number: string; count: number }>;
  live_leaderboard?: Array<{
    rank: number;
    team_id: string;
    team_name: string;
    status: string;
    phase: string;
    current_order: number;
    points: number;
    rapid_fire_score: number;
    hints_used: number;
    trap_hits: number;
    penalty_seconds: number;
    rapid_remaining_seconds?: number | null;
    rapid_answered?: number | null;
    rapid_total?: number | null;
    projected_total_seconds: number | null;
    progress_score: number;
    lead_reason?: string;
  }>;
  question_stats: {
    total_questions_in_pool: number;
    cached_team_questions: number;
  };
  final_key_supervision?: Array<{
    team_id: string;
    nexus: string | null;
    amiphoria: string | null;
    rapid_gate_scan: string | null;
  }>;
  fairness_alerts?: Array<{
    team_id: string;
    severity: "low" | "medium" | "high";
    reason: string;
  }>;
  post_game_analytics?: {
    finished_teams: number;
    timeout_teams: number;
    avg_points: number;
    accuracy: number;
    trap_trigger_count: number;
    top_missed_orders: Array<{ order: number; misses: number }>;
    bottleneck_rooms: Array<{ room_number: string; scans: number }>;
  };
  storyline?: {
    title: string;
    intro: string;
    objective: string;
  };
  instructions?: string[];
  bonus_qr_plan?: Array<{
    code: string;
    type: string;
    effect: string;
    recommended_placement: string;
  }>;
  qr_placement_plan?: Array<{
    room_number: string;
    floor: number;
    qr_code_payload: string;
    room_type: string;
    path_name: string | null;
    order_number: number | null;
  }>;
  trap_rooms?: Array<{
    room_number: string;
    floor: number;
    qr_code_payload: string;
    room_type: string;
    path_name: string | null;
    order_number: number | null;
  }>;
  teams: Array<{
    team_id: string;
    team_name: string;
    status: string;
    phase?: string;
    current_order: number;
    path_id: string | null;
    current_room: string | null;
    hints_used: number;
    trap_hits: number;
    penalty_seconds: number;
    rapid_remaining_seconds?: number | null;
    rapid_answered?: number | null;
    rapid_total?: number | null;
  }>;
  suspicious_activity: Array<{
    id: number;
    action_type: string;
    metadata: Record<string, unknown>;
    timestamp: string;
  }>;
};

export type AdminReadiness = {
  ok: boolean;
  active_event_id: string | null;
  is_paused: boolean;
  team_count: number;
  question_pool_count: number;
  issues: string[];
};
