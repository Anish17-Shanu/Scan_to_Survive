export const TEAM_STATUS = {
  WAITING: "waiting",
  ACTIVE: "active",
  COMPLETED: "completed",
  TIMEOUT: "timeout",
  DISQUALIFIED: "disqualified"
} as const;

export const LOG_ACTIONS = {
  EVENT_CONFIGURED: "event_configured",
  TEAM_CREATED: "team_created",
  TEAM_LOGIN: "team_login",
  GAME_START: "game_start",
  ROOM_SCAN: "room_scan",
  TRAP_TRIGGERED: "trap_triggered",
  ANSWER_CORRECT: "answer_correct",
  ANSWER_WRONG: "answer_wrong",
  HINT_USED: "hint_used",
  TEAM_COMPLETED: "team_completed",
  DISQUALIFIED: "disqualified"
} as const;
