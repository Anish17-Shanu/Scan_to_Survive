import crypto from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";
import { LOG_ACTIONS } from "../constants/game.js";
import { buildBeginnerQuestionBank } from "../data/beginnerQuestionBank.js";
import {
  createEventConfig,
  getActiveEvent,
  getEventState,
  setLeaderboardVisible,
  activateEvent,
  setPauseState,
  resetAllEvents,
  setEventStatus
} from "../repositories/eventRepo.js";
import {
  createLog,
  getLatestEventLogByAction,
  hasTeamClaimedCode,
  listEventLogsByActions,
  listRecentSuspiciousLogs,
  listTeamLogs
} from "../repositories/logRepo.js";
import { insertPaths, listPathsByEvent } from "../repositories/pathRepo.js";
import {
  countQuestionsByEvent,
  countTeamQuestionCacheByEvent,
  insertQuestions
} from "../repositories/questionRepo.js";
import { insertRooms, listRoomsByEvent } from "../repositories/roomRepo.js";
import {
  countTeamsByEvent,
  createTeam,
  deleteTeamsByEvent,
  findTeamByName,
  listLeaderboard,
  listTeamsByEvent,
  findTeamById,
  updateTeamWithVersion
} from "../repositories/teamRepo.js";
import { getPerformanceMetrics } from "./telemetryService.js";
import { sweepEventTimeoutIfNeeded } from "./eventTimeoutService.js";
import { elapsedSeconds } from "../utils/time.js";
import { hashPassword } from "../utils/password.js";
import { ApiError } from "../utils/apiError.js";
import { buildFinalKeyCodes, pickFinalKeyAnchors } from "../utils/finalKeyPlan.js";
import { resolveNodeIdentity, resolveNodeStatus, resolveNodeStatusStory } from "../utils/roomNodeIdentity.js";

const eventConfigSchema = z.object({
  total_teams: z.number().int().min(5).max(200),
  floor_room_map: z
    .array(
      z.object({
        floor: z.number().int().min(1).max(200),
        available_rooms: z.number().int().min(1).max(200)
      })
    )
    .min(1),
  excluded_room_numbers: z.array(z.string().trim().min(2).max(30)).default([]),
  trap_count: z.number().int().min(0).max(100),
  game_duration_hours: z.number().positive().max(12),
  max_hints: z.number().int().min(0).max(10),
  difficulty_curve: z.object({
    easy_orders: z.array(z.number().int().min(1)).default([1, 2]),
    medium_orders: z.array(z.number().int().min(1)).default([3, 4]),
    hard_orders: z.array(z.number().int().min(1)).default([5, 6]),
    very_hard_orders: z.array(z.number().int().min(1)).default([7])
  }),
  question_pool_size: z.number().int().min(1),
  max_teams_per_path: z.number().int().min(1).max(50)
});

const GLOBAL_PULSES = [
  { id: "double_points", label: "Double Points" },
  { id: "trap_surge", label: "Trap Surge" },
  { id: "safe_corridor", label: "Safe Corridor" },
  { id: "hint_storm", label: "Hint Storm" }
] as const;

function roomNodeMeta(input: {
  room: {
    room_number: string;
    floor: number;
    is_entry: boolean;
    is_final: boolean;
    is_trap: boolean;
  };
}) {
  return {
    node_identity: resolveNodeIdentity(input.room),
    system_status: resolveNodeStatus(input.room),
    status_story: resolveNodeStatusStory(input.room)
  };
}

function buildQrDisplayText(input: {
  room_number: string;
  node_identity: string;
  system_status: string;
  status_story: string;
}) {
  return [
    "NODE DETECTED",
    "",
    `Room: ${input.room_number}`,
    `Node Identity: ${input.node_identity}`,
    "",
    `SYSTEM STATUS: ${input.system_status}`,
    "",
    input.status_story
  ].join("\n");
}

function clueHintReference() {
  return [
    {
      clue_style: "cipher",
      hints: [
        "Inverse digit shift by -3 (mod 10).",
        "Decode per digit, not as full integer.",
        "Preserve original digit order."
      ]
    },
    {
      clue_style: "binary",
      hints: [
        "Split into fixed-size binary blocks.",
        "Convert each block to one digit character.",
        "Concatenate converted digits in order."
      ]
    },
    {
      clue_style: "logic",
      hints: [
        "Use the arithmetic relation exactly as shown.",
        "Isolate unknown room token.",
        "Cross-check with floor context."
      ]
    },
    {
      clue_style: "code-snippet",
      hints: [
        "Apply the described transformation literally.",
        "Ignore code syntax beyond the transform operation.",
        "Stop after one transform pass."
      ]
    },
    {
      clue_style: "pattern",
      hints: [
        "Use start/end anchors first.",
        "Reconstruct mirrored token carefully.",
        "Validate room-number format before scan."
      ]
    }
  ] as const;
}
let adminMonitorCache: { eventId: string; generatedAt: number; payload: unknown } | null = null;

async function isResultsLocked(eventId: string): Promise<boolean> {
  const lock = await getLatestEventLogByAction(eventId, "results_locked");
  const unlock = await getLatestEventLogByAction(eventId, "results_unlocked");
  if (!lock) return false;
  if (!unlock) return true;
  return new Date(lock.timestamp).getTime() > new Date(unlock.timestamp).getTime();
}

async function assertResultsUnlocked(eventId: string): Promise<void> {
  if (await isResultsLocked(eventId)) {
    throw new ApiError(409, "Results are locked. Unlock is required before modifying event outcomes.");
  }
}

function currentPulse() {
  const slot = Math.floor(Date.now() / 1000 / (15 * 60)) % GLOBAL_PULSES.length;
  return GLOBAL_PULSES[slot];
}

