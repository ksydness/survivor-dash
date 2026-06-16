-- survivor-dash Supabase schema. Run in the Supabase SQL editor.
-- Mirrors the season Google Sheet. The app only reads these tables;
-- lib/sync.ts upserts into them from the sheet's published CSV tabs.

create table if not exists seasons (
  season            int  primary key,
  name              text not null,
  status            text not null default 'active',   -- 'active' | 'final'
  sheet_csv_urls    jsonb,                              -- { episodes, contestants, leaderboard, scoring, history }
  num_weeks         int  default 14,
  last_synced_at    timestamptz
);

create table if not exists contestants (
  season       int  not null references seasons(season) on delete cascade,
  name         text not null,
  team         text not null,
  draft_round  int,
  primary key (season, name)
);

create table if not exists episode_scores (
  season      int  not null references seasons(season) on delete cascade,
  contestant  text not null,
  week        int  not null,
  points      int  not null default 0,
  primary key (season, contestant, week)
);

create table if not exists weekly_ranks (
  season  int  not null references seasons(season) on delete cascade,
  team    text not null,
  week    int  not null,
  rank    int  not null,
  primary key (season, team, week)
);

create table if not exists weekly_highlights (
  season               int  not null references seasons(season) on delete cascade,
  week                 int  not null,
  top_contestant       text,
  top_contestant_pts   int,
  top_team             text,
  top_team_pts         int,
  primary key (season, week)
);

create table if not exists scoring_rules (
  season  int  not null references seasons(season) on delete cascade,
  action  text not null,
  points  int  not null,
  primary key (season, action)
);

-- Past-season final standings (History tab). Seasons 46-50.
create table if not exists season_history (
  season  int  not null,
  team    text not null,
  place   int  not null,
  points  int  not null,
  primary key (season, team)
);
