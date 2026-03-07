import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Countdown } from "../components/Countdown";
import { ScannerPanel } from "../components/ScannerPanel";
import { useBlockBackNavigation } from "../hooks/useBlockBackNavigation";
import { api } from "../lib/api";
import { audioManager } from "../lib/audioManager";
import { clearAuth, getTeamName } from "../lib/auth";
import type { BroadcastState, PulseState, TeamState } from "../types";

type RapidQuestion = {
  order: number;
  total: number;
  question_text: string;
};

type NextTarget = {
  title: string;
  clue_style: string;
  clue_text: string;
  decode_hint: string;
  clue_hints?: string[];
  unlock_token?: string;
  layer_one?: string;
  layer_two?: string;
} | null;

type RivalChallenge = {
  rival_team_name: string;
  rival_points: number;
  delta: number;
} | null;

type StoryMission = {
  chapter: string;
  collected_fragments: number;
  required_fragments_for_rapid: number;
  rapid_unlock_ready: boolean;
  next_fragment_title: string | null;
  next_artifact: string | null;
} | null;

type FinalKeyState = {
  gate_ready: boolean;
  nexus_scanned: boolean;
  amiphoria_scanned: boolean;
  dual_key_ready: boolean;
  rapid_qr_code_hint: string;
} | null;

type FinalKeyBrief = {
  nexus: { room_number: string | null; floor: number | null; clue: string };
  amiphoria: { room_number: string | null; floor: number | null; clue: string };
  rapid_gate: { room_number: string | null; floor: number | null; clue: string };
} | null;

type RapidCategoryState = {
  selected: "web" | "database" | "networking" | null;
  options: Array<"web" | "database" | "networking">;
} | null;

type GameplayMeta = {
  main_steps: number;
  rapid_fire_questions: number;
  rapid_fire_duration_seconds: number;
  total_steps: number;
};

type TeamStatusPayload = {
  team: TeamState;
  should_redirect_finish: boolean;
};

type MilestoneReward = {
  order: number;
  title: string;
  points: number;
  badge: string;
};


type ScanResponse =
  | {
      type: "question";
      team: TeamState;
      room: {
        room_number: string;
        room_code: string;
        difficulty_level: number;
        question_text: string;
      };
      message: string;
      clue_style?: string;
      active_pulse?: PulseState;
      latest_broadcast?: BroadcastState | null;
      rapid_category_state?: RapidCategoryState;
      final_key_brief?: FinalKeyBrief;
    }
  | {
      type: "trap" | "powerup" | "rune";
      team: TeamState;
      message: string;
      runes_collected?: number;
      hint_credits_remaining?: number;
      next_room_clue?: NextTarget;
      active_pulse?: PulseState;
      latest_broadcast?: BroadcastState | null;
      final_key_state?: FinalKeyState;
      final_key_brief?: FinalKeyBrief;
    }
  | {
      type: "final_key";
      team: TeamState;
      message: string;
      final_key_state: FinalKeyState;
      rapid_fire_started?: boolean;
      rapid_remaining_seconds?: number;
      rapid_question?: RapidQuestion | null;
      active_pulse?: PulseState;
      latest_broadcast?: BroadcastState | null;
      rapid_category_state?: RapidCategoryState;
      final_key_brief?: FinalKeyBrief;
    };

type StartResponse = {
  team: TeamState;
  game_duration?: number;
  story_intro?: string;
  message?: string;
  story_mission?: StoryMission;
  story_chapter?: string;
  final_key_state?: FinalKeyState;
  final_key_brief?: FinalKeyBrief;
  rapid_category_state?: RapidCategoryState;
  active_pulse?: PulseState;
  latest_broadcast?: BroadcastState | null;
  hint_credits_remaining?: number;
  runes_collected?: number;
  active_prompt?: {
    room_number: string;
    room_code: string;
    difficulty_level: number;
    question_text: string;
  } | null;
  next_room_clue?: NextTarget;
  gameplay_meta?: GameplayMeta;
  device_policy?: string;
  route_briefing?: {
    path_name: string | null;
    checkpoint_count: number;
    floor_span: number[];
    note: string;
  };
};

type CachedGameState = {
  team: TeamState | null;
  question: string | null;
  difficulty: number | null;
  roomCode: string;
  feedback: string | null;
  hintMessage: string | null;
  nextTarget: NextTarget;
  finalKeyState: FinalKeyState;
  finalKeyBrief: FinalKeyBrief;
  activePulse: PulseState | null;
  runesCollected: number;
  hintCredits: number;
  storyMission: StoryMission;
  storyChapter: string | null;
  rapidCategory: RapidCategoryState;
  rapidQuestion: RapidQuestion | null;
  rapidRemaining: number;
  gameplayMeta: GameplayMeta | null;
  gameDuration: number;
  rapidDuration: number;
  routeBriefing: StartResponse["route_briefing"] | null;
  activityFeed: string[];
  fragments: string[];
  savedAt: number;
};

function parseApiError(err: unknown): { status: number; message: string } {
  const status =
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof (err as { response?: { status?: number } }).response?.status === "number"
      ? (err as { response: { status: number } }).response.status
      : 0;
  const message =
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
      ? (err as { response: { data: { error: string } } }).response.data.error
      : "Request failed";
  return { status, message };
}

const STORY_ARCS = [
  {
    id: "act1",
    title: "Act I: City in Darkness",
    range: [0, 2] as const,
    stake: "The blackout spreads block by block. You are not playing for points; you are buying time for the city.",
    nexus_line: "NEXUS: We only get one clean route through this chaos. Stay precise.",
    amiphoria_line: "AMIPHORIA: Decode slowly, move quickly. Mistakes feed the Architect."
  },
  {
    id: "act2",
    title: "Act II: The Architect's Maze",
    range: [3, 5] as const,
    stake: "The Vault now adapts to your behavior. Every wrong turn teaches it how to trap you.",
    nexus_line: "NEXUS: It predicts patterns. Break your rhythm when needed.",
    amiphoria_line: "AMIPHORIA: Trust your team roles. Solo instincts fail inside adaptive systems."
  },
  {
    id: "act3",
    title: "Act III: Key Fracture War",
    range: [6, 7] as const,
    stake: "Nexus and Amiphoria key shards must be reunited, or the rapid chamber never opens.",
    nexus_line: "NEXUS: My shard alone is useless. We need both signatures.",
    amiphoria_line: "AMIPHORIA: Find me. Scan me. Then run for the override."
  },
  {
    id: "act4",
    title: "Act IV: Final Override",
    range: [8, 99] as const,
    stake: "The city firewall is unstable. Rapid-fire is the final override before complete collapse.",
    nexus_line: "NEXUS: This is the last gate. No hesitation.",
    amiphoria_line: "AMIPHORIA: One clean chain of answers and we bring the grid back."
  }
];