function computePathCount(totalTeams: number, maxTeamsPerPath: number): number {
  return Math.max(3, Math.min(20, Math.ceil(totalTeams / Math.max(1, maxTeamsPerPath))));
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function difficultyForOrder(order: number): number {
  if (order <= 2) return 1;
  if (order <= 4) return 3;
  if (order <= 6) return 4;
  return 5;
}

function computeMainSteps(rooms: Array<{ path_id: string | null; is_trap: boolean }>, pathCount: number): number {
  const perPath = rooms.filter((room) => room.path_id && !room.is_trap).length / Math.max(1, pathCount);
  return 2 + Math.max(1, Math.floor(perPath));
}

function liveLeaderboardReason(
  current: {
    points: number;
    projected_total_seconds: number | null;
    hints_used: number;
    trap_hits: number;
    rapid_fire_score: number;
  },
  next?: {
    points: number;
    projected_total_seconds: number | null;
    hints_used: number;
    trap_hits: number;
    rapid_fire_score: number;
  }
) {
  if (!next) return "Rank held by full scoring order.";
  if (current.points !== next.points) {
    const diff = current.points - next.points;
    return `${diff} point${diff === 1 ? "" : "s"} ahead on score.`;
  }
  const currentTime = current.projected_total_seconds ?? Number.MAX_SAFE_INTEGER;
  const nextTime = next.projected_total_seconds ?? Number.MAX_SAFE_INTEGER;
  if (currentTime !== nextTime) {
    const diff = nextTime - currentTime;
    return `${diff}s faster on adjusted total time at equal points.`;
  }
  if (current.hints_used !== next.hints_used) {
    const diff = next.hints_used - current.hints_used;
    return `${diff} fewer hint${diff === 1 ? "" : "s"} used at equal points/time.`;
  }
  if (current.trap_hits !== next.trap_hits) {
    const diff = next.trap_hits - current.trap_hits;
    return `${diff} fewer trap${diff === 1 ? "" : "s"} triggered at equal points/time/hints.`;
  }
  if (current.rapid_fire_score !== next.rapid_fire_score) {
    const diff = current.rapid_fire_score - next.rapid_fire_score;
    return `${diff} higher rapid-fire score on the final tie-break.`;
  }
  return "Virtually tied across all ranking checks.";
}

function buildRoomNumber(floor: number, index: number): string {
  return `${floor}${String(index).padStart(2, "0")}`;
}

function placementZone(input: { isEntry: boolean; isFinal: boolean; isTrap: boolean; orderNumber: number | null }): "desk" | "door" {
  if (input.isEntry || input.isFinal) return "door";
  if (input.isTrap) return "desk";
  if (!input.orderNumber) return "door";
  return input.orderNumber % 2 === 0 ? "door" : "desk";
}

function placementNote(zone: "desk" | "door"): string {
  return zone === "desk"
    ? "Attach under the front desk edge or inside desk privacy panel."
    : "Attach at eye-level on inner side of room door frame.";
}

function pickAnchors(
  eventId: string,
  rooms: Array<{ room_number: string; floor: number; is_entry?: boolean; is_trap?: boolean }>,
  count: number,
  seedPrefix: string
) {
  const candidates = rooms
    .filter((room) => !room.is_entry)
    .sort((a, b) => a.floor - b.floor || a.room_number.localeCompare(b.room_number));
  if (candidates.length === 0) return [] as Array<{ room_number: string; floor: number }>;
  const used = new Set<number>();
  const picked: Array<{ room_number: string; floor: number }> = [];
  for (let i = 0; i < count; i += 1) {
    let idx = Number.parseInt(
      crypto
        .createHash("sha1")
        .update(`${eventId}:${seedPrefix}:${i}`)
        .digest("hex")
        .slice(0, 8),
      16
    ) % candidates.length;
    let guard = 0;
    while (used.has(idx) && guard < candidates.length) {
      idx = (idx + 1) % candidates.length;
      guard += 1;
    }
    used.add(idx);
    picked.push({ room_number: candidates[idx].room_number, floor: candidates[idx].floor });
  }
  return picked;
}

export async function configureEvent(input: unknown) {
  const parsed = eventConfigSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, "Invalid event configuration");
  const config = parsed.data;
  const totalFloors = config.floor_room_map.length;
  const excludedSet = new Set(config.excluded_room_numbers.map((v) => v.trim()));
  const allPhysicalRooms: Array<{ floor: number; room_number: string }> = [];
  for (const row of config.floor_room_map) {
    for (let i = 1; i <= row.available_rooms; i += 1) {
      const roomNumber = buildRoomNumber(row.floor, i);
      if (!excludedSet.has(roomNumber)) {
        allPhysicalRooms.push({ floor: row.floor, room_number: roomNumber });
      }
    }
  }
  const totalAvailableRooms = allPhysicalRooms.length;
  const gameDurationSeconds = Math.floor(config.game_duration_hours * 3600);

  if (totalAvailableRooms <= config.trap_count + 2) {
    throw new ApiError(400, "Not enough rooms for configured trap count");
  }

  const eventConfig = await createEventConfig({
    total_teams: config.total_teams,
    total_floors: totalFloors,
    total_available_rooms: totalAvailableRooms,
    floor_room_map: config.floor_room_map,
    excluded_room_numbers: Array.from(excludedSet),
    trap_count: config.trap_count,
    game_duration: gameDurationSeconds,
    max_hints: config.max_hints,
    difficulty_curve: config.difficulty_curve,
    question_pool_size: config.question_pool_size,
    max_teams_per_path: config.max_teams_per_path
  });
  const pathCount = computePathCount(config.total_teams, config.max_teams_per_path);
  const paths = await insertPaths(
    Array.from({ length: pathCount }).map((_, i) => ({
      event_config_id: eventConfig.id,
      path_name: `Path-${String.fromCharCode(65 + i)}`,
      max_capacity: config.max_teams_per_path,
      path_order: i + 1
    }))
  );

  const puzzleRoomsTotal = totalAvailableRooms - 2 - config.trap_count;
  const roomsPerPath = Math.floor(puzzleRoomsTotal / pathCount);
  if (roomsPerPath < 2) {
    throw new ApiError(400, "Not enough non-excluded rooms to allocate minimum 2 puzzle rooms per path");
  }
  const floors = config.floor_room_map.map((row) => row.floor).sort((a, b) => a - b);
  const sortedPhysical = allPhysicalRooms
    .slice()
    .sort((a, b) => a.floor - b.floor || a.room_number.localeCompare(b.room_number));
  const entryPhysical = sortedPhysical[0];
  const finalPhysical = sortedPhysical[sortedPhysical.length - 1];
  if (!entryPhysical || !finalPhysical || entryPhysical.room_number === finalPhysical.room_number) {
    throw new ApiError(400, "Unable to reserve unique entry/final rooms");
  }

  const floorPools = new Map<number, Array<{ floor: number; room_number: string }>>();
  for (const floor of floors) floorPools.set(floor, []);
  for (const room of sortedPhysical) {
    if (room.room_number === entryPhysical.room_number || room.room_number === finalPhysical.room_number) continue;
    const pool = floorPools.get(room.floor);
    if (pool) pool.push(room);
  }
  for (const floor of floors) {
    const pool = floorPools.get(floor);
    if (pool) shuffleInPlace(pool);
  }

  const roomDigits = (roomNumber: string) => {
    const parsed = Number.parseInt(roomNumber.replace(/\D/g, ""), 10);
    return Number.isNaN(parsed) ? -1 : parsed;
  };
  const isAdjacentRoom = (
    a: { floor: number; room_number: string },
    b: { floor: number; room_number: string } | null
  ) => {
    if (!b) return false;
    if (a.floor !== b.floor) return false;
    const da = roomDigits(a.room_number);
    const db = roomDigits(b.room_number);
    if (da < 0 || db < 0) return false;
    return Math.abs(da - db) <= 1;
  };
  const takeFromPool = (
    pool: Array<{ floor: number; room_number: string }> | undefined,
    avoidAdjacentTo: { floor: number; room_number: string } | null
  ) => {
    if (!pool || pool.length === 0) return null;
    if (!avoidAdjacentTo) return pool.pop() ?? null;
    for (let i = pool.length - 1; i >= 0; i -= 1) {
      const candidate = pool[i];
      if (!isAdjacentRoom(candidate, avoidAdjacentTo)) {
        const [picked] = pool.splice(i, 1);
        return picked ?? null;
      }
    }
    return pool.pop() ?? null;
  };

  const takeRoom = (
    preferredFloor: number,
    avoidAdjacentTo: { floor: number; room_number: string } | null
  ): { floor: number; room_number: string } => {
    const preferred = floorPools.get(preferredFloor);
    const preferredPicked = takeFromPool(preferred, avoidAdjacentTo);
    if (preferredPicked) return preferredPicked;
    const shuffledFloors = shuffleInPlace(floors.slice());
    for (const floor of shuffledFloors) {
      const picked = takeFromPool(floorPools.get(floor), avoidAdjacentTo);
      if (picked) return picked;
    }
    throw new ApiError(400, "Not enough non-excluded rooms for requested setup");
  };

  const generatedRooms: Array<{
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
  }> = [];

  generatedRooms.push({
    event_config_id: eventConfig.id,
    room_number: entryPhysical.room_number,
    floor: entryPhysical.floor,
    path_id: null,
    order_number: null,
    room_code: `${eventConfig.id}-ENTRY`,
    is_trap: false,
    is_entry: true,
    is_final: false,
    difficulty_level: 1,
    trap_base_probability: 0
  });

  const lastRoomByPath = new Map<string, { floor: number; room_number: string }>();
  for (const path of paths) {
    for (let order = 1; order <= roomsPerPath; order += 1) {
      const preferredFloor = floors[(order + path.path_order - 1) % floors.length];
      const pickedRoom = takeRoom(preferredFloor, lastRoomByPath.get(path.id) ?? null);
      lastRoomByPath.set(path.id, pickedRoom);
      generatedRooms.push({
        event_config_id: eventConfig.id,
        room_number: pickedRoom.room_number,
        floor: pickedRoom.floor,
        path_id: path.id,
        order_number: order,
        room_code: `${eventConfig.id}-${path.path_order}-${order}-${crypto.randomUUID().slice(0, 8)}`,
        is_trap: false,
        is_entry: false,
        is_final: false,
        difficulty_level: difficultyForOrder(order + 1),
        trap_base_probability: 0
      });
    }
  }

  generatedRooms.push({
    event_config_id: eventConfig.id,
    room_number: finalPhysical.room_number,
    floor: finalPhysical.floor,
    path_id: null,
    order_number: null,
    room_code: `${eventConfig.id}-FINAL`,
    is_trap: false,
    is_entry: false,
    is_final: true,
    difficulty_level: 5,
    trap_base_probability: 0
  });

  const trapRooms = Array.from({ length: config.trap_count }).map((_, idx) => {
    const pickedRoom = takeRoom(floors[idx % floors.length], null);
    return {
      event_config_id: eventConfig.id,
      room_number: pickedRoom.room_number,
      floor: pickedRoom.floor,
      path_id: null,
      order_number: null,
      room_code: `${eventConfig.id}-TRAP-${idx + 1}`,
      is_trap: true,
      is_entry: false,
      is_final: false,
      difficulty_level: null,
      trap_base_probability: 0.35
    };
  });

  await insertRooms([...generatedRooms, ...trapRooms]);

  const seedSize = Math.max(1000, config.question_pool_size);
  await insertQuestions(buildBeginnerQuestionBank(eventConfig.id, seedSize));

  await activateEvent(eventConfig.id);
  await setPauseState(true, "Preflight mode: review setup in admin and press Resume Event to begin.", new Date().toISOString());
  await createLog({
    event_config_id: eventConfig.id,
    action_type: LOG_ACTIONS.EVENT_CONFIGURED,
    metadata: {
      config,
      path_count: pathCount,
      rooms_per_path: roomsPerPath,
      trap_count: config.trap_count
    }
  });

  return {
    event_config: eventConfig,
    generated: {
      path_count: pathCount,
      rooms_per_path: roomsPerPath,
      total_rooms_created: generatedRooms.length + trapRooms.length
    }
  };
}

export async function adminCreateTeam(input: { teamName: string; password: string }) {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(409, "Configure event first");
  if (event.status !== "active") throw new ApiError(409, "Event is not currently open for team creation");
  const teamName = input.teamName.trim();
  if (!teamName) throw new ApiError(400, "Team name is required");

  const current = await countTeamsByEvent(event.id);
  if (current >= event.total_teams) {
    throw new ApiError(409, "Team limit reached for active event");
  }
  const existing = await findTeamByName(event.id, teamName);
  if (existing) throw new ApiError(409, "Team name already exists");

  const team = await createTeam({
    event_config_id: event.id,
    team_name: teamName,
    password_hash: await hashPassword(input.password)
  });

  await createLog({
    event_config_id: event.id,
    team_id: team.id,
    action_type: LOG_ACTIONS.TEAM_CREATED
  });

  return {
    id: team.id,
    team_name: team.team_name,
    status: team.status
  };
}

