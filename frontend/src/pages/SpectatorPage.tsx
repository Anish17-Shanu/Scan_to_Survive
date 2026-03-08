import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";

type SpectatorPayload = {
  event: {
    id: string;
    total_teams: number;
    game_duration: number;
    is_paused?: boolean;
    pause_reason?: string | null;
    active_pulse?: { id: string; label: string };
  };
  live_leaderboard: Array<{
    rank: number;
    team_id: string;
    team_name: string;
    status: string;
    points: number;
    phase: string;
    current_order: number;
  }>;
  room_occupancy: Array<{ room_number: string; count: number }>;
  path_distribution: Array<{ path_name: string; assigned: number; max_capacity: number }>;
  latest_broadcast?: { message: string; level: string; timestamp: string } | null;
};

type RehearsalMember = {
  player_id: string;
  role: "Navigator" | "Runner";
};

type RehearsalTeam = {
  team_id: string;
  team_name: string;
  members: RehearsalMember[];
  points: number;
  phase: "main" | "final_keys" | "rapid_fire" | "completed";
  current_order: number;
  current_room: string;
  rapid_fire_score: number;
  recent_action: string;
};

const PHASE_ACTIONS = {
  main: ["scanned room", "submitted answer", "decoded clue", "moved to next room"],
  final_keys: ["scanned Key Shard A", "scanned Key Shard B", "validated dual-key gate", "scanned FIRE QR"],
  rapid_fire: ["answered rapid question", "combo streak +1", "precision answer", "jackpot window active"],
  completed: ["mission complete", "final score locked", "awaiting podium reveal", "debrief packet generated"]
} as const;

function buildRehearsalTeams(): RehearsalTeam[] {
  return Array.from({ length: 6 }).map((_, idx) => {
    const id = idx + 1;
    return {
      team_id: `RH-${String(id).padStart(2, "0")}`,
      team_name: `Rehearsal-${id}`,
      members: [
        { player_id: `RH${id}-NAV`, role: "Navigator" },
        { player_id: `RH${id}-RUN`, role: "Runner" }
      ],
      points: 80 + idx * 12,
      phase: "main",
      current_order: 1,
      current_room: `${4 + (idx % 2)}${String(1 + idx).padStart(2, "0")}`,
      rapid_fire_score: 0,
      recent_action: "spawned in entry corridor"
    };
  });
}

function tickRehearsal(teams: RehearsalTeam[]): RehearsalTeam[] {
  return teams.map((team, idx) => {
    const next = { ...team };
    if (next.phase === "completed") return next;

    if (next.phase === "main") {
      next.current_order = Math.min(8, next.current_order + 1);
      next.points += 10 + (idx % 3);
      next.current_room = `${4 + ((next.current_order + idx) % 2)}${String((next.current_order % 9) + 1).padStart(2, "0")}`;
      next.recent_action = PHASE_ACTIONS.main[(next.current_order + idx) % PHASE_ACTIONS.main.length];
      if (next.current_order >= 8) next.phase = "final_keys";
      return next;
    }

    if (next.phase === "final_keys") {
      next.points += 14;
      next.recent_action = PHASE_ACTIONS.final_keys[(next.points + idx) % PHASE_ACTIONS.final_keys.length];
      if (next.recent_action.includes("FIRE QR")) {
        next.phase = "rapid_fire";
      }
      return next;
    }

    if (next.phase === "rapid_fire") {
      next.rapid_fire_score += 1 + (idx % 2);
      next.points += 18;
      next.recent_action = PHASE_ACTIONS.rapid_fire[(next.rapid_fire_score + idx) % PHASE_ACTIONS.rapid_fire.length];
      if (next.rapid_fire_score >= 6) {
        next.phase = "completed";
        next.recent_action = PHASE_ACTIONS.completed[idx % PHASE_ACTIONS.completed.length];
      }
      return next;
    }

    return next;
  });
}

