/*
Usage:
  node scripts/simulate-28-combinations.mjs https://scan-to-survive.onrender.com/api admin YourStrongAdminPassword123! 28
*/

const [, , apiBase = "http://localhost:4000/api", adminUsername = "", adminPassword = ""] = process.argv;
const teamCountArg = Number(process.argv[5] ?? "28");
const TEAM_COUNT = Number.isFinite(teamCountArg) && teamCountArg >= 10 ? Math.floor(teamCountArg) : 28;
if (!adminUsername || !adminPassword) {
  console.error("Usage: node scripts/simulate-28-combinations.mjs <apiBase> <adminUsername> <adminPassword> [teamCount]");
  process.exit(1);
}

const TEAM_PASSWORD = "Team@123";
const BEST_TEAM = "team_01";

async function request(method, path, body, token) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload, method, path };
}

function toTime(seconds) {
  if (seconds == null || seconds < 0) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

const summary = {
  calls: 0,
  errors4xx: 0,
  errors5xx: 0,
  byStatusPath: {},
  scenarios: []
};

function track(res, scenarioName) {
  summary.calls += 1;
  if (!res.ok) {
    const key = `${res.status} ${res.method} ${res.path}`;
    summary.byStatusPath[key] = (summary.byStatusPath[key] ?? 0) + 1;
    if (res.status >= 500) summary.errors5xx += 1;
    else if (res.status >= 400) summary.errors4xx += 1;
  }
  if (scenarioName) {
    summary.scenarios.push({ scenario: scenarioName, status: res.status, ok: res.ok, error: res.payload?.error ?? null });
  }
}

const adminLogin = await request("POST", "/auth/login", { role: "admin", username: adminUsername, password: adminPassword });
track(adminLogin, "admin_login");
if (!adminLogin.ok) {
  console.error("Admin login failed", adminLogin.status, adminLogin.payload);
  process.exit(1);
}
const adminToken = adminLogin.payload.token;

for (const step of [
  ["reset_everything", "/admin/reset-everything", {}],
  [
    "configure_event",
    "/admin/configure-event",
    {
      total_teams: TEAM_COUNT,
      floor_room_map: [
        { floor: 4, available_rooms: 18 },
        { floor: 5, available_rooms: 18 }
      ],
      excluded_room_numbers: [],
      trap_count: 8,
      game_duration_hours: 1,
      max_hints: 3,
      question_pool_size: 300,
      max_teams_per_path: 4,
      difficulty_curve: {
        easy_orders: [1, 2],
        medium_orders: [3, 4],
        hard_orders: [5, 6],
        very_hard_orders: [7]
      }
    }
  ]
]) {
  const res = await request("POST", step[1], step[2], adminToken);
  track(res, step[0]);
  if (!res.ok) {
    console.error(`Failed at ${step[0]}`, res.status, res.payload);
    process.exit(1);
  }
}

const teams = Array.from({ length: TEAM_COUNT }, (_, i) => ({
  name: `team_${String(i + 1).padStart(2, "0")}`,
  password: TEAM_PASSWORD,
  token: "",
  id: "",
  roomCode: "",
  nextRoomNumber: null
}));

for (const team of teams) {
  const created = await request("POST", "/admin/create-team", { team_name: team.name, password: team.password }, adminToken);
  track(created, `create_${team.name}`);
}

const ops = await request("GET", "/admin/ops-package", undefined, adminToken);
track(ops, "ops_package");
const codeByRoom = new Map();
for (const row of ops.payload?.qr_placement_plan ?? []) {
  if (row?.room_number && row?.qr_code_payload) codeByRoom.set(String(row.room_number), String(row.qr_code_payload));
}
const bonusCodes = (ops.payload?.bonus_qr_plan ?? []).map((row) => row.code).filter(Boolean);

for (const team of teams) {
  const login = await request("POST", "/auth/login", { role: "team", team_name: team.name, password: team.password });
  track(login, `login_${team.name}`);
  if (login.ok) team.token = login.payload.token;
}

await Promise.all(
  teams.filter((t) => t.token).map(async (team) => {
    const start = await request("POST", "/game/start", {}, team.token);
    track(start, `start_${team.name}`);
    if (start.ok) {
      team.roomCode = start.payload?.active_prompt?.room_code ?? "";
      team.nextRoomNumber = start.payload?.next_target?.room_number ?? null;
    }
  })
);

const monitor = await request("GET", "/admin/monitor", undefined, adminToken);
track(monitor, "monitor_before_scenarios");
for (const row of monitor.payload?.teams ?? []) {
  const team = teams.find((t) => t.name === row.team_name);
  if (team) team.id = row.team_id;
}

function pickTeam(i) {
  return teams[i % teams.length];
}

async function validScanThenSubmit(team, scenario) {
  if (!team.token) return;
  const code = team.roomCode || (team.nextRoomNumber ? codeByRoom.get(String(team.nextRoomNumber)) ?? "" : "");
  if (!code) return;
  const scan = await request("POST", "/game/scan", { room_code: code }, team.token);
  track(scan, `${scenario}_scan_${team.name}`);
  const submit = await request("POST", "/game/submit", { room_code: code, answer: `ans_${scenario}` }, team.token);
  track(submit, `${scenario}_submit_${team.name}`);
  if (submit.ok) {
    team.roomCode = "";
    team.nextRoomNumber = submit.payload?.next_target?.room_number ?? team.nextRoomNumber;
  }
}

const scenarios = [
  async () => validScanThenSubmit(pickTeam(0), "s01_valid"),
  async () => track(await request("POST", "/game/scan", { room_code: "INVALID-ROOM" }, pickTeam(1).token), "s02_invalid_scan"),
  async () => track(await request("POST", "/game/hint", {}, pickTeam(2).token), "s03_hint"),
  async () => track(await request("POST", "/game/ability", { ability: "shield" }, pickTeam(3).token), "s04_ability_shield"),
  async () => track(await request("POST", "/game/ability", { ability: "pulse" }, pickTeam(4).token), "s05_ability_pulse"),
  async () => track(await request("POST", "/game/scan", { room_code: bonusCodes[0] ?? "none" }, pickTeam(5).token), "s06_powerup_scan"),
  async () => track(await request("POST", "/game/scan", { room_code: bonusCodes[8] ?? "none" }, pickTeam(6).token), "s07_rune_scan"),
  async () => track(await request("POST", "/game/start", {}, pickTeam(7).token), "s08_start_again"),
  async () => validScanThenSubmit(pickTeam(8), "s09_valid"),
  async () => track(await request("POST", "/game/submit", { room_code: "WRONG-CODE", answer: "x" }, pickTeam(9).token), "s10_wrong_submit"),
  async () => {
    const team = pickTeam(0);
    const relog = await request("POST", "/auth/login", { role: "team", team_name: team.name, password: TEAM_PASSWORD });
    track(relog, "s11_relogin_new_session");
    if (relog.ok) team.token = relog.payload.token;
  },
  async () => track(await request("POST", "/admin/pause", { reason: "scenario pause" }, adminToken), "s12_pause"),
  async () => track(await request("POST", "/game/scan", { room_code: "INVALID" }, pickTeam(1).token), "s13_scan_while_paused"),
  async () => track(await request("POST", "/admin/resume", {}, adminToken), "s14_resume"),
  async () => track(await request("POST", "/admin/broadcast", { message: "Scenario broadcast", level: "info" }, adminToken), "s15_broadcast"),
  async () => {
    const t = pickTeam(2);
    if (t.id) track(await request("POST", "/admin/force-unlock", { team_id: t.id, reason: "scenario unlock" }, adminToken), "s16_force_unlock");
  },
  async () => validScanThenSubmit(pickTeam(3), "s17_valid"),
  async () => track(await request("POST", "/game/hint", {}, pickTeam(4).token), "s18_hint"),
  async () => track(await request("POST", "/game/hint", {}, pickTeam(4).token), "s19_hint_again"),
  async () => track(await request("POST", "/game/ability", { ability: "shield" }, pickTeam(5).token), "s20_ability_shield"),
  async () => track(await request("GET", "/admin/monitor", undefined, adminToken), "s21_monitor_refresh"),
  async () => track(await request("GET", "/admin/readiness", undefined, adminToken), "s22_readiness_get"),
  async () => track(await request("GET", "/admin/leaderboard", undefined, adminToken), "s23_leaderboard_hidden_check"),
  async () => {
    const t = teams.find((team) => team.name === "team_10");
    if (t.id) track(await request("POST", "/admin/force-finish", { team_id: t.id, reason: "scenario finish" }, adminToken), "s24_force_finish");
  },
  async () => {
    const t = pickTeam(7);
    if (t.id) track(await request("POST", "/admin/disqualify", { team_id: t.id, reason: "scenario dq" }, adminToken), "s25_disqualify");
  },
  async () => validScanThenSubmit(pickTeam(8), "s26_valid"),
  async () => track(await request("POST", "/admin/reveal", {}, adminToken), "s27_reveal_board"),
  async () => {
    const best = teams.find((t) => t.name === BEST_TEAM);
    if (!best?.id) return;
    for (let i = 0; i < 6; i += 1) {
      track(await request("POST", "/admin/force-unlock", { team_id: best.id, reason: `best_case_${i}` }, adminToken), `s28_best_force_unlock_${i + 1}`);
    }
    track(await request("POST", "/admin/force-finish", { team_id: best.id, reason: "best_case_finish" }, adminToken), "s28_best_force_finish");
  }
];

for (const run of scenarios) {
  await run();
}

const finalMonitor = await request("GET", "/admin/monitor", undefined, adminToken);
track(finalMonitor, "monitor_after_scenarios");
for (const row of finalMonitor.payload?.teams ?? []) {
  if (row.status === "active" || row.status === "waiting") {
    track(
      await request("POST", "/admin/force-finish", { team_id: row.team_id, reason: "close_out_after_28_scenarios" }, adminToken),
      `close_force_finish_${row.team_name}`
    );
  }
}

const finale = await request("POST", "/admin/reveal-finale-sequence", {}, adminToken);
track(finale, "finale_sequence_reveal");
const leaderboard = await request("GET", "/admin/leaderboard", undefined, adminToken);
track(leaderboard, "leaderboard_after_finale");

const topThree = leaderboard.payload?.top_three ?? [];
console.log("Top 3:", topThree.map((r) => `${r.rank}. ${r.team_name} (${toTime(r.total_time_seconds)})`).join(" | ") || "n/a");
console.log("Best-case team row:", (leaderboard.payload?.rows ?? []).find((r) => r.team_name === BEST_TEAM) ?? null);
console.log("Summary:", summary);
if (summary.errors4xx > 0 || summary.errors5xx > 0) console.log("Error breakdown:", summary.byStatusPath);
