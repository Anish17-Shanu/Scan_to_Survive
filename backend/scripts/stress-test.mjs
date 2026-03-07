/*
Usage:
  node scripts/stress-test.mjs http://localhost:4000/api team_1 team_password 50
*/

const [, , apiBase = "http://localhost:4000/api", teamName = "team_1", password = "password123", loops = "20"] =
  process.argv;

const rounds = Number(loops);

async function post(path, payload, token) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload ?? {})
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

const login = await post("/auth/login", { role: "team", team_name: teamName, password });
if (!login.ok) {
  console.error("Login failed:", login.status, login.body);
  process.exit(1);
}
const token = login.body.token;

const start = await post("/game/start", {}, token);
console.log("start:", start.status, start.body.message);

const fakeCodes = ["INVALID-ROOM", "TRAP-FAKE", "ENTRY-FAKE"];
const summary = { scans: 0, submits: 0, hints: 0, failures: 0 };

for (let i = 0; i < rounds; i += 1) {
  const code = fakeCodes[i % fakeCodes.length];
  const scan = await post("/game/scan", { room_code: code }, token);
  summary.scans += 1;
  if (!scan.ok) summary.failures += 1;

  const submit = await post("/game/submit", { room_code: code, answer: "ans" }, token);
  summary.submits += 1;
  if (!submit.ok) summary.failures += 1;

  if (i % 3 === 0) {
    const hint = await post("/game/hint", {}, token);
    summary.hints += 1;
    if (!hint.ok) summary.failures += 1;
  }
}

console.log("Stress summary:", summary);