export function SpectatorPage() {
  const location = useLocation();
  const [payload, setPayload] = useState<SpectatorPayload | null>(null);
  const [rehearsalTeams, setRehearsalTeams] = useState<RehearsalTeam[]>(() => buildRehearsalTeams());
  const rehearsalMode = useMemo(() => {
    const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
    const search = location.search?.startsWith("?") ? location.search.slice(1) : location.search;
    const query = search || hashQuery;
    return new URLSearchParams(query).get("rehearsal") === "1";
  }, [location.search]);

  useEffect(() => {
    if (rehearsalMode) return;
    const load = async () => {
      try {
        const response = await api.get<SpectatorPayload>("/game/spectator");
        setPayload(response.data);
      } catch {
        // keep last payload
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(id);
  }, [rehearsalMode]);

  useEffect(() => {
    if (!rehearsalMode) return;
    const id = window.setInterval(() => {
      setRehearsalTeams((prev) => tickRehearsal(prev));
    }, 2200);
    return () => window.clearInterval(id);
  }, [rehearsalMode]);

  const rehearsalBoard = useMemo(
    () =>
      rehearsalTeams
        .slice()
        .sort((a, b) => b.points - a.points)
        .map((t, idx) => ({ ...t, rank: idx + 1 })),
    [rehearsalTeams]
  );

  return (
    <main className="finish-stage mx-auto min-h-screen w-full px-5 py-6">
      <section className="finish-shell mx-auto w-full max-w-7xl rounded-[2rem] p-6">
        <p className="finish-kicker">Scan to Survive // Spectator Feed</p>
        <h1 className="finish-title mt-2">{rehearsalMode ? "Rehearsal Execution Theater" : "Live Arena Map"}</h1>
        {rehearsalMode ? (
          <p className="mt-2 text-sm text-amber-200">
            Simulated full run is active: room flow, dual-key gate, FIRE QR trigger, rapid-fire completion.
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-300">
            Pulse: {payload?.event.active_pulse?.label ?? "Syncing"} | Teams: {payload?.event.total_teams ?? "-"}
          </p>
        )}
        {!rehearsalMode && payload?.latest_broadcast?.message && (
          <p className="mt-2 rounded-xl border border-cyan-300/30 bg-cyan-500/10 p-2 text-sm text-cyan-100">
            Broadcast: {payload.latest_broadcast.message}
          </p>
        )}

        {rehearsalMode ? (
          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <article className="podium-card rounded-3xl p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Rehearsal Leaderboard</p>
              <div className="mt-2 space-y-2 text-sm">
                {rehearsalBoard.map((team) => (
                  <div key={team.team_id} className="rounded-xl border border-white/10 bg-black/20 p-2">
                    #{team.rank} {team.team_name} | {team.team_id} | {team.phase} | Points {team.points}
                  </div>
                ))}
              </div>
            </article>

            <article className="podium-card rounded-3xl p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-amber-200">Execution Stream</p>
              <div className="mt-2 space-y-2 text-xs">
                {rehearsalBoard.map((team) => (
                  <div key={`${team.team_id}-stream`} className="rounded-xl border border-white/10 bg-black/20 p-2">
                    <p className="font-semibold text-cyan-100">
                      {team.team_name} [{team.team_id}] | Room {team.current_room} | Order {team.current_order}
                    </p>
                    <p className="mt-1 text-slate-200">
                      Members: {team.members[0].player_id} ({team.members[0].role}), {team.members[1].player_id} ({team.members[1].role})
                    </p>
                    <p className="mt-1 text-amber-100">Last action: {team.recent_action}</p>
                    <p className="mt-1 text-slate-300">Rapid score: {team.rapid_fire_score}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : (
          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <article className="podium-card rounded-3xl p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Top Teams</p>
              <div className="mt-2 space-y-2 text-sm">
                {(payload?.live_leaderboard ?? []).map((row) => (
                  <div key={`${row.rank}-${row.team_id}`} className="rounded-xl border border-white/10 bg-black/20 p-2">
                    #{row.rank} {row.team_name} | {row.team_id} | {row.phase} | Points {row.points}
                  </div>
                ))}
              </div>
            </article>

            <article className="podium-card rounded-3xl p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-amber-200">Room Heat</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                {(payload?.room_occupancy ?? []).slice(0, 30).map((room) => (
                  <div key={room.room_number} className="rounded-lg border border-white/10 bg-black/20 p-2 text-center">
                    <p>{room.room_number}</p>
                    <p>{room.count}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        )}
      </section>
    </main>
  );
}