export function GamePage() {
  const navigate = useNavigate();
  const [simpleMode, setSimpleMode] = useState(false);
  const [team, setTeam] = useState<TeamState | null>(null);
  const [scanEnabled, setScanEnabled] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [clueStyle, setClueStyle] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [answer, setAnswer] = useState("");
  const [hintMessage, setHintMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [gameDuration, setGameDuration] = useState(5400);
  const [rapidDuration, setRapidDuration] = useState(300);
  const [gameplayMeta, setGameplayMeta] = useState<GameplayMeta | null>(null);
  const [rapidQuestion, setRapidQuestion] = useState<RapidQuestion | null>(null);
  const [rapidRemaining, setRapidRemaining] = useState(300);
  const [fragments, setFragments] = useState<string[]>([]);
  const [activityFeed, setActivityFeed] = useState<string[]>([]);
  const [nextTarget, setNextTarget] = useState<NextTarget>(null);
  const [finalKeyState, setFinalKeyState] = useState<FinalKeyState>(null);
  const [finalKeyBrief, setFinalKeyBrief] = useState<FinalKeyBrief>(null);
  const [activePulse, setActivePulse] = useState<PulseState | null>(null);
  const [broadcast, setBroadcast] = useState<BroadcastState | null>(null);
  const [runesCollected, setRunesCollected] = useState(0);
  const [hintCredits, setHintCredits] = useState(0);
  const [rivalChallenge, setRivalChallenge] = useState<RivalChallenge>(null);
  const [bossBadge, setBossBadge] = useState<string | null>(null);
  const [jackpotActive, setJackpotActive] = useState(false);
  const [storyMission, setStoryMission] = useState<StoryMission>(null);
  const [storyChapter, setStoryChapter] = useState<string | null>(null);
  const [rapidCategory, setRapidCategory] = useState<RapidCategoryState>(null);
  const [milestoneReward, setMilestoneReward] = useState<MilestoneReward | null>(null);
  const [offlineAssist, setOfflineAssist] = useState(false);
  const [serverHealth, setServerHealth] = useState<{ online: boolean; paused: boolean; checkedAt: number | null }>({
    online: true,
    paused: false,
    checkedAt: null
  });
  const [requestFailures, setRequestFailures] = useState(0);
  const [manualCheckpoint, setManualCheckpoint] = useState("");
  const [milestoneBadges, setMilestoneBadges] = useState<string[]>([]);
  const [routeBriefing, setRouteBriefing] = useState<StartResponse["route_briefing"] | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(1);
  const [tutorialSeconds, setTutorialSeconds] = useState(60);
  const [actionBusy, setActionBusy] = useState<null | "submit" | "hint" | "ability" | "rapid">(null);
  const scanInFlight = useRef(false);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const rapidExpirySyncRef = useRef(false);
  const [transmissionIndex, setTransmissionIndex] = useState(0);
  const cacheKey = useMemo(() => {
    const teamName = getTeamName()?.trim().toLowerCase() || "anonymous";
    return `scan_live_state_v2:${teamName}`;
  }, []);

  const restoreCachedState = useCallback(() => {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as CachedGameState;
      if (!parsed || typeof parsed !== "object") return false;
      setTeam(parsed.team ?? null);
      setQuestion(parsed.question ?? null);
      setDifficulty(parsed.difficulty ?? null);
      setRoomCode(parsed.roomCode ?? "");
      setFeedback(parsed.feedback ?? null);
      setHintMessage(parsed.hintMessage ?? null);
      setNextTarget(parsed.nextTarget ?? null);
      setFinalKeyState(parsed.finalKeyState ?? null);
      setFinalKeyBrief(parsed.finalKeyBrief ?? null);
      setActivePulse(parsed.activePulse ?? null);
      setRunesCollected(parsed.runesCollected ?? 0);
      setHintCredits(parsed.hintCredits ?? 0);
      setStoryMission(parsed.storyMission ?? null);
      setStoryChapter(parsed.storyChapter ?? null);
      setRapidCategory(parsed.rapidCategory ?? null);
      setRapidQuestion(parsed.rapidQuestion ?? null);
      setRapidRemaining(parsed.rapidRemaining ?? 300);
      setGameplayMeta(parsed.gameplayMeta ?? null);
      setGameDuration(parsed.gameDuration ?? 5400);
      setRapidDuration(parsed.rapidDuration ?? 300);
      setRouteBriefing(parsed.routeBriefing ?? null);
      setActivityFeed(Array.isArray(parsed.activityFeed) ? parsed.activityFeed : []);
      setFragments(Array.isArray(parsed.fragments) ? parsed.fragments : []);
      return true;
    } catch {
      return false;
    }
  }, [cacheKey]);

  useBlockBackNavigation({
    onBlocked: () => {
      setFeedback("Back navigation is locked during gameplay. Use Logout from the panel.");
    }
  });

  const bootstrapSession = useCallback(async () => {
    try {
      const response = await api.post<StartResponse>("/game/start");
      setTeam(response.data.team);
      setGameDuration(response.data.game_duration ?? 5400);
      setRapidDuration(response.data.gameplay_meta?.rapid_fire_duration_seconds ?? 300);
      setGameplayMeta(response.data.gameplay_meta ?? null);
      setFeedback(response.data.story_intro ?? response.data.message ?? null);
      setStoryMission(response.data.story_mission ?? null);
      setStoryChapter(response.data.story_chapter ?? null);
      setRouteBriefing(response.data.route_briefing ?? null);
      setFinalKeyState(response.data.final_key_state ?? null);
      setFinalKeyBrief(response.data.final_key_brief ?? null);
      setRapidCategory(response.data.rapid_category_state ?? null);
      setActivePulse(response.data.active_pulse ?? null);
      setBroadcast(response.data.latest_broadcast ?? null);
      setRunesCollected(response.data.runes_collected ?? 0);
      setHintCredits(response.data.hint_credits_remaining ?? 0);
      if (response.data.active_prompt) {
        setQuestion(response.data.active_prompt.question_text ?? null);
        setDifficulty(response.data.active_prompt.difficulty_level ?? null);
        setRoomCode(response.data.active_prompt.room_code ?? "");
        setActivityFeed([`Session restored: ${response.data.active_prompt.room_number}`, "Mission state recovered from server."]);
      } else {
        setQuestion(null);
        setDifficulty(null);
        setRoomCode("");
        setActivityFeed(["Mission initialized. Awaiting first scan.", "Optional power-up and rune nodes are active."]);
      }
      setNextTarget(response.data.next_room_clue ?? null);
    } catch (err: unknown) {
      const { status, message } = parseApiError(err);
      if (status === 410) {
        navigate("/finish", { replace: true });
        return;
      }
      if (status === 401) {
        clearAuth();
        navigate("/login", { replace: true });
        return;
      }
      if (status === 403 || status === 409) {
        try {
          const statusResponse = await api.get<TeamStatusPayload>("/game/me-status");
          if (statusResponse.data.should_redirect_finish) {
            setTeam(statusResponse.data.team);
            navigate("/finish", { replace: true });
            return;
          }
        } catch {
          // ignore secondary status check failure; fall through to user-visible feedback
        }
        setFeedback(message || "Mission state changed. Check control room instruction.");
        return;
      }
      setOfflineAssist(true);
      setFeedback("Connection issue detected. Offline assist mode enabled.");
    }
  }, [navigate]);

  useEffect(() => {
    restoreCachedState();
    if (localStorage.getItem("scan_tutorial_v3_done") !== "1") {
      setTutorialOpen(true);
      setTutorialStep(1);
      setTutorialSeconds(60);
      setFeedback("Complete the tutorial to start the mission timer.");
      return;
    }
    void bootstrapSession();
  }, [bootstrapSession, restoreCachedState]);

  useEffect(() => {
    const payload: CachedGameState = {
      team,
      question,
      difficulty,
      roomCode,
      feedback,
      hintMessage,
      nextTarget,
      finalKeyState,
      finalKeyBrief,
      activePulse,
      runesCollected,
      hintCredits,
      storyMission,
      storyChapter,
      rapidCategory,
      rapidQuestion,
      rapidRemaining,
      gameplayMeta,
      gameDuration,
      rapidDuration,
      routeBriefing,
      activityFeed,
      fragments,
      savedAt: Date.now()
    };
    localStorage.setItem(cacheKey, JSON.stringify(payload));
  }, [
    cacheKey,
    team,
    question,
    difficulty,
    roomCode,
    feedback,
    hintMessage,
    nextTarget,
    finalKeyState,
    finalKeyBrief,
    activePulse,
    runesCollected,
    hintCredits,
    storyMission,
    storyChapter,
    rapidCategory,
    rapidQuestion,
    rapidRemaining,
    gameplayMeta,
    gameDuration,
    rapidDuration,
    routeBriefing,
    activityFeed,
    fragments
  ]);

  useEffect(() => {
    if (!tutorialOpen) return;
    const id = window.setInterval(() => {
      setTutorialSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [tutorialOpen]);

  useEffect(() => {
    if (team?.phase !== "rapid_fire") {
      rapidExpirySyncRef.current = false;
      return;
    }
    if (rapidRemaining > 0 || rapidExpirySyncRef.current) return;
    rapidExpirySyncRef.current = true;
    const syncRapidExpiry = async () => {
      try {
        const response = await api.post<StartResponse>("/game/start");
        setTeam(response.data.team);
        if (response.data.team.status !== "active") {
          navigate("/finish", { replace: true });
        }
      } catch {
        rapidExpirySyncRef.current = false;
      }
    };
    void syncRapidExpiry();
  }, [navigate, rapidRemaining, team?.phase]);

  useEffect(() => {
    if (!broadcast) return;
    audioManager.play("broadcast");
  }, [broadcast?.timestamp]);

  useEffect(() => {
    if (!team?.rapid_fire_start_time || team.phase !== "rapid_fire") return;
    const interval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(team.rapid_fire_start_time as string).getTime()) / 1000);
      const left = Math.max(0, rapidDuration - elapsed);
      setRapidRemaining(left);
      if (left > 0 && left <= rapidDuration && left % 30 === 0) {
        audioManager.play("warning_tick");
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [rapidDuration, team?.phase, team?.rapid_fire_start_time]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTransmissionIndex((v) => (v + 1) % 4);
    }, 5200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        const response = await api.get<{ ok: boolean; is_paused: boolean }>("/game/health");
        if (!mounted) return;
        setServerHealth({
          online: Boolean(response.data.ok),
          paused: Boolean(response.data.is_paused),
          checkedAt: Date.now()
        });
      } catch {
        if (!mounted) return;
        setServerHealth({
          online: false,
          paused: false,
          checkedAt: Date.now()
        });
      }
    };

    void checkHealth();
    const id = window.setInterval(() => {
      void checkHealth();
    }, 15_000);

    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!team) return;
    let mounted = true;
    const syncTeamStatus = async () => {
      try {
        const response = await api.get<TeamStatusPayload>("/game/me-status");
        if (!mounted) return;
        setTeam(response.data.team);
        if (response.data.should_redirect_finish) {
          navigate("/finish", { replace: true });
        }
      } catch (err: unknown) {
        const { status } = parseApiError(err);
        if (status === 410) {
          navigate("/finish", { replace: true });
          return;
        }
        if (status === 401) {
          clearAuth();
          navigate("/login", { replace: true });
        }
      }
    };
    const id = window.setInterval(() => {
      void syncTeamStatus();
    }, 7000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [navigate, team?.id]);

  useEffect(() => {
    if (team?.status === "active") return;
    let mounted = true;
    const checkWinnerReveal = async () => {
      try {
        const response = await api.get<{ visible: boolean; finale_mode?: boolean }>("/game/winner-display");
        if (!mounted) return;
        if (response.data.visible && response.data.finale_mode) {
          navigate("/finish", { replace: true });
        }
      } catch {
        // ignore transient winner-display poll errors
      }
    };

    void checkWinnerReveal();
    const id = window.setInterval(() => {
      void checkWinnerReveal();
    }, 8_000);

    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [navigate, team?.status]);

  useEffect(() => {
    document.documentElement.classList.remove(
      "a11y-high-contrast",
      "a11y-large-text",
      "a11y-dyslexic",
      "a11y-reduced-motion"
    );
    localStorage.removeItem("scan_accessibility");
    localStorage.removeItem("scan_safe_mode");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("perf-lite", simpleMode);
  }, [simpleMode]);

  useEffect(() => {
    const badges = localStorage.getItem("scan_milestone_badges");
    if (!badges) return;
    try {
      setMilestoneBadges(JSON.parse(badges));
    } catch {
      // ignore malformed cache
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("scan_milestone_badges", JSON.stringify(milestoneBadges));
  }, [milestoneBadges]);

  const t = useMemo(
    () => ({
      missionFlow: "Mission Flow (Required Sequence)",
      offline: "Offline Assist Mode",
      offlineBody:
        "Network is unstable. Coordinate with host fallback protocol and note the next manual checkpoint.",
      startCamera: "Start Camera",
      stopCamera: "Stop Camera"
    }),
    []
  );

  const onScan = useCallback(async (code: string) => {
    if (tutorialOpen) return;
    if (scanInFlight.current) return;
    const normalizedCode = code.trim().toUpperCase();
    const now = Date.now();
    if (lastScanRef.current && lastScanRef.current.code === normalizedCode && now - lastScanRef.current.at < 1200) {
      return;
    }
    lastScanRef.current = { code: normalizedCode, at: now };
    scanInFlight.current = true;
    try {
      const response = await api.post<ScanResponse>("/game/scan", { room_code: normalizedCode });
      const scanData = response.data;
      setRequestFailures(0);
      setOfflineAssist(false);
      setTeam(scanData.team);
      if (scanData.active_pulse) setActivePulse(scanData.active_pulse);
      if (scanData.latest_broadcast) setBroadcast(scanData.latest_broadcast);
      if ("hint_credits_remaining" in scanData && typeof scanData.hint_credits_remaining === "number") {
        setHintCredits(scanData.hint_credits_remaining);
      }
      if ("final_key_state" in scanData && scanData.final_key_state) {
        setFinalKeyState(scanData.final_key_state);
      }
      if ("final_key_brief" in scanData && scanData.final_key_brief) {
        setFinalKeyBrief(scanData.final_key_brief);
      }
      if ("rapid_category_state" in scanData && scanData.rapid_category_state) {
        setRapidCategory(scanData.rapid_category_state);
      }

      if (scanData.type !== "question") {
        if (scanData.type === "final_key") {
          audioManager.play("mission_unlock");
          setFeedback(scanData.message);
          setActivityFeed((prev) => [`Final key stage: ${scanData.message}`, ...prev].slice(0, 10));
          setScanEnabled(false);
          if (scanData.rapid_fire_started) {
            setRapidQuestion(scanData.rapid_question ?? null);
            setQuestion(scanData.rapid_question?.question_text ?? null);
            setDifficulty(5);
            setRoomCode("RAPID");
            setRapidRemaining(scanData.rapid_remaining_seconds ?? rapidDuration);
            setNextTarget(null);
            audioManager.play("boss");
          }
          return;
        }

        if (scanData.type === "trap") {
          audioManager.play("trap_alarm");
          setFeedback(scanData.message || "Trap interaction detected.");
          setActivityFeed((prev) => [`Trap update: ${scanData.message || "interaction registered"}`, ...prev].slice(0, 10));
          if ("next_room_clue" in scanData && scanData.next_room_clue) {
            setNextTarget(scanData.next_room_clue);
          }
          setScanEnabled(false);
          return;
        }

        if (scanData.type === "powerup") {
          audioManager.play("powerup");
          setFeedback(scanData.message);
          setActivityFeed((prev) => [`Power-up unlocked`, ...prev].slice(0, 10));
          setScanEnabled(false);
          return;
        }

        audioManager.play("powerup");
        setFeedback(scanData.message);
        if (scanData.runes_collected !== undefined) setRunesCollected(scanData.runes_collected);
        setActivityFeed((prev) => [`Rune fragment recovered`, ...prev].slice(0, 10));
        setScanEnabled(false);
        return;
      }

      const roomNumber = scanData.room.room_number;
      audioManager.play("scan_success");
      setQuestion(scanData.room.question_text || "Question unlocked.");
      setDifficulty(scanData.room.difficulty_level);
      setRoomCode(scanData.room.room_code);
      setClueStyle(scanData.clue_style ?? null);
      setFeedback("Challenge loaded. Submit one precise answer.");
      setActivityFeed((prev) => [`Scan success: ${roomNumber}`, ...prev].slice(0, 10));
      setScanEnabled(false);
    } catch (err: unknown) {
      const { status, message } = parseApiError(err);
      if (status === 410) {
        navigate("/finish", { replace: true });
        return;
      }
      if (status === 401) {
        clearAuth();
        navigate("/login", { replace: true });
        return;
      }
      setFeedback(message || "Scan failed");
      setRequestFailures((prev) => {
        const next = prev + 1;
        if (next >= 3) setOfflineAssist(true);
        return next;
      });
    } finally {
      scanInFlight.current = false;
    }
  }, [navigate, rapidDuration, tutorialOpen]);

  const onSubmit = async () => {
    if (tutorialOpen) return;
    if (!answer.trim()) return;
    if (actionBusy) return;
    setActionBusy("submit");
    try {
      const payload =
        team?.phase === "rapid_fire"
          ? { room_code: roomCode || "RAPID", answer }
          : { room_code: roomCode, answer };

      const response = await api.post("/game/submit", payload);
      setRequestFailures(0);
      setOfflineAssist(false);
      setTeam(response.data.team);
      const neutralFeedback = response.data.completed
        ? response.data.message
        : response.data.rapid_fire_active
          ? "Response locked. Rapid prompt refreshed."
          : response.data.rapid_fire_ready
            ? "Checkpoint complete. Follow final key instructions."
            : "Response locked. Decode your next clue.";
      setFeedback(neutralFeedback);
      setActivityFeed((prev) => [`Submission recorded`, ...prev].slice(0, 10));
      if (response.data.active_pulse) setActivePulse(response.data.active_pulse);
      if (response.data.latest_broadcast) setBroadcast(response.data.latest_broadcast);
      if (response.data.runes_collected !== undefined) setRunesCollected(response.data.runes_collected);
      setRivalChallenge(response.data.rival_challenge ?? null);
      setBossBadge(response.data.boss_checkpoint ?? null);
      setJackpotActive(Boolean(response.data.rapid_jackpot_active));
      setStoryMission(response.data.story_mission ?? storyMission);
      setStoryChapter(response.data.story_chapter ?? storyChapter);
      setFinalKeyState(response.data.final_key_state ?? finalKeyState);
      setFinalKeyBrief(response.data.final_key_brief ?? finalKeyBrief);
      setRapidCategory(response.data.rapid_category_state ?? rapidCategory);
      setMilestoneReward(response.data.milestone_reward ?? null);
      if (response.data.milestone_reward?.badge) {
        setMilestoneBadges((prev) =>
          prev.includes(response.data.milestone_reward.badge) ? prev : [...prev, response.data.milestone_reward.badge]
        );
      }

      if (response.data.boss_checkpoint) {
        audioManager.play("boss");
      }

      if (response.data.fragment_unlocked) {
        audioManager.play("mission_unlock");
        setFragments((prev) => [...prev, response.data.fragment_unlocked]);
        if (response.data.fragment_bonus_points) {
          setActivityFeed((prev) => [`Story fragment bonus +${response.data.fragment_bonus_points}`, ...prev].slice(0, 10));
        }
      }
      if (response.data.rapid_fire_active) {
        setRapidRemaining(response.data.rapid_remaining_seconds ?? rapidDuration);
        setRapidQuestion(response.data.rapid_question ?? null);
        setQuestion(response.data.rapid_question?.question_text ?? "Rapid question complete");
        setNextTarget(null);
      } else {
        const nextClue = response.data.next_room_clue ?? null;
        setQuestion(null);
        setDifficulty(null);
        setRoomCode("");
        setNextTarget(nextClue);
        // Safety sync: if backend response missed clue packet, refresh canonical state.
        if (!nextClue && !response.data.completed) {
          try {
            const resync = await api.post<StartResponse>("/game/start");
            if (resync.data.next_room_clue) setNextTarget(resync.data.next_room_clue);
          } catch {
            // keep current UI state; submit was already recorded.
          }
        }
      }

      setAnswer("");
      if (response.data.completed) {
        audioManager.play("finish");
        navigate("/finish", { replace: true });
      }
    } catch (err: unknown) {
      const { status, message } = parseApiError(err);
      if (status === 410) {
        navigate("/finish", { replace: true });
        return;
      }
      if (status === 401) {
        clearAuth();
        navigate("/login", { replace: true });
        return;
      }
      setFeedback(message || "Submit failed");
      setRequestFailures((prev) => {
        const next = prev + 1;
        if (next >= 3) setOfflineAssist(true);
        return next;
      });
    } finally {
      setActionBusy(null);
    }
  };

  const onRapidCategory = async (category: "web" | "database" | "networking") => {
    if (tutorialOpen) return;
    if (actionBusy) return;
    setActionBusy("rapid");
    try {
      const response = await api.post("/game/rapid-category", { category });
      audioManager.play("terminal_blip");
      setRapidCategory(response.data.rapid_category_state ?? rapidCategory);
      setFeedback(`Rapid category selected: ${category.toUpperCase()}`);
      setActivityFeed((prev) => [`Rapid category selected: ${category}`, ...prev].slice(0, 10));
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      setFeedback(message || "Rapid category selection failed");
    } finally {
      setActionBusy(null);
    }
  };

  const onHint = async () => {
    if (tutorialOpen) return;
    if (actionBusy) return;
    setActionBusy("hint");
    try {
      const response = await api.post("/game/hint");
      audioManager.play("hint_used");
      setTeam(response.data.team);
      setHintMessage(response.data.hint);
      if (typeof response.data.hint_credits_remaining === "number") {
        setHintCredits(response.data.hint_credits_remaining);
      }
      setActivePulse(response.data.active_pulse ?? activePulse);
      setActivityFeed((prev) => [`Hint requested`, ...prev].slice(0, 10));
    } catch (err: unknown) {
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (err as { response: { data: { error: string } } }).response.data.error
          : "Hint failed";
      setHintMessage(message);
    } finally {
      setActionBusy(null);
    }
  };

  const onAbility = async (ability: "shield" | "pulse") => {
    if (tutorialOpen) return;
    if (actionBusy) return;
    setActionBusy("ability");
    try {
      const response = await api.post("/game/ability", { ability });
      setTeam(response.data.team);
      setFeedback(response.data.message);
      if (response.data.next_room_clue) {
        setNextTarget(response.data.next_room_clue);
      }
      if (ability === "pulse") {
        setHintMessage(response.data.message);
      }
      setActivityFeed((prev) => [`Ability used: ${ability}`, ...prev].slice(0, 10));
      if (ability === "pulse") audioManager.play("hint_used");
    } catch (err: unknown) {
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (err as { response: { data: { error: string } } }).response.data.error
          : "Ability failed";
      setFeedback(message);
    } finally {
      setActionBusy(null);
    }
  };

  const progress = useMemo(() => {
    const total = gameplayMeta?.total_steps ?? 10;
    const current = team?.current_order ?? 0;
    return Math.min(100, Math.max(0, (current / Math.max(1, total)) * 100));
  }, [gameplayMeta?.total_steps, team?.current_order]);
  const threatLevel = useMemo(() => {
    const score = (team?.trap_hits ?? 0) * 12 + Math.min(30, Math.floor((team?.penalty_seconds ?? 0) / 20));
    return Math.min(100, score);
  }, [team?.trap_hits, team?.penalty_seconds]);
  const collectedFragments = storyMission?.collected_fragments ?? 0;
  const currentArc = useMemo(
    () =>
      STORY_ARCS.find((arc) => collectedFragments >= arc.range[0] && collectedFragments <= arc.range[1]) ??
      STORY_ARCS[0],
    [collectedFragments]
  );
  const transmissions = [
    "NEXUS: Route memory unstable. Validate each clue before movement.",
    "AMIPHORIA: Architect heuristic shifted. Keep your answer inputs clean.",
    "NEXUS: Rival teams detected nearby. Maintain objective discipline.",
    "AMIPHORIA: Firewall pressure rising. Fragments now critical."
  ];
  const missionChecklist = [
    { label: "First fragment recovered", done: (storyMission?.collected_fragments ?? 0) >= 1 },
    { label: "Rapid unlock threshold reached", done: Boolean(storyMission?.rapid_unlock_ready) },
    { label: "Nexus key shard scanned", done: Boolean(finalKeyState?.nexus_scanned) },
    { label: "Amiphoria key shard scanned", done: Boolean(finalKeyState?.amiphoria_scanned) },
    { label: "Dual key gate confirmed", done: Boolean(finalKeyState?.dual_key_ready) }
  ];

  return (
    <main className={`${simpleMode ? "" : "game-stage"} mx-auto w-full max-w-6xl px-3 py-4 md:px-4 md:py-6`}>
      {!simpleMode && <div className="game-grid-overlay" />}
      {!simpleMode && <div className="game-scanline-overlay" />}

      <div className="hud-panel fade-rise mb-3 rounded-3xl border border-cyan-200/20 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-indigo-500/10 p-4">
        <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-200">Nexus Protocol // Scan to Survive</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold md:text-3xl">{getTeamName() ?? "Team"}</h1>
          <p className="rounded-full border border-white/20 px-3 py-1 text-xs text-slate-200">
            Phase: {team?.phase ?? "-"} | Points: {team?.points ?? 0} | Runes: {runesCollected}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={`rounded-full border px-2 py-1 ${
              serverHealth.online ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-100" : "border-rose-300/40 bg-rose-500/10 text-rose-100"
            }`}
          >
            Link: {serverHealth.online ? "Stable" : "Unstable"}
          </span>
          <span
            className={`rounded-full border px-2 py-1 ${
              serverHealth.paused ? "border-amber-300/40 bg-amber-500/10 text-amber-100" : "border-cyan-300/40 bg-cyan-500/10 text-cyan-100"
            }`}
          >
            Event: {serverHealth.paused ? "Paused" : "Live"}
          </span>
          {serverHealth.checkedAt && (
            <span className="rounded-full border border-white/15 bg-black/20 px-2 py-1 text-slate-300">
              Sync {new Date(serverHealth.checkedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-amber-100">
          Device rule: multi-device session enabled. You can continue on another device without forced re-login.
        </p>
      </div>

      {broadcast && (
        <div className={`mb-3 rounded-2xl border p-3 text-sm ${broadcast.level === "critical" ? "border-rose-300/40 bg-rose-500/10 text-rose-100" : broadcast.level === "warning" ? "border-amber-300/40 bg-amber-500/10 text-amber-100" : "border-cyan-300/40 bg-cyan-500/10 text-cyan-100"}`}>
          Control Broadcast: {broadcast.message}
        </div>
      )}

      {tutorialOpen && (
        <section className="mb-4">
          <article className="glass-card rounded-3xl border border-fuchsia-300/35 bg-fuchsia-500/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.25em] text-fuchsia-100">Mandatory 60s Mission Tutorial</p>
              <p className="text-xs text-fuchsia-100">Timer: {tutorialSeconds}s</p>
            </div>
            <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-100">
              {tutorialStep === 1 && "Step 1: Runner scans room QR. Navigator waits for challenge to appear here."}
              {tutorialStep === 2 && "Step 2: Navigator submits answer, then both decode the clue to infer the next room number."}
              {tutorialStep === 3 && "Step 3: After progression, scan NEXUS key + AMIPHORIA key, then FIRE QR to start rapid-fire in-app."}
              {tutorialStep === 4 && "Step 4: Multi-device is allowed, but avoid duplicate scans and maintain role discipline under timer pressure."}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                className="ghost-btn text-xs"
                onClick={() => setTutorialStep((prev) => Math.min(4, prev + 1))}
                disabled={tutorialStep >= 4}
              >
                Next Step
              </button>
              <button
                className="apple-btn text-xs"
                onClick={() => {
                  if (tutorialStep < 4 || tutorialSeconds > 0) return;
                  localStorage.setItem("scan_tutorial_v3_done", "1");
                  setTutorialOpen(false);
                  setFeedback("Tutorial complete. Mission controls unlocked.");
                  void bootstrapSession();
                }}
              >
                {tutorialStep < 4 || tutorialSeconds > 0 ? "Complete all steps first" : "Start Mission"}
              </button>
            </div>
          </article>
        </section>
      )}

      {!simpleMode && (
        <section className="mb-3 grid gap-3 lg:grid-cols-2">
          <article className="operator-card rounded-3xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">NEXUS-7 // Route AI</p>
                <p className="text-sm text-slate-200">Decoding stream online. Trust signal integrity over speed.</p>
              </div>
              <div className="avatar-core avatar-core-cyan" />
            </div>
          </article>
          <article className="operator-card rounded-3xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-emerald-200">AMIPHORIA-OS // Field Guide</p>
                <p className="text-sm text-slate-200">Cross-check clue layers before moving to the next checkpoint.</p>
              </div>
              <div className="avatar-core avatar-core-emerald" />
            </div>
          </article>
        </section>
      )}

      {!simpleMode && (
      <section className="mb-4">
        <article className="hud-panel glass-card rounded-3xl p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Narrative Progression</p>
          <div className="mt-2 grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-cyan-300/25 bg-cyan-500/10 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-200">Current Arc</p>
              <p className="mt-1 text-lg font-semibold">{currentArc.title}</p>
            </div>
            <div className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-3 lg:col-span-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200">What Is At Stake</p>
              <p className="mt-1 text-sm text-slate-100">{currentArc.stake}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-cyan-300/20 bg-black/20 p-3 text-sm text-cyan-100">{currentArc.nexus_line}</div>
            <div className="rounded-2xl border border-emerald-300/20 bg-black/20 p-3 text-sm text-emerald-100">{currentArc.amiphoria_line}</div>
          </div>
        </article>
      </section>
      )}

      {!simpleMode && (
      <section className="mb-4">
        <article className="hud-panel glass-card rounded-3xl p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-violet-200">Duo Protocol (2 Players)</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-violet-300/30 bg-violet-500/10 p-3 text-sm">
              <p className="font-semibold text-violet-100">Player-1 Navigator</p>
              <p className="mt-1 text-slate-200">Reads question, submits answer, decodes clue layers, selects rapid category.</p>
            </div>
            <div className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 p-3 text-sm">
              <p className="font-semibold text-cyan-100">Player-2 Runner</p>
              <p className="mt-1 text-slate-200">Handles movement, scans room/final key QRs, confirms room before commit.</p>
            </div>
          </div>
        </article>
      </section>
      )}

      {!simpleMode && (
      <section className="mb-4 grid gap-3 lg:grid-cols-3">
        <article className="hud-panel glass-card rounded-3xl p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-rose-200">Threat Meter</p>
          <div className="mt-2 h-3 rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all ${threatLevel > 70 ? "bg-gradient-to-r from-rose-400 to-red-600" : threatLevel > 35 ? "bg-gradient-to-r from-amber-300 to-orange-500" : "bg-gradient-to-r from-emerald-300 to-cyan-400"}`}
              style={{ width: `${threatLevel}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-300">Trap pressure: {threatLevel}%</p>
        </article>
        <article className="hud-panel glass-card rounded-3xl p-4 lg:col-span-2">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Live Transmission</p>
          <p className="terminal-line mt-2 text-sm text-cyan-100">{transmissions[transmissionIndex]}</p>
        </article>
      </section>
      )}

      {!simpleMode && (
      <section className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="glass-card rounded-2xl p-3">
          <p className="text-xs text-slate-300">Global Pulse</p>
          <p className="mt-1 text-base font-semibold">{activePulse?.label ?? "Syncing..."}</p>
        </div>
        <div className="glass-card rounded-2xl p-3">
          <p className="text-xs text-slate-300">Rival Challenge</p>
          <p className="mt-1 text-sm">{rivalChallenge ? `${rivalChallenge.rival_team_name} (${rivalChallenge.rival_points})` : "Pending rival lock"}</p>
        </div>
        <div className="glass-card rounded-2xl p-3">
          <p className="text-xs text-slate-300">Checkpoint</p>
          <p className="mt-1 text-sm">{bossBadge ?? "No boss bonus yet"}</p>
        </div>
        <div className="glass-card rounded-2xl p-3">
          <p className="text-xs text-slate-300">Story Chapter</p>
          <p className="mt-1 text-sm">{storyChapter ?? "Act I: Broken Vault"}</p>
        </div>
      </section>
      )}

      <section className="mb-3 grid gap-2 md:grid-cols-4">
        <button
          className="ghost-btn text-xs"
          onClick={() => {
            audioManager.play("click_soft");
            setSimpleMode((v) => !v);
          }}
        >
          {simpleMode ? "Enable Full HUD" : "Performance Mode"}
        </button>
        <button
          className="ghost-btn text-xs"
          onClick={() => {
            setSimpleMode(true);
            setFeedback("Low-end mode enabled");
          }}
        >
          Low-End Device Mode
        </button>
        <button
          className="ghost-btn text-xs"
          onClick={() => {
            audioManager.toggleMuted();
            setFeedback(audioManager.isMuted() ? "Sound muted" : "Sound enabled");
          }}
        >
          {audioManager.isMuted() ? "Enable Sound" : "Mute Sound"}
        </button>
      </section>

      <section className="mb-3">
        <article className="glass-card rounded-2xl border border-amber-300/30 bg-amber-500/10 p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-amber-100">{t.missionFlow}</p>
          <p className="mt-1 text-xs text-slate-100">
            1) Scan room QR  2) Submit technical answer and decode clue room no  3) Scan NEXUS key QR  4) Scan AMIPHORIA key QR  5) Scan FIRE QR (rapid gate) to start rapid-fire inside this app.
          </p>
        </article>
      </section>

      {routeBriefing && routeBriefing.checkpoint_count > 0 && (
        <section className="mb-3">
          <article className="glass-card rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-100">Storyline Route Review</p>
            <p className="mt-1 text-xs text-slate-100">
              Assigned path: {routeBriefing.path_name ?? "Unassigned"} | Checkpoints: {routeBriefing.checkpoint_count}
            </p>
            <p className="mt-1 text-xs text-slate-200">
              Floors covered: {routeBriefing.floor_span.length > 0 ? routeBriefing.floor_span.join(", ") : "TBD"}
            </p>
            <p className="mt-1 text-xs text-amber-200">{routeBriefing.note}</p>
          </article>
        </section>
      )}

      {offlineAssist && (
        <section className="mb-3">
          <article className="glass-card rounded-2xl border border-rose-300/40 bg-rose-500/10 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-rose-100">{t.offline}</p>
            <p className="mt-1 text-xs text-slate-100">{t.offlineBody}</p>
            <input
              value={manualCheckpoint}
              onChange={(e) => setManualCheckpoint(e.target.value)}
              placeholder="Manual checkpoint note"
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-xs"
            />
          </article>
        </section>
      )}

      {milestoneReward && (
        <section className="mb-3">
          <article className="glass-card rounded-2xl border border-emerald-300/40 bg-emerald-500/15 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-100">Milestone Unlocked</p>
            <p className="mt-1 text-sm text-emerald-100">
              {milestoneReward.title} (+{milestoneReward.points} pts) - {milestoneReward.badge}
            </p>
          </article>
        </section>
      )}

      <div className="fade-rise mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Live Status</p>
          <p className="text-sm text-slate-200">{feedback ?? "Awaiting action..."}</p>
        </div>
        <button
          className="ghost-btn"
          onClick={() => {
            localStorage.removeItem(cacheKey);
            clearAuth();
            navigate("/login");
          }}
        >
          Logout
        </button>
      </div>

      <section className="mb-4 grid gap-3 lg:grid-cols-3">
        <div className="glass-card hud-panel rounded-3xl p-4 lg:col-span-2">
          <Countdown startTimeIso={team?.start_time ?? null} durationSeconds={gameDuration} onExpire={() => navigate("/finish")} />
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-slate-300">
              <span>Quest Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
        <div className="glass-card hud-panel rounded-3xl p-4">
          <p className="text-xs text-slate-300">Next Route Clue</p>
          <p className="mt-1 text-lg font-semibold text-cyan-100">
            {nextTarget ? nextTarget.title : "Current challenge active"}
          </p>
          {nextTarget && (
            <>
              <p className="mt-1 text-xs uppercase text-cyan-200">{nextTarget.clue_style}</p>
              {nextTarget.layer_one && <p className="mt-1 text-xs text-amber-200">Layer 1: {nextTarget.layer_one}</p>}
              {nextTarget.layer_two && <p className="mt-1 text-xs text-cyan-200">Layer 2: {nextTarget.layer_two}</p>}
              <p className="mt-1 text-xs text-slate-200">{nextTarget.clue_text}</p>
              {nextTarget.unlock_token && <p className="mt-1 text-[10px] text-slate-500">Unlock token: {nextTarget.unlock_token}</p>}
            </>
          )}
          {!nextTarget && team?.status === "active" && team?.phase === "main" && (
            <button
              className="ghost-btn mt-2 text-xs"
              onClick={async () => {
                try {
                  const resync = await api.post<StartResponse>("/game/start");
                  if (resync.data.next_room_clue) {
                    setNextTarget(resync.data.next_room_clue);
                    setFeedback("Clue packet synced.");
                  } else {
                    setFeedback("Clue packet not available yet. Complete current checkpoint.");
                  }
                } catch {
                  setFeedback("Clue sync failed. Retry in a moment.");
                }
              }}
              disabled={tutorialOpen}
            >
              Sync Clue Packet
            </button>
          )}
          <div className="my-3 h-px bg-white/10" />
          <p className="text-xs text-slate-300">Stats</p>
          <p className="mt-1 text-sm">Hints: {team?.hints_used ?? 0}</p>
          <p className="text-sm">Hint Credits: {hintCredits}</p>
          <p className="text-sm">Traps: {team?.trap_hits ?? 0}</p>
          <p className="text-sm">Penalty: {team?.penalty_seconds ?? 0}s</p>
          <p className="text-sm">Combo: x{Math.max(1, 1 + Math.min(0.5, (team?.combo_streak ?? 0) * 0.1)).toFixed(1)}</p>
          <p className="text-sm">Shield: {team?.shield_charges ?? 0} {team?.shield_active ? "(armed)" : ""}</p>
          <p className="text-sm">Pulse: {team?.pulse_charges ?? 0}</p>
          {storyMission && (
            <>
              <p className="mt-2 text-sm">
                Fragments: {storyMission.collected_fragments}/{storyMission.required_fragments_for_rapid}
              </p>
              <p className={`text-xs ${storyMission.rapid_unlock_ready ? "text-emerald-300" : "text-amber-300"}`}>
                {storyMission.rapid_unlock_ready
                  ? "Rapid-fire vault condition met"
                  : `Next target fragment: ${storyMission.next_fragment_title ?? "Unknown"}`}
              </p>
              {storyMission.next_artifact && !storyMission.rapid_unlock_ready && (
                <p className="text-xs text-slate-300">Artifact to recover: {storyMission.next_artifact}</p>
              )}
            </>
          )}
          {team?.phase === "rapid_fire" && <p className="mt-2 text-sm text-amber-300">Rapid timer: {rapidRemaining}s {jackpotActive ? "(Jackpot x2)" : ""}</p>}
          {rapidQuestion && <p className="mt-1 text-xs text-slate-300">Rapid Q {rapidQuestion.order}/{rapidQuestion.total}</p>}
          {finalKeyState?.gate_ready && team?.phase === "main" && (
            <>
              <div className="my-3 h-px bg-white/10" />
              <p className="text-xs text-slate-300">Final Key Gate</p>
              <p className="text-xs text-slate-200">Nexus: {finalKeyState.nexus_scanned ? "Scanned" : "Pending"}</p>
              <p className="text-xs text-slate-200">Amiphoria: {finalKeyState.amiphoria_scanned ? "Scanned" : "Pending"}</p>
              <p className="text-xs text-slate-200">Fire QR (Rapid Gate): {finalKeyState.rapid_qr_code_hint}</p>
              {finalKeyBrief && (
                <div className="mt-2 space-y-1 rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-2">
                  <p className="text-[10px] text-cyan-100">Nexus clue: {finalKeyBrief.nexus.clue}</p>
                  <p className="text-[10px] text-cyan-100">Amiphoria clue: {finalKeyBrief.amiphoria.clue}</p>
                  <p className="text-[10px] text-cyan-100">Rapid gate clue: {finalKeyBrief.rapid_gate.clue}</p>
                </div>
              )}
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(rapidCategory?.options ?? ["web", "database", "networking"]).map((cat) => (
                  <button
                    key={cat}
                    className={`rounded-full px-2 py-1 text-[10px] ${rapidCategory?.selected === cat ? "bg-cyan-500 text-black" : "bg-white/10"}`}
                    onClick={() => onRapidCategory(cat)}
                    disabled={actionBusy !== null || tutorialOpen}
                  >
                    {cat.toUpperCase()}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="mb-4 grid gap-3 lg:grid-cols-3">
        <article className="glass-card hud-panel cinematic-sweep rounded-3xl p-4">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button className={scanEnabled ? "ghost-btn" : "apple-btn"} onClick={() => { audioManager.play("ui_toggle"); setScanEnabled((v) => !v); }} disabled={team?.phase === "rapid_fire" || tutorialOpen}>
              {scanEnabled ? t.stopCamera : t.startCamera}
            </button>
            <button className="ghost-btn" onClick={onHint} disabled={actionBusy !== null || tutorialOpen}>Use Hint</button>
            <button className="ghost-btn" onClick={() => onAbility("shield")} disabled={(team?.shield_charges ?? 0) <= 0 || !!team?.shield_active || actionBusy !== null || tutorialOpen}>Arm Shield</button>
            <button className="ghost-btn" onClick={() => onAbility("pulse")} disabled={(team?.pulse_charges ?? 0) <= 0 || actionBusy !== null || tutorialOpen}>Use Pulse</button>
          </div>
          <ScannerPanel onDetected={onScan} enabled={scanEnabled && team?.phase !== "rapid_fire" && !tutorialOpen} />
        </article>

        <article className="glass-card hud-panel hero-glow rounded-3xl p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Challenge</p>
            <div className="flex gap-2">
              {difficulty && <span className="rounded-full bg-white/20 px-3 py-1 text-xs">Difficulty {difficulty}</span>}
              {clueStyle && <span className="rounded-full bg-blue-500/30 px-3 py-1 text-xs uppercase">{clueStyle}</span>}
            </div>
          </div>
          <p className="min-h-20 text-sm text-slate-100">
            {question ??
              (team?.phase === "rapid_fire"
                ? "Rapid-fire will appear here."
                : "Scan a room QR, solve the technical puzzle, decode the clue packet, and hunt your next room.")}
          </p>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={team?.phase === "rapid_fire" ? "Rapid answer" : "Type answer"}
            className="mt-3 w-full rounded-2xl border border-white/15 bg-black/25 px-3 py-3"
          />
          <button className="apple-btn mt-3 w-full py-3" onClick={onSubmit} disabled={actionBusy !== null || tutorialOpen}>
            {actionBusy === "submit" ? "Submitting..." : "Submit"}
          </button>
          {hintMessage && <p className="mt-2 text-sm text-amber-300">{hintMessage}</p>}
          {feedback && <p className="mt-2 text-sm text-cyan-200">{feedback}</p>}
        </article>
      </section>

      {!simpleMode && (
      <section className="grid gap-3 lg:grid-cols-2">
        <article className="glass-card hud-panel rounded-3xl p-4">
          <p className="mb-2 text-xs uppercase tracking-[0.25em] text-slate-300">Story Fragments Collected</p>
          {fragments.length === 0 ? (
            <p className="text-sm text-slate-300">Solve puzzles to reveal fragments of the fractured vault story.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {fragments.map((fragment, index) => (
                <div key={`${fragment}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">{fragment}</div>
              ))}
            </div>
          )}
        </article>

        <article className="glass-card hud-panel rounded-3xl p-4">
          <p className="mb-2 text-xs uppercase tracking-[0.25em] text-slate-300">Mission Feed</p>
          {activityFeed.length === 0 ? (
            <p className="text-sm text-slate-300">No events yet.</p>
          ) : (
            <div className="space-y-2">
              {activityFeed.map((item, idx) => (
                <div key={`${item}-${idx}`} className="rounded-2xl border border-white/10 bg-black/20 p-2 text-sm">{item}</div>
              ))}
            </div>
          )}
        </article>
      </section>
      )}

      {milestoneBadges.length > 0 && (
        <section className="mb-4">
          <article className="glass-card rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-100">Relic Gallery</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {milestoneBadges.map((badge) => (
                <span key={badge} className="rounded-full border border-cyan-300/40 bg-black/20 px-3 py-1 text-[10px] text-cyan-100">
                  {badge}
                </span>
              ))}
            </div>
          </article>
        </section>
      )}

      {!simpleMode && (
      <section className="mb-4">
        <article className="glass-card hud-panel rounded-3xl p-4">
          <p className="mb-2 text-xs uppercase tracking-[0.25em] text-emerald-200">Mission Checklist</p>
          <div className="grid gap-2 md:grid-cols-2">
            {missionChecklist.map((item) => (
              <div
                key={item.label}
                className={`rounded-xl border p-2 text-sm ${item.done ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-100" : "border-white/10 bg-black/20 text-slate-300"}`}
              >
                {item.done ? "COMPLETE" : "PENDING"} - {item.label}
              </div>
            ))}
          </div>
        </article>
      </section>
      )}
    </main>
  );
}