async function buildFinalKeySupervision(eventId: string) {
  const logs = await listEventLogsByActions(eventId, ["final_key_step", "rapid_fire_gate_scan"], 4000);
  const grouped = new Map<string, { team_id: string; nexus: string | null; amiphoria: string | null; rapid_gate_scan: string | null }>();
  for (const row of logs) {
    if (!row.team_id) continue;
    if (!grouped.has(row.team_id)) {
      grouped.set(row.team_id, { team_id: row.team_id, nexus: null, amiphoria: null, rapid_gate_scan: null });
    }
    const g = grouped.get(row.team_id);
    if (!g) continue;
    const code = typeof row.metadata?.code === "string" ? row.metadata.code : "";
    if (row.action_type === "final_key_step" && code.endsWith("-NEXUS")) g.nexus = g.nexus ?? row.timestamp;
    if (row.action_type === "final_key_step" && code.endsWith("-AMIPHORIA")) g.amiphoria = g.amiphoria ?? row.timestamp;
    if (row.action_type === "rapid_fire_gate_scan") g.rapid_gate_scan = g.rapid_gate_scan ?? row.timestamp;
  }
  return Array.from(grouped.values());
}

async function buildFairnessAlerts(
  eventId: string,
  finalKeySupervision: Array<{ team_id: string; nexus: string | null; amiphoria: string | null; rapid_gate_scan: string | null }>
) {
  const logs = await listEventLogsByActions(eventId, ["answer_correct", "answer_wrong", "room_scan", "rapid_fire_gate_scan"], 5000);
  const counters = new Map<string, { rapidGateWithoutKeys: boolean; correct: number; wrong: number; scans: number }>();
  const scanTimes = new Map<string, number[]>();
  for (const row of logs) {
    if (!row.team_id) continue;
    if (!counters.has(row.team_id)) {
      counters.set(row.team_id, { rapidGateWithoutKeys: false, correct: 0, wrong: 0, scans: 0 });
    }
    const c = counters.get(row.team_id);
    if (!c) continue;
    if (row.action_type === "answer_correct") c.correct += 1;
    if (row.action_type === "answer_wrong") c.wrong += 1;
    if (row.action_type === "room_scan") {
      c.scans += 1;
      const ts = new Date(row.timestamp).getTime();
      if (!Number.isNaN(ts)) {
        if (!scanTimes.has(row.team_id)) scanTimes.set(row.team_id, []);
        scanTimes.get(row.team_id)?.push(ts);
      }
    }
  }
  const keyByTeam = new Map(finalKeySupervision.map((k) => [k.team_id, k]));
  const alerts: Array<{ team_id: string; severity: "low" | "medium" | "high"; reason: string }> = [];
  for (const [teamId, c] of counters) {
    const key = keyByTeam.get(teamId);
    if (key?.rapid_gate_scan && (!key.nexus || !key.amiphoria)) {
      alerts.push({ team_id: teamId, severity: "high", reason: "Rapid gate scanned without both key shards" });
    }
    if (c.correct >= 12 && c.wrong === 0) {
      alerts.push({ team_id: teamId, severity: "medium", reason: "Unusually perfect answer streak" });
    }
    if (c.scans > 0 && c.correct === 0 && c.wrong === 0) {
      alerts.push({ team_id: teamId, severity: "low", reason: "Many scans but no submissions" });
    }
    const scans = (scanTimes.get(teamId) ?? []).slice().sort((a, b) => a - b);
    let ultraFastTransitions = 0;
    for (let i = 1; i < scans.length; i += 1) {
      const deltaSec = (scans[i] - scans[i - 1]) / 1000;
      if (deltaSec > 0 && deltaSec < 12) ultraFastTransitions += 1;
    }
    if (ultraFastTransitions >= 3) {
      alerts.push({
        team_id: teamId,
        severity: ultraFastTransitions >= 5 ? "high" : "medium",
        reason: `Unusually fast room progression (${ultraFastTransitions} transitions under 12s)`
      });
    }
  }
  return alerts.slice(0, 50);
}

async function buildPostGameAnalytics(eventId: string) {
  const [teams, logs] = await Promise.all([
    listTeamsByEvent(eventId),
    listEventLogsByActions(eventId, ["answer_wrong", "answer_correct", "trap_triggered", "room_scan"], 10000)
  ]);
  const missByOrder = new Map<number, number>();
  const bottleneckByRoom = new Map<string, number>();
  let trapsTriggered = 0;
  let correct = 0;
  let wrong = 0;
  for (const row of logs) {
    if (row.action_type === "trap_triggered") trapsTriggered += 1;
    if (row.action_type === "answer_correct") correct += 1;
    if (row.action_type === "answer_wrong") {
      wrong += 1;
      const order = Number(row.metadata?.order);
      if (!Number.isNaN(order)) missByOrder.set(order, (missByOrder.get(order) ?? 0) + 1);
    }
    if (row.action_type === "room_scan") {
      const roomNum = typeof row.metadata?.room_number === "string" ? row.metadata.room_number : null;
      if (roomNum) bottleneckByRoom.set(roomNum, (bottleneckByRoom.get(roomNum) ?? 0) + 1);
    }
  }
  return {
    finished_teams: teams.filter((t) => t.status === "completed").length,
    timeout_teams: teams.filter((t) => t.status === "timeout").length,
    avg_points: teams.length > 0 ? Math.round(teams.reduce((acc, t) => acc + t.points, 0) / teams.length) : 0,
    accuracy:
      correct + wrong > 0 ? Number(((correct / (correct + wrong)) * 100).toFixed(2)) : 0,
    trap_trigger_count: trapsTriggered,
    top_missed_orders: Array.from(missByOrder.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([order, misses]) => ({ order, misses })),
    bottleneck_rooms: Array.from(bottleneckByRoom.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([room_number, scans]) => ({ room_number, scans }))
  };
}

export async function adminMonitor() {
  await sweepEventTimeoutIfNeeded("admin_monitor");
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  const now = Date.now();
  if (adminMonitorCache && adminMonitorCache.eventId === event.id && now - adminMonitorCache.generatedAt < 1500) {
    return adminMonitorCache.payload;
  }
  const state = await getEventState();

  const [paths, rooms, teams, suspicious, totalQuestions, cachedQuestions, finalKeySupervision] = await Promise.all([
    listPathsByEvent(event.id),
    listRoomsByEvent(event.id),
    listTeamsByEvent(event.id),
    listRecentSuspiciousLogs(event.id, 30),
    countQuestionsByEvent(event.id),
    countTeamQuestionCacheByEvent(event.id),
    buildFinalKeySupervision(event.id)
  ]);
  const postGameAnalytics =
    event.status === "completed" || teams.every((t) => t.status !== "active")
      ? await buildPostGameAnalytics(event.id)
      : null;

  const fairnessAlerts = await buildFairnessAlerts(event.id, finalKeySupervision);

  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const occupancyByRoomId = new Map<string, number>();
  const assignedByPathId = new Map<string, number>();
  for (const team of teams) {
    if (team.current_room_id) {
      occupancyByRoomId.set(team.current_room_id, (occupancyByRoomId.get(team.current_room_id) ?? 0) + 1);
    }
    if (team.assigned_path) {
      assignedByPathId.set(team.assigned_path, (assignedByPathId.get(team.assigned_path) ?? 0) + 1);
    }
  }

  const occupancy = rooms.map((room) => ({
    room_number: room.room_number,
    count: occupancyByRoomId.get(room.id) ?? 0
  }));

  const pathDistribution = paths.map((path) => ({
    path_name: path.path_name,
    assigned: assignedByPathId.get(path.id) ?? 0,
    max_capacity: path.max_capacity
  }));

  const nowMs = Date.now();
  const mainSteps = computeMainSteps(rooms, paths.length);
  const rapidStartOrder = mainSteps + 1;

  const teamSnapshots = teams.map((team) => {
    const room = team.current_room_id ? roomById.get(team.current_room_id) : null;
    const rapidElapsed =
      team.phase === "rapid_fire" && team.rapid_fire_start_time
        ? Math.max(0, Math.floor((nowMs - new Date(team.rapid_fire_start_time).getTime()) / 1000))
        : null;
    const rapidRemaining = rapidElapsed === null ? null : Math.max(0, 5 * 60 - rapidElapsed);
    const rapidAnswered =
      team.phase === "rapid_fire" ? Math.max(0, Math.min(5, team.current_order - rapidStartOrder)) : null;
    return {
      team_id: team.id,
      team_name: team.team_name,
      status: team.status,
      phase: team.phase,
      current_order: team.current_order,
      path_id: team.assigned_path,
      current_room: room?.room_number ?? null,
      hints_used: team.hints_used,
      trap_hits: team.trap_hits,
      penalty_seconds: team.penalty_seconds,
      rapid_remaining_seconds: rapidRemaining,
      rapid_answered: rapidAnswered,
      rapid_total: team.phase === "rapid_fire" ? 5 : null
    };
  });

  const liveLeaderboard = teams
    .map((team) => {
      const elapsedLive = team.start_time ? Math.max(0, Math.floor((nowMs - new Date(team.start_time).getTime()) / 1000)) : 0;
      const rapidElapsed =
        team.phase === "rapid_fire" && team.rapid_fire_start_time
          ? Math.max(0, Math.floor((nowMs - new Date(team.rapid_fire_start_time).getTime()) / 1000))
          : null;
      const rapidRemaining = rapidElapsed === null ? null : Math.max(0, 5 * 60 - rapidElapsed);
      const rapidAnswered =
        team.phase === "rapid_fire" ? Math.max(0, Math.min(5, team.current_order - rapidStartOrder)) : null;
      const projectedTotal =
        team.total_time_seconds ??
        (team.status === "active" ? elapsedLive + team.penalty_seconds : team.penalty_seconds);
      const progressScore =
        team.current_order * 1000 +
        team.points * 2 +
        team.rapid_fire_score * 120 -
        team.penalty_seconds -
        team.hints_used * 25 -
        team.trap_hits * 30;
      return {
        team_id: team.id,
        team_name: team.team_name,
        status: team.status,
        phase: team.phase,
        current_order: team.current_order,
        points: team.points,
        rapid_fire_score: team.rapid_fire_score,
        hints_used: team.hints_used,
        trap_hits: team.trap_hits,
        penalty_seconds: team.penalty_seconds,
        rapid_remaining_seconds: rapidRemaining,
        rapid_answered: rapidAnswered,
        rapid_total: team.phase === "rapid_fire" ? 5 : null,
        projected_total_seconds: projectedTotal,
        progress_score: progressScore
      };
    })
    .sort((a, b) => {
      if (a.progress_score !== b.progress_score) return b.progress_score - a.progress_score;
      if (a.points !== b.points) return b.points - a.points;
      if (a.current_order !== b.current_order) return b.current_order - a.current_order;
      return a.penalty_seconds - b.penalty_seconds;
    })
    .map((row, index, arr) => ({
      ...row,
      rank: index + 1,
      lead_reason: liveLeaderboardReason(row, arr[index + 1])
    }));

  const latestBroadcast = await getLatestEventLogByAction(event.id, "admin_broadcast");
  const payload = {
    event: {
      id: event.id,
      total_teams: event.total_teams,
      game_duration: event.game_duration,
      is_paused: state.is_paused,
      pause_reason: state.pause_reason,
      active_pulse: currentPulse()
    },
    latest_broadcast: latestBroadcast
      ? {
          message: latestBroadcast.metadata?.message ?? null,
          level: latestBroadcast.metadata?.level ?? "info",
          timestamp: latestBroadcast.timestamp
        }
      : null,
    path_distribution: pathDistribution,
    room_occupancy: occupancy,
    live_leaderboard: liveLeaderboard,
    question_stats: {
      total_questions_in_pool: totalQuestions,
      cached_team_questions: cachedQuestions
    },
    final_key_supervision: finalKeySupervision,
    fairness_alerts: fairnessAlerts,
    post_game_analytics: postGameAnalytics,
    teams: teamSnapshots,
    suspicious_activity: suspicious
  };
  adminMonitorCache = {
    eventId: event.id,
    generatedAt: now,
    payload
  };
  return payload;
}

