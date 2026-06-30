create table if not exists public.trainings (
  id text primary key,
  seller_name text not null,
  seller_team text not null,
  created_at timestamptz default now(),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  difficulty text,
  mode text,
  target_cases integer,
  solved integer,
  score integer,
  average integer,
  xp integer,
  rank text,
  metrics jsonb default '{}'::jsonb,
  cases jsonb default '[]'::jsonb
);

alter table public.trainings enable row level security;

-- Como o acesso será feito pelo backend da Vercel com SERVICE_ROLE_KEY,
-- não é necessário liberar políticas públicas para escrita/leitura.
