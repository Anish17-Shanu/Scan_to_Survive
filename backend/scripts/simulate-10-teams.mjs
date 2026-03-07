/*
Usage:
  node scripts/simulate-10-teams.mjs http://localhost:4000/api admin_username admin_password
*/

const [, , apiBase = "http://localhost:4000/api", adminUsername = "", adminPassword = ""] = process.argv;

if (!adminUsername || !adminPassword) {
  console.error("Missing admin credentials.");
  console.error("Usage: node scripts/simulate-10-teams.mjs <apiBase> <adminUsername> <adminPassword>");
  process.exit(1);
}

const TEAM_COUNT = 10;
const ITERATIONS = 8;
const TEAM_PASSWORD = "Team@123";

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
  return { ok: response.ok, status: response.status, payload };
}

async function adminPost(path, body, token) {
  return request("POST", path, body, token);
}

async function adminGet(path, token) {
  return request("GET", path, undefined, token);
}

function roomCodeMap(ops) {
  const map = new Map();
  for (const row of ops?.qr_placement_plan ?? []) {
    if (row?.room_number && row?.qr_code_payload) {
      map.set(String(row.room_number), String(row.qr_code_payload));
    }
  }
  return map;
}

function printResult(label, res) {
  const msg = typeof res?.payload?.error === "string" ? ` error=${res.payload.error}` : "";
  console.log(`${label} -> ${res.status}${msg}`);
}

const summary = {
  errors5xx: 0,
  errors4xx: 0,
  calls: 0,
  byStatusPath: {}
};

function track(res, method = "?", path = "?") {
  summary.calls += 1;
  if (!res.ok) {
    const key = `${res.status} ${method} ${path}`;
    summary.byStatusPath[key] = (summary.byStatusPath[key] ?? 0) + 1;
    if (res.status >= 500) summary.errors5xx += 1;
    else if (res.status >= 400) summary.errors4xx += 1;
  }
}

const adminLogin = await request("POST", "/auth/login", {
  role: "admin",
  username: adminUsername,
  password: adminPassword
});
track(adminLogin, "POST", "/auth/login");
if (!adminLogin.ok) {
  printResult("admin-login", adminLogin);
  process.exit(1);
}
const adminToken = adminLogin.payload.token;

const resetEverything = await adminPost("/admin/reset-everything", {}, adminToken);
track(resetEverything, "POST", "/admin/reset-everything");
printResult("reset-everything", resetEverything);

const configure = await adminPost(
  "/admin/configure-event",
  {
    total_teams: TEAM_COUNT,
    floor_room_map: [
      { floor: 4, available_rooms: 15 },
      { floor: 5, available_rooms: 15 }
    ],
    excluded_room_numbers: [],
    trap_count: 6,
    game_duration_hours: 1,
    max_hints: 2,
    question_pool_size: 250,
    max_teams_per_path: 4,
    difficulty_curve: {
      easy_orders: [1, 2],
      medium_orders: [3, 4],
      hard_orders: [5, 6],
      very_hard_orders: [7]
    }
  },
  adminToken
);
track(configure, "POST", "/admin/configure-event");
if (!configure.ok) {
  printResult("configure-event", configure);
  process.exit(1);
}
printResult("configure-event", configure);

const teams = Array.from({ length: TEAM_COUNT }, (_, i) => ({
  team_name: `team_${String(i + 1).padStart(2, "0")}`,
  password: TEAM_PASSWORD
}));

for (const team of teams) {
  const created = await adminPost("/admin/create-team", team, adminToken);
  track(created, "POST", "/admin/create-team");
  if (!created.ok) {
    printResult(`create-team:${team.team_name}`, created);
  }
}

const opsPackage = await adminGet("/admin/ops-package", adminToken);
track(opsPackage, "GET", "/admin/ops-package");
if (!opsPackage.ok) {
  printResult("ops-package", opsPackage);
  process.exit(1);
}
const codeByRoom = roomCodeMap(opsPackage.payload);

const states = [];
for (const team of teams) {
  const login = await request("POST", "/auth/login", {
    role: "team",
    team_name: team.team_name,
    password: team.password
  });
  track(login, "POST", "/auth/login");
  if (!login.ok) {
    printResult(`team-login:${team.team_name}`, login);
    continue;
  }
  states.push({
    name: team.team_name,
    token: login.payload.token,
    roomCode: "",
    nextRoomNumber: null
  });
}

await Promise.all(
  states.map(async (s) => {
    const start = await request("POST", "/game/start", {}, s.token);
    track(start, "POST", "/game/start");
    if (!start.ok) return;
    if (start.payload?.active_prompt?.room_code) s.roomCode = start.payload.active_prompt.room_code;
    if (start.payload?.next_target?.room_number) s.nextRoomNumber = String(start.payload.next_target.room_number);
  })
);

for (let i = 0; i < ITERATIONS; i += 1) {
  await Promise.all(
    states.map(async (s) => {
      if (!s.token) return;
      if (!s.roomCode && s.nextRoomNumber) s.roomCode = codeByRoom.get(s.nextRoomNumber) ?? "";

      if (s.roomCode) {
        const scan = await request("POST", "/game/scan", { room_code: s.roomCode }, s.token);
        track(scan, "POST", "/game/scan");
        if (scan.ok && scan.payload?.type === "question" && scan.payload?.room?.room_code) {
          s.roomCode = scan.payload.room.room_code;
        }
      }

      if (s.roomCode) {
        const submit = await request(
          "POST",
          "/game/submit",
          { room_code: s.roomCode, answer: `guess_${i}_${s.name}` },
          s.token
        );
        track(submit, "POST", "/game/submit");
        if (submit.ok) {
          s.roomCode = "";
          if (submit.payload?.next_target?.room_number) {
            s.nextRoomNumber = String(submit.payload.next_target.room_number);
          }
        }
      }

      if (i % 3 === 0) {
        const hint = await request("POST", "/game/hint", {}, s.token);
        track(hint, "POST", "/game/hint");
      }
    })
  );
}

const monitor = await adminGet("/admin/monitor", adminToken);
track(monitor, "GET", "/admin/monitor");
if (monitor.ok) {
  for (const team of monitor.payload?.teams ?? []) {
    if (team.status === "active" || team.status === "waiting") {
      const ff = await adminPost(
        "/admin/force-finish",
        { team_id: team.team_id, reason: "simulation completion" },
        adminToken
      );
      track(ff, "POST", "/admin/force-finish");
    }
  }
}

const finale = await adminPost("/admin/reveal-finale-sequence", {}, adminToken);
track(finale, "POST", "/admin/reveal-finale-sequence");
printResult("reveal-finale-sequence", finale);

const leaderboard = await adminGet("/admin/leaderboard", adminToken);
track(leaderboard, "GET", "/admin/leaderboard");
if (leaderboard.ok) {
  const top = (leaderboard.payload?.top_three ?? []).map((r) => `${r.rank}. ${r.team_name}`).join(" | ");
  console.log(`Top 3: ${top || "n/a"}`);
}

console.log("Simulation summary:", summary);
if (summary.errors4xx > 0 || summary.errors5xx > 0) {
  console.log("Error breakdown:", summary.byStatusPath);
}
if (summary.errors5xx > 0) {
  console.error("Detected server-side failures (5xx). Investigate before production event.");
  process.exit(2);
}