export async function pauseEvent(reason: string) {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  await assertResultsUnlocked(event.id);
  const state = await getEventState();
  if (state.is_paused) return { is_paused: true, reason: state.pause_reason };
  await setPauseState(true, reason.trim() || "Paused by admin", new Date().toISOString());
  await createLog({
    event_config_id: event.id,
    action_type: "event_paused",
    metadata: { reason }
  });
  return { is_paused: true, reason };
}

export async function resumeEvent() {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  await assertResultsUnlocked(event.id);
  const state = await getEventState();
  if (state.is_paused && state.pause_started_at) {
    const pauseMs = Date.now() - new Date(state.pause_started_at).getTime();
    if (pauseMs > 0) {
      const teams = await listTeamsByEvent(event.id);
      for (const team of teams) {
        if (team.status !== "active") continue;
        const patch: Record<string, unknown> = {};
        if (team.start_time) {
          patch.start_time = new Date(new Date(team.start_time).getTime() + pauseMs).toISOString();
        }
        if (team.rapid_fire_start_time) {
          patch.rapid_fire_start_time = new Date(new Date(team.rapid_fire_start_time).getTime() + pauseMs).toISOString();
        }
        if (Object.keys(patch).length > 0) {
          await updateTeamWithVersion(team.id, team.version, patch);
        }
      }
    }
  }
  await setPauseState(false, null, null);
  await createLog({
    event_config_id: event.id,
    action_type: "event_resumed",
    metadata: {}
  });
  return { is_paused: false };
}

export async function forceFinishTeam(teamId: string, reason: string) {
  const team = await findTeamById(teamId);
  if (!team) throw new ApiError(404, "Team not found");
  await assertResultsUnlocked(team.event_config_id);
  if (team.status === "completed" || team.status === "timeout" || team.status === "disqualified") {
    return { team_id: team.id, status: team.status, total_time_seconds: team.total_time_seconds };
  }
  const total = team.start_time ? elapsedSeconds(team.start_time) + team.penalty_seconds : team.penalty_seconds;
  const updated = await updateTeamWithVersion(team.id, team.version, {
    status: "completed",
    phase: "completed",
    end_time: new Date().toISOString(),
    total_time_seconds: total
  });
  if (!updated) throw new ApiError(409, "Concurrent update; retry");
  await createLog({
    event_config_id: team.event_config_id,
    team_id: team.id,
    action_type: "force_finish",
    metadata: { reason }
  });
  return { team_id: updated.id, status: updated.status, total_time_seconds: updated.total_time_seconds };
}

export async function forceUnlockNext(teamId: string, reason: string) {
  const team = await findTeamById(teamId);
  if (!team) throw new ApiError(404, "Team not found");
  await assertResultsUnlocked(team.event_config_id);
  if (team.status !== "active") throw new ApiError(409, "Team is not active");
  if (team.phase === "rapid_fire") throw new ApiError(409, "Force unlock unavailable during rapid-fire");
  if (!team.assigned_path) throw new ApiError(409, "Team path not assigned");
  const [rooms, paths] = await Promise.all([listRoomsByEvent(team.event_config_id), listPathsByEvent(team.event_config_id)]);
  const rapidStartOrder = computeMainSteps(rooms, paths.length) + 1;
  if (team.current_order >= rapidStartOrder) {
    throw new ApiError(409, "Team is already at final checkpoint");
  }
  const nextOrder = Math.min(rapidStartOrder, team.current_order + 1);
  const updated = await updateTeamWithVersion(team.id, team.version, {
    current_order: nextOrder,
    current_room_id: null
  });
  if (!updated) throw new ApiError(409, "Concurrent update; retry");
  if (nextOrder >= rapidStartOrder) {
    const gateReadyCode = buildFinalKeyCodes(team.event_config_id).gateReady;
    if (!(await hasTeamClaimedCode(team.event_config_id, team.id, "final_key_gate_ready", gateReadyCode))) {
      await createLog({
        event_config_id: team.event_config_id,
        team_id: team.id,
        action_type: "final_key_gate_ready",
        metadata: { code: gateReadyCode, source: "force_unlock" }
      });
    }
  }
  await createLog({
    event_config_id: team.event_config_id,
    team_id: team.id,
    action_type: "force_unlock",
    metadata: { reason, from_order: team.current_order, to_order: updated.current_order, rapid_start_order: rapidStartOrder }
  });
  return { team_id: updated.id, current_order: updated.current_order };
}

export async function readinessStatus() {
  const state = await getEventState();
  const event = state.active_event_id ? await getActiveEvent() : null;
  const issues: string[] = [];
  if (!state.active_event_id) issues.push("No active event configured");
  if (state.is_paused) issues.push(`Event paused${state.pause_reason ? ` (${state.pause_reason})` : ""}`);
  if (event) {
    const [teamCount, qCount] = await Promise.all([countTeamsByEvent(event.id), countQuestionsByEvent(event.id)]);
    if (teamCount === 0) issues.push("No teams created");
    if (qCount < 200) issues.push("Question pool too low");
    return {
      ok: issues.length === 0,
      active_event_id: event.id,
      is_paused: state.is_paused,
      team_count: teamCount,
      question_pool_count: qCount,
      issues
    };
  }
  return {
    ok: issues.length === 0,
    active_event_id: null,
    is_paused: state.is_paused,
    team_count: 0,
    question_pool_count: 0,
    issues
  };
}

// Optimized QR validation - single manual verification instead of sweep
export async function adminQrValidationStatus() {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  
  const validatedRows = await listEventLogsByActions(event.id, ["qr_validation_scan"], 100);
  const completedRow = await getLatestEventLogByAction(event.id, "qr_validation_complete");

  return {
    event_id: event.id,
    validated_count: validatedRows.length,
    completed: Boolean(completedRow),
    completion_time: completedRow?.timestamp ?? null,
    message: completedRow ? "QR validation complete" : "QR validation in progress"
  };
}

// Simplified: one-step confirmation instead of item-by-item sweep
export async function adminConfirmQrValidation(operatorNote?: string) {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  
  // Single confirmation log instead of per-QR validation
  await createLog({
    event_config_id: event.id,
    action_type: "qr_validation_complete",
    metadata: {
      validated_at: new Date().toISOString(),
      note: operatorNote?.trim() || "QR codes verified and placed",
      mode: "operator_confirmation"
    }
  });
  
  return {
    ok: true,
    completed: true,
    message: "QR validation confirmed. Ready to launch event."
  };
}

