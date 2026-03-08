/*
Usage:
  node scripts/full-gameplay-audit.mjs http://localhost:4000/api admin YourStrongAdminPassword123! 9
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [, , apiBase = "http://localhost:4000/api", adminUsername = "", adminPassword = "", teamCountRaw = "5"] = process.argv;
const TEAM_COUNT = Math.max(5, Math.min(20, Number.parseInt(teamCountRaw, 10) || 5));
const TEAM_PASSWORD = "Team@123";

if (!adminUsername || !adminPassword) {
  console.error("Usage: node scripts/full-gameplay-audit.mjs <apiBase> <adminUsername> <adminPassword> [teamCount]");
  process.exit(1);
}

function normalize(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function request(method, endpoint, body, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
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
    return { ok: response.ok, status: response.status, payload, endpoint, method };
  } catch (error) {
    return {
      ok: false,
      status: 598,
      payload: { error: error?.name === "AbortError" ? "request_timeout" : String(error?.message ?? error) },
      endpoint,
      method
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
    if (!m) return null;
    return m[1]
      .split("")
      .map((d) => String((Number.parseInt(d, 10) + 7) % 10))
      .join("");
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
    const plusFloor = Number.parseInt(m[1], 10);
    const floor = Number.parseInt(m[2], 10);
    if (!Number.isFinite(plusFloor) || !Number.isFinite(floor)) return null;
    return String(plusFloor - floor);
  }
  if (style === "code-snippet") {
    const m = text.match(/token="([0-9]+)"/i);
    if (!m) return null;
    return m[1].split("").reverse().join("");
  }
  if (style === "mirror") {
    const m = text.match(/mirror token\s+([0-9]+)/i);
    if (!m) return null;
    return m[1].split("").reverse().join("");
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
  let m;
  while ((m = re.exec(source)) !== null) {
    const q = normalize(m[1]);
    const variants = String(m[2])
      .split("|")
      .map((v) => normalize(v))
      .filter(Boolean);
    if (!map.has(q) && variants.length > 0) map.set(q, variants);
  }
  return map;
}

function firstAvailableCode(pool, usedSet) {
  for (const code of pool) {
    if (!usedSet.has(code)) return code;
  }
  return null;
}

function classifyGenericHint(text) {
  const t = normalize(text);
  return (
    t.includes("target concept is in") ||
    t.includes("exact technical term expected") ||
    t.includes("hint unavailable") ||
    t === "hint unavailable"
  );
}

const answerIndex = buildAnswerIndex();
const summary = {
  calls: 0,
  errors4xx: 0,
  errors5xx: 0,
  errors: {},
  checks: {
    teams_started: 0,
    hints_checked: 0,
    generic_hint_hits: 0,
    power_shield_claimed: 0,
    power_pulse_claimed: 0,
    power_hint_claimed: 0,
    power_score_claimed: 0,
    runes_claimed: 0,
    shield_blocks_seen: 0,
    pulse_used: 0,
    route_decodes_ok: 0,
    rapid_entered: 0,
    teams_completed: 0
  }
};

function track(res, label = "") {
  summary.calls += 1;
  if (!res.ok) {
    if (res.status >= 500) summary.errors5xx += 1;
    else if (res.status >= 400) summary.errors4xx += 1;
    const key = `${res.status} ${res.method} ${res.endpoint}${label ? ` | ${label}` : ""}`;
    summary.errors[key] = (summary.errors[key] ?? 0) + 1;
  }
}

const adminLogin = await request("POST", "/auth/login", { role: "admin", username: adminUsername, password: adminPassword });
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
        { floor: 4, available_rooms: 16 },
        { floor: 5, available_rooms: 16 }
      ],
      excluded_room_numbers: [],
      trap_count: 8,
      game_duration_hours: 1,
      max_hints: 4,
      question_pool_size: 700,
      max_teams_per_path: 3,
      difficulty_curve: {
        easy_orders: [1, 2],
        medium_orders: [3, 4],
        hard_orders: [5, 6],
        very_hard_orders: [7]
      }
    }
  ]
]) {
  const res = await request("POST", endpoint, body, adminToken);
  track(res, label);
  if (!res.ok) {
    console.error(`Failed ${label}`, res.status, res.payload);
    process.exit(1);
  }
}

const teams = Array.from({ length: TEAM_COUNT }, (_, i) => ({
  team_name: `qa_team_${String(i + 1).padStart(2, "0")}`,
  password: TEAM_PASSWORD,
  token: "",
  id: "",
  status: "waiting",
  phase: "main",
  current_room_code: "",
  current_question_text: "",
  last_clue: null,
  used_power_codes: new Set(),
  route_decode_failures: 0
}));

for (const t of teams) {
  const create = await request("POST", "/admin/create-team", { team_name: t.team_name, password: t.password }, adminToken);
  track(create, `create_${t.team_name}`);
}

const launch = await request("POST", "/admin/launch", {}, adminToken);
track(launch, "launch_event");
if (!launch.ok) {
  console.error("launch failed", launch.status, launch.payload);
  process.exit(1);
}

const ops = await request("GET", "/admin/ops-package", undefined, adminToken);
track(ops, "ops_package");
if (!ops.ok) {
  console.error("ops-package failed", ops.status, ops.payload);
  process.exit(1);
}

const roomCodeByNumber = new Map();
for (const row of ops.payload?.qr_placement_plan ?? []) {
  if (row?.room_number && row?.qr_code_payload) roomCodeByNumber.set(String(row.room_number), String(row.qr_code_payload));
}
const powerCodes = {
  shield: [],
  pulse: [],
  hint: [],
  score: []
};
for (const row of ops.payload?.bonus_qr_plan ?? []) {
  const code = String(row?.code ?? "");
  if (!code) continue;
  if (code.endsWith("-shield")) powerCodes.shield.push(code);
  else if (code.endsWith("-pulse")) powerCodes.pulse.push(code);
  else if (code.endsWith("-hint")) powerCodes.hint.push(code);
  else if (code.endsWith("-score")) powerCodes.score.push(code);
}
const runeCodes = (ops.payload?.bonus_qr_plan ?? []).map((r) => String(r?.code ?? "")).filter((c) => c.includes("-RUNE-"));
const finalKeyCodes = (ops.payload?.final_key_qr_plan ?? []).map((r) => String(r?.code ?? "")).filter(Boolean);
const shardCodes = finalKeyCodes.filter((c) => c.includes("FINAL-NEXUS") || c.includes("FINAL-AMIPHORIA"));
const rapidGateCode = finalKeyCodes.find((c) => c.includes("FINAL-RAPID")) ?? "";

for (const t of teams) {
  const login = await request("POST", "/auth/login", { role: "team", team_name: t.team_name, password: t.password });
  track(login, `login_${t.team_name}`);
  if (!login.ok) continue;
  t.token = login.payload.token;
  const start = await request("POST", "/game/start", {}, t.token);
  track(start, `start_${t.team_name}`);
  if (!start.ok) continue;
  t.status = start.payload?.team?.status ?? "active";
  t.phase = start.payload?.team?.phase ?? "main";
  t.last_clue = start.payload?.next_room_clue ?? null;
  const nextRoom = decodeRoomFromClue(t.last_clue);
  if (nextRoom && roomCodeByNumber.has(nextRoom)) {
    t.current_room_code = roomCodeByNumber.get(nextRoom);
    summary.checks.route_decodes_ok += 1;
  } else {
    t.route_decode_failures += 1;
  }
  summary.checks.teams_started += 1;
}

const runners = teams.filter((t) => t.token);
if (runners.length === 0) {
  console.error("No team session could start");
  process.exit(1);
}

const genericHintSamples = [];
const primaryRunner = runners[0];
const shieldRunner = runners[Math.min(1, runners.length - 1)];
const pulseRunner = runners[Math.min(2, runners.length - 1)];
const mixedRunner = runners[Math.min(3, runners.length - 1)];

for (const t of [primaryRunner, shieldRunner, pulseRunner, mixedRunner]) {
  const shieldCode = firstAvailableCode(powerCodes.shield, t.used_power_codes);
  if (shieldCode) {
    const res = await request("POST", "/game/scan", { room_code: shieldCode }, t.token);
    track(res, `${t.team_name}_power_shield`);
    if (res.ok) {
      t.used_power_codes.add(shieldCode);
      summary.checks.power_shield_claimed += 1;
    }
  }
  const pulseCode = firstAvailableCode(powerCodes.pulse, t.used_power_codes);
  if (pulseCode) {
    const res = await request("POST", "/game/scan", { room_code: pulseCode }, t.token);
    track(res, `${t.team_name}_power_pulse`);
    if (res.ok) {
      t.used_power_codes.add(pulseCode);
      summary.checks.power_pulse_claimed += 1;
    }
  }
  const hintCode = firstAvailableCode(powerCodes.hint, t.used_power_codes);
  if (hintCode) {
    const res = await request("POST", "/game/scan", { room_code: hintCode }, t.token);
    track(res, `${t.team_name}_power_hint`);
    if (res.ok) {
      t.used_power_codes.add(hintCode);
      summary.checks.power_hint_claimed += 1;
    }
  }
  const scoreCode = firstAvailableCode(powerCodes.score, t.used_power_codes);
  if (scoreCode) {
    const res = await request("POST", "/game/scan", { room_code: scoreCode }, t.token);
    track(res, `${t.team_name}_power_score`);
    if (res.ok) {
      t.used_power_codes.add(scoreCode);
      summary.checks.power_score_claimed += 1;
    }
  }
}

for (const t of runners.slice(0, 3)) {
  const rune = firstAvailableCode(runeCodes, t.used_power_codes);
  if (!rune) break;
  const res = await request("POST", "/game/scan", { room_code: rune }, t.token);
  track(res, `${t.team_name}_rune`);
  if (res.ok) {
    t.used_power_codes.add(rune);
    summary.checks.runes_claimed += 1;
  }
}

function pickAnswerForTeam(team, questionText) {
  const core = extractQuestionCore(questionText);
  const answers = answerIndex.get(core) ?? [];
  if (!answers.length) return "wrong_probe_answer";
  if (team === primaryRunner) return answers[0];
  if (team === shieldRunner) return "wrong_probe_answer";
  if (team === pulseRunner) return answers[0];
  return Math.random() < 0.6 ? answers[0] : "wrong_probe_answer";
}

const MAX_ROUNDS = 4;
const activeRunners = runners.slice(0, 3);
for (let round = 0; round < MAX_ROUNDS; round += 1) {
  for (const t of activeRunners) {

    if (t.phase === "rapid_fire") {
      const answer = pickAnswerForTeam(t, t.current_question_text);
      const rapidSubmit = await request("POST", "/game/submit", { room_code: "RAPID", answer }, t.token);
      track(rapidSubmit, `${t.team_name}_rapid_submit`);
      if (rapidSubmit.ok) {
        summary.checks.rapid_entered += 1;
        const rapidQ = rapidSubmit.payload?.rapid_question?.question_text;
        if (rapidQ) t.current_question_text = rapidQ;
      }
      continue;
    }

    if (!t.current_room_code && t.last_clue) {
      const roomNumber = decodeRoomFromClue(t.last_clue);
      if (roomNumber && roomCodeByNumber.has(roomNumber)) {
        t.current_room_code = roomCodeByNumber.get(roomNumber);
        summary.checks.route_decodes_ok += 1;
      } else {
        t.route_decode_failures += 1;
      }
    }

    if (!t.current_room_code) {
      const pulse = await request("POST", "/game/ability", { ability: "pulse" }, t.token);
      track(pulse, `${t.team_name}_pulse_for_route`);
      if (pulse.ok) {
        summary.checks.pulse_used += 1;
        if (pulse.payload?.next_room_clue) {
          t.last_clue = pulse.payload.next_room_clue;
          const decoded = decodeRoomFromClue(t.last_clue);
          if (decoded && roomCodeByNumber.has(decoded)) {
            t.current_room_code = roomCodeByNumber.get(decoded);
            summary.checks.route_decodes_ok += 1;
          }
        }
      }
      continue;
    }

    const scan = await request("POST", "/game/scan", { room_code: t.current_room_code }, t.token);
    track(scan, `${t.team_name}_scan`);
    if (!scan.ok) {
      if (scan.status === 409 && /Final key stage active|Rapid-fire chamber locked/i.test(String(scan.payload?.error ?? ""))) {
        for (const shard of shardCodes) {
          const s = await request("POST", "/game/scan", { room_code: shard }, t.token);
          track(s, `${t.team_name}_final_shard`);
        }
        if (rapidGateCode) {
          const rg = await request("POST", "/game/scan", { room_code: rapidGateCode }, t.token);
          track(rg, `${t.team_name}_rapid_gate`);
          if (rg.ok && rg.payload?.rapid_question?.question_text) {
            t.current_question_text = rg.payload.rapid_question.question_text;
          }
        }
      }
      continue;
    }

    if (scan.payload?.type === "powerup" || scan.payload?.type === "rune" || scan.payload?.type === "final_key") {
      if (scan.payload?.rapid_question?.question_text) {
        t.current_question_text = scan.payload.rapid_question.question_text;
        t.phase = "rapid_fire";
      }
      continue;
    }

    if (scan.payload?.type === "trap" && /Shield/.test(String(scan.payload?.message ?? ""))) {
      summary.checks.shield_blocks_seen += 1;
      t.last_clue = scan.payload?.next_room_clue ?? null;
      t.current_room_code = "";
      continue;
    }

    const questionText = scan.payload?.room?.question_text ?? "";
    t.current_question_text = questionText;

    if (round % 2 === 0) {
      const hint = await request("POST", "/game/hint", {}, t.token);
      track(hint, `${t.team_name}_hint`);
      if (hint.ok) {
        const h = String(hint.payload?.hint ?? "");
        summary.checks.hints_checked += 1;
        if (classifyGenericHint(h)) {
          summary.checks.generic_hint_hits += 1;
          genericHintSamples.push({ team: t.team_name, hint: h });
        }
      }
    }

    if (t === pulseRunner || (round % 3 === 0 && t === mixedRunner)) {
      const pulse = await request("POST", "/game/ability", { ability: "pulse" }, t.token);
      track(pulse, `${t.team_name}_pulse`);
      if (pulse.ok) summary.checks.pulse_used += 1;
    }

    if (t === shieldRunner && round % 3 === 0) {
      const arm = await request("POST", "/game/ability", { ability: "shield" }, t.token);
      track(arm, `${t.team_name}_shield_arm`);
    }

    const answer = pickAnswerForTeam(t, questionText);
    const submit = await request("POST", "/game/submit", { room_code: t.current_room_code, answer }, t.token);
    track(submit, `${t.team_name}_submit`);
    if (!submit.ok) continue;
    t.last_clue = submit.payload?.next_room_clue ?? null;
    t.current_room_code = "";
    if (submit.payload?.rapid_fire_ready) {
      for (const shard of shardCodes) {
        const s = await request("POST", "/game/scan", { room_code: shard }, t.token);
        track(s, `${t.team_name}_final_shard_ready`);
      }
      if (rapidGateCode) {
        const rg = await request("POST", "/game/scan", { room_code: rapidGateCode }, t.token);
        track(rg, `${t.team_name}_rapid_gate_ready`);
        if (rg.ok && rg.payload?.rapid_question?.question_text) {
          t.current_question_text = rg.payload.rapid_question.question_text;
          t.phase = "rapid_fire";
        }
      }
    }
  }
}

// Dedicated progression pass: drive one team through deeper checkpoints and attempt rapid/final flow.
for (let step = 0; step < 14; step += 1) {
  const t = primaryRunner;
  if (!t?.token) break;

  if (t.phase === "rapid_fire") {
    const rapidAns = pickAnswerForTeam(t, t.current_question_text);
    const rapidSubmit = await request("POST", "/game/submit", { room_code: "RAPID", answer: rapidAns }, t.token);
    track(rapidSubmit, `${t.team_name}_rapid_submit_deep`);
    if (rapidSubmit.ok) {
      summary.checks.rapid_entered += 1;
      if (rapidSubmit.payload?.rapid_question?.question_text) {
        t.current_question_text = rapidSubmit.payload.rapid_question.question_text;
      }
      if (rapidSubmit.payload?.completed) break;
    }
    continue;
  }

  if (!t.current_room_code && t.last_clue) {
    const nextRoom = decodeRoomFromClue(t.last_clue);
    if (nextRoom && roomCodeByNumber.has(nextRoom)) {
      t.current_room_code = roomCodeByNumber.get(nextRoom);
      summary.checks.route_decodes_ok += 1;
    } else {
      t.route_decode_failures += 1;
      break;
    }
  }
  if (!t.current_room_code) break;

  const scan = await request("POST", "/game/scan", { room_code: t.current_room_code }, t.token);
  track(scan, `${t.team_name}_deep_scan`);
  if (!scan.ok) {
    if (scan.status === 409 && /Final key stage active|Rapid-fire chamber locked/i.test(String(scan.payload?.error ?? ""))) {
      for (const shard of shardCodes) {
        const s = await request("POST", "/game/scan", { room_code: shard }, t.token);
        track(s, `${t.team_name}_deep_shard`);
      }
      if (rapidGateCode) {
        const rg = await request("POST", "/game/scan", { room_code: rapidGateCode }, t.token);
        track(rg, `${t.team_name}_deep_rapid_gate`);
        if (rg.ok && rg.payload?.rapid_question?.question_text) {
          t.current_question_text = rg.payload.rapid_question.question_text;
          t.phase = "rapid_fire";
        }
      }
    }
    continue;
  }

  if (scan.payload?.rapid_question?.question_text) {
    t.current_question_text = scan.payload.rapid_question.question_text;
    t.phase = "rapid_fire";
    continue;
  }
  if (scan.payload?.type !== "question") continue;

  const questionText = scan.payload?.room?.question_text ?? "";
  t.current_question_text = questionText;
  const answer = pickAnswerForTeam(primaryRunner, questionText);
  const submit = await request("POST", "/game/submit", { room_code: t.current_room_code, answer }, t.token);
  track(submit, `${t.team_name}_deep_submit`);
  if (!submit.ok) continue;
  t.current_room_code = "";
  t.last_clue = submit.payload?.next_room_clue ?? null;
  if (submit.payload?.rapid_fire_ready) {
    for (const shard of shardCodes) {
      const s = await request("POST", "/game/scan", { room_code: shard }, t.token);
      track(s, `${t.team_name}_deep_shard_ready`);
    }
    if (rapidGateCode) {
      const rg = await request("POST", "/game/scan", { room_code: rapidGateCode }, t.token);
      track(rg, `${t.team_name}_deep_rapid_gate_ready`);
      if (rg.ok && rg.payload?.rapid_question?.question_text) {
        t.current_question_text = rg.payload.rapid_question.question_text;
        t.phase = "rapid_fire";
      }
    }
  }
}

// Force progression for one team to verify final-key + rapid flow in this audit window.
const monitorForForce = await request("GET", "/admin/monitor", undefined, adminToken);
track(monitorForForce, "monitor_for_force_rapid");
const primaryRow = (monitorForForce.payload?.teams ?? []).find((row) => row.team_name === primaryRunner.team_name);
if (primaryRow?.team_id) {
  for (let i = 0; i < 8; i += 1) {
    const fu = await request(
      "POST",
      "/admin/force-unlock",
      { team_id: primaryRow.team_id, reason: `audit_rapid_push_${i + 1}` },
      adminToken
    );
    track(fu, `force_unlock_${i + 1}`);
  }
  for (const shard of shardCodes) {
    const s = await request("POST", "/game/scan", { room_code: shard }, primaryRunner.token);
    track(s, "forced_stage_shard");
  }
  if (rapidGateCode) {
    const rg = await request("POST", "/game/scan", { room_code: rapidGateCode }, primaryRunner.token);
    track(rg, "forced_stage_rapid_gate");
    if (rg.ok && rg.payload?.rapid_question?.question_text) {
      primaryRunner.phase = "rapid_fire";
      primaryRunner.current_question_text = rg.payload.rapid_question.question_text;
      for (let i = 0; i < 3; i += 1) {
        const rapidAns = pickAnswerForTeam(primaryRunner, primaryRunner.current_question_text);
        const rs = await request("POST", "/game/submit", { room_code: "RAPID", answer: rapidAns }, primaryRunner.token);
        track(rs, "forced_stage_rapid_submit");
        if (rs.ok) {
          summary.checks.rapid_entered += 1;
          if (rs.payload?.rapid_question?.question_text) {
            primaryRunner.current_question_text = rs.payload.rapid_question.question_text;
          }
        }
      }
    }
  }
}

const finalMonitor = await request("GET", "/admin/monitor", undefined, adminToken);
track(finalMonitor, "final_monitor");
if (finalMonitor.ok) {
  for (const row of finalMonitor.payload?.teams ?? []) {
    if (row.status === "completed" || row.status === "timeout") {
      summary.checks.teams_completed += 1;
    }
  }
}

console.log("=== Full Gameplay Audit Summary ===");
console.log(JSON.stringify(summary, null, 2));
console.log("=== Route Decode Failures (per team) ===");
console.log(
  runners
    .map((t) => ({ team: t.team_name, route_decode_failures: t.route_decode_failures }))
    .filter((r) => r.route_decode_failures > 0)
);
if (genericHintSamples.length > 0) {
  console.log("=== Generic Hint Samples ===");
  console.log(genericHintSamples.slice(0, 8));
}

if (summary.errors5xx > 0) process.exit(2);
