alter table questions_pool
  add column if not exists hint_primary text not null default '',
  add column if not exists hint_secondary text not null default '',
  add column if not exists hint_tertiary text not null default '',
  add column if not exists hint_quaternary text not null default '',
  add column if not exists hint_quinary text not null default '';

alter table team_questions
  add column if not exists cached_hint_primary text null,
  add column if not exists cached_hint_secondary text null,
  add column if not exists cached_hint_tertiary text null,
  add column if not exists cached_hint_quaternary text null,
  add column if not exists cached_hint_quinary text null;