// Removed: adminCompleteQrValidation() - consolidated into adminConfirmQrValidation()

// Remove QR validation from launch check
export async function launchEventIfReady() {
  const readiness = await readinessStatus();
  if (!readiness.active_event_id) {
    throw new ApiError(409, "No active event configured");
  }
  if (readiness.issues.length > 1 || (readiness.issues.length === 1 && !readiness.is_paused)) {
    throw new ApiError(409, `Launch blocked: ${readiness.issues.join("; ")}`);
  }
  if (!readiness.is_paused) {
    return {
      ok: true,
      started: false,
      message: "Event already running",
      readiness
    };
  }
  await resumeEvent();
  const after = await readinessStatus();
  return {
    ok: true,
    started: true,
    message: "Event resumed from preflight and is now live",
    readiness: after
  };
}

export async function superAdminStartGame(note?: string) {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  await setEventStatus(event.id, "active");
  await setPauseState(false, null, null);
  await createLog({
    event_config_id: event.id,
    action_type: "superadmin_start_game",
    metadata: {
      note: note?.trim() || null
    }
  });
  return {
    ok: true,
    started: true,
    event_id: event.id,
    message: "Game started by privileged admin."
  };
}

export async function superAdminEndGame(note?: string) {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  const teams = await listTeamsByEvent(event.id);
  const endedAt = new Date().toISOString();
  let endedTeams = 0;
  for (const team of teams) {
    if (team.status === "completed" || team.status === "timeout" || team.status === "disqualified") continue;
    const total = team.start_time ? elapsedSeconds(team.start_time) + team.penalty_seconds : team.penalty_seconds;
    const updated = await updateTeamWithVersion(team.id, team.version, {
      status: "completed",
      phase: "completed",
      end_time: endedAt,
      total_time_seconds: total
    });
    if (updated) endedTeams += 1;
  }
  await setEventStatus(event.id, "completed");
  await setPauseState(true, "Ended by privileged admin", endedAt);
  await createLog({
    event_config_id: event.id,
    action_type: "superadmin_end_game",
    metadata: {
      note: note?.trim() || null,
      teams_ended: endedTeams
    }
  });
  return {
    ok: true,
    ended: true,
    event_id: event.id,
    teams_ended: endedTeams,
    message: "Game ended by privileged admin."
  };
}
// export async function launchEventIfReady() {
//   const readiness = await readinessStatus();
//   if (!readiness.active_event_id) {
//     throw new ApiError(409, "No active event configured");
//   }
//   if (readiness.issues.length > 1 || (readiness.issues.length === 1 && !readiness.is_paused)) {
//     throw new ApiError(409, `Launch blocked: ${readiness.issues.join("; ")}`);
//   }
//   if (!readiness.is_paused) {
//     return {
//       ok: true,
//       started: false,
//       message: "Event already running",
//       readiness
//     };
//   }
//   await resumeEvent();
//   const after = await readinessStatus();
//   return {
//     ok: true,
//     started: true,
//     message: "Event resumed from preflight and is now live",
//     readiness: after
//   };
// }

export async function resetAllTeamsForActiveEvent() {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  await assertResultsUnlocked(event.id);
  const removed = await deleteTeamsByEvent(event.id);
  await setPauseState(false, null, null);
  await setLeaderboardVisible(false);
  await createLog({
    event_config_id: event.id,
    action_type: "teams_reset",
    metadata: { removed }
  });
  return {
    ok: true,
    removed_teams: removed,
    message: "All teams removed. Event ready for fresh team creation."
  };
}

export async function resetEverything() {
  const removedEvents = await resetAllEvents();
  adminMonitorCache = null;
  return {
    ok: true,
    removed_events: removedEvents,
    message: "Full platform reset complete. Configure a new event to start again."
  };
}

export async function adminOpsPackage() {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");

  const [paths, rooms] = await Promise.all([listPathsByEvent(event.id), listRoomsByEvent(event.id)]);
  const pathById = new Map(paths.map((p) => [p.id, p]));
  const nonEntryRooms = rooms
    .filter((room) => !room.is_entry)
    .map((room) => ({ room_number: room.room_number, floor: room.floor, is_entry: room.is_entry, is_trap: room.is_trap }));

  const placement = await Promise.all(
    rooms
    .slice()
    .sort((a, b) => a.floor - b.floor || a.room_number.localeCompare(b.room_number))
    .map(async (room) => {
      const node = roomNodeMeta({
        room: {
          room_number: room.room_number,
          floor: room.floor,
          is_entry: room.is_entry,
          is_final: room.is_final,
          is_trap: room.is_trap
        }
      });
      const zone = placementZone({
        isEntry: room.is_entry,
        isFinal: room.is_final,
        isTrap: room.is_trap,
        orderNumber: room.order_number
      });
      const qrSvg = await QRCode.toString(room.room_code, {
        type: "svg",
        margin: 1,
        width: 256
      });
      return {
        room_number: room.room_number,
        floor: room.floor,
        qr_code_payload: room.room_code,
        qr_svg: qrSvg,
        room_type: room.is_entry ? "entry" : room.is_final ? "final" : room.is_trap ? "trap" : "puzzle",
        path_name: room.path_id ? pathById.get(room.path_id)?.path_name ?? null : null,
        order_number: room.order_number,
        node_identity: node.node_identity,
        system_status: node.system_status,
        qr_display_text: buildQrDisplayText({
          room_number: room.room_number,
          node_identity: node.node_identity,
          system_status: node.system_status,
          status_story: node.status_story
        }),
        placement_zone: zone,
        placement_note: placementNote(zone)
      };
    })
  );

  const bonusAnchors = pickAnchors(event.id, nonEntryRooms, 20, "bonus");
  const bonusDefinitions = [
    ...[1, 2, 3, 4].map((n) => ({
      code: `${event.id}-POWER-${n}-shield`,
      type: "powerup",
      effect: "+1 shield charge",
      recommended_placement: "desk"
    })),
    ...[1, 2, 3, 4].map((n) => ({
      code: `${event.id}-POWER-${n}-pulse`,
      type: "powerup",
      effect: "+1 pulse charge",
      recommended_placement: "door"
    })),
    ...[1, 2, 3].map((n) => ({
      code: `${event.id}-POWER-${n}-hint`,
      type: "powerup",
      effect: "+1 hint credit",
      recommended_placement: "desk"
    })),
    ...[1, 2, 3].map((n) => ({
      code: `${event.id}-POWER-${n}-score`,
      type: "powerup",
      effect: "score booster",
      recommended_placement: "door"
    })),
    ...[1, 2, 3, 4, 5, 6].map((n) => ({
      code: `${event.id}-RUNE-${n}`,
      type: "rune",
      effect: "collectible points bonus",
      recommended_placement: n % 2 === 0 ? "door" : "desk"
    }))
  ] as const;

  const bonus_qr_plan = await Promise.all(
    bonusDefinitions.map(async (node, idx) => {
      const anchor = bonusAnchors[idx % Math.max(1, bonusAnchors.length)] ?? null;
      return {
      ...node,
      assigned_room_number: anchor?.room_number ?? null,
      assigned_floor: anchor?.floor ?? null,
      clue: anchor
        ? `Hidden near room ${anchor.room_number} on floor ${anchor.floor}.`
        : "Place in a supervised common area.",
      qr_svg: await QRCode.toString(node.code, {
        type: "svg",
        margin: 1,
        width: 256
      })
      };
    })
  );

  const finalAnchors = pickFinalKeyAnchors(event.id, rooms);
  const finalKeyCodes = buildFinalKeyCodes(event.id);
  const finalKeyDefinitions = [
    {
      code: finalKeyCodes.nexus,
      type: "final_key",
      effect: "Key Shard A (required before rapid-fire)",
      recommended_placement: "door",
      clue: "Key Shard A anchor"
    },
    {
      code: finalKeyCodes.amiphoria,
      type: "final_key",
      effect: "Key Shard B (required before rapid-fire)",
      recommended_placement: "desk",
      clue: "Key Shard B anchor"
    },
    {
      code: finalKeyCodes.rapidQr,
      type: "rapid_gate",
      effect: "Rapid-fire chamber entry (scan after both key shards)",
      recommended_placement: "door",
      clue: "Rapid gate anchor"
    }
  ] as const;

  const final_key_qr_plan = await Promise.all(
    finalKeyDefinitions.map(async (node, idx) => {
      const anchor =
        idx === 0
          ? finalAnchors.nexus
          : idx === 1
            ? finalAnchors.amiphoria
            : finalAnchors.rapidGate;
      const clue =
        node.type === "final_key"
          ? `${node.effect.split(" (")[0]} placed at room ${anchor?.room_number ?? "TBD"} floor ${anchor?.floor ?? "TBD"}.`
          : `Rapid gate is placed at room ${anchor?.room_number ?? "TBD"} floor ${anchor?.floor ?? "TBD"}.`;
      return {
        ...node,
        assigned_room_number: anchor?.room_number ?? null,
        assigned_floor: anchor?.floor ?? null,
        clue,
        qr_svg: await QRCode.toString(node.code, {
          type: "svg",
          margin: 1,
          width: 256
        })
      };
    })
  );
  const offline_fallback_packet = {
    title: "Offline Fallback Packet",
    emergency_rules: [
      "If backend/network fails for more than 90 seconds, switch to offline mode.",
      "Host reads the clue for next room from fallback sheet after validating answer verbally.",
      "Record manual timestamps and penalties; sync to logs after service recovers."
    ],
    fallback_route_cards: placement
      .filter((p) => p.room_type === "puzzle" || p.room_type === "final")
      .slice(0, 30)
      .map((p) => ({
        room_number: p.room_number,
        floor: p.floor,
        fallback_clue: `Mirror clue token for room ${p.room_number}`,
        validation_prompt: "State one technical keyword from current question."
      }))
  };

  const print_bundles = {
    rooms: placement
      .filter((p) => p.room_type === "entry" || p.room_type === "puzzle" || p.room_type === "final")
      .map((p) => p.qr_code_payload),
    traps: placement.filter((p) => p.room_type === "trap").map((p) => p.qr_code_payload),
    bonus: bonus_qr_plan.map((b) => b.code),
    final_keys: final_key_qr_plan.map((f) => f.code)
  };

  const questionBank = buildBeginnerQuestionBank(event.id, 200);
  const question_hint_bank = questionBank.map((q) => ({
    difficulty_level: q.difficulty_level,
    category: q.category,
    question: q.question_text,
    hint_primary: q.hint_primary,
    hint_secondary: q.hint_secondary,
    hint_tertiary: q.hint_tertiary,
    hint_quaternary: q.hint_quaternary,
    hint_quinary: q.hint_quinary
  }));

  return {
    event: {
      id: event.id,
      duration_hours: Number((event.game_duration / 3600).toFixed(2)),
      total_teams: event.total_teams
    },
    storyline: {
      title: "Operation: Firewall // Scan to Survive",
      intro:
        "A rogue AI called NULL has infiltrated the university network and fragmented it into physical system nodes across your building. Teams must restore node integrity, decode route clues, and contain NULL before total system loss.",
      objective:
        "Rebuild the core access key shard-by-shard, survive corrupted trap nodes, reunite Key Shard A + Key Shard B, and complete rapid-fire override to restore the network."
    },
    instructions: [
      "Scan room QR, solve technical question, then decode the clue packet for your next room.",
      "Wrong scans and wrong answers can reroute teams into trap challenges.",
      "Trap QR can add penalty without moving your path.",
      "Use hints carefully; each hint adds penalty.",
      "After final room, rapid-fire does not start immediately.",
      "Teams must scan both final key shard QRs, then scan RAPID-FIRE-QR.",
      "Rapid-fire round lasts for 5 minutes after rapid gate scan.",
      "Only hide QR cards on desk or door as specified in placement plan.",
      "Bonus QRs are optional support nodes: POWER (shield/pulse/score/hint) and RUNE collectibles.",
      "Final key QRs are mandatory and should be physically separated."
    ],
    final_key_qr_plan,
    bonus_qr_plan,
    print_bundles,
    clue_hint_reference: clueHintReference(),
    question_hint_bank,
    offline_fallback_packet,
    qr_placement_plan: placement,
    trap_rooms: placement.filter((p) => p.room_type === "trap"),
    print_cards: [
      ...placement.map((p) => ({
        title: `${p.room_number} | ${p.node_identity} | ${String(p.system_status).toUpperCase()}`,
        room_number: p.room_number,
        floor: p.floor,
        room_type: p.room_type,
        node_identity: p.node_identity,
        system_status: p.system_status,
        qr_display_text: p.qr_display_text,
        placement_zone: p.placement_zone,
        placement_note: p.placement_note,
        qr_code_payload: p.qr_code_payload,
        qr_svg: p.qr_svg
      })),
      ...bonus_qr_plan.map((node) => ({
        title: `BONUS ${node.type.toUpperCase()} | ${node.effect}`,
        room_number: node.assigned_room_number ?? "COMMON",
        floor: node.assigned_floor ?? 0,
        room_type: node.type,
        clue: node.clue,
        placement_zone: node.recommended_placement as "desk" | "door",
        placement_note:
          node.recommended_placement === "desk"
            ? "Attach under desk edge in common hallway."
            : "Attach inner door frame in shared area.",
        qr_code_payload: node.code,
        qr_svg: node.qr_svg
      })),
      ...final_key_qr_plan.map((node) => ({
        title: `${node.type.toUpperCase()} | ${node.effect}`,
        room_number: node.assigned_room_number ?? "COMMON",
        floor: node.assigned_floor ?? 0,
        room_type: node.type,
        clue: node.clue,
        placement_zone: node.recommended_placement as "desk" | "door",
        placement_note:
          node.recommended_placement === "desk"
            ? "Attach at mission desk station and protect from accidental scans."
            : "Attach at controlled door checkpoint for supervised scanning.",
        qr_code_payload: node.code,
        qr_svg: node.qr_svg
      }))
    ]
  };
}

