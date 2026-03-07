alter table questions_pool
  add column if not exists hint_primary text not null default '',
  add column if not exists hint_secondary text not null default '';

alter table team_questions
  add column if not exists cached_hint_primary text null,
  add column if not exists cached_hint_secondary text null;
