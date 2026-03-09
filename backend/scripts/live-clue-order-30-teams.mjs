/*
Usage:
  node scripts/live-clue-order-30-teams.mjs https://scan-to-survive.onrender.com/api admin YourStrongAdminPassword123!
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [, , apiBase = "https://scan-to-survive.onrender.com/api", adminUsername = "", adminPassword = ""] = process.argv;
const TEAM_COUNT = 30;
const TEAM_PASSWORD = "Team@123";
const REQUEST_TIMEOUT_MS = 20000;
const STEP_DELAY_MS = 250;

if (!adminUsername || !adminPassword) {
  console.error("Usage: node scripts/live-clue-order-30-teams.mjs <apiBase> <adminUsername> <adminPassword>");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function request(method, endpoint, body, token) {
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
    return { ok: response.ok, status: response.status, payload, method, endpoint, duration_ms: Date.now() - started };
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
    return m ? String(Number.parseInt(m[1], 10) - Number.parseInt(m[2], 10)) : null;
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
  q = q.replace(/^\[Trap Challenge\]\s*/i, "");
  q = q.replace(/^\[Rapid \d+( \| [A-Z]+)?\]\s*/i, "");
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

const report = {
  meta: {
    apiBase,
    started_at: new Date().toISOString(),
    requested_teams: TEAM_COUNT,
    requested_paths: 3,
    requested_per_path: 10
  },
  transport: {
    calls: 0,
    errors4xx: 0,
    errors5xx: 0,
    errors: {}
  },
  event_setup: {
    teams_created: 0,
    teams_logged_in: 0,
    teams_started: 0,
    path_distribution: [],
    path_distribution_ok: false
  },
  storyline: {
    out_of_universe_hits: []
  },
  clue_order: {
    start_clues_decoded: 0,
    start_clue_failures: [],
    wrong_main_reroutes: 0,
    wrong_main_reroute_failures: [],
    shield_skips_verified: 0,
    shield_skip_failures: [],
    trap_recoveries_verified: 0,
    trap_recovery_failures: [],
    double_reroutes_verified: 0,
    double_reroute_failures: [],
    post_recovery_next_room_verified: 0,
    post_recovery_failures: [],
    same_room_clue_failures: []
  },
  product_checks: {
    hints_ok: 0,
    hint_failures: [],
    pulses_ok: 0,
    pulse_failures: [],
    powerups_ok: 0,
    powerup_failures: [],
    runes_ok: 0,
    rune_failures: []
  }
};

function track(res, label = "") {
  report.transport.calls += 1;
  if (!res.ok) {
    if (res.status >= 500 || res.status === 598) report.transport.errors5xx += 1;
    else if (res.status >= 400) report.transport.errors4xx += 1;
    const key = `${res.status} ${res.method} ${res.endpoint}${label ? ` | ${label}` : ""}`;
    report.transport.errors[key] = (report.transport.errors[key] ?? 0) + 1;
  }
}

function noteStoryLeak(label, text) {
  const normalized = normalize(text);
  const banned = ["event desk", "fallback route clue", "hint unavailable", "power-up unlocked", "rune fragment recovered"];
  if (banned.some((token) => normalized.includes(token))) {
    report.storyline.out_of_universe_hits.push({ label, text });
  }
}

function decodeAndValidateClue(team, clue, context, roomCodeByNumber, trapRoomNumbers = new Set()) {
  const decoded = decodeRoomFromClue(clue);
  if (!decoded) {
    return { ok: false, reason: "decode_failed", room_number: null, room_code: null, is_trap: false };
  }
  const roomCode = roomCodeByNumber.get(decoded) ?? null;
  if (!roomCode) {
    return { ok: false, reason: "room_code_missing", room_number: decoded, room_code: null, is_trap: false };
  }
  if (team.current_room_number && decoded === team.current_room_number) {
    report.clue_order.same_room_clue_failures.push({ team: team.team_name, context, room_number: decoded });
  }
  return {
    ok: true,
    reason: "ok",
    room_number: decoded,
    room_code: roomCode,
    is_trap: trapRoomNumbers.has(decoded)
  };
}

