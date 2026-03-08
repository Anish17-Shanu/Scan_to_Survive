import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useBlockBackNavigation } from "../hooks/useBlockBackNavigation";
import { audioManager } from "../lib/audioManager";
import { clearAuth, getToken } from "../lib/auth";
import type { AdminMonitorSnapshot, AdminReadiness } from "../types";

type LeaderRow = {
  rank: number;
  team_name: string;
  status: string;
  total_time_seconds: number | null;
  points: number;
  rapid_fire_score: number;
  hints_used: number;
  trap_hits: number;
};

type LeaderboardResponse = {
  server_time?: string;
  visible: boolean;
  finale_mode?: boolean;
  finale_sequence_mode?: boolean;
  finale_sequence_started_at?: string | null;
  top_three?: LeaderRow[];
  rows: LeaderRow[];
};

type OpsPackage = {
  storyline?: { title: string; intro: string; objective: string };
  instructions?: string[];
  qr_placement_plan?: Array<{
    room_number: string;
    floor: number;
    qr_code_payload: string;
    room_type: string;
    path_name: string | null;
    order_number: number | null;
    placement_zone: "desk" | "door";
    placement_note: string;
    qr_svg: string;
  }>;
  print_cards?: Array<{
    title: string;
    room_number: string;
    floor: number;
    room_type: string;
    placement_zone: "desk" | "door";
    placement_note: string;
    qr_code_payload: string;
    qr_svg: string;
  }>;
  trap_rooms?: Array<{
    room_number: string;
    floor: number;
    qr_code_payload: string;
    placement_zone: "desk" | "door";
    placement_note: string;
  }>;
  bonus_qr_plan?: Array<{
    code: string;
    type: string;
    effect: string;
    recommended_placement: string;
    assigned_room_number?: string | null;
    assigned_floor?: number | null;
    clue?: string;
    qr_svg?: string;
  }>;
  final_key_qr_plan?: Array<{
    code: string;
    type: string;
    effect: string;
    recommended_placement: string;
    assigned_room_number?: string | null;
    assigned_floor?: number | null;
    clue?: string;
    qr_svg?: string;
  }>;
  print_bundles?: {
    rooms: string[];
    traps: string[];
    bonus: string[];
    final_keys: string[];
  };
  offline_fallback_packet?: {
    title: string;
    emergency_rules: string[];
    fallback_route_cards: Array<{
      room_number: string;
      floor: number;
      fallback_clue: string;
      validation_prompt: string;
    }>;
  };
};

type ReplayPayload = {
  team: { id: string; team_name: string; status: string };
  timeline: Array<{ timestamp: string; action_type: string; metadata: Record<string, unknown> }>;
};

type ConfigSnapshot = {
  id: number;
  created_at: string;
  path_count: number;
  rooms_per_path: number;
  trap_count: number;
  has_full_config: boolean;
};

type IncidentHealth = {
  generated_at: string;
  event_id: string;
  window_minutes: number;
  risk_level: "low" | "medium" | "high";
  metrics: {
    scans: number;
    submissions: number;
    accuracy_percent: number;
    failure_percent: number;
    scans_per_minute: number;
    suspicious_events: number;
    stale_active_teams: number;
  };
  stale_active_teams: Array<{ team_id: string; team_name: string; last_update_at: string }>;
  guidance: string;
};

type RankingAudit = {
  generated_at: string;
  event_id: string;
  tie_break_order: string[];
  board_signature: string;
  rows: Array<{
    rank: number;
    team_id: string;
    team_name: string;
    status: string;
    total_time_seconds: number | null;
    points: number;
    rapid_fire_score: number;
    hints_used: number;
    trap_hits: number;
    sort_key: string;
    audit_signature: string;
  }>;
};

type StoryRouteReview = {
  event_id: string;
  storyline_acts: Array<{ act: string; orders: Array<number | string> }>;
  route_by_path: Array<{
    path_id: string;
    path_name: string;
    route: Array<{ order: number; room_number: string; floor: number }>;
  }>;
};

type PostEventReview = {
  generated_at: string;
  event_id: string;
  ritual: string[];
  diagnostics: {
    incident_risk: string;
    accuracy: number;
    trap_trigger_count: number;
    board_signature: string;
  };
  top_missed_orders: Array<{ order: number; misses: number }>;
  bottleneck_rooms: Array<{ room_number: string; scans: number }>;
  storyline_title: string;
};

const defaults = {
  total_teams: 10,
  floor_room_map_text: "4:20\n5:20",
  excluded_rooms_text: "409,410,509,510",
  trap_count: 8,
  game_duration_hours: 1.5,
  max_hints: 2,
  question_pool_size: 200,
  max_teams_per_path: 4
};

const fields: Array<keyof typeof defaults> = [
  "total_teams",
  "trap_count",
  "game_duration_hours",
  "max_hints",
  "question_pool_size",
  "max_teams_per_path"
];

