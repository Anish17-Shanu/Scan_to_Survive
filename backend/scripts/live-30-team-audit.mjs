/*
Usage:
  node scripts/live-30-team-audit.mjs https://scan-to-survive.onrender.com/api admin YourStrongAdminPassword123! 30
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [, , apiBase = "https://scan-to-survive.onrender.com/api", adminUsername = "", adminPassword = "", teamCountRaw = "30"] =
  process.argv;
const TEAM_COUNT = Math.max(10, Math.min(50, Number.parseInt(teamCountRaw, 10) || 30));
const TEAM_PASSWORD = "Team@123";
const REQUEST_TIMEOUT_MS = 15000;
const ROUNDS = 4;

if (!adminUsername || !adminPassword) {
  console.error("Usage: node scripts/live-30-team-audit.mjs <apiBase> <adminUsername> <adminPassword> [teamCount]");
  process.exit(1);
}

function normalize(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function timedRequest(method, endpoint, body, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(`${apiBase}${endpoint}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      payload,
      method,
      endpoint,
      duration_ms: Date.now() - started
    };
  } catch (error) {
    return {
      ok: false,
      status: 598,
      payload: { error: error?.name === "AbortError" ? "request_timeout" : String(error?.message ?? error) },
      method,
      endpoint,
      duration_ms: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}

function decodeRoomFromClue(clue) {
  if (!clue || typeof clue !== "object") return null;
  const style = String(clue.clue_style ?? "");
  const text = String(clue.clue_text ?? "");
  if (style === "cipher") {
    const m = text.match(/:\s*([0-9]+)\s*$/);
    return m
      ? m[1]
          .split("")
          .map((d) => String((Number.parseInt(d, 10) + 7) % 10))
          .join("")
      : null;
  }
  if (style === "binary") {
    const m = text.match(/:\s*([01 ]+)\s*$/);
    if (!m) return null;
    const decoded = m[1]
      .trim()
      .split(/\s+/)
      .map((bin) => String.fromCharCode(Number.parseInt(bin, 2)))
      .join("");
    return /^\d+$/.test(decoded) ? decoded : null;
  }
  if (style === "logic") {
    const m = text.match(/room \+ floor =\s*([0-9]+)\.\s*Floor =\s*([0-9]+)/i);
    if (!m) return null;
    return String(Number.parseInt(m[1], 10) - Number.parseInt(m[2], 10));
  }
  if (style === "code-snippet") {
    const m = text.match(/token="([0-9]+)"/i);
    return m ? m[1].split("").reverse().join("") : null;
  }
  if (style === "mirror") {
    const m = text.match(/mirror token\s+([0-9]+)/i);
    return m ? m[1].split("").reverse().join("") : null;
  }
  return null;
}

function extractQuestionCore(questionText) {
  let q = String(questionText ?? "");
  q = q.replace(/^\[Room [^\]]+\]\s*/i, "");
  q = q.replace(/^NULL NODE CHALLENGE:\s*/i, "");
  q = q.replace(/\s*\[Answer format:[^\]]+\]\s*$/i, "");
  q = q.replace(/\s+\(Set \d+\)\s*$/i, "");
  return normalize(q);
}