export async function broadcastHostMessage(message: string, level: "info" | "warning" | "critical") {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  await createLog({
    event_config_id: event.id,
    action_type: "admin_broadcast",
    metadata: {
      message: message.trim(),
      level
    }
  });
  return { ok: true, message, level };
}

function buildWinnerRewards(input: {
  eventId: string;
  topThree: Array<{ rank: number; team_name: string; total_time_seconds: number | null; points: number }>;
}) {
  const rankMeta: Record<number, { title: string; reward: string; aura: string }> = {
    1: {
      title: "Guardian of the Network",
      reward: "Champion NFT-style digital seal + control-room spotlight",
      aura: "platinum"
    },
    2: {
      title: "Cipher Vanguard",
      reward: "Elite finalist digital crest + fast-track season invite",
      aura: "gold"
    },
    3: {
      title: "Pulse Sentinel",
      reward: "Finalist honor emblem + wildcard challenge access",
      aura: "silver"
    }
  };
  return input.topThree.map((row) => {
    const meta = rankMeta[row.rank] ?? {
      title: "Legend Runner",
      reward: "Exclusive achievement badge",
      aura: "neon"
    };
    const signature = crypto
      .createHash("sha256")
      .update(`${input.eventId}:${row.rank}:${row.team_name}:${row.total_time_seconds ?? -1}:${row.points}`)
      .digest("hex")
      .slice(0, 16)
      .toUpperCase();
    return {
      rank: row.rank,
      team_name: row.team_name,
      title: meta.title,
      reward: meta.reward,
      aura: meta.aura,
      achievement_code: `STS-${row.rank}-${signature}`
    };
  });
}

function buildRankedRows(rows: Awaited<ReturnType<typeof listLeaderboard>>) {
  return rows
    .slice()
    .sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      const ta = a.total_time_seconds ?? Number.MAX_SAFE_INTEGER;
      const tb = b.total_time_seconds ?? Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      if (a.hints_used !== b.hints_used) return a.hints_used - b.hints_used;
      if (a.trap_hits !== b.trap_hits) return a.trap_hits - b.trap_hits;
      return b.rapid_fire_score - a.rapid_fire_score;
    })
    .map((row, index) => ({
      rank: index + 1,
      team_id: row.id,
      team_name: row.team_name,
      status: row.status,
      total_time_seconds: row.total_time_seconds,
      points: row.points,
      rapid_fire_score: row.rapid_fire_score,
      hints_used: row.hints_used,
      trap_hits: row.trap_hits
    }));
}

export async function adminLeaderboard(options?: { forceRows?: boolean }) {
  const state = await getEventState();
  if (!state.active_event_id) throw new ApiError(404, "No active event");

  const rows = await listLeaderboard(state.active_event_id);
  const rankedRows = buildRankedRows(rows);
  const finaleReveal = await getLatestEventLogByAction(state.active_event_id, "finale_reveal");
  const finaleSequenceStartedAt =
    typeof finaleReveal?.metadata?.sequence_started_at === "string" ? finaleReveal.metadata.sequence_started_at : null;
  const finaleSequenceMode = Boolean(finaleSequenceStartedAt) || finaleReveal?.metadata?.sequence === true;

  return {
    server_time: new Date().toISOString(),
    visible: state.leaderboard_visible,
    finale_mode: Boolean(finaleReveal),
    finale_revealed_at: finaleReveal?.timestamp ?? null,
    finale_sequence_mode: finaleSequenceMode,
    finale_sequence_started_at: finaleSequenceStartedAt,
    top_three: state.leaderboard_visible || options?.forceRows ? rankedRows.slice(0, 3) : [],
    winner_rewards:
      state.leaderboard_visible || options?.forceRows
        ? buildWinnerRewards({
            eventId: state.active_event_id,
            topThree: rankedRows.slice(0, 3).map((row) => ({
              rank: row.rank,
              team_name: row.team_name,
              total_time_seconds: row.total_time_seconds,
              points: row.points
            }))
          })
        : [],
    rows: state.leaderboard_visible || options?.forceRows ? rankedRows : []
  };
}

