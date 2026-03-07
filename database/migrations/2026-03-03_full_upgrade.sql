-- Scan to Survive - Full Upgrade Migration
-- Safe to run multiple times on existing Supabase databases.

create extension if not exists "pgcrypto";

create table if not exists event_state (
  id integer primary key check (id = 1),
  active_event_id uuid null,
  leaderboard_visible boolean not null default false
);

insert into event_state(id, active_event_id, leaderboard_visible)
values (1, null, false)
on conflict (id) do nothing;

alter table if exists event_config
  add column if not exists floor_room_map jsonb not null default '[]'::jsonb,
  add column if not exists excluded_room_numbers jsonb not null default '[]'::jsonb;

alter table if exists event_state
  add column if not exists is_paused boolean not null default false,
  add column if not exists pause_reason text null,
  add column if not exists pause_started_at timestamptz null;

alter table if exists teams
  add column if not exists phase text not null default 'main',
  add column if not exists points integer not null default 0,
  add column if not exists rapid_fire_start_time timestamptz null,
  add column if not exists rapid_fire_score integer not null default 0,
  add column if not exists story_fragments_collected integer not null default 0,
  add column if not exists combo_streak integer not null default 0,
  add column if not exists shield_charges integer not null default 1,
  add column if not exists shield_active boolean not null default false,
  add column if not exists pulse_charges integer not null default 1;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'teams'
      and column_name = 'phase'
  ) then
    begin
      alter table teams drop constraint if exists teams_phase_check;
      alter table teams
        add constraint teams_phase_check
        check (phase in ('main', 'rapid_fire', 'completed'));
    exception when others then
      null;
    end;
  end if;
end $$;

create index if not exists idx_paths_event on paths(event_config_id);
create unique index if not exists idx_teams_event_name_lower on teams(event_config_id, lower(team_name));
create index if not exists idx_rooms_event_order on rooms(event_config_id, path_id, order_number);
create index if not exists idx_rooms_event_code on rooms(event_config_id, room_code);
create index if not exists idx_rooms_event_trap on rooms(event_config_id, is_trap);
create index if not exists idx_teams_event_status on teams(event_config_id, status);
create index if not exists idx_teams_event_path on teams(event_config_id, assigned_path);
create index if not exists idx_teams_event_current_room on teams(event_config_id, current_room_id);
create index if not exists idx_team_questions_team_order on team_questions(team_id, order_number);
create index if not exists idx_questions_pool_event_diff on questions_pool(event_config_id, difficulty_level, active);
create index if not exists idx_logs_event_time on logs(event_config_id, timestamp desc);
create index if not exists idx_logs_team_time on logs(team_id, timestamp desc);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_teams_updated_at on teams;
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

notify pgrst, 'reload schema';
