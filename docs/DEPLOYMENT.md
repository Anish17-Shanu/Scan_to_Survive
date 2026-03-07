# Deployment (Render + Vercel + Supabase)

## Backend on Render
Use provided root `Dockerfile` and `render.yaml`.

Environment variables:
- `PORT=4000`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `CORS_ORIGIN` (Vercel domain)
- `WS_BROADCAST_INTERVAL_MS`
- `DEFAULT_TRAP_PENALTY_SECONDS`
- `DEFAULT_HINT_PENALTY_SECONDS`

Health check:
- `GET /health`

## Frontend on Vercel
Use `vercel.json`.

Env:
- `VITE_API_BASE_URL=https://<render-domain>/api`
- `VITE_WS_BASE_URL=wss://<render-domain>`

## Supabase
- Run `database/setup.sql`.
- Load production question pool into `questions_pool`.
- Keep service role key only on backend.
