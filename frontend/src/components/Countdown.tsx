import { useEffect, useMemo, useState } from "react";

type Props = {
  startTimeIso: string | null;
  durationSeconds?: number;
  onExpire?: () => void;
};

export function Countdown({ startTimeIso, durationSeconds = 5400, onExpire }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = useMemo(() => {
    if (!startTimeIso) return durationSeconds;
    const elapsed = Math.floor((now - new Date(startTimeIso).getTime()) / 1000);
    return Math.max(0, durationSeconds - elapsed);
  }, [durationSeconds, now, startTimeIso]);

  useEffect(() => {
    if (remaining === 0 && onExpire) onExpire();
  }, [remaining, onExpire]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="glass-card rounded-3xl p-4 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Time Left</p>
      <p className="text-5xl font-bold text-cyan-100">
        {mm}:{ss}
      </p>
    </div>
  );
}
