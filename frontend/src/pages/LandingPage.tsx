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

const RANKING_RULES = [
  "1) Lower total completion time ranks higher (primary rule).",
  "2) If time is tied, higher points ranks higher.",
  "3) If still tied, fewer hints used ranks higher.",
  "4) If still tied, fewer trap hits ranks higher.",
  "5) If still tied, higher rapid-fire score ranks higher."
];

const QR_TYPES = [
  {
    name: "Room QR",
    description: "Main progression scan. Opens the active technical question for your current step."
  },
  {
    name: "Trap QR",
    description: "Penalty node. Triggers trap challenge unless Shield is armed."
  },
  {
    name: "Power QR",
    description: "Utility pickup. Grants Shield charge, Pulse charge, Score boost, or Hint credit."
  },
  {
    name: "Rune QR",
    description: "Secret collectible. Adds bonus points and rune progression."
  },
  {
    name: "Nexus/Amiphoria Key QR",
    description: "Final key shards required before Fire QR will unlock rapid-fire."
  },
  {
    name: "Fire QR",
    description: "Rapid gate trigger. Starts the timed rapid-fire finale inside the app."
  }
];

const TACTICAL_ABILITIES = [
  {
    name: "Shield",
    description: "Arms protection for the next trap trigger and prevents that trap penalty hit.",
    usage: "Use before risky scans or when trap pressure is high.",
    acquire: "Start with 1 charge; gain more from Shield power QR."
  },
  {
    name: "Pulse",
    description: "Reveals a masked preview of the active answer and consumes one pulse charge.",
    usage: "Use when your team is blocked and time is bleeding.",
    acquire: "Start with 1 charge; gain more from Pulse power QR."
  },
  {
    name: "Hint",
    description: "Provides contextual guidance with time/point tradeoff depending on credits and penalties.",
    usage: "Use only when decode deadlock persists beyond one attempt.",
    acquire: "Limited by event rules; extra hint credits come from Hint power QR."
  }
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

        <section className="holo-pilot-grid grid gap-4 md:grid-cols-2">
          <article className="operator-card rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">NEXUS-7</p>
                <p className="mt-1 text-sm text-slate-200">Route AI projecting scan-safe movement path.</p>
              </div>
              <div className="avatar-core avatar-core-cyan" />
            </div>
            <p className="terminal-line mt-3 text-xs text-cyan-100">Signal lock achieved. Awaiting first QR scan.</p>
          </article>
          <article className="operator-card rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-200">AMIPHORIA-OS</p>
                <p className="mt-1 text-sm text-slate-200">Puzzle relay active. Answer formatting monitor online.</p>
              </div>
              <div className="avatar-core avatar-core-emerald" />
            </div>
            <p className="terminal-line mt-3 text-xs text-cyan-100">Decode channel stable. Keep runner/navigator sync.</p>
          </article>
        </section>

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

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-100">QR Types Explained</p>
              <div className="mt-3 grid gap-2 text-xs text-slate-100 md:grid-cols-2">
                {QR_TYPES.map((item) => (
                  <div key={item.name} className="rounded-xl border border-white/10 bg-black/20 p-2">
                    <p className="font-semibold text-cyan-100">{item.name}</p>
                    <p className="mt-1">{item.description}</p>
                  </div>
                ))}
              </div>
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
              <div className="holo-reticle mt-4" aria-hidden="true">
                <span className="holo-reticle-ring holo-reticle-ring-a" />
                <span className="holo-reticle-ring holo-reticle-ring-b" />
                <span className="holo-reticle-sweep" />
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

            <div className="mt-6 rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-100">Tactical Utilities (In-Game)</p>
              <div className="mt-3 grid gap-2 text-xs text-slate-100">
                {TACTICAL_ABILITIES.map((item) => (
                  <div key={item.name} className="rounded-xl border border-white/10 bg-black/20 p-2">
                    <p className="font-semibold text-cyan-100">{item.name}</p>
                    <p className="mt-1">{item.description}</p>
                    <p className="mt-1 text-slate-300">Best use: {item.usage}</p>
                    <p className="mt-1 text-slate-300">How to get: {item.acquire}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-violet-300/30 bg-violet-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-violet-100">Ranking Logic (No Confusion)</p>
              <div className="mt-2 grid gap-1 text-xs text-slate-100">
                {RANKING_RULES.map((rule) => (
                  <p key={rule}>{rule}</p>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-300">
                Why a lower-point team can still rank above you: they finished in less total time, which is the primary win condition.
              </p>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
