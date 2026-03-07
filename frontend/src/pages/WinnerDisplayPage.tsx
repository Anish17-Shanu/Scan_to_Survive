import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { audioManager } from "../lib/audioManager";

type WinnerReward = {
  rank: number;
  team_name: string;
  title: string;
  reward: string;
  aura: string;
  achievement_code: string;
};

type LeaderRow = {
  rank: number;
  team_name: string;
  total_time_seconds: number | null;
  points: number;
};

type Payload = {
  server_time?: string;
  visible: boolean;
  finale_mode?: boolean;
  finale_sequence_mode?: boolean;
  finale_sequence_started_at?: string | null;
  top_three?: LeaderRow[];
  winner_rewards?: WinnerReward[];
};

export function WinnerDisplayPage() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [finaleMode, setFinaleMode] = useState(false);
  const [sequenceMode, setSequenceMode] = useState(false);
  const [sequenceStart, setSequenceStart] = useState<string | null>(null);
  const [topThree, setTopThree] = useState<LeaderRow[]>([]);
  const [rewards, setRewards] = useState<WinnerReward[]>([]);
  const [tick, setTick] = useState(Date.now());
  const [loadFailures, setLoadFailures] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);

  const load = async () => {
    try {
      const response = await api.get<Payload>("/game/winner-display");
      setVisible(response.data.visible);
      setFinaleMode(Boolean(response.data.finale_mode));
      setSequenceMode(Boolean(response.data.finale_sequence_mode));
      setSequenceStart(response.data.finale_sequence_started_at ?? null);
      setTopThree(response.data.top_three ?? []);
      setRewards(response.data.winner_rewards ?? []);
      setLoadFailures(0);
      setWarning(null);
    } catch {
      setLoadFailures((prev) => prev + 1);
      setWarning("Live feed unstable. Retrying...");
    }
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      setTick(Date.now());
      void load();
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (loadFailures < 8) return;
    navigate("/admin", { replace: true });
  }, [loadFailures, navigate]);

  useEffect(() => {
    if (!finaleMode) return;
    audioManager.play("reveal_drum");
  }, [finaleMode]);

  const phase = useMemo(() => {
    if (!sequenceMode || !sequenceStart) return "done";
    const elapsed = Math.max(0, Math.floor((tick - new Date(sequenceStart).getTime()) / 1000));
    if (elapsed < 4) return 3;
    if (elapsed < 8) return 2;
    if (elapsed < 12) return 1;
    return "done";
  }, [sequenceMode, sequenceStart, tick]);

  const spotlight = typeof phase === "number" ? topThree.find((r) => r.rank === phase) ?? null : null;
  const rewardByRank = new Map((rewards ?? []).map((r) => [r.rank, r]));

  return (
    <main className="finish-stage mx-auto min-h-screen w-full px-6 py-8">
      <section className="finish-shell mx-auto w-full max-w-7xl rounded-[2rem] p-8">
        <div className="finish-grid-layer" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <p className="finish-kicker">Scan to Survive // Winner Announcement</p>
            <h1 className="finish-title mt-2">{visible && finaleMode ? "CHAMPIONS LIVE" : "WAITING FOR FINALE REVEAL"}</h1>
          </div>
          <div className="flex gap-2">
            <button className="ghost-btn" onClick={() => document.documentElement.requestFullscreen?.()}>Fullscreen</button>
            <button className="ghost-btn" onClick={() => navigate("/admin")}>Back to Admin</button>
          </div>
        </div>
        {warning && (
          <div className="relative z-10 mt-4 rounded-2xl border border-amber-300/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            {warning}
          </div>
        )}

        {!visible || !finaleMode ? (
          <div className="relative z-10 mt-8 rounded-3xl border border-cyan-300/30 bg-cyan-500/10 p-8 text-center">
            <p className="text-2xl font-semibold text-cyan-100">Control room has not revealed winners yet.</p>
          </div>
        ) : spotlight ? (
          <div className="relative z-10 mt-8 rounded-3xl border border-amber-300/40 bg-amber-500/10 p-8 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-200">Finale Sequence</p>
            <p className="mt-2 text-4xl font-bold text-amber-100">#{spotlight.rank} - {spotlight.team_name}</p>
            {rewardByRank.get(spotlight.rank) && (
              <>
                <p className="mt-2 text-xl text-amber-100">{rewardByRank.get(spotlight.rank)?.title}</p>
                <p className="mt-1 text-sm text-amber-200">{rewardByRank.get(spotlight.rank)?.reward}</p>
              </>
            )}
          </div>
        ) : (
          <div className="relative z-10 mt-8 grid gap-4 lg:grid-cols-3">
            {topThree.map((row) => {
              const reward = rewardByRank.get(row.rank);
              return (
                <article key={`${row.rank}-${row.team_name}`} className="podium-card rounded-3xl p-6 text-center">
                  <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Rank {row.rank}</p>
                  <p className="mt-2 text-3xl font-bold">{row.team_name}</p>
                  {reward && <p className="mt-2 text-sm text-amber-200">{reward.title}</p>}
                  <p className="mt-2 text-sm text-cyan-100">Points: {row.points}</p>
                  {reward && <p className="mt-1 text-xs text-slate-300">{reward.achievement_code}</p>}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