export function AdminPage() {
  const navigate = useNavigate();
  const [simpleMode, setSimpleMode] = useState(false);
  const [config, setConfig] = useState(defaults);
  const [teamName, setTeamName] = useState("");
  const [teamPassword, setTeamPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [monitor, setMonitor] = useState<AdminMonitorSnapshot | null>(null);
  const [finaleMode, setFinaleMode] = useState(false);
  const [finaleSequenceMode, setFinaleSequenceMode] = useState(false);
  const [finaleSequenceStartedAt, setFinaleSequenceStartedAt] = useState<string | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [clockTick, setClockTick] = useState(Date.now());
  const [topThree, setTopThree] = useState<LeaderRow[]>([]);
  const [opsPackage, setOpsPackage] = useState<OpsPackage | null>(null);
  const [readiness, setReadiness] = useState<AdminReadiness | null>(null);
  const [postAnalytics, setPostAnalytics] = useState<AdminMonitorSnapshot["post_game_analytics"] | null>(null);
  const [incidentHealth, setIncidentHealth] = useState<IncidentHealth | null>(null);
  const [rankingAudit, setRankingAudit] = useState<RankingAudit | null>(null);
  const [storyRouteReview, setStoryRouteReview] = useState<StoryRouteReview | null>(null);
  const [postEventReview, setPostEventReview] = useState<PostEventReview | null>(null);
  const [emergencyUnlocked, setEmergencyUnlocked] = useState(false);
  const [failureDrills, setFailureDrills] = useState({
    backendOutage: false,
    wifiLoss: false,
    missingQr: false
  });
  const [replayTeamId, setReplayTeamId] = useState("");
  const [replayData, setReplayData] = useState<ReplayPayload | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastLevel, setBroadcastLevel] = useState<"info" | "warning" | "critical">("info");
  const [tickerIndex, setTickerIndex] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hostShowMode, setHostShowMode] = useState(false);
  const [rehearsalMode, setRehearsalMode] = useState(false);
  const [configSnapshots, setConfigSnapshots] = useState<ConfigSnapshot[]>([]);
  const [opsBusy, setOpsBusy] = useState<string | null>(null);
  const lastMonitorUpdateRef = useRef(0);
  const openHashRoute = (route: string) => {
    const base = `${window.location.origin}${window.location.pathname}`;
    window.open(`${base}#${route}`, "_blank", "width=1600,height=900");
  };
  useBlockBackNavigation({
    onBlocked: () => {
      setMessage("Back navigation is locked in control room. Use Logout button.");
    }
  });

  const wsUrl = useMemo(() => {
    const base = (import.meta.env.VITE_WS_BASE_URL as string | undefined) ?? "ws://localhost:4000";
    return `${base}/ws/admin?token=${encodeURIComponent(getToken() ?? "")}`;
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempts = 0;
    let closed = false;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        attempts = 0;
      };
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string);
          if (payload.type === "monitor_snapshot") {
            const now = Date.now();
            if (now - lastMonitorUpdateRef.current < 400) return;
            lastMonitorUpdateRef.current = now;
            setMonitor(payload.data as AdminMonitorSnapshot);
          }
        } catch {
          setMessage("Realtime stream parsing failed");
        }
      };
      ws.onclose = () => {
        if (closed) return;
        attempts += 1;
        const delay = Math.min(10_000, 800 * attempts);
        reconnectTimer = window.setTimeout(connect, delay);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [wsUrl]);

  useEffect(() => {
    const id = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTickerIndex((v) => (v + 1) % 4), 6000);
    return () => window.clearInterval(id);
  }, []);

  const refreshMonitor = async () => {
    try {
      const response = await api.get("/admin/monitor");
      setMonitor(response.data);
      setMessage(null);
    } catch (err: unknown) {
      const status =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { status?: number } }).response?.status === "number"
          ? (err as { response: { status: number } }).response.status
          : 0;

      if (status === 401 || status === 403) {
        clearAuth();
        navigate("/login", { replace: true });
        return;
      }
      const backendError =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (err as { response: { data: { error: string } } }).response.data.error
          : null;
      if (status === 404) {
        setMonitor(null);
        setMessage(backendError ?? "No active event configured yet. Configure event first.");
        return;
      }
      setMessage(backendError ?? "Admin monitor unavailable. Check backend URL/CORS/env and retry.");
    }
  };

  const refreshLeaderboard = async () => {
    try {
      const response = await api.get<LeaderboardResponse>("/admin/leaderboard");
      if (response.data.server_time) {
        const serverNow = new Date(response.data.server_time).getTime();
        if (!Number.isNaN(serverNow)) setServerOffsetMs(Date.now() - serverNow);
      }
      setFinaleMode(Boolean(response.data.finale_mode));
      setFinaleSequenceMode(Boolean(response.data.finale_sequence_mode));
      setFinaleSequenceStartedAt(response.data.finale_sequence_started_at ?? null);
      setTopThree(response.data.top_three ?? []);
    } catch {
      setFinaleMode(false);
      setFinaleSequenceMode(false);
      setFinaleSequenceStartedAt(null);
      setTopThree([]);
    }
  };

  const timeText = (seconds: number | null) => {
    if (seconds === null || seconds < 0) return "-";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const finaleSequencePhase = useMemo(() => {
    if (!finaleSequenceMode || !finaleSequenceStartedAt) return "done";
    const serverAlignedNow = clockTick - serverOffsetMs;
    const elapsed = Math.max(0, Math.floor((serverAlignedNow - new Date(finaleSequenceStartedAt).getTime()) / 1000));
    if (elapsed < 4) return "rank3";
    if (elapsed < 8) return "rank2";
    if (elapsed < 12) return "rank1";
    return "done";
  }, [clockTick, finaleSequenceMode, finaleSequenceStartedAt, serverOffsetMs]);

  const finaleSpotlight =
    finaleSequencePhase === "rank3"
      ? topThree.find((r) => r.rank === 3) ?? null
      : finaleSequencePhase === "rank2"
        ? topThree.find((r) => r.rank === 2) ?? null
        : finaleSequencePhase === "rank1"
          ? topThree.find((r) => r.rank === 1) ?? null
          : null;
  const displayTeams = useMemo(() => {
    if (!rehearsalMode || !monitor) {
      return (monitor?.teams ?? []).map((team) => ({
        ...team,
        member_ids: [`${team.team_id.slice(0, 8)}-NAV`, `${team.team_id.slice(0, 8)}-RUN`]
      }));
    }
    const demo = Array.from({ length: 3 }).map((_, idx) => ({
      team_id: `rehearsal-${idx + 1}`,
      team_name: `Demo-Team-${idx + 1}`,
      status: "active",
      phase: idx === 2 ? "rapid_fire" : "main",
      current_order: 2 + idx,
      path_id: `Path-${String.fromCharCode(65 + idx)}`,
      current_room: `${4 + idx}0${idx + 1}`,
      hints_used: idx % 2,
      trap_hits: idx === 2 ? 1 : 0,
      penalty_seconds: idx * 15,
      rapid_remaining_seconds: idx === 2 ? 140 : null,
      rapid_answered: idx === 2 ? 3 : null,
      rapid_total: idx === 2 ? 5 : null,
      member_ids: [`RH${idx + 1}-NAV`, `RH${idx + 1}-RUN`]
    }));
    return [
      ...monitor.teams.map((team) => ({
        ...team,
        member_ids: [`${team.team_id.slice(0, 8)}-NAV`, `${team.team_id.slice(0, 8)}-RUN`]
      })),
      ...demo
    ];
  }, [monitor, rehearsalMode]);

  const winningReason = (row: {
    points: number;
    penalty_seconds: number;
    hints_used: number;
    trap_hits: number;
    current_order: number;
  }) => {
    if (row.current_order >= 10) return "Deep progression lead";
    if (row.points >= 900) return "High points momentum";
    if (row.penalty_seconds <= 60 && row.trap_hits <= 1) return "Clean execution";
    if (row.hints_used <= 1) return "Low hint reliance";
    return "Balanced consistency";
  };
  const commandTicker = [
    "CONTROL: Validate final key scans before rapid gate authorization.",
    "CONTROL: Monitor fairness alerts. High-severity anomalies require host review.",
    "CONTROL: Use replay timeline to verify disputed outcomes.",
    "CONTROL: Keep offline fallback packet ready for network incidents."
  ];

  const refreshOpsPackage = async () => {
    try {
      const response = await api.get("/admin/ops-package");
      setOpsPackage(response.data);
    } catch {
      setOpsPackage(null);
    }
  };

  const refreshReadiness = async () => {
    const response = await api.get("/admin/readiness");
    setReadiness(response.data);
  };

  const refreshPostAnalytics = async () => {
    const response = await api.get("/admin/post-game-analytics");
    setPostAnalytics(response.data.analytics ?? null);
  };

  const refreshIncidentHealth = async () => {
    const response = await api.get<IncidentHealth>("/admin/incident-health");
    setIncidentHealth(response.data);
  };

  const refreshRankingAudit = async () => {
    const response = await api.get<RankingAudit>("/admin/ranking-audit");
    setRankingAudit(response.data);
  };

  const refreshStoryRouteReview = async () => {
    const response = await api.get<StoryRouteReview>("/admin/story-route-review");
    setStoryRouteReview(response.data);
  };

  const refreshPostEventReview = async () => {
    const response = await api.get<PostEventReview>("/admin/post-event-review");
    setPostEventReview(response.data);
  };

  const refreshConfigHistory = async () => {
    const response = await api.get<{ snapshots: ConfigSnapshot[] }>("/admin/config-history");
    setConfigSnapshots(response.data.snapshots ?? []);
  };

  const fetchReplay = async () => {
    if (!replayTeamId.trim()) return;
    const response = await api.get(`/admin/replay/${replayTeamId.trim()}`);
    setReplayData(response.data);
  };

  useEffect(() => {
    void refreshMonitor();
    void refreshLeaderboard();
    void refreshOpsPackage();
    void refreshReadiness();
    void refreshPostAnalytics();
    void refreshIncidentHealth();
    void refreshRankingAudit();
    void refreshStoryRouteReview();
    void refreshPostEventReview();
    void refreshConfigHistory();
  }, []);

  const configureEvent = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const floor_room_map = config.floor_room_map_text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [floorRaw, roomsRaw] = line.split(":");
          return {
            floor: Number(floorRaw),
            available_rooms: Number(roomsRaw)
          };
        });
      const excluded_room_numbers = config.excluded_rooms_text
        .split(/[\r?\n,]+/)
        .map((v) => v.trim())
        .filter(Boolean);

      await api.post("/admin/configure-event", {
        total_teams: config.total_teams,
        floor_room_map,
        excluded_room_numbers,
        trap_count: config.trap_count,
        game_duration_hours: config.game_duration_hours,
        max_hints: config.max_hints,
        question_pool_size: config.question_pool_size,
        max_teams_per_path: config.max_teams_per_path,
        difficulty_curve: {
          easy_orders: [1, 2],
          medium_orders: [3, 4],
          hard_orders: [5, 6],
          very_hard_orders: [7]
        }
      });
      setMessage("Event configured successfully");
      await refreshMonitor();
    } catch (err: unknown) {
      setMessage(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Configure failed"
      );
    }
  };

  const createTeam = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.post("/admin/create-team", { team_name: teamName, password: teamPassword });
      setTeamName("");
      setTeamPassword("");
      setMessage("Team created");
      await refreshMonitor();
    } catch (err: unknown) {
      setMessage((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Create failed");
    }
  };

  const revealFinale = async () => {
    audioManager.play("reveal_drum");
    await api.post("/admin/reveal-finale-sequence");
    setMessage("Result reveal sequence started: 3rd -> 2nd -> 1st, then full board.");
    await refreshLeaderboard();
  };

  const confirmDanger = (token: string, action: string) => {
    const typed = window.prompt(`Type ${token} to confirm: ${action}`);
    return typed === token;
  };

  const runOps = async (label: string, operation: () => Promise<void>) => {
    if (opsBusy) return;
    setOpsBusy(label);
    try {
      await operation();
    } finally {
      setOpsBusy(null);
    }
  };

  const launchEvent = async () => {
    await runOps("launch", async () => {
      try {
        const response = await api.post("/admin/launch");
        setMessage(response.data.message ?? "Event launch attempt complete.");
      } catch (err: unknown) {
        const backendError =
          typeof err === "object" &&
          err !== null &&
          "response" in err &&
          typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
            ? (err as { response: { data: { error: string } } }).response.data.error
            : "Launch blocked. Resolve readiness issues and retry.";
        setMessage(backendError);
      }
      await refreshMonitor();
      await refreshReadiness();
    });
  };

  const privilegedStartGame = async () => {
    if (!emergencyUnlocked) return;
    await runOps("privileged-start", async () => {
      const note = window.prompt("Privileged start note (optional)", "Hard start by admin") ?? "";
      const response = await api.post("/admin/start-game", { unlock_text: "SUPERADMIN", note });
      setMessage(response.data.message ?? "Game started by admin.");
      await refreshMonitor();
      await refreshReadiness();
    });
  };

  const privilegedEndGame = async () => {
    if (!emergencyUnlocked) return;
    if (!confirmDanger("ENDGAME", "End game for all teams now")) return;
    await runOps("privileged-end", async () => {
      const note = window.prompt("Privileged end note (optional)", "Hard end by admin") ?? "";
      const response = await api.post("/admin/end-game", { unlock_text: "SUPERADMIN", note });
      setMessage(response.data.message ?? "Game ended by admin.");
      await refreshMonitor();
      await refreshReadiness();
      await refreshLeaderboard();
    });
  };

  const exportBundle = async () => {
    const response = await api.get("/admin/export-bundle");
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan-to-survive-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportRankingAudit = async () => {
    const response = await api.get<RankingAudit>("/admin/ranking-audit");
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan-to-survive-ranking-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setRankingAudit(response.data);
  };

  const rollbackToSnapshot = async (snapshotLogId: number) => {
    if (!confirmDanger("ROLLBACK", "Rollback configuration snapshot")) return;
    const response = await api.post("/admin/rollback-config", { snapshot_log_id: snapshotLogId });
    setMessage(`Rollback complete. New event: ${response.data.new_event_id}`);
    await refreshMonitor();
    await refreshReadiness();
    await refreshConfigHistory();
  };

  const disqualify = async (teamId: string) => {
    if (!confirmDanger("DQ", `Disqualify team ${teamId}`)) return;
    await api.post("/admin/disqualify", { team_id: teamId, reason: "Manual disqualification by host" });
    await refreshMonitor();
  };

  const pauseEvent = async () => {
    if (!confirmDanger("PAUSE", "Pause live event")) return;
    const reason = window.prompt("Pause reason", "Temporary halt by control room");
    if (!reason) return;
    await runOps("pause", async () => {
      await api.post("/admin/pause", { reason });
      await refreshMonitor();
      await refreshReadiness();
    });
  };

  const resumeEvent = async () => {
    if (!confirmDanger("RESUME", "Resume live event")) return;
    await runOps("resume", async () => {
      await api.post("/admin/resume");
      await refreshMonitor();
      await refreshReadiness();
    });
  };

  const forceUnlock = async (teamId: string) => {
    if (!confirmDanger("UNLOCK", `Force unlock team ${teamId}`)) return;
    await api.post("/admin/force-unlock", { team_id: teamId, reason: "Manual progression override" });
    await refreshMonitor();
  };

  const forceFinish = async (teamId: string) => {
    if (!confirmDanger("FINISH", `Force finish team ${teamId}`)) return;
    await api.post("/admin/force-finish", { team_id: teamId, reason: "Manual finish by control room" });
    await refreshMonitor();
  };

  const resetTeams = async () => {
    const confirmText = window.prompt("Type RESET to delete all teams and start fresh.");
    if (confirmText !== "RESET") return;
    await runOps("reset-teams", async () => {
      const response = await api.post("/admin/reset-teams");
      setMessage(response.data.message ?? "All teams deleted.");
      await refreshMonitor();
      await refreshReadiness();
      await refreshLeaderboard();
    });
  };

  const resetEverything = async () => {
    const confirmText = window.prompt("Type RESET ALL to wipe all events, rooms, teams, questions, and logs.");
    if (confirmText !== "RESET ALL") return;
    await runOps("reset-all", async () => {
      const response = await api.post("/admin/reset-everything");
      setMessage(response.data.message ?? "Full reset complete.");
      setMonitor(null);
      setOpsPackage(null);
      setReadiness(null);
      setPostAnalytics(null);
      setIncidentHealth(null);
      setRankingAudit(null);
      setStoryRouteReview(null);
      setPostEventReview(null);
      setTopThree([]);
      setFinaleMode(false);
      setFinaleSequenceMode(false);
      setFinaleSequenceStartedAt(null);
      setReplayData(null);
      setReplayTeamId("");
      setBroadcastMessage("");
      setConfigSnapshots([]);
      setFailureDrills({
        backendOutage: false,
        wifiLoss: false,
        missingQr: false
      });
      await refreshReadiness();
      await refreshLeaderboard();
    });
  };

  const sendBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    await api.post("/admin/broadcast", { message: broadcastMessage, level: broadcastLevel });
    setBroadcastMessage("");
    await refreshMonitor();
    setMessage("Broadcast sent to all active teams.");
  };

  const renderPrintDocument = () => {
    if (!opsPackage?.print_cards || opsPackage.print_cards.length === 0) return null;
    return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Operation Firewall - Scan to Survive QR Cards</title>
    <style>
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; color: #111; background: #fff; }
      .page {
        width: 210mm;
        min-height: 297mm;
        padding: 14mm;
        page-break-after: always;
        break-after: page;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .card {
        border: 1.5px solid #111;
        border-radius: 12px;
        padding: 12mm;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 8mm;
      }
      .title { margin: 0; font-size: 22px; line-height: 1.25; font-weight: 700; }
      .meta { font-size: 14px; line-height: 1.35; max-width: 90%; }
      .qr-wrap {
        width: 120mm;
        height: 120mm;
        border: 1px solid #333;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        padding: 4mm;
      }
      .qr-wrap svg { width: 100%; height: 100%; display: block; }
      .payload {
        width: 100%;
        font-size: 12px;
        line-height: 1.3;
        word-break: break-all;
        border-top: 1px dashed #666;
        padding-top: 4mm;
      }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head>
  <body>
      ${opsPackage.print_cards
        .map(
          (card) => `
      <section class="page">
        <div class="card">
          <h3 class="title">${card.title}</h3>
          <div class="meta">Placement: <strong>${card.placement_zone.toUpperCase()}</strong></div>
          <div class="meta">${card.placement_note}</div>
          <div class="qr-wrap">${card.qr_svg}</div>
          <div class="payload">Payload: ${card.qr_code_payload}</div>
        </div>
      </section>`
        )
        .join("")}
  </body>
</html>`;
  };

  const printCards = () => {
    const html = renderPrintDocument();
    if (!html) return;
    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const exportPdf = () => {
    const html = renderPrintDocument();
    if (!html) return;
    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <main className={`${simpleMode ? "" : "admin-stage"} mx-auto w-full max-w-7xl px-4 py-6`}>
      {!simpleMode && <div className="admin-grid-overlay" />}
      {!simpleMode && <div className="admin-scanline-overlay" />}

      <div className="hud-panel fade-rise mb-4 flex items-center justify-between rounded-3xl px-2 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Operation: Firewall</p>
          <h1 className="text-3xl font-semibold">Scan to Survive Control Room</h1>
        </div>
        <div className="flex gap-2">
          <button className="ghost-btn" onClick={() => { audioManager.play("terminal_blip"); void refreshMonitor(); }}>
            Refresh
          </button>
          <button className="ghost-btn" onClick={() => setSimpleMode((v) => !v)}>
            {simpleMode ? "Immersive UI" : "Simple UI"}
          </button>
          <button className="ghost-btn" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "Hide Advanced Ops" : "Show Advanced Ops"}
          </button>
          <button className="ghost-btn" onClick={() => setHostShowMode((v) => !v)}>
            {hostShowMode ? "Hide Host Show" : "Host Show Mode"}
          </button>
          <button className="ghost-btn" onClick={() => setRehearsalMode((v) => !v)}>
            {rehearsalMode ? "Disable Rehearsal" : "Enable Rehearsal"}
          </button>
          <button
            className="ghost-btn"
            onClick={() => {
              if (emergencyUnlocked) {
                setEmergencyUnlocked(false);
                return;
              }
              const typed = window.prompt("Type SUPERADMIN to unlock emergency controls.");
              if (typed === "SUPERADMIN") setEmergencyUnlocked(true);
            }}
          >
            {emergencyUnlocked ? "Lock Emergency Ops" : "Unlock Emergency Ops"}
          </button>
          <button className="ghost-btn" onClick={() => openHashRoute(`/spectator${rehearsalMode ? "?rehearsal=1" : ""}`)}>
            Open Spectator
          </button>
          <button className="ghost-btn" onClick={() => openHashRoute("/admin/display")}>
            Open Winner Display
          </button>
          <button className="ghost-btn" onClick={exportBundle}>
            Export Event Bundle
          </button>
          <button className="ghost-btn" onClick={exportRankingAudit}>
            Export Ranking Audit
          </button>
          <button
            className="ghost-btn"
            onClick={() => {
              audioManager.play("ui_toggle");
              clearAuth();
              navigate("/login");
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {!simpleMode && (
      <section className="mb-4 grid gap-3 lg:grid-cols-2">
        <article className="operator-card rounded-3xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">MISSION CONTROL // NODE COMMAND</p>
              <p className="text-sm text-slate-200">Live telemetry stable. Monitoring fairness and key-sequence integrity.</p>
            </div>
            <div className="avatar-core avatar-core-cyan" />
          </div>
        </article>
        <article className="operator-card rounded-3xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-emerald-200">NULL WATCH // THREAT FEED</p>
              <p className="text-sm text-slate-200">Ceremony channel armed. Top-3 reveal and reward verification online.</p>
            </div>
            <div className="avatar-core avatar-core-emerald" />
          </div>
        </article>
      </section>
      )}

      {!simpleMode && (
      <section className="mb-4">
        <article className="hud-panel glass-card rounded-3xl p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Command Ticker</p>
          <p className="terminal-line mt-2 text-sm text-cyan-100">{commandTicker[tickerIndex]}</p>
        </article>
      </section>
      )}

      <section className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="glass-card fade-rise rounded-3xl p-4">
          <p className="text-xs text-slate-300">Teams Planned</p>
          <p className="mt-1 text-3xl font-semibold">{monitor?.event.total_teams ?? "-"}</p>
        </div>
        <div className="glass-card fade-rise rounded-3xl p-4">
          <p className="text-xs text-slate-300">Question Pool</p>
          <p className="mt-1 text-3xl font-semibold">{monitor?.question_stats?.total_questions_in_pool ?? "-"}</p>
        </div>
        <div className="glass-card fade-rise rounded-3xl p-4">
          <p className="text-xs text-slate-300">Cached Questions</p>
          <p className="mt-1 text-3xl font-semibold">{monitor?.question_stats?.cached_team_questions ?? "-"}</p>
        </div>
        <div className="glass-card fade-rise rounded-3xl p-4">
          <p className="text-xs text-slate-300">Suspicious Events</p>
          <p className="mt-1 text-3xl font-semibold">{monitor?.suspicious_activity.length ?? 0}</p>
        </div>
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="glass-card fade-rise rounded-3xl p-4">
          <p className="text-xs text-slate-300">Ops Risk</p>
          <p className={`mt-1 text-2xl font-semibold ${incidentHealth?.risk_level === "high" ? "text-rose-300" : incidentHealth?.risk_level === "medium" ? "text-amber-300" : "text-emerald-300"}`}>
            {(incidentHealth?.risk_level ?? "low").toUpperCase()}
          </p>
        </div>
        <div className="glass-card fade-rise rounded-3xl p-4">
          <p className="text-xs text-slate-300">15m Accuracy</p>
          <p className="mt-1 text-2xl font-semibold">{incidentHealth?.metrics.accuracy_percent ?? 0}%</p>
        </div>
        <div className="glass-card fade-rise rounded-3xl p-4">
          <p className="text-xs text-slate-300">15m Failure</p>
          <p className="mt-1 text-2xl font-semibold">{incidentHealth?.metrics.failure_percent ?? 0}%</p>
        </div>
        <div className="glass-card fade-rise rounded-3xl p-4">
          <p className="text-xs text-slate-300">Stale Active Teams</p>
          <p className="mt-1 text-2xl font-semibold">{incidentHealth?.metrics.stale_active_teams ?? 0}</p>
        </div>
      </section>

      <section className="mb-4">
        <article className="glass-card fade-rise rounded-3xl border border-cyan-300/30 bg-cyan-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-100">Control Flow (Simple + Safe)</p>
          <p className="mt-1 text-sm text-slate-100">
            1) Configure event and create teams  2) Monitor live progress and final-key supervision  3) Reveal Top 3 and open Winner Display.
          </p>
          <p className="mt-2 text-xs text-slate-300">
            Advanced Ops are hidden by default to keep control room actions fast and low-risk.
          </p>
        </article>
      </section>

      <section className="mb-4">
        <article className="glass-card fade-rise rounded-3xl border border-emerald-300/30 bg-emerald-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-emerald-100">Quick Launch</p>
              <p className="mt-1 text-sm text-slate-100">
                Uses readiness checks and only starts gameplay when preflight is clean.
              </p>
              <p className="mt-1 text-xs text-slate-300">
                Status: {readiness?.ok ? "Ready" : "Blocked"} | Issues: {(readiness?.issues ?? []).length}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="ghost-btn" onClick={refreshReadiness} disabled={opsBusy !== null}>
                Refresh Readiness
              </button>
              <button className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white" onClick={launchEvent} disabled={opsBusy !== null || !readiness?.active_event_id}>
                {opsBusy === "launch" ? "Launching..." : "Launch Event Safely"}
              </button>
            </div>
          </div>
          {(readiness?.issues ?? []).length > 0 && (
            <div className="mt-2 rounded-xl border border-amber-300/30 bg-amber-500/10 p-2 text-xs text-amber-100">
              {(readiness?.issues ?? []).slice(0, 4).map((issue, idx) => (
                <p key={`${issue}-${idx}`}>- {issue}</p>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="mb-4">
        <article className="glass-card fade-rise rounded-3xl border border-rose-300/30 bg-rose-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-rose-100">Privileged Game Control</p>
              <p className="mt-1 text-sm text-slate-100">Hard start and hard end controls for full event lifecycle.</p>
            </div>
            <div className="flex gap-2">
              <button className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white" onClick={privilegedStartGame} disabled={opsBusy !== null || !emergencyUnlocked}>
                {opsBusy === "privileged-start" ? "Starting..." : "Start Game (Privileged)"}
              </button>
              <button className="rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold text-white" onClick={privilegedEndGame} disabled={opsBusy !== null || !emergencyUnlocked}>
                {opsBusy === "privileged-end" ? "Ending..." : "End Game (Privileged)"}
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-rose-100">
            Unlock emergency controls using SUPERADMIN before privileged actions become available.
          </p>
        </article>
      </section>

      {hostShowMode && (
      <section className="mb-4">
        <article className="glass-card fade-rise rounded-3xl border border-fuchsia-300/30 bg-fuchsia-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-fuchsia-100">Host Show Mode</p>
          <p className="mt-1 text-sm text-slate-100">
            Cue 1: Teams enter and scan first room. Cue 2: Mid-game broadcast push. Cue 3: Final key supervision.
            Cue 4: Reveal sequence and winner display handoff.
          </p>
          <p className="mt-2 text-xs text-slate-300">
            Current phase: {finaleMode ? "Restoration complete" : monitor?.event?.is_paused ? "Preflight / Paused" : "Live gameplay"}
          </p>
          {rehearsalMode && (
            <p className="mt-2 text-xs text-amber-200">
              Rehearsal enabled: Open Spectator now runs full simulated execution with team IDs and both player IDs.
            </p>
          )}
        </article>
      </section>
      )}

      {!simpleMode && showAdvanced && (
      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <article className="glass-card fade-rise rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Readiness</h2>
            <button className="ghost-btn" onClick={refreshReadiness}>
              Refresh
            </button>
          </div>
          <p className={`text-sm ${readiness?.ok ? "text-emerald-300" : "text-amber-300"}`}>
            {readiness?.ok ? "Ready for event start" : "Needs attention before launch"}
          </p>
          <p className="mt-2 text-xs text-slate-300">
            Active event: {readiness?.active_event_id ?? "-"} | Teams: {readiness?.team_count ?? 0} | Questions:{" "}
            {readiness?.question_pool_count ?? 0}
          </p>
          <p className="mt-2 text-xs text-amber-200">
            New events launch in preflight pause mode. After setup verification, press Resume Event to start gameplay.
          </p>
          <div className="mt-3 space-y-1 text-xs text-slate-300">
            {(readiness?.issues ?? []).map((issue, idx) => (
              <p key={`${issue}-${idx}`}>- {issue}</p>
            ))}
          </div>
        </article>

        <article className="glass-card fade-rise rounded-3xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Panic Controls</h2>
          <p className="mb-2 text-xs text-amber-200">
            Emergency controls require SUPERADMIN unlock.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold" onClick={pauseEvent} disabled={opsBusy !== null || !emergencyUnlocked}>
              {opsBusy === "pause" ? "Pausing..." : "Pause Event"}
            </button>
            <button className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold" onClick={resumeEvent} disabled={opsBusy !== null || !emergencyUnlocked}>
              {opsBusy === "resume" ? "Resuming..." : "Resume Event"}
            </button>
            <button className="rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold" onClick={resetTeams} disabled={opsBusy !== null || !emergencyUnlocked}>
              {opsBusy === "reset-teams" ? "Deleting Teams..." : "Delete All Teams"}
            </button>
            <button className="rounded-full bg-red-800 px-4 py-2 text-sm font-semibold" onClick={resetEverything} disabled={opsBusy !== null || !emergencyUnlocked}>
              {opsBusy === "reset-all" ? "Resetting..." : "Reset Everything"}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-300">
            Paused state blocks team start/scan/submit/hint/ability APIs and prevents progression drift.
          </p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-300">Host Broadcast</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Control room message to all teams"
                className="w-full rounded-2xl border border-white/15 bg-black/25 px-3 py-2 text-sm"
              />
              <select
                value={broadcastLevel}
                onChange={(e) => setBroadcastLevel(e.target.value as "info" | "warning" | "critical")}
                className="rounded-2xl border border-white/15 bg-black/25 px-3 py-2 text-sm"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
              <button className="apple-btn" onClick={sendBroadcast}>
                Send
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-300">
              Active pulse: {monitor?.event.active_pulse?.label ?? "N/A"} | Latest broadcast: {monitor?.latest_broadcast?.message ?? "None"}
            </p>
          </div>
        </article>
      </section>
      )}

      {showAdvanced && (
      <section className="mb-4">
        <article className="glass-card fade-rise rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Config Snapshots & Rollback</h2>
            <button className="ghost-btn" onClick={refreshConfigHistory}>Refresh</button>
          </div>
          <div className="space-y-2 text-xs">
            {configSnapshots.map((snap) => (
              <div key={snap.id} className="rounded-xl border border-white/10 bg-black/20 p-2">
                <p>
                  #{snap.id} | {snap.created_at} | Paths {snap.path_count} | Rooms/Path {snap.rooms_per_path} | Traps {snap.trap_count}
                </p>
                <button
                  className="ghost-btn mt-2"
                  onClick={() => rollbackToSnapshot(snap.id)}
                  disabled={!snap.has_full_config}
                >
                  {snap.has_full_config ? "Rollback to this snapshot" : "Snapshot not restorable"}
                </button>
              </div>
            ))}
            {configSnapshots.length === 0 && <p className="text-slate-300">No snapshots found.</p>}
          </div>
        </article>
      </section>
      )}

      {showAdvanced && (
      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <article className="glass-card fade-rise rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Incident Radar (15m)</h2>
            <button className="ghost-btn" onClick={refreshIncidentHealth}>Refresh</button>
          </div>
          <p className="text-sm text-slate-200">{incidentHealth?.guidance ?? "No incident snapshot yet."}</p>
          <div className="mt-3 grid gap-2 text-xs text-slate-200 md:grid-cols-2">
            <p>Scans/min: {incidentHealth?.metrics.scans_per_minute ?? 0}</p>
            <p>Suspicious events: {incidentHealth?.metrics.suspicious_events ?? 0}</p>
            <p>Submissions: {incidentHealth?.metrics.submissions ?? 0}</p>
            <p>Accuracy: {incidentHealth?.metrics.accuracy_percent ?? 0}%</p>
          </div>
          <div className="mt-3 max-h-40 overflow-auto space-y-1 text-xs text-amber-100">
            {(incidentHealth?.stale_active_teams ?? []).map((row) => (
              <p key={row.team_id}>Stale active: {row.team_name} ({row.team_id}) at {row.last_update_at}</p>
            ))}
            {(incidentHealth?.stale_active_teams?.length ?? 0) === 0 && <p className="text-emerald-200">No stale active teams.</p>}
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2 text-xs">
            <p className="text-slate-300">Failure drill tracker (must rehearse):</p>
            <label className="mt-1 flex items-center gap-2 text-slate-200">
              <input type="checkbox" checked={failureDrills.backendOutage} onChange={() => setFailureDrills((p) => ({ ...p, backendOutage: !p.backendOutage }))} />
              Backend outage protocol practiced
            </label>
            <label className="mt-1 flex items-center gap-2 text-slate-200">
              <input type="checkbox" checked={failureDrills.wifiLoss} onChange={() => setFailureDrills((p) => ({ ...p, wifiLoss: !p.wifiLoss }))} />
              Wi-Fi loss fallback practiced
            </label>
            <label className="mt-1 flex items-center gap-2 text-slate-200">
              <input type="checkbox" checked={failureDrills.missingQr} onChange={() => setFailureDrills((p) => ({ ...p, missingQr: !p.missingQr }))} />
              Missing QR recovery practiced
            </label>
          </div>
        </article>

        <article className="glass-card fade-rise rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Deterministic Ranking Audit</h2>
            <div className="flex gap-2">
              <button className="ghost-btn" onClick={refreshRankingAudit}>Refresh</button>
              <button className="ghost-btn" onClick={exportRankingAudit}>Export JSON</button>
            </div>
          </div>
          <p className="text-xs text-slate-300">Board signature: {rankingAudit?.board_signature?.slice(0, 22) ?? "-"}...</p>
          <div className="mt-2 space-y-1 text-xs text-cyan-100">
            {(rankingAudit?.tie_break_order ?? []).map((rule) => (
              <p key={rule}>{rule}</p>
            ))}
          </div>
          <div className="mt-3 max-h-44 overflow-auto space-y-2 text-xs text-slate-200">
            {(rankingAudit?.rows ?? []).slice(0, 10).map((row) => (
              <div key={row.team_id} className="rounded-xl border border-white/10 bg-black/20 p-2">
                #{row.rank} {row.team_name} | {row.team_id} | key {row.sort_key}
              </div>
            ))}
          </div>
        </article>
      </section>
      )}

      {showAdvanced && (
      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <article className="glass-card fade-rise rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Storyline Route Review</h2>
            <button className="ghost-btn" onClick={refreshStoryRouteReview}>Refresh</button>
          </div>
          <div className="space-y-2 text-xs text-cyan-100">
            {(storyRouteReview?.storyline_acts ?? []).map((act) => (
              <p key={act.act}>{act.act} {"->"} {act.orders.join(", ")}</p>
            ))}
          </div>
          <div className="mt-3 max-h-52 overflow-auto space-y-2 text-xs text-slate-200">
            {(storyRouteReview?.route_by_path ?? []).map((path) => (
              <div key={path.path_id} className="rounded-xl border border-white/10 bg-black/20 p-2">
                <p className="font-semibold text-cyan-200">{path.path_name}</p>
                <p>{path.route.map((node) => `${node.order}:${node.room_number}`).join(" -> ")}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="glass-card fade-rise rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Post-Event Ritual</h2>
            <button className="ghost-btn" onClick={refreshPostEventReview}>Refresh</button>
          </div>
          <p className="text-xs text-slate-300">
            Risk: {postEventReview?.diagnostics.incident_risk ?? "-"} | Accuracy: {postEventReview?.diagnostics.accuracy ?? 0}% | Traps: {postEventReview?.diagnostics.trap_trigger_count ?? 0}
          </p>
          <div className="mt-2 space-y-1 text-xs text-emerald-100">
            {(postEventReview?.ritual ?? []).map((step) => (
              <p key={step}>{step}</p>
            ))}
          </div>
          <div className="mt-3 text-xs text-amber-100">
            {(postEventReview?.top_missed_orders ?? []).slice(0, 3).map((row) => (
              <p key={row.order}>Missed order {row.order}: {row.misses} misses</p>
            ))}
          </div>
        </article>
      </section>
      )}

      {!simpleMode && (
      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <article className="glass-card fade-rise rounded-3xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Fairness Alerts</h2>
          <div className="max-h-56 overflow-auto space-y-2 text-xs text-slate-200">
            {(monitor?.fairness_alerts ?? []).map((alert, idx) => (
              <div key={`${alert.team_id}-${idx}`} className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-2">
                {alert.severity.toUpperCase()} | {alert.team_id} | {alert.reason}
              </div>
            ))}
          </div>
        </article>

        <article className="glass-card fade-rise rounded-3xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Key Shard Supervision</h2>
          <div className="max-h-56 overflow-auto space-y-2 text-xs text-slate-200">
            {(monitor?.final_key_supervision ?? []).map((row) => (
              <div key={row.team_id} className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 p-2">
                {row.team_id} | Key Shard A: {row.nexus ?? "-"} | Key Shard B: {row.amiphoria ?? "-"} | Rapid Gate: {row.rapid_gate_scan ?? "-"}
              </div>
            ))}
          </div>
        </article>
      </section>
      )}

      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <article className="glass-card fade-rise rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Operation: Firewall Storyline & Instructions</h2>
            <button className="ghost-btn" onClick={refreshOpsPackage}>
              Refresh Package
            </button>
          </div>
          <p className="text-sm text-slate-200">{opsPackage?.storyline?.intro ?? "No package yet."}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
            {(opsPackage?.instructions ?? []).map((item, idx) => (
              <li key={`${item}-${idx}`}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="glass-card fade-rise rounded-3xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Trap QR Placement</h2>
          <div className="space-y-2 text-sm">
            {(opsPackage?.trap_rooms ?? []).map((trap) => (
              <div key={trap.qr_code_payload} className="rounded-xl border border-white/10 p-2">
                Room {trap.room_number} (Floor {trap.floor}) {"->"} {trap.placement_zone.toUpperCase()} | QR: {trap.qr_code_payload}
              </div>
            ))}
          </div>
        </article>
      </section>

      {showAdvanced && (
      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <article className="glass-card fade-rise rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Printable QR Cards</h2>
            <div className="flex gap-2">
              <button className="ghost-btn" onClick={printCards}>
                Print Cards
              </button>
              <button className="apple-btn" onClick={exportPdf}>
                Export PDF
              </button>
            </div>
          </div>
          <p className="mb-3 text-sm text-slate-300">
            Generates room-wise printable QR cards with exact desk/door placement note for each room. In the print
            dialog, select destination as Save as PDF.
          </p>
          <div className="space-y-2 text-xs text-slate-200">
            {(opsPackage?.print_cards ?? []).slice(0, 6).map((card) => (
              <div key={card.qr_code_payload} className="rounded-xl border border-white/10 bg-black/20 p-2">
                {card.title} - place on {card.placement_zone}
              </div>
            ))}
          </div>
        </article>

        <article className="glass-card fade-rise rounded-3xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Full Placement Matrix</h2>
          <div className="max-h-72 overflow-auto space-y-2 text-xs text-slate-200">
            {(opsPackage?.qr_placement_plan ?? []).map((room) => (
              <div key={room.qr_code_payload} className="rounded-xl border border-white/10 bg-black/20 p-2">
                {room.room_number} | Floor {room.floor} | {room.room_type} | {room.placement_zone.toUpperCase()} |{" "}
                {room.path_name ?? "COMMON"}
              </div>
            ))}
          </div>
        </article>
      </section>
      )}

      {!simpleMode && showAdvanced && (
      <section className="mb-4">
        <article className="glass-card fade-rise rounded-3xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Bonus QR Nodes (Power-ups + Runes)</h2>
          <div className="max-h-56 overflow-auto space-y-2 text-xs text-slate-200">
            {(opsPackage?.bonus_qr_plan ?? []).map((node) => (
              <div key={node.code} className="rounded-xl border border-white/10 bg-black/20 p-2">
                {node.type.toUpperCase()} | {node.effect} | Place on {node.recommended_placement.toUpperCase()} |{" "}
                Room {node.assigned_room_number ?? "COMMON"} (Floor {node.assigned_floor ?? 0}) | {node.code}
                {node.clue && <p className="mt-1 text-[10px] text-cyan-200">Clue: {node.clue}</p>}
              </div>
            ))}
          </div>
        </article>
      </section>
      )}

      {!simpleMode && showAdvanced && (
      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <article className="glass-card fade-rise rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Post-Game Analytics</h2>
            <button className="ghost-btn" onClick={refreshPostAnalytics}>Refresh</button>
          </div>
          <div className="space-y-1 text-sm text-slate-200">
            <p>Finished teams: {postAnalytics?.finished_teams ?? 0}</p>
            <p>Timeout teams: {postAnalytics?.timeout_teams ?? 0}</p>
            <p>Average points: {postAnalytics?.avg_points ?? 0}</p>
            <p>Accuracy: {postAnalytics?.accuracy ?? 0}%</p>
            <p>Trap triggers: {postAnalytics?.trap_trigger_count ?? 0}</p>
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2 text-xs text-slate-200">
            <p className="font-semibold text-cyan-200">Difficulty Tuning Hints</p>
            {(postAnalytics?.top_missed_orders ?? []).slice(0, 3).map((row) => (
              <p key={row.order}>Order {row.order}: {row.misses} misses - consider clearer wording or hint tuning.</p>
            ))}
          </div>
        </article>

        <article className="glass-card fade-rise rounded-3xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Replay Timeline</h2>
          <div className="mb-2 flex gap-2">
            <input
              value={replayTeamId}
              onChange={(e) => setReplayTeamId(e.target.value)}
              placeholder="Team UUID"
              className="w-full rounded-2xl border border-white/15 bg-black/25 px-3 py-2 text-sm"
            />
            <button className="apple-btn" onClick={fetchReplay}>Load</button>
          </div>
          <div className="max-h-52 overflow-auto space-y-2 text-xs text-slate-200">
            {(replayData?.timeline ?? []).slice(-80).map((row, idx) => (
              <div key={`${row.timestamp}-${idx}`} className="rounded-xl border border-white/10 bg-black/20 p-2">
                {row.timestamp} | {row.action_type}
              </div>
            ))}
          </div>
        </article>
      </section>
      )}

      {!simpleMode && showAdvanced && (
      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <article className="glass-card fade-rise rounded-3xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Print Bundles By Type</h2>
          <div className="space-y-1 text-xs text-slate-200">
            <p>Rooms: {opsPackage?.print_bundles?.rooms.length ?? 0}</p>
            <p>Traps: {opsPackage?.print_bundles?.traps.length ?? 0}</p>
            <p>Bonus: {opsPackage?.print_bundles?.bonus.length ?? 0}</p>
            <p>Final Keys: {opsPackage?.print_bundles?.final_keys.length ?? 0}</p>
          </div>
        </article>

        <article className="glass-card fade-rise rounded-3xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Offline Fallback Packet</h2>
          <p className="text-sm text-slate-300">{opsPackage?.offline_fallback_packet?.title ?? "No packet loaded"}</p>
          <div className="mt-2 space-y-1 text-xs text-slate-200">
            {(opsPackage?.offline_fallback_packet?.emergency_rules ?? []).map((rule, idx) => (
              <p key={`${rule}-${idx}`}>- {rule}</p>
            ))}
          </div>
        </article>
      </section>
      )}

      <section className="mb-4">
        <article className="glass-card fade-rise rounded-3xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Final Key QR Nodes (Mandatory)</h2>
          <div className="space-y-2 text-xs text-slate-200">
            {(opsPackage?.final_key_qr_plan ?? []).map((node) => (
              <div key={node.code} className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-2">
                {node.type.toUpperCase()} | {node.effect} | Place on {node.recommended_placement.toUpperCase()} |{" "}
                Room {node.assigned_room_number ?? "COMMON"} (Floor {node.assigned_floor ?? 0}) | {node.code}
                {node.clue && <p className="mt-1 text-[10px] text-amber-100">Clue: {node.clue}</p>}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <form onSubmit={configureEvent} className="glass-card fade-rise rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Event Configurator</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {fields.map((field) => (
              <label key={field} className="text-xs text-slate-300">
                {field.replace(/_/g, " ")}
                <input
                  type="number"
                  value={config[field]}
                  onChange={(e) => setConfig((prev) => ({ ...prev, [field]: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-2xl border border-white/15 bg-black/25 px-3 py-2 text-sm"
                />
              </label>
            ))}
            <label className="text-xs text-slate-300 md:col-span-2">
              floor_room_map (one per line: floor:rooms)
              <textarea
                value={config.floor_room_map_text}
                onChange={(e) => setConfig((prev) => ({ ...prev, floor_room_map_text: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-white/15 bg-black/25 px-3 py-2 text-sm"
                rows={4}
              />
            </label>
            <label className="text-xs text-slate-300 md:col-span-2">
              excluded room numbers (comma/newline separated)
              <textarea
                value={config.excluded_rooms_text}
                onChange={(e) => setConfig((prev) => ({ ...prev, excluded_rooms_text: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-white/15 bg-black/25 px-3 py-2 text-sm"
                rows={2}
              />
            </label>
          </div>
          <button className="apple-btn mt-4">Generate Dynamic Event</button>
        </form>

        <form onSubmit={createTeam} className="glass-card fade-rise rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Team Provisioning</h2>
          <div className="mt-3 space-y-2">
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Team name"
              className="w-full rounded-2xl border border-white/15 bg-black/25 px-3 py-3"
              required
            />
            <input
              type="password"
              value={teamPassword}
              onChange={(e) => setTeamPassword(e.target.value)}
              placeholder="Team password"
              className="w-full rounded-2xl border border-white/15 bg-black/25 px-3 py-3"
              required
            />
            <button className="apple-btn w-full">Create Team Credential</button>
          </div>
          {message && <p className="mt-3 text-sm text-slate-200">{message}</p>}
        </form>
      </section>

      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <article className="glass-card fade-rise rounded-3xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Path Load Graph</h2>
          <div className="space-y-2">
            {monitor?.path_distribution.map((path) => {
              const width = path.max_capacity > 0 ? (path.assigned / path.max_capacity) * 100 : 0;
              return (
                <div key={path.path_name}>
                  <div className="mb-1 flex justify-between text-xs text-slate-300">
                    <span>{path.path_name}</span>
                    <span>
                      {path.assigned}/{path.max_capacity}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-500 transition-all"
                      style={{ width: `${Math.min(100, width)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="glass-card fade-rise rounded-3xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Room Occupancy Heatmap</h2>
          <p className="mb-2 text-xs text-slate-300">Showing all rooms: {monitor?.room_occupancy.length ?? 0}</p>
          <div className="grid max-h-80 grid-cols-2 gap-2 overflow-auto pr-1 md:grid-cols-3">
            {monitor?.room_occupancy.map((room) => (
              <div
                key={room.room_number}
                className="rounded-xl border border-white/10 p-2 text-xs"
                style={{ background: `rgba(124, 235, 255, ${Math.min(0.55, room.count * 0.13 + 0.08)})` }}
              >
                <p className="font-semibold text-slate-100">{room.room_number}</p>
                <p className="text-slate-100">{room.count} teams</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <article className="glass-card fade-rise overflow-x-auto rounded-3xl p-5">
          <h2 className="mb-3 text-lg font-semibold">Team Live Map</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-300">
                <th className="py-2">Team</th>
                <th>Player IDs</th>
                <th>Status</th>
                <th>Phase</th>
                <th>Room</th>
                <th>Rapid</th>
                <th>Hints</th>
                <th>Traps</th>
                <th />
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {displayTeams.map((team) => (
                <tr key={team.team_id} className="border-t border-white/10">
                  <td className="py-2">{team.team_name}</td>
                  <td className="text-[11px] text-cyan-200">{team.member_ids?.join(", ") ?? "-"}</td>
                  <td>{team.status}</td>
                  <td>{team.phase ?? "-"}</td>
                  <td>{team.current_room ?? "-"}</td>
                  <td>
                    {team.phase === "rapid_fire"
                      ? `${team.rapid_answered ?? 0}/${team.rapid_total ?? 5} (${team.rapid_remaining_seconds ?? 0}s)`
                      : "-"}
                  </td>
                  <td>{team.hints_used}</td>
                  <td>{team.trap_hits}</td>
                  <td>
                    <button className="rounded-full bg-rose-600 px-3 py-1 text-xs" onClick={() => disqualify(team.team_id)} disabled={!emergencyUnlocked}>
                      Disqualify
                    </button>
                  </td>
                  <td>
                    <button className="rounded-full bg-amber-600 px-3 py-1 text-xs" onClick={() => forceUnlock(team.team_id)} disabled={!emergencyUnlocked}>
                      Force Unlock
                    </button>
                  </td>
                  <td>
                    <button className="rounded-full bg-indigo-600 px-3 py-1 text-xs" onClick={() => forceFinish(team.team_id)} disabled={!emergencyUnlocked}>
                      Force Finish
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="my-3 h-px bg-white/10" />
          <h3 className="mb-2 text-sm font-semibold text-cyan-200">Live Leaderboard (Realtime, pre-finale)</h3>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-300">
                <th className="py-1">Rank</th>
                <th>Team</th>
                <th>Status</th>
                <th>Phase</th>
                <th>Order</th>
                <th>Rapid Live</th>
                <th>Points</th>
                <th>Projected Total Time</th>
                <th>Why Leading</th>
              </tr>
            </thead>
            <tbody>
              {(monitor?.live_leaderboard ?? []).slice(0, 12).map((row) => (
                <tr key={row.team_id} className="border-t border-white/10">
                  <td className="py-1">{row.rank}</td>
                  <td>{row.team_name}</td>
                  <td>{row.status}</td>
                  <td>{row.phase}</td>
                  <td>{row.current_order}</td>
                  <td>
                    {row.phase === "rapid_fire"
                      ? `${row.rapid_answered ?? 0}/${row.rapid_total ?? 5} (${row.rapid_remaining_seconds ?? 0}s)`
                      : "-"}
                  </td>
                  <td>{row.points}</td>
                  <td>{timeText(row.projected_total_seconds)}</td>
                  <td>{winningReason(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="glass-card fade-rise overflow-x-auto rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Result Control (Top 3)</h2>
            <div className="flex gap-2">
              <button className="ghost-btn" onClick={refreshLeaderboard}>
                Refresh
              </button>
              <button className="rounded-full bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white" onClick={revealFinale}>
                Reveal Top 3 to All Teams
              </button>
            </div>
          </div>
          {finaleMode && topThree.length > 0 && (
            <div className="mb-3 rounded-2xl border border-fuchsia-300/40 bg-fuchsia-500/10 p-3 text-sm">
              <p className="text-fuchsia-200">Result Mode Active: Event completed and top 3 announced.</p>
              {finaleSequenceMode && <p className="mt-1 text-amber-200">Sequence Mode: Timed reveal is active for team screens.</p>}
              {finaleSequenceMode && finaleSequencePhase !== "done" && finaleSpotlight && (
                <div className="mt-2 rounded-xl border border-amber-300/40 bg-amber-500/10 p-2 text-amber-100">
                  {finaleSequencePhase === "rank3" ? "Revealing 3rd place" : finaleSequencePhase === "rank2" ? "Revealing 2nd place" : "Revealing Champion"}:{" "}
                  <span className="font-semibold">{finaleSpotlight.team_name}</span>
                </div>
              )}
              <p className="mt-1 text-slate-200">
                1) {topThree[0]?.team_name ?? "-"} 2) {topThree[1]?.team_name ?? "-"} 3) {topThree[2]?.team_name ?? "-"}
              </p>
            </div>
          )}
          {!finaleMode && <p className="text-sm text-slate-300">Top 3 not revealed yet. Use the reveal button after rapid-fire.</p>}
        </article>
      </section>
    </main>
  );
}

