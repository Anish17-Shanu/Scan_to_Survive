# Scan to Survive - Dynamic Engine Edition

Distributed, event-configurable QR escape-room platform for 5-200 teams.

## Features
- Dynamic event configuration (`teams/floors/rooms/traps/duration/hints/path capacity`)
- Auto path generation and room distribution
- Progressive difficulty question caching per team
- Adaptive trap probability by team pace
- Optimistic locking with `teams.version`
- Session-token enforcement (single active device)
- Realtime admin monitor over WebSocket
- Frontend sound engine for gameplay and reveal
- Dockerized backend deployment

## Key Endpoints
- Admin:
  - `POST /api/admin/configure-event`
  - `POST /api/admin/create-team`
  - `GET /api/admin/monitor`
  - `GET /api/admin/leaderboard`
  - `POST /api/admin/reveal`
  - `POST /api/admin/disqualify`
- Auth:
  - `POST /api/auth/login`
- Game:
  - `POST /api/game/start`
  - `POST /api/game/scan`
  - `POST /api/game/submit`
  - `POST /api/game/hint`
- Realtime:
  - `WS /ws/admin?token=<admin_jwt>`

## Run Local
1. Execute `database/setup.sql` in Supabase.
2. Configure `backend/.env` from `backend/.env.example`.
3. Configure `frontend/.env` from `frontend/.env.example`.
4. Start:
```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

## Additional Docs
- [Architecture](./docs/ARCHITECTURE.md)
- [Local development](./docs/LOCAL_DEVELOPMENT.md)
- [Deployment](./docs/DEPLOYMENT.md)
- [QR generation](./docs/QR_GENERATION.md)

## Stress Test
```bash
cd backend
npm run stress:test -- http://localhost:4000/api team_1 team_password 100
```
