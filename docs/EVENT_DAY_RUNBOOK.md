# Scan to Survive Event-Day Runbook

## 1) Preflight
- Configure event from admin.
- Verify readiness panel has no blockers.
- Create teams and verify one-device policy note is understood.
- Keep event paused during setup verification.
- Print/export QR packs and confirm final key separation.

## 2) Go-Live
- Press `Resume Event` from admin control.
- Open three screens:
  - `/admin` for host
  - `/spectator` for audience
  - `/admin/display` for winner announcement
- Trigger broadcast with start instructions.

## 3) During Game
- Monitor fairness alerts and final key supervision.
- Use pause only with typed confirmation and clear reason.
- Use force unlock/finish only for verified operational issues.
- If network is unstable, teams switch to offline assist note flow and host fallback validation.

## 4) Finale
- Confirm no teams are still active.
- Trigger `Reveal Top 3`.
- Keep winner display on fullscreen.
- Announce top-3 with reward codes.

## 5) Recovery Drills
- If admin monitor lags, refresh and rely on websocket reconnect.
- If winner display fails, reload `/admin/display` (public-safe endpoint).
- If setup error discovered, use config snapshot rollback.

## 6) Post-Event
- Export event bundle from admin.
- Archive logs, leaderboard, analytics, and ops package.
- Debrief top failure points and update next event config.
