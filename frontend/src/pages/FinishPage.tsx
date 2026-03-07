import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { clearAuth, getTeamName } from "../lib/auth";
import { api } from "../lib/api";
import { useBlockBackNavigation } from "../hooks/useBlockBackNavigation";

type Row = {
  rank: number;
  team_name: string;
  total_time_seconds: number | null;
  points: number;
  hints_used: number;
  trap_hits: number;
};

type LeaderboardPayload = {
  server_time?: string;
  visible: boolean;
  finale_mode?: boolean;
  finale_sequence_mode?: boolean;
  finale_sequence_started_at?: string | null;
  finale_revealed_at?: string | null;
  top_three?: Row[];
  winner_rewards?: Array<{
    rank: number;
    team_name: string;
    title: string;
    reward: string;
    aura: string;
    achievement_code: string;
  }>;
  team_debrief?: {
    team_name: string;
    status?: string;
    codename: string;
    rank: number | null;
    summary_line: string;
    critical_moment: string;
    mission_stats: {
      points: number;
      total_time_seconds: number | null;
      hints_used: number;
      trap_hits: number;
      penalty_seconds: number;
      fragments_collected: number;
      rapid_fire_score: number;
    };
    badges: string[];
    timeline_highlights: Array<{ label: string; at: string }>;
  };
  rows: Row[];
};