export async function adminRankingAudit() {
  const state = await getEventState();
  if (!state.active_event_id) throw new ApiError(404, "No active event");
  const rows = await listLeaderboard(state.active_event_id);
  const rankedRows = buildRankedRows(rows);

  const auditRows = rankedRows.map((row) => {
    const tieVector = [
      -row.points,
      row.total_time_seconds ?? Number.MAX_SAFE_INTEGER,
      row.hints_used,
      row.trap_hits,
      -row.rapid_fire_score
    ];
    const sortKey = `${String(tieVector[0]).padStart(10, "0")}|${String(tieVector[1]).padStart(8, "0")}|${String(tieVector[2]).padStart(3, "0")}|${String(tieVector[3]).padStart(3, "0")}|${String(tieVector[4]).padStart(4, "0")}`;
    const signature = crypto
      .createHash("sha256")
      .update(`${state.active_event_id}:${row.team_id}:${sortKey}`)
      .digest("hex")
      .slice(0, 20)
      .toUpperCase();
    return {
      rank: row.rank,
      team_id: row.team_id,
      team_name: row.team_name,
      status: row.status,
      total_time_seconds: row.total_time_seconds,
      points: row.points,
      rapid_fire_score: row.rapid_fire_score,
      hints_used: row.hints_used,
      trap_hits: row.trap_hits,
      sort_key: sortKey,
      audit_signature: signature
    };
  });

  const boardSignature = crypto
    .createHash("sha256")
    .update(JSON.stringify(auditRows.map((r) => ({ t: r.team_id, s: r.sort_key, a: r.audit_signature }))))
    .digest("hex")
    .toUpperCase();

  return {
    generated_at: new Date().toISOString(),
    event_id: state.active_event_id,
    tie_break_order: [
      "1) higher points",
      "2) lower total_time_seconds",
      "3) lower hints_used",
      "4) lower trap_hits",
      "5) higher rapid_fire_score"
    ],
    board_signature: boardSignature,
    rows: auditRows
  };
}

export async function adminIncidentHealth() {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [teams, logs] = await Promise.all([
    listTeamsByEvent(event.id),
    listEventLogsByActions(
      event.id,
      [
        "room_scan",
        "answer_correct",
        "answer_wrong",
        "trap_triggered",
        "rapid_fire_gate_scan",
        "invalid_path_scan",
        "out_of_order_scan",
        "stale_session",
        "device_mismatch",
        "double_submit"
      ],
      8000
    )
  ]);

  const recent = logs.filter((row) => row.timestamp >= since);
  const count = (action: string) => recent.filter((r) => r.action_type === action).length;

  const scans = count("room_scan");
  const correct = count("answer_correct");
  const wrong = count("answer_wrong");
  const suspicious =
    count("invalid_path_scan") + count("out_of_order_scan") + count("stale_session") + count("device_mismatch") + count("double_submit");
  const submissionTotal = correct + wrong;
  const accuracy = submissionTotal > 0 ? Number(((correct / submissionTotal) * 100).toFixed(2)) : 0;
  const failureRate = submissionTotal > 0 ? Number(((wrong / submissionTotal) * 100).toFixed(2)) : 0;
  const scansPerMinute = Number((scans / 15).toFixed(2));

  const now = Date.now();
  const staleActive = teams
    .filter((team) => team.status === "active")
    .filter((team) => now - new Date(team.updated_at).getTime() > 180_000)
    .map((team) => ({
      team_id: team.id,
      team_name: team.team_name,
      last_update_at: team.updated_at
    }));

  const riskLevel =
    suspicious >= 8 || failureRate >= 55 || staleActive.length >= 4
      ? "high"
      : suspicious >= 4 || failureRate >= 35 || staleActive.length >= 2
        ? "medium"
        : "low";

  return {
    generated_at: new Date().toISOString(),
    event_id: event.id,
    window_minutes: 15,
    risk_level: riskLevel,
    metrics: {
      scans,
      submissions: submissionTotal,
      accuracy_percent: accuracy,
      failure_percent: failureRate,
      scans_per_minute: scansPerMinute,
      suspicious_events: suspicious,
      stale_active_teams: staleActive.length
    },
    stale_active_teams: staleActive.slice(0, 15),
    guidance:
      riskLevel === "high"
        ? "Consider pausing event, audit suspicious logs, and verify QR placement/scan permissions."
        : riskLevel === "medium"
          ? "Monitor closely and push operator broadcast with clear flow reminders."
          : "Operations are stable."
  };
}

// export async function adminQrValidationStatus() {
//   const event = await getActiveEvent();
//   if (!event) throw new ApiError(404, "No active event");
//   const [rooms, validatedRows, completedRow, ops] = await Promise.all([
//     listRoomsByEvent(event.id),
//     listEventLogsByActions(event.id, ["qr_validation_scan"], 8000),
//     getLatestEventLogByAction(event.id, "qr_validation_complete"),
//     adminOpsPackage()
//   ]);

//   const expectedCodes = new Set<string>();
//   for (const room of rooms) expectedCodes.add(room.room_code);
//   const finalKeys = [
//     `${event.id}-${FINAL_KEY_PREFIX}-NEXUS`,
//     `${event.id}-${FINAL_KEY_PREFIX}-AMIPHORIA`,
//     `${event.id}-${RAPID_FIRE_QR_SUFFIX}`
//   ];
//   for (const code of finalKeys) expectedCodes.add(code);
//   for (const node of ops.bonus_qr_plan ?? []) expectedCodes.add(node.code);

//   const validatedCodes = new Set<string>();
//   for (const row of validatedRows) {
//     const code = typeof row.metadata?.code === "string" ? row.metadata.code : "";
//     if (code) validatedCodes.add(code);
//   }
//   const missing = Array.from(expectedCodes).filter((code) => !validatedCodes.has(code));

//   return {
//     event_id: event.id,
//     expected_total: expectedCodes.size,
//     validated_total: validatedCodes.size,
//     completed: Boolean(completedRow),
//     completion_time: completedRow?.timestamp ?? null,
//     missing_codes: missing.slice(0, 40)
//   };
// }

// export async function adminConfirmQrValidation(code: string, operatorNote?: string) {
//   const event = await getActiveEvent();
//   if (!event) throw new ApiError(404, "No active event");
//   const normalized = code.trim();
//   if (!normalized) throw new ApiError(400, "QR code is required");
//   await createLog({
//     event_config_id: event.id,
//     action_type: "qr_validation_scan",
//     metadata: {
//       code: normalized,
//       note: operatorNote?.trim() || null
//     }
//   });
//   return adminQrValidationStatus();
// }

// export async function adminCompleteQrValidation() {
//   const event = await getActiveEvent();
//   if (!event) throw new ApiError(404, "No active event");
//   const status = await adminQrValidationStatus();
//   if (status.missing_codes.length > 0) {
//     throw new ApiError(409, `Cannot complete QR validation; ${status.missing_codes.length} code(s) still missing`);
//   }
//   await createLog({
//     event_config_id: event.id,
//     action_type: "qr_validation_complete",
//     metadata: {
//       expected_total: status.expected_total,
//       validated_total: status.validated_total
//     }
//   });
//   return {
//     ok: true,
//     completed: true,
//     expected_total: status.expected_total,
//     validated_total: status.validated_total
//   };
// }

export async function adminRecordLoadTest(input: { simulated_teams: number; notes?: string }) {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  if (!Number.isFinite(input.simulated_teams) || input.simulated_teams < 5) {
    throw new ApiError(400, "simulated_teams must be at least 5");
  }
  await createLog({
    event_config_id: event.id,
    action_type: "load_test_verified",
    metadata: {
      simulated_teams: input.simulated_teams,
      notes: input.notes?.trim() || null
    }
  });
  return {
    ok: true,
    simulated_teams: input.simulated_teams
  };
}

export async function adminStoryRouteReview() {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  const [paths, rooms] = await Promise.all([listPathsByEvent(event.id), listRoomsByEvent(event.id)]);
  const roomsByPath = new Map<string, Array<{ order: number; room_number: string; floor: number }>>();
  for (const path of paths) roomsByPath.set(path.id, []);
  for (const room of rooms) {
    if (!room.path_id || room.is_trap || room.order_number === null) continue;
    const arr = roomsByPath.get(room.path_id);
    if (!arr) continue;
    arr.push({
      order: room.order_number,
      room_number: room.room_number,
      floor: room.floor
    });
  }
  const route_by_path = paths.map((path) => ({
    path_id: path.id,
    path_name: path.path_name,
    route: (roomsByPath.get(path.id) ?? []).sort((a, b) => a.order - b.order)
  }));
  return {
    event_id: event.id,
    storyline_acts: [
      { act: "Act I: Node Breach", orders: [1, 2] },
      { act: "Act II: Corrupted Grid", orders: [3, 4, 5] },
      { act: "Act III: Key Shard Sync", orders: [6, 7, 8] },
      { act: "Act IV: Core Terminal Override", orders: ["KEY_SHARD_A", "KEY_SHARD_B", "FIRE_QR", "RAPID_FIRE"] }
    ],
    route_by_path
  };
}

export async function adminPostEventReviewSummary() {
  const [analytics, incident, ranking, ops] = await Promise.all([
    adminPostGameAnalytics(),
    adminIncidentHealth(),
    adminRankingAudit(),
    adminOpsPackage()
  ]);
  const topMissed = analytics.analytics?.top_missed_orders?.slice(0, 3) ?? [];
  const bottlenecks = analytics.analytics?.bottleneck_rooms?.slice(0, 3) ?? [];
  return {
    generated_at: new Date().toISOString(),
    event_id: analytics.event_id,
    ritual: [
      "1) Validate fairness and ranking signatures",
      "2) Review missed orders and rewrite weak questions",
      "3) Review bottleneck rooms and rebalance route placements",
      "4) Review suspicious incidents and update anti-cheat rules",
      "5) Rehearse at least one failure scenario before next event"
    ],
    diagnostics: {
      incident_risk: incident.risk_level,
      accuracy: analytics.analytics?.accuracy ?? 0,
      trap_trigger_count: analytics.analytics?.trap_trigger_count ?? 0,
      board_signature: ranking.board_signature
    },
    top_missed_orders: topMissed,
    bottleneck_rooms: bottlenecks,
    storyline_title: ops.storyline?.title ?? "Scan to Survive"
  };
}