async function runSerial(items, fn) {
  for (const item of items) {
    await fn(item);
    await sleep(STEP_DELAY_MS);
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
        { floor: 4, available_rooms: 20 },
        { floor: 5, available_rooms: 20 }
      ],
      excluded_room_numbers: [],
      trap_count: 9,
      game_duration_hours: 1,
      max_hints: 4,
      question_pool_size: 1200,
      max_teams_per_path: 10,
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

const teams = Array.from({ length: TEAM_COUNT }, (_, idx) => ({
  team_name: `route_team_${String(idx + 1).padStart(2, "0")}`,
  password: TEAM_PASSWORD,
  token: "",
  current_room_number: "",
  current_room_code: "",
  current_question_text: "",
  path_id: null
}));

await runSerial(teams, async (team) => {
  const created = await request("POST", "/admin/create-team", { team_name: team.team_name, password: team.password }, adminToken);
  track(created, `create_${team.team_name}`);
  if (created.ok) report.event_setup.teams_created += 1;
});

const launch = await request("POST", "/admin/launch", {}, adminToken);
track(launch, "launch");
if (!launch.ok) {
  console.error("Launch failed", launch.status, launch.payload);
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
const trapRoomNumbers = new Set((ops.payload?.trap_rooms ?? []).map((row) => String(row.room_number)));
const powerCodes = {
  shield: [],
  pulse: [],
  hint: [],
  score: []
};
for (const row of ops.payload?.bonus_qr_plan ?? []) {
  const code = String(row?.code ?? "");
  if (code.endsWith("-shield")) powerCodes.shield.push(code);
  else if (code.endsWith("-pulse")) powerCodes.pulse.push(code);
  else if (code.endsWith("-hint")) powerCodes.hint.push(code);
  else if (code.endsWith("-score")) powerCodes.score.push(code);
}
const runeCodes = (ops.payload?.bonus_qr_plan ?? []).map((row) => String(row?.code ?? "")).filter((code) => code.includes("-RUNE-"));

await runSerial(teams, async (team) => {
  const login = await request("POST", "/auth/login", { role: "team", team_name: team.team_name, password: team.password });
  track(login, `login_${team.team_name}`);
  if (!login.ok) return;
  team.token = login.payload.token;
  report.event_setup.teams_logged_in += 1;
});

const activeTeams = teams.filter((team) => team.token);

await runSerial(activeTeams, async (team) => {
  const start = await request("POST", "/game/start", {}, team.token);
  track(start, `start_${team.team_name}`);
  if (!start.ok) return;
  report.event_setup.teams_started += 1;
  const decoded = decodeAndValidateClue(team, start.payload?.next_room_clue, "start", roomCodeByNumber, trapRoomNumbers);
  if (decoded.ok) {
    report.clue_order.start_clues_decoded += 1;
    team.current_room_number = decoded.room_number;
    team.current_room_code = decoded.room_code;
  } else {
    report.clue_order.start_clue_failures.push({ team: team.team_name, reason: decoded.reason });
  }
  noteStoryLeak(`${team.team_name}:start_intro`, start.payload?.story_intro ?? "");
});

const monitor = await request("GET", "/admin/monitor", undefined, adminToken);
track(monitor, "monitor");
if (monitor.ok) {
  report.event_setup.path_distribution = monitor.payload?.path_distribution ?? [];
  report.event_setup.path_distribution_ok =
    Array.isArray(monitor.payload?.path_distribution) &&
    monitor.payload.path_distribution.length === 3 &&
    monitor.payload.path_distribution.every((row) => row.assigned === 10);
  const pathByTeam = new Map((monitor.payload?.teams ?? []).map((row) => [row.team_name, row.path_id ?? null]));
  for (const team of activeTeams) {
    team.path_id = pathByTeam.get(team.team_name) ?? null;
  }
}

const plainRecovery = activeTeams.slice(0, 10);
const shieldRecovery = activeTeams.slice(10, 20);
const doubleReroute = activeTeams.slice(20, 30);

const supportTeams = activeTeams.slice(0, Math.min(4, activeTeams.length));
await runSerial(supportTeams, async (team, idx) => {
  const codes = [powerCodes.shield[idx], powerCodes.pulse[idx], powerCodes.hint[idx], powerCodes.score[idx]].filter(Boolean);
  for (const code of codes) {
    const res = await request("POST", "/game/scan", { room_code: code }, team.token);
    track(res, `${team.team_name}_power`);
    if (res.ok) report.product_checks.powerups_ok += 1;
    else report.product_checks.powerup_failures.push({ team: team.team_name, code, status: res.status, error: res.payload?.error ?? null });
  }
});

await runSerial(activeTeams.slice(0, Math.min(6, activeTeams.length)), async (team, idx) => {
  const code = runeCodes[idx];
  if (!code) return;
  const res = await request("POST", "/game/scan", { room_code: code }, team.token);
  track(res, `${team.team_name}_rune`);
  if (res.ok) report.product_checks.runes_ok += 1;
  else report.product_checks.rune_failures.push({ team: team.team_name, status: res.status, error: res.payload?.error ?? null });
});

async function scanMainAndWrongAnswer(team, index) {
  if (!team.current_room_code) return null;
  const scan = await request("POST", "/game/scan", { room_code: team.current_room_code }, team.token);
  track(scan, `${team.team_name}_main_scan`);
  if (!scan.ok || scan.payload?.type !== "question") {
    report.clue_order.wrong_main_reroute_failures.push({
      team: team.team_name,
      step: "main_scan",
      status: scan.status,
      error: scan.payload?.error ?? null
    });
    return null;
  }
  team.current_room_number = String(scan.payload?.room?.room_number ?? team.current_room_number);
  team.current_question_text = String(scan.payload?.room?.question_text ?? "");
  noteStoryLeak(`${team.team_name}:main_question`, team.current_question_text);

  if (index % 5 === 0) {
    const hint = await request("POST", "/game/hint", {}, team.token);
    track(hint, `${team.team_name}_main_hint`);
    if (hint.ok) {
      report.product_checks.hints_ok += 1;
      noteStoryLeak(`${team.team_name}:hint`, hint.payload?.hint ?? "");
    } else {
      report.product_checks.hint_failures.push({ team: team.team_name, status: hint.status, error: hint.payload?.error ?? null });
    }
  }

  if (index % 6 === 0) {
    const pulse = await request("POST", "/game/ability", { ability: "pulse" }, team.token);
    track(pulse, `${team.team_name}_main_pulse`);
    if (pulse.ok) {
      report.product_checks.pulses_ok += 1;
      noteStoryLeak(`${team.team_name}:pulse`, pulse.payload?.message ?? "");
    } else {
      report.product_checks.pulse_failures.push({ team: team.team_name, status: pulse.status, error: pulse.payload?.error ?? null });
    }
  }

  const submit = await request("POST", "/game/submit", { room_code: team.current_room_code, answer: "wrong_probe_answer" }, team.token);
  track(submit, `${team.team_name}_wrong_main_submit`);
  if (!submit.ok) {
    report.clue_order.wrong_main_reroute_failures.push({
      team: team.team_name,
      step: "wrong_main_submit",
      status: submit.status,
      error: submit.payload?.error ?? null
    });
    return null;
  }
  report.clue_order.wrong_main_reroutes += 1;
  const decoded = decodeAndValidateClue(team, submit.payload?.next_room_clue, "wrong_main_reroute", roomCodeByNumber, trapRoomNumbers);
  if (!decoded.ok || !decoded.is_trap) {
    report.clue_order.wrong_main_reroute_failures.push({
      team: team.team_name,
      step: "wrong_main_decode",
      reason: decoded.reason,
      room_number: decoded.room_number,
      is_trap: decoded.is_trap
    });
    return null;
  }
  return decoded;
}

async function verifyNextMainQuestion(team, clue, context) {
  const decoded = decodeAndValidateClue(team, clue, context, roomCodeByNumber, trapRoomNumbers);
  if (!decoded.ok || decoded.is_trap) {
    report.clue_order.post_recovery_failures.push({
      team: team.team_name,
      context,
      reason: decoded.reason,
      room_number: decoded.room_number,
      is_trap: decoded.is_trap
    });
    return;
  }
  const scan = await request("POST", "/game/scan", { room_code: decoded.room_code }, team.token);
  track(scan, `${team.team_name}_${context}_next_main_scan`);
  if (scan.ok && scan.payload?.type === "question") {
    report.clue_order.post_recovery_next_room_verified += 1;
    noteStoryLeak(`${team.team_name}:${context}_next_question`, scan.payload?.room?.question_text ?? "");
  } else {
    report.clue_order.post_recovery_failures.push({
      team: team.team_name,
      context,
      reason: "next_main_scan_failed",
      status: scan.status,
      error: scan.payload?.error ?? null
    });
  }
}

await runSerial(plainRecovery, async (team, index) => {
  const reroute = await scanMainAndWrongAnswer(team, index);
  if (!reroute) return;
  const trapScan = await request("POST", "/game/scan", { room_code: reroute.room_code }, team.token);
  track(trapScan, `${team.team_name}_trap_scan`);
  if (!trapScan.ok || trapScan.payload?.type !== "question") {
    report.clue_order.trap_recovery_failures.push({
      team: team.team_name,
      step: "trap_scan",
      status: trapScan.status,
      error: trapScan.payload?.error ?? null
    });
    return;
  }
  const trapQuestionText = String(trapScan.payload?.room?.question_text ?? "");
  const answers = answerIndex.get(extractQuestionCore(trapQuestionText)) ?? [];
  const trapAnswer = answers[0] ?? "";
  if (!trapAnswer) {
    report.clue_order.trap_recovery_failures.push({
      team: team.team_name,
      step: "trap_answer_lookup",
      question: trapQuestionText
    });
    return;
  }
  const trapSubmit = await request("POST", "/game/submit", { room_code: reroute.room_code, answer: trapAnswer }, team.token);
  track(trapSubmit, `${team.team_name}_trap_submit_correct`);
  if (!trapSubmit.ok) {
    report.clue_order.trap_recovery_failures.push({
      team: team.team_name,
      step: "trap_submit_correct",
      status: trapSubmit.status,
      error: trapSubmit.payload?.error ?? null
    });
    return;
  }
  report.clue_order.trap_recoveries_verified += 1;
  await verifyNextMainQuestion(team, trapSubmit.payload?.next_room_clue, "trap_recovery");
});

await runSerial(shieldRecovery, async (team, index) => {
  const reroute = await scanMainAndWrongAnswer(team, index + 10);
  if (!reroute) return;
  const shield = await request("POST", "/game/ability", { ability: "shield" }, team.token);
  track(shield, `${team.team_name}_arm_shield`);
  if (!shield.ok) {
    report.clue_order.shield_skip_failures.push({
      team: team.team_name,
      step: "arm_shield",
      status: shield.status,
      error: shield.payload?.error ?? null
    });
    return;
  }
  const trapScan = await request("POST", "/game/scan", { room_code: reroute.room_code }, team.token);
  track(trapScan, `${team.team_name}_shielded_trap_scan`);
  if (!trapScan.ok || trapScan.payload?.type !== "trap") {
    report.clue_order.shield_skip_failures.push({
      team: team.team_name,
      step: "shielded_trap_scan",
      status: trapScan.status,
      error: trapScan.payload?.error ?? null,
      type: trapScan.payload?.type ?? null
    });
    return;
  }
  report.clue_order.shield_skips_verified += 1;
  await verifyNextMainQuestion(team, trapScan.payload?.next_room_clue, "shield_skip");
});

await runSerial(doubleReroute, async (team, index) => {
  const firstReroute = await scanMainAndWrongAnswer(team, index + 20);
  if (!firstReroute) return;
  const firstTrapScan = await request("POST", "/game/scan", { room_code: firstReroute.room_code }, team.token);
  track(firstTrapScan, `${team.team_name}_double_first_trap_scan`);
  if (!firstTrapScan.ok || firstTrapScan.payload?.type !== "question") {
    report.clue_order.double_reroute_failures.push({
      team: team.team_name,
      step: "first_trap_scan",
      status: firstTrapScan.status,
      error: firstTrapScan.payload?.error ?? null
    });
    return;
  }
  const wrongTrapSubmit = await request("POST", "/game/submit", { room_code: firstReroute.room_code, answer: "wrong_probe_answer" }, team.token);
  track(wrongTrapSubmit, `${team.team_name}_double_first_trap_submit_wrong`);
  if (!wrongTrapSubmit.ok) {
    report.clue_order.double_reroute_failures.push({
      team: team.team_name,
      step: "first_trap_submit_wrong",
      status: wrongTrapSubmit.status,
      error: wrongTrapSubmit.payload?.error ?? null
    });
    return;
  }
  const secondReroute = decodeAndValidateClue(
    team,
    wrongTrapSubmit.payload?.next_room_clue,
    "double_reroute_second",
    roomCodeByNumber,
    trapRoomNumbers
  );
  if (!secondReroute.ok || !secondReroute.is_trap) {
    report.clue_order.double_reroute_failures.push({
      team: team.team_name,
      step: "second_reroute_decode",
      reason: secondReroute.reason,
      room_number: secondReroute.room_number,
      is_trap: secondReroute.is_trap
    });
    return;
  }
  const secondTrapScan = await request("POST", "/game/scan", { room_code: secondReroute.room_code }, team.token);
  track(secondTrapScan, `${team.team_name}_double_second_trap_scan`);
  if (!secondTrapScan.ok || secondTrapScan.payload?.type !== "question") {
    report.clue_order.double_reroute_failures.push({
      team: team.team_name,
      step: "second_trap_scan",
      status: secondTrapScan.status,
      error: secondTrapScan.payload?.error ?? null
    });
    return;
  }
  const secondTrapText = String(secondTrapScan.payload?.room?.question_text ?? "");
  const answers = answerIndex.get(extractQuestionCore(secondTrapText)) ?? [];
  const trapAnswer = answers[0] ?? "";
  if (!trapAnswer) {
    report.clue_order.double_reroute_failures.push({
      team: team.team_name,
      step: "second_trap_answer_lookup",
      question: secondTrapText
    });
    return;
  }
  const secondTrapSubmit = await request("POST", "/game/submit", { room_code: secondReroute.room_code, answer: trapAnswer }, team.token);
  track(secondTrapSubmit, `${team.team_name}_double_second_trap_submit_correct`);
  if (!secondTrapSubmit.ok) {
    report.clue_order.double_reroute_failures.push({
      team: team.team_name,
      step: "second_trap_submit_correct",
      status: secondTrapSubmit.status,
      error: secondTrapSubmit.payload?.error ?? null
    });
    return;
  }
  report.clue_order.double_reroutes_verified += 1;
  await verifyNextMainQuestion(team, secondTrapSubmit.payload?.next_room_clue, "double_reroute_recovery");
});

console.log("=== Live 30 Team Clue Order Audit ===");
console.log(JSON.stringify(report, null, 2));

if (report.transport.errors5xx > 0) process.exit(2);
