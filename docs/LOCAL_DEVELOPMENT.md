# Local Development

## Prerequisites
- Node.js 20+
- npm 10+
- Supabase project

## Database
1. Run `database/setup.sql` in Supabase SQL editor.
2. If your DB already exists from an older version, run `database/migrations/2026-03-03_full_upgrade.sql`.
3. Insert question pool data in `questions_pool` for all levels `1..5`.
4. Keep at least `question_pool_size` active rows for each event.

## Backend
1. Copy `backend/.env.example` to `backend/.env`.
2. Fill Supabase and JWT values.
3. Generate admin password hash:
```bash
cd backend
npm install
npm run hash:password -- YourStrongPassword
```
4. Put hash in `ADMIN_PASSWORD_HASH`.
5. Start:
```bash
npm run dev
```

## Frontend
1. Copy `frontend/.env.example` to `frontend/.env`.
2. Set:
   - `VITE_API_BASE_URL=http://localhost:4000/api`
   - `VITE_WS_BASE_URL=ws://localhost:4000`
3. Start:
```bash
cd frontend
npm install
npm run dev
```

## Smoke flow
1. Admin login.
2. Configure event.
3. Create teams.
4. Team login and start game.
5. Admin monitor via `/admin` with WS updates.

## Stress script
```bash
cd backend
npm run stress:test -- http://localhost:4000/api team_1 team_password 100
```
