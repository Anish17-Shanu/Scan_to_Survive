const TOKEN_KEY = "sts_token";
const ROLE_KEY = "sts_role";
const TEAM_KEY = "sts_team";

export function saveAuth(token: string, role: "team" | "admin", teamName?: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ROLE_KEY, role);
  if (teamName) localStorage.setItem(TEAM_KEY, teamName);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(TEAM_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRole(): "team" | "admin" | null {
  const role = localStorage.getItem(ROLE_KEY);
  if (role === "team" || role === "admin") return role;
  return null;
}

export function getTeamName(): string | null {
  return localStorage.getItem(TEAM_KEY);
}

export function clearTeamGameCache(teamName: string): void {
  const normalized = teamName.trim().toLowerCase();
  if (!normalized) return;
  localStorage.removeItem(`scan_live_state_v2:${normalized}`);
}