export function FinishPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [visible, setVisible] = useState(false);
  const [finaleMode, setFinaleMode] = useState(false);
  const [finaleSequenceMode, setFinaleSequenceMode] = useState(false);
  const [finaleSequenceStartedAt, setFinaleSequenceStartedAt] = useState<string | null>(null);
  const [finaleTopThree, setFinaleTopThree] = useState<Row[]>([]);
  const [winnerRewards, setWinnerRewards] = useState<LeaderboardPayload["winner_rewards"]>([]);
  const [teamDebrief, setTeamDebrief] = useState<LeaderboardPayload["team_debrief"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [clockTick, setClockTick] = useState(Date.now());
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const teamName = getTeamName() ?? "Team";
  useBlockBackNavigation({
    onBlocked: () => setNotice("Back is disabled on finish screen. Use Back to Login button.")
  });

  const loadLeaderboard = async () => {
    try {
      const response = await api.get<LeaderboardPayload>("/game/leaderboard");
      if (response.data.server_time) {
        const serverNow = new Date(response.data.server_time).getTime();
        if (!Number.isNaN(serverNow)) {
          setServerOffsetMs(Date.now() - serverNow);
        }
      }
      setVisible(response.data.visible);
      setFinaleMode(Boolean(response.data.finale_mode));
      setFinaleSequenceMode(Boolean(response.data.finale_sequence_mode));
      setFinaleSequenceStartedAt(response.data.finale_sequence_started_at ?? null);
      setFinaleTopThree(response.data.top_three ?? []);
      setWinnerRewards(response.data.winner_rewards ?? []);
      setTeamDebrief(response.data.team_debrief ?? null);
      setRows(response.data.rows ?? []);
    } catch {
      setVisible(false);
      setFinaleMode(false);
      setFinaleSequenceMode(false);
      setFinaleSequenceStartedAt(null);
      setFinaleTopThree([]);
      setWinnerRewards([]);
      setTeamDebrief(null);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLeaderboard();
    const interval = window.setInterval(() => {
      void loadLeaderboard();
    }, 3000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!finaleSequenceMode || !finaleSequenceStartedAt) return;
    const timer = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [finaleSequenceMode, finaleSequenceStartedAt]);

  const topThree = useMemo(() => rows.slice(0, 3), [rows]);
  const myReward = useMemo(() => {
    if (!winnerRewards || winnerRewards.length === 0) return null;
    return winnerRewards.find((row) => row.team_name.trim().toLowerCase() === teamName.trim().toLowerCase()) ?? null;
  }, [winnerRewards, teamName]);
  const myRow = useMemo(
    () => rows.find((row) => row.team_name.trim().toLowerCase() === teamName.trim().toLowerCase()) ?? null,
    [rows, teamName]
  );

  const sequenceElapsedSeconds = useMemo(() => {
    if (!finaleSequenceMode || !finaleSequenceStartedAt) return 0;
    const serverAlignedNow = clockTick - serverOffsetMs;
    const elapsed = Math.floor((serverAlignedNow - new Date(finaleSequenceStartedAt).getTime()) / 1000);
    return Math.max(0, elapsed);
  }, [clockTick, finaleSequenceMode, finaleSequenceStartedAt, serverOffsetMs]);

  const sequencePhase = useMemo(() => {
    if (!finaleSequenceMode || !finaleSequenceStartedAt || !visible || !finaleMode) return "done";
    if (sequenceElapsedSeconds < 4) return "rank3";
    if (sequenceElapsedSeconds < 8) return "rank2";
    if (sequenceElapsedSeconds < 12) return "rank1";
    return "done";
  }, [finaleMode, finaleSequenceMode, finaleSequenceStartedAt, sequenceElapsedSeconds, visible]);

  const showSequenceSpotlight = sequencePhase !== "done" && finaleTopThree.length >= 3;
  const spotlightRow =
    sequencePhase === "rank3"
      ? finaleTopThree.find((r) => r.rank === 3) ?? null
      : sequencePhase === "rank2"
        ? finaleTopThree.find((r) => r.rank === 2) ?? null
        : sequencePhase === "rank1"
          ? finaleTopThree.find((r) => r.rank === 1) ?? null
          : null;

  const timeText = (seconds: number | null) => {
    if (seconds === null || seconds < 0) return "-";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <main className={`finish-stage mx-auto min-h-screen w-full px-4 py-6 md:px-6 md:py-10 ${finaleMode ? "finale-active" : ""}`}>
      {finaleMode && (
        <>
          <div className="finale-fireworks finale-fireworks-a" />
          <div className="finale-fireworks finale-fireworks-b" />
          <div className="finale-fireworks finale-fireworks-c" />
        </>
      )}
      <section className="finish-shell mx-auto w-full max-w-6xl rounded-[2rem] p-5 md:p-8">
        <div className="finish-grid-layer" />
        <div className="relative z-10">
          <p className="finish-kicker">Amiphoria Nexus // Mission Debrief</p>
          <h1 className="finish-title mt-3">{finaleMode ? "Grand Finale Unlocked" : `Extraction Complete, ${teamName}`}</h1>
          <p className="mt-3 max-w-3xl text-slate-200">
            {finaleMode
              ? "Control room has completed the event. Final champions are now live."
              : "Your run has been sealed into the vault ledger. Final standings unlock when control room reveals the board."}
          </p>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            Whatever your rank, your team crossed a live narrative: city blackout, adaptive vault traps, fractured-key reunion,
            and final override pressure. This was a systems battle, not just a quiz.
          </p>
          {notice && <p className="mt-2 text-sm text-amber-300">{notice}</p>}
        </div>

        <div className="relative z-10 mt-5 grid gap-4 lg:grid-cols-3">
          <article className="finish-card lg:col-span-2">
            <p className="text-xs uppercase tracking-[0.26em] text-cyan-200/80">Outcome Signal</p>
            {!visible ? (
              <div className="mt-3">
                <p className="finish-wait pulse-ring text-lg font-semibold text-cyan-100">
                  {loading ? "Syncing control-room signal..." : "Leaderboard locked. Reveal pending."}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Keep this screen open. Rankings can unlock any moment.
                </p>
                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  <p className="rounded-xl border border-cyan-200/20 bg-cyan-500/10 p-3 text-sm">Pulse timing shaped score swings.</p>
                  <p className="rounded-xl border border-cyan-200/20 bg-cyan-500/10 p-3 text-sm">Hint economy influenced final pace.</p>
                  <p className="rounded-xl border border-cyan-200/20 bg-cyan-500/10 p-3 text-sm">Trap survival affected tie-break margins.</p>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <p className={finaleMode ? "text-fuchsia-200" : "text-emerald-300"}>
                  {finaleMode ? "Event completed. Champions announced." : "Leaderboard is live."}
                </p>
                {showSequenceSpotlight && spotlightRow ? (
                  <div className="mt-4 rounded-2xl border border-amber-300/40 bg-amber-500/10 p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-amber-200">Finale Sequence Live</p>
                    <p className="mt-1 text-xl font-semibold text-amber-100">
                      {sequencePhase === "rank3" ? "3rd Place Revealed" : sequencePhase === "rank2" ? "2nd Place Revealed" : "Champion Revealed"}
                    </p>
                    <p className="mt-2 text-lg">{spotlightRow.team_name}</p>
                    <p className="text-sm text-amber-100">Time {timeText(spotlightRow.total_time_seconds)} | Points {spotlightRow.points}</p>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {(finaleMode ? finaleTopThree : topThree).map((row) => {
                      const reward = (winnerRewards ?? []).find((r) => r.rank === row.rank && r.team_name === row.team_name);
                      return (
                      <div key={`${row.rank}-${row.team_name}`} className="podium-card">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Rank {row.rank}</p>
                        <p className="mt-1 text-lg font-semibold">{row.team_name}</p>
                        {reward && <p className="text-xs text-amber-200">{reward.title}</p>}
                        <p className="mt-2 text-sm text-cyan-100">Time {timeText(row.total_time_seconds)}</p>
                        <p className="text-sm text-cyan-100">Points {row.points}</p>
                      </div>
                    );})}
                  </div>
                )}
              </div>
            )}
          </article>

          <article className="finish-card">
            <p className="text-xs uppercase tracking-[0.26em] text-cyan-200/80">Team Spotlight</p>
            {myRow ? (
              <div className="mt-3 space-y-2 text-sm">
                <p className={`text-xl font-semibold ${finaleMode ? "text-fuchsia-200" : "text-cyan-100"}`}>#{myRow.rank}</p>
                <p>{myRow.team_name}</p>
                <p className="text-slate-300">Time: {timeText(myRow.total_time_seconds)}</p>
                <p className="text-slate-300">Points: {myRow.points}</p>
                <p className="text-slate-300">Hints: {myRow.hints_used}</p>
                <p className="text-slate-300">Traps: {myRow.trap_hits}</p>
                {myReward && (
                  <div className="mt-3 rounded-xl border border-amber-300/40 bg-amber-500/10 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-amber-200">{myReward.title}</p>
                    <p className="mt-1 text-sm text-amber-100">{myReward.reward}</p>
                    <p className="mt-1 text-xs text-amber-200">Achievement: {myReward.achievement_code}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-300">Your final placement will appear after reveal.</p>
            )}
            <button className="ghost-btn mt-4 w-full" onClick={() => void loadLeaderboard()}>
              Refresh Board
            </button>
          </article>
        </div>

        {teamDebrief && (
          <div className="relative z-10 mt-5 rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Mission Debrief Reel</p>
            <p className="mt-1 text-lg font-semibold text-cyan-100">{teamDebrief.codename}</p>
            {teamDebrief.status && <p className="mt-1 text-xs uppercase tracking-[0.2em] text-amber-200">Status: {teamDebrief.status}</p>}
            <p className="mt-1 text-sm text-slate-100">{teamDebrief.summary_line}</p>
            <p className="mt-1 text-sm text-amber-200">Critical moment: {teamDebrief.critical_moment}</p>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <p className="rounded-xl border border-white/10 bg-black/20 p-2 text-xs">Fragments: {teamDebrief.mission_stats.fragments_collected}</p>
              <p className="rounded-xl border border-white/10 bg-black/20 p-2 text-xs">Rapid Score: {teamDebrief.mission_stats.rapid_fire_score}</p>
              <p className="rounded-xl border border-white/10 bg-black/20 p-2 text-xs">Penalty: {teamDebrief.mission_stats.penalty_seconds}s</p>
              <p className="rounded-xl border border-white/10 bg-black/20 p-2 text-xs">Points: {teamDebrief.mission_stats.points}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {teamDebrief.badges.map((badge) => (
                <span key={badge} className="rounded-full border border-emerald-300/40 bg-emerald-500/15 px-3 py-1 text-xs text-emerald-100">{badge}</span>
              ))}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {teamDebrief.timeline_highlights.slice(0, 6).map((item) => (
                <div key={`${item.label}-${item.at}`} className="rounded-xl border border-white/10 bg-black/20 p-2 text-xs">
                  {item.label} - {new Date(item.at).toLocaleTimeString()}
                </div>
              ))}
            </div>
          </div>
        )}

        {visible && rows.length > 0 && !showSequenceSpotlight && (
          <div className="relative z-10 mt-5 overflow-x-auto rounded-2xl border border-cyan-200/20 bg-slate-900/45 p-3">
            <h2 className="mb-2 text-xl font-semibold text-cyan-100">Vault Leaderboard</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-300">
                  <th className="py-2">Rank</th>
                  <th>Team</th>
                  <th>Time</th>
                  <th>Points</th>
                  <th>Hints</th>
                  <th>Traps</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 15).map((row) => {
                  const isMine = row.team_name.trim().toLowerCase() === teamName.trim().toLowerCase();
                  return (
                    <tr key={`${row.rank}-${row.team_name}`} className={`border-t border-white/10 ${isMine ? "bg-cyan-400/10" : ""}`}>
                      <td className="py-2 font-semibold">{row.rank}</td>
                      <td>{row.team_name}</td>
                      <td>{timeText(row.total_time_seconds)}</td>
                      <td>{row.points}</td>
                      <td>{row.hints_used}</td>
                      <td>{row.trap_hits}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <button
          className="apple-btn relative z-10 mt-6"
          onClick={() => {
            clearAuth();
            navigate("/login");
          }}
        >
          Back to Login
        </button>
      </section>
    </main>
  );
}
