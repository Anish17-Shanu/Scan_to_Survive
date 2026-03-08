import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { clearAuth, saveAuth } from "../lib/auth";

type Mode = "team" | "admin";

type TutorialItem = {
  id: string;
  text: string;
};

const TUTORIAL_ITEMS: TutorialItem[] = [
  { id: "roles", text: "We assigned Runner (scan/move) and Navigator (solve/submit)." },
  { id: "loop", text: "We understand the loop: scan QR -> solve -> decode -> move." },
  { id: "keys", text: "We know final key order: Key Shard A -> Key Shard B -> Fire QR." },
  { id: "rapid", text: "We understand rapid-fire is timed and accuracy impacts ranking." }
];

export function LoginPage() {
  const [mode, setMode] = useState<Mode>("team");
  const [teamName, setTeamName] = useState("");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tutorialChecks, setTutorialChecks] = useState<Record<string, boolean>>({});
  const [tutorialConfirmed, setTutorialConfirmed] = useState(false);
  const navigate = useNavigate();

  const compatibility = useMemo(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isAndroid = ua.includes("android");
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isChrome = ua.includes("chrome") && !ua.includes("edg");
    const isSafari = ua.includes("safari") && !ua.includes("chrome");
    const supported = (isAndroid && isChrome) || (isIOS && isSafari);
    return {
      supported,
      message: supported
        ? "Device/browser profile supported for scanner reliability."
        : "Use Android Chrome or iOS Safari for stable camera scanning."
    };
  }, []);

  const tutorialReady = useMemo(() => {
    const checkedCount = TUTORIAL_ITEMS.filter((item) => tutorialChecks[item.id]).length;
    return checkedCount === TUTORIAL_ITEMS.length && tutorialConfirmed;
  }, [tutorialChecks, tutorialConfirmed]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    clearAuth();
    try {
      if (mode === "team") {
        if (!tutorialReady) {
          setError("Complete and confirm the tutorial checklist before starting the game.");
          return;
        }
        const response = await api.post("/auth/login", {
          role: "team",
          team_name: teamName.trim(),
          password
        });
        localStorage.setItem("scan_tutorial_v3_done", "1");
        saveAuth(response.data.token, "team", response.data.team.team_name);
        navigate("/game");
      } else {
        const response = await api.post("/auth/login", {
          role: mode,
          username,
          password
        });
        saveAuth(response.data.token, "admin");
        navigate("/admin");
      }
    } catch (err: unknown) {
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (err as { response: { data: { error: string } } }).response.data.error
          : "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-8 md:py-10">
      <section className="grid w-full gap-6 lg:grid-cols-2">
        <article className="fade-rise glass-card rounded-3xl p-7">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Operation: Firewall</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight">Scan to Survive // NULL Containment</h1>
          <p className="mt-4 max-w-md text-sm text-slate-300">
            Team login includes a mandatory tutorial confirmation. This gate prevents mission start until workflow is
            acknowledged.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-center">
            <div className="glass-card rounded-2xl p-3">
              <p className="text-2xl font-bold">5-200</p>
              <p className="text-xs text-slate-300">Teams</p>
            </div>
            <div className="glass-card rounded-2xl p-3">
              <p className="text-2xl font-bold">Live</p>
              <p className="text-xs text-slate-300">Monitor</p>
            </div>
            <div className="glass-card rounded-2xl p-3">
              <p className="text-2xl font-bold">QR</p>
              <p className="text-xs text-slate-300">Engine</p>
            </div>
          </div>

          <div className="qr-lane mt-6 rounded-2xl border border-cyan-300/25 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-100">Login-to-Game Animation</p>
            <div className="mt-3 flex gap-2" aria-hidden="true">
              <span className="qr-cell" />
              <span className="qr-cell qr-cell-delay-1" />
              <span className="qr-cell qr-cell-delay-2" />
              <span className="qr-cell qr-cell-delay-3" />
            </div>
          </div>
        </article>

        <form onSubmit={submit} className="fade-rise glass-card rounded-3xl p-7">
          <div className="mb-5 flex gap-2 rounded-full bg-white/5 p-1">
            <button
              type="button"
              className={`w-full rounded-full px-4 py-2 text-sm ${mode === "team" ? "bg-white/20" : "bg-transparent"}`}
              onClick={() => setMode("team")}
            >
              Team Access
            </button>
            <button
              type="button"
              className={`w-full rounded-full px-4 py-2 text-sm ${mode === "admin" ? "bg-white/20" : "bg-transparent"}`}
              onClick={() => setMode("admin")}
            >
              Admin Access
            </button>
          </div>

          {mode === "team" ? (
            <>
              <label className="mb-4 block text-sm text-slate-300">
                Team Name
                <input
                  className="mt-2 w-full rounded-2xl border border-white/15 bg-black/25 px-4 py-3"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  required
                />
              </label>
              <p className="mb-4 rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Team login works across multiple devices and tabs without forced re-login.
              </p>
              <p
                className={`mb-4 rounded-xl border px-3 py-2 text-xs ${compatibility.supported ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-200" : "border-rose-300/30 bg-rose-500/10 text-rose-200"}`}
              >
                {compatibility.message}
              </p>

              <div className="rounded-2xl border border-fuchsia-300/35 bg-fuchsia-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-fuchsia-100">Mandatory Tutorial Confirmation</p>
                <div className="mt-3 grid gap-2">
                  {TUTORIAL_ITEMS.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-100"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(tutorialChecks[item.id])}
                        onChange={(e) =>
                          setTutorialChecks((prev) => ({
                            ...prev,
                            [item.id]: e.target.checked
                          }))
                        }
                        className="mt-0.5"
                      />
                      <span>{item.text}</span>
                    </label>
                  ))}
                </div>
                <label className="mt-3 flex items-start gap-2 text-xs text-fuchsia-100">
                  <input
                    type="checkbox"
                    checked={tutorialConfirmed}
                    onChange={(e) => setTutorialConfirmed(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>We confirmed this tutorial as a team and are ready to start under event rules.</span>
                </label>
              </div>
            </>
          ) : (
            <label className="mb-4 block text-sm text-slate-300">
              Admin Username
              <input
                className="mt-2 w-full rounded-2xl border border-white/15 bg-black/25 px-4 py-3"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
          )}

          <label className="mb-2 mt-4 block text-sm text-slate-300">
            Password
            <input
              type="password"
              className="mt-2 w-full rounded-2xl border border-white/15 bg-black/25 px-4 py-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}

          <button className="apple-btn mt-6 w-full py-3" disabled={loading || (mode === "team" && !tutorialReady)}>
            {loading ? "Authenticating..." : mode === "team" ? "Enter as Team" : "Enter as Admin"}
          </button>
          {mode === "team" && !tutorialReady && (
            <p className="mt-2 text-xs text-amber-200">Complete all tutorial checks to unlock team entry.</p>
          )}
          <button type="button" className="ghost-btn mt-3 w-full" onClick={() => navigate("/")}>
            Back to Mission Brief
          </button>
        </form>
      </section>
    </main>
  );
}