function buildAnswerIndex() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const bankPath = path.resolve(scriptDir, "../src/data/beginnerQuestionBank.ts");
  const source = fs.readFileSync(bankPath, "utf-8");
  const re = /question:\s*"([^"]+)"\s*,\s*answer:\s*"([^"]+)"/g;
  const map = new Map();
  let match;
  while ((match = re.exec(source)) !== null) {
    const question = normalize(match[1]);
    const answers = String(match[2])
      .split("|")
      .map((v) => normalize(v))
      .filter(Boolean);
    if (!map.has(question) && answers.length > 0) map.set(question, answers);
  }
  return map;
}

const answerIndex = buildAnswerIndex();
const metrics = {
  started_at: new Date().toISOString(),
  calls: 0,
  errors4xx: 0,
  errors5xx: 0,
  error_breakdown: {},
  latency_by_endpoint: {},
  checks: {
    teams_created: 0,
    teams_logged_in: 0,
    teams_started: 0,
    route_decodes_ok: 0,
    route_decode_failures: 0,
    question_scans: 0,
    correct_submissions: 0,
    wrong_submissions: 0,
    hints_used: 0,
    pulses_used: 0,
    shields_armed: 0,
    powerups_claimed: 0,
    runes_claimed: 0,
    active_after_rounds: 0,
    completed_after_rounds: 0
  }
};

function track(res, label = "") {
  metrics.calls += 1;
  const key = `${res.method} ${res.endpoint}`;
  if (!metrics.latency_by_endpoint[key]) metrics.latency_by_endpoint[key] = [];
  metrics.latency_by_endpoint[key].push(res.duration_ms);
  if (!res.ok) {
    if (res.status >= 500 || res.status === 598) metrics.errors5xx += 1;
    else if (res.status >= 400) metrics.errors4xx += 1;
    const errorKey = `${res.status} ${res.method} ${res.endpoint}${label ? ` | ${label}` : ""}`;
    metrics.error_breakdown[errorKey] = (metrics.error_breakdown[errorKey] ?? 0) + 1;
  }
}

function summarizeLatencies() {
  const out = {};
  for (const [key, samples] of Object.entries(metrics.latency_by_endpoint)) {
    out[key] = {
      count: samples.length,
      avg_ms: Math.round(samples.reduce((sum, n) => sum + n, 0) / Math.max(1, samples.length)),
      p95_ms: percentile(samples, 95),
      max_ms: Math.max(...samples)
    };
  }
  return out;
}

const adminLogin = await timedRequest("POST", "/auth/login", { role: "admin", username: adminUsername, password: adminPassword });
track(adminLogin, "admin_login");
if (!adminLogin.ok) {
  console.error("Admin login failed", adminLogin.status, adminLogin.payload);
  process.exit(1);
}
const adminToken = adminLogin.payload.token;

for (const [label, endpoint, body] of [
  ["reset", "/admin/reset-everything", {}],
  [
    "configure",
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
      max_hints: 4,
      question_pool_size: 900,
      max_teams_per_path: 4,
      difficulty_curve: {
        easy_orders: [1, 2],
        medium_orders: [3, 4],
        hard_orders: [5, 6],
        very_hard_orders: [7]
      }
    }
  ],
  ["launch", "/admin/launch", {}]
]) {
  const res = await timedRequest("POST", endpoint, body, adminToken);
  track(res, label);
  if (!res.ok) {
    console.error(`Failed ${label}`, res.status, res.payload);
    process.exit(1);
  }
}

const teams = Array.from({ length: TEAM_COUNT }, (_, i) => ({
  team_name: `perf_team_${String(i + 1).padStart(2, "0")}`,
  password: TEAM_PASSWORD,
  token: "",
  next_room_code: "",
  next_clue: null,
  question_text: "",
  route_failures: 0
}));

await Promise.all(
  teams.map(async (team) => {
    const res = await timedRequest("POST", "/admin/create-team", { team_name: team.team_name, password: team.password }, adminToken);
    track(res, `create_${team.team_name}`);
    if (res.ok) metrics.checks.teams_created += 1;
  })
);

const ops = await timedRequest("GET", "/admin/ops-package", undefined, adminToken);
track(ops, "ops");
if (!ops.ok) {
  console.error("Ops package failed", ops.status, ops.payload);
  process.exit(1);
}

const roomCodeByNumber = new Map();
for (const row of ops.payload?.qr_placement_plan ?? []) {
  if (row?.room_number && row?.qr_code_payload) roomCodeByNumber.set(String(row.room_number), String(row.qr_code_payload));
}
const powerCodes = (ops.payload?.bonus_qr_plan ?? []).map((row) => String(row.code ?? "")).filter(Boolean);
const runeCodes = powerCodes.filter((code) => code.includes("-RUNE-"));
const nonRunePowerCodes = powerCodes.filter((code) => !code.includes("-RUNE-"));

await Promise.all(
  teams.map(async (team) => {
    const login = await timedRequest("POST", "/auth/login", { role: "team", team_name: team.team_name, password: team.password });
    track(login, `login_${team.team_name}`);
    if (!login.ok) return;
    team.token = login.payload.token;
    metrics.checks.teams_logged_in += 1;
  })
);

const activeTeams = teams.filter((t) => t.token);

await Promise.all(
  activeTeams.map(async (team) => {
    const start = await timedRequest("POST", "/game/start", {}, team.token);
    track(start, `start_${team.team_name}`);
    if (!start.ok) return;
    metrics.checks.teams_started += 1;
    team.next_clue = start.payload?.next_room_clue ?? null;
    const roomNumber = decodeRoomFromClue(team.next_clue);
    if (roomNumber && roomCodeByNumber.has(roomNumber)) {
      metrics.checks.route_decodes_ok += 1;
      team.next_room_code = roomCodeByNumber.get(roomNumber);
    } else {
      metrics.checks.route_decode_failures += 1;
      team.route_failures += 1;
    }
  })
);

