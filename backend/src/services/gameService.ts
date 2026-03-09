import { env } from "../config/env.js";
import { LOG_ACTIONS } from "../constants/game.js";
import { getActiveEvent } from "../repositories/eventRepo.js";
import {
  createLog,
  getLatestEventLogByAction,
  hasTeamClaimedCode,
  listTeamActionLogs
} from "../repositories/logRepo.js";
import { listPathsByEvent } from "../repositories/pathRepo.js";
import {
  clearTeamQuestions,
  findTeamQuestion,
  listQuestionsByDifficulty,
  upsertTeamQuestions
} from "../repositories/questionRepo.js";
import { findExpectedRoom, findRoomByCode, listRoomsByEvent } from "../repositories/roomRepo.js";
import { findTeamById, listTeamsByEvent, updateTeamWithVersion } from "../repositories/teamRepo.js";
import { ApiError } from "../utils/apiError.js";
import { buildFinalKeyCodes, pickFinalKeyAnchors } from "../utils/finalKeyPlan.js";
import { buildGameplayMeta, buildMilestoneBadge } from "../utils/gameplayUtils.js";
import { resolveNodeIdentity } from "../utils/roomNodeIdentity.js";
import { elapsedSeconds } from "../utils/time.js";

const RAPID_FIRE_DURATION_SECONDS = 5 * 60;
const RAPID_FIRE_QUESTIONS = 5;
const GLOBAL_PULSE_WINDOW_SECONDS = 15 * 60;
const GLOBAL_PULSES = [
  { id: "double_points", label: "Double Points", pointsMultiplier: 2, trapPenaltyMultiplier: 1, hintPenaltyMultiplier: 1 },
  { id: "trap_surge", label: "Trap Surge", pointsMultiplier: 1, trapPenaltyMultiplier: 1.35, hintPenaltyMultiplier: 1 },
  { id: "safe_corridor", label: "Safe Corridor", pointsMultiplier: 1.1, trapPenaltyMultiplier: 0.65, hintPenaltyMultiplier: 1 },
  { id: "hint_storm", label: "Hint Storm", pointsMultiplier: 1, trapPenaltyMultiplier: 1, hintPenaltyMultiplier: 0.5 }
] as const;
const STORY_FRAGMENTS = [
  {
    title: "Fragment I",
    text: "NULL breached the university grid at 02:17. The first corruption signature appeared in the node clock.",
    artifact: "Clock Anchor",
    bonusPoints: 20
  },
  {
    title: "Fragment II",
    text: "Mission telemetry confirms routes are encoded as node memory traces, not maps.",
    artifact: "Memory Cipher",
    bonusPoints: 24
  },
  {
    title: "Fragment III",
    text: "Every trap node is behavior-adaptive. Survive one and NULL leaks a weakness.",
    artifact: "Fear Lattice",
    bonusPoints: 28
  },
  {
    title: "Fragment IV",
    text: "NULL split the final access key into two independent shard signatures.",
    artifact: "Dual Covenant",
    bonusPoints: 32
  },
  {
    title: "Fragment V",
    text: "Speed alone fails here. The teams who listen, decode, and trust each other survive.",
    artifact: "Trust Sigil",
    bonusPoints: 36
  },
  {
    title: "Fragment VI",
    text: "The rogue node predicted logic, but not instinct. Human judgment breaks its model.",
    artifact: "Intuition Lens",
    bonusPoints: 40
  },
  {
    title: "Fragment VII",
    text: "The restoration ledger records stability loss as well as correct recoveries.",
    artifact: "Ledger Scar",
    bonusPoints: 45
  },
  {
    title: "Fragment VIII",
    text: "Final warning: once the rapid-fire gate opens, the core grid has minutes before total takeover.",
    artifact: "City Firewall Key",
    bonusPoints: 55
  }
] as const;
const STORY_MILESTONES: Record<number, number> = {
  2: 35,
  4: 55,
  6: 75,
  8: 100
};
const STORY_MILESTONE_TITLES: Record<number, string> = {
  2: "Route Stabilized",
  4: "NULL Breach",
  6: "Firewall Fracture",
  8: "Core Resonance"
};
const BOSS_ORDERS = new Set([3, 6, 9]);
const CLUE_STYLES = ["cipher", "binary", "logic", "code-snippet", "pattern"] as const;
const RAPID_CATEGORIES = ["web", "database", "networking"] as const;
const TRAP_CLASSES = ["time_drain", "points_drain", "false_clue", "ability_lock"] as const;
type RapidCategory = (typeof RAPID_CATEGORIES)[number];
type TrapClass = (typeof TRAP_CLASSES)[number];

function normalize(answer: string): string {
  return answer.trim().toLowerCase();
}

function answerVariants(answer: string): string[] {
  return answer
    .split("|")
    .map((v) => normalize(v))
    .filter(Boolean);
}

function isAnswerMatch(submitted: string, expected: string): boolean {
  const submittedNorm = normalize(submitted);
  return answerVariants(expected).some((variant) => variant === submittedNorm);
}

function primaryAnswer(expected: string): string {
  return answerVariants(expected)[0] ?? "";
}

