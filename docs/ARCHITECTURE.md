# Architecture Overview

## Backend modules
- `controllers/`: request mapping + validation
- `services/`: business rules (dynamic config, pathing, gameplay, monitoring)
- `repositories/`: Supabase data access
- `middleware/`: auth, timeout, rate limiting, errors
- `realtime/`: websocket hub for admin monitor
- `config/logger.ts`: structured Winston logs

## Distributed safety model
- Stateless API instances on Render.
- Durable state in PostgreSQL/Supabase.
- Single-device enforcement via `teams.session_token`.
- Optimistic locking via `teams.version` on all critical mutations.
- Replay/race mitigation: version checks + stale session rejection.

## Dynamic engine flow
1. Admin configures event.
2. Service computes optimal path count from `total_teams` and `max_teams_per_path`.
3. Rooms generated:
   - one common entry
   - per-path ordered puzzle rooms
   - one common final
   - separate trap rooms
4. Team starts:
   - assigned least-loaded path under capacity
   - question cache generated once in `team_questions`
5. Gameplay:
   - scan validates expected room order
   - adaptive trap probability by pace
   - answer checked against cached question answer
   - penalties and progression persisted with optimistic lock

## Monitoring
- Admin REST endpoint: `/api/admin/monitor`
- WebSocket push: `/ws/admin?token=<admin_jwt>`
- Snapshot includes:
  - path distribution
  - room occupancy heatmap
  - per-team status
  - suspicious activity logs

## Fail-safe behavior
- Page refresh resumes from DB state (`/game/start` is idempotent).
- Restart-safe because all progression is persisted.
- DB errors return safe API errors via centralized handler.
