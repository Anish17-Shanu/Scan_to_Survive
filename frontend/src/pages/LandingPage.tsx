import { useNavigate } from "react-router-dom";

const WORKFLOW_STEPS = [
  {
    title: "Team Login + Tutorial Lock",
    detail:
      "Both players login, review the mission tutorial, and confirm role split before the game timer can start.",
    badge: "Access Gate"
  },
  {
    title: "Room QR Scan + Challenge",
    detail:
      "Runner scans the room QR, Navigator receives the puzzle, and the answer submission unlocks the clue packet.",
    badge: "Core Loop"
  },
  {
    title: "Decode Route + Move",
    detail:
      "Team decodes clue layers to infer the next room number. Wrong answers can trigger traps and penalties.",
    badge: "Decision Layer"
  },
  {
    title: "Final Key Sequence",
    detail:
      "Scan Nexus key QR and Amiphoria key QR, then locate and scan Fire QR to unlock rapid-fire mode.",
    badge: "Gate Chain"
  },
  {
    title: "Rapid-Fire Finish",
    detail:
      "Complete rapid-fire in-app under strict time pressure. Accuracy, penalties, and completion speed decide ranking.",
    badge: "Finale"
  }
];

const FEATURE_PILLARS = [
  "Adaptive traps and penalty system",
  "Realtime team status + broadcast alerts",
  "Story fragments and mission progression",
  "Multi-device continuity for team login",
  "Final key gate with rapid-fire category selection",
  "Hint, shield, and pulse tactical utilities"
];

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl px-4 py-8 md:items-center md:py-10">
      <section className="grid w-full gap-6">
        <article className="glass-card hero-glow cinematic-sweep fade-rise rounded-[2rem] p-7 md:p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-300">Nexus x Amiphoria Mission Protocol</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight md:text-5xl">Scan to Survive: Full Team Workflow</h1>
          <p className="mt-4 max-w-4xl text-sm text-slate-200 md:text-base">
            This mission runs on a strict scan-decode-move loop. Each team must coordinate roles, maintain clue discipline,
            survive trap pressure, and execute the final rapid-fire override before the firewall collapse.
          </p>

          <div className="workflow-track mt-6 rounded-2xl border border-cyan-200/20 bg-black/25 p-4">
            <div className="workflow-beam" aria-hidden="true" />
            <div className="grid gap-2 text-xs text-cyan-100 md:grid-cols-4 md:text-sm">
              <p>QR Detection</p>
              <p>Challenge Sync</p>
              <p>Clue Decode</p>
              <p>Rapid Gate Trigger</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="apple-btn pulse-ring" onClick={() => navigate("/login")}>
              Team Login + Tutorial
            </button>
            <button className="ghost-btn" onClick={() => navigate("/spectator")}>
              Open Spectator View
            </button>
          </div>
        </article>

        <section className="grid gap-6 lg:grid-cols-5">
          <article className="glass-card fade-rise rounded-[2rem] p-7 lg:col-span-3">
            <h2 className="text-2xl font-semibold">Gameplay Workflow</h2>
            <div className="mt-4 grid gap-3">
              {WORKFLOW_STEPS.map((step, index) => (
                <div key={step.title} className="workflow-step rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-cyan-100">
                      {index + 1}. {step.title}
                    </p>
                    <span className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-100">
                      {step.badge}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-200">{step.detail}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="glass-card story-flicker fade-rise rounded-[2rem] p-7 lg:col-span-2">
            <h2 className="text-2xl font-semibold">Feature Grid</h2>
            <div className="mt-4 grid gap-2 text-sm text-slate-200">
              {FEATURE_PILLARS.map((feature) => (
                <p key={feature}>- {feature}</p>
              ))}
            </div>

            <div className="qr-lane mt-6 rounded-2xl border border-emerald-300/25 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-100">Animated QR Scan Flow</p>
              <div className="mt-3 flex gap-2" aria-hidden="true">
                <span className="qr-cell" />
                <span className="qr-cell qr-cell-delay-1" />
                <span className="qr-cell qr-cell-delay-2" />
                <span className="qr-cell qr-cell-delay-3" />
              </div>
              <p className="mt-3 text-xs text-slate-300">
                Visual cue: room QR scan events propagate as challenge sync pulses across the team workflow.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-100">Required Before Game Start</p>
              <p className="mt-2 text-sm text-slate-100">
                Teams must confirm the tutorial on login. Mission controls and timer remain locked until this confirmation.
              </p>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