await Promise.all(
  activeTeams.slice(0, Math.min(12, activeTeams.length)).map(async (team, idx) => {
    const powerCode = nonRunePowerCodes[idx % Math.max(1, nonRunePowerCodes.length)];
    if (!powerCode) return;
    const res = await timedRequest("POST", "/game/scan", { room_code: powerCode }, team.token);
    track(res, `power_${team.team_name}`);
    if (res.ok) metrics.checks.powerups_claimed += 1;
  })
);

await Promise.all(
  activeTeams.slice(0, Math.min(6, activeTeams.length)).map(async (team, idx) => {
    const rune = runeCodes[idx % Math.max(1, runeCodes.length)];
    if (!rune) return;
    const res = await timedRequest("POST", "/game/scan", { room_code: rune }, team.token);
    track(res, `rune_${team.team_name}`);
    if (res.ok) metrics.checks.runes_claimed += 1;
  })
);

for (let round = 0; round < ROUNDS; round += 1) {
  await Promise.all(
    activeTeams.map(async (team, idx) => {
      if (!team.next_room_code) return;

      if (round === 1 && idx % 7 === 0) {
        const hint = await timedRequest("POST", "/game/hint", {}, team.token);
        track(hint, `hint_${team.team_name}`);
        if (hint.ok) metrics.checks.hints_used += 1;
      }

      if (round === 1 && idx % 9 === 0) {
        const pulse = await timedRequest("POST", "/game/ability", { ability: "pulse" }, team.token);
        track(pulse, `pulse_${team.team_name}`);
        if (pulse.ok) metrics.checks.pulses_used += 1;
      }

      if (round === 2 && idx % 11 === 0) {
        const shield = await timedRequest("POST", "/game/ability", { ability: "shield" }, team.token);
        track(shield, `shield_${team.team_name}`);
        if (shield.ok) metrics.checks.shields_armed += 1;
      }

      const scan = await timedRequest("POST", "/game/scan", { room_code: team.next_room_code }, team.token);
      track(scan, `scan_${team.team_name}`);
      if (!scan.ok || scan.payload?.type !== "question") return;
      metrics.checks.question_scans += 1;

      team.question_text = String(scan.payload?.room?.question_text ?? "");
      const answers = answerIndex.get(extractQuestionCore(team.question_text)) ?? [];
      const correctAnswer = answers[0] ?? "fallback_wrong";
      const shouldAnswerWrong = round === 2 && idx % 13 === 0;
      const submit = await timedRequest(
        "POST",
        "/game/submit",
        { room_code: team.next_room_code, answer: shouldAnswerWrong ? "wrong_probe_answer" : correctAnswer },
        team.token
      );
      track(submit, `submit_${team.team_name}`);
      if (!submit.ok) return;
      if (shouldAnswerWrong) metrics.checks.wrong_submissions += 1;
      else metrics.checks.correct_submissions += 1;

      team.next_clue = submit.payload?.next_room_clue ?? null;
      const nextRoomNumber = decodeRoomFromClue(team.next_clue);
      if (nextRoomNumber && roomCodeByNumber.has(nextRoomNumber)) {
        metrics.checks.route_decodes_ok += 1;
        team.next_room_code = roomCodeByNumber.get(nextRoomNumber);
      } else {
        team.next_room_code = "";
        if (!submit.payload?.completed) {
          metrics.checks.route_decode_failures += 1;
          team.route_failures += 1;
        }
      }
    })
  );
}

const monitor = await timedRequest("GET", "/admin/monitor", undefined, adminToken);
track(monitor, "monitor");
if (monitor.ok) {
  for (const row of monitor.payload?.teams ?? []) {
    if (row.status === "active") metrics.checks.active_after_rounds += 1;
    if (row.status === "completed") metrics.checks.completed_after_rounds += 1;
  }
}

console.log("=== Live 30 Team Audit ===");
console.log(
  JSON.stringify(
    {
      apiBase,
      team_count_requested: TEAM_COUNT,
      team_count_started: metrics.checks.teams_started,
      checks: metrics.checks,
      errors4xx: metrics.errors4xx,
      errors5xx: metrics.errors5xx,
      error_breakdown: metrics.error_breakdown,
      latency_summary: summarizeLatencies()
    },
    null,
    2
  )
);

if (metrics.errors5xx > 0) process.exit(2);
