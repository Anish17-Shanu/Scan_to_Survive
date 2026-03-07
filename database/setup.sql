-- Scan to Survive - Dynamic Engine Edition
-- Run in Supabase SQL editor.

create extension if not exists "pgcrypto";

drop table if exists logs cascade;
drop table if exists team_questions cascade;
drop table if exists teams cascade;
drop table if exists rooms cascade;
drop table if exists paths cascade;
drop table if exists questions_pool cascade;
drop table if exists event_state cascade;
drop table if exists event_config cascade;

create table event_config (
  id uuid primary key default gen_random_uuid(),
  total_teams integer not null check (total_teams between 5 and 200),
  total_floors integer not null check (total_floors between 1 and 20),
  total_available_rooms integer not null check (total_available_rooms between 10 and 500),
  floor_room_map jsonb not null,
  excluded_room_numbers jsonb not null default '[]'::jsonb,
  trap_count integer not null check (trap_count >= 0),
  game_duration integer not null check (game_duration between 600 and 14400),
  max_hints integer not null check (max_hints between 0 and 10),
  difficulty_curve jsonb not null,
  question_pool_size integer not null check (question_pool_size >= 1),
  max_teams_per_path integer not null check (max_teams_per_path between 1 and 50),
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  created_at timestamptz not null default now()
);

create table event_state (
  id integer primary key check (id = 1),
  active_event_id uuid null references event_config(id) on delete set null,
  leaderboard_visible boolean not null default false,
  is_paused boolean not null default false,
  pause_reason text null,
  pause_started_at timestamptz null
);

insert into event_state(id, active_event_id, leaderboard_visible, is_paused, pause_reason, pause_started_at) values (1, null, false, false, null, null);

create table paths (
  id uuid primary key default gen_random_uuid(),
  event_config_id uuid not null references event_config(id) on delete cascade,
  path_name text not null,
  max_capacity integer not null check (max_capacity > 0),
  path_order integer not null,
  unique(event_config_id, path_name),
  unique(event_config_id, path_order)
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  event_config_id uuid not null references event_config(id) on delete cascade,
  room_number text not null,
  floor integer not null,
  path_id uuid null references paths(id) on delete set null,
  order_number integer null,
  room_code text not null,
  is_trap boolean not null default false,
  is_entry boolean not null default false,
  is_final boolean not null default false,
  difficulty_level integer null check (difficulty_level between 1 and 5),
  trap_base_probability numeric(4,3) not null default 0.35 check (trap_base_probability between 0 and 1),
  unique(event_config_id, room_number),
  unique(event_config_id, room_code)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  event_config_id uuid not null references event_config(id) on delete cascade,
  team_name text not null,
  password_hash text not null,
  assigned_path uuid null references paths(id) on delete set null,
  current_order integer not null default 0,
  phase text not null default 'main' check (phase in ('main', 'rapid_fire', 'completed')),
  version integer not null default 0,
  session_token uuid null,
  current_room_id uuid null references rooms(id) on delete set null,
  hints_used integer not null default 0,
  trap_hits integer not null default 0,
  penalty_seconds integer not null default 0,
  start_time timestamptz null,
  end_time timestamptz null,
  total_time_seconds integer null,
  points integer not null default 0,
  rapid_fire_start_time timestamptz null,
  rapid_fire_score integer not null default 0,
  story_fragments_collected integer not null default 0,
  combo_streak integer not null default 0,
  shield_charges integer not null default 1,
  shield_active boolean not null default false,
  pulse_charges integer not null default 1,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'completed', 'timeout', 'disqualified')),
  suspicious_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table questions_pool (
  id uuid primary key default gen_random_uuid(),
  event_config_id uuid not null references event_config(id) on delete cascade,
  difficulty_level integer not null check (difficulty_level between 1 and 5),
  category text not null,
  question_text text not null,
  correct_answer text not null,
  hint_primary text not null default '',
  hint_secondary text not null default '',
  hint_tertiary text not null default '',
  hint_quaternary text not null default '',
  hint_quinary text not null default '',
  active boolean not null default true
);

create table team_questions (
  id uuid primary key default gen_random_uuid(),
  event_config_id uuid not null references event_config(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  order_number integer not null,
  question_id uuid not null references questions_pool(id) on delete restrict,
  cached_question text not null,
  cached_answer text not null,
  cached_hint_primary text null,
  cached_hint_secondary text null,
  cached_hint_tertiary text null,
  cached_hint_quaternary text null,
  cached_hint_quinary text null,
  difficulty_level integer not null check (difficulty_level between 1 and 5),
  created_at timestamptz not null default now(),
  unique(team_id, order_number)
);

create table logs (
  id bigserial primary key,
  event_config_id uuid not null references event_config(id) on delete cascade,
  team_id uuid null references teams(id) on delete cascade,
  action_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default now()
);

create index idx_paths_event on paths(event_config_id);
create unique index idx_teams_event_name_lower on teams(event_config_id, lower(team_name));
create index idx_rooms_event_order on rooms(event_config_id, path_id, order_number);
create index idx_rooms_event_code on rooms(event_config_id, room_code);
create index idx_rooms_event_trap on rooms(event_config_id, is_trap);
create index idx_teams_event_status on teams(event_config_id, status);
create index idx_teams_event_path on teams(event_config_id, assigned_path);
create index idx_teams_event_current_room on teams(event_config_id, current_room_id);
create index idx_team_questions_team_order on team_questions(team_id, order_number);
create index idx_questions_pool_event_diff on questions_pool(event_config_id, difficulty_level, active);
create index idx_logs_event_time on logs(event_config_id, timestamp desc);
create index idx_logs_team_time on logs(team_id, timestamp desc);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_teams_updated_at
before update on teams
for each row
execute function set_updated_at();

create or replace function active_event_id()
returns uuid
language sql
stable
as $$
  select active_event_id from event_state where id = 1;
$$;

create or replace view admin_team_monitor as
select
  t.id as team_id,
  t.team_name,
  t.status,
  t.current_order,
  t.hints_used,
  t.trap_hits,
  t.penalty_seconds,
  t.suspicious_score,
  t.start_time,
  t.end_time,
  t.total_time_seconds,
  p.path_name,
  r.room_number as current_room
from teams t
left join paths p on p.id = t.assigned_path
left join rooms r on r.id = t.current_room_id;

-- Seed example question pool (replace with your real question bank)
insert into questions_pool(event_config_id, difficulty_level, category, question_text, correct_answer, hint_primary, hint_secondary, hint_tertiary, hint_quaternary, hint_quinary)
select
  ec.id,
  diff,
  'general',
  format('Sample Q%1$s level %2$s', n, diff),
  format('ans%1$s', n),
  'Sample primary hint',
  'Sample secondary hint',
  'Sample tertiary hint',
  'Sample quaternary hint',
  'Sample quinary hint'
from (select id from event_config limit 1) ec,
generate_series(1, 5) diff,
generate_series(1, 20) n
where false;