function answerFormatGuide(question: string, expected: string): string {
  const normalizedQuestion = normalize(question);
  const variants = answerVariants(expected);
  const primary = variants[0] ?? "";
  if (!primary) return "Answer format: short technical term.";
  if (variants.length > 1) return "Answer format: either accepted standard variant is valid.";
  if (/yes or no|yes\/no/.test(normalizedQuestion)) return "Answer format: use exactly 'yes' or 'no'.";
  if (/without\s*<\s*>/.test(question)) return "Answer format: tag/token only, no angle brackets.";
  if (/^git\s+[a-z]/.test(primary)) return "Answer format: full git command (include 'git').";
  if (/^[0-9]+$/.test(primary)) return "Answer format: digits only (no words).";
  if (/^[a-z]+(\.[a-z0-9]+)+$/.test(primary)) return "Answer format: dot-notation token.";
  if (/^[#/%][a-z0-9/]*$/.test(primary) || /\/\//.test(primary)) return "Answer format: exact symbol/token.";
  if (primary.includes(" ")) return "Answer format: lowercase words with spaces.";
  return "Answer format: single lowercase technical term.";
}

function buildHintText(difficulty: number, question: string, expected: string): string {
  return `Hint (${difficulty}): focus on the most specific noun in the question. ${answerFormatGuide(question, expected)}`;
}

function normalizeHintText(text?: string | null): string | null {
  const t = String(text ?? "").trim();
  return t.length > 0 ? t : null;
}

function questionHintStagesFromPool(input: {
  difficulty: number;
  hints: Array<string | null | undefined>;
  question: string;
  expected: string;
}) {
  const pooled = input.hints.map((h) => normalizeHintText(h)).filter((h): h is string => Boolean(h));
  const stages = pooled.slice(0, 5).map((h, idx) => `Hint (${input.difficulty}) [Stage ${idx + 1}]: ${h}`);
  while (stages.length < 5) {
    stages.push(`Hint (${input.difficulty}) [Stage ${stages.length + 1}]: ${buildHintText(input.difficulty, input.question, input.expected)}`);
  }
  return stages.slice(0, 5);
}

function stageMessage(stages: string[], priorUses: number): string {
  if (stages.length === 0) return "Mission intel sync unavailable";
  const idx = Math.min(priorUses, stages.length - 1);
  return stages[idx] ?? stages[stages.length - 1];
}

function countHintUsesForCheckpoint(
  rows: Array<{ metadata?: Record<string, unknown> }>,
  checkpointKey: string
): number {
  return rows.filter((row) => String(row.metadata?.checkpoint_key ?? "") === checkpointKey).length;
}

function pulseAnswerIntel(expected: string): string {
  const variants = answerVariants(expected);
  const primary = variants[0] ?? "";
  const format = answerFormatGuide("", expected).replace(/^Answer format:\s*/i, "");
  const words = primary.split(/\s+/).filter(Boolean).length;
  const length = primary.length;
  return `Pulse intel: format ${format}; variants ${Math.max(1, variants.length)}; profile ${words} word(s), ${length} chars.`;
}

function abilityGuidance(input: {
  shieldActive: boolean;
  shieldCharges: number;
  pulseCharges: number;
  hintCredits: number;
}): string {
  if (input.shieldActive) {
    return "Ability tip: Shield is armed. Your next trap scan is auto-blocked.";
  }
  const parts: string[] = [];
  parts.push(
    input.shieldCharges > 0
      ? `Shield ready (${input.shieldCharges} charge${input.shieldCharges === 1 ? "" : "s"}).`
      : "Shield empty: scan a Shield power QR."
  );
  parts.push(
    input.pulseCharges > 0
      ? `Pulse ready (${input.pulseCharges} charge${input.pulseCharges === 1 ? "" : "s"}).`
      : "Pulse empty: scan a Pulse power QR."
  );
  if (input.hintCredits > 0) {
    parts.push(`Bonus hint credits available: ${input.hintCredits}.`);
  }
  return `Ability tip: ${parts.join(" ")}`;
}

function clueHintPack(input: {
  clueStyle: (typeof CLUE_STYLES)[number];
  floor: number;
  shifted: string;
  reversed: string;
  plusFloor: string;
}) {
  if (input.clueStyle === "cipher") {
    return [
      `Hint 1: Encoded token is ${input.shifted}.`,
      "Hint 2: Inverse digit shift by -3 (mod 10).",
      "Hint 3: Preserve digit order.",
      "Hint 4: Apply transform per digit, not on full number as integer.",
      "Hint 5: Final decoded token is the exact room number."
    ];
  }
  if (input.clueStyle === "binary") {
    return [
      "Hint 1: Split by spaces into blocks.",
      "Hint 2: Each block is 6-bit ASCII for one digit.",
      "Hint 3: Convert and concatenate all digits.",
      "Hint 4: Do not parse as one big binary number.",
      "Hint 5: Converted characters should all be numeric digits."
    ];
  }
  if (input.clueStyle === "logic") {
    return [
      `Hint 1: Use room + floor = ${input.plusFloor}.`,
      `Hint 2: Subtract floor (${input.floor}) from total.`,
      "Hint 3: Result is your next room token.",
      "Hint 4: Keep the result in room-number format.",
      "Hint 5: Cross-check against building floor map before moving."
    ];
  }
  if (input.clueStyle === "code-snippet") {
    return [
      `Hint 1: token is reversed (${input.reversed}).`,
      "Hint 2: Apply reverse operation once.",
      "Hint 3: Final token maps to next room number.",
      "Hint 4: Ignore programming syntax; use only transformation idea.",
      "Hint 5: Reverse exactly once, then stop."
    ];
  }
  return [
    "Hint 1: Use first/last digit anchors.",
    `Hint 2: Mirror token is ${input.reversed}.`,
    "Hint 3: Rebuild full token from the mirrored pattern.",
    "Hint 4: Candidate token should match room-number shape.",
    "Hint 5: Validate with teammate before scan."
  ];
}

function parseScannedCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const candidates: string[] = [trimmed];
  try {
    const url = new URL(trimmed);
    const qp = url.searchParams.get("room_code") ?? url.searchParams.get("code") ?? url.searchParams.get("room");
    if (qp) candidates.push(qp);
    const pathTail = url.pathname.split("/").filter(Boolean).pop();
    if (pathTail) candidates.push(pathTail);
  } catch {
    // not a URL, continue with raw heuristics
  }

  const splitTokens = trimmed.split(/[\s/?&#=]+/).filter(Boolean);
  if (splitTokens.length > 0) {
    candidates.push(splitTokens[splitTokens.length - 1]);
  }

  for (const item of candidates) {
    try {
      const decoded = decodeURIComponent(item).trim();
      if (decoded) return decoded;
    } catch {
      const fallback = item.trim();
      if (fallback) return fallback;
    }
  }

  return trimmed;
}

function equalsCode(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

function startsWithCode(value: string, prefix: string): boolean {
  return value.trim().toUpperCase().startsWith(prefix.trim().toUpperCase());
}

function chooseRandom<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)] ?? null;
}

function difficultyForMainStep(step: number): number {
  if (step <= 2) return 1;
  if (step <= 4) return 3;
  if (step <= 6) return 4;
  return 5;
}

async function cacheTeamQuestions(teamId: string, eventId: string, mainSteps: number): Promise<void> {
  await clearTeamQuestions(teamId);

  const rows: Array<{
    event_config_id: string;
    team_id: string;
    order_number: number;
    question_id: string;
    cached_question: string;
    cached_answer: string;
    cached_hint_primary: string | null;
    cached_hint_secondary: string | null;
    cached_hint_tertiary: string | null;
    cached_hint_quaternary: string | null;
    cached_hint_quinary: string | null;
    difficulty_level: number;
  }> = [];

  for (let order = 1; order <= mainSteps; order += 1) {
    const pool = await listQuestionsByDifficulty(eventId, difficultyForMainStep(order));
    if (pool.length === 0) throw new ApiError(500, "Missing main round questions");
    const picked = chooseRandom(pool);
    if (!picked) throw new ApiError(500, "Missing main round questions");
    rows.push({
      event_config_id: eventId,
      team_id: teamId,
      order_number: order,
      question_id: picked.id,
      cached_question: picked.question_text,
      cached_answer: picked.correct_answer,
      cached_hint_primary: picked.hint_primary ?? null,
      cached_hint_secondary: picked.hint_secondary ?? null,
      cached_hint_tertiary: picked.hint_tertiary ?? null,
      cached_hint_quaternary: picked.hint_quaternary ?? null,
      cached_hint_quinary: picked.hint_quinary ?? null,
      difficulty_level: picked.difficulty_level
    });
  }

  for (let i = 1; i <= RAPID_FIRE_QUESTIONS; i += 1) {
    const rapidOrder = mainSteps + i;
    const rapidPool = await listQuestionsByDifficulty(eventId, 5);
    if (rapidPool.length === 0) throw new ApiError(500, "Missing rapid-fire questions");
    const picked = chooseRandom(rapidPool);
    if (!picked) throw new ApiError(500, "Missing rapid-fire questions");
    rows.push({
      event_config_id: eventId,
      team_id: teamId,
      order_number: rapidOrder,
      question_id: picked.id,
      cached_question: `[Rapid ${i}] ${picked.question_text}`,
      cached_answer: picked.correct_answer,
      cached_hint_primary: picked.hint_primary ?? null,
      cached_hint_secondary: picked.hint_secondary ?? null,
      cached_hint_tertiary: picked.hint_tertiary ?? null,
      cached_hint_quaternary: picked.hint_quaternary ?? null,
      cached_hint_quinary: picked.hint_quinary ?? null,
      difficulty_level: 5
    });
  }

  await upsertTeamQuestions(rows);
}

async function ensureQuestionAvailable(input: {
  teamId: string;
  eventId: string;
  mainSteps: number;
  orderNumber: number;
}) {
  const existing = await findTeamQuestion(input.teamId, input.orderNumber);
  if (existing) return existing;
  await cacheTeamQuestions(input.teamId, input.eventId, input.mainSteps);
  return findTeamQuestion(input.teamId, input.orderNumber);
}

function computeMainSteps(rooms: Awaited<ReturnType<typeof listRoomsByEvent>>, pathCount: number): number {
  const perPath = rooms.filter((r) => r.path_id && !r.is_trap).length / Math.max(1, pathCount);
  return 2 + Math.max(1, Math.floor(perPath));
}

function scoreDelta(input: { isCorrect: boolean; inRapid: boolean }): number {
  if (!input.isCorrect) return input.inRapid ? -2 : -5;
  return input.inRapid ? 20 : 50;
}

function currentPulse() {
  const slot = Math.floor(Date.now() / 1000 / GLOBAL_PULSE_WINDOW_SECONDS) % GLOBAL_PULSES.length;
  return GLOBAL_PULSES[slot];
}

function computeClueStyle(difficulty: number) {
  return CLUE_STYLES[(difficulty - 1) % CLUE_STYLES.length];
}

function answerToken(answer: string): string {
  const normalized = normalize(answer);
  if (!normalized) return "void";
  return normalized.replace(/[^a-z0-9]/g, "").slice(0, 12) || "void";
}

function digitsOnly(roomNumber: string): string {
  const digits = roomNumber.replace(/\D/g, "");
  return digits.length > 0 ? digits : roomNumber;
}

function roomQuestionText(input: {
  room: { room_number: string; floor: number | null; is_entry?: boolean; is_final?: boolean; is_trap?: boolean };
  question: string;
}) {
  const node = resolveNodeIdentity(input.room);
  return `[Room ${input.room.room_number} | ${node}] ${input.question}`;
}

function buildRoomClue(
  room: { room_number: string; floor: number | null },
  styleSeed: number,
  unlockToken: string,
  multiLayer = false,
  assistMode = false
) {
  const nodeName = resolveNodeIdentity(room);
  const clueStyle = CLUE_STYLES[styleSeed % CLUE_STYLES.length];
  const raw = digitsOnly(room.room_number);
  const floor = room.floor ?? 0;
  const parsedRoom = Number.parseInt(raw, 10);
  const plusFloor = Number.isNaN(parsedRoom) ? raw : String(parsedRoom + floor);
  const reversed = raw.split("").reverse().join("");
  const shifted = raw
    .split("")
    .map((ch) => {
      const n = Number.parseInt(ch, 10);
      if (Number.isNaN(n)) return ch;
      return String((n + 3) % 10);
    })
    .join("");
  const binary = raw
    .split("")
    .map((ch) => ch.charCodeAt(0).toString(2))
    .join(" ");
  const tunedHint = (hint: string) =>
    assistMode ? `${hint} Assist: validate with teammate before moving.` : hint;
  const clue_hints = clueHintPack({ clueStyle, floor, shifted, reversed, plusFloor });

  if (clueStyle === "cipher") {
    return {
      clue_style: clueStyle,
      title: `Next Node: ${nodeName}`,
      clue_text: `Target node signature (cipher): shift every digit by -3 (mod 10): ${shifted}`,
      decode_hint: tunedHint(`Recover the next room token, then move to node "${nodeName}".`),
      clue_hints,
      unlock_token: unlockToken
    };
  }
  if (clueStyle === "binary") {
    return {
      clue_style: clueStyle,
      title: `Next Node: ${nodeName}`,
      clue_text: `Target node signature (binary): decode 6-bit ASCII blocks into digits: ${binary}`,
      decode_hint: tunedHint(`Interpret each block as one encoded digit; destination node is "${nodeName}".`),
      clue_hints,
      unlock_token: unlockToken
    };
  }
  if (clueStyle === "logic") {
    return {
      clue_style: clueStyle,
      title: `Next Node: ${nodeName}`,
      clue_text: `Target node equation: room + floor = ${plusFloor}. Floor = ${floor}.`,
      decode_hint: tunedHint(`Extract the room token, then route to "${nodeName}".`),
      clue_hints,
      unlock_token: unlockToken
    };
  }
  if (clueStyle === "code-snippet") {
    return {
      clue_style: clueStyle,
      title: `Next Node: ${nodeName}`,
      clue_text: `Target node snippet: const token="${reversed}"; const room = token.split("").reverse().join("");`,
      decode_hint: tunedHint(`Execute the transform mentally and move to "${nodeName}".`),
      clue_hints,
      unlock_token: unlockToken
    };
  }
  const clue = {
    clue_style: clueStyle,
    title: `Next Node: ${nodeName}`,
    clue_text: `Target node pattern: ${raw[0] ?? ""}-?-${raw[raw.length - 1] ?? ""}, mirror token ${reversed}`,
    decode_hint: tunedHint(`Resolve the mirrored route token; destination node is "${nodeName}".`),
    clue_hints,
    unlock_token: unlockToken
  };
  if (!multiLayer) return clue;
  return {
    ...clue,
    layer_one: `Token seed (${unlockToken}) tells you style: ${clueStyle.toUpperCase()}`,
    layer_two: clue.clue_text
  };
}

function fallbackClue(message: string) {
  return {
    clue_style: "fallback",
    title: "Mission Recovery Packet",
    clue_text: message,
    decode_hint: "Cross-check with your teammate and resume the last verified checkpoint packet.",
    clue_hints: [
      "Hint 1: Confirm your current order with Mission Control.",
      "Hint 2: Re-scan only the latest verified room QR.",
      "Hint 3: Resume the scan -> solve -> decode route loop."
    ],
    unlock_token: "fallback"
  };
}

function buildFinalKeyBrief(
  eventId: string,
  rooms: Awaited<ReturnType<typeof listRoomsByEvent>>
): {
  nexus: { room_number: string | null; floor: number | null; clue: string };
  amiphoria: { room_number: string | null; floor: number | null; clue: string };
  rapid_gate: { room_number: string | null; floor: number | null; clue: string };
} {
  const picked = pickFinalKeyAnchors(eventId, rooms);
  const roomByNumber = new Map(rooms.map((r) => [r.room_number, r]));
  const nodeLabel = (roomNumber: string | undefined) => {
    if (!roomNumber) return "Unknown Node";
    const room = roomByNumber.get(roomNumber);
    return resolveNodeIdentity({
      room_number: roomNumber,
      floor: room?.floor ?? null,
      is_entry: room?.is_entry ?? false,
      is_final: room?.is_final ?? false,
      is_trap: room?.is_trap ?? false
    });
  };
  return {
    nexus: {
      room_number: picked.nexus?.room_number ?? null,
      floor: picked.nexus?.floor ?? null,
      clue: picked.nexus
        ? `Key Shard A: Room ${picked.nexus.room_number} (${nodeLabel(picked.nexus.room_number)}), Floor ${picked.nexus.floor ?? "?"}.`
        : "Key Shard A location unavailable."
    },
    amiphoria: {
      room_number: picked.amiphoria?.room_number ?? null,
      floor: picked.amiphoria?.floor ?? null,
      clue: picked.amiphoria
        ? `Key Shard B: Room ${picked.amiphoria.room_number} (${nodeLabel(picked.amiphoria.room_number)}), Floor ${picked.amiphoria.floor ?? "?"}.`
        : "Key Shard B location unavailable."
    },
    rapid_gate: {
      room_number: picked.rapidGate?.room_number ?? null,
      floor: picked.rapidGate?.floor ?? null,
      clue: picked.rapidGate
        ? `After both shards, scan Fire QR at Room ${picked.rapidGate.room_number} (${nodeLabel(picked.rapidGate.room_number)}), Floor ${picked.rapidGate.floor ?? "?"}.`
        : "Rapid Gate location unavailable."
    }
  };
}

async function getFinalKeyState(eventId: string, teamId: string) {
  const codes = buildFinalKeyCodes(eventId);
  const [gateReady, nexusScanned, amiphoriaScanned] = await Promise.all([
    hasTeamClaimedCode(eventId, teamId, "final_key_gate_ready", codes.gateReady),
    hasTeamClaimedCode(eventId, teamId, "final_key_step", codes.nexus),
    hasTeamClaimedCode(eventId, teamId, "final_key_step", codes.amiphoria)
  ]);
  return {
    gate_ready: gateReady,
    nexus_scanned: nexusScanned,
    amiphoria_scanned: amiphoriaScanned,
    dual_key_ready: nexusScanned && amiphoriaScanned,
    rapid_qr_code_hint: codes.rapidQr
  };
}

async function getRapidCategory(eventId: string, teamId: string): Promise<RapidCategory | null> {
  const rows = await listTeamActionLogs(eventId, teamId, "rapid_category_selected", 1);
  const row = rows[0];
  const cat = row?.metadata?.category;
  return typeof cat === "string" && RAPID_CATEGORIES.includes(cat as RapidCategory) ? (cat as RapidCategory) : null;
}

function trapClassFor(input: { teamId: string; trapRoomCode: string; order: number }): TrapClass {
  return TRAP_CLASSES[stableHash(`${input.teamId}:${input.trapRoomCode}:${input.order}`) % TRAP_CLASSES.length];
}

function trapProfile(input: { trapClass: TrapClass; pulseMultiplier: number; basePenalty: number }) {
  if (input.trapClass === "time_drain") {
    return { penalty_seconds: Math.round(input.basePenalty * 1.4 * input.pulseMultiplier), points_delta: -10 };
  }
  if (input.trapClass === "points_drain") {
    return { penalty_seconds: Math.round(input.basePenalty * 0.6 * input.pulseMultiplier), points_delta: -50 };
  }
  if (input.trapClass === "ability_lock") {
    return { penalty_seconds: Math.round(input.basePenalty * input.pulseMultiplier), points_delta: -20 };
  }
  return { penalty_seconds: Math.round(input.basePenalty * input.pulseMultiplier), points_delta: -25 };
}

function rapidCategoryKeywords(category: RapidCategory): string[] {
  if (category === "database") return ["sql"];
  if (category === "networking") return ["network"];
  return ["html", "css", "js", "git", "os"];
}

async function recacheRapidQuestionsByCategory(input: {
  eventId: string;
  teamId: string;
  mainSteps: number;
  category: RapidCategory;
}) {
  const rows: Array<{
    event_config_id: string;
    team_id: string;
    order_number: number;
    question_id: string;
    cached_question: string;
    cached_answer: string;
    cached_hint_primary: string | null;
    cached_hint_secondary: string | null;
    cached_hint_tertiary: string | null;
    cached_hint_quaternary: string | null;
    cached_hint_quinary: string | null;
    difficulty_level: number;
  }> = [];
  const pool = await listQuestionsByDifficulty(input.eventId, 5);
  const filtered = pool.filter((q) => rapidCategoryKeywords(input.category).includes(q.category));
  const source = filtered.length > 0 ? filtered : pool;
  if (source.length === 0) throw new ApiError(500, "Rapid category pool unavailable");
  for (let i = 1; i <= RAPID_FIRE_QUESTIONS; i += 1) {
    const picked = source[stableHash(`${input.teamId}:${input.category}:${i}`) % source.length];
    rows.push({
      event_config_id: input.eventId,
      team_id: input.teamId,
      order_number: input.mainSteps + i,
      question_id: picked.id,
      cached_question: `[Rapid ${i} | ${input.category.toUpperCase()}] ${picked.question_text}`,
      cached_answer: picked.correct_answer,
      cached_hint_primary: picked.hint_primary ?? null,
      cached_hint_secondary: picked.hint_secondary ?? null,
      cached_hint_tertiary: picked.hint_tertiary ?? null,
      cached_hint_quaternary: picked.hint_quaternary ?? null,
      cached_hint_quinary: picked.hint_quinary ?? null,
      difficulty_level: 5
    });
  }
  await upsertTeamQuestions(rows);
}

function storyChapterForCount(collected: number): string {
  if (collected >= 8) return "Act IV: Core Terminal Override";
  if (collected >= 6) return "Act III: Key Shard Sync";
  if (collected >= 3) return "Act II: Corrupted Grid";
  return "Act I: Node Breach";
}

function rapidUnlockFragments(mainSteps: number): number {
  return Math.max(3, Math.min(STORY_FRAGMENTS.length, mainSteps));
}

function buildStoryMission(input: { collected: number; required: number }) {
  const next = STORY_FRAGMENTS[input.collected] ?? null;
  return {
    chapter: storyChapterForCount(input.collected),
    collected_fragments: input.collected,
    required_fragments_for_rapid: input.required,
    rapid_unlock_ready: input.collected >= input.required,
    next_fragment_title: next?.title ?? null,
    next_artifact: next?.artifact ?? null
  };
}

function buildRouteBriefing(input: {
  assignedPathId: string | null;
  paths: Awaited<ReturnType<typeof listPathsByEvent>>;
  rooms: Awaited<ReturnType<typeof listRoomsByEvent>>;
}) {
  const path = input.assignedPathId ? input.paths.find((p) => p.id === input.assignedPathId) : null;
  const route = input.assignedPathId
    ? input.rooms
        .filter((room) => room.path_id === input.assignedPathId && !room.is_trap && room.order_number !== null)
        .sort((a, b) => (a.order_number ?? 0) - (b.order_number ?? 0))
        .map((room) => room.floor)
    : [];
  const floorSpan = Array.from(new Set(route)).filter((v): v is number => typeof v === "number");
  return {
    path_name: path?.path_name ?? null,
    checkpoint_count: route.length,
    floor_span: floorSpan.sort((a, b) => a - b),
    note: "Exact room sequence is hidden to prevent predictable pathing."
  };
}

async function getLatestBroadcast(eventId: string): Promise<{ level: string; message: string; timestamp: string } | null> {
  const row = await getLatestEventLogByAction(eventId, "admin_broadcast");
  if (!row) return null;
  return {
    level: typeof row.metadata?.level === "string" ? row.metadata.level : "info",
    message: typeof row.metadata?.message === "string" ? row.metadata.message : "Control room update.",
    timestamp: row.timestamp
  };
}

async function getRuneCount(eventId: string, teamId: string): Promise<number> {
  const rows = await listTeamActionLogs(eventId, teamId, "rune_collected", 500);
  const unique = new Set<string>();
  for (const row of rows) {
    const code = row?.metadata?.code;
    if (typeof code === "string") unique.add(code);
  }
  return unique.size;
}

async function maybeRivalChallenge(eventId: string, teamId: string, teamPoints: number): Promise<{
  rival_team_name: string;
  rival_points: number;
  delta: number;
} | null> {
  const teams = await listTeamsByEvent(eventId);
  const rivals = teams
    .filter((t) => t.id !== teamId && t.status === "active")
    .sort((a, b) => Math.abs(a.points - teamPoints) - Math.abs(b.points - teamPoints));
  const rival = rivals[0];
  if (!rival) return null;
  return {
    rival_team_name: rival.team_name,
    rival_points: rival.points,
    delta: teamPoints - rival.points
  };
}

async function getHintCredits(eventId: string, teamId: string): Promise<number> {
  const [grants, uses] = await Promise.all([
    listTeamActionLogs(eventId, teamId, "powerup_hint_credit", 200),
    listTeamActionLogs(eventId, teamId, "hint_credit_used", 200)
  ]);
  return Math.max(0, grants.length - uses.length);
}

async function enforceSingleSubmission(input: {
  eventId: string;
  teamId: string;
  checkpointCode: string;
}) {
  const actionType = "question_submission_lock";
  const alreadySubmitted = await hasTeamClaimedCode(input.eventId, input.teamId, actionType, input.checkpointCode);
  if (alreadySubmitted) {
    throw new ApiError(409, "Answer already submitted for this question. Scan/trigger the next challenge first.");
  }
  await createLog({
    event_config_id: input.eventId,
    team_id: input.teamId,
    action_type: actionType,
    metadata: { code: input.checkpointCode }
  });
}

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function milestoneRewardPayload(order: number, points: number) {
  const title = STORY_MILESTONE_TITLES[order];
  if (!title || points <= 0) return null;
  return {
    order,
    title,
    points,
    badge: buildMilestoneBadge(title, order)
  };
}

async function buildTrapQuestion(input: {
  eventId: string;
  teamId: string;
  trapRoomCode: string;
  difficultySeed: number;
}) {
  const preferred = await listQuestionsByDifficulty(input.eventId, Math.max(1, Math.min(5, input.difficultySeed)));
  let pool = preferred;
  if (pool.length === 0) {
    const all = await Promise.all([1, 2, 3, 4, 5].map((d) => listQuestionsByDifficulty(input.eventId, d)));
    pool = all.flat();
  }
  if (pool.length === 0) throw new ApiError(500, "Question pool unavailable");
  const idx = stableHash(`${input.teamId}:${input.trapRoomCode}`) % pool.length;
  const picked = pool[idx];
  return {
    difficulty_level: picked.difficulty_level,
    question_text: `[Trap Challenge] ${picked.question_text}`,
    answer: picked.correct_answer,
    hint_primary: picked.hint_primary,
    hint_secondary: picked.hint_secondary,
    hint_tertiary: picked.hint_tertiary,
    hint_quaternary: picked.hint_quaternary,
    hint_quinary: picked.hint_quinary
  };
}

export async function startGame(teamId: string) {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(409, "No active event");

  const [team, paths, rooms, teams] = await Promise.all([
    findTeamById(teamId),
    listPathsByEvent(event.id),
    listRoomsByEvent(event.id),
    listTeamsByEvent(event.id)
  ]);
  if (!team) throw new ApiError(404, "Team not found");
  if (team.status === "disqualified") throw new ApiError(403, "Team disqualified");
  if (team.status === "completed" || team.status === "timeout") throw new ApiError(409, "Game already finished");

  const mainSteps = computeMainSteps(rooms, paths.length);
  const nextTarget = team.assigned_path
    ? await findExpectedRoom(event.id, team.assigned_path, team.current_order || 1)
    : null;

  const [broadcast, runeCount, hintCredits] = await Promise.all([
    getLatestBroadcast(event.id),
    getRuneCount(event.id, team.id),
    getHintCredits(event.id, team.id)
  ]);
  const pulse = currentPulse();
  const requiredFragments = rapidUnlockFragments(mainSteps);
  const storyMission = buildStoryMission({
    collected: team.story_fragments_collected,
    required: requiredFragments
  });

  if (team.status === "active" && team.start_time) {
    if (team.phase === "rapid_fire" && team.rapid_fire_start_time) {
      const rapidElapsed = elapsedSeconds(team.rapid_fire_start_time);
      const rapidEndOrder = mainSteps + RAPID_FIRE_QUESTIONS;
      if (rapidElapsed >= RAPID_FIRE_DURATION_SECONDS || team.current_order > rapidEndOrder) {
        const total = team.start_time ? elapsedSeconds(team.start_time) + team.penalty_seconds : team.penalty_seconds;
        const completed = await updateTeamWithVersion(team.id, team.version, {
          status: "completed",
          phase: "completed",
          end_time: new Date().toISOString(),
          total_time_seconds: total
        });
        if (completed) {
          return {
            team: completed,
            remaining_seconds: completed.start_time
              ? Math.max(0, event.game_duration - elapsedSeconds(completed.start_time))
              : 0,
            game_duration: event.game_duration,
            gameplay_meta: buildGameplayMeta(mainSteps, RAPID_FIRE_QUESTIONS, RAPID_FIRE_DURATION_SECONDS),
            device_policy: "multi_device_allowed",
            active_pulse: pulse,
            latest_broadcast: broadcast,
            runes_collected: runeCount,
            hint_credits_remaining: hintCredits,
            story_intro: "Rapid-fire timer expired. The Core Terminal sealed and your mission record has been finalized.",
            story_mission: storyMission,
            story_chapter: storyMission.chapter,
            route_briefing: buildRouteBriefing({
              assignedPathId: completed.assigned_path,
              paths,
              rooms
            }),
            rapid_category_state: {
              selected: await getRapidCategory(event.id, completed.id),
              options: RAPID_CATEGORIES
            },
            final_key_brief: buildFinalKeyBrief(event.id, rooms),
            final_key_state: await getFinalKeyState(event.id, completed.id),
            active_prompt: null,
            next_room_clue: null
          };
        }
      }
    }

    const currentRoom = team.current_room_id ? rooms.find((r) => r.id === team.current_room_id) : null;
    const finalKeyState = await getFinalKeyState(event.id, team.id);
    const rapidCategory = await getRapidCategory(event.id, team.id);
    const currentQuestion = currentRoom && !currentRoom.is_trap
      ? await ensureQuestionAvailable({
          teamId: team.id,
          eventId: team.event_config_id,
          mainSteps,
          orderNumber: team.current_order
        })
      : null;
    const currentTrapQuestion =
      currentRoom && currentRoom.is_trap
        ? await buildTrapQuestion({
            eventId: team.event_config_id,
            teamId: team.id,
            trapRoomCode: currentRoom.room_code,
            difficultySeed: Math.max(1, Math.min(5, team.current_order))
          })
        : null;
    // Preserve reroute continuity across refresh/reconnect.
    // If the latest action for this order redirected to trap and no new scan lock exists,
    // restore that trap clue instead of falling back to entry/expected clue.
    let recoveredRerouteClue: ReturnType<typeof buildRoomClue> | null = null;
    if (!currentRoom && team.phase === "main" && !finalKeyState.gate_ready) {
      const [wrongLogs, trapWrongLogs, scanLogs] = await Promise.all([
        listTeamActionLogs(event.id, team.id, LOG_ACTIONS.ANSWER_WRONG, 3),
        listTeamActionLogs(event.id, team.id, "trap_answer_wrong", 3),
        listTeamActionLogs(event.id, team.id, LOG_ACTIONS.ROOM_SCAN, 5)
      ]);
      const latestWrong = [...wrongLogs, ...trapWrongLogs]
        .filter((row) => Number(row?.metadata?.order) === team.current_order)
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
      const lastScanThisOrder = scanLogs
        .filter((row) => Number(row?.metadata?.order) === team.current_order)
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
      if (latestWrong && (!lastScanThisOrder || String(latestWrong.timestamp) > String(lastScanThisOrder.timestamp))) {
        const redirectRoom = String(latestWrong.metadata?.redirect_room ?? "").trim();
        const rerouteRoom = rooms.find((r) => r.is_trap && r.room_number === redirectRoom);
        if (rerouteRoom) {
          recoveredRerouteClue = buildRoomClue(
            rerouteRoom,
            team.current_order + team.trap_hits + stableHash(answerToken(team.team_name)),
            answerToken(team.team_name),
            false,
            true
          );
        }
      }
    }
    return {
      team,
      remaining_seconds: Math.max(0, event.game_duration - elapsedSeconds(team.start_time)),
      game_duration: event.game_duration,
      gameplay_meta: buildGameplayMeta(mainSteps, RAPID_FIRE_QUESTIONS, RAPID_FIRE_DURATION_SECONDS),
      device_policy: "multi_device_allowed",
      active_pulse: pulse,
      latest_broadcast: broadcast,
      runes_collected: runeCount,
      hint_credits_remaining: hintCredits,
      story_intro:
        "Rogue AI NULL has fragmented the university network into physical nodes. Scan room QRs, solve technical challenges, decode clues, and restore node integrity before final timer expiry.",
      story_mission: storyMission,
      story_chapter: storyMission.chapter,
      route_briefing: buildRouteBriefing({
        assignedPathId: team.assigned_path,
        paths,
        rooms
      }),
      rapid_category_state: {
        selected: rapidCategory,
        options: RAPID_CATEGORIES
      },
      final_key_brief: buildFinalKeyBrief(event.id, rooms),
      final_key_state: finalKeyState,
      active_prompt:
        currentRoom && (currentQuestion || currentTrapQuestion)
          ? {
              room_number: currentRoom.room_number,
              room_code: currentRoom.room_code,
              difficulty_level: currentTrapQuestion?.difficulty_level ?? currentQuestion?.difficulty_level ?? 1,
              question_text: roomQuestionText({
                room: currentRoom,
                question: currentTrapQuestion?.question_text ?? currentQuestion?.cached_question ?? ""
              })
            }
          : null,
      next_room_clue:
        team.phase === "rapid_fire" || finalKeyState.gate_ready || !nextTarget
          ? recoveredRerouteClue
          : recoveredRerouteClue ??
            buildRoomClue(
              nextTarget,
              team.current_order + team.story_fragments_collected + stableHash(answerToken(team.team_name)),
              answerToken(team.team_name),
              false
            )
    };
  }

  const pathLoad = paths
    .map((path) => ({
      path,
      count: teams.filter((t) => t.assigned_path === path.id && t.status !== "disqualified").length
    }))
    .sort((a, b) => a.count - b.count || a.path.path_order - b.path.path_order);

  const leastCount = pathLoad.find((p) => p.count < p.path.max_capacity)?.count;
  const usedPathIds = new Set(
    teams
      .filter((t) => t.assigned_path && t.status !== "disqualified")
      .map((t) => t.assigned_path as string)
  );
  const unusedCandidates = pathLoad.filter((p) => p.count < p.path.max_capacity && !usedPathIds.has(p.path.id));
  const candidates =
    unusedCandidates.length > 0
      ? unusedCandidates
      : leastCount === undefined
        ? []
        : pathLoad.filter((p) => p.count === leastCount && p.count < p.path.max_capacity);
  const selected = candidates.length > 0 ? candidates[stableHash(team.id) % candidates.length] : null;
  if (!selected) throw new ApiError(409, "No path capacity available");

  const started = await updateTeamWithVersion(team.id, team.version, {
    status: "active",
    phase: "main",
    assigned_path: selected.path.id,
    current_order: 1,
    start_time: new Date().toISOString(),
    current_room_id: null,
    points: 0,
    rapid_fire_score: 0,
    story_fragments_collected: 0,
    combo_streak: 0,
    shield_charges: 1,
    shield_active: false,
    pulse_charges: 1
  });
  if (!started) throw new ApiError(409, "Concurrent start detected");
  let updated = started;

  // Best-effort rebalance if a burst of simultaneous starts overfills a path.
  const latestTeams = await listTeamsByEvent(event.id);
  const assignedPath = paths.find((p) => p.id === updated.assigned_path);
  const assignedCount = latestTeams.filter((t) => t.assigned_path === updated.assigned_path && t.status !== "disqualified").length;
  if (assignedPath && assignedCount > assignedPath.max_capacity) {
    const rebalanceLoad = paths
      .filter((p) => p.id !== assignedPath.id)
      .map((path) => ({
        path,
        count: latestTeams.filter((t) => t.assigned_path === path.id && t.status !== "disqualified").length
      }))
      .sort((a, b) => a.count - b.count || a.path.path_order - b.path.path_order);
    const fallback = rebalanceLoad.find((entry) => entry.count < entry.path.max_capacity);
    if (fallback) {
      const moved = await updateTeamWithVersion(updated.id, updated.version, {
        assigned_path: fallback.path.id
      });
      if (moved) updated = moved;
    } else {
      const rolledBack = await updateTeamWithVersion(updated.id, updated.version, {
        status: "waiting",
        phase: "main",
        assigned_path: null,
        current_order: 0,
        start_time: null,
        current_room_id: null,
        points: 0,
        rapid_fire_score: 0,
        story_fragments_collected: 0,
        combo_streak: 0,
        shield_charges: 1,
        shield_active: false,
        pulse_charges: 1
      });
      if (rolledBack) {
        await clearTeamQuestions(rolledBack.id);
      }
      throw new ApiError(409, "No path capacity available");
    }
  }

  await cacheTeamQuestions(updated.id, updated.event_config_id, mainSteps);
  const initialTarget = await findExpectedRoom(event.id, updated.assigned_path as string, updated.current_order);
  await createLog({
    event_config_id: event.id,
    team_id: team.id,
    action_type: LOG_ACTIONS.GAME_START,
    metadata: { path: selected.path.path_name }
  });

  return {
    team: updated,
    remaining_seconds: event.game_duration,
    game_duration: event.game_duration,
    gameplay_meta: buildGameplayMeta(mainSteps, RAPID_FIRE_QUESTIONS, RAPID_FIRE_DURATION_SECONDS),
    device_policy: "multi_device_allowed",
    active_pulse: pulse,
    latest_broadcast: broadcast,
    runes_collected: runeCount,
    hint_credits_remaining: hintCredits,
    story_intro:
      "Rogue AI NULL has fragmented the university network into physical nodes. Scan room QRs, solve technical challenges, decode clues, and restore node integrity before final timer expiry.",
    story_mission: buildStoryMission({ collected: 0, required: requiredFragments }),
    story_chapter: storyChapterForCount(0),
    route_briefing: buildRouteBriefing({
      assignedPathId: updated.assigned_path,
      paths,
      rooms
    }),
    rapid_category_state: {
      selected: null,
      options: RAPID_CATEGORIES
    },
    final_key_brief: buildFinalKeyBrief(event.id, rooms),
    final_key_state: await getFinalKeyState(event.id, updated.id),
    next_room_clue: initialTarget
      ? buildRoomClue(initialTarget, updated.current_order, answerToken(updated.team_name), false)
      : fallbackClue("Mission Control lost the primary route packet. Report to Command for immediate node resync.")
  };
}

export async function scanRoom(teamId: string, roomCode: string) {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(409, "No active event");

  const team = await findTeamById(teamId);
  if (!team || team.event_config_id !== event.id) throw new ApiError(404, "Team not found");
  if (team.status !== "active" || !team.assigned_path || !team.start_time) throw new ApiError(409, "Game not active");
  if (team.phase === "rapid_fire") throw new ApiError(409, "Rapid-fire active: scanning disabled");

  const elapsed = elapsedSeconds(team.start_time);
  if (elapsed >= event.game_duration) {
    const timeout = await updateTeamWithVersion(team.id, team.version, {
      status: "timeout",
      end_time: new Date().toISOString(),
      total_time_seconds: event.game_duration + team.penalty_seconds,
      phase: "completed"
    });
    if (!timeout) throw new ApiError(409, "Concurrent timeout update");
    throw new ApiError(410, "Game timed out");
  }

  const parsedRoomCode = parseScannedCode(roomCode);
  const pulse = currentPulse();
  const broadcast = await getLatestBroadcast(event.id);
  const [paths, rooms] = await Promise.all([listPathsByEvent(event.id), listRoomsByEvent(event.id)]);
  const mainSteps = computeMainSteps(rooms, paths.length);
  const rapidStartOrder = mainSteps + 1;
  const finalKeyCodes = buildFinalKeyCodes(event.id);
  const finalKeyState = await getFinalKeyState(event.id, team.id);

  if (finalKeyState.gate_ready && team.phase === "main" && team.current_order >= rapidStartOrder) {
    if (equalsCode(parsedRoomCode, finalKeyCodes.nexus) || equalsCode(parsedRoomCode, finalKeyCodes.amiphoria)) {
      const canonical = equalsCode(parsedRoomCode, finalKeyCodes.nexus) ? finalKeyCodes.nexus : finalKeyCodes.amiphoria;
      const alreadyClaimed = await hasTeamClaimedCode(event.id, team.id, "final_key_step", canonical);
      if (!alreadyClaimed) {
        await createLog({
          event_config_id: event.id,
          team_id: team.id,
          action_type: "final_key_step",
          metadata: { code: canonical }
        });
      }
      const refreshedState = await getFinalKeyState(event.id, team.id);
      return {
        type: "final_key" as const,
        team,
        message: refreshedState.dual_key_ready
          ? "Dual key confirmed. Scan the Fire QR (rapid-fire gate QR) to enter the final chamber."
          : "Key shard accepted. Locate the other key shard.",
        final_key_state: refreshedState,
        final_key_brief: buildFinalKeyBrief(event.id, rooms),
        rapid_category_state: {
          selected: await getRapidCategory(event.id, team.id),
          options: RAPID_CATEGORIES
        },
        active_pulse: pulse,
        latest_broadcast: broadcast
      };
    }

    if (equalsCode(parsedRoomCode, finalKeyCodes.rapidQr)) {
      if (!finalKeyState.dual_key_ready) {
        throw new ApiError(409, "Rapid-fire chamber locked. Scan Key Shard A and Key Shard B first, then scan Fire QR.");
      }
      const rapidStarted = await updateTeamWithVersion(team.id, team.version, {
        phase: "rapid_fire",
        rapid_fire_start_time: new Date().toISOString(),
        current_order: rapidStartOrder,
        current_room_id: null
      });
      if (!rapidStarted) throw new ApiError(409, "Concurrent phase update");
      await createLog({
        event_config_id: event.id,
        team_id: team.id,
        action_type: "rapid_fire_gate_scan",
          metadata: { code: finalKeyCodes.rapidQr }
        });
      const rapidQuestion = await findTeamQuestion(rapidStarted.id, rapidStartOrder);
      return {
        type: "final_key" as const,
        team: rapidStarted,
        rapid_fire_started: true,
        rapid_remaining_seconds: RAPID_FIRE_DURATION_SECONDS,
        message: "Rapid-fire chamber opened. Begin final responses.",
        final_key_state: await getFinalKeyState(event.id, team.id),
        final_key_brief: buildFinalKeyBrief(event.id, rooms),
        rapid_category_state: {
          selected: await getRapidCategory(event.id, team.id),
          options: RAPID_CATEGORIES
        },
        active_pulse: pulse,
        latest_broadcast: broadcast,
        rapid_question: rapidQuestion
          ? {
              order: 1,
              total: RAPID_FIRE_QUESTIONS,
              question_text: rapidQuestion.cached_question
            }
          : null
      };
    }

    throw new ApiError(409, "Final key stage active. Scan Key Shard A, Key Shard B, then Fire QR (rapid-fire gate).");
  }

  if (startsWithCode(parsedRoomCode, `${event.id}-POWER-`)) {
    const alreadyClaimed = await hasTeamClaimedCode(event.id, team.id, "powerup_claimed", parsedRoomCode);
    if (alreadyClaimed) {
      return {
        type: "powerup" as const,
        team,
        message: "Power-up node already consumed by your team.",
        active_pulse: pulse,
        latest_broadcast: broadcast
      };
    }
    const power = parsedRoomCode.split("-").pop() ?? "shield";
    const patch: Record<string, unknown> = { points: team.points + 15 };
    let message = "Power-up unlocked";
    if (power === "shield") {
      patch.shield_charges = team.shield_charges + 1;
      message = `Power-up: +1 Shield charge (total ${team.shield_charges + 1}).`;
    } else if (power === "pulse") {
      patch.pulse_charges = team.pulse_charges + 1;
      message = `Power-up: +1 Pulse charge (total ${team.pulse_charges + 1}).`;
    } else if (power === "score") {
      patch.points = team.points + 75;
      message = `Power-up: Score booster activated (+75 points, total ${team.points + 75}).`;
    } else if (power === "hint") {
      message = "Power-up: +1 Hint credit added.";
    }
    const updated = await updateTeamWithVersion(team.id, team.version, patch);
    if (!updated) throw new ApiError(409, "Concurrent power-up update");
    await createLog({
      event_config_id: event.id,
      team_id: team.id,
      action_type: "powerup_claimed",
      metadata: { code: parsedRoomCode, power }
    });
    if (power === "hint") {
      await createLog({
        event_config_id: event.id,
        team_id: team.id,
        action_type: "powerup_hint_credit",
        metadata: { code: parsedRoomCode }
      });
    }
    const hintCredits = await getHintCredits(event.id, team.id);
    return {
      type: "powerup" as const,
      team: updated,
      message,
      hint_credits_remaining: hintCredits,
      active_pulse: pulse,
      latest_broadcast: broadcast
    };
  }

  if (startsWithCode(parsedRoomCode, `${event.id}-RUNE-`)) {
    const alreadyClaimed = await hasTeamClaimedCode(event.id, team.id, "rune_collected", parsedRoomCode);
    if (alreadyClaimed) {
      const currentRunes = await getRuneCount(event.id, team.id);
      return {
        type: "rune" as const,
        team,
        message: "Rune already collected.",
        runes_collected: currentRunes,
        active_pulse: pulse,
        latest_broadcast: broadcast
      };
    }
    const updated = await updateTeamWithVersion(team.id, team.version, {
      points: team.points + 40
    });
    if (!updated) throw new ApiError(409, "Concurrent rune update");
    await createLog({
      event_config_id: event.id,
      team_id: team.id,
      action_type: "rune_collected",
      metadata: { code: parsedRoomCode }
    });
    const currentRunes = await getRuneCount(event.id, team.id);
    return {
      type: "rune" as const,
      team: updated,
      message: `Secret rune recovered (+40 points). Total runes: ${currentRunes}.`,
      runes_collected: currentRunes,
      active_pulse: pulse,
      latest_broadcast: broadcast
    };
  }

  if (
    equalsCode(parsedRoomCode, finalKeyCodes.nexus) ||
    equalsCode(parsedRoomCode, finalKeyCodes.amiphoria) ||
    equalsCode(parsedRoomCode, finalKeyCodes.rapidQr)
  ) {
    if (!finalKeyState.gate_ready) {
      throw new ApiError(409, "Final key QRs are locked. Reach the final checkpoint first, then scan Key Shard A/Key Shard B/Fire.");
    }
    throw new ApiError(409, "Final key stage not active yet. Continue normal progression before scanning final key QRs.");
  }

  const room = await findRoomByCode(event.id, parsedRoomCode);
  if (!room) throw new ApiError(404, "Invalid room QR");

  if (room.is_trap) {
    if (team.current_room_id === room.id) {
      const trapQuestion = await buildTrapQuestion({
        eventId: event.id,
        teamId: team.id,
        trapRoomCode: room.room_code,
        difficultySeed: Math.max(1, Math.min(5, team.current_order))
      });
      return {
        type: "question" as const,
        team,
        room: {
          room_number: room.room_number,
          room_code: room.room_code,
          difficulty_level: trapQuestion.difficulty_level,
          question_text: roomQuestionText({ room, question: trapQuestion.question_text })
        },
        message: "Trap challenge active.",
        clue_style: computeClueStyle(trapQuestion.difficulty_level),
        active_pulse: pulse,
        latest_broadcast: broadcast
      };
    }

    if (team.shield_active) {
      const expectedAfterShield = await findExpectedRoom(event.id, team.assigned_path, team.current_order);
      const mainCheckpointCode = expectedAfterShield ? `MAIN:${team.current_order}:${expectedAfterShield.room_code}` : null;
      const mainCheckpointLocked = mainCheckpointCode
        ? await hasTeamClaimedCode(event.id, team.id, "question_submission_lock", mainCheckpointCode)
        : false;
      const nextOrderAfterShield = mainCheckpointLocked ? team.current_order + 1 : team.current_order;
      const shielded = await updateTeamWithVersion(team.id, team.version, {
        shield_active: false,
        points: team.points + 5,
        current_order: nextOrderAfterShield,
        current_room_id: null
      });
      if (!shielded) throw new ApiError(409, "Concurrent shield update");
      await createLog({
        event_config_id: event.id,
        team_id: team.id,
        action_type: "trap_blocked",
        metadata: { room_code: room.room_code }
      });
      const clueTarget = await findExpectedRoom(event.id, team.assigned_path, shielded.current_order);
      return {
        type: "trap" as const,
        message: mainCheckpointLocked
          ? "Trap blocked by Shield. Checkpoint resolved; decode the next room clue."
          : "Trap blocked by Shield. Continue with your current checkpoint clue.",
        team: shielded,
        active_pulse: pulse,
        latest_broadcast: broadcast,
        next_room_clue: clueTarget
          ? buildRoomClue(
              clueTarget,
              shielded.current_order + shielded.points + stableHash(answerToken(shielded.team_name)),
              answerToken(shielded.team_name),
              true,
              true
            )
          : fallbackClue("Shield block confirmed. Route telemetry is unstable; report to Command for node resync.")
      };
    }
    const trapClass = trapClassFor({ teamId: team.id, trapRoomCode: room.room_code, order: team.current_order });
    const trapFx = trapProfile({
      trapClass,
      pulseMultiplier: pulse.trapPenaltyMultiplier,
      basePenalty: env.DEFAULT_TRAP_PENALTY_SECONDS
    });
    const patch: Record<string, unknown> = {
      current_room_id: room.id,
      trap_hits: team.trap_hits + 1,
      penalty_seconds: team.penalty_seconds + trapFx.penalty_seconds,
      points: Math.max(0, team.points + trapFx.points_delta),
      combo_streak: 0
    };
    if (trapClass === "ability_lock") {
      patch.pulse_charges = 0;
      patch.shield_active = false;
    }
    const updated = await updateTeamWithVersion(team.id, team.version, patch);
    if (!updated) throw new ApiError(409, "Concurrent trap update");
    await createLog({
      event_config_id: event.id,
      team_id: team.id,
      action_type: LOG_ACTIONS.TRAP_TRIGGERED,
      metadata: { room_code: room.room_code, trap_class: trapClass, trap_penalty: trapFx.penalty_seconds }
    });
    const trapQuestion = await buildTrapQuestion({
      eventId: event.id,
      teamId: team.id,
      trapRoomCode: room.room_code,
      difficultySeed: Math.max(1, Math.min(5, team.current_order))
    });
    return {
      type: "question" as const,
      team: updated,
      room: {
        room_number: room.room_number,
        room_code: room.room_code,
        difficulty_level: trapQuestion.difficulty_level,
        question_text: roomQuestionText({ room, question: trapQuestion.question_text })
      },
      message: `Trap challenge engaged (${trapClass.replace("_", " ")}).`,
      trap_class: trapClass,
      clue_style: computeClueStyle(trapQuestion.difficulty_level),
      active_pulse: pulse,
      latest_broadcast: broadcast
    };
  }

  const expected = await findExpectedRoom(event.id, team.assigned_path, team.current_order);
  if (!expected) throw new ApiError(500, "Expected room missing");
  if (expected.id !== room.id) throw new ApiError(409, "Out of order scan. Decode your latest clue and try again.");

  const updated = await updateTeamWithVersion(team.id, team.version, { current_room_id: room.id });
  if (!updated) throw new ApiError(409, "Concurrent scan update");
  await createLog({
    event_config_id: event.id,
    team_id: team.id,
    action_type: LOG_ACTIONS.ROOM_SCAN,
    metadata: { room_number: room.room_number, room_code: room.room_code, order: team.current_order }
  });

  const question = await ensureQuestionAvailable({
    teamId: team.id,
    eventId: team.event_config_id,
    mainSteps,
    orderNumber: team.current_order
  });
  if (!question) throw new ApiError(500, "Question cache missing");

  return {
    type: "question" as const,
    team: updated,
    room: {
      room_number: room.room_number,
      room_code: room.room_code,
      difficulty_level: question.difficulty_level,
      question_text: roomQuestionText({ room, question: question.cached_question })
    },
    message: "Room validated",
    clue_style: computeClueStyle(question.difficulty_level),
    active_pulse: pulse,
    latest_broadcast: broadcast
  };
}

export async function submitAnswer(teamId: string, input: { roomCode: string; answer: string }) {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(409, "No active event");

  const [team, paths, rooms] = await Promise.all([
    findTeamById(teamId),
    listPathsByEvent(event.id),
    listRoomsByEvent(event.id)
  ]);
  if (!team || team.event_config_id !== event.id) throw new ApiError(404, "Team not found");
  if (team.status !== "active") throw new ApiError(409, "Game is not active");

  const mainSteps = computeMainSteps(rooms, paths.length);
  const rapidStartOrder = mainSteps + 1;
  const rapidEndOrder = mainSteps + RAPID_FIRE_QUESTIONS;
  const pulse = currentPulse();
  const broadcast = await getLatestBroadcast(event.id);
  const requiredFragments = rapidUnlockFragments(mainSteps);
  const assistMode = team.trap_hits >= 2 || team.hints_used >= 2 || team.penalty_seconds >= 120;

  if (team.phase === "rapid_fire") {
    if (!team.rapid_fire_start_time) throw new ApiError(500, "Rapid-fire state missing");
    const rapidElapsed = elapsedSeconds(team.rapid_fire_start_time);
    if (rapidElapsed >= RAPID_FIRE_DURATION_SECONDS || team.current_order > rapidEndOrder) {
      const total = team.start_time ? elapsedSeconds(team.start_time) + team.penalty_seconds : team.penalty_seconds;
      const completed = await updateTeamWithVersion(team.id, team.version, {
        status: "completed",
        phase: "completed",
        end_time: new Date().toISOString(),
        total_time_seconds: total
      });
      if (!completed) throw new ApiError(409, "Concurrent finish update");
      return {
        completed: true,
        rapid_fire_completed: true,
        message: "Rapid-fire ended. Game complete.",
        team: completed
      };
    }

    const rapidQ = await ensureQuestionAvailable({
      teamId: team.id,
      eventId: team.event_config_id,
      mainSteps,
      orderNumber: team.current_order
    });
    if (!rapidQ) throw new ApiError(500, "Rapid-fire question missing");
    await enforceSingleSubmission({
      eventId: event.id,
      teamId: team.id,
      checkpointCode: `RAPID:${team.current_order}`
    });
    const correct = isAnswerMatch(input.answer, rapidQ.cached_answer);
    const nextCombo = correct ? team.combo_streak + 1 : 0;
    const mult = 1 + Math.min(0.5, team.combo_streak * 0.1);
    const rapidRemaining = Math.max(0, RAPID_FIRE_DURATION_SECONDS - rapidElapsed);
    const isJackpotWindow = rapidRemaining <= 60;
    const jackpotMultiplier = isJackpotWindow && correct ? 2 : 1;
    const delta = Math.round(
      scoreDelta({ isCorrect: correct, inRapid: true }) *
        (correct ? mult : 1) *
        jackpotMultiplier *
        pulse.pointsMultiplier
    );
    const updated = await updateTeamWithVersion(team.id, team.version, {
      current_order: team.current_order + 1,
      points: Math.max(0, team.points + delta),
      rapid_fire_score: team.rapid_fire_score + (correct ? 1 : 0),
      combo_streak: nextCombo
    });
    if (!updated) throw new ApiError(409, "Concurrent rapid update");

    if (updated.current_order > rapidEndOrder) {
      const total = updated.start_time ? elapsedSeconds(updated.start_time) + updated.penalty_seconds : updated.penalty_seconds;
      const completed = await updateTeamWithVersion(updated.id, updated.version, {
        status: "completed",
        phase: "completed",
        end_time: new Date().toISOString(),
        total_time_seconds: total
      });
      if (!completed) throw new ApiError(409, "Concurrent finish update");
      return {
        completed: true,
        rapid_fire_completed: true,
        message: "Rapid-fire complete. Mission finished.",
        team: completed
      };
    }

    const nextQuestion = await findTeamQuestion(updated.id, updated.current_order);
    return {
      completed: false,
      rapid_fire_active: true,
      rapid_remaining_seconds: rapidRemaining,
      rapid_jackpot_active: isJackpotWindow,
      message: "Rapid response recorded. Next prompt loaded.",
      team: updated,
      rapid_category_state: {
        selected: await getRapidCategory(event.id, updated.id),
        options: RAPID_CATEGORIES
      },
      active_pulse: pulse,
      latest_broadcast: broadcast,
      rapid_question: nextQuestion
        ? {
            order: updated.current_order - rapidStartOrder + 1,
            total: RAPID_FIRE_QUESTIONS,
            question_text: nextQuestion.cached_question
          }
        : null
    };
  }

  if (!team.assigned_path) throw new ApiError(409, "Team path not assigned");
  const expected = await findExpectedRoom(event.id, team.assigned_path, team.current_order);
  if (!expected) throw new ApiError(500, "Expected room missing");
  const scannedCode = parseScannedCode(input.roomCode);
  const currentRoom = team.current_room_id ? rooms.find((r) => r.id === team.current_room_id) : null;

  if (currentRoom?.is_trap) {
    if (currentRoom.room_code !== scannedCode) {
      throw new ApiError(409, "Trap challenge active. Submit using the currently active trap room QR.");
    }
    const trapCheckpointCode = `TRAP:${team.current_order}:${currentRoom.room_code}`;
    const trapAlreadySubmitted = await hasTeamClaimedCode(event.id, team.id, "question_submission_lock", trapCheckpointCode);
    if (trapAlreadySubmitted) {
      const [trapCorrectLogs, trapWrongLogs] = await Promise.all([
        listTeamActionLogs(event.id, team.id, "trap_answer_correct", 10),
        listTeamActionLogs(event.id, team.id, "trap_answer_wrong", 10)
      ]);
      const latestCorrect = trapCorrectLogs
        .filter((row) => String(row.metadata?.trap_room ?? "") === currentRoom.room_number)
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
      const latestWrong = trapWrongLogs
        .filter((row) => String(row.metadata?.trap_room ?? "") === currentRoom.room_number)
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
      const latestType =
        latestCorrect && latestWrong
          ? String(latestCorrect.timestamp) >= String(latestWrong.timestamp)
            ? "correct"
            : "wrong"
          : latestCorrect
            ? "correct"
            : latestWrong
              ? "wrong"
              : null;

      if (latestType === "correct") {
        return {
          completed: false,
          message: "Submission already recorded. Decode the clue packet for your next room.",
          team,
          active_pulse: pulse,
          latest_broadcast: broadcast,
          next_room_clue: buildRoomClue(
            expected,
            team.current_order + team.story_fragments_collected + stableHash(answerToken(team.team_name)),
            answerToken(team.team_name),
            false,
            assistMode
          )
        };
      }
      if (latestType === "wrong") {
        const redirectRoomNumber = String(latestWrong?.metadata?.redirect_room ?? "").trim();
        const redirectTrap = rooms.find((r) => r.is_trap && r.room_number === redirectRoomNumber);
        return {
          completed: false,
          message: "Submission already recorded. Decode the reroute clue packet.",
          team,
          active_pulse: pulse,
          latest_broadcast: broadcast,
          next_room_clue: redirectTrap
            ? buildRoomClue(
                redirectTrap,
                team.current_order + team.trap_hits + stableHash(answerToken(team.team_name)),
                answerToken(team.team_name),
                false,
                true
              )
            : buildRoomClue(
                expected,
                team.current_order + team.story_fragments_collected + stableHash(answerToken(team.team_name)),
                answerToken(team.team_name),
                false,
                true
              )
        };
      }
    }
    await enforceSingleSubmission({
      eventId: event.id,
      teamId: team.id,
      checkpointCode: trapCheckpointCode
    });
    const trapQuestion = await buildTrapQuestion({
      eventId: event.id,
      teamId: team.id,
      trapRoomCode: currentRoom.room_code,
      difficultySeed: Math.max(1, Math.min(5, team.current_order))
    });
    const trapCorrect = isAnswerMatch(input.answer, trapQuestion.answer);

    if (trapCorrect) {
      const mainCheckpointCode = `MAIN:${team.current_order}:${expected.room_code}`;
      const mainCheckpointLocked = await hasTeamClaimedCode(event.id, team.id, "question_submission_lock", mainCheckpointCode);
      const nextOrderAfterTrap = mainCheckpointLocked ? team.current_order + 1 : team.current_order;
      const escaped = await updateTeamWithVersion(team.id, team.version, {
        current_room_id: null,
        current_order: nextOrderAfterTrap,
        points: team.points + 25,
        combo_streak: team.combo_streak + 1
      });
      if (!escaped) throw new ApiError(409, "Concurrent trap-answer update");
      const clueTarget = await findExpectedRoom(event.id, team.assigned_path as string, escaped.current_order);
      await createLog({
        event_config_id: event.id,
        team_id: team.id,
        action_type: "trap_answer_correct",
        metadata: { trap_room: currentRoom.room_number, checkpoint: "main-route" }
      });
      return {
        completed: false,
        message: mainCheckpointLocked
          ? "Trap solved. Checkpoint resolved; decode the next room clue."
          : "Trap solved. Return via clue packet to your current checkpoint path.",
        team: escaped,
        active_pulse: pulse,
        latest_broadcast: broadcast,
        next_room_clue: clueTarget
          ? buildRoomClue(
              clueTarget,
              escaped.current_order + escaped.story_fragments_collected + stableHash(answerToken(input.answer)),
              answerToken(input.answer),
              false,
              assistMode
            )
          : fallbackClue("Corruption purge complete, but the next node packet is unstable. Report to Command for checkpoint sync.")
      };
    }

    const otherTraps = rooms.filter((r) => r.is_trap && r.id !== currentRoom.id);
    const fallbackTraps = rooms.filter((r) => r.is_trap);
    const trapRoom = chooseRandom(otherTraps.length > 0 ? otherTraps : fallbackTraps);
    const trappedAgain = await updateTeamWithVersion(team.id, team.version, {
      current_room_id: null,
      trap_hits: team.trap_hits + 1,
      penalty_seconds: team.penalty_seconds + Math.round(env.DEFAULT_TRAP_PENALTY_SECONDS * pulse.trapPenaltyMultiplier),
      points: Math.max(0, team.points - 25),
      combo_streak: 0
    });
    if (!trappedAgain) throw new ApiError(409, "Concurrent trap-answer update");
    await createLog({
      event_config_id: event.id,
      team_id: team.id,
      action_type: "trap_answer_wrong",
      metadata: { trap_room: currentRoom.room_number, redirect_room: trapRoom?.room_number ?? null }
    });
    return {
      completed: false,
      message: "Response recorded. Decode the reroute clue packet.",
      team: trappedAgain,
      active_pulse: pulse,
      latest_broadcast: broadcast,
      next_room_clue: trapRoom
        ? buildRoomClue(
            trapRoom,
            trappedAgain.current_order + trappedAgain.trap_hits + stableHash(answerToken(input.answer)),
            answerToken(input.answer),
            false,
            true
          )
        : buildRoomClue(
            expected,
            trappedAgain.current_order + trappedAgain.story_fragments_collected + stableHash(answerToken(input.answer)),
            answerToken(input.answer),
            false,
            true
          )
    };
  }

  if (expected.room_code !== scannedCode) {
    throw new ApiError(409, "Scan the expected room from your latest clue before submitting.");
  }
  if (team.current_room_id !== expected.id) {
    throw new ApiError(409, "No active challenge lock. Scan the expected room QR first.");
  }
  const mainCheckpointCode = `MAIN:${team.current_order}:${expected.room_code}`;
  const mainAlreadySubmitted = await hasTeamClaimedCode(event.id, team.id, "question_submission_lock", mainCheckpointCode);
  if (mainAlreadySubmitted) {
    const wrongLogs = await listTeamActionLogs(event.id, team.id, LOG_ACTIONS.ANSWER_WRONG, 20);
    const latestWrongThisOrder = wrongLogs
      .filter((row) => Number(row.metadata?.order) === team.current_order)
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
    const fallbackAdvance = String(latestWrongThisOrder?.metadata?.fallback ?? "") === "no_trap_nodes_advance";
    const redirectRoomNumber = String(latestWrongThisOrder?.metadata?.redirect_room ?? "").trim();
    const redirectTrap = rooms.find((r) => r.is_trap && r.room_number === redirectRoomNumber);

    if (latestWrongThisOrder && !fallbackAdvance) {
      const safeRedirectTrap =
        redirectTrap && redirectTrap.room_number !== expected.room_number
          ? redirectTrap
          : rooms.find((r) => r.is_trap && r.room_number !== expected.room_number) ?? null;
      return {
        completed: false,
        message: "Submission already recorded. Decode the reroute clue packet.",
        team,
        active_pulse: pulse,
        latest_broadcast: broadcast,
        next_room_clue: safeRedirectTrap
          ? buildRoomClue(
              safeRedirectTrap,
              team.current_order + team.trap_hits + stableHash(answerToken(team.team_name)),
              answerToken(team.team_name),
              false,
              true
            )
          : fallbackClue("NULL interference disrupted the reroute packet. Report to Command for checkpoint sync.")
      };
    }

    const nextOrderForClue = latestWrongThisOrder && fallbackAdvance ? team.current_order + 1 : team.current_order + 1;
    const nextExpected = await findExpectedRoom(event.id, team.assigned_path as string, nextOrderForClue);
    return {
      completed: false,
      message: "Submission already recorded. Decode the clue packet for your next room.",
      team,
      active_pulse: pulse,
      latest_broadcast: broadcast,
      next_room_clue: nextExpected
        ? buildRoomClue(
            nextExpected,
            nextOrderForClue + team.points + stableHash(answerToken(team.team_name)),
            answerToken(team.team_name),
            false,
            assistMode
          )
        : fallbackClue("The next node packet failed to decrypt. Report to Command for route sync.")
    };
  }
  await enforceSingleSubmission({
    eventId: event.id,
    teamId: team.id,
    checkpointCode: mainCheckpointCode
  });

  const question = await ensureQuestionAvailable({
    teamId: team.id,
    eventId: team.event_config_id,
    mainSteps,
    orderNumber: team.current_order
  });
  if (!question) throw new ApiError(500, "Question cache missing");

  const isCorrect = isAnswerMatch(input.answer, question.cached_answer);
  const fragmentMeta =
    isCorrect && team.story_fragments_collected < STORY_FRAGMENTS.length
      ? STORY_FRAGMENTS[team.story_fragments_collected]
      : null;
  const fragment = fragmentMeta ? `${fragmentMeta.title}: ${fragmentMeta.text}` : null;
  const fragmentPoints = fragmentMeta?.bonusPoints ?? 0;
  const collectedAfterAnswer = isCorrect ? team.story_fragments_collected + 1 : team.story_fragments_collected;
  const milestonePoints =
    isCorrect && STORY_MILESTONES[collectedAfterAnswer] && team.story_fragments_collected < collectedAfterAnswer
      ? STORY_MILESTONES[collectedAfterAnswer]
      : 0;
  const milestoneReward = milestoneRewardPayload(collectedAfterAnswer, milestonePoints);
  const storyPoints = fragmentPoints + milestonePoints;
  const nextOrder = team.current_order + 1;
  const nextCombo = isCorrect ? team.combo_streak + 1 : 0;
  const mult = 1 + Math.min(0.5, team.combo_streak * 0.1);
  const mainDelta = isCorrect
    ? Math.round(scoreDelta({ isCorrect: true, inRapid: false }) * mult)
    : scoreDelta({ isCorrect: false, inRapid: false });
  const adjustedMainDelta = Math.round(mainDelta * pulse.pointsMultiplier);

  if (!isCorrect) {
    const trapCandidates = rooms.filter((r) => r.is_trap);
    if (trapCandidates.length === 0) {
      // Safety fallback: avoid deadlock when event has zero trap nodes.
      // Main submission lock is already consumed, so advance checkpoint with penalty.
      const advancedWrong = await updateTeamWithVersion(team.id, team.version, {
        current_order: team.current_order + 1,
        current_room_id: null,
        points: Math.max(0, team.points + adjustedMainDelta),
        penalty_seconds: team.penalty_seconds + Math.round(env.DEFAULT_TRAP_PENALTY_SECONDS * pulse.trapPenaltyMultiplier),
        combo_streak: 0
      });
      if (!advancedWrong) throw new ApiError(409, "Concurrent answer update");
      await createLog({
        event_config_id: event.id,
        team_id: team.id,
        action_type: LOG_ACTIONS.ANSWER_WRONG,
        metadata: {
          order: team.current_order,
          expected_room: expected.room_number,
          redirect_room: null,
          fallback: "no_trap_nodes_advance"
        }
      });
      const nextRoomFallback = await findExpectedRoom(event.id, team.assigned_path as string, advancedWrong.current_order);
      const runesCollected = await getRuneCount(event.id, team.id);
      const rivalChallenge = await maybeRivalChallenge(event.id, team.id, advancedWrong.points);
      return {
        completed: false,
        message: "Wrong answer recorded. Penalty applied; proceed to the next checkpoint.",
        team: advancedWrong,
        active_pulse: pulse,
        latest_broadcast: broadcast,
        runes_collected: runesCollected,
        rival_challenge: rivalChallenge,
        next_room_clue: nextRoomFallback
          ? buildRoomClue(
              nextRoomFallback,
              advancedWrong.current_order + advancedWrong.points + stableHash(answerToken(input.answer)),
              answerToken(input.answer),
              false,
              true
            )
          : fallbackClue("Route advance packet failed integrity checks. Report to Command for checkpoint sync.")
      };
    }
    const sameFloorTraps = trapCandidates.filter((r) => r.floor === expected.floor);
    const trapRoom = chooseRandom(sameFloorTraps.length > 0 ? sameFloorTraps : trapCandidates);
    const wrongPatch = {
      current_order: team.current_order,
      current_room_id: null,
      points: Math.max(0, team.points + adjustedMainDelta),
      combo_streak: 0
    };
    const updatedWrong = await updateTeamWithVersion(team.id, team.version, wrongPatch);
    if (!updatedWrong) throw new ApiError(409, "Concurrent answer update");

    await createLog({
      event_config_id: event.id,
      team_id: team.id,
      action_type: LOG_ACTIONS.ANSWER_WRONG,
      metadata: {
        order: team.current_order,
        expected_room: expected.room_number,
        redirect_room: trapRoom?.room_number ?? null
      }
    });

    const runesCollected = await getRuneCount(event.id, team.id);
    const rivalChallenge = await maybeRivalChallenge(event.id, team.id, updatedWrong.points);
    return {
      completed: false,
      message: "Response recorded. Decode the reroute clue packet.",
      team: updatedWrong,
      active_pulse: pulse,
      latest_broadcast: broadcast,
      runes_collected: runesCollected,
      rival_challenge: rivalChallenge,
      next_room_clue: trapRoom
        ? buildRoomClue(
            trapRoom,
            team.current_order + trapRoom.floor + stableHash(answerToken(input.answer)),
            answerToken(input.answer),
            false,
            true
          )
        : buildRoomClue(
            expected,
            team.current_order + stableHash(answerToken(input.answer)),
            answerToken(input.answer),
            false,
            true
          )
    };
  }

  const basePatch = {
    current_order: nextOrder,
    current_room_id: null,
    points: Math.max(0, team.points + adjustedMainDelta + storyPoints),
    story_fragments_collected: Math.min(STORY_FRAGMENTS.length, team.story_fragments_collected + 1),
    combo_streak: nextCombo
  };

  const isFinalMain = expected.is_final;
  if (isFinalMain) {
    if (collectedAfterAnswer < requiredFragments) {
      const held = await updateTeamWithVersion(team.id, team.version, {
        ...basePatch,
        current_order: team.current_order
      });
      if (!held) throw new ApiError(409, "Concurrent final-lock update");
      return {
        completed: false,
        message: "Final node lock active. Recover more node fragments and decode the clue to retry the final room.",
        fragment_unlocked: fragment ?? undefined,
        fragment_bonus_points: storyPoints,
        milestone_reward: milestoneReward ?? undefined,
        story_mission: buildStoryMission({
          collected: held.story_fragments_collected,
          required: requiredFragments
        }),
        story_chapter: storyChapterForCount(held.story_fragments_collected),
        team: held,
        active_pulse: pulse,
        latest_broadcast: broadcast,
        final_key_state: await getFinalKeyState(event.id, held.id),
        next_room_clue: buildRoomClue(
          expected,
          held.current_order + held.story_fragments_collected + stableHash(answerToken(input.answer)),
          answerToken(input.answer),
          true,
          true
        )
      };
    }
    const keyGateReady = await updateTeamWithVersion(team.id, team.version, {
      ...basePatch,
      current_order: rapidStartOrder,
      current_room_id: null
    });
    if (!keyGateReady) throw new ApiError(409, "Concurrent final-key update");
    const finalKeyReadyCode = buildFinalKeyCodes(event.id).gateReady;
    if (!(await hasTeamClaimedCode(event.id, keyGateReady.id, "final_key_gate_ready", finalKeyReadyCode))) {
      await createLog({
        event_config_id: event.id,
        team_id: keyGateReady.id,
        action_type: "final_key_gate_ready",
        metadata: { code: finalKeyReadyCode }
      });
    }
    return {
      completed: false,
      rapid_fire_ready: true,
      message:
        "Final route unlocked. Scan both key shards (A and B), then scan the rapid-fire chamber QR.",
      fragment_unlocked: fragment ?? undefined,
      fragment_bonus_points: storyPoints,
      milestone_reward: milestoneReward ?? undefined,
      story_mission: buildStoryMission({
        collected: keyGateReady.story_fragments_collected,
        required: requiredFragments
      }),
      story_chapter: storyChapterForCount(keyGateReady.story_fragments_collected),
      team: keyGateReady,
      rapid_category_state: {
        selected: await getRapidCategory(event.id, keyGateReady.id),
        options: RAPID_CATEGORIES
      },
      final_key_brief: buildFinalKeyBrief(event.id, rooms),
      final_key_state: await getFinalKeyState(event.id, keyGateReady.id),
      active_pulse: pulse,
      latest_broadcast: broadcast
    };
  }

  const updated = await updateTeamWithVersion(team.id, team.version, basePatch);
  if (!updated) throw new ApiError(409, "Concurrent answer update");
  const runesCollected = await getRuneCount(event.id, team.id);
  const rivalChallenge = await maybeRivalChallenge(event.id, team.id, updated.points);
  const isBossCheckpoint = BOSS_ORDERS.has(updated.current_order);
  let bossBadge: string | undefined;
  let teamOut = updated;
  if (isBossCheckpoint && isCorrect) {
    const bossBonus = 45;
    const patched = await updateTeamWithVersion(updated.id, updated.version, {
      points: updated.points + bossBonus
    });
    if (patched) {
      await createLog({
        event_config_id: event.id,
        team_id: team.id,
        action_type: "boss_checkpoint_cleared",
        metadata: { order: updated.current_order, bonus: bossBonus }
      });
      bossBadge = `Boss checkpoint cleared (+${bossBonus} points)`;
      teamOut = patched;
    }
  }
  const nextRoom = await findExpectedRoom(event.id, teamOut.assigned_path as string, teamOut.current_order);
  return {
    completed: false,
    message: "Response recorded. Decode your clue packet for the next room.",
    fragment_unlocked: fragment ?? undefined,
    fragment_bonus_points: storyPoints,
    milestone_reward: milestoneReward ?? undefined,
    story_mission: buildStoryMission({
      collected: teamOut.story_fragments_collected,
      required: requiredFragments
    }),
    story_chapter: storyChapterForCount(teamOut.story_fragments_collected),
    team: teamOut,
    boss_checkpoint: bossBadge,
    active_pulse: pulse,
    latest_broadcast: broadcast,
    runes_collected: runesCollected,
    rival_challenge: rivalChallenge,
    rapid_category_state: {
      selected: await getRapidCategory(event.id, teamOut.id),
      options: RAPID_CATEGORIES
    },
    final_key_state: await getFinalKeyState(event.id, teamOut.id),
    next_room_clue: nextRoom
      ? buildRoomClue(
          nextRoom,
          teamOut.current_order + teamOut.points + stableHash(answerToken(input.answer)),
          answerToken(input.answer),
          (question.difficulty_level ?? 1) >= 4,
          assistMode
        )
      : null
  };
}

export async function useHint(teamId: string) {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(409, "No active event");
  const team = await findTeamById(teamId);
  if (!team || team.event_config_id !== event.id) throw new ApiError(404, "Team not found");
  if (team.status !== "active") throw new ApiError(409, "Game not active");
  const hintCredits = await getHintCredits(event.id, team.id);
  if (team.hints_used >= event.max_hints && hintCredits <= 0) throw new ApiError(409, "Hint limit reached");
  const pulse = currentPulse();
  const hintPenalty = Math.round(env.DEFAULT_HINT_PENALTY_SECONDS * pulse.hintPenaltyMultiplier);

  const updated = await updateTeamWithVersion(team.id, team.version, {
    hints_used: team.hints_used + (hintCredits > 0 ? 0 : 1),
    penalty_seconds: team.penalty_seconds + (hintCredits > 0 ? Math.round(hintPenalty * 0.4) : hintPenalty),
    points: Math.max(0, team.points - 20),
    combo_streak: 0
  });
  if (!updated) throw new ApiError(409, "Concurrent hint update");
  if (hintCredits > 0) {
    await createLog({
      event_config_id: event.id,
      team_id: team.id,
      action_type: "hint_credit_used",
      metadata: {}
    });
  }

  const [paths, rooms, hintLogs] = await Promise.all([
    listPathsByEvent(event.id),
    listRoomsByEvent(event.id),
    listTeamActionLogs(event.id, team.id, LOG_ACTIONS.HINT_USED, 300)
  ]);
  const currentRoom = team.current_room_id ? rooms.find((r) => r.id === team.current_room_id) : null;
  let hint = "Mission intel sync unavailable";
  let checkpointKey = `checkpoint:${team.current_order}:generic`;
  let hintStage = 1;
  if (currentRoom?.is_trap) {
    checkpointKey = `trap:${team.current_order}:${currentRoom.room_code}`;
    const priorUses = countHintUsesForCheckpoint(hintLogs as Array<{ metadata?: Record<string, unknown> }>, checkpointKey);
    const trapQuestion = await buildTrapQuestion({
      eventId: team.event_config_id,
      teamId: team.id,
      trapRoomCode: currentRoom.room_code,
      difficultySeed: Math.max(1, Math.min(5, team.current_order))
    });
    const stages = questionHintStagesFromPool({
      difficulty: trapQuestion.difficulty_level,
      hints: [
        trapQuestion.hint_primary,
        trapQuestion.hint_secondary,
        trapQuestion.hint_tertiary,
        trapQuestion.hint_quaternary,
        trapQuestion.hint_quinary
      ],
      question: trapQuestion.question_text,
      expected: trapQuestion.answer
    });
    hintStage = Math.min(priorUses + 1, stages.length);
    hint = `${stageMessage(stages, priorUses)} ${abilityGuidance({
      shieldActive: team.shield_active,
      shieldCharges: team.shield_charges,
      pulseCharges: team.pulse_charges,
      hintCredits
    })}`;
  } else if (currentRoom) {
    checkpointKey = `question:${team.current_order}:${currentRoom.room_code}`;
    const priorUses = countHintUsesForCheckpoint(hintLogs as Array<{ metadata?: Record<string, unknown> }>, checkpointKey);
    const mainSteps = computeMainSteps(rooms, paths.length);
    const question = await ensureQuestionAvailable({
      teamId: team.id,
      eventId: team.event_config_id,
      mainSteps,
      orderNumber: team.current_order
    });
    hint = question
      ? `${stageMessage(
          questionHintStagesFromPool({
            difficulty: question.difficulty_level,
            hints: [
              question.cached_hint_primary,
              question.cached_hint_secondary,
              question.cached_hint_tertiary,
              question.cached_hint_quaternary,
              question.cached_hint_quinary
            ],
            question: question.cached_question,
            expected: question.cached_answer
          }),
          priorUses
        )} ${abilityGuidance({
          shieldActive: team.shield_active,
          shieldCharges: team.shield_charges,
          pulseCharges: team.pulse_charges,
          hintCredits
        })}`
      : "Mission intel sync unavailable";
    if (question) {
      const stageLen = questionHintStagesFromPool({
        difficulty: question.difficulty_level,
        hints: [
          question.cached_hint_primary,
          question.cached_hint_secondary,
          question.cached_hint_tertiary,
          question.cached_hint_quaternary,
          question.cached_hint_quinary
        ],
        question: question.cached_question,
        expected: question.cached_answer
      }).length;
      hintStage = Math.min(priorUses + 1, stageLen);
    }
  } else {
    const expected = team.assigned_path ? await findExpectedRoom(event.id, team.assigned_path, team.current_order) : null;
    if (expected) {
      checkpointKey = `route:${team.current_order}:${expected.room_code}`;
      const priorUses = countHintUsesForCheckpoint(hintLogs as Array<{ metadata?: Record<string, unknown> }>, checkpointKey);
      const routeHint = buildRoomClue(
        expected,
        team.current_order + team.points + stableHash(answerToken(team.team_name)),
        answerToken(team.team_name),
        true,
        true
      );
      const routeStages = Array.isArray(routeHint.clue_hints) && routeHint.clue_hints.length > 0
        ? routeHint.clue_hints
        : [routeHint.decode_hint];
      hintStage = Math.min(priorUses + 1, routeStages.length);
      hint = `Route hint (${routeHint.clue_style}) [Stage ${hintStage}]: ${stageMessage(routeStages, priorUses)} ${abilityGuidance({
        shieldActive: team.shield_active,
        shieldCharges: team.shield_charges,
        pulseCharges: team.pulse_charges,
        hintCredits
      })}`;
    } else {
      hint = `Route intel packet unavailable. ${abilityGuidance({
        shieldActive: team.shield_active,
        shieldCharges: team.shield_charges,
        pulseCharges: team.pulse_charges,
        hintCredits
      })}`;
    }
  }
  await createLog({
    event_config_id: event.id,
    team_id: team.id,
    action_type: LOG_ACTIONS.HINT_USED,
    metadata: {
      order: team.current_order,
      checkpoint_key: checkpointKey,
      hint_stage: hintStage
    }
  });
  return {
    team: updated,
    hint_credits_remaining: Math.max(0, hintCredits - 1),
    active_pulse: pulse,
    hint
  };
}

export async function useAbility(teamId: string, ability: "shield" | "pulse") {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(409, "No active event");
  const team = await findTeamById(teamId);
  if (!team || team.event_config_id !== event.id) throw new ApiError(404, "Team not found");
  if (team.status !== "active") throw new ApiError(409, "Game not active");

  if (ability === "shield") {
    if (team.shield_charges <= 0) {
      throw new ApiError(409, "No shield charges left. Scan a Shield power QR to replenish.");
    }
    if (team.shield_active) throw new ApiError(409, "Shield already active");
    const updated = await updateTeamWithVersion(team.id, team.version, {
      shield_charges: team.shield_charges - 1,
      shield_active: true
    });
    if (!updated) throw new ApiError(409, "Concurrent ability update");
    return {
      team: updated,
      ability,
      message: "Shield armed. Next trap scan will be blocked automatically. Refill by scanning a Shield power QR."
    };
  }

  if (team.pulse_charges <= 0) {
    throw new ApiError(409, "No pulse charges left. Scan a Pulse power QR to replenish.");
  }
  const [rooms, paths] = await Promise.all([
    listRoomsByEvent(event.id),
    listPathsByEvent(event.id)
  ]);
  const currentRoom = team.current_room_id ? rooms.find((r) => r.id === team.current_room_id) : null;
  let pulseMessage = "Pulse sync complete.";
  let pulseContext = "generic";
  let nextRoomClue: ReturnType<typeof buildRoomClue> | ReturnType<typeof fallbackClue> | null = null;
  if (currentRoom?.is_trap) {
    pulseContext = "trap_question";
    const trapQuestion = await buildTrapQuestion({
      eventId: team.event_config_id,
      teamId: team.id,
      trapRoomCode: currentRoom.room_code,
      difficultySeed: Math.max(1, Math.min(5, team.current_order))
    });
    pulseMessage = pulseAnswerIntel(trapQuestion.answer);
  } else if (currentRoom) {
    pulseContext = "main_question";
    const mainSteps = computeMainSteps(rooms, paths.length);
    const question = await ensureQuestionAvailable({
      teamId: team.id,
      eventId: team.event_config_id,
      mainSteps,
      orderNumber: team.current_order
    });
    if (!question) throw new ApiError(409, "No active question");
    pulseMessage = pulseAnswerIntel(question.cached_answer);
  } else {
    const expected = team.assigned_path ? await findExpectedRoom(event.id, team.assigned_path, team.current_order) : null;
    if (expected) {
      pulseContext = "route_clue";
      const routeHint = buildRoomClue(
        expected,
        team.current_order + team.points + stableHash(answerToken(team.team_name)),
        answerToken(team.team_name),
        true,
        true
      );
      const firstClue = Array.isArray(routeHint.clue_hints) && routeHint.clue_hints.length > 0 ? routeHint.clue_hints[0] : routeHint.decode_hint;
      pulseMessage = `Pulse route intel: target floor ${expected.floor ?? "?"}, clue style ${routeHint.clue_style}. ${firstClue}`;
      nextRoomClue = routeHint;
    } else {
      pulseMessage = "Pulse route intel unavailable. Confirm current checkpoint with Mission Control.";
      nextRoomClue = fallbackClue("Mission Control cannot confirm the live route packet. Report to Command for manual verification.");
    }
  }
  const updated = await updateTeamWithVersion(team.id, team.version, {
    pulse_charges: team.pulse_charges - 1,
    points: Math.max(0, team.points - 10)
  });
  if (!updated) throw new ApiError(409, "Concurrent ability update");
  await createLog({
    event_config_id: event.id,
    team_id: team.id,
    action_type: "ability_pulse_used",
    metadata: {
      context: pulseContext,
      order: team.current_order
    }
  });
  return {
    team: updated,
    ability,
    message: `${pulseMessage} Refill by scanning a Pulse power QR.`,
    next_room_clue: nextRoomClue
  };
}

export async function selectRapidCategory(teamId: string, category: RapidCategory) {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(409, "No active event");
  const [team, paths, rooms] = await Promise.all([
    findTeamById(teamId),
    listPathsByEvent(event.id),
    listRoomsByEvent(event.id)
  ]);
  if (!team || team.event_config_id !== event.id) throw new ApiError(404, "Team not found");
  if (team.status !== "active") throw new ApiError(409, "Game not active");
  if (team.phase !== "main") throw new ApiError(409, "Rapid category can only be selected before rapid-fire starts");
  const mainSteps = computeMainSteps(rooms, paths.length);
  const rapidStartOrder = mainSteps + 1;
  const finalKeyState = await getFinalKeyState(event.id, team.id);
  if (!finalKeyState.gate_ready || team.current_order < rapidStartOrder) {
    throw new ApiError(409, "Rapid category unlocks only at final key stage");
  }

  await recacheRapidQuestionsByCategory({
    eventId: event.id,
    teamId: team.id,
    mainSteps,
    category
  });
  await createLog({
    event_config_id: event.id,
    team_id: team.id,
    action_type: "rapid_category_selected",
    metadata: { category }
  });
  return {
    ok: true,
    category,
    rapid_category_state: {
      selected: category,
      options: RAPID_CATEGORIES
    }
  };
}