export async function publicWinnerDisplayBoard() {
  const board = await adminLeaderboard({ forceRows: true });
  return {
    server_time: board.server_time,
    visible: board.visible,
    finale_mode: board.finale_mode,
    finale_sequence_mode: board.finale_sequence_mode,
    finale_sequence_started_at: board.finale_sequence_started_at,
    top_three: board.top_three,
    winner_rewards: board.winner_rewards
  };
}

export async function adminConfigHistory() {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  const logs = await listEventLogsByActions(event.id, [LOG_ACTIONS.EVENT_CONFIGURED], 25);
  return {
    snapshots: logs.map((row) => ({
      id: row.id,
      created_at: row.timestamp,
      path_count: Number(row.metadata?.path_count ?? 0),
      rooms_per_path: Number(row.metadata?.rooms_per_path ?? 0),
      trap_count: Number(row.metadata?.trap_count ?? 0),
      has_full_config: typeof row.metadata?.config === "object" && row.metadata?.config !== null
    }))
  };
}

export async function rollbackToConfigSnapshot(snapshotLogId: number) {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  await assertResultsUnlocked(event.id);
  const logs = await listEventLogsByActions(event.id, [LOG_ACTIONS.EVENT_CONFIGURED], 50);
  const snapshot = logs.find((row) => row.id === snapshotLogId);
  if (!snapshot) throw new ApiError(404, "Snapshot not found");
  const cfgRaw = snapshot.metadata?.config;
  const parsed = eventConfigSchema.safeParse(cfgRaw);
  if (!parsed.success) throw new ApiError(409, "Snapshot does not include restorable configuration");
  const result = await configureEvent(parsed.data);
  await createLog({
    event_config_id: result.event_config.id,
    action_type: "event_config_rollback",
    metadata: {
      source_snapshot_id: snapshotLogId
    }
  });
  return {
    ok: true,
    rolled_back_from_snapshot_id: snapshotLogId,
    new_event_id: result.event_config.id
  };
}

export async function adminExportBundle() {
  const [monitor, leaderboard, ops, analytics, incident_health, ranking_audit] = await Promise.all([
    adminMonitor(),
    adminLeaderboard({ forceRows: true }),
    adminOpsPackage(),
    adminPostGameAnalytics(),
    adminIncidentHealth(),
    adminRankingAudit()
  ]);
  return {
    generated_at: new Date().toISOString(),
    monitor,
    leaderboard,
    ops_package: ops,
    analytics,
    incident_health,
    ranking_audit
  };
}

export async function revealLeaderboard() {
  await setLeaderboardVisible(true);
  return { visible: true, finale_mode: false };
}

export async function revealFinaleTopThree(sequence = false) {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  const teams = await listTeamsByEvent(event.id);
  const unfinished = teams.filter((t) => t.status === "active");
  if (unfinished.length > 0) {
    throw new ApiError(409, `Cannot reveal finale while ${unfinished.length} team(s) are still in progress`);
  }
  const board = await adminLeaderboard({ forceRows: true });
  const topThree = board.rows.slice(0, 3);
  if (topThree.length < 3) {
    throw new ApiError(409, "Need at least 3 ranked teams for Top 3 finale reveal");
  }

  const startedAt = sequence ? new Date().toISOString() : null;
  await setLeaderboardVisible(true);
  await createLog({
    event_config_id: event.id,
    action_type: "finale_reveal",
    metadata: {
      sequence,
      sequence_started_at: startedAt,
      top_three: topThree.map((row) => ({
        rank: row.rank,
        team_name: row.team_name,
        total_time_seconds: row.total_time_seconds,
        points: row.points
      }))
    }
  });

  return {
    visible: true,
    finale_mode: true,
    finale_sequence_mode: sequence,
    finale_sequence_started_at: startedAt,
    top_three: topThree,
    event_status: event.status
  };
}

export async function revealFinaleSequence() {
  return revealFinaleTopThree(true);
}

export async function disqualifyTeam(teamId: string, reason: string) {
  const team = await findTeamById(teamId);
  if (!team) throw new ApiError(404, "Team not found");
  await assertResultsUnlocked(team.event_config_id);

  const total = team.start_time ? elapsedSeconds(team.start_time) + team.penalty_seconds : team.penalty_seconds;
  const updated = await updateTeamWithVersion(team.id, team.version, {
    status: "disqualified",
    phase: "completed",
    end_time: new Date().toISOString(),
    total_time_seconds: total
  });
  if (!updated) throw new ApiError(409, "Concurrent update; retry");

  await createLog({
    event_config_id: team.event_config_id,
    team_id: team.id,
    action_type: LOG_ACTIONS.DISQUALIFIED,
    metadata: { reason }
  });

  return { team_id: team.id, status: updated.status };
}

export async function adminReplayTimeline(teamId: string) {
  const team = await findTeamById(teamId);
  if (!team) throw new ApiError(404, "Team not found");
  const logs = await listTeamLogs(team.event_config_id, team.id, 8000);
  return {
    team: {
      id: team.id,
      team_name: team.team_name,
      status: team.status
    },
    timeline: logs.map((row) => ({
      timestamp: row.timestamp,
      action_type: row.action_type,
      metadata: row.metadata ?? {}
    }))
  };
}

export async function adminPostGameAnalytics() {
  const event = await getActiveEvent();
  if (!event) throw new ApiError(404, "No active event");
  return {
    event_id: event.id,
    analytics: await buildPostGameAnalytics(event.id)
  };
}

export async function teamMissionDebrief(teamId: string) {
  const team = await findTeamById(teamId);
  if (!team) throw new ApiError(404, "Team not found");

  const [logs, board] = await Promise.all([
    listTeamLogs(team.event_config_id, team.id, 8000),
    adminLeaderboard({ forceRows: true })
  ]);

  const rankRow = board.rows.find((row) => row.team_name.trim().toLowerCase() === team.team_name.trim().toLowerCase()) ?? null;
  const rank = rankRow?.rank ?? null;
  const firstScan = logs.find((row) => row.action_type === "room_scan");
  const firstTrap = logs.find((row) => row.action_type === "trap_triggered");
  const firstFragment = logs.find((row) => row.action_type === "answer_correct");
  const rapidGate = logs.find((row) => row.action_type === "rapid_fire_gate_scan");
  const finalKeyNexus = logs.find((row) => row.action_type === "final_key_step" && String(row.metadata?.code ?? "").endsWith("-NEXUS"));
  const finalKeyAmiphoria = logs.find((row) => row.action_type === "final_key_step" && String(row.metadata?.code ?? "").endsWith("-AMIPHORIA"));

  const badges: string[] = [];
  if (team.hints_used === 0) badges.push("No-Hint Operative");
  if (team.trap_hits <= 1) badges.push("Trap Ghost");
  if (team.rapid_fire_score >= 4) badges.push("Rapid Specialist");
  if (team.penalty_seconds <= 90) badges.push("Precision Route");
  if (team.story_fragments_collected >= 6) badges.push("Lorebreaker");
  if (badges.length === 0) badges.push("Network Survivor");

  let codename = "Signal Runner";
  if (rank === 1) codename = "Guardian of the Network";
  else if (rank === 2) codename = "Cipher Vanguard";
  else if (rank === 3) codename = "Pulse Sentinel";
  else if ((rank ?? 99) <= 10) codename = "Firewall Contender";

  const criticalMoment = rapidGate
    ? "Your rapid-fire gate scan became the turning point."
    : firstTrap
      ? "Your first trap recovery reset the mission momentum."
      : "Your clean progression stabilized the route under pressure.";

  return {
    team_name: team.team_name,
    status: team.status,
    codename,
    rank: team.status === "disqualified" ? null : rank,
    summary_line:
      team.status === "disqualified"
        ? "Your run was disqualified by control room intervention."
        : rank && rank <= 3
        ? "You didn't just finish. You changed the city outcome."
        : "You carried the city through a live systems crisis with your duo coordination.",
    critical_moment: criticalMoment,
    mission_stats: {
      points: team.points,
      total_time_seconds: team.total_time_seconds,
      hints_used: team.hints_used,
      trap_hits: team.trap_hits,
      penalty_seconds: team.penalty_seconds,
      fragments_collected: team.story_fragments_collected,
      rapid_fire_score: team.rapid_fire_score
    },
    badges,
    timeline_highlights: [
      firstScan ? { label: "Mission entered", at: firstScan.timestamp } : null,
      firstFragment ? { label: "First fragment recovered", at: firstFragment.timestamp } : null,
      firstTrap ? { label: "First trap triggered", at: firstTrap.timestamp } : null,
      finalKeyNexus ? { label: "Key Shard A scanned", at: finalKeyNexus.timestamp } : null,
      finalKeyAmiphoria ? { label: "Key Shard B scanned", at: finalKeyAmiphoria.timestamp } : null,
      rapidGate ? { label: "Rapid-fire gate opened", at: rapidGate.timestamp } : null
    ].filter(Boolean)
  };
}

